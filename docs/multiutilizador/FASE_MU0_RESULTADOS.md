# MU0 — Reorganização com comportamento preservado

Entrega local de 18/11/2026, sobre `490c03495184c45aa4d234197d8c2b63cdbe5c60`. Passaram o typecheck estrito, 183 testes unitários, quatro testes de integração, a build e 84 percursos no Edge. Um backup criado pelo código anterior produziu o mesmo estado e a mesma exportação nas duas versões. A MU1 continua por iniciar.

## Ponto de partida

O primeiro `git status --short` mostrou alterações ao arranque local, remoções de scripts de rede e demonstração, alterações à interface, domínio, persistência, testes e documentação, além dos novos componentes, fixtures e guia multiutilizador. Antes da primeira edição da MU0, a árvore ficou limpa na revisão `490c034`. O inventário anterior pode ser consultado com `git diff --name-status a09c6dc 490c034` (97 ficheiros). Toda a comparação desta fase parte do código local já consolidado nessa revisão. O QA guardou uma cópia isolada para executar a linha de base.

O ambiente de verificação foi Windows, Node 24.22.1 com SQLite 3.53.4, pnpm 11.25.0, TypeScript 5.9.3, Next 16.4.4, Vitest 4.1.12, Playwright 1.64.1 e Edge 157.0.4341.60. As fixtures estão em `tests/`. Os servidores de teste usaram loopback, portas efémeras e SQLite temporária fora do projeto.

## Mapa de módulos e contratos

Os destinos na tabela são relativos a `src/`. `modules/finance/` agrupa as responsabilidades financeiras. Os recursos operacionais partilhados continuam em `server/`.

| Origem anterior | Destino | Responsabilidade preservada ou extraída |
|---|---|---|
| `components/App.tsx` | `modules/finance/ui/FinanceApp.tsx` e `FinanceWorkspace.tsx` | Abertura, erro e repetição da leitura no primeiro. Mês e ecrã selecionados, formulários, confirmação, conflitos e composição no segundo. A página Next compõe a aplicação. |
| Painel, navegação, histórico e recibo dentro de `App` | `modules/finance/ui/{MonthOverview,WorkspaceNavigation,MovementHistory,PaymentFeedback}.tsx` e `domain/month-summary.ts` dentro do mesmo módulo | O painel consome uma projeção pura que distingue subtotais conhecidos e valores por apurar. Navegação, histórico e recibo receberam componentes próprios. |
| Etiquetas, paleta e mensagens do cliente | `modules/finance/i18n/{pt-PT,command-messages.pt-PT}.ts` e `modules/finance/ui/amount-display.ts` | Catálogos de navegação, tipos de movimento e mensagens de confirmação. Paleta e apresentação de montantes junto da UI. |
| `components/{MoneyInput,InitialBalances,AccountFunding,MonthFunding,BudgetRemainders,MovementFilters,MovementList,PaymentReasons,RecurringPayments,LocalFiles}.tsx` | `modules/finance/ui/`, com os mesmos nomes | Campos monetários e componentes específicos continuam a usar os cálculos financeiros e a folha de estilos existentes. |
| `components/{Dialog,SearchField,Icon}.tsx` e controlos internos da aplicação | `shared/ui/{Dialog,Select,SearchField,Icon,Button,Tabs,Messages,EmptySearch}.tsx` | `Select` e `Choice` passaram para o módulo de seleção. Diálogo, tabulação, restauro do foco, pesquisa, mensagens e estado vazio conservam o comportamento acessível. |
| `domain/{model,funding,money,validation,reminders}.ts` | `modules/finance/domain/` | Identidades, cálculos em cêntimos, insuficiências, validação financeira e lembretes. |
| `domain/engine.ts` | `modules/finance/domain/{engine,actions,projections,months}.ts` | `transact` aplica uma intenção. `actions` define os tipos e a serialização canónica. `projections` lê execução, saldos e compromissos. `months` abre o mês e determina vencimentos. O financiamento passou a consumir projeções diretamente. |
| `domain/text.ts` e literais de localização | `shared/i18n/{text,pt-PT}.ts` | Pesquisa e ordenação com a localização existente, idioma do documento e mensagens comuns. O formato de montante e a unidade da exportação mantêm-se em EUR. |
| `data/{usePersistentStore,requestId}.ts` | `modules/finance/client/` | Hook e geração de identificadores. Chaves das tentativas pendentes normais/recuperadas, polling, payload e repetição preservados. |
| `server/input.ts` e tipos partilhados do repositório | `modules/finance/contracts/{command-schema,command}.ts` | `parseCommand` e `parseAction` na fronteira do servidor. `Command` e `Confirmed` servem o cliente e o repositório sem uma dependência do cliente em SQLite. |
| `server/repository.ts` | `modules/finance/infrastructure/{repository,state-tables}.ts` | `Repository.read/command` controla a ligação e a transação. `load/persist` reconstituem e gravam o estado por SQL explícito. A fase conserva as operações e a ordem dos efeitos, revisão e recibo. |
| Exportação em `app/api/local-files/route.ts` | `modules/finance/contracts/export.ts` | A rota verifica a origem e entrega a resposta. `financialExport` seleciona os campos da exportação v1 e recebe o instante. |
| `config/feature-flags.ts` e leitura de ambiente em `app/page.tsx` | `config/server.ts` | Leitura tipada no servidor da visibilidade dos dados locais e do contexto de recuperação. A opção de visibilidade mantém a comparação exata com `1`. |

Os pontos de entrada históricos `src/domain/engine.ts` e `src/server/repository.ts` reexportam os módulos novos para o script local de importação já existente. Esse script foi apenas inventariado. As referências nos testes, as instruções atuais no README e o documento de transferências apontam para a estrutura revista. Os documentos históricos conservam o contexto das respetivas fases.

Os contratos observáveis continuam a ser `GET/POST /api/state` e `POST /api/local-files?action=backup|export`. O envelope da escrita contém `period`, `requestId`, `revision` e `action`. A resposta confirmada contém o estado, a revisão e, na gravação, o indicador de repetição. Mantêm-se os IDs das origens, o conteúdo canónico dos recibos, os estados de erro e os campos da exportação.

## Escolhas técnicas

- **Zod 4.6.7** é a única nova dependência de execução. A versão estável tem licença MIT, suporte a TypeScript estrito e uma API para objetos com campos conhecidos, inteiros seguros e uniões por discriminador. O schema valida as 19 variantes de ação e o envelope no servidor. Campos opcionais admitem ausência; montantes previstos admitem `null` onde o contrato anterior já o aceitava. O campo histórico `account.baseInitial` continua a participar na identificação da intenção. O significado de tipo de movimento, periodicidade e resolução do lembrete continua a ser verificado pelo domínio, na ordem da transação. [Documentação de Zod](https://zod.dev/) · [API de schemas](https://zod.dev/api)
- **Biome 2.6.8** é uma dependência de desenvolvimento, com licença MIT ou Apache-2.0. Um único executável fornece formatter e análise estática. As regras verificam imports inutilizados, código inalcançável, atribuições a constantes, duplicação ou queda acidental entre casos de `switch` e `any` explícito. O formatter cobre primitivas, catálogos, contratos, componentes extraídos e testes MU0. A configuração enumera o âmbito para manter legível a comparação de código financeiro movido. [Configuração de Biome](https://biomejs.dev/reference/configuration/) · [Comandos de Biome](https://biomejs.dev/reference/cli/)
- **Fronteiras de imports.** `scripts/check-boundaries.mjs` usa o TypeScript já instalado para resolver imports e reexports, incluindo o alias `@/`, e percorrer o grafo à procura de ciclos. `pnpm quality` executa esta verificação, lint e formatter. A etapa está ligada ao workflow Windows para a próxima execução autorizada da CI.
- As versões e licenças foram consultadas com `pnpm view` e fixadas no manifesto e lockfile. As instalações foram `pnpm add --save-exact zod@4.6.7` e `pnpm add -D --save-exact @biomejs/biome@2.6.8`. `pnpm install --offline --frozen-lockfile` confirmou a instalação local a partir do lockfile existente.

## Execução e resultados

| Comando | Antes | Depois |
|---|---|---|
| `pnpm typecheck` | Passou | Passou com `strict: true` |
| `pnpm test` | 161/161 | 183/183, incluindo 20 verificações do contrato e dois cenários A20 adicionais |
| `pnpm build` | Passou na segunda execução | Passou na segunda execução sobre a pasta isolada `.next-mu0-check` |
| `pnpm test:integration` | 4/4 | 4/4, incluindo processos concorrentes e recuperação pelos comandos Windows |
| `pnpm test:e2e` | 82/82 | 84/84, com os dois percursos visuais adicionais |
| `pnpm quality` | Ferramentas da MU0 ainda ausentes | 58 módulos no grafo, 63 ficheiros analisados, 27 com formatação verificada |

A primeira compilação de cada cópia terminou com o aviso de segurança da própria versão 16.4.4 do Next. A repetição concluiu a build e manteve o aviso de atualização. Esta pendência foi resolvida pela atualização de manutenção descrita no aditamento no fim deste relatório.

A build final e os testes contra o servidor receberam `$env:OMEUMES_BUILD_DIR='.next-mu0-check'`. Os dois cenários A20 adicionais passaram também sobre o código inicial. O QA repetiu o spec `mu0-visual` contra ambos os builds com as animações desativadas durante as capturas. As contagens da coluna inicial são as das suítes pré-existentes. As alterações automáticas do Next ao `include` de TypeScript para esse diretório de verificação foram retiradas no fim.

Na repetição isolada dos dois casos A20 sobre a baseline, o pnpm recusou substituir dependências da cópia temporária sem terminal interativo e o Vite dessa cópia deixou de resolver um ficheiro do runner. Repetiu-se com os mesmos fontes pré-MU0 noutra pasta temporária, referenciando o Vitest instalado da mesma versão. O comando `node node_modules/vitest/vitest.mjs run --root <cópia-inicial> tests/unit/mu0-financial.test.ts` passou 2/2.

### A20 e recuperação

| Regra | Observado nas fixtures antes e depois |
|---|---|
| Compras e total manual | Compra de 40 € e total de 60 € deram 60 € realizados, com ajuste de 20 €. Um total inferior às compras foi recusado. |
| Poupança, património e pagamento | Partindo de 100 €/50 €, um reforço de 20 € deixou 80 €/70 € e património de 150 €. Despesa de 15 € pela poupança deixou 80 €/55 €, património de 135 € e despesa realizada de 15 €. A repetição manteve os dois eventos originais. |
| Transferência, insuficiências e sobras | Transferir 25 € entre contas com 100 €/0 € deixou 75 €/25 €, património de 100 € e zero realizado nas linhas do plano. Conferidas a proteção dos compromissos da origem, a utilização única dos excedentes e a separação de fundos restritos. A sobra de orçamento ficou indicativa. |
| Plano e abertura de mês | 85 € previstos e 92 € pagos deram excesso de 7 € e zero por realizar. As suítes cobrem conclusão abaixo do plano, execução antes da referência, referência imutável e rubrica acrescentada depois. O mês seguinte recebeu os saldos conhecidos e as previsões do Modelo Base. A poupança ficou por confirmar e a execução começou vazia. |
| Recorrências | Testadas associação única, ausência de efeito financeiro do lembrete e datas no fim do mês, incluindo 29 de fevereiro. |
| Conferência e correção | Saldo de 100 € menos 40 € pagos, observado a 55 €, deu ajuste de −5 €. Corrigir a observação para 58 € produziu ajuste de −2 €. Anular repôs 60 €. |
| Atomicidade, repetição e limites | Falhas injetadas no catálogo, iniciais, eventos, recibo ou commit reverteram a escrita. Testadas resposta perdida depois do commit, repetição após reabrir, duplo clique, conflito, overflow de inteiros e rejeição de entrada monetária malformada. |

O QA abriu duas cópias descartáveis do **mesmo backup sintético pré-MU0**, uma em cada versão. O estado integral e a exportação JSON, excluindo apenas `exportedAt`, coincidiram. O SHA-256 do conjunto comparado foi `c1bb1cbc2adaa8d8b58a778907870aa4f9f5ae0a63c9af35c7dd9c1bcacdf630`. Ambas conservaram 21 recibos e revisão 21. Reapresentar o pedido antigo de 4 000 cêntimos com revisão 0 devolveu HTTP 200 e um único efeito. Reutilizar a chave com 4 100 cêntimos devolveu HTTP 422 e a leitura integral seguinte ficou igual.

**Transição futura.** `scripts/next.mjs` chama `migrate(path)` no modo de arranque, após obter o bloqueio e compilar. O modo de build isolado só compila. O esquema continua na versão 4. O restauro verifica a identidade da aplicação, versão, definição SQL esperada e integridade antes de disponibilizar a cópia de destino. Uma futura fase que altere o esquema precisa da barreira explícita de transição prevista em AR04 antes desse `migrate(path)` e da verificação do formato de backup nessa fase. O esquema, migrações, arranque e funções operacionais de backup/restauro conservaram o conteúdo anterior.

### Interface inspecionada

No Edge a **1366 × 768**, o plano manteve o menu lateral, os separadores e o mês visíveis. A pesquisa sem correspondência mostrou a ação «Limpar pesquisa». No diálogo centrado, o montante «12,34», o símbolo de euro, a origem pesquisada, a opção filtrada e as ações de confirmação estavam legíveis. [Estado vazio desktop](../capturas/mu0/empty-1366.png) · [Formulário desktop](../capturas/mu0/form-1366.png)

A **390 × 844**, o menu ficou recolhido no topo ao lado do mês. O diálogo ocupou o ecrã, a data e a origem passaram a linhas distintas e as ações ficaram acessíveis no rodapé. O teste selecionou a opção com seta e Enter, fechou com Escape e confirmou o regresso do foco ao botão de registo. As quatro capturas finais coincidiram integralmente por SHA-256 com as iniciais estabilizadas. As imagens são locais, sintéticas e estão no diretório de capturas ignorado pelo Git. A matriz de navegador incluiu ainda percursos a 360 px. [Estado vazio móvel](../capturas/mu0/empty-390.png) · [Formulário móvel](../capturas/mu0/form-390.png)

## Revisão independente e limites

- O revisor encontrou o ciclo `engine → funding → engine` e o acoplamento de tipos entre cliente e repositório. A extração de projeções e contratos eliminou ambos. O grafo final independente incluiu 58 módulos e 168 arestas, com zero ciclos, zero imports por resolver e separação transitiva do cliente e do servidor.
- O diferencial comparou **4 601 pedidos JSON** entre os validadores. Em ambas as versões foram aceites os mesmos 716 e recusados os mesmos 3 885, com os mesmos conteúdos normalizados, códigos e mensagens. Na primeira implementação, chamadas JavaScript diretas podiam aceitar obrigatórios herdados e opcionais presentes com `undefined`. A correção usa `exactOptional` e confirma os membros próprios. Foi documentado e testado um endurecimento deliberado fora de JSON: um discriminador ou opcional fornecido apenas pelo protótipo também é recusado.
- A comparação por tokens TypeScript confirmou 71 declarações do motor, financiamento, modelo, lembretes e repositório. O revisor repetiu três sequências sintéticas, com 16 passos, confrontando valores esperados e estados integrais. Reviu ainda os campos da exportação, snapshot, anulação e navegação por teclado.
- `FinanceWorkspace` continua a coordenar formulários que partilham estado, conflitos e a intenção pendente. O texto específico de cada formulário acompanha o respetivo JSX. O comportamento com dados habituais e num telemóvel físico fica fora desta evidência. A verificação móvel usou viewports do Edge. A execução remota da CI depende de um push posterior.

## Rever e desfazer esta entrega

Usar `git status --short` para incluir os ficheiros novos na revisão. A cópia local `.git/mu0-490c034.patch` contém a diferença completa da fase, incluindo o relatório e os ficheiros novos. `git apply --stat .git/mu0-490c034.patch` lista os caminhos. A leitura manual da aplicação continua a fazer-se por `Iniciar.cmd` no endereço habitual, [127.0.0.1:3000](http://127.0.0.1:3000/), com a instância anterior fechada.

Depois da atualização de segurança, desfazer primeiro esse aditamento pelo procedimento no fim deste relatório. Para desfazer a MU0, executar na raiz do projeto, por ordem e prosseguindo apenas se a verificação anterior passar:

```powershell
git apply --reverse --check .git/mu0-490c034.patch
git apply --reverse .git/mu0-490c034.patch
pnpm install --frozen-lockfile
```

O teste prévio de aplicação inversa passou sobre a entrega. Uma segunda verificação aplicou a inversa num índice Git temporário e obteve exatamente a árvore de `490c034`. O índice de trabalho do utilizador ficou intacto. Se uma edição posterior sobrepuser uma alteração da fase, conservar essa edição e rever o hunk correspondente antes de aplicar a inversa. As quatro imagens locais desta fase em `docs/capturas/mu0/` podem ser retiradas em separado. O patch local e a pasta ignorada de build são artefactos de revisão. A reversão só precisa de atuar sobre código, documentação e dependências.


## Aditamento — atualização de segurança do Next.js em 18/11/2026

Por pedido do utilizador, foi atualizada a dependência exata de Next.js de 16.4.4 para 16.4.6 e o respetivo lockfile. O inventário inicial deste aditamento encontrou as alterações locais da MU0 ainda por entregar ao Git. Esses ficheiros foram preservados. Os três ficheiros afetados por este aditamento são `package.json`, `pnpm-lock.yaml` e este relatório.

A versão corrigida foi confirmada na documentação oficial e nas dependências declaradas pelo pacote. A versão 16.4.5 corrige o aviso GHSA-mfr8-8qww-v76h; a 16.4.6 inclui essas correções e os ajustes posteriores da mesma série. A compatibilidade declarada abrange o Node 24 e o React 19.3.1 já instalados. A revisão do lockfile confirmou a atualização de Next e dos pacotes associados `@next/env` e `@next/swc`. [Aviso oficial](https://github.com/vercel/next.js/security/advisories/GHSA-mfr8-8qww-v76h) · [Notas de versão 16.4.6](https://github.com/vercel/next.js/releases/tag/v16.4.6)

Foram executados os seguintes comandos:

- `pnpm add --save-exact next@16.4.6` concluiu a instalação. `node -p "require('next/package.json').version"` confirmou 16.4.6.
- `pnpm audit --prod --json` terminou com código zero e zero vulnerabilidades conhecidas em todas as severidades no conjunto auditado de dependências de execução. A resposta está em `.git/next-security-audit.json`.
- `pnpm install --offline --frozen-lockfile` passou.
- `pnpm quality` passou, com 58 módulos verificados quanto a fronteiras/ciclos, 63 ficheiros analisados e 27 com formatação verificada.
- `pnpm typecheck` passou.
- `pnpm test` passou 183/183.
- `pnpm build`, com `OMEUMES_BUILD_DIR=.next-security-16-4-6`, passou à primeira execução, sem o aviso de vulnerabilidade. O resultado está em `.git/next-security-build.log`.
- `pnpm test:integration`, com a mesma pasta de build, passou 4/4, incluindo os scripts Windows, backup, restauro e repetição segura. O resultado está em `.git/next-security-integration.log`.
- `pnpm test:e2e --output=test-results/next-security`, com a mesma pasta de build, passou 84/84. O resultado está em `.git/next-security-e2e.log`.

As verificações financeiras e de recuperação usaram exclusivamente as fixtures sintéticas e bases temporárias dos testes. Foram inspecionadas as imagens renderizadas dos formulários a 1366 × 768 e 390 × 844 e do estado sem resultados a 390 px. O diálogo desktop conservou rótulos, montante, origem pesquisável e ações visíveis. No móvel, o formulário preencheu o ecrã com os botões no rodapé, e a navegação ficou recolhida. As imagens estão nas subpastas `mu0-visual-*` de `test-results/next-security`. O ensaio móvel continua a ser feito com viewport emulado no Edge.

A aplicação habitual foi iniciada através de `Iniciar.cmd`, depois de confirmar que a porta estava livre. Esse arranque voltou a compilar com sucesso à primeira execução e ficou a servir em `127.0.0.1:3000`, exclusivamente em loopback, com Next.js 16.4.6 e o esquema existente 4. O processo de arranque foi lançado em segundo plano, com registos locais em `.git/next-security-start.log` e `.git/next-security-start-errors.log`. As inclusões temporárias do diretório de build no TypeScript foram retiradas e o typecheck foi repetido com sucesso.

A pendência de atualização identificada na entrega original ficou resolvida. O âmbito da auditoria é o conjunto de avisos conhecidos devolvido pelo serviço na data da execução.

### Reversão isolada do aditamento

A cópia anterior dos três ficheiros está em `.git/next-security-before/`. O patch `.git/next-security-16.4.6.patch` contém apenas este aditamento e foi verificado com `git apply --reverse --check`. Para o desfazer, fechar a instância habitual, executar os comandos seguintes na raiz e voltar a abrir `Iniciar.cmd`:

```powershell
git apply --reverse --check .git/next-security-16.4.6.patch
git apply --reverse .git/next-security-16.4.6.patch
pnpm install --frozen-lockfile
```

A inversa recupera os ficheiros da entrega MU0 anterior a esta atualização, incluindo a versão 16.4.4. Depois dela, o patch de reversão da MU0 volta a aplicar-se sobre esse estado. Se houver edições posteriores nos mesmos trechos, rever os hunks antes de reverter. O patch e os registos são locais à pasta Git. A aplicação e o índice de trabalho conservam as alterações da MU0.
