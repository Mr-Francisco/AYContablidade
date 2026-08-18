"""Esquemas de gestão de utilizadores (área do administrador da empresa)."""

from pydantic import BaseModel, EmailStr, Field

from src.core.constants import Perfil
from src.db.schemas.auth import UtilizadorPublico


class UtilizadorCriar(BaseModel):
    nome: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    perfil: Perfil
    telefone: str | None = Field(default=None, max_length=40)
    # None = sem restrição pessoal; lista vazia = nenhum módulo. Não é o mesmo.
    modulos_permitidos: list[str] | None = None
    permissoes_extra: list[str] = Field(default_factory=list)
    permissoes_accao: dict[str, list[str]] = Field(default_factory=dict)
    # Um utilizador criado pelo administrador já nasce aprovado.
    aprovado: bool = True


class UtilizadorAtualizar(BaseModel):
    """Todos os campos são opcionais — só o que vier é alterado.

    A palavra-passe não está aqui de propósito: muda-se em
    `POST /users/{id}/password`, que incrementa a `token_version` e corta as
    sessões abertas.
    """

    nome: str | None = Field(default=None, min_length=1, max_length=200)
    perfil: Perfil | None = None
    telefone: str | None = Field(default=None, max_length=40)
    ativo: bool | None = None
    modulos_permitidos: list[str] | None = None
    permissoes_extra: list[str] | None = None
    permissoes_accao: dict[str, list[str]] | None = None


class DefinirPassword(BaseModel):
    password_nova: str = Field(min_length=8, max_length=200)


class AprovarPedido(BaseModel):
    """Aprovação de uma conta pendente, opcionalmente mudando-lhe o perfil
    (o `aprovarUser(id, perfil)` do Piloto)."""

    perfil: Perfil | None = None


class AprovacaoFeita(BaseModel):
    """O que se devolve ao aceitar um pedido de acesso.

    A `password_entrada` vem preenchida quando a pessoa pediu acesso pelo ecrã
    público — nesse caso não escolheu palavra-passe nenhuma, e esta é a que lhe
    tem de ser entregue. **Só é mostrada aqui, uma vez.** Não fica guardada em
    lado nenhum de onde se possa voltar a ler.

    Vem vazia quando a conta foi criada pelo administrador, que nessa altura já
    definiu uma.
    """

    utilizador: UtilizadorPublico
    password_entrada: str | None = None
