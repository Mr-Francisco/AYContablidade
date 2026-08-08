"""A fronteira de privacidade do módulo de IA.

`docs/AI_INTEGRATION.md` é inequívoco: nenhum dado pessoal pode ser enviado
para a API externa. Estes testes travam as duas metades dessa garantia —
pseudonimizar nomes e remover identificadores — e, em particular, o caso que
escapou na primeira versão.
"""

from src.services.ia.redaccao import (
    Pseudonimizador,
    limpar_texto,
    verificar_sem_dados_pessoais,
)


def _com_entidades(*nomes: str) -> Pseudonimizador:
    ps = Pseudonimizador()
    ps.registar_entidades(nomes)
    return ps


def test_pseudonimo_e_estavel_dentro_do_pedido():
    """O mesmo nome tem de dar sempre o mesmo pseudónimo: é isso que permite à
    IA perceber que duas linhas falam da mesma entidade."""
    ps = Pseudonimizador()
    a = ps.pseudonimo("AS Imagem, Lda.", "Cliente")
    b = ps.pseudonimo("AS Imagem, Lda.", "Cliente")
    c = ps.pseudonimo("Master Tech", "Cliente")
    assert a == b == "Cliente 1"
    assert c == "Cliente 2"
    assert ps.total == 2


def test_nome_de_conta_de_terceiro_e_pseudonimizado():
    """REGRESSÃO — o nome do cliente escapava pelo PLANO DE CONTAS.

    As subcontas de terceiros chamam-se pelo nome da entidade
    («31121001 — AS Imagem, Lda.»). Os campos `entidade` já iam
    pseudonimizados, mas o `nome` da conta ia com o nome real, e a verificação
    final não apanhava: um nome de empresa não tem forma de NIF nem de IBAN.
    """
    ps = _com_entidades("AS Imagem, Lda.", "Master Tech")
    assert ps.pseudonimo_se_entidade("AS Imagem, Lda.", "Entidade") == "Entidade 1"
    assert ps.pseudonimo_se_entidade("Master Tech", "Entidade") == "Entidade 2"


def test_contas_do_plano_passam_intactas():
    """Se tudo fosse pseudonimizado, a resposta deixaria de fazer sentido:
    «Entidade 4 aumentou face a Entidade 7» em vez de «as Vendas aumentaram
    face às Compras»."""
    ps = _com_entidades("AS Imagem, Lda.")
    for conta in (
        "Vendas",
        "Banco",
        "Capital Inicial",
        "Mercado nacional",
        "IVA - Ded. Exist. - M. Int. - 14%",
    ):
        assert ps.pseudonimo_se_entidade(conta, "Entidade") == conta
    assert ps.total == 0


def test_caixa_diferente_da_o_mesmo_pseudonimo():
    """A conta e a ficha podem trazer o nome escrito de maneiras diferentes.

    Sem canonicalizar, a mesma entidade ganhava dois pseudónimos — e o
    `repor()` devolvia à resposta a grafia errada.
    """
    ps = _com_entidades("AS Imagem, Lda.")
    a = ps.pseudonimo_se_entidade("AS Imagem, Lda.", "Entidade")
    b = ps.pseudonimo_se_entidade("as imagem, lda.", "Entidade")
    assert a == b
    assert ps.total == 1
    assert ps.repor(f"O {a} tem saldo.") == "O AS Imagem, Lda. tem saldo."


def test_repor_trata_primeiro_os_pseudonimos_mais_longos():
    """Sem isso, «Cliente 1» consumiria o prefixo de «Cliente 12» e a resposta
    passava a dizer «<nome do cliente 1>2»."""
    ps = Pseudonimizador()
    for i in range(1, 13):
        ps.pseudonimo(f"Empresa {i:02d}", "Cliente")
    texto = "O Cliente 12 deve mais do que o Cliente 1."
    assert ps.repor(texto) == "O Empresa 12 deve mais do que o Empresa 01."


def test_identificadores_sao_removidos_e_nao_pseudonimizados():
    """Um NIF não serve para raciocinar — é exactamente o que não pode sair."""
    texto = (
        "Factura ao NIF 5417004856, IBAN AO06000600000000000000000, "
        "email joao@empresa.ao, telefone 923456789"
    )
    limpo = limpar_texto(texto)
    for proibido in ("5417004856", "joao@empresa.ao", "923456789"):
        assert proibido not in limpo
    assert "[NIF]" in limpo and "[EMAIL]" in limpo and "[TELEFONE]" in limpo


def test_verificacao_final_percorre_a_estrutura_toda():
    """A última verificação é deliberadamente redundante: não deve depender de
    nenhuma camada anterior ter corrido bem."""
    assert verificar_sem_dados_pessoais({"a": {"b": ["tudo bem"]}}) == []
    achados = verificar_sem_dados_pessoais(
        {"dados": {"linhas": [{"descricao": "pagamento a 5417004856"}]}}
    )
    assert len(achados) == 1 and "[NIF]" in achados[0]
    # Também nas CHAVES, não só nos valores.
    assert verificar_sem_dados_pessoais({"joao@empresa.ao": 1})


def test_nome_vazio_nao_gasta_pseudonimo():
    ps = _com_entidades("Alguém")
    assert ps.pseudonimo(None) == ""
    assert ps.pseudonimo("   ") == ""
    assert ps.pseudonimo_se_entidade(None) == ""
    assert ps.total == 0
