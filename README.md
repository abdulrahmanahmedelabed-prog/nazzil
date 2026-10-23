# نزّل — Nazzil

<img src="assets/icon.svg" width="96" align="left" alt="">

تطبيق لتنزيل الفيديو والصوت على **Windows** و**Android**، ومن **متصفح الجوال** عبر الكمبيوتر.
بلا حسابات ولا إعلانات ولا تتبّع، وكل المعالجة تتم على جهازك.

<br clear="left">

## التحميل — آخر إصدار

الروابط التالية تنزّل دائمًا **أحدث إصدار** مباشرةً.

| المنصة | الملف |
|---|---|
| 🪟 Windows (مثبّت) | [**Nazzil-Setup.exe**](https://github.com/abdulrahmanahmedelabed-prog/nazzil/releases/latest/download/Nazzil-Setup.exe) |
| 🪟 Windows (بلا تثبيت) | [**Nazzil-Portable.exe**](https://github.com/abdulrahmanahmedelabed-prog/nazzil/releases/latest/download/Nazzil-Portable.exe) |
| 🤖 Android (أغلب الهواتف) | [**Nazzil-arm64-v8a.apk**](https://github.com/abdulrahmanahmedelabed-prog/nazzil/releases/latest/download/Nazzil-arm64-v8a.apk) |
| 🤖 Android (الهواتف القديمة 32-bit) | [**Nazzil-armeabi-v7a.apk**](https://github.com/abdulrahmanahmedelabed-prog/nazzil/releases/latest/download/Nazzil-armeabi-v7a.apk) |
| 🤖 Android (أي جهاز) | [**Nazzil-universal.apk**](https://github.com/abdulrahmanahmedelabed-prog/nazzil/releases/latest/download/Nazzil-universal.apk) |

سجل الإصدارات: [Releases](https://github.com/abdulrahmanahmedelabed-prog/nazzil/releases)

## المزايا

- **صفحة واحدة:** الرابط والصيغة وزر التنزيل في المنتصف، والإضافات على جانب الشاشة (وفي الجوال درج جانبي).
- **مصادر كثيرة:** الصق الرابط أو اسحبه إلى النافذة، أو شاركه إلى نزّل من أي تطبيق، أو تصفّح YouTube وFacebook وTikTok وInstagram وX من الواجهة، وSoundCloud وVimeo وTwitch وDailymotion وReddit من «الإضافات ← منصات أخرى».
- **تحويل ملفات من جهازك:** زر «من جهازي» (أو شارك ملفًا إلى نزّل في Android) يحوّل أي فيديو أو صوت إلى MP3 أو M4A أو MP4، مع القص وصورة الغلاف. ويوجد دليل لتنزيل **فيديوهاتك أنت** من YouTube رسميًا عبر Google Takeout.
- **الصيغ:** MP3 وM4A للصوت، وMP4 وWEBM للفيديو حتى 4K، مع معاينة قبل التنزيل.
- **قائمة تنزيلات:** متزامنة، مع إيقاف واستئناف وإعادة محاولة، وتستمر في الخلفية، وتعود بعد إغلاق البرنامج.
- **بلا إنترنت:** أضف الروابط وأنت غير متصل، فتنتظر في القائمة وتبدأ وحدها عند عودة الاتصال. والتنزيل الذي ينقطع يكمل من حيث توقف.
- **الإضافات:** قص جزء، قائمة تشغيل كاملة، البيانات والترجمة، SponsorBlock، وصورة غلاف الصوت (صورة المقطع، أو لقطة من الفيديو، أو صورة من جهازك، أو بدون).
- **تسجيل الدخول:** ما تسجّل دخولك إليه داخل متصفح نزّل يُستخدم للمحتوى الذي يتطلب حسابًا.
- **من الجوال بلا تثبيت:** فعّل «الوصول من الجوال» في إعدادات نزّل على Windows وامسح رمز QR.
- **19 لغة:** العربية، English، Español، Português، Français، Deutsch، Italiano، Русский، Türkçe، Indonesia، हिन्दी، বাংলা، اردو، فارسی، Tiếng Việt، ไทย، 日本語، 한국어، 中文. يختار لغة الجهاز تلقائيًا، ويمكن تغييرها من الشريط العلوي.
- **داكن وفاتح.** يتحدّث محرك التنزيل تلقائيًا.

## النشر على المتاجر

### Google Play — نسخة «نزّل مفتوح»
Google Play لا يقبل تطبيقات التنزيل من YouTube والمنصات التي تمنع شروطها التنزيل. لذلك يُبنى من نفس الكود إصداران:

| | `full` (GitHub) | `play` — «نزّل مفتوح» (Google Play) |
|---|---|---|
| الحزمة | `app.nazzil` | `app.nazzil.open` |
| المصادر | YouTube وكل المنصات | Internet Archive، Wikimedia Commons، PeerTube، البودكاست، الروابط المباشرة |
| تحديث المحرك | تلقائي من الإنترنت | عبر Google Play فقط (سياسة Play تمنع تنزيل كود قابل للتنفيذ) |

الحظر في النسخة `play` مفروض على ثلاث طبقات: في الواجهة، وفي كود Android الأصلي، وفي محرك yt-dlp نفسه (`--use-extractors`). واختبار آلي يضمن تطابق قائمة الحظر بين JavaScript وKotlin.

1. أنشئ مفتاح توقيع **مرة واحدة واحتفظ به**. فقدانه يعني أنك لن تستطيع تحديث التطبيق أبدًا:
   ```bash
   keytool -genkeypair -v -keystore nazzil-release.jks -alias nazzil -keyalg RSA -keysize 4096 -validity 10000
   base64 -w0 nazzil-release.jks   # انسخ الناتج
   ```
2. في المستودع: **Settings ← Secrets and variables ← Actions**، أضف:
   `NAZZIL_KEYSTORE_B64`، `NAZZIL_KEYSTORE_PASSWORD`، `NAZZIL_KEY_ALIAS` (مثلًا `nazzil`)، `NAZZIL_KEY_PASSWORD`.
3. من **Actions** حمّل `Nazzil-GooglePlay-Bundle`. فيه `NazzilOpen-play.aab` للرفع، و`NazzilOpen-test.apk` لتجربته على جوالك قبل الرفع.
4. النصوص، وملاحظات المراجِع، وأمان البيانات، والصور: [`store/play/`](store/play).

### Microsoft Store
1. أنشئ التطبيق في Partner Center، ثم انسخ من **Product identity**: Package/Identity Name وPublisher وPublisher display name.
2. أضفها كـ secrets: `MSSTORE_IDENTITY_NAME`، `MSSTORE_PUBLISHER`، `MSSTORE_PUBLISHER_NAME`.
3. سيُبنى ملف `Nazzil-Store.appx` في **Actions** (`Nazzil-MicrosoftStore`) لرفعه. المتجر يوقّعه بنفسه.

> ⚠️ راجع ملاحظة سياسات المتاجر بخصوص YouTube قبل الرفع.

### خارج Google Play: النسخة الكاملة
- **IzzyOnDroid** (متجر أندرويد مفتوح المصدر) و**winget** لويندوز و**موقع التحميل**: الخطوات ونص الطلب الجاهز في [`store/IZZYONDROID.md`](store/IZZYONDROID.md).
- صفحة التحميل في [`site/`](site) تُنشر تلقائيًا على GitHub Pages بعد تفعيلها (Settings ← Pages ← Source: GitHub Actions).

## الربح (والتطبيق مجاني بلا إعلانات)

| المصدر | أين | ماذا تفعل مرة واحدة |
|---|---|---|
| **GitHub Sponsors** | زر «ادعم على GitHub» في النسخة الكاملة وويندوز، وزر Sponsor في صفحة المستودع | فعّل حسابك: [github.com/sponsors](https://github.com/sponsors) (بلا عمولة) |
| **إكراميات Google Play** | نسخة «نزّل مفتوح»: قهوة / داعم / داعم ذهبي | أنشئ المنتجات الثلاثة كما في [`store/play/LISTING.md`](store/play/LISTING.md) |
| **Microsoft Store مدفوع** | نسخة ويندوز في المتجر | ضع سعرًا (مثلًا 2.99$) في Partner Center ← Pricing and availability |

البنفسجي (لون نزّل) والأخضر متاحان للجميع، وأربعة ألوان أخرى مكافأة للداعمين. كل مزايا التنزيل مجانية للجميع. يظهر تذكير لطيف بالدعم بعد التنزيل رقم 10 و60 و250 فقط، ولا يظهر للداعمين.
> الإعلانات غير ممكنة أصلًا: سياسة AdMob تمنع تطبيقات تنزيل محتوى YouTube، والإعلانات تُسقط ميزة «بلا إعلانات».

## الخصوصية والترخيص

- [سياسة الخصوصية](PRIVACY.md): لا يجمع نزّل أي بيانات.
- الترخيص: **GPL-3.0-or-later** ([LICENSE](LICENSE))، لأن التطبيق يضم مكتبات GPL (FFmpeg، youtubedl-android). التفاصيل في [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- نزّل فقط المحتوى الذي تملكه أو لديك إذن بتنزيله، والتزم بشروط كل منصة.

## البنية

```
web/       الواجهة المشتركة: index.html, style.css, app.js, i18n.js, lang/ (ترجمة لكل لغة)
           ytdlp.js (أوامر yt-dlp للمنصتين) · sites.js (المنصات وروابط الفيديو)
desktop/   Windows (Electron): خادم محلي على 127.0.0.1 + وضع الشبكة المحلية للجوال
android/   Android: WebView + youtubedl-android (yt-dlp وFFmpeg وQuickJS مضمّنة)
assets/    أيقونة التطبيق (SVG)
store/     أصول المتاجر: الأيقونة، الصورة الترويجية، لقطات الشاشة، النصوص
tests/     اختبارات آلية تعمل قبل كل بناء: node --test "tests/*.test.js"
```

## البناء محليًا

**Windows**
```powershell
cd desktop
Copy-Item -Recurse ..\web .\web; New-Item -ItemType Directory legal; Copy-Item ..\LICENSE legal\LICENSE.txt; Copy-Item ..\THIRD_PARTY_NOTICES.md legal\
npm install
npm run fetch-bin   # yt-dlp.exe و ffmpeg.exe و deno.exe
npm start           # للتجربة
npm run dist        # ملفات exe داخل dist\
```

**Android** (Android SDK وJDK 17 وGradle 8.11+)
```bash
cd android
gradle assembleRelease bundleRelease
```
