"""A ficha do colaborador — os oito separadores do Piloto.

A Produção tinha nove campos. A ficha do Piloto (`pessoal.html`) tem perto de
trinta, e os que faltavam não tinham sequer coluna: quem preenchesse a morada,
o contacto ou o número do documento perdia-os ao gravar, sem aviso nenhum.

Três coisas se garantem aqui, e todas já falharam noutro sítio do projecto:

1. **Vai e volta.** O que se grava tem de voltar na leitura. Devolver metade
   dos campos fazia com que abrir a ficha para corrigir o IBAN a trouxesse com
   o resto em branco — e gravar por cima apagava-o.
2. **Identificação mínima.** NIF *ou* número do documento, e um contacto. Sem
   um identificador fiscal o trabalhador não entra no Mapa de Remunerações.
   Quem garante é o servidor; o ecrã só avisa mais cedo.
3. **O número é único e alterável.** Vinha excluído do PATCH: quem o corrigisse
   via-o voltar ao antigo em silêncio.
"""

from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import delete, select

from src.api.routers.rh_router import (
    ColaboradorEntrada,
    atualizar_colaborador,
    criar_colaborador,
    listar_colaboradores,
)
from src.db.models.rh import Colaborador
from src.db.models.tenancy import Empresa

#: Prefixo dos registos destes testes: as rotas fazem `commit`, por isso o
#: `rollback` não chega para os tirar da base.
MARCA = "T6"


def _limpar(db):
    db.rollback()
    db.execute(delete(Colaborador).where(Colaborador.nome.like(f"{MARCA}%")))
    db.commit()


@pytest.fixture
def base():
    from src.db.base import SessionLocal

    db = SessionLocal()
    _limpar(db)
    yield db
    _limpar(db)
    db.close()


@pytest.fixture
def empresa(base):
    class _E:
        pass

    e = _E()
    e.id = base.scalar(select(Empresa.id).limit(1))
    assert e.id is not None
    return e


class _Pedido:
    """O mínimo que as rotas usam do pedido (auditoria)."""

    class client:  # noqa: N801 — imita o objecto do Starlette
        host = "127.0.0.1"

    headers: dict = {}
    url = type("U", (), {"path": "/api/rh/colaboradores"})()
    method = "POST"


#: A ficha inteira, um valor por campo — é o que o ecrã envia.
FICHA = dict(
    nome=f"{MARCA} Joana Bengui",
    nome_abreviado="J. Bengui",
    genero="Feminino",
    data_nascimento=date(1990, 4, 12),
    nacionalidade="Angolana",
    naturalidade="Benguela",
    morada="Rua 1º de Maio, 42",
    localidade="Lobito",
    codigo_postal="0000",
    pais="Angola",
    provincia="Benguela",
    municipio="Lobito",
    comuna="Canata",
    email="joana@exemplo.ao",
    telefone="222000111",
    telemovel="923000111",
    tipo_documento="Bilhete de Identidade",
    num_documento="004512345LA041",
    validade_documento=date(2030, 1, 31),
    nif="004512345LA041",
    num_ss="1234567890",
    estado_civil="Casado(a)",
    dependentes=2,
    regime_irt="Grupo A — Trabalho por conta de outrem",
    categoria="Técnica de contabilidade",
    tipo_contrato="Sem termo",
    data_admissao=date(2024, 3, 1),
    data_fim=None,
    salario_base=Decimal("350000.00"),
    subsidios=Decimal("50000.00"),
    subs_nao_sujeitos=Decimal("30000.00"),
    estado="activo",
    forma_pagamento="Transferência bancária",
    banco="BAI",
    iban="AO06000600000100037131174",
    dias_ferias=22,
    subsidio_ferias=Decimal("350000.00"),
    subsidio_natal=Decimal("350000.00"),
    habilitacoes="Licenciatura em Contabilidade",
    notas="Entrou por transferência interna.",
)


def _criar(db, empresa, **alteracoes):
    dados = ColaboradorEntrada(**{**FICHA, **alteracoes})
    return criar_colaborador(_Pedido(), dados, empresa, db)


# ---------------------------------------------------------------------------
# 1. Vai e volta
# ---------------------------------------------------------------------------
def test_a_ficha_inteira_volta_como_foi_gravada(base, empresa):
    """REGRESSÃO: gravavam-se trinta campos e liam-se quinze."""
    criado = _criar(base, empresa)

    lida = next(
        c for c in listar_colaboradores(empresa, base) if c["id"] == criado["id"]
    )

    for campo, esperado in FICHA.items():
        assert campo in lida, f"a leitura não devolve «{campo}»"
        assert lida[campo] == esperado, f"«{campo}» voltou diferente"


def test_alterar_um_campo_nao_apaga_os_outros(base, empresa):
    criado = _criar(base, empresa)

    atualizar_colaborador(
        _Pedido(),
        criado["id"],
        ColaboradorEntrada(**{**FICHA, "iban": "AO06004000000123456789101"}),
        empresa,
        base,
    )

    lida = next(
        c for c in listar_colaboradores(empresa, base) if c["id"] == criado["id"]
    )
    assert lida["iban"] == "AO06004000000123456789101"
    assert lida["morada"] == FICHA["morada"]
    assert lida["habilitacoes"] == FICHA["habilitacoes"]
    assert lida["dependentes"] == 2


# ---------------------------------------------------------------------------
# 2. Identificação mínima
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("campo,rotulo", [
    ("nif", "o NIF"),
    ("num_ss", "Segurança Social"),
    ("provincia", "a província"),
    ("municipio", "o município"),
    ("morada", "a morada"),
    ("localidade", "a localidade"),
])
def test_campos_exigidos_pelo_mapa_de_remuneracoes(campo, rotulo):
    """REGRA ACTUALIZADA (16 de Agosto de 2026).

    Antes bastava NIF **ou** número do documento. Passa a ser exigida a ficha
    que o Mapa de Remunerações precisa: sem NIF, INSS, província, município,
    morada e localidade, o modelo IRT A2.1 sai incompleto e é recusado — e a
    falha aparece semanas depois, a quem não preencheu a ficha.
    """
    with pytest.raises(ValidationError) as erro:
        ColaboradorEntrada(**{**FICHA, campo: None})
    assert rotulo in str(erro.value)


def test_diz_todos_os_campos_em_falta_de_uma_vez():
    """Um de cada vez obrigava a submeter seis vezes para os descobrir."""
    with pytest.raises(ValidationError) as erro:
        ColaboradorEntrada(
            **{**FICHA, "nif": None, "num_ss": None, "morada": None}
        )
    m = str(erro.value)
    assert "o NIF" in m and "Segurança Social" in m and "a morada" in m


def test_salario_base_a_zero_recusa():
    """Entrava no processamento e saía com líquido zero, sem ninguém reparar."""
    with pytest.raises(ValidationError) as erro:
        ColaboradorEntrada(**{**FICHA, "salario_base": Decimal("0")})
    assert "salário base" in str(erro.value).lower()


# ---------------------------------------------------------------------------
# Subsídio de férias em percentagem
# ---------------------------------------------------------------------------
def test_percentagem_calcula_o_valor_do_subsidio():
    """O valor continua a ser o que o processamento lê."""
    e = ColaboradorEntrada(
        **{**FICHA, "salario_base": Decimal("350000"), "subsidio_ferias_perc": Decimal("50")}
    )
    assert e.subsidio_ferias == Decimal("175000.00")


def test_sem_percentagem_o_valor_escrito_e_respeitado():
    """O comportamento de sempre não se perde."""
    e = ColaboradorEntrada(
        **{**FICHA, "subsidio_ferias": Decimal("123456.78"), "subsidio_ferias_perc": None}
    )
    assert e.subsidio_ferias == Decimal("123456.78")


def test_a_percentagem_fica_gravada_e_volta(base, empresa):
    """Para a ficha reabrir a dizer como foi calculada."""
    criado = _criar(base, empresa, subsidio_ferias_perc=Decimal("50"))
    lida = next(
        c for c in listar_colaboradores(empresa, base) if c["id"] == criado["id"]
    )
    assert lida["subsidio_ferias_perc"] == Decimal("50.00")
    assert lida["subsidio_ferias"] == Decimal("175000.00")


def test_sem_nenhum_contacto_recusa():
    with pytest.raises(ValidationError) as erro:
        ColaboradorEntrada(
            **{**FICHA, "email": None, "telefone": None, "telemovel": None}
        )
    assert "contacto" in str(erro.value)


@pytest.mark.parametrize("contacto", ["email", "telefone", "telemovel"])
def test_um_contacto_qualquer_chega(contacto):
    vazios = {"email": None, "telefone": None, "telemovel": None}
    ColaboradorEntrada(**{**FICHA, **vazios, contacto: FICHA[contacto]})


# ---------------------------------------------------------------------------
# 3. O número
# ---------------------------------------------------------------------------
def test_sem_numero_atribui_o_seguinte(base, empresa):
    criado = _criar(base, empresa, numero=None)
    assert criado["numero"] and criado["numero"].isdigit()


def test_numero_repetido_recusa_com_mensagem(base, empresa):
    primeiro = _criar(base, empresa, numero=None)

    with pytest.raises(HTTPException) as erro:
        _criar(base, empresa, nome=f"{MARCA} Outro", numero=primeiro["numero"])
    assert erro.value.status_code == 409
    assert primeiro["numero"] in erro.value.detail


def test_o_numero_pode_ser_corrigido(base, empresa):
    """REGRESSÃO: o PATCH excluía `numero` — corrigi-lo não fazia nada."""
    criado = _criar(base, empresa, numero=None)
    novo = f"9{criado['numero']}"

    atualizar_colaborador(
        _Pedido(),
        criado["id"],
        ColaboradorEntrada(**{**FICHA, "numero": novo}),
        empresa,
        base,
    )

    lida = next(
        c for c in listar_colaboradores(empresa, base) if c["id"] == criado["id"]
    )
    assert lida["numero"] == novo
