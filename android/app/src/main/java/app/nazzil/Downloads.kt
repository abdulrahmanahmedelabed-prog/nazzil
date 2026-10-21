package app.nazzil

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
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
 * Download queue that lives in the Application, not the Activity, so downloads survive
 * leaving the app. DownloadService keeps the process in the foreground while work is active.
 */
object Downloads {
    class Job(val id: String, val kind: String, val title: String, val args: List<String>, val cover: JSONObject?,
              val local: Uri? = null, val localName: String = "", val plan: JSONObject? = null) {
        @Volatile var proc: Process? = null
        val pages = ConcurrentHashMap<String, String>()
        @Volatile var lastPage = ""
        val info: JSONObject = JSONObject().put("id", id).put("kind", kind).put("title", title).put("state", "queued").put("progress", 0)
        @Volatile var stopRequested = false
        fun state(): String = synchronized(info) { info.optString("state") }
        fun set(vararg kv: Pair<String, Any?>) = synchronized(info) { kv.forEach { (k, v) -> info.put(k, v) } }
    }

    private lateinit var app: Context
    private val jobs = ConcurrentHashMap<String, Job>()
    private val order = ConcurrentLinkedQueue<String>()
    val saved = ConcurrentHashMap<String, Uri>()
    @Volatile var parallel = 3

    fun init(context: Context) { app = context.applicationContext }

    private fun workDir(id: String) = File(app.cacheDir, "jobs/$id")

    /** Files picked or shared into the app, by id (the page only ever sees the id). */
    val localFiles = ConcurrentHashMap<String, Pair<Uri, String>>()
    fun registerLocal(uri: Uri, name: String): String = UUID.randomUUID().toString().also { localFiles[it] = uri to name }

    /** Convert a file from the device with the given FFmpeg plan (built by the page from web/ytdlp.js). */
    fun addLocal(fileId: String, kind: String, plan: JSONObject): String {
        val (uri, name) = localFiles[fileId] ?: throw Exception("الملف غير موجود. ربما نُقل أو حُذف.")
        if (kind !in listOf("mp3", "m4a", "mp4")) throw Exception("حوّل الملفات إلى MP3 أو M4A أو MP4.")
        val id = UUID.randomUUID().toString()
        jobs[id] = Job(id, kind, name.substringBeforeLast('.').take(200), emptyList(), null, uri, name, plan)
        jobs[id]!!.set("local" to true)
        order.add(id)
        pump()
        return id
    }

    fun add(kind: String, title: String, args: List<String>, cover: JSONObject? = null): String {
        val id = UUID.randomUUID().toString()
        jobs[id] = Job(id, kind, title.take(200), args, cover)
        order.add(id)
        pump()
        return id
    }

    fun list(): JSONArray = JSONArray().apply {
        order.reversed().forEach { id -> jobs[id]?.let { put(synchronized(it.info) { JSONObject(it.info.toString()) }) } }
    }

    fun activeCount() = jobs.values.count { it.state() == "working" || it.state() == "queued" }

    /** Average progress of active jobs, for the notification. */
    fun activeProgress(): Int {
        val active = jobs.values.filter { it.state() == "working" }
        if (active.isEmpty()) return 0
        return active.sumOf { synchronized(it.info) { it.info.optDouble("progress", 0.0) } }.div(active.size).toInt()
    }

    fun pause(id: String) = stop(id, "paused")
    fun cancel(id: String) {
        val j = jobs[id] ?: return
        val wasPaused = j.state() == "paused"
        stop(id, "cancelled")
        if (wasPaused) workDir(id).deleteRecursively()
    }

    private fun stop(id: String, newState: String) {
        val j = jobs[id] ?: return
        if (j.state() !in listOf("queued", "working", "paused")) return
        j.stopRequested = true
        j.set("state" to newState, "speed" to "", "eta" to "")
        runCatching { YoutubeDL.getInstance().destroyProcessById(id) }
        j.proc?.destroy()
        if (j.local != null && newState == "paused") j.set("progress" to 0) // a conversion restarts from the beginning
        pump()
    }

    /** Resume a paused job, or retry a failed/cancelled one. */
    fun resume(id: String) {
        val j = jobs[id] ?: return
        if (j.state() !in listOf("paused", "error", "cancelled")) return
        j.stopRequested = false
        j.set("state" to "queued", "error" to "")
        pump()
    }

    fun dismiss(id: String) {
        val j = jobs[id] ?: return
        if (j.state() in listOf("queued", "working")) return
        jobs.remove(id); order.remove(id)
        if (j.state() == "paused") workDir(id).deleteRecursively()
    }

    @Synchronized fun pump() {
        val working = jobs.values.count { it.state() == "working" }
        order.mapNotNull { jobs[it] }.filter { it.state() == "queued" }.take(maxOf(0, parallel - working)).forEach { j ->
            j.set("state" to "working")
            Tools.io.execute { run(j) }
        }
        if (activeCount() > 0) {
            runCatching { ContextCompat.startForegroundService(app, Intent(app, DownloadService::class.java)) }
        }
    }

    private fun run(job: Job) {
        if (job.local != null) return runLocal(job)
        val work = workDir(job.id).apply { mkdirs() }
        try {
            while (!Tools.ready) Thread.sleep(200)
            if (!Tools.ytdlp) throw Exception("تعذر تهيئة yt-dlp على هذا الجهاز.")
            val args = withCookies(job.args).map { if (it == "__OUT__") work.absolutePath else it }
            val sep = args.indexOf("--")
            val req = YoutubeDLRequest(args.drop(sep + 1)).apply { addCommands(args.take(sep)) }
            try {
                YoutubeDL.getInstance().execute(req, job.id) { _, _, line -> onLine(job, line) }
            } catch (e: Exception) {
                if (job.stopRequested) return
                throw e
            }
            if (job.stopRequested) return
            val made = work.walkTopDown().filter { it.isFile && !it.name.endsWith(".part") && !it.name.endsWith(".ytdl") }.toList()
            if (made.isEmpty()) throw Exception("لم يُنشأ أي ملف.")
            if (job.cover != null) {
                job.set("stage" to "cover", "speed" to "", "eta" to "")
                for (f in made) {
                    if (job.stopRequested) return
                    val ok = runCatching { applyCover(f, job) }.getOrDefault(false)
                    if (!ok) job.set("warning" to "تعذر إضافة صورة الغلاف.")
                }
            }
            val playlist = made.size > 1
            val base = if (playlist) (made.first().parentFile?.name ?: "Nazzil") else ""
            val uris = made.map { f -> publish(f, base).also { saved[f.name] = it } }
            val key = if (playlist) "folder:$base" else made.first().name
            if (playlist) saved[key] = uris.first()
            work.deleteRecursively()
            job.set("state" to "done", "progress" to 100, "file" to key, "count" to made.size, "speed" to "", "eta" to "")
            notifyFinished(job, true)
        } catch (e: Exception) {
            if (!job.stopRequested) {
                job.set("state" to "error", "error" to friendly(e.message))
                notifyFinished(job, false)
                work.deleteRecursively()
            }
        } finally {
            pump()
        }
    }

    private fun onLine(job: Job, line: String) {
        val t = line.trim()
        if (job.state() != "working") return
        when {
            t.startsWith("NZP|") -> {
                val p = t.split("|")
                fun clean(s: String?) = s?.trim()?.takeUnless { it == "NA" || it == "None" || it.startsWith("Unknown") } ?: ""
                job.set("stage" to "download",
                    "progress" to (p.getOrNull(1)?.trim()?.removeSuffix("%")?.toDoubleOrNull() ?: 0.0),
                    "speed" to clean(p.getOrNull(2)).replace("iB", "B"),
                    "eta" to clean(p.getOrNull(3)).removePrefix("00:"))
                p.getOrNull(4)?.trim()?.toIntOrNull()?.let { job.set("item" to it) }
                p.getOrNull(5)?.trim()?.toIntOrNull()?.let { job.set("items" to it) }
            }
            t.startsWith("NZS|") -> job.set("stage" to "post", "speed" to "", "eta" to "")
            t.startsWith("NZW|") -> job.lastPage = t.removePrefix("NZW|")
            t.startsWith("NZF|") -> job.pages[File(t.removePrefix("NZF|")).name] = job.lastPage
        }
    }

    private fun JSONObject.list(key: String): List<String> = getJSONArray(key).let { a -> List(a.length()) { a.getString(it) } }

    // Sites people sign into inside Nazzil's browser. YouTube/Google are left out on purpose: YouTube rotates
    // its cookies and may flag reused ones, and it works without them for nearly everything.
    private val LOGIN_DOMAINS = listOf("instagram.com", "facebook.com", "tiktok.com", "x.com", "twitter.com",
        "soundcloud.com", "vimeo.com", "twitch.tv", "dailymotion.com", "reddit.com")

    /** Writes the in-app browser's cookies as cookies.txt for yt-dlp; returns null when there are none. */
    fun exportCookies(): File? = runCatching {
        val cm = android.webkit.CookieManager.getInstance()
        cm.flush()
        val expires = System.currentTimeMillis() / 1000 + 30L * 24 * 3600
        val lines = StringBuilder("# Netscape HTTP Cookie File\n\n")
        var count = 0
        for (d in LOGIN_DOMAINS) {
            // Ask for both the bare and www host so host-only cookies on either are included (deduplicated by name).
            val seen = HashSet<String>()
            val raw = listOf("https://$d/", "https://www.$d/").mapNotNull { cm.getCookie(it) }.joinToString(";")
            for (pair in raw.split(";")) {
                val i = pair.indexOf('=')
                if (i <= 0) continue
                val name = pair.substring(0, i).trim()
                val value = pair.substring(i + 1).trim()
                if (name.isEmpty() || name.contains('\t') || value.contains('\t') || !seen.add(name)) continue
                lines.append(".$d\tTRUE\t/\tTRUE\t$expires\t$name\t$value\n")
                count++
            }
        }
        if (count == 0) return@runCatching null
        File(app.filesDir, "browse-cookies.txt").apply { writeText(lines.toString()) }
    }.getOrNull()

    /** Replaces the "__COOKIES__" placeholder with the exported file, or removes the option when there is none. */
    fun withCookies(args: List<String>): List<String> {
        val i = args.indexOf("__COOKIES__")
        if (i < 0) return args
        if (StorePolicy.ENABLED) return args.filterIndexed { idx, _ -> idx != i && idx != i - 1 }
        val file = exportCookies()
        return if (file != null) args.toMutableList().also { it[i] = file.absolutePath }
        else args.filterIndexed { idx, _ -> idx != i && idx != i - 1 }
    }

    /** Builds the chosen cover (video frame or user image) and embeds it into an audio file. */
    private fun applyCover(audio: File, job: Job): Boolean {
        val plan = job.cover ?: return true
        val work = File(app.cacheDir, "cover-${job.id}").apply { deleteRecursively(); mkdirs() }
        try {
            val jpg = File(work, "cover.jpg")
            if (plan.optString("mode") == "frame") {
                val page = job.pages[audio.name]?.takeIf { it.isNotEmpty() } ?: job.lastPage
                if (page.isEmpty()) return false
                val clips = plan.getJSONArray("clips")
                for (i in 0 until clips.length()) {
                    work.listFiles()?.forEach { it.delete() }
                    val args = clips.getJSONArray(i).let { a -> List(a.length()) { a.getString(it) } }
                        .map { it.replace("__PAGE__", page).replace("__WORK__", work.absolutePath) }
                    val safe = runCatching { StorePolicy.enforce(args) }.getOrNull() ?: continue
                    val sep = safe.indexOf("--")
                    runCatching { YoutubeDL.getInstance().execute(YoutubeDLRequest(safe.drop(sep + 1)).apply { addCommands(safe.take(sep)) }) }
                    val clip = work.listFiles()?.firstOrNull { it.name.startsWith("clip.") } ?: continue
                    if (ffmpeg(plan.list("toJpeg").map { it.replace("__SRC__", clip.absolutePath).replace("__JPG__", jpg.absolutePath) }) && jpg.exists()) break
                }
            } else {
                val img = File(plan.optString("image"))
                if (!img.exists()) return false
                ffmpeg(plan.list("toJpeg").map { it.replace("__SRC__", img.absolutePath).replace("__JPG__", jpg.absolutePath) })
            }
            if (!jpg.exists()) return false
            val out = File(work, "out." + audio.extension)
            val token = "__AUDIO__." + job.kind
            val ok = ffmpeg(plan.list("embed").map { it.replace(token, audio.absolutePath).replace("__JPG__", jpg.absolutePath).replace("__OUT__", out.absolutePath) })
            if (!ok || !out.exists() || out.length() == 0L) return false
            out.copyTo(audio, overwrite = true)
            return true
        } finally {
            work.deleteRecursively()
        }
    }

    /** Runs the FFmpeg bundled by youtubedl-android (same binary and library path yt-dlp uses). */
    private fun ffmpeg(args: List<String>, job: Job? = null, onLine: ((String) -> Unit)? = null): Boolean {
        val packages = File(app.noBackupFilesDir, "youtubedl-android/packages")
        val bin = File(app.applicationInfo.nativeLibraryDir, "libffmpeg.so")
        val pb = ProcessBuilder(listOf(bin.absolutePath) + args).redirectErrorStream(true)
        pb.environment()["LD_LIBRARY_PATH"] = "${File(packages, "python").absolutePath}/usr/lib:${File(packages, "ffmpeg").absolutePath}/usr/lib"
        val p = pb.start()
        job?.proc = p
        p.inputStream.bufferedReader().useLines { lines -> lines.forEach { onLine?.invoke(it) } }
        val ok = p.waitFor() == 0
        job?.proc = null
        return ok
    }

    private val DURATION = Regex("""Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)""")
    private val OUT_TIME = Regex("""^out_time_(?:us|ms)=(\d+)""")
    private fun JSONArray?.strings(): List<String> = this?.let { a -> List(a.length()) { a.getString(it) } } ?: emptyList()

    /** Converts a picked/shared file: copy it in, run FFmpeg (with progress), add the cover, save to Downloads. */
    private fun runLocal(job: Job) {
        val work = workDir(job.id).apply { deleteRecursively(); mkdirs() }
        try {
            val plan = job.plan ?: throw Exception("تعذر تحويل الملف.")
            job.set("stage" to "convert", "progress" to 0, "speed" to "", "eta" to "")
            val ext = job.localName.substringAfterLast('.', "mp4").lowercase().take(5)
            val input = File(work, "in.$ext")
            app.contentResolver.openInputStream(job.local!!)?.use { i -> input.outputStream().use { i.copyTo(it) } }
                ?: throw Exception("الملف غير موجود. ربما نُقل أو حُذف.")
            val output = File(work, job.title.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifBlank { "Nazzil" } + "." + job.kind)
            var duration = 0.0
            val onLine = { line: String ->
                if (duration == 0.0) DURATION.find(line)?.let { m -> duration = m.groupValues[1].toDouble() * 3600 + m.groupValues[2].toDouble() * 60 + m.groupValues[3].toDouble() }
                OUT_TIME.find(line.trim())?.let { m -> if (duration > 0) job.set("progress" to (m.groupValues[1].toDouble() / 1e6 / duration * 100).coerceIn(0.0, 99.0)) }
                Unit
            }
            fun args(key: String) = plan.optJSONArray(key).strings().map { it.replace("__IN__", input.absolutePath).replace("__OUT__", output.absolutePath) }
            // Untrimmed MP4: lossless remux first; re-encode only if the codecs don't fit.
            var ok = plan.optJSONArray("copy")?.let { ffmpeg(args("copy"), job, onLine) } ?: false
            if (!ok && !job.stopRequested) { output.delete(); ok = ffmpeg(args("convert"), job, onLine) }
            if (job.stopRequested) return
            if (!ok || !output.exists() || output.length() == 0L) throw Exception("الملف تالف أو بصيغة غير مدعومة.")
            plan.optJSONObject("cover")?.let { c ->
                job.set("stage" to "cover")
                if (!runCatching { localCover(output, input, c, work) }.getOrDefault(false)) job.set("warning" to "تعذر إضافة صورة الغلاف.")
            }
            val uri = publish(output, "")
            saved[output.name] = uri
            job.set("state" to "done", "progress" to 100, "file" to output.name, "count" to 1, "speed" to "", "eta" to "")
            notifyFinished(job, true)
        } catch (e: Exception) {
            if (!job.stopRequested) {
                job.set("state" to "error", "error" to (e.message ?: "تعذر تحويل الملف."))
                notifyFinished(job, false)
            }
        } finally {
            work.deleteRecursively()
            pump()
        }
    }

    /** Cover for a converted audio file: a frame of the source video, or the user's own image. */
    private fun localCover(audio: File, source: File, c: JSONObject, work: File): Boolean {
        val jpg = File(work, "cover.jpg")
        fun sub(a: List<String>) = a.map { it.replace("__SRC__", source.absolutePath).replace("__JPG__", jpg.absolutePath) }
        if (c.optString("mode") == "custom") {
            val img = File(c.optString("image"))
            if (!img.exists()) return false
            ffmpeg(c.optJSONArray("toJpeg").strings().map { it.replace("__SRC__", img.absolutePath).replace("__JPG__", jpg.absolutePath) })
        } else {
            val frames = c.optJSONArray("frames")
            for (i in 0 until (frames?.length() ?: 0)) {
                if (ffmpeg(sub(frames!!.getJSONArray(i).strings())) && jpg.exists()) break
            }
        }
        if (!jpg.exists()) return false
        val out = File(work, "covered." + audio.extension)
        val token = "__AUDIO__." + audio.extension
        val ok = ffmpeg(c.optJSONArray("embed").strings().map { it.replace(token, audio.absolutePath).replace("__JPG__", jpg.absolutePath).replace("__OUT__", out.absolutePath) })
        if (!ok || !out.exists() || out.length() == 0L) return false
        out.copyTo(audio, overwrite = true)
        return true
    }

    /** One notification per finished job, so the user knows even when the app is in the background. */
    private fun notifyFinished(job: Job, ok: Boolean) {
        runCatching {
            val nm = app.getSystemService(NotificationManager::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                nm.createNotificationChannel(NotificationChannel("finished", "اكتمال التنزيل", NotificationManager.IMPORTANCE_DEFAULT))
            }
            val ar = java.util.Locale.getDefault().language == "ar"
            val open = PendingIntent.getActivity(app, 0, Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val n = NotificationCompat.Builder(app, "finished")
                .setSmallIcon(if (ok) android.R.drawable.stat_sys_download_done else android.R.drawable.stat_notify_error)
                .setContentTitle(if (ok) (if (ar) "اكتمل التنزيل" else "Download complete") else (if (ar) "فشل التنزيل" else "Download failed"))
                .setContentText(job.title)
                .setContentIntent(open)
                .setAutoCancel(true)
                .build()
            nm.notify(job.id.hashCode(), n)
        }
    }

    fun friendly(msg: String?): String {
        val line = msg?.lines()?.lastOrNull { it.contains("ERROR") } ?: msg ?: ""
        return when {
            Regex("Unsupported URL", RegexOption.IGNORE_CASE).containsMatchIn(line) -> "هذا الموقع أو الرابط غير مدعوم."
            Regex("Private video|Sign in|login", RegexOption.IGNORE_CASE).containsMatchIn(line) -> "المحتوى خاص أو يتطلب تسجيل الدخول."
            Regex("unavailable|not available|removed", RegexOption.IGNORE_CASE).containsMatchIn(line) -> "المقطع غير متاح."
            Regex("HTTP Error 404|Not Found", RegexOption.IGNORE_CASE).containsMatchIn(line) -> "الرابط غير موجود. تأكد منه وحاول مجددًا."
            Regex("Unable to download webpage|Failed to resolve|timed out|Connection", RegexOption.IGNORE_CASE).containsMatchIn(line) -> "تعذر الاتصال. تحقق من الإنترنت ثم أعد المحاولة."
            Regex("403|Forbidden").containsMatchIn(line) -> "رفض الموقع الطلب. جرّب تحديث محرك التنزيل من الإعدادات."
            line.isNotBlank() -> line.substringAfter("ERROR:").trim()
            else -> "تعذر إكمال العملية."
        }
    }

    /** Copies a finished file to the public Downloads/Nazzil[/sub] folder. */
    private fun publish(file: File, sub: String): Uri {
        val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension.lowercase()) ?: "application/octet-stream"
        val rel = Environment.DIRECTORY_DOWNLOADS + "/Nazzil" + (if (sub.isNotEmpty()) "/" + sub.replace(Regex("[\\\\/:*?\"<>|]"), "_") else "")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = app.contentResolver
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
        return FileProvider.getUriForFile(app, "app.nazzil.files", dest)
    }
}
