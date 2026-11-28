# Prompt de arranque — fase 2 de O meu mês

## Objetivo e fronteiras

Quero que executes integralmente a **fase 2 — contrato e domínio financeiro** do projeto **O meu mês**, nesta pasta. A fase 1 já tem um protótipo navegável. Agora é necessário especificar, implementar e testar as regras financeiras que irão sustentar a persistência futura. Não fiques apenas por um documento ou por uma revisão: corrige o domínio e liga-o ao adaptador de demonstração existente, preservando a experiência da interface.

Lê, por esta ordem:

1. `AGENTS.md`.
2. `docs/REQUISITOS.md`.
3. `docs/PLANO.md`.
4. `docs/UX.md` e `docs/FASE_1_RESULTADOS.md`, incluindo as revisões após os testes do utilizador.
5. `README.md`, este prompt, o domínio, o adaptador temporário, os componentes que consomem os cálculos e os testes existentes.

Inspeciona e preserva trabalho existente. Trabalha apenas neste projeto. O projeto **Finanças Pessoais** é independente: não o consultar, alterar ou reutilizar. Não modificar Excel, importar histórico, publicar, ligar bancos ou integrar IA no produto.

**Conclui apenas a fase 2.** Não implementar SQLite, migrações, backups, restauro ou utilização com dados reais: pertencem às fases seguintes. Mantém a demonstração em memória e o aviso de dados de exemplo. Não acrescentes localStorage como persistência. Não expandas a agenda ou os catálogos para antecipar a fase 4.

Resolve autonomamente escolhas técnicas rotineiras. Se existir uma ambiguidade material de negócio, identifica-a com um exemplo e pergunta antes da parte dependente; continua o trabalho independente. Não transformes uma limitação do protótipo numa regra financeira sem fundamento nos requisitos.

## 1. Contrato explícito antes das alterações principais

Cria `docs/DOMINIO_FINANCEIRO.md`, com termos, entidades, identidades, invariantes, fórmulas e efeitos de cada operação. Usa exemplos com resultados esperados calculados independentemente da implementação. Atualiza o documento à medida que validas a solução.

Reutiliza a estrutura TypeScript e as dependências existentes. Mantém separados domínio, adaptador em memória e apresentação. O domínio deve ser testável sem React, navegador ou base de dados. Evita uma reescrita geral ou novas camadas sem necessidade. Consulta documentação oficial se uma versão ou API o exigir.

Formaliza pelo menos:

- Período mensal, contas principais, contas restritas, reservas e saldos iniciais mensais.
- Modelo Base, plano atual e referência inicial imutável, com os nomes e metadados necessários para preservar o significado histórico.
- Recebimentos, pagamentos, compras individuais, atualização do total acumulado, reforços, transferências próprias, ajustes de conferência, conclusão, correções e anulações.
- IDs estáveis e referências válidas, independentes de nomes e ordem visual. Catálogos partilhados não podem reescrever valores ou referências iniciais de meses anteriores.
- Valores monetários em cêntimos inteiros, validação de limites seguros e parsing português. Diferenciar valor desconhecido de zero explícito, também nas somas e indicadores.
- Datas de calendário e pertença ao mês, sem conversões UTC que mudem o dia.
- Contrato dos comandos, erros e resultados. A interface deve consumir os mesmos cálculos que os testes.

## 2. Regras e efeitos obrigatórios

### Meses e planos

Cada mês é isolado. Um mês novo recebe definições do Modelo Base, sem saldos, reservas acumuladas, execução, pendentes anteriores, sobras ou plano inicial guardado. Reabrir o mesmo mês não o recria. Alterar o Modelo Base não modifica meses existentes.

Pagamentos e recebimentos funcionam antes de guardar o plano inicial. Guardar essa referência é uma ação explícita, datada e não substituível por repetição. Alterações posteriores ao plano atual preservam a referência. Uma linha nova posterior tem inicial zero; um valor originalmente desconhecido mantém-se desconhecido. A remoção de uma linha não apaga a referência inicial nem o histórico relacionado.

Deriva realizado, por realizar e estado dos registos ativos e da conclusão explícita. Por realizar nunca é negativo. Distingue alteração do plano face ao inicial de diferença entre realizado e plano atual. Concluir por menos elimina a diferença em aberto; concluir por mais apresenta excesso.

### Contas, reservas e movimentos

Um reforço reduz o principal e aumenta a reserva pelo mesmo montante, sem despesa. Uma transferência própria altera origem e destino, sem rendimento ou despesa. Uma compra paga pela reserva reduz a reserva e conta uma despesa única, sem voltar a descontar o principal. Uma devolução real da reserva ao principal é outra operação explícita. Não tratar PPR como reserva moey.

Saldo calculado resulta do inicial deste mês e dos efeitos ativos nessa origem. Se faltar o inicial, não mostrar um saldo conhecido como se fosse zero. Uma conferência regista a diferença entre o observado e o calculado, com data e motivo; preserva o saldo inicial e não duplica a diferença.

O Cartão Refeição e as reservas não entram no dinheiro livre das contas principais. A suficiência deve ser verificável por origem. Um total global positivo não compensa insuficiência em Santander. Documenta a política de elegibilidade de contas restritas e identifica o que era apenas simplificação das fixtures; não infiras permissões apenas pelo nome de uma categoria.

Formaliza os efeitos de editar ou anular pagamentos, recebimentos, reforços, transferências, totais e ajustes. Pode manter-se na interface a correção por anulação e novo registo, mas o contrato deve ser explícito. Uma correção deve reverter a origem original e aplicar a nova de forma coerente. Não alterar silenciosamente a natureza ou o destino de execução já registada através da edição do plano.

Trata dependências: por exemplo, anular um reforço cuja reserva já foi utilizada. Uma operação inválida deve falhar sem efeitos parciais e com uma mensagem que permita resolver o problema. Não inventar dinheiro para permitir a anulação.

### Compras, totais e sobras

Compras conhecidas de 40 € e atualização do total gasto para 60 € representam gasto de 60 €, com ajuste conciliado de 20 €. A conta que financia a diferença é explícita. Um total inferior às compras conhecidas exige resolução explícita, sem apagar compras silenciosamente.

Define a sequência de atualizações, reduções válidas de ajustes e compras posteriores: uma compra nova de 10 € depois do total de 60 € passa o gasto para 70 €. Distingue esse caso do detalhe de uma compra já incluída no total; não adivinhes a intenção nem dupliques o gasto. Correções devem conservar a coerência dos montantes e das origens, mesmo com mais de uma conta envolvida.

As sobras são a soma líquida dos orçamentos pertinentes menos os respetivos gastos, incluindo excessos. Montantes desconhecidos tornam o resultado incompleto. Este resultado é distinto do saldo bancário depois dos compromissos e não pode aumentar o Fundo Emergência automaticamente.

### Atomicidade e idempotência

Aplica todos os efeitos de uma operação ou nenhum. Valida IDs, relações, montantes, datas e estado antes de confirmar. Testa também os comandos inválidos diretamente no domínio, sem depender das validações dos formulários.

A repetição do mesmo pedido não duplica pagamentos ou efeitos. Define o âmbito da chave de idempotência e o comportamento de reutilização com conteúdo diferente. Uma tentativa falhada não consome uma confirmação válida posterior. Anular e voltar a registar é uma nova operação legítima e deve funcionar.

Preserva a confirmação conjunta de **saldos iniciais em falta e movimento**: não presumir zero, não substituir saldos conhecidos e não aplicar saldos se o movimento falhar. Cancelar no formulário não modifica o estado.

### Lembretes existentes

Mantém o contrato já demonstrado: lembretes não alteram saldos ou totais, adicionar ao plano não significa pagar, associação é por ID e não por nomes iguais. Reabrir um mês não duplica ocorrências. Consultar o futuro não avança uma data global. Preserva os testes de dias inexistentes e de 29 de fevereiro, sem expandir a agenda nesta fase.

## 3. Preservar as melhorias de experiência

Não redesenhes a aplicação nesta fase. Preserva:

- O saldo inicial da conta/reserva pode ser indicado no próprio formulário de reforço, com explicação visível. Uma reserva vazia requer 0,00 € explícitos.
- O nome opcional da compra, como Continente ou Mercearia, pertence ao registo e aparece na confirmação e no histórico de Comida. Não implementar agora o campo de notas apenas sugerido para o futuro.
- O cartão «Orçamentos do dia a dia», o detalhe por orçamento e a distinção entre valor ainda por gastar e disponibilidade bancária.
- Mês visível, erros compreensíveis, foco, formatos portugueses e atualização imediata e coerente dos valores.

Se uma correção de domínio exigir ajustar a interface, faz a alteração mínima necessária e verifica o fluxo renderizado. Não reintroduzas erros genéricos que obriguem a procurar uma solução noutra página.

## 4. Testes e revisão crítica

Executa primeiro os testes existentes para estabelecer o estado de partida; a fase 1 registou 25 testes de cálculo e 16 de navegador, mas confirma os resultados atuais. Os testes existentes não são prova suficiente da correção do motor.

Cria uma matriz de aceitação com valores esperados independentes. Inclui todos os 12 casos financeiros do prompt da fase 1 e, pelo menos:

1. Edição/anulação de cada operação, sem duplicação, com restauração dos efeitos corretos.
2. Reforço de 100 € a partir de principal 1.000 € e reserva zero: 900 €/100 €. Compra de 40 € pela reserva: 900 €/60 €, despesa 40 €. Anulação dependente válida e inválida.
3. Inicial 100 €, pagamento 40 €, observado 55 €: ajuste −5 €, aplicado uma vez; correção/anulação desse ajuste.
4. Snapshot 100 €, atual 120 €, realizado 40 €: inicial 100 € e falta 80 €. Linhas posteriores, valores desconhecidos, renomeações e arquivo sem reescrever a referência.
5. Compras 40 €, total 60 €, compra posterior 10 €: gasto 70 €. Totais repetidos, ajuste reduzido validamente, total abaixo das compras, correções e financiamento por várias origens.
6. Sobra de 50 € num orçamento e excesso de 10 € noutro: sobra líquida 40 €, sem reforço automático. Caso negativo, plano desconhecido e compromisso concluído por menos.
7. Confirmação conjunta de iniciais e reforço, cancelamento, insuficiência, origem inválida e tentativa de substituir inicial conhecido: nenhum efeito parcial.
8. Pedido repetido, pedido falhado seguido de correção, chave reutilizada com conteúdo diferente e pagamento novo após anulação.
9. Isolamento de meses, alteração do Modelo Base, referências arquivadas, IDs inexistentes e remoção de linha inexistente sem afetar outra.
10. Valores `0,10` e `1.234,56`, limites seguros, datas inválidas, datas de outro mês, origem igual ao destino, origem/destino incompatíveis e conta restrita.

Acrescenta testes de invariantes quando úteis: transferências e reforços conservam património; despesa reduz o património uma vez; uma operação rejeitada deixa o estado intacto. Não derives os valores esperados chamando a própria função testada.

Faz uma revisão crítica depois da implementação, procurando contraexemplos e divergências entre contrato, cálculos e interface. Regista os problemas encontrados e corrige-os. Não marques testes como corretos apenas por refletirem o código existente, nem retires requisitos para os fazer passar.

Executa os checks de tipos, build, testes de domínio e testes de navegador relevantes, incluindo os fluxos críticos já existentes. Usa exclusivamente fixtures isoladas. Não apagar bases de dados nem testar com dados reais. Se alterares apresentação ou mensagens, inspeciona o resultado no navegador em desktop e móvel e guarda evidência das alterações. Regista exatamente o que não foi possível verificar.

## 5. Entrega e paragem

Entrega:

- Domínio financeiro implementado e reutilizado pelo protótipo, com adaptador ainda em memória.
- `docs/DOMINIO_FINANCEIRO.md`, coerente com o comportamento implementado e com exemplos verificáveis.
- Testes de aceitação, invariantes e regressão com expectativas independentes.
- `docs/FASE_2_RESULTADOS.md` com decisões, problemas corrigidos, comandos e resultados efetivamente executados, limitações e pontos necessários para a fase 3.
- README e estado do plano atualizados, sem apresentar esta fase como pronta para guardar finanças reais.

Na resposta final, resume o que foi formalizado/corrigido, os testes que passaram e eventuais decisões de negócio ainda pendentes. Para no fim da fase 2. Não iniciar automaticamente a persistência ou qualquer fase seguinte.
