# نزّل — Nazzil

تطبيق لتنزيل الفيديو والصوت (MP3 / MP4) من روابط YouTube، للمحتوى الذي تملكه أو لديك إذن بتنزيله. يعمل محليًا على جهازك: بلا حسابات ولا إعلانات ولا تتبع.

| المنصة | التقنية | الملف الناتج |
|---|---|---|
| Windows | Electron + ‏yt-dlp.exe + ‏ffmpeg.exe مضمّنة | `Nazzil-Setup-1.0.0.exe` و `Nazzil-Portable-1.0.0.exe` |
| Android | WebView + ‏[youtubedl-android](https://github.com/JunkFood02/youtubedl-android) (فيه yt-dlp و FFmpeg) | `Nazzil-universal.apk` وملفات APK لكل معمارية |

## البنية

```
web/       الواجهة المشتركة (index.html, style.css, app.js)
desktop/   تطبيق Windows: خادم محلي على 127.0.0.1 يشغّل yt-dlp بدون shell
android/   تطبيق Android: جسر JavaScript ‏(window.NazzilAndroid) بنفس الواجهة البرمجية
```

الملفات تُحفظ في مجلد **التنزيلات/Nazzil** على المنصتين.

## الحصول على التطبيقات

كل push على `main` يبني التطبيقين عبر GitHub Actions. حمّلهما من صفحة **Actions** ثم من **Artifacts**.
ولإنشاء إصدار عام، ادفع وسمًا مثل `v1.0.0`، وستُرفق الملفات بصفحة **Releases** تلقائيًا.

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

- الخدمتان تقبلان روابط `https` التابعة لـ YouTube فقط.
- على Android يُحدَّث yt-dlp تلقائيًا عند التشغيل، لأن YouTube يغيّر موقعه باستمرار.
- ملف APK موقّع بمفتاح debug ليُثبَّت مباشرة. للنشر على Google Play استخدم مفتاحك الخاص.
- على Android: شارك رابط YouTube إلى «نزّل» من أي تطبيق، أو اضغط على منطقة الإسقاط للصق الرابط من الحافظة.
