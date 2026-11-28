# Prompt de arranque da fase 6 de O meu mês

Executa a **Fase 6 — Validação de utilização e acabamento** no projeto **O meu mês**. Começa por ler `AGENTS.md`, `docs/REQUISITOS.md`, `docs/PLANO.md`, `docs/UX.md`, `docs/DOMINIO_FINANCEIRO.md`, `docs/FASE_5_RESULTADOS.md` e `README.md`. A Fase 5 já verificou a recuperação. Nesta fase, quero experimentar as tarefas do dia a dia e corrigir os pontos em que a interface me obriga a procurar, hesitar ou repetir trabalho.

## Preparar o ensaio

Abre a aplicação local no navegador com uma base de ensaio isolada, identificada como fictícia, e dá-me o endereço. Prepara um cenário que permita experimentar os percursos abaixo. Inclui um mês com plano e movimentos, outro sem execução, uma reserva, um saldo por indicar e uma conta com falta de dinheiro. Usa a demonstração para exploração rápida e a base de ensaio para verificar gravação, reabertura e backup. Mantém a base habitual e o Excel de referência intactos.

Percorre primeiro as tarefas na interface renderizada. Depois convida-me a experimentar os percursos prioritários e apresenta cada tarefa pelo objetivo, sem indicar logo onde clicar. Se eu ficar bloqueado, regista onde aconteceu e dá-me o passo necessário para continuar. Pede feedback breve e concreto sobre o que eu esperava encontrar ou ver mudar. Podes avançar entretanto com correções de problemas que conseguiste reproduzir.

## Percursos a validar

1. **Pagar e corrigir.** Regista um pagamento integral e outro parcial ou diferente. Confirma que é fácil perceber a conta, o montante, a data, o valor em falta e o efeito no saldo. Localiza o histórico e anula um registo de ensaio. Verifica a execução antes de guardar o plano inicial e confirma que uma edição posterior do plano conserva a referência guardada.
2. **Registar uma compra.** Acrescenta uma compra individual e atualiza o total acumulado da mesma rubrica. Verifica que é fácil escolher a ação certa e perceber quanto ficou realizado e quanto foi ajustado. Usa 40 € em compras e um total acumulado de 60 € para confirmar que o gasto final é 60 €.
3. **Encontrar e usar uma reserva.** Localiza uma finalidade, identifica o saldo disponível e regista um reforço ou uma despesa pela reserva. Verifica que se distingue o saldo da conta principal do saldo reservado e que um saldo inicial em falta indica o que preencher.
4. **Perceber e resolver uma insuficiência.** Identifica qual conta tem falta, quanto falta e porquê. Consulta **Quanto transferir para cada conta**, confirma que a origem, o destino e o montante sugeridos são claros e verifica o que fica por cobrir. Abre a preparação da transferência e cancela. Confirma que a consulta e o cancelamento preservam os saldos.
5. **Mudar de mês, tratar um lembrete e guardar uma cópia.** Abre outro mês e confirma que é fácil identificar o período e perceber o que veio do Modelo Base. Trata um lembrete e verifica o efeito esperado no plano. Localiza **Criar backup**, confirma a indicação do ficheiro e verifica se a diferença entre backup SQLite e exportação JSON é clara.

## Corrigir e voltar a verificar

- Dá prioridade ao que impede uma tarefa, induz um erro financeiro ou acrescenta passos repetidos. Regista o problema observado, o percurso e o efeito. Corrige com a menor alteração suficiente e repete o percurso para confirmar a melhoria. Se uma sugestão mudar uma regra financeira aprovada, regista-a para decisão do utilizador.
- Verifica hierarquia, densidade e alinhamento de valores. Mantém o mês identificável, as ações principais visíveis e o detalhe acessível sem criar uma grelha extensa. Usa português de Portugal, EUR e datas portuguesas.
- Testa em desktop e a **360 e 390 px**, incluindo teclado, ordem e visibilidade do foco, abertura e fecho de diálogos, retorno do foco, rótulos, contraste, alvos de toque e ausência de deslocação horizontal. Confirma que erros, carregamento, saldos por indicar, insuficiências e gravações confirmadas são compreensíveis e indicam o passo seguinte.
- Preserva os cálculos, os cêntimos inteiros, o isolamento entre meses, a referência inicial imutável e as garantias de gravação e recuperação. Mantém o trabalho nesta fase, em localhost e com dados fictícios. Qualquer integração, importação ou publicação exige um pedido separado.

## Verificação e entrega

- Executa `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration` e `pnpm test:e2e`. Confere os valores esperados nos percursos afetados e guarda capturas com dados fictícios após a inspeção da interface.
- Regista em `docs/FASE_6_RESULTADOS.md` o que foi verificado tecnicamente, o que experimentei contigo, as dificuldades observadas, as correções, os resultados dos testes e o que ficou pendente. Atualiza `README.md` se o percurso de utilização mudar e `docs/PLANO.md` conforme o estado real.

**Só dá a fase por concluída depois de eu experimentar os percursos prioritários, confirmar o resultado dos ajustes e os testes passarem. Se ainda faltar a minha validação, deixa o ensaio pronto e indica as tarefas concretas que faltam experimentar.**
