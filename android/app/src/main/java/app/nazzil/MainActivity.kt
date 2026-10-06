package app.nazzil

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File
import java.util.UUID
import java.util.concurrent.CompletableFuture
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private var pendingUrl: String? = null
    private var loaded = false
    @Volatile private var imageResult: CompletableFuture<Uri?>? = null
    private val imagePicker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri -> imageResult?.complete(uri) }

    /**
     * Lets the user pick a cover image (called from a background thread; blocks until they choose or cancel).
     * The image is copied into app storage so it's still readable when the download finishes.
     */
    fun pickImage(): Pair<String, String>? {
        val future = CompletableFuture<Uri?>()
        imageResult = future
        runOnUiThread { imagePicker.launch("image/*") }
        val uri = future.get() ?: return null
        val name = contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        } ?: "image"
        val dir = File(filesDir, "covers").apply { mkdirs() }
        dir.listFiles()?.sortedBy { it.lastModified() }?.dropLast(10)?.forEach { it.delete() } // keep a few recent ones
        val dest = File(dir, UUID.randomUUID().toString() + "." + name.substringAfterLast('.', "jpg").take(5))
        contentResolver.openInputStream(uri)?.use { input -> dest.outputStream().use { input.copyTo(it) } } ?: return null
        return dest.absolutePath to name
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web = WebView(this).apply {
            setBackgroundColor(0xFF15161A.toInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            addJavascriptInterface(Bridge(this@MainActivity), "NazzilAndroid")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest) =
                    assets.shouldInterceptRequest(request.url)
                override fun onPageFinished(view: WebView, url: String) { loaded = true; deliverSharedUrl() }
                // Anything outside the bundled UI (e.g. the release page) opens in the browser.
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.host == "appassets.androidplatform.net") return false
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                    return true
                }
            }
        }
        setContentView(web)
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else finish() }
        })
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), 1)
        }
        handleShare(intent)
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); handleShare(intent) }

    private fun handleShare(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND) return
        val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return
        // Pass the whole shared text; the page extracts every link from it.
        if (!text.contains("http")) return
        pendingUrl = text
        if (loaded) deliverSharedUrl()
    }

    /** Android 13+ needs permission to show the download progress notification. */
    fun ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            runOnUiThread { requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 2) }
        }
    }

    /** Delivers an RPC result back to the page. */
    fun reply(id: Int, json: String) = runOnUiThread {
        web.evaluateJavascript("window.__nzReply($id, ${JSONObject.quote(json)})", null)
    }

    private fun deliverSharedUrl() {
        val url = pendingUrl ?: return
        pendingUrl = null
        web.evaluateJavascript("window.nazzilSetUrl && window.nazzilSetUrl(${JSONObject.quote(url)})", null)
    }
}
