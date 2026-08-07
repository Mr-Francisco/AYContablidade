"""Ciclo de vida de uma empresa.

O caminho normal para tirar uma empresa de serviço é o estado
(`activa` → `suspensa` → `cancelada`), como descrito em
`docs/TENANCY_AND_ACCESS.md`. Os dados contabilísticos ficam — há obrigações
legais de conservação e a licença pode ser reactivada.

A remoção definitiva existe só para casos deliberados (engano no registo,
pedido de apagamento de dados) e tem de ser feita por ordem de dependência.
"""

from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from src.db.models.comercial import (
    Compra,
    CompraLinha,
    SequenciaVenda,
    Venda,
    VendaLinha,
    Vendedor,
)
from src.db.models.contabilidade import (
    CentroCusto,
    Conta,
    Diario,
    DiarioFecho,
    DocumentoContabilistico,
    Fluxo,
    Lancamento,
    LancamentoLinha,
    NotaTexto,
    SequenciaDocumento,
)
from src.db.models.ia import ConsultaIA
from src.db.models.imobilizados import Ativo, ProcessoAmortizacao
from src.db.models.logistica import Armazem, Artigo, MovimentoStock
from src.db.models.rh import (
    AlteracaoMensal,
    Colaborador,
    Honorario,
    Independente,
    MapaIrtLinha,
    PagamentoSalarial,
    ProcessamentoSalarial,
)
from src.db.models.tenancy import ConfigEmpresa, Empresa, Exercicio, Licenca, PedidoLicenca
from src.db.models.terceiros import Terceiro
from src.db.models.user import User


def remover_empresa(db: Session, empresa_id: UUID) -> dict[str, int]:
    """Apaga uma empresa e tudo o que lhe pertence, por ordem de dependência.

    A ordem NÃO é opcional. Várias chaves estrangeiras são `ON DELETE RESTRICT`
    de propósito — `lancamento_linhas.conta_id`, por exemplo, impede que uma
    conta com movimentos desapareça por acidente. Um `DELETE` directo na empresa
    dispara o cascade para `contas` e embate nesse RESTRICT antes de os
    lançamentos terem sido removidos.

    Baixar os RESTRICT para CASCADE resolveria o sintoma e criaria um problema
    pior: apagar um artigo levaria consigo, em silêncio, o histórico de stock.
    """
    contagem: dict[str, int] = {}

    def _apagar(modelo, filtro) -> None:
        n = db.execute(delete(modelo).where(filtro)).rowcount or 0
        if n:
            contagem[modelo.__tablename__] = n

    # 1. Linhas de documentos — dependem dos cabeçalhos e das contas/artigos.
    ids_lanc = select(Lancamento.id).where(Lancamento.empresa_id == empresa_id)
    _apagar(LancamentoLinha, LancamentoLinha.lancamento_id.in_(ids_lanc))
    _apagar(VendaLinha, VendaLinha.venda_id.in_(
        select(Venda.id).where(Venda.empresa_id == empresa_id)))
    _apagar(CompraLinha, CompraLinha.compra_id.in_(
        select(Compra.id).where(Compra.empresa_id == empresa_id)))

    # 2. Documentos que referenciam lançamentos, artigos ou terceiros.
    for modelo in (Venda, Compra, MovimentoStock, Honorario, PagamentoSalarial,
                   ProcessamentoSalarial, ProcessoAmortizacao):
        _apagar(modelo, modelo.empresa_id == empresa_id)

    # 3. Lançamentos (já sem linhas) e o resto da contabilidade.
    for modelo in (Lancamento, DiarioFecho, NotaTexto, SequenciaDocumento,
                   SequenciaVenda):
        _apagar(modelo, modelo.empresa_id == empresa_id)

    # 4. Fichas e tabelas.
    for modelo in (MapaIrtLinha, AlteracaoMensal, Colaborador, Independente,
                   Ativo, Artigo, Armazem, Terceiro, Vendedor,
                   Conta, Diario, DocumentoContabilistico, Fluxo, CentroCusto):
        _apagar(modelo, modelo.empresa_id == empresa_id)

    # 5. Exercícios — os lançamentos que lhes apontavam já não existem.
    _apagar(Exercicio, Exercicio.empresa_id == empresa_id)

    # 6. Núcleo. As consultas de IA saem antes dos utilizadores que as fizeram.
    _apagar(ConsultaIA, ConsultaIA.empresa_id == empresa_id)
    # Os pedidos de licença ficam com empresa_id a NULL (SET NULL), para o
    # histórico de aprovações não desaparecer.
    _apagar(User, User.empresa_id == empresa_id)
    _apagar(Licenca, Licenca.empresa_id == empresa_id)
    _apagar(ConfigEmpresa, ConfigEmpresa.empresa_id == empresa_id)
    _apagar(PedidoLicenca, PedidoLicenca.empresa_id == empresa_id)
    _apagar(Empresa, Empresa.id == empresa_id)

    db.flush()
    return contagem


def remover_conta(db: Session, empresa_id: UUID, codigo: str) -> dict:
    """Remove uma conta do plano — ou desactiva-a, se tiver movimentos.

    Réplica de `removeConta()` do Piloto: uma conta com histórico nunca
    desaparece, passa a inactiva. Apagá-la deixaria linhas de lançamento a
    apontar para o vazio e estragaria os balancetes de exercícios anteriores.
    """
    conta = db.scalar(
        select(Conta).where(Conta.empresa_id == empresa_id, Conta.codigo == codigo)
    )
    if conta is None:
        return {"inexistente": True}

    tem_movimentos = db.scalar(
        select(LancamentoLinha.id)
        .join(Lancamento, Lancamento.id == LancamentoLinha.lancamento_id)
        .where(
            Lancamento.empresa_id == empresa_id,
            LancamentoLinha.conta_codigo == codigo,
        )
        .limit(1)
    )
    if tem_movimentos is not None:
        conta.ativa = False
        db.flush()
        return {"desativada": True}

    db.delete(conta)
    db.flush()
    return {"eliminada": True}
