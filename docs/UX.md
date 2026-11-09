# UX — fase 1

Nota de continuidade: a secção «Estado e limites» descreve a entrega original da fase 1. O produto atual tem os ambientes SQLite e demonstração descritos no README.

## Alternativas antes da implementação

1. **Lista mensal com resumo por conta.** Indicadores no topo; receitas, despesas e reforços em separadores; cada linha mostra plano atual, realizado e falta. Um painel lateral revela insuficiências por conta. Comparação inicial e histórico ficam no detalhe.
2. **Quadro por estados.** Colunas «Por realizar», «Parcial» e «Concluído», com cartões. Facilita triagem, mas desloca ações quando os estados mudam e dificulta comparar valores e contas, sobretudo em ecrãs pequenos.

Escolha: alternativa 1. Mantém as ações no mesmo lugar e separa o orçamento do dinheiro no banco. Não usa uma grelha horizontal extensa.

## Percursos e hierarquia

- Mês: selecionar/criar período → introduzir saldos em Contas → editar plano → guardar referência inicial explicitamente. Receber/pagar funciona antes dessa referência.
- Pagamento integral: uma ação na linha, data do dia dentro do período e conta predefinidas; confirmação visível e detalhe para anular. Pagamento parcial/diferente abre formulário curto com conclusão opcional.
- Comida, Mimos e Outras Despesas: compra ou total acumulado. O detalhe distingue compras de ajuste conciliado; valor inferior às compras exige corrigir compras ou cancelar.
- Poupanças: saldo da reserva separado do reforço mensal; despesa financiada pela reserva afeta apenas essa origem. Transferências e conferências são operações explícitas.
- Recorrentes: definições editáveis e ocorrências mensais; adicionar, associar ou dispensar, sem pagamento automático.
- Modelo Base: alterações só nos meses criados depois. Definições: catálogo pesquisável, edição e arquivo sem apagar referências.

Mês selecionado e situação do plano permanecem no cabeçalho. Quatro indicadores: saldo principal utilizável (exclui reservas e cartão), despesas em aberto, reforços em aberto e disponibilidade após compromissos. Não antecipar receitas por receber. Valores desconhecidos são «Por indicar», e tornam os totais incompletos.

## Linguagem visual e estados

Fundo marfim, superfícies brancas, texto verde muito escuro e verde petróleo para ação primária. Âmbar identifica informação em falta/insuficiência, sempre com texto. Contas recebem pontos suaves consistentes e nome completo. Sem fontes ou recursos remotos.

Tokens CSS para cor, espaço (4/8/12/16/24/32), raios, tipografia de sistema e estados. Números tabulares, alinhados à direita. Separadores separam despesas de reforços. Detalhe progressivo evita colunas adicionais.

Cobrir: vazio, estado de abertura, saldo em falta, validação junto ao campo, parcial, concluído, excesso, insuficiência, cancelamento, anulação e exemplo reposto. Diálogos nativos com foco inicial, contenção de foco, Escape e retorno à ação. Teclado e foco visível. Layout desktop 1366×768/1920×1080, navegação horizontal e cartões empilhados em 390×844.

## Estado e limites

Exclusivamente exemplos sintéticos em memória, separados em `src/data/fixtures.ts`. Recarregar repõe exemplos; não existe base de dados nem localStorage. Cada mês recebe cópia do Modelo Base, sem saldos nem execução. Referência inicial é imutável no adaptador. A fase 2 continua necessária para consolidar o contrato financeiro.

Datas recorrentes: usar o último dia do mês quando o dia de referência não existir (31→28/29/30; 29 de fevereiro anual→28 em ano comum). Gerar a partir do período consultado, sem avançar a data da definição.

## Revisão após experimentação do utilizador — 02/11/2026

- Um reforço num mês sem saldos conhecidos abre o formulário com os saldos em falta no início. Identifica conta principal e reserva, explica que o saldo antecede os movimentos do mês e que uma reserva vazia deve receber 0,00 € explicitamente. Não presume zero nem obriga a procurar outra página. Cancelar não aplica estes valores; confirmar aplica saldos e operação em conjunto, sem efeitos parciais se houver erro.
- Compras individuais têm «Nome da despesa (opcional)», por exemplo Continente ou Mercearia. O nome identifica o registo no histórico e na confirmação, mantendo o orçamento Comida. Não foi acrescentado um campo de notas; fica como possibilidade para uma revisão futura.
- As sobras passaram de texto semelhante a rodapé para um cartão próprio, «Orçamentos do dia a dia». Distingue o valor ainda por gastar da disponibilidade bancária depois dos compromissos, mostra o cálculo por orçamento e explica que a possível sobra depende das compras que ainda venham a acontecer. Excessos reduzem o valor líquido; montantes previstos desconhecidos tornam o cálculo incompleto. Não gera reforços automáticos.

## Continuidade na fase 2 — 03/11/2026

A estrutura, hierarquia, saldos no formulário de reforço, nome de compra e cartão dos orçamentos foram preservados. Ajustes mínimos exigidos pelo contrato: «Detalhar compra já incluída num total», escolha explícita do ajuste e origem, redução de total apenas na origem financiadora, valores desconhecidos propagados aos compromissos, nomes do snapshot visíveis e erros de origem no campo correto. Erros de anulação num histórico longo entram na área visível do diálogo. Conta arquivada continua disponível no pagamento de linhas que já a referenciam.

Por pedido explícito do utilizador, o Cartão Refeição foi retirado da demonstração e dos textos da interface. Capturas e resultados desta etapa em `FASE_2_RESULTADOS.md`; os resultados anteriores ficam como registo histórico da fase 1. Mantém-se exclusivamente estado em memória.

## Continuidade na fase 3 — 03/11/2026

A estrutura e os fluxos das fases 1 e 2 mantêm-se. `/demo` identifica exemplos em memória; `/` identifica SQLite local e a falta de backup/restauro da fase 5. Carregamento, gravação em curso, sucesso após commit, erro e repetição de tentativa incerta são explícitos. Controlos de confirmação ficam bloqueados enquanto há gravação; conflitos mantêm os campos e atualizam o último estado confirmado. O formulário de reforço continua com iniciais no topo, zero explícito e confirmação conjunta. Os erros e a repetição são acessíveis no diálogo nativo, incluindo no móvel. Capturas e inspeção em `FASE_3_RESULTADOS.md`.

## Ajuste pedido em Contas — 03/11/2026

Acrescentado um acesso visível «Quanto transferir para cada conta», com necessidade por conta principal após descontar saldo atual. O detalhe separa despesas/reforços/saldo e permite preparar o formulário de transferência com destino e valor, exigindo origem e confirmação explícitas. Saldos e planos desconhecidos são assinalados; não se antecipam receitas ou compensações entre reservas/contas. Inspeção desktop/móvel e testes documentados em `CONTAS_TRANSFERENCIAS.md`.

### Origem e destino da sugestão

Após esclarecimento do utilizador, o topo do diálogo mostra «Transferências a fazer», com montante, «De» e «Para» e ação que preenche o formulário completo. A lista por conta mantém o detalhe. Faltas que o excedente não cobre ficam explícitas. Os percursos são sugestões e a consulta não regista movimentos. Capturas desktop/móvel atualizadas foram inspecionadas.

## Continuidade na fase 6 — 04/11/2026

Ensaio SQLite separado, com faixa «Ensaio — dados fictícios guardados» e título de separador próprio. Retirada a indicação obsoleta «Fase 4» do rodapé. Títulos distinguem dados locais, ensaio, recuperação e demonstração.

Na inspeção móvel, Pagar media 35 px de altura. Pagar/Registar, detalhe, anulação no histórico, comparação e ações do plano passaram a ter alvos de pelo menos 44 px nas larguras móveis; o nome reserva espaço para as ações. O texto secundário foi escurecido de #697872 para #5d6d65, preservando a paleta, para melhorar o contraste nos fundos suaves.

O teste Shift+Tab no primeiro controlo de um diálogo reproduziu perda de foco para o navegador. O diálogo agora percorre circularmente os controlos habilitados nas duas direções; Escape e retorno ao elemento de abertura mantêm-se. O aviso por conta passou a explicar a necessidade de transferência sem pressupor que a disponibilidade global seja positiva.

Inspeção renderizada e regressão em desktop e a 360/390 px. Não constitui aceitação pelo utilizador: a experimentação acompanhada e a confirmação dos ajustes estão pendentes. Ver FASE_6_RESULTADOS.md.


## Adaptação móvel doméstica — 05/11/2026

Menu compacto no topo, com aria-expanded/aria-controls, foco inicial, Escape e retorno ao botão. No móvel, as linhas dão prioridade a nome, conta, estado e falta. Plano atual e realizado permanecem no detalhe. O pagamento integral mostra a origem, o montante e a data junto ao botão. Por indicar, zero, parcial, concluído e excesso têm texto próprio.

Formulários ocupam o ecrã inteiro em larguras até 700 px. A área central desloca-se, com cabeçalho e ações preservados e interactive-widget=resizes-content. Foram capturados e inspecionados ecrãs a 360/390 px e com 440 px de altura. O teclado físico dos Android continua pendente.

Na entrada doméstica abre o mês civil atual. Quando falta, exige uma ação explícita para o abrir ou permite consultar os guardados. A atualização de dados é manual, evitando renovar a sessão por polling de fundo. Gravações incertas conservam a tentativa original. Conflitos exigem recarregar e reabrir a edição.
