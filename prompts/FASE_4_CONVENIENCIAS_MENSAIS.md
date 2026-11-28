# Prompt de arranque da fase 4 de O meu mês

Implementa a **fase 4 — Conveniências mensais** no projeto **O meu mês**. Completa os percursos do Modelo Base, da abertura de meses, dos Pagamentos recorrentes e das sobras mensais, da interface à persistência. Começa por ler `AGENTS.md`, `docs/REQUISITOS.md` e `docs/PLANO.md`. Consulta também `docs/UX.md`, `docs/DOMINIO_FINANCEIRO.md`, `docs/PERSISTENCIA.md`, `docs/FASE_3_RESULTADOS.md` e `docs/CONTAS_TRANSFERENCIAS.md`. Usa os fluxos e testes existentes como ponto de partida e melhora os pontos de fricção que encontrares nos percursos desta fase.

## UI, UX e responsividade são critérios de aceitação

**Dá prioridade à experiência de utilização desde a primeira decisão.** Começa por experimentar os fluxos existentes em desktop e telemóvel. Identifica onde se perde contexto, onde é difícil encontrar a ação seguinte e onde há cliques ou confirmações dispensáveis. Usa essas observações para orientar as melhorias e volta a experimentar os percursos depois das alterações.

- Mantém o mês selecionado, o estado atual e a próxima ação fáceis de encontrar. Torna inequívoca a diferença entre uma definição habitual, um lembrete do mês, uma linha planeada e um pagamento registado.
- Dá prioridade às ações mais frequentes. Agrupa informação relacionada, usa rótulos claros e deixa detalhes secundários disponíveis a pedido. Mantém nomes de contas, datas e montantes legíveis com dados realistas.
- Adapta a composição ao ecrã. Em telemóvel, usa listas ou cartões legíveis, alvos de toque confortáveis e formulários que permitam rever e confirmar com o teclado aberto. Verifica a navegação, a seleção do mês, os diálogos e as ações principais sem deslocação horizontal da página.
- Garante navegação por teclado, ordem de foco lógica, foco visível, contraste e mensagens compreensíveis sem depender da cor. Usa português de Portugal, euros e datas locais.
- Inclui estados vazios com um próximo passo, valores por indicar, validação junto do campo, gravação em curso, sucesso após confirmação, conflitos, falhas e repetição segura. Os estados devem explicar o que aconteceu e como continuar.

## Percursos a completar

1. **Modelo Base e abertura de mês.** Facilita a consulta, criação e edição de receitas, despesas e reforços habituais. Explica o efeito de uma alteração nos meses ainda por criar. Cada mês novo parte do Modelo Base, com os seus próprios saldos por indicar e execução vazia. Reabrir um mês conserva o plano, os lembretes e os dados já guardados. Garante a ausência de duplicados em reaberturas, duplos cliques e pedidos concorrentes. A referência inicial continua a ser guardada por ação explícita e preserva os nomes, as datas e os valores capturados.
2. **Pagamentos recorrentes.** Completa a gestão de definições mensais e anuais com nome, data de referência, estado ativo e montante, conta e reserva opcionais. Um montante desconhecido fica por indicar. Apresenta os lembretes do mês selecionado, incluindo os que estão fora do Modelo Base. Oferece **Adicionar ao plano**, **Associar a movimento existente** e **Dispensar neste mês**, com efeitos e estados claros. Identifica ocorrências e associações por IDs estáveis e confirma a associação explicitamente. Um lembrete por si só tem efeito financeiro zero. A geração usa o período selecionado. Ao consultar um mês futuro, conserva a data de referência da definição. Mantém e documenta a regra existente de usar o último dia quando o dia 29, 30 ou 31 é inexistente, incluindo 28 de fevereiro em anos comuns para uma obrigação anual de 29 de fevereiro.
3. **Sobras mensais.** Torna fácil perceber a sobra líquida de Comida, Mimos e Outras Despesas, incluindo excessos e montantes por indicar. Distingue a sobra do orçamento do dinheiro disponível em cada conta após os seus compromissos. Mostra a possível contribuição para o Fundo de Emergência como indicação. O fundo aumenta apenas após um reforço registado explicitamente pelo utilizador.
4. **Continuidade dos fluxos de Contas.** Verifica a regressão de **Quanto transferir para cada conta**. Cada sugestão deve indicar origem, destino e montante, usar o excedente após os compromissos da origem e mostrar qualquer falta residual. Preparar a transferência preenche os três campos. A gravação depende de confirmação explícita.

Mantém as regras financeiras existentes, o isolamento mensal, a separação entre dados locais e demonstração, os cêntimos inteiros e a persistência segura. Trabalha dentro dos limites do `AGENTS.md`. A entrega termina na fase 4. Backup, restauro e exportação pertencem à fase 5.

## Verificação e entrega

- Testa os cálculos com resultados esperados independentes. Cobre reabertura sem duplicados, mudanças de Modelo Base com meses já existentes, datas curtas e anos bissextos, montantes desconhecidos, as três ações dos lembretes, sobras com excessos e conservação do plano inicial. Confirma também os efeitos no plano e nos saldos depois de recarregar.
- Percorre a interface renderizada com dados fictícios em desktop e em ecrãs móveis de **360 e 390 px**. Verifica pelo menos a abertura de um mês, a edição do Modelo Base, as ações dos lembretes, a leitura das sobras e a consulta de uma transferência sugerida. Inspeciona a hierarquia, os nomes longos, o toque, os formulários e o foco. Corrige os problemas de utilização encontrados e verifica novamente os percursos afetados. Guarda capturas representativas e regista qualquer cenário que não tenha sido verificado.
- Executa os testes relevantes, a verificação de tipos e a build. Usa dados fictícios e bases de teste isoladas. Regista as melhorias de UI e UX, os cenários verificados, os comandos e resultados, as capturas e as limitações em `docs/FASE_4_RESULTADOS.md`. Atualiza o estado em `docs/PLANO.md` de acordo com os critérios atingidos.

**A fase só está concluída quando os percursos funcionarem de ponta a ponta e forem fáceis de entender e usar tanto em desktop como em telemóvel.**
