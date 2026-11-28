PROMPT — Discussão de requisitos, cenários e soluções para O meu mês

Quero que analises comigo a evolução do projeto O meu mês para utilização por várias pessoas. O objetivo desta conversa é discutir soluções, identificar cenários e fechar requisitos antes de alterar o código.

Quero uma discussão fundamentada no projeto existente. Não quero que comeces imediatamente a implementar, nem que apresentes uma arquitetura como decidida só porque foi sugerida anteriormente. Ajuda-me a compreender as alternativas, recomenda uma solução quando houver informação suficiente e explica o que ainda depende de uma decisão minha.

1. Âmbito desta conversa

Trabalha na pasta do projeto **O meu mês**.

As funcionalidades em discussão são:

- Entidade Utilizador e contas individuais de acesso à aplicação.
- Registo aberto ao público.
- Dados financeiros separados entre pessoas que não partilham informação.
- Partilha deliberada de finanças entre pessoas, por exemplo num casal.
- Meses, Modelo Base e restantes definições próprios de cada contexto financeiro.
- Permissões, convites, sessões, recuperação de acesso e ciclo de vida das contas.
- Segurança da aplicação e proteção de dados pessoais, incluindo o enquadramento europeu e português.
- Evolução segura do código e dos dados existentes para suportar estas funcionalidades.

Deixa infraestrutura fora desta conversa. Não compares fornecedores, preços, domínios, planos de alojamento, servidores ou serviços de cloud. Quando uma decisão depender de uma garantia externa, regista apenas essa dependência como assunto para uma fase posterior.

A migração para .NET foi apenas explorada numa conversa anterior. Não foi aprovada. Usa a stack atual como ponto de partida; não transformes esta discussão numa comparação de linguagens ou numa reescrita da aplicação.

Esta fase autoriza análise e discussão. Não autoriza alterar código, instalar bibliotecas, executar migrações, modificar bases reais, importar histórico, enviar emails, criar contas externas, publicar, fazer commit ou push. Não alteres documentação existente sem eu pedir. Não cries subagentes por iniciativa própria.

O projeto Finanças Pessoais é independente. Não o alteres nem cries dependências com ele. Não introduzas bancos, IA dentro do produto, pagamentos comerciais, subscrições pagas ou outras funcionalidades não pedidas.

2. O que já está confirmado e o que continua por decidir

Decisões confirmadas por mim:

- Quero abrir o projeto a outras pessoas.
- Cada pessoa terá a sua conta de utilizador.
- Quero que cada pessoa consiga gerir os seus meses e definições sem aceder automaticamente aos dados de outras pessoas.
- Quero permitir também partilha entre pessoas; não quero uma solução limitada a finanças totalmente independentes.
- Quero registo aberto ao público. Não substituas esta decisão por um produto exclusivamente por convite.
- Quero tratar seriamente os requisitos de segurança e proteção de dados.
- Nesta conversa quero discutir funcionalidades, cenários, requisitos e alterações necessárias ao código, deixando infraestrutura para depois.

Propostas anteriores que ainda não são decisões:

- Introduzir um Espaço Financeiro como entidade proprietária dos dados.
- Permitir a mesma pessoa em vários espaços pessoais ou partilhados.
- Criar automaticamente um espaço pessoal no registo.
- Usar três papéis: proprietário, editor e leitor.
- Partilhar sempre o espaço inteiro, em vez de selecionar meses, contas ou movimentos.
- Adotar OWASP ASVS 5.0 nível 2 como objetivo de verificação.
- Escolher um método ou biblioteca específicos de autenticação.
- Trocar SQLite por outro motor.

Não voltes a perguntar se quero partilha ou se o registo é público: isso está decidido. Pergunta sobre a forma concreta de os implementar no produto.

3. Fontes e estado do projeto

Se tiveres acesso ao repositório, lê primeiro AGENTS.md, docs/REQUISITOS.md e docs/PLANO.md, respeitando as instruções aplicáveis. Depois consulta os ficheiros relevantes para cada conclusão. Usa os caminhos a seguir relativamente à raiz indicada acima.

O plano consultado identifica as fases 1–5 como concluídas e a Fase 6 de usabilidade como pendente de aceitação. Confirma o estado atual. A nova discussão não encerra essa fase nem autoriza avançar automaticamente para outra.

Os documentos originais descrevem uma aplicação pessoal local. O meu pedido atual autoriza planear a evolução para várias pessoas, mas não torna automaticamente obsoletas as regras financeiras e de qualidade anteriores.

Houve trabalho adicional de acesso doméstico e uma importação específica autorizada em novembro de 2026. Não assumas que a base real está vazia. Isso também não autoriza novas importações. Não precisas de abrir bases, exportações ou Excel reais para esta análise.

Inspeciona git status antes de qualquer trabalho que possa alterar ficheiros. Pode haver alterações de outra tarefa; não as sobrescrevas, revertas ou incluas como trabalho teu.

Durante a preparação deste prompt foram observadas alterações concorrentes no repositório, incluindo remoção de arranques de ensaio/acesso doméstico e alterações no estado do navegador. As observações técnicas abaixo registam o que foi lido durante a análise; não são uma fotografia garantida da versão que encontrarás. Confirma cada ponto antes de o tratar como problema ainda existente e não restaures funcionalidades removidas apenas porque são mencionadas aqui.

Na última leitura, AGENTS.md já determina um único arranque normal por Iniciar.cmd e um único endereço local, http://127.0.0.1:3000/, com a base habitual. Proíbe criar demonstrações, ensaios manuais ou bases fictícias para o utilizador; permite bases sintéticas descartáveis e portas efémeras nos testes automatizados, com fixtures em tests/. Respeita a versão atual dessas regras, mesmo quando a documentação histórica descreve outro arranque. Esta conversa não precisa de arrancar a aplicação.

Se não tiveres acesso aos ficheiros, usa este prompt como descrição de referência e indica o que não consegues verificar. Não alegues ter lido código, executado testes ou inspecionado a interface sem o ter feito.

4. Observações técnicas da análise de 9 de novembro de 2026

Estes pontos foram observados no código, mas devem ser reconfirmados se a cópia local tiver mudado:

- package.json declara Next.js 16.4.4, React 19.3.1, TypeScript, Tailwind CSS, Vitest e Playwright. A persistência usa SQLite através de node:sqlite.
- Existem separações úteis entre src/domain, src/server, src/data e src/components. Reutiliza-as e preserva o domínio financeiro sempre que possível.
- src/domain/model.ts define State com catálogos, Modelo Base, recorrências, meses, mês selecionado e recibos de pedidos. Não inclui Utilizador, Espaço Financeiro ou associação de membros.
- Na revisão mais recente, src/server/access.ts usa localAccess para verificar Host local e writeAccess para verificar também Origin. Isto não é autenticação individual nem autorização por objeto. Não deve ser transportado como mecanismo de confiança para a versão pública.
- Foram lidos scripts de entrada doméstica e sessões em scripts/home-entry.mjs e scripts/home-credential.mjs, entretanto assinalados para remoção por outra tarefa. Essa proteção doméstica histórica não significa que o domínio e a base sejam multiutilizador. Não a reintroduzir nem a assumir ativa.
- src/server/http.ts verifica o acesso local, valida o formato dos pedidos e chama Repository. Já existe Cache-Control: no-store nas respostas relevantes e cuidado para não registar conteúdo financeiro nos erros comuns.
- src/server/repository.ts carrega tabelas globalmente. load reconstrói todos os meses e o parâmetro period seleciona o mês apresentado; não limita a consulta a um utilizador, a um espaço ou apenas a esse mês.
- O repositório persiste o estado percorrendo catálogos e meses. Não basta acrescentar um filtro na interface: consultas, comandos, alterações, eliminações e referências têm de respeitar o mesmo limite de acesso.
- src/server/storage.mjs cria months com period como chave primária. Várias tabelas usam period ou pares como period/id. O mesmo período em dois espaços distintos requer uma identidade que inclua o contexto financeiro.
- meta contém uma revisão global. Uma alteração num espaço não deverá provocar conflitos artificiais nos restantes.
- receipts usa scope/request_id; o âmbito atual é o período ou open para criação de mês. A identidade e o isolamento dos recibos precisam de revisão para vários espaços e utilizadores.
- As operações já usam transações, BEGIN IMMEDIATE, COMMIT e ROLLBACK. Existe idempotência, comparação do conteúdo canónico do pedido e controlo de conflitos. Preserva estas garantias ao acrescentar autorização.
- O esquema tem chaves estrangeiras, restrições monetárias e proteção de snapshots. Os triggers impedem atualizar e apagar snapshots. Será necessário conciliar a imutabilidade no uso normal com os procedimentos legítimos de eliminação de dados.
- A inicialização consulta catalog.local.json ou um catálogo incluído na aplicação e cria um primeiro mês. Isto não define o onboarding de pessoas novas. Não copiar automaticamente contas e categorias particulares para novos utilizadores.
- load lança erro quando não existe mês. Uma pessoa recém-registada ou um espaço ainda vazio precisa de um estado vazio suportado e de uma forma válida de criar o primeiro mês.
- src/app/api/local-files/route.ts disponibiliza backup e exportação global. O backup atual pode devolver um caminho local. Estas operações não podem passar a ser acessíveis indiscriminadamente a utilizadores públicos.
- src/server/local-files.mjs verifica integridade e compatibilidade das cópias; parte da verificação compara o esquema com as migrações. A evolução do esquema afeta também backup, restauro e compatibilidade de versões.
- src/data/usePersistentStore.ts mantém comandos ainda por confirmar em localStorage, incluindo conteúdo da ação. Não é a base definitiva, mas pode conter dados financeiros. As chaves atuais distinguem período/pedido e, quando aplicável, uma recuperação local; não distinguem utilizador e espaço financeiro.
- Esse hook mantém estado confirmado e revisão globais, atualiza ao recuperar foco e periodicamente a cada cinco segundos. A comparação de revisões, as respostas assíncronas e os pedidos pendentes têm de ser contextualizados ao mudar de pessoa ou espaço.
- Existem testes unitários de domínio, persistência e acesso, testes de integração do servidor/restauro e percursos Playwright. A existência de ficheiros de teste não comprova que a nova versão seja segura nem que a regressão atual passe: isso exige execução numa fase apropriada.

Não trates a análise como auditoria completa. Distingue sempre observação, consequência provável, hipótese e requisito proposto.

5. Modelo funcional: pessoa, espaço e conta financeira

Analisa a proposta Utilizador → associação de membro → Espaço Financeiro → dados financeiros.

Esclarece a diferença entre conta de utilizador, conta bancária/financeira registada no produto e espaço partilhado. Não uses a palavra conta de forma ambígua nos ecrãs.

Quero discutir:

- Um utilizador pode ter um espaço pessoal e um espaço de casal em simultâneo?
- Pode pertencer a mais do que um espaço partilhado?
- Criar um espaço pessoal é obrigatório, automático, opcional ou dispensável quando a pessoa chega através de um convite?
- Que dados pertencem à pessoa e quais pertencem ao espaço? Considera perfil, preferências, contas, categorias, reservas, Modelo Base, recorrências, meses, snapshots e movimentos.
- Partilhamos o espaço inteiro ou existe uma necessidade real de permissões por mês/conta? Explica a complexidade adicional sem a introduzir por defeito.
- Um novo membro vê todo o histórico do espaço ou apenas dados a partir de determinada data? A visibilidade parcial é realmente desejada?
- Como evitamos que mudar o espaço transforme silenciosamente dados pessoais em dados partilhados?
- Uma eventual cópia de definições entre espaços deve ser explícita e independente. Não presumir sincronização, fusão de históricos ou transferências financeiras entre espaços.
- O utilizador precisa de agregação entre espaços? Não a incluir automaticamente, pois pode criar duplicação e confusão de titularidade.

Compara a proposta de espaço com alternativas simples que realmente façam sentido. Recomenda uma base e explicita que possibilidades futuras deixamos deliberadamente de fora.

6. Registo, identidade e recuperação

Define os fluxos de registo público, confirmação de email, entrada, saída, recuperação de acesso, alteração de email e encerramento de sessões.

Compara apenas alternativas relevantes, como email/palavra-passe, passkeys ou acesso por ligação de email. Não escolhas um fornecedor nesta fase. Se uma biblioteca for necessária, avalia manutenção e compatibilidade com a stack antes de a propor.

Discute:

- Dados mínimos de perfil e se precisamos realmente de nome completo, data de nascimento ou outros dados.
- O que uma pessoa pode fazer antes de confirmar o email.
- Tratamento de contas não verificadas, duplicação de registos e mensagens que não revelem desnecessariamente se um email existe.
- Recuperação com tokens de utilização única, prazo de validade e revogação.
- Reautenticação para alterar identidade, eliminar espaços ou transferir propriedade.
- MFA e recuperação quando o segundo fator se perde; distinguir utilizadores comuns de administração do serviço.
- Sessões em vários equipamentos, expiração, revogação e mudança de palavra-passe.
- Limites contra abuso de registos, convites, tentativas de entrada e recuperação, sem impedir injustamente pessoas na mesma rede.
- Acesso de menores: identificar se requer uma decisão de produto, sem inventar idades ou impor recolha de dados sem necessidade.

Credenciais e sessões nunca devem ser consideradas um detalhe a acrescentar no fim. A autenticação identifica a pessoa; as permissões determinam o que ela pode fazer.

7. Permissões, convites e propriedade

Avalia proprietário/editor/leitor como proposta, sem assumir que estes nomes ou poderes foram aprovados.

Prepara uma matriz para: consultar, editar Modelo Base, criar meses, introduzir saldos, guardar plano inicial, registar/corrigir/anular movimentos, gerir catálogos, convidar/remover membros, alterar permissões, exportar, eliminar o espaço e transferir propriedade.

Considera explicitamente:

- Acesso negado por defeito; permissões verificadas no servidor em todas as rotas.
- O proprietário do espaço não é automaticamente administrador da aplicação, nem deve poder reescrever snapshots guardados.
- Um leitor pode ou não exportar todo o histórico? Não assumir equivalência entre ver e descarregar em massa.
- Quem pode editar movimentos registados por outra pessoa? Distinguir autoria de propriedade dos dados e de permissão atual.
- Convite associado a destinatário, papel e espaço, com prazo, revogação e aceitação explícita.
- Convites repetidos, aceitação repetida, email diferente, pessoa já membro, conta existente e pessoa ainda sem conta.
- Proteção contra aceitar um convite encaminhado para outra pessoa ou usar tokens obtidos em logs.
- Remoção de membros com separadores abertos, pedidos em curso e tentativas pendentes. Definir o momento a partir do qual novas operações são recusadas.
- Saída voluntária, último proprietário, transferência de propriedade e recusa do destinatário.
- Recuperação de um espaço cujo proprietário perdeu acesso, sem criar um atalho inseguro de suporte.
- Não prometer retirar dados já exportados legitimamente antes da revogação.

Registo público e convite para partilha são fluxos diferentes. O convite não é condição geral para criar conta.

8. Isolamento dos dados e alterações no servidor

Discute como introduzir um contexto de utilizador autenticado e espaço autorizado desde a entrada do pedido até ao repositório.

O cliente pode indicar o espaço que pretende usar, mas o servidor tem de validar a pertença. Não confiar em userId, ownerId ou role enviados no corpo do pedido como prova de identidade ou autorização. IDs difíceis de adivinhar também não substituem essa validação.

Analisa:

- Todas as consultas e mutações limitadas ao espaço correto.
- Chaves e restrições que impeçam ligar um movimento de um espaço a uma conta, reserva, linha ou recorrência de outro.
- Unicidade do período dentro do espaço, incluindo criação concorrente do mesmo mês.
- Isolamento de snapshots, recibos, exportações, resultados de pesquisa, caches e eventuais metadados de importação.
- Redução dos dados devolvidos pela API, evitando enviar todos os meses e recibos sem necessidade.
- Alternativas de revisão por espaço, mês ou recurso; começar pela mais simples que proteja a integridade sem conflitos globais desnecessários.
- Base partilhada com discriminação por espaço versus bases separadas, apenas na medida necessária para discutir isolamento, transações e migrações. Não selecionar infraestrutura nem multiplicar componentes sem benefício demonstrado.
- Compatibilidade das restrições e transações existentes se algum dia houver mudança de motor; não a considerar obrigatória para criar Utilizador.

Mostra os módulos afetados e a responsabilidade de cada um. Não escrevas uma implementação completa nem um esquema SQL definitivo antes de fecharmos os conceitos.

9. Concorrência, idempotência e confirmações incertas

Partilhar finanças implica várias pessoas a agir sobre os mesmos dados. A proteção atual contra duplo clique é útil, mas temos de distinguir:

- O mesmo pedido repetido pelo mesmo cliente após falha de rede.
- O mesmo identificador usado com conteúdo diferente.
- Duas pessoas a tentar pagar a mesma obrigação com identificadores diferentes.
- Dois pagamentos parciais legítimos para a mesma obrigação.
- Dois pedidos simultâneos para guardar o plano inicial ou abrir o mesmo mês.

Explica por que a idempotência técnica, por si só, não impede duas intenções independentes de duplicar um pagamento. Define propostas de conflito/revisão e feedback sem deduplicar operações só por terem a mesma data, nome ou montante.

As verificações de autorização e de integridade têm de ser coerentes com a transação. Uma autorização validada antes de uma revogação não deve dar permissão indefinida. Um pedido antigo repetido também não deve devolver informação a alguém que já perdeu acesso.

No navegador, discute o destino de pedidos por confirmar quando se faz logout, muda de utilizador, muda de espaço ou perde uma permissão. Não reexecutar automaticamente no contexto novo. Também não apagar a única referência a uma operação incerta sem uma forma de verificar se foi gravada.

Define como ignorar respostas atrasadas do contexto anterior, limpar dados visíveis e comparar revisões apenas dentro do âmbito correto. Um aviso de sucesso tem de corresponder a uma gravação realmente confirmada.

10. Regras financeiras que têm de ser preservadas

Não simplifiques estas regras por conveniência técnica:

- Cada mês é isolado. Sem transporte automático de saldos, pendentes, reservas, sobras ou estados.
- Um novo mês parte do Modelo Base do contexto correto, sem execução; os saldos iniciais são introduzidos/confirmados para esse mês.
- É possível executar pagamentos e recebimentos antes de guardar o plano inicial.
- Guardar o plano inicial é explícito, regista a data e preserva uma referência imutável. Uma segunda confirmação não o substitui.
- Alterar catálogos ou Modelo Base não reescreve a referência inicial nem os planos históricos.
- Reserva de poupança, transferência própria, despesa e investimento são conceitos diferentes.
- Um reforço de reserva reduz a origem e aumenta a reserva; não é despesa.
- Uma despesa paga por reserva reduz essa reserva e conta a despesa uma única vez.
- Uma transferência entre contas próprias não cria rendimento nem despesa.
- Compras individuais e total manual da mesma rubrica não duplicam gastos. Compras de 40 € e total atualizado para 60 € significam 60 €, não 100 €.
- Um total inferior às compras conhecidas exige resolução explícita; não apagar compras silenciosamente.
- Pagamentos parciais, acima do previsto e conclusão abaixo do previsto têm resultados explícitos. Por realizar nunca é negativo.
- Sobra de orçamento não é automaticamente saldo bancário disponível nem reforço do Fundo de Emergência.
- Lembretes recorrentes não alteram totais nem significam pagamento. Associar ou adicionar ao plano evita duplicações.
- Recorrências mantêm regras claras para 29/30/31 e 29 de fevereiro; consultar um mês futuro não altera indevidamente os restantes.
- Correções de saldo são movimentos datados e auditáveis; não substituições silenciosas do saldo.
- Suficiência financeira é verificada por conta; excedentes usados em sugestões de transferência não podem ser reutilizados várias vezes.
- Valores em falta não equivalem a zero.
- Cartão Refeição foi retirado do produto por decisão anterior. Não o reintroduzir; a regra de que fundos restritos não compensam dinheiro livre mantém-se relevante.
- Dinheiro é armazenado e calculado em cêntimos inteiros, com limites numéricos validados. IDs são estáveis e independentes de nomes e posições.
- Operações com vários efeitos mantêm atomicidade, inclusive em correções e anulações.

Não introduzir divisão de despesas, dívidas entre membros, compensações de casal ou contas conjuntas legais apenas porque existe partilha na aplicação. São requisitos diferentes, ainda não pedidos.

11. Segurança verificável

Quero um modelo de ameaças proporcional ao produto, com exemplos de pessoa não autenticada, membro de outro espaço, leitor, antigo membro, membro malicioso e conta comprometida.

Avalia OWASP ASVS 5.0 nível 2 como referência proposta. Confirma a versão e os requisitos aplicáveis na documentação oficial; usa identificadores apenas quando os tiveres verificado. Explica o que significa cumprir um controlo e que evidência o demonstra. OWASP Top 10 pode ajudar a organizar riscos, mas não é uma checklist suficiente nem uma certificação automática.

Abrange autenticação, sessões, autorização por objeto/ação, validação no servidor, SQL parametrizado, XSS, CSRF, exposição de dados, limites de pedidos, gestão de segredos e dependências.

Para palavras-passe, se forem usadas, discutir hashing adaptativo mantido, como Argon2id; não cifragem reversível nem algoritmos inventados. Para sessões, considerar cookies HttpOnly, Secure e SameSite, rotação e revogação. Não guardar credenciais de autenticação em localStorage.

Tratar separadamente os comandos financeiros pendentes atualmente guardados no navegador: minimizar conteúdo, restringir âmbito e retenção e definir comportamento em equipamentos partilhados. Um prefixo por utilizador não é cifragem nem protege de JavaScript malicioso na mesma origem.

Definir o que é registado para auditoria e o que deve ser omitido: palavras-passe, tokens, dados financeiros completos e segredos não pertencem aos logs comuns. Identificar acessos administrativos excecionais e evitar uma permissão geral para suporte consultar todas as finanças.

Não concluir que adicionar login ou cifrar uma base resolve a segurança do produto. Se houver cifragem aplicacional, explicitar contra quem protege e como se recuperam/rodam chaves, sem escolher serviços externos nesta fase.

12. Proteção de dados, histórico e eliminação

Identifica os requisitos de aplicação e os pontos que exigem avaliação jurídica, usando fontes oficiais atuais quando fizeres afirmações legais.

Considera RGPD, enquadramento português aplicável e orientações CNPD/CEPD. Não imponhas automaticamente ISO 27001, PCI DSS, PSD2, NIS2 ou outras obrigações apenas por ser uma aplicação de finanças pessoais; justifica a aplicabilidade antes de as incluir. Também não assumes que DPO ou avaliação de impacto são sempre obrigatórios.

Discute minimização, finalidades, bases legais, informação de privacidade, direitos dos titulares, retenção e resposta a incidentes. Distingue consentimento de outras bases legais e de simples aceitação de termos. Não acrescentes cookies analíticos, publicidade ou rastreio por defeito.

Não classifiques todos os dados financeiros automaticamente como categorias especiais do artigo 9.º, mas considera que descrições e notas podem revelar saúde ou outra informação especialmente sensível.

Quero resolver estes casos:

- Apagar uma conta pessoal com um único espaço privado.
- Apagar a identidade de alguém que registou movimentos num espaço ainda usado por outras pessoas.
- Um membro querer retirar dados seus que também integram um histórico partilhado.
- Eliminar um espaço completo, incluindo snapshots, recibos e referências.
- Manter integridade e autoria estritamente necessária sem conservar indefinidamente identificadores pessoais.
- Distinguir anonimização, pseudonimização e mera ocultação na interface.
- Tratar dados presentes em backups e evitar que um restauro reative contas, permissões ou dados cuja eliminação já devia ser respeitada.

Não decidas automaticamente que o proprietário do espaço pode eliminar tudo sem efeitos sobre os restantes, nem que o histórico financeiro permite ignorar todos os pedidos de apagamento. Explica as alternativas e as decisões a validar.

13. Exportação, backup e auditoria

Separa três finalidades: exportação disponível à pessoa, exportação de um espaço segundo permissões e backup administrativo para recuperação do serviço.

Uma exportação não pode incluir outros espaços, credenciais, tokens, configurações internas ou caminhos locais desnecessários. Discute se inclui autoria e dados pessoais de outros membros e com que limites.

Um utilizador comum não recebe acesso ao backup global. Definir autorização, confirmação, formato e conteúdo de cada operação. Não tratar exportação JSON como equivalente a todos os direitos de proteção de dados.

Preservar a recuperação testada existente, planeando a compatibilidade de cópias anteriores, o reconhecimento de versões e a integridade dos relacionamentos novos. Distinguir histórico financeiro, auditoria de segurança e logs técnicos, com acessos e retenções próprios.

14. Experiência de utilização

UI/UX continua a ser requisito de aceitação. Não transformar a aplicação num painel administrativo complexo nem numa folha de cálculo extensa.

Descreve os percursos: primeiro registo, primeiro espaço, primeiro mês, entrada por convite, alternância entre espaços, partilha, mudança de papel, saída, recuperação de acesso, exportação e eliminação.

O espaço e o mês em que a pessoa está a trabalhar devem estar claros. Uma operação nunca deve mudar de destino silenciosamente por causa de um convite aceite ou de outro separador.

Definir estados vazios, carregamento, email por verificar, convite expirado, falta de permissão, sessão expirada, conflito, confirmação incerta e falha de gravação. Mostrar mensagens em português de Portugal, datas portuguesas e EUR.

Preservar o trabalho introduzido num formulário quando for seguro, sem revelar dados ao utilizador seguinte. Definir o que acontece se a sessão expirar durante uma edição e como a pessoa regressa ao contexto correto.

Considerar teclado, foco, leitores de ecrã, contraste, nomes acessíveis e uso no telemóvel. Propor alternativas de interação quando houver uma decisão relevante; não criar protótipos executáveis nesta fase.

15. Cenários mínimos para discutir e transformar em critérios de aceitação

Usa pessoas e valores explicitamente fictícios. Inclui pelo menos:

1) A cria conta e começa sem dados particulares do dono original do projeto.
2) A e B têm o mesmo mês em espaços diferentes, sem colisões.
3) A e B gerem um espaço partilhado; C não tem acesso.
4) C tenta ler, editar e exportar dados conhecendo identificadores válidos do espaço de A.
5) Um leitor tenta escrever pela API, apesar de a interface esconder a ação.
6) Um convite é aceite duas vezes, após expirar ou pela conta errada.
7) B perde acesso com o espaço aberto e uma confirmação pendente.
8) A muda para outro espaço enquanto chega uma resposta antiga.
9) A faz logout num computador partilhado e B entra; nenhum dado ou comando de A aparece ou é reexecutado.
10) Dois membros pagam simultaneamente a mesma obrigação; distinguir duplicação de pagamentos parciais intencionais.
11) O pagamento foi gravado mas a resposta perdeu-se; repetir não duplica os efeitos.
12) Dois membros tentam guardar o plano inicial; a referência não é substituída.
13) Dois pedidos criam o mesmo mês; não duplicam Modelo Base nem lembretes.
14) Alterar o espaço A não provoca um conflito de revisão no espaço independente B.
15) Um membro tenta relacionar uma despesa com uma reserva de outro espaço.
16) O último proprietário tenta sair ou apagar a conta.
17) Um antigo membro pede apagamento, mas existem movimentos partilhados.
18) Uma exportação e um restauro respeitam os limites de acesso e o ciclo de vida dos dados.
19) Um espaço sem meses permite onboarding e primeira criação sem erros internos.
20) As regras financeiras anteriores continuam corretas para vários membros, incluindo os exemplos de total manual e despesa financiada por reserva.

Para cada cenário desenvolvido, indicar precondições, ação, resultado esperado e forma de verificar. Não usar apenas formulações genéricas como «deve ser seguro».

16. Evolução do código e migração dos dados existentes

Propõe uma sequência de alterações pequena e verificável, preservando o trabalho existente. Não assumir uma reescrita total.

Mapeia responsabilidades nos módulos de modelo/domínio, validação de comandos, entrada HTTP, repositório, esquema/migrações, estado do navegador, componentes e backup/restauro.

A atribuição dos dados atuais a um primeiro utilizador/espaço exige uma decisão explícita. Discutir identidade do destinatário, conservação de IDs, saldos, snapshots, autoria desconhecida e referências de importação. Não inventar autores históricos nem associar automaticamente tudo à primeira conta pública criada.

Planear testes automatizados de migração e reversão em bases sintéticas descartáveis, incluindo falha a meio, execução repetida, controlo de integridade e comparação dos resultados financeiros antes/depois. Não criar um ensaio manual separado para o utilizador. Não executar testes sobre dados reais nem apagar bases para fazer testes passar.

Discutir se a utilização local atual deve continuar como modo próprio ou se passa a usar autenticação. Não manter um bypass local que possa desativar inadvertidamente a autorização na versão pública.

Manter as decisões de armazenamento e autenticação tão simples quanto possível, sem abstrações genéricas sem necessidade. Identificar limites reais do código atual antes de introduzir ORM, microserviços ou sistemas adicionais.

17. Forma de conduzir a discussão

Quero trabalhar contigo por blocos. Não me apresentes dezenas de perguntas de uma só vez. Faz no máximo três perguntas importantes em cada ronda, com alternativas e uma recomendação justificada quando possível.

Para cada decisão, explicar:

- O problema concreto e um cenário que o demonstra.
- Duas ou três alternativas plausíveis, quando existirem.
- Impacto no utilizador, segurança, integridade financeira e esforço de implementação.
- A recomendação e os pressupostos de que depende.
- O que posso adiar e o que tem de ficar resolvido antes de abrir o registo ao público.

Mantém na conversa um registo de decisões confirmadas, propostas, questões pendentes e assuntos fora de âmbito. Uma sugestão tua só passa a decisão minha depois de eu a aceitar.

Não confundas prioridade com autorização. Mesmo quando concordarmos com uma solução, continua em análise até eu pedir implementação. Não publiques, não envies convites reais e não alteres a infraestrutura.

18. Resultado esperado desta conversa

À medida que fecharmos decisões, quero obter:

- Modelo funcional de utilizador, espaço, membros e dados.
- Matriz de permissões e regras de propriedade.
- Percursos e estados da interface.
- Requisitos funcionais e de segurança verificáveis, com prioridades.
- Decisões de privacidade, exportação, retenção e eliminação, com dúvidas jurídicas identificadas.
- Cenários de aceitação e estratégia de testes de isolamento, concorrência e regressão financeira.
- Mapa das alterações necessárias no código e dos elementos reutilizáveis.
- Plano de migração dos dados existentes e validação sem risco para a base real.
- Sequência de implementação futura, com critérios de conclusão e sem estimativas artificiais de precisão.

A tua primeira resposta deve resumir o que já está decidido, corrigir eventuais pressupostos com evidência do código e explicar o modelo funcional que recomendas como ponto de partida. Termina com até três decisões estruturais para discutirmos primeiro. Não entregues já uma implementação, não repitas perguntas resolvidas e não voltes ao tema do alojamento.
