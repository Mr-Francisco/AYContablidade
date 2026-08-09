"""Peças partilhadas pelas rotas de alterar e eliminar um mestre.

Existem porque a mesma forma repete-se em artigos, armazéns, clientes,
fornecedores e vendedores: procurar dentro da empresa da sessão, aplicar só os
campos enviados, e recusar a eliminação do que já tem histórico.

A REGRA QUE AQUI VIVE, e que é a única em que a Produção é mais restritiva do
que o Piloto: **o que já foi usado não se apaga**. No Piloto, apagar um artigo
com movimentos de stock ou um cliente com facturas deixava esses documentos a
apontar para uma ficha que já não existia — e os mapas passavam a ter linhas
sem nome. Aqui recusa-se, com a mensagem a dizer que a alternativa é desactivar.
"""

from typing import TypeVar
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

T = TypeVar("T")


def obter_da_empresa(db: Session, modelo: type[T], ident: UUID, empresa_id: UUID,
                     *, nome: str) -> T:
    """Procura por id DENTRO da empresa da sessão.

    O filtro por empresa não é um detalhe de eficiência: sem ele, conhecer o id
    chegava para alterar a ficha de outra empresa. Devolve 404 e não 403 de
    propósito — quem não é dono do registo não deve conseguir distinguir «não
    existe» de «existe e não é seu».
    """
    obj = db.scalar(
        select(modelo).where(
            modelo.id == ident,  # type: ignore[attr-defined]
            modelo.empresa_id == empresa_id,  # type: ignore[attr-defined]
        )
    )
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{nome} não encontrado.")
    return obj


def aplicar(obj: object, dados) -> None:
    """Escreve só os campos que vieram no pedido.

    `exclude_unset` e não `exclude_none`: um campo enviado explicitamente a
    `null` é uma ordem para limpar, e tem de chegar. Só os que não vieram é que
    ficam como estavam.
    """
    pedido = dados.model_dump(exclude_unset=True)
    if not pedido:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Nada para alterar."
        )
    for campo, valor in pedido.items():
        setattr(obj, campo, valor)


def recusar_se_usado(db: Session, consultas: list[tuple], *, o_que: str) -> None:
    """Recusa a eliminação se alguma das consultas devolver linha.

    `consultas` é uma lista de (select, motivo) — o motivo entra na mensagem
    para quem lê saber ONDE é que o registo está a ser usado, em vez de um
    «não pode» sem explicação.
    """
    for consulta, motivo in consultas:
        if db.scalar(consulta.limit(1)) is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"{o_que} tem {motivo} e não pode ser eliminado. "
                "Ponha-o inactivo para deixar de o usar sem perder o histórico.",
            )
