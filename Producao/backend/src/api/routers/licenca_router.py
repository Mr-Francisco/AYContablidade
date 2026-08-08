"""Licenciamento: geração pelo superadministrador e activação pela empresa.

O processo tem dois lados e só um deles é público:

  1. O superadministrador GERA uma licença para uma empresa que ainda não
     existe, indicando NIF, nome, duração e limites. A chave é mostrada uma
     única vez — a base guarda só o seu SHA-256.
  2. Quem recebe a chave tem 7 dias para a ACTIVAR. A activação cria a empresa,
     o administrador inicial e faz o seed do plano de contas, tudo numa
     transacção. A licença serve uma vez só.

A rota de activação é pública por definição: quem a usa ainda não tem conta.
É a única excepção à Regra 5, e leva por isso o limite de pedidos apertado —
uma chave é adivinhável por força bruta se se puderem tentar milhares por
minuto.

Nota: NÃO usar `from __future__ import annotations` aqui — slowapi
(docs/LESSONS.md).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select

from src.api.deps import DB, UtilizadorAtual, exigir_superadmin
from src.core.config import get_settings
from src.api.limites import LIMITE_LOGIN, limiter
from src.auth.security import hash_password, validar_forca_password, verificar_password
from src.core.constants import EstadoEmpresa, EstadoLicenca, Perfil
from src.db.models.tenancy import Empresa, Licenca
from src.db.models.user import User
from src.db.schemas.licenca import (
    ActivacaoPedido,
    ActivacaoResposta,
    EmpresaEstadoPedido,
    EmpresaPublica,
    LicencaAtualizar,
    LicencaCriar,
    LicencaGerada,
    LicencaPublica,
    MudarPerfilPedido,
    PasswordTemporaria,
    SuperadminAtualizar,
    SuperadminCriado,
    SuperadminCriar,
    SuperadminPublico,
    UtilizadorDaEmpresa,
)
from src.services import licenciamento as lic_svc
from src.services.auditoria import auditar
from src.services.auditoria import listar as listar_auditoria
from src.services.licenciamento import ErroLicenca
from src.services.seed import seed_empresa

# Rota pública — quem activa ainda não tem conta.
router_publico = APIRouter(prefix="/api/licencas", tags=["licenciamento"])

# Administração da plataforma.
router = APIRouter(
    prefix="/api/licencas",
    tags=["licenciamento"],
    dependencies=[Depends(exigir_superadmin)],
)



def _legivel(valor):
    """Converte para algo que caiba em JSONB (datas, Decimals, enums)."""
    if valor is None or isinstance(valor, (str, int, float, bool, list, dict)):
        return valor
    return str(valor)


# ---------------------------------------------------------------------------
# Público — activação
# ---------------------------------------------------------------------------
@router_publico.post("/activar", response_model=ActivacaoResposta)
@limiter.limit(LIMITE_LOGIN)
def activar(request: Request, dados: ActivacaoPedido, db: DB) -> ActivacaoResposta:
    """Activa uma licença, criando a empresa e o seu administrador.

    Rota pública e, por isso, limitada a poucos pedidos por minuto e por IP:
    sem esse travão, uma chave de 60 bits continuaria fora de alcance mas o
    endpoint ficaria aberto a ser martelado.
    """
    validar_forca_password(dados.admin_password)
    try:
        r = lic_svc.activar(
            db,
            chave=dados.chave,
            nif=dados.nif,
            nome_empresa=dados.nome_empresa or "",
            admin_nome=dados.admin_nome,
            admin_email=dados.admin_email,
            admin_password_hash=hash_password(dados.admin_password),
            telefone=dados.telefone,
        )
    except ErroLicenca as e:
        # A licença pode ter sido marcada como expirada dentro do serviço —
        # esse efeito tem de ficar gravado mesmo com o pedido a falhar.
        db.commit()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e

    empresa = db.get(Empresa, r["empresa_id"])
    # O seed corre na MESMA transacção que a criação: uma empresa sem plano de
    # contas não serviria para nada, e ficar a meio seria pior do que falhar.
    seed_empresa(db, empresa)
    # Sem actor: quem activa ainda não tem conta no momento em que o faz. É o
    # único registo de auditoria sem autor, e tem de ser legível como tal.
    auditar(
        db, actor=None, accao="licenca.activar", request=request,
        alvo_tipo="empresa", alvo_id=empresa.id,
        alvo_desc=f"{empresa.nome} ({empresa.codigo})",
        empresa_id=empresa.id,
        detalhes={"nif": empresa.nif, "plano": r["plano"],
                  "admin_email": dados.admin_email},
    )
    db.commit()

    return ActivacaoResposta(
        empresa_id=r["empresa_id"],
        empresa_nome=r["empresa_nome"],
        codigo_empresa=r["codigo_empresa"],
        plano=r["plano"],
        validade=r["validade"],
    )


# ---------------------------------------------------------------------------
# Superadministrador
# ---------------------------------------------------------------------------
@router.post("", response_model=LicencaGerada, status_code=status.HTTP_201_CREATED)
def gerar(
    request: Request, dados: LicencaCriar, user: UtilizadorAtual, db: DB
) -> LicencaGerada:
    """Gera uma licença. A chave devolvida NÃO volta a ser recuperável."""
    try:
        lic, chave = lic_svc.gerar_licenca(
            db,
            nif=dados.nif,
            nome_empresa=dados.nome_empresa,
            titular=dados.titular or dados.nome_empresa,
            plano=dados.plano,
            duracao_meses=dados.duracao_meses,
            modulos_incluidos=dados.modulos_incluidos,
            limite_utilizadores=dados.limite_utilizadores,
            limite_tokens_mes=dados.limite_tokens_mes,
            limite_custo_mes=dados.limite_custo_mes,
            notas=dados.notas,
            criada_por_id=user.id,
        )
    except ErroLicenca as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e

    auditar(
        db, actor=user, accao="licenca.gerar", request=request,
        alvo_tipo="licenca", alvo_id=lic.id,
        alvo_desc=f"{lic.chave_prefixo}… para {lic.nome_previsto}",
        detalhes={"nif": lic.nif_previsto, "plano": lic.plano,
                  "duracao_meses": lic.duracao_meses,
                  "limite_utilizadores": lic.limite_utilizadores,
                  "limite_tokens_mes": lic.limite_tokens_mes},
    )
    db.commit()
    db.refresh(lic)
    return LicencaGerada(
        id=lic.id,
        chave=chave,
        chave_prefixo=lic.chave_prefixo,
        nif_previsto=lic.nif_previsto,
        nome_previsto=lic.nome_previsto,
        plano=lic.plano,
        expira_activacao=lic.expira_activacao,
        dias_para_activar=lic_svc.DIAS_PARA_ACTIVAR,
    )


@router.get("", response_model=list[LicencaPublica])
def listar(db: DB, estado: str | None = None) -> list[LicencaPublica]:
    """Licenças da plataforma.

    Marca as pendentes fora de prazo antes de listar, para a lista dizer a
    verdade — a verificação que conta é a da activação, esta é arrumação.
    """
    lic_svc.caducar_pendentes(db)
    db.commit()

    q = select(Licenca)
    if estado:
        q = q.where(Licenca.estado == estado)
    return [
        LicencaPublica.model_validate(l)
        for l in db.scalars(q.order_by(Licenca.criado_em.desc())).all()
    ]


@router.get("/empresas", response_model=list[EmpresaPublica])
def empresas(db: DB) -> list[EmpresaPublica]:
    """Empresas da plataforma. Só o superadministrador as vê todas."""
    return [
        EmpresaPublica.model_validate(e)
        for e in db.scalars(select(Empresa).order_by(Empresa.nome)).all()
    ]



@router.patch("/empresas/{empresa_id}/estado", response_model=EmpresaPublica)
def mudar_estado_empresa(
    request: Request,
    empresa_id: UUID,
    dados: EmpresaEstadoPedido,
    user: UtilizadorAtual,
    db: DB,
) -> EmpresaPublica:
    """Suspende, reactiva ou cancela uma empresa.

    Sem isto o campo `estado` era decorativo: o login recusava quem não
    estivesse activa, mas nada no sistema conseguia escrever lá — uma porta
    trancada sem ninguém que lhe pudesse mexer na chave. Suspender uma empresa
    que deixasse de pagar obrigava a mexer à mão na base de dados.

    SUSPENDER OU CANCELAR EXPULSA QUEM JÁ ESTÁ DENTRO. Subir a `token_version`
    de todos os utilizadores da empresa invalida as sessões abertas no pedido
    seguinte. Sem isso, suspender só travava logins novos, e quem estivesse com
    o sistema aberto continuava a trabalhar até o token expirar — que é
    precisamente o contrário do que se quer ao cortar o acesso a uma empresa.

    Todas as transições são permitidas, incluindo desfazer um cancelamento.
    Tornar um estado terminal só empurraria o problema de volta para o SQL à
    mão, que é o que esta rota existe para acabar.
    """
    empresa = db.get(Empresa, empresa_id)
    if empresa is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Empresa não encontrada.")

    anterior = str(empresa.estado)
    novo = str(dados.estado)
    if anterior == novo:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"A empresa já está {novo}."
        )

    empresa.estado = dados.estado

    expulsos = 0
    if dados.estado != EstadoEmpresa.ACTIVA:
        for u in db.scalars(select(User).where(User.empresa_id == empresa.id)).all():
            u.token_version += 1
            expulsos += 1

    auditar(
        db,
        actor=user,
        accao="empresa.estado",
        request=request,
        alvo_tipo="empresa",
        alvo_id=empresa.id,
        alvo_desc=f"{empresa.codigo} — {empresa.nome}",
        empresa_id=empresa.id,
        detalhes={
            "antes": anterior,
            "depois": novo,
            "motivo": (dados.motivo or "").strip() or None,
            "sessoes_terminadas": expulsos,
        },
    )
    db.commit()
    db.refresh(empresa)
    return EmpresaPublica.model_validate(empresa)


# ---------------------------------------------------------------------------
# Utilizadores das empresas
#
# Existe para um caso concreto: o administrador de uma empresa perde o acesso —
# esquece a palavra-passe, sai da empresa, perde o telemóvel do 2FA. Sem estas
# rotas não havia caminho nenhum para o resolver sem mexer à mão na base.
#
# A fronteira mantém-se: aqui gerem-se CONTAS e ACESSOS, nunca dados de
# negócio. O superadministrador não passa a ver a contabilidade de ninguém.
# ---------------------------------------------------------------------------
def _empresa_ou_404(db: DB, empresa_id: UUID) -> Empresa:
    empresa = db.get(Empresa, empresa_id)
    if empresa is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Empresa não encontrada.")
    return empresa


def _membro_ou_404(db: DB, empresa: Empresa, user_id: UUID) -> User:
    """O utilizador tem de ser DESTA empresa.

    A verificação não é formalidade: sem ela, um `user_id` de outra empresa —
    ou de um superadministrador — passava por aqui e as rotas de recuperação
    tornavam-se uma porta lateral para mexer em qualquer conta do sistema.
    """
    user = db.get(User, user_id)
    if user is None or user.empresa_id != empresa.id:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Utilizador não encontrado nesta empresa."
        )
    return user


@router.get(
    "/empresas/{empresa_id}/utilizadores", response_model=list[UtilizadorDaEmpresa]
)
def utilizadores_da_empresa(
    empresa_id: UUID, db: DB
) -> list[UtilizadorDaEmpresa]:
    """Quem tem conta nesta empresa, e com que acesso."""
    empresa = _empresa_ou_404(db, empresa_id)
    return [
        UtilizadorDaEmpresa.model_validate(u)
        for u in db.scalars(
            select(User)
            .where(User.empresa_id == empresa.id)
            .order_by(User.perfil, User.nome)
        ).all()
    ]


@router.post(
    "/empresas/{empresa_id}/utilizadores/{user_id}/perfil",
    response_model=UtilizadorDaEmpresa,
)
def mudar_perfil_membro(
    request: Request,
    empresa_id: UUID,
    user_id: UUID,
    dados: MudarPerfilPedido,
    user: UtilizadorAtual,
    db: DB,
) -> UtilizadorDaEmpresa:
    """Muda o perfil de um membro. Serve para promover a administrador.

    É o caminho para uma empresa que ficou sem administrador — porque o único
    que tinha saiu — voltar a ter quem a gere.

    NÃO promove a superadministrador. Deixar essa transição aqui abria uma
    porta lateral para a administração da plataforma através de uma conta de
    empresa, contornando o limite e o registo próprio que essas contas têm.
    """
    if dados.perfil == Perfil.SUPERADMIN:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Uma conta de empresa não pode ser promovida a administrador da "
            "plataforma. Essas contas criam-se na área de administração.",
        )

    empresa = _empresa_ou_404(db, empresa_id)
    membro = _membro_ou_404(db, empresa, user_id)
    anterior = str(membro.perfil)
    if anterior == str(dados.perfil):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"O utilizador já é {dados.perfil}."
        )

    membro.perfil = dados.perfil
    # O perfil está dentro do token: sem subir a versão, a sessão aberta
    # continuava com as permissões antigas até expirar.
    membro.token_version += 1

    auditar(
        db, actor=user, accao="utilizador.perfil", request=request,
        alvo_tipo="utilizador", alvo_id=membro.id,
        alvo_desc=f"{membro.nome} <{membro.email}>", empresa_id=empresa.id,
        detalhes={"antes": anterior, "depois": str(dados.perfil)},
    )
    db.commit()
    db.refresh(membro)
    return UtilizadorDaEmpresa.model_validate(membro)


@router.post(
    "/empresas/{empresa_id}/utilizadores/{user_id}/password",
    response_model=PasswordTemporaria,
)
def password_temporaria(
    request: Request, empresa_id: UUID, user_id: UUID, user: UtilizadorAtual, db: DB
) -> PasswordTemporaria:
    """Gera uma palavra-passe temporária e corta as sessões abertas.

    Para quem perdeu o acesso e não tem quem lho devolva — o administrador de
    uma empresa não tem, por definição, ninguém acima dele lá dentro.

    A palavra-passe é GERADA e mostrada uma vez, não escolhida por quem executa
    a operação: uma escolhida à pressa acaba em «12345678». Mas isto não deixa
    de ser o que é — quem a gera fica a saber a palavra-passe de outra pessoa
    até esta a mudar. Por isso fica auditado com destaque, e a interface diz-lhe
    para a mudar assim que entrar.
    """
    empresa = _empresa_ou_404(db, empresa_id)
    membro = _membro_ou_404(db, empresa, user_id)

    nova = lic_svc.gerar_password_temporaria()
    membro.password_hash = hash_password(nova)
    membro.password_provisoria = True
    membro.token_version += 1

    auditar(
        db, actor=user, accao="utilizador.password_temporaria", request=request,
        alvo_tipo="utilizador", alvo_id=membro.id,
        alvo_desc=f"{membro.nome} <{membro.email}>", empresa_id=empresa.id,
        detalhes={"sessoes_revogadas": True, "por": "administração da plataforma"},
    )
    db.commit()
    return PasswordTemporaria(password_temporaria=nova)


@router.delete(
    "/empresas/{empresa_id}/utilizadores/{user_id}/2fa",
    status_code=status.HTTP_204_NO_CONTENT,
)
def repor_2fa_membro(
    request: Request, empresa_id: UUID, user_id: UUID, user: UtilizadorAtual, db: DB
) -> None:
    """Desliga o 2FA de um membro que perdeu o telemóvel e os códigos.

    Sem isto, uma palavra-passe nova não chegava: a conta continuava a pedir um
    código que ninguém consegue gerar, e ficava inalcançável para sempre.

    Corta também as sessões: se a conta foi comprometida — outra razão para
    fazer isto — deixá-las vivas não resolvia nada.
    """
    empresa = _empresa_ou_404(db, empresa_id)
    membro = _membro_ou_404(db, empresa, user_id)
    if not membro.totp_ativo:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Este utilizador não tem verificação em dois passos activa.",
        )

    membro.totp_ativo = False
    membro.totp_segredo = None
    membro.totp_ativado_em = None
    membro.totp_ultimo_contador = None
    membro.totp_codigos_recuperacao = []
    membro.totp_falhas = 0
    membro.totp_bloqueado_ate = None
    membro.token_version += 1

    auditar(
        db, actor=user, accao="utilizador.2fa_reposto", request=request,
        alvo_tipo="utilizador", alvo_id=membro.id,
        alvo_desc=f"{membro.nome} <{membro.email}>", empresa_id=empresa.id,
        detalhes={"por": "administração da plataforma", "sessoes_revogadas": True},
    )
    db.commit()


# ---------------------------------------------------------------------------
# Contas de administração da plataforma
#
# Uma só conta é um ponto único de falha: perder-lhe a palavra-passe deixa a
# plataforma sem operador, e usá-la todos os dias aumenta a probabilidade de a
# expor. Daí existirem até `MAX_SUPERADMINS` — a inicial e mais duas, cada uma
# com dono conhecido — sem multiplicar sem limite a superfície mais poderosa
# do sistema.
#
# O que impede a plataforma de ficar sem operador é a regra de NINGUÉM PODER
# MEXER NA PRÓPRIA CONTA: como quem executa está sempre activo e nunca é o
# alvo, sobra sempre pelo menos ele. `_garantir_que_sobra_alguem` é uma rede por
# baixo dessa regra e, tal como as coisas estão, não chega a disparar — fica
# para o dia em que alguém relaxar a primeira sem reparar na consequência.
# ---------------------------------------------------------------------------
def _superadmins(db: DB) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .where(User.perfil == Perfil.SUPERADMIN)
            .order_by(User.criado_em)
        ).all()
    )


@router.get("/superadmins", response_model=list[SuperadminPublico])
def listar_superadmins(db: DB) -> list[SuperadminPublico]:
    """Contas de administração da plataforma."""
    return [SuperadminPublico.model_validate(u) for u in _superadmins(db)]


@router.post(
    "/superadmins",
    response_model=SuperadminCriado,
    status_code=status.HTTP_201_CREATED,
)
def criar_superadmin(
    request: Request, dados: SuperadminCriar, user: UtilizadorAtual, db: DB
) -> SuperadminCriado:
    """Cria outra conta de administração da plataforma.

    Exige a palavra-passe de quem cria. É das acções mais poderosas do sistema
    e um ecrã deixado aberto não pode bastar para a fazer.

    A palavra-passe inicial é gerada e mostrada uma vez. Quem cria fica a
    sabê-la até o dono a mudar — não há como evitar isso sem um canal de
    e-mail, e a alternativa (deixar quem cria escolhê-la) seria pior. Fica
    auditado, e a conta nova não administra nada até activar o segundo factor.
    """
    if not verificar_password(dados.password_actual, user.password_hash):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "A sua palavra-passe não está correcta."
        )

    limite = get_settings().MAX_SUPERADMINS
    existentes = _superadmins(db)
    if len(existentes) >= limite:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Já existem {len(existentes)} contas de administração da "
            f"plataforma, que é o máximo. Remova uma antes de criar outra.",
        )

    email = dados.email.strip().lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Já existe uma conta com este e-mail."
        )

    password = lic_svc.gerar_password_temporaria()
    novo = User(
        empresa_id=None,
        nome=dados.nome.strip(),
        email=email,
        password_hash=hash_password(password),
        perfil=Perfil.SUPERADMIN,
        ativo=True,
        # Não há ninguém acima para aprovar uma conta destas: quem a cria já é
        # a autoridade máxima do sistema.
        aprovado=True,
        # O estado de segurança inicial vai EXPLÍCITO e não herdado dos
        # defaults das colunas. Para a conta mais poderosa do sistema, ler o
        # que ela é ao nascer não deve obrigar a ir ver o modelo — e um default
        # alterado um dia não pode mudar isto sem que alguém repare.
        token_version=1,
        # Quem cria fica a saber esta palavra-passe. A marca faz o aviso
        # aparecer no primeiro acesso do dono.
        password_provisoria=True,
        totp_ativo=False,
        totp_segredo=None,
        totp_codigos_recuperacao=[],
        totp_falhas=0,
        totp_bloqueado_ate=None,
    )
    db.add(novo)
    db.flush()

    auditar(
        db, actor=user, accao="superadmin.criar", request=request,
        alvo_tipo="utilizador", alvo_id=novo.id,
        alvo_desc=f"{novo.nome} <{novo.email}>",
        detalhes={"total_apos": len(existentes) + 1, "limite": limite},
    )
    db.commit()
    db.refresh(novo)
    return SuperadminCriado(
        id=novo.id, nome=novo.nome, email=novo.email, password_inicial=password
    )


def _outro_superadmin(db: DB, user: User, alvo_id: UUID) -> User:
    """Devolve o superadministrador alvo, recusando o próprio."""
    if alvo_id == user.id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Não pode desactivar nem remover a sua própria conta. Peça a outro "
            "administrador da plataforma que o faça.",
        )
    alvo = db.get(User, alvo_id)
    if alvo is None or Perfil(alvo.perfil) != Perfil.SUPERADMIN:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Conta de administração não encontrada."
        )
    return alvo


def _garantir_que_sobra_alguem(db: DB, a_remover: User) -> None:
    """Rede de segurança: nunca deixar a plataforma sem operador activo.

    Hoje NÃO chega a disparar, e vale a pena dizê-lo em vez de fingir que é
    esta a protecção: quem executa a operação está sempre activo — senão não
    tinha sessão — e nunca é o alvo, porque `_outro_superadmin` o impede. Sobra
    sempre pelo menos ele.

    Fica na mesma, porque o dia em que alguém achar que a regra de não mexer na
    própria conta é um incómodo e a relaxar, é este cálculo que evita o sistema
    ficar sem forma de gerar licenças, ver a auditoria ou criar um operador.
    """
    activos = [u for u in _superadmins(db) if u.ativo and u.id != a_remover.id]
    if not activos:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Esta é a última conta de administração activa. Crie ou reactive "
            "outra antes de a desactivar.",
        )


@router.patch("/superadmins/{alvo_id}", response_model=SuperadminPublico)
def actualizar_superadmin(
    request: Request,
    alvo_id: UUID,
    dados: SuperadminAtualizar,
    user: UtilizadorAtual,
    db: DB,
) -> SuperadminPublico:
    """Activa ou desactiva outra conta de administração."""
    alvo = _outro_superadmin(db, user, alvo_id)
    if alvo.ativo == dados.ativo:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"A conta já está {'activa' if dados.ativo else 'inactiva'}.",
        )
    if not dados.ativo:
        _garantir_que_sobra_alguem(db, alvo)
        # Desactivar sem cortar as sessões deixava a conta a trabalhar até o
        # token expirar, e o `utilizador_atual` só a travaria no pedido
        # seguinte — que é o que esta subida de versão garante.
        alvo.token_version += 1

    alvo.ativo = dados.ativo
    auditar(
        db, actor=user,
        accao="superadmin.activar" if dados.ativo else "superadmin.desactivar",
        request=request, alvo_tipo="utilizador", alvo_id=alvo.id,
        alvo_desc=f"{alvo.nome} <{alvo.email}>",
    )
    db.commit()
    db.refresh(alvo)
    return SuperadminPublico.model_validate(alvo)


@router.delete("/superadmins/{alvo_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_superadmin(
    request: Request, alvo_id: UUID, user: UtilizadorAtual, db: DB
) -> None:
    """Remove outra conta de administração da plataforma."""
    alvo = _outro_superadmin(db, user, alvo_id)
    _garantir_que_sobra_alguem(db, alvo)

    descricao = f"{alvo.nome} <{alvo.email}>"
    auditar(
        db, actor=user, accao="superadmin.remover", request=request,
        alvo_tipo="utilizador", alvo_id=alvo.id, alvo_desc=descricao,
    )
    db.delete(alvo)
    db.commit()


@router.post(
    "/superadmins/{alvo_id}/password", response_model=PasswordTemporaria
)
def password_de_superadmin(
    request: Request, alvo_id: UUID, user: UtilizadorAtual, db: DB
) -> PasswordTemporaria:
    """Devolve o acesso a outra conta de administração que o perdeu."""
    alvo = _outro_superadmin(db, user, alvo_id)
    nova = lic_svc.gerar_password_temporaria()
    alvo.password_hash = hash_password(nova)
    alvo.password_provisoria = True
    alvo.token_version += 1

    auditar(
        db, actor=user, accao="superadmin.password_temporaria", request=request,
        alvo_tipo="utilizador", alvo_id=alvo.id,
        alvo_desc=f"{alvo.nome} <{alvo.email}>",
        detalhes={"sessoes_revogadas": True},
    )
    db.commit()
    return PasswordTemporaria(password_temporaria=nova)


@router.delete("/superadmins/{alvo_id}/2fa", status_code=status.HTTP_204_NO_CONTENT)
def repor_2fa_superadmin(
    request: Request, alvo_id: UUID, user: UtilizadorAtual, db: DB
) -> None:
    """Repõe o 2FA de outra conta de administração que perdeu o telemóvel.

    Sem isto, uma conta de administração sem telemóvel e sem códigos ficava
    inalcançável — e como o 2FA é obrigatório para administrar, nem uma
    palavra-passe nova a resolvia.
    """
    alvo = _outro_superadmin(db, user, alvo_id)
    if not alvo.totp_ativo:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Esta conta não tem verificação em dois passos activa.",
        )

    alvo.totp_ativo = False
    alvo.totp_segredo = None
    alvo.totp_ativado_em = None
    alvo.totp_ultimo_contador = None
    alvo.totp_codigos_recuperacao = []
    alvo.totp_falhas = 0
    alvo.totp_bloqueado_ate = None
    alvo.token_version += 1

    auditar(
        db, actor=user, accao="superadmin.2fa_reposto", request=request,
        alvo_tipo="utilizador", alvo_id=alvo.id,
        alvo_desc=f"{alvo.nome} <{alvo.email}>",
        detalhes={"sessoes_revogadas": True},
    )
    db.commit()


@router.get("/auditoria")
def auditoria(
    db: DB,
    empresa_id: UUID | None = None,
    accao: str | None = None,
    limite: int = 300,
) -> list[dict]:
    """Registo de auditoria de TODA a plataforma.

    Aqui o `empresa_id` é um filtro opcional e não uma fronteira: o
    superadministrador vê tudo por definição, incluindo o que os
    administradores fizeram dentro das empresas deles. A fronteira existe na
    rota equivalente de `/api/empresa/auditoria`, que a força.
    """
    return [
        {
            "id": r.id, "criado_em": r.criado_em, "accao": r.accao,
            "actor_nome": r.actor_nome, "actor_email": r.actor_email,
            "actor_perfil": r.actor_perfil, "alvo_tipo": r.alvo_tipo,
            "alvo_id": r.alvo_id, "alvo_desc": r.alvo_desc,
            "empresa_id": r.empresa_id, "detalhes": r.detalhes,
            "ip": r.ip,
        }
        for r in listar_auditoria(
            db, empresa_id=empresa_id, accao=accao, limite=limite
        )
    ]


@router.get("/consumo-ia")
def consumo_ia(db: DB) -> list[dict]:
    """Consumo de IA de TODAS as empresas no mês.

    É a informação de que a plataforma precisa para ter previsibilidade de
    custo: quem consome o quê, quem está perto do limite, e quanto está a
    custar em dólares antes de a factura chegar.
    """
    from src.services.ia.consumo import consumo_por_empresa

    return consumo_por_empresa(db)


@router.get("/precos-ia")
def precos_ia() -> dict:
    """Tabela de preços em vigor e de onde foi lida.

    A origem interessa a quem confere a factura: saber que se está a usar o
    recurso embutido em vez da configuração explica uma divergência que de
    outra forma pareceria erro de contagem.
    """
    from pathlib import Path

    from src.services.ia.precos import tabela

    t = tabela()
    de_configuracao = t.origem != "embutida"
    return {
        # Só o nome do ficheiro. O caminho absoluto do servidor não interessa a
        # quem está do outro lado e revela a estrutura de pastas da máquina.
        "origem": Path(t.origem).name if de_configuracao else "embutida",
        "de_configuracao": de_configuracao,
        "confirmado_em": t.confirmado_em,
        "por_omissao": {
            "entrada": str(t.por_omissao.entrada),
            "saida": str(t.por_omissao.saida),
        },
        "modelos": [
            {"modelo": m, "entrada": str(p.entrada), "saida": str(p.saida)}
            for m, p in sorted(t.modelos.items())
        ],
    }


@router.patch("/{licenca_id}", response_model=LicencaPublica)
def atualizar(
    request: Request, licenca_id: UUID, dados: LicencaAtualizar,
    user: UtilizadorAtual, db: DB,
) -> LicencaPublica:
    """Altera o contrato: plano, validade, estado e limites.

    A chave não está aqui de propósito. Trocar a chave de uma licença já
    activada não faz sentido — a empresa existe e já entra pelo login. Para
    emitir uma chave nova gera-se outra licença.
    """
    lic = db.get(Licenca, licenca_id)
    if lic is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Licença não encontrada.")

    alterados = dados.model_dump(exclude_unset=True)
    antes = {c: _legivel(getattr(lic, c)) for c in alterados}
    for campo, valor in alterados.items():
        setattr(lic, campo, valor)

    auditar(
        db, actor=user, accao="licenca.actualizar", request=request,
        alvo_tipo="licenca", alvo_id=lic.id,
        alvo_desc=f"{lic.chave_prefixo}… de {lic.nome_previsto}",
        empresa_id=lic.empresa_id,
        detalhes={"antes": antes, "depois": {c: _legivel(v) for c, v in alterados.items()}},
    )
    db.commit()
    db.refresh(lic)
    return LicencaPublica.model_validate(lic)


@router.delete("/{licenca_id}", status_code=status.HTTP_204_NO_CONTENT)
def revogar(
    request: Request, licenca_id: UUID, user: UtilizadorAtual, db: DB
) -> None:
    """Revoga uma licença.

    Uma licença POR ACTIVAR é apagada — não chegou a servir para nada. Uma
    licença JÁ ACTIVADA passa a cancelada e fica: apagá-la deixaria a empresa
    sem registo do contrato que a criou, e o histórico de facturação depende
    disso.
    """
    lic = db.get(Licenca, licenca_id)
    if lic is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Licença não encontrada.")

    auditar(
        db, actor=user, accao="licenca.revogar", request=request,
        alvo_tipo="licenca", alvo_id=lic.id,
        alvo_desc=f"{lic.chave_prefixo}… de {lic.nome_previsto}",
        empresa_id=lic.empresa_id,
        detalhes={"apagada": lic.empresa_id is None},
    )
    if lic.empresa_id is None:
        db.delete(lic)
    else:
        lic.estado = EstadoLicenca.CANCELADA
    db.commit()
