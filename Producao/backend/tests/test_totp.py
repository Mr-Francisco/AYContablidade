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


def test_chave_trocada_da_erro_claro(caplog):
    """Uma chave de cifra alterada tem de dar um erro que se perceba, e não um
    código sempre inválido — que seria indistinguível de o utilizador se estar
    a enganar, e mandaria toda a gente para o suporte errado.

    «Que se perceba» é para QUEM ESTÁ A ENTRAR. Essa pessoa não pode fazer nada
    com «a chave de cifra foi alterada» — para ela isto é «não consigo entrar,
    e agora?». Lê o que fazer; a causa fica no registo.
    """
    import logging

    cifrado = totp.cifrar_segredo(totp.gerar_segredo())
    os.environ["TOTP_CHAVE_CIFRA"] = "outra-chave-completamente-diferente"
    get_settings.cache_clear()

    with caplog.at_level(logging.ERROR):
        with pytest.raises(totp.ErroTotp) as e:
            totp.decifrar_segredo(cifrado)

    mensagem = str(e.value)
    assert "cifra" not in mensagem.lower()
    assert "configurá-la de novo" in mensagem
    assert "TOTP_CHAVE_CIFRA" in caplog.text


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
    r = totp.verificar_codigo(s, pyotp.TOTP(s).now())
    assert r.valido and r.contador is not None and not r.repetido


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
    r = totp.verificar_codigo(s, c)
    assert r.valido
    assert totp.verificar_codigo(s, c, ultimo_contador=r.contador).valido is False
    # Um contador anterior não bloqueia: só se recusa o que já foi usado.
    assert totp.verificar_codigo(s, c, ultimo_contador=r.contador - 5).valido is True


def test_codigo_ja_usado_diz_que_foi_usado_e_nao_que_esta_errado():
    """REGRESSÃO: era este o defeito que trancava contas.

    Um código certo mas já gasto vinha indistinguível de um código inventado.
    A pessoa lia «código incorrecto» (não estava) e gastava uma das três
    tentativas até ao bloqueio de quinze minutos. Acontecia sempre a quem
    acabava de configurar o 2FA e entrava logo a seguir com o código que ainda
    estava no ecrã, e a quem tivesse o telemóvel meio passo adiantado.
    """
    s = totp.gerar_segredo()
    c = pyotp.TOTP(s).now()
    r = totp.verificar_codigo(s, c)

    repetido = totp.verificar_codigo(s, c, ultimo_contador=r.contador)
    assert repetido.valido is False, "um código gasto continua a ser recusado"
    assert repetido.repetido is True, "mas quem chama tem de saber porquê"

    # Um código inventado NÃO é «repetido» — a distinção tem de ir nos dois
    # sentidos, senão a excepção passa a ser a regra.
    errado = totp.verificar_codigo(s, "000000", ultimo_contador=r.contador)
    assert errado.valido is False and errado.repetido is False


def test_o_contador_nao_depende_do_fuso_do_servidor():
    """O TOTP conta segundos desde a época, iguais em qualquer fuso.

    Chegou a calcular-se o passo a partir de um `datetime.now()` ingénuo, que
    só dava certo porque a conversão de volta desfazia o desvio. Num processo
    com `TZ` diferente do relógio isso partia-se, e partia-se para todos ao
    mesmo tempo — o género de avaria que ninguém liga ao fuso horário.
    """
    import time as _time

    s = totp.gerar_segredo()
    esperado = int(_time.time()) // 30
    r = totp.verificar_codigo(s, pyotp.TOTP(s).generate_otp(esperado))
    assert r.valido and r.contador == esperado


def test_a_janela_e_de_um_passo():
    """±30 s. Alargá-la é alargar a janela em que um código interceptado ainda
    serve, e o ganho em relógios desalinhados não compensa."""
    assert totp.JANELA == 1
    s = totp.gerar_segredo()
    t = pyotp.TOTP(s)
    agora = t.timecode(__import__("datetime").datetime.now())
    assert totp.verificar_codigo(s, t.generate_otp(agora - 1)).valido is True
    assert totp.verificar_codigo(s, t.generate_otp(agora + 1)).valido is True
    assert totp.verificar_codigo(s, t.generate_otp(agora - 2)).valido is False
    assert totp.verificar_codigo(s, t.generate_otp(agora + 2)).valido is False


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


def test_o_qr_em_png_le_se_com_a_marca_por_cima():
    """A prova que interessa: a marca SGD ao centro tapa módulos, e o código
    tem de continuar a ler-se.

    Passa-se o PNG por um leitor a sério (zbar) e exige-se o URI de volta,
    igual ao que entrou. Um QR bonito que não lê é pior do que um QR sem marca
    nenhuma — e isso não se vê a olho.
    """
    pyzbar = pytest.importorskip(
        "pyzbar.pyzbar", reason="sem leitor de QR instalado nesta máquina"
    )
    from io import BytesIO

    from PIL import Image

    uri = totp.uri_otpauth(totp.gerar_segredo(), "ana@demo.ao")
    imagem = Image.open(BytesIO(totp.qr_png(uri)))

    lidos = pyzbar.decode(imagem)
    assert lidos, "o QR com a marca ao centro deixou de se ler"
    assert lidos[0].data.decode() == uri, "leu, mas devolveu outra coisa"


def test_o_png_usa_a_correccao_de_erros_alta():
    """É o nível H (30%) que sustenta a marca ao centro. Com «M» (15%) a marca
    come módulos a mais e o código deixa de ler — o teste de cima apanha-o, mas
    este diz porquê."""
    import inspect

    fonte = inspect.getsource(totp.qr_png)
    assert 'error="h"' in fonte
    # E a marca não pode crescer à vontade: 22% de largura são menos de 5% da
    # área, bem dentro do que os 30% de redundância aguentam.
    assert totp.FRACCAO_MARCA <= 0.25


def test_o_png_e_mesmo_um_png():
    """Assinatura do formato, em hexadecimal para não depender de escapes."""
    dados = totp.qr_png(totp.uri_otpauth(totp.gerar_segredo(), "a@b.ao"))
    assert dados[:8] == bytes.fromhex("89504e470d0a1a0a")


def test_o_qr_em_png_tambem_nao_traz_o_segredo_em_texto():
    s = totp.gerar_segredo()
    dados = totp.qr_png(totp.uri_otpauth(s, "ana@demo.ao"))
    assert s.encode() not in dados


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
