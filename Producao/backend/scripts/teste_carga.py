"""Teste de carga e concorrência — números, não opiniões.

Três perguntas, e nenhuma se responde por intuição:

1. **Concorrência na numeração.** Vinte processos a emitir facturas ao mesmo
   tempo na mesma série: aparece algum número repetido? É a pergunta que
   decide se o sistema pode ter mais do que um utilizador.
2. **Volume.** Quanto tempo demora a gerar um SAF-T com milhares de documentos?
3. **Leitura sob carga.** As consultas aguentam a base cheia?

Corre contra a base de desenvolvimento e limpa o que criou.
"""
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal

sys.path.insert(0, r"C:/GitHub/AYContablidade/Producao/backend")

from sqlalchemy import delete, func, select  # noqa: E402

from src.db.base import SessionLocal  # noqa: E402
from src.db.models.comercial import (  # noqa: E402
    SerieDocumento,
    Venda,
    VendaLinha,
)
from src.db.models.tenancy import Empresa  # noqa: E402
from src.services.facturacao import saft  # noqa: E402
from src.services.facturacao import series as svc_series  # noqa: E402

MARCA = "CARGA"
ANO = 2094


def limpar():
    db = SessionLocal()
    ids = list(db.scalars(select(Venda.id).where(Venda.cliente_nome.like(f"{MARCA}%"))))
    for i in range(0, len(ids), 500):
        lote = ids[i : i + 500]
        db.execute(delete(VendaLinha).where(VendaLinha.venda_id.in_(lote)))
        db.execute(delete(Venda).where(Venda.id.in_(lote)))
    db.execute(delete(SerieDocumento).where(SerieDocumento.ano == ANO))
    db.commit()
    db.close()


def empresa_id():
    db = SessionLocal()
    e = db.scalar(select(Empresa.id).where(Empresa.codigo == "DC001"))
    db.close()
    return e


# ---------------------------------------------------------------------------
def concorrencia(emp, n_processos=20, por_processo=10):
    """A pergunta que decide tudo: dois processos podem apanhar o mesmo número?"""

    def emitir_lote(_):
        db = SessionLocal()
        numeros = []
        try:
            for _ in range(por_processo):
                _, _, numero = svc_series.proximo_numero(
                    db, empresa_id=emp, tipo_doc="FT", ano=ANO
                )
                db.commit()
                numeros.append(numero)
        finally:
            db.close()
        return numeros

    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=n_processos) as executor:
        resultados = list(executor.map(emitir_lote, range(n_processos)))
    demorou = time.perf_counter() - t0

    todos = [n for lote in resultados for n in lote]
    unicos = set(todos)
    return {
        "atribuidos": len(todos),
        "unicos": len(unicos),
        "duplicados": len(todos) - len(unicos),
        "segundos": round(demorou, 2),
        "por_segundo": round(len(todos) / demorou, 1),
    }


def volume(emp, quantos=2000):
    """Criar N facturas e medir a geração do SAF-T."""
    db = SessionLocal()
    t0 = time.perf_counter()
    for i in range(quantos):
        v = Venda(
            empresa_id=emp,
            numero=f"FT FT{ANO}S9/{i + 1:05d}",
            tipo_doc="FT",
            tipo="servicos",
            data=date(ANO, 1 + (i % 12), 1 + (i % 28)),
            cliente_nome=f"{MARCA} Cliente {i % 50}",
            iva_perc=Decimal("14"),
            subtotal=Decimal("1000"),
            iva=Decimal("140"),
            total=Decimal("1140"),
            estado="emitida",
            estado_saft="N",
            hash_doc=f"{i:064x}",
            hash_controlo=f"{i:04X}"[:4],
        )
        db.add(v)
        db.flush()
        db.add(
            VendaLinha(
                venda_id=v.id,
                ordem=0,
                descricao="Serviço",
                unidade="UN",
                qtd=Decimal("1"),
                preco=Decimal("1000"),
                total=Decimal("1000"),
                taxa_codigo="NOR",
            )
        )
        if i % 200 == 0:
            db.commit()
    db.commit()
    inserir = time.perf_counter() - t0

    e = db.get(Empresa, emp)
    t0 = time.perf_counter()
    xml = saft.gerar(
        db, empresa=e, de=date(ANO, 1, 1), ate=date(ANO, 12, 31), numero_validacao="0"
    )
    gerar = time.perf_counter() - t0

    t0 = time.perf_counter()
    ok, erros_v = saft.validar(xml)
    validar = time.perf_counter() - t0
    db.close()

    return {
        "facturas": quantos,
        "inserir_s": round(inserir, 2),
        "gerar_s": round(gerar, 2),
        "validar_s": round(validar, 2),
        "mb": round(len(xml) / 1024 / 1024, 2),
        "valido": ok,
        "facturas_por_segundo_na_geracao": round(quantos / gerar),
        "primeiro_erro": (erros_v[0][:150] if erros_v else ""),
    }


def leitura(emp, repeticoes=30):
    """Consultas típicas com a base cheia."""
    db = SessionLocal()
    tempos = []
    for _ in range(repeticoes):
        t0 = time.perf_counter()
        db.execute(
            select(func.count(Venda.id)).where(
                Venda.empresa_id == emp, Venda.estado == "emitida"
            )
        ).scalar()
        db.execute(
            select(Venda)
            .where(Venda.empresa_id == emp)
            .order_by(Venda.data.desc())
            .limit(25)
        ).all()
        tempos.append((time.perf_counter() - t0) * 1000)
    db.close()
    return {
        "consultas": repeticoes,
        "mediana_ms": round(statistics.median(tempos), 1),
        "p95_ms": round(sorted(tempos)[int(len(tempos) * 0.95) - 1], 1),
        "pior_ms": round(max(tempos), 1),
    }


if __name__ == "__main__":
    print("A limpar o que possa ter ficado…")
    limpar()
    emp = empresa_id()

    print("\n" + "=" * 64)
    print("1. CONCORRÊNCIA — 20 processos × 10 facturas na MESMA série")
    print("=" * 64)
    r = concorrencia(emp)
    for k, v in r.items():
        print(f"   {k:14} {v}")
    print(
        "   VEREDICTO: "
        + ("SEM DUPLICADOS" if r["duplicados"] == 0 else "DUPLICADOS -- FALHA")
    )

    print("\n" + "=" * 64)
    print("2. VOLUME — 2000 facturas, gerar e validar o SAF-T")
    print("=" * 64)
    r = volume(emp)
    for k, v in r.items():
        print(f"   {k:32} {v}")

    print("\n" + "=" * 64)
    print("3. LEITURA sob carga")
    print("=" * 64)
    r = leitura(emp)
    for k, v in r.items():
        print(f"   {k:14} {v}")

    print("\nA limpar…")
    limpar()
    print("feito.")
