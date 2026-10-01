# نزّل — Nazzil

تطبيق لتنزيل الفيديو والصوت، للمحتوى الذي تملكه أو لديك إذن بتنزيله. يعمل محليًا على جهازك: بلا حسابات ولا إعلانات ولا تتبع.

## التحميل — آخر إصدار

الروابط التالية تنزّل دائمًا **أحدث إصدار** مباشرةً، فلا داعي لزيارة صفحة Releases.

| المنصة | الملف | الحجم التقريبي |
|---|---|---|
| 🪟 Windows (مثبّت) | [**Nazzil-Setup.exe**](https://github.com/abdulrahmanahmedelabed-prog/nazzil/releases/latest/download/Nazzil-Setup.exe) | ‎~195 MB |
| 🪟 Windows (بلا تثبيت) | [**Nazzil-Portable.exe**](https://github.com/abdulrahmanahmedelabed-prog/nazzil/releases/latest/download/Nazzil-Portable.exe) | ‎~195 MB |
| 🤖 Android (أغلب الهواتف الحديثة) | [**Nazzil-arm64-v8a.apk**](https://github.com/abdulrahmanahmedelabed-prog/nazzil/releases/latest/download/Nazzil-arm64-v8a.apk) | ‎~35 MB |
| 🤖 Android (الهواتف القديمة 32-bit) | [**Nazzil-armeabi-v7a.apk**](https://github.com/abdulrahmanahmedelabed-prog/nazzil/releases/latest/download/Nazzil-armeabi-v7a.apk) | ‎~33 MB |
| 🤖 Android (يعمل على أي جهاز) | [**Nazzil-universal.apk**](https://github.com/abdulrahmanahmedelabed-prog/nazzil/releases/latest/download/Nazzil-universal.apk) | ‎~93 MB |

> لا تعرف نوع هاتفك؟ نزّل `Nazzil-universal.apk`.
> في Windows قد تظهر رسالة SmartScreen لأن البرنامج غير موقّع رقميًا: اضغط «More info» ثم «Run anyway».
> المستودع خاص حاليًا، فالروابط تعمل لمن سجّل الدخول وله صلاحية الوصول. اجعله عامًا لتعمل لأي شخص.

سجل الإصدارات السابقة: [Releases](https://github.com/abdulrahmanahmedelabed-prog/nazzil/releases)

## المزايا

| الميزة | نزّل |
|---|---|
| المواقع | YouTube وأكثر من 1000 موقع (TikTok, Instagram, X, Facebook, SoundCloud, Vimeo…) |
| الصيغ | MP3 ‏(حتى 320kbps) · M4A ‏(بلا إعادة ترميز) · MP4 · WEBM |
| الجودة | من 360p حتى 4K/8K، مع إخفاء الدقات غير المتاحة للمقطع |
| معاينة | الصورة المصغرة والعنوان والقناة والمدة قبل التنزيل |
| قائمة تنزيل | تنزيلات متزامنة (1–5) مع نسبة التقدم والسرعة والوقت المتبقي |
| روابط متعددة | الصق قائمة روابط دفعة واحدة وتُضاف كلها |
| لا يضيع شيء | في Windows تعود التنزيلات غير المكتملة بعد إغلاق البرنامج وفتحه |
| إشعارات | إشعار عند اكتمال كل تنزيل أو فشله |
| السجل | حتى 300 تنزيل مع بحث سريع |
| التحديثات | تنبيه داخل التطبيق عند صدور نسخة جديدة |
| إيقاف واستئناف | إيقاف مؤقت ومتابعة من حيث توقف، وإعادة محاولة التنزيلات الفاشلة |
| في الخلفية | على Android يستمر التنزيل بعد مغادرة التطبيق، مع إشعار يعرض التقدم |
| حد السرعة | 500KB/s حتى 10MB/s لترك الإنترنت لبقية الأجهزة |
| المحتوى المقيّد | المقاطع المقيّدة بالعمر أو الخاصة بالأعضاء عبر جلسة متصفحك (Windows) |
| اللغة | العربية والإنجليزية، مع اختيار تلقائي حسب لغة الجهاز |
| قوائم التشغيل | تنزيل القائمة كاملة في مجلد مرتّب ومرقّم |
| البيانات | تضمين الغلاف والعنوان والفنان والفصول |
| الترجمة | تضمين الترجمة العربية والإنجليزية في الفيديو |
| SponsorBlock | حذف الإعلانات المدمجة والترويج تلقائيًا |
| القص | تنزيل جزء محدد فقط (من – إلى) |
| الراحة | لصق تلقائي من الحافظة · مشاركة الرابط من أي تطبيق (Android) · اختيار مجلد الحفظ (Windows) · تحديث المحرك بضغطة |
| الخصوصية | لا حسابات ولا إعلانات ولا تتبع. كل شيء على جهازك |

| المنصة | التقنية | الملف الناتج |
|---|---|---|
| Windows | Electron + ‏yt-dlp.exe + ‏ffmpeg.exe مضمّنة | `Nazzil-Setup-1.0.0.exe` و `Nazzil-Portable-1.0.0.exe` |
| Android | WebView + ‏[youtubedl-android](https://github.com/JunkFood02/youtubedl-android) (فيه yt-dlp و FFmpeg) | `Nazzil-universal.apk` وملفات APK لكل معمارية |

## مقارنة بالبرامج المشهورة

| | نزّل | 4K Video Downloader | Seal (Android) | YTDLnis (Android) | Stacher (PC) |
|---|---|---|---|---|---|
| مجاني بالكامل بلا إعلانات | ✓ | ✗ (قوائم التشغيل والتنزيلات المتعددة مدفوعة) | ✓ | ✓ | ✓ |
| Windows و Android | ✓ | Windows/Mac/Linux فقط | Android فقط | Android فقط | PC فقط |
| أكثر من 1000 موقع | ✓ | عدد محدود | ✓ | ✓ | ✓ |
| إيقاف واستئناف | ✓ | ✓ | ✗ | ✓ | ✗ |
| قص مقطع | ✓ | ✗ | ✗ | ✓ | ✓ |
| SponsorBlock | ✓ | ✗ | ✓ | ✓ | ✓ |
| واجهة عربية | ✓ | ✓ | ✓ | ✓ | ✗ |

## البنية

```
web/       الواجهة المشتركة (index.html, style.css, app.js, i18n.js) + ytdlp.js (بناء أوامر yt-dlp للمنصتين)
desktop/   تطبيق Windows: خادم محلي على 127.0.0.1 يشغّل yt-dlp بدون shell
android/   تطبيق Android: جسر JavaScript ‏(window.NazzilAndroid) بنفس الواجهة البرمجية
```

الملفات تُحفظ في مجلد **التنزيلات/Nazzil** على المنصتين.

## الإصدارات

كل push على `main` يبني التطبيقين عبر GitHub Actions (الملفات في **Artifacts**).
لإصدار جديد ادفع وسمًا مثل `v2.1.0`، وستُرفق الملفات بصفحة **Releases** تلقائيًا.

## البناء محليًا

**Windows**
```powershell
cd desktop
Copy-Item -Recurse ..\web .\web
npm install
npm run fetch-bin   # ينزّل yt-dlp.exe و ffmpeg.exe
npm start           # تشغيل للتجربة
npm run dist        # إنشاء ملفات exe داخل dist\
```

**Android** (يحتاج Android SDK و JDK 17)
```bash
cd android
gradle assembleRelease
```

## ملاحظات

- خادم Windows يستمع على 127.0.0.1 فقط ويرفض الطلبات القادمة من مواقع أخرى، ويشغّل yt-dlp بدون shell.
- على Android يُحدَّث yt-dlp تلقائيًا عند التشغيل، لأن YouTube يغيّر موقعه باستمرار.
- ملف APK موقّع بمفتاح debug ليُثبَّت مباشرة. للنشر على Google Play استخدم مفتاحك الخاص.
- على Android: شارك رابط YouTube إلى «نزّل» من أي تطبيق، أو اضغط على منطقة الإسقاط للصق الرابط من الحافظة.
