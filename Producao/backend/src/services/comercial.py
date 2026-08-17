"""Comercial: clientes, vendas e facturação.

Transposto de `Piloto/assets/js/comercial.js`. Cada tipo de documento do Regime
Jurídico das Facturas (Decreto Presidencial n.º 71/25) lança de forma diferente
na contabilidade — é o campo `contab` de TIPOS_DOC que decide.
"""

from datetime import date as Date
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from src.db.base import agora
from src.core import documentos_fiscais as docs_fiscais
from src.db.base import agora
from src.db.models.comercial import (
    TIPOS_DOC,
    SequenciaVenda,
    SerieDocumento,
    Venda,
    VendaLinha,
)
from src.services.facturacao import cadeia
from src.services.facturacao import series as svc_series
from src.db.models.tenancy import ConfigEmpresa
from src.db.models.terceiros import Terceiro
from src.services.contabilidade import (
    ErroContabilistico,
    conta_corrente,
    criar_subconta,
    eh_movimento,
    postar,
    proxima_subconta,
)
from src.services.notificacoes import notificar
from src.services.logistica import armazem_venda, cfg_log, registar_movimento

ZERO = Decimal("0")
CENT = Decimal("0.01")

_POR_COD = {t["cod"]: t for t in TIPOS_DOC}


def r2(v) -> Decimal:
    return Decimal(v).quantize(CENT, rounding=ROUND_HALF_UP)


def tipo_doc(cod: str) -> dict:
    return _POR_COD.get(cod, TIPOS_DOC[0])


def cfg_com_default() -> dict:
    return {
        "conta_cliente": "31121",
        "conta_vendas": "6111",
        "conta_servicos": "6211",
        "conta_iva": "345311111",
        "conta_iva_vendas": "345311111",
        "conta_iva_servicos": "345312111",
        "diario": "61",
        "documento": "611",
        "documento_servicos": "612",
        "conta_caixa": "4511",
        "conta_banco": "43101",
        "conta_adiantamento": "319121",
        # NÚMERO DE VALIDAÇÃO DO SOFTWARE, atribuído pela AGT ao certificar.
        #
        # O formato é `NNN/AGT/AAAA` — por exemplo `141/AGT/2026` — e é o
        # esquema do SAF-T que o impõe (`\d+/AGT/\d{4}|0`). O `0` é previsto
        # pela norma e quer dizer «ainda não certificado».
        #
        # Fica a `0` por omissão de propósito: um número inventado passaria na
        # validação do ficheiro e seria falso perante a AGT. Preenche-se em
        # Configurações → Facturação quando a certificação chegar.
        "software_validacao": "0",
    }


def cfg_com(db: Session, empresa_id: UUID) -> dict:
    cfg = db.scalar(select(ConfigEmpresa).where(ConfigEmpresa.empresa_id == empresa_id))
    base = cfg_com_default()
    if cfg is None:
        return base
    return {**base, **((cfg.parametrizacoes or {}).get("com") or {})}


def guardar_cfg_com(db: Session, empresa_id: UUID, novo: dict) -> dict:
    cfg = db.scalar(select(ConfigEmpresa).where(ConfigEmpresa.empresa_id == empresa_id))
    if cfg is None:
        cfg = ConfigEmpresa(empresa_id=empresa_id, modulos={}, parametrizacoes={}, agt={})
        db.add(cfg)
        db.flush()
    params = dict(cfg.parametrizacoes or {})
    params["com"] = {**cfg_com_default(), **(params.get("com") or {}), **novo}
    cfg.parametrizacoes = params
    db.flush()
    return params["com"]


# ---------------------------------------------------------------------------
# Numeração e código de validação
# ---------------------------------------------------------------------------
def proximo_numero(db: Session, empresa_id: UUID, cod: str, ano: int) -> str:
    """Numeração sequencial e cronológica por tipo de documento (FT 2026/0001).

    Atómica ao nível da base de dados: dois utilizadores a facturar ao mesmo
    tempo não podem receber o mesmo número — numeração de facturas duplicada é
    uma infracção fiscal.
    """
    stmt = (
        pg_insert(SequenciaVenda)
        .values(empresa_id=empresa_id, prefixo=cod, ano=ano, valor=1)
        .on_conflict_do_update(
            constraint="sequencia_venda",
            set_={"valor": SequenciaVenda.__table__.c.valor + 1},
        )
        .returning(SequenciaVenda.__table__.c.valor)
    )
    n = int(db.execute(stmt).scalar_one())
    return f"{cod} {ano}/{n:04d}"


def _hash32(s: str) -> str:
    """djb2 de 32 bits, em base 32 — o mesmo `hash32()` do Piloto."""
    h = 5381
    for ch in s:
        h = ((h << 5) + h + ord(ch)) & 0xFFFFFFFF
    # int -> base32 com os dígitos de JS (0-9a-v)
    digitos = "0123456789abcdefghijklmnopqrstuv"
    if h == 0:
        b32 = "0"
    else:
        b32 = ""
        n = h
        while n:
            b32 = digitos[n % 32] + b32
            n //= 32
    return b32.upper().rjust(6, "0")


def _num_js(v: Decimal) -> str:
    """Formata como o JavaScript imprimiria o número.

    O Piloto constrói o código de validação por concatenação de strings, e em JS
    `1140000` imprime sem casas decimais. Um `Decimal("1140000.00")` daria outra
    string e outro código — normalizar mantém o código igual ao do Piloto para
    os mesmos dados.
    """
    s = format(v.normalize(), "f")
    return s


def codigo_validacao(venda: Venda) -> str:
    base = (
        f"{venda.numero or ''}|{_num_js(venda.total or ZERO)}|"
        f"{venda.cliente_nome or ''}|{venda.data or ''}"
    )
    return f"{_hash32(base)[:4]}-{_hash32(str(venda.id) if venda.id else 'x')[:4]}"


# ---------------------------------------------------------------------------
# Totais
# ---------------------------------------------------------------------------
def calc_totais(linhas: list[dict], iva_perc: Decimal) -> dict:
    subtotal = r2(
        sum(
            (Decimal(str(l.get("qtd") or 0)) * Decimal(str(l.get("preco") or 0))
             for l in linhas),
            ZERO,
        )
    )
    iva = r2(subtotal * (iva_perc or ZERO) / 100)
    return {"subtotal": subtotal, "iva": iva, "total": r2(subtotal + iva)}


# ---------------------------------------------------------------------------
# Conta corrente do cliente
# ---------------------------------------------------------------------------
def conta_corrente_cliente(
    db: Session, empresa_id: UUID, cliente: Terceiro | None, cfg: dict
) -> str:
    """Subconta de conta corrente do cliente, criada no acto da facturação.

    Um cliente registado fica com a sua própria subconta (31121001, 31121002…),
    gravada na ficha para os documentos seguintes a reutilizarem. O consumidor
    final, que não tem ficha, usa a conta base enquanto esta for de movimento;
    quando deixar de ser, vai para "Clientes Diversos".
    """
    base = cfg["conta_cliente"]
    from src.db.models.contabilidade import Conta

    base_conta = db.scalar(
        select(Conta).where(Conta.empresa_id == empresa_id, Conta.codigo == base)
    )
    if base_conta is None:
        return base
    todas = db.scalars(select(Conta).where(Conta.empresa_id == empresa_id)).all()
    base_eh_mov = eh_movimento(base_conta, todas)

    if cliente is not None and cliente.id is not None:
        if (
            cliente.conta
            and cliente.conta != base
            and cliente.conta.startswith(base)
            and any(c.codigo == cliente.conta for c in todas)
        ):
            return cliente.conta
        codigo = proxima_subconta(db, empresa_id, base)
        try:
            criar_subconta(db, empresa_id, base, codigo, cliente.nome)
        except ErroContabilistico:
            return cliente.conta or base
        cliente.conta = codigo
        db.flush()
        return codigo

    # Consumidor final
    if base_eh_mov:
        return base
    diversos = next(
        (
            c for c in todas
            if c.codigo != base
            and c.codigo.startswith(base)
            and eh_movimento(c, todas)
            and ("divers" in (c.nome or "").lower() or "consumidor" in (c.nome or "").lower())
        ),
        None,
    )
    if diversos is not None:
        return diversos.codigo
    codigo = proxima_subconta(db, empresa_id, base)
    try:
        criar_subconta(db, empresa_id, base, codigo, "Clientes Diversos")
    except ErroContabilistico:
        return base
    return codigo


def _doc_recebimento(conta: str) -> tuple[str, str]:
    """Diário e documento de um recebimento: banco (43…) ou caixa."""
    return ("43", "431") if str(conta).startswith("43") else ("45", "456")


# ---------------------------------------------------------------------------
# Baixa de stock
# ---------------------------------------------------------------------------
def baixa_stock_venda(
    db: Session, *, empresa_id: UUID, venda: Venda, exercicio_id: UUID | None
) -> dict:
    """Baixa o stock e lança o CMVMC das linhas ligadas a artigos.

    Os erros não abortam a facturação: sobem como avisos. Uma factura já emitida
    e numerada não pode ser desfeita porque faltou stock — o utilizador corrige
    o inventário depois.
    """
    lc = cfg_log(db, empresa_id)
    if lc.get("auto_baixa_venda") is False:
        return {"movimentos": [], "avisos": []}

    linhas_art = [l for l in venda.linhas if l.artigo_id and (l.qtd or ZERO) > 0]
    if not linhas_art:
        return {"movimentos": [], "avisos": []}

    arm = armazem_venda(db, empresa_id)
    if arm is None:
        # Notificação 2. Chave global e não por venda: enquanto não houver
        # armazém, TODAS as facturas saem assim, e uma notificação por factura
        # seria enterrar o problema em cópias de si mesmo.
        notificar(
            db, empresa_id=empresa_id, capacidade="logistica.gerir",
            origem="comercial", chave="sem-armazem-venda",
            titulo="Vendas a sair sem movimentar stock",
            texto=(
                "Não há armazém de saída configurado. As facturas estão a ser "
                "emitidas sem baixa de stock nem lançamento do custo."
            ),
            ligacao="/configuracoes",
        )
        return {
            "movimentos": [],
            "avisos": [
                "Sem armazém configurado — stock não movimentado "
                "(Configurações → Parametrizações)."
            ],
        }

    movimentos, avisos = [], []
    for l in linhas_art:
        try:
            m = registar_movimento(
                db, empresa_id=empresa_id, tipo="saida", artigo_id=l.artigo_id,
                armazem_id=arm, qtd=l.qtd, data=venda.data, documento=venda.numero,
                descricao=f"Venda {venda.numero}", exercicio_id=exercicio_id,
                ignorar_erro_contab=True,
            )
            movimentos.append(m.id)
        except ErroContabilistico as e:
            avisos.append(f"{l.descricao or 'artigo'}: {e}")
    return {"movimentos": movimentos, "avisos": avisos}


# ---------------------------------------------------------------------------
# Emissão
# ---------------------------------------------------------------------------
def emitir(
    db: Session,
    *,
    empresa_id: UUID,
    venda: Venda,
    conta: str | None = None,
    exercicio_id: UUID | None = None,
) -> dict:
    """Valida o documento, atribui-lhe número e lança na contabilidade."""
    if venda.estado == "emitida":
        raise ErroContabilistico("Documento já emitido.")
    if (venda.total or ZERO) <= 0:
        raise ErroContabilistico("Documento sem valor.")

    td = tipo_doc(venda.tipo_doc or "FT")
    if td.get("exige_cliente") and not venda.cliente_id and not venda.cliente_nome:
        raise ErroContabilistico(f"{td['nome']} exige a identificação do cliente.")

    c2 = cfg_com(db, empresa_id)
    cliente = db.get(Terceiro, venda.cliente_id) if venda.cliente_id else None

    usa_cliente = td["contab"] in ("venda", "nota_credito", "nota_debito", "recibo")
    conta_cli = (
        conta_corrente_cliente(db, empresa_id, cliente, c2)
        if usa_cliente
        else ((cliente.conta if cliente else None) or c2["conta_cliente"])
    )

    servicos = venda.tipo == "servicos"
    conta_prov = c2["conta_servicos"] if servicos else c2["conta_vendas"]
    conta_iva = (
        (c2["conta_iva_servicos"] or c2["conta_iva"]) if servicos
        else (c2["conta_iva_vendas"] or c2["conta_iva"])
    )
    doc_venda = (c2["documento_servicos"] or c2["documento"]) if servicos else c2["documento"]
    conta_pag = conta or venda.conta_recebimento or c2["conta_caixa"]
    mes = f"{venda.data.month:02d}"

    # ---- Numeração e cadeia de resumos ------------------------------------
    #
    # A NUMERAÇÃO PASSA PELA SÉRIE. O `proximo_numero` antigo dava
    # `FT 2026/0001` a partir de um contador por prefixo; a lei quer numeração
    # por tipo E por ano, e a AGT quer o código da série dentro do número
    # (`FT FT2026S1/00001`). É a série que o dá agora.
    #
    # A pró-forma não leva numeração fiscal — não é documento fiscal, e gastar
    # números de série com ela seria abrir buracos na sequência que a AGT vê.
    if not venda.numero:
        if svc_series.pode_emitir(td["cod"]):
            serie, sequencia, numero = svc_series.proximo_numero(
                db, empresa_id=empresa_id, tipo_doc=td["cod"], ano=venda.data.year
            )
            venda.serie_id = serie.id
            venda.sequencia = sequencia
            venda.numero = numero
        else:
            venda.numero = proximo_numero(db, empresa_id, td["cod"], venda.data.year)

    # A HORA A QUE ENTROU NO SISTEMA. Não é a data do documento — um documento
    # pode ser datado de ontem e ser lançado hoje — e é o que distingue duas
    # facturas do mesmo dia dentro da cadeia. Vai no SAF-T e na AGT como
    # `systemEntryDate`.
    if venda.entrada_sistema is None:
        venda.entrada_sistema = agora()

    # O RESUMO ENCADEADO. Cada documento leva o resumo do anterior da mesma
    # série: apagar ou alterar um pelo meio parte a cadeia de forma
    # detectável. É o que o SAF-T pede em `Hash`, e é o que o
    # `codigo_validacao` que aqui estava NÃO fazia — era um resumo do número
    # com o total, sem elo nenhum ao documento anterior.
    if venda.serie_id and not venda.hash_doc:
        serie_doc = db.get(SerieDocumento, venda.serie_id)
        anterior = serie_doc.ultimo_hash if serie_doc else None
        venda.hash_anterior = anterior
        venda.hash_doc = cadeia.resumir(
            data_doc=venda.data,
            entrada_sistema=venda.entrada_sistema,
            numero=venda.numero or "",
            total=venda.total,
            hash_anterior=anterior,
        )
        venda.hash_controlo = cadeia.codigo_de_controlo(venda.hash_doc)
        if serie_doc is not None:
            serie_doc.ultimo_hash = venda.hash_doc

    # Comunicável à AGT? Uma pró-forma ou uma guia não são, e marcá-las como
    # «por comunicar» punha-as numa fila onde nunca sairiam.
    venda.estado_agt = (
        "por_comunicar" if docs_fiscais.comunicavel(td["cod"]) else "nao_aplicavel"
    )

    diario, documento_cod = c2["diario"], doc_venda
    linhas: list[dict] = []
    nome_cli = venda.cliente_nome or (cliente.nome if cliente else "")

    if td["contab"] == "venda":
        linhas = [
            {"conta_codigo": conta_cli, "debito": venda.total, "entidade": nome_cli,
             "descricao": venda.numero},
            {"conta_codigo": conta_prov, "credito": venda.subtotal, "entidade": nome_cli,
             "descricao": venda.numero},
        ]
        if venda.iva > 0:
            linhas.append({"conta_codigo": conta_iva, "credito": venda.iva,
                           "descricao": "IVA liquidado"})
    elif td["contab"] == "venda_pronto":
        diario, documento_cod = "56", "561"
        linhas = [
            {"conta_codigo": conta_pag, "debito": venda.total, "entidade": nome_cli,
             "descricao": venda.numero},
            {"conta_codigo": conta_prov, "credito": venda.subtotal, "entidade": nome_cli,
             "descricao": venda.numero},
        ]
        if venda.iva > 0:
            linhas.append({"conta_codigo": conta_iva, "credito": venda.iva,
                           "descricao": "IVA liquidado"})
    elif td["contab"] == "adiantamento":
        diario, documento_cod = _doc_recebimento(conta_pag)
        linhas = [
            {"conta_codigo": conta_pag, "debito": venda.total, "entidade": nome_cli,
             "descricao": venda.numero},
            {"conta_codigo": c2["conta_adiantamento"], "credito": venda.subtotal,
             "entidade": nome_cli, "descricao": f"Adiantamento {venda.numero}"},
        ]
        if venda.iva > 0:
            linhas.append({"conta_codigo": conta_iva, "credito": venda.iva,
                           "descricao": "IVA s/ adiantamento"})
    elif td["contab"] == "nota_debito":
        diario, documento_cod = "61", "614"
        linhas = [
            {"conta_codigo": conta_cli, "debito": venda.total, "entidade": nome_cli,
             "descricao": venda.numero},
            {"conta_codigo": conta_prov, "credito": venda.subtotal, "entidade": nome_cli,
             "descricao": venda.numero},
        ]
        if venda.iva > 0:
            linhas.append({"conta_codigo": conta_iva, "credito": venda.iva,
                           "descricao": "IVA liquidado"})
    elif td["contab"] == "nota_credito":
        # Anula a venda: os sinais são o inverso da factura.
        diario, documento_cod = "61", "613"
        linhas = [
            {"conta_codigo": conta_prov, "debito": venda.subtotal, "entidade": nome_cli,
             "descricao": venda.numero}
        ]
        if venda.iva > 0:
            linhas.append({"conta_codigo": conta_iva, "debito": venda.iva,
                           "descricao": "IVA regularizado (a favor)"})
        linhas.append({"conta_codigo": conta_cli, "credito": venda.total,
                       "entidade": nome_cli, "descricao": venda.numero})
    elif td["contab"] == "recibo":
        diario, documento_cod = _doc_recebimento(conta_pag)
        linhas = [
            {"conta_codigo": conta_pag, "debito": venda.total, "entidade": nome_cli,
             "descricao": f"Recibo {venda.numero}"},
            {"conta_codigo": conta_cli, "credito": venda.total, "entidade": nome_cli,
             "descricao": f"Liquidação {venda.doc_origem_num or venda.numero}"},
        ]
    else:
        # Guia de Remessa e Pró-forma não geram lançamento.
        venda.estado = "emitida"
        venda.cliente_nome = nome_cli
        venda.codigo_validacao = codigo_validacao(venda)
        venda.emitido_em = agora()
        db.flush()
        return {"venda_id": venda.id, "numero": venda.numero, "lancamento_id": None,
                "avisos_stock": []}

    lanc = postar(
        db, empresa_id=empresa_id, data=venda.data, diario_codigo=diario,
        documento_codigo=documento_cod, mes=mes,
        descricao=f"{td['nome']} {venda.numero} — {nome_cli}",
        documento_ref=venda.numero, origem="comercial",
        exercicio_id=exercicio_id, linhas=linhas,
    )

    venda.estado = "emitida"
    venda.cliente_nome = nome_cli
    venda.lancamento_id = lanc.id
    venda.numero_op = lanc.numero_op
    venda.codigo_validacao = codigo_validacao(venda)
    venda.emitido_em = agora()

    avisos = []
    if td["contab"] in ("venda", "venda_pronto"):
        bs = baixa_stock_venda(db, empresa_id=empresa_id, venda=venda, exercicio_id=exercicio_id)
        avisos = bs["avisos"]
        # Notificação 1. A factura está emitida e numerada — não se desfaz. O
        # proveito ficou lançado e o custo não: a margem do mês está errada e,
        # sem isto, o aviso morria no ecrã de quem estava a facturar.
        if avisos:
            notificar(
                db, empresa_id=empresa_id, capacidade="contab.lancar",
                origem="comercial", chave=f"venda-sem-custo:{venda.id}",
                titulo=f"{venda.numero} emitida sem o custo lançado",
                texto=(
                    "A saída de stock ou o lançamento do custo falhou: "
                    + " · ".join(avisos)
                    + ". O proveito está lançado, o custo não."
                ),
                ligacao="/comercial/vendas",
                alvo_tipo="venda", alvo_id=venda.id,
            )

    db.flush()
    return {
        "venda_id": venda.id, "numero": venda.numero, "numero_op": lanc.numero_op,
        "lancamento_id": lanc.id, "codigo_validacao": venda.codigo_validacao,
        "avisos_stock": avisos,
    }


# ---------------------------------------------------------------------------
# Comissões e resumo
# ---------------------------------------------------------------------------
def _emitida(v: Venda) -> bool:
    return v.estado in ("emitida", "faturada")


def _gera_proveito(v: Venda) -> bool:
    return tipo_doc(v.tipo_doc or "FT")["contab"] in ("venda", "venda_pronto", "nota_debito")


def comissoes(db: Session, *, empresa_id: UUID, so_faturadas: bool = True) -> list[dict]:
    """Comissões por vendedor, sobre o subtotal das vendas que geram proveito.

    Notas de crédito não contam: anulam vendas, não as criam.
    """
    from src.db.models.comercial import Vendedor

    vendedores = {
        v.id: v
        for v in db.scalars(
            select(Vendedor).where(Vendedor.empresa_id == empresa_id)
        ).all()
    }
    mapa: dict[UUID, dict] = {}
    for v in db.scalars(select(Venda).where(Venda.empresa_id == empresa_id)).all():
        if so_faturadas and not _emitida(v):
            continue
        if not _gera_proveito(v) or not v.vendedor_id:
            continue
        vd = vendedores.get(v.vendedor_id)
        if vd is None:
            continue
        g = mapa.setdefault(
            v.vendedor_id,
            {"vendedor": vd.nome, "perc": vd.comissao_perc, "tipo": vd.tipo_comissao,
             "base": ZERO, "vendas": 0, "comissao": ZERO},
        )
        g["vendas"] += 1
        g["base"] = r2(g["base"] + (v.subtotal or ZERO))
        inc = (
            (vd.comissao_perc or ZERO)
            if vd.tipo_comissao == "fixo"
            else r2((v.subtotal or ZERO) * (vd.comissao_perc or ZERO) / 100)
        )
        g["comissao"] = r2(g["comissao"] + inc)
    return sorted(mapa.values(), key=lambda g: g["comissao"], reverse=True)


def resumo(db: Session, *, empresa_id: UUID) -> dict:
    vs = db.scalars(select(Venda).where(Venda.empresa_id == empresa_id)).all()
    emit = [v for v in vs if _emitida(v)]
    return {
        "total_vendas": r2(sum((v.total or ZERO for v in vs), ZERO)),
        "total_faturado": r2(sum((v.total or ZERO for v in emit), ZERO)),
        "n_vendas": len(vs),
        "n_faturadas": len(emit),
        "por_faturar": r2(sum((v.total or ZERO for v in vs if not _emitida(v)), ZERO)),
    }
