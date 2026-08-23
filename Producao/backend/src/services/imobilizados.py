"""Imobilizados: activos fixos e amortizações.

Transposto de `Piloto/assets/js/imobilizados.js`.

Métodos: Quotas Constantes (base) e Quotas Decrescentes (simplificado, com
coeficiente por vida útil). O método decrescente aqui NÃO comuta para quotas
constantes no fim da vida útil — é a mesma simplificação do Piloto.
"""

from datetime import date as Date
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.db.models.imobilizados import (
    Ativo,
    ItemImobilizado,
    ProcessoAmortizacao,
)
from src.db.models.tenancy import ConfigEmpresa
from src.services.notificacoes import notificar, resolver
from src.services.contabilidade import ErroContabilistico, postar

ZERO = Decimal("0")
CENT = Decimal("0.01")

METODOS = (("quotas", "Quotas Constantes"), ("degressivas", "Quotas Decrescentes"))


def r2(v) -> Decimal:
    return Decimal(v).quantize(CENT, rounding=ROUND_HALF_UP)


#: Os três tipos de imobilizado, e o que decidem.
TIPOS_IMOBILIZADO = ("corporeo", "incorporeo", "financeiro")

TIPO_LABEL = {
    "corporeo": "Imobilizado Corpóreo",
    "incorporeo": "Imobilizado Incorpóreo",
    "financeiro": "Investimento Financeiro",
}

#: O dígito do tipo dentro de `371 Compras de Imobilizado`.
#:
#: O PLANO ESTÁ ORGANIZADO EM 3 × 2 e foi lido do próprio plano, não suposto:
#:
#:     371 Compras de Imobilizado
#:     ├── 3711 Corpóreo    → 37112 Não grupo → 371121 Nacionais · 371122 Estrangeiros
#:     ├── 3712 Incorpóreo  → 37122 Não grupo → 371221 Nacionais · 371222 Estrangeiros
#:     └── 3713 Financeiro  → 37132 Não grupo → 371321 Nacionais · 371322 Estrangeiros
#:
#: A regra é `371` + tipo + `2` (não grupo) + nacionalidade. A lista que veio no
#: pedido trocava os códigos entre si — `371122` estava dado como investimento
#: financeiro e é Corpóreo/Estrangeiros — e omitia as duas do Incorpóreo. O
#: cliente confirmou que o plano é que manda.
_DIGITO_DO_TIPO = {"corporeo": "1", "incorporeo": "2", "financeiro": "3"}

#: A classe de destino de cada tipo, para onde o imobilizado em curso vai.
#: `11` Corpóreas, `12` Incorpóreas, `13` Investimentos Financeiros.
CLASSE_DE_DESTINO = {"corporeo": "11", "incorporeo": "12", "financeiro": "13"}


def conta_compra_imobilizado(tipo: str, categoria_fornecedor: str) -> str | None:
    """A conta de compra, pelo tipo do bem e pela origem do fornecedor.

    Devolve `None` quando não há como decidir — sem tipo, ou com uma categoria
    que não seja nacional nem estrangeiro. Devolver uma conta por omissão nesse
    caso seria escolher por quem não escolheu, e a conta errada de compra de
    imobilizado não dá erro: dá um balancete que parece bom.
    """
    digito = _DIGITO_DO_TIPO.get((tipo or "").strip().lower())
    if not digito:
        return None
    nacionalidade = {"nacional": "1", "estrangeiro": "2"}.get(
        (categoria_fornecedor or "").strip().lower()
    )
    if not nacionalidade:
        return None
    return f"371{digito}2{nacionalidade}"


def valor_acumulado(db: Session, ativo: Ativo) -> Decimal:
    """A soma dos itens — o que a obra já custou até agora."""
    total = db.scalar(
        select(func.coalesce(func.sum(ItemImobilizado.valor), 0)).where(
            ItemImobilizado.ativo_id == ativo.id
        )
    )
    return r2(total or ZERO)


def fechar_e_transferir(
    db: Session,
    *,
    empresa_id: UUID,
    ativo: Ativo,
    conta_destino: str,
    data: Date,
    exercicio_id: UUID | None = None,
    por: str | None = None,
) -> dict:
    """Fecha o imobilizado em curso e transfere-o para o património.

    O QUE MOVIMENTA, e é o que foi pedido: credita a conta do activo em curso
    — a sua própria, `141001` e não a mãe `141` — e debita a conta de
    imobilizado indicada, dentro de `11`, `12` ou `13` conforme o tipo.

    O LANÇAMENTO NASCE DIFERIDO. Foi o que se pediu: «lança na contabilidade
    mas em movimentos diferidos, o contabilista indica a conta onde vai
    efectivamente ser colocado». Um lançamento diferido existe, é visível e
    fica à espera — não entra no balancete, no razão nem nos mapas enquanto a
    contabilidade não o integrar. Assim quem fecha a obra não fica à espera da
    contabilidade, e a contabilidade não fica com um lançamento feito à sua
    revelia.

    O VALOR DE AQUISIÇÃO PASSA A SER O ACUMULADO. É o que o activo custou, e é
    sobre ele que a amortização vai incidir daqui em diante.
    """
    from src.db.models.contabilidade import Conta

    if not ativo.em_curso:
        raise ErroContabilistico(
            "Este activo não está em curso — já faz parte do património."
        )

    total = valor_acumulado(db, ativo)
    if total <= ZERO:
        raise ErroContabilistico(
            "A obra ainda não tem custos registados. Acrescente pelo menos um "
            "item antes de a fechar — senão não há valor nenhum a transferir."
        )

    origem = ativo.conta_imob
    if not origem:
        raise ErroContabilistico(
            "Este activo não tem conta própria de imobilizado em curso. Grave "
            "a ficha antes de a fechar."
        )

    destino = (conta_destino or "").strip()
    classe = CLASSE_DE_DESTINO.get((ativo.tipo_imobilizado or "").lower())
    if not destino:
        raise ErroContabilistico(
            "Indique a conta de imobilizado para onde a obra vai ser "
            "transferida."
        )
    # A CLASSE TEM DE BATER COM O TIPO. Um edifício transferido para uma conta
    # de investimentos financeiros não dá erro nenhum: dá um balanço que diz
    # que a empresa tem participações que não tem.
    if classe and not destino.startswith(classe):
        raise ErroContabilistico(
            f"A conta {destino} não pertence a "
            f"{TIPO_LABEL.get(ativo.tipo_imobilizado, ativo.tipo_imobilizado)}, "
            f"que agrupa na classe {classe}. Escolha uma conta da classe "
            f"{classe}."
        )

    existe = db.scalar(
        select(Conta).where(Conta.empresa_id == empresa_id, Conta.codigo == destino)
    )
    if existe is None:
        raise ErroContabilistico(
            f"A conta {destino} não existe no plano de contas desta empresa."
        )

    cfg = cfg_imob(db, empresa_id)
    lanc = postar(
        db,
        empresa_id=empresa_id,
        data=data,
        diario_codigo=cfg["diario"],
        documento_codigo=cfg["documento"],
        descricao=f"Transferência de imobilizado em curso — {ativo.designacao}",
        documento_ref=ativo.codigo,
        origem="imobilizado",
        exercicio_id=exercicio_id,
        # À ESPERA DA CONTABILIDADE, de propósito. Ver o docstring.
        diferido=True,
        criado_por=por,
        linhas=[
            {
                "conta_codigo": destino,
                "debito": total,
                "descricao": ativo.designacao,
            },
            {
                "conta_codigo": origem,
                "credito": total,
                "descricao": f"Transferência de {ativo.designacao}",
            },
        ],
    )

    ativo.em_curso = False
    ativo.fechado_em = data
    ativo.conta_destino = destino
    ativo.conta_imob = destino
    ativo.valor_aquisicao = total
    # A DATA DE AQUISIÇÃO só se preenche se estiver vazia: numa obra, a data
    # que interessa pode ser a da primeira despesa, e quem a tiver escrito na
    # ficha não a quer perder por causa do fecho.
    if ativo.data_aquisicao is None:
        ativo.data_aquisicao = data
    db.flush()

    return {
        "ativo_id": ativo.id,
        "lancamento_id": lanc.id,
        "valor_transferido": total,
        "conta_origem": origem,
        "conta_destino": destino,
        "diferido": True,
    }


def cfg_imob_default() -> dict:
    return {
        "diario": "71",
        "documento": "713",
        # AS CONTAS DE IMOBILIZADO EM CURSO, como o cliente as indicou.
        #
        # `141` e `142` existem no plano (ambas «Obra em curso»); `143` NÃO
        # existe. Ficam aqui como parametrização e não fixas no código, para
        # que uma empresa cujo plano difira as possa apontar a outro sítio sem
        # tocar no programa — e para que a falta de uma se resolva na
        # parametrização em vez de rebentar a meio de um fecho.
        "conta_curso_corporeo": "141",
        "conta_curso_incorporeo": "142",
        "conta_curso_financeiro": "143",
    }


def conta_em_curso(tipo: str, cfg: dict) -> str | None:
    """A conta PRINCIPAL do tipo — a mãe, não a que recebe movimentos.

    `141` corpóreo, `142` incorpóreo, `143` investimento financeiro. Debaixo
    dela é que nasce a conta de cada ficha; ver `conta_em_curso_do_ativo`.
    """
    chave = {
        "corporeo": "conta_curso_corporeo",
        "incorporeo": "conta_curso_incorporeo",
        "financeiro": "conta_curso_financeiro",
    }.get((tipo or "").strip().lower())
    if not chave:
        return None
    return (cfg.get(chave) or "").strip() or None


def conta_em_curso_do_ativo(
    db: Session, empresa_id: UUID, ativo: Ativo, cfg: dict
) -> str:
    """A conta PRÓPRIA desta ficha, debaixo da conta principal do seu tipo.

    CADA FICHA É UMA CONTA. Comprar um computador cria `141001 Computador X`;
    o computador seguinte cria `141002 Computador Y`. A conta principal —
    `141` — não recebe movimentos: agrupa.

    É a mesma mecânica das contas correntes de clientes e fornecedores, e pela
    mesma razão: sem conta própria, todos os imobilizados em curso somavam no
    mesmo saldo e não havia como saber quanto já custou cada obra. Ao fechar
    uma delas era preciso adivinhar que parte do saldo lhe pertencia.

    `criar_subconta` trata do resto: a PRIMEIRA subconta converte a mãe em
    integradora e leva-lhe os movimentos que ela já tivesse — senão a mãe
    ficava integradora com saldo próprio, que é o estado que o balancete conta
    duas vezes.
    """
    from src.services.contabilidade import criar_subconta, proxima_subconta
    from src.db.models.contabilidade import Conta

    tipo = (ativo.tipo_imobilizado or "").strip().lower()
    if not tipo:
        raise ErroContabilistico(
            "Indique o tipo de imobilizado — corpóreo, incorpóreo ou "
            "investimento financeiro. É ele que determina em que conta o "
            "activo vai ser agrupado."
        )

    mae = conta_em_curso(tipo, cfg)
    if not mae:
        raise ErroContabilistico(
            f"Não está indicada a conta de imobilizado em curso para "
            f"{TIPO_LABEL.get(tipo, tipo)}. Defina-a nas parametrizações dos "
            "imobilizados."
        )

    existe = db.scalar(
        select(Conta).where(Conta.empresa_id == empresa_id, Conta.codigo == mae)
    )
    if existe is None:
        raise ErroContabilistico(
            f"A conta {mae}, onde os {TIPO_LABEL.get(tipo, tipo).lower()} em "
            "curso são agrupados, não existe no plano de contas desta "
            "empresa. Crie-a no Plano de Contas, ou indique outra nas "
            "parametrizações dos imobilizados."
        )

    # A que já tem, se ainda pertencer a esta mãe. Mudar o tipo de uma ficha
    # com movimentos não muda a conta antiga: o que já foi lançado fica onde
    # está, e a conta nova nasce daí para a frente.
    if (
        ativo.conta_imob
        and ativo.conta_imob != mae
        and ativo.conta_imob.startswith(mae)
    ):
        return ativo.conta_imob

    codigo = proxima_subconta(db, empresa_id, mae)
    criar_subconta(db, empresa_id, mae, codigo, ativo.designacao)
    ativo.conta_imob = codigo
    db.flush()
    return codigo


def cfg_imob(db: Session, empresa_id: UUID) -> dict:
    cfg = db.scalar(select(ConfigEmpresa).where(ConfigEmpresa.empresa_id == empresa_id))
    base = cfg_imob_default()
    if cfg is None:
        return base
    return {**base, **((cfg.parametrizacoes or {}).get("imob") or {})}


# ---------------------------------------------------------------------------
# Cálculo
# ---------------------------------------------------------------------------
def coef_degressivo(vida_util_anos: Decimal) -> Decimal:
    """Coeficiente das quotas decrescentes, por vida útil estimada."""
    if vida_util_anos <= 5:
        return Decimal("1.5")
    if vida_util_anos <= 6:
        return Decimal("2")
    return Decimal("2.5")


def base_amortizavel(a: Ativo) -> Decimal:
    """O valor sobre o qual a amortização incide.

    É o valor de aquisição — SALVO havendo condições especiais, e aí é o valor
    indicado na ficha. Foi o que se pediu: com condições especiais, o sistema
    não pode assumir que todo o activo é amortizável.

    Sem condições especiais, ou com elas mas sem valor indicado, mantém-se o
    valor de aquisição. Assumir zero calaria a amortização de um activo por um
    campo que ficou por preencher, e isso não se nota até ao fecho do
    exercício.
    """
    if a.condicoes_especiais and a.valor_sujeito_amortizacao is not None:
        return r2(a.valor_sujeito_amortizacao)
    return r2(a.valor_aquisicao or ZERO)


def valor_liquido(a: Ativo) -> Decimal:
    """O que falta amortizar.

    Conta a partir da BASE AMORTIZÁVEL e não do valor de aquisição: com
    condições especiais, a parte não sujeita fica no activo e nunca entra na
    amortização — se entrasse aqui, o activo continuava a amortizar depois de a
    parte sujeita estar esgotada.
    """
    return r2(base_amortizavel(a) - (a.amort_acumulada or ZERO))


def amort_anual(a: Ativo) -> Decimal:
    """Quota anual.

    Nas quotas constantes incide sobre a BASE AMORTIZÁVEL; nas decrescentes
    sobre o valor ainda por amortizar, multiplicado pelo coeficiente.
    """
    # NÃO AMORTIZÁVEL é uma decisão, e vale mais do que a taxa: um terreno com
    # taxa preenchida por engano não pode começar a amortizar por causa disso.
    if a.nao_amortizavel:
        return ZERO
    # EM CURSO também não amortiza — o activo ainda não existe como património.
    if a.em_curso:
        return ZERO

    taxa = a.taxa or ZERO
    if a.metodo == "degressivas":
        vida_util = (Decimal("100") / taxa) if taxa > 0 else ZERO
        return r2(valor_liquido(a) * taxa / 100 * coef_degressivo(vida_util))
    return r2(base_amortizavel(a) * taxa / 100)


def amort_mensal(a: Ativo) -> Decimal:
    return r2(amort_anual(a) / 12)


def amort_exercicio(a: Ativo) -> Decimal:
    """Amortização anual a reconhecer, limitada ao que falta amortizar."""
    if a.estado == "abatido":
        return ZERO
    return r2(min(amort_anual(a), max(ZERO, valor_liquido(a))))


def amort_do_periodo(a: Ativo, mes: str) -> Decimal:
    """Quota do mês, limitada ao valor líquido restante.

    O período 00 (Abertura) não tem amortização — não é um mês.
    """
    if a.estado == "abatido" or mes == "00":
        return ZERO
    return r2(min(amort_mensal(a), max(ZERO, valor_liquido(a))))


def percent_amortizado(a: Ativo) -> int:
    """Percentagem do que É AMORTIZÁVEL, não do valor de aquisição.

    Com condições especiais são coisas diferentes: um activo de 10 000 com
    4 000 sujeitos, já todos amortizados, está a 100% — não a 40%. Contar sobre
    a aquisição dava um activo eternamente por amortizar, com o mapa a sugerir
    que faltava fazer alguma coisa.
    """
    v = base_amortizavel(a)
    if not v:
        return 0
    return int(round((a.amort_acumulada or ZERO) / v * 100))


def proximo_codigo(db: Session, empresa_id: UUID) -> str:
    codigos = db.scalars(select(Ativo.codigo).where(Ativo.empresa_id == empresa_id)).all()
    maximo = 0
    for c in codigos:
        if c and c.startswith("IM-") and c[3:].isdigit():
            maximo = max(maximo, int(c[3:]))
    return f"IM-{maximo + 1:04d}"


# ---------------------------------------------------------------------------
# Mapas
# ---------------------------------------------------------------------------
def mapa(db: Session, *, empresa_id: UUID, so_ativos: bool = False) -> dict:
    """Mapa anual de amortizações."""
    q = select(Ativo).where(Ativo.empresa_id == empresa_id)
    if so_ativos:
        q = q.where(Ativo.estado == "activo")

    linhas = []
    for a in db.scalars(q.order_by(Ativo.codigo)).all():
        ae = amort_exercicio(a)
        linhas.append(
            {
                "id": a.id, "codigo": a.codigo, "designacao": a.designacao,
                "conta": a.conta_imob, "data_aquisicao": a.data_aquisicao,
                "valor_bruto": r2(a.valor_aquisicao), "taxa": a.taxa,
                "metodo": a.metodo,
                "amort_acumulada_ant": r2(a.amort_acumulada),
                "amort_exercicio": ae,
                "amort_acumulada": r2((a.amort_acumulada or ZERO) + ae),
                "valor_liquido": r2(valor_liquido(a) - ae),
                "estado": a.estado,
            }
        )
    chaves = ("valor_bruto", "amort_acumulada_ant", "amort_exercicio",
              "amort_acumulada", "valor_liquido")
    return {
        "linhas": linhas,
        "totais": {k: r2(sum((l[k] for l in linhas), ZERO)) for k in chaves},
    }


def processo_de(
    db: Session, empresa_id: UUID, exercicio_id: UUID, mes: str
) -> ProcessoAmortizacao | None:
    return db.scalar(
        select(ProcessoAmortizacao).where(
            ProcessoAmortizacao.empresa_id == empresa_id,
            ProcessoAmortizacao.exercicio_id == exercicio_id,
            ProcessoAmortizacao.mes == mes,
        )
    )


def mapa_periodo(
    db: Session, *, empresa_id: UUID, exercicio_id: UUID, mes: str,
    so_ativos: bool = False,
) -> dict:
    """Mapa do período: mostra o valor JÁ processado se o período estiver
    fechado, ou o valor A processar se ainda estiver por fazer."""
    batch = processo_de(db, empresa_id, exercicio_id, mes)
    itens_por_ativo = (
        {str(i["ativo_id"]): i for i in (batch.itens or [])} if batch else {}
    )

    q = select(Ativo).where(Ativo.empresa_id == empresa_id)
    if so_ativos:
        q = q.where(Ativo.estado == "activo")

    linhas = []
    for a in db.scalars(q.order_by(Ativo.codigo)).all():
        item = itens_por_ativo.get(str(a.id))
        valor = Decimal(str(item["valor"])) if item else amort_do_periodo(a, mes)
        linhas.append(
            {
                "id": a.id, "codigo": a.codigo, "designacao": a.designacao,
                "conta": a.conta_imob, "taxa": a.taxa, "metodo": a.metodo,
                "valor_bruto": r2(a.valor_aquisicao),
                "amort_acumulada_atual": r2(a.amort_acumulada),
                "valor_liquido_atual": valor_liquido(a),
                "valor_periodo": valor, "ja_processado": item is not None,
                "lancamento_id": item.get("lancamento_id") if item else None,
                "estado": a.estado,
            }
        )
    return {
        "linhas": linhas,
        "total_periodo": r2(sum((l["valor_periodo"] for l in linhas), ZERO)),
        "processado": batch is not None,
        # A DATA do processamento, e não só o facto. «Processado» sozinho não
        # diz de quando — e num mapa que se reabre e reprocessa, é a data que
        # diz se o que está no ecrã é o trabalho de ontem ou o de hoje.
        "processado_em": batch.data if batch else None,
    }


# ---------------------------------------------------------------------------
# Processamento
# ---------------------------------------------------------------------------
def processar_periodo(
    db: Session,
    *,
    empresa_id: UUID,
    exercicio_id: UUID,
    mes: str,
    data: Date,
    por: str | None = None,
) -> dict:
    """Processa a amortização de um exercício e período.

    Idempotente por recusa: um período já processado tem de ser reaberto antes
    de correr outra vez. Reprocessar em cima do anterior duplicaria a
    amortização acumulada de cada activo.
    """
    if not exercicio_id:
        raise ErroContabilistico("Indica o exercício a processar.")
    if not mes:
        raise ErroContabilistico("Indica o período a processar.")
    # `amort_do_periodo` já devolve zero para o período 00, por isso processá-lo
    # não amortizava nada — mas gravava na mesma um registo de processamento e o
    # período passava a mostrar-se "processado". A Abertura não é um mês.
    if mes == "00":
        raise ErroContabilistico(
            "O período 00 é a Abertura e não tem amortização. Escolhe um "
            "período de 01 a 12."
        )
    if processo_de(db, empresa_id, exercicio_id, mes) is not None:
        raise ErroContabilistico(
            "Este período já foi processado — reabre-o antes de processar de novo."
        )

    c2 = cfg_imob(db, empresa_id)
    itens, lancamento_ids, erros = [], [], []

    for a in db.scalars(
        select(Ativo).where(Ativo.empresa_id == empresa_id).order_by(Ativo.codigo)
    ).all():
        valor = amort_do_periodo(a, mes)
        if valor <= 0:
            continue

        # A AMORTIZAÇÃO SÓ SE ESCREVE DEPOIS DE O LANÇAMENTO PASSAR.
        #
        # Antes escrevia-se primeiro e lançava-se a seguir. Se o lançamento
        # falhasse, o activo ficava amortizado na ficha e não nas contas — o
        # mapa de imobilizados a discordar do balanço, sem erro visível, até
        # ao fecho do exercício. E se o activo não tivesse contas de
        # amortização definidas, o lançamento nem era tentado: a divergência
        # nascia em silêncio absoluto.
        #
        # Agora, por activo: ou vai aos dois sítios, ou não vai a nenhum. Um
        # activo mal configurado deixa os outros passar — bloquear o mês
        # inteiro por causa de um seria trocar uma inconsistência por uma
        # paragem — mas fica na lista de erros e não é amortizado.
        if not a.conta_custo_amort or not a.conta_amort_acum:
            erros.append(
                f"{a.codigo}: sem contas de amortização na ficha "
                "(custo e amortizações acumuladas) — não foi amortizado."
            )
            continue

        try:
            lanc = postar(
                db, empresa_id=empresa_id, data=data, diario_codigo=c2["diario"],
                documento_codigo=c2["documento"], mes=mes, exercicio_id=exercicio_id,
                descricao=f"Amortização do período — {a.designacao or a.codigo}",
                documento_ref=a.codigo, origem="imobilizado",
                linhas=[
                    {"conta_codigo": a.conta_custo_amort, "debito": valor,
                     "descricao": a.designacao},
                    {"conta_codigo": a.conta_amort_acum, "credito": valor,
                     "descricao": a.designacao},
                ],
            )
        except ErroContabilistico as e:
            erros.append(f"{a.codigo}: {e} — não foi amortizado.")
            continue

        a.amort_acumulada = r2((a.amort_acumulada or ZERO) + valor)
        itens.append({
            "ativo_id": str(a.id), "codigo": a.codigo,
            "designacao": a.designacao, "valor": str(valor),
            "lancamento_id": str(lanc.id),
        })
        lancamento_ids.append(str(lanc.id))

    total = r2(sum((Decimal(i["valor"]) for i in itens), ZERO))
    batch = ProcessoAmortizacao(
        empresa_id=empresa_id, exercicio_id=exercicio_id, mes=mes, data=data,
        itens=itens, total_amort=total, por=por or "sistema",
    )
    db.add(batch)
    # Antes das notificações: sem isto, o `batch.id` que elas guardam como
    # alvo ainda não existe e a ligação fica a apontar para nada.
    db.flush()

    # A amortização processada ENTRA NA CONTABILIDADE — débito custo, crédito
    # amortizações acumuladas. Quem lança não é quem processa, e até aqui não
    # havia nada a dizê-lo a ninguém: o período ficava «processado» neste ecrã
    # e o movimento aparecia na contabilidade sem origem visível.
    #
    # A chave inclui o período: reabrir e voltar a processar não cria uma
    # segunda notificação, actualiza a que existe.
    if itens:
        notificar(
            db, empresa_id=empresa_id, capacidade="contab.ver",
            origem="imobilizado", tipo="info",
            chave=f"amort-processada:{exercicio_id}:{mes}",
            titulo=f"Amortizações de {mes} processadas",
            texto=(
                f"{len(itens)} activo(s), {total} lançado(s) na contabilidade "
                f"({len(lancamento_ids)} com movimento)."
            ),
            ligacao="/imobilizados/amortizacoes",
            alvo_tipo="processo_amortizacao", alvo_id=batch.id,
        )

    # Notificação 4. Os activos que falharam NÃO foram amortizados — isso já
    # está garantido acima. O que a notificação diz é que ficaram por
    # amortizar, e porquê: sem isto, o período aparece «processado» e ninguém
    # repara que faltaram activos lá dentro.
    if erros:
        notificar(
            db, empresa_id=empresa_id, capacidade="contab.lancar",
            origem="imobilizado",
            chave=f"amort-por-lancar:{exercicio_id}:{mes}",
            titulo=f"{len(erros)} activo(s) por amortizar em {mes}",
            texto=(
                "Estes activos não foram amortizados nem lançados: "
                + " · ".join(erros)
            ),
            ligacao="/imobilizados/amortizacoes",
            alvo_tipo="processo_amortizacao", alvo_id=batch.id,
        )

    db.flush()
    return {"processados": len(itens), "total_amort": total,
            "lancados": len(lancamento_ids), "erros": erros, "processo_id": batch.id}


def reabrir_periodo(
    db: Session, *, empresa_id: UUID, exercicio_id: UUID, mes: str
) -> bool:
    """Desfaz o processamento: repõe as amortizações acumuladas e remove os
    lançamentos gerados."""
    from src.db.models.contabilidade import Lancamento

    batch = processo_de(db, empresa_id, exercicio_id, mes)
    if batch is None:
        return False

    for item in batch.itens or []:
        a = db.get(Ativo, UUID(str(item["ativo_id"])))
        if a is not None and a.empresa_id == empresa_id:
            a.amort_acumulada = r2(
                (a.amort_acumulada or ZERO) - Decimal(str(item["valor"]))
            )
        lanc_id = item.get("lancamento_id")
        if lanc_id:
            lanc = db.get(Lancamento, UUID(str(lanc_id)))
            if lanc is not None and lanc.empresa_id == empresa_id:
                db.delete(lanc)

    db.delete(batch)
    # Reabrir desfaz o processamento inteiro: o que estava por amortizar
    # deixou de estar, porque já não há período processado nenhum.
    resolver(db, empresa_id=empresa_id, chave=f"amort-por-lancar:{exercicio_id}:{mes}")
    db.flush()
    return True
