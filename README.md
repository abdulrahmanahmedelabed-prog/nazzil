# نزّل — Nazzil

تطبيق لتنزيل الفيديو والصوت، للمحتوى الذي تملكه أو لديك إذن بتنزيله. يعمل محليًا على جهازك: بلا حسابات ولا إعلانات ولا تتبع.

## التحميل

آخر إصدار من صفحة [Releases](../../releases/latest):
- **Windows:** ‏`Nazzil-Setup-*.exe` (مثبّت) أو `Nazzil-Portable-*.exe` (بلا تثبيت)
- **Android:** ‏`Nazzil-universal.apk` (أو ملف معمارية جهازك، وهو أصغر حجمًا، مثل `arm64-v8a`)

## المزايا

| الميزة | نزّل |
|---|---|
| المواقع | YouTube وأكثر من 1000 موقع (TikTok, Instagram, X, Facebook, SoundCloud, Vimeo…) |
| الصيغ | MP3 ‏(حتى 320kbps) · M4A ‏(بلا إعادة ترميز) · MP4 · WEBM |
| الجودة | من 360p حتى 4K/8K، مع إخفاء الدقات غير المتاحة للمقطع |
| معاينة | الصورة المصغرة والعنوان والقناة والمدة قبل التنزيل |
| قائمة تنزيل | تنزيلات متزامنة (1–5) مع نسبة التقدم والسرعة والوقت المتبقي والإلغاء |
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

## البنية

```
web/       الواجهة المشتركة (index.html, style.css, app.js) + ytdlp.js (بناء أوامر yt-dlp للمنصتين)
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
