// Text the main process shows outside the web UI (notifications, the in-app browser's button),
// in the language picked in the app. [download complete, download failed, download with Nazzil]
const TEXT = {
  ar: ["اكتمل التنزيل", "فشل التنزيل", "⬇ تنزيل بـ نزّل"],
  en: ["Download complete", "Download failed", "⬇ Download with Nazzil"],
  es: ["Descarga completada", "Error en la descarga", "⬇ Descargar con Nazzil"],
  pt: ["Download concluído", "Falha no download", "⬇ Baixar com o Nazzil"],
  fr: ["Téléchargement terminé", "Échec du téléchargement", "⬇ Télécharger avec Nazzil"],
  de: ["Download abgeschlossen", "Download fehlgeschlagen", "⬇ Mit Nazzil herunterladen"],
  it: ["Download completato", "Download non riuscito", "⬇ Scarica con Nazzil"],
  ru: ["Загрузка завершена", "Ошибка загрузки", "⬇ Скачать через Nazzil"],
  tr: ["İndirme tamamlandı", "İndirme başarısız", "⬇ Nazzil ile indir"],
  id: ["Unduhan selesai", "Unduhan gagal", "⬇ Unduh dengan Nazzil"],
  hi: ["डाउनलोड पूरा हुआ", "डाउनलोड विफल", "⬇ Nazzil से डाउनलोड करें"],
  bn: ["ডাউনলোড সম্পন্ন", "ডাউনলোড ব্যর্থ", "⬇ Nazzil দিয়ে ডাউনলোড করুন"],
  ur: ["ڈاؤن لوڈ مکمل", "ڈاؤن لوڈ ناکام", "⬇ Nazzil سے ڈاؤن لوڈ کریں"],
  fa: ["دانلود کامل شد", "دانلود ناموفق بود", "⬇ دانلود با Nazzil"],
  vi: ["Đã tải xong", "Tải xuống thất bại", "⬇ Tải bằng Nazzil"],
  th: ["ดาวน์โหลดเสร็จแล้ว", "ดาวน์โหลดล้มเหลว", "⬇ ดาวน์โหลดด้วย Nazzil"],
  ja: ["ダウンロード完了", "ダウンロード失敗", "⬇ Nazzilでダウンロード"],
  ko: ["다운로드 완료", "다운로드 실패", "⬇ Nazzil로 다운로드"],
  zh: ["下载完成", "下载失败", "⬇ 用 Nazzil 下载"],
};
const text = lang => TEXT[lang] || TEXT[String(lang || "").split("-")[0]] || TEXT.en;
module.exports = { TEXT, text };
