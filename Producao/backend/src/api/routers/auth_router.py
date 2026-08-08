"""Rotas de autenticação.

Transposto de `login()`, `registar()` e `requireAuth()` de
`Piloto/assets/js/app.js`, com as mensagens de erro preservadas.

Nota: NÃO usar `from __future__ import annotations` neste ficheiro — o
`@limiter.limit` do slowapi rebenta com anotações adiadas (docs/LESSONS.md).
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, select

from src.api.limites import LIMITE_LOGIN, limiter
from src.api.deps import DB, UtilizadorAtual, licenca_da_empresa
from src.auth.permissions import licenca_valida
from src.auth.totp import (
    ErroTotp,
    consumir_codigo,
    decifrar_segredo,
    verificar_codigo,
)
from src.auth.security import (
    TokenInvalido,
    criar_access_token,
    criar_desafio_isco,
    criar_token_desafio,
    descodificar_desafio,
    descodificar_token,
    hash_password,
    validar_forca_password,
    verificar_password,
)
from src.core.config import get_settings
from src.core.constants import PERFIS_REGISTO, EstadoEmpresa, Perfil
from src.db.base import agora
from src.db.models.tenancy import Empresa
from src.db.models.user import User
from src.services.auditoria import auditar
from src.db.schemas.auth import (
    AlterarPasswordPedido,
    DesafioResposta,
    Login2FaPedido,
    LoginPedido,
    RegistoPedido,
    TokenResposta,
    UtilizadorPublico,
)

router = APIRouter(prefix="/api/auth", tags=["autenticação"])
settings = get_settings()


def _token_para(user: User, expira_absoluto: datetime | None = None) -> TokenResposta:
    token, absoluto = criar_access_token(
        user_id=user.id,
        empresa_id=user.empresa_id,
        perfil=str(user.perfil),
        token_version=user.token_version,
        expira_absoluto=expira_absoluto,
    )
    return TokenResposta(
        access_token=token,
        expira_absoluto=absoluto,
        utilizador=UtilizadorPublico.model_validate(user),
    )



#: Hash de referência para comparar quando o e-mail não existe. Sem isto, um
#: e-mail inexistente respondia sem correr bcrypt e o tempo de resposta dizia,
#: por si só, quais as contas que existem.
_HASH_INEXISTENTE = hash_password("nao-existe-nenhuma-conta-com-esta-palavra-passe")


def _empresa_corresponde(db: DB, empresa_id, indicado: str) -> bool:
    """Confirma que o texto indicado no login identifica a empresa da conta.

    Aceita o código («BE001») ou o nome, ambos sem distinguir maiúsculas nem
    espaços à volta — quem escreve à mão não acerta na caixa.
    """
    empresa = db.get(Empresa, empresa_id)
    if empresa is None:
        return False
    alvo = (indicado or "").strip().casefold()
    return alvo in {
        (empresa.codigo or "").casefold(),
        (empresa.nome or "").casefold(),
    }

def _verificar_conta_e_empresa(db: DB, user: User) -> None:
    """Validações que nada têm a ver com credenciais.

    Corre nos DOIS passos do login: entre o primeiro e o segundo passam minutos,
    e uma conta pode ser desactivada ou uma licença expirar nesse intervalo. Se
    só corresse no primeiro, o desafio seria uma porta aberta durante esse tempo.
    """
    if not user.aprovado:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Conta pendente de aprovação. Aguarde a validação de um Administrador.",
        )
    if not user.ativo:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Conta desativada. Contacte o administrador."
        )

    # O superadmin da plataforma não tem empresa nem licença que validar.
    if user.empresa_id is not None:
        empresa = db.get(Empresa, user.empresa_id)
        if empresa is None or empresa.estado != EstadoEmpresa.ACTIVA:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "A empresa não está activa. Contacte o suporte.",
            )
        if not licenca_valida(licenca_da_empresa(db, empresa.id)):
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                "A licença da empresa não está activa ou expirou.",
            )


def _concluir_login(db: DB, user: User) -> TokenResposta:
    user.ultimo_login = agora()
    db.commit()
    db.refresh(user)
    return _token_para(user)


@router.post("/login", response_model=TokenResposta | DesafioResposta)
@limiter.limit(LIMITE_LOGIN)
def login(request: Request, dados: LoginPedido, db: DB):
    """Primeiro passo: e-mail, palavra-passe e empresa.

    Devolve uma sessão a quem não tem segundo factor, e um DESAFIO a quem tem —
    o desafio não é sessão nenhuma e só o `/auth/login/2fa` o aceita.

    A mensagem é deliberadamente igual para e-mail inexistente, palavra-passe
    errada e empresa errada. Distingui-las diria a quem tenta qual das três
    acertou — e a empresa é a mais fácil de adivinhar das três.

    O limite de pedidos é o apertado (`RATE_LIMIT_LOGIN`), e não o geral: 120
    tentativas por minuto contra um formulário de entrada não é protecção.
    """
    user = db.scalar(select(User).where(func.lower(User.email) == dados.email.lower()))

    # A palavra-passe é verificada SEMPRE, mesmo sem utilizador, para que o
    # tempo de resposta não denuncie se o e-mail existe.
    hash_alvo = user.password_hash if user else _HASH_INEXISTENTE
    password_ok = verificar_password(dados.password, hash_alvo)

    empresa_ok = user is not None and (
        user.empresa_id is None
        or _empresa_corresponde(db, user.empresa_id, dados.empresa or "")
    )

    if user is None or not password_ok or not empresa_ok:
        # Conta com 2FA: em vez de dizer que as credenciais estão erradas,
        # segue para o segundo passo com um desafio que nunca valida. Sem isto
        # o formulário confirmaria palavras-passe a quem as anda a testar — e
        # como as pessoas as reutilizam entre serviços, essa confirmação vale
        # por si mesmo sem o código. Ver `criar_desafio_isco`.
        if user is not None and user.totp_ativo:
            isco, expira = criar_desafio_isco(user_id=user.id)
            return DesafioResposta(desafio=isco, expira_em=expira)
        # A ajuda sobre a empresa só aparece a quem JÁ acertou a palavra-passe.
        # Dá-la antes disso diria que o e-mail existe a quem só está a tentar
        # e-mails — e a mensagem seria, por si só, um confirmador de contas.
        if (
            user is not None
            and password_ok
            and user.empresa_id is not None
            and not (dados.empresa or "").strip()
        ):
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Indique o código ou o nome da empresa.",
            )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Credenciais inválidas.")

    _verificar_conta_e_empresa(db, user)

    if user.totp_ativo:
        desafio, expira = criar_token_desafio(
            user_id=user.id, token_version=user.token_version
        )
        return DesafioResposta(desafio=desafio, expira_em=expira)

    return _concluir_login(db, user)


@router.post("/login/2fa", response_model=TokenResposta)
@limiter.limit(LIMITE_LOGIN)
def login_2fa(request: Request, dados: Login2FaPedido, db: DB) -> TokenResposta:
    """Segundo passo: o código da aplicação autenticadora.

    Aceita também um código de recuperação, que é consumido. As recusas dizem
    todas o mesmo — código errado, desafio expirado, desafio-isco e sessão
    revogada são indistinguíveis de fora. É o que impede este passo de servir
    para descobrir se a palavra-passe do primeiro estava certa.
    """
    recusa = HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "Não foi possível iniciar sessão. Verifique os dados e o código, e "
        "tente novamente.",
    )

    try:
        payload = descodificar_desafio(dados.desafio)
        user_id = UUID(str(payload.get("sub")))
    except (TokenInvalido, TypeError, ValueError) as e:
        raise recusa from e

    user = db.get(User, user_id)
    if user is None or not user.totp_ativo or not user.totp_segredo:
        raise recusa
    # Uma mudança de palavra-passe ou de perfil entre os dois passos revoga o
    # desafio, tal como revoga qualquer sessão aberta.
    if int(payload.get("tv", -1)) != user.token_version:
        raise recusa

    _verificar_conta_e_empresa(db, user)

    codigo = (dados.codigo or "").strip()
    # Seis dígitos é a aplicação; qualquer outra coisa tenta-se como código de
    # recuperação. Testar o TOTP com um código de papel só gastaria tempo.
    if len([c for c in codigo if c.isdigit()]) == 6 and not any(
        c.isalpha() for c in codigo
    ):
        try:
            segredo = decifrar_segredo(user.totp_segredo)
        except ErroTotp as e:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e
        valido, contador = verificar_codigo(
            segredo, codigo, ultimo_contador=user.totp_ultimo_contador
        )
        if not valido:
            raise recusa
        # Grava o passo de tempo usado: o mesmo código vale cerca de um minuto,
        # e sem isto quem o intercepte tem uma janela para o repetir.
        user.totp_ultimo_contador = contador
    else:
        achou, restantes = consumir_codigo(codigo, user.totp_codigos_recuperacao or [])
        if not achou:
            raise recusa
        user.totp_codigos_recuperacao = restantes
        auditar(
            db,
            actor=user,
            accao="2fa.recuperacao_usada",
            alvo_tipo="utilizador",
            alvo_id=user.id,
            alvo_desc=user.nome,
            empresa_id=user.empresa_id,
            detalhes={"codigos_restantes": len(restantes)},
            request=request,
        )

    return _concluir_login(db, user)


@router.post("/refresh", response_model=TokenResposta)
def refresh(request: Request, user: UtilizadorAtual, db: DB) -> TokenResposta:
    """Renova o token sem prolongar a sessão.

    A expiração absoluta do token actual é reaproveitada, por isso renovar
    indefinidamente não mantém a sessão viva para além do limite fixado no login.
    """
    from src.api.deps import obter_token  # local: evita import circular

    token = obter_token(
        authorization=request.headers.get("authorization"),
        aycontab_access_token=request.cookies.get("aycontab_access_token"),
    )
    payload = descodificar_token(token)

    absoluto = payload.get("sa")
    expira_absoluto = (
        datetime.fromtimestamp(int(absoluto), tz=UTC) if absoluto else None
    )
    if expira_absoluto is not None and expira_absoluto <= agora():
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "A sessão atingiu o limite máximo. Volte a iniciar sessão.",
        )
    return _token_para(user, expira_absoluto=expira_absoluto)



def _empresa_por_identificador(db: DB, indicado: str):
    """Empresa a partir do código ou do NIF, sem distinguir maiúsculas."""
    alvo = (indicado or "").strip()
    if not alvo:
        return None
    return db.scalar(
        select(Empresa).where(
            (func.upper(Empresa.codigo) == alvo.upper()) | (Empresa.nif == alvo)
        )
    )

@router.post("/registar", response_model=UtilizadorPublico, status_code=status.HTTP_201_CREATED)
@limiter.limit(LIMITE_LOGIN)
def registar(request: Request, dados: RegistoPedido, db: DB) -> UtilizadorPublico:
    """Auto-registo numa empresa existente.

    Leva o limite apertado por duas razões: cria contas sem sessão, e a
    resposta confirma se um código de empresa existe. O código não é um
    segredo — é um factor de identificação —, mas sem travão seria trivial
    enumerar todas as empresas da plataforma a partir de fora.

    Preserva o fluxo do Piloto — a conta nasce por aprovar e um administrador
    valida-a — acrescentando só o que a multiempresa exige: saber a que empresa
    o registo se destina, indicada pelo NIF.
    """
    validar_forca_password(dados.password)

    if dados.perfil not in PERFIS_REGISTO:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Perfil não disponível para registo.",
        )

    empresa = _empresa_por_identificador(db, dados.empresa)
    # Mensagem neutra: não confirma que empresas estão registadas na plataforma.
    if empresa is None or empresa.estado != EstadoEmpresa.ACTIVA:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Não foi encontrada nenhuma empresa activa com esse código ou NIF.",
        )

    ja_existe = db.scalar(
        select(User.id).where(func.lower(User.email) == dados.email.lower())
    )
    if ja_existe is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Já existe uma conta com este e-mail."
        )

    user = User(
        empresa_id=empresa.id,
        nome=dados.nome.strip(),
        email=dados.email.lower(),
        password_hash=hash_password(dados.password),
        perfil=dados.perfil,
        telefone=(dados.telefone or "").strip() or None,
        ativo=True,
        aprovado=False,  # como no Piloto: espera aprovação
        permissoes_extra=[],
        permissoes_accao={},
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UtilizadorPublico.model_validate(user)


@router.get("/me", response_model=UtilizadorPublico)
def me(user: UtilizadorAtual) -> UtilizadorPublico:
    """Utilizador da sessão actual."""
    return UtilizadorPublico.model_validate(user)


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
def alterar_password(
    request: Request, dados: AlterarPasswordPedido, user: UtilizadorAtual, db: DB
) -> None:
    """Altera a própria palavra-passe.

    Incrementa a `token_version`, o que revoga imediatamente todas as sessões
    abertas — incluindo a que fez o pedido. A interface tem de pedir novo login.
    """
    if not verificar_password(dados.password_atual, user.password_hash):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "A palavra-passe actual não está correcta."
        )
    validar_forca_password(dados.password_nova)

    user.password_hash = hash_password(dados.password_nova)
    user.token_version += 1
    db.commit()
