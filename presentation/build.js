/* SPMT Monitoring — generator PPT (Bahasa Indonesia)
 * Jalankan: node build.js
 * Screenshot UI otomatis terpasang bila filenya ada di ./screenshots/ (lihat SHOTS).
 */
const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");

const DIR = __dirname;
const ASSET = (p) => path.join(DIR, "..", "frontend", "public", "images", p);
const SHOT = (f) => path.join(DIR, "screenshots", f);

const LOGO = {
  spmt: ASSET("icons/spmt-icon.png"),
  pelindo: ASSET("logos/pelindo.png"),
  bumn: ASSET("logos/bumn.png"),
  akhlak: ASSET("logos/akhlak.png"),
};
const BG = {
  login: ASSET("background/login-bg-full.jpg"),
  dash: ASSET("background/dashboard-bg.jpg"),
};

// ---- Palet (maritim / port monitoring) ----
const C = {
  navy: "0A2A43", navy2: "0E3A5C", blue: "0E5A8A", teal: "1C7293",
  cyan: "1FA8D6", cyanHi: "38BDF8",
  light: "F4F8FB", card: "FFFFFF", ink: "0F172A", sub: "33506A",
  muted: "64748B", line: "E2E8F0", white: "FFFFFF",
  green: "10B981", amber: "F59E0B", red: "EF4444", redDark: "DC2626",
};

const FONT = "Calibri", MONO = "Courier New";
const PW = 13.333, PH = 7.5;
const shadow = () => ({ type: "outer", color: "0A2A43", blur: 9, offset: 3, angle: 90, opacity: 0.16 });

const pres = new pptxgen();
pres.defineLayout({ name: "W", width: PW, height: PH });
pres.layout = "W";
pres.author = "Lucky Siagian";
pres.company = "PT Pelindo Multi Terminal";
pres.title = "SPMT Monitoring — Sistem Monitoring Website";

const has = (f) => { try { return fs.existsSync(f); } catch { return false; } };

// page number + label (teks kecil, bukan bar)
function foot(slide, n, dark) {
  slide.addText(
    [{ text: "SPMT Monitoring Piket", options: { color: dark ? "9FC3DC" : C.muted } },
     { text: "   ·   " + String(n).padStart(2, "0"), options: { color: dark ? C.cyanHi : C.teal, bold: true } }],
    { x: PW - 3.6, y: PH - 0.42, w: 3.2, h: 0.3, align: "right", fontSize: 9, fontFace: FONT, margin: 0 }
  );
}
// judul slide konten
function head(slide, kicker, title) {
  slide.addText(kicker.toUpperCase(), { x: 0.6, y: 0.42, w: 12, h: 0.3, fontSize: 12, bold: true, color: C.cyan, charSpacing: 2, fontFace: FONT, margin: 0 });
  slide.addText(title, { x: 0.6, y: 0.72, w: 12.1, h: 0.7, fontSize: 30, bold: true, color: C.navy, fontFace: FONT, margin: 0 });
}
// kartu putih
function card(slide, x, y, w, h, fill) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.09, fill: { color: fill || C.card }, line: { color: C.line, width: 1 }, shadow: shadow() });
}
// lingkaran "ikon" dengan glyph
function dot(slide, x, y, d, color, glyph, gcolor) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color }, line: { type: "none" } });
  if (glyph) slide.addText(glyph, { x, y, w: d, h: d, align: "center", valign: "middle", fontSize: d * 22, bold: true, color: gcolor || C.white, fontFace: FONT, margin: 0 });
}
function shot(slide, file, x, y, w, h, label) {
  if (has(SHOT(file))) {
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x - 0.04, y: y - 0.04, w: w + 0.08, h: h + 0.08, rectRadius: 0.06, fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: shadow() });
    slide.addImage({ path: SHOT(file), x, y, w, h, sizing: { type: "contain", w, h } });
  } else {
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: "E8F1F8" }, line: { color: C.cyan, width: 1.5, dashType: "dash" } });
    dot(slide, x + w / 2 - 0.35, y + h / 2 - 0.62, 0.7, C.cyan, "+");
    slide.addText([
      { text: "Letakkan screenshot di sini\n", options: { bold: true, color: C.teal, fontSize: 13 } },
      { text: label + "\n", options: { color: C.sub, fontSize: 11 } },
      { text: "file: presentation/screenshots/" + file, options: { color: C.muted, fontSize: 9, italic: true } },
    ], { x: x + 0.2, y: y + h / 2 + 0.12, w: w - 0.4, h: 1.0, align: "center", valign: "top", fontFace: FONT, lineSpacingMultiple: 1.05 });
  }
}

/* ───────────────────────── 1. COVER ───────────────────────── */
{
  const s = pres.addSlide();
  if (has(BG.login)) s.background = { path: BG.login }; else s.background = { color: C.navy };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: PW, h: PH, fill: { color: C.navy, transparency: 14 }, line: { type: "none" } });
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 6.6, h: PH, fill: { color: C.navy, transparency: 38 }, line: { type: "none" } });

  // logo bar atas
  const logos = [LOGO.spmt, LOGO.pelindo, LOGO.bumn, LOGO.akhlak].filter(has);
  let lx = 0.6;
  logos.forEach((lp) => { s.addImage({ path: lp, x: lx, y: 0.5, w: 0.85, h: 0.85, sizing: { type: "contain", w: 0.85, h: 0.85 } }); lx += 1.05; });

  s.addText("KERJA PRAKTIK / MAGANG", { x: 0.6, y: 2.35, w: 8, h: 0.35, fontSize: 14, bold: true, color: C.cyanHi, charSpacing: 3, fontFace: FONT, margin: 0 });
  s.addText("SPMT Monitoring Piket", { x: 0.58, y: 2.74, w: 9.5, h: 1.0, fontSize: 50, bold: true, color: C.white, fontFace: FONT, margin: 0 });
  s.addText("Sistem Monitoring Ketersediaan Website & Layanan Secara Real-Time", { x: 0.6, y: 3.86, w: 8.2, h: 0.8, fontSize: 18, color: "DCEBF7", fontFace: FONT, margin: 0 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 4.9, w: 4.7, h: 0.55, rectRadius: 0.27, fill: { color: C.cyan, transparency: 8 }, line: { type: "none" } });
  s.addText("PT PELINDO MULTI TERMINAL  ·  IT SPMT", { x: 0.6, y: 4.9, w: 4.7, h: 0.55, align: "center", valign: "middle", fontSize: 12.5, bold: true, color: C.white, fontFace: FONT, margin: 0 });
  s.addText([
    { text: "Disusun oleh:  ", options: { color: "9FC3DC" } },
    { text: "Lucky Siagian", options: { color: C.white, bold: true } },
    { text: "   ·   Institut Teknologi Del", options: { color: "9FC3DC" } },
  ], { x: 0.6, y: 6.5, w: 9, h: 0.4, fontSize: 13, fontFace: FONT, margin: 0 });
  s.addNotes("Slide pembuka. Perkenalkan diri, asal kampus (IT Del), dan tempat magang (PT Pelindo Multi Terminal / IT SPMT). Sebutkan judul project: sistem monitoring website real-time.");
}

/* ───────────────────────── 2. AGENDA ───────────────────────── */
{
  const s = pres.addSlide(); s.background = { color: C.light };
  head(s, "Agenda", "Daftar Isi Presentasi");
  const items = [
    ["1", "Latar Belakang & Masalah", "Kenapa sistem ini dibutuhkan"],
    ["2", "Tujuan & Manfaat", "Sasaran yang ingin dicapai"],
    ["3", "Arsitektur & Teknologi", "Bagaimana sistem dibangun"],
    ["4", "Fitur Utama", "Apa saja yang bisa dilakukan"],
    ["5", "Cara Kerja & Kode", "Engine status & real-time"],
    ["6", "Hasil & Kesimpulan", "Dampak dan pembelajaran"],
  ];
  const cw = 3.92, ch = 1.75, gx = 0.3, gy = 0.35, x0 = 0.6, y0 = 1.75;
  items.forEach((it, i) => {
    const cx = x0 + (i % 3) * (cw + gx), cy = y0 + Math.floor(i / 3) * (ch + gy);
    card(s, cx, cy, cw, ch);
    dot(s, cx + 0.28, cy + 0.3, 0.62, C.navy, it[0], C.cyanHi);
    s.addText(it[1], { x: cx + 1.06, y: cy + 0.32, w: cw - 1.2, h: 0.55, fontSize: 15, bold: true, color: C.navy, fontFace: FONT, valign: "middle", margin: 0 });
    s.addText(it[2], { x: cx + 0.3, y: cy + 1.04, w: cw - 0.6, h: 0.55, fontSize: 11.5, color: C.muted, fontFace: FONT, margin: 0 });
  });
  foot(s, 2);
  s.addNotes("Beri gambaran alur presentasi: dari masalah, tujuan, cara membangun, fitur, cara kerja teknis, sampai hasil.");
}

/* ───────────────────────── 3. LATAR BELAKANG ───────────────────────── */
{
  const s = pres.addSlide(); s.background = { color: C.light };
  head(s, "Latar Belakang", "Masalah yang Ingin Diselesaikan");
  const probs = [
    ["!", "Pengecekan manual tidak efisien", "Puluhan website & layanan internal/publik Pelindo dicek satu per satu — lambat dan rawan terlewat."],
    ["?", "Gangguan terlambat diketahui", "Tim baru sadar website down setelah ada laporan pengguna, bukan dari sistem."],
    ["~", "Tidak ada visibilitas terpusat", "Status semua layanan tidak terlihat dalam satu layar yang ringkas dan real-time."],
    ["x", "Sulit menentukan akar masalah", "Saat ada gangguan, sulit tahu apakah masalah di DNS, jaringan, server, atau SSL."],
  ];
  let y = 1.78;
  probs.forEach((p) => {
    card(s, 0.6, y, 7.4, 1.18);
    dot(s, 0.85, y + 0.32, 0.54, C.redDark, p[0]);
    s.addText(p[1], { x: 1.6, y: y + 0.18, w: 6.2, h: 0.4, fontSize: 14.5, bold: true, color: C.navy, fontFace: FONT, margin: 0 });
    s.addText(p[2], { x: 1.6, y: y + 0.56, w: 6.25, h: 0.55, fontSize: 11.5, color: C.sub, fontFace: FONT, margin: 0 });
    y += 1.32;
  });
  // panel kanan: kutipan/insight
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 8.3, y: 1.78, w: 4.43, h: 5.0, rectRadius: 0.1, fill: { color: C.navy }, line: { type: "none" }, shadow: shadow() });
  s.addText("“", { x: 8.55, y: 1.85, w: 2, h: 1.2, fontSize: 80, bold: true, color: C.cyan, fontFace: "Cambria", margin: 0 });
  s.addText("Layanan yang tidak terpantau sama dengan masalah yang menunggu untuk meledak.", { x: 8.7, y: 3.0, w: 3.7, h: 1.8, fontSize: 18, bold: true, color: C.white, fontFace: FONT, lineSpacingMultiple: 1.1, margin: 0 });
  s.addText("Maka dibutuhkan satu sistem yang memantau otomatis, terus-menerus, dan memberi peringatan dini.", { x: 8.7, y: 4.95, w: 3.7, h: 1.5, fontSize: 12.5, color: "BFE0F2", fontFace: FONT, lineSpacingMultiple: 1.15, margin: 0 });
  foot(s, 3);
  s.addNotes("Tekankan: sebelum ada sistem ini, pemantauan manual & reaktif. Empat masalah utama inilah yang jadi dasar pembuatan SPMT Monitoring.");
}

/* ───────────────────────── 4. TUJUAN & MANFAAT ───────────────────────── */
{
  const s = pres.addSlide(); s.background = { color: C.light };
  head(s, "Tujuan", "Tujuan & Manfaat Sistem");
  const goals = [
    ["Pemantauan Otomatis", "Mengecek status semua website/layanan secara berkala tanpa campur tangan manual.", C.blue],
    ["Real-Time", "Status & metrik tampil langsung di dashboard tanpa perlu me-refresh halaman.", C.cyan],
    ["Deteksi Dini", "Memberi peringatan begitu ada layanan bermasalah, sebelum dikeluhkan pengguna.", C.green],
    ["Diagnostik Jelas", "Menjelaskan akar masalah (DNS, ping, HTTP, SSL) dalam bahasa yang mudah dipahami.", C.teal],
    ["Visibilitas Terpusat", "Seluruh layanan terlihat dalam satu peta jaringan & panel status.", C.navy2],
    ["Riwayat & SLA", "Menyimpan histori untuk evaluasi keandalan (uptime / SLA) tiap layanan.", C.amber],
  ];
  const cw = 3.92, ch = 2.28, gx = 0.3, gy = 0.32, x0 = 0.6, y0 = 1.7;
  goals.forEach((g, i) => {
    const cx = x0 + (i % 3) * (cw + gx), cy = y0 + Math.floor(i / 3) * (ch + gy);
    card(s, cx, cy, cw, ch);
    dot(s, cx + 0.3, cy + 0.32, 0.58, g[2], "✔");
    s.addText(g[0], { x: cx + 0.3, y: cy + 1.04, w: cw - 0.6, h: 0.4, fontSize: 15, bold: true, color: C.navy, fontFace: FONT, margin: 0 });
    s.addText(g[1], { x: cx + 0.3, y: cy + 1.42, w: cw - 0.55, h: 0.78, fontSize: 11, color: C.sub, fontFace: FONT, lineSpacingMultiple: 1.05, margin: 0 });
  });
  foot(s, 4);
  s.addNotes("Enam tujuan utama. Kaitkan tiap tujuan dengan masalah di slide sebelumnya: otomatis & deteksi dini menjawab masalah pengecekan manual & gangguan terlambat.");
}

/* ───────────────────────── 5. RINGKASAN SOLUSI ───────────────────────── */
{
  const s = pres.addSlide(); s.background = { color: C.navy };
  s.addText("SOLUSI", { x: 0.6, y: 0.5, w: 8, h: 0.3, fontSize: 12, bold: true, color: C.cyanHi, charSpacing: 3, fontFace: FONT, margin: 0 });
  s.addText("Apa yang Dibangun?", { x: 0.6, y: 0.82, w: 12, h: 0.7, fontSize: 30, bold: true, color: C.white, fontFace: FONT, margin: 0 });
  s.addText("Sebuah aplikasi web yang memantau ketersediaan puluhan website & layanan Pelindo secara terus-menerus, menampilkannya sebagai peta jaringan real-time, dan memberi peringatan otomatis saat terjadi gangguan.",
    { x: 0.6, y: 1.62, w: 12.1, h: 0.95, fontSize: 16, color: "CFE6F5", fontFace: FONT, lineSpacingMultiple: 1.15, margin: 0 });
  const stats = [
    ["67+", "Node Dipantau", C.cyanHi],
    ["4", "Tingkat Status", C.green],
    ["Real-time", "via WebSocket", C.amber],
    ["24/7", "Pemantauan", C.cyan],
  ];
  const cw = 2.95, gx = 0.27, x0 = 0.6, y0 = 2.95, ch = 2.1;
  stats.forEach((st, i) => {
    const cx = x0 + i * (cw + gx);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cx, y: y0, w: cw, h: ch, rectRadius: 0.1, fill: { color: C.navy2 }, line: { color: "1B4straggler".slice(0, 0) + "16456A", width: 1 } });
    s.addText(st[0], { x: cx, y: y0 + 0.4, w: cw, h: 0.95, align: "center", fontSize: 40, bold: true, color: st[2], fontFace: FONT, margin: 0 });
    s.addText(st[1], { x: cx, y: y0 + 1.4, w: cw, h: 0.5, align: "center", fontSize: 13, color: "CFE6F5", fontFace: FONT, margin: 0 });
  });
  s.addText("Dibangun dengan Go (backend) + React (frontend) + PostgreSQL — ringan, cepat, dan dapat dijalankan di lingkungan internal Pelindo.",
    { x: 0.6, y: 5.35, w: 12.1, h: 0.6, fontSize: 13, italic: true, color: "9FC3DC", fontFace: FONT, margin: 0 });
  foot(s, 5, true);
  s.addNotes("Slide gambaran besar. Empat angka kunci: 67+ node, 4 tingkat status, real-time, 24/7. Sebutkan tumpukan teknologi singkat di bawah.");
}

/* ───────────────────────── 6. TECH STACK ───────────────────────── */
{
  const s = pres.addSlide(); s.background = { color: C.light };
  head(s, "Teknologi", "Tumpukan Teknologi (Tech Stack)");
  const groups = [
    ["BACKEND", C.blue, [["Go (Golang)", "Bahasa utama server — cepat & efisien untuk banyak proses paralel"], ["Worker Pool", "Banyak pekerja mengecek website secara bersamaan"], ["REST + WebSocket", "API data + saluran real-time ke browser"]]],
    ["FRONTEND", C.cyan, [["React + Vite", "Antarmuka dashboard yang interaktif & cepat"], ["Canvas / SVG", "Peta topologi jaringan yang animatif"], ["i18n (multi-bahasa)", "Mendukung beberapa bahasa antarmuka"]]],
    ["DATA & INFRA", C.teal, [["PostgreSQL", "Penyimpanan log, insiden, riwayat status"], ["Probe Jaringan", "DNS, ICMP ping, HTTP, cek sertifikat SSL"], ["Notifikasi", "Peringatan otomatis & manajemen insiden"]]],
  ];
  const cw = 3.92, gx = 0.3, x0 = 0.6, y0 = 1.7, ch = 4.95;
  groups.forEach((g, i) => {
    const cx = x0 + i * (cw + gx);
    card(s, cx, y0, cw, ch);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cx, y: y0, w: cw, h: 0.66, rectRadius: 0.09, fill: { color: g[1] }, line: { type: "none" } });
    s.addShape(pres.shapes.RECTANGLE, { x: cx, y: y0 + 0.33, w: cw, h: 0.33, fill: { color: g[1] }, line: { type: "none" } });
    s.addText(g[0], { x: cx, y: y0, w: cw, h: 0.66, align: "center", valign: "middle", fontSize: 15, bold: true, color: C.white, charSpacing: 2, fontFace: FONT, margin: 0 });
    let yy = y0 + 0.92;
    g[2].forEach((it) => {
      dot(s, cx + 0.28, yy + 0.06, 0.26, g[1], "");
      s.addText(it[0], { x: cx + 0.68, y: yy - 0.06, w: cw - 0.95, h: 0.35, fontSize: 13, bold: true, color: C.navy, fontFace: FONT, margin: 0 });
      s.addText(it[1], { x: cx + 0.68, y: yy + 0.3, w: cw - 0.95, h: 0.78, fontSize: 10.5, color: C.sub, fontFace: FONT, lineSpacingMultiple: 1.03, margin: 0 });
      yy += 1.28;
    });
  });
  foot(s, 6);
  s.addNotes("Jelaskan pembagian: backend Go (cepat, paralel), frontend React (interaktif), data PostgreSQL. Probe jaringan adalah inti pengecekan: DNS, ping, HTTP, SSL.");
}

/* ───────────────────────── 7. ARSITEKTUR ───────────────────────── */
{
  const s = pres.addSlide(); s.background = { color: C.light };
  head(s, "Arsitektur", "Arsitektur Sistem & Alur Data");
  const box = (x, y, w, h, fill, title, sub, tcol) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: C.line, width: 1 }, shadow: shadow() });
    s.addText(title, { x: x + 0.1, y: y + 0.14, w: w - 0.2, h: 0.4, align: "center", fontSize: 13.5, bold: true, color: tcol || C.navy, fontFace: FONT, margin: 0 });
    if (sub) s.addText(sub, { x: x + 0.12, y: y + 0.52, w: w - 0.24, h: h - 0.6, align: "center", fontSize: 9.5, color: tcol ? "CFE6F5" : C.muted, fontFace: FONT, lineSpacingMultiple: 1.02, margin: 0 });
  };
  const arrow = (x, y, w, h, lbl) => {
    s.addShape(pres.shapes.LINE, { x, y, w, h, line: { color: C.teal, width: 2.25, endArrowType: "triangle", beginArrowType: "triangle" } });
    if (lbl) s.addText(lbl, { x: x - 0.2, y: y - 0.42, w: Math.max(w, 1.2) + 0.4, h: 0.3, align: "center", fontSize: 9, bold: true, color: C.teal, fontFace: FONT, margin: 0 });
  };
  // kiri: browser
  box(0.6, 2.5, 2.7, 1.6, C.white, "Pengguna", "Dashboard React\n(browser)", C.navy);
  // tengah: backend
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 4.6, y: 1.85, w: 4.55, h: 3.9, rectRadius: 0.1, fill: { color: C.navy }, line: { type: "none" }, shadow: shadow() });
  s.addText("BACKEND  (Go)", { x: 4.6, y: 2.0, w: 4.55, h: 0.4, align: "center", fontSize: 13, bold: true, color: C.cyanHi, charSpacing: 1, fontFace: FONT, margin: 0 });
  box(4.85, 2.5, 2.0, 1.15, C.navy2, "REST API", "Data & histori", C.white);
  box(6.95, 2.5, 2.0, 1.15, C.navy2, "WebSocket Hub", "Push real-time", C.white);
  box(4.85, 3.85, 2.0, 1.15, C.navy2, "Worker Pool", "Pengecek paralel", C.white);
  box(6.95, 3.85, 2.0, 1.15, C.navy2, "Inference Engine", "Tentukan status", C.white);
  // kanan: targets + db
  box(10.45, 1.95, 2.45, 1.5, C.white, "Target Website", "67+ situs &\nlayanan Pelindo", C.navy);
  box(10.45, 4.2, 2.45, 1.5, C.white, "PostgreSQL", "Log, insiden,\nriwayat status", C.navy);
  // panah
  arrow(3.3, 3.1, 1.3, 0, "REST + WS");
  arrow(9.15, 2.6, 1.3, 0, "probe");
  arrow(9.15, 4.5, 1.3, 0, "simpan");
  s.addText("Worker Pool mengecek tiap target (DNS → Ping → HTTP → SSL), Engine menentukan status, lalu Hub mengirimkannya ke dashboard secara langsung.",
    { x: 0.6, y: 6.15, w: 12.1, h: 0.7, fontSize: 12.5, italic: true, color: C.sub, align: "center", fontFace: FONT, margin: 0 });
  foot(s, 7);
  s.addNotes("Telusuri alur kiri-ke-kanan: browser minta data via REST & berlangganan WebSocket. Worker pool mem-probe target, engine memutuskan status, hub broadcast ke browser, semua disimpan ke PostgreSQL.");
}

/* ───────────────────────── 8. FITUR UTAMA ───────────────────────── */
{
  const s = pres.addSlide(); s.background = { color: C.light };
  head(s, "Fitur", "Fitur-Fitur Utama");
  const feats = [
    ["Peta Topologi Jaringan", "Visualisasi semua node sebagai jaringan animatif (mode Star / Tree / 3D).", C.blue],
    ["Status Real-Time", "Online / Warning / Critical / Offline diperbarui langsung tanpa refresh.", C.green],
    ["Detail Diagnostik", "Rincian DNS, ping, HTTP, response time, TTFB, dan SSL per website.", C.teal],
    ["Notifikasi & Insiden", "Peringatan otomatis + pencatatan insiden saat layanan bermasalah.", C.amber],
    ["Monitor Server & Jaringan", "Pantau CPU, RAM, throughput, dan kondisi jaringan node pemantau.", C.cyan],
    ["Riwayat & SLA", "Grafik histori status dan perhitungan uptime untuk evaluasi keandalan.", C.navy2],
  ];
  const cw = 3.92, ch = 2.28, gx = 0.3, gy = 0.32, x0 = 0.6, y0 = 1.7;
  feats.forEach((f, i) => {
    const cx = x0 + (i % 3) * (cw + gx), cy = y0 + Math.floor(i / 3) * (ch + gy);
    card(s, cx, cy, cw, ch);
    dot(s, cx + 0.3, cy + 0.3, 0.6, f[2], "◉");
    s.addText(f[0], { x: cx + 0.3, y: cy + 1.04, w: cw - 0.55, h: 0.45, fontSize: 14.5, bold: true, color: C.navy, fontFace: FONT, margin: 0 });
    s.addText(f[1], { x: cx + 0.3, y: cy + 1.46, w: cw - 0.55, h: 0.74, fontSize: 11, color: C.sub, fontFace: FONT, lineSpacingMultiple: 1.05, margin: 0 });
  });
  foot(s, 8);
  s.addNotes("Enam fitur unggulan. Di tiga slide berikutnya kita tunjukkan tampilan aslinya (screenshot).");
}

/* ───────────────────────── 9-11. SCREENSHOT ───────────────────────── */
function shotSlide(n, kicker, title, file, label, points) {
  const s = pres.addSlide(); s.background = { color: C.light };
  head(s, kicker, title);
  shot(s, file, 0.6, 1.72, 7.7, 5.05, label);
  card(s, 8.55, 1.72, 4.18, 5.05);
  s.addText("Yang Ditampilkan", { x: 8.8, y: 1.98, w: 3.7, h: 0.4, fontSize: 14, bold: true, color: C.teal, fontFace: FONT, margin: 0 });
  let yy = 2.55;
  points.forEach((p) => {
    dot(s, 8.82, yy + 0.04, 0.2, C.cyan, "");
    s.addText([{ text: p[0] + "  ", options: { bold: true, color: C.navy } }, { text: p[1], options: { color: C.sub } }],
      { x: 9.18, y: yy - 0.08, w: 3.4, h: 0.7, fontSize: 11, fontFace: FONT, lineSpacingMultiple: 1.04, margin: 0, valign: "top" });
    yy += 0.84;
  });
  foot(s, n);
  return s;
}
shotSlide(9, "Tampilan · 1", "Dashboard & Peta Topologi", "02-dashboard-topology.png",
  "Tampilan utama: peta jaringan + ringkasan status",
  [["Ringkasan", "jumlah Online / Critical / Offline, SLA, dan rata-rata response time."],
   ["Peta node", "67 situs mengelilingi server SPMT, warna = status."],
   ["Live feed", "daftar node memperbarui status secara langsung."],
   ["Mode tampilan", "Star, Tree, dan 3D untuk eksplorasi."]]
).addNotes("Tunjukkan layar utama. Jelaskan kartu ringkasan di atas, peta node di tengah, dan live feed di kanan yang update real-time.");

shotSlide(10, "Tampilan · 2", "Detail Diagnostik Website", "03-website-detail.png",
  "Modal detail: kondisi lengkap satu website",
  [["Service Health", "status, HTTP code, response time, TTFB."],
   ["Connectivity", "ICMP ping, status & waktu DNS, alamat IP."],
   ["Security", "validitas SSL & masa berlaku sertifikat."],
   ["Penjelasan", "kesimpulan otomatis dalam bahasa awam."]]
).addNotes("Buka detail satu situs (mis. yang OFFLINE). Tunjukkan rincian berlapis: DNS, ping, HTTP, SSL — plus narasi otomatis yang menjelaskan akar masalah.");

shotSlide(11, "Tampilan · 3", "Monitor Server & Jaringan", "04-server-monitor.png",
  "Kesehatan node pemantau itu sendiri",
  [["Resource", "CPU, RAM, worker aktif, goroutine, koneksi WS."],
   ["Jaringan", "tipe koneksi, IP, gateway, DNS resolver."],
   ["Throughput", "kecepatan unduh/unggah node pemantau."],
   ["Analisis", "rekomendasi otomatis bila ada anomali."]]
).addNotes("Ini memantau 'si pemantau' sendiri. Penting: kalau jaringan node pemantau lemah, sistem tahu dan tidak asal menuduh target down.");

/* ───────────────────────── 12. ENGINE STATUS ───────────────────────── */
{
  const s = pres.addSlide(); s.background = { color: C.light };
  head(s, "Cara Kerja", "Engine Klasifikasi Status");
  s.addText("Setiap pengecekan diputuskan bertingkat: DNS → koneksi → kode HTTP → kecepatan respons.",
    { x: 0.6, y: 1.52, w: 12, h: 0.4, fontSize: 13, color: C.sub, fontFace: FONT, margin: 0 });
  const rows = [
    [C.green, "ONLINE", "Sehat", "DNS sukses + HTTP 200–399 + respons ≤ 2 detik", "100"],
    [C.amber, "WARNING", "Perlu perhatian", "Respons lambat ( > 2 detik ) atau HTTP 4xx (mis. 404)", "55–70"],
    [C.red, "CRITICAL", "Gangguan server", "HTTP 5xx (500/502/504) atau 403 Forbidden", "20"],
    [C.redDark, "OFFLINE", "Terputus", "DNS gagal, timeout, koneksi ditolak / reset", "0"],
  ];
  let y = 2.1;
  rows.forEach((r) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y, w: 9.4, h: 1.0, rectRadius: 0.08, fill: { color: C.card }, line: { color: C.line, width: 1 }, shadow: shadow() });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y, w: 0.16, h: 1.0, rectRadius: 0.05, fill: { color: r[0] }, line: { type: "none" } });
    dot(s, 0.95, y + 0.27, 0.46, r[0], "");
    s.addText(r[1], { x: 1.6, y: y + 0.13, w: 2.3, h: 0.4, fontSize: 16, bold: true, color: r[0], fontFace: FONT, margin: 0 });
    s.addText(r[2], { x: 1.6, y: y + 0.55, w: 2.3, h: 0.35, fontSize: 10.5, color: C.muted, fontFace: FONT, margin: 0 });
    s.addText(r[3], { x: 4.0, y, w: 5.0, h: 1.0, valign: "middle", fontSize: 12, color: C.sub, fontFace: FONT, lineSpacingMultiple: 1.05, margin: 0 });
    s.addText([{ text: "skor\n", options: { fontSize: 8.5, color: C.muted } }, { text: r[4], options: { fontSize: 15, bold: true, color: C.navy } }],
      { x: 9.0, y, w: 0.9, h: 1.0, align: "center", valign: "middle", fontFace: FONT, margin: 0 });
    y += 1.12;
  });
  // panel anti false-alarm
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 10.25, y: 2.1, w: 2.48, h: 4.48, rectRadius: 0.1, fill: { color: C.navy }, line: { type: "none" }, shadow: shadow() });
  dot(s, 11.2, 2.4, 0.6, C.cyan, "3×");
  s.addText("Anti False-Alarm", { x: 10.4, y: 3.15, w: 2.2, h: 0.4, align: "center", fontSize: 13, bold: true, color: C.white, fontFace: FONT, margin: 0 });
  s.addText("Status harus gagal 3× berturut-turut sebelum dilaporkan OFFLINE — supaya kedipan jaringan sesaat tidak memicu alarm palsu.",
    { x: 10.4, y: 3.6, w: 2.2, h: 2.8, align: "center", fontSize: 11, color: "CFE6F5", fontFace: FONT, lineSpacingMultiple: 1.12, margin: 0 });
  foot(s, 12);
  s.addNotes("Inti logika sistem. Empat tingkat status dengan aturan & ambang batas jelas (>2 detik = WARNING, mengikuti '2-second rule'). Respons lambat tidak pernah jadi OFFLINE. Sorot mekanisme anti false-alarm: 3x konfirmasi sebelum OFFLINE.");
}

/* ───────────────────────── 13. KODE: classifyStatus ───────────────────────── */
function codeSlide(n, kicker, title, codeLines, lang, notes, explain) {
  const s = pres.addSlide(); s.background = { color: C.light };
  head(s, kicker, title);
  const cx = 0.6, cy = 1.72, cw = 7.7, ch = 5.05;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cx, y: cy, w: cw, h: ch, rectRadius: 0.08, fill: { color: "0B2740" }, line: { type: "none" }, shadow: shadow() });
  dot(s, cx + 0.28, cy + 0.28, 0.18, "FF5F56"); dot(s, cx + 0.54, cy + 0.28, 0.18, "FFBD2E"); dot(s, cx + 0.8, cy + 0.28, 0.18, "27C93F");
  s.addText(lang, { x: cx + 0.2, y: cy + 0.14, w: cw - 0.4, h: 0.4, align: "right", fontSize: 10, italic: true, color: "7FA8C4", fontFace: MONO, margin: 0 });
  s.addText(codeLines.map((ln, i) => ({
    text: ln.t + (i < codeLines.length - 1 ? "\n" : ""),
    options: { color: ln.c || "D6E6F2", bold: !!ln.b },
  })), { x: cx + 0.32, y: cy + 0.66, w: cw - 0.6, h: ch - 0.85, fontSize: 12.5, fontFace: MONO, lineSpacingMultiple: 1.16, valign: "top", margin: 0 });
  // penjelasan kanan
  card(s, 8.55, 1.72, 4.18, 5.05);
  s.addText("Penjelasan", { x: 8.8, y: 1.98, w: 3.7, h: 0.4, fontSize: 14, bold: true, color: C.teal, fontFace: FONT, margin: 0 });
  let yy = 2.55;
  explain.forEach((p) => {
    dot(s, 8.82, yy + 0.05, 0.2, C.cyan, "");
    s.addText([{ text: p[0] + " ", options: { bold: true, color: C.navy } }, { text: p[1], options: { color: C.sub } }],
      { x: 9.18, y: yy - 0.07, w: 3.4, h: 0.85, fontSize: 11, fontFace: FONT, lineSpacingMultiple: 1.05, valign: "top", margin: 0 });
    yy += 0.92;
  });
  foot(s, n);
  s.addNotes(notes);
}
codeSlide(13, "Kode · 1", "Logika Penentu Status (Go)",
  [
    { t: "func classifyStatus(l *MonitoringLog) (Status, int) {", b: true },
    { t: "    if !l.DNSResolved {" },
    { t: "        return OFFLINE, 0      // domain tak ditemukan", c: "8FB7CF" },
    { t: "    }" },
    { t: "    if l.ErrorMessage != \"\" {  // timeout / refused", c: "8FB7CF" },
    { t: "        return OFFLINE, 0" },
    { t: "    }" },
    { t: "    switch {" },
    { t: "    case l.StatusCode >= 500:" },
    { t: "        return CRITICAL, 20    // server error 5xx", c: "F4B6B6" },
    { t: "    case l.StatusCode >= 400:" },
    { t: "        return WARNING, 60     // client error 4xx", c: "F6D69A" },
    { t: "    case l.ResponseTimeMs > 2000:" },
    { t: "        return WARNING, 70     // lambat ( > 2 dtk )", c: "F6D69A" },
    { t: "    default:" },
    { t: "        return ONLINE, 100     // sehat", c: "A7E3C5" },
    { t: "    }" },
    { t: "}" },
  ], "pool.go  ·  Go",
  "Tunjukkan bahwa keputusan status itu deterministik & berlapis (gate). Mudah diaudit dan diuji. Ambang 2000 ms = batas lambat (2-second rule).",
  [["Berlapis:", "DNS dulu, lalu error koneksi, lalu kode HTTP, terakhir kecepatan."],
   ["Deterministik:", "input sama → hasil sama, gampang diuji otomatis."],
   ["> 2000 ms", "= WARNING: situs hidup tapi lambat, bukan langsung OFFLINE."],
   ["Skor", "0–100 dipakai untuk health & visual."]]
);

/* ───────────────────────── 14. KODE: REAL-TIME ───────────────────────── */
codeSlide(14, "Kode · 2", "Update Real-Time (WebSocket)",
  [
    { t: "// BACKEND (Go) — siarkan perubahan ke semua klien", c: "7FA8C4", b: true },
    { t: "p.hub.Broadcast(\"monitor_update\", payload)" },
    { t: "" },
    { t: "" },
    { t: "// FRONTEND (React) — terima tanpa refresh halaman", c: "7FA8C4", b: true },
    { t: "useGlobalWebSocket((msg) => {" },
    { t: "  if (msg.type === \"monitor_update\") {" },
    { t: "    updateNode(msg.payload)   // UI langsung", c: "A7E3C5" },
    { t: "  }" },
    { t: "})" },
    { t: "" },
    { t: "// Satu koneksi WS dibagi ke seluruh komponen", c: "8FB7CF" },
    { t: "// → indikator LIVE menyala saat socket terbuka", c: "8FB7CF" },
  ], "hub.go + WebSocketContext.jsx",
  "Inti 'real-time': backend mem-broadcast lewat WebSocket Hub, frontend berlangganan satu koneksi global dan langsung memperbarui UI. Tidak ada polling/refresh manual.",
  [["Broadcast", "backend kirim 1 pesan ke semua browser sekaligus."],
   ["Berlangganan", "frontend update node tanpa reload."],
   ["1 koneksi", "dibagi ke semua komponen — hemat & konsisten."],
   ["Hasil", "dashboard terasa hidup & selalu mutakhir."]]
);

/* ───────────────────────── 15. STUDI KASUS FALSE ALARM ───────────────────────── */
{
  const s = pres.addSlide(); s.background = { color: C.light };
  head(s, "Studi Kasus", "Menangani Alarm Palsu (False Alarm)");
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 1.66, w: 12.13, h: 1.16, rectRadius: 0.08, fill: { color: "FDECEC" }, line: { color: C.red, width: 1 } });
  dot(s, 0.86, y0f(1.66), 0.6, C.redDark, "!");
  s.addText([{ text: "Masalah:  ", options: { bold: true, color: C.redDark } },
    { text: "beberapa situs (mis. Piket Direksi) muncul OFFLINE padahal sebenarnya hidup — servernya hanya lambat membuka koneksi, melebihi batas waktu pengecekan. Browser sabar menunggu, sistem tidak.", options: { color: C.sub } }],
    { x: 1.65, y: 1.82, w: 10.85, h: 0.85, fontSize: 12.5, fontFace: FONT, valign: "middle", lineSpacingMultiple: 1.05, margin: 0 });
  const sol = [
    ["Timeout dinaikkan", "Batas tunggu koneksi 10 → 20 detik, agar situs lambat-tapi-hidup sempat menjawab dan dinilai WARNING, bukan OFFLINE.", C.blue],
    ["Konfirmasi 3×", "Status baru dilaporkan OFFLINE setelah gagal 3 kali berturut-turut — kedipan sesaat tidak memicu alarm.", C.teal],
    ["Rem notifikasi pintar", "Jika koneksi internet node pemantau sendiri yang putus, alarm OFFLINE ditahan — karena verdict-nya tak bisa dipercaya.", C.green],
  ];
  const cw = 3.92, gx = 0.3, x0 = 0.6, y0 = 3.15, ch = 3.2;
  sol.forEach((p, i) => {
    const cx = x0 + i * (cw + gx);
    card(s, cx, y0, cw, ch);
    dot(s, cx + 0.3, y0 + 0.32, 0.62, p[2], String(i + 1), C.white);
    s.addText(p[0], { x: cx + 0.3, y: y0 + 1.08, w: cw - 0.55, h: 0.5, fontSize: 15, bold: true, color: C.navy, fontFace: FONT, margin: 0 });
    s.addText(p[1], { x: cx + 0.3, y: y0 + 1.56, w: cw - 0.55, h: 1.5, fontSize: 11.5, color: C.sub, fontFace: FONT, lineSpacingMultiple: 1.1, margin: 0 });
  });
  s.addText("Hasil: alarm jadi lebih akurat & terpercaya — mengurangi gangguan notifikasi yang menyesatkan.",
    { x: 0.6, y: 6.5, w: 12.1, h: 0.4, fontSize: 12.5, italic: true, bold: true, color: C.teal, align: "center", fontFace: FONT, margin: 0 });
  foot(s, 15);
  s.addNotes("Cerita rekayasa nyata yang menunjukkan kedalaman analisis. Masalah: situs lambat dicap mati. Tiga solusi berlapis. Ini nilai jual presentasi di depan tim teknis.");
}
function y0f() { return 1.66 + 0.28; }

/* ───────────────────────── 16. HASIL & KESIMPULAN ───────────────────────── */
{
  const s = pres.addSlide(); s.background = { color: C.light };
  head(s, "Hasil", "Hasil & Kesimpulan");
  // chart distribusi
  card(s, 0.6, 1.72, 5.0, 5.05);
  s.addText("Contoh Distribusi Status", { x: 0.85, y: 1.95, w: 4.5, h: 0.4, fontSize: 13, bold: true, color: C.navy, fontFace: FONT, margin: 0 });
  s.addChart(pres.charts.DOUGHNUT, [{ name: "Status", labels: ["Online", "Warning", "Offline"], values: [66, 0, 1] }], {
    x: 0.7, y: 2.4, w: 4.8, h: 4.0, holeSize: 58, chartColors: [C.green, C.amber, C.redDark],
    showLegend: true, legendPos: "b", legendColor: C.sub, legendFontSize: 11,
    dataLabelColor: C.white, dataLabelFontSize: 12, showValue: true,
  });
  // ringkasan capaian
  card(s, 5.9, 1.72, 6.83, 5.05);
  s.addText("Yang Dicapai", { x: 6.2, y: 1.98, w: 6, h: 0.4, fontSize: 15, bold: true, color: C.teal, fontFace: FONT, margin: 0 });
  const pts = [
    ["Pemantauan terpusat & otomatis", "puluhan layanan terlihat dalam satu dashboard real-time."],
    ["Deteksi dini gangguan", "status & insiden tercatat begitu masalah terjadi."],
    ["Diagnostik yang mudah dipahami", "akar masalah dijelaskan dalam bahasa awam."],
    ["Alarm lebih akurat", "mekanisme anti false-alarm mengurangi peringatan palsu."],
    ["Riwayat untuk evaluasi", "histori & SLA membantu menilai keandalan layanan."],
  ];
  let yy = 2.55;
  pts.forEach((p) => {
    dot(s, 6.22, yy + 0.04, 0.28, C.green, "✔");
    s.addText([{ text: p[0] + " — ", options: { bold: true, color: C.navy } }, { text: p[1], options: { color: C.sub } }],
      { x: 6.66, y: yy - 0.06, w: 5.85, h: 0.66, fontSize: 12.5, fontFace: FONT, lineSpacingMultiple: 1.05, valign: "top", margin: 0 });
    yy += 0.85;
  });
  foot(s, 16);
  s.addNotes("Tutup dengan capaian konkret. Doughnut chart sekadar contoh distribusi (66 online, 1 offline). Tegaskan manfaat bagi Pelindo: visibilitas, deteksi dini, keandalan.");
}

/* ───────────────────────── 17. PENUTUP ───────────────────────── */
{
  const s = pres.addSlide();
  if (has(BG.dash)) s.background = { path: BG.dash }; else s.background = { color: C.navy };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: PW, h: PH, fill: { color: C.navy, transparency: 12 }, line: { type: "none" } });
  const logos = [LOGO.spmt, LOGO.pelindo, LOGO.bumn].filter(has);
  let lx = (PW - logos.length * 1.05) / 2;
  logos.forEach((lp) => { s.addImage({ path: lp, x: lx, y: 1.45, w: 0.9, h: 0.9, sizing: { type: "contain", w: 0.9, h: 0.9 } }); lx += 1.05; });
  s.addText("Terima Kasih", { x: 0, y: 2.75, w: PW, h: 1.0, align: "center", fontSize: 48, bold: true, color: C.white, fontFace: FONT, margin: 0 });
  s.addText("SPMT Monitoring Piket  ·  PT Pelindo Multi Terminal", { x: 0, y: 3.85, w: PW, h: 0.45, align: "center", fontSize: 16, color: "CFE6F5", fontFace: FONT, margin: 0 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: PW / 2 - 2.6, y: 4.7, w: 5.2, h: 0.62, rectRadius: 0.31, fill: { color: C.cyan, transparency: 10 }, line: { type: "none" } });
  s.addText("Sesi Tanya Jawab", { x: PW / 2 - 2.6, y: 4.7, w: 5.2, h: 0.62, align: "center", valign: "middle", fontSize: 15, bold: true, color: C.white, fontFace: FONT, margin: 0 });
  s.addText("Lucky Siagian  ·  Institut Teknologi Del", { x: 0, y: 6.4, w: PW, h: 0.4, align: "center", fontSize: 13, color: "9FC3DC", fontFace: FONT, margin: 0 });
  s.addNotes("Penutup. Ucapkan terima kasih, buka sesi tanya jawab. Siapkan jawaban untuk: kenapa Go? bagaimana real-time bekerja? bagaimana menghindari alarm palsu?");
}

const OUT = path.join(DIR, "SPMT-Monitoring-Piket.pptx");
pres.writeFile({ fileName: OUT }).then(() => console.log("OK: " + OUT));
