package app.nazzil

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import java.util.Locale

/**
 * In-app browser for one platform (YouTube, Facebook, TikTok…; see web/sites.js). A floating button appears on
 * pages matching the platform's pattern and sends the link back to Nazzil.
 */
class BrowseActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var pick: Button
    private lateinit var isMedia: Regex

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val start = intent.getStringExtra(EXTRA_URL)?.takeIf { it.startsWith("https://") } ?: "https://m.youtube.com/"
        isMedia = runCatching { Regex(intent.getStringExtra(EXTRA_MATCH)!!.ifEmpty { "(?!)" }, RegexOption.IGNORE_CASE) }.getOrElse { Regex("(?!)") }
        title = intent.getStringExtra(EXTRA_NAME) ?: ""
        CookieManager.getInstance().setAcceptCookie(true)
        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0f0f0f"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = true
            // Drop the WebView marker ("; wv") so sites serve their normal mobile pages and allow sign-in.
            settings.userAgentString = settings.userAgentString.replace("; wv)", ")")
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    // Stay in the in-app browser for web pages; ignore app deep links (intent://, fb://, snssdk…)
                    // so the user isn't bounced out to the platform's own app.
                    val scheme = request.url.scheme ?: ""
                    return scheme != "http" && scheme != "https"
                }
                override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) = refresh(url)
            }
        }
        val ar = Locale.getDefault().language == "ar"
        pick = Button(this).apply {
            text = if (ar) "⬇ تنزيل بـ نزّل" else "⬇ Download with Nazzil"
            isAllCaps = false
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.parseColor("#11170d"))
            background = GradientDrawable().apply { setColor(Color.parseColor("#c9ff67")); cornerRadius = 40f }
            setPadding(60, 30, 60, 30)
            elevation = 12f
            visibility = View.GONE
            setOnClickListener {
                // Hand the link to MainActivity through the same path as "Share → Nazzil".
                startActivity(Intent(this@BrowseActivity, MainActivity::class.java)
                    .setAction(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_TEXT, web.url ?: "")
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
                finish()
            }
        }
        val root = FrameLayout(this)
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        root.addView(pick, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply { bottomMargin = 64 })
        setContentView(root)
        web.loadUrl(start)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else finish() }
        })
    }

    private fun refresh(url: String?) {
        pick.visibility = if (url != null && isMedia.containsMatchIn(url)) View.VISIBLE else View.GONE
    }

    override fun onDestroy() { web.destroy(); super.onDestroy() }

    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_MATCH = "match"
        const val EXTRA_NAME = "name"
    }
}
