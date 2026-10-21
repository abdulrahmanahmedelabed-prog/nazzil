package app.nazzil

import java.net.URI

/**
 * Store edition ("Nazzil Open" on Google Play): downloads only from sources that allow it.
 * Mirrors STORE in web/ytdlp.js (a unit test checks they stay identical) and is enforced natively,
 * so the page can't bypass it.
 */
object StorePolicy {
    val ENABLED: Boolean = BuildConfig.STORE

    const val EXTRACTORS = "archive.org,wikimedia.org,PeerTube,PeerTube:Playlist,generic"

    private val BLOCKED = Regex("(^|\\.)(youtube\\.com|youtu\\.be|youtube-nocookie\\.com|youtubekids\\.com|googlevideo\\.com|ytimg\\.com|facebook\\.com|fb\\.watch|fbcdn\\.net|instagram\\.com|cdninstagram\\.com|tiktok\\.com|tiktokcdn\\.com|twitter\\.com|x\\.com|twimg\\.com|twitch\\.tv|dailymotion\\.com|dai\\.ly|reddit\\.com|redd\\.it|soundcloud\\.com|vimeo\\.com|spotify\\.com|netflix\\.com|disneyplus\\.com|primevideo\\.com|amazon\\.[a-z.]+|apple\\.com|deezer\\.com|anghami\\.com|shahid\\.net|osn\\.com)$", RegexOption.IGNORE_CASE)

    /** Is this link from a source the store edition may download from? */
    fun allows(url: String): Boolean = runCatching {
        val u = URI(url.trim())
        val host = (u.host ?: return false).trimEnd('.')
        (u.scheme == "https" || u.scheme == "http") && !BLOCKED.containsMatchIn(host)
    }.getOrDefault(false)

    const val MESSAGE = "هذه النسخة تنزّل من المصادر المفتوحة فقط: Internet Archive وWikimedia Commons وPeerTube والبودكاست والروابط المباشرة."

    /**
     * Checks a yt-dlp argument list (URLs after "--") and pins the extractor allowlist.
     * Throws if any URL is not allowed.
     */
    fun enforce(args: List<String>): List<String> {
        if (!ENABLED) return args
        val sep = args.indexOf("--")
        val urls = if (sep >= 0) args.drop(sep + 1) else emptyList()
        if (urls.isEmpty() || !urls.all { allows(it) }) throw Exception(MESSAGE)
        val opts = args.take(sep).toMutableList()
        // Drop anything that could widen what yt-dlp may reach, then pin the allowlist.
        var i = 0
        while (i < opts.size) {
            when (opts[i]) {
                "--use-extractors", "--ies", "--cookies", "--cookies-from-browser", "--sponsorblock-remove", "--sponsorblock-mark" -> { opts.removeAt(i); if (i < opts.size) opts.removeAt(i) }
                else -> i++
            }
        }
        return opts + listOf("--use-extractors", EXTRACTORS) + args.drop(sep)
    }
}
