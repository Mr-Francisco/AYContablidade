"""Documentos do projecto em PDF, sem instalar nada.

    python docs/pdf/gerar.py docs/LANCAMENTO_V1.md docs/pdf/lancamento.html "Titulo"

Depois, para o PDF (o Edge está em qualquer Windows, e é headless):

    & "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
      --headless --disable-gpu --no-pdf-header-footer `
      --print-to-pdf="docs\pdf\LANCAMENTO_V1.pdf" "file:///C:/.../lancamento.html"

Porque não pandoc ou weasyprint: seria mais uma coisa para instalar numa
máquina onde nem o Docker abre. Isto converte o subconjunto de Markdown que os
documentos deste projecto usam — títulos, listas, tabelas, código, negrito,
itálico e links — e mais nada. Se um documento precisar de mais, é sinal de que
está a ficar complicado de mais para ser lido.
"""

import html
import io
import re
import sys


def inline(t: str) -> str:
    t = html.escape(t)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![\w*])\*([^*\n]+)\*(?![\w*])", r"<em>\1</em>", t)
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', t)
    return t


def converter(md: str) -> str:
    saida, i = [], 0
    linhas = md.split("\n")
    while i < len(linhas):
        l = linhas[i]
        if l.startswith("```"):
            bloco = []
            i += 1
            while i < len(linhas) and not linhas[i].startswith("```"):
                bloco.append(html.escape(linhas[i]))
                i += 1
            saida.append("<pre><code>" + "\n".join(bloco) + "</code></pre>")
        elif l.startswith("|") and i + 1 < len(linhas) and set(linhas[i + 1].replace("|", "").strip()) <= set("-: "):
            cabec = [c.strip() for c in l.strip("|").split("|")]
            i += 2
            corpo = []
            while i < len(linhas) and linhas[i].startswith("|"):
                corpo.append([c.strip() for c in linhas[i].strip("|").split("|")])
                i += 1
            i -= 1
            th = "".join(f"<th>{inline(c)}</th>" for c in cabec)
            trs = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in corpo)
            saida.append(f"<table><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>")
        elif re.match(r"^#{1,6} ", l):
            n = len(l) - len(l.lstrip("#"))
            saida.append(f"<h{n}>{inline(l[n + 1:])}</h{n}>")
        elif l.strip() in ("---", "***"):
            saida.append("<hr>")
        elif re.match(r"^\s*[-*] ", l):
            itens = []
            while i < len(linhas) and re.match(r"^\s*[-*] ", linhas[i]):
                itens.append(f"<li>{inline(re.sub(r'^\s*[-*] ', '', linhas[i]))}</li>")
                i += 1
            i -= 1
            saida.append("<ul>" + "".join(itens) + "</ul>")
        elif re.match(r"^\s*\d+\. ", l):
            itens = []
            while i < len(linhas) and re.match(r"^\s*\d+\. ", linhas[i]):
                itens.append(f"<li>{inline(re.sub(r'^\s*\d+\. ', '', linhas[i]))}</li>")
                i += 1
            i -= 1
            saida.append("<ol>" + "".join(itens) + "</ol>")
        elif l.strip():
            paragrafo = [l]
            i += 1
            while i < len(linhas) and linhas[i].strip() and not re.match(r"^(#{1,6} |\||```|\s*[-*] |\s*\d+\. |---)", linhas[i]):
                paragrafo.append(linhas[i])
                i += 1
            i -= 1
            saida.append("<p>" + inline(" ".join(paragrafo)) + "</p>")
        i += 1
    return "\n".join(saida)


ESTILO = """
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", system-ui, Arial, sans-serif; color: #1a1a2e;
       font-size: 10.5pt; line-height: 1.55; margin: 0; }
h1 { font-size: 21pt; color: #0b3d91; margin: 0 0 4pt; letter-spacing: -.4pt; }
h2 { font-size: 14pt; color: #0b3d91; margin: 20pt 0 6pt;
     border-bottom: 1.5pt solid #dfe4f0; padding-bottom: 3pt; page-break-after: avoid; }
h3 { font-size: 11.5pt; margin: 13pt 0 4pt; page-break-after: avoid; }
p { margin: 0 0 7pt; }
ul, ol { margin: 0 0 8pt; padding-left: 16pt; }
li { margin-bottom: 3pt; }
code { font-family: Consolas, monospace; font-size: 9pt;
       background: #edf1f9; padding: 1pt 3pt; border-radius: 3pt; }
pre { background: #f5f7fb; border: .5pt solid #dfe4f0; border-radius: 5pt;
      padding: 7pt 9pt; overflow-wrap: anywhere; white-space: pre-wrap;
      page-break-inside: avoid; margin: 0 0 9pt; }
pre code { background: none; padding: 0; font-size: 8.5pt; }
table { border-collapse: collapse; width: 100%; margin: 0 0 10pt; font-size: 9pt;
        page-break-inside: avoid; }
th, td { border: .5pt solid #dfe4f0; padding: 4pt 6pt; text-align: left;
         vertical-align: top; }
th { background: #edf1f9; font-weight: 700; }
hr { border: none; border-top: .5pt solid #dfe4f0; margin: 14pt 0; }
a { color: #1e5fcc; text-decoration: none; }
strong { font-weight: 700; }
.rodape { margin-top: 22pt; padding-top: 7pt; border-top: .5pt solid #dfe4f0;
          font-size: 8pt; color: #62657a; }
"""

origem, destino, titulo = sys.argv[1], sys.argv[2], sys.argv[3]
md = io.open(origem, encoding="utf-8").read()
io.open(destino, "w", encoding="utf-8").write(
    f"<!doctype html><html lang=pt-PT><head><meta charset=utf-8>"
    f"<title>{html.escape(titulo)}</title><style>{ESTILO}</style></head><body>"
    f"{converter(md)}"
    f"<p class=rodape>AYContabilidade · SGD — Software de Gestão Dirigida · "
    f"documento gerado de <code>{html.escape(origem)}</code></p>"
    f"</body></html>"
)
print(destino)
