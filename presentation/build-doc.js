/* SPMT Monitoring — generator DOCX dari DOCUMENTATION.md (tanpa dependensi npm).
 * Node menulis bagian-bagian OOXML ke folder sementara; proses zip dilakukan
 * terpisah oleh .NET ZipFile (lihat package.json "build:doc" / README presentation).
 *
 * Jalankan:  node build-doc.js   →  menulis ../.docx-build/  (lalu di-zip jadi ../DOCUMENTATION.docx)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "DOCUMENTATION.md");
const OUT = path.join(__dirname, ".docx-build");

const md = fs.readFileSync(SRC, "utf8").replace(/\r\n/g, "\n");
const lines = md.split("\n");

// ---- helper XML escaping ----
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// inline: **bold**, *italic*, `code`  → array of runs
function inlineRuns(text) {
  const runs = [];
  // tokenizer for `code`, **bold**, *italic*
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0,
    m;
  const push = (t, opts) => {
    if (t === "") return;
    runs.push({ t, ...opts });
  };
  while ((m = re.exec(text)) !== null) {
    push(text.slice(last, m.index), {});
    const tok = m[0];
    if (tok.startsWith("`")) push(tok.slice(1, -1), { code: true });
    else if (tok.startsWith("**")) push(tok.slice(2, -2), { bold: true });
    else push(tok.slice(1, -1), { italic: true });
    last = re.lastIndex;
  }
  push(text.slice(last), {});
  return runs.length ? runs : [{ t: text }];
}

function runXml(r) {
  const props = [];
  if (r.bold) props.push("<w:b/>");
  if (r.italic) props.push("<w:i/>");
  if (r.code)
    props.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:color w:val="9C2D2D"/>');
  const rPr = props.length ? `<w:rPr>${props.join("")}</w:rPr>` : "";
  return `<w:r>${rPr}<w:t xml:space="preserve">${esc(r.t)}</w:t></w:r>`;
}

function para(text, style) {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  const runs = inlineRuns(text).map(runXml).join("");
  return `<w:p>${pPr}${runs}</w:p>`;
}

function listItem(text, ordered) {
  const numId = ordered ? 2 : 1;
  const runs = inlineRuns(text).map(runXml).join("");
  return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>${runs}</w:p>`;
}

function codeBlock(textLines) {
  // one shaded paragraph, monospace, line breaks preserved
  const inner = textLines
    .map((l, i) => (i ? "<w:br/>" : "") + `<w:t xml:space="preserve">${esc(l)}</w:t>`)
    .join("");
  return `<w:p><w:pPr><w:pStyle w:val="Code"/><w:shd w:val="clear" w:fill="F3F4F6"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr>${inner}</w:r></w:p>`;
}

function tableXml(rows) {
  // rows: array of array of cell-text; first row is header
  const cols = rows[0].length;
  const width = Math.floor(9000 / cols);
  const grid = `<w:tblGrid>${Array(cols).fill(`<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>`;
  const border = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="BDC3C7"/><w:left w:val="single" w:sz="4" w:color="BDC3C7"/><w:bottom w:val="single" w:sz="4" w:color="BDC3C7"/><w:right w:val="single" w:sz="4" w:color="BDC3C7"/><w:insideH w:val="single" w:sz="4" w:color="BDC3C7"/><w:insideV w:val="single" w:sz="4" w:color="BDC3C7"/></w:tblBorders>';
  const tblPr = `<w:tblPr><w:tblW w:w="9000" w:type="dxa"/>${border}</w:tblPr>`;
  const rowXml = rows
    .map((cells, ri) => {
      const tcs = cells
        .map((c) => {
          const shade = ri === 0 ? '<w:shd w:val="clear" w:fill="F3F4F6"/>' : "";
          const runs = inlineRuns(c).map((r) => runXml(ri === 0 ? { ...r, bold: true } : r)).join("");
          return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shade}</w:tcPr><w:p>${runs}</w:p></w:tc>`;
        })
        .join("");
      return `<w:tr>${tcs}</w:tr>`;
    })
    .join("");
  return `<w:tbl>${tblPr}${grid}${rowXml}</w:tbl><w:p/>`;
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

// ---- main parse loop ----
const body = [];
let i = 0;
while (i < lines.length) {
  let line = lines[i];
  const t = line.trim();

  if (t === "") { i++; continue; }

  // code fence
  if (t.startsWith("```")) {
    const buf = [];
    i++;
    while (i < lines.length && !lines[i].trim().startsWith("```")) { buf.push(lines[i]); i++; }
    i++; // skip closing fence
    body.push(codeBlock(buf));
    continue;
  }

  // headings
  if (t.startsWith("### ")) { body.push(para(t.slice(4), "Heading3")); i++; continue; }
  if (t.startsWith("## ")) { body.push(para(t.slice(3), "Heading2")); i++; continue; }
  if (t.startsWith("# ")) { body.push(para(t.slice(2), "Title")); i++; continue; }

  // horizontal rule → skip
  if (/^---+$/.test(t)) { i++; continue; }

  // blockquote
  if (t.startsWith(">")) {
    const buf = [];
    while (i < lines.length && lines[i].trim().startsWith(">")) {
      buf.push(lines[i].trim().replace(/^>\s?/, ""));
      i++;
    }
    body.push(para(buf.join(" "), "Quote"));
    continue;
  }

  // table
  if (t.startsWith("|")) {
    const rows = [];
    while (i < lines.length && lines[i].trim().startsWith("|")) {
      const cells = splitRow(lines[i]);
      // skip separator row (|---|:--:|)
      if (!cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, "")))) rows.push(cells);
      i++;
    }
    if (rows.length) body.push(tableXml(rows));
    continue;
  }

  // ordered list
  if (/^\d+\.\s/.test(t)) {
    while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
      body.push(listItem(lines[i].trim().replace(/^\d+\.\s/, ""), true));
      i++;
    }
    continue;
  }

  // unordered list
  if (/^[-*]\s/.test(t)) {
    while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
      body.push(listItem(lines[i].trim().replace(/^[-*]\s/, ""), false));
      i++;
    }
    continue;
  }

  // paragraph
  body.push(para(t));
  i++;
}

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${body.join("\n")}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>
</w:body></w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="1E3A8A"/><w:sz w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="240" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="2563EB"/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:spacing w:before="160" w:after="60"/></w:pPr><w:rPr><w:b/><w:color w:val="1E40AF"/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:pPr><w:ind w:left="540"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:pPr><w:ind w:left="360"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="2563EB"/></w:pBdr><w:spacing w:before="60" w:after="60"/></w:pPr><w:rPr><w:i/><w:color w:val="334155"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr></w:style>
</w:styles>`;

const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:pPr><w:ind w:left="540" w:hanging="270"/></w:pPr></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:pPr><w:ind w:left="540" w:hanging="270"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

// ---- write parts ----
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "_rels"), { recursive: true });
fs.mkdirSync(path.join(OUT, "word", "_rels"), { recursive: true });
fs.writeFileSync(path.join(OUT, "[Content_Types].xml"), contentTypes);
fs.writeFileSync(path.join(OUT, "_rels", ".rels"), rels);
fs.writeFileSync(path.join(OUT, "word", "document.xml"), documentXml);
fs.writeFileSync(path.join(OUT, "word", "styles.xml"), stylesXml);
fs.writeFileSync(path.join(OUT, "word", "numbering.xml"), numberingXml);
fs.writeFileSync(path.join(OUT, "word", "_rels", "document.xml.rels"), docRels);

console.log("OK: OOXML parts written to " + OUT);
console.log("Blocks: " + body.length);

// ---- zip parts into a .docx via .NET ZipFile (no npm deps) ----
const { spawnSync } = require("child_process");
const target = path.join(ROOT, "DOCUMENTATION.docx");
const fallback = path.join(ROOT, "DOCUMENTATION-baru.docx");

// OOXML parts in the order Word expects, with spec-compliant forward-slash names.
const PARTS = [
  "[Content_Types].xml",
  "_rels/.rels",
  "word/document.xml",
  "word/styles.xml",
  "word/numbering.xml",
  "word/_rels/document.xml.rels",
];

function zipTo(dest) {
  const entries = PARTS.map(
    (p) => `@{ Name='${p}'; Path='${path.join(OUT, p).replace(/\\/g, "\\\\")}' }`
  ).join(",");
  const ps = `
$dst='${dest.replace(/\\/g, "\\\\")}';
if (Test-Path $dst) { Remove-Item $dst -Force -ErrorAction Stop }
Add-Type -AssemblyName System.IO.Compression;
Add-Type -AssemblyName System.IO.Compression.FileSystem;
$zip=[System.IO.Compression.ZipFile]::Open($dst,'Create');
foreach ($e in @(${entries})) {
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$e.Path,$e.Name,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
}
$zip.Dispose();
Write-Output ('OK ' + (Get-Item $dst).Length)`;
  const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8" });
  return r.status === 0 && /OK \d+/.test(r.stdout);
}

let dest = target;
if (!zipTo(target)) {
  console.warn("WARN: '" + target + "' terkunci (mungkin sedang dibuka di Word). Menulis ke nama alternatif.");
  if (!zipTo(fallback)) {
    console.error("ERROR: gagal membuat .docx. Tutup file di Word lalu jalankan ulang.");
    process.exit(1);
  }
  dest = fallback;
}
fs.rmSync(OUT, { recursive: true, force: true }); // bersihkan folder sementara (hemat ruang)
console.log("DOCX: " + dest);
