# Evolução multiutilizador — guia para implementação

Consolidação de requisitos em 17/11/2026. Estado: especificação para implementação futura, não funcionalidade implementada nem autorização de publicação. As fases locais 1–6 referidas em `../PLANO.md` são anteriores a este plano. As fases seguintes usam o prefixo MU para não confundir os trabalhos.

## Como usar estes documentos

1. Ler `../../AGENTS.md`, `../REQUISITOS.md` e `../PLANO.md` na cópia local.
2. Ler [decisões funcionais](DECISOES.md), [arquitetura](ARQUITETURA.md), [segurança](SEGURANCA.md), [privacidade](PRIVACIDADE.md) e [aceitação](ACEITACAO.md).
3. Ler a fase expressamente pedida pelo utilizador. Verificar `git status --short`, preservar alterações anteriores e identificar dependências ainda não entregues.
4. Implementar apenas essa fase. Entregar evidências, limitações, ficheiros afetados e forma de desfazer apenas as alterações dessa fase. Não avançar automaticamente para a seguinte.

Qualquer fase que mude esquema mantém barreira de transição da base habitual e verifica compatibilidade de backup/restauro, conforme AR04. O arranque existente migra automaticamente; não permitir que isso aplique a evolução MU aos dados reais por acidente.

Os agentes devem conseguir trabalhar sem consultar a conversa. Em caso de lacuna, distinguir uma escolha técnica interna de uma alteração de produto: documentar e justificar a primeira; trazer ao utilizador apenas a segunda ou uma incompatibilidade real. Não transformar propostas de implementação em decisões já aprovadas pelo utilizador.

## Precedência e estado das decisões

- As instruções mais recentes do utilizador e o AGENTS atual prevalecem sobre os prompts históricos. Obrigações legais aplicáveis prevalecem sobre preferências incompatíveis, conforme instrução expressa do utilizador. Distinguir lei, orientação e recomendação técnica; não chamar obrigatória a uma prática apenas recomendada.
- Este conjunto define a evolução multiutilizador. Os requisitos financeiros existentes mantêm-se, salvo mudanças expressamente descritas aqui, como reversões por compensação.
- Regra atual de abertura de mês: capturar os saldos conhecidos das contas no mês imediatamente anterior; execução, pendentes e sobras não transitam. As poupanças têm confirmação própria. A frase antiga «não transportar nada» do plano/prompt não prevalece sobre esta regra atual.
- As sete escolhas técnicas finais são **1A, 2A, 3A, 4A, 5A, 6A, 7B**. A opção 7B determina reorganização inicial ampla, preservando comportamento, antes de novas funcionalidades.
- O alcance de «web e mobile» é a aplicação web em computador e navegador móvel. Não há aplicação nativa encomendada.
- Todos os cenários de teste usam pessoas e valores fictícios. Não copiar o catálogo privado do utilizador para o registo público nem para estes documentos.

## Sequência

| Fase | Resultado | Dependência |
|---|---|---|
| [MU0 — Reorganização e qualidade](FASE_MU0.md) | Estrutura por domínios, componentes internos e contratos preservados | Estado local atual inventariado |
| [MU1 — Identidade e comunicações](FASE_MU1.md) | Registo, verificação, sessões, recuperação, MFA e documentos legais versionados | MU0 |
| [MU2 — Espaços privados e isolamento](FASE_MU2.md) | Contexto autorizado, persistência isolada, primeiro espaço e navegação | MU1 |
| [MU3 — Concorrência e histórico](FASE_MU3.md) | Comandos concorrentes, resposta incerta e compensações financeiras | MU2 |
| [MU4 — Partilha e propriedade](FASE_MU4.md) | Convites, membros, papéis, revogação e transferência | MU3 |
| [MU5 — Ciclo de vida e privacidade](FASE_MU5.md) | Encerramento, apagamento, direitos, exportação e recuperação compatível | MU4 |
| [MU6 — Verificação integrada](FASE_MU6.md) | Evidências de regressão, isolamento, segurança, acessibilidade e condições de abertura | MU5 |

Esta ordem permite implementar a partilha depois das garantias de concorrência. A identidade e o isolamento podem ser testados antes, sempre em ambiente local e automatizado autorizado. Nenhuma fase intermédia autoriza registo público, exposição à rede ou utilização de dados de terceiros.

## Organização da equipa

Um responsável integra cada fase. Arquiteto define fronteiras e contratos; developer implementa; engenheiro de dados revê migrações e integridade; segurança revê autenticação/autorização e abuso; frontend/design valida percursos e componentes; QA verifica comportamentos e UI. O revisor independente desafia resultados e testes. O agente de investigação jurídica revê fundamentos e lacunas; não equivale a parecer profissional nem a certificação. DevOps participa na recuperação e preparação operacional, sem escolher alojamento ou publicar por iniciativa própria.

Podem acumular-se papéis quando proporcionado. Não criar dez agentes apenas por existir essa lista. Não permitir edições concorrentes no mesmo núcleo financeiro. A atribuição de agentes numa fase posterior segue a autorização e instruções dessa fase.

## O que ainda terá de ser resolvido

Não falta uma nova ronda geral de decisões funcionais para começar a MU0. As pendências têm destino concreto:

- **Durante a implementação:** selecionar e justificar biblioteca de schemas, biblioteca de autenticação/criptografia, ferramentas de formatação/análise e detalhes dos contratos. Verificar versões, licença, manutenção e compatibilidade, sem trocar a stack ou introduzir serviços sem necessidade.
- **Antes de usar email real:** operador configura remetente/domínio e credenciais Brevo; validar condições e tratamento de dados do fornecedor. Não criar contas nem enviar mensagens nesta consolidação.
- **Antes da abertura pública:** identificar operador/contactos reais e modelo efetivo da atividade; concluir textos jurídicos e a avaliação de notas sensíveis, fundamentos e retenção; demonstrar capacidade de responder a direitos/incidentes e de recuperar dados. Ver [privacidade](PRIVACIDADE.md) e MU6. A infraestrutura de publicação será um pedido próprio.
- **Depois:** passkeys, idiomas adicionais, moedas/países adicionais e backoffice. A estrutura prepara estas evoluções, mas não as declara entregues.

## Entrega documental

[REVISAO.md](REVISAO.md) regista a revisão jurídica e técnica, correções e verificações desta consolidação. As funcionalidades não foram executadas nem testadas nesta entrega documental. Não foram alterados código, dependências, bases, backups, configurações de rede ou os documentos históricos. Não houve commit, push ou publicação.

Para desfazer esta entrega, remover apenas os ficheiros criados em `docs/multiutilizador/`, depois de verificar se receberam trabalho posterior. Não reverter o restante diretório de trabalho. Estes documentos não incluem dados financeiros reais ou credenciais; devem ainda ser revistos antes de qualquer publicação do repositório.
