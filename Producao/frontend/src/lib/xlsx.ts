/**
 * Preenchedor de modelos `.xlsx` oficiais — transposto de
 * `Piloto/assets/js/xlsx-writer.js`.
 *
 * NÃO gera uma folha nova: abre o MODELO REAL da AGT, escreve os valores nas
 * células indicadas preservando tudo o resto — estilos, listas pendentes, a
 * folha «Auxiliar», as instruções — e reconstrói o `.xlsx`. É essa a diferença
 * entre um ficheiro que a AGT aceita e um que se parece com o dela.
 *
 * Sem bibliotecas: o modelo é um `.zip` e só uma entrada muda. As outras são
 * copiadas byte a byte, comprimidas como estavam; a folha alterada volta a
 * entrar sem compressão (`method: 0`), que é válido e poupa o `deflate`.
 */

const paraTexto = (b: Uint8Array | ArrayBuffer) =>
  new TextDecoder("utf-8").decode(b as Uint8Array);
const paraBytes = (s: string) => new TextEncoder().encode(s);

interface Entrada {
  method: number;
  crc32: number;
  compSize: number;
  uncompSize: number;
  comp: Uint8Array;
}

async function descomprimir(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "O browser não suporta descompressão (DecompressionStream).",
    );
  }
  const fluxo = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

/**
 * Lê o `.zip` guardando, por entrada, os BYTES COMPRIMIDOS originais.
 * Só se descomprime a folha que vai ser editada.
 */
function abrirZip(buf: ArrayBuffer): {
  ficheiros: Record<string, Entrada>;
  ordem: string[];
} {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Ficheiro .xlsx inválido (sem EOCD).");

  const nEntradas = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const ficheiros: Record<string, Entrada> = {};
  const ordem: string[] = [];

  for (let n = 0; n < nEntradas; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const crc32 = dv.getUint32(off + 16, true);
    const compSize = dv.getUint32(off + 20, true);
    const uncompSize = dv.getUint32(off + 24, true);
    const nomeLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const comentarioLen = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    const nome = paraTexto(u8.slice(off + 46, off + 46 + nomeLen));
    const lNomeLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const inicio = localOff + 30 + lNomeLen + lExtraLen;
    ficheiros[nome] = {
      method,
      crc32,
      compSize,
      uncompSize,
      comp: u8.slice(inicio, inicio + compSize),
    };
    ordem.push(nome);
    off += 46 + nomeLen + extraLen + comentarioLen;
  }
  return { ficheiros, ordem };
}

let tabelaCrc: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!tabelaCrc) {
    tabelaCrc = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabelaCrc[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = tabelaCrc[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const escaparXml = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Escreve as células no XML da folha, PRESERVANDO o atributo de estilo
 * (`s="NN"`) de cada uma — é o que mantém as bordas, os formatos e as listas
 * pendentes do modelo.
 */
function preencherFolha(
  xml: string,
  celulas: Record<string, string | number>,
): string {
  for (const ref of Object.keys(celulas)) {
    let valor: string | number = celulas[ref];
    if (valor == null || valor === "") valor = "";
    const numero = typeof valor === "number" && Number.isFinite(valor);

    const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
    const m = re.exec(xml);
    if (!m) {
      throw new Error(
        `Célula ${ref} não existe no modelo (fora do intervalo previsto).`,
      );
    }
    const estilo = /\ss="(\d+)"/.exec(m[1]);
    const attr = estilo ? ` s="${estilo[1]}"` : "";

    const nova =
      valor === ""
        ? `<c r="${ref}"${attr}/>`
        : numero
          ? `<c r="${ref}"${attr}><v>${valor}</v></c>`
          : `<c r="${ref}"${attr} t="inlineStr"><is><t xml:space="preserve">${escaparXml(valor)}</t></is></c>`;

    xml = xml.slice(0, m.index) + nova + xml.slice(m.index + m[0].length);
  }
  return xml;
}

const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const u32 = (n: number) => [
  n & 0xff,
  (n >> 8) & 0xff,
  (n >> 16) & 0xff,
  (n >> 24) & 0xff,
];

function construirZip(
  ordem: string[],
  ficheiros: Record<string, Entrada>,
  agora: Date,
): Blob {
  const hora =
    ((agora.getHours() & 0x1f) << 11) |
    ((agora.getMinutes() & 0x3f) << 5) |
    ((agora.getSeconds() >> 1) & 0x1f);
  const data =
    (((agora.getFullYear() - 1980) & 0x7f) << 9) |
    (((agora.getMonth() + 1) & 0xf) << 5) |
    (agora.getDate() & 0x1f);

  const partes: Uint8Array[] = [];
  const centrais: Uint8Array[] = [];
  let offset = 0;

  for (const nome of ordem) {
    const f = ficheiros[nome];
    const nomeBytes = paraBytes(nome);
    const local = new Uint8Array([
      0x50,
      0x4b,
      0x03,
      0x04,
      20,
      0,
      0,
      0,
      ...u16(f.method),
      ...u16(hora),
      ...u16(data),
      ...u32(f.crc32),
      ...u32(f.compSize),
      ...u32(f.uncompSize),
      ...u16(nomeBytes.length),
      ...u16(0),
    ]);
    partes.push(local, nomeBytes, f.comp);

    centrais.push(
      new Uint8Array([
        0x50,
        0x4b,
        0x01,
        0x02,
        20,
        0,
        20,
        0,
        0,
        0,
        ...u16(f.method),
        ...u16(hora),
        ...u16(data),
        ...u32(f.crc32),
        ...u32(f.compSize),
        ...u32(f.uncompSize),
        ...u16(nomeBytes.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(offset),
      ]),
      nomeBytes,
    );
    offset += local.length + nomeBytes.length + f.comp.length;
  }

  const inicioDirectorio = offset;
  const tamanhoDirectorio = centrais.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array([
    0x50,
    0x4b,
    0x05,
    0x06,
    0,
    0,
    0,
    0,
    ...u16(ordem.length),
    ...u16(ordem.length),
    ...u32(tamanhoDirectorio),
    ...u32(inicioDirectorio),
    ...u16(0),
  ]);

  return new Blob([...partes, ...centrais, eocd] as BlobPart[], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Abre `modelo`, escreve `celulas` na folha indicada e devolve o `.xlsx`.
 *
 * @param modelo URL do modelo oficial (em `/public`).
 * @param opcoes `folha` é o nome do ficheiro dentro de `xl/worksheets/`.
 */
export async function preencherXlsx(
  modelo: string,
  opcoes: { folha?: string; celulas: Record<string, string | number> },
): Promise<Blob> {
  const res = await fetch(modelo);
  if (!res.ok) {
    throw new Error(`Não foi possível carregar o modelo (${modelo}).`);
  }
  const { ficheiros, ordem } = abrirZip(await res.arrayBuffer());

  const caminho = `xl/worksheets/${opcoes.folha ?? "sheet1"}.xml`;
  const f = ficheiros[caminho];
  if (!f) throw new Error(`Folha ${caminho} não encontrada no modelo.`);

  const original = f.method === 0 ? f.comp : await descomprimir(f.comp);
  const xml = preencherFolha(paraTexto(original), opcoes.celulas);
  const bytes = paraBytes(xml);

  ficheiros[caminho] = {
    method: 0,
    crc32: crc32(bytes),
    compSize: bytes.length,
    uncompSize: bytes.length,
    comp: bytes,
  };
  return construirZip(ordem, ficheiros, new Date());
}

/** Descarrega um `Blob` com o nome dado. */
export function descarregar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
