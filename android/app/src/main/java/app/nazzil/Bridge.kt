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
import org.json.JSONObject
import java.io.File
import java.net.URI
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** JS bridge exposed as window.NazzilAndroid; same contract as the desktop HTTP API. */
class Bridge(private val activity: MainActivity) {
    private val jobs = ConcurrentHashMap<String, JSONObject>()
    private val saved = ConcurrentHashMap<String, Uri>()
    private val hosts = Regex("^(www\\.|m\\.|music\\.)?(youtube\\.com|youtu\\.be|youtube-nocookie\\.com)$", RegexOption.IGNORE_CASE)

    @JavascriptInterface
    fun status(): String = JSONObject().put("yt_dlp", Tools.ytdlp).put("ffmpeg", Tools.ffmpeg).toString()

    @JavascriptInterface
    fun download(body: String): String {
        val req = JSONObject(body)
        if (!req.optBoolean("rightsConfirmed")) return err("يجب تأكيد امتلاك حق التنزيل.")
        val url = req.optString("url").trim()
        val ok = runCatching { URI(url).let { it.scheme == "https" && hosts.matches(it.host ?: "") } }.getOrDefault(false)
        if (!ok) return err("الرابط غير صالح. ندعم روابط YouTube بصيغة https فقط.")
        val kind = if (req.optString("kind") == "mp4") "mp4" else "mp3"
        val id = UUID.randomUUID().toString()
        val job = JSONObject().put("state", "working").put("progress", 0)
        jobs[id] = job
        Tools.io.execute { run(job, url, kind) }
        return JSONObject().put("jobId", id).toString()
    }

    @JavascriptInterface
    fun job(id: String): String = (jobs[id] ?: JSONObject().put("state", "error").put("error", "المهمة غير موجودة")).toString()

    @JavascriptInterface
    fun open(file: String) {
        val uri = saved[file] ?: return
        val type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.substringAfterLast('.')) ?: "*/*"
        val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        activity.runOnUiThread { runCatching { activity.startActivity(Intent.createChooser(intent, file)) } }
    }

    private fun err(msg: String) = JSONObject().put("error", msg).toString()

    private fun run(job: JSONObject, url: String, kind: String) {
        try {
            while (!Tools.ready) Thread.sleep(300)
            if (!Tools.ytdlp) throw IllegalStateException("تعذر تهيئة yt-dlp على هذا الجهاز.")
            val work = File(activity.cacheDir, "jobs/" + UUID.randomUUID()).apply { mkdirs() }
            val r = YoutubeDLRequest(url).apply {
                addOption("--no-playlist"); addOption("--no-mtime")
                addOption("-o", work.absolutePath + "/%(title).150B [%(id)s].%(ext)s")
                if (kind == "mp3") {
                    addOption("-x"); addOption("--audio-format", "mp3"); addOption("--audio-quality", "0")
                } else {
                    addOption("-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b"); addOption("--merge-output-format", "mp4")
                }
            }
            YoutubeDL.getInstance().execute(r, null) { progress, _, _ -> synchronized(job) { job.put("progress", progress.toDouble()) } }
            val out = work.listFiles()?.filter { it.extension == kind }?.maxByOrNull { it.length() }
                ?: throw IllegalStateException("لم يُنشأ ملف الإخراج.")
            val uri = publish(out, kind)
            saved[out.name] = uri
            work.deleteRecursively()
            synchronized(job) { job.put("state", "done").put("file", out.name).put("name", out.nameWithoutExtension) }
        } catch (e: Exception) {
            val msg = e.message?.lines()?.lastOrNull { it.contains("ERROR") } ?: e.message ?: "تعذر إكمال العملية"
            synchronized(job) { job.put("state", "error").put("error", msg.trim()) }
        }
    }

    /** Copies the finished file to the public Downloads/Nazzil folder. */
    private fun publish(file: File, kind: String): Uri {
        val mime = if (kind == "mp3") "audio/mpeg" else "video/mp4"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = activity.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, file.name)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Nazzil")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: throw IllegalStateException("تعذر الحفظ في التنزيلات.")
            resolver.openOutputStream(uri)!!.use { o -> file.inputStream().use { it.copyTo(o) } }
            values.clear(); values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            return uri
        }
        @Suppress("DEPRECATION")
        val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Nazzil").apply { mkdirs() }
        val dest = File(dir, file.name)
        file.copyTo(dest, overwrite = true)
        return FileProvider.getUriForFile(activity, "app.nazzil.files", dest)
    }
}
