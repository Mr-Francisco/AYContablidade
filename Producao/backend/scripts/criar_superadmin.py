"""Cria a primeira conta de administração da plataforma numa instalação real.

    cd Producao/backend
    python scripts/criar_superadmin.py

Pede o nome, o e-mail e a palavra-passe na consola. A palavra-passe não é
escrita no ecrã nem aceite por argumento da linha de comandos: o que se passa
num argumento fica no histórico da shell e na lista de processos da máquina,
onde qualquer outra sessão o vê.

Não há valores por omissão nenhuns. É deliberado — o `criar_demo.py` existe
para desenvolvimento e cria contas com palavras-passe conhecidas; este é o
caminho para produção e não cria nada que já não lhe tenham dito.

DEPOIS DE ENTRAR PELA PRIMEIRA VEZ, active o segundo factor. A área de
administração da plataforma exige-o e fica fechada até lá.
"""

import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select  # noqa: E402

from src.auth.security import hash_password, validar_forca_password  # noqa: E402
from src.core.config import get_settings  # noqa: E402
from src.core.constants import Perfil  # noqa: E402
from src.db.base import SessionLocal  # noqa: E402
from src.db.models.user import User  # noqa: E402


def perguntar(rotulo: str) -> str:
    valor = input(f"{rotulo}: ").strip()
    if not valor:
        sys.exit("Cancelado: o campo é obrigatório.")
    return valor


def main() -> None:
    s = get_settings()
    print(f"\nAMBIENTE = {s.AMBIENTE}\n")

    db = SessionLocal()
    try:
        quantos = db.scalar(
            select(func.count(User.id)).where(User.perfil == Perfil.SUPERADMIN)
        )
        if quantos:
            # Existir uma já dá para criar as outras pela interface, que fica
            # auditada. Criar por script o que a aplicação sabe criar é abrir
            # um caminho paralelo sem registo nenhum.
            sys.exit(
                f"Já existem {quantos} conta(s) de administração da plataforma.\n"
                "As restantes criam-se na aplicação, em Plataforma → Contas, "
                "onde a operação fica registada na auditoria."
            )

        nome = perguntar("Nome")
        email = perguntar("E-mail").lower()

        if db.scalar(select(User).where(func.lower(User.email) == email)):
            sys.exit(f"Já existe uma conta com o e-mail {email}.")

        password = getpass.getpass("Palavra-passe: ")
        if password != getpass.getpass("Repetir: "):
            sys.exit("Cancelado: as palavras-passe não coincidem.")
        try:
            validar_forca_password(password)
        except Exception as e:  # noqa: BLE001 — a mensagem é para quem está a ler.
            sys.exit(f"Palavra-passe recusada: {e}")

        conta = User(
            empresa_id=None,  # A plataforma não pertence a empresa nenhuma.
            nome=nome,
            email=email,
            password_hash=hash_password(password),
            perfil=Perfil.SUPERADMIN,
            ativo=True,
            aprovado=True,
        )
        db.add(conta)
        db.commit()
    finally:
        db.close()

    print(f"\nConta criada: {email}")
    if not s.TOTP_CHAVE_CIFRA:
        print(
            "\nATENÇÃO: TOTP_CHAVE_CIFRA não está definida. Sem ela não se "
            "consegue activar o segundo factor, e a área de administração da "
            "plataforma exige-o — esta conta não conseguirá lá entrar."
        )
    else:
        print(
            "Entre na aplicação e active já o segundo factor em Perfil: a área "
            "de administração da plataforma fica fechada até o fazer."
        )


if __name__ == "__main__":
    main()
