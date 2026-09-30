package app.nazzil

import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * JS bridge exposed as window.NazzilAndroid.call(method, json, id); answers via window.__nzReply(id, json).
 * yt-dlp arguments are built by the shared web/ytdlp.js, so both platforms behave identically.
 */
class Bridge(private val activity: MainActivity) {
    private class Job(val id: String, val kind: String, val title: String, val args: List<String>) {
        val info = JSONObject().put("id", id).put("kind", kind).put("title", title).put("state", "queued").put("progress", 0)
        val files = mutableListOf<String>()
        @Volatile var cancelled = false
    }

    private val jobs = ConcurrentHashMap<String, Job>()
    private val order = ConcurrentLinkedQueue<String>()
    private val saved = ConcurrentHashMap<String, Uri>()
    @Volatile private var parallel = 3
    private val outRoot get() = File(activity.cacheDir, "jobs")

    @JavascriptInterface
    fun call(method: String, json: String, id: Int) {
        Tools.io.execute {
            val reply = try {
                handle(method, JSONObject(json))
            } catch (e: Exception) {
                JSONObject().put("error", e.message ?: "خطأ غير متوقع").put("__rpcError", true)
            }
            activity.reply(id, reply.toString())
        }
    }

    private fun handle(method: String, a: JSONObject): JSONObject = when (method) {
        "status" -> {
            waitReady()
            JSONObject().put("yt_dlp", Tools.ytdlp).put("ffmpeg", Tools.ffmpeg)
                .put("version", runCatching { YoutubeDL.getInstance().version(activity) }.getOrNull() ?: "")
                .put("folder", "Download/Nazzil").put("canPickFolder", false).put("platform", "android")
        }
        "info" -> {
            waitReady()
            val r = YoutubeDLRequest(a.getString("url")).apply {
                addOption("-J"); addOption("--flat-playlist"); addOption("--no-warnings"); addOption("--playlist-end", "500")
            }
            val res = runCatching { YoutubeDL.getInstance().execute(r) }.getOrElse { throw Exception(friendly(it.message)) }
            JSONObject().put("__raw", res.out)
        }
        "download" -> {
            if (!a.optBoolean("rightsConfirmed")) throw Exception("يجب تأكيد امتلاك حق التنزيل.")
            val args = a.getJSONArray("args").let { arr -> List(arr.length()) { arr.getString(it) } }
            val id = UUID.randomUUID().toString()
            jobs[id] = Job(id, a.optString("kind", "mp3"), a.optString("title").take(200), args)
            order.add(id)
            pump()
            JSONObject().put("jobId", id)
        }
        "jobs" -> JSONObject().put("jobs", JSONArray().apply { order.reversed().forEach { id -> jobs[id]?.let { put(synchronized(it.info) { JSONObject(it.info.toString()) }) } } })
        "cancel" -> {
            jobs[a.getString("id")]?.let { j ->
                j.cancelled = true
                synchronized(j.info) { if (j.info.optString("state") in listOf("queued", "working")) j.info.put("state", "cancelled") }
                runCatching { YoutubeDL.getInstance().destroyProcessById(j.id) }
            }
            pump(); JSONObject().put("ok", true)
        }
        "dismiss" -> {
            val id = a.getString("id")
            jobs[id]?.let { if (it.info.optString("state") !in listOf("queued", "working")) { jobs.remove(id); order.remove(id) } }
            JSONObject().put("ok", true)
        }
        "settings" -> { a.optInt("parallel", 3).takeIf { it in 1..5 }?.let { parallel = it }; pump(); JSONObject().put("ok", true) }
        "open" -> { open(a.optString("file")); JSONObject().put("ok", true) }
        "pickFolder" -> JSONObject().put("folder", "Download/Nazzil")
        "update" -> {
            waitReady()
            YoutubeDL.getInstance().updateYoutubeDL(activity, YoutubeDL.UpdateChannel._STABLE)
            JSONObject().put("version", YoutubeDL.getInstance().version(activity) ?: "")
        }
        else -> throw Exception("unknown method $method")
    }

    private fun waitReady() { while (!Tools.ready) Thread.sleep(200) }

    @Synchronized private fun pump() {
        val working = jobs.values.count { it.info.optString("state") == "working" }
        order.mapNotNull { jobs[it] }.filter { it.info.optString("state") == "queued" }.take(maxOf(0, parallel - working)).forEach { j ->
            synchronized(j.info) { j.info.put("state", "working") }
            Tools.io.execute { run(j) }
        }
    }

    private fun run(job: Job) {
        val work = File(outRoot, job.id).apply { mkdirs() }
        try {
            waitReady()
            if (!Tools.ytdlp) throw Exception("تعذر تهيئة yt-dlp على هذا الجهاز.")
            val args = job.args.map { if (it == "__OUT__") work.absolutePath else it }
            val sep = args.indexOf("--")
            val req = YoutubeDLRequest(args.drop(sep + 1)).apply { addCommands(args.take(sep)) }
            YoutubeDL.getInstance().execute(req, job.id) { _, _, line -> onLine(job, line) }
            if (job.cancelled) return
            val made = work.walkTopDown().filter { it.isFile && !it.name.endsWith(".part") && !it.name.endsWith(".ytdl") }.toList()
            if (made.isEmpty()) throw Exception("لم يُنشأ أي ملف.")
            val playlist = made.size > 1
            val base = if (playlist) (made.first().parentFile?.name ?: "Nazzil") else ""
            val uris = made.map { f -> publish(f, if (playlist) base else "").also { saved[f.name] = it } }
            val key = if (playlist) "folder:$base" else made.first().name
            if (playlist) saved[key] = uris.first()
            synchronized(job.info) { job.info.put("state", "done").put("progress", 100).put("file", key).put("count", made.size) }
        } catch (e: Exception) {
            if (!job.cancelled) synchronized(job.info) { job.info.put("state", "error").put("error", friendly(e.message)) }
        } finally {
            work.deleteRecursively()
            pump()
        }
    }

    private fun onLine(job: Job, line: String) {
        val t = line.trim()
        synchronized(job.info) {
            if (job.info.optString("state") != "working") return
            when {
                t.startsWith("NZP|") -> {
                    val p = t.split("|")
                    fun clean(s: String?) = s?.trim()?.takeUnless { it == "NA" || it == "None" || it.startsWith("Unknown") } ?: ""
                    job.info.put("stage", "download")
                        .put("progress", p.getOrNull(1)?.trim()?.removeSuffix("%")?.toDoubleOrNull() ?: 0.0)
                        .put("speed", clean(p.getOrNull(2)).replace("iB", "B"))
                        .put("eta", clean(p.getOrNull(3)).removePrefix("00:"))
                    p.getOrNull(4)?.trim()?.toIntOrNull()?.let { job.info.put("item", it) }
                    p.getOrNull(5)?.trim()?.toIntOrNull()?.let { job.info.put("items", it) }
                }
                t.startsWith("NZS|") -> job.info.put("stage", "post").put("speed", "").put("eta", "")
            }
        }
    }

    private fun friendly(msg: String?): String {
        val line = msg?.lines()?.lastOrNull { it.contains("ERROR") } ?: msg ?: ""
        return when {
            Regex("Unsupported URL", RegexOption.IGNORE_CASE).containsMatchIn(line) -> "هذا الموقع أو الرابط غير مدعوم."
            Regex("Private video|Sign in|login", RegexOption.IGNORE_CASE).containsMatchIn(line) -> "المحتوى خاص أو يتطلب تسجيل الدخول."
            Regex("unavailable|not available|removed", RegexOption.IGNORE_CASE).containsMatchIn(line) -> "المقطع غير متاح."
            Regex("403|Forbidden").containsMatchIn(line) -> "رفض الموقع الطلب. جرّب تحديث محرك التنزيل من الإعدادات."
            line.isNotBlank() -> line.substringAfter("ERROR:").trim()
            else -> "تعذر إكمال العملية."
        }
    }

    private fun open(file: String) {
        val intent = if (file.isEmpty() || file.startsWith("folder:")) {
            // Open the Downloads app; Android has no universal "open folder" intent.
            Intent(android.app.DownloadManager.ACTION_VIEW_DOWNLOADS)
        } else {
            val uri = saved[file] ?: throw Exception("افتح الملف من مجلد التنزيلات/Nazzil.")
            val type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.substringAfterLast('.').lowercase()) ?: "*/*"
            Intent.createChooser(Intent(Intent.ACTION_VIEW).setDataAndType(uri, type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), file)
        }
        activity.runOnUiThread { runCatching { activity.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } }
    }

    /** Copies a finished file to the public Downloads/Nazzil[/sub] folder. */
    private fun publish(file: File, sub: String): Uri {
        val ext = file.extension.lowercase()
        val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
        val rel = Environment.DIRECTORY_DOWNLOADS + "/Nazzil" + (if (sub.isNotEmpty()) "/" + sub.replace(Regex("[\\\\/:*?\"<>|]"), "_") else "")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = activity.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, file.name)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.RELATIVE_PATH, rel)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: throw Exception("تعذر الحفظ في التنزيلات.")
            resolver.openOutputStream(uri)!!.use { o -> file.inputStream().use { it.copyTo(o) } }
            values.clear(); values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            return uri
        }
        @Suppress("DEPRECATION")
        val dir = File(Environment.getExternalStorageDirectory(), rel).apply { mkdirs() }
        val dest = File(dir, file.name)
        file.copyTo(dest, overwrite = true)
        return FileProvider.getUriForFile(activity, "app.nazzil.files", dest)
    }
}
