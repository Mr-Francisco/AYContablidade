"""Primitivas do segundo factor: segredos, cifra, códigos e recuperação.

Não tocam na base nem no HTTP. O que se fixa aqui são as propriedades de que a
segurança do 2FA depende, e que são fáceis de partir sem dar por isso: o
segredo não aparecer em claro em lado nenhum, um código não servir duas vezes,
e um código de recuperação sair da lista depois de usado.
"""

import os

import pyotp
import pytest

from src.auth import totp
from src.core.config import get_settings

CHAVE = "chave-de-teste-do-2fa-nao-usar-em-producao"


@pytest.fixture(autouse=True)
def _com_chave():
    """Configura a chave de cifra e repõe o que estava no fim."""
    antes = os.environ.get("TOTP_CHAVE_CIFRA")
    os.environ["TOTP_CHAVE_CIFRA"] = CHAVE
    get_settings.cache_clear()
    yield
    if antes is None:
        os.environ.pop("TOTP_CHAVE_CIFRA", None)
    else:
        os.environ["TOTP_CHAVE_CIFRA"] = antes
    get_settings.cache_clear()


# ---------------------------------------------------------------------------
# Segredos
# ---------------------------------------------------------------------------
def test_segredo_e_base32_e_nao_se_repete():
    segredos = {totp.gerar_segredo() for _ in range(200)}
    assert len(segredos) == 200
    for s in list(segredos)[:5]:
        # Base32 sem padding: só letras maiúsculas e 2-7.
        assert all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567" for c in s)


# ---------------------------------------------------------------------------
# Cifra
# ---------------------------------------------------------------------------
def test_o_segredo_nao_aparece_no_cifrado():
    """É o ponto todo: uma leitura da base não pode entregar segredos."""
    s = totp.gerar_segredo()
    cifrado = totp.cifrar_segredo(s)
    assert s not in cifrado
    assert totp.decifrar_segredo(cifrado) == s


def test_cifrar_duas_vezes_da_resultados_diferentes():
    """O Fernet leva nonce. Sem isso, dois utilizadores com o mesmo segredo —
    ou o mesmo utilizador ao reconfigurar — teriam cifrados iguais, e isso
    revelaria a repetição a quem lesse a base."""
    s = totp.gerar_segredo()
    assert totp.cifrar_segredo(s) != totp.cifrar_segredo(s)


def test_chave_trocada_da_erro_claro():
    """Uma chave de cifra alterada tem de dar um erro que se perceba, e não um
    código sempre inválido — que seria indistinguível de o utilizador se estar
    a enganar, e mandaria toda a gente para o suporte errado."""
    cifrado = totp.cifrar_segredo(totp.gerar_segredo())
    os.environ["TOTP_CHAVE_CIFRA"] = "outra-chave-completamente-diferente"
    get_settings.cache_clear()
    with pytest.raises(totp.ErroTotp, match="chave de cifra"):
        totp.decifrar_segredo(cifrado)


def test_sem_chave_falha_fechado():
    """Sem configuração, o 2FA recusa em vez de guardar o segredo em claro."""
    os.environ["TOTP_CHAVE_CIFRA"] = ""
    get_settings.cache_clear()
    with pytest.raises(totp.ErroTotp, match="TOTP_CHAVE_CIFRA"):
        totp.cifrar_segredo("QUALQUERCOISA")


# ---------------------------------------------------------------------------
# Verificação de códigos
# ---------------------------------------------------------------------------
def test_codigo_valido_e_aceite():
    s = totp.gerar_segredo()
    ok, contador = totp.verificar_codigo(s, pyotp.TOTP(s).now())
    assert ok and contador is not None


def test_codigo_de_outro_segredo_e_recusado():
    a, b = totp.gerar_segredo(), totp.gerar_segredo()
    assert not totp.verificar_codigo(b, pyotp.TOTP(a).now())[0]


@pytest.mark.parametrize("entrada", ["", None, "12345", "1234567", "abcdef", "  "])
def test_codigos_malformados_sao_recusados(entrada):
    """Sem rebentar: um campo vazio é um engano do utilizador, não um erro do
    servidor."""
    assert totp.verificar_codigo(totp.gerar_segredo(), entrada)[0] is False


def test_espacos_e_separadores_sao_tolerados():
    """As aplicações autenticadoras mostram «025 784» e é assim que se copia."""
    s = totp.gerar_segredo()
    c = pyotp.TOTP(s).now()
    assert totp.verificar_codigo(s, f"{c[:3]} {c[3:]}")[0]
    assert totp.verificar_codigo(s, f"{c[:3]}-{c[3:]}")[0]


def test_o_mesmo_codigo_nao_serve_duas_vezes():
    """REGRESSÃO estrutural: um código TOTP vale cerca de um minuto. Sem
    guardar o contador, quem intercepte um código usado tem uma janela para o
    repetir — e o segundo factor deixa de valer contra quem está a ver o ecrã.
    """
    s = totp.gerar_segredo()
    c = pyotp.TOTP(s).now()
    ok, contador = totp.verificar_codigo(s, c)
    assert ok
    assert totp.verificar_codigo(s, c, ultimo_contador=contador)[0] is False
    # Um contador anterior não bloqueia: só se recusa o que já foi usado.
    assert totp.verificar_codigo(s, c, ultimo_contador=contador - 5)[0] is True


def test_a_janela_e_de_um_passo():
    """±30 s. Alargá-la é alargar a janela em que um código interceptado ainda
    serve, e o ganho em relógios desalinhados não compensa."""
    assert totp.JANELA == 1
    s = totp.gerar_segredo()
    t = pyotp.TOTP(s)
    agora = t.timecode(__import__("datetime").datetime.now())
    assert totp.verificar_codigo(s, t.generate_otp(agora - 1))[0] is True
    assert totp.verificar_codigo(s, t.generate_otp(agora + 1))[0] is True
    assert totp.verificar_codigo(s, t.generate_otp(agora - 2))[0] is False
    assert totp.verificar_codigo(s, t.generate_otp(agora + 2))[0] is False


# ---------------------------------------------------------------------------
# QR
# ---------------------------------------------------------------------------
def test_uri_otpauth_tem_o_que_a_aplicacao_precisa():
    s = totp.gerar_segredo()
    uri = totp.uri_otpauth(s, "ana@demo.ao")
    assert uri.startswith("otpauth://totp/")
    assert "issuer=SGD" in uri
    assert s in uri  # o URI É o segredo — por isso o QR só se mostra uma vez


def test_o_qr_nao_traz_o_segredo_em_texto():
    """O segredo está codificado nos módulos do QR, não legível no SVG."""
    s = totp.gerar_segredo()
    svg = totp.qr_svg(totp.uri_otpauth(s, "ana@demo.ao"))
    assert svg.lstrip().startswith("<svg")
    assert s not in svg


def test_o_qr_tem_contraste_fixo():
    """Preto sobre branco. Herdar as cores do tema daria um QR ilegível no
    tema escuro, e um leitor de QR precisa de contraste alto."""
    svg = totp.qr_svg(totp.uri_otpauth(totp.gerar_segredo(), "a@b.ao"))
    assert "#fff" in svg or "#ffffff" in svg


# ---------------------------------------------------------------------------
# Códigos de recuperação
# ---------------------------------------------------------------------------
def test_codigos_de_recuperacao_sao_unicos_e_formatados():
    cods = totp.gerar_codigos_recuperacao()
    assert len(cods) == totp.N_CODIGOS_RECUPERACAO == 8
    assert len(set(cods)) == len(cods)
    for c in cods:
        assert len(c) == 9 and c[4] == "-"


def test_o_codigo_nao_aparece_no_seu_hash():
    c = totp.gerar_codigos_recuperacao(1)[0]
    h = totp.hash_codigo(c)
    assert c not in h and c.replace("-", "") not in h
    assert len(h) == 64


def test_o_codigo_de_recuperacao_e_de_uso_unico():
    """Deixá-lo na lista tornaria os códigos de recuperação uma palavra-passe
    permanente que ninguém muda."""
    cods = totp.gerar_codigos_recuperacao()
    hashes = [totp.hash_codigo(c) for c in cods]

    achou, resto = totp.consumir_codigo(cods[0], hashes)
    assert achou and len(resto) == len(hashes) - 1

    de_novo, _ = totp.consumir_codigo(cods[0], resto)
    assert de_novo is False


def test_recuperacao_tolera_formatacao():
    """Quem guardou os códigos num papel escreve-os como lhe sai."""
    cods = totp.gerar_codigos_recuperacao()
    hashes = [totp.hash_codigo(c) for c in cods]
    sem_hifen = cods[0].replace("-", "").lower()
    assert totp.consumir_codigo(sem_hifen, hashes)[0] is True


def test_codigo_inventado_nao_passa():
    hashes = [totp.hash_codigo(c) for c in totp.gerar_codigos_recuperacao()]
    assert totp.consumir_codigo("AAAA-BBBB", hashes)[0] is False
    assert totp.consumir_codigo("", hashes)[0] is False
