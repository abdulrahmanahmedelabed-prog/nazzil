package app.nazzil

import android.app.Application
import android.util.Log
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import java.util.concurrent.Executors

class NazzilApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Tools.init(this)
    }
}

/** Initialises the embedded yt-dlp + FFmpeg once, off the main thread. */
object Tools {
    @Volatile var ytdlp = false
    @Volatile var ffmpeg = false
    @Volatile var ready = false
    val io = Executors.newCachedThreadPool()

    fun init(app: Application) = io.execute {
        try { YoutubeDL.getInstance().init(app); ytdlp = true } catch (e: Exception) { Log.e("Nazzil", "yt-dlp init", e) }
        try { FFmpeg.getInstance().init(app); ffmpeg = true } catch (e: Exception) { Log.e("Nazzil", "ffmpeg init", e) }
        // Keep yt-dlp current: YouTube changes often and old versions stop working.
        try { YoutubeDL.getInstance().updateYoutubeDL(app, YoutubeDL.UpdateChannel._STABLE) } catch (e: Exception) { Log.w("Nazzil", "update", e) }
        ready = true
    }
}
