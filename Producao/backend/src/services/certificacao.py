"""Que número de certificação vale para uma empresa.

UM SÍTIO SÓ A DECIDIR, e é o ponto deste ficheiro. A regra tem três degraus e
espalhá-la pelas rotas que dela precisam — o SAF-T, o ecrã de configurações, a
factura impressa — dava três hipóteses de divergirem, e a divergência aqui não
é um detalhe: é declarar à AGT uma certificação diferente da que se mostra ao
cliente.

Os três degraus, por ordem:

1. **O número da empresa**, se tiver um. É o caso específico.
2. **O número da plataforma**, quando a empresa não tem. É o normal: quem
   certifica é a AGT e o que ela certifica é o programa, que é o mesmo para
   toda a gente.
3. **`0`**, quando não há nenhum. Quer dizer «software ainda não certificado»,
   é previsto pela norma, e é o valor honesto — nunca se inventa um número.

PORQUE É RESOLVIDO À LEITURA e não copiado quando a empresa é criada: a
certificação renova-se. No dia em que o número passar de `141/AGT/2026` para o
de 2027, muda-se num sítio e todas as empresas sem caso próprio passam a
declarar o novo. Copiado na criação, seria preciso ir empresa a empresa — e
bastaria esquecer uma para ela entregar ficheiros com uma certificação
caducada.
"""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.models.tenancy import ConfigPlataforma, Empresa

#: O formato que o esquema do SAF-T impõe: `141/AGT/2026`.
FORMATO = re.compile(r"^\d+/AGT/\d{4}$")

#: O que se declara quando não há certificação. Previsto pela norma.
SEM_CERTIFICACAO = "0"


def da_plataforma(db: Session) -> str:
    """O número por omissão, definido nas configurações da plataforma."""
    valor = db.scalar(select(ConfigPlataforma.certificacao_agt).limit(1))
    return (valor or "").strip()


def efectiva(db: Session, empresa: Empresa) -> str:
    """O número que esta empresa declara. Nunca vazio — no limite, `0`."""
    proprio = (empresa.certificacao_agt or "").strip()
    if proprio:
        return proprio
    return da_plataforma(db) or SEM_CERTIFICACAO


def descrever(db: Session, empresa: Empresa) -> dict:
    """O mesmo, para os ecrãs, com a origem à vista.

    A origem importa a quem lê: «141/AGT/2026» sozinho não distingue um número
    atribuído a esta empresa de um herdado da plataforma — e são coisas
    diferentes no dia em que se quer mudar um sem mexer no outro.
    """
    proprio = (empresa.certificacao_agt or "").strip()
    plataforma = da_plataforma(db)
    if proprio:
        origem = "empresa"
    elif plataforma:
        origem = "plataforma"
    else:
        origem = "nenhuma"
    return {
        "certificacao_agt": efectiva(db, empresa),
        "certificacao_origem": origem,
        "certificacao_plataforma": plataforma,
        # Nenhum ecrã de empresa a deixa editar. Vai explícito para o ecrã não
        # ter de adivinhar a regra.
        "certificacao_agt_editavel": False,
    }


def valida(numero: str) -> bool:
    """Serve para guardar? Vazio serve — quer dizer «não tem»."""
    numero = (numero or "").strip()
    return numero in ("", SEM_CERTIFICACAO) or bool(FORMATO.match(numero))
