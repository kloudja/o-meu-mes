# MU4 — Convites, membros e propriedade

Entrega local de 20 de novembro de 2026, sobre a MU3 aceite no diretório de trabalho de `master`, em `4ee6a4eeeebefa7d142c78195140c95e3da386e9`. O primeiro comando foi `git status --short`. O arquivo `.git/mu4-reference/baseline.zip` contém os 183 ficheiros de código, documentação e testes rastreados ou não ignorados que existiam antes da MU4. O inventário SHA-256 foi comparado com o diretório de trabalho antes das edições. A base diária, backups, chaves, configurações domésticas, documentos locais ignorados e Excel ficaram fora do arquivo e dos ensaios. A instância habitual ficou intocada.

## Convites, papéis e propriedade

- A secção **Partilha** está nas definições do espaço e pode ser aberta antes de existir um mês. Mostra a natureza do espaço, o papel atual e os membros. A natureza partilhada depende da existência de pelo menos dois membros ativos. A saída e a remoção lógica conservam as referências de autoria e as pertenças históricas.
- Um convite nasce **pendente**. A primeira aceitação válida leva-o a **aceite**, no mesmo commit que cria ou reativa a pertença. O código contém 256 bits aleatórios e a base guarda o SHA-256. O email usa a mesma normalização do registo. A comparação usa HMAC por espaço. O endereço fica cifrado enquanto ativo e é visível apenas ao proprietário emissor. O prazo padrão é sete dias. `OMEUMES_INVITE_DAYS` admite de 1 a 30 dias inteiros.
- A revogação ou reemissão torna o código anterior inutilizável. O prazo é verificado dentro da transação, mesmo antes da limpeza periódica. Um convite aceite pode confirmar a mesma adesão enquanto a conta tiver o email verificado correspondente e a pertença continuar ativa. A repetição não cria nova pertença nem altera o papel. Um membro ativo conserva o papel mesmo quando aceita um código novo com outro papel.
- No registo a aplicação valida o código associado e guarda só a referência por hash enquanto aguarda confirmação do email. A confirmação revalida o convite. Se já tiver expirado ou sido revogado, a conta fica confirmada e pode criar um espaço ou aceitar outro convite. Um registo com adesão bem-sucedida abre o espaço convidado. Uma aceitação nas definições de uma conta existente mantém a seleção anterior e acrescenta a opção ao seletor.
- A transferência nasce **pendente**, com prazo de sete dias, após o proprietário confirmar a palavra-passe e o TOTP, quando ativo. Só o membro destinatário pode **aceitar** ou **recusar**. O proponente pode **cancelar**. A saída ou remoção do destinatário cancela a proposta. Após o prazo, a aceitação é recusada e a manutenção marca-a **expirada**. A aceitação válida promove o destinatário e passa o anterior proprietário a editor no mesmo commit. Os convites que ficaram ativos do anterior proprietário são revogados. A restrição de unicidade e os triggers mantêm o par de proprietário e pertença coerente. A referência de criação do espaço conserva o criador original e permite repetir a criação após a transferência sem criar outro espaço.
- O bloqueio `BEGIN IMMEDIATE` ordena aceitação, mudança de papel, remoção, transferência e escrita financeira. Operações confirmadas antes de perder permissão conservam os efeitos. A despromoção e a remoção encerram os recibos ainda pendentes, pelo que voltar a dar permissão não reabre a mesma tentativa. O navegador atualiza as pertenças a cada cinco segundos enquanto o separador está visível, no foco e após ações locais. Ao detetar revogação retira dados e formulários. Ao detetar despromoção limpa o rascunho de edição e mantém acesso ao histórico.

## Permissões verificadas

| Rota e operação | Proprietário | Editor | Leitor | Fora do espaço |
|---|---|---|---|---|
| `GET /api/spaces` | Só os próprios espaços e papéis | Idem | Idem | Apenas espaços próprios, quando existam |
| `POST /api/spaces` | Cria espaço privado próprio | Idem | Idem | Idem, com conta confirmada |
| `GET /api/state` e `GET /api/history` | Leitura integral | Leitura integral | Leitura integral | Recusa |
| `POST /api/state` | Escrita e repetição autorizadas | Escrita e repetição autorizadas | Recusa | Recusa |
| `GET/POST /api/requests` | Recibos próprios | Recibos próprios | Recusa | Recusa |
| `GET /api/sharing` | Membros, convites ativos próprios e proposta aplicável | Membros e proposta aplicável | Membros e proposta aplicável | Recusa |
| `POST /api/sharing` para emitir, revogar, regenerar, mudar papel e remover | Sim | Recusa | Recusa | Recusa |
| `POST /api/sharing` para aceitar convite | Email verificado correspondente e código válido | Idem | Idem | Idem, com conta confirmada |
| `POST /api/sharing` para sair do espaço | Recusa enquanto proprietário | Sim | Sim | Recusa |
| `POST /api/identity` para propor transferência | Sim, com reautenticação | Recusa | Recusa | Recusa |
| `POST /api/sharing` para responder à transferência | Cancela enquanto proponente | Aceita ou recusa enquanto destinatário | Idem | Recusa |
| `POST /api/local-files` para exportar ou fazer backup | Recusa nesta fase | Recusa | Recusa | Recusa |

A exportação funcional pertence à MU5. Pesquisa do conteúdo é local à leitura autorizada do espaço. As rotas da MU4 não expõem emails dos membros. A consulta de convites exclui o código e o hash. Os pedidos com segredo usam corpo JSON e as respostas usam `Cache-Control: private, no-store`.

## Informação aos convidados

O texto informa sobre o histórico integral e remete para `/privacidade`. Copiar código ou mensagem e abrir o menu nativo são ações distintas. Nas alternativas por Email, WhatsApp e Telegram, o utilizador cola o texto no serviço escolhido. Os endereços abertos não levam código nem destinatário. A resposta do menu nativo indica o que aconteceu à ação de partilha, sem declarar envio ou entrega. O servidor não envia convites.

A recolha indireta começa quando o proprietário introduz o email, inclusive quando o código nunca sai da aplicação. A origem é o proprietário emissor. A finalidade é limitar o acesso ao destinatário verificado e controlar o ciclo do convite. Para uma abertura futura, os interesses legítimos do responsável e do emissor são uma hipótese a avaliar quanto a necessidade, proporcionalidade e impacto. O endereço cifrado é retirado ao aceitar ou revogar e, na manutenção, após expirar. A manutenção elimina os metadados terminais após 30 dias. O teste verificou a limpeza do caso nunca partilhado e a ausência de comunicação na fila. Até executar a manutenção periódica, o prazo já impede a aceitação.

Antes de qualquer abertura, o responsável real terá de acompanhar as emissões desde `created`, inclusive quando a partilha é desconhecida. Deve verificar diariamente os prazos e atuar antes da primeira comunicação ou divulgação aplicável, dentro do máximo de um mês, e antes de a limpeza retirar o contacto. Tem de disponibilizar informação por um canal verificável ou documentar uma exceção concreta aplicável, com data e fundamento. O template, a expiração e a existência da página não comprovam prestação da informação. O processo e o aviso definitivo ficam condicionados à identificação do responsável, ao fundamento validado e ao canal operacional, sem envio automático de convites. A41 fica parcial por essa razão. [RGPD, artigos 6.º e 14.º](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=pt)

## Aceitação e provas

| Casos | Evidência |
|---|---|
| A03–A05 | Um movimento de 9,80 € anterior ao convite ficou acessível com autoria ao leitor, enquanto uma terceira conta com IDs válidos recebeu recusa em estado, pesquisa, histórico, recibos, gestão e exportação. A escrita do editor foi autorizada no segundo espaço. As respostas do leitor não incluíram emails. |
| A06 | Duas instâncias Next com PIDs distintos usaram a mesma base em WAL. A aceitação simultânea e a repetição devolveram o mesmo espaço e gravaram uma pertença. Dois códigos da mesma pessoa, para espaços diferentes, deram acessos independentes. Reemissão, expiração, revogação concorrente, conta errada e tentativa de promoção por convite foram verificadas. O navegador verificou registo normal, campo recolhido, erro focado, retirada explícita, adesão após confirmar o email e saída do último espaço. Uma expiração durante a verificação manteve a conta confirmada sem criar pertença. |
| A07, A31 | A escrita anterior à revogação permaneceu. Um POST lançado de outro processo enquanto o bloqueio estava detido revalidou a permissão depois da revogação e foi recusado. Foram também recusados recibos, replays e leituras posteriores. A despromoção encerrou pendentes e manteve um movimento de 14,20 € e 285,80 € no banco. A interface retirou o formulário ao despromover e o histórico ao remover. |
| A08, A09 | Regressão de respostas atrasadas ao mudar espaço e mês, troca de conta e recibo reservado ao autor. A adesão pelas definições, num segundo separador, preservou a seleção e o rascunho de abertura de mês no primeiro. |
| A16, A31 | Reautenticação, aceitação repetida e concorrente, recusa, cancelamento, expiração e tentativa de despromoção do dono por SQL. A aceitação concorreu com saída e remoção entre dois processos Next. Uma transação separada simulou a marcação de eliminação antes de libertar o POST de aceitação; a aceitação foi recusada. SQL verificou um único proprietário em todos os casos e a passagem a editor. O encerramento de conta e o pedido de eliminação do espaço pertencem à MU5. |
| A24, A27 | Confirmação do novo email numa instância, recusa da sessão anterior e do código dirigido ao email anterior na segunda instância, aceitação com convite novo e GUID preservado. A regressão de preferências e validação de país e moeda continuou ativa. |
| A35 | Colagem, rótulos, `autocomplete`, registo e alteração de credenciais nas regressões Edge. A entrada sintética guardada no gestor nativo do Edge preencheu os campos e autenticou. A matriz física, extensões Bitwarden/1Password e atualização nativa do cofre permanecem por verificar. |
| A37 | Copiar texto no Edge, destinos sem segredo no URL, ocultação do código e cancelamento simulado de `navigator.share` em desktop e mobile. A interface nativa do sistema e a integração com aplicações externas em dispositivo físico ficam pendentes. [W3C Web Share API](https://www.w3.org/TR/web-share/) |
| A41 | Endereço cifrado, metadados temporários e limpeza verificados para código nunca partilhado. Prazo e tratamento da recolha indireta descritos acima. Prestação efetiva de informação ou exceção validada por demonstrar. |
| A43 | CLI de migração e arranque recusaram a v7 sem autorização, com bytes e inventário da pasta iguais. A migração falhada reverteu, e a transição autorizada v7 → v8 e a reabertura passaram. As cópias v7 e v8 restauraram em quarentena na respetiva versão e conservaram membros, mês e integridade referencial. |

## Verificação técnica e visual

Windows, Node.js 24.22.3, pnpm 11.25.0, Playwright 1.64.1 e Edge 157.0.4341.60. A build de verificação usou `OMEUMES_BUILD_DIR=.next-mu4-delivery`. Os ensaios com SQLite usaram diretórios temporários `omeumes-test-*` fora do projeto. Os servidores dos testes abriram portas efémeras em loopback.

| Comando | Resultado |
|---|---|
| `pnpm quality` | Fronteiras e ciclos em 94 módulos. Lint em 110 ficheiros e formatação em 77. |
| `pnpm typecheck` | Código de saída 0. |
| `pnpm test` | 197/197 em 11 ficheiros. |
| `pnpm build` | Build otimizada concluída em Next.js 16.4.6. |
| `pnpm test:integration` | 35/35 em sete ficheiros, incluindo quatro cenários MU4 nos mesmos dois processos das corridas MU3. |
| `pnpm test:e2e --workers=4 --output=test-results/mu4-delivery` | 106/106 no Edge em 4,1 minutos, incluindo os quatro percursos MU4. |
| `OMEUMES_QA_MANAGER=edge` com perfil temporário e `pnpm test:e2e` | 1/1, guardar, preencher e autenticar com gestor nativo. |

Foram inspecionadas imagens renderizadas em Edge a 1366 × 768 e 390 × 844. A revisão abrangeu a abertura de Partilha, o aviso antes de emitir, o código e as alternativas de cópia, a consulta do histórico como leitor, o erro de registo com foco no campo e a proposta de transferência. O campo da mensagem em mobile foi aumentado para caber a ligação de privacidade e o detalhe do leitor foi simplificado para deixar o histórico em foco. [Capturas sintéticas](../../test-results/mu4-delivery/)

Os registos estão em `.git/mu4-verification/`. A revisão cruzou os resultados HTTP com consultas diretas à base para verificar pertenças, proprietário, autoria, efeitos e recibos. Não houve segunda revisão por outro agente. A ausência de dispositivo ligado foi confirmada com `adb devices`.

## Ficheiros e reversão

O inventário `.git/mu4-reference/files.txt` lista cada ficheiro da MU4, incluindo este relatório e a atualização de arranque no `README.md`. A alteração principal está em `src/modules/spaces/`, na rota `/api/sharing` e na integração com identidade, finanças e armazenamento. O aviso está em `src/app/privacidade/page.tsx`. Os ensaios dedicados estão em `tests/e2e/mu4-sharing.spec.ts`, `tests/integration/mu4-data.test.ts` e na extensão da suite de processos `tests/integration/mu3-concurrency.test.ts`.

Da raiz do projeto, verificar primeiro se o patch inverso se aplica. Executar a segunda linha apenas se a primeira terminar com código 0. Se entretanto houver edições sobre a MU4 que causem conflitos, manter essas edições e resolver o conflito com base no inventário, sem aplicar o patch à força.

```powershell
git -c core.autocrlf=false apply -p2 --reverse --check .git/mu4-reference/mu4.patch
git -c core.autocrlf=false apply -p2 --reverse .git/mu4-reference/mu4.patch
```

O ensaio aplicou a inversão numa cópia física separada e comparou os 183 caminhos e os SHA-256 com a referência MU3, byte a byte. O índice Git habitual e a base de dados ficam fora deste patch. Um ficheiro sintético v8 requer o código v8. Para regressar a v7 em ensaio, usar uma cópia prévia v7 com o código correspondente. A MU4 não alterou a versão da base habitual.
