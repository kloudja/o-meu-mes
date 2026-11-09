# Resultados da fase 3 — O meu mês

Concluída em **03/11/2026**. **Persistência local integrada; continua a ser um protótipo, sem entrega para finanças do dia a dia.** Paragem exclusivamente no fim da fase 3. Fases 4 e 5 não foram iniciadas.

## Resultado

- SQLite 3.53.4 através de `node:sqlite` do Node 24.22.1, sem novas dependências. Migrações 1 e 2, verificação de esquema/formato, integridade e relações. Base desconhecida/indisponível não é substituída.
- Repositório e serviço de comandos ligados à interface existente. O servidor lê sob `BEGIN IMMEDIATE` e chama o mesmo domínio financeiro. Grava iniciais, eventos, efeitos, observações, alocações, correções e recibo numa transação. O navegador não substitui o estado da base.
- Persistidos: contas/categorias/reservas, Modelo Base, definições recorrentes, meses, planos/linhas removidas, iniciais, snapshots/metadados históricos, eventos/efeitos, alocações, bases de observação, correções/anulações, ocorrências e recibos de idempotência. Cêntimos inteiros e null preservados.
- Revisão global otimista, replay verificado antes de rejeitar revisão antiga, atualização por foco/5 segundos, respostas com revisão monotónica e período explícito. Duplo clique não cria outro pagamento. Tentativas diferentes durante uma confirmação não são anunciadas como se tivessem sido executadas.
- Resposta incerta conserva comando e chave em memória e numa entrada própria de localStorage, removida quando resolvida. SQLite continua a fonte de verdade financeira. Recuperação verificada após recarga e fecho do separador, abrindo outro no mesmo navegador/origem. Repetição exata não cria nova execução.
- `/` usa dados locais; `/demo` usa fixtures em memória. Inicialização local só tem os seis nomes de contas, 14 categorias confirmadas e mês vazio. Sem reservas presumidas, saldos, compromissos, montantes ou histórico de exemplo. Repor exemplos é exclusivo da demonstração e foi verificado contra a base local antes/depois.
- Preservadas as seis áreas, fluxos, nome opcional da compra, detalhe incluído, cartão de orçamentos, iniciais no reforço, zero explícito e mensagens de dependência. Carregamento, confirmação em curso, sucesso, falha e repetição seguros são explícitos. Não foi reintroduzido o Cartão Refeição.
- Acrescentado apenas o registo de uma reserva com finalidade/conta explicitamente escolhidas. Sem ele, preparar poupanças numa base vazia exigiria copiar as fixtures ou manipular a base. Não cria saldo, execução, reforço planeado ou agenda; não permite mover uma reserva existente para outra conta. É preparação inicial desta fase, não expansão de investimentos/agenda.

Contrato completo em [PERSISTENCIA.md](PERSISTENCIA.md). As regras financeiras anteriores foram preservadas; `DOMINIO_FINANCEIRO.md` regista a exportação de canonical e o comando mínimo de metadados de reserva.

## Estado inicial efetivamente confirmado

Leitura realizada de AGENTS, requisitos/plano, prompt, domínio/resultados fase 2, UX/resultados fase 1, README, motor, fixtures, adaptador, componentes, scripts e testes. A pasta **não é um repositório Git**. O levantamento não encontrou bases financeiras existentes nesta pasta. Existia um servidor em 127.0.0.1:3001; não foi terminado nem o separador do utilizador recarregado.

Antes das alterações principais: TypeScript passou; **88/88 testes de domínio passaram**; build passou; **23/23 testes de navegador passaram** num servidor separado em 3002. Uma primeira execução teve 22/23: houve erro HTTP 500 de recurso durante a reconstrução da build, que foi executada enquanto o servidor antigo era usado pelos testes. A repetição foi feita sobre build estável, sem compilar em simultâneo, e passou. Esse resultado intermédio não é apresentado como aprovação.

`PERSISTENCIA.md` foi criado antes da implementação principal e atualizado após as verificações. Não foram consultados/importados montantes do Excel nem consultado o projeto Finanças Pessoais.

## Matriz de aceitação com valores independentes

Todos os montantes abaixo são fictícios. Os valores esperados são constantes calculadas independentemente; não são obtidos pela função em teste. Bases novas em `%TEMP%/omeumes-test-*`, preservadas para diagnóstico. Sem apagar dados para fazer testes passar.

| Pedido da fase 3 | Evidência executada / resultado |
|---|---|
| 1. Base nova e migrações | Só metadados e mês vazio; reaplicar conserva estado; v1→v2 conserva recibo de teste; falha após DDL reverte versão/tabela parcial; ficheiro inválido/base alheia/versão futura preservados e recusados |
| 2. Encerrar/reiniciar servidor | Processo Next realmente terminado e novo processo iniciado sobre a mesma base: estado completo, saldo 890 €, gasto 60 €, snapshot, três eventos, alocação de 10 € e recibo de replay permanecem |
| 3. Principal/reserva | 1000/0, reforço 100 → 900/100; despesa 40 → 900/60, gasto 40; reabertura conserva; anular reforço dependente falha sem efeitos; anular compra e reforço repõe 1000/0; devolução explícita testada |
| 4. Conferência e base original | Inicial 100, compra 40, observado 55: −5; compra posterior 10; corrigir observado para 58: saldo 48; inicial 100 e base calculada 60 preservados depois de reabrir |
| 5. Snapshot e histórico | Inicial 100/atual 120/realizado 40 → falta 80; nomes originais em snapshot/evento; renomeação/arquivo, linha posterior e remoção conservados; SQL UPDATE/DELETE e novo snapshot não substituem referência |
| 6. Totais/alocações | Compra 40, total 60, compra posterior 10 → 70; corrigir total antigo para 65 → 75; redução pela origem errada rejeitada; detalhe de 10 não muda gasto/saldo; alocação persistida bloqueia anulação do pai |
| 7. Iniciais conjuntos | Mês novo com iniciais em falta; insuficiência não guarda iniciais/recibo; corrigir mesma chave funciona; inicial conhecido não é substituído; cancelamento coberto no navegador; falhas injetadas também usam iniciais e reforço conjuntos |
| 8. Falhas transacionais/resposta perdida | Injeção após catálogo, iniciais, eventos, recibo e antes do commit: rollback integral e chave reutilizável. Injeção após commit: replay após reabrir. Navegador perde resposta de POST realmente confirmado e recupera sem novo pagamento |
| 9. Idempotência durável | Duplo clique; mesma chave em dois processos; conteúdo diferente rejeitado; chave após falha reutilizável; nova chave após anular; replay aceita revisão antiga; resultado verificado depois de reabrir/reiniciar |
| 10. Concorrência | Dois processos, cada um com despesa 80 sobre 100: um 200, outro 409; saldo 20, nunca −60. Revalidar segundo pedido falha por fundos. Duas criações de snapshot/mês não duplicam; revisão e replay preservam referência. Dois separadores conservam pagamento e edição |
| 11. Validação/âmbito | Outro mês não anula evento deste; FKs mensais rejeitam referência inválida; origem inexistente, fracionário/negativo/overflow/data 31 de novembro recusados sem efeitos; 9007199254740991 cêntimos conservado exato; null preservado. Campos extra, estado e deltas manipulados recusados na API |
| 12. Indisponibilidade | Bloqueio SQLite real → 503 sem alteração; caminho ausente não cria ficheiro vazio; EACCES/gravação recusada injetados → rollback e mensagem sem caminho; formulário de navegador conserva campos e repete com segurança |
| 13. Separação | Build e testes não criaram `data/` do projeto. Executor de testes exige caminho temporário identificado. Demonstração paga, repõe e recarrega sem alterar a resposta completa da base persistida. Sem endpoint de reset |
| 14. Fluxos de navegador | Pagamento, parcial, conclusão inferior (40+30=70) e superior (40+70=110), recebimento, anulação, reforço com iniciais, compra pela reserva, compras/totais/detalhes, conferência, transferência, snapshot, novo mês, recarga, metadados, modelo e recorrências: passaram |

`correct` atómico foi verificado pela camada persistida para pagamento, recebimento, reforço, transferência, conferência e total, com vínculos de substituição. Na interface mantém-se Anular e novo registo como duas confirmações separadas. As 88 regressões financeiras mantêm as expectativas e os casos de datas, agregações, sobras, detalhe, dependências e origens restritas isoladas.

## Comandos realmente executados e resultados finais

| Comando / verificação | Resultado |
|---|---|
| `node --version` | v24.22.1 |
| `git status --short` | Não existe repositório Git; não foram criados commits |
| `Get-NetTCPConnection -State Listen` / inventário de processos | Servidor existente em 3001 preservado; servidores próprios e de teste identificados |
| `node node_modules/typescript/bin/tsc --noEmit` | Passou |
| `node node_modules/vitest/vitest.mjs run` | **122/122 passaram**: 88 domínio e 34 repositório/migrações/API |
| `node scripts/next.mjs build` | Compilação, TypeScript e geração de páginas passaram; build final sem avisos |
| `node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts` | **2/2 passaram**: reinício real e dois processos concorrentes |
| `node scripts/test-browser.mjs persistence.spec.ts` | Execução intermédia: **11/11 passaram** |
| `node scripts/test-browser.mjs` final | **35/35 passaram**: 23 regressões e 12 percursos persistidos; Edge, build compilada, base temporária `omeumes-test-browser-aaHMUT` |
| `Iniciar.cmd` final e `Invoke-WebRequest http://127.0.0.1:3000` | Servidor local preparado, esquema 2, HTTP 200; demonstração separada em `/demo` |
| `Test-Path data` depois de build e suites, antes do arranque local | **False**: nenhuma base local criada por build/testes |
| `node --input-type=module ... SELECT sqlite_version()` em `:memory:` | SQLite 3.53.4 |
| Arranque do script absoluto a partir de `%TEMP%`, `OMEUMES_TEST_MODE=1`, caminho temporário explícito, `--port 3001` | Migração 2; escolheu 3002 por 3001 ocupada; HTTP local; sem terminar processo alheio |

Os avisos NO_COLOR/FORCE_COLOR são do executor de testes. Não houve pageerror nos percursos finais; os testes de falha geram deliberadamente HTTP 503/409/422 e falha de rede. As regressões de demonstração continuam a verificar ausência de erros de consola e pedidos externos.

## Revisão crítica e contraexemplos corrigidos

- **Origin em Next:** os testes reais revelaram que request.url pode ter hostname interno diferente do Host enviado, recusando escritas legítimas com 403. A validação passou a comparar Origin com o Host HTTP local, incluindo porta; testes de origem externa/ausente continuam a recusar.
- **Ações durante a seleção do mês:** clique imediato podia ser ignorado enquanto o comando anterior estava em curso. Acrescentados estado aria-busy e bloqueio dos controlos relevantes, incluindo seleção; o adaptador só partilha uma confirmação concorrente se chave e conteúdo coincidirem. O teste aguarda a confirmação real do mês.
- **Base ausente:** abrir SQLite por omissão podia criar um ficheiro vazio antes de falhar. Ligações normais agora exigem ficheiro existente; só migração/arranque o podem criar. Teste verifica que o ficheiro ausente continua ausente.
- **Tentativa perdida ao fechar separador:** uma primeira solução em sessionStorage só resistia à recarga. Foi substituída por entradas próprias de pedidos pendentes em localStorage, com recuperação noutro separador e notificações entre separadores. Não guarda snapshots nem substitui a base financeira. Replay após fecho foi verificado no navegador.
- **Falha ao guardar a identificação no navegador:** uma exceção síncrona podia deixar a promessa de gravação retida. A promessa é instalada antes dessas exceções; não se envia o pedido se não for possível preservar a identidade. Teste injeta recusa de armazenamento, verifica zero eventos/campos preservados e confirma a tentativa seguinte sem bloqueio.
- **Esquema e histórico:** catálogo inicial só é aplicado na criação, não num catálogo existente vazio; quick_check/FKs/formato são verificados antes do commit da migração; triggers protegem snapshots também contra UPDATE/DELETE direto.
- **Teste de linha nova arquivada:** uma fixture de teste tentava escolher uma conta já arquivada. O teste passou a usar outra conta válida, mantendo a rejeição financeira existente.
- **Teste de Repor exemplos:** nome acessível da ação da barra inclui o símbolo de reposição. O seletor foi corrigido para esse nome, sem alterar o produto ou retirar a verificação de isolamento.

## Interface renderizada e capturas inspecionadas

Inspeção efetiva de capturas de exemplos, desktop **1366×768** e móvel **390×844**. As regressões também verificam **1920×1080**, seis áreas, teclado/foco, diálogos, erros de dependência acima do rodapé e ausência de excesso horizontal. A interface mantém tipografia, cores, hierarquia, lista mensal, reservas e cartão dos orçamentos.

| Estado | Desktop | Móvel |
|---|---|---|
| Carregamento inicial | [captura](capturas/fase-3/carregamento-1366.png) | [captura](capturas/fase-3/carregamento-390.png) |
| Iniciais no reforço, incluindo zero explícito | [captura](capturas/fase-3/iniciais-1366.png) | [captura](capturas/fase-3/iniciais-390.png) |
| Sucesso confirmado e snapshot | [captura](capturas/fase-3/sucesso-1366.png) | [captura](capturas/fase-3/sucesso-390.png) |
| Falha, campos mantidos e repetição segura | [captura](capturas/fase-3/falha-1366.png) | [captura](capturas/fase-3/falha-390.png) |

Os períodos futuros e nomes fictícios são usados apenas na base temporária para isolar casos. Capturas não contêm finanças reais. Diálogos longos conservam deslocação vertical; o erro é trazido para a área visível e a repetição continua acessível por teclado.

## Dados locais, abertura e limites

O próprio **Iniciar.cmd** foi executado: migração 2 e arranque em **127.0.0.1:3000**. Depois das suites isoladas foi criada a base local inicial, apenas com metadados e mês vazio; nenhum teste financeiro a usou. Abrir por **Iniciar.cmd** e usar o endereço indicado. `/` guarda na base `data/o-meu-mes.sqlite` deste projeto; `/demo` contém apenas exemplos em memória. O README inclui configuração, preparação sem histórico e roteiro curto com base de ensaio separada, valores fictícios, recarga e fecho/reabertura do servidor. Não há reposição de dados locais.

Limites materiais:

- **Sem backup, restauro verificado ou exportação. Não utilizar para guardar finanças diárias.** Esses trabalhos pertencem à fase 5 e não foram implementados.
- Verificado em Edge/Windows e Node 24.22.1. Sem certificação WCAG, matriz de outros navegadores, ensaio de falha elétrica/disco cheio ou avaliação de longo prazo. EACCES e falhas intermédias foram injetados; bloqueio SQLite e reinícios foram reais.
- Base sem encriptação própria; depende das permissões Windows. Não foi alterada a ACL do computador para simular falhas. A tentativa pendente pertence ao navegador/origem; apagar esses dados ou mudar de navegador exige conferir o histórico antes de registar novamente.
- Serviço reconstrói o estado completo sob transação e usa revisão global: simples e conservador, podendo pedir revisão por alteração noutro mês. Não há otimização para grandes históricos nesta fase.
- As conveniências mensais e expansão de agenda/catálogos da fase 4 não foram desenvolvidas. Não há investimento/PPR/cotações, ligações bancárias, importação, publicação, autenticação cloud, multiutilizador ou IA.
- Não foram terminados servidores alheios, modificado qualquer Excel ou consultado o projeto Finanças Pessoais. Os processos de ensaio foram encerrados pelos próprios testes.

**Fase 3 concluída. Paragem antes da fase 4.**
