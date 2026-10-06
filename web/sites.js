// Platforms offered by "Browse": where to open, and which page URLs count as something downloadable.
// The `match` pattern is passed to the in-app browser (Windows preload / Android BrowseActivity),
// so this file is the single source of truth for both platforms.
(function (root) {
  "use strict";
  const SITES = [
    { id: "youtube", name: "YouTube", url: "https://www.youtube.com/", mobileUrl: "https://m.youtube.com/", color: "#ff0033", icon: "▶",
      match: "(youtube\\.com/(watch|shorts/|playlist|live/)|youtu\\.be/)" },
    { id: "facebook", name: "Facebook", url: "https://www.facebook.com/watch/", mobileUrl: "https://m.facebook.com/watch/", color: "#1877f2", icon: "f",
      match: "(facebook\\.com/(.+/videos/|watch/?\\?v=|reel/|share/[vr]/|.+/posts/)|fb\\.watch/)" },
    { id: "tiktok", name: "TikTok", url: "https://www.tiktok.com/", color: "#111111", icon: "♪",
      match: "(tiktok\\.com/(@[^/]+/(video|photo)/\\d+|v/\\d+|t/)|vm\\.tiktok\\.com/|vt\\.tiktok\\.com/)" },
    { id: "instagram", name: "Instagram", url: "https://www.instagram.com/", color: "#d62976", icon: "◎",
      match: "instagram\\.com/(reel|reels|p|tv)/[\\w-]+" },
    { id: "x", name: "X", url: "https://x.com/", color: "#000000", icon: "𝕏",
      match: "(x|twitter)\\.com/[^/]+/status/\\d+" },
    { id: "soundcloud", name: "SoundCloud", url: "https://soundcloud.com/", color: "#ff5500", icon: "☁",
      match: "soundcloud\\.com/(?!(discover|stream|search|you|upload|charts|pages|settings|messages|notifications|people)(/|$))[^/?#]+/(?!(tracks|albums|sets$|reposts|likes|followers|following|popular-tracks)(/|$|\\?))[^/?#]+" },
    { id: "vimeo", name: "Vimeo", url: "https://vimeo.com/watch", color: "#1ab7ea", icon: "v",
      match: "vimeo\\.com/(\\d+|.+/video/\\d+|showcase/\\d+)" },
    { id: "twitch", name: "Twitch", url: "https://www.twitch.tv/", color: "#9146ff", icon: "◆",
      match: "(twitch\\.tv/(videos/\\d+|[^/]+/clip/)|clips\\.twitch\\.tv/)" },
    { id: "dailymotion", name: "Dailymotion", url: "https://www.dailymotion.com/", color: "#0d0d0d", icon: "d",
      match: "(dailymotion\\.com/video/|dai\\.ly/)" },
    { id: "reddit", name: "Reddit", url: "https://www.reddit.com/", color: "#ff4500", icon: "●",
      match: "reddit\\.com/r/[^/]+/comments/" },
  ];
  const api = { SITES, byId: id => SITES.find(s => s.id === id) };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NzSites = api;
})(typeof self !== "undefined" ? self : this);
