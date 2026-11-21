# MU3 — Concorrência, confirmações e histórico

Entrega local de 20 de novembro de 2026. A referência é o diretório de trabalho MU2 após a ativação, sobre `master` em `4ee6a4eeeebefa7d142c78195140c95e3da386e9`. O primeiro comando foi `git status --short`. Antes das edições, foi guardada uma cópia verificada por SHA-256 do código, documentação e testes. A referência final de 175 ficheiros inclui os ficheiros novos da MU2 e os scripts de ativação. Os dois documentos de requisitos locais ignorados pelo Git ficaram fora do arquivo entregue. O arquivo `baseline.zip`, o inventário e os digests ficam em `.git/mu3-reference`.

## Comandos e revisão

O estado devolve a revisão atual do espaço para o polling e como referência da leitura usada por um formulário. A escrita compara apenas as versões dos recursos pertinentes, em `finance_versions`, e aplica o domínio ao estado que encontra dentro de `BEGIN IMMEDIATE`. A v7 guarda a revisão de transição para reconhecer observações anteriores à introdução destas versões. A sessão e a pertença ativa são validadas após adquirir o bloqueio de escrita.

| Comando | Precondição e efeito |
|---|---|
| Compra, recebimento, investimento e reforço | Aplica ao estado atual, respeitando os saldos, o catálogo e a rubrica/objetivo revistos. Reavalia uma parcela concorrente face ao valor ainda aberto. Se ultrapassar esse valor, pede nova revisão. Um montante diferente confirmado sobre uma leitura atual continua possível. |
| Pagamento de restante ou fecho explícito | Confirma a rubrica, o plano e a execução observados. O botão de pagamento integral envia a intenção de pagar o restante, que tem de coincidir com o valor atualmente por realizar. Uma alteração concorrente ao realizado exige nova confirmação de fecho. |
| Total acumulado e detalhe de compra | O total depende da execução da rubrica. Uma compra preparada antes de um ajuste também exige releitura. O detalhe depende do ajuste que o financia e da parcela por descrever. O domínio valida a ligação, a origem e a disponibilidade. |
| Transferência própria e lote de sugestões | A transferência individual valida as origens e os saldos atuais. O lote recalcula as rotas, compara origem, destino e montante revistos e confirma o conjunto numa transação. Uma lista desatualizada recebe conflito quando as rotas mudaram. |
| Saldos iniciais e conferência | Compara a origem e os seus efeitos. A correção de uma conferência conserva a base observada no registo original. |
| Edições de plano, catálogos e recorrências | Comparam a entidade alterada e as relações relevantes. A rubrica mensal inclui a execução. Associar lembrete ou reforço valida as ligações e a disponibilidade na transação. |
| Guardar plano inicial | Compara plano, lembretes e catálogo usados na referência. Se outra pessoa já guardou, devolve a referência existente. Os triggers SQLite protegem a referência. |
| Abrir mês | Cria uma única linha por espaço e período. Captura os saldos conhecidos do mês anterior e o Modelo Base na mesma transação. Uma segunda abertura devolve o mês existente. |
| Anular ou corrigir | Compara o original e os vínculos afetados. Impede inversas repetidas e estados financeiros inválidos. A correção inclui a compensação, a substituição e os respetivos efeitos no mesmo commit. |

Para compras na mesma rubrica e reforços na mesma finalidade, a janela inicial de possíveis duplicados é de cinco minutos desde o registo no servidor. `OMEUMES_DUPLICATE_MINUTES` aceita minutos inteiros entre 1 e 1440. O servidor indica até cinco operações recentes com o mesmo montante, com autoria conhecida, data efetiva, instante de gravação, descrição e origem. O aviso não grava efeitos. O token HMAC vincula a autorização para «Registar como operação diferente» à pessoa, ao espaço, ao mês, ao conteúdo e às versões e registos apresentados. Uma mudança relevante invalida o token. O servidor volta a verificar a operação completa.

## Recibos, histórico e transição

O recibo usa `(space_id, user_id, request_id)` e guarda período, estado, versão, SHA-256 da intenção canónica, referência mínima ao resultado e reconhecimento. A versão 2 inclui a confirmação de duplicado na impressão digital. Os recibos v1 mantêm os fingerprints existentes. A referência de compatibilidade v4 é limitada à pessoa que recebeu a atribuição. A API pode devolver o estado corrente na repetição, após renovar a autorização. Se duas pessoas usarem a mesma chave, conservam recibos separados e os IDs dos movimentos são desambiguados quando necessário.

Os estados são pendente, confirmado e encerrado sem efeito. A consulta de uma referência ausente devolve ausência. Depois de uma resposta perdida, o cliente consulta primeiro a mesma referência no contexto original. Uma tentativa ainda pendente ou ausente pode ser encerrada em ordem transacional com a escrita original. A chegada tardia é então recusada. Repetir exatamente um pedido confirmado reconhece o mesmo efeito. Alterar o conteúdo exige intenção nova. A caixa autenticada recupera até 25 referências por reconhecer de cada vez. O formulário fica em memória e uma mudança de sessão ou de âmbito invalida as respostas tardias. Nesta fase, os recibos mínimos e as marcas terminais ficam disponíveis enquanto existir o espaço. A idade da referência e o seu reconhecimento nunca libertam a chave.

O saldo e o realizado somam o original e a inversa, uma vez cada. A projeção de obrigações, compras detalhadas, reforços e fluxos mantém os factos ativos, pelo que uma compensação de despesa não aparece como novo rendimento. O histórico apresenta o original, a compensação e, quando aplicável, a substituição, com detalhe em páginas de 20. Os registos recentes distinguem data civil de movimento e instante de gravação. A migração acrescenta inversas aos `voided` históricos e conserva os originais, as referências e os saldos. A autoria e hora histórica desconhecidas aparecem como indisponíveis. Anulações nunca reescrevem os iniciais já capturados num mês posterior.

O esquema v7 admite membros editores preparados pelas fixtures e conserva um proprietário ativo. A ordem de revogação e escrita é a ordem de aquisição do bloqueio transacional. Uma operação confirmada antes da revogação mantém os efeitos. Consultas e repetições posteriores da pessoa revogada não devolvem dados financeiros.

`Iniciar.cmd` e `scripts/migrate.mjs` verificam o cabeçalho antes de abrir SQLite. Só as fixtures sintéticas autorizadas fora do projeto podem passar de v6 a v7 neste trabalho. O ensaio de falha a meio manteve a v6 utilizável e permitiu repetir a transição. Backups autónomos das duas versões foram reconhecidos e copiados em quarentena. As cópias v7 conservaram valores, snapshots e recibos e o percurso de restauro inicia na porta sintética habitual do ensaio.

## Aceitação

| Casos | Evidência |
|---|---|
| A07, A31 | Dois PIDs e uma base em WAL. A escrita anterior à revogação persistiu. A escrita ordenada depois, a consulta do histórico e a repetição foram recusadas. O navegador retirou o formulário e a confirmação ao detetar a perda de acesso. |
| A08, A09 | Regressão do contexto do cliente. Respostas atrasadas do espaço e mês anteriores foram ignoradas. Mudança de conta limpou os dados e o rascunho, sem gravar em nome da outra pessoa. |
| A10 | Dois integrais de 100 € geraram um único pagamento. As parcelas de 40 € e 60 € perfizeram 100 €. O restante antigo e as parcelas que ultrapassariam 30 € foram recusados. Uma leitura obsoleta também não conseguiu fechar a obrigação por um parcial explícito. |
| A11, A30, A44 | Perda de resposta após gravar 12 € e repetição autenticada produziram um único efeito. Reutilizar a chave com 13 € falhou. A consulta de uma chave ausente foi seguida de encerramento e entrega tardia sem efeito. Foram injetadas falhas antes do recibo e no commit. Os recibos históricos, os reconhecidos e os encerrados mantiveram o comportamento após passagem do tempo e restauro. |
| A12, A13 | Dois processos guardaram uma única referência e abriram um único mês. O mês teve uma cópia do Modelo Base e lembretes sem duplicação. Foram também tentadas alterações diretas do snapshot. |
| A14, A36 | Café de 5 € e supermercado de 30 € totalizaram 35 € na mesma rubrica com uma alteração noutro espaço. Um segundo pagamento de 10 € deu aviso. Uma compra de 7,01 € durante a revisão invalidou o aviso antigo. O novo consentimento e a repetição da mesma chave levaram o total a 62,01 € e o saldo a 237,99 €. Uma descrição diferente exigiu revisão própria. |
| A20, A32 | A fixture v6 reteve 40 € e 0 € nos dois bancos, 35 € na poupança, património de 75 € e despesa de 75 € após transição e cópia. A compra de 40 € mais 20 € de ajuste valia 60 € e a despesa financiada pela poupança valia 15 €. Original, snapshot, alocações e iniciais foram comparados separadamente. Um total concorrente de 50 € sobre compra de 30 € exigiu releitura e acrescentou só 20 €. |
| A28 | Anular duas vezes uma despesa de 20 € deixou uma única inversa, saldo de 50 € e realizado zero. Corrigir de 20 € para 15 € deixou 35 € na poupança e despesa de 15 €, sem receita. Corrigir um reforço entre bancos de 25 € para 10 € preservou os originais, compensou a transferência e deixou 90 €/0 €/60 €, com 5 € do objetivo em aberto. |
| A33 | Falha de atualização durante edição a 1366 e 390 px. O aviso e o acesso a «Atualizar dados» ficaram dentro do diálogo. Montante e descrição sobreviveram à atualização. A confirmação verificou os dados novos. |
| A43 | `Iniciar.cmd` e o comando de migração recusaram a v6 sintética sem autorização, com digest e inventário da pasta iguais. Foram exercitadas migração autorizada, falha intermédia, repetição e recuperação em quarentena. |

## Verificação

Windows, Node 24.22.3, pnpm 11.25.0, Playwright 1.64.1 e Edge 157.0.4341.60. A build e os testes HTTP e de navegador da entrega usaram `OMEUMES_BUILD_DIR=.next-mu3-check`. Os dados de ensaio foram criados no diretório temporário, em pastas `omeumes-test-*`. Os dois servidores da prova concorrente foram processos Next distintos com portas efémeras e a mesma base. A ferramenta Graphify não estava disponível no PATH. Foram usados `rg` e o verificador de imports do projeto.

| Comando | Resultado |
|---|---|
| `pnpm quality` | Fronteiras e ciclos em 85 módulos. Lint em 99 ficheiros e formatação em 66. |
| `pnpm typecheck` | TypeScript terminou com código 0. |
| `pnpm test` | 197/197 em 11 ficheiros. |
| `pnpm build` | Build otimizada concluída com Next.js 16.4.6. |
| `pnpm test:integration` | 29/29 em seis ficheiros. Inclui 19 testes dedicados à MU3. |
| `pnpm test:e2e --workers=4 --output=test-results/mu3-verified` | 102/102 no Edge, em 3,6 minutos. Inclui cinco percursos MU3. |

Os registos completos dos comandos desta ronda estão em `.git/mu3-verification/final-*.log`.

**Revisão independente.** GPT-6.2-Astra High calculou os resultados a partir de uma fixture v6 e de SQL independente da projeção do produto. Detetou a falta do ID no JSON da inversa migrada, a possibilidade de fechar uma obrigação com base antiga, vínculos de inversas alteráveis por SQL direto, colisões entre chaves de pessoas diferentes e a hora de atribuição a ser tratada como hora de uma compra antiga. Foram corrigidos os casos e os testes independentes passaram. GPT-6.2-Sol Medium preparou os cenários de dois processos e os percursos de navegador. Os oito ensaios de processos passaram na execução independente. O limite de utilização do agente interrompeu a sua inspeção visual. A integração corrigiu o isolamento inicial da sessão nas fixtures de navegador e realizou a inspeção visual.

**Inspeção renderizada.** As capturas sintéticas mostram o aviso de duplicado e o rascunho com falha de atualização a 1366 × 768 e 390 × 844. A inspeção levou a compactar o aviso em mobile e a recuperar o contraste do original no histórico. O percurso paginado mostra a data efetiva e o original junto da compensação. A correção foi confirmada também pelo formulário. A regressão revelou que o foco do comprovativo de pagamento podia fechar o menu móvel entretanto aberto. O comprovativo continua anunciado, e a abertura do menu conserva o foco. Ficheiros `mu3-aviso-*.png`, `mu3-releitura-*.png` e `historico-compensatorio-1366.png`. [Capturas da verificação final](../../test-results/mu3-verified/)

## Limites e reversão

A MU3 utiliza pertenças sintéticas para os casos concorrentes. A gestão de partilha, o tratamento definitivo da retenção, e a reconciliação de restrições após restauro continuam nas fases correspondentes. Quando um ajuste ou reforço já tem alocações ou associações dependentes que a correção invalidaria, a transação recusa a correção e indica a dependência a resolver primeiro. A revisão visual usou o Edge com dimensões mobile emuladas. A base diária v6, a instância em execução, os backups, a chave Windows, o Excel e a configuração doméstica ficaram fora dos ensaios.

Para verificar a reversão de código, executar `git -c core.autocrlf=false apply -p2 --reverse --check .git/mu3-reference/mu3.patch` a partir da raiz do projeto. Para a aplicar, repetir sem `--check`. O patch foi gerado comparando duas cópias do código e dos testes, sem preparar ficheiros no índice normal. Uma aplicação inversa foi verificada numa cópia física separada contra a lista e os SHA-256 dos 175 ficheiros da referência. A reversão de código não muda a versão de um ficheiro SQLite.

## Ficheiros afetados

O inventário exato da MU3 está em `.git/mu3-reference/files.txt`.

- Arranque, dados e API. `scripts/next.mjs`, `src/server/{storage,transition,local-files,assign-legacy}.mjs`, `src/server/http.ts`, `src/modules/spaces/{access.ts,schema-mu3.mjs,ui/SpacesHome.tsx}`.
- Finanças. `src/modules/finance/client/usePersistentStore.ts`, contratos de comandos, domínio e infraestrutura de versões, recibos, histórico e duplicados. A interface altera `FinanceWorkspace.tsx`, `AccountFunding.tsx`, `MovementHistory.tsx`, `MovementNotices.tsx` e `src/app/globals.css`.
- Testes. Novas suites `mu3-finance.test.ts`, `mu3-concurrency.test.ts` e `mu3-concurrency.spec.ts`. Regressões de MU2, recuperação e histórico adaptadas às compensações persistidas. Configuração do Biome e diretório de resultados Playwright atualizados.
- Documentação. `README.md` e este relatório.
