# MU2 — Espaços privados, isolamento e navegação

Estado: por implementar. Dependência: MU1 aceite. Ler F01–F03/F05/F07, AR04–AR05 e [aceitação](ACEITACAO.md). Contexto autorizado e migrações são o centro desta fase; não ativar partilha ainda.

## Trabalho

1. Introduzir espaço, pertença e proprietário único; perfil/definições do utilizador separados de definições financeiras. Cada espaço criado é privado, um proprietário, moeda EUR imutável. Não criar agregação entre espaços.
2. Propagar contexto autenticado/autorizado da rota até consultas, mutações, recibos e exportações. Eliminar leituras/escritas globais em rotas do produto. Negar por defeito e validar contexto no servidor.
3. Remodelar chaves/restrições de todos os dados financeiros, incluindo meses, origens, efeitos, allocations, snapshots, recorrências e metadados históricos. Impedir relações cruzadas também na BD. IDs permanecem estáveis; mês único por espaço/período.
4. Introduzir campos de ciclo de vida. Inventariar `DELETE` atuais e separar arquivo financeiro, remoção lógica de catálogo e futura limpeza legal. Não tornar snapshots editáveis. Definir filtros ativos e consultas de histórico explicitamente.
5. Remover bootstrap automático que espalhe catálogo privado ou obrigue a existir mês. Criar primeiro espaço pelo onboarding; novo mês pelas regras atuais do domínio. Testar zero espaços e espaço sem meses.
6. Seletor de espaço junto ao avatar, definições distintas, estado vazio, primeiro mês e troca de contexto. Não mudar espaço ativo automaticamente só porque outra tarefa terminou.
7. Navegador usa contexto/geração para ignorar respostas antigas; cache e revisões limitadas ao âmbito. Não persistir comandos completos em localStorage. Preservar recuperação segura de pedidos incertos já nesta migração do hook; MU3 completa concorrência fina.
8. Rotas de ficheiros locais deixam de servir exportação/backup global a utilizadores. A exportação de espaço pode ficar indisponível até MU5; não manter endpoint perigoso por ainda não existir botão novo.

## Migração técnica única

Os dados do utilizador original já estão na BD. Preparar procedimento único que atribua explicitamente essa origem a um GUID/espaço escolhidos, preserve IDs, referências, saldos e planos iniciais e assinale autoria histórica desconhecida. Não é um fluxo guest nem importação pública. Não atribuir à primeira conta registada.

Testar migrações repetidas/falha a meio, integridade e comparação financeira em bases sintéticas descartáveis. Atualizar e testar backup/restauro e reconhecimento desta versão na própria MU2, sem esperar MU5. Manter a barreira de arranque MU1: transição da base habitual só quando incluída no trabalho autorizado, com procedimento concreto e recuperação preparados. Não presumir que descer uma migração com dados novos é seguro. A execução sobre dados reais e a transferência para servidor remoto requerem pedido específico posterior; não reabrir esse tema como decisão funcional.

## Aceitação

- A01–A05, A08–A09, A13–A15, A19–A20, A26–A27, A34 e A43 na parte aplicável.
- Utilizador B não vê nem altera dados de A mesmo conhecendo IDs, períodos, chaves de pedidos ou URL de exportação.
- Relações entre recursos de espaços distintos falham na BD e na API. Zero espaços/meses não causa erro interno.
- Cada criação é transacional e idempotente; capturar iniciais conhecidos do mês imediatamente anterior sem reescrever outros meses nem transportar execução/pendentes/sobras.
- Queries e DTOs não devolvem todas as finanças/recibos por conveniência do hook. Inspecionar respostas e caches, não apenas o ecrã.
- Desktop/mobile: criação e alternância, mês/espaço claros, rascunho e respostas atrasadas, ausência de dados privados pré-carregados.

## Entrega

Esquema revisto, mapa de escopo por entidade/endpoint, procedimento de migração/restauro e testes de isolamento. Revisor de dados/segurança valida as restrições e as rotas retiradas. Não ativar convites ou partilha antes das garantias da MU3. Parar ao concluir.
