# Google Play — «نزّل مفتوح» / Nazzil Open

Upload **`NazzilOpen-play.aab`** (GitHub Actions → artifact `Nazzil-GooglePlay-Bundle`). Package: `app.nazzil.open`.
Do **not** upload the full edition (`app.nazzil`) to Google Play.

## Names
- App name: **نزّل مفتوح — أفلام وصوتيات حرّة** · _Nazzil Open — Free Media Saver_
- Category: Video Players & Editors · Tags: Public domain, Podcasts, Open media

## Short description (≤80)
- AR: احفظ الأفلام والصوتيات الحرّة والملكية العامة والبودكاست على جهازك.
- EN: Save public-domain films, free-licensed media and podcasts to your device.

## Full description (AR)
نزّل مفتوح يحفظ على جهازك الوسائط التي يسمح أصحابها بتنزيلها.

• Internet Archive: أفلام كلاسيكية، ومحاضرات، وتسجيلات موسيقية في الملكية العامة.
• Wikimedia Commons: فيديو وصوت بتراخيص حرّة.
• PeerTube: منصات فيديو مفتوحة يديرها أصحابها.
• البودكاست والروابط المباشرة لملفات الصوت والفيديو.

المزايا: MP3 وM4A وMP4 وWEBM، ومعاينة قبل التنزيل، وتنزيلات متزامنة مع إيقاف واستئناف تستمر في الخلفية، وقص جزء من المقطع، واختيار صورة غلاف الصوت (صورة المقطع، أو لقطة من الفيديو، أو صورة من جهازك)، وعربي وإنجليزي، ووضع داكن وفاتح.

بلا حسابات ولا إعلانات ولا تتبّع. كل المعالجة على جهازك.

## Full description (EN)
Nazzil Open saves media whose owners allow it to be downloaded.

• Internet Archive: classic films, lectures and recordings in the public domain.
• Wikimedia Commons: freely licensed video and audio.
• PeerTube: open, independently run video platforms.
• Podcasts and direct links to audio and video files.

Features: MP3, M4A, MP4 and WEBM; preview before downloading; a parallel queue with pause/resume that keeps going in the background; trimming; choose the audio cover (thumbnail, a frame from the video, or your own image); Arabic and English; dark and light themes.

No accounts, no ads, no tracking — everything runs on your device.

> Do not mention YouTube, Facebook, Instagram, TikTok or other platforms anywhere in the listing, screenshots, or keywords.

## Notes for the reviewer (Play Console → App content → "App access" / review notes)
Nazzil Open only downloads from sources whose terms or licenses permit downloading: Internet Archive, Wikimedia Commons, PeerTube instances, podcast feeds and direct media file links. Links to platforms that do not permit downloading (e.g. YouTube, Facebook, Instagram, TikTok, X) are rejected before any network request is made, and the download engine is restricted to the extractors for the supported sources. The app does not download or update executable code at runtime; updates are delivered only through Google Play. No login is required to test: open the app, tap the Internet Archive button, open any film page and tap “Download with Nazzil”.

## Data safety
- Data collected: **None**. Data shared: **None**. No account, no analytics, no ads SDK.
- Network: the sources the user chooses. Files and history stay on the device.

## Foreground service declaration (dataSync)
Continues downloads the user started (and converts/saves them) after the user leaves the app, with an ongoing progress notification; the service stops when the queue is empty.

## Content rating
No violence, sexual content, gambling or user-to-user communication. The in-app browser can open the supported sources' websites → answer "Yes" to unrestricted web access if asked.

## Assets (this folder)
- `icon-512.png` (512×512) · `feature-graphic.png` (1024×500) · `screenshots/` (1080×1920)
- Privacy policy: `PRIVACY.md` at the repo root (needs a public URL).
