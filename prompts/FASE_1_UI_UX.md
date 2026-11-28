# Prompt de arranque — fase 1 de O meu mês

Copia o conteúdo a partir da secção seguinte para uma conversa no projeto **O meu mês**, ou pede ao Codex para ler e executar este ficheiro. Modelo recomendado: **GPT-6.1 Sol, raciocínio High**. A revisão visual pode ser feita depois numa conversa com GPT-6.1 Terra High, se disponível. Não é necessário contratar uma API de IA para a aplicação.

---

Quero que executes a primeira fase de desenvolvimento de **O meu mês**, uma aplicação local de finanças pessoais. Trabalha como responsável de produto, designer de interação e programador frontend experiente. O principal resultado desta fase é um **protótipo interativo, visualmente cuidado e utilizável em localhost**, com dados de exemplo claramente identificados. Não fiques apenas pelo plano, imagens ou componentes sem ligação. Implementa, testa e apresenta uma experiência navegável.

## 1. Contexto, autonomia e fronteiras

Este projeto é independente de outro chamado **Finanças Pessoais**. Não alteres esse projeto, não importes o seu código ou dados e não prepares uma fusão. A fusão poderá ser discutida no futuro. Trabalha exclusivamente na pasta deste projeto e nos seus artefactos.

Lê primeiro `AGENTS.md`, `docs/REQUISITOS.md` e `docs/PLANO.md`. Inspeciona a pasta e preserva trabalho existente. Se encontrares uma contradição material, indica-a antes de executar a parte dependente; decisões rotineiras de apresentação e implementação cabem-te a ti. Não interrompas o trabalho para pedir aprovação entre alternativas visuais. Entrega uma proposta concreta para eu poder experimentar.

Conclui apenas a fase 1. Não implementes já uma base de dados de produção, não importes histórico e não avances automaticamente para as fases seguintes. A arquitetura deve permitir substituir a fonte de dados de demonstração por persistência real sem reescrever os componentes principais, mas não crie camadas especulativas para uma fusão futura.

A aplicação será inicialmente utilizada só por mim, no meu computador Windows. A interface é em português de Portugal, moeda EUR, datas portuguesas e mês de referência explícito. Não preciso de autenticação, cloud, ligações aos bancos ou IA dentro da aplicação.

## 2. A qualidade da experiência é um requisito central

Venho de um Excel cujo planeamento mensal gosto de usar, mas cujas melhorias se tornaram confusas: nomes pouco claros, totais em sítios errados, colunas a mais e alterações que não tinham resultado visível. Resolve esses problemas na experiência, sem os reproduzir num website.

Não cries uma página de marketing nem um dashboard decorativo cheio de gráficos. Quero conseguir responder rapidamente: quanto tenho disponível em cada conta, o que falta pagar, o que falta reservar e se continuo com dinheiro suficiente. A diferença entre planeado e realizado tem de ser evidente.

Antes dos componentes, escreve `docs/UX.md` com os principais percursos e duas alternativas breves para o ecrã mensal. Escolhe a que reduz melhor a carga de leitura e justifica a escolha. Documenta hierarquia, estados, regras das cores e motivos para os indicadores. Não gastes a fase só neste documento: segue para implementação.

Usa um desenho sóbrio e consistente: tipografia legível, espaçamento generoso sem desperdiçar o ecrã, boa hierarquia, números alinhados à direita e ações previsíveis. Define tokens de cor, espaço, tipografia e estados. Usa fontes locais ou do sistema. As cores suaves das contas devem ser distinguíveis, acompanhadas do nome e sem prejudicar o contraste. Não uses a cor como único significado.

Evita uma tabela horizontal com muitas colunas. Mostra os valores essenciais e revela comparação e histórico num detalhe, painel ou expansão acessível. Mantém despesas e poupanças visualmente separadas. Não coloques um total de despesas dentro da lista de poupanças. Preserva a posição das ações quando os valores mudam.

Desenha primeiro para desktop de 1366 × 768 e verifica também 1920 × 1080. A 390 × 844, as ações essenciais devem continuar acessíveis, sem um enorme scroll horizontal. A primeira versão continua a ser local; esta adaptação não implica sincronização com telemóveis.

## 3. Navegação e conteúdo dos ecrãs

Propõe uma navegação curta e previsível com **Mês**, **Contas**, **Poupanças**, **Pagamentos recorrentes**, **Modelo Base** e **Definições**. Podes simplificar a organização se mantiveres todas as tarefas fáceis de encontrar. Não repitas o mesmo formulário em vários sítios com regras diferentes.

No ecrã **Mês**, mantém visível o mês selecionado, a situação do plano inicial e a ação para criar outro mês. Mostra poucos indicadores, com explicação acessível: saldo utilizável, despesas por pagar, reforços de poupança por realizar e saldo livre depois dos compromissos. Não uses património total como se fosse dinheiro livre. Um saldo global positivo não pode esconder insuficiência numa conta concreta.

Organiza receitas, despesas e reforços de poupança em secções ou separadores. Cada movimento deve permitir perceber o previsto atualmente, o realizado, o que falta e o estado. O plano inicial deve estar acessível no contexto da linha, sem obrigar a consultar outra página. Não mostres zero como se fosse um valor conhecido quando ainda falta informação.

Em **Contas**, mostra saldo inicial do mês, efeitos realizados, saldo calculado e compromissos ainda abertos. Permite simular a conferência com o banco e ver uma correção explícita. Distingue claramente conta principal, reservas e Cartão Refeição.

Em **Poupanças**, distingue o saldo da reserva do reforço planeado para este mês. Uma reserva não é uma despesa. Mostra finalidade, banco, saldo inicial introduzido no mês, reforços, utilizações e saldo atual. O detalhe pode revelar o histórico da simulação.

Em **Modelo Base**, permite editar definições habituais para meses futuros. Alterar o modelo não pode alterar meses já criados. Em **Definições**, contas e categorias devem ser fáceis de gerir; arquivar uma categoria usada é mais seguro do que apagar as referências históricas.

Todos os botões apresentados devem ter comportamento real no protótipo. Se algo ficar fora da fase, explica-o com clareza e não apresentes uma ação sem efeito. Cobre estados vazios, erros de formulário, ausência de saldo inicial, confirmações, edição e possibilidade de corrigir uma ação.

## 4. Planeamento inicial e isolamento mensal

O **Plano atual** é editável. **Guardar plano inicial** cria uma referência imutável com data. Não uses termos como “congelar” ou “por congelar”. Antes de guardar a referência, pagamentos e recebimentos já devem funcionar normalmente. Nunca bloqueies o acompanhamento por faltar o plano inicial.

Depois de guardar, alterações ao plano atual ficam identificadas. Um segundo clique não deve substituir a referência guardada. Uma despesa nova posterior tem valor inicial de zero, o plano atual que eu introduzir e um indicador claro de que foi adicionada depois.

Cada mês é independente. Um mês novo nasce do **Modelo Base**, não da execução anterior. Não copies saldos, reservas acumuladas, pagamentos pendentes, sobras, estados ou datas de execução. Pede ou permite introduzir os saldos iniciais desse mês. Não bloqueies a criação por existirem pendentes noutro mês e não os transportes para uma lista do mês seguinte.

O catálogo de contas e categorias é partilhado como definição. Os valores mensais e referências iniciais são próprios de cada mês. O estado de demonstração tem de manter esta separação, mesmo sem base de dados.

## 5. Pagamentos, recebimentos e orçamento variável

Um pagamento integral deve exigir uma ação simples, com montante, conta e data predefinidos, feedback imediato e uma forma acessível de corrigir. Para parcial ou montante diferente, abre um pequeno formulário, sem cinco ou seis campos obrigatórios. Recebimentos seguem a mesma clareza de interação.

Deriva o estado dos registos e da conclusão explícita, evitando combinações contraditórias. Um pagamento parcial não é apenas uma percentagem gráfica. Se eu concluir uma conta por um valor inferior ao estimado, não deve continuar pendente uma diferença que já não vou pagar. Uma despesa superior ao previsto tem desvio positivo e pendente zero quando concluída. Não permitas pendentes negativos.

**Comida**, **Mimos** e **Outras Despesas** aceitam compras individuais ou a atualização do total gasto até à data. Compras conhecidas de 40 € mais um total atualizado para 60 € representam 60 €, não 100 €. Torna o ajuste conciliado visível e indica a conta que financia a diferença. Se o total introduzido for inferior à soma das compras conhecidas, pede resolução explícita em vez de apagar ou inventar movimentos.

As sobras líquidas destes orçamentos, incluindo excessos, podem ser mostradas como possível reforço do **Fundo Emergência**. Isso é uma indicação. Não movas dinheiro nem cries automaticamente uma poupança. Mostra também se o dinheiro está efetivamente livre nas contas depois dos outros compromissos.

## 6. Contas, reservas e correções

Usa como referência estas contas: **ActivoBank (titulares A e B)**, **Moey! (titulares A e B)**, **Santander**, **Bankinter (titular A)**, **Cartão Refeição**. As seleções de banco e categoria devem ser pesquisáveis e fáceis de alterar. Não inventes três variantes de “Casa-OutrosGastos”.

Categorias de referência: Habitação; Serviços Essenciais; Refeições/Supermercado; Seguros; Comunicações; Mobilidade; Poupanças; Lazer/Outros; Educação/Infância; Cartões e Créditos; Alimentação; Saúde; Casa-OutrosGastos; uma categoria com nome privado. Não fundas categorias semelhantes por tua iniciativa.

As Poupanças moey são dinheiro colocado de lado. Um reforço tira valor disponível da conta principal e coloca-o na reserva, sem criar despesa. Uma transferência entre contas próprias também não é despesa nem rendimento. Se uma compra for paga por uma reserva, reduz essa reserva e conta a despesa uma única vez; não descontes outra vez o mesmo dinheiro da conta principal. Se for necessário representar uma transferência real de devolução, mostra-a separadamente.

Exemplos de finalidades: Fundo Emergência, Gasolina, IUC Carro, Seguro do Carro, Seguro Multirriscos, ADSE, Revisão Carro, Google One e Prime. A existência de uma finalidade não significa que seja um pagamento mensal. Não trates PPR como reserva moey; não implementes cotações de investimentos nesta fase.

O Cartão Refeição é restrito e fica separado do dinheiro livre para outras contas. Ao conferir um saldo bancário, especifica o âmbito: conta principal ou reserva. A diferença origina um ajuste explícito com data e motivo, sem substituir o saldo inicial nem duplicar os movimentos.

## 7. Página Pagamentos recorrentes

Esta página abrange subscrições e obrigações: **Google One**, **Amazon Prime**, **IUC**, **Seguro do Carro**, **Seguro Multirriscos**, por exemplo. Campos: nome, data de referência/pagamento, mensal ou anual, ativo e, opcionalmente, montante previsto, conta e reserva. Montante desconhecido não é zero.

Ao criar um mês, mostra os lembretes aplicáveis mesmo que não existam no Modelo Base. Um lembrete, sozinho, não entra nos totais. Oferece **Adicionar ao plano**, **Associar a movimento existente** e **Dispensar neste mês**. Adicionar não significa pagar. Evita duplicações com identificadores e associações explícitas; nomes iguais não são prova suficiente.

Criar ou reabrir o mesmo mês deve ser idempotente. Consultar um mês futuro não deve avançar uma data global e apagar ocorrências de meses anteriores. A definição recorrente é partilhada, mas os estados das ocorrências são mensais. Não modifiques referências iniciais guardadas quando se altera a definição recorrente.

Documenta uma regra previsível para dias 29, 30 e 31 que não existam no mês e para 29 de fevereiro numa obrigação anual. Mostra a data resultante ao utilizador. Implementa a simulação suficiente para validar o percurso, reservando a persistência definitiva para a fase respetiva.

## 8. Implementação e dados de exemplo

Prefere Next.js, React, TypeScript e Tailwind, com versões estáveis compatíveis verificadas no início. Se a pasta já tiver uma base adequada, respeita-a. Mantém dependências moderadas. Não cries microserviços nem peças de infraestrutura sem função nesta fase.

Separa componentes, cálculos e adaptador de dados temporários. Usa identificadores estáveis, períodos mensais explícitos e valores em cêntimos inteiros. Não uses floats para somar dinheiro. Aceita valores portugueses como `1.234,56` e mostra `1.234,56 €`. Usa datas de calendário, evitando mudanças de dia por conversões UTC desnecessárias.

O protótipo usa exclusivamente fixtures claramente identificadas. Pode reutilizar nomes do catálogo, mas os montantes são sintéticos e nunca importados dos meus saldos reais. Mostra **Demonstração — dados de exemplo** de forma visível. Documenta se o estado desaparece ao recarregar; disponibiliza reposição dos exemplos. Não afirmes que os dados estão guardados numa base de dados. Não uses o Excel como backend.

Faz os cálculos demonstrados de forma coerente e reutilizável, mas não apresentes a simulação como razão para dispensar a fase de domínio financeiro e persistência. Esta fase não está pronta para guardar as minhas finanças reais.

Servidor local por omissão em `127.0.0.1`. Se uma porta estiver ocupada, escolhe outra e informa; não termines processos alheios. Não adiciones serviços externos, fontes remotas, telemetria ou pedidos de chaves de API sem necessidade.

## 9. Testes e aceitação

Testa os cálculos demonstrados e os percursos principais com ferramentas adequadas, por exemplo Vitest e Playwright. Os resultados devem ter expectativas independentes, não apenas repetir a fórmula implementada. Os dados de teste não podem contaminar os exemplos normais. Verifica pelo menos:

1. Despesa prevista de 85 €, paga por 85 €: referência 85 €, realizado 85 €, pendente zero, saldo atualizado e feedback visível.
2. Plano de 100 €, pagamento parcial de 40 €: pendente 60 € e estado parcial.
3. Plano de 85 €, concluído por 92 €: pendente zero e desvio de mais 7 €. Também verificar conclusão explícita por valor inferior.
4. Plano inicial de 100 €, plano atual alterado para 120 €, realizado 40 €: inicial continua 100 € e pendente atual 80 €.
5. Linha de 30 € adicionada depois do plano inicial: inicial zero, atual 30 €, pendente 30 €.
6. Conta principal 1.000 € e reserva zero: reforço de 100 € deixa principal 900 € e reserva 100 €, sem despesa. Compra de 40 € financiada pela reserva deixa principal 900 € e reserva 60 €; despesa total 40 €, sem duplicação.
7. Compras detalhadas de 40 € e atualização do total para 60 € deixam gasto de 60 €. O total abaixo das compras exige resolução explícita.
8. Orçamento de 200 € com gasto de 150 € indica sobra de 50 €, sem aumentar automaticamente o Fundo Emergência. Um excesso noutro orçamento reduz a sobra líquida.
9. Conta com saldo inicial 100 € e pagamento de 40 € mostra 60 €. Conferência com banco de 55 € cria um ajuste de −5 € identificado, contado uma vez.
10. Criar outro mês a partir do Modelo Base não copia qualquer execução, saldo inicial ou pendente anterior. O mês anterior mantém-se intacto.
11. Lembrete anual de novembro não aparece em dezembro; lembrete isolado não altera totais; associação ao plano existente evita duplicação; reabrir o mês não duplica ocorrências.
12. Saldo do Cartão Refeição não esconde falta de fundos em Santander. Valores `0,10` e `1.234,56` são interpretados como 10 e 123456 cêntimos.

Testa ainda navegação por teclado, foco em diálogos, validação, cancelamento, correção de ações, repetição de clique e mensagens de sucesso/erro. Verifica que guardar o plano inicial não impede pagamentos e que os valores mudam visualmente após cada ação. Corre os checks de tipos, build e testes disponíveis; não declares que passaram se não os executaste.

Faz inspeção visual real no navegador nas dimensões indicadas. Guarda capturas com exemplos para o ecrã do mês, pagamento parcial, contas, reservas e lembretes. Se o ambiente impedir uma verificação, regista exatamente qual ficou por fazer; não substituas isso por uma afirmação genérica de que está tudo correto.

## 10. Entrega desta fase

Entrega código funcional, instruções simples de instalação/arranque no Windows e o endereço local para experimentar. Atualiza o README com o comportamento dos exemplos e o que se perde ao recarregar. Não escondas limitações de persistência.

Cria `docs/FASE_1_RESULTADOS.md` com decisões de UX, percursos implementados, testes realmente executados, capturas, limitações e pontos a validar antes da fase 2. Mantém o documento proporcional e concreto. Não inclua dados financeiros reais nas capturas.

Na resposta final, explica como abrir e experimentar, quais são as três ou quatro tarefas principais a testar e o que ainda impede o uso real. Dá-me um resultado navegável para eu avaliar a experiência. Para no fim da fase 1; a fase seguinte será iniciada expressamente.
