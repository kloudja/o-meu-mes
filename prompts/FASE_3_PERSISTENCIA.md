# Prompt de arranque — fase 3 de O meu mês

## Objetivo e fronteiras

Quero que executes integralmente a **fase 3 — persistência local e integração dos fluxos financeiros** do projeto **O meu mês**, nesta pasta. As fases 1 e 2 estão concluídas: existe uma interface navegável e um domínio financeiro testado, ligado a um adaptador em memória. Agora é necessário guardar os dados em SQLite e garantir que as operações sobrevivem a recargas, encerramentos e novas tentativas sem perda ou duplicação.

Não fiques apenas por um esquema, documento ou API. Implementa a persistência, liga-a à interface existente e verifica os percursos completos.

**Conclui apenas a fase 3.** Não expandir a agenda ou os catálogos para antecipar a fase 4. Não implementar o sistema de backups, restauro e exportação da fase 5. A persistência desta fase não basta para declarar a aplicação pronta para guardar as minhas finanças no dia a dia: essa entrega depende também dos critérios de fiabilidade posteriores.

O Cartão Refeição foi retirado por minha instrução. **Não o reintroduzas** nas contas, exemplos, formulários ou mensagens. A segregação técnica de origens restritas pode manter-se nos testes isolados.

Trabalha exclusivamente neste projeto. Não consultar, alterar ou reutilizar o projeto Finanças Pessoais. Não modificar Excel, importar histórico, publicar, expor o servidor à rede, ligar bancos ou integrar IA no produto.

Resolve autonomamente escolhas técnicas rotineiras. Se encontrares uma ambiguidade material de negócio, apresenta um exemplo concreto e pergunta antes de implementar a parte dependente; continua o trabalho independente. Não transformes limitações de armazenamento em novas regras financeiras.

## 1. Leitura e estado de partida

Lê, por esta ordem:

1. `AGENTS.md`.
2. `docs/REQUISITOS.md` e `docs/PLANO.md`.
3. `docs/DOMINIO_FINANCEIRO.md` e `docs/FASE_2_RESULTADOS.md`.
4. `docs/UX.md` e `docs/FASE_1_RESULTADOS.md`, incluindo as revisões após experimentação do utilizador.
5. `README.md`, este prompt, domínio, fixtures, adaptador, componentes, scripts de arranque e testes existentes.

Inspeciona e preserva trabalho existente, incluindo alterações feitas depois da fase 2. Não assumes que existe Git nem que o diretório está limpo. Verifica os processos e as portas sem terminar servidores alheios.

Executa primeiro os checks e testes existentes para estabelecer o estado de partida. A entrega da fase 2 registou **88 testes de domínio e 23 de navegador**, TypeScript e build aprovados. Confirma o estado atual; não apresentes esses números históricos como uma execução tua. Se a demonstração não estiver acessível, inicia um servidor local apropriado, sem recarregar o separador do utilizador.

## 2. Contrato de persistência antes das alterações principais

Cria `docs/PERSISTENCIA.md` antes das alterações principais e atualiza-o à medida que verificas a implementação. Documenta:

- Localização e resolução do caminho da base de dados, configuração, criação inicial e permissões necessárias no Windows.
- Driver SQLite escolhido, versão e compatibilidade com o runtime Node e o arranque existentes. Reutiliza a estrutura TypeScript/Next.js; não substituas bibliotecas sem necessidade. Consulta documentação oficial das APIs e versões utilizadas.
- Esquema, versões de migração, chaves, relações, restrições e índices essenciais.
- Fonte de verdade, limites entre apresentação, serviço de aplicação, domínio e repositório.
- Transação de cada comando, idempotência durável, concorrência e comportamento em falhas.
- Separação entre demonstração, testes e base local persistida.
- Política de atualização de dados visíveis após gravação, conflito entre separadores e resposta perdida.

O domínio existente deve continuar a ser a fonte das regras e cálculos. Não criar uma segunda versão das regras em SQL ou nos componentes. SQLite pode reforçar integridade com restrições, sem substituir a validação do domínio.

Evita uma reescrita geral ou camadas especulativas. Não resolvas a persistência enviando o estado completo do navegador para substituir a base: o servidor deve receber comandos, ler o estado atual e validar antes de gravar. Se usares documentos JSON para snapshots/metadados, justifica e preserva integridade, versionamento e consultas necessárias; não deixes os movimentos financeiros sem relações e garantias verificáveis.

## 3. SQLite e migrações sem perda de dados

Implementa armazenamento durável para os dados já existentes no contrato: contas, categorias, reservas, Modelo Base, definições recorrentes, meses, planos, linhas removidas, saldos iniciais, snapshots, eventos, efeitos por origem, alocações de ajustes, bases de observação, relações de correção, ocorrências e recibos de idempotência.

- Dinheiro em cêntimos inteiros, com limites seguros também na conversão SQLite↔JavaScript. Preservar `null` como desconhecido.
- IDs estáveis e relações com âmbito mensal correto. Um evento de outro mês não pode financiar, corrigir ou anular este mês.
- Preservar nomes e metadados guardados nos snapshots e eventos; alterações de catálogo não os reescrevem.
- Não usar eliminações em cascata que apaguem histórico financeiro. Remoção/arquivo conserva as referências exigidas pelo contrato.
- Migrações explícitas e versionadas, aplicadas uma vez. Não recriar a base em cada arranque, fazer reset silencioso ou apagar ficheiros para ultrapassar um erro.
- Tratar falha de migração, base indisponível e esquema incompatível com mensagens claras. Uma base inválida não deve ser substituída por uma base vazia ou por exemplos.
- Se já existir uma base ou ficheiro com dados nesta pasta, identificar o seu estado sem o eliminar, converter ou sobrescrever cegamente. Não fazer ensaios destrutivos sobre ele.
- Ficheiros de base, journaling/WAL e configuração privada ficam fora do versionamento e da pasta pública. Documenta os modos SQLite escolhidos e verifica que as garantias necessárias estão ativas nas ligações utilizadas.

A inicialização do esquema não pode depender de abrir uma página específica. Build e testes não podem criar ou alterar a base destinada à utilização local por efeitos laterais de importação.

## 4. Operações atómicas, idempotência e concorrência

Cada comando financeiro deve ler o estado relevante, validar, aplicar todos os efeitos e confirmar numa transação SQLite, ou falhar sem efeitos parciais. Evita a janela em que duas operações validam o mesmo saldo antigo e ambas o gastam.

Preserva, incluindo após reinício:

- Pagamentos e recebimentos antes de guardar o plano inicial.
- Reforço principal→reserva, pagamento pela reserva e devolução explícita, sem duplicar despesa ou património.
- Transferências, ajustes de conferência, conclusão, correções e anulações com todos os seus efeitos.
- Confirmação conjunta de iniciais em falta e movimento. Não substituir inicial conhecido nem guardar iniciais se o movimento falhar.
- Compras novas, totais acumulados, reduções pela origem financiadora e detalhe de compra já incluída, com alocações e dependências preservadas.
- Bases originais de conferências e totais: corrigir uma observação antiga não absorve movimentos posteriores.
- Snapshot explícito e imutável, com criação concorrente protegida; novo mês isolado e criação/reabertura sem duplicação.

A chave de idempotência e o conteúdo canónico devem ficar gravados **na mesma transação que os efeitos**. Mesmo âmbito/chave e mesmo conteúdo não repetem a operação; conteúdo diferente é erro. Um pedido falhado não consome a chave. Anular e voltar a registar usa nova chave legítima.

Simula o caso em que a gravação foi confirmada mas a resposta não chegou ao navegador: a repetição deve reconhecer o pedido, devolver informação coerente e não criar outro pagamento. O cliente deve conservar a identidade da tentativa enquanto resolve uma resposta incerta; não gerar uma chave nova automaticamente e voltar a pagar.

Trata dois separadores ou pedidos concorrentes sem sobrepor estado antigo. Define uma estratégia simples de controlo de versão/conflitos e atualização. Não rejeitar cegamente uma repetição idempotente válida apenas porque a versão avançou. Não perder uma edição já confirmada ao receber outra resposta.

O período do comando deve ser explícito. Trocar de mês enquanto um pedido está em curso não pode gravar no mês errado nem mostrar dados desse pedido como se pertencessem ao mês agora aberto.

Mantém o comando `correct` do domínio disponível e testado através da camada persistida. A interface pode continuar a corrigir por anulação e novo registo; não os apresentar como uma única transação se forem duas confirmações separadas.

## 5. Integração com a interface e preparação inicial

Preserva a interface e as melhorias das fases 1 e 2. Não redesenhes a aplicação. Usa alterações mínimas para tornar o estado persistido compreensível:

- Carregamento inicial, confirmação em curso, gravação concluída, erro de gravação e possibilidade de repetir com segurança.
- Só anunciar sucesso depois de commit confirmado. Não mostrar saldos como gravados se houve falha; preservar os campos preenchidos para correção ou nova tentativa.
- Atualizar saldo, realizado, falta, estado e indicadores a partir do resultado confirmado. Em erro, manter a última informação confirmada e explicar a situação.
- Preservar os saldos em falta no próprio formulário de reforço, zero explícito para reserva vazia, nome opcional da compra, detalhe já incluído, cartão dos orçamentos e mensagens de dependência visíveis acima do rodapé.
- Manter mês visível, EUR, português de Portugal, foco, teclado e datas civis sem conversões UTC que mudem o dia.

Cria uma separação inequívoca entre:

1. **Demonstração:** fixtures sintéticas, identificadas, com comportamento de reposição documentado; nunca gravadas automaticamente na base local persistida.
2. **Dados locais persistidos:** começam sem histórico, montantes de exemplo, execução ou saldos presumidos. Permitem rever os metadados do catálogo, preparar o Modelo Base e introduzir os saldos do mês explicitamente.

Podes reutilizar os nomes de contas/categorias confirmados nos requisitos. Nomes de reservas e movimentos habituais são referências a rever, não autorização para gerar compromissos ou copiar montantes das fixtures. Não converter a demonstração aberta em dados reais por iniciativa própria.

A opção **Repor exemplos** só atua na demonstração e nunca pode apagar dados locais. Não acrescentar uma ação geral de apagar a base para facilitar os testes.

Não deixar páginas a aparentar persistência quando ainda usam memória: integrar o estado já existente de Modelo Base, catálogos e lembretes, sem expandir funcionalidades da fase 4. Distinguir claramente modos e respetivo comportamento ao recarregar. Nos dados locais, substituir a mensagem de perda ao recarregar por informação verdadeira sobre armazenamento local e sobre a falta das garantias de backup/restauro da fase 5.

## 6. Servidor e execução local

SQLite e caminhos do sistema de ficheiros só são acessíveis pelo servidor. Valida os comandos na fronteira de entrada, sem confiar em valores, saldos, efeitos ou IDs calculados pelo cliente.

Mantém o servidor em `127.0.0.1`. Operações de escrita não usam GET; verifica a origem dos pedidos de escrita para evitar que uma página externa os envie ao serviço local. Não criar autenticação cloud, contas de utilizador ou serviços externos.

Preserva `Iniciar.cmd` e os scripts existentes, adaptando o arranque às migrações e à base local. Porta ocupada significa escolher outra ou informar, nunca terminar processos alheios. Caminho da base não deve mudar silenciosamente por iniciar o comando noutra diretoria.

Não exponhas detalhes internos, caminhos ou stack traces nas mensagens comuns do produto; guarda diagnóstico suficiente para desenvolvimento sem despejar dados financeiros em logs.

## 7. Testes de aceitação com bases isoladas

Mantém os testes financeiros da fase 2 e as expectativas independentes. Acrescenta testes de repositório, migrações, serviço/API e navegador com bases temporárias identificadas. Usa um caminho de teste explícito e proteções que impeçam a suite de abrir/apagar a base local do utilizador. Nunca testes com dados reais.

Verifica pelo menos:

1. Base nova sem histórico nem montantes fictícios; migrações reaplicadas não duplicam estrutura ou dados. Migração de versão anterior preserva registos de teste. Falha de migração não deixa esquema parcialmente aplicado nem apaga a base.
2. Gravar, fechar ligação, reiniciar efetivamente o servidor e reabrir: saldos, eventos, snapshots, alocações e idempotência permanecem. Recarregar só o navegador não substitui este teste.
3. Principal 1000/reserva 0, reforço 100 → 900/100; pagamento 40 pela reserva → 900/60 e despesa 40. Reabrir conserva valores. Anulação dependente inválida não altera nenhuma tabela; anular primeiro a compra permite reverter o reforço.
4. Inicial 100, pagamento 40, observado 55 → ajuste −5. Compra posterior 10 e correção da observação para 58 → saldo 48. Verificar depois de reabrir a base.
5. Snapshot 100, atual 120, realizado 40 → inicial 100, falta 80. Renomeações, arquivo, linha posterior e remoção preservam referências e histórico após reinício.
6. Compras 40, total 60, compra posterior 10 → 70; corrigir observação antiga para 65 → 75. Redução na conta errada rejeitada; detalhe já incluído não altera saldos; dependências persistidas impedem anulação inválida.
7. Iniciais e movimento em conjunto: cancelamento, insuficiência e erro de gravação não guardam parcela alguma. Inicial conhecido não é substituído.
8. Injetar falhas entre gravações relacionadas, antes do commit e na entrega da resposta depois do commit. Antes do commit: rollback integral, incluindo recibo de idempotência. Depois do commit: repetição reconhecida sem novo efeito.
9. Duplo clique, pedidos concorrentes com a mesma chave, chave reutilizada com outro conteúdo, falha corrigida e pedido novo após anulação. Confirmar o resultado após reinício.
10. Duas despesas concorrentes de 80 numa origem com 100: nunca aceitar ambas nem criar saldo −60. Duas criações do mesmo mês/snapshot não duplicam nem substituem a referência. Dois separadores não apagam alterações confirmadas um do outro.
11. Meses isolados, IDs de outro mês rejeitados, referências inválidas, cêntimos no limite seguro, `null`, datas inválidas e dados do cliente manipulados. Nenhuma operação rejeitada deixa efeitos parciais.
12. Base ocupada, caminho indisponível e gravação recusada: feedback claro, sem sucesso falso e sem trocar automaticamente para exemplos/base vazia.
13. Demonstração e testes não contaminam dados locais; repor exemplos não toca na base persistida; build não inicializa dados do utilizador.
14. Fluxos de navegador existentes e persistidos: pagamento/recebimento, parcial, conclusão inferior/superior, anulação, reforço com iniciais, compras/totais, conferência, transferência, snapshot, mês novo e recarga.

Não derives expectativas chamando a própria função que estás a testar. Não retires testes/requisitos para os fazer passar. Regista contraexemplos encontrados na revisão crítica e como foram corrigidos.

Executa TypeScript, build, testes de domínio, integração e navegador relevantes. Inspeciona a interface renderizada em desktop e móvel, com capturas de exemplos dos estados de carregamento, sucesso e falha. Não declarar verificação visual sem a realizar. Se algo não puder ser testado, identifica exatamente o que falta e a consequência.

## 8. Entrega e paragem

Entrega:

- SQLite e migrações implementados, sem destruir dados existentes.
- Repositório/serviço persistido ligado aos fluxos da interface, mantendo o domínio como fonte das regras.
- Separação efetiva entre demonstração, testes e dados locais.
- `docs/PERSISTENCIA.md` com esquema, transações, idempotência, concorrência, configuração e comportamento de falhas.
- `docs/FASE_3_RESULTADOS.md` com decisões, matriz de testes, comandos realmente executados, resultados, capturas, limitações e trabalho das fases seguintes.
- README e estado do plano atualizados. Atualizar o contrato financeiro apenas se houver uma correção fundamentada, identificando-a e testando-a; não enfraquecer regras por conveniência de implementação.
- Instruções para abrir no Windows e um roteiro curto de validação manual com dados fictícios, incluindo fechar/reabrir e distinguir demonstração de dados persistidos.

Na resposta final, resume o que ficou persistido, as garantias efetivamente verificadas, os testes que passaram e as limitações. Explica onde ficam os dados e o que falta antes da utilização financeira diária.

**Para no fim da fase 3. Não iniciar automaticamente a fase 4 nem implementar a fase 5.**
