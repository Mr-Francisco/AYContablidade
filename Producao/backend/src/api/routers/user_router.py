"""Gestão de utilizadores dentro de uma empresa.

Transposto de `utilizadores.html` e de `Store.saveUser` / `aprovarUser` do
Piloto. Reservado ao administrador da empresa.

Todas as consultas são filtradas por `empresa_id`. É esta a fronteira que
garante que «um utilizador de uma empresa nunca consegue aceder aos dados de
outra empresa» (docs/TENANCY_AND_ACCESS.md).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select

from src.api.deps import (
    DB,
    EmpresaAtual,
    UtilizadorAtual,
    exigir_perfil,
    licenca_da_empresa,
)
from src.auth.security import hash_password, validar_forca_password
from src.core.constants import (
    CAPS,
    MODULO_LABEL,
    PERFIL_COR,
    PERFIL_LABEL,
    Accao,
    Modulo,
    Perfil,
)
from src.db.base import agora
from src.db.models.user import User
from src.db.schemas.auth import UtilizadorPublico
from src.services.auditoria import auditar
from src.services.licenciamento import gerar_password_temporaria
from src.db.schemas.user import (
    AprovacaoFeita,
    AprovarPedido,
    DefinirPassword,
    UtilizadorAtualizar,
    UtilizadorCriar,
)

router = APIRouter(
    prefix="/api/users",
    tags=["utilizadores"],
    # Regra 5 e RBAC: só administradores. O superadmin passa onde o admin passa.
    dependencies=[Depends(exigir_perfil(Perfil.ADMIN))],
)


def exigir_lugar_livre(db, empresa_id) -> None:
    """Há lugar na licença para mais uma conta activa?

    ESTAVA SÓ AQUI, e era metade da verificação. Só corria quando o
    administrador criava uma conta directamente — não corria ao aceitar um
    pedido de acesso, e por isso uma empresa com licença para cinco pessoas
    passava dos cinco pelo caminho de pedir acesso e ser aceite. O limite
    existia e não travava o caminho por onde a maior parte das contas entra.

    Fica numa função para os dois caminhos a chamarem. A mensagem fala de
    «licença» e não de «plano»: o número que trava está gravado na licença
    daquela empresa, e pode ter sido ajustado para ela.
    """
    licenca = licenca_da_empresa(db, empresa_id)
    if licenca is None or licenca.limite_utilizadores is None:
        return

    activos = db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.empresa_id == empresa_id, User.ativo.is_(True))
    )
    if int(activos or 0) >= licenca.limite_utilizadores:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"A licença desta empresa permite {licenca.limite_utilizadores} "
            "contas activas, e já estão todas em uso. Desactive uma conta que "
            "já não seja precisa, ou fale com o fornecedor da plataforma para "
            "aumentar o limite.",
        )


def _da_empresa(db: DB, empresa_id: UUID, user_id: UUID) -> User:
    """Carrega um utilizador GARANTINDO que pertence à empresa em causa.

    Nunca usar `db.get(User, id)` directamente nestas rotas: daria acesso a
    utilizadores de outras empresas a quem adivinhasse um UUID.
    """
    user = db.scalar(
        select(User).where(User.id == user_id, User.empresa_id == empresa_id)
    )
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Utilizador não encontrado.")
    return user



def _legivel(valor):
    """Converte para algo que caiba em JSONB (enums, datas, UUIDs)."""
    if valor is None or isinstance(valor, (str, int, float, bool, list, dict)):
        return valor
    return str(valor)


# ---------------------------------------------------------------------------
# O vocabulário do sistema — fora do router acima, e por isso sem `exigir_perfil`.
#
# São os NOMES e as CORES dos perfis, dos módulos e das acções. Não dizem nada
# sobre ninguém: dizem que o perfil `contabilista` se escreve «Contabilista» e
# é azul-escuro. Estavam trancados atrás do perfil de administrador porque a
# primeira página a precisar deles foi a de gestão de utilizadores.
#
# O efeito colateral era o ecrã «O Meu Perfil» de toda a gente: quem não é
# administrador via o seu próprio perfil escrito `contabilista`, em minúsculas
# e a cinzento, porque o pedido que traz o rótulo e a cor devolvia 403.
# ---------------------------------------------------------------------------
router_vocabulario = APIRouter(prefix="/api/users", tags=["utilizadores"])


@router_vocabulario.get("/metadados")
def metadados() -> dict:
    """Perfis, módulos e capacidades, com os rótulos e cores do sistema.

    Existe para a interface não os duplicar. Os perfis, as suas capacidades e as
    cores estão em `core/constants.py` porque é o backend que decide quem pode o
    quê — uma segunda cópia no frontend divergiria na primeira alteração, e a
    interface passaria a prometer acessos que a API recusa.
    """
    return {
        "perfis": [
            {
                "id": str(p),
                "nome": PERFIL_LABEL[p],
                "cor": PERFIL_COR[p],
                "atribuivel": p is not Perfil.SUPERADMIN,
                "capacidades": list(CAPS.get(p, ())),
            }
            for p in Perfil
        ],
        "modulos": [
            {"id": str(m), "nome": MODULO_LABEL[m]} for m in Modulo
        ],
        "accoes": [str(a) for a in Accao],
    }

@router.get("", response_model=list[UtilizadorPublico])
def listar(empresa: EmpresaAtual, db: DB) -> list[UtilizadorPublico]:
    """Contas da empresa, pendentes primeiro (como na tabela do Piloto)."""
    users = db.scalars(
        select(User)
        .where(User.empresa_id == empresa.id)
        .order_by(User.aprovado.asc(), User.nome.asc())
    ).all()
    return [UtilizadorPublico.model_validate(u) for u in users]



@router.get("/pendentes", response_model=list[UtilizadorPublico])
def pendentes(empresa: EmpresaAtual, db: DB) -> list[UtilizadorPublico]:
    """Contas por aprovar (`Store.pendentes` no Piloto)."""
    users = db.scalars(
        select(User)
        .where(User.empresa_id == empresa.id, User.aprovado.is_(False))
        .order_by(User.criado_em.asc())
    ).all()
    return [UtilizadorPublico.model_validate(u) for u in users]


@router.post("", response_model=UtilizadorPublico, status_code=status.HTTP_201_CREATED)
def criar(
    request: Request,
    dados: UtilizadorCriar,
    empresa: EmpresaAtual,
    quem: UtilizadorAtual,
    db: DB,
) -> UtilizadorPublico:
    validar_forca_password(dados.password)

    if dados.perfil == Perfil.SUPERADMIN:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "O perfil de superadministrador não pode ser atribuído a partir daqui.",
        )

    ja_existe = db.scalar(
        select(User.id).where(func.lower(User.email) == dados.email.lower())
    )
    if ja_existe is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Já existe uma conta com este e-mail."
        )

    exigir_lugar_livre(db, empresa.id)

    user = User(
        empresa_id=empresa.id,
        nome=dados.nome.strip(),
        email=dados.email.lower(),
        password_hash=hash_password(dados.password),
        perfil=dados.perfil,
        telefone=(dados.telefone or "").strip() or None,
        ativo=True,
        aprovado=dados.aprovado,
        modulos_permitidos=dados.modulos_permitidos,
        permissoes_extra=dados.permissoes_extra,
        permissoes_accao=dados.permissoes_accao,
    )
    db.add(user)
    db.flush()
    auditar(
        db, actor=quem, accao="utilizador.criar", request=request,
        alvo_tipo="utilizador", alvo_id=user.id,
        alvo_desc=f"{user.nome} <{user.email}>", empresa_id=empresa.id,
        detalhes={"perfil": str(user.perfil),
                  "modulos_permitidos": user.modulos_permitidos},
    )
    db.commit()
    db.refresh(user)
    return UtilizadorPublico.model_validate(user)


@router.get("/{user_id}", response_model=UtilizadorPublico)
def obter(user_id: UUID, empresa: EmpresaAtual, db: DB) -> UtilizadorPublico:
    return UtilizadorPublico.model_validate(_da_empresa(db, empresa.id, user_id))


@router.patch("/{user_id}", response_model=UtilizadorPublico)
def atualizar(
    request: Request,
    user_id: UUID,
    dados: UtilizadorAtualizar,
    empresa: EmpresaAtual,
    atual: UtilizadorAtual,
    db: DB,
) -> UtilizadorPublico:
    user = _da_empresa(db, empresa.id, user_id)

    if dados.perfil == Perfil.SUPERADMIN:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "O perfil de superadministrador não pode ser atribuído a partir daqui.",
        )
    # Um administrador não se desactiva nem se despromove a si próprio: seria
    # possível deixar a empresa sem ninguém capaz de gerir utilizadores.
    if user.id == atual.id:
        if dados.ativo is False:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Não pode desactivar a sua própria conta."
            )
        if dados.perfil is not None and dados.perfil != Perfil(user.perfil):
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Não pode alterar o seu próprio perfil."
            )

    campos = dados.model_dump(exclude_unset=True)
    # Mudar perfil ou desactivar altera o que a sessão pode fazer: as sessões
    # abertas têm de cair, senão o token antigo continua a valer o perfil antigo.
    revoga = ("perfil" in campos and campos["perfil"] != user.perfil) or (
        "ativo" in campos and campos["ativo"] != user.ativo
    )

    antes = {c: _legivel(getattr(user, c)) for c in campos}
    for campo, valor in campos.items():
        setattr(user, campo, valor)
    if revoga:
        user.token_version += 1

    auditar(
        db, actor=atual, accao="utilizador.actualizar", request=request,
        alvo_tipo="utilizador", alvo_id=user.id,
        alvo_desc=f"{user.nome} <{user.email}>", empresa_id=empresa.id,
        detalhes={"antes": antes,
                  "depois": {c: _legivel(v) for c, v in campos.items()},
                  "sessoes_revogadas": revoga},
    )
    db.commit()
    db.refresh(user)
    return UtilizadorPublico.model_validate(user)


@router.post("/{user_id}/aprovar", response_model=AprovacaoFeita)
def aprovar(
    request: Request,
    user_id: UUID,
    dados: AprovarPedido,
    empresa: EmpresaAtual,
    atual: UtilizadorAtual,
    db: DB,
) -> AprovacaoFeita:
    """Aceita um pedido de acesso e entrega a palavra-passe de entrada.

    QUEM PEDE ACESSO NÃO ESCOLHE PALAVRA-PASSE — não faria sentido escolher uma
    credencial para uma conta que a empresa ainda não aceitou. Ela nasce aqui,
    no momento em que o pedido é aceite, e é mostrada UMA VEZ a quem aceita,
    para a entregar à pessoa.

    Vem em grupos legíveis ao telefone de propósito: é assim que vai ser
    transmitida, e a pessoa é avisada no primeiro acesso para a trocar.

    Contas criadas pelo administrador já trazem palavra-passe própria; nesse
    caso não se gera nenhuma e o campo vem vazio.
    """
    user = _da_empresa(db, empresa.id, user_id)
    if user.aprovado:
        raise HTTPException(status.HTTP_409_CONFLICT, "A conta já está aprovada.")
    if dados.perfil == Perfil.SUPERADMIN:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "O perfil de superadministrador não pode ser atribuído a partir daqui.",
        )

    user.aprovado = True
    user.ativo = True
    if dados.perfil is not None:
        user.perfil = dados.perfil
    user.aprovado_por_id = atual.id
    user.aprovado_em = agora()

    # HÁ LUGAR NA LICENÇA? Aceitar um pedido cria uma conta activa, e é por
    # este caminho que a maior parte delas entra. Verificar só na criação
    # directa deixava o limite a não travar nada.
    exigir_lugar_livre(db, empresa.id)

    password = None
    if not user.password_definida:
        password = gerar_password_temporaria()
        user.password_hash = hash_password(password)
        user.password_definida = True
        # Definida por outra pessoa: a pessoa é avisada no primeiro acesso.
        user.password_provisoria = True

    auditar(
        db, actor=atual, accao="utilizador.aprovar", request=request,
        alvo_tipo="utilizador", alvo_id=user.id,
        alvo_desc=f"{user.nome} <{user.email}>", empresa_id=empresa.id,
        # A palavra-passe NÃO entra nos detalhes. O que fica registado é que
        # foi entregue uma, não qual.
        detalhes={"perfil": str(user.perfil), "password_entregue": password is not None},
    )
    db.commit()
    db.refresh(user)
    return AprovacaoFeita(
        utilizador=UtilizadorPublico.model_validate(user),
        password_entrada=password,
    )


@router.post("/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
def definir_password(
    request: Request,
    user_id: UUID,
    dados: DefinirPassword,
    empresa: EmpresaAtual,
    atual: UtilizadorAtual,
    db: DB,
) -> None:
    """Define a palavra-passe de outro utilizador e corta-lhe as sessões."""
    user = _da_empresa(db, empresa.id, user_id)
    validar_forca_password(dados.password_nova)
    user.password_hash = hash_password(dados.password_nova)
    # Definida por outra pessoa: o dono é avisado no primeiro acesso.
    user.password_provisoria = True
    user.token_version += 1

    # Um administrador a mudar a palavra-passe de outra pessoa é das acções
    # mais sensíveis que existem: dá-lhe acesso à conta. A palavra-passe em si
    # não entra nos detalhes — o `auditar` filtra-a de qualquer maneira.
    auditar(
        db, actor=atual, accao="utilizador.definir_password", request=request,
        alvo_tipo="utilizador", alvo_id=user.id,
        alvo_desc=f"{user.nome} <{user.email}>", empresa_id=empresa.id,
        detalhes={"sessoes_revogadas": True},
    )
    db.commit()


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover(
    request: Request,
    user_id: UUID,
    empresa: EmpresaAtual,
    atual: UtilizadorAtual,
    db: DB,
) -> None:
    user = _da_empresa(db, empresa.id, user_id)
    if user.id == atual.id:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Não pode eliminar a sua própria conta."
        )
    # Auditar ANTES de apagar: depois do delete os campos já não se leem, e é
    # justamente esta acção que mais interessa ter registada.
    auditar(
        db, actor=atual, accao="utilizador.remover", request=request,
        alvo_tipo="utilizador", alvo_id=user.id,
        alvo_desc=f"{user.nome} <{user.email}>", empresa_id=empresa.id,
        detalhes={"perfil": str(user.perfil)},
    )
    db.delete(user)
    db.commit()
