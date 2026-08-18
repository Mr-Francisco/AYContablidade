# ASPNETBackend — pasta preparada, ainda por implementar

Estrutura criada a 18 de Agosto de 2026, a pedido, para uma eventual
reimplementação do backend em ASP.NET Core. **Não há aqui código nenhum**, e é
propositado: cria-se agora o sítio, decide-se depois o que lá vai.

```
src/
├── Api/             → controladores, autenticação, middleware
├── Application/     → casos de uso e regras de aplicação
├── Domain/          → entidades e regras de negócio
└── Infrastructure/  → base de dados, integrações (AGT), ficheiros
tests/
docs/
```

A divisão é a habitual em ASP.NET Core, e corresponde de perto ao que já existe
do lado do Python: `Api/` ≈ `src/api/routers`, `Application/` ≈ `src/services`,
`Domain/` ≈ `src/db/models` + `src/core`, `Infrastructure/` ≈ `src/db`.

---

## O que os números dizem, antes de se decidir

A razão dada para esta pasta foi que **o Python não daria conta**. Medi, contra
a base de dados real, em 18 de Agosto de 2026. Os números são estes:

| O que se mediu | Resultado |
|---|---|
| **Concorrência** — 20 processos a emitir na mesma série | 200 números, **200 únicos, 0 duplicados** |
| Ritmo de emissão | ~23 documentos/segundo |
| **Volume** — gerar o SAF-T de 2000 facturas | **3,0 segundos** (674 facturas/s) |
| Validar esse ficheiro contra o XSD oficial | 0,21 s |
| Tamanho do ficheiro | 3,3 MB |
| **Leitura** com a base cheia | mediana **4,1 ms**, p95 4,7 ms, pior 9,4 ms |

Duas mil facturas são, para a maior parte das empresas angolanas, **um ano
inteiro de facturação** — e o ficheiro sai em três segundos.

### Mas o teste encontrou defeitos reais

E isto é o mais importante, porque não eram de linguagem nenhuma:

1. **165 números de factura duplicados em 200.** O `SELECT … FOR UPDATE`
   adquiria o bloqueio e o SQLAlchemy devolvia o objecto do mapa de identidade
   **sem actualizar os atributos** — fechadura na mão, valor velho na memória.
   Faltava `populate_existing`, e faltava um `flush` antes da releitura.
2. **Ficheiros SAF-T inválidos** quando um documento não tinha hora de emissão:
   o esquema pede `dateTime` e recebia `date`.

Os dois estavam lá desde o início e **nenhum aparecia em uso normal** — com um
utilizador de cada vez não há nada a colidir, e nos testes todos os documentos
tinham hora. Reescrever em C# sem os ter percebido teria reproduzido o primeiro
tal e qual: é um erro de desenho da transacção, e o Entity Framework tem
exactamente a mesma armadilha.

### Onde uma mudança de plataforma ajudaria mesmo

Não é no ritmo. É em coisas concretas, e vale a pena tê-las escritas:

- **Trabalho paralelo com uso intensivo de CPU.** A geração de muitos SAF-T ao
  mesmo tempo, ou assinaturas JWS em massa quando a facturação electrónica
  entrar. O Python tem o GIL; o .NET não.
- **Equipa e manutenção.** Se quem vai manter isto sabe C# e não Python, essa
  razão sozinha chega, e é melhor razão do que qualquer benchmark.
- **Integração com Windows** ou com bibliotecas .NET já existentes.

### O que custaria

O backend em Python são hoje **606 testes a passar**, três geradores de SAF-T
validados contra o esquema oficial, o motor contabilístico em PGC-AR, o
processamento salarial com IRT e INSS, o isolamento por empresa provado, e a
integração da AGT. Reescrever isso é meses, e o risco não está no que se
reescreve — está no que se esquece de reescrever.

**A recomendação, com os números à frente:** medir o que dói antes de mudar. Se
o que dói for a geração de ficheiros em paralelo, isso resolve-se com um
processo separado — e não é preciso reescrever a aplicação para ter um serviço
em .NET a fazer só essa parte.

A decisão é sua. A pasta fica pronta.
