"""Modelos SQLAlchemy.

Todos os modelos têm de ser importados aqui: o `alembic revision --autogenerate`
só detecta as tabelas que estiverem registadas no `Base.metadata`, e um modelo
que ninguém importe fica invisível para as migrações.
"""

from src.db.base import Base
from src.db.models.auditoria import RegistoAuditoria
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
from src.db.models.ia import ConsultaIA, ModeloIA
from src.db.models.imobilizados import Ativo, ProcessoAmortizacao
from src.db.models.logistica import Armazem, Artigo, MovimentoStock
from src.db.models.notificacoes import Notificacao, NotificacaoLida
from src.db.models.rh import (
    AlteracaoMensal,
    Colaborador,
    Honorario,
    Independente,
    MapaIrtLinha,
    PagamentoSalarial,
    ProcessamentoSalarial,
)
from src.db.models.tenancy import (
    ConfigEmpresa,
    Empresa,
    Exercicio,
    Licenca,
)
from src.db.models.terceiros import Terceiro
from src.db.models.user import User

__all__ = [
    "AlteracaoMensal",
    "Armazem",
    "Artigo",
    "Ativo",
    "Base",
    "RegistoAuditoria",
    "CentroCusto",
    "Colaborador",
    "Compra",
    "Notificacao",
    "NotificacaoLida",
    "CompraLinha",
    "ConfigEmpresa",
    "ConsultaIA",
    "ModeloIA",
    "Conta",
    "Diario",
    "DiarioFecho",
    "DocumentoContabilistico",
    "Empresa",
    "Exercicio",
    "Fluxo",
    "Honorario",
    "Independente",
    "Lancamento",
    "LancamentoLinha",
    "Licenca",
    "MapaIrtLinha",
    "MovimentoStock",
    "NotaTexto",
    "PagamentoSalarial",
    "ProcessamentoSalarial",
    "ProcessoAmortizacao",
    "SequenciaDocumento",
    "SequenciaVenda",
    "Terceiro",
    "User",
    "Venda",
    "VendaLinha",
    "Vendedor",
]
