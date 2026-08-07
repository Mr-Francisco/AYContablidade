/* SGD — leitor leve de folhas de cálculo no browser (sem dependências).
 * AY.readSpreadsheet(file|ArrayBuffer) -> Promise<{ rows: string[][], sheetName }>
 * Suporta .xlsx (unzip via DecompressionStream 'deflate-raw' + parse do XML) e .csv.
 * Uso típico: importar exportações do Primavera (Plano de Contas, Diários, etc.). */
(function (global) {
  "use strict";
  const AY = global.AY || (global.AY = {});

  function bufToText(buf) { return new TextDecoder("utf-8").decode(buf); }

  // ---- CSV ----
  function parseCSV(text) {
    // deteta separador: ; (comum em pt) ou ,
    const firstLine = text.slice(0, text.indexOf("\n") >= 0 ? text.indexOf("\n") : text.length);
    const sep = (firstLine.split(";").length > firstLine.split(",").length) ? ";" : ",";
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else {
        if (c === '"') q = true;
        else if (c === sep) { row.push(cur); cur = ""; }
        else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
        else if (c === "\r") { /* ignora */ }
        else cur += c;
      }
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim() !== ""));
  }

  // ---- ZIP (central directory) ----
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") throw new Error("O browser não suporta descompressão (DecompressionStream). Guarda o ficheiro como CSV.");
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unzip(buf) {
    const dv = new DataView(buf); const u8 = new Uint8Array(buf);
    // localizar End Of Central Directory (assinatura 0x06054b50), a partir do fim
    let eocd = -1;
    for (let i = u8.length - 22; i >= 0; i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error("Ficheiro .xlsx inválido (sem EOCD).");
    const cdCount = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let n = 0; n < cdCount; n++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true);
      const compSize = dv.getUint32(off + 20, true);
      const nameLen = dv.getUint16(off + 28, true);
      const extraLen = dv.getUint16(off + 30, true);
      const commentLen = dv.getUint16(off + 32, true);
      const localOff = dv.getUint32(off + 42, true);
      const name = bufToText(u8.slice(off + 46, off + 46 + nameLen));
      // cabeçalho local para localizar os dados
      const lNameLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const comp = u8.slice(dataStart, dataStart + compSize);
      files[name] = { method, comp };
      off += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }
  async function fileText(files, name) {
    const f = files[name]; if (!f) return null;
    const bytes = f.method === 0 ? f.comp : await inflateRaw(f.comp);
    return bufToText(bytes);
  }

  function colToNum(col) { let n = 0; for (let i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64); return n - 1; }

  async function parseXlsx(buf) {
    const files = await unzip(buf);
    // sharedStrings
    const strings = [];
    const ssXml = await fileText(files, "xl/sharedStrings.xml");
    if (ssXml) {
      const re = /<si>([\s\S]*?)<\/si>/g; let m;
      while ((m = re.exec(ssXml))) {
        const parts = []; const rt = /<t[^>]*>([\s\S]*?)<\/t>/g; let t;
        while ((t = rt.exec(m[1]))) parts.push(t[1]);
        strings.push(unescapeXml(parts.join("")));
      }
    }
    // encontra a primeira folha
    let sheetName = "xl/worksheets/sheet1.xml";
    if (!files[sheetName]) { const k = Object.keys(files).find(x => /^xl\/worksheets\/.*\.xml$/.test(x)); if (k) sheetName = k; }
    const sheetXml = await fileText(files, sheetName);
    if (!sheetXml) throw new Error("Sem folha de dados no .xlsx.");
    const rowsMap = {};
    const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*)>(?:<v>([\s\S]*?)<\/v>|<is>([\s\S]*?)<\/is>)?/g; let cm;
    while ((cm = cellRe.exec(sheetXml))) {
      const col = colToNum(cm[1]), row = +cm[2], attrs = cm[3] || "", v = cm[4], is = cm[5];
      let val = "";
      const tMatch = /t="([^"]*)"/.exec(attrs); const t = tMatch ? tMatch[1] : "";
      if (is !== undefined) { const it = /<t[^>]*>([\s\S]*?)<\/t>/.exec(is); val = it ? unescapeXml(it[1]) : ""; }
      else if (v !== undefined) { if (t === "s") val = strings[+v] || ""; else val = unescapeXml(v); }
      (rowsMap[row] = rowsMap[row] || {})[col] = val;
    }
    const rowNums = Object.keys(rowsMap).map(Number).sort((a, b) => a - b);
    const rows = rowNums.map(rn => { const o = rowsMap[rn]; const max = Math.max(-1, ...Object.keys(o).map(Number)); const arr = []; for (let c = 0; c <= max; c++) arr.push(o[c] !== undefined ? o[c] : ""); return arr; });
    return { rows: rows.filter(r => r.some(x => String(x).trim() !== "")), sheetName };
  }
  function unescapeXml(s) { return String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)); }

  async function readSpreadsheet(input, filename) {
    let buf, name = filename || (input && input.name) || "";
    if (input instanceof ArrayBuffer) buf = input;
    else if (input && input.arrayBuffer) { buf = await input.arrayBuffer(); name = input.name || name; }
    else throw new Error("Entrada inválida.");
    const isCsv = /\.csv$/i.test(name) || /\.txt$/i.test(name);
    if (isCsv) return { rows: parseCSV(bufToText(new Uint8Array(buf))), sheetName: "csv" };
    // xlsx começa por "PK"
    const u8 = new Uint8Array(buf);
    if (u8[0] === 0x50 && u8[1] === 0x4b) return parseXlsx(buf);
    // fallback: tentar CSV
    return { rows: parseCSV(bufToText(u8)), sheetName: "texto" };
  }

  AY.readSpreadsheet = readSpreadsheet;
})(window);
