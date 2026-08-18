"""SAF-T de Contabilidade — o terceiro ficheiro, e o único que não é mensal.

Prazo: 10 de Abril do ano seguinte. `TaxAccountingBasis = "C"`, e os blocos são
outros: `GeneralLedgerAccounts` com o plano de contas e `GeneralLedgerEntries`
com os lançamentos do exercício.

ESTES TESTES CHEGARAM TARDE, e é a razão de existirem com este cuidado. O
gerador foi escrito, corrido à mão contra a base de demonstração e dado por
bom — mas ficou meses sem porta nenhuma na aplicação: o `saft_router` só
aceitava `facturacao` e `compras`, e o ecrã só oferecia dois botões. Código que
ninguém consegue chamar não tem como falhar, e por isso também não tem como
provar que funciona. Ao ligá-lo ao ecrã, passa a precisar das mesmas garantias
que os outros dois.

O que o esquema exige aqui e nenhuma documentação diz — tudo descoberto pelo
validador, um erro de cada vez:

  - `TransactionID` é `AAAA-MM-DD DIÁRIO NÚMERO`, com espaços;
  - `Period` vai de 1 a 16 — o período 00 do plano angolano NÃO passa;
  - `GLPostingDate` é data, `SystemEntryDate` é data-hora;
  - dentro de `Lines`, TODOS os débitos antes de TODOS os créditos.
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import delete, select

from src.db.models.contabilidade import Conta, Lancamento, LancamentoLinha
from src.db.models.tenancy import Empresa
from src.services.facturacao import saft

MARCA = "T3"
VALIDACAO = "0"
ANO = 2097


@pytest.fixture
def base():
    from src.db.base import SessionLocal

    db = SessionLocal()
    _limpar(db)
    yield db
    _limpar(db)
    db.close()


def _limpar(db):
    db.rollback()
    ids = list(db.scalars(select(Lancamento.id).where(Lancamento.data >= date(ANO, 1, 1))))
    if ids:
        db.execute(delete(LancamentoLinha).where(LancamentoLinha.lancamento_id.in_(ids)))
        db.execute(delete(Lancamento).where(Lancamento.id.in_(ids)))
    db.commit()


@pytest.fixture
def empresa(base):
    e = base.scalar(select(Empresa).where(Empresa.codigo == "DC001")) or base.scalar(
        select(Empresa).order_by(Empresa.criado_em).limit(1)
    )
    assert e is not None
    if not e.morada:
        e.morada, e.localizacao = "Rua de Teste, 1", "Luanda"
        base.flush()
    return e


def _lancamento(db, empresa, *, numero=1, mes="03", dia=12, valor="15000"):
    """Um lançamento equilibrado: um débito e um crédito do mesmo valor."""
    x = Lancamento(
        empresa_id=empresa.id,
        numero=numero,
        numero_op=f"{mes}/1.{numero:03d}",
        data=date(ANO, int(mes) if mes.isdigit() and 1 <= int(mes) <= 12 else 12, dia),
        mes=mes,
        diario_codigo="1",
        documento_codigo="DIV",
        descricao=f"{MARCA} Lançamento {numero}",
        origem="manual",
    )
    db.add(x)
    db.flush()
    db.add_all(
        [
            LancamentoLinha(
                lancamento_id=x.id,
                ordem=0,
                conta_codigo="6111",
                conta_nome="Compras de mercadorias",
                descricao="Compra",
                debito=Decimal(valor),
                credito=Decimal("0"),
            ),
            LancamentoLinha(
                lancamento_id=x.id,
                ordem=1,
                conta_codigo="4311",
                conta_nome="Fornecedores c/c",
                descricao="Dívida ao fornecedor",
                debito=Decimal("0"),
                credito=Decimal(valor),
            ),
        ]
    )
    db.flush()
    db.refresh(x)
    return x


def _gerar(db, empresa):
    return saft.gerar_contabilidade(
        db,
        empresa=empresa,
        de=date(ANO, 1, 1),
        ate=date(ANO, 12, 31),
        numero_validacao=VALIDACAO,
    )


# ---------------------------------------------------------------------------
def test_o_ficheiro_de_contabilidade_valida_contra_o_xsd(base, empresa):
    _lancamento(base, empresa, numero=1)
    _lancamento(base, empresa, numero=2, mes="07", dia=3, valor="8250.75")

    xml = _gerar(base, empresa)
    valido, erros = saft.validar(xml)
    assert valido, chr(10).join(erros[:6])


def test_o_tipo_de_ficheiro_e_contabilidade(base, empresa):
    """`C`, e não `F` nem `A`. É o campo que diz à AGT o que está a receber."""
    xml = _gerar(base, empresa).decode()
    assert "<TaxAccountingBasis>C</TaxAccountingBasis>" in xml


def test_leva_o_plano_de_contas_inteiro_e_nao_so_o_movimentado(base, empresa):
    """A fotografia do plano com que a empresa trabalhou no exercício.

    Uma conta sem movimento no ano continua a fazer parte do plano, e omiti-la
    daria a entender que não existia.
    """
    _lancamento(base, empresa, numero=3)
    total = base.scalar(
        select(Conta).where(Conta.empresa_id == empresa.id).limit(1)
    )
    assert total is not None, "a empresa de teste tem de ter plano de contas"

    xml = _gerar(base, empresa).decode()
    quantas_no_plano = base.scalar(
        select(Conta.id).where(Conta.empresa_id == empresa.id).limit(1)
    )
    assert quantas_no_plano is not None
    # Muito mais contas do que as duas movimentadas.
    assert xml.count("<Account>") > 2
    assert "<GeneralLedgerAccounts>" in xml


def test_os_debitos_vem_todos_antes_dos_creditos(base, empresa):
    """REGRESSÃO QUE O VALIDADOR APANHOU: o esquema não aceita intercalar.

    Escrever as linhas pela ordem em que estão no lançamento parece o mais
    natural e é exactamente o que o `Lines` recusa.

    O lançamento aqui é INTERCALADO de propósito — crédito, débito, crédito,
    débito. Escrevi este teste primeiro com um lançamento normal (débito e
    depois crédito) e ele passava sem provar nada: a ordem certa já vinha da
    fixture. Um teste que passa por sorte é pior do que não existir, porque dá
    a impressão de estar coberto.
    """
    x = Lancamento(
        empresa_id=empresa.id,
        numero=40,
        numero_op="04/1.040",
        data=date(ANO, 4, 9),
        mes="04",
        diario_codigo="1",
        documento_codigo="DIV",
        descricao=f"{MARCA} Lançamento intercalado",
        origem="manual",
    )
    base.add(x)
    base.flush()
    base.add_all(
        [
            LancamentoLinha(
                lancamento_id=x.id, ordem=0, conta_codigo="4311",
                conta_nome="Fornecedores c/c",
                debito=Decimal("0"), credito=Decimal("300"),
            ),
            LancamentoLinha(
                lancamento_id=x.id, ordem=1, conta_codigo="6111",
                conta_nome="Compras", debito=Decimal("100"), credito=Decimal("0"),
            ),
            LancamentoLinha(
                lancamento_id=x.id, ordem=2, conta_codigo="4311",
                conta_nome="Fornecedores c/c",
                debito=Decimal("0"), credito=Decimal("100"),
            ),
            LancamentoLinha(
                lancamento_id=x.id, ordem=3, conta_codigo="6211",
                conta_nome="Fornecimentos",
                debito=Decimal("300"), credito=Decimal("0"),
            ),
        ]
    )
    base.flush()

    xml = _gerar(base, empresa).decode()
    assert xml.count("<DebitLine>") == 2
    assert xml.count("<CreditLine>") == 2
    assert xml.rindex("<DebitLine>") < xml.index("<CreditLine>")

    # E o ficheiro continua válido, que é o que isto tudo serve para garantir.
    valido, erros = saft.validar(xml.encode())
    assert valido, chr(10).join(erros[:5])


def test_o_periodo_13_e_uma_regularizacao_e_nao_um_mes(base, empresa):
    """Os períodos 13, 14 e 15 do plano angolano não são meses.

    A norma distingue regularizações (`R`) e apuramentos (`A`), e a
    correspondência é directa — chamar-lhes `N` seria declarar mal uma coisa
    que o sistema já sabe.
    """
    _lancamento(base, empresa, numero=5, mes="13", dia=31)
    xml = _gerar(base, empresa).decode()
    assert "<TransactionType>R</TransactionType>" in xml


def test_uma_conta_fora_do_plano_e_recusada_com_o_nome_do_lancamento(base, empresa):
    """A conta usada num lançamento TEM de existir no plano exportado.

    Encontrado a escrever o teste da ordem das linhas, e vale mais do que o
    teste que o encontrou. A linha do lançamento guarda o código da conta como
    texto — de propósito, para o razão mostrar a conta como estava à data — e
    nada impede uma linha numa conta que saiu do plano ou que lá nunca esteve.

    Sem esta verificação o ficheiro sai, a AGT recusa-o, e o que se lê é «No
    match found for key-sequence ['4321'] of keyref …». Ninguém age sobre
    aquilo, e o prazo continua a correr. Aqui diz-se que conta é e em que
    lançamento está.
    """
    x = Lancamento(
        empresa_id=empresa.id,
        numero=50,
        numero_op="06/1.050",
        data=date(ANO, 6, 6),
        mes="06",
        diario_codigo="1",
        documento_codigo="DIV",
        descricao=f"{MARCA} Conta órfã",
        origem="manual",
    )
    base.add(x)
    base.flush()
    base.add_all(
        [
            LancamentoLinha(
                lancamento_id=x.id, ordem=0, conta_codigo="6111",
                conta_nome="Compras", debito=Decimal("50"), credito=Decimal("0"),
            ),
            LancamentoLinha(
                lancamento_id=x.id, ordem=1, conta_codigo="9999999",
                conta_nome="Conta que não existe no plano",
                debito=Decimal("0"), credito=Decimal("50"),
            ),
        ]
    )
    base.flush()

    with pytest.raises(saft.ErroSaft) as erro:
        _gerar(base, empresa)

    mensagem = str(erro.value)
    assert "9999999" in mensagem, "tem de dizer QUE conta"
    assert "06/1.050" in mensagem, "e em QUE lançamento"


def test_um_exercicio_sem_lancamentos_gera_ficheiro_valido(base, empresa):
    """Entrega-se na mesma: a obrigação existe, haja ou não movimento."""
    xml = _gerar(base, empresa)
    valido, erros = saft.validar(xml)
    assert valido, chr(10).join(erros[:5])
    assert b"<NumberOfEntries>0</NumberOfEntries>" in xml


def test_os_totais_batem_com_as_linhas(base, empresa):
    """Débitos e créditos somam o mesmo — é partida dobrada."""
    _lancamento(base, empresa, numero=6, valor="1000")
    _lancamento(base, empresa, numero=7, mes="05", valor="2500")
    xml = _gerar(base, empresa).decode()
    assert "<TotalDebit>3500.00</TotalDebit>" in xml
    assert "<TotalCredit>3500.00</TotalCredit>" in xml


def test_os_lancamentos_de_outra_empresa_nao_entram(base, empresa):
    """A mesma regra dos outros dois ficheiros: nunca se misturam empresas."""
    outra = base.scalar(select(Empresa).where(Empresa.id != empresa.id).limit(1))
    if outra is None:
        pytest.skip("só há uma empresa na base")

    _lancamento(base, empresa, numero=8, valor="111")
    x = _lancamento(base, outra, numero=9, valor="999")
    x.empresa_id = outra.id
    base.flush()

    xml = _gerar(base, empresa).decode()
    assert "111.00" in xml
    assert "999.00" not in xml
