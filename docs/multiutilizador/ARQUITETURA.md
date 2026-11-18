# Contrato técnico e mapa de evolução

As decisões 1A–6A e 7B estão confirmadas. A árvore abaixo é uma orientação de fronteiras para MU0, ajustável após inventário. Não exige criar diretórios vazios nem um framework interno.

## AR01 — Código simples e consistente

- Funções e tipos TypeScript por defeito. Classes quando encapsulam estado/ciclo de vida ou melhoram um contrato concreto. Constantes exportadas por módulos, sem classes estáticas artificiais.
- Código novo em inglês; interface e documentação funcional em português de Portugal. Preservar os nomes exigidos `IsDeleted`, `AddedAt`, `ModifiedAt`, `DeletedAt` na persistência. Renomeações de contratos persistidos exigem migração, não simples substituição textual.
- Eliminar duplicação de regras/conceitos. Não extrair duas frases ou fragmentos só por coincidirem hoje. Um componente universal cheio de flags não satisfaz reutilização.
- Biblioteca interna de UI para botões, campos, seletor, diálogo, tabs, mensagens, estados vazios e carregamento. Componentes financeiros reutilizáveis pertencem ao domínio financeiro. Composição, variantes explícitas e acessibilidade comum; evitar props que permitam combinações contraditórias.
- Texto da interface em catálogos por domínio, emails em templates próprios, códigos de erro estáveis separados de mensagens, configuração de execução validada no servidor, constantes de negócio junto do domínio. Sem um ficheiro global para todas as strings. Nomes introduzidos pelos utilizadores são dados.
- Biblioteca mantida de schemas para validação de fronteiras, selecionada na MU0. Reutilizar schemas/tipos quando cliente e servidor partilham contrato; o servidor valida sempre. Regras financeiras e autorização não pertencem à biblioteca de parsing.
- SQL explícito e parametrizado em repositórios por domínio. Sem ORM nesta evolução. Identificadores SQL dinâmicos só de listas internas controladas. Transações pertencem ao caso de uso que coordena efeitos, não a cada função isoladamente.
- TypeScript estrito, formatter e análise estática automatizados. Verificar fronteiras de imports. Evitar `any`, casts que substituam validação, silenciamento indiscriminado de erros e abstrações sem necessidade.
- Comentários explicam intenção, invariantes e razões difíceis, sem repetir linha a linha o código. Erros esperados têm códigos e tratamento; não esconder exceções como sucesso.

## AR02 — Fronteiras

Estrutura alvo indicativa:

```text
src/app/                        rotas Next e composição, sem regras financeiras
src/modules/identity/           perfil, autenticação, sessões, recuperação
src/modules/spaces/             espaços, membros, convites, propriedade
src/modules/finance/            modelos, cálculos, casos de uso e UI financeira
src/modules/privacy/            direitos, retenção, encerramento e redação de dados
src/modules/communications/     templates, entregas e adaptador de email
src/shared/ui/                  primitivas internas de interface
src/shared/i18n/                infraestrutura mínima de localização
src/server/                     composição de adaptadores e recursos do servidor
src/config/                     configuração tipada, separação público/servidor
tests/                         fixtures sintéticas, unidade, integração, navegador
```

Dentro de um domínio separar domínio puro, casos de uso, infraestrutura e apresentação só quando necessário. Domínio não importa React, Next, SQLite, variáveis de ambiente ou fornecedor de email. Casos de uso recebem dependências explícitas (relógio, IDs, repositório, transação); infraestrutura implementa-as. Rotas autenticam, validam, invocam caso de uso e traduzem resultado. Não duplicar regras nas rotas ou nos hooks.

Dependências entre domínios passam por contratos pequenos. Não ter ciclos nem importar internals de outro domínio para contornar autorização. Estado e tipos internos do servidor não são DTOs públicos. Evitar exportações que enviem código/segredos de servidor para bundles de cliente.

## AR03 — Mapa observado em 17/11/2026

| Local atual | Observação | Evolução necessária |
|---|---|---|
| `src/components/App.tsx` e componentes | Composição e textos concentrados; MoneyInput, SearchField, Dialog já reutilizáveis | Extrair por responsabilidade e reutilizar; não substituir desenho todo |
| `src/domain/model.ts`, `engine.ts`, `funding.ts`, `money.ts` | Estado financeiro sem utilizador/espaço, euros e cêntimos, `voided` no cálculo | Preservar em MU0; escopo em MU2; projeção compensatória em MU3 |
| `src/server/input.ts` | Parsing manual | Schemas equivalentes com validação de fronteira e testes de entradas |
| `src/server/access.ts` | Host/Origin locais | MU1 autenticação real, MU2 autorização por ação/objeto; Host/Origin não são identidade |
| `src/server/repository.ts` | Leitura/persistência globais, revisão única, recibos globais | Consultas limitadas, unidade de transação, revisões por recurso e recibos com contexto |
| `src/server/storage.mjs` | SQLite, mês por período, triggers imutáveis, bootstrap local | Migrações aditivas/reconstrução controlada, referências por espaço, espaço sem mês válido |
| `src/data/usePersistentStore.ts` | Comando completo em localStorage; polling 5 s; contexto global | Contexto autenticado, geração de seleção, recuperação mínima e limpeza |
| `src/server/local-files.mjs`, rotas locais | Exportação/backup globais e verificação de esquema | Separar exportação de espaço e recuperação operacional; nunca expor ficheiros globais |
| `scripts/next.mjs`, arranque habitual | Executa `migrate(path)` antes de servir a aplicação | Barreira de compatibilidade/transição antes de aplicar novas migrações MU à base habitual |
| `tests/` | Domínio, persistência, processos concorrentes e Playwright existentes | Reaproveitar evidência e fixtures; ampliar por risco sem testes que só repitam código |

Estas observações não são uma auditoria completa nem demonstram que testes atuais passam. Há trabalho anterior não committed que deve ser preservado. Não reverter para uma versão anterior para simplificar o refactor.

## AR04 — Contexto e armazenamento

Base partilhada com discriminação por espaço é a solução técnica inicial, preservando SQLite e transações existentes; não introduzir bases por utilizador, microserviços ou mudança de motor nesta especificação. Reavaliar limites de carga na preparação operacional com evidência, sem alegar capacidade ainda não medida.

O servidor deriva o utilizador da sessão e valida a pertença atual. O cliente escolhe `spaceId`, nunca prova identidade/papel com o corpo do pedido. Contexto autorizado inclui utilizador, espaço e capacidade necessária; impedir repositórios financeiros de operar sem ele. Verificar novamente dentro da transação de escrita para ordenar autorização com revogação.

Cada relação financeira deve impedir cruzamento entre espaços na base, com chaves/foreign keys compostas adequadas, não apenas um filtro HTTP. Unicidade de mês por `(spaceId, period)`; pertença ativa única por `(spaceId, userId)`; exatamente um proprietário por espaço ativo com invariante transacional verificável. Qualquer índice parcial para soft delete exige testes de reentrada e histórico.

O arranque atual aplica migrações automaticamente. Antes de adicionar a primeira migração MU, implementar barreira que detete uma transição de dados habitual ainda não autorizada e interrompa o arranque **antes de modificar a base**, com mensagem clara. Não é um pedido de confirmação em todos os arranques: a autorização de uma transição concreta mantém-se, e reaberturas idempotentes não a repetem. Enquanto a transição não fizer parte do trabalho autorizado, novas migrações só se exercitam em testes sintéticos. Manter o endereço manual único, sem criar demonstrações alternativas. Cada fase que altera esquema atualiza e testa compatibilidade de backup/restauro, reconhecimento de versão e recuperação de falha; não adiar tudo para MU5. Esta última acrescenta a reconciliação de apagamentos/revogações.

Snapshots, efeitos, allocations, origens, ocorrências, metadados de importação e recibos também têm escopo. Não deixar `persist` percorrer outro espaço nem `load` entregar todos os meses/recibos. Consultas devolvem apenas o período/detalhe necessário, histórico paginado e metadados mínimos. Caches incluem contexto e são invalidados quando mudam permissões.

## AR05 — Ciclo de vida, moeda e datas

Entidades de domínio e tabelas de associações têm `IsDeleted`, `AddedAt`, `ModifiedAt`, `DeletedAt`. Criação: AddedAt pelo servidor, ModifiedAt/DeletedAt nulos, IsDeleted falso. Alteração efetiva: ModifiedAt. Eliminação lógica: IsDeleted verdadeiro, DeletedAt e ModifiedAt no mesmo instante. Não atualizar datas em replay idempotente. UTC no armazenamento, apresentação localizada; datas civis financeiras/períodos não devem mudar de dia por converter indiscriminadamente para timestamp.

Campos de ciclo de vida não autorizam CRUD genérico: recibos e histórico financeiro são imutáveis nos seus factos normais. Tabelas técnicas como versões de migração têm semântica própria, a documentar; não simular eliminação de uma migração aplicada. A política de apagamento pode limpar colunas/payloads e, se necessário para cumprir lei aplicável, remover identificadores/relações; soft delete nunca serve de impedimento legal.

Moeda pertence ao espaço. Inicialmente EUR, valores em cêntimos inteiros, limites de entrada e de soma/multiplicação verificados. Preparar tipo de montante com moeda e metadados de unidades menores; não supor duas casas decimais para todas as moedas futuras. Não implementar câmbio, converter históricos ou permitir editar moeda de espaço existente.

Configuração por país separa disponibilidade, documentos jurídicos versionados e regras explicitamente avaliadas. InterfaceLocale, communicationLocale, residenceCountry e currency não são aliases. Um futuro backoffice altera configurações suportadas e validadas; não gera automaticamente fundamento jurídico.

## AR06 — Concorrência e idempotência

Revisão global pode servir de sinal de atualização, mas não de bloqueio de todas as escritas. Entradas aditivas independentes aplicam-se ao estado atual dentro da transação. Edição/substituição compara versão do recurso e das dependências relevantes; total manual, pagamento de restante, conferência e reversão precisam de invariantes próprias. Não tornar idempotência sinónimo de ausência de duplicação de intenções humanas.

Recibo é limitado por utilizador, espaço e identificador de pedido; contém versão do comando, fingerprint canónica e referência mínima ao resultado. Mesmo identificador com conteúdo diferente falha. Resultado repetido só é devolvido após autorização atual. Não guardar payload financeiro completo em logs. Depois de limpar payloads, impedir replay de efeitos por recibo/tombstone mínimo ou rejeição segura de pedidos antigos; nunca esquecer uma chave e reaplicar uma escrita antiga.

Autorizações, leitura atual, aviso de possível duplicação, efeitos e recibo têm ordenação transacional. Definir um ponto de confirmação: pedidos confirmados antes da revogação mantêm efeitos; os ordenados depois são recusados. Não prometer cancelar retroativamente um commit. Testar com conexões/processos distintos.

Aviso de montante igual não grava efeitos. A confirmação «operação diferente» deve estar ligada à intenção e ao contexto observado, validada no servidor. Se entretanto surgir novo conflito relevante, reavaliar. Nunca fazer de um `force=true` uma dispensa de permissões, versões ou regras financeiras.

## AR07 — Projeção financeira e navegador

Ao passar de `voided` para compensações, escolher uma única regra contabilística: o original contribui e a compensação neutraliza os seus efeitos. Não excluir o original e somar também a inversa. Migração de eventos já anulados/corrigidos preserva resultados exatos, sem inventar autores/datas. Corrigir inclui todos os efeitos ligados a reservas, transferências, allocations e conclusão de obrigações.

Cliente usa geração de contexto para sessão/utilizador/espaço/mês, ignora respostas antigas e cancela pedidos quando possível. Cancelar fetch não prova ausência de commit. Revisões só são comparadas no mesmo âmbito. Atualização remota pode começar pelo polling existente devidamente contextualizado; mecanismo de transporte não é requisito de produto.

Rascunhos ficam em memória. Pedidos incertos usam referência opaca mínima e recuperação autenticada no servidor; se for necessário guardar referência no navegador, não guardar montante, descrição ou credenciais. A solução deve funcionar após perda de resposta/logout sem mostrar referências de outra pessoa: índice de operações recentes/incertas do próprio utilizador no servidor e reautenticação. Uma referência local não concede acesso. Especificar retenção e limites antes de implementar; não alegar que prefixar localStorage é proteção suficiente.

Uma consulta «não encontrado» não prova que um pedido em trânsito nunca será recebido. O protocolo deve distinguir confirmação, processamento/estado incerto e encerramento terminal sem efeito. Antes de permitir uma nova intenção para substituir a antiga, o servidor deve garantir que a antiga já não pode executar: por encerramento atómico da chave com marca mínima, validade controlada pelo servidor ou mecanismo equivalente demonstrado. A verificação desse estado e a escrita financeira partilham a mesma ordenação transacional. Se o conteúdo original se perdeu, não o reconstruir nem repetir silenciosamente a partir de uma descrição aproximada; apresentar a situação, resolver a chave original e só depois permitir nova introdução explícita. Logout/timeout/cancelamento de fetch não são estados terminais do comando.

## AR08 — Ferramentas e dependências

Não substituir Next/React/TypeScript/SQLite por outra stack. Validar bibliotecas em documentação oficial e registar alternativa, razão, versão e impacto. Preferir dependência pequena mantida a criptografia/autenticação inventadas. Não usar biblioteca visual completa por defeito.

Hooks e análise de grafo como Graphify são opcionais, fora do caminho crítico. Só adotar com benefício medido, âmbito de ficheiros permitido e exclusão de bases/segredos/documentação privada. Não instalar nesta consolidação nem afirmar poupança de tokens não medida. Checks determinísticos podem correr via scripts/CI; hooks não substituem testes/revisão nem fazem commits automáticos.
