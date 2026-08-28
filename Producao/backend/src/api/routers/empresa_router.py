"""Dados e configuração da própria empresa.

Corresponde ao ecrã Configurações (`Piloto/empresa.html`), reservado ao
administrador. Actua sempre sobre a empresa do utilizador autenticado — não
recebe `empresa_id` por parâmetro, precisamente para não haver forma de apontar
para outra empresa.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from src.api.paginacao import LIMITE_OMISSAO, pagina
from src.api.deps import (
    DB,
    EmpresaAtual,
    UtilizadorAtual,
    exigir_perfil,
    licenca_da_empresa,
)
from src.core.constants import Perfil, RegimeIVA
from src.db.models.tenancy import ConfigEmpresa
from src.db.schemas.licenca import EmpresaPublica, LicencaPublica
from src.services.auditoria import auditar
from src.services.auditoria import listar as listar_auditoria

router = APIRouter(
    prefix="/api/empresa",
    tags=["empresa"],
    dependencies=[Depends(exigir_perfil(Perfil.ADMIN))],
)

# ---------------------------------------------------------------------------
# O cartão da empresa — fora do router acima, e por isso sem o `exigir_perfil`.
#
# Todo o mapa que se imprime leva o nome da empresa em cima e os valores na
# moeda dela. Como a ficha inteira é do administrador, um contabilista tinha o
# balancete a sair sem cabeçalho e os valores em «Kz» por omissão, mesmo numa
# empresa que trabalha noutra moeda. Isso não é uma questão de permissões: é o
# documento a sair errado.
#
# Aqui vão só os cinco campos que um cabeçalho precisa. Morada, contactos,
# licença e configurações continuam onde estavam.
# ---------------------------------------------------------------------------
router_cartao = APIRouter(prefix="/api/empresa", tags=["empresa"])


class CartaoEmpresa(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nome: str
    nif: str
    codigo: str
    moeda: str
    regime: RegimeIVA


@router_cartao.get("/cartao", response_model=CartaoEmpresa)
def cartao(empresa: EmpresaAtual) -> CartaoEmpresa:
    """Nome, NIF, código, moeda e regime — o que vai no topo de um mapa.

    Qualquer utilizador autenticado da empresa; `EmpresaAtual` já garante que
    é a dele e não outra.
    """
    return CartaoEmpresa.model_validate(empresa)


class EmpresaAtualizar(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=200)
    morada: str | None = Field(default=None, max_length=300)
    localizacao: str | None = Field(default=None, max_length=200)
    telefone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=200)
    logo: str | None = None
    coordenadas_bancarias: str | None = None
    moeda: str | None = Field(default=None, max_length=8)
    regime: RegimeIVA | None = None
    forma_juridica: str | None = Field(default=None, max_length=20)


#: O que o logótipo pode ser.
#:
#: GUARDADO COMO TEXTO DENTRO DA FICHA DA EMPRESA, e por isso viaja em cada
#: resposta que traga a empresa. Um ficheiro de dois megabytes não estraga só o
#: papel — torna a aplicação mais lenta para essa empresa em todo o lado. Daí o
#: limite, que é generoso para uma marca e apertado para uma fotografia.
LOGO_TIPOS = ("image/png", "image/svg+xml", "image/jpeg")
LOGO_MAX_BYTES = 200 * 1024


def _recusar_logo(mensagem: str) -> None:
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=mensagem
    )


def _validar_logo(valor: str) -> None:
    """O logótipo chega como `data:` — o ecrã lê o ficheiro e envia-o assim."""
    import base64
    import re

    m = re.match(r"^data:([-\w.+/]+);base64,(.+)$", valor, re.S)
    if not m:
        _recusar_logo(
            "Não foi possível ler a imagem do logótipo. Volte a escolher o "
            "ficheiro e grave outra vez."
        )
        return
    tipo, corpo = m.group(1), m.group(2)
    if tipo not in LOGO_TIPOS:
        _recusar_logo(
            "O logótipo tem de ser uma imagem PNG, SVG ou JPEG. Guarde o "
            "ficheiro num destes formatos e volte a carregá-lo."
        )
    try:
        tamanho = len(base64.b64decode(corpo, validate=True))
    except Exception:
        _recusar_logo(
            "A imagem do logótipo chegou incompleta. Volte a escolher o "
            "ficheiro e grave outra vez."
        )
        return
    if tamanho > LOGO_MAX_BYTES:
        _recusar_logo(
            f"O logótipo não pode passar de {LOGO_MAX_BYTES // 1024} KB e este "
            f"tem {tamanho // 1024} KB. Guarde a imagem num tamanho menor e "
            "volte a carregá-la."
        )


class ConfigAtualizar(BaseModel):
    modulos: dict | None = None
    parametrizacoes: dict | None = None
    agt: dict | None = None


class ConfigPublica(BaseModel):
    modulos: dict
    parametrizacoes: dict
    agt: dict



def _legivel(valor):
    """Converte para algo que caiba em JSONB (enums, datas, UUIDs)."""
    if valor is None or isinstance(valor, (str, int, float, bool, list, dict)):
        return valor
    return str(valor)


@router.get("/auditoria")
def auditoria(
    empresa: EmpresaAtual, db: DB, accao: str | None = None,
    offset: int = 0, limite: int = LIMITE_OMISSAO,
) -> dict:
    """Registo de auditoria DESTA empresa.

    O `empresa_id` é passado sempre e não vem do pedido: é o que garante que um
    administrador vê o que aconteceu à sua empresa e nada mais, incluindo as
    acções que o superadministrador fez sobre ela — que é justamente o que ele
    tem direito a saber.
    """
    from src.db.models.auditoria import RegistoAuditoria

    q = (
        select(RegistoAuditoria)
        .where(RegistoAuditoria.empresa_id == empresa.id)
        .order_by(RegistoAuditoria.criado_em.desc())
    )
    if accao:
        q = q.where(RegistoAuditoria.accao == accao)

    return pagina(
        db, q, offset=offset, limite=limite,
        formatar=lambda r: {
            "id": r.id, "criado_em": r.criado_em, "accao": r.accao,
            "actor_nome": r.actor_nome, "actor_email": r.actor_email,
            "actor_perfil": r.actor_perfil, "alvo_tipo": r.alvo_tipo,
            "alvo_desc": r.alvo_desc, "detalhes": r.detalhes, "ip": r.ip,
        },
    )


@router.get("", response_model=EmpresaPublica)
def obter(empresa: EmpresaAtual) -> EmpresaPublica:
    return EmpresaPublica.model_validate(empresa)


@router.patch("", response_model=EmpresaPublica)
def atualizar(
    request: Request, dados: EmpresaAtualizar, empresa: EmpresaAtual,
    quem: UtilizadorAtual, db: DB,
) -> EmpresaPublica:
    """Actualiza os dados da empresa.

    O NIF não é alterável: identifica a empresa perante a AGT e está gravado em
    documentos fiscais já emitidos. Mudá-lo exige intervenção do superadmin.
    """
    campos = dados.model_dump(exclude_unset=True)

    # A FICHA NÃO SE GRAVA SEM LOGÓTIPO. Ele vai no topo de cada factura e de
    # cada mapa impresso, e sem ele o documento sai com um quadrado de iniciais
    # no lugar da marca. Olha-se ao valor QUE FICA, e não ao que veio no
    # pedido: mudar só o telefone de uma empresa que nunca carregou o logótipo
    # também tem de parar aqui, senão a exigência nunca chegava a ninguém.
    if campos.get("logo"):
        _validar_logo(campos["logo"])
    if not (campos.get("logo", empresa.logo) or "").strip():
        _recusar_logo(
            "A ficha da empresa só se grava com o logótipo carregado, porque "
            "ele aparece no topo das facturas e dos mapas impressos. Carregue "
            "uma imagem PNG, SVG ou JPEG — de preferência com 600 por 200 "
            "pontos ou mais, até 200 KB."
        )

    # Mudança de regime de IVA entra no histórico: o apuramento de períodos
    # passados tem de continuar a usar o regime que vigorava nessa altura.
    novo_regime = campos.get("regime")
    if novo_regime is not None and novo_regime != empresa.regime:
        from src.db.base import agora

        historico = list(empresa.regime_historico or [])
        historico.append(
            {
                "de": str(empresa.regime),
                "para": str(novo_regime),
                "em": agora().isoformat(),
            }
        )
        empresa.regime_historico = historico

    antes = {c: _legivel(getattr(empresa, c)) for c in campos}
    for campo, valor in campos.items():
        setattr(empresa, campo, valor)

    auditar(
        db, actor=quem, accao="empresa.actualizar", request=request,
        alvo_tipo="empresa", alvo_id=empresa.id, alvo_desc=empresa.nome,
        empresa_id=empresa.id,
        detalhes={"antes": antes,
                  "depois": {c: _legivel(v) for c, v in campos.items()}},
    )
    db.commit()
    db.refresh(empresa)
    return EmpresaPublica.model_validate(empresa)


@router.get("/licenca", response_model=LicencaPublica)
def licenca(empresa: EmpresaAtual, db: DB) -> LicencaPublica:
    """Licença activa da empresa — só de leitura.

    Plano, validade e limites são geridos pelo superadministrador da plataforma;
    aqui o administrador da empresa apenas os consulta.
    """
    lic = licenca_da_empresa(db, empresa.id)
    if lic is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "A empresa não tem licença activa."
        )
    return LicencaPublica.model_validate(lic)


@router.get("/config", response_model=ConfigPublica)
def obter_config(empresa: EmpresaAtual, db: DB) -> ConfigPublica:
    cfg = db.scalar(select(ConfigEmpresa).where(ConfigEmpresa.empresa_id == empresa.id))
    if cfg is None:
        return ConfigPublica(modulos={}, parametrizacoes={}, agt={})
    return ConfigPublica(
        modulos=cfg.modulos, parametrizacoes=cfg.parametrizacoes, agt=cfg.agt
    )


@router.patch("/config", response_model=ConfigPublica)
def atualizar_config(
    request: Request, dados: ConfigAtualizar, empresa: EmpresaAtual,
    quem: UtilizadorAtual, db: DB,
) -> ConfigPublica:
    """Actualiza módulos activos, parametrizações e integração AGT.

    As credenciais da AGT não passam por aqui: vivem em variáveis de ambiente
    (Regra 6). Este bloco guarda apenas se está activa e o ambiente.
    """
    cfg = db.scalar(select(ConfigEmpresa).where(ConfigEmpresa.empresa_id == empresa.id))
    if cfg is None:
        cfg = ConfigEmpresa(
            empresa_id=empresa.id, modulos={}, parametrizacoes={}, agt={}
        )
        db.add(cfg)

    campos = dados.model_dump(exclude_unset=True)
    if "agt" in campos and campos["agt"] is not None:
        proibidos = {"username", "password", "senha", "token", "api_key"}
        encontrados = proibidos & {k.lower() for k in campos["agt"]}
        if encontrados:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Credenciais não podem ser guardadas na configuração "
                f"({', '.join(sorted(encontrados))}) — usar variáveis de ambiente.",
            )

    for campo, valor in campos.items():
        if valor is not None:
            setattr(cfg, campo, valor)

    db.commit()
    db.refresh(cfg)
    return ConfigPublica(
        modulos=cfg.modulos, parametrizacoes=cfg.parametrizacoes, agt=cfg.agt
    )
