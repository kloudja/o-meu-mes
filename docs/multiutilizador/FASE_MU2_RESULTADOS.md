# MU2 — Espaços privados, isolamento e navegação

Entrega local de 19 de novembro de 2026. O primeiro comando foi `git status --short`. Em `master`, sobre `4ee6a4eeeebefa7d142c78195140c95e3da386e9`, já existiam as alterações e os ficheiros novos da MU1. A referência guardada antes da edição é a árvore Git `608f12cec580f45f48f1de9de367a77762cd7ff2`. O inventário inicial e o arquivo autónomo estão em `.git/mu2-reference/status.txt` e `.git/mu2-reference/baseline.zip`. Foram incluídos código, documentação versionável e testes, através de um índice separado.

**Situação da base habitual.** O trabalho decorreu em bases sintéticas criadas fora do projeto. A base pessoal, os backups pessoais, os Excel, as exportações e a configuração doméstica ficaram fora dos ensaios. O endereço manual continua a ser [127.0.0.1:3000](http://127.0.0.1:3000/). Abrir a versão MU2 sobre a base habitual continua a resultar numa recusa de transição. A atribuição real depende de autorização posterior específica.

## Do registo ao primeiro mês

Uma conta confirmada começa sem espaços. O titular escolhe o nome do espaço e pode começar rapidamente ou seguir para as definições financeiras após criar o primeiro mês. A criação do espaço e a abertura do mês são confirmações independentes. Entre elas é possível sair, voltar a entrar e encontrar um espaço EUR vazio. O catálogo pessoal, as quantias e as categorias do utilizador original nunca são utilizadas no arranque.

O seletor de espaço está junto ao avatar. A área pessoal mostra o perfil, a residência, os idiomas de interface e comunicações, a informação de privacidade, a segurança, as sessões e a saída. As contas financeiras, categorias, Modelo Base e recorrências pertencem ao espaço selecionado. A secção Partilha identifica o estado privado. O registo usa os documentos de desenvolvimento `dev-2`. Os documentos `dev-1` conservam a redação original.

## Esquema SQLite v6 e autorização

As chaves financeiras incluem `space_id`. As relações com um registo mensal incluem também `period`. A parte restante das chaves conserva o ID anterior. A moeda é uma propriedade do espaço com restrição `currency='EUR'`. Os valores monetários são inteiros em cêntimos e o domínio verifica os limites das operações.

| Entidade | Identidade, relações e acesso |
|---|---|
| Utilizador, credenciais, documentos aceites, sessões e preferências | O GUID vem da sessão MU1. A residência e os dois idiomas pertencem à pessoa. A ação de preferência só aceita o idioma suportado. Credenciais e sessões ficam fora dos DTO financeiros. |
| `spaces`, `memberships` | A chave de criação é única por titular. O espaço referencia a pertença do seu proprietário e a pertença referencia o par espaço/proprietário. A chave primária da pertença admite uma única linha por espaço. Apenas o papel proprietário está disponível. Espaço, pertença e revisão nascem na mesma transação. |
| `meta`, `months` | Uma revisão por espaço e um mês por par espaço/período. O índice de períodos permite navegar sem pedir todos os meses. Um espaço pode ter zero meses. |
| `accounts`, `categories`, `reserves`, `origins` | Catálogo lido e alterado no espaço autorizado. Cada poupança pertence à conta desse espaço. Cada origem identifica exatamente uma conta ou poupança. |
| `base_lines`, `recurring`, `lines`, `occurrences` | Referências locais a conta, categoria, poupança, definição e linha do mês. Campos relacionais e cópias de IDs em JSON têm verificações de coerência. Uma linha retirada do plano mensal conserva o seu ID. |
| `initials`, `events` | Iniciais por mês e origem. Eventos ligam-se à linha, correções e associações do próprio mês. Referências dentro da descrição estruturada do reforço e da linha histórica também são validadas em SQLite. `author_id` aponta à pertença nas gravações novas. Na origem anterior o autor é desconhecido e o detalhe indica «Autoria histórica não disponível». |
| `effects`, `allocations`, `observations` | Efeito ligado ao evento e à origem com inicial do mês. A alocação liga dois eventos do mesmo espaço e mês. A conferência liga-se ao evento e à origem respetiva. A confirmação dos efeitos e do recibo é atómica. |
| `snapshots`, `excel_imports` | O mês identifica a referência inicial e os metadados de importação. O catálogo dentro do snapshot é uma cópia histórica autocontida. Triggers recusam atualização, eliminação e substituição de um snapshot existente. A API do mês omite o conteúdo de importação. |
| `receipts`, `legacy_receipts`, `legacy_assignment` | Recibo novo por GUID, espaço e chave, com versão, período, SHA-256 da intenção canónica e estado. O legado conserva chave, âmbito antigo e conteúdo original, acessível ao repositório para reconhecer repetições. O marcador único de atribuição guarda o destino e o digest da origem. |

Os registos financeiros e as pertenças têm `IsDeleted`, `AddedAt`, `ModifiedAt` e `DeletedAt`. As datas de ciclo de vida usam UTC. Nas linhas copiadas, `AddedAt` data a entrada no esquema v6. Os períodos e as datas civis históricos conservam o valor de origem. O índice das versões, a revisão e o marcador de atribuição são registos técnicos.

| Interface | Permissão e conteúdo da resposta |
|---|---|
| `GET/POST /api/identity` | Contrato MU1, com preferência de interface da própria conta. Sessões pendentes e de substituição mantêm as capacidades restritas. Novo registo exige a versão dos termos em vigor. |
| `GET/POST /api/spaces` | Sessão confirmada. Lista apenas ID, nome e moeda dos espaços próprios. A criação recebe nome e chave idempotente. O servidor determina o proprietário. |
| `GET /api/state?spaceId=…&period=…` | Leitura autorizada do catálogo, Modelo Base, recorrências, revisão e período escolhido. Sem período, abre o mais recente. O resultado inclui o índice de períodos, indicadores de utilização de contas e estimativas anteriores de poupanças. As rubricas, efeitos e valores de execução usados nos cálculos pertencem ao mês selecionado. |
| `POST /api/state?spaceId=…` | Escrita autorizada. O comando indica período, ação, revisão e chave. A pertença e a sessão são verificadas depois de adquirir o bloqueio de escrita. Erros de validação, conflitos e falhas de armazenamento não produzem confirmação de sucesso. |
| `GET /api/history` | Leitura do espaço e período autorizados. A página de detalhe pede até 20 IDs e recebe as notas e os nomes de origem correspondentes. O navegador pagina o detalhe da linha ou conta selecionada. |
| `GET/POST /api/requests?spaceId=…` | Consulta da própria confirmação ou até 25 referências por reconhecer. O período pode desambiguar uma chave histórica. Preparar, resolver e reconhecer são operações da pessoa autenticada naquele espaço. |
| `POST /api/local-files` | Backup e exportação globais recusados com 403, incluindo para o proprietário. O procedimento operacional de recuperação é local e separado da aplicação. |

Os pedidos financeiros exigem cookie de sessão verificada e a precondição `X-Account`. O cabeçalho protege contra um separador desatualizado. O servidor verifica Host, Origin nas escritas, esquema da entrada, quarentena, sessão e pertença. Respostas privadas usam `no-store`. A leitura ou repetição com uma chave conhecida continua a passar por autorização atual.

## Arquivo, remoção e recuperação de pedidos

A persistência financeira anterior fazia quatro remoções físicas. Remover uma definição de `base_lines` passa a marcá-la como eliminada. Eliminar uma conta sem utilização marcava o ponto onde antes se apagavam os iniciais nulos, a origem e a conta. As três alterações são agora lógicas, limitadas ao espaço e feitas na mesma transação. Contas desativadas, categorias arquivadas, linhas retiradas do plano e eventos anulados conservam a história financeira própria. A consulta de utilização verifica também os outros meses do espaço antes de permitir remover a conta. A criação posterior usa novo ID.

A identidade mantém as remoções técnicas da MU1 para sessões, desafios, códigos de recuperação e intenções expirados ou consumidos. A manutenção remove limites e tarefas de comunicação vencidos e contas nunca confirmadas dentro da política MU1, com as suas dependências. Os `DROP TABLE` do esquema v6 só fazem parte da construção da base nova. A atribuição financeira lê uma cópia autónoma. A limpeza jurídica e a reconciliação de revogações posteriores a um backup continuam reservadas à fase de privacidade.

O navegador guarda o formulário em memória do separador. Após expiração, só a mesma pessoa, com a pertença novamente autorizada, pode recuperar o rascunho no mesmo espaço e mês. O logout e a mudança de titular descartam-no. A troca de contexto invalida a geração, cancela pedidos pendentes quando possível e descarta resultados e avisos tardios. A seleção de um mês existente é uma leitura.

Antes da escrita financeira, o cliente prepara uma referência no servidor. A confirmação grava efeitos e recibo juntos. Se a resposta se perder, «Verificar confirmação» consulta o titular e o espaço originais. Um resultado confirmado pode ser reconhecido mesmo após recarga ou novo login. Para uma tentativa pendente ou ainda ausente, resolver insere ou fecha a referência numa transação de escrita. Uma chegada posterior da intenção antiga fica impedida de produzir efeitos. A lista devolve lotes de 25 até ao reconhecimento. Confirmar uma operação nova usa uma nova chave. Os recibos mínimos e os marcadores terminais permanecem enquanto existir o espaço nesta fase, para impedir reaplicações. A avaliação de conservação e limpeza efetiva pertence à MU5. Nenhum comando financeiro novo é gravado em localStorage ou sessionStorage.

## Migração e restauro operacionais

A origem suportada é um **backup SQLite autónomo do esquema financeiro v4**, em modo de diário DELETE. O destino é **outra base v6**, com identidade confirmada e espaço privado vazio. Tanto a origem como o destino dos ensaios têm de estar em pastas sintéticas `omeumes-test-*` do diretório temporário do sistema. Uma base com sessões MU1 não é tratada como se fosse uma origem v4. A escolha de dois ficheiros preserva a origem e permite provisionar e verificar o destinatário antes de copiar finanças.

1. Nas fixtures, usar `createBackup(origemV4)` para obter a cópia autónoma e guardar o respetivo digest. Realizar o registo, a verificação, o login e a criação do espaço na base de destino. Obter explicitamente o GUID da pessoa e o ID do espaço.
2. Com a base sintética preparada, executar a forma abaixo. Os quatro argumentos são obrigatórios. O arranque normal e `db:migrate` não efetuam esta atribuição.

   ```powershell
   node scripts/assign-legacy.mjs "$copiaV4" "$destinoV6" "$guidUtilizador" "$idEspaco"
   ```

3. O procedimento verifica a estrutura, integridade, versão e referências da cópia. Dentro de `BEGIN IMMEDIATE` valida identidade, propriedade, quarentena, destino vazio e marcador de atribuição. Copia as colunas antigas com os IDs originais e conserva a revisão. Falhar durante a cópia deixa o destino sem efeitos parciais. Repetir com os mesmos bytes, GUID e espaço reconhece a atribuição. Outro destino lógico na mesma base é recusado.
4. Comparar colunas antigas, saldos esperados, planos e iniciais. Criar um backup v6, restaurar para **outro nome** e verificar o esquema e as projeções. O backup v6 já nasce em quarentena. O teste de `Restaurar.cmd` fechou a instância normal e abriu a cópia na mesma porta sintética. O HTTP da cópia bloqueou a identidade até reconciliação. A reabertura posterior da origem usou a mesma porta.
5. Em caso de falha antes do commit, rever a causa e repetir com a mesma origem e os mesmos identificadores. Após escritas novas na v6, preservar a v6 e o backup operacional para recuperação. A reversão de código descrita abaixo não desce um esquema nem transfere movimentos entre ficheiros.

## Comparação independente

A fixture do revisor usa duas contas, uma poupança e dois meses. O SQL que cria a referência e calcula os valores esperados é independente do repositório MU2. A comparação percorreu as 18 tabelas de origem, incluindo revisão, snapshots, linhas retiradas, ocorrência, metadados Excel, correção, detalhe e recibo.

| Medida | Origem v4 | Atribuição v6 e restauro |
|---|---:|---:|
| Conta A após os movimentos | 96,00 € | 96,00 € |
| Conta B após os movimentos | 44,00 € | 44,00 € |
| Poupança | 13,00 € | 13,00 € |
| Património final | 153,00 € | 153,00 € |
| Despesa realizada | 42,00 € | 42,00 € |
| Rubrica principal, plano inicial / atual / Modelo Base | 50,00 / 62,00 / 51,00 € | 50,00 / 62,00 / 51,00 € |
| Iniciais do mês seguinte | 96,00 / 44,00 € / poupança por confirmar | Idênticos |
| Revisão da origem | 17 | 17 |

O destinatário era a segunda pessoa criada. O ensaio recusou o GUID da primeira combinado com o espaço da segunda. Forçar falha depois dos efeitos reverteu toda a cópia. A execução de `Iniciar.cmd` e de `scripts/migrate.mjs` perante uma origem v4 sem autorização preservou os SHA-256 e a listagem da pasta. A criação simultânea do mesmo mês, pedida a dois processos, deixou uma rubrica de 51,00 €, uma ocorrência e zero movimentos. Depois de nova transferência de 4,00 € na origem mensal, os iniciais já capturados mantiveram os valores anteriores.

Os dois proprietários abriram o mesmo período. A API recusou ler ou escrever no espaço alheio e consultar ou encerrar o respetivo recibo. No próprio espaço de B, a chave de A devolveu ausência e a tentativa de financiar com uma origem exclusiva de A devolveu 422. As FKs compostas recusaram vínculos cruzados em SQL direto. Uma falha entre efeitos e recibo também reverteu a operação nova. O teste reabriu e repetiu a operação autorizada e confirmou um único efeito financeiro.

## Verificação e revisão independente

O QA extraiu o arquivo da MU1 numa pasta temporária e instalou as dependências com `pnpm install --offline --frozen-lockfile`. A referência passou `quality`, `typecheck`, build, 197 testes unitários, cinco de integração e nove percursos de identidade. A MU2 reutiliza as dependências do projeto.

| Comando na entrega MU2 | Resultado |
|---|---|
| `pnpm quality` | Fronteiras e ciclos verificados em 81 módulos. Lint em 92 ficheiros e formatação em 60. |
| `pnpm typecheck` | TypeScript terminou com código 0. |
| `pnpm test` | 197/197 em 11 ficheiros. Inclui regressão do domínio e da persistência histórica numa fixture separada do produto. |
| `pnpm build` | Build otimizado concluído. Nas execuções independentes foi usada uma pasta de build isolada. |
| `pnpm test:integration` | 10/10 em quatro ficheiros, com arranque, migração, backup/restauro, identidade, finanças e concorrência entre processos. |
| `pnpm test:e2e --workers=4` | 97/97 no Edge para Windows. Exercita o produto v6 compilado. |

Para reproduzir integração e navegador com a build isolada, definir `$env:OMEUMES_BUILD_DIR='.next-mu2-final'` na mesma consola antes de compilar e executar os testes. As fixtures escolhem uma porta efémera e um destino temporário em cada ensaio. O registo, confirmação por email sintético, login e criação do espaço passam pela API. São os comandos autorizados que preparam as contas e rubricas financeiras para o navegador. Os logs locais da entrega ficam em `.git/mu2-build.log`, `.git/mu2-unit-delivery.log`, `.git/mu2-integration-delivery.log` e `.git/mu2-browser-delivery.log`.

| Aceitação | Evidência e âmbito desta fase |
|---|---|
| A01, A19 | Do registo à aplicação com zero espaços, criação privada, zero meses e primeiro mês. A inspeção do JSON mostrou listas de contas, rubricas, poupanças, recorrências e meses vazias. Foram exercitadas as duas escolhas de onboarding. |
| A02, A03–A05, A15 | Dois titulares e o mesmo período. Recusa por endpoint, por capacidade e por FK descrita acima. O proprietário consulta o seu histórico. Um utilizador externo fica sem acesso. Os papéis partilhados de leitor e editor pertencem à MU4. |
| A08–A09 | O teste reteve uma resposta de novembro enquanto se abria dezembro e outra enquanto se mudava de espaço. Libertou ambas e verificou a seleção e as rubricas efetivamente renderizadas. Outro teste reteve a confirmação de A durante a troca para B e verificou o recibo e o número de movimentos depois de A voltar. O rascunho sobreviveu à expiração para a mesma pessoa e mês. Foram inspecionados os corpos HTTP e as chaves e valores de localStorage e sessionStorage. |
| A13–A15 | Dois processos, duas chaves, o mesmo mês criado uma vez. Revisões independentes por espaço. A concorrência aditiva de vários editores da mesma rubrica pertence à MU3. |
| A20 | Comparação v4/v6 e restauro acima. Os percursos de navegador cobrem Modelo Base, plano inicial explícito, execução antes do snapshot, saldos iniciais, poupanças, reforços, transferências, cartão refeição, totais manuais, recorrências, anulação e recarga. |
| A26–A27 | Uma fixture libertou o email de uma identidade anterior e repetiu o registo. O novo GUID recebeu zero espaços e nenhuma autorização histórica. O encerramento legal da conta é da MU5. Interface e comunicações têm preferências distintas. A API recusa idioma não suportado e moeda fornecida no pedido de criação. SQLite impede mudar o EUR. |
| A34, A43 | GUID e espaço obrigatórios, destino pertencente a outra pessoa recusado, falha a meio, replay, reabertura, backup/restauro compatíveis e recusa de arranque medida por hash e conteúdo da pasta. |

**Revisor de dados e autorização.** Escreveu a fixture v4, a projeção financeira de referência e cinco testes independentes. Identificou a necessidade de verificar também os IDs conservados em JSON e de cobrir a substituição de um snapshot via `INSERT OR REPLACE`. As restrições passaram a verificar essas referências e a impedir a reinserção. Identificou ainda o texto de consentimento de desenvolvimento desatualizado e a necessidade de especificar o modo de diário da cópia autónoma. As cinco provas passaram sobre a build integrada. O registo completo está em `.git/mu2-review.md`.

**QA de interface e regressão.** Preparou sessões e espaços legítimos, inspecionou sete capturas e executou os 97 percursos. A primeira passagem aprovou 61, incluindo os cinco próprios da MU2. Durante a integração foram corrigidos a seleção do mês, a recuperação dos pedidos de confirmação incerta, a distinção entre operação confirmada e referência encerrada, o foco por teclado e a largura do seletor em mobile. Os testes financeiros passaram a pedir explicitamente o mês, a verificar o recibo em vez de reenviar a operação e a aguardar a confirmação antes de sair de um formulário. A segunda execução passou 93/97. A seguinte passou 97/97. Depois da guarda que mantém o seletor inativo durante a consulta inicial, a última execução voltou a passar 97/97 em 3,4 minutos. As sete capturas desta execução coincidiram byte a byte com as revistas pelo QA. O novo texto de consentimento é verificado nos dois tamanhos.

## Evidência visual local

O QA voltou a inspecionar independentemente as sete capturas finais. Confirmou a legibilidade do seletor, as duas escolhas de onboarding e a presença exclusiva da rubrica do segundo espaço após a troca. As imagens mostram dados sintéticos no Edge para Windows. O tamanho mobile é uma janela emulada de 390 × 844 px. Na largura de 390 px, o nome completo do espaço de ensaio cabe entre o rótulo e o avatar. A escolha «Configurar agora» conduz às definições financeiras do espaço. No desktop, «Começar rapidamente» abre o resumo do primeiro mês. O seletor aguarda a lista autorizada antes de aceitar uma escolha. O teste manteve essa resposta em trânsito no desktop e no telemóvel. A última imagem mostra o segundo espaço depois da libertação de uma resposta do primeiro.

| Estado | Desktop 1366 × 768 | Mobile 390 × 844 |
|---|---|---|
| Conta sem espaços | [Desktop](../capturas/mu2/sem-espacos-1366.png) | [Mobile](../capturas/mu2/sem-espacos-390.png) |
| Espaço sem meses | [Desktop](../capturas/mu2/sem-meses-1366.png) | [Mobile](../capturas/mu2/sem-meses-390.png) |
| Primeiro mês | [Resumo mensal](../capturas/mu2/primeiro-mes-1366.png) | [Definições](../capturas/mu2/primeiro-mes-390.png) |
| Troca com resposta atrasada | [Segundo espaço selecionado](../capturas/mu2/troca-espaco.png) | A seleção entre espaços também foi exercitada no percurso mobile. |

## Limites operacionais

A atribuição técnica está confinada a SQLite sintético fora do projeto. As quantias, tempos e imagens deste relatório provêm dos ensaios. A autorização e o procedimento operacional para a base habitual ficam por executar. O cliente MU2 recupera as suas intenções pelo servidor. Eventuais comandos pendentes de versões anteriores existentes no perfil de navegador pessoal ficam fora do ensaio e da atribuição da v4. Devem ser reconciliados antes de uma futura transição real. A retenção definitiva de recibos, o encerramento de conta, a exportação por espaço e a reconciliação de privacidade após restauro pertencem a fases posteriores.

Duas execuções preliminares do revisor deixaram oito pastas sintéticas `omeumes-test-mu2-audit-*` no diretório temporário. A revisão automática de permissões recusou a remoção manual. A versão entregue do teste limpa as pastas criadas por cada nova execução.

## Reversão de código

A referência anterior à MU2 contém também os ficheiros de código e testes novos da MU1. O patch binário local `.git/mu2-608f12c.patch` cobre as diferenças face a essa referência, incluindo as sete capturas sintéticas identificadas nesta entrega. O índice Git normal ficou separado da construção do patch. O anterior `.git/mu1-4ee6a4e.patch` conserva o SHA-256 `c37814e22732cbaee4d440c89f259d4e79514c8e8af281a7dba2c6f65f3dc785`.

A verificação usou `git apply --reverse --check .git/mu2-608f12c.patch` no diretório entregue. Foi também aplicada a inversa numa cópia física temporária do código. Os 155 caminhos e o seu conteúdo corresponderam à referência. A aplicação inversa num índice isolado produziu exatamente a árvore MU1 `608f12cec580f45f48f1de9de367a77762cd7ff2`. Para desfazer apenas a MU2 neste estado, verificar primeiro com o comando anterior e, para efetivar a operação, executar `git apply --reverse .git/mu2-608f12c.patch`. As bases SQLite e os backups têm um procedimento de recuperação próprio.

## Ficheiros afetados

A lista compara o diretório entregue com a referência MU1. Inclui as sete imagens locais sintéticas. A mesma lista, com as marcas de adição ou modificação, encontra-se em `.git/mu2-reference/files.txt`.

```text
M	README.md
M	biome.json
A	docs/capturas/mu2/primeiro-mes-1366.png
A	docs/capturas/mu2/primeiro-mes-390.png
A	docs/capturas/mu2/sem-espacos-1366.png
A	docs/capturas/mu2/sem-espacos-390.png
A	docs/capturas/mu2/sem-meses-1366.png
A	docs/capturas/mu2/sem-meses-390.png
A	docs/capturas/mu2/troca-espaco.png
A	docs/multiutilizador/FASE_MU2_RESULTADOS.md
M	playwright.config.ts
A	scripts/assign-legacy.mjs
A	src/app/Application.tsx
A	src/app/api/history/route.ts
A	src/app/api/requests/route.ts
A	src/app/api/spaces/route.ts
M	src/app/api/state/route.ts
M	src/app/globals.css
M	src/app/page.tsx
A	src/app/select-arrow.svg
A	src/modules/finance/client/draft.ts
M	src/modules/finance/client/requestId.ts
M	src/modules/finance/client/usePersistentStore.ts
M	src/modules/finance/contracts/command.ts
M	src/modules/finance/domain/engine.ts
M	src/modules/finance/domain/model.ts
M	src/modules/finance/domain/months.ts
M	src/modules/finance/domain/projections.ts
M	src/modules/finance/i18n/pt-PT.ts
M	src/modules/finance/infrastructure/repository.ts
A	src/modules/finance/infrastructure/requests.ts
M	src/modules/finance/infrastructure/state-tables.ts
M	src/modules/finance/ui/AccountFunding.tsx
M	src/modules/finance/ui/FinanceApp.tsx
M	src/modules/finance/ui/FinanceWorkspace.tsx
M	src/modules/finance/ui/MovementHistory.tsx
M	src/modules/identity/account.ts
M	src/modules/identity/contracts.ts
M	src/modules/identity/input.ts
M	src/modules/identity/ui/IdentityApp.tsx
M	src/modules/identity/ui/IdentityForm.tsx
A	src/modules/spaces/access.ts
A	src/modules/spaces/schema.mjs
A	src/modules/spaces/ui/SpacesHome.tsx
A	src/modules/spaces/ui/spaces.css
A	src/server/assign-legacy.mjs
M	src/server/http.ts
M	src/server/local-files.mjs
M	src/server/storage.mjs
M	src/server/transition.mjs
M	tests/e2e/application.ts
M	tests/e2e/base-opening-balances.spec.ts
M	tests/e2e/domain-flows.spec.ts
M	tests/e2e/funding.spec.ts
M	tests/e2e/identity-application.ts
M	tests/e2e/mu1-interface.spec.ts
A	tests/e2e/mu2-spaces.spec.ts
M	tests/e2e/native-manager.spec.ts
M	tests/e2e/persistence.spec.ts
M	tests/e2e/phase-4.spec.ts
M	tests/e2e/phase-5.spec.ts
M	tests/e2e/phase-6-adjustments.spec.ts
M	tests/e2e/phase-6-review.spec.ts
M	tests/e2e/phase-6-savings-and-movement-lists.spec.ts
M	tests/e2e/prototype.spec.ts
M	tests/integration/finance-worker.mjs
M	tests/integration/mu1-concurrency.test.ts
A	tests/integration/mu2-data.test.ts
M	tests/integration/recovery.test.ts
M	tests/integration/server.test.ts
A	tests/legacy/http.ts
A	tests/legacy/repository.ts
A	tests/legacy/state-tables.ts
M	tests/migrate-synthetic.ts
M	tests/unit/local-files.test.ts
M	tests/unit/mu1-identity.test.ts
M	tests/unit/persistence.test.ts
```
