# 05 — Como testar o SAF-T antes de o entregar

Três sítios onde se pode verificar um ficheiro, por ordem de risco. **Faça-os
nesta ordem**, porque o último não é um teste — é uma entrega.

---

## 1. Aqui, contra o esquema oficial — grátis, offline, sem risco

Já está feito e é automático. O ecrã **Fiscalidade → SAF-T (AO)** tem um botão
**Verificar** que gera o ficheiro e o valida contra o `SAFTAO1.01_01.xsd`
oficial — o mesmo esquema que a AGT usa — sem descarregar nada.

E o **Descarregar recusa-se a dar um ficheiro inválido**. Foi feito assim de
propósito: deixar sair um ficheiro que não passa no esquema seria deixar
alguém tentar entregar e ser recusado do lado da AGT, com o prazo a correr.

Isto apanha **tudo o que é estrutura**: campos em falta, formatos errados,
contas que não existem no plano, débitos e créditos fora de ordem. Não apanha
o que é substância — se os valores estão certos, isso é a contabilidade.

## 2. `validasaft.ao` — validador independente, gratuito

<https://validasaft.ao/>

Ferramenta independente (não é da AGT) que valida ficheiros SAF-T (AO) antes
da submissão no Portal do Contribuinte. Detecta erros comuns de estrutura:
tabelas obrigatórias em falta, etiquetas incorrectas, valores monetários
inválidos.

**Não substitui a validação oficial no portal da AGT** — é apoio adicional
para reduzir falhas antes da submissão obrigatória.

Vale a pena por uma razão: é um segundo par de olhos com regras que podem não
ser exactamente as nossas. Se os dois concordarem, a confiança é outra.

## 3. O Portal do Contribuinte — e ISTO NÃO É UM TESTE

<https://portaldocontribuinte.minfin.gov.ao/>

**Não há sandbox de SAF-T.** A submissão no portal é uma **declaração
fiscal**, não um ambiente de ensaio: o que lá for entregue fica entregue.

Consequência prática, e é a mais importante desta página:

> **Nunca submeter ficheiros gerados a partir da base de demonstração.**
> São dados inventados. Entregá-los é uma declaração falsa.

O portal valida no acto do carregamento e recusa o que não passa, mas
descobrir um erro por aí é descobri-lo tarde. Daí os passos 1 e 2.

Caminho no portal para produtores de software:
**Serviços → Produtores de software → Submissão do Modelo 8** (e
**Consultar Certificado**).

Prazos:

| Ficheiro | Prazo |
|---|---|
| Facturação | dia 20 do mês seguinte |
| Aquisição de bens e serviços | dia 20 do mês seguinte |
| Contabilidade | 10 de Abril do ano seguinte |

Apoio da AGT (CAC): **(+244) 923 16 70 10** · **apoio.agt@minfin.gov.ao**

---

## O que existe MESMO como ambiente de testes — e é outra coisa

Há homologação, mas é da **facturação electrónica**, não do SAF-T. São dois
sistemas diferentes e é fácil confundi-los:

| | Homologação (testes) | Produção |
|---|---|---|
| API de facturação | `sifphml.minfin.gov.ao` | `sifp.minfin.gov.ao` |
| Portal do parceiro | `portaldoparceiro.hml.minfin.gov.ao` | `portaldoparceiro.minfin.gov.ao` |

O **portal do parceiro** é onde o produtor de software regista o software e
submete a **chave pública RSA** com que assina os pedidos (a privada nunca sai
daqui). É o que vamos usar quando a facturação electrónica entrar — não serve
para validar SAF-T.

---

## O caminho recomendado, com a certificação que já tem

1. **Verificar** no ecrã do SAF-T — os três ficheiros, um de cada vez.
2. Descarregar e passar por **`validasaft.ao`**.
3. Pôr o **número de validação real** em Configurações → Facturação, no lugar
   do `0`. Enquanto lá estiver `0`, o ficheiro declara «software ainda não
   certificado» — o que é permitido pela norma, mas não é o seu caso.
4. Gerar a partir de **dados reais de uma empresa real**, e só então submeter.

O passo 3 é o que mais se esquece, porque o `0` passa na validação e não dá
erro nenhum.

---

## O que já foi provado deste lado

| Ficheiro | `TaxAccountingBasis` | Estado |
|---|---|---|
| Facturação | `F` | válido contra o XSD oficial |
| Aquisição de bens e serviços | `A` | válido |
| Contabilidade | `C` | válido — plano inteiro, 686 KB |

Cobertura em `tests/test_saft_geracao.py`, `test_saft_compras.py` e
`test_saft_contabilidade.py`.

E uma armadilha que só apareceu ao escrever os testes do terceiro: **toda a
conta usada num lançamento tem de existir no plano de contas exportado.** O
esquema verifica-o com uma `keyref`, e a mensagem que devolve é
`No match found for key-sequence ['4321'] of keyref …`, que não diz nada a
ninguém. O gerador passou a verificá-lo primeiro e a dizer que conta é e em
que lançamento está.

---

## Fontes

- [Valida SAF-T AO](https://validasaft.ao/) — validador independente gratuito
- [Portal do Contribuinte — submissão de ficheiros SAF-T](https://portaldocontribuinte.minfin.gov.ao/noticia?id=809127)
- [Portal do Contribuinte](https://portaldocontribuinte.minfin.gov.ao/)
- Endereços de homologação: `oficial/texto/gestao.txt` e `servicos-*.txt`
