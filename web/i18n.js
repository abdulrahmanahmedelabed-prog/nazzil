// Translation engine. Arabic is the source language (it's what the HTML and messages are written in);
// each file in lang/ maps those Arabic strings to one language: NzI18n.add("xx", { "عربي": "translation" }).
// The page's static text is translated by walking text nodes, so the HTML needs no extra markup.
(function () {
  "use strict";
  // The most used languages among Android users worldwide. [code, native name, direction]
  const LANGS = [
    ["ar", "العربية", "rtl"], ["en", "English"], ["es", "Español"], ["pt", "Português"], ["fr", "Français"],
    ["de", "Deutsch"], ["it", "Italiano"], ["ru", "Русский"], ["tr", "Türkçe"], ["id", "Bahasa Indonesia"],
    ["hi", "हिन्दी"], ["bn", "বাংলা"], ["ur", "اردو", "rtl"], ["fa", "فارسی", "rtl"], ["vi", "Tiếng Việt"],
    ["th", "ไทย"], ["ja", "日本語"], ["ko", "한국어"], ["zh", "中文（简体）"],
  ];
  const CODES = LANGS.map(l => l[0]);
  const dicts = {};
  const original = new WeakMap();

  // Saved choice wins; otherwise the first device language we support; otherwise English.
  function detect() {
    let saved = null;
    try { saved = localStorage.getItem("nazil.lang"); } catch {}
    if (saved && CODES.includes(saved)) return saved;
    const prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"]);
    for (const p of prefs) {
      const code = String(p).toLowerCase().split(/[-_]/)[0];
      if (code === "zh" && /tw|hk|mo|hant/i.test(p)) continue; // Traditional Chinese isn't provided
      if (CODES.includes(code)) return code;
    }
    return "en";
  }
  let lang = detect();
  const isTranslatable = k => !!(dicts.en && dicts.en[k]);

  /** Translate an Arabic source string (falls back to English, then to the source). */
  function t(s) {
    if (s == null || lang === "ar") return s;
    const k = String(s).trim();
    return (dicts[lang] && dicts[lang][k]) || (dicts.en && dicts.en[k]) || s;
  }

  function translatePage() {
    const def = LANGS.find(l => l[0] === lang) || LANGS[1];
    document.documentElement.lang = lang;
    document.documentElement.dir = def[2] || "ltr";
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement.closest("[data-no-i18n]")) continue;
      if (!original.has(n)) {
        if (!isTranslatable(n.nodeValue.trim())) continue;
        original.set(n, n.nodeValue);
      }
      const src = original.get(n);
      n.nodeValue = lang === "ar" ? src : src.replace(src.trim(), t(src.trim()));
    }
    for (const el of document.querySelectorAll("[placeholder],[title],[aria-label]")) {
      for (const attr of ["placeholder", "title", "aria-label"]) {
        if (!el.hasAttribute(attr)) continue;
        const key = "i18n" + attr.replace(/-(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, c => c.toUpperCase());
        if (!(key in el.dataset)) { if (!isTranslatable(el.getAttribute(attr))) continue; el.dataset[key] = el.getAttribute(attr); }
        el.setAttribute(attr, t(el.dataset[key]));
      }
    }
    if (!original.has(document)) original.set(document, document.title);
    document.title = t(original.get(document));
  }

  window.NzI18n = {
    t, translatePage, LANGS,
    add(code, dict) { dicts[code] = Object.assign(dicts[code] || {}, dict); },
    has: code => code === "ar" || !!dicts[code],
    get lang() { return lang; },
    get dir() { return (LANGS.find(l => l[0] === lang) || [])[2] || "ltr"; },
    set(l) { lang = CODES.includes(l) ? l : "en"; try { localStorage.setItem("nazil.lang", lang); } catch {} translatePage(); },
  };
})();
