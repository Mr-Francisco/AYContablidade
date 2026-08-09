"""Cria uma empresa de demonstração com dados, para desenvolvimento.

    cd Producao/backend
    .venv/Scripts/python.exe scripts/criar_demo.py

Idempotente: se a empresa já existir, não faz nada. Para recomeçar do zero,
correr com `--recriar`.
"""

import sys
from datetime import date
from decimal import Decimal as D
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from src.auth.security import hash_password  # noqa: E402
from src.core.constants import EstadoEmpresa, EstadoLicenca, Perfil  # noqa: E402
from src.db.base import SessionLocal, agora  # noqa: E402
from src.db.models.comercial import Venda, VendaLinha, Vendedor  # noqa: E402
from src.db.models.imobilizados import Ativo  # noqa: E402
from src.db.models.logistica import Armazem, Artigo  # noqa: E402
from src.db.models.rh import Colaborador  # noqa: E402
from src.db.models.tenancy import Empresa, Exercicio, Licenca  # noqa: E402
from src.db.models.terceiros import Terceiro  # noqa: E402
from src.db.models.user import User  # noqa: E402
from src.services import comercial as com_svc  # noqa: E402
from src.services import licenciamento as lic_svc  # noqa: E402
from src.services import logistica as log_svc  # noqa: E402
from src.services.contabilidade import postar  # noqa: E402
from src.services.empresa import remover_empresa  # noqa: E402
from src.services.seed import seed_empresa  # noqa: E402

NIF = "5000000001"
ADMIN = "admin@demo.ao"
PASSWORD = "demo12345"
SUPER = "super@plataforma.ao"


def _recusar_em_producao() -> None:
    """Este script cria contas com palavras-passe conhecidas.

    `super@plataforma.ao` / `demo12345` numa instalação real é a porta aberta
    mais larga que se pode deixar. Não basta escrever «não correr em produção»
    num documento: basta um `python scripts/criar_demo.py` distraído na consola
    errada. Por isso o script recusa-se.
    """
    from src.core.config import get_settings

    if get_settings().AMBIENTE == "producao":
        sys.exit(
            "RECUSADO: este script cria contas de demonstração com "
            "palavras-passe conhecidas e o AMBIENTE é «producao».\n"
            "Para criar a primeira conta real use:\n"
            "    python scripts/criar_superadmin.py"
        )


def main(recriar: bool = False) -> None:
    _recusar_em_producao()
    s = SessionLocal()
    try:
        existente = s.scalar(select(Empresa).where(Empresa.nif == NIF))
        if existente and not recriar:
            print(f"A empresa demo já existe ({existente.nome}). Nada a fazer.")
            print(f"  Entrar com: {ADMIN} / {PASSWORD}")
            return
        if existente:
            print("A remover a empresa demo anterior…")
            remover_empresa(s, existente.id)
            s.commit()

        emp = Empresa(
            nome="Demo Contabilidade, Lda.", nif=NIF, codigo="DC001",
            morada="Rua Principal, Luanda",
            localizacao="Luanda — Angola", telefone="+244 900 000 000",
            email="geral@demo.ao", moeda="Kz", regime="geral",
            forma_juridica="lda", estado=EstadoEmpresa.ACTIVA,
        )
        s.add(emp)
        s.flush()

        # Licença já activada. A chave em claro («SGD-DEMO-2026-0001») fica só
        # aqui, no seed de desenvolvimento: a base guarda o hash, como todas.
        s.add(Licenca(
            empresa_id=emp.id,
            chave_hash=lic_svc.hash_chave("SGD-DEMO-2026-0001"),
            chave_prefixo="SGD-DEMO",
            nif_previsto=NIF, nome_previsto=emp.nome, titular=emp.nome,
            plano="Enterprise", duracao_meses=24,
            expira_activacao=agora(), activada_em=agora(),
            validade=date(2027, 12, 31),
            estado=EstadoLicenca.ACTIVA, modulos_incluidos=[],
            limite_utilizadores=None,
            # Limites de IA generosos, para o painel de consumo ter escala.
            limite_tokens_mes=2_000_000, limite_custo_mes=D("50"),
        ))

        print("A criar o plano de contas (1619 contas do Primavera)…")
        seed_empresa(s, emp, ano=2026)
        ex = s.scalar(select(Exercicio).where(Exercicio.empresa_id == emp.id))

        # Superadmin da plataforma (sem empresa) — gere licenças.
        if not s.scalar(select(User.id).where(User.email == SUPER)):
            s.add(User(
                empresa_id=None, nome="Super Administrador", email=SUPER,
                password_hash=hash_password(PASSWORD), perfil=Perfil.SUPERADMIN,
                ativo=True, aprovado=True, permissoes_extra=[], permissoes_accao={},
            ))

        for nome, email, perfil in [
            ("Ana Gerente", ADMIN, Perfil.ADMIN),
            ("Carlos Contabilista", "contab@demo.ao", Perfil.CONTABILISTA),
            ("Sofia Comercial", "comercial@demo.ao", Perfil.COMERCIAL),
            ("Rui Logística", "logistica@demo.ao", Perfil.LOGISTICA),
            ("Teresa RH", "rh@demo.ao", Perfil.RH),
            ("Paulo Consulta", "consulta@demo.ao", Perfil.CONSULTA),
        ]:
            s.add(User(
                empresa_id=emp.id, nome=nome, email=email,
                password_hash=hash_password(PASSWORD), perfil=perfil,
                ativo=True, aprovado=True, aprovado_em=agora(),
                permissoes_extra=[], permissoes_accao={},
            ))
        s.flush()

        print("A criar terceiros, artigos e activos…")
        cli = Terceiro(empresa_id=emp.id, tipo="cliente", numero="001",
                       nome="AS Imagem, Lda.", nif="5417000000",
                       localidade="Luanda", telefone="923 000 111", estado="activo")
        cli2 = Terceiro(empresa_id=emp.id, tipo="cliente", numero="002",
                        nome="Master Tech", nif="5417000001",
                        localidade="Luanda", estado="activo")
        forn = Terceiro(empresa_id=emp.id, tipo="fornecedor", numero="001",
                        nome="Distribuidora Central, Lda.", nif="5410000001",
                        localidade="Luanda", estado="activo")
        vend = Vendedor(empresa_id=emp.id, nome="Comercial 1",
                        tipo_comissao="percentagem", comissao_perc=D("3"),
                        estado="activo")
        arm = Armazem(empresa_id=emp.id, codigo="A1", nome="Armazém Central",
                      localizacao="Luanda")
        arm2 = Armazem(empresa_id=emp.id, codigo="A2", nome="Armazém Loja",
                       localizacao="Luanda")
        art1 = Artigo(empresa_id=emp.id, codigo="0001", descricao="Resma de Papel A4",
                      familia="Consumíveis", unidade="Cx", tipo_artigo="Mercadoria",
                      preco_venda=D("8500"), preco_compra=D("6000"),
                      taxa_iva=D("14"), stock_min=D("10"), estado="activo")
        art2 = Artigo(empresa_id=emp.id, codigo="0002", descricao="Toner de Impressora",
                      familia="Consumíveis", unidade="Un", tipo_artigo="Mercadoria",
                      preco_venda=D("45000"), preco_compra=D("32000"),
                      taxa_iva=D("14"), stock_min=D("5"), estado="activo")
        s.add_all([cli, cli2, forn, vend, arm, arm2, art1, art2])

        s.add_all([
            Colaborador(empresa_id=emp.id, numero="001", nome="António Manuel",
                        categoria="Administrativo", salario_base=D("250000"),
                        subsidios=D("70000"), data_admissao=date(2024, 3, 1),
                        nif="004512345LA012", num_ss="12345678901",
                        provincia="Luanda", estado="activo"),
            Colaborador(empresa_id=emp.id, numero="002", nome="Maria João",
                        categoria="Técnico", salario_base=D("180000"),
                        subsidios=D("50000"), data_admissao=date(2024, 6, 15),
                        nif="004598765LB021", num_ss="10987654321",
                        provincia="Luanda", estado="activo"),
        ])
        s.add(Ativo(empresa_id=emp.id, codigo="IM-0001", designacao="Viatura ligeira",
                    conta_imob="1141", conta_amort_acum="1814",
                    conta_custo_amort="7314", data_aquisicao=date(2026, 1, 10),
                    valor_aquisicao=D("8500000"), taxa=D("25"), metodo="quotas",
                    amort_acumulada=D("0"), estado="activo",
                    fornecedor="Fornecedor Nacional"))
        s.flush()

        print("A lançar movimentos…")
        P = lambda **k: postar(s, empresa_id=emp.id, exercicio_id=ex.id, **k)  # noqa: E731
        P(data=date(2026, 1, 2), diario_codigo="10", documento_codigo="101", mes="00",
          descricao="Abertura — realização de capital", documento_ref="AB-001",
          linhas=[{"conta_codigo": "43101", "debito": D("20000000"),
                   "descricao": "Depósito inicial", "fluxo_codigo": "3100"},
                  {"conta_codigo": "511", "credito": D("20000000"),
                   "descricao": "Capital subscrito"}])
        P(data=date(2026, 1, 10), diario_codigo="37", documento_codigo="371", mes="01",
          descricao="Compra de viatura", documento_ref="VFE 120",
          linhas=[{"conta_codigo": "1141", "debito": D("8500000")},
                  {"conta_codigo": "43101", "credito": D("8500000"),
                   "fluxo_codigo": "2200"}])

        # Entradas de stock, para as existências terem valor.
        for artigo, qtd, custo in [(art1, D("120"), D("6000")), (art2, D("40"), D("32000"))]:
            log_svc.registar_movimento(
                s, empresa_id=emp.id, tipo="entrada", artigo_id=artigo.id,
                armazem_id=arm.id, qtd=qtd, custo_unit=custo, iva_perc=D("14"),
                data=date(2026, 2, 5), entidade=forn.nome,
                descricao="Compra inicial", exercicio_id=ex.id,
            )

        # Facturas emitidas pelo caminho real, para gerarem CMVMC e conta corrente.
        for mes_num, cliente, artigo, qtd in [
            (3, cli, art1, D("25")), (4, cli2, art2, D("6")), (5, cli, art1, D("40")),
        ]:
            v = Venda(
                empresa_id=emp.id, data=date(2026, mes_num, 12), tipo_doc="FT",
                tipo="mercadorias", cliente_id=cliente.id, cliente_nome=cliente.nome,
                vendedor_id=vend.id, iva_perc=D("14"), estado="rascunho",
                linhas=[VendaLinha(ordem=0, artigo_id=artigo.id,
                                   descricao=artigo.descricao, unidade=artigo.unidade,
                                   qtd=qtd, preco=artigo.preco_venda,
                                   total=qtd * artigo.preco_venda)],
            )
            t = com_svc.calc_totais(
                [{"qtd": qtd, "preco": artigo.preco_venda}], D("14")
            )
            v.subtotal, v.iva, v.total = t["subtotal"], t["iva"], t["total"]
            s.add(v)
            s.flush()
            com_svc.emitir(s, empresa_id=emp.id, venda=v, exercicio_id=ex.id)

        s.commit()
        print()
        print("=" * 58)
        print("Empresa de demonstração criada.")
        print(f"  Administrador : {ADMIN} / {PASSWORD}")
        print(f"  Contabilista  : contab@demo.ao / {PASSWORD}")
        print(f"  Superadmin    : {SUPER} / {PASSWORD}")
        print("=" * 58)
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


if __name__ == "__main__":
    main(recriar="--recriar" in sys.argv)
