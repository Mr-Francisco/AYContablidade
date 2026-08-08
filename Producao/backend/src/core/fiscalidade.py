"""Fiscalidade angolana: catálogo de impostos, regimes e obrigações.

Transposto de `Piloto/assets/js/fiscalidade.js`. Os dados de referência —
regimes de IVA e de Imposto Industrial, formas jurídicas, catálogo de impostos,
calendário e fontes — vivem em `data/fiscalidade.json`, extraídos do Piloto sem
os reescrever à mão; aqui ficam só as regras que operam sobre eles.

Isto pertence ao backend e não ao frontend por duas razões: são regras de
negócio (a lista de obrigações de uma empresa depende do seu enquadramento) e o
módulo de assistência precisa de as poder consultar sem duplicar a fonte.

ATENÇÃO: as taxas têm de ser confirmadas contra a legislação em vigor. Os
valores aqui são os que o Piloto trazia, com as fontes indicadas em `FONTES`.
"""

import json
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

_FICHEIRO = Path(__file__).parent / "data" / "fiscalidade.json"
_DADOS = json.loads(_FICHEIRO.read_text(encoding="utf-8"))

REGIMES_IVA: list[dict] = _DADOS["REGIMES_IVA"]
REGIMES_II: list[dict] = _DADOS["REGIMES_II"]
FORMAS: list[dict] = _DADOS["FORMAS"]
IMPOSTOS: list[dict] = _DADOS["IMPOSTOS"]
CALENDARIO: list[dict] = _DADOS["CALENDARIO"]
FONTES: list[dict] = _DADOS["FONTES"]

CENT = Decimal("0.01")


def r2(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def regime_iva(id_: str | None) -> dict:
    """Regime de IVA por id. Sem correspondência devolve o primeiro, como no
    Piloto — a não sujeição é o enquadramento mais restritivo e, por isso, o
    mais seguro para quem ainda não escolheu."""
    return next((r for r in REGIMES_IVA if r["id"] == id_), REGIMES_IVA[0])


def forma_juridica(id_: str | None) -> dict:
    """Forma jurídica por id. Por omissão a Lda., a mais comum."""
    return next((f for f in FORMAS if f["id"] == id_), FORMAS[1])


def imposto(sigla: str) -> dict | None:
    return next((i for i in IMPOSTOS if i["sigla"] == sigla), None)


def obrigacoes(cfg: dict | None = None) -> list[dict]:
    """Obrigações declarativas e de pagamento de uma empresa.

    `cfg`: forma, regime_iva, regime_ii, tem_empregados, paga_capitais,
    tem_imoveis_arrend.

    O regime petrolífero SUBSTITUI o Imposto Industrial (Lei 13/04) — não se
    acumula com ele. É por isso que o ramo é exclusivo e não aditivo.
    """
    cfg = cfg or {}
    lista: list[dict] = []

    def add(imp: str, obrigacao: str, periodicidade: str, prazo: str, cor: str) -> None:
        lista.append(
            {
                "imposto": imp,
                "obrigacao": obrigacao,
                "periodicidade": periodicidade,
                "prazo": prazo,
                "cor": cor,
            }
        )

    petro = cfg.get("forma") == "petrolifero"

    # ----- IVA -----
    ri = regime_iva(cfg.get("regime_iva") or "geral")
    if ri["id"] == "exclusao":
        add(
            "IVA",
            "Emissão de faturas com menção de não sujeição a IVA",
            "Contínua",
            "—",
            "#8a8a8a",
        )
    elif ri["id"] == "simplificado":
        add("IVA", "Declaração do Regime Simplificado do IVA", "Mensal",
            "Último dia útil do mês seguinte", "#d68910")
        add("IVA",
            "Pagamento de 7% sobre os recebimentos (deduzindo 10% do IVA suportado)",
            "Mensal", "Último dia útil do mês seguinte", "#d68910")
    else:
        add("IVA",
            "Declaração Periódica do IVA + anexos (fornecedores, clientes, existências)",
            "Mensal", "Último dia útil do mês seguinte", "#7a3aab")
        add("IVA", "Pagamento do IVA apurado (liquidado − dedutível)", "Mensal",
            "Último dia útil do mês seguinte", "#7a3aab")

    # ----- Imposto Industrial ou regime petrolífero -----
    if petro:
        add("PETRO",
            "Declarações e liquidações do regime fiscal petrolífero (IRP, produção, transação)",
            "Conforme contrato", "Conforme concessão", "#1a9c5f")
    else:
        rii = next(
            (r for r in REGIMES_II if r["id"] == (cfg.get("regime_ii") or "geral")),
            REGIMES_II[0],
        )
        if rii["id"] == "geral":
            add("II", "Declaração Modelo 1 (com DR, Balanço, Balancete e anexos)",
                "Anual", "Maio", "#1e5fcc")
            add("II", "Liquidação provisória — 2% sobre as vendas do 1.º semestre",
                "Anual", "Até fim de Agosto", "#1e5fcc")
        else:
            add("II", "Declaração Modelo 2 (Regime Simplificado)", "Anual",
                "Até fim de Abril", "#1e5fcc")
            add("II", "Liquidação provisória — 2% sobre as vendas do 1.º semestre",
                "Anual", "Até fim de Julho", "#1e5fcc")

    # ----- IRT e Segurança Social -----
    # `is not False` e não `if ...`: no Piloto a ausência da chave conta como
    # "tem empregados". Uma empresa sem pessoal é a excepção, não o normal.
    if cfg.get("tem_empregados") is not False:
        add("IRT", "Retenção e entrega do IRT dos trabalhadores", "Mensal",
            "Fim do mês seguinte", "#e6007e")
        add("IRT", "Mapa de Remunerações — Modelo IRT A2.1", "Mensal",
            "Fim do mês seguinte", "#e6007e")
        add("INSS",
            "Contribuição para a Segurança Social (3% trabalhador + 8% empresa)",
            "Mensal", "Até ao dia 10 do mês seguinte", "#b81893")

    if cfg.get("paga_capitais"):
        add("IAC", "Retenção e entrega do IAC (dividendos, juros, royalties)",
            "Mensal / por evento", "Fim do mês seguinte", "#7a3aab")

    if cfg.get("tem_imoveis_arrend"):
        add("IP", "Retenção de 25% sobre rendas e entrega do Imposto Predial",
            "Mensal", "Fim do mês seguinte", "#1a9c5f")

    add("IS", "Imposto de Selo sobre contratos, operações financeiras e garantias",
        "Por evento", "Fim do mês seguinte", "#8e44ad")

    if cfg.get("forma") == "sa":
        add("II",
            "Certificação legal de contas / auditoria e ata de aprovação de contas",
            "Anual", "Após a assembleia geral anual", "#1e5fcc")
    if cfg.get("forma") == "coop":
        add("II",
            "Comprovação dos requisitos de benefícios fiscais (isenções/reduções)",
            "Anual", "Com a declaração anual", "#1a9c5f")

    return lista


# ---------------------------------------------------------------------------
# Cálculos
# ---------------------------------------------------------------------------
def calc_ii(lucro_tributavel, taxa=None) -> Decimal:
    """Imposto Industrial: taxa × lucro tributável. 25% por omissão."""
    t = Decimal("25") if taxa is None else Decimal(str(taxa))
    return r2(Decimal(str(lucro_tributavel or 0)) * t / 100)


def calc_provisorio_ii(vendas_semestre) -> Decimal:
    """Liquidação provisória: 2% sobre as vendas do 1.º semestre."""
    return r2(Decimal(str(vendas_semestre or 0)) * Decimal("0.02"))


def calc_iva_simplificado(recebimentos, iva_suportado) -> Decimal:
    """Regime Simplificado: 7% dos recebimentos menos 10% do IVA suportado.

    A dedução é limitada a 10% — não é o IVA suportado inteiro. É a diferença
    que define o regime, e o erro fácil é deduzir tudo.
    """
    return r2(
        Decimal(str(recebimentos or 0)) * Decimal("0.07")
        - Decimal(str(iva_suportado or 0)) * Decimal("0.10")
    )


def calc_iva_geral(base_vendas, taxa=None, iva_dedutivel=0) -> Decimal:
    """Regime Geral: IVA liquidado menos IVA dedutível. 14% por omissão."""
    t = Decimal("14") if taxa is None else Decimal(str(taxa))
    return r2(
        Decimal(str(base_vendas or 0)) * t / 100 - Decimal(str(iva_dedutivel or 0))
    )
