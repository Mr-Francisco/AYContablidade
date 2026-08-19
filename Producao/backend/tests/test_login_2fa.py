"""Login em dois passos (etapa 3).

O que aqui se fixa não é o caminho feliz — esse vê-se a usar o sistema. É o que
sustenta o segundo factor e que se parte sem dar por isso:

- um token de DESAFIO não abre sessão nenhuma. Sem esta separação, bastava
  ignorar o segundo pedido e usar o que o primeiro devolveu;
- uma palavra-passe errada numa conta com 2FA não é distinguível de um código
  errado — senão o formulário confirma palavras-passe a quem as anda a testar;
- um código usado não serve outra vez.
"""

import json
import os
import time
from uuid import uuid4

import pyotp
import pytest
from fastapi.testclient import TestClient

from src.core.config import get_settings

CHAVE = "chave-de-teste-do-2fa-nao-usar-em-producao"
PASSWORD = "uma-palavra-passe-de-teste-123"
EMAIL = "ana@teste.ao"
CODIGO_EMPRESA = "TS001"


class SessaoFalsa:
    """Sessão mínima: devolve sempre os mesmos objectos e conta os commits."""

    def __init__(self, user, empresa):
        self._user, self._empresa = user, empresa
        self.adicionados, self.commits = [], 0

    def get(self, modelo, pk):
        from src.db.models.tenancy import Empresa
        from src.db.models.user import User

        if modelo is User:
            return self._user if pk == self._user.id else None
        if modelo is Empresa:
            return self._empresa if pk == self._empresa.id else None
        return None

    def scalar(self, _stmt):
        # A única consulta do login é a procura do utilizador por e-mail; o
        # duplo não interpreta SQL, devolve o único que existe.
        return self._user

    def add(self, obj):
        self.adicionados.append(obj)

    def commit(self):
        self.commits += 1

    def refresh(self, _obj):
        pass

    def accoes_auditadas(self):
        return [getattr(o, "accao", None) for o in self.adicionados]


@pytest.fixture
def ambiente():
    antes = os.environ.get("TOTP_CHAVE_CIFRA")
    os.environ["TOTP_CHAVE_CIFRA"] = CHAVE
    get_settings.cache_clear()

    from src.api.limites import limiter
    from src.api.main import app
    from src.auth import totp
    from src.auth.security import hash_password
    from src.core.constants import EstadoEmpresa, Perfil
    from src.db.base import get_db
    from src.db.models.tenancy import Empresa
    from src.db.models.user import User

    empresa = Empresa(
        id=uuid4(),
        nome="Teste, Lda.",
        nif="5000000000",
        codigo=CODIGO_EMPRESA,
        estado=EstadoEmpresa.ACTIVA,
    )
    segredo = totp.gerar_segredo()
    codigos = totp.gerar_codigos_recuperacao()
    user = User(
        id=uuid4(),
        empresa_id=empresa.id,
        nome="Ana Teste",
        email=EMAIL,
        password_hash=hash_password(PASSWORD),
        perfil=Perfil.ADMIN,
        ativo=True,
        aprovado=True,
        token_version=0,
        totp_ativo=True,
        totp_segredo=totp.cifrar_segredo(segredo),
        totp_codigos_recuperacao=[totp.hash_codigo(c) for c in codigos],
        totp_falhas=0,
        password_provisoria=False,
        # Como o `aprovado` e o `ativo`: o valor por omissão da coluna só entra
        # ao gravar, e um objecto construído em memória fica com `None` — que
        # o login lê como «esta conta ainda não tem palavra-passe».
        password_definida=True,
        permissoes_extra=[],
        permissoes_accao={},
    )

    db = SessaoFalsa(user, empresa)
    app.dependency_overrides[get_db] = lambda: db
    # A licença é validada por uma função à parte; aqui interessa o 2FA.
    import src.api.routers.auth_router as ar

    licenca_original = ar.licenca_valida
    ar.licenca_valida = lambda _l: True
    # Desligado porque o que aqui se testa é o bloqueio POR CONTA, e o limite
    # por IP tapava-o: são dois pedidos por tentativa contra um limite de cinco
    # por minuto. As contagens em si são repostas pelo `conftest.py`, que
    # também devolve o `enabled` como estava — daí não se fixar aqui um valor.
    limiter.enabled = False

    with TestClient(app) as cliente:
        yield cliente, user, db, segredo, codigos

    ar.licenca_valida = licenca_original
    app.dependency_overrides.clear()
    if antes is None:
        os.environ.pop("TOTP_CHAVE_CIFRA", None)
    else:
        os.environ["TOTP_CHAVE_CIFRA"] = antes
    get_settings.cache_clear()


def _passo1(cliente, password=PASSWORD, empresa=CODIGO_EMPRESA):
    return cliente.post(
        "/api/auth/login",
        json={"email": EMAIL, "password": password, "empresa": empresa},
    )


def _passo2(cliente, desafio, codigo):
    return cliente.post(
        "/api/auth/login/2fa", json={"desafio": desafio, "codigo": codigo}
    )


def _desafio(cliente, **kw):
    """O desafio do primeiro passo, ou uma falha que se percebe.

    Sem isto, um primeiro passo que respondesse outra coisa — «demasiadas
    tentativas», uma licença recusada — dava `KeyError: 'desafio'` a meio de um
    ciclo, ou pior: o ciclo seguia, as tentativas não eram contadas e a queixa
    só aparecia na contagem final, a dizer `0 == 3`. Passavam-se horas a
    procurar o defeito no bloqueio da conta, que estava bom.
    """
    r = _passo1(cliente, **kw)
    corpo = r.json()
    assert "desafio" in corpo, (
        f"o primeiro passo não devolveu desafio: HTTP {r.status_code} {corpo}"
    )
    return corpo["desafio"]


def _codigo_errado(segredo):
    """Seis dígitos que este segredo NÃO pode validar.

    O `"000000"` que aqui estava parecia servir e não serve. É um código como
    qualquer outro: uma vez em cada cento e trinta mil, o segredo sorteado no
    arranque do teste torna-o VÁLIDO na janela em curso — medido, não suposto.
    Quando calhava, a tentativa «errada» entrava, o login repunha a contagem de
    falhas a zero e o teste do bloqueio falhava a dizer `0 == 3`. Repetido logo
    a seguir passava — outro segredo, outra sorte. É a definição de teste
    instável, e estava a esconder uma garantia de segurança a sério.

    A margem é maior do que a janela do servidor de propósito: entre gerar o
    código e o servidor o verificar o relógio pode mudar de passo.
    """
    totp = pyotp.TOTP(segredo)
    passo = int(time.time()) // totp.interval
    validos = {totp.generate_otp(passo + desvio) for desvio in range(-3, 4)}
    for n in range(1000000):
        candidato = f"{n:06d}"
        if candidato not in validos:
            return candidato
    raise AssertionError("um milhão de códigos não pode estar todo válido")


def _falhar(cliente, segredo, quantas, **kw):
    """Gasta `quantas` tentativas com códigos errados, confirmando cada uma.

    Confirmar aqui é a diferença entre uma queixa que se lê e a contagem final
    a dizer `0 == 3`. Se uma tentativa não chegar a ser recusada PELO CÓDIGO —
    porque o limite de pedidos a travou antes, porque a licença foi recusada,
    porque o segredo não se conseguiu decifrar — o teste diz qual delas foi e o
    que veio em vez da recusa, em vez de deixar a contagem a zero e a culpa a
    parecer do bloqueio da conta.
    """
    for tentativa in range(1, quantas + 1):
        r = _passo2(cliente, _desafio(cliente, **kw), _codigo_errado(segredo))
        assert r.status_code == 401, (
            f"tentativa {tentativa} de {quantas}: esperava-se a recusa do "
            f"segundo passo e veio HTTP {r.status_code} {r.json()}"
        )


# ---------------------------------------------------------------------------
# Primeiro passo
# ---------------------------------------------------------------------------
def test_com_2fa_o_primeiro_passo_nao_da_sessao(ambiente):
    cliente, _, _, _, _ = ambiente
    d = _passo1(cliente).json()
    assert d["requer_2fa"] is True
    assert "access_token" not in d
    assert d["desafio"]


def test_sem_2fa_o_login_continua_de_um_so_passo(ambiente):
    """A etapa não pode mudar nada para quem não activou o segundo factor."""
    cliente, user, _, _, _ = ambiente
    user.totp_ativo = False
    d = _passo1(cliente).json()
    assert "access_token" in d
    assert "requer_2fa" not in d


# ---------------------------------------------------------------------------
# O desafio não é uma sessão
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("rota", ["/api/auth/me", "/api/auth/2fa"])
def test_o_desafio_nao_abre_sessao(ambiente, rota):
    """REGRESSÃO CRÍTICA: se o desafio fosse aceite como token de acesso,
    bastava não fazer o segundo pedido e o segundo factor não existia."""
    cliente, _, _, _, _ = ambiente
    desafio = _desafio(cliente)
    r = cliente.get(rota, headers={"Authorization": f"Bearer {desafio}"})
    assert r.status_code == 401


def test_o_desafio_nao_renova_sessao(ambiente):
    cliente, _, _, _, _ = ambiente
    desafio = _desafio(cliente)
    r = cliente.post(
        "/api/auth/refresh", headers={"Authorization": f"Bearer {desafio}"}
    )
    assert r.status_code == 401


def test_o_desafio_nao_leva_perfil_nem_empresa(ambiente):
    """O conteúdo de um JWT lê-se sem chave. O desafio não é sessão e não tem
    de dizer quem é nem o que pode."""
    import jwt

    cliente, _, _, _, _ = ambiente
    payload = jwt.decode(
        _desafio(cliente), options={"verify_signature": False}
    )
    assert "perfil" not in payload
    assert "emp" not in payload
    assert payload["tipo"] == "desafio"


def test_um_token_de_acesso_nao_serve_como_desafio(ambiente):
    cliente, user, _, segredo, _ = ambiente
    user.totp_ativo = False
    token = _passo1(cliente).json()["access_token"]
    user.totp_ativo = True
    assert _passo2(cliente, token, pyotp.TOTP(segredo).now()).status_code == 401


# ---------------------------------------------------------------------------
# Segundo passo
# ---------------------------------------------------------------------------
def test_o_codigo_certo_abre_a_sessao(ambiente):
    cliente, _, _, segredo, _ = ambiente
    desafio = _desafio(cliente)
    r = _passo2(cliente, desafio, pyotp.TOTP(segredo).now())
    assert r.status_code == 200
    assert r.json()["access_token"]


def test_o_codigo_errado_e_recusado(ambiente):
    cliente, _, _, segredo, _ = ambiente
    desafio = _desafio(cliente)
    assert _passo2(cliente, desafio, _codigo_errado(segredo)).status_code == 401


def test_o_mesmo_codigo_nao_serve_duas_vezes(ambiente):
    """REGRESSÃO: um código vale cerca de um minuto. Sem guardar o passo de
    tempo, quem o intercepte tem uma janela para o repetir."""
    cliente, _, _, segredo, _ = ambiente
    codigo = pyotp.TOTP(segredo).now()
    assert _passo2(cliente, _desafio(cliente), codigo).status_code == 200
    assert _passo2(cliente, _desafio(cliente), codigo).status_code == 401


def test_repetir_o_codigo_nao_gasta_tentativas_nem_tranca_a_conta(ambiente):
    """REGRESSÃO: era assim que a conta se trancava sozinha.

    Um código certo mas já usado vinha indistinguível de um código inventado:
    a pessoa lia «verifique o código» e perdia uma das TRÊS tentativas até ao
    bloqueio de quinze minutos. Bastava entrar duas vezes seguidas — ou ter o
    telemóvel meio passo adiantado, que leva o servidor a gravar um contador à
    frente do relógio dele — para ficar de fora sem ter feito nada de errado.

    Recusar continua a recusar. O que muda é que não conta como falha e que a
    mensagem diz o que fazer: esperar pelo código seguinte.
    """
    cliente, user, _, segredo, _ = ambiente
    codigo = pyotp.TOTP(segredo).now()
    assert _passo2(cliente, _desafio(cliente), codigo).status_code == 200

    for _ in range(5):
        r = _passo2(cliente, _desafio(cliente), codigo)
        assert r.status_code == 401
        assert "já foi utilizado" in r.json()["detail"], r.json()["detail"]

    assert not user.totp_falhas, "um código repetido não é uma tentativa falhada"
    assert user.totp_bloqueado_ate is None, "a conta não podia ter sido trancada"

    # E o código SEGUINTE entra, sem esperar por bloqueio nenhum.
    seguinte = pyotp.TOTP(segredo).generate_otp(
        pyotp.TOTP(segredo).timecode(__import__("datetime").datetime.now()) + 1
    )
    assert _passo2(cliente, _desafio(cliente), seguinte).status_code == 200


def test_codigo_errado_continua_a_gastar_tentativas(ambiente):
    """O outro lado da moeda: sem isto, a correcção acima abria a porta a
    tentar códigos à sorte sem limite."""
    cliente, user, _, segredo, _ = ambiente
    _falhar(cliente, segredo, 3)
    assert user.totp_falhas >= 3
    assert user.totp_bloqueado_ate is not None, "três códigos errados têm de trancar"


def test_o_limite_de_pedidos_fala_portugues_e_na_chave_certa():
    """REGRESSÃO: o tratador que vem com o slowapi devolve
    `{"error": "Rate limit exceeded: 5 per 1 minute"}`.

    Está em inglês, e a interface lê a mensagem de `detail` — não encontrando
    nada, mostrava «Erro 429» e mais nada. Quem apanhava isto era justamente
    quem andava às voltas com o segundo factor: ao fim de meia dúzia de
    tentativas o ecrã deixava de explicar o que quer que fosse.
    """
    import inspect

    from src.api import main

    fonte = inspect.getsource(main)
    assert "_rate_limit_exceeded_handler" not in fonte, (
        "o tratador do slowapi responde em inglês e fora de `detail`"
    )
    assert "RateLimitExceeded, _limite_excedido" in fonte

    class _Pedido:
        pass

    resposta = main._limite_excedido(_Pedido(), None)
    assert resposta.status_code == 429
    corpo = json.loads(bytes(resposta.body).decode())
    assert "detail" in corpo, "a interface lê a mensagem de `detail`"
    assert "Aguarde" in corpo["detail"]
    assert resposta.headers.get("retry-after") == "60"


def test_desafio_adulterado(ambiente):
    cliente, _, _, segredo, _ = ambiente
    d = _desafio(cliente).split(".")
    falso = f"{d[0]}.{d[1][:-4]}AAAA.{d[2]}"
    assert _passo2(cliente, falso, pyotp.TOTP(segredo).now()).status_code == 401


def test_mudar_a_palavra_passe_revoga_o_desafio_em_curso(ambiente):
    cliente, user, _, segredo, _ = ambiente
    desafio = _desafio(cliente)
    user.token_version += 1
    assert _passo2(cliente, desafio, pyotp.TOTP(segredo).now()).status_code == 401


def test_uma_conta_desactivada_nao_completa_o_login(ambiente):
    """As validações de conta correm nos DOIS passos: entre eles passam
    minutos, e o desafio não pode ser uma porta aberta nesse intervalo."""
    cliente, user, _, segredo, _ = ambiente
    desafio = _desafio(cliente)
    user.ativo = False
    assert _passo2(cliente, desafio, pyotp.TOTP(segredo).now()).status_code == 403


# ---------------------------------------------------------------------------
# Não revelar qual dos factores falhou
# ---------------------------------------------------------------------------
def test_palavra_passe_errada_da_um_desafio_indistinguivel(ambiente):
    """REGRESSÃO: sem o isco, chegar ao segundo passo confirmava que a
    palavra-passe estava certa — e as pessoas reutilizam palavras-passe entre
    serviços, por isso essa confirmação vale por si mesmo sem o código."""
    import jwt

    cliente, _, _, _, _ = ambiente
    bom = _passo1(cliente).json()
    mau = _passo1(cliente, password="completamente-errada").json()

    assert mau["requer_2fa"] == bom["requer_2fa"] is True
    p_bom = jwt.decode(bom["desafio"], options={"verify_signature": False})
    p_mau = jwt.decode(mau["desafio"], options={"verify_signature": False})
    assert set(p_bom) == set(p_mau)


def test_o_isco_nunca_valida_nem_com_o_codigo_certo(ambiente):
    cliente, _, _, segredo, _ = ambiente
    isco = _desafio(cliente, password="errada")
    assert _passo2(cliente, isco, pyotp.TOTP(segredo).now()).status_code == 401


def test_o_isco_falha_com_a_mesma_mensagem_de_um_codigo_errado(ambiente):
    cliente, _, _, segredo, _ = ambiente
    msg_isco = _passo2(
        cliente,
        _desafio(cliente, password="errada"),
        pyotp.TOTP(segredo).now(),
    ).json()["detail"]
    msg_codigo = _passo2(cliente, _desafio(cliente), _codigo_errado(segredo)).json()[
        "detail"
    ]
    assert msg_isco == msg_codigo


def test_empresa_errada_tambem_da_isco(ambiente):
    cliente, _, _, segredo, _ = ambiente
    r = _passo1(cliente, empresa="XX999")
    assert r.json().get("requer_2fa") is True
    assert _passo2(cliente, r.json()["desafio"], pyotp.TOTP(segredo).now()).status_code == 401


# ---------------------------------------------------------------------------
# Códigos de recuperação
# ---------------------------------------------------------------------------
def test_entra_com_codigo_de_recuperacao(ambiente):
    cliente, user, db, _, codigos = ambiente
    r = _passo2(cliente, _desafio(cliente), codigos[0])
    assert r.status_code == 200
    assert len(user.totp_codigos_recuperacao) == 7
    assert "2fa.recuperacao_usada" in db.accoes_auditadas()


def test_o_codigo_de_recuperacao_e_de_uso_unico(ambiente):
    cliente, _, _, _, codigos = ambiente
    assert _passo2(cliente, _desafio(cliente), codigos[0]).status_code == 200
    assert _passo2(cliente, _desafio(cliente), codigos[0]).status_code == 401


def test_codigo_de_recuperacao_inventado(ambiente):
    cliente, _, _, _, _ = ambiente
    assert _passo2(cliente, _desafio(cliente), "AAAA-BBBB").status_code == 401


# ---------------------------------------------------------------------------
# Bloqueio por conta (etapa 4)
# ---------------------------------------------------------------------------
def test_tres_falhas_bloqueiam_a_conta(ambiente):
    """O limite por IP não chega: seis dígitos são um milhão de combinações e
    quem tenha muitos IPs percorre-as sem que a conta se defenda."""
    cliente, user, db, segredo, _ = ambiente
    _falhar(cliente, segredo, 3)

    assert user.totp_falhas == 3
    assert user.totp_bloqueado_ate is not None
    assert "2fa.bloqueio" in db.accoes_auditadas()
    # Bloqueada, nem o código certo entra.
    r = _passo2(cliente, _desafio(cliente), pyotp.TOTP(segredo).now())
    assert r.status_code == 401


def test_duas_falhas_ainda_deixam_entrar(ambiente):
    cliente, user, _, segredo, _ = ambiente
    _falhar(cliente, segredo, 2)
    assert user.totp_bloqueado_ate is None
    r = _passo2(cliente, _desafio(cliente), pyotp.TOTP(segredo).now())
    assert r.status_code == 200


def test_a_conta_bloqueada_recusa_com_a_mesma_mensagem(ambiente):
    """REGRESSÃO: uma mensagem própria para o bloqueio desfazia o desafio-isco.
    O bloqueio só acontece no caminho verdadeiro — o isco nem é descodificável
    — por isso bastavam três tentativas para saber que a palavra-passe estava
    certa, que é exactamente o que o isco existe para esconder."""
    cliente, _, _, segredo, _ = ambiente
    _falhar(cliente, segredo, 3)

    msg_bloqueada = _passo2(
        cliente, _desafio(cliente), pyotp.TOTP(segredo).now()
    ).json()["detail"]
    msg_isco = _passo2(
        cliente,
        _desafio(cliente, password="errada"),
        pyotp.TOTP(segredo).now(),
    ).json()["detail"]
    assert msg_bloqueada == msg_isco


def test_o_isco_nao_tranca_a_conta(ambiente):
    """REGRESSÃO: se as tentativas pelo isco contassem, qualquer pessoa que
    soubesse um e-mail trancava a conta desse alguém quando lhe apetecesse."""
    cliente, user, _, segredo, _ = ambiente
    _falhar(cliente, segredo, 6, password="errada")

    assert user.totp_falhas == 0
    assert user.totp_bloqueado_ate is None
    assert _passo2(
        cliente, _desafio(cliente), pyotp.TOTP(segredo).now()
    ).status_code == 200


def test_tentar_durante_o_bloqueio_nao_o_estende(ambiente):
    """Estendê-lo entregava a quem soubesse a palavra-passe a chave para manter
    o dono da conta de fora indefinidamente."""
    cliente, user, _, segredo, _ = ambiente
    _falhar(cliente, segredo, 3)
    ate = user.totp_bloqueado_ate

    _falhar(cliente, segredo, 4)
    assert user.totp_bloqueado_ate == ate
    assert user.totp_falhas == 3


def test_o_bloqueio_cumprido_repoe_o_contador(ambiente):
    """Deixar o contador no máximo fazia a falha seguinte bloquear logo, e o
    castigo não tinha fim."""
    from datetime import timedelta

    from src.db.base import agora

    cliente, user, _, segredo, _ = ambiente
    _falhar(cliente, segredo, 3)

    user.totp_bloqueado_ate = agora() - timedelta(seconds=1)
    assert _passo2(cliente, _desafio(cliente), _codigo_errado(segredo)).status_code == 401
    assert user.totp_falhas == 1  # recomeçou, não ficou nos 3


def test_entrar_repoe_a_contagem(ambiente):
    cliente, user, _, segredo, _ = ambiente
    _falhar(cliente, segredo, 2)
    assert user.totp_falhas == 2

    _passo2(cliente, _desafio(cliente), pyotp.TOTP(segredo).now())
    assert user.totp_falhas == 0
    assert user.totp_bloqueado_ate is None


def test_o_codigo_de_recuperacao_errado_tambem_conta(ambiente):
    cliente, user, _, _, _ = ambiente
    for tentativa in range(1, 4):
        r = _passo2(cliente, _desafio(cliente), "AAAA-BBBB")
        assert r.status_code == 401, (
            f"tentativa {tentativa} de 3: esperava-se a recusa do segundo "
            f"passo e veio HTTP {r.status_code} {r.json()}"
        )
    assert user.totp_bloqueado_ate is not None


# ---------------------------------------------------------------------------
# A empresa no login: código OU nome
# ---------------------------------------------------------------------------
def test_o_login_aceita_o_codigo_e_o_nome(ambiente):
    """Decisão tomada: os dois. A empresa é um factor de IDENTIFICAÇÃO e não um
    segredo — está no papel timbrado e nas facturas. Quem entra todos os dias
    sabe o nome da casa onde trabalha e não decora `BE001`."""
    cliente, _, _, _, _ = ambiente
    assert _passo1(cliente, empresa=CODIGO_EMPRESA).json().get("requer_2fa")
    assert _passo1(cliente, empresa="Teste, Lda.").json().get("requer_2fa")


def test_a_empresa_nao_distingue_maiusculas_nem_espacos(ambiente):
    """Quem escreve à mão não acerta na caixa."""
    cliente, _, _, _, _ = ambiente
    for variante in ["  ts001  ", "TS001", "  teste, lda.  ", "TESTE, LDA."]:
        assert _passo1(cliente, empresa=variante).json().get("requer_2fa"), variante


def test_uma_empresa_que_nao_e_a_da_conta_nao_serve(ambiente):
    cliente, _, _, segredo, _ = ambiente
    r = _passo1(cliente, empresa="Outra Empresa, Lda.")
    # Conta com 2FA: recebe o isco, e o isco nunca valida.
    assert r.json().get("requer_2fa") is True
    assert _passo2(cliente, r.json()["desafio"], pyotp.TOTP(segredo).now()).status_code == 401
