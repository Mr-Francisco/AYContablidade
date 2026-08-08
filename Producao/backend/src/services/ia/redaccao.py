"""Redacção de dados pessoais antes de qualquer envio para a IA externa.

Esta é a fronteira de segurança do módulo. `docs/AI_INTEGRATION.md` é
inequívoco: nenhum dado pessoal pode ser enviado para a API externa.

A abordagem NÃO é apagar os nomes — isso tornaria as respostas inúteis ("uma
entidade deve a outra entidade"). É substituí-los por pseudónimos estáveis
(«Cliente A», «Colaborador 1») antes de sair, e desfazer a substituição na
resposta antes de a mostrar ao utilizador. A IA raciocina sobre relações sem
nunca saber de quem se trata.

Identificadores que não servem para raciocinar — NIF, IBAN, e-mail, telefone,
número de segurança social, morada — não são pseudonimizados: são removidos.
Não acrescentam nada à análise e são exactamente o que não pode sair.
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass, field

# Padrões de identificadores a remover por completo. Aplicados como rede de
# segurança sobre QUALQUER texto que vá para a API, mesmo depois de os campos
# estruturados terem sido tratados — descrições livres de lançamentos são
# escritas por pessoas e podem conter um NIF ou um IBAN.
PADROES_PROIBIDOS: tuple[tuple[str, re.Pattern], ...] = (
    ("[IBAN]", re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b")),
    ("[EMAIL]", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")),
    # NIF de Angola: 10 dígitos (colectivo começa por 5) ou 9 dígitos + 2 letras
    # + 3 dígitos (singular, que inclui o nº do BI — dado pessoal directo).
    ("[NIF]", re.compile(r"\b\d{9}[A-Z]{2}\d{3}\b")),
    ("[NIF]", re.compile(r"\b\d{10}\b")),
    ("[TELEFONE]", re.compile(r"(?<!\d)(?:\+244\s?)?9\d{2}[\s.-]?\d{3}[\s.-]?\d{3}(?!\d)")),
    ("[CONTA]", re.compile(r"\bAO\d{2}[\s\d]{15,}\b")),
)


@dataclass
class Pseudonimizador:
    """Atribui e recorda pseudónimos, para poder desfazê-los na resposta.

    O mapa vive apenas na memória do pedido. Não é gravado nem enviado — se o
    fosse, bastaria juntá-lo ao que a IA recebeu para desfazer a protecção toda.
    """

    _por_real: dict[str, str] = field(default_factory=dict)
    _por_pseudo: dict[str, str] = field(default_factory=dict)
    _contadores: dict[str, int] = field(default_factory=dict)
    # Nomes de terceiros e colaboradores: minúsculas → grafia canónica.
    _entidades: dict[str, str] = field(default_factory=dict)

    def pseudonimo(self, nome: str | None, categoria: str = "Entidade") -> str:
        """Devolve o pseudónimo estável de um nome dentro deste pedido."""
        if not nome or not str(nome).strip():
            return ""
        real = str(nome).strip()
        if real in self._por_real:
            return self._por_real[real]

        n = self._contadores.get(categoria, 0) + 1
        self._contadores[categoria] = n
        pseudo = f"{categoria} {n}"
        self._por_real[real] = pseudo
        self._por_pseudo[pseudo] = real
        return pseudo

    def registar_entidades(self, nomes: "Iterable[str | None]") -> None:
        """Ensina ao pseudonimizador que nomes pertencem a entidades reais.

        Serve para `pseudonimo_se_entidade`. Sem isto, o nome de um cliente
        escapava pelo PLANO DE CONTAS: as subcontas de terceiros chamam-se pelo
        nome da entidade («31121001 — AS Imagem, Lda.»), e a lista de contas
        mais movimentadas ia com o nome real enquanto os campos `entidade` já
        iam pseudonimizados. A verificação final não apanhava — um nome de
        empresa não tem forma de NIF nem de IBAN.
        """
        for n in nomes:
            if n and str(n).strip():
                limpo = str(n).strip()
                self._entidades.setdefault(limpo.casefold(), limpo)

    def pseudonimo_se_entidade(
        self, nome: str | None, categoria: str = "Entidade"
    ) -> str:
        """Pseudonimiza só se o nome for de uma entidade registada.

        Aplica-se a campos que TANTO podem trazer um nome de pessoa como um
        termo do plano de contas: «Vendas» e «Bancos» têm de passar intactos,
        senão a resposta deixa de fazer sentido.

        A comparação ignora a caixa, mas o pseudónimo é atribuído à grafia
        CANÓNICA — a que veio da ficha da entidade. Sem isso, o mesmo cliente
        escrito de duas maneiras na conta e na ficha ganhava dois pseudónimos, e
        o `repor()` devolvia à resposta a grafia errada.
        """
        if not nome or not str(nome).strip():
            return nome or ""
        canonico = self._entidades.get(str(nome).strip().casefold())
        if canonico is None:
            return str(nome)
        return self.pseudonimo(canonico, categoria)

    def repor(self, texto: str) -> str:
        """Devolve os nomes reais a um texto vindo da IA.

        Os pseudónimos mais longos são substituídos primeiro: sem isso,
        «Cliente 1» consumiria o prefixo de «Cliente 12».
        """
        if not texto:
            return texto
        for pseudo in sorted(self._por_pseudo, key=len, reverse=True):
            texto = texto.replace(pseudo, self._por_pseudo[pseudo])
        return texto

    @property
    def total(self) -> int:
        return len(self._por_real)


def limpar_texto(texto: str | None) -> str:
    """Remove identificadores de um texto livre."""
    if not texto:
        return ""
    saida = str(texto)
    for substituto, padrao in PADROES_PROIBIDOS:
        saida = padrao.sub(substituto, saida)
    return saida


def verificar_sem_dados_pessoais(payload: object) -> list[str]:
    """Última verificação antes do envio.

    Percorre tudo o que vai sair e devolve os padrões proibidos encontrados.
    Serve de travão: se algo escapou às camadas anteriores, o envio é abortado
    em vez de vazar. É deliberadamente redundante — a segurança aqui não deve
    depender de nenhum passo ter corrido bem.
    """
    achados: list[str] = []

    def percorrer(v: object) -> None:
        if isinstance(v, str):
            for nome, padrao in PADROES_PROIBIDOS:
                if padrao.search(v):
                    achados.append(f"{nome} em «{v[:60]}»")
        elif isinstance(v, dict):
            for chave, valor in v.items():
                percorrer(chave)
                percorrer(valor)
        elif isinstance(v, (list, tuple, set)):
            for item in v:
                percorrer(item)

    percorrer(payload)
    return achados
