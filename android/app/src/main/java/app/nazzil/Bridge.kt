package app.nazzil

import android.content.Intent
import android.webkit.JavascriptInterface
import android.webkit.MimeTypeMap
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import org.json.JSONObject

/**
 * JS bridge exposed as window.NazzilAndroid.call(method, json, id); answers via window.__nzReply(id, json).
 * yt-dlp arguments are built by the shared web/ytdlp.js, so both platforms behave identically.
 */
class Bridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun call(method: String, json: String, id: Int) {
        Tools.io.execute {
            val reply = try {
                handle(method, JSONObject(json))
            } catch (e: Exception) {
                JSONObject().put("error", e.message ?: "تعذر إكمال العملية").put("__rpcError", true)
            }
            activity.reply(id, reply.toString())
        }
    }

    private fun ok() = JSONObject().put("ok", true)

    private fun handle(method: String, a: JSONObject): JSONObject = when (method) {
        "status" -> {
            waitReady()
            JSONObject().put("yt_dlp", Tools.ytdlp).put("ffmpeg", Tools.ffmpeg)
                .put("version", runCatching { YoutubeDL.getInstance().version(activity) }.getOrNull() ?: "")
                .put("folder", "Download/Nazzil").put("canPickFolder", false).put("platform", "android")
                .put("appVersion", runCatching { activity.packageManager.getPackageInfo(activity.packageName, 0).versionName }.getOrNull() ?: "")
        }
        "info" -> {
            waitReady()
            val r = YoutubeDLRequest(a.getString("url")).apply {
                addOption("-J"); addOption("--flat-playlist"); addOption("--no-warnings"); addOption("--playlist-end", "500")
            }
            val res = runCatching { YoutubeDL.getInstance().execute(r) }.getOrElse { throw Exception(Downloads.friendly(it.message)) }
            JSONObject().put("__raw", res.out)
        }
        "download" -> {
            val args = a.getJSONArray("args").let { arr -> List(arr.length()) { arr.getString(it) } }
            activity.ensureNotificationPermission()
            JSONObject().put("jobId", Downloads.add(a.optString("kind", "mp3"), a.optString("title"), args, a.optJSONObject("coverPlan")))
        }
        "jobs" -> JSONObject().put("jobs", Downloads.list())
        "browse" -> {
            // The page passes the platform definition from web/sites.js.
            val i = Intent(activity, BrowseActivity::class.java)
                .putExtra(BrowseActivity.EXTRA_URL, a.optString("mobileUrl").ifEmpty { a.optString("url") })
                .putExtra(BrowseActivity.EXTRA_MATCH, a.optString("match"))
                .putExtra(BrowseActivity.EXTRA_NAME, a.optString("name"))
            activity.runOnUiThread { activity.startActivity(i) }
            ok()
        }
        "pause" -> { Downloads.pause(a.getString("id")); ok() }
        "resume" -> { Downloads.resume(a.getString("id")); ok() }
        "cancel" -> { Downloads.cancel(a.getString("id")); ok() }
        "dismiss" -> { Downloads.dismiss(a.getString("id")); ok() }
        "settings" -> { a.optInt("parallel", 3).takeIf { it in 1..5 }?.let { Downloads.parallel = it }; Downloads.pump(); ok() }
        "open" -> { open(a.optString("file")); ok() }
        "pickFolder" -> JSONObject().put("folder", "Download/Nazzil")
        "pickImage" -> activity.pickImage()?.let { (path, name) -> JSONObject().put("path", path).put("name", name) } ?: JSONObject()
        "update" -> {
            waitReady()
            YoutubeDL.getInstance().updateYoutubeDL(activity, YoutubeDL.UpdateChannel._STABLE)
            JSONObject().put("version", YoutubeDL.getInstance().version(activity) ?: "")
        }
        else -> throw Exception("unknown method $method")
    }

    private fun waitReady() { while (!Tools.ready) Thread.sleep(200) }

    private fun open(file: String) {
        val intent = if (file.isEmpty() || file.startsWith("folder:")) {
            // Android has no universal "open folder" intent; the Downloads app is the closest.
            Intent(android.app.DownloadManager.ACTION_VIEW_DOWNLOADS)
        } else {
            val uri = Downloads.saved[file] ?: throw Exception("افتح الملف من مجلد التنزيلات/Nazzil.")
            val type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.substringAfterLast('.').lowercase()) ?: "*/*"
            Intent.createChooser(Intent(Intent.ACTION_VIEW).setDataAndType(uri, type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), file)
        }
        activity.runOnUiThread { runCatching { activity.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } }
    }
}
