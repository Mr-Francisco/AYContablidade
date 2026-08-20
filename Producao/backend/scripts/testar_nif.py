"""Testa credenciais da AGT contra a consulta de NIF, sem tocar na aplicação.

PARA QUE SERVE: quando as credenciais chegarem, saber em dois minutos se
funcionam e em que ambiente — antes de as pôr no `.env`, no Render, e de andar
a adivinhar porque é que o ecrã não traz o nome.

    python scripts/testar_nif.py 5417020772

Lê `AGT_USERNAME` e `AGT_PASSWORD` do ambiente ou do `.env`. Testa os DOIS
ambientes, porque as credenciais de um não servem no outro e é exactamente esse
o engano que custa uma tarde.

NÃO IMPRIME A PALAVRA-PASSE. Nem em erro, nem em «modo detalhado». Um guião de
diagnóstico que despeja a senha no terminal é a forma mais comum de ela acabar
no histórico da consola e num registo de sessão.
"""

from __future__ import annotations

import base64
import os
import sys
from pathlib import Path

import httpx

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

AMBIENTES = {
    "TESTES (homologação)": "https://sifphml.minfin.gov.ao",
    "PRODUÇÃO": "https://sifp.minfin.gov.ao",
}
CAMINHO = "/sigt/contribuinte/consultarNIF/v5/obter"


def credenciais() -> tuple[str, str]:
    """Do ambiente, ou do `.env` — a mesma ordem que a aplicação usa."""
    utilizador = os.environ.get("AGT_USERNAME")
    senha = os.environ.get("AGT_PASSWORD")
    if utilizador and senha:
        return utilizador, senha

    env = RAIZ / ".env"
    if env.exists():
        for linha in env.read_text(encoding="utf-8").splitlines():
            if linha.startswith("AGT_USERNAME=") and not utilizador:
                utilizador = linha.split("=", 1)[1].strip()
            if linha.startswith("AGT_PASSWORD=") and not senha:
                senha = linha.split("=", 1)[1].strip()
    return utilizador or "", senha or ""


def testar(base: str, utilizador: str, senha: str, nif: str) -> None:
    autorizacao = base64.b64encode(f"{utilizador}:{senha}".encode()).decode()
    try:
        r = httpx.get(
            base + CAMINHO,
            params={"tipoDocumento": "NIF", "numeroDocumento": nif},
            headers={
                "Accept": "application/json",
                "Authorization": f"Basic {autorizacao}",
                # Os cabeçalhos que o Piloto usava, mantidos: se o serviço
                # aceitar qualquer um dos dois, funciona.
                "Username": utilizador,
                "Password": senha,
            },
            timeout=20,
        )
    except Exception as e:  # noqa: BLE001 — é um guião de diagnóstico
        print(f"   NÃO RESPONDEU — {type(e).__name__}")
        print("   Verifique a ligação à internet ou se o serviço está de pé.")
        return

    if r.status_code == 401:
        print("   401 — as credenciais não foram aceites NESTE ambiente.")
        print("   Se funcionarem no outro, são desse: são serviços separados.")
        return
    if r.status_code == 403:
        print("   403 — credenciais aceites, mas sem permissão para esta consulta.")
        print("   Peça à AGT o acesso ao serviço de consulta de NIF.")
        return
    if r.status_code != 200:
        print(f"   {r.status_code} — resposta inesperada: {r.text[:160]}")
        return

    try:
        dados = r.json()
    except Exception:  # noqa: BLE001
        print(f"   200, mas a resposta não é JSON: {r.text[:160]}")
        return

    envelope = dados.get("ObterContribuinte") or {}
    c = envelope.get("contribuinte") or dados.get("contribuinte") or {}
    nome = c.get("nome")

    if nome:
        print("   FUNCIONA.")
        print(f"   Nome: {nome}")
        if c.get("regimeIva"):
            print(f"   Regime de IVA: {c['regimeIva']}")
        if c.get("estadoContribuinte"):
            print(f"   Estado: {c['estadoContribuinte']}")
    else:
        print("   200, mas sem contribuinte na resposta.")
        print(f"   A AGT disse: {envelope.get('mensagem') or dados}")


def main() -> None:
    nif = sys.argv[1] if len(sys.argv) > 1 else "5417020772"
    utilizador, senha = credenciais()

    print()
    print(f"NIF a consultar: {nif}")

    if not utilizador or not senha:
        print()
        print("SEM CREDENCIAIS. Não há nada a testar — e é esta a razão de a")
        print("consulta não trazer o nome na aplicação.")
        print()
        print("Peça-as por e-mail a: produtores.dfe.dcrr.agt@minfin.gov.ao")
        print("indicando o NOME e o NIF da empresa. Depois:")
        print()
        print("  set AGT_USERNAME=...   (ou escreva-as no backend/.env)")
        print("  set AGT_PASSWORD=...")
        print("  python scripts/testar_nif.py")
        print()
        return

    # O utilizador aparece porque ajuda a perceber qual das credenciais está em
    # uso quando se tem mais do que um par. A palavra-passe nunca aparece.
    print(f"Utilizador: {utilizador}")

    for rotulo, base in AMBIENTES.items():
        print()
        print(f"-- {rotulo} --")
        testar(base, utilizador, senha, nif)

    print()
    print("Se funcionar num e falhar no outro, é normal: são serviços")
    print("separados e cada um tem as suas credenciais. Use o endereço do")
    print("ambiente que funcionou em AGT_ENDPOINT.")
    print()


if __name__ == "__main__":
    main()
