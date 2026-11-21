# MU6 · Revisão independente das fronteiras de acesso

Revisão técnica de 20 de novembro de 2026 por um agente distinto do responsável pela integração. O revisor recebeu a referência local da MU5 e analisou a implementação e os testes. O integrador recebeu os achados e efetuou as correções. A revisão não usou credenciais, sessões, movimentos nem cópias da base habitual. Os resultados de execução da suite e os pontos que ficaram sem prova estão no relatório principal. [Resultados da MU6](FASE_MU6_RESULTADOS.md) · [Mapa ASVS](MU6_ASVS.md)

## Superfície e método

O inventário partiu de `rg --files src/app`. Para cada método exportado, a leitura seguiu a rota, a transação, as consultas com parâmetros, o objeto devolvido e o consumidor no navegador. O confronto com a suite incluiu `mu1-identity`, `mu2-spaces`, `mu3-concurrency`, `mu4-sharing` e `mu5-privacy`, em `tests/e2e` e `tests/integration`. A máquina de estados e a cobertura implementada foram revistas estaticamente. As linhas abaixo não representam 70 ensaios HTTP independentes.

| Superfície atual | Fronteira observada no servidor e dados à saída |
|---|---|
| `/`, `/privacidade` | A raiz exige Host local e compõe o shell sem ler finanças no servidor. A página de privacidade contém texto público e pode mostrar o contacto do operador quando configurado. A integração pública terá de validar o encaminhamento da origem definitiva. |
| `/api/identity` GET/POST | GET devolve documentos, estado da própria conta e sessões com datas e identificadores de gestão. Sem sessão válida, devolve conta nula. POST usa schema por ação, limites, Host/Origin, verificação do contexto e transação. O segredo de sessão sai em cookie HttpOnly, o segredo de configuração TOTP e os códigos de recuperação só saem em ações próprias. |
| `/api/spaces` GET/POST | Listagem por pertenças atuais do titular. Criação atribui a propriedade à sessão. Repetição usa a relação do criador e a pertença atual antes de entregar nome e papel. Ver achado sobre o período entre o vencimento e a limpeza. |
| `/api/state` GET/POST | Revalida pertença e capacidade dentro da transação antes de ler, gravar ou devolver replay. A leitura limita-se a catálogo do espaço, lista de períodos, mês selecionado e dados derivados de que os cálculos necessitam. Limpa notas e nomes históricos das origens da resposta inicial. O cliente recebe os montantes e os efeitos dos movimentos do mês para calcular as suas projeções. |
| `/api/history` GET | Exige leitura atual. Até 20 identificadores por página, com filtro SQL por espaço e período. O detalhe inclui nome de autoria, data de registo, notas e nomes históricos. Os identificadores fornecidos nunca autorizam acesso por si próprios. |
| `/api/requests` GET/POST | Consulta ou alteração de referência usa espaço, utilizador e chave. O leitor não recebe sequer a caixa de recibos. A atribuição histórica filtra os recibos legados pelo atribuído. A consulta mínima mostra referência, período e estado. |
| `/api/sharing` GET/POST | Lista membros e papéis do espaço atual. Só o proprietário vê endereços dos seus convites pendentes. Proposta apenas para os intervenientes. Alteração de papel, remoção e gestão de convites verificam propriedade. Aceitação de convite vincula código, endereço confirmado, estado e prazo. Saída própria e aceitação/recusa de proposta dirigida são ações separadas da edição financeira. |
| `/api/export` POST | Preparação e descarga exigem proprietário atual. O passe de uso único liga digest, espaço, titular e prazo. Cada pedido revalida a propriedade. A exportação seleciona os campos financeiros do espaço inteiro e não inclui lista de titulares, credenciais, recibos técnicos ou tabelas globais. A cópia guardada pelo utilizador deixa a esfera de controlo do serviço. |
| `/api/closure` GET | Sessão de conta, correspondência com o titular e barreira de restauro. Só espaços próprios, membros que podem receber propriedade e estado da proposta. A conta em encerramento conserva este caminho e os direitos pessoais. |
| `/api/privacy` GET/POST | Titular vê os seus pedidos, mensagens e notificações. Operador é o GUID configurado, ativo, confirmado, com TOTP e autenticação recente. Só trata casos que lhe foram atribuídos. A redação exige caso aberto, pertença atual ou histórica do titular ao espaço e justificação. Existe autorização específica para alterar texto e snapshots nesse circuito. A resposta não transporta a contabilidade geral do espaço. |
| `/api/local-files` antigo | POST devolve 403 incondicionalmente. Sem GET de acesso a ficheiros. O caminho antigo de estado sem espaço explícito é recusado. Restauro, provisionamento do registo e atribuição de legado são operações offline. O código histórico de teste em `tests/legacy` não é uma rota da aplicação. |

## Resultado por interveniente

| Interveniente | Pode consultar e alterar | Exclusões observadas e ensaio relacionado |
|---|---|---|
| Visitante anónimo | Informação pública, registo e início dos percursos de autenticação/recuperação. Um desafio válido tem âmbito próprio. | Sem finanças, recibos, exportação ou casos. `mu1-identity.spec.ts` confronta o visitante com as rotas de identidade, finanças e ficheiros. |
| Conta não confirmada | Estado próprio de verificação/entrega, reenvio limitado e saída. | A sessão pendente não satisfaz `verifiedUser`. A primeira confirmação exige desafio e palavra-passe. `mu1-identity.spec.ts` e `mu4-data.test.ts`. |
| Membro de outro espaço | Espaços próprios/atribuídos e direitos individuais. Pode aceitar um convite válido para o seu endereço. | Os identificadores do espaço alheio não dão acesso a estado, histórico, recibos, partilha, gestão ou exportação. `mu2-data.test.ts` e matriz HTTP em `mu3-concurrency.test.ts`. |
| Leitor | Estado e histórico comum, nomes e papéis, saída própria e direitos individuais. Pode decidir proposta de propriedade dirigida a si. | Sem escrita financeira, recibos, exportação, gestão de membros ou email dos convidados. `mu3-concurrency.test.ts`, `mu4-sharing.spec.ts`, `mu5-privacy.test.ts`. |
| Ex-membro | Identidade própria, pedidos de direitos e os espaços a que continue a pertencer. | Ao voltar a pedir, perde leitura e escrita, incluindo o replay antigo. Um resultado já entregue antes da revogação permanece conhecido do destinatário. `mu3-concurrency.test.ts` ordena remoção e operações em processos distintos. |
| Sessão expirada | O estado público regressa após expiração absoluta ou por inatividade. Nova autenticação permite retomar apenas o contexto que continuar autorizado. | A consulta de fundo não prolonga o prazo. Rascunho financeiro limitado em memória para a mesma pessoa, espaço e mês. `mu1-identity.spec.ts`, `mu2-spaces.spec.ts`. |
| Operador administrativo de direitos | Casos atribuídos ao GUID configurado e operação estrita de tratamento. Como utilizador comum, vê apenas os espaços em que tenha uma pertença independente. | Sem papel financeiro implícito, consulta de movimentos de terceiros ou exportação administrativa pelo produto. Perda de autenticação recente encerra privilégios de operador na próxima ação. O administrador offline de backups constitui outra fronteira, com ACL e custódia reais por demonstrar. `mu5-privacy.spec.ts` e `mu5-privacy.test.ts`. |

## Caches, navegação e dados serializados

A pesquisa de `localStorage`, `sessionStorage`, `indexedDB`, `cache:`, `BroadcastChannel`, `AbortController`, `dangerouslySetInnerHTML` e `serviceWorker` foi seguida pela leitura dos consumidores de identidade, espaços, finanças, partilha, direitos e exportação. As APIs usam `no-store`. As respostas de contexto incluem `Vary: Cookie, X-Account`. O servidor valida o cookie e compara X-Account, que identifica a conta esperada pelo cliente. O seletor de espaço e de mês, a geração de pedidos, o cancelamento e a desmontagem impedem que uma resposta financeira anterior substitua a seleção atual.

O detalhe de histórico inclui texto histórico quando aberto. A lista inicial inclui descrições de compra utilizadas noutras áreas do mesmo mês. O registo de recuperação e os envelopes de email pertencem ao servidor. Os ficheiros JSON deliberadamente guardados e os dados que um membro já consultou não podem ser revogados à distância. A aplicação deve garantir a autorização no instante de cada novo pedido e abandonar os resultados pendentes quando o contexto local muda.

## Achados transmitidos ao integrador

| Achado na referência MU5 | Releitura e prova de regressão |
|---|---|
| A consulta de encerramento podia devolver nomes e membros de espaço vencido até à próxima limpeza. A repetição da criação também precisava de conferir o prazo em esquema v9. | Em `http.ts` a consulta revalida a sessão confirmada e filtra pelo instante da leitura do espaço. `mu3-concurrency.test.ts` contém o caso do espaço vencido antes da limpeza. Ver também a correção da repetição de criação no relatório da fase. |
| O download de exportação, já autorizado, podia continuar no navegador depois de mudar de conta ou espaço. | Em `ExportSpace.tsx` os pedidos partilham um AbortController. A mudança de contexto ou desmontagem cancela o pedido. O sinal é verificado antes de criar o Blob e clicar no link. `mu2-spaces.spec.ts` contém uma entrega atrasada na troca de espaço. |
| A lista de casos de direitos enviava o GUID do titular apesar de a UI só usar a indicação «meu». | Em `rights.ts` a projeção SQL calcula o booleano e deixa de selecionar o GUID para serialização. |
| A política com nonce da raiz não abrangia a segunda página pública. O conjunto de cabeçalhos de proteção variava entre página e APIs. | `proxy.ts` aplica nonce, CSP e no-referrer às duas páginas. `next.config.ts` estende nosniff, no-referrer e recusa de enquadramento a todos os caminhos. A verificação de uma política CSP integral, HSTS e do terminador TLS definitivo continua pendente para abertura. |

## Exceções e responsáveis

- **Engenharia de identidade.** Atualizar a cobertura local de palavras-passe previsíveis/comprometidas e documentar os termos específicos do serviço. Para lançamento, justificar a exceção de MFA opcional, rever a janela de TOTP e estabelecer procedimento de revogação administrativa sem conceder acesso financeiro.
- **Operador e engenharia.** Propor trilho mínimo de eventos para autenticações, recusas de autorização e falhas de controlo, com acesso limitado, prazos e alertas. Ensaiar recolha independente, sincronização de relógio, resposta operacional, rotação de chaves e indisponibilidade. A auditoria do circuito de direitos e o registo da reconciliação têm finalidades próprias.
- **Operador de infraestrutura.** Antes de acesso externo, validar domínio, HTTPS, política de cabeçalhos e caches, limites por rede e consumidor, ACL, destino do registo protegido e proteção contra recuo da sua versão. A aplicação local e o ensaio sintético não comprovam estas condições de alojamento.
- **Operador do tratamento.** Rever informação e canal de contacto para o convidado que nunca recebeu o código, bases de licitude, retenções e resposta a direitos fora da sessão. As decisões pendentes de MU4/MU5 e respetivas ações constam do relatório principal.

O procedimento de revisão limita-se à implementação identificada e à evidência disponível. O mapa ASVS inclui também requisitos sem teste aplicável à topologia local e requisitos que carecem de evidência externa. [Mapa completo dos 253 requisitos de nível 1 e nível 2](MU6_ASVS.md)

Após a revisão estática, o integrador executou também `mu6-permissions.spec.ts` com 12 operações por cada um dos sete contextos. A comparação final confirmou a revisão financeira e os períodos originais.
