# Third-party software in Nazzil

Nazzil is licensed under the **GNU General Public License v3.0 or later** (see `LICENSE`).
Its source code is available at https://github.com/abdulrahmanahmedelabed-prog/nazzil.
It bundles or uses the following software:

| Component | Used in | License | Source |
|---|---|---|---|
| yt-dlp | Windows, Android | The Unlicense | https://github.com/yt-dlp/yt-dlp |
| FFmpeg (BtbN "gpl" build) | Windows | GPL-3.0-or-later | https://github.com/BtbN/FFmpeg-Builds (build scripts) · https://ffmpeg.org (source) |
| youtubedl-android (library, ffmpeg) | Android | GPL-3.0 | https://github.com/JunkFood02/youtubedl-android |
| FFmpeg, Python, QuickJS (bundled by youtubedl-android) | Android | GPL / PSF / MIT | see youtubedl-android |
| Deno | Windows | MIT | https://github.com/denoland/deno |
| Electron | Windows | MIT | https://github.com/electron/electron |
| node-qrcode | Windows | MIT | https://github.com/soldair/node-qrcode |
| AndroidX (AppCompat, WebKit, Core) | Android | Apache-2.0 | https://developer.android.com/jetpack/androidx |
| SponsorBlock API (optional, online) | Windows, Android | CC BY-NC-SA 4.0 (data) | https://sponsor.ajay.app |

FFmpeg's own license text is shipped next to the binary as `FFMPEG-LICENSE.txt` in the Windows app's `resources/bin` folder.
The exact FFmpeg source for a given build can be obtained from https://ffmpeg.org or by opening an issue in Nazzil's repository.
