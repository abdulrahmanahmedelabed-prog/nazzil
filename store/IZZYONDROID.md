# Publishing the full edition outside Google Play

## IzzyOnDroid (recommended for Android)
IzzyOnDroid is an F-Droid-compatible repository that lists open-source apps straight from their GitHub releases
(Seal and other yt-dlp front-ends are distributed there). Users add the repo in F-Droid, Droid-ify or Neo Store.

**Before requesting:** the repository must be **public** and the latest GitHub release must contain the APKs.

**Request:** open a new issue at https://gitlab.com/IzzyOnDroid/repo/-/issues with this text:

> **App:** Nazzil (`app.nazzil`)
> **Source:** https://github.com/abdulrahmanahmedelabed-prog/nazzil (GPL-3.0-or-later)
> **APKs:** GitHub Releases — per-ABI APKs (`Nazzil-arm64-v8a.apk`, `Nazzil-armeabi-v7a.apk`, `Nazzil-x86_64.apk`) and `Nazzil-universal.apk`. Happy to provide whichever you prefer; the arm64 build is ~35 MB because it bundles Python, FFmpeg and QuickJS (via youtubedl-android).
> **Metadata:** Fastlane structure in `fastlane/metadata/android` (ar, en-US).
> **Description:** Video/audio downloader and converter using yt-dlp and FFmpeg; no ads, no trackers, no accounts.
> **Anti-features to note:** downloads content from non-free network services (NonFreeNet); the yt-dlp engine updates itself at runtime from GitHub.
> **Signing:** release builds are signed with the developer's key (stable across updates).

Notes:
- Configure the release signing key (README → Google Play, step 1) **before** submitting, so every future APK carries the same signature. Changing the key later breaks updates for existing users.
- Izzy normally accepts APKs up to ~30 MB; mention the size in the request (done above).

## Your own website
The `site/` folder is a ready download page. One-time setup: repository **Settings → Pages → Source: GitHub Actions**.
It will be published at `https://abdulrahmanahmedelabed-prog.github.io/nazzil/` and lists both editions.
Do not link to the full edition from inside the Google Play app.

## Windows
- GitHub Releases (already automatic) and the website.
- **winget** (Windows Package Manager): submit a manifest to https://github.com/microsoft/winget-pkgs pointing at
  `https://github.com/abdulrahmanahmedelabed-prog/nazzil/releases/download/vX.Y.Z/Nazzil-Setup.exe`
  (use the versioned URL, not `latest`). The `wingetcreate` tool generates it:
  `wingetcreate new https://github.com/abdulrahmanahmedelabed-prog/nazzil/releases/download/v4.7.0/Nazzil-Setup.exe`
