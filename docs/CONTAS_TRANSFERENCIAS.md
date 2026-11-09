# Quanto transferir para cada conta — ajuste pedido pelo utilizador

Implementado em 03/11/2026, após a fase 3. Pedido pontual no separador Contas; não inicia a fase 4 nem altera persistência ou movimentos existentes.

## Comportamento

Botão **Quanto transferir para cada conta**, no início de Contas. Abre uma vista do mês selecionado com cada conta principal, despesas por pagar, reforços de poupança por realizar, saldo calculado atual e montante a transferir.

`a transferir = max(0, despesas por pagar + reforços por realizar − saldo atual)`

Consulta de domínio em `src/domain/funding.ts`, usando as consultas e a aritmética segura em cêntimos existentes. Valores em falta permanecem desconhecidos; total incompleto não é apresentado como exato. Linhas sem conta são identificadas. Contas arquivadas mantêm os seus compromissos históricos visíveis. Origens restritas não financiam outras contas. Despesas pagas por reservas não são somadas de novo à conta principal; reservas insuficientes/por indicar têm aviso próprio. Receitas futuras não são antecipadas. A referência inicial não é alterada: o cálculo usa o plano atual e a execução confirmada do mês.

**Transferências a fazer** mostra origem, destino e montante. **Preparar esta transferência** preenche os três campos no formulário existente. Consultar, preparar e cancelar não criam movimentos. Confirmação usa a transferência atómica/idempotente existente; o valor indicado atualiza após commit e mantém-se coerente depois de recarregar. A sugestão distribui excedentes pela ordem das contas apresentadas. Não movimenta dinheiro no banco.

Exemplo independente: despesas 150 €, reforço 50 €, saldo 100 € → transferir **100 €**. Pagamento parcial de 40 € deixa despesas 110 €, reforço 50 €, saldo 60 € → continuam a faltar **100 €**. Recebimento confirmado de 25 € reduz a falta a **75 €**. Uma transferência recebida de 100 € elimina a falta; a anulação restaura-a. Saldo numa reserva ou noutra conta não compensa esta falta por si só.

## Verificação inicial realmente executada

- `node node_modules/vitest/vitest.mjs run`: **130/130 passaram**, incluindo 8 novos casos de cálculo financeiro com expectativas independentes e todas as regressões de domínio/persistência/API.
- `node node_modules/typescript/bin/tsc --noEmit`: passou, incluindo repetição após os testes de navegador.
- `node scripts/next.mjs build`: passou, sem avisos.
- `node scripts/test-browser.mjs funding.spec.ts`: **2/2 passaram**, desktop 1366×768 e móvel 390×844.
- `node scripts/test-browser.mjs`: **38/38 passaram**, base temporária `omeumes-test-browser-KeBwgQ`. Inclui leitura, cancelamento sem efeitos, destino/montante preenchidos, origem explícita, transferência confirmada, atualização do cálculo, saldo em falta resolvido no formulário e conservação após recarga nos dados locais de teste.
- `Iniciar.cmd`: versão atualizada disponível em **127.0.0.1:3000**, usando a mesma base local. O servidor próprio foi parado antes da build e reiniciado; o servidor alheio em 3001 foi preservado. Nenhum teste usou a base local do utilizador.

Inspeção visual realizada das capturas renderizadas de resumo em desktop e móvel e da indicação Santander no móvel. Sem excesso horizontal; diálogo com deslocação vertical, foco devolvido ao botão e formulário de transferência existente preservado. Capturas exclusivamente de exemplos:

- [Resumo desktop](capturas/contas-transferencias/resumo-1366.png)
- [Resumo móvel](capturas/contas-transferencias/resumo-390.png)
- [Valor Santander desktop](capturas/contas-transferencias/santander-1366.png)
- [Valor Santander móvel](capturas/contas-transferencias/santander-390.png)

Na implementação inicial não foram lidos/importados montantes de Excel nem modificados ficheiros de referência. A funcionalidade trabalha com os dados do mês na aplicação. Mantêm-se as limitações da fase 3, incluindo a falta de backup/restauro/exportação antes da utilização financeira diária.

## Correção do percurso completo — 03/11/2026

A implementação inicial mostrava apenas o destino e a falta. O utilizador esclareceu que o botão também deve indicar a origem. Foi consultada em leitura a rotina VBA `CalcularTransferenciasEntreContas`, no módulo `Module3` do Excel de referência indicado nos requisitos. Não foi executada qualquer macro, aberta sessão Excel, importado histórico ou alterado o ficheiro. A rotina separa saldos após despesas positivos/negativos e percorre destinos e origens por ordem, retirando de cada origem apenas a parcela alocada. Esse comportamento foi aplicado aos dados e ao contrato atuais da aplicação.

A referência foi verificada antes/depois com SHA-256, conservando exatamente `bcd1a471cb47d552ac9ef9ccaebe2bf1cb96e2b81009788def40b48fe996b1b9`. A consulta leu apenas a associação do botão, a rotina e os nomes/definições de colunas da tabela de saldos; nenhum valor mensal foi importado.

Regras das sugestões:

- Excedente da origem = máximo de zero e saldo atual menos despesas/reforços ainda por realizar nessa origem.
- Percorrer destinos e origens na ordem das contas apresentada; sugerir o mínimo entre a falta do destino e o excedente ainda não alocado da origem. Uma origem pode financiar vários destinos; um destino pode receber de várias origens. Cada parcela é descontada da disponibilidade simulada, sem modificar movimentos.
- Origens desconhecidas, restritas ou arquivadas não financiam sugestões; contas arquivadas em falta continuam visíveis e pedem reativação. Dinheiro reservado e receitas futuras não são usados.
- Se há um compromisso sem conta, suspender sugestões: poderia pertencer a uma origem e consumir o seu excedente. O compromisso em falta permanece visível.
- Mostrar expressamente o que continua a faltar depois das sugestões. Não apresentar «tudo equilibrado» quando o dinheiro é insuficiente ou há valores desconhecidos.
- O botão de cada sugestão preenche origem, destino e montante, mas só a confirmação explícita regista a transferência existente. Cancelar não movimenta dinheiro. O plano é recalculado com os dados confirmados e depois de recarregar.

Exemplos independentes: origem com 500 € e compromissos próprios de 450 € só contribui 50 €. Para um destino em falta de 100 €, sugerir esses 50 € e indicar outros 50 € ainda por cobrir. Com duas origens de 120 €/30 € livres e destinos que precisam de 100 €/80 €, sugerir 100 € da primeira para o primeiro, 20 € da primeira para o segundo e 30 € da segunda para o segundo; faltam 30 € no segundo. Nenhuma parcela é reutilizada.

Verificação final desta correção:

- `node node_modules/vitest/vitest.mjs run`: **135/135 passaram**, incluindo cinco novos casos de origens, múltiplos percursos, insuficiência, desconhecidos/arquivo/restrição, suspensão por conta em falta e anulação.
- `node node_modules/typescript/bin/tsc --noEmit`: passou.
- `node scripts/next.mjs build`: passou, sem avisos.
- `node scripts/test-browser.mjs`: **39/39 passaram**, incluindo origem/destino/montante preenchidos em desktop e móvel, consulta/cancelamento sem gravação, múltiplas origens e insuficiência residual, confirmação persistida e recarga. Base temporária `omeumes-test-browser-dGFo8M`, sem usar dados locais reais.

Inspeção efetiva das capturas atualizadas do percurso em desktop 1366×768 e móvel 390×844: origem e destino legíveis no topo, montante destacado e formulário com os três campos preenchidos. O teste de insuficiência usa valores sintéticos e verifica quatro percursos, com 3.115 € ainda por cobrir. Sem alterações ao esquema, movimentos existentes ou garantias/limitações da fase 3. Não inicia outra fase.

## Revisão da fase 6 — 07/11/2026

O diálogo apresenta os percursos sugeridos e os valores por cobrir. O detalhe de saldos e valores por indicar está em **Contas**. **Já fiz as transferências** grava todas as sugestões mostradas num comando atómico com recibo de idempotência. O lote usa a data predefinida dos registos do mês, que é hoje para o mês corrente e o primeiro dia para outro mês. Para indicar outra data, use **Preparar esta transferência**.

Para uma despesa debitada noutra conta à ordem, o cálculo dá prioridade à conta prevista no registo. O valor é limitado pela falta da conta pagadora, pelo valor da compra e pelo excedente da origem. Transferências posteriores registadas no mesmo sentido reduzem essa prioridade. Os restantes percursos seguem a ordem de Contas. Esta preferência usa os movimentos ativos no mês e exclui compras já incluídas, despesas planeadas por uma reserva e origens arquivadas ou restritas.

## Correção da confirmação em lote — 07/11/2026

A lista mostra as rotas, o que fica por cobrir e os valores por apurar. A confirmação indica a contagem, o total e a data efetiva editável. Para registar só parte da lista ou usar datas e montantes diferentes, cada rota continua a poder abrir o formulário individual.

O pedido de lote transporta o mês, a revisão e as rotas revistas com IDs e montantes em cêntimos. Dentro da transação SQLite, o servidor confere a revisão e recalcula as rotas antes de escrever. Um conflito mantém a lista antiga visível para consulta, explica a mudança e permite rever a lista atual. O recibo do comando permite repetir o mesmo pedido após perda da resposta.

No ensaio com duas sessões, os 50 € revistos ficaram desatualizados após a conferência do saldo para 35 €. A confirmação antiga foi recusada. Depois de nova revisão, ficou apenas uma transferência de 3.500 cêntimos na data escolhida, com origem a 0 cêntimos e destino a 3.500 cêntimos após recarregar.
