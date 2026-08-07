/* SGD — preenchedor de modelos .xlsx oficiais (ex.: Mapa de Remunerações A2.1 da AGT).
 * Ao contrário de gerar um ficheiro novo do zero, isto abre o MODELO REAL fornecido pelo utilizador,
 * escreve os valores nas células indicadas preservando todo o resto (estilos, listas pendentes,
 * folha "Auxiliar", folha de instruções) e reconstrói o .xlsx — para garantir que o resultado é
 * aceite tal e qual pelo sistema a que se destina (ex.: upload na AGT).
 * API: AY.xlsxFill(templateUrl, { sheet: "sheet1", cells: {"A5": "valor", "F5": 250000, ...} })
 *      -> Promise<Blob> (o .xlsx pronto a descarregar) */
(function (global) {
  "use strict";
  const AY = global.AY || (global.AY = {});

  function bufToText(buf) { return new TextDecoder("utf-8").decode(buf); }
  function textToBuf(s) { return new TextEncoder().encode(s); }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") throw new Error("O browser não suporta descompressão (DecompressionStream).");
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // Lê o .zip mantendo, para cada entrada, os BYTES COMPRIMIDOS originais + método + CRC32 + tamanhos —
  // assim só é preciso descomprimir/alterar a folha que vamos editar; as restantes são copiadas tal-e-qual.
  function unzipRaw(buf) {
    const dv = new DataView(buf); const u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= 0; i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error("Ficheiro .xlsx inválido (sem EOCD).");
    const cdCount = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    const files = {}; const order = [];
    for (let n = 0; n < cdCount; n++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true);
      const crc32 = dv.getUint32(off + 16, true);
      const compSize = dv.getUint32(off + 20, true);
      const uncompSize = dv.getUint32(off + 24, true);
      const nameLen = dv.getUint16(off + 28, true);
      const extraLen = dv.getUint16(off + 30, true);
      const commentLen = dv.getUint16(off + 32, true);
      const localOff = dv.getUint32(off + 42, true);
      const name = bufToText(u8.slice(off + 46, off + 46 + nameLen));
      const lNameLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const comp = u8.slice(dataStart, dataStart + compSize);
      files[name] = { method, crc32, compSize, uncompSize, comp };
      order.push(name);
      off += 46 + nameLen + extraLen + commentLen;
    }
    return { files, order };
  }

  // ---- CRC32 (necessário para gravar a folha alterada) ----
  let crcTable = null;
  function makeCrcTable() {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  }
  function crc32(bytes) {
    if (!crcTable) crcTable = makeCrcTable();
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function escapeXml(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // Substitui/insere o valor de células específicas no XML da folha, preservando o atributo de
  // estilo (s="NN") de cada célula do modelo — é o que mantém bordas/formatos/listas pendentes.
  function fillSheetXml(xml, cells) {
    Object.keys(cells).forEach(ref => {
      let value = cells[ref];
      if (value == null || value === "") value = "";
      const isNum = typeof value === "number" && isFinite(value);
      // célula já existente (com ou sem conteúdo) — captura o atributo de estilo original
      const reFull = new RegExp('<c r="' + ref + '"([^>]*?)(?:/>|>[\\s\\S]*?</c>)');
      const m = reFull.exec(xml);
      let styleAttr = "";
      if (m) { const sMatch = /\ss="(\d+)"/.exec(m[1]); if (sMatch) styleAttr = ' s="' + sMatch[1] + '"'; }
      let newCell;
      if (value === "") newCell = '<c r="' + ref + '"' + styleAttr + '/>';
      else if (isNum) newCell = '<c r="' + ref + '"' + styleAttr + '><v>' + value + '</v></c>';
      else newCell = '<c r="' + ref + '"' + styleAttr + ' t="inlineStr"><is><t xml:space="preserve">' + escapeXml(value) + '</t></is></c>';
      if (m) xml = xml.slice(0, m.index) + newCell + xml.slice(m.index + m[0].length);
      else throw new Error("Célula " + ref + " não existe no modelo (fora do intervalo previsto).");
    });
    return xml;
  }

  // ---- Escrita do ZIP (reconstrói a partir das entradas originais + a folha alterada) ----
  function u16(n) { return [n & 0xFF, (n >> 8) & 0xFF]; }
  function u32(n) { return [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF]; }
  function dosDateTime() {
    const d = new Date();
    const time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((d.getSeconds() >> 1) & 0x1F);
    const date = (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0xF) << 5) | (d.getDate() & 0x1F);
    return { time, date };
  }
  function buildZip(order, files) {
    const { time, date } = dosDateTime();
    const chunks = []; const centralChunks = []; let offset = 0;
    order.forEach(name => {
      const f = files[name];
      const nameBytes = textToBuf(name);
      const local = new Uint8Array([
        0x50, 0x4B, 0x03, 0x04, 20, 0, 0, 0,
        ...u16(f.method), ...u16(time), ...u16(date),
        ...u32(f.crc32), ...u32(f.compSize), ...u32(f.uncompSize),
        ...u16(nameBytes.length), ...u16(0),
      ]);
      chunks.push(local, nameBytes, f.comp);
      const central = new Uint8Array([
        0x50, 0x4B, 0x01, 0x02, 20, 0, 20, 0, 0, 0,
        ...u16(f.method), ...u16(time), ...u16(date),
        ...u32(f.crc32), ...u32(f.compSize), ...u32(f.uncompSize),
        ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
        ...u32(offset),
      ]);
      centralChunks.push(central, nameBytes);
      offset += local.length + nameBytes.length + f.comp.length;
    });
    const cdStart = offset;
    let cdSize = 0; centralChunks.forEach(c => cdSize += c.length);
    const eocd = new Uint8Array([
      0x50, 0x4B, 0x05, 0x06, 0, 0, 0, 0,
      ...u16(order.length), ...u16(order.length),
      ...u32(cdSize), ...u32(cdStart), ...u16(0),
    ]);
    return new Blob([...chunks, ...centralChunks, eocd], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  // ---- API pública ----
  // opts: { sheet: "sheet1" (ficheiro dentro de xl/worksheets/), cells: {"A5": valor, ...} }
  async function xlsxFill(templateUrl, opts) {
    const res = await fetch(templateUrl);
    if (!res.ok) throw new Error("Não foi possível carregar o modelo (" + templateUrl + ").");
    const buf = await res.arrayBuffer();
    const { files, order } = unzipRaw(buf);
    const sheetPath = "xl/worksheets/" + (opts.sheet || "sheet1") + ".xml";
    const f = files[sheetPath];
    if (!f) throw new Error("Folha " + sheetPath + " não encontrada no modelo.");
    const original = f.method === 0 ? f.comp : await inflateRaw(f.comp);
    let xml = bufToText(original);
    xml = fillSheetXml(xml, opts.cells || {});
    const newBytes = textToBuf(xml);
    files[sheetPath] = { method: 0, crc32: crc32(newBytes), compSize: newBytes.length, uncompSize: newBytes.length, comp: newBytes };
    return buildZip(order, files);
  }

  AY.xlsxFill = xlsxFill;
})(window);
