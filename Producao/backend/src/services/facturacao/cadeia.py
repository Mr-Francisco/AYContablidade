"""A cadeia de resumos — o que torna os documentos auditáveis.

O PROBLEMA QUE ISTO RESOLVE. Um sistema de facturação tem de poder provar que
nenhum documento foi alterado ou apagado depois de emitido. Guardar um número
sequencial não prova nada: quem apagar a factura 7 e renumerar as seguintes
deixa uma sequência perfeita.

A solução, que é a mesma em Portugal, em Angola e em todo o lado onde há SAF-T:
**cada documento leva o resumo do anterior**. A factura 8 assina, entre outras
coisas, o hash da 7. Apagar a 7 parte a cadeia na 8; alterar a 7 muda o hash
da 7 e parte a cadeia na 8 na mesma. A quebra é detectável sem se saber o que
lá estava.

O QUE SE ASSINA, e porque é exactamente isto:

    data_do_documento ; entrada_no_sistema ; numero_do_documento ; total ; hash_anterior

São os quatro campos que identificam o documento no tempo e no valor, mais a
ligação ao anterior. É a mesma composição que o SAF-T português usa há vinte
anos, e a razão de cada um:

- **data** — mudar a data de uma factura é a alteração mais comum;
- **entrada no sistema** — distingue duas facturas com a mesma data;
- **número** — a identidade do documento;
- **total** — o que se tentaria alterar;
- **hash anterior** — o elo.

ASSINATURA vs. RESUMO. Aqui só há resumo (SHA-256), e não assinatura com chave
privada. É deliberado: as chaves para assinar são **emitidas pela AGT** e ainda
não as temos (ver `docs/facturacao/03-FACTURACAO-ELECTRONICA.md`). O resumo
encadeado é o que garante a integridade interna e o que o SAF-T pede no campo
`Hash`; quando as chaves chegarem, a assinatura JWS acrescenta-se **por cima**
disto, sem partir a cadeia já existente.
"""

from __future__ import annotations

import hashlib
from datetime import date, datetime
from decimal import Decimal

#: Separador dos campos dentro do texto que se resume. Não aparece em nenhum
#: dos valores — datas, números e totais não levam ponto e vírgula — por isso
#: dois documentos diferentes nunca produzem o mesmo texto.
SEPARADOR = ";"


def _data(v: date | datetime | None) -> str:
    if v is None:
        return ""
    return v.date().isoformat() if isinstance(v, datetime) else v.isoformat()


def _instante(v: datetime | None) -> str:
    """Sem microssegundos e sem fuso: o SAF-T usa segundos.

    Com microssegundos, o mesmo documento gravado duas vezes daria hashes
    diferentes — e a cadeia deixaria de poder ser recalculada para
    verificação.
    """
    return v.replace(microsecond=0, tzinfo=None).isoformat() if v else ""


def _valor(v: Decimal | float | int | None) -> str:
    """Duas casas, sempre. `1000` e `1000.00` têm de dar o mesmo resumo."""
    return f"{Decimal(str(v or 0)):.2f}"


def texto_a_resumir(
    *,
    data_doc: date | datetime | None,
    entrada_sistema: datetime | None,
    numero: str,
    total: Decimal | float | int | None,
    hash_anterior: str | None,
) -> str:
    """O texto exacto de que se tira o resumo.

    Público de propósito: a verificação da cadeia recalcula-o, e um teste tem
    de poder comparar o texto e não só o resultado.
    """
    return SEPARADOR.join(
        [
            _data(data_doc),
            _instante(entrada_sistema),
            (numero or "").strip(),
            _valor(total),
            (hash_anterior or ""),
        ]
    )


def resumir(
    *,
    data_doc: date | datetime | None,
    entrada_sistema: datetime | None,
    numero: str,
    total: Decimal | float | int | None,
    hash_anterior: str | None,
) -> str:
    """O resumo do documento, em SHA-256 e hexadecimal."""
    texto = texto_a_resumir(
        data_doc=data_doc,
        entrada_sistema=entrada_sistema,
        numero=numero,
        total=total,
        hash_anterior=hash_anterior,
    )
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def codigo_de_controlo(hash_doc: str | None) -> str:
    """Os quatro caracteres que se imprimem no documento.

    O SAF-T português imprime as posições 1, 11, 21 e 31 do hash. Aqui usam-se
    as mesmas posições, e não os quatro primeiros: caracteres espalhados
    detectam mais alterações do que quatro seguidos, e não custa nada.

    NÃO É UM CÓDIGO DE AUTENTICAÇÃO DA AGT. O código de autenticação é
    definido pela Administração Tributária (DP 71/25, art. 19.º) e virá com a
    facturação electrónica. Este é o código de controlo do documento impresso,
    que permite conferir um papel contra o sistema.
    """
    if not hash_doc:
        return ""
    posicoes = (0, 10, 20, 30)
    return "".join(hash_doc[p] for p in posicoes if p < len(hash_doc)).upper()


def cadeia_intacta(documentos: list[dict]) -> tuple[bool, str | None]:
    """Verifica uma série inteira, do primeiro ao último.

    `documentos` vem ordenado pela sequência, cada um com `data_doc`,
    `entrada_sistema`, `numero`, `total`, `hash_anterior` e `hash_doc`.

    Devolve `(intacta, onde_partiu)`. Não levanta excepção: uma cadeia partida
    é um facto a comunicar, não um erro do programa — e quem a verifica quer
    saber ONDE partiu, para poder ir ver.
    """
    anterior: str | None = None
    for d in documentos:
        if d.get("hash_anterior") != anterior:
            return False, (
                f"{d.get('numero')}: aponta para um documento anterior que não "
                "é o que está antes dele na série"
            )
        esperado = resumir(
            data_doc=d.get("data_doc"),
            entrada_sistema=d.get("entrada_sistema"),
            numero=d.get("numero") or "",
            total=d.get("total"),
            hash_anterior=anterior,
        )
        if d.get("hash_doc") != esperado:
            return False, (
                f"{d.get('numero')}: o resumo não corresponde ao conteúdo — "
                "o documento foi alterado depois de emitido"
            )
        anterior = esperado
    return True, None
