# MU1 — Identidade, sessões e comunicações

Entrega local de 18–19 de novembro de 2026 para revisão. Ponto de partida em `master`, revisão `4ee6a4eeeebefa7d142c78195140c95e3da386e9`. O primeiro `git status --short` devolveu uma árvore limpa. A dependência instalada e o manifesto confirmaram Next.js 16.4.6, conforme o aditamento aceite da MU0.

## Arranque diário e situação dos dados

**A base habitual continua na situação anterior à MU1.** A implementação e a verificação não abriram a base pessoal, não consultaram o seu conteúdo nem executaram migrações sobre ela. Backups, exportações, catálogo privado, Excel e configuração doméstica ficaram fora dos ensaios. A garantia sobre o conteúdo da migração foi medida numa base sintética. Não foi calculado um hash dos dados pessoais.

Com a MU1 na árvore, `Iniciar.cmd` recusa a transição da base habitual antes de adquirir o bloqueio de ficheiro, compilar ou abrir SQLite. Se a instância antiga já ocupar a porta 3000, o comando começa por comunicar essa ocupação. O endereço manual continua a ser [127.0.0.1:3000](http://127.0.0.1:3000/). **Para voltar ao uso financeiro diário, aplicar a reversão do código no fim deste relatório.** Não há operação de descida de esquema nem necessidade de recuperar um backup pessoal.

A associação dos dados ficou integralmente para a MU2. O procedimento futuro terá de receber o GUID escolhido e o espaço privado de destino, identificar a origem, conservar IDs, referências, autoria histórica desconhecida, meses, movimentos, saldos iniciais, planos em vigor e iniciais, contas, categorias, poupanças, recorrências, ocorrências, metadados de importação e recibos de idempotência. Exige comparação financeira antes/depois, recuperação exercitada e autorização específica para dados reais. O registo de uma conta na MU1 nunca executa uma atribuição.

## Dados, migração e recuperação

A migração 5 é aditiva. As quatro migrações anteriores mantêm a ordem e o conteúdo. O esquema acrescenta `users` (GUID, nomes, email atual e pendente, verificação, residência, declaração 18+ e idiomas distintos), `credentials`, `sessions`, `recovery_codes`, `challenges`, `documents`, `acceptances`, `registration_intents`, `mail_jobs`, `auth_limits` e `identity_control`. Nomes e emails não identificam relações. O índice único do email atual e as transações `BEGIN IMMEDIATE` ordenam confirmações concorrentes. Várias intenções podem indicar o mesmo endereço. Só uma confirmação pode adquiri-lo.

`Iniciar.cmd → start-local.mjs → next.mjs`, `db:migrate` e a própria primitiva de migração verificam a barreira. A autorização de teste exige um caminho canónico numa pasta `omeumes-test-*` do diretório temporário do sistema, fora do projeto. A barreira recusa ficheiros ligados a outro destino, incluindo hard links preexistentes da base ou dos auxiliares. Nos scripts, a autorização da transição exige também modo de teste e o valor `MU1`. A reabertura de uma fixture v5 reconhecida dispensa repetir a autorização. A identificação inicial lê o cabeçalho sem criar WAL/SHM. Nenhuma variável fornecida ao arranque autoriza migrar a base habitual nesta fase.

**A43.** O revisor criou uma fixture com o módulo de armazenamento de `4ee6a4e` e invocou o verdadeiro `Iniciar.cmd`. A recusa devolveu código 1. SHA-256 antes e depois igual a `2d7ee236a0b2ef4c26e4bf1fa3a4b37854def8adae202b07cd922809594c96d1`, sem ficheiro auxiliar novo. Na transição autorizada e na reabertura, as 18 tabelas financeiras comparadas conservaram as 25 linhas, incluindo importação, ocorrência, snapshot, correção, alocação e recibo. Digest do conjunto lógico `a1344c3b5ffa0b7ce84c9b707c401d4ec815e31bea71e4a663d6fd503810f873`. Zero utilizadores atribuídos. O teste Windows do repositório repete a recusa, compara o ficheiro e o inventário da pasta, autoriza a fixture, testa o restauro e reabre na mesma porta de teste.

O formato de backup continua SQLite autónomo. A validação reconstrói o esquema esperado da versão em memória e verifica integridade, referências e conteúdo essencial. A cópia v4 de referência foi restaurada byte a byte. Backups v5 recebem quarentena na própria criação, conservam credenciais e finanças e podem ser restaurados para um destino novo. O serviço de identidade e a fila verificam o marcador antes de trabalhar. Abrir o backup diretamente como base também conserva a quarentena. O teste Windows confirma o estado financeiro, os saldos independentes, snapshot, ocorrências, revisão e replay na cópia sintética e compara os bytes da origem e do backup. A reconciliação de alterações posteriores ao backup pertence à recuperação operacional futura.

## Contrato HTTP e permissões

A página inicial apresenta a identidade num navegador local. `GET /api/identity` devolve documentos de desenvolvimento, intervalo de atualização e a projeção da sessão. Anónimos recebem `account: null`. A conta autorizada pode ver nome, GUID, emails próprios, estado de verificação/MFA, presença de códigos e identificadores públicos das suas sessões. Uma sessão pendente ou de substituição recebe a sua projeção restrita. Segredos de configuração TOTP e códigos novos só aparecem na resposta da ação correspondente.

`POST /api/identity` aceita um objeto JSON discriminado por `action`, validado por schemas estritos de Zod com um limite de 8 KiB. Exige Host da configuração e Origin exata, incluindo porta. O servidor determina o titular pelo cookie. Quando presente, `X-Account` é uma precondição adicional comparada dentro da transação para recusar um formulário apresentado por um separador desatualizado. Respostas privadas usam `no-store`. A página usa uma CSP com nonce por pedido, bloqueio de enquadramento e `Referrer-Policy: no-referrer`. Os tokens chegam no fragmento da ligação, removido do endereço pelo cliente. Abrir ou pré-visualizar a ligação não consome o desafio.

`GET/POST /api/state` e `POST /api/local-files` devolvem 403 antes do repositório, incluindo `backup` e `export`. A verificação fez pedidos diretos anónimos, de conta por verificar e de conta confirmada. Nenhuma resposta incluiu finanças ou caminho de ficheiro e nenhum pedido criou uma pasta de backups. O motor financeiro conserva-se testável em processos locais. Não existe espaço, papel administrativo, pertença, partilha, convite funcional ou conta com acesso global através do produto.

## Matriz de fatores e transições

| Ação e estado inicial | Provas necessárias | Estado confirmado pelo servidor |
|---|---|---|
| Registar | Primeiro e último nome, email, palavra-passe, residência PT, declaração 18+ e aceitação explícita dos termos `dev-1` em caixa inicialmente desmarcada | GUID novo e desafio de verificação. Resposta pública igual perante email repetido. Uma intenção opcional de convite guarda apenas o digest com prazo. |
| Entrar antes da confirmação | Email e palavra-passe | Sessão `pending`, consulta do próprio estado, reenvio limitado e logout. |
| Verificar | Token válido e palavra-passe da conta | Confirma uma vez e revoga as sessões pendentes. Exige novo login. Códigos de recuperação não substituem esta primeira prova. |
| Entrar após confirmação | Email e palavra-passe, mais TOTP quando ativo | Cookie novo, sessão `account` e estado «Sem espaços». Um login bem-sucedido termina a sessão anterior apresentada por esse navegador. |
| Consultar, revogar, sair | Consulta com sessão válida. Revogação individual ou de todas exige autenticação recente. Logout próprio é imediato | A revogação verifica o titular do ID de sessão. A UI limpa a conta. O servidor deixa de reconhecer os cookies revogados. |
| Reautenticar | Palavra-passe e TOTP se ativo | Roda o cookie e atualiza a prova recente. Conserva o prazo absoluto da sessão. |
| Alterar palavra-passe | Sessão de conta, palavra-passe atual e TOTP se ativo | Guarda novo hash, invalida sessões e desafios, emite sessão nova e aviso de segurança. MFA conserva-se. |
| Alterar email | Sessão de conta, palavra-passe e TOTP se ativo, seguidos de confirmação explícita do token enviado ao destino | Conserva o anterior até ao commit. A confirmação preserva o GUID, invalida sessões, desafios e intenção do endereço antigo e notifica o anterior. Em conflito, conserva o endereço atual. |
| Esquecer palavra-passe, com ou sem MFA | Pedido público genérico, token do email atual e nova palavra-passe | Revoga sessões e desafios. Com MFA ativo, o login seguinte ainda exige TOTP. |
| Emitir ou regenerar códigos | Conta verificada, palavra-passe e TOTP se ativo | Oito códigos de 128 bits, apresentados uma vez. Substitui o conjunto anterior, roda a sessão e termina as anteriores. Cópia e impressão exigem ação. |
| Ativar MFA | Sessão de conta, palavra-passe, chave de configuração pendente nessa sessão e primeiro TOTP válido dentro do prazo | Só a confirmação ativa o fator. Guarda segredo cifrado, contador consumido e novo conjunto de recuperação. Roda a sessão e revoga as restantes. |
| Perder o autenticador | Palavra-passe e código de recuperação válido de uso único, de conta com MFA | Consome o código e termina sessões. Emite sessão `replace` de dez minutos. Só permite configuração/substituição, atividade e saída. Confirmar um TOTP da nova chave substitui o fator, roda códigos e sessões. |
| Desativar MFA | Sessão de conta, palavra-passe e TOTP atual ainda não utilizado | Remove o fator, troca os códigos de recuperação, revoga sessões e avisa por email. Email ou palavra-passe isolados não removem o fator. |
| Perder o email sem MFA | Código emitido após a verificação original, confirmação no novo email e definição de nova palavra-passe | Início restrito à recuperação, sem login financeiro. Revoga sessões e invalida a ligação anterior. O titular pode corrigir o destino ou substituir uma ligação expirada. Na confirmação, muda email e palavra-passe e invalida todo o conjunto antigo de códigos atomicamente. |
| Perder o email com MFA | Palavra-passe e TOTP permitem entrar e mudar o email mediante confirmação no novo. Sem autenticador, palavra-passe mais código permitem primeiro substituir o fator | Não há desativação implícita de MFA, acesso por dados financeiros nem transferência por coincidência de email. |
| Perder todas as vias de prova | Sem combinação suficiente | O acesso permanece indisponível. Sem recuperação automática nem atalho de suporte. |

Os emails recebem trim e minúsculas, conservando pontos e sufixos `+`. Palavras-passe aceitam espaços, entre 15 e 256 pontos de código, com lista local de palavras-passe comuns. Hash Argon2id v19, 19 MiB, duas passagens e uma via de paralelismo. A transação ordena a verificação síncrona e as mudanças de credenciais na instância local. O custo de bloqueio e a capacidade sob carga pública exigem nova medição antes da abertura.

## Prazos, segredos e comunicações

| Configuração do servidor | Valor desta fase |
|---|---|
| Sessão normal | 30 minutos de inatividade, 12 horas absolutas, cookie de sessão. |
| Manter sessão | Opção explícita, 7 dias de inatividade, 30 dias absolutos. Cookie HttpOnly, SameSite=Lax e Secure com prefixo `__Host-` em HTTPS. HTTP só é aceite como origem de loopback. |
| Prova recente, configuração MFA e substituição | 10 minutos. TOTP de 6 dígitos, período de 30 segundos, tolerância de um passo por lado e contador estritamente crescente. |
| Confirmação inicial e outros desafios | Verificação de email 24 horas. Reset, alteração e recuperação de email 30 minutos. Reenvio inicial/reset com intervalo de 1 minuto. |
| Limites de tentativa | 12 por operação e contexto em 15 minutos. Limite partilhado de 180 na rede local por 15 minutos. Chaves derivadas por HMAC. Não usa cabeçalhos de IP encaminhado. |
| Fila | Orçamento de 280 tentativas por 24 horas, até 5 envios por tarefa, reserva de 1 minuto, timeout de 10 segundos e repetição exponencial a partir de 1 minuto. Consulta de evidência de entrega a cada 15 minutos no primeiro dia. |
| Atividade e retenção | GET/polling de 15 segundos não renova a sessão. Interação na página envia atividade limitada em frequência. Limpeza horária de sessões expiradas, contas nunca confirmadas após 30 dias, intenções após 7 dias, tarefas após 30 dias e limites antigos. Configuração das janelas futuras de auditoria, backup e duplicados está separada das rotinas efetivamente ativas. |

`src/modules/identity/policy.mjs` centraliza as escolhas técnicas. Nos testes o relógio é injetado na fronteira do serviço e do trabalhador. Os testes da UI avançam a expiração da própria fixture. O único rascunho autenticado recuperável é o novo endereço ainda não submetido, em memória do mesmo separador. O GUID e a capacidade são revalidados antes de o repor. Logout, mudança de conta e notificações de outras sessões limpam o formulário e os segredos.

A chave de 32 bytes em Base64 canónico vem de `OMEUMES_AUTH_KEY`, separada da BD. AES-256-GCM protege segredos TOTP e o conteúdo necessário ao envio, com finalidade/identificador autenticados e nonce aleatório. Cookies, tokens e códigos aleatórios têm apenas o digest nas tabelas de validação. A cópia cifrada do conteúdo do email é eliminada após resultado terminal. Não há segredo de exemplo utilizável nem estado autenticado versionado.

As fixtures criam a chave em memória, definem `OMEUMES_AUTH_ORIGIN` para a própria origem efémera, `OMEUMES_TEST_MODE=1`, `OMEUMES_TEST_TRANSITION=MU1` e um `OMEUMES_DB_PATH` temporário. `OMEUMES_MAIL_TRANSPORT` é `test` por omissão. A caixa sintética só escreve fora do projeto com `OMEUMES_TEST_MAILBOX=1` no modo de teste. Sem caixa, o adaptador comunica adiamento. Não existe endpoint HTTP para obter tokens. Uma configuração inválida falha fechada.

**Brevo.** O adaptador explícito `brevo` requer origem HTTPS, `BREVO_API_KEY` e `BREVO_SENDER`, e é recusado em modo de teste. A identidade e a tarefa de envio ficam duráveis na mesma transação. A fila prioriza segurança, reclama cada tarefa com prazo e contador de tentativa e faz a chamada de rede fora da transação. A chave de idempotência acompanha o pedido. Uma resposta tardia não pode substituir a confirmação de outra tentativa. Um token expirado enquanto aguardava envio é substituído antes de enviar, enquanto o desafio continuar atual. Reenvio ou alteração de credenciais invalida a ligação anterior.

Os estados são pendente, em envio, adiado, aceite, entregue e falhado. Um HTTP 201 com identificador significa aceitação. A consulta autenticada de eventos por identificador pode confirmar entrega. Um evento de outra mensagem é ignorado. A caixa sintética fornece evidência de entrega apenas local. A verificação da conta exige sempre a ação do utilizador. A Brevo documenta deduplicação por 30 minutos. Não se promete entrega exatamente uma vez após uma indisponibilidade arbitrariamente longa. O uso único da ligação é imposto em SQLite. Os templates pt-PT usam texto simples e o idioma de comunicações da conta.

O plano gratuito consultado indicava 300 envios/dia e até 1000 transacionais adicionais na fila do fornecedor. O orçamento local deixa margem e não pressupõe disponibilidade de créditos. Antes de qualquer envio real, o operador terá de validar a conta e o remetente, autenticar o domínio, rever o DPA e configurar rastreio desativado no fornecedor. A MU1 não efetuou esses atos. [Plano e limites](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) · [Domínio e remetente](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC) · [DPA](https://help.brevo.com/hc/en-us/articles/15403782599570-Where-can-I-find-the-Data-Processing-Agreement-DPA) · [Envio](https://developers.brevo.com/reference/send-transac-email) · [Idempotência](https://developers.brevo.com/docs/heterogenous-versions-batch-emails) · [Eventos](https://developers.brevo.com/reference/get-email-event-report)

## Dependências e decisões

- **OTPAuth 9.6.0** calcula e valida TOTP. **@node-rs/argon2 2.2.2** fornece a implementação nativa e a verificação de hashes PHC. **@zxcvbn-ts/language-common 4.2.0** fornece a lista local de 49 233 palavras-passe comuns. As três estão fixadas, com licença MIT. A lista é um controlo offline proporcional, sem promessa de abranger todas as fugas recentes. [OTPAuth](https://github.com/hectorm/otpauth) · [node-rs](https://github.com/napi-rs/node-rs) · [Dicionários zxcvbn-ts](https://zxcvbn-ts.github.io/zxcvbn/guide/languages/) · [Parâmetros Argon2id da OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- A autenticação combina essas bibliotecas, primitivas de `node:crypto` e sessões opacas revogáveis em SQL explícito. A aplicação controla autorização, recuperação multifator e a barreira. A escolha conserva SQLite e a transação já usada pelo projeto, sem introduzir outro ORM, serviço de identidade ou protocolo criptográfico. O adaptador Brevo usa `fetch` do Node. Zod, Next, React, CSS e o componente Button da MU0 foram reutilizados. [Criptografia do Node](https://nodejs.org/api/crypto.html) · [CSP e nonces no Next](https://nextjs.org/docs/app/guides/content-security-policy)
- Os controlos revistos incluem uso único, duração absoluta, término no servidor, alteração de fator e gestão das sessões, associados a ASVS 5.0.0, 6.5.1, 7.3.2, 7.4.1, 7.4.3, 7.5.1 e 7.5.2. A evidência cobre os percursos abaixo. Não houve avaliação integral nem certificação ASVS. [Texto oficial da ASVS 5.0.0](https://github.com/OWASP/ASVS/blob/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv)

## Execução e evidência

Ambiente Windows, Node 24.22.3, SQLite 3.54.1, pnpm 11.25.0, Next 16.4.6, React 19.3.1, TypeScript 5.9.3, Zod 4.6.7, Biome 2.6.8, Vitest 4.1.12 e Playwright 1.64.1. O QA executou a linha de base numa cópia `git archive HEAD` com dependências do lockfile. A primeira passagem dos unitários deu 182/183 porque o próprio caminho da cópia tinha o prefixo de uma fixture. Com raiz de projeto neutra passaram 183/183. Não ficou uma falha de referência por resolver.

| Comando | MU0 na linha de base | MU1 |
|---|---|---|
| `pnpm quality` | Passou | Passou, 71 módulos no grafo, 80 ficheiros em lint e 44 em formatação. |
| `pnpm typecheck` | Passou | Passou com TypeScript estrito. |
| `pnpm test` | 183/183 | 197/197, incluindo 14 cenários MU1 com relógio, fatores, revogação, fila e restauro. |
| `pnpm build` | Passou | Passou em diretório isolado de build. |
| `pnpm test:integration` | 4/4 | 5/5. Inclui os comandos Windows reais e duas instâncias Next independentes a disputar o mesmo registo/token/endereço. |
| `pnpm test:e2e` | 84/84 no Edge | 9/9 no Edge. Os 84 percursos financeiros antigos mantêm os seus specs para um futuro contexto autorizado. O contrato MU1 fecha essas rotas. |
| `pnpm audit --prod --json` | Relatório MU0 já disponível | Zero avisos conhecidos devolvidos pelo serviço no momento da consulta. |
| `pnpm install --offline --frozen-lockfile` | Instalação isolada do QA | Passou na árvore entregue, com dependências já atualizadas. |

Foram usados `pnpm add --save-exact @node-rs/argon2@2.2.2 otpauth@9.6.0 @zxcvbn-ts/language-common@4.2.0`, `pnpm exec biome format --write` limitado aos ficheiros da fase e `OMEUMES_BUILD_DIR` para builds/suítes. Os registos de execução da integração estão em `.git/mu1-*.log`. A suíte financeira de concorrência comunica por IPC com processos do repositório de teste. Não há servidor financeiro global nem chave de acesso de teste no produto.

**Interface.** No Edge a 1366 × 768, a página de entrada mostrou a opção de sessão mantida desmarcada e ações separadas para registo e recuperação. O registo conservou nomes, email e país após o erro, limpou a palavra-passe e associou a mensagem ao campo. Na conta confirmada, «Sem espaços», as opções de segurança e as sessões ficaram em secções distintas. [Entrada desktop](../capturas/mu1/login-1366.png) · [Validação desktop](../capturas/mu1/registo-1366.png) · [Conta desktop](../capturas/mu1/conta-1366.png)

A 390 × 844, os nomes passaram para uma coluna, a política abriu no fluxo do formulário e as ações de segurança quebraram em linhas dentro do cartão. Foi verificada ausência de deslocação horizontal. O estado adiado mostrou o endereço sintético, a explicação e o reenvio. Foram inspecionadas as sete capturas renderizadas, locais e ignoradas pelo Git. [Entrada móvel](../capturas/mu1/login-390.png) · [Validação móvel](../capturas/mu1/registo-390.png) · [Conta móvel](../capturas/mu1/conta-390.png) · [Entrega adiada](../capturas/mu1/entrega-adiada.png)

## Revisão independente e aceitação

O revisor sénior trabalhou sem editar o produto. Comparou a origem v4 por conteúdo e por bytes, testou a disputa entre processos por um único token e pelo mesmo endereço e interrompeu um envio entre a reserva e a confirmação. Encontrou a possibilidade de recuperar uma cópia feita antes de uma revogação, o consumo prematuro do último código na recuperação sem email, a falta de reautenticação para gerir sessões antigas e a janela entre a mudança de titular e a atualização de outro separador. A integração introduziu a quarentena desde a criação da cópia, consumo do conjunto de códigos na confirmação, rotação após reautenticação e a precondição transacional de titular. O reteste independente confirmou 428 para prova antiga, rejeição de reautenticação sem TOTP quando ativo, 409 para GUID desatualizado e conservação do prazo absoluto. Um trabalhador atrasado deixou intacto o resultado aceite por outro.

O QA verificou diretamente as rotas antigas e os estados da conta. Encontrou um rótulo de país ambíguo, a ligação de recuperação sem a indicação necessária para apresentar a nova palavra-passe e falha da primeira passagem dos formulários. Foram corrigidos o rótulo, o tratamento de fragmentos mesmo no separador já aberto e a transição após mudança de sessão. Outras correções distinguiram expiração de envio pendente, preservaram o intervalo de reenvio após limpeza do desafio e limitaram a asserção do alerta à área do formulário. A primeira execução de um teste de expiração encontrou contenção na ligação SQLite aberta pelo próprio teste. Foi aplicada espera limitada nessa ligação e os percursos foram repetidos.

| Cenário | Evidência e limite |
|---|---|
| A01, A21 | Registo, nomes compostos, documento aceite, GUID, GET sem consumo, expiração, uso único, 403 financeiro e estado sem espaços. Criar o primeiro espaço cabe à MU2. |
| A22 | Quota, timeout, limite de tentativas, reenvio, expiração durante adiamento, deduplicação, confirmação tardia e evento de entrega por ID. Nenhum envio real. |
| A23 | Matriz acima, fator ativo preservado no reset, substituição restrita e conclusão no navegador, códigos revogados e TOTP anti-replay. |
| A24 | Alteração concorrente resolvida em SQLite. Preservação de GUID e revogação de tokens/sessões anteriores. A validação de pertença por convite pertence à MU4. |
| A25 | Inatividade e limite absoluto nos dois modos, leituras de fundo, dois contextos, reautenticação e revogação. O navegador recuperou o novo email apenas para a mesma pessoa e deixou a palavra-passe vazia. |
| A29 | Informação de privacidade separada e aceitação identificada. Operador, contacto real, receção e acompanhamento de pedidos exigem o procedimento posterior de privacidade. |
| A35 | Matriz de navegadores e gestores abaixo. Ensaios móveis por viewport. |
| A43 | Barreira no arranque real, reabertura, migração transacional, conservação financeira e quarentena de recuperação. |

## Navegadores e gestores de palavras-passe

Os ensaios usaram contas sintéticas e perfis temporários no Windows. Nos testes do gestor nativo, o QA criou uma entrada no próprio gestor e confirmou que o navegador preencheu **os dois campos** e que o servidor autenticou a conta. Testou a atualização separadamente, mudando a palavra-passe na aplicação, terminando a sessão, voltando ao formulário e comparando o preenchimento com a credencial nova. Os registos distinguem a alteração gravada na aplicação da alteração guardada no cofre.

| Navegador em Windows | Registo, colagem e alteração na aplicação | Guardar e preencher com o gestor nativo | Atualização no gestor nativo |
|---|---|---|---|
| Edge 157 | Registo e colagem por teclado a 1366 e 390 px. A nova palavra-passe permitiu novo login. Nove percursos completos na build final. | Entrada adicionada manualmente ao gestor, autofill e login confirmados. Usada também uma palavra-passe gerada pelo Bitwarden CLI. | Depois da alteração e de nova visita, o ensaio headless recebeu a palavra-passe anterior. Atualização do cofre por diálogo nativo por verificar. |
| Chrome 147 | Registo com colagem de palavra-passe gerada pelo Bitwarden CLI. Alteração e novo login passaram. | Gravação no gestor, autofill e login confirmados. | No ensaio headless voltou a preencher a anterior. Aprovação e atualização por diálogo nativo por verificar. |
| Brave 157/158 | O navegador foi atualizado durante o QA. No 158, registo com colagem da palavra-passe gerada pelo Bitwarden CLI, alteração e novo login passaram. | No perfil temporário 158.1.100.58, o diálogo «Guardar» fechou, a lista permaneceu vazia e a entrada não preencheu o login. | Por verificar. O ensaio não conseguiu estabelecer uma entrada guardada no cofre. |
| Firefox 143 instalado | Testado por Selenium e geckodriver 0.37.1. O produto gravou a alteração de palavra-passe. | Entrada criada em `about:logins`, autofill e login confirmados. | Tentativa de aceitar a atualização, logout e nova visita. O gestor não preencheu a credencial nova. |
| Firefox 157 do Playwright | Registo com colagem da palavra-passe do Bitwarden CLI e percurso de alteração passaram. | A preferência de autofill foi ativada no perfil descartável. Guardar, preencher e entrar passaram. | Voltou a preencher a anterior depois da alteração no produto. |
| WebKit 27.2 do Playwright | Nove percursos passaram, incluindo colagem, recuperação, alteração de credenciais e os dois viewports. | Gestor nativo do Safari/Porta-chaves por verificar. | Por verificar em Safari. |

**Bitwarden e 1Password.** A geração pelo Bitwarden CLI 2026.10.1 foi local. Esse ensaio comprova que a aplicação aceita a palavra-passe gerada. Para **Edge × Bitwarden**, **Chrome × Bitwarden**, **Brave × Bitwarden** e **Firefox × Bitwarden**, o preenchimento, a gravação e a atualização pela extensão com cofre desbloqueado continuam por verificar. A aplicação Bitwarden desktop instalada não foi ligada a uma conta pessoal. Para **Edge × 1Password**, **Chrome × 1Password**, **Brave × 1Password** e **Firefox × 1Password**, as quatro operações pela extensão continuam por verificar. Não havia sessão sintética desses cofres disponível. Também ficam por confirmar a geração nativa no formulário e a sugestão de guardar automaticamente após o primeiro registo nos quatro navegadores.

No Playwright, `OMEUMES_QA_MANAGER` seleciona o ensaio opcional de gestor nativo, `OMEUMES_QA_MANAGER_UPDATE=1` verifica o valor preenchido após a alteração e `BROWSER_PATH` seleciona o executável. O QA manteve os perfis pessoais fechados. A passagem em WebKit foi efetuada com `OMEUMES_QA_BROWSER=webkit` e a instalação temporária dos navegadores do Playwright.

**Dispositivos.** As capturas móveis são de viewport emulado. `adb devices` não encontrou dispositivo ligado. Continuam por verificar Android físico com Chrome, Edge, Brave e Firefox, iPhone/iPad com Safari e gestores do sistema, e as extensões ou serviços móveis Bitwarden e 1Password. Foram verificados o campo numérico de seis dígitos, `inputmode=numeric` e `autocomplete=one-time-code`. A abertura do teclado virtual real e a sua interação com o formulário não foram observadas. Não se utilizou Brevo real nem se publicou a aplicação.

## Ficheiros afetados e reversão

- Arranque, dependências e verificações em `README.md`, `package.json`, `pnpm-lock.yaml`, `biome.json`, `next.config.ts`, `playwright.config.ts` e `scripts/{check-boundaries,migrate,next}.mjs`.
- No servidor, `src/server/{storage,local-files,transition}.mjs`, `src/server/{http,unavailable-finance}.ts` e `src/proxy.ts`.
- Pontos de entrada em `src/app/page.tsx` e `src/app/api/{identity,state,local-files}/route.ts`.
- Módulo novo `src/modules/identity/` com `account.ts`, `contracts.ts`, `input.ts`, `schema.mjs`, `policy.mjs`, `secrets.mjs`, `mail.mjs` e `ui/{IdentityApp.tsx,IdentityForm.tsx,identity.css}`.
- Fixtures e testes em `tests/migrate-synthetic.ts`, `tests/unit/{local-files,persistence,mu1-identity}.test.ts`, `tests/integration/{recovery,server,mu1-concurrency}.test.ts`, `tests/integration/finance-worker.mjs`, `tests/e2e/identity-application.ts` e `tests/e2e/{mu1-identity,mu1-interface,native-manager}.spec.ts`.
- Este relatório. As sete imagens de evidência ficam em `docs/capturas/mu1/`. Logs, patch e builds de verificação ficam locais.

O patch local `.git/mu1-4ee6a4e.patch` abrange a MU1 e os ficheiros novos, incluindo o relatório. A verificação inversa passou sobre o diretório de trabalho. A aplicação inversa num índice temporário recuperou exatamente a árvore de `4ee6a4e`. O índice habitual ficou intacto. Para regressar à versão aceite, fechar a instância da aplicação, abrir PowerShell na raiz e executar cada linha apenas após sucesso da anterior.

```powershell
git apply --reverse --check .git/mu1-4ee6a4e.patch
git apply --reverse .git/mu1-4ee6a4e.patch
pnpm install --frozen-lockfile
.\Iniciar.cmd
```

A inversão é apenas de código, dependências, testes e documentação. Deixa a MU0 e o Next 16.4.6 na árvore e usa a base habitual no endereço habitual. Não apagar ficheiros SQLite, WAL/SHM, backups ou exportações. Se uma edição posterior tocar nos mesmos trechos, a verificação pode recusar a inversa. Nesse caso, rever apenas os hunks em conflito e conservar a edição posterior. Os artefactos ignorados de ensaio são independentes do arranque. A fase termina aqui, com a MU2 e qualquer operação sobre a base pessoal dependentes de nova autorização.
