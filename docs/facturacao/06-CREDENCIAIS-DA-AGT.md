# 06 — Como obter as credenciais da AGT

**Não há consulta anónima.** Foi medido: os dois endereços da AGT — testes e
produção — respondem `401 Unauthorized` com `Www-authenticate: Basic realm=owsm`
a quem não se identifica. É um Oracle Web Services Manager à frente do serviço,
e o que ele pede é um par utilizador/palavra-passe.

É por isso que a consulta de NIF não traz o nome: **não é um defeito do código**,
é falta de credenciais.

---

## Como se pedem

Segundo a documentação oficial da AGT
([`oficial/texto/api.txt`](oficial/texto/api.txt)):

> O acesso é concedido através de um par de credenciais (username e password)
> emitido pela entidade gestora da Facturação Electrónica.

**Envia-se um e-mail formal para:**

```
produtores.dfe.dcrr.agt@minfin.gov.ao
```

**Com:**

- Nome da empresa
- NIF da empresa

É o que a documentação pede. Na prática vale a pena juntar também o nome do
programa, para quem responde saber a que produtor está a atribuir o acesso —
mas o que é exigido são as duas linhas acima.

## Antes de pedir: talvez já as tenha

O **ayobras.com** faz esta consulta e funciona. Se esse sistema é seu, as
credenciais que ele usa **são suas** — foram emitidas para a sua empresa, e o
mais provável é servirem aqui.

Vale dois minutos confirmar antes de esperar por uma resposta da AGT:

```bash
python scripts/testar_nif.py 5417020772
```

O guião lê `AGT_USERNAME` e `AGT_PASSWORD` do ambiente ou do `.env`, testa os
**dois** ambientes e diz qual funciona. Nunca imprime a palavra-passe.

## Onde se põem

**Em desenvolvimento** — `Producao/backend/.env`:

```
AGT_ATIVO=true
AGT_ENDPOINT=https://sifp.minfin.gov.ao/sigt/contribuinte/consultarNIF/v5/obter
AGT_USERNAME=
AGT_PASSWORD=
```

**Em produção** — no painel do Render, nas variáveis do serviço
`aycontabilidade-api`. Já estão declaradas no `render.yaml` com `sync: false`,
que é como se dizem «esta é secreta, escreve-se no painel e não no ficheiro».

## Dois ambientes, duas credenciais

| | Endereço |
|---|---|
| Testes (homologação) | `sifphml.minfin.gov.ao` |
| Produção | `sifp.minfin.gov.ao` |

**São serviços separados e as credenciais de um não servem no outro.** É o
engano que custa uma tarde: as credenciais funcionam, o endereço é do outro
ambiente, e a resposta é 401 como se estivessem erradas.

O `.env.producao.example` apontava para `sifphml` — o de testes — e foi
corrigido.

## O que acontece sem credenciais

Nada rebenta, e é de propósito: a consulta devolve a validação do **formato** do
número, com `fonte: "formato"`, e o nome fica por preencher à mão. Um serviço
externo em baixo, ou por configurar, não pode impedir alguém de registar uma
empresa.

O que se lê no ecrã é: *«NIF válido (Pessoa colectiva). A consulta à AGT não
está configurada, por isso o nome e o regime têm de ser preenchidos à mão.»*

## E as outras credenciais — as da facturação electrónica

São **outra coisa** e pedem-se ao mesmo sítio, mas há um passo a mais: para
emitir facturas electronicamente é preciso registar o software no **portal do
parceiro** e submeter a **chave pública RSA** com que se assinam os pedidos.

| | Endereço |
|---|---|
| Testes | `portaldoparceiro.hml.minfin.gov.ao` |
| Produção | `portaldoparceiro.minfin.gov.ao` |

A chave privada **nunca sai daqui**. Ver
[03 — Facturação electrónica](03-FACTURACAO-ELECTRONICA.md).
