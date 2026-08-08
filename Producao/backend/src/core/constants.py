"""Constantes do domínio, transpostas do Piloto (`Piloto/assets/js/app.js`).

Regra 9/11: a Produção preserva as regras do Piloto. Os perfis, os módulos e a
matriz de capacidades são exactamente os do Piloto. A granularidade por acção
(ver/criar/editar/eliminar/exportar) é uma extensão exigida por
`docs/TENANCY_AND_ACCESS.md`, construída por cima da matriz original.
"""

from enum import StrEnum


class Perfil(StrEnum):
    """Os 8 perfis do Piloto (PERFIS em app.js)."""

    SUPERADMIN = "superadmin"
    ADMIN = "admin"
    CONTABILISTA = "contabilista"
    FINANCEIRO = "financeiro"
    COMERCIAL = "comercial"
    LOGISTICA = "logistica"
    RH = "rh"
    CONSULTA = "consulta"


PERFIL_LABEL: dict[Perfil, str] = {
    Perfil.SUPERADMIN: "Super Administrador",
    Perfil.ADMIN: "Administrador",
    Perfil.CONTABILISTA: "Contabilista",
    Perfil.FINANCEIRO: "Tesouraria",
    Perfil.COMERCIAL: "Comercial",
    Perfil.LOGISTICA: "Logística",
    Perfil.RH: "Recursos Humanos",
    Perfil.CONSULTA: "Consulta",
}

PERFIL_COR: dict[Perfil, str] = {
    Perfil.SUPERADMIN: "#6c2fb0",
    Perfil.ADMIN: "#c0392b",
    Perfil.CONTABILISTA: "#2c3e50",
    Perfil.FINANCEIRO: "#1f7a44",
    Perfil.COMERCIAL: "#2980b9",
    Perfil.LOGISTICA: "#d68910",
    Perfil.RH: "#16a085",
    Perfil.CONSULTA: "#8a8a8a",
}

# Perfis que um utilizador pode escolher ao registar-se (PERFIS_REGISTO no Piloto).
# "superadmin" nunca é auto-atribuível.
PERFIS_REGISTO: frozenset[Perfil] = frozenset(
    {
        Perfil.CONTABILISTA,
        Perfil.FINANCEIRO,
        Perfil.COMERCIAL,
        Perfil.LOGISTICA,
        Perfil.RH,
        Perfil.CONSULTA,
        Perfil.ADMIN,
    }
)

# Perfis que podem aprovar registos pendentes (PERFIS_APROVADORES no Piloto).
PERFIS_APROVADORES: frozenset[Perfil] = frozenset({Perfil.SUPERADMIN, Perfil.ADMIN})


class Modulo(StrEnum):
    """Módulos do sistema (MODULOS em app.js)."""

    CONTABILIDADE = "contabilidade"
    CONTAS_CORRENTES = "contasCorrentes"
    COMERCIAL = "comercial"
    LOGISTICA = "logistica"
    IMOBILIZADOS = "imobilizados"
    ANALITICA = "analitica"
    RH = "rh"
    FISCALIDADE = "fiscalidade"


MODULO_LABEL: dict[Modulo, str] = {
    Modulo.CONTABILIDADE: "Contabilidade",
    Modulo.CONTAS_CORRENTES: "Contas Correntes",
    Modulo.COMERCIAL: "Comercial",
    Modulo.LOGISTICA: "Logística",
    Modulo.IMOBILIZADOS: "Imobilizados",
    Modulo.ANALITICA: "Analítica",
    Modulo.RH: "Recursos Humanos",
    Modulo.FISCALIDADE: "Fiscalidade",
}


class Accao(StrEnum):
    """Acções sobre um módulo (docs/TENANCY_AND_ACCESS.md)."""

    VER = "ver"
    CRIAR = "criar"
    EDITAR = "editar"
    ELIMINAR = "eliminar"
    EXPORTAR = "exportar"


# Matriz de capacidades por perfil (CAPS em app.js), mantida tal-e-qual.
# "*" = todas as capacidades. As chaves seguem o prefixo de domínio do Piloto.
CAPS: dict[Perfil, tuple[str, ...]] = {
    Perfil.SUPERADMIN: ("*",),
    Perfil.ADMIN: ("*",),
    Perfil.CONTABILISTA: (
        "contab.ver",
        "contab.lancar",
        "contab.plano",
        "contab.fechar",
        "financeiro.ver",
        "imob.ver",
        "imob.gerir",
        "analitica.ver",
        "analitica.gerir",
        "empresa.ver",
    ),
    Perfil.FINANCEIRO: (
        "financeiro.ver",
        "financeiro.gerir",
        "contab.ver",
        "comercial.ver",
        "logistica.ver",
    ),
    Perfil.COMERCIAL: ("comercial.ver", "comercial.gerir", "financeiro.ver"),
    Perfil.LOGISTICA: ("logistica.ver", "logistica.gerir", "imob.ver"),
    Perfil.RH: ("rh.ver", "rh.gerir"),
    Perfil.CONSULTA: (
        "contab.ver",
        "financeiro.ver",
        "comercial.ver",
        "logistica.ver",
        "imob.ver",
        "analitica.ver",
        "rh.ver",
        "empresa.ver",
    ),
}

# Prefixo de capacidade usado por cada módulo, para ligar Modulo <-> CAPS.
MODULO_PREFIXO_CAP: dict[Modulo, str] = {
    Modulo.CONTABILIDADE: "contab",
    Modulo.CONTAS_CORRENTES: "financeiro",
    Modulo.COMERCIAL: "comercial",
    Modulo.LOGISTICA: "logistica",
    Modulo.IMOBILIZADOS: "imob",
    Modulo.ANALITICA: "analitica",
    Modulo.RH: "rh",
    Modulo.FISCALIDADE: "contab",  # a Fiscalidade lê da contabilidade, como no Piloto
}


class EstadoEmpresa(StrEnum):
    ACTIVA = "activa"
    SUSPENSA = "suspensa"
    CANCELADA = "cancelada"


class EstadoLicenca(StrEnum):
    PENDENTE = "pendente"
    ACTIVA = "activa"
    EXPIRADA = "expirada"
    SUSPENSA = "suspensa"
    CANCELADA = "cancelada"


class RegimeIVA(StrEnum):
    """Regimes de IVA de Angola (REGIMES em app.js e fiscalidade.js)."""

    GERAL = "geral"
    SIMPLIFICADO = "simplificado"
    EXCLUSAO = "exclusao"


# Taxa de IVA por regime, como no Piloto (REGIMES em app.js).
TAXA_IVA_POR_REGIME: dict[RegimeIVA, int] = {
    RegimeIVA.GERAL: 14,
    RegimeIVA.SIMPLIFICADO: 7,
    RegimeIVA.EXCLUSAO: 0,
}
