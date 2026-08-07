"""Arranque de uma empresa nova e importação de planos de contas.

Transposto de `seedTudo()` e `importarPlano()` de
`Piloto/assets/js/contabilidade.js`.

O Piloto tem duas fontes para o plano de contas e ambas são preservadas:
  1. o PGC-AR base (`src/core/pgc.py`), aplicado a qualquer empresa nova;
  2. o plano exportado do Primavera, importado por cima quando a empresa o tiver.
"""

from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.core.pgc import (
    CENTROS_DEFAULT,
    DIARIOS_DEFAULT,
    DOCUMENTOS_DEFAULT,
    FLUXOS_DEFAULT,
    PLANO_DEFAULT,
    natureza_conta,
)
from src.db.models.contabilidade import (
    CentroCusto,
    Conta,
    Diario,
    DocumentoContabilistico,
    Fluxo,
)
from src.db.models.tenancy import ConfigEmpresa, Empresa, Exercicio


def empresa_ja_iniciada(db: Session, empresa_id: UUID) -> bool:
    """Uma empresa já tem o plano criado? Evita duplicar o seed (o marcador
    `ct_seeded_v3` do Piloto)."""
    n = db.scalar(
        select(func.count()).select_from(Conta).where(Conta.empresa_id == empresa_id)
    )
    return bool(n)


def seed_empresa(
    db: Session, empresa: Empresa, *, ano: int | None = None
) -> dict[str, int]:
    """Cria o plano de contas, diários, documentos, fluxos, centros de custo,
    a configuração e o exercício corrente de uma empresa nova.

    Idempotente: se a empresa já tiver plano, não faz nada.
    """
    if empresa_ja_iniciada(db, empresa.id):
        return {"ignorado": 1}

    ano = ano or date.today().year

    db.add_all(
        Conta(
            empresa_id=empresa.id,
            codigo=codigo,
            nome=nome,
            # O PGC base não classifica M/I/R — a natureza de folha é inferida
            # pelo prefixo, como no Piloto. Um plano do Primavera traz o tipo.
            tipo=None,
            natureza=natureza_conta(codigo),
            ativa=True,
        )
        for codigo, nome in PLANO_DEFAULT
    )

    db.add_all(
        Diario(empresa_id=empresa.id, codigo=codigo, nome=nome, categoria=categoria)
        for codigo, nome, categoria in DIARIOS_DEFAULT
    )

    db.add_all(
        DocumentoContabilistico(
            empresa_id=empresa.id,
            codigo=d.codigo,
            descricao=d.descricao,
            diario_codigo=d.diario,
            conta_debito=d.conta_debito or None,
            conta_credito=d.conta_credito or None,
            retencao=d.retencao,
        )
        for d in DOCUMENTOS_DEFAULT
    )

    db.add_all(
        Fluxo(empresa_id=empresa.id, codigo=codigo, descricao=descricao, tipo=tipo)
        for codigo, descricao, tipo in FLUXOS_DEFAULT
    )

    db.add_all(
        CentroCusto(empresa_id=empresa.id, codigo=codigo, nome=nome, tipo=tipo)
        for codigo, nome, tipo in CENTROS_DEFAULT
    )

    # Configuração: todos os módulos activos por omissão, como no Piloto.
    if db.scalar(
        select(ConfigEmpresa.id).where(ConfigEmpresa.empresa_id == empresa.id)
    ) is None:
        db.add(
            ConfigEmpresa(
                empresa_id=empresa.id,
                modulos={},  # vazio = nada desactivado
                parametrizacoes={},
                agt={"ativo": False, "ambiente": "homologacao"},
            )
        )

    # Exercício corrente, activo.
    if db.scalar(
        select(Exercicio.id).where(Exercicio.empresa_id == empresa.id)
    ) is None:
        db.add(
            Exercicio(
                empresa_id=empresa.id,
                nome=f"Exercício {ano}",
                inicio=date(ano, 1, 1),
                fim=date(ano, 12, 31),
                estado="aberto",
                ativo=True,
            )
        )

    db.flush()
    return {
        "contas": len(PLANO_DEFAULT),
        "diarios": len(DIARIOS_DEFAULT),
        "documentos": len(DOCUMENTOS_DEFAULT),
        "fluxos": len(FLUXOS_DEFAULT),
        "centros": len(CENTROS_DEFAULT),
    }


def importar_plano(
    db: Session,
    empresa_id: UUID,
    linhas: list[dict],
    *,
    substituir: bool = False,
) -> dict[str, int]:
    """Importa um plano de contas (ex.: exportação do Primavera).

    Cada linha aceita `codigo`, `nome` e opcionalmente `tipo` (M/I/R) e
    `classe_iva`. Por omissão funde com o plano existente — actualiza as contas
    que já existem pelo código e acrescenta as novas. Com `substituir=True`
    apaga o plano actual primeiro.

    Réplica de `importarPlano()`, incluindo o filtro do Piloto: linhas sem
    código, ou com um código sem qualquer dígito, são ignoradas.
    """
    limpas: list[dict] = []
    for l in linhas:
        codigo = str(l.get("codigo") or "").strip()
        if not codigo or not any(ch.isdigit() for ch in codigo):
            continue
        limpas.append(
            {
                "codigo": codigo,
                "nome": str(l.get("nome") or "").strip(),
                "tipo": l.get("tipo") or None,
                "classe_iva": l.get("classe_iva") or None,
            }
        )

    if substituir:
        for c in db.scalars(select(Conta).where(Conta.empresa_id == empresa_id)).all():
            db.delete(c)
        db.flush()

    existentes = {
        c.codigo: c
        for c in db.scalars(select(Conta).where(Conta.empresa_id == empresa_id)).all()
    }

    novas = atualizadas = 0
    for l in limpas:
        conta = existentes.get(l["codigo"])
        if conta is not None:
            conta.nome = l["nome"] or conta.nome
            if l["tipo"]:
                conta.tipo = l["tipo"]
            if l["classe_iva"]:
                conta.classe_iva = l["classe_iva"]
            conta.ativa = True
            atualizadas += 1
        else:
            nova = Conta(
                empresa_id=empresa_id,
                codigo=l["codigo"],
                nome=l["nome"] or l["codigo"],
                tipo=l["tipo"],
                natureza=natureza_conta(l["codigo"]),
                classe_iva=l["classe_iva"],
                ativa=True,
            )
            db.add(nova)
            existentes[l["codigo"]] = nova
            novas += 1

    db.flush()
    return {
        "total": len(limpas),
        "novas": novas,
        "atualizadas": atualizadas,
        "substituido": int(substituir),
    }
