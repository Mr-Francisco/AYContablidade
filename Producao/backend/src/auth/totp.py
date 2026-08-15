"""Segundo factor por TOTP (RFC 6238).

Este módulo não sabe nada de HTTP nem de base de dados: gera segredos,
verifica códigos e cifra-os para repouso. Quem o usa decide quando.

TRÊS DECISÕES QUE VALE A PENA EXPLICAR:

1. O segredo é CIFRADO em repouso. Guardado em claro, quem consiga ler a base
   gera códigos válidos de qualquer conta — o segundo factor deixaria de o ser
   exactamente contra o atacante que mais interessa travar.

2. A chave de cifra vem de uma variável PRÓPRIA e não é derivada da
   `JWT_SECRET_KEY`. Derivá-la pouparia configuração, mas rodar o segredo JWT
   — coisa que se faz — trancaria toda a gente fora do 2FA sem aviso e sem
   forma óbvia de perceber porquê. Sem a variável, activar o 2FA falha com uma
   mensagem que diz o que fazer: falha fechada, não silenciosa.

3. A janela de tolerância é de UM passo (±30 s). Chega para relógios
   desalinhados e mantém o código válido cerca de um minuto. Aumentá-la é
   alargar a janela em que um código interceptado ainda serve.

4. Um código já usado é RECUSADO mas não é tratado como código errado. A
   diferença parece de pormenor e não é: com a janela de ±30 s, um telemóvel
   meio passo adiantado leva o servidor a gravar um contador à frente do
   relógio dele, e a tentativa seguinte cai em cima do contador gravado. Quem
   tratasse isso como erro trancava a conta de quem não fez nada de mal — foi
   o que aconteceu.
"""

import base64
import hashlib
import hmac
import secrets
import time
from typing import NamedTuple

import pyotp
import segno
from cryptography.fernet import Fernet, InvalidToken

from src.core.config import get_settings

#: Passos de tolerância para cada lado. 1 = ±30 segundos.
JANELA = 1

#: Quantos códigos de recuperação se geram na activação.
N_CODIGOS_RECUPERACAO = 8


class ErroTotp(Exception):
    """Configuração de 2FA em falta ou inválida."""


# ---------------------------------------------------------------------------
# Cifra do segredo
# ---------------------------------------------------------------------------
def _cifrador() -> Fernet:
    """Fernet a partir da chave configurada.

    O Fernet junta AES-128-CBC com HMAC-SHA256: o segredo cifrado não pode ser
    alterado sem que a decifra falhe. Não basta cifrar — sem autenticação,
    quem escreva na base podia trocar o segredo de uma conta pelo seu.
    """
    chave = (get_settings().TOTP_CHAVE_CIFRA or "").strip()
    if not chave:
        raise ErroTotp(
            "O segundo factor precisa da variável de ambiente "
            "TOTP_CHAVE_CIFRA. Gere uma com: python -c \"import secrets; "
            "print(secrets.token_urlsafe(32))\" e defina-a no .env."
        )
    # A chave da configuração é texto livre; o Fernet exige 32 bytes em
    # base64url. O SHA-256 dá exactamente 32 bytes a partir de qualquer entrada.
    material = hashlib.sha256(chave.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(material))


def cifrar_segredo(segredo: str) -> str:
    return _cifrador().encrypt(segredo.encode("ascii")).decode("ascii")


def decifrar_segredo(cifrado: str) -> str:
    """Devolve o segredo em claro. Levanta `ErroTotp` se a chave mudou.

    Uma chave de cifra trocada dá aqui um erro claro em vez de um código
    sempre inválido — que seria indistinguível de o utilizador estar a
    enganar-se.
    """
    try:
        return _cifrador().decrypt(cifrado.encode("ascii")).decode("ascii")
    except InvalidToken as e:
        raise ErroTotp(
            "Não foi possível ler o segredo de 2FA desta conta. A chave de "
            "cifra do servidor foi alterada — o 2FA tem de ser reconfigurado."
        ) from e


# ---------------------------------------------------------------------------
# Segredos e códigos
# ---------------------------------------------------------------------------
def gerar_segredo() -> str:
    """Segredo base32 de 160 bits, como recomenda o RFC 4226."""
    return pyotp.random_base32(length=32)


def uri_otpauth(segredo: str, email: str, emissor: str = "SGD") -> str:
    """URI `otpauth://` que a aplicação autenticadora lê do QR."""
    return pyotp.TOTP(segredo).provisioning_uri(name=email, issuer_name=emissor)


def qr_svg(uri: str) -> str:
    """QR do URI, em SVG.

    Desenhado no SERVIDOR e enviado já como imagem: o segredo em claro nunca
    precisa de chegar ao cliente em forma manipulável. A chave também vai em
    texto, para quem não consegue ler o QR — mas isso é uma escolha explícita
    de quem configura, não um efeito lateral.

    Preto sobre branco, FIXO, e não a cor do tema: um leitor de QR precisa de
    contraste alto, e deixar o código herdar as cores da página daria um QR
    ilegível no tema escuro. A margem branca faz parte do padrão — sem ela,
    muitos leitores não encontram os cantos.
    """
    return segno.make(uri, error="m").svg_inline(
        scale=5, dark="#000000", light="#ffffff", border=3
    )


class ResultadoCodigo(NamedTuple):
    """O que aconteceu a um código.

    `repetido` distingue o código ERRADO do código CERTO MAS JÁ USADO. Sem essa
    distinção os dois caminhos eram o mesmo, e isso custou caro: quem entrasse
    logo a seguir a configurar o 2FA — com o código que ainda estava no ecrã do
    telemóvel — era informado de que o código estava incorrecto, e a tentativa
    contava para o bloqueio da conta. Três dessas e a conta ficava trancada
    quinze minutos, sem nada de errado ter acontecido.
    """

    valido: bool
    contador: int | None = None
    repetido: bool = False


def verificar_codigo(
    segredo: str, codigo: str, ultimo_contador: int | None = None
) -> ResultadoCodigo:
    """Verifica um código TOTP.

    Devolve `(valido, contador, repetido)`. O contador é o passo de tempo que
    validou o código e tem de ser GRAVADO: um código continua válido durante
    cerca de um minuto, e sem guardar o contador o mesmo código serve duas
    vezes. Quem intercepte um código usado tem uma janela para o repetir.

    A comparação é feita pelo `pyotp`, que usa `hmac.compare_digest` — o tempo
    de resposta não revela quantos dígitos estavam certos.
    """
    limpo = "".join(c for c in (codigo or "") if c.isdigit())
    if len(limpo) != 6:
        return ResultadoCodigo(False)

    totp = pyotp.TOTP(segredo)
    # `time.time()` e não `datetime.now()`: o TOTP conta segundos desde a época,
    # que é a mesma em qualquer fuso. O caminho pelo `datetime` ingénuo passava
    # pelo fuso do processo e só dava certo por o `mktime` desfazer a conversão.
    agora_contador = int(time.time()) // totp.interval

    for desvio in range(-JANELA, JANELA + 1):
        contador = agora_contador + desvio
        esperado = totp.generate_otp(contador)
        if hmac.compare_digest(esperado, limpo):
            # Certo, mas já gasto. Recusa-se à mesma — é isto que impede a
            # repetição — mas quem chama tem de saber que a diferença existe.
            if ultimo_contador is not None and contador <= ultimo_contador:
                return ResultadoCodigo(False, None, repetido=True)
            return ResultadoCodigo(True, contador)
    return ResultadoCodigo(False)


# ---------------------------------------------------------------------------
# Códigos de recuperação
# ---------------------------------------------------------------------------
def gerar_codigos_recuperacao(quantos: int = N_CODIGOS_RECUPERACAO) -> list[str]:
    """Códigos de uso único, para quando o telemóvel se perde.

    Formato `XXXX-XXXX`: 8 caracteres de um alfabeto de 32 dão 40 bits, o que
    é muito para o número de tentativas que o bloqueio por falhas permite.
    """
    alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    codigos = []
    for _ in range(quantos):
        bruto = "".join(secrets.choice(alfabeto) for _ in range(8))
        codigos.append(f"{bruto[:4]}-{bruto[4:]}")
    return codigos


def hash_codigo(codigo: str) -> str:
    """SHA-256 do código normalizado.

    Como na chave de licença: SHA-256 e não bcrypt, porque o código tem 40 bits
    de entropia vindos de um CSPRNG e o hash precisa de ser comparável em lote
    sem custo. O bcrypt existe para compensar a pouca entropia de palavras-passe
    escolhidas por pessoas.
    """
    limpo = "".join(c for c in (codigo or "") if c.isalnum()).upper()
    return hashlib.sha256(limpo.encode("ascii", "ignore")).hexdigest()


def consumir_codigo(codigo: str, hashes: list[str]):
    """Procura o código na lista de hashes por gastar.

    Devolve `(encontrado, hashes_restantes)`. O código sai da lista — é de uso
    único, e deixá-lo lá tornaria os códigos de recuperação uma palavra-passe
    permanente que ninguém muda.
    """
    alvo = hash_codigo(codigo)
    for h in hashes or []:
        if hmac.compare_digest(h, alvo):
            return True, [x for x in hashes if x != h]
    return False, list(hashes or [])
