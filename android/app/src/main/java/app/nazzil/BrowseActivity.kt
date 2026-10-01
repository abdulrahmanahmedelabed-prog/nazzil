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

/** In-app YouTube. A floating button appears on video/playlist pages and sends the link back to Nazzil. */
class BrowseActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var pick: Button
    private val isVideo = Regex("youtube\\.com/(watch|shorts/|playlist|live/)|youtu\\.be/")
    private val allowed = Regex("^https://([\\w-]+\\.)*(youtube\\.com|youtu\\.be|google\\.com|gstatic\\.com|googleusercontent\\.com)(/|$)")

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        CookieManager.getInstance().setAcceptCookie(true)
        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0f0f0f"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = true
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val u = request.url.toString()
                    if (allowed.containsMatchIn(u)) return false
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                    return true
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
        web.loadUrl("https://m.youtube.com/")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else finish() }
        })
    }

    private fun refresh(url: String?) {
        pick.visibility = if (url != null && isVideo.containsMatchIn(url)) View.VISIBLE else View.GONE
    }

    override fun onDestroy() { web.destroy(); super.onDestroy() }
}
