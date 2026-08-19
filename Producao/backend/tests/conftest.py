"""Isolamento entre testes do que é global ao PROCESSO.

O `Limiter` do slowapi é um objecto único criado no arranque (`src/api/limites.py`)
e guarda as contagens em memória. Nada disso pertence a um teste: as contagens
que um deixa ficam para o seguinte, e o `enabled` é uma variável partilhada que
vários ficheiros ligam e desligam.

Isto não é teoria. O limite de `/api/auth/login` é de cinco por minuto, e os
testes do segundo factor gastam dois pedidos por tentativa: correndo com as
contagens de outro ficheiro já lá dentro, o primeiro passo passa a responder
«demasiadas tentativas» a meio do ciclo, as falhas deixam de ser contadas e o
teste do bloqueio da conta falha a dizer que o contador está em dois — sem que
nada tenha mudado no código.

Por ficheiro isolado nunca acontecia; na suite completa acontecia às vezes, o
que é a pior forma de acontecer.
"""

import pytest


@pytest.fixture(autouse=True)
def limitador_isolado():
    """Cada teste começa com as contagens de pedidos vazias.

    E devolve o `enabled` como o encontrou — quem o desliga não tem como saber
    se estava ligado, e deixá-lo num valor fixo é o mesmo defeito ao contrário.
    """
    from src.api.limites import limiter

    como_estava = limiter.enabled
    limiter.reset()
    yield
    limiter.reset()
    limiter.enabled = como_estava
