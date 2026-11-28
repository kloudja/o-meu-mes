# Plano de desenvolvimento — O meu mês

Atualizado em 11/11/2026. Fases 1–6 concluídas. A recuperação foi verificada de ponta a ponta com dados fictícios e a aplicação abriu sobre a cópia restaurada. O utilizador confirmou a validação da fase 6 e a regressão final passou. Resultados no documento interno `FASE_6_RESULTADOS.md`.

**Decisão de 09/11/2026.** A revisão manual faz-se na aplicação local com a base habitual. Os arranques de demonstração e de ensaio descritos no histórico foram retirados. O `AGENTS.md` define o fluxo a seguir em novas conversas.

## Organização

Criar o projeto local O meu mês nesta pasta. Abrir uma conversa por fase, mantendo os ficheiros de requisitos e as decisões no repositório. Não fundir com Finanças Pessoais nesta fase. Não é necessário contratar APIs de IA para a aplicação funcionar: os modelos são ferramentas de desenvolvimento.

## Fases e modelos

| Fase | Resultado verificável | Modelo principal | Revisão recomendada |
|---|---|---|---|
| 1 — UI/UX e protótipo interativo | Fluxos completos demonstráveis em localhost, com dados de exemplo, estados de erro e testes de interação | GPT-6.1 Sol · High | GPT-6.1 Terra · High para revisão visual, se disponível |
| 2 — Domínio financeiro | Especificação executável dos cálculos, transações, isolamento mensal e snapshots, com testes independentes | GPT-6 Astra · High | GPT-6.1 Sol · High para verificar os casos e a implementação |
| 3 — Persistência e utilização real | SQLite, migrações, saldos iniciais, pagamentos, recebimentos, transferências, poupanças e conferência, ligados à interface validada | GPT-6.1 Sol · High | GPT-6 Astra · High para integridade financeira |
| 4 — Modelo Base, agenda e conveniências | Meses gerados de forma idempotente, lembretes mensais/anuais, associação sem duplicação, sobras indicativas e fluxos completos | GPT-6.1 Sol · High | GPT-6 Astra · High nos casos de datas, snapshots e duplicação |
| 5 — Fiabilidade e entrega local | Backups e restauro testados, exportação, correções, testes de regressão e arranque simples no Windows | GPT-6.1 Sol · High | GPT-6 Astra · High para auditoria final |
| 6 — Validação de utilização e acabamento | Revisão com o utilizador, correções de fricção, acessibilidade, densidade, alinhamento, teclado e mensagens | GPT-6.1 Sol · High | GPT-6.1 Terra · High para inspeção visual |

O protótipo da fase 1 pode antecipar a experiência visual de todos os módulos. Isso não torna esses módulos prontos para dados reais. As fases 2–5 consolidam a correção, a persistência e a recuperação. O MVP só está pronto para utilização diária depois desses critérios passarem.

Sol é a escolha habitual para implementar e iterar. Astra fica reservado à modelação e revisão dos casos mais delicados. Terra é opcional para inspeção visual; não é necessário alternar de modelo a cada pequeno pedido. Se só se usar um modelo, escolher GPT-6.1 Sol High. Max ou Ultra não são necessários para começar.

Estas escolhas são recomendações para este projeto. A documentação oficial descreve Sol para trabalho complexo repetido, Astra para tarefas mais exigentes e Terra para compreensão visual e utilização de aplicações. A disponibilidade e os controlos variam por conta e cliente:

- https://learn.chatgpt.com/docs/models
- https://developers.openai.com/api/docs/guides/model-selection

## Fase 1 — UX primeiro

Entregar uma aplicação navegável, não apenas desenhos ou uma página de apresentação. Antes de escrever componentes, documentar duas alternativas breves para o ecrã do mês e escolher a mais clara. Implementar os fluxos principais com estado temporário isolado e dados de exemplo. Não pedir aprovação para cada pormenor visual; apresentar o resultado concreto para revisão.

Critérios: criar um mês, introduzir saldos, guardar o plano, registar um pagamento integral e parcial, usar uma reserva, adicionar um lembrete ao plano e perceber o resultado sem procurar colunas. Recarregar o protótipo deve ter um comportamento documentado e não alegar guardar dados reais.

## Fase 2 — Contrato financeiro

Formalizar identidades, montantes em cêntimos, movimentos realizados, alterações de planeamento e snapshots. Separar saldos de conta à ordem e reservas. Por instrução posterior do utilizador, o Cartão Refeição foi retirado da demonstração na fase 2; a segregação técnica de origens restritas mantém-se testada com fixtures próprias. Rever os testes com resultados calculados independentemente. Definir exatamente os efeitos de editar ou anular um pagamento e de corrigir um saldo.

Não transportar nada de um mês para outro. Uma nova referência ao mesmo banco ou à mesma categoria é metadado partilhado, não continuidade automática de valores.

## Fase 3 — Dados persistidos

**Concluída em 03/11/2026.** SQLite e migrações, serviço de comandos, interface integrada, idempotência durável e revisão/conflitos. Ver matriz e limitações em `FASE_3_RESULTADOS.md`. Não inclui backup/restauro/exportação nem habilita utilização financeira diária.

Introduzir SQLite e migrações sem destruir dados existentes. Trocar o adaptador de demonstração por repositórios persistidos. Todos os efeitos de uma operação financeira devem ser atómicos. Testar encerramento e reabertura, falhas de gravação, duplo clique e correções de movimentos. Antes do primeiro uso real, permitir introduzir saldos iniciais para o mês e rever o catálogo sem importar histórico.

## Fase 4 — Conveniências mensais

**Concluída em 03/11/2026.** Modelo Base, abertura de mês, agenda de lembretes e sobras verificados em desktop e a 360 e 390 px. A regressão inclui persistência, concorrência, conservação do plano inicial e sugestões de transferência. Consulte o documento interno `FASE_4_RESULTADOS.md`.

Completar o Modelo Base e a agenda de Pagamentos recorrentes. Gerar lembretes para o mês pelo período selecionado, não por mutação de uma data global quando se abre o calendário. Preservar datas e nomes nos snapshots. Tratar dias 29/30/31 e pagamentos anuais de 29 de fevereiro com uma regra documentada. Um mês criado novamente não duplica o plano nem os lembretes.

As sobras de Comida, Mimos e Outras Despesas são uma indicação. Não executar reforços automáticos no Fundo de Emergência.

## Fase 5 — Entrega

**Concluída em 04/11/2026.** Backup consistente com escrita concorrente em WAL, restauro para um novo ficheiro, exportação JSON e arranque Windows em loopback. O ensaio comparou os dados, os cálculos e os efeitos de um pedido repetido após restauro. A interface foi verificada em desktop e a 360 e 390 px. Consulte [FASE_5_RESULTADOS.md](FASE_5_RESULTADOS.md).

## Fase 6 — Usabilidade

**Concluída em 11/11/2026.** O utilizador confirmou os testes dos percursos na versão revista. A regressão final passou com bases temporárias isoladas. A revisão manual usa a aplicação local no endereço fixo, através de `Iniciar.cmd`. Resultados no documento interno `FASE_6_RESULTADOS.md`.

## Depois do MVP

Só por pedido separado: importação de extratos, ligações aos bancos, faturas detalhadas, utilização por várias pessoas, acesso externo, IA dentro da aplicação e fusão com Finanças Pessoais. Não antecipar microserviços, autenticação cloud ou camadas de integração para uma fusão ainda sem requisitos.

## Fase extra — Importação de novembro de 2026

Importação única da folha Novembro para a base habitual a pedido do utilizador em 07/11/2026. O plano mensal e a referência do Excel estão disponíveis em **Mês**. Consulte o documento interno `IMPORTACAO_NOVEMBRO.md`.


## Pedido específico de acesso doméstico — 04–05/11/2026

Trabalho autorizado pelo [prompt de acesso doméstico](../prompts/MOBILE_E_REDE_DOMESTICA.md). Entrada HTTPS, sessão pessoal, lista curta de equipamentos, adaptação móvel e ensaio SQLite isolado em preparação e validação. A configuração da rede e os resultados estão nos documentos internos `REDE_DOMESTICA.md` e `MOBILE_REDE_RESULTADOS.md`. Foram confirmados a configuração Windows, o arranque manual da tarefa e o acesso por HTTPS num dos telemóveis. Ficaram pendentes a validação no segundo telemóvel, o arranque ao iniciar sessão e os restantes testes físicos.
