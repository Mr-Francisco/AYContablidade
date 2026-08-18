"""O número de certificação da AGT é da plataforma, não da empresa.

QUEM CERTIFICA É A AGT, E O QUE ELA CERTIFICA É O PROGRAMA. Uma empresa que
pudesse escrever este número podia declarar uma certificação que não tem, uma
que não existe, ou a de um concorrente — e o ficheiro sairia validado à mesma,
porque o esquema do SAF-T verifica o FORMATO do número e nunca a quem pertence.

Havia dois caminhos para lá chegar, e os dois se fecham aqui:

1. `PUT /api/comercial/config` aceitava um dicionário solto e gravava o que
   viesse — incluindo `software_validacao`.
2. O pedido de exportação do SAF-T aceitava `numero_validacao` no corpo, o que
   nem sequer precisava de gravar nada: bastava enviá-lo na exportação.

Esconder o campo no ecrã não fecha nenhum dos dois. Estes testes atacam o
serviço e o modelo do pedido, que é por onde alguém tentaria a sério.
"""

from datetime import date
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from src.auth.security import ESCOPO_PLATAFORMA
from src.db.models.tenancy import Empresa
from src.services import comercial as svc

CERT_REAL = "141/AGT/2026"
CERT_DE_OUTRO = "999/AGT/2026"


@pytest.fixture
def base():
    from src.db.base import SessionLocal

    db = SessionLocal()
    yield db
    db.rollback()
    db.close()


@pytest.fixture
def empresa(base):
    """A empresa de demonstração, sem certificação, e reposta no fim."""
    e = base.scalar(select(Empresa).where(Empresa.codigo == "DC001"))
    assert e is not None
    antes = e.certificacao_agt
    e.certificacao_agt = None
    base.flush()
    yield e
    e.certificacao_agt = antes
    base.commit()


# ---------------------------------------------------------------------------
# O que a empresa NÃO consegue fazer
# ---------------------------------------------------------------------------
def test_as_parametrizacoes_deixam_cair_a_certificacao(base, empresa):
    """O pedido é aceite, o resto é gravado, e o número não muda.

    Cai em silêncio de propósito: quem envia isto ou está a usar um ecrã
    antigo — e um erro só o confundiria —, ou está a tentar contornar a regra,
    e aí um erro detalhado só lhe diria o que tentar a seguir. O que interessa
    é que o valor não muda.
    """
    guardado = svc.guardar_cfg_com(
        base,
        empresa.id,
        {"software_validacao": CERT_DE_OUTRO, "diario": "61"},
    )

    assert "software_validacao" not in guardado
    base.refresh(empresa)
    assert empresa.certificacao_agt is None
    # E o que era legítimo no mesmo pedido foi gravado.
    assert guardado["diario"] == "61"


def test_as_parametrizacoes_tambem_barram_o_nome_novo(base, empresa):
    """Os dois nomes estão barrados — o antigo e o da coluna nova."""
    guardado = svc.guardar_cfg_com(
        base, empresa.id, {"certificacao_agt": CERT_DE_OUTRO}
    )
    assert "certificacao_agt" not in guardado
    base.refresh(empresa)
    assert empresa.certificacao_agt is None


def test_o_pedido_de_exportacao_nao_tem_onde_receber_um_numero(base, empresa):
    """O BURACO MAIOR: nem era preciso gravar nada.

    Bastava mandar o número no pedido da exportação e o ficheiro saía com ele.
    O campo deixou de existir no modelo — o Pydantic ignora-o, e o gerador vai
    buscar o número à ficha da empresa.
    """
    from src.api.routers.saft_router import PedidoSaft

    assert "numero_validacao" not in PedidoSaft.model_fields

    pedido = PedidoSaft(
        de=date(2026, 3, 1),
        ate=date(2026, 3, 31),
        tipo="facturacao",
        numero_validacao=CERT_DE_OUTRO,  # enviado à mesma, e sem efeito
    )
    assert not hasattr(pedido, "numero_validacao")


def test_o_ficheiro_sai_com_o_numero_da_ficha_e_nao_com_o_enviado(base, empresa):
    from src.api.routers.saft_router import PedidoSaft, _gerar

    empresa.certificacao_agt = CERT_REAL
    base.flush()

    xml = _gerar(
        base,
        empresa,
        PedidoSaft(
            de=date(2026, 3, 1),
            ate=date(2026, 3, 31),
            tipo="facturacao",
            numero_validacao=CERT_DE_OUTRO,
        ),
    )
    assert f"<SoftwareValidationNumber>{CERT_REAL}<".encode() in xml
    assert CERT_DE_OUTRO.encode() not in xml


def test_sem_certificacao_o_ficheiro_diz_a_verdade(base, empresa):
    """`0` é como a norma diz «software ainda não certificado».

    É o valor honesto enquanto a certificação não chega, e passa na validação
    — que é precisamente por isso que um número inventado também passaria.
    """
    from src.api.routers.saft_router import PedidoSaft, _gerar

    xml = _gerar(
        base,
        empresa,
        PedidoSaft(de=date(2026, 3, 1), ate=date(2026, 3, 31), tipo="facturacao"),
    )
    assert b"<SoftwareValidationNumber>0</SoftwareValidationNumber>" in xml


# ---------------------------------------------------------------------------
# O formato, verificado à entrada
# ---------------------------------------------------------------------------
def test_um_numero_mal_escrito_e_recusado_a_entrada():
    """Guardar hoje um número mal escrito só daria erro no dia da entrega."""
    from pydantic import ValidationError

    from src.db.schemas.licenca import EmpresaCertificacaoPedido

    for mau in ("abc", "141/AGT/26", "141-AGT-2026", "AGT/141/2026", "141/agt/2026"):
        with pytest.raises(ValidationError):
            EmpresaCertificacaoPedido(numero=mau)

    assert EmpresaCertificacaoPedido(numero=CERT_REAL).numero == CERT_REAL
    # Vazio e «0» querem dizer o mesmo: sem certificação.
    assert EmpresaCertificacaoPedido(numero="").numero == ""
    assert EmpresaCertificacaoPedido(numero="0").numero == ""


# ---------------------------------------------------------------------------
# O que o superadministrador faz — pela rota, como na vida real
# ---------------------------------------------------------------------------
class SessaoFalsa:
    """Sessão mínima: uma empresa e o que a rota lhe escreve."""

    def __init__(self, empresa):
        self._empresa = empresa
        self.adicionados, self.commits = [], 0

    def get(self, modelo, pk):
        if modelo is Empresa:
            return self._empresa if pk == self._empresa.id else None
        return None

    def add(self, obj):
        self.adicionados.append(obj)

    def commit(self):
        self.commits += 1

    def refresh(self, _obj):
        pass

    def registo(self, accao):
        return next(
            (o for o in self.adicionados if getattr(o, "accao", None) == accao), None
        )


@pytest.fixture
def plataforma():
    from src.api.deps import escopo_do_token, utilizador_atual
    from src.api.main import app
    from src.core.constants import EstadoEmpresa, Perfil, RegimeIVA
    from src.db.base import agora, get_db
    from src.db.models.user import User

    alvo = Empresa(
        id=uuid4(),
        nome="Cliente, Lda.",
        nif="5000000000",
        codigo="CL001",
        estado=EstadoEmpresa.ACTIVA,
        moeda="Kz",
        regime=RegimeIVA.GERAL,
        criado_em=agora(),
        certificacao_agt=None,
    )
    superadmin = User(
        id=uuid4(),
        empresa_id=None,
        nome="Operador",
        email="op@plataforma.ao",
        password_hash="x",
        perfil=Perfil.SUPERADMIN,
        ativo=True,
        aprovado=True,
        token_version=0,
        totp_ativo=True,
        totp_codigos_recuperacao=[],
        totp_falhas=0,
        password_provisoria=False,
        permissoes_extra=[],
        permissoes_accao={},
    )

    db = SessaoFalsa(alvo)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[utilizador_atual] = lambda: superadmin
    app.dependency_overrides[escopo_do_token] = lambda: ESCOPO_PLATAFORMA

    with TestClient(app) as cliente:
        yield cliente, alvo, db

    app.dependency_overrides.clear()


def _definir(cliente, alvo, numero, motivo=None):
    return cliente.patch(
        f"/api/licencas/empresas/{alvo.id}/certificacao",
        json={"numero": numero, "motivo": motivo},
    )


def test_o_superadmin_define_altera_e_remove(plataforma):
    cliente, alvo, _ = plataforma

    r = _definir(cliente, alvo, CERT_REAL)
    assert r.status_code == 200, r.text
    assert r.json()["certificacao_agt"] == CERT_REAL

    r = _definir(cliente, alvo, "222/AGT/2027")
    assert r.status_code == 200
    assert r.json()["certificacao_agt"] == "222/AGT/2027"

    # Vazio limpa — e limpar é legítimo, não é uma falha.
    r = _definir(cliente, alvo, "")
    assert r.status_code == 200
    assert r.json()["certificacao_agt"] is None


def test_repetir_o_mesmo_numero_nao_e_uma_alteracao(plataforma):
    cliente, alvo, _ = plataforma
    _definir(cliente, alvo, CERT_REAL)
    r = _definir(cliente, alvo, CERT_REAL)
    assert r.status_code == 409
    assert "já tem" in r.json()["detail"]


def test_a_alteracao_fica_na_auditoria(plataforma):
    """Este número vai em cada ficheiro entregue à AGT.

    Se um dia se perguntar com que certificação é que uma entrega saiu, a
    resposta tem de existir — com o antes, o depois e quem mudou.
    """
    cliente, alvo, db = plataforma
    _definir(cliente, alvo, CERT_REAL, motivo="Certificação emitida pela AGT")

    registo = db.registo("empresa.certificacao")
    assert registo is not None
    assert registo.detalhes["antes"] is None
    assert registo.detalhes["depois"] == CERT_REAL
    assert registo.detalhes["motivo"] == "Certificação emitida pela AGT"
