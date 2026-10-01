// Arabic is the source language (it's what the HTML is written in); this maps each Arabic string to English.
// The page's static text is translated by walking text nodes, so the HTML needs no extra markup.
(function () {
  "use strict";
  const EN = {
    "نزّل": "Nazzil",
    "نزّل — فيديو وصوت": "Nazzil — Video & Audio",
    "استوديو الفيديو والصوت": "Video & audio studio",
    "محلي وآمن": "Local & private",
    "الإعدادات": "Settings",
    "المظهر": "Theme",
    "تبديل المظهر": "Toggle theme",
    "اللغة": "Language",
    "مساحة التحويل الخاصة بك": "Your conversion space",
    "من الرابط إلى ملف جاهز": "From link to file",
    "بلمسة واحدة.": "in one tap.",
    "YouTube وأكثر من 1000 موقع · قوائم تشغيل · حتى 4K · بلا إعلانات. ملفاتك تبقى على جهازك.": "YouTube and 1000+ sites · playlists · up to 4K · no ads. Your files stay on your device.",
    "أضف الرابط": "Add a link",
    "فحص الأدوات…": "Checking tools…",
    "رابط الفيديو أو قائمة التشغيل": "Video or playlist link",
    "مسح الرابط": "Clear link",
    "اسحب الرابط هنا أو اضغط للصق من الحافظة": "Drop a link here or tap to paste from clipboard",
    "YouTube · TikTok · Instagram · X · Facebook · SoundCloud · Vimeo وغيرها": "YouTube · TikTok · Instagram · X · Facebook · SoundCloud · Vimeo and more",
    "الصيغة والجودة": "Format & quality",
    "صوت متوافق مع كل الأجهزة": "Audio that plays everywhere",
    "الأكثر طلبًا": "Popular",
    "صوت أصلي بلا إعادة ترميز": "Original audio, no re-encoding",
    "فيديو يعمل في كل مكان": "Video that plays everywhere",
    "أعلى جودة · حتى 8K": "Top quality · up to 8K",
    "دقة الفيديو": "Video resolution",
    "أفضل متاح": "Best available",
    "جودة الصوت": "Audio quality",
    "الأعلى (VBR)": "Highest (VBR)",
    "خيارات متقدمة": "Advanced options",
    "تنزيل قائمة التشغيل كاملة": "Download the whole playlist",
    "تضمين الغلاف والبيانات (العنوان، الفنان)": "Embed cover art & metadata (title, artist)",
    "تضمين الترجمة (عربي / إنجليزي)": "Embed subtitles (Arabic / English)",
    "حذف الإعلانات المدمجة والمقدمات (SponsorBlock)": "Remove sponsor segments (SponsorBlock)",
    "قص مقطع": "Trim",
    "من 0:00": "From 0:00",
    "إلى 1:30": "To 1:30",
    "لدي الحق في تنزيل هذا المحتوى أو أملك إذنًا بذلك.": "I own this content or have permission to download it.",
    "إضافة إلى التنزيلات": "Add to downloads",
    "قائمة التنزيل": "Downloads",
    "لا توجد تنزيلات جارية": "No active downloads",
    "نشاطك الأخير": "Recent",
    "مسح الكل": "Clear all",
    "لا توجد تنزيلات بعد": "No downloads yet",
    "ستظهر ملفاتك هنا": "Your files will appear here",
    "خصوصيتك أولاً": "Privacy first",
    "المعالجة تتم على جهازك. لا حسابات، لا تتبع، لا إعلانات.": "Everything runs on your device. No accounts, no tracking, no ads.",
    "مجلد الحفظ": "Save folder",
    "تغيير": "Change",
    "فتح": "Open",
    "التنزيلات المتزامنة": "Parallel downloads",
    "عدد الملفات التي تُنزّل في نفس الوقت": "Files downloaded at the same time",
    "حد السرعة": "Speed limit",
    "لترك الإنترنت متاحًا لبقية الأجهزة": "Leave bandwidth for other devices",
    "بلا حد": "Unlimited",
    "ملفات تعريف الارتباط": "Browser cookies",
    "للمقاطع المقيّدة بالعمر أو الخاصة بالأعضاء": "For age-restricted or members-only videos",
    "بدون": "None",
    "لصق تلقائي": "Auto-paste",
    "التقاط الرابط من الحافظة عند فتح التطبيق": "Grab a link from the clipboard when the app opens",
    "محرك التنزيل": "Download engine",
    "تحديث": "Update",
    "تم": "Done",
    "يعمل محليًا على جهازك": "Runs locally on your device",
    "يعمل محليًا على Windows": "Runs locally on Windows",
    "يعمل محليًا على Android": "Runs locally on Android",
    "للمحتوى المصرّح به فقط": "For authorized content only",
    "يمكنك لصق عدة روابط دفعة واحدة": "You can paste several links at once",
    "ابحث في التنزيلات…": "Search downloads…",
    // dynamic
    "روابط ستُضاف كلها إلى قائمة التنزيل": "links will all be added to the queue",
    "أُضيفت الروابط إلى قائمة التنزيل ✓": "Links added to downloads ✓",
    "لا نتائج": "No results",
    "إصدار جديد متاح": "New version available",
    "اضغط للتحميل": "click to download",
    "جارٍ جلب المعلومات…": "Fetching info…",
    "بدون عنوان": "Untitled",
    "قائمة": "Playlist",
    "مقطع": "videos",
    "ملف": "files",
    "جارٍ": "active",
    "في الانتظار…": "Queued…",
    "جارٍ التحويل…": "Converting…",
    "اكتمل": "Done",
    "فتح المجلد": "Open folder",
    "أُلغي": "Cancelled",
    "متوقف مؤقتًا": "Paused",
    "إيقاف مؤقت": "Pause",
    "استئناف": "Resume",
    "إعادة المحاولة": "Retry",
    "إلغاء": "Cancel",
    "إخفاء": "Dismiss",
    "فتح الملف": "Open file",
    "أُضيف إلى قائمة التنزيل ✓": "Added to downloads ✓",
    "ألصق رابطًا صحيحًا يبدأ بـ https://": "Paste a valid link starting with https://",
    "أكّد أن لديك الحق في تنزيل هذا المحتوى.": "Confirm you have the right to download this content.",
    "صيغة وقت القص غير صحيحة. مثال: 1:30": "Invalid trim time. Example: 1:30",
    "تم لصق الرابط من الحافظة.": "Link pasted from clipboard.",
    "تم استلام الرابط. اختر الصيغة وأضفه للتنزيل.": "Link received. Pick a format and add it.",
    "الخدمة غير متصلة": "Service offline",
    "جارٍ التحديث…": "Updating…",
    "مُحدَّث ✓": "Updated ✓",
    "فشل": "Failed",
    "فشل الطلب": "Request failed",
    "فشل التحديث": "Update failed",
    "تعذر إكمال العملية": "Couldn't complete the download",
    "تعذر إكمال العملية.": "Couldn't complete the download.",
    "لم يُنشأ أي ملف.": "No file was produced.",
    "يجب تأكيد امتلاك حق التنزيل.": "Please confirm you have the right to download.",
    "الرابط غير صالح. استخدم رابطًا يبدأ بـ https://": "Invalid link. Use a link starting with https://",
    "هذا الموقع أو الرابط غير مدعوم.": "This site or link isn't supported.",
    "المحتوى خاص أو يتطلب تسجيل الدخول.": "This content is private or requires sign-in. Try browser cookies in Settings.",
    "المقطع غير متاح.": "This video is unavailable.",
    "الرابط غير موجود. تأكد منه وحاول مجددًا.": "Link not found. Check it and try again.",
    "تعذر الاتصال. تحقق من الإنترنت ثم أعد المحاولة.": "Couldn't connect. Check your internet and retry.",
    "رفض الموقع الطلب. جرّب تحديث محرك التنزيل من الإعدادات.": "The site refused the request. Try updating the download engine in Settings.",
    "الملف غير موجود. ربما نُقل أو حُذف.": "File not found. It may have been moved or deleted.",
    "افتح الملف من مجلد التنزيلات/Nazzil.": "Open the file from Downloads/Nazzil.",
    "تعذر تهيئة yt-dlp على هذا الجهاز.": "Couldn't start yt-dlp on this device.",
    "تعذر الحفظ في التنزيلات.": "Couldn't save to Downloads.",
  };

  const original = new WeakMap();
  // Saved choice wins; otherwise follow the system language (Arabic systems get Arabic, everyone else English).
  let saved = null;
  try { saved = localStorage.getItem("nazil.lang"); } catch {}
  let lang = saved || ((navigator.language || "").toLowerCase().startsWith("ar") ? "ar" : "en");

  /** Translate an Arabic source string (untranslated strings pass through unchanged). */
  function t(s) {
    if (lang !== "en" || s == null) return s;
    const k = String(s).trim();
    return EN[k] ?? s;
  }

  function translatePage() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "en" ? "ltr" : "rtl";
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement.closest("[data-no-i18n]")) continue;
      if (!original.has(n)) {
        const k = n.nodeValue.trim();
        if (!EN[k]) continue;
        original.set(n, n.nodeValue);
      }
      const src = original.get(n);
      n.nodeValue = lang === "en" ? src.replace(src.trim(), EN[src.trim()]) : src;
    }
    for (const el of document.querySelectorAll("[placeholder],[title],[aria-label]")) {
      for (const attr of ["placeholder", "title", "aria-label"]) {
        if (!el.hasAttribute(attr)) continue;
        const key = "i18n" + attr.replace(/-(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, c => c.toUpperCase());
        if (!(key in el.dataset)) { if (!EN[el.getAttribute(attr)]) continue; el.dataset[key] = el.getAttribute(attr); }
        el.setAttribute(attr, t(el.dataset[key]));
      }
    }
    if (!original.has(document)) original.set(document, document.title);
    document.title = t(original.get(document));
  }

  window.NzI18n = {
    t, translatePage,
    get lang() { return lang; },
    set(l) { lang = l === "en" ? "en" : "ar"; try { localStorage.setItem("nazil.lang", lang); } catch {} translatePage(); },
  };
})();
