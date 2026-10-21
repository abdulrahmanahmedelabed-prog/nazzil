package app.nazzil

import org.json.JSONArray
import org.json.JSONObject

/** The full edition has no Google Play Billing: support goes through GitHub Sponsors (handled by the web UI). */
object Store {
    fun products(activity: MainActivity): JSONObject = JSONObject().put("products", JSONArray()).put("supporter", false)
    fun buy(activity: MainActivity, id: String) = activity.js("window.nazzilPurchase && window.nazzilPurchase(false, true)")
}
