"""Logística: artigos, armazéns, movimentos de stock e valorização.

Transposto de `Piloto/assets/js/logistica.js`.

A valorização é por Custo Médio Ponderado (CUMP), o critério legal de
valorização de existências. O CUMP NÃO é guardado: é recalculado a partir do
histórico cronológico de movimentos, sempre que é preciso. Guardá-lo criaria
duas fontes de verdade que divergiriam à primeira correcção retroactiva.
"""

from datetime import date as Date
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from src.db.base import agora
from src.db.models.comercial import SequenciaVenda
from src.db.models.contabilidade import Lancamento
from src.db.models.logistica import Armazem, Artigo, MovimentoStock
from src.db.models.tenancy import ConfigEmpresa
from src.services.contabilidade import ErroContabilistico, conta_corrente, postar

ZERO = Decimal("0")
CENT = Decimal("0.01")
QTD4 = Decimal("0.0001")


def r2(v) -> Decimal:
    return Decimal(v).quantize(CENT, rounding=ROUND_HALF_UP)


def rq(v) -> Decimal:
    return Decimal(v).quantize(QTD4, rounding=ROUND_HALF_UP)


# Tipos de movimento. `sinal` é indicativo — o ajuste pode ser positivo ou
# negativo consoante a quantidade, e a transferência é neutra no total.
TIPOS_MOV: tuple[dict, ...] = (
    {"cod": "entrada", "nome": "Receção", "contab": "entrada", "prefixo": "REC"},
    {"cod": "saida", "nome": "Expedição", "contab": "saida", "prefixo": "EXP"},
    {"cod": "transferencia", "nome": "Transferência", "contab": "nenhum", "prefixo": "TRF"},
    {"cod": "ajuste", "nome": "Inventariação / Ajuste", "contab": "ajuste", "prefixo": None},
)
_POR_COD = {t["cod"]: t for t in TIPOS_MOV}


def tipo_mov(cod: str) -> dict:
    return _POR_COD.get(cod, TIPOS_MOV[0])


def cfg_log_default() -> dict:
    return {
        "conta_existencia": "2611",
        "conta_custo": "7111",
        "conta_contrapartida": "32121",
        "conta_regulariza": "7111",
        "conta_iva_dedutivel": "34521111",
        "diario_entrada": "21",
        "doc_entrada": "220",
        "diario_saida": "90",
        "doc_saida": "901",
        "diario_ajuste": "90",
        "doc_ajuste": "902",
        # Acertos de stock: o positivo é um ganho, o negativo uma quebra. Contas
        # e documentos próprios — não se misturam com o CMVMC das vendas.
        "doc_ajuste_pos": "903",
        "doc_ajuste_neg": "904",
        "conta_ganho_existencias": "6804",
        "conta_quebra_existencias": "78041",
        # Baixa automática de stock e CMVMC ao emitir uma venda de mercadorias.
        "auto_baixa_venda": True,
        "armazem_venda_id": "",
    }


def cfg_log(db: Session, empresa_id: UUID) -> dict:
    cfg = db.scalar(select(ConfigEmpresa).where(ConfigEmpresa.empresa_id == empresa_id))
    base = cfg_log_default()
    if cfg is None:
        return base
    return {**base, **((cfg.parametrizacoes or {}).get("log") or {})}


def guardar_cfg_log(db: Session, empresa_id: UUID, novo: dict) -> dict:
    # A MESMA REGRA DO OUTRO LADO: o que a empresa não escreve é deixado cair.
    # Esta rota também aceita um dicionário solto, e sem isto era a porta que
    # ficava aberta depois de se fechar a das parametrizações comerciais.
    from src.services.comercial import SO_A_PLATAFORMA_ESCREVE

    novo = {k: v for k, v in novo.items() if k not in SO_A_PLATAFORMA_ESCREVE}

    cfg = db.scalar(select(ConfigEmpresa).where(ConfigEmpresa.empresa_id == empresa_id))
    if cfg is None:
        cfg = ConfigEmpresa(empresa_id=empresa_id, modulos={}, parametrizacoes={}, agt={})
        db.add(cfg)
        db.flush()
    params = dict(cfg.parametrizacoes or {})
    params["log"] = {**cfg_log_default(), **(params.get("log") or {}), **novo}
    cfg.parametrizacoes = params
    db.flush()

    # Configurado o armazém, a situação que gerou a notificação 2 deixou de
    # existir. Fica no histórico, marcada como resolvida.
    if armazem_venda(db, empresa_id) is not None:
        from src.services.notificacoes import resolver

        resolver(db, empresa_id=empresa_id, chave="sem-armazem-venda")

    return params["log"]


def armazem_venda(db: Session, empresa_id: UUID) -> UUID | None:
    """Armazém usado na baixa de stock das vendas: o configurado, ou o primeiro."""
    c = cfg_log(db, empresa_id)
    arms = db.scalars(
        select(Armazem).where(Armazem.empresa_id == empresa_id).order_by(Armazem.codigo)
    ).all()
    if not arms:
        return None
    escolhido = c.get("armazem_venda_id")
    if escolhido:
        for a in arms:
            if str(a.id) == str(escolhido):
                return a.id
    return arms[0].id


# ---------------------------------------------------------------------------
# Numeração
# ---------------------------------------------------------------------------
def _proximo_numero(db: Session, empresa_id: UUID, prefixo: str, ano: int) -> str:
    """Sequência por prefixo e ano, atómica no Postgres."""
    stmt = (
        pg_insert(SequenciaVenda)
        .values(empresa_id=empresa_id, prefixo=prefixo, ano=ano, valor=1)
        .on_conflict_do_update(
            constraint="sequencia_venda",
            set_={"valor": SequenciaVenda.__table__.c.valor + 1},
        )
        .returning(SequenciaVenda.__table__.c.valor)
    )
    n = int(db.execute(stmt).scalar_one())
    return f"{prefixo} {ano}/{n:04d}"


# ---------------------------------------------------------------------------
# Stock e valorização
# ---------------------------------------------------------------------------
def _movimentos_do_artigo(
    db: Session, empresa_id: UUID, artigo_id: UUID
) -> list[MovimentoStock]:
    """Movimentos por ordem cronológica — a ordem é essencial no CUMP.

    O desempate por `criado_em` importa: duas entradas no mesmo dia a preços
    diferentes dão custos médios distintos consoante a ordem em que entram.
    """
    return db.scalars(
        select(MovimentoStock)
        .where(
            MovimentoStock.empresa_id == empresa_id,
            MovimentoStock.artigo_id == artigo_id,
        )
        .order_by(MovimentoStock.data, MovimentoStock.criado_em)
    ).all()


def stock(
    db: Session, *, empresa_id: UUID, artigo_id: UUID, armazem_id: UUID | None = None
) -> Decimal:
    """Quantidade em stock, global ou de um armazém."""
    q = ZERO
    for m in _movimentos_do_artigo(db, empresa_id, artigo_id):
        qtd = m.qtd or ZERO
        if m.tipo == "entrada":
            if armazem_id is None or m.armazem_id == armazem_id:
                q += qtd
        elif m.tipo == "saida":
            if armazem_id is None or m.armazem_id == armazem_id:
                q -= qtd
        elif m.tipo == "ajuste":
            # A quantidade já traz o sinal.
            if armazem_id is None or m.armazem_id == armazem_id:
                q += qtd
        elif m.tipo == "transferencia":
            # No total é neutra; só conta quando se olha para um armazém.
            if armazem_id is None:
                continue
            if m.armazem_id == armazem_id:
                q -= qtd
            if m.armazem_destino_id == armazem_id:
                q += qtd
    return rq(q)


def custo_medio(
    db: Session, *, empresa_id: UUID, artigo_id: UUID, armazem_id: UUID | None = None
) -> Decimal:
    """Custo Médio Ponderado, recalculado cronologicamente.

    Uma SAÍDA não altera o custo médio — só reduz a quantidade, e o valor sai ao
    custo médio corrente. É isso que distingue o CUMP de um FIFO.

    Sem stock, devolve o preço de compra do artigo, para que uma primeira saída
    não seja valorizada a zero.
    """
    qtd = ZERO
    valor = ZERO

    def entra(q: Decimal, cu: Decimal) -> None:
        nonlocal qtd, valor
        qtd += q
        valor += q * cu

    def sai(q: Decimal) -> None:
        nonlocal qtd, valor
        if qtd <= 0:
            return
        cm = valor / qtd
        q_sai = min(q, qtd)
        valor -= q_sai * cm
        qtd -= q_sai

    for m in _movimentos_do_artigo(db, empresa_id, artigo_id):
        q = abs(m.qtd or ZERO)
        cu = m.custo_unit or ZERO
        if m.tipo == "entrada":
            if armazem_id is None or m.armazem_id == armazem_id:
                entra(q, cu)
        elif m.tipo == "saida":
            if armazem_id is None or m.armazem_id == armazem_id:
                sai(q)
        elif m.tipo == "ajuste":
            if armazem_id is not None and m.armazem_id != armazem_id:
                continue
            if (m.qtd or ZERO) >= 0:
                entra(q, cu)
            else:
                sai(q)
        elif m.tipo == "transferencia" and armazem_id is not None:
            # Globalmente é neutra e ignora-se. Por armazém, sai da origem e
            # entra no destino ao CUMP que a origem tinha nesse momento.
            #
            # Os dois ramos são `if` independentes, e não `if/elif`, para
            # acompanharem o `stock()`. Com `elif`, uma transferência cujo
            # destino é a própria origem só descontaria: a quantidade ficava
            # igual (o `stock()` soma e subtrai) mas o valor perdia-se, e o
            # custo médio passava a dividir por uma quantidade que não é a que
            # o sistema mostra. Registos assim já não se conseguem criar, mas
            # os que existam em bases antigas continuariam a inventar valor.
            if m.armazem_id == armazem_id:
                sai(q)
            if m.armazem_destino_id == armazem_id:
                entra(q, cu)

    if qtd > 0:
        return r2(valor / qtd)
    artigo = db.get(Artigo, artigo_id)
    return r2(artigo.preco_compra) if artigo else ZERO


def existencias(
    db: Session,
    *,
    empresa_id: UUID,
    armazem_id: UUID | None = None,
    so_ativos: bool = False,
) -> list[dict]:
    q = select(Artigo).where(Artigo.empresa_id == empresa_id)
    if so_ativos:
        q = q.where(Artigo.estado == "activo")
    linhas = []
    for a in db.scalars(q.order_by(Artigo.codigo)).all():
        qt = stock(db, empresa_id=empresa_id, artigo_id=a.id, armazem_id=armazem_id)
        cm = custo_medio(db, empresa_id=empresa_id, artigo_id=a.id, armazem_id=armazem_id)
        linhas.append(
            {
                "artigo_id": a.id, "codigo": a.codigo, "descricao": a.descricao,
                "unidade": a.unidade, "stock": qt, "custo_medio": cm,
                "valor": r2(qt * cm), "stock_min": a.stock_min or ZERO,
                "rutura": qt <= (a.stock_min or ZERO),
            }
        )
    return linhas


def valor_stock(db: Session, *, empresa_id: UUID) -> Decimal:
    return r2(sum((e["valor"] for e in existencias(db, empresa_id=empresa_id)), ZERO))


# ---------------------------------------------------------------------------
# Registo de movimentos
# ---------------------------------------------------------------------------
def registar_movimento(
    db: Session,
    *,
    empresa_id: UUID,
    tipo: str,
    artigo_id: UUID,
    armazem_id: UUID,
    qtd: Decimal,
    data: Date | None = None,
    armazem_destino_id: UUID | None = None,
    custo_unit: Decimal | None = None,
    iva_perc: Decimal | None = None,
    conta_iva: str | None = None,
    documento: str | None = None,
    descricao: str | None = None,
    entidade: str | None = None,
    diario_contab: str | None = None,
    documento_contab: str | None = None,
    exercicio_id: UUID | None = None,
    sem_lancamento: bool = False,
    ignorar_erro_contab: bool = False,
) -> MovimentoStock:
    """Regista um movimento de stock e a respectiva contabilização.

    O custo unitário NÃO é editável em saídas nem em transferências: é sempre o
    CUMP corrente do armazém de origem. É essa regra que garante a coerência da
    valorização — deixar o utilizador escolher o custo de saída permitiria
    esvaziar o valor das existências sem que nada batesse certo.
    """
    artigo = db.scalar(
        select(Artigo).where(Artigo.id == artigo_id, Artigo.empresa_id == empresa_id)
    )
    if artigo is None:
        raise ErroContabilistico("Indica o artigo.")
    if armazem_id is None:
        raise ErroContabilistico("Indica o armazém.")

    td = tipo_mov(tipo)
    c2 = cfg_log(db, empresa_id)
    qtd = rq(qtd)
    data = data or Date.today()

    if td["cod"] != "ajuste" and qtd <= 0:
        raise ErroContabilistico("Quantidade inválida.")
    if td["cod"] == "transferencia" and armazem_destino_id is None:
        raise ErroContabilistico("Indica o armazém de destino.")
    # Desvio ao Piloto, que só verifica se o destino está preenchido. Uma
    # transferência para o próprio armazém não move nada, mas grava na mesma:
    # queima um número sequencial e deixa no histórico uma linha que parece um
    # movimento e não é. Nenhuma operação legítima é bloqueada por isto.
    if td["cod"] == "transferencia" and armazem_destino_id == armazem_id:
        raise ErroContabilistico(
            "O armazém de destino tem de ser diferente do de origem."
        )
    if td["cod"] == "saida":
        disp = stock(db, empresa_id=empresa_id, artigo_id=artigo_id, armazem_id=armazem_id)
        if qtd > disp:
            raise ErroContabilistico(
                f"Stock insuficiente ({disp} {artigo.unidade or 'un'} disponíveis)."
            )
    if td["cod"] == "ajuste" and qtd < 0:
        disp = stock(db, empresa_id=empresa_id, artigo_id=artigo_id, armazem_id=armazem_id)
        if -qtd > disp:
            raise ErroContabilistico(
                f"Acerto negativo maior do que o stock disponível "
                f"({disp} {artigo.unidade or 'un'})."
            )

    if td["cod"] in ("saida", "transferencia"):
        cu = custo_medio(db, empresa_id=empresa_id, artigo_id=artigo_id, armazem_id=armazem_id)
    elif td["cod"] == "ajuste" and qtd < 0:
        cu = (
            r2(custo_unit)
            if custo_unit is not None
            else custo_medio(db, empresa_id=empresa_id, artigo_id=artigo_id, armazem_id=armazem_id)
        )
    else:
        cu = r2(custo_unit) if custo_unit is not None else r2(artigo.preco_compra)

    valor = r2(abs(qtd) * cu)
    mes = f"{data.month:02d}"
    conta_exist = artigo.conta_existencia or c2["conta_existencia"]
    conta_custo = artigo.conta_custo or c2["conta_custo"]

    prefixo = td["prefixo"] or ("ACP" if qtd >= 0 else "ACN")
    numero = _proximo_numero(db, empresa_id, prefixo, data.year)

    lanc = None
    if not sem_lancamento and td["contab"] != "nenhum" and valor > 0:
        linhas: list[dict] = []
        diario = documento_cod = None

        if td["contab"] == "entrada":
            diario = diario_contab or c2["diario_entrada"]
            documento_cod = documento_contab or c2["doc_entrada"]
            conta_forn = (
                conta_corrente(db, empresa_id, c2["conta_contrapartida"], entidade)
                if entidade
                else c2["conta_contrapartida"]
            )
            # O IVA dedutível acresce ao valor creditado ao fornecedor, mas NÃO
            # entra no valor das existências nem no custo médio do artigo.
            iva_valor = r2(valor * (iva_perc or ZERO) / 100)
            linhas.append(
                {"conta_codigo": conta_exist, "debito": valor, "descricao": artigo.descricao}
            )
            if iva_valor > 0:
                linhas.append(
                    {"conta_codigo": conta_iva or c2["conta_iva_dedutivel"],
                     "debito": iva_valor,
                     "descricao": f"IVA dedutível — {artigo.descricao}"}
                )
            linhas.append(
                {"conta_codigo": conta_forn, "credito": r2(valor + iva_valor),
                 "entidade": entidade or "", "descricao": f"Receção {numero}"}
            )
        elif td["contab"] == "saida":
            diario = c2["diario_saida"]
            documento_cod = c2["doc_saida"]
            linhas = [
                {"conta_codigo": conta_custo, "debito": valor,
                 "descricao": f"Custo — {artigo.descricao}"},
                {"conta_codigo": conta_exist, "credito": valor,
                 "descricao": f"Saída {numero}"},
            ]
        elif td["contab"] == "ajuste":
            diario = c2["diario_ajuste"]
            if qtd >= 0:
                documento_cod = c2["doc_ajuste_pos"] or c2["doc_ajuste"]
                linhas = [
                    {"conta_codigo": conta_exist, "debito": valor,
                     "descricao": "Acerto de Stock Positivo"},
                    {"conta_codigo": c2["conta_ganho_existencias"] or c2["conta_regulariza"],
                     "credito": valor,
                     "descricao": f"Ganho em existências — {artigo.descricao}"},
                ]
            else:
                documento_cod = c2["doc_ajuste_neg"] or c2["doc_ajuste"]
                linhas = [
                    {"conta_codigo": c2["conta_quebra_existencias"] or c2["conta_regulariza"],
                     "debito": valor,
                     "descricao": f"Quebra de existências — {artigo.descricao}"},
                    {"conta_codigo": conta_exist, "credito": valor,
                     "descricao": "Acerto de Stock Negativo"},
                ]

        try:
            lanc = postar(
                db, empresa_id=empresa_id, data=data, diario_codigo=diario,
                documento_codigo=documento_cod, mes=mes,
                descricao=f"{td['nome']} {numero} — {artigo.descricao}",
                documento_ref=numero, origem="logistica",
                exercicio_id=exercicio_id, linhas=linhas,
            )
        except ErroContabilistico:
            # A venda passa `ignorar_erro_contab` para que um problema na
            # contabilização não impeça o stock de sair — o aviso sobe para o
            # utilizador em vez de bloquear a facturação.
            if not ignorar_erro_contab:
                raise

    mov = MovimentoStock(
        empresa_id=empresa_id, numero=numero, tipo=td["cod"], data=data,
        artigo_id=artigo_id, artigo_desc=artigo.descricao, armazem_id=armazem_id,
        armazem_destino_id=armazem_destino_id, qtd=qtd, unidade=artigo.unidade,
        custo_unit=cu, valor=valor, documento=documento, descricao=descricao,
        entidade=entidade, lancamento_id=lanc.id if lanc else None,
        numero_op=lanc.numero_op if lanc else None,
    )
    db.add(mov)
    db.flush()
    return mov


def anular_movimento(
    db: Session, *, empresa_id: UUID, movimento_id: UUID, quem_id: UUID | None = None
) -> tuple[MovimentoStock, MovimentoStock]:
    """Anula um movimento criando o CONTRÁRIO — nunca apagando o original.

    O Piloto apaga a linha e avisa, num `confirm()`, que «não reverte o
    lançamento contabilístico». Numa demonstração em `localStorage` isso passa.
    Aqui não: o movimento gerou um lançamento a sério, e apagar um sem o outro
    deixa a existência fora do mapa e o custo na classe 6 — uma discordância
    que ninguém encontra até ao fecho do exercício.

    Por isso anular é um ESTORNO:

    - o original fica intacto, marcado com quem anulou e quando;
    - nasce um movimento contrário que o referencia;
    - o lançamento é revertido com as MESMAS LINHAS de débito e crédito
      TROCADAS, e não reconstruído a partir das contas de configuração — se a
      configuração mudou entretanto, um estorno reconstruído lançaria noutro
      sítio e não fecharia com o original;
    - tudo na mesma transacção: ou stock e contabilidade voltam atrás juntos,
      ou não se mexe em nada.

    O tipo do movimento contrário é o SIMÉTRICO, não o mesmo com quantidade
    negativa: o `stock()` e o `custo_medio()` lêem o tipo, e uma «entrada» de
    −10 seria contada como entrada de 10 no custo médio.
    """
    mov = db.scalar(
        select(MovimentoStock).where(
            MovimentoStock.id == movimento_id,
            MovimentoStock.empresa_id == empresa_id,
        )
    )
    if mov is None:
        raise ErroContabilistico("Movimento não encontrado.")
    if mov.estornado_em is not None:
        raise ErroContabilistico(
            f"O movimento {mov.numero} já foi anulado em "
            f"{mov.estornado_em:%d/%m/%Y} — não se anula duas vezes."
        )
    if mov.estorna_id is not None:
        raise ErroContabilistico(
            f"O movimento {mov.numero} É a anulação de outro. Para o desfazer, "
            "registe um movimento novo."
        )

    # --- O contrário, em espelho ----------------------------------------
    if mov.tipo == "entrada":
        tipo_inverso, origem, destino = "saida", mov.armazem_id, None
    elif mov.tipo == "saida":
        tipo_inverso, origem, destino = "entrada", mov.armazem_id, None
    elif mov.tipo == "transferencia":
        # Troca origem e destino: a mercadoria volta por onde veio.
        tipo_inverso = "transferencia"
        origem, destino = mov.armazem_destino_id, mov.armazem_id
    else:
        tipo_inverso, origem, destino = "ajuste", mov.armazem_id, None

    qtd_inversa = -(mov.qtd or ZERO) if tipo_inverso == "ajuste" else abs(mov.qtd or ZERO)

    # Reverter tira stock de algum lado: se entretanto já saiu, não há o que
    # devolver, e é melhor dizê-lo do que deixar a existência negativa.
    armazem_que_perde = (
        origem if tipo_inverso in ("saida", "transferencia")
        else (origem if qtd_inversa < 0 else None)
    )
    if armazem_que_perde is not None:
        disp = stock(
            db, empresa_id=empresa_id, artigo_id=mov.artigo_id,
            armazem_id=armazem_que_perde,
        )
        if abs(qtd_inversa) > disp:
            raise ErroContabilistico(
                f"Não há stock para reverter o movimento {mov.numero}: são "
                f"precisas {abs(qtd_inversa)} unidades e há {disp}. O que este "
                "movimento trouxe já saiu."
            )

    prefixo = tipo_mov(tipo_inverso)["prefixo"] or (
        "ACP" if qtd_inversa >= 0 else "ACN"
    )
    hoje = Date.today()
    numero = _proximo_numero(db, empresa_id, prefixo, hoje.year)

    # --- O lançamento de estorno ----------------------------------------
    lanc = None
    if mov.lancamento_id is not None:
        original = db.scalar(
            select(Lancamento).where(Lancamento.id == mov.lancamento_id)
        )
        if original is not None:
            linhas = [
                {
                    "conta_codigo": l.conta_codigo,
                    "debito": l.credito or ZERO,
                    "credito": l.debito or ZERO,
                    "entidade": l.entidade or "",
                    "descricao": f"Estorno — {l.descricao or ''}".strip(" —"),
                }
                for l in sorted(original.linhas, key=lambda x: x.ordem or 0)
            ]
            lanc = postar(
                db, empresa_id=empresa_id, data=hoje,
                diario_codigo=original.diario_codigo,
                documento_codigo=original.documento_codigo,
                mes=f"{hoje.month:02d}",
                descricao=f"Anulação de {mov.numero} — {mov.artigo_desc or ''}".strip(),
                documento_ref=numero, origem="logistica",
                exercicio_id=original.exercicio_id, linhas=linhas,
            )

    inverso = MovimentoStock(
        empresa_id=empresa_id, numero=numero, tipo=tipo_inverso, data=hoje,
        artigo_id=mov.artigo_id, artigo_desc=mov.artigo_desc,
        armazem_id=origem, armazem_destino_id=destino,
        qtd=qtd_inversa, unidade=mov.unidade,
        # O mesmo custo do original, para que o valor revertido seja o mesmo
        # que entrou — e não o CUMP de hoje, que já é outro.
        custo_unit=mov.custo_unit, valor=mov.valor,
        documento=mov.documento,
        descricao=f"Anulação do movimento {mov.numero}",
        entidade=mov.entidade, estorna_id=mov.id,
        lancamento_id=lanc.id if lanc else None,
        numero_op=lanc.numero_op if lanc else None,
    )
    db.add(inverso)

    mov.estornado_em = agora()
    mov.estornado_por_id = quem_id
    db.flush()
    return mov, inverso


def proximo_codigo_artigo(db: Session, empresa_id: UUID) -> str:
    codigos = db.scalars(
        select(Artigo.codigo).where(Artigo.empresa_id == empresa_id)
    ).all()
    maximo = max((int(c) for c in codigos if c and c.isdigit()), default=0)
    return f"{maximo + 1:04d}"
