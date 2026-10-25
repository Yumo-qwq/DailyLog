package com.dailylog.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

class MainActivity : ComponentActivity() {
    private companion object {
        const val LOCAL_ASSET_PATH = "/assets/"
        val LOCAL_PAGE_URL = "https://${WebViewAssetLoader.DEFAULT_DOMAIN}${LOCAL_ASSET_PATH}index.html"
    }

    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val chooseFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        completeFileChooser(
            if (result.resultCode == Activity.RESULT_OK) {
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            } else {
                null
            }
        )
    }

    private fun completeFileChooser(uris: Array<Uri>?) {
        val callback = fileCallback
        fileCallback = null
        callback?.onReceiveValue(uris)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val container = FrameLayout(this).apply { setBackgroundColor(getColor(R.color.paper)) }
        webView = WebView(this)
        container.addView(webView, FrameLayout.LayoutParams(-1, -1))
        setContentView(container)

        ViewCompat.setOnApplyWindowInsetsListener(container) { view, insets ->
            val safeArea = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(safeArea.left, safeArea.top, safeArea.right, safeArea.bottom)
            insets
        }

        val assets = WebViewAssetLoader.Builder()
            .addPathHandler(LOCAL_ASSET_PATH, WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return assets.shouldInterceptRequest(request.url)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme == "https" && uri.host == WebViewAssetLoader.DEFAULT_DOMAIN && uri.path?.startsWith(LOCAL_ASSET_PATH) == true) return false
                if (uri.scheme == "http" || uri.scheme == "https" || uri.scheme == "mailto") {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                }
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                completeFileChooser(null)
                fileCallback = filePathCallback
                return try {
                    chooseFiles.launch(fileChooserParams.createIntent())
                    true
                } catch (_: Exception) {
                    completeFileChooser(null)
                    false
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(LOCAL_PAGE_URL)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        completeFileChooser(null)
        webView.destroy()
        super.onDestroy()
    }
}
