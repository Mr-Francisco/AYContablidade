"""Cria uma conta de teste sem segundo factor, para verificar ecrãs no browser.

PORQUE EXISTE: as contas de demonstração por perfil só vêem o seu módulo, e a
`admin@demo.ao` tem 2FA real configurado no telemóvel de quem trabalha neste
projecto. Verificar um ecrã de Comercial com a conta de Contabilidade dá 403 e
uma grelha vazia — parece um defeito e é só a permissão a funcionar.

O QUE FAZ, e mais nada: acrescenta `teste@demo.ao` com perfil de administrador
na empresa de demonstração. **Não toca em nenhuma conta existente** — nem na
palavra-passe, nem no perfil, nem no segundo factor de ninguém. Já houve um
guião de reposição que quase apagou o 2FA acabado de configurar; este só
insere, e se a conta já existir não faz nada.

RECUSA-SE EM PRODUÇÃO. Uma conta de administrador com palavra-passe conhecida
é exactamente o que não pode existir num sistema a sério.

    python scripts/criar_conta_teste.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from sqlalchemy import select  # noqa: E402

from src.auth.security import hash_password  # noqa: E402
from src.core.constants import Perfil  # noqa: E402
from src.db.base import SessionLocal  # noqa: E402
from src.db.models import Empresa, User  # noqa: E402

EMAIL = "teste@demo.ao"
PASSWORD = "demo12345"
EMPRESA = "DC001"


def agora():
    from datetime import datetime, timezone

    return datetime.now(timezone.utc)


def main() -> None:
    if os.environ.get("AMBIENTE", "").lower() == "producao":
        print("RECUSADO: isto cria uma conta com palavra-passe conhecida.")
        print("Não corre em produção.")
        raise SystemExit(1)

    s = SessionLocal()
    try:
        emp = s.scalar(select(Empresa).where(Empresa.codigo == EMPRESA))
        if not emp:
            print(f"Não existe a empresa {EMPRESA}.")
            print("Corra primeiro: python scripts/criar_demo.py")
            raise SystemExit(1)

        if s.scalar(select(User.id).where(User.email == EMAIL)):
            print(f"A conta {EMAIL} já existe — nada a fazer.")
        else:
            s.add(
                User(
                    empresa_id=emp.id,
                    nome="Conta de Teste",
                    email=EMAIL,
                    password_hash=hash_password(PASSWORD),
                    perfil=Perfil.ADMIN,
                    ativo=True,
                    aprovado=True,
                    aprovado_em=agora(),
                    permissoes_extra=[],
                    permissoes_accao={},
                )
            )
            s.commit()
            print(f"Criada: {EMAIL}")

        print()
        print(f"  Empresa:       {EMPRESA}")
        print(f"  E-mail:        {EMAIL}")
        print(f"  Palavra-passe: {PASSWORD}")
        print("  Sem segundo factor.")
        print()
    finally:
        s.close()


if __name__ == "__main__":
    main()
