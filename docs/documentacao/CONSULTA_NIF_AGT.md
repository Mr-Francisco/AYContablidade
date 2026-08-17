# Consulta de NIF na AGT — o que existe mesmo

Investigação e testes contra os serviços reais, **17 de Agosto de 2026**. Todos
os números abaixo foram consultados na consulta oficial da AGT; as empresas são
reais e vieram de um documento público do Ministério das Finanças.

## O que a consulta oficial devolve

Sete campos. Testado com três empresas, com resultados diferentes entre si:

| Campo | 5402132186 | 5410000064 | 5417010944 |
|---|---|---|---|
| **Nome** | A CASA DOS PERFUMES, LDA | ADEGA COOPERATIVA DE AZUEIRA, CRL | ETU ENERGIAS BLOCO 17/06 (SU), SA |
| **Tipo** | COLECTIVO - Empresa | COLECTIVO - Empresa | COLECTIVO - Empresa |
| **Estado** | Activo | Activo | Activo |
| **Inadimplente** | Não | Não | **Sim** |
| **Regime de IVA** | Regime Geral (Factura IVA) | Regime Geral (Factura IVA) | Regime Geral (Factura IVA) |
| **Residente Fiscal** | Sim | — | Sim |

E para pessoa singular (`000181960LA019`): nome, Tipo SINGULAR, Estado Activo,
Inadimplente Não, e «Sem actividade em IVA (Não factura IVA)».

## O que NÃO devolve

**Morada, telefone, e-mail, actividade/CAE, repartição fiscal e datas de
início.** Não aparecem em nenhuma das consultas, nem para empresas nem para
singulares. Quem esperar a ficha inteira preenchida a partir do NIF vai ficar à
espera — esses campos continuam a ser escritos à mão.

## O que faltava do nosso lado

**`Inadimplente`.** A AGT publica-o e nós não o trazíamos. É o campo com mais
consequência prática da lista: diz se o contribuinte tem obrigações fiscais por
cumprir. Numa das três empresas testadas está a **Sim** — não é um campo
decorativo que responde sempre o mesmo.

Fica `None` quando a resposta não o traz, e não `False`: dizer «não é
inadimplente» sem o servidor o ter dito seria inventar uma afirmação sobre a
situação fiscal de uma empresa.

## Autenticação — o Piloto estava a mandar da forma errada

Os dois ambientes respondem:

```
HTTP/1.1 401 Unauthorized
Www-authenticate: Basic realm=owsm
```

É um Oracle Web Services Manager à frente, e o que ele pede é **Basic**. O
Piloto mandava cabeçalhos próprios `Username`/`Password`. Passamos a mandar as
duas formas — com credenciais, teria falhado sem isto.

## Endereços

| Ambiente | Endereço |
|---|---|
| Homologação (o nosso valor por omissão) | `https://sifphml.minfin.gov.ao/sigt/contribuinte/consultarNIF/v5/obter` |
| **Produção** | `https://sifp.minfin.gov.ao/sigt/contribuinte/consultarNIF/v5/obter` |

Os dois existem e respondem 401 sem credenciais — confirmado. O caminho é o
mesmo; muda só o anfitrião.

## Documentação

**A especificação do DS-120 não é pública.** O portal de documentação da AGT
(`quiosqueagt.minfin.gov.ao/doc-agt/`) só documenta a **Facturação
Electrónica** — registar, consultar e validar facturas. Para o serviço de
contribuinte não há descrição de campos publicada, o que quer dizer que as
chaves exactas do JSON só se confirmam com credenciais na mão.

É por isso que a leitura do campo de inadimplência tenta três nomes prováveis e
aceita não encontrar nenhum.

## Por que motivo hoje «só devolve o nome»

Porque **não há credenciais configuradas**. Com `AGT_ATIVO=false` — que é o
valor por omissão — a consulta nunca sai daqui: valida o formato do número, diz
de que tipo de contribuinte se trata, e diz que não perguntou à AGT. É a
diferença entre «não sei» e «não perguntei», e está escrita na resposta.

Para ligar, é preciso pedir as credenciais à AGT e preencher no `.env`:

```
AGT_ATIVO=true
AGT_USERNAME=...
AGT_PASSWORD=...
AGT_ENDPOINT=https://sifp.minfin.gov.ao/sigt/contribuinte/consultarNIF/v5/obter
```

## Fontes

- Consulta oficial: `portaldocontribuinte.minfin.gov.ao/consultar-nif-do-contribuinte`
- Lista de empresas com NIF (documento público do MINFIN): `ucm.minfin.gov.ao/.../minfin216684.pdf`
- Documentação da Facturação Electrónica: `quiosqueagt.minfin.gov.ao/doc-agt/`
