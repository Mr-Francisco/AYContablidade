"""Plano Geral de Contabilidade de Angola (PGC-AR) e tabelas base.

Transposto literalmente de `Piloto/assets/js/contabilidade.js` — PLANO_DEFAULT,
DIARIOS_DEFAULT, DOCUMENTOS_DEFAULT, FLUXOS_DEFAULT, CENTROS_DEFAULT e PERIODOS.

ATENÇÃO ao plano de contas: no Piloto, as 55 páginas que carregam
`contabilidade.js` carregam SEMPRE `plano-primavera.js` antes dele, pelo que o
plano efectivamente usado é o do Primavera (1619 contas) e o `PLANO_DEFAULT`
abaixo (93 contas) é um recurso que nunca chega a correr.

Isto não é um detalhe de arrumação. As demonstrações financeiras estão escritas
para a estrutura do Primavera — a Demonstração de Resultados soma `62` para
prestações de serviços e `73` para amortizações, o Apuramento de Resultados
exige `881`–`886` e `8111`, e o Apuramento do IVA exige `3452`/`3453`/`3454`.
Nenhuma dessas contas existe no PLANO_DEFAULT, onde serviços são `612` e
amortizações `74`. Com o plano base, a DR daria zeros e o apuramento rebentaria.

Por isso `seed_empresa` usa o plano do Primavera por omissão, como o Piloto.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import NamedTuple

_DATA = Path(__file__).parent / "data"

# ---------------------------------------------------------------------------
# Classes do PGC
# ---------------------------------------------------------------------------
CLASSES: dict[str, tuple[str, str]] = {
    "1": ("Meios Fixos e Investimentos", "D"),
    "2": ("Existências", "D"),
    "3": ("Terceiros", "M"),
    "4": ("Disponibilidades", "D"),
    "5": ("Capital e Reservas", "C"),
    "6": ("Proveitos e Ganhos por Natureza", "C"),
    "7": ("Custos e Perdas por Natureza", "D"),
    "8": ("Resultados", "M"),
    "9": ("Contabilidade Analítica", "M"),
}

# Prefixos que são credores apesar da classe a que pertencem: amortizações e
# provisões (contra-activos) e as contas de terceiros credoras.
_PREFIXOS_CREDORES = ("18", "19", "28", "32", "33", "36", "37")


def classe_de(codigo: str) -> str:
    return str(codigo or "")[:1]


def classe_nome(codigo: str) -> str:
    c = CLASSES.get(classe_de(codigo))
    return c[0] if c else ""


def natureza_conta(codigo: str) -> str:
    """Natureza esperada do saldo: D devedora, C credora, M mista.

    Réplica de `naturezaConta()`. A ordem importa: os prefixos credores têm de
    ser testados ANTES da classe, senão 18 (Amortizações Acumuladas) sairia
    devedora por ser da classe 1.
    """
    c = str(codigo or "")
    if c.startswith(_PREFIXOS_CREDORES):
        return "C"
    classe = CLASSES.get(classe_de(c))
    return classe[1] if classe else "D"


# ---------------------------------------------------------------------------
# Plano de contas por omissão
# ---------------------------------------------------------------------------
PLANO_DEFAULT: tuple[tuple[str, str], ...] = (
    # Classe 1 — Meios Fixos e Investimentos
    ("11", "Imobilizações Corpóreas"),
    ("111", "Terrenos e recursos naturais"),
    ("112", "Edifícios e outras construções"),
    ("113", "Equipamento básico"),
    ("114", "Equipamento de transporte"),
    ("115", "Equipamento administrativo"),
    ("118", "Outras imobilizações corpóreas"),
    ("12", "Imobilizações Incorpóreas"),
    ("121", "Trespasses"),
    ("122", "Despesas de instalação"),
    ("13", "Investimentos Financeiros"),
    ("14", "Imobilizações em Curso"),
    ("18", "Amortizações Acumuladas"),
    ("181", "Amort. de imobilizações corpóreas"),
    ("182", "Amort. de imobilizações incorpóreas"),
    ("19", "Provisões para Investimentos"),
    # Classe 2 — Existências
    ("21", "Compras"),
    ("211", "Compras de mercadorias"),
    ("21121", "Compras de mercadorias — nacionais"),
    ("217", "Devoluções de compras"),
    ("21721", "Devoluções de compras"),
    ("218", "Descontos e abatimentos em compras"),
    ("21821", "Descontos comerciais em compras"),
    ("22", "Matérias-primas, subsidiárias e de consumo"),
    ("23", "Produtos e trabalhos em curso"),
    ("24", "Produtos acabados e intermédios"),
    ("26", "Mercadorias"),
    ("28", "Adiantamentos por conta de compras"),
    # Classe 3 — Terceiros
    ("31", "Clientes"),
    ("311", "Clientes c/ corrente"),
    ("31121", "Clientes nacionais c/c"),
    ("318", "Adiantamentos de clientes"),
    ("319", "Clientes de cobrança duvidosa"),
    ("32", "Fornecedores"),
    ("321", "Fornecedores c/ corrente"),
    ("32121", "Fornecedores nacionais c/c"),
    ("32122", "Fornecedores estrangeiros c/c"),
    ("328", "Adiantamentos a fornecedores"),
    ("33", "Empréstimos"),
    ("34", "Estado"),
    ("341", "IVA"),
    ("3411", "IVA — a pagar"),
    ("3412", "IVA — a recuperar"),
    ("342", "Retenções de impostos (IRT)"),
    ("343", "Imposto Industrial"),
    ("36", "Pessoal"),
    ("361", "Remunerações a pagar"),
    ("365", "Segurança Social (INSS)"),
    ("37", "Fornecedores de Imobilizado"),
    ("371", "Fornecedores de imobilizado c/c"),
    ("38", "Outros devedores e credores"),
    ("39", "Provisões para cobranças duvidosas"),
    # Classe 4 — Meios Monetários
    ("41", "Títulos negociáveis"),
    ("42", "Depósitos a prazo"),
    ("43", "Depósitos à ordem (Bancos)"),
    ("431", "Banco — Conta principal"),
    ("43101", "Banco — Conta cheques"),
    ("45", "Caixa"),
    ("451", "Caixa"),
    ("4511", "Caixa AKZ"),
    ("4512", "Caixa USD"),
    # Classe 5 — Capital e Reservas
    ("51", "Capital"),
    ("55", "Reservas"),
    ("56", "Resultados transitados"),
    ("59", "Resultado líquido do exercício"),
    # Classe 6 — Proveitos e Ganhos por Natureza
    ("61", "Vendas"),
    ("611", "Vendas de mercadorias"),
    ("612", "Prestações de serviços"),
    ("613", "Vendas — outros mercados"),
    ("66", "Outros proveitos operacionais"),
    ("68", "Proveitos e ganhos financeiros"),
    ("69", "Proveitos e ganhos extraordinários"),
    # Classe 7 — Custos e Perdas por Natureza
    ("71", "Custo das existências vendidas e consumidas"),
    ("72", "Fornecimentos e serviços de terceiros"),
    ("721", "Subcontratos"),
    ("722", "Electricidade, água e combustíveis"),
    ("723", "Rendas e alugueres"),
    ("725", "Comunicação"),
    ("726", "Deslocações e transportes"),
    ("73", "Custos com o pessoal"),
    ("731", "Remunerações dos órgãos sociais"),
    ("732", "Remunerações do pessoal"),
    ("735", "Encargos sobre remunerações (INSS)"),
    ("74", "Amortizações do exercício"),
    ("75", "Provisões do exercício"),
    ("76", "Custos e perdas financeiras"),
    ("77", "Impostos"),
    ("79", "Custos e perdas extraordinárias"),
    # Classe 8 — Resultados
    ("81", "Resultados operacionais"),
    ("82", "Resultados financeiros"),
    ("84", "Resultados extraordinários"),
    ("85", "Resultado antes de impostos"),
    ("88", "Resultado líquido do exercício"),
)


@lru_cache
def plano_primavera() -> tuple[dict, ...]:
    """Plano de contas do Primavera (1619 contas), extraído de
    `Piloto/assets/js/plano-primavera.js`.

    Cada entrada tem `codigo`, `nome`, `tipo` (R raiz / I integradora /
    M movimento) e `classe_iva` quando o plano a define.

    É o plano de arranque por omissão — ver a nota no topo do módulo.
    """
    ficheiro = _DATA / "plano_primavera.json"
    return tuple(json.loads(ficheiro.read_text(encoding="utf-8")))


# ---------------------------------------------------------------------------
# Diários
# ---------------------------------------------------------------------------
CATEGORIAS_DIARIO: tuple[tuple[str, str], ...] = (
    ("compras", "Compras"),
    ("vendas", "Vendas"),
    ("caixa_bancos", "Tesouraria / Caixa e Bancos"),
    ("imobilizado", "Imobilizado"),
    ("rh", "Recursos Humanos"),
    ("outros", "Outros / Diversos"),
)

DIARIOS_DEFAULT: tuple[tuple[str, str, str], ...] = (
    ("10", "Abertura", "outros"),
    ("21", "Compras", "compras"),
    ("22", "Compras (Internacional)", "compras"),
    ("23", "Compras (Notas de Crédito)", "compras"),
    ("24", "Compras (Notas de Débito)", "compras"),
    ("34", "Apuramento do IVA", "outros"),
    ("36", "Salários", "rh"),
    ("37", "Imobilizado (Compras/Vendas)", "imobilizado"),
    ("43", "Bancos", "caixa_bancos"),
    ("45", "Caixa", "caixa_bancos"),
    ("51", "Vendas — Acertos", "vendas"),
    ("56", "Vendas a Dinheiro", "vendas"),
    ("60", "Vendas OM", "vendas"),
    ("61", "Vendas / Prestação de Serviços", "vendas"),
    ("63", "Regularizações", "outros"),
    ("69", "Reavaliações", "outros"),
    ("71", "Regularizações (Custos Diferidos)", "imobilizado"),
    ("81", "Apuramento de Resultados", "outros"),
    ("82", "Apuramento de Resultados (Imposto)", "outros"),
    ("90", "Operações Diversas", "outros"),
)


class DocDefault(NamedTuple):
    codigo: str
    descricao: str
    diario: str
    conta_debito: str
    conta_credito: str
    retencao: bool


DOCUMENTOS_DEFAULT: tuple[DocDefault, ...] = tuple(
    DocDefault(*d)
    for d in (
        ("101", "Abertura", "10", "", "", False),
        ("455", "Caixa AKZ — Pagamentos", "45", "", "4511", False),
        ("456", "Caixa AKZ — Recebimentos", "45", "4511", "", False),
        ("457", "Caixa USD — Pagamentos", "45", "", "4512", False),
        ("458", "Caixa USD — Recebimentos", "45", "4512", "", False),
        ("431", "Bancos — Depósitos", "43", "43101", "", False),
        ("432", "Bancos — Cheques", "43", "", "43101", False),
        ("433", "Bancos — Pag. Automáticos", "43", "", "43101", False),
        ("434", "Bancos — Pag. Pessoal", "43", "", "43101", False),
        ("435", "Outros Docs. Bancários", "43", "", "", False),
        ("211", "Compras VFA — Vossa Fatura a Crédito", "21", "21121", "32121", False),
        ("212", "Compras VFC — Vossa Fatura de Custos FST", "21", "", "32121", False),
        ("213", "Compras VFO — Vossa Fatura de Outros Materiais", "21", "21121", "", False),
        ("214", "Compras VFS — Vossa Fatura de Serviço", "21", "72", "32121", False),
        ("215", "Compras VFI — Vossa Fatura Internacional", "22", "21121", "32122", False),
        ("216", "Compras — Nota de Crédito", "23", "", "32121", False),
        ("217", "Compras — Devolução", "23", "", "21721", False),
        ("218", "Compras — Desconto Comercial", "23", "", "21821", False),
        ("219", "Compras — Nota de Débito", "24", "32121", "", False),
        ("220", "Receção / Entrada de Stock (Logística)", "21", "2611", "32121", False),
        ("371", "Compra de Imobilizados VFE", "37", "114", "371", True),
        ("611", "Vendas MN — n/Fatura", "61", "311", "611", False),
        ("612", "Prest. Serviços MN — n/Fatura", "61", "311", "612", True),
        ("613", "Vendas MN — n/Nota de Crédito", "61", "611", "311", False),
        ("614", "Vendas MN — n/Nota de Débito", "61", "311", "611", False),
        ("631", "Vendas OM — n/Fatura", "60", "311", "613", False),
        ("372", "Imobilizado MN — n/Fatura", "37", "311", "114", False),
        ("561", "Venda a Dinheiro MN — n/V.D.", "56", "4511", "611", False),
        ("511", "Vendas — Acertos", "51", "", "", False),
        ("361", "Salários — Vencimentos", "36", "732", "361", False),
        ("362", "Salários — Subsídio de Férias", "36", "732", "361", False),
        ("363", "Salários — Subsídio de Natal", "36", "732", "361", False),
        ("364", "Salários — Vencimentos Extraordinários", "36", "732", "361", False),
        ("621", "Apuramento do IVA", "34", "3411", "3412", False),
        ("632", "Regularizações Mensais", "63", "", "", False),
        ("691", "Reavaliações", "69", "", "", False),
        ("711", "Reg. — Custos Diferidos c/ Pessoal", "71", "", "", False),
        ("712", "Reg. — Outros Custos Diferidos", "71", "", "", False),
        ("713", "Reg. — Amortizações", "71", "74", "18", False),
        ("714", "Reg. — CVMC", "71", "71", "26", False),
        ("715", "Outras Regularizações", "71", "", "", False),
        ("811", "Ap. Resultados — Operacionais", "81", "", "", False),
        ("812", "Ap. Resultados — Financeiros", "81", "", "", False),
        ("813", "Ap. Resultados — Correntes", "81", "", "", False),
        ("814", "Ap. Resultados — Extraordinários", "81", "", "", False),
        ("815", "Ap. Resultados — Antes de Impostos", "81", "", "", False),
        ("816", "Ap. Resultados — Filiais e Associadas", "81", "", "", False),
        ("817", "Ap. Resultados — Não Operacionais", "81", "", "", False),
        ("821", "Apuramento de Imposto", "82", "", "", False),
        ("822", "Ap. Resultados — Líquidos", "82", "", "", False),
        ("921", "Operações Diversas", "90", "", "", False),
        ("901", "Saída de Stock — CMVMC (Logística)", "90", "7111", "2611", False),
        ("902", "Ajuste de Inventário (Logística)", "90", "2611", "7111", False),
        ("903", "Acerto de Stock — Positivo (Logística)", "90", "2611", "6804", False),
        ("904", "Acerto de Stock — Negativo (Logística)", "90", "78041", "2611", False),
    )
)

# ---------------------------------------------------------------------------
# Fluxos de caixa — tipo: R raiz/actividade, I intermédio, M movimento
# ---------------------------------------------------------------------------
FLUXOS_DEFAULT: tuple[tuple[str, str, str], ...] = (
    ("1", "ACTIVIDADES OPERACIONAIS", "R"),
    ("11", "Operacionais", "I"),
    ("1100", "Recebimento de Clientes", "M"),
    ("1101", "Pagamentos a Fornecedores", "M"),
    ("1102", "Pagamentos a Pessoal", "M"),
    ("12", "Outras operações", "I"),
    ("1200", "Juros", "M"),
    ("1202", "Impostos", "M"),
    ("13", "Rúbricas extraordinárias", "I"),
    ("1300", "Recebimentos Rúbricas Extraord.", "M"),
    ("1302", "Pagamentos Rúbricas Extraord.", "M"),
    ("2", "ACTIVIDADES DE INVESTIMENTO", "R"),
    ("21", "Recebimentos", "I"),
    ("2100", "Imobilizações corpóreas", "M"),
    ("2101", "Imobilizações incorpóreas", "M"),
    ("2102", "Investimentos Financeiros", "M"),
    ("2103", "Subsídios de Investimento", "M"),
    ("2104", "Juros e Proveitos Similares", "M"),
    ("2105", "Dividendos ou lucros recebidos", "M"),
    ("22", "Pagamentos", "I"),
    ("2200", "Imobilizações corpóreas", "M"),
    ("2201", "Imobilizações incorpóreas", "M"),
    ("2202", "Investimentos financeiros", "M"),
    ("3", "ACTIVIDADES DE FINANCIAMENTO", "R"),
    ("31", "Recebimentos", "I"),
    ("3100", "Aumentos de Capital / Prest. Sup.", "M"),
    ("3102", "Cobertura de Prejuízos", "M"),
    ("3103", "Empréstimos obtidos", "M"),
    ("3104", "Subsídios à exploração e doações", "M"),
    ("32", "Pagamentos", "I"),
    ("3200", "Reduções de Capital / Prest. Sup.", "M"),
    ("3201", "Compras de acções ou quotas próprias", "M"),
    ("3202", "Dividendos ou lucros pagos", "M"),
    ("3204", "Amort. de contratos de locação financeira", "M"),
    ("3205", "Juros e custos similares pagos", "M"),
)

# ---------------------------------------------------------------------------
# Centros de custo
# ---------------------------------------------------------------------------
CENTROS_DEFAULT: tuple[tuple[str, str, str], ...] = (
    ("ADM", "Administração e Gestão", "custo"),
    ("COM", "Comercial e Marketing", "custo"),
    ("PROD", "Produção / Operações", "custo"),
    ("LOG", "Logística e Armazém", "custo"),
    ("RH", "Recursos Humanos", "custo"),
    ("FIN", "Financeiro e Tesouraria", "custo"),
)

# ---------------------------------------------------------------------------
# Períodos contabilísticos 00–15
# ---------------------------------------------------------------------------
# 00 abertura · 01-12 meses · 13 regularizações · 14/15 apuramentos.
# NÃO é derivável da data: 13, 14 e 15 não correspondem a nenhum mês.
PERIODOS: tuple[tuple[str, str], ...] = (
    ("00", "Abertura"),
    ("01", "Janeiro"), ("02", "Fevereiro"), ("03", "Março"), ("04", "Abril"),
    ("05", "Maio"), ("06", "Junho"), ("07", "Julho"), ("08", "Agosto"),
    ("09", "Setembro"), ("10", "Outubro"), ("11", "Novembro"), ("12", "Dezembro"),
    ("13", "Regularizações"),
    ("14", "Apuramento de Resultados"),
    ("15", "Apuramento de Imposto e Resultado Líquido"),
)

_PERIODO_LABEL = dict(PERIODOS)


def periodo_label(mm: str) -> str:
    return _PERIODO_LABEL.get(str(mm), str(mm or ""))
