# Contrato financeiro — fase 2

Estado: implementado e validado em 03/11/2026. Apenas demonstração em memória; não habilita utilização financeira real.

## Identidade, dinheiro e calendário

IDs de catálogo, linhas, ocorrências e operações são estáveis; nomes e posições não são chaves. Um período é `AAAA-MM` (anos 0001–9999); datas são dias gregorianos `AAAA-MM-DD`, sem conversões UTC. Execução e conferência pertencem ao mês; a data de captura da referência é uma data civil válida, podendo ser posterior ao mês.

Montantes são inteiros em cêntimos, entre zero e `Number.MAX_SAFE_INTEGER`; diferenças podem ser negativas dentro do mesmo limite. Parsing português usa inteiros exatos, incluindo `0,10` → 10 e `1.234,56` → 123456. Agregações rejeitam overflow. `null` significa desconhecido, nunca zero. Subtotais de saldos conhecidos são identificados como incompletos; compromissos desconhecidos e sobras desconhecidas não são convertidos em zero.

## Meses e referências

Cada mês copia as definições do Modelo Base, sem execução, saldos iniciais, reservas acumuladas, snapshot ou pendentes anteriores. Reabrir conserva o mês. Linhas removidas conservam identidade e metadados numa coleção histórica; não podem ser reutilizadas como outra linha. Referências arquivadas continuam válidas nas linhas existentes; não podem ser escolhidas em linhas novas. O snapshot explícito contém linhas e metadados de contas, categorias e reservas e não pode ser substituído. Eventos conservam a natureza e os nomes à data do registo.

Realizado = soma das contribuições ativas da linha. Por realizar = zero se explicitamente concluída; caso contrário `max(0, plano atual − realizado)`, ou desconhecido se falta o plano. Estado resulta da execução e conclusão. Alteração de plano = atual − inicial; desvio de execução = realizado − atual. Linha posterior ao snapshot tem inicial zero; inicial originalmente desconhecido continua desconhecido.

## Origens e efeitos

Saldo = inicial mensal + efeitos ativos. Inicial em falta mantém saldo desconhecido. Reforço transfere principal para reserva da mesma conta: −X/+X, sem despesa. Pagamento por reserva: −X apenas na reserva, despesa X. Transferência própria: −X/+X, sem rendimento nem despesa. Reservas só se movimentam para/de o seu principal; para outra conta, registar primeiro a devolução. Recebimentos entram numa conta, não diretamente numa reserva. PPR não está modelado como reserva.

Suficiência é verificada na origem concreta; principal, reserva e origem restrita não se compensam. Por decisão do utilizador nesta fase, o Cartão Refeição é retirado da demonstração. O contrato mantém a segregação técnica de origens restritas e rejeita a sua execução até existir política explícita, sem inferir elegibilidade por categorias.

Conferência: observado − calculado gera um efeito datado com motivo e conserva ambos os valores. Inicial 100 €, pagamento 40 €, observado 55 €: ajuste −5 €, saldo 55 €. O inicial continua 100 €. Anular o ajuste restaura 60 €; corrigir observado para 58 € substitui o efeito por −2 €. A correção na mesma origem conserva a base calculada da observação original: se entretanto houve outro pagamento de 10 €, o saldo corrigido é 48 €, não 58 €. Se a correção muda de origem, reverte o efeito antigo e confere o saldo calculado atual da nova origem. Não há reprodução automática de saldos por data: datas são etiquetas civis da operação; a base é capturada no registo. Anular um movimento anterior não recalcula os ajustes posteriores; se a observação também estiver errada, corrigi-la explicitamente.

## Compras e total acumulado

Total é uma observação explícita do gasto acumulado. Compras 40 €, total 60 €: ajuste +20 € financiado pela origem escolhida. Compra nova posterior 10 €: gasto 70 €. Repetir total 70 € não movimenta dinheiro. Total 60 € passa a reduzir o ajuste em 10 €, sem apagar compras. Reduções só devolvem à origem que financiou ajustes ainda não detalhados; se essa origem não tiver parcela suficiente, rejeitar e indicar que deve escolher a origem correta ou anular/corrigir os ajustes.

Detalhar uma compra já incluída exige escolher explicitamente um ajuste positivo e a mesma origem. O detalhe consome a parcela não detalhada, mas contribui zero para gasto e saldo, pois já foi contabilizado. Compra nova e detalhe são intenções distintas. Uma redução não pode baixar o total das compras conhecidas, incluindo detalhes. Dependências impedem anular um ajuste ainda utilizado por reduções ou detalhes; anular primeiro os dependentes. Várias contas nunca são compensadas implicitamente.

Cada atualização guarda o total observado, o realizado e as compras conhecidos antes dela. A correção conserva essa base: compras 40 €, observação 60 €, compra posterior 10 €, corrigir observação para 65 € → gasto 75 €. Corrigir uma compra de 40 € para 30 € conserva o ajuste previamente registado de 20 €, ficando 50 €; os totais posteriores não são recalculados silenciosamente. As reduções alocam ajustes da origem escolhida do mais recente para o mais antigo. A correção de um ajuste com dependentes exige resolver primeiro esses dependentes. O detalhe também pode ser corrigido/anulado, alterando apenas a parcela identificada, sem novo efeito monetário.

Sobras = soma líquida dos planos dos orçamentos variáveis menos gasto, incluindo excessos. Plano desconhecido torna sobra desconhecida. Conclusão por menos termina o compromisso mas não elimina a sobra orçamental. 50 € de sobra e 10 € de excesso = 40 €; não cria reforço. Disponibilidade bancária desconta compromissos de cada origem principal, sem antecipar recebimentos.

## Comandos, atomicidade e correções

`transact(estado, comando, chave)` devolve novo estado; em erro lança `DomainError` com código e mensagem pt-PT, preservando integralmente o estado recebido. O adaptador publica apenas o resultado completo. Objetos recebidos são copiados. IDs, relações, montantes, datas, natureza e estado são validados no domínio.

Chave de idempotência: âmbito do período selecionado (abertura de mês usa âmbito próprio). Mesmo conteúdo canónico devolve o estado sem repetir efeitos; conteúdo diferente com a mesma chave é erro. Falha não reserva a chave. Após anulação, novo pagamento usa nova chave. Um duplo clique conserva a chave do formulário.

Iniciais em falta podem acompanhar execução/transferência. Só as origens da operação, existentes e sem inicial, são aceites; inicial conhecido não é substituído. Validar e publicar iniciais e movimento juntos. Cancelamento não envia comando.

Anulação marca o evento sem o apagar, revertendo todos os efeitos. Correção é anulação e novo evento no mesmo comando atómico, com vínculo ao original; pode mudar montante, data e origem, mas preserva tipo e linha. A interface pode continuar a oferecer anulação e novo registo. Dependências de totais e insuficiência resultante impedem a operação inteira. Não é permitido anular um reforço de 100 € se já foram gastos 40 € de uma reserva inicialmente vazia: daria −40 €. Anular primeiro a compra permite anular o reforço. Editar plano nunca reclassifica execução; natureza, reserva de destino e modo variável ficam protegidos quando existe histórico.

O comando `correct` é disponível no domínio e testado; a interface conserva a correção por **Anular** e novo registo. Nesse percurso, o novo registo é uma nova observação, com a base atual. Os dois comandos separados não são apresentados como uma única operação atómica. A data e o motivo de uma conferência são obrigatórios. Um pagamento/recebimento/reforço zero só serve para conclusão explícita; transferência zero é inválida. Um total igual ao atual é aceite sem novo evento (pode concluir explicitamente). Falta de inicial também impede recebimentos, podendo ser resolvida no mesmo formulário. O âmbito do pedido não inclui continuidade entre meses.

### Entidades e consultas

`State` contém catálogos, Modelo Base, definições recorrentes, meses e recibos de idempotência. `Month` contém plano atual, linhas removidas, iniciais por origem (`a:ID`/`r:ID`), eventos, ocorrências e snapshot opcional. `Event.amount` é a contribuição para realizado; transferências, conferências e detalhes contribuem zero. `Event.deltas` contém os efeitos monetários por origem, independentes do plano atual. Um detalhe usa `purchaseAmount` e alocação ao ajuste; as correções ligam `corrects`/`replacedBy`. IDs de eventos são únicos no mês, derivados da chave do pedido.

`balance`, `realized`, `pending`, `obligations`, `budgetRemainder`, `savingPending`, `sourceTotals` e `summary` são as consultas usadas pela interface e pelos testes. `sourceTotals` e `summary.available` são subtotais **conhecidos**, com a incompletude indicada na interface; `obligations`, despesas/reforços em aberto e sobra retornam `null` quando dependem de montantes desconhecidos. Disponibilidade depois dos compromissos principais é subtotal conhecido menos compromissos conhecidos; fica `null` se algum desses compromissos ou a sua origem forem desconhecidos. Saldo em falta é sempre `null` individualmente. Nenhum subtotal implica suficiência de outra origem.

Conta/categoria vazias no plano representam metadados por indicar, nomeadamente num lembrete; um ID não vazio inexistente é rejeitado. Execução exige uma origem válida e inicial conhecido. Catálogos não apagam referências; conta existente não muda de principal para restrita. Novas seleções de referências arquivadas são rejeitadas; referências antigas continuam editáveis e executáveis. Uma linha com execução ativa não pode ser removida; depois de anular, a remoção conserva registos e referência inicial. Se estava associada a lembrete, este reabre para associação explícita ou reposição da mesma linha.

### Erros e integração

`DomainError.code` distingue, entre outros, `MONEY_LIMIT`, `AMOUNT`, `DATE`, `PERIOD`, `SOURCE`, `RESERVE`, `FUNDS`, `INITIAL_EXISTS`, `TOTAL_SOURCE`, `TOTAL_BELOW_PURCHASES`, `DETAIL`, `DEPENDENCY`, `HISTORY` e `IDEMPOTENCY`. O texto permite resolver o problema; erros de origem assinalam esse campo e mensagens em históricos são colocadas na área visível. O adaptador `useDemoStore` continua síncrono, com uma referência ao estado mais recente para confirmação repetida. Sem React no domínio, sem armazenamento de navegador e sem base de dados.

## Lembretes

Ocorrências por ID de definição e período. Lembretes e dispensas têm efeito financeiro zero. Adicionar cria apenas plano; associar exige ID de despesa existente. Nenhuma categoria é inferida do nome; a categoria pode ficar por indicar ao adicionar lembrete. Datas 29/30/31 inexistentes usam último dia do mês; anual de 29 de fevereiro usa 28 em ano comum. Consultar futuro não altera definição global.

## Exemplos de aceitação

85/85 → falta 0; 100/40 → falta 60; 85/92 concluído → excesso 7, falta 0; 85/80 concluído → desvio −5, falta 0. Snapshot 100, atual 120, execução 40 → inicial 100, falta 80. Nova linha 30 → inicial 0. Principal 1000/reserva 0, reforço 100 → 900/100; compra 40 → 900/60, despesa 40. Matriz, comandos efetivamente executados e revisão crítica em [FASE_2_RESULTADOS.md](FASE_2_RESULTADOS.md).

## Integração da fase 3 — 03/11/2026

As regras acima mantêm-se. `canonical` foi exportada para verificar recibos duráveis antes da revisão otimista. O servidor recebe comandos, lê o estado atual sob `BEGIN IMMEDIATE`, chama o mesmo `transact` e grava o resultado e recibo juntos. O domínio continua sem SQLite ou React. Ver `PERSISTENCIA.md`.

Foi acrescentado apenas o comando de metadados `reserve`: finalidade e conta principal explicitamente escolhidas, sem saldo presumido, execução ou compromisso. É necessário para preparar dados locais vazios sem copiar reservas das fixtures. Uma reserva existente não muda de conta; conta arquivada/restrita não pode ser escolhida. Não é um módulo de investimentos ou expansão da agenda. Os contratos monetários não foram alterados.

## Sugestões de transferências — ajuste de 03/11/2026

Consulta pura `accountFunding`: para cada conta principal calcular falta e excedente depois dos seus compromissos atuais. O excedente elegível é distribuído pelos destinos em falta, na ordem das contas, consumindo apenas a disponibilidade simulada. A sugestão identifica origem/destino/montante e conserva a parte não coberta. Não grava eventos e não muda a validação das transferências manuais. Origens desconhecidas/restritas/arquivadas e reservas ficam excluídas; compromissos sem conta suspendem a distribuição. Testes e referência de consulta em `CONTAS_TRANSFERENCIAS.md`.
