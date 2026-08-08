"""Esquemas de autenticação."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from src.core.constants import Perfil


class LoginPedido(BaseModel):
    """Entrada no sistema: e-mail, palavra-passe e empresa.

    A `empresa` aceita o CÓDIGO («BE001») ou o NOME. É um terceiro factor de
    IDENTIFICAÇÃO, não um segredo: serve para saber a que empresa a conta
    pertence, e para que conhecer só o e-mail e a palavra-passe não baste.

    Fica opcional por uma razão: o superadministrador da plataforma não
    pertence a nenhuma empresa e não teria o que indicar. Para todos os
    restantes é obrigatória, e a verificação é feita no serviço — deixá-la aqui
    obrigaria a um esquema por tipo de conta.
    """

    email: EmailStr
    password: str = Field(min_length=1, max_length=200)
    empresa: str | None = Field(default=None, max_length=200)


class RegistoPedido(BaseModel):
    """Registo de um novo utilizador numa empresa existente.

    O Piloto tem auto-registo com aprovação posterior por um administrador; em
    multiempresa é preciso saber *em que* empresa. O fluxo mantém-se: a conta
    nasce por aprovar e o administrador da empresa valida-a.

    Identifica-se a empresa pelo CÓDIGO ou pelo NIF — o mesmo que se escreve no
    login. Aceitar só o NIF obrigava quem se regista a conhecer duas coisas
    diferentes para dois ecrãs seguidos.
    """

    nome: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    empresa: str = Field(min_length=1, max_length=200)
    perfil: Perfil = Perfil.CONSULTA
    telefone: str | None = Field(default=None, max_length=40)


class AlterarPasswordPedido(BaseModel):
    password_atual: str = Field(min_length=1, max_length=200)
    password_nova: str = Field(min_length=8, max_length=200)


class UtilizadorPublico(BaseModel):
    """Utilizador tal como é devolvido à interface. Sem hash de palavra-passe."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    empresa_id: UUID | None
    nome: str
    email: EmailStr
    perfil: Perfil
    ativo: bool
    aprovado: bool
    telefone: str | None
    modulos_permitidos: list[str] | None
    permissoes_extra: list[str]
    permissoes_accao: dict[str, list[str]]
    ultimo_login: datetime | None
    # Se a conta tem segundo factor. Não é segredo — a interface precisa de
    # saber o estado para o mostrar. O segredo em si nunca sai daqui.
    totp_ativo: bool = False
    # A palavra-passe actual foi definida por outra pessoa. A interface usa
    # isto para avisar no primeiro acesso — não tranca nada.
    password_provisoria: bool = False


class TokenResposta(BaseModel):
    access_token: str
    token_type: str = "bearer"
    # Fim absoluto da sessão: a interface sabe quando o refresh deixa de servir.
    expira_absoluto: datetime
    utilizador: UtilizadorPublico


class DesafioResposta(BaseModel):
    """Primeiro passo concluído: falta o código do segundo factor.

    Não traz `access_token` — não há sessão nenhuma ainda. O `desafio` só é
    aceite pelo `/auth/login/2fa` e mais nada.
    """

    requer_2fa: bool = True
    desafio: str
    expira_em: datetime


class Login2FaPedido(BaseModel):
    desafio: str
    #: Seis dígitos da aplicação autenticadora ou um código de recuperação
    #: `XXXX-XXXX`. O mesmo campo aceita os dois: quem perdeu o telemóvel não
    #: tem de descobrir onde escrever o código de papel.
    codigo: str = Field(min_length=6, max_length=32)


# ---------------------------------------------------------------------------
# Segundo factor (TOTP)
# ---------------------------------------------------------------------------
class TotpEstado(BaseModel):
    """Estado do 2FA da própria conta."""

    ativo: bool
    ativado_em: datetime | None = None
    codigos_por_usar: int = 0
    #: Verdadeiro quando o perfil obriga a ter 2FA. A interface usa isto para
    #: não oferecer um botão de desactivar que o servidor vai recusar.
    obrigatorio: bool = False


class TotpInicioResposta(BaseModel):
    """Material de configuração. Só se mostra UMA vez, antes de confirmar."""

    qr_svg: str
    #: O segredo em texto, para quem não consegue ler o QR (introdução manual).
    #: Depois de o 2FA estar confirmado, nenhuma rota volta a devolvê-lo.
    segredo: str
    uri: str


class TotpConfirmarPedido(BaseModel):
    codigo: str = Field(min_length=6, max_length=16)


class TotpConfirmarResposta(BaseModel):
    """Os códigos de recuperação, mostrados uma única vez.

    Ficam guardados em hash: nem o servidor os consegue mostrar outra vez. Se o
    utilizador não os guardar agora, tem de gerar códigos novos.
    """

    codigos_recuperacao: list[str]


class TotpDesactivarPedido(BaseModel):
    """Desactivar exige a palavra-passe.

    Um ecrã deixado aberto não pode servir para retirar o segundo factor — é
    exactamente o cenário contra o qual o 2FA existe.
    """

    password: str = Field(min_length=1)
