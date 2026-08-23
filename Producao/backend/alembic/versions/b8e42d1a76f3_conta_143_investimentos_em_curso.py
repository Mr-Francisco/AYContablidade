"""A conta 143 — investimentos financeiros em curso

O imobilizado em curso agrupa por tipo: `141` corpóreo, `142` incorpóreo,
`143` investimento financeiro. As duas primeiras existem no plano do
Primavera; a terceira não existia, e sem ela um investimento financeiro em
curso não tinha onde acumular.

FOI VERIFICADO ANTES, não suposto: a classe `14 Imobilizações em curso` trazia
`141`, `142`, `147`, `1471`, `148`, `1481` e `149` — e mais nada. Nas três
empresas.

O NOME NÃO É «OBRA EM CURSO». As irmãs chamam-se ambas assim, o que não
distingue uma da outra; esta nasce com o nome do que agrupa, para quem abrir o
plano perceber ao que serve sem ter de ir à parametrização.

SÓ ONDE FAZ SENTIDO. Cria-se apenas nas empresas que já tenham a classe `14` —
uma empresa com um plano diferente, ou ainda sem plano nenhum, não recebe uma
conta solta no meio de nada. E nunca por cima: se a `143` já lá estiver, seja
com que nome for, fica como está.

Revision ID: b8e42d1a76f3
Revises: a3d17f92c4b8
"""

import sqlalchemy as sa
from alembic import op

revision = "b8e42d1a76f3"
down_revision = "a3d17f92c4b8"
branch_labels = None
depends_on = None

CODIGO = "143"
NOME = "Investimentos financeiros em curso"


def upgrade() -> None:
    # `natureza` D como as irmãs: é a que `natureza_conta()` deriva para a
    # classe 1, e escrevê-la aqui evita importar código da aplicação para
    # dentro de uma migração — que é o que faz uma migração antiga deixar de
    # correr quando esse código muda.
    op.execute(
        sa.text(
            """
            INSERT INTO contas (
                id, empresa_id, codigo, nome, tipo, natureza, ativa,
                trat_pendentes, integra_equipamentos, integra_ativos,
                custo_fixo, criado_em
            )
            SELECT
                gen_random_uuid(), e.id, :codigo, :nome, 'M', 'D', true,
                false, false, false, 0, now()
            FROM empresas e
            WHERE EXISTS (
                SELECT 1 FROM contas c
                WHERE c.empresa_id = e.id AND c.codigo = '14'
            )
            AND NOT EXISTS (
                SELECT 1 FROM contas c
                WHERE c.empresa_id = e.id AND c.codigo = :codigo
            )
            """
        ).bindparams(codigo=CODIGO, nome=NOME)
    )


def downgrade() -> None:
    # Só apaga a que esta migração criou — reconhece-se pelo nome. Uma `143`
    # com outro nome foi criada por alguém e não é nossa para apagar. E nunca
    # apaga uma conta com movimentos: o plano recusa, e ainda bem.
    op.execute(
        sa.text(
            """
            DELETE FROM contas c
            WHERE c.codigo = :codigo AND c.nome = :nome
            AND NOT EXISTS (
                SELECT 1 FROM lancamento_linhas l WHERE l.conta_id = c.id
            )
            """
        ).bindparams(codigo=CODIGO, nome=NOME)
    )
