"""Geração e activação de licenças.

O ciclo é: o superadministrador GERA uma licença para uma empresa que ainda não
existe, e quem a recebe ACTIVA-A, criando nesse momento a empresa e o seu
administrador. A licença serve uma vez só.

Três propriedades que este módulo tem de garantir, e que são a razão de existir
em vez de o código viver no router:

1. A chave nunca é guardada. Guarda-se o SHA-256 e um prefixo visível.
2. A activação é atómica. Dois pedidos simultâneos com a mesma chave não podem
   criar duas empresas — o segundo tem de falhar.
3. O prazo é verificado no momento da activação, não por uma tarefa periódica
   que pode não ter corrido.
"""

import hashlib
import re
import secrets
import unicodedata
from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.core.constants import EstadoEmpresa, EstadoLicenca, Perfil
from src.db.base import agora
from src.db.models.tenancy import Empresa, Licenca
from src.db.models.user import User

# Alfabeto sem I, O, 0 e 1: a chave é lida em voz alta e escrita à mão.
_ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_GRUPOS = 3
_POR_GRUPO = 4

#: Dias para activar uma licença depois de gerada.
DIAS_PARA_ACTIVAR = 7


class ErroLicenca(Exception):
    """Regra de licenciamento violada. O router traduz para 4xx."""


# ---------------------------------------------------------------------------
# Chaves
# ---------------------------------------------------------------------------
def gerar_chave() -> str:
    """Chave no formato `SGD-XXXX-XXXX-XXXX`.

    12 caracteres de um alfabeto de 32 dão 60 bits de entropia vindos do
    `secrets`, que usa o CSPRNG do sistema. Não é previsível a partir de outra
    chave nem da altura em que foi gerada — ao contrário de um UUID v1 ou de um
    contador, que é o erro habitual.
    """
    grupos = [
        "".join(secrets.choice(_ALFABETO) for _ in range(_POR_GRUPO))
        for _ in range(_GRUPOS)
    ]
    return "SGD-" + "-".join(grupos)


def hash_chave(chave: str) -> str:
    """SHA-256 da chave normalizada.

    A normalização deixa só letras e dígitos, em maiúsculas: os hífenes são
    apenas apresentação. Assim «SGD-ABCD-EFGH-JKLM», «sgd abcd efgh jklm» e
    «SGDABCDEFGHJKLM» dão o mesmo hash — quem recebe a chave por e-mail copia-a
    com o separador que lhe calhar, e recusá-la por causa disso seria um pedido
    de suporte sem motivo.
    """
    limpo = re.sub(r"[^A-Za-z0-9]", "", chave or "").upper()
    return hashlib.sha256(limpo.encode("ascii", "ignore")).hexdigest()


def prefixo_de(chave: str) -> str:
    """Parte visível da chave («SGD-A3F2»), para a identificar numa lista."""
    return (chave or "")[:8]


# ---------------------------------------------------------------------------
# Código da empresa
# ---------------------------------------------------------------------------
#: Formas jurídicas e ligações que não distinguem uma empresa de outra. Se
#: contassem, metade das empresas do país teria código a começar por «L».
_SEM_VALOR = {
    "de", "da", "do", "das", "dos", "e", "em",
    "lda", "ldª", "sa", "sarl", "ei", "eirl", "sq", "unipessoal", "sociedade",
}


def _iniciais(nome: str) -> str:
    """Iniciais do nome, sem acentos e sem as palavras que não distinguem nada.

    «Banco Empresarial, S.A.» → «BE», e não «BES»: as formas jurídicas escrevem-se
    tanto «SA» como «S.A.», e a segunda parte-se em duas letras soltas. Por isso
    as palavras de UMA letra são descartadas — nenhum nome de empresa tem uma
    inicial útil numa palavra de uma letra só, mas «S.A.», «L.da» e «S.A.R.L.»
    produzem várias.
    """
    sem_acentos = unicodedata.normalize("NFKD", nome or "")
    limpo = "".join(c for c in sem_acentos if not unicodedata.combining(c))
    palavras = [
        p
        for p in re.findall(r"[A-Za-z]+", limpo)
        if len(p) > 1 and p.lower() not in _SEM_VALOR
    ]
    iniciais = "".join(p[0].upper() for p in palavras[:3])
    return iniciais or "EMP"


def gerar_codigo_empresa(db: Session, nome: str) -> str:
    """Código único da empresa: iniciais + sequência («BE001»).

    A sequência é por prefixo, não global — «BE001» e «AT001» coexistem. O
    valor é confirmado contra a base porque o código é único em toda a
    plataforma, e a unicidade real é garantida pela restrição da coluna: isto
    escolhe um candidato, não substitui a restrição.
    """
    base = _iniciais(nome)
    usados = set(
        db.scalars(select(Empresa.codigo).where(Empresa.codigo.like(f"{base}%"))).all()
    )
    for n in range(1, 1000):
        candidato = f"{base}{n:03d}"
        if candidato not in usados:
            return candidato
    # Prefixo esgotado (mil empresas com as mesmas iniciais): sufixo aleatório.
    while True:
        candidato = base + "".join(secrets.choice(_ALFABETO) for _ in range(4))
        if candidato not in usados:
            return candidato


# ---------------------------------------------------------------------------
# Geração
# ---------------------------------------------------------------------------
def gerar_licenca(
    db: Session,
    *,
    nif: str,
    nome_empresa: str,
    titular: str,
    plano: str,
    duracao_meses: int | None = 12,
    modulos_incluidos: list[str] | None = None,
    limite_utilizadores: int | None = None,
    limite_tokens_mes: int | None = None,
    limite_custo_mes=None,
    notas: str | None = None,
    criada_por_id: UUID | None = None,
) -> tuple[Licenca, str]:
    """Cria uma licença por activar e devolve-a com a chave EM CLARO.

    A chave em claro é devolvida uma única vez, aqui. Não volta a existir em
    lado nenhum — nem na base, nem nos registos. Se se perder, gera-se outra.
    """
    nif = (nif or "").strip()
    if not nif:
        raise ErroLicenca("Indica o NIF da empresa.")
    if not (nome_empresa or "").strip():
        raise ErroLicenca("Indica o nome da empresa.")

    # Uma empresa já activa não precisa de outra licença por activar.
    if db.scalar(select(Empresa.id).where(Empresa.nif == nif)) is not None:
        raise ErroLicenca(
            f"Já existe uma empresa registada com o NIF {nif}. "
            "Para alterar o plano, edita a licença dessa empresa."
        )

    chave = gerar_chave()
    lic = Licenca(
        chave_hash=hash_chave(chave),
        chave_prefixo=prefixo_de(chave),
        nif_previsto=nif,
        nome_previsto=nome_empresa.strip(),
        titular=(titular or nome_empresa).strip(),
        plano=(plano or "Base").strip(),
        duracao_meses=duracao_meses,
        expira_activacao=agora() + timedelta(days=DIAS_PARA_ACTIVAR),
        estado=EstadoLicenca.PENDENTE,
        modulos_incluidos=modulos_incluidos or [],
        limite_utilizadores=limite_utilizadores,
        limite_tokens_mes=limite_tokens_mes,
        limite_custo_mes=limite_custo_mes,
        notas=notas,
        criada_por_id=criada_por_id,
    )
    db.add(lic)
    db.flush()
    return lic, chave


def caducar_pendentes(db: Session) -> int:
    """Marca como expiradas as licenças que passaram do prazo de activação.

    É uma limpeza de arrumação, para as listagens dizerem a verdade. A
    SEGURANÇA não depende dela: `activar` verifica o prazo de cada vez, porque
    uma licença cuja validade dependesse de uma tarefa periódica ter corrido
    continuaria a servir enquanto a tarefa falhasse.
    """
    pendentes = db.scalars(
        select(Licenca).where(
            Licenca.estado == EstadoLicenca.PENDENTE,
            Licenca.expira_activacao < agora(),
        )
    ).all()
    for lic in pendentes:
        lic.estado = EstadoLicenca.EXPIRADA
    return len(pendentes)


# ---------------------------------------------------------------------------
# Activação
# ---------------------------------------------------------------------------
def activar(
    db: Session,
    *,
    chave: str,
    nif: str,
    nome_empresa: str,
    admin_nome: str,
    admin_email: str,
    admin_password_hash: str,
    telefone: str | None = None,
) -> dict:
    """Activa uma licença: cria a empresa e o seu administrador.

    A leitura da licença é feita com `FOR UPDATE`, o que segura a linha até ao
    fim da transacção. Sem isso, dois pedidos simultâneos com a mesma chave
    liam ambos «pendente», passavam ambos as verificações e criavam duas
    empresas — e a licença de uso único tinha servido duas vezes. Com o
    bloqueio, o segundo espera e encontra-a já activada.

    Devolve os dados criados; NÃO faz commit — quem chama decide.
    """
    lic = db.scalar(
        select(Licenca).where(Licenca.chave_hash == hash_chave(chave)).with_for_update()
    )
    # Mensagem igual para chave inexistente e chave errada: dizer «esta chave
    # não existe» confirmaria, por exclusão, quais existem.
    if lic is None:
        raise ErroLicenca("Chave de licença inválida ou já utilizada.")

    if lic.empresa_id is not None or lic.activada_em is not None:
        raise ErroLicenca("Esta licença já foi activada.")
    if lic.estado not in (EstadoLicenca.PENDENTE,):
        raise ErroLicenca(f"Esta licença está {lic.estado} e não pode ser activada.")
    if lic.expira_activacao < agora():
        lic.estado = EstadoLicenca.EXPIRADA
        raise ErroLicenca(
            "O prazo de activação desta licença terminou. "
            "Peça uma licença nova ao administrador da plataforma."
        )

    nif = (nif or "").strip()
    if nif != lic.nif_previsto:
        raise ErroLicenca(
            "O NIF não corresponde ao da empresa para a qual esta licença foi "
            "emitida."
        )

    email = (admin_email or "").strip().lower()
    if db.scalar(select(User.id).where(func.lower(User.email) == email)) is not None:
        raise ErroLicenca("Já existe uma conta com este e-mail.")

    nome = (nome_empresa or lic.nome_previsto).strip()
    empresa = Empresa(
        nome=nome,
        nif=nif,
        codigo=gerar_codigo_empresa(db, nome),
        telefone=telefone,
        email=email,
        estado=EstadoEmpresa.ACTIVA,
    )
    db.add(empresa)
    try:
        db.flush()
    except IntegrityError as e:
        db.rollback()
        raise ErroLicenca(
            "Já existe uma empresa com este NIF ou código. Se acabou de "
            "activar, verifique se já consegue entrar."
        ) from e

    admin = User(
        empresa_id=empresa.id,
        nome=(admin_nome or "").strip(),
        email=email,
        password_hash=admin_password_hash,
        perfil=Perfil.ADMIN,
        ativo=True,
        aprovado=True,
    )
    db.add(admin)

    lic.empresa_id = empresa.id
    lic.activada_em = agora()
    lic.estado = EstadoLicenca.ACTIVA
    if lic.duracao_meses:
        # A validade conta a partir da activação, não da geração: uma licença
        # gerada em Janeiro e activada em Março dá o período completo.
        lic.validade = _somar_meses(date.today(), lic.duracao_meses)

    db.flush()
    return {
        "empresa_id": empresa.id,
        "empresa_nome": empresa.nome,
        "codigo_empresa": empresa.codigo,
        "admin_id": admin.id,
        "plano": lic.plano,
        "validade": lic.validade,
    }


def _somar_meses(inicio: date, meses: int) -> date:
    """Soma meses a uma data sem depender de bibliotecas externas.

    O dia é limitado ao último do mês de destino: 31 de Janeiro mais um mês dá
    28 (ou 29) de Fevereiro, e não uma data que não existe.
    """
    total = inicio.month - 1 + meses
    ano = inicio.year + total // 12
    mes = total % 12 + 1
    dias_no_mes = [31, 29 if _bissexto(ano) else 28, 31, 30, 31, 30,
                   31, 31, 30, 31, 30, 31][mes - 1]
    return date(ano, mes, min(inicio.day, dias_no_mes))


def _bissexto(ano: int) -> bool:
    return ano % 4 == 0 and (ano % 100 != 0 or ano % 400 == 0)


def gerar_password_temporaria(grupos: int = 4) -> str:
    """Palavra-passe forte, gerada pelo servidor e legível ao telefone.

    Serve dois casos: devolver o acesso a quem o perdeu, e criar uma conta de
    administração da plataforma. Nos dois, quem executa a operação vai ter de
    a transmitir a outra pessoa — muitas vezes a ler em voz alta.

    Por isso o alfabeto não tem `0/O` nem `1/I/l`, que se confundem a ler e a
    ouvir, e os grupos vão separados por hífen. Quatro grupos de quatro dão
    cerca de 80 bits: não é para ser decorada, é para ser mudada.
    """
    alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    partes = [
        "".join(secrets.choice(alfabeto) for _ in range(4)) for _ in range(grupos)
    ]
    return "-".join(partes)
