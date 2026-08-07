"""Tabelas fiscais e configuração por omissão dos Recursos Humanos (Angola).

Transposto de `Piloto/assets/js/rh.js`.

A tabela do IRT é gravada na configuração da empresa e é editável — muda com a
lei, e o utilizador tem de poder corrigi-la sem esperar por um deploy. O que
está aqui é só o valor de arranque.
"""

from decimal import Decimal

# Versão da tabela em vigor. Se a configuração gravada tiver outra versão, é
# actualizada para esta — o mesmo mecanismo de migração do Piloto.
IRT_VERSAO = "2026-oficial-v2"

# Tabela Mensal do IRT — Lei n.º 14/25, de 30 de Dezembro (OGE 2026).
# IRT = Parcela Fixa + Taxa × (matéria colectável − Excesso de).
# `ate: None` = último escalão, sem limite superior.
IRT_DEFAULT: tuple[dict, ...] = (
    {"ate": "150000", "fixa": "0", "taxa": "0", "de": "0"},
    {"ate": "200000", "fixa": "12500", "taxa": "16", "de": "150000"},
    {"ate": "300000", "fixa": "31250", "taxa": "18", "de": "200000"},
    {"ate": "500000", "fixa": "49250", "taxa": "19", "de": "300000"},
    {"ate": "1000000", "fixa": "87250", "taxa": "20", "de": "500000"},
    {"ate": "1500000", "fixa": "187250", "taxa": "21", "de": "1000000"},
    {"ate": "2000000", "fixa": "292250", "taxa": "22", "de": "1500000"},
    {"ate": "2500000", "fixa": "402250", "taxa": "23", "de": "2000000"},
    {"ate": "5000000", "fixa": "517250", "taxa": "24", "de": "2500000"},
    {"ate": "10000000", "fixa": "1117250", "taxa": "24.5", "de": "5000000"},
    {"ate": None, "fixa": "2342250", "taxa": "25", "de": "10000000"},
)

# IRPS — entra em vigor a 01-01-2027, substituindo o IRT. Informativo por agora:
# o sistema continua a calcular pelo IRT até essa data.
IRPS_INFO: dict = {
    "vigor": "01-01-2027",
    "isencao": "150000",
    "escaloes": (
        {"de": "0", "ate": "150000", "taxa": "0", "fixa": "0"},
        {"de": "150000", "ate": "500000", "taxa": "16", "fixa": "0"},
        {"de": "500000", "ate": "1500000", "taxa": "19", "fixa": "56000"},
        {"de": "1500000", "ate": "2500000", "taxa": "22", "fixa": "246000"},
        {"de": "2500000", "ate": "20000000", "taxa": "25", "fixa": "466000"},
        {"de": "20000000", "ate": None, "taxa": "30", "fixa": "4841000"},
    ),
    "retencoes": (
        {"tipo": "Rendimentos empresariais e profissionais", "taxa": "6,5%"},
        {"tipo": "Rendimentos de capitais", "taxa": "10% ou 15%"},
        {"tipo": "Rendimentos prediais", "taxa": "25%"},
        {"tipo": "Incrementos patrimoniais (geral)", "taxa": "10%"},
    ),
    "deducoes": (
        "Despesas de educação",
        "Despesas de saúde",
        "Renda de habitação",
    ),
}


def cfg_rh_default() -> dict:
    """Configuração de RH por omissão. Guardada em
    `ConfigEmpresa.parametrizacoes["rh"]`."""
    return {
        # Segurança Social: 3% trabalhador, 8% empresa.
        "inss_trab": "3",
        "inss_empr": "8",
        "irt_versao": IRT_VERSAO,
        "irt": [dict(b) for b in IRT_DEFAULT],
        # Processamento salarial
        "conta_custo": "7211",
        "conta_pagar": "36121",
        "conta_irt": "3413",
        "conta_inss": "3492",
        "diario": "36",
        "documento": "361",
        # Pagamento dos líquidos
        "conta_banco": "43101",
        "diario_pag": "43",
        "documento_pag": "434",
        # Honorários a independentes
        "conta_custo_hon": "752341",
        "conta_pagar_hon": "32121",
        "conta_irt_hon": "3413",
        "taxa_ret_hon": "6.5",
        "diario_hon": "21",
        "documento_hon": "214",
    }


# Rubricas do Mapa de Remunerações — Modelo IRT A2.1 (AGT).
# A distinção é o que determina a matéria colectável: só os sujeitos entram.
SUBS_NAO_SUJEITOS: tuple[str, ...] = (
    "sub_alimentacao",
    "sub_transporte",
    "abono_familia",
    "reembolso_despesas",
    "outros_nao_sujeitos",
)

SUBS_SUJEITOS: tuple[str, ...] = (
    "abono_falhas",
    "sub_renda_casa",
    "compensacao_rescisao",
    "sub_ferias",
    "horas_extras",
    "sub_atavio",
    "sub_representacao",
    "premios",
    "sub_natal",
    "outros_sujeitos",
)


def d(v) -> Decimal:
    """Converte para Decimal aceitando string, número ou None."""
    if v is None or v == "":
        return Decimal("0")
    return Decimal(str(v))
