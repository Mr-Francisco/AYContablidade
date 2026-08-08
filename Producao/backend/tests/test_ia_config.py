"""Tecto de tokens de resposta, definido pelo superadministrador.

A resposta é a parte cara — custa cerca de quatro vezes a entrada — e é a única
que se consegue limitar antes de acontecer: quando se chama a API, o contexto
já está construído.

O que aqui se fixa é sobretudo ONDE o corte acontece. Pedir brevidade nas
instruções é um pedido que o modelo pode não cumprir; `max_tokens` é um limite
imposto pela API.
"""

import pytest

from src.services.ia import config as cfg


class SessaoFalsa:
    def __init__(self, valor=None):
        self.valor = valor
        self.adicionados = []
        self.flushes = 0

    def scalar(self, stmt):
        from src.db.models.tenancy import ConfigPlataforma

        if self.valor is None:
            return None
        texto = str(stmt).lower()
        # `select(ConfigPlataforma)` devolve a linha; `select(...max_tokens)`
        # devolve só o inteiro.
        if "max_tokens_saida" in texto and "config_plataforma.id" not in texto:
            return self.valor
        return ConfigPlataforma(max_tokens_saida=self.valor)

    def add(self, obj):
        self.adicionados.append(obj)

    def flush(self):
        self.flushes += 1


# ---------------------------------------------------------------------------
# Leitura
# ---------------------------------------------------------------------------
def test_le_o_valor_configurado():
    assert cfg.max_tokens_saida(SessaoFalsa(1500)) == 1500


def test_sem_linha_usa_o_de_omissao():
    """REGRESSÃO: devolver `None` seria lido pelo chamador como «sem limite»,
    que é o contrário do que esta definição existe para fazer."""
    assert cfg.max_tokens_saida(SessaoFalsa(None)) == cfg.POR_OMISSAO
    assert cfg.POR_OMISSAO > 0


def test_obter_cria_a_linha_se_faltar():
    db = SessaoFalsa(None)
    linha = cfg.obter(db)
    assert linha.max_tokens_saida == cfg.POR_OMISSAO
    assert db.adicionados == [linha]


# ---------------------------------------------------------------------------
# Limites
# ---------------------------------------------------------------------------
def test_um_valor_dentro_dos_limites_passa():
    assert cfg.validar(1000) == 1000
    assert cfg.validar(cfg.MIN_TOKENS_SAIDA) == cfg.MIN_TOKENS_SAIDA
    assert cfg.validar(cfg.MAX_TOKENS_SAIDA) == cfg.MAX_TOKENS_SAIDA


def test_abaixo_do_minimo_e_recusado():
    """Uma resposta cortada aos 50 tokens não é barata: é inútil, paga-se na
    mesma, e a pessoa repete a pergunta gastando o dobro."""
    with pytest.raises(ValueError):
        cfg.validar(cfg.MIN_TOKENS_SAIDA - 1)


def test_acima_do_maximo_e_recusado():
    """Sem tecto, um valor enorme escrito por engano tornava a configuração num
    nome bonito para «sem limite»."""
    with pytest.raises(ValueError):
        cfg.validar(cfg.MAX_TOKENS_SAIDA + 1)


# ---------------------------------------------------------------------------
# Onde o corte acontece
# ---------------------------------------------------------------------------
def test_o_corte_e_imposto_pela_api_e_nao_so_pedido():
    """REGRESSÃO: o controlo tem de ser `max_tokens` no pedido. As instruções
    também mencionam o limite — para a resposta acabar bem em vez de ser
    cortada a meio — mas isso é um pedido, não um limite."""
    import inspect

    from src.services.ia import qa

    fonte = inspect.getsource(qa._chamar_openai)
    assert '"max_tokens": max_saida' in fonte
    # E o modelo é informado, para escrever de forma a caber.
    assert "max_saida" in fonte and "limite de" in fonte


def test_o_tecto_e_lido_a_cada_pergunta():
    """REGRESSÃO: guardado em memória, alterar o limite não teria efeito até
    reiniciar — e a definição promete valer a partir da pergunta seguinte."""
    import inspect

    from src.services.ia import qa

    fonte = inspect.getsource(qa.perguntar)
    assert "config_ia.max_tokens_saida(db)" in fonte


def test_a_resposta_diz_o_tecto_aplicado():
    """Sem isto, uma resposta curta parecia um defeito em vez de um limite."""
    import inspect

    from src.services.ia import qa

    assert '"max_saida": max_saida' in inspect.getsource(qa.perguntar)
