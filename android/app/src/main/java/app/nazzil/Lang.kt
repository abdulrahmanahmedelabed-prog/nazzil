package app.nazzil

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

/** The language picked in the app (the web UI tells us), so notifications match it instead of the system language. */
object Lang {
    private const val KEY = "lang"
    @Volatile private var code: String? = null

    fun set(app: Context, lang: String) {
        code = lang
        app.getSharedPreferences("nazzil", Context.MODE_PRIVATE).edit().putString(KEY, lang).apply()
    }

    /** A context whose resources use the app's language (or the system's, until the user picks one). */
    fun ctx(base: Context): Context {
        val lang = code ?: base.getSharedPreferences("nazzil", Context.MODE_PRIVATE).getString(KEY, null)?.also { code = it }
        if (lang.isNullOrEmpty()) return base
        val conf = Configuration(base.resources.configuration).apply { setLocale(Locale.forLanguageTag(lang)) }
        return base.createConfigurationContext(conf)
    }
}
