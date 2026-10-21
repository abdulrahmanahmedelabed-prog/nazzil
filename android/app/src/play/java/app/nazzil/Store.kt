package app.nazzil

import android.content.Context
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingClient.ProductType
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ConsumeParams
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * "Support Nazzil" through Google Play Billing (Play edition only). Nothing is locked behind it except the
 * interface colors, a thank-you. Products are created in Play Console → Monetize → In-app products:
 * tip_coffee and tip_gold are consumable (can be given again), supporter is a one-time purchase (restored on reinstall).
 */
object Store {
    private val IDS = listOf("tip_coffee", "supporter", "tip_gold") // shown in this order
    private const val ONCE = "supporter"
    private val details = ConcurrentHashMap<String, ProductDetails>()
    @Volatile private var client: BillingClient? = null
    @Volatile private var activity: MainActivity? = null

    private fun prefs(c: Context) = c.getSharedPreferences("nazzil", Context.MODE_PRIVATE)
    private fun supporter(c: Context) = prefs(c).getBoolean("supporter", false)

    @Synchronized private fun client(a: MainActivity): BillingClient {
        activity = a
        client?.let { return it }
        val app = a.applicationContext
        return BillingClient.newBuilder(app)
            .setListener { result, purchases ->
                if (result.responseCode == BillingResponseCode.OK && purchases != null) purchases.forEach { handle(app, it, fresh = true) }
                else activity?.js("window.nazzilPurchase && window.nazzilPurchase(false, ${result.responseCode != BillingResponseCode.USER_CANCELED})")
            }
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .build().also { client = it }
    }

    private fun connected(c: BillingClient): Boolean {
        if (c.isReady) return true
        val done = CountDownLatch(1)
        c.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) = done.countDown()
            override fun onBillingServiceDisconnected() {}
        })
        done.await(5, TimeUnit.SECONDS)
        return c.isReady
    }

    /** Called on a background thread by the bridge: prices from Play, plus whether this user already supported. */
    fun products(a: MainActivity): JSONObject {
        val c = client(a)
        val out = JSONObject().put("products", JSONArray()).put("supporter", supporter(a))
        if (!connected(c)) return out
        val done = CountDownLatch(2)
        c.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(ProductType.INAPP).build()) { r, list ->
            if (r.responseCode == BillingResponseCode.OK) list.forEach { handle(a.applicationContext, it, fresh = false) }
            done.countDown()
        }
        val params = QueryProductDetailsParams.newBuilder().setProductList(IDS.map {
            QueryProductDetailsParams.Product.newBuilder().setProductId(it).setProductType(ProductType.INAPP).build()
        }).build()
        c.queryProductDetailsAsync(params) { r, result ->
            if (r.responseCode == BillingResponseCode.OK) result.productDetailsList.forEach { details[it.productId] = it }
            done.countDown()
        }
        done.await(8, TimeUnit.SECONDS)
        val list = JSONArray()
        for (id in IDS) details[id]?.oneTimePurchaseOfferDetails?.let { list.put(JSONObject().put("id", id).put("price", it.formattedPrice)) }
        return out.put("products", list).put("supporter", supporter(a))
    }

    fun buy(a: MainActivity, id: String) {
        val c = client(a)
        val pd = details[id]
        if (pd == null || !c.isReady) { a.js("window.nazzilPurchase && window.nazzilPurchase(false, true)"); return }
        val flow = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(pd).build()))
            .build()
        a.runOnUiThread { c.launchBillingFlow(a, flow) }
    }

    private fun handle(app: Context, p: Purchase, fresh: Boolean) {
        if (p.purchaseState != Purchase.PurchaseState.PURCHASED) return // pending payments finish later and show up on the next launch
        prefs(app).edit().putBoolean("supporter", true).apply()
        val c = client ?: return
        if (ONCE in p.products) {
            if (!p.isAcknowledged) c.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.purchaseToken).build()) {}
        } else {
            c.consumeAsync(ConsumeParams.newBuilder().setPurchaseToken(p.purchaseToken).build()) { _, _ -> } // tips can be given again
        }
        if (fresh) activity?.js("window.nazzilPurchase && window.nazzilPurchase(true)")
    }
}
