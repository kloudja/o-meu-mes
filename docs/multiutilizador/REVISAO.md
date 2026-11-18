# Revisão da consolidação

Data: 17/11/2026. Âmbito: documentos em `docs/multiutilizador/`. Sem implementação, testes da aplicação, acesso à base real, envio de emails, commit ou publicação.

## Evidência de preparação

- Inspeção de `git status --short` identificou trabalho anterior em código, testes, scripts e documentos. Não foi alterado nesta consolidação.
- Lidos AGENTS, REQUISITOS, PLANO, prompt de discussão, package/tsconfig e partes relevantes de modelo, repositório, esquema, acesso e estado do navegador.
- Plano local regista fases 1–6 concluídas; não se repetiu nem certificou a regressão antiga nesta tarefa.
- Distinção corrigida entre regras históricas e atuais: saldos conhecidos de contas são capturados ao criar mês; pendentes, execução e sobras continuam no mês original.
- Escolhas finais 1A–6A e 7B registadas. A reorganização ampla da MU0 não inclui alterações financeiras de outras fases.

## Revisão técnica independente

Agente `architecture_review`, função de revisão de arquitetura/desenvolvimento, em modo leitura. Passagem preliminar identificou leitura/persistência global, revisão única, comandos completos no navegador, projeção `voided`, triggers imutáveis e DELETE físicos. Os contratos tratam contexto integral, revisões por intenção, recibos mínimos, compensação única e limpeza legal distinta.

Revisão dos documentos completos concluída, seguida de releitura dirigida das correções. O revisor não identificou outros achados P1/P2 por resolver no âmbito documental. Isso não comprova a implementação futura.

| Achado | Correção integrada e confirmada |
|---|---|
| P1 — Arranque migra automaticamente a base habitual | AR04, README, MU1–MU3 e A43: barreira antes de transição não autorizada; backup/restauro compatível em cada fase que muda esquema |
| P1 — Encerramento podia retirar proprietário antes de resolver os espaços | MU5, DECISOES, PRIVACIDADE e A16: `PendingClosure`, pertença e fatores restritos preservados até transferência aceite/eliminação efetiva; corridas testáveis |
| P2 — Pedido não encontrado podia ainda chegar tarde | AR07, MU3 e A44: ausência não é terminal; servidor exclui execução antiga antes de permitir intenção substituta; não reconstrói conteúdo perdido |

O revisor técnico e o jurídico trocaram observações sobre encerramento e retenção mínima de idempotência; não ficou conflito documental por resolver. Na revisão editorial final, os identificadores de arquitetura passaram de Axx a ARxx para não se confundirem com os cenários Axx.

## Revisão jurídica independente

Agente `legal_service_scope`, investigação de fontes oficiais e revisão crítica em modo leitura; investigação anterior de `legal_retention_erasure` também considerada. Não são pareceres vinculativos nem redação de Termos prontos para publicação.

Passagem sobre os primeiros cinco documentos e depois fases/matriz identificou os seguintes pontos. O revisor confirmou as correções nos ficheiros e não identificou achados jurídicos materiais remanescentes que impeçam fechar esta especificação.

| Achado | Correção integrada e confirmada |
|---|---|
| P1 — Informação sobre email de convidado recebido de terceiro | P03, DECISOES, MU4/MU6 e A41 incluem recolha indireta e convite nunca partilhado/aceite; template não é prova automática de informação |
| P2 — Comunicação a destinatários e recusas incompletas | P06, MU5 e A42: comunicação aplicável, exceções fundamentadas, motivos e vias de contestação |
| P2 — Estatuto dos prazos ambíguo | P04 distingue sete dias funcionais e valores iniciais aceites sujeitos a necessidade/fundamentação; não apresenta prazos como lei |
| Precisão — Saúde incidental e contagem de prazo | P03 exige enquadramento aplicável; MU5 conta um mês desde receção, segundo regras aplicáveis, não 30 dias fixos |
| Coerência — Conta em encerramento vs membros do espaço | `PendingClosure` não retira cedo a propriedade e não bloqueia automaticamente os restantes membros; pedidos legais não dependem de transferência |

Permanecem condições de lançamento, expressamente identificadas: operador/contactos reais, textos públicos definitivos, fundamentos e retenção concretos, solução para informação aos convidados e capacidade operacional para direitos/incidentes. Não são substituídas por esta revisão documental.

## Validação documental final

- Foram criados 14 ficheiros Markdown: guia, cinco contratos/matrizes transversais, sete fases e este relatório.
- Verificação documental com script Node recebido por stdin: existência dos links locais, identificadores dos contratos/cenários, presença MU0–MU6, ausência de marcadores de conflito e whitespace final. Resultado registado após a última edição: 31 links locais válidos e 44 cenários de aceitação, sem erros.
- `git status --short` foi revisto no início e no fim. A única pasta acrescentada por esta entrega é `docs/multiutilizador/`; todos os comandos de escrita desta tarefa ficaram nessa pasta. Trabalho anterior em código, scripts, testes e documentação foi preservado.
- `git diff --check -- docs/multiutilizador` não assinalou problemas; como os ficheiros são novos/untracked, a inspeção de conteúdo pelo script foi a verificação efetiva de whitespace e referências.
- Não foram executados testes da aplicação, build, migrações ou inspeção visual de UI, pois a entrega é exclusivamente documental. Os cenários da matriz e as fases estão por implementar/verificar.

## Utilização e reversão desta entrega

Começar pelo README desta pasta e pela fase expressamente autorizada; não iniciar MU0 por mera leitura desta consolidação. Para desfazer apenas esta entrega, remover os 14 ficheiros novos de `docs/multiutilizador/` após confirmar ausência de trabalho posterior. Não usar reset/restore geral nem remover alterações preexistentes.
