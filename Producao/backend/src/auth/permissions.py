"""Permissões.

Porta a função `can()` e a regra `moduloAtivo()` do Piloto
(`Piloto/assets/js/app.js`) e acrescenta a granularidade por acção exigida por
`docs/TENANCY_AND_ACCESS.md`.

A verificação de acesso tem sempre três camadas, por esta ordem:
  1. licença da empresa activa;
  2. módulo activo na empresa E incluído no plano E permitido ao utilizador;
  3. capacidade do perfil (matriz CAPS) ou permissão de acção explícita.
"""

from datetime import date

from src.core.constants import (
    CAPS,
    MODULO_PREFIXO_CAP,
    Accao,
    EstadoLicenca,
    Modulo,
    Perfil,
)
from src.db.models.tenancy import ConfigEmpresa, Licenca
from src.db.models.user import User


def eh_admin(perfil: Perfil | str) -> bool:
    """admin e superadmin são equivalentes para efeitos de acesso (ehAdminLike)."""
    return perfil in (Perfil.ADMIN, Perfil.SUPERADMIN)


def capacidades(user: User) -> frozenset[str]:
    """Capacidades efectivas: as do perfil mais as extra do utilizador."""
    base = CAPS.get(Perfil(user.perfil), ())
    return frozenset(base) | frozenset(user.permissoes_extra or ())


def pode(user: User, acao: str) -> bool:
    """Equivalente ao `can(acao)` do Piloto. Ex.: pode(u, "contab.lancar")."""
    if not user.ativo or not user.aprovado:
        return False
    caps = capacidades(user)
    return "*" in caps or acao in caps


def licenca_valida(licenca: Licenca | None, hoje: date | None = None) -> bool:
    """A licença tem de estar activa e dentro da validade.

    Sem licença = sem acesso. Validade a NULL = licença perpétua.
    """
    if licenca is None or licenca.estado != EstadoLicenca.ACTIVA:
        return False
    if licenca.validade is None:
        return True
    return licenca.validade >= (hoje or date.today())


def modulo_ativo(
    modulo: Modulo | str,
    user: User,
    config: ConfigEmpresa | None = None,
    licenca: Licenca | None = None,
) -> bool:
    """Um módulo só está disponível se passar em todas as camadas.

    Segue a regra do Piloto (desactivação global na empresa + lista pessoal do
    utilizador) e acrescenta o plano da licença, que o Piloto não tinha.
    """
    nome = str(modulo)

    # Superadmin da plataforma: gere licenças e empresas, não é limitado por elas.
    if user.perfil == Perfil.SUPERADMIN:
        return True

    # Camada 1 — licença.
    if licenca is not None and not licenca_valida(licenca):
        return False
    # Plano: lista vazia = todos os módulos incluídos.
    if licenca is not None and licenca.modulos_incluidos:
        if nome not in licenca.modulos_incluidos:
            return False

    # Camada 2 — activação global na empresa. Só `False` explícito desactiva,
    # tal como no Piloto (uma chave ausente não significa desactivado).
    if config is not None and config.modulos.get(nome) is False:
        return False

    # Camada 3 — lista pessoal. NULL = sem restrição; lista vazia = nenhum módulo.
    if user.modulos_permitidos is not None:
        return nome in user.modulos_permitidos

    return True


#: Prefixo da capacidade -> módulo a que pertence.
#:
#: Existe para que a verificação de módulo possa ser feita a partir da
#: capacidade que o router já declara, sem obrigar cada router a declarar duas
#: coisas. Um router que declare `exigir_cap("rh.ver")` está, por construção,
#: a dizer que é do módulo de RH.
#:
#: Uma capacidade fora deste mapa (`empresa.ver`) não pertence a módulo nenhum
#: e não é filtrada — é o caso das rotas transversais.
MODULO_DA_CAPACIDADE: dict[str, Modulo] = {
    "contab": Modulo.CONTABILIDADE,
    "financeiro": Modulo.CONTAS_CORRENTES,
    "comercial": Modulo.COMERCIAL,
    "logistica": Modulo.LOGISTICA,
    "imob": Modulo.IMOBILIZADOS,
    "analitica": Modulo.ANALITICA,
    "rh": Modulo.RH,
}


def modulo_da_capacidade(acao: str) -> Modulo | None:
    return MODULO_DA_CAPACIDADE.get(str(acao).split(".", 1)[0])


def pode_accao(user: User, modulo: Modulo | str, accao: Accao | str) -> bool:
    """Permissão por módulo e acção (ver/criar/editar/eliminar/exportar).

    Se o utilizador tiver uma lista explícita de acções para o módulo, é essa
    que manda. Caso contrário deriva-se da matriz CAPS do Piloto: a capacidade
    `<prefixo>.ver` dá leitura e `<prefixo>.gerir` dá escrita.
    """
    if not user.ativo or not user.aprovado:
        return False
    if eh_admin(user.perfil):
        return True

    nome, accao_str = str(modulo), str(accao)

    explicitas = (user.permissoes_accao or {}).get(nome)
    if explicitas is not None:
        return accao_str in explicitas

    prefixo = MODULO_PREFIXO_CAP.get(Modulo(nome))
    if prefixo is None:
        return False

    caps = capacidades(user)
    if "*" in caps:
        return True
    if accao_str == Accao.VER:
        return f"{prefixo}.ver" in caps
    # Escrever exige gerir; a contabilidade usa verbos próprios (lancar/plano/fechar).
    if prefixo == "contab":
        return bool(caps & {"contab.lancar", "contab.plano", "contab.fechar"})
    return f"{prefixo}.gerir" in caps
