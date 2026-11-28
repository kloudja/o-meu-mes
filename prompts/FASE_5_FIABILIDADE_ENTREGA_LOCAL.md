# Prompt de arranque da fase 5 de O meu mês

Implementa a **Fase 5 — Fiabilidade e entrega local** no projeto **O meu mês**. Começa por ler `AGENTS.md`, `docs/REQUISITOS.md`, `docs/PLANO.md`, `docs/PERSISTENCIA.md`, `docs/DOMINIO_FINANCEIRO.md`, `docs/FASE_4_RESULTADOS.md` e `README.md`. Reutiliza a infraestrutura existente e confirma as APIs relevantes na documentação oficial das versões instaladas.

## Percursos a completar

1. **Criar um backup consistente.** Disponibiliza uma ação clara nos dados locais para criar uma cópia SQLite recuperável da base em uso, incluindo gravações confirmadas em WAL. Usa um mecanismo suportado pelo SQLite e testa-o com uma escrita concorrente. A cópia deve preservar meses, catálogos, Modelo Base, lembretes, planos iniciais, movimentos, efeitos e recibos de idempotência. Cria ficheiros com nomes únicos e só anuncia sucesso após concluir e verificar a cópia. Mostra a data e a forma de localizar o ficheiro. Uma falha deve conservar a base de origem e permitir repetir com segurança.
2. **Restaurar e verificar num destino separado.** Implementa um percurso documentado e reproduzível para selecionar o backup, validá-lo e restaurá-lo para um novo caminho. Mostra claramente qual é o ficheiro de origem e qual é o destino antes da execução. Recusa destinos existentes, o caminho ativo e caminhos públicos. Verifica identidade da aplicação, versão, integridade e relações da base. Testa um backup válido, um ficheiro danificado ou incompatível e uma falha de escrita. Abre efetivamente a aplicação com a base recuperada e confirma que é utilizável. Se o restauro ficar num utilitário Windows, documenta a sequência completa e a forma de regressar ao caminho habitual.
3. **Exportar dados em formato portátil.** Disponibiliza a exportação nos dados locais e indica o formato e o âmbito antes de iniciar. Usa um formato documentado e versionado que preserve IDs, meses, datas, cêntimos inteiros, montantes por indicar e referências históricas. Inclui planos, movimentos, contas, reservas e lembretes. Explica a diferença entre a exportação para consulta e a cópia SQLite usada para restauro. Se houver CSV, protege células interpretáveis como fórmulas e testa acentos, separadores e valores em falta.
4. **Simplificar o arranque no Windows.** Valida `Iniciar.cmd` e o percurso de primeira abertura, arranque normal e reabertura após paragem. Mantém o servidor em `127.0.0.1` por omissão. Se a porta estiver ocupada, escolhe outra e mostra o endereço, preservando o processo que ocupa a porta. Uma base inválida, permissões insuficientes ou uma migração falhada devem apresentar uma mensagem acionável e preservar os dados. Revê as instruções de arranque, paragem, localização da base e recuperação.

## Experiência e limites

Dá prioridade à clareza, ao menor número de passos e à adaptação ao telemóvel. Usa rótulos distintos para **Criar backup**, **Exportar dados** e **Restaurar para outro ficheiro**. Mostra o que está em curso, o resultado confirmado e a ação seguinte em caso de erro. Verifica foco, teclado, alvos de toque e ausência de deslocação horizontal. Mantém a demonstração e os dados locais separados.

Preserva a base local existente e as regras financeiras. Usa exclusivamente dados fictícios e bases temporárias isoladas nos testes. A entrega termina nesta fase. A validação com o utilizador pertence à Fase 6.

## Verificação e entrega

- Executa um ensaio de recuperação de ponta a ponta. Cria uma base fictícia com dois meses, um plano inicial, execução, uma transferência, uma reserva e lembretes tratados. Cria o backup, restaura noutro caminho e reinicia o servidor sobre a cópia. Compara os dados de origem e destino e verifica saldos e totais com valores esperados independentes. Repete um pedido já confirmado e verifica que os efeitos continuam a ocorrer uma só vez.
- Verifica a exportação, o arranque com porta ocupada e as falhas de backup e restauro. Confirma que uma falha não produz um ficheiro apresentado como concluído nem altera a origem ou um destino existente.
- Percorre os novos fluxos na interface renderizada em desktop e a **360 e 390 px**. Corrige os problemas encontrados, repete os percursos afetados e guarda capturas com dados fictícios.
- Executa `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration` e `pnpm test:e2e`. Regista os comandos, resultados, capturas, passos de recuperação e limitações em `docs/FASE_5_RESULTADOS.md`. Atualiza `README.md` e o estado em `docs/PLANO.md` conforme os critérios atingidos.

**Só dá a fase por concluída depois de abrir a aplicação sobre uma cópia restaurada e verificar que os dados e os cálculos coincidem.**
