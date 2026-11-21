# MU6 — Verificação integrada e condições de abertura

**Entrega local de 20 de novembro de 2026.** O arranque normal recompilou a aplicação e voltou a servir a base habitual, em SQLite v9, em `http://127.0.0.1:3000/`. A comparação de conteúdo antes e depois coincidiu nas 21 tabelas de identidade e finanças verificadas. A abertura pública continua bloqueada. As decisões sobre o operador, A35, A37 e A41 figuram abaixo com responsável e ação.

A referência é a MU5 local aceite, sobre `master` na revisão `4ee6a4eeeebefa7d142c78195140c95e3da386e9`. O primeiro comando foi `git status --short`. As 102 entradas dessa listagem incluem diretórios novos agregados pelo Git. Antes da primeira edição, foram copiados e conferidos por SHA-256 os 213 ficheiros rastreados e novos não ignorados selecionados de código, configuração, documentação e testes. A seleção excluiu os dados, backups, exportações, documentos locais privados, segredos, ficheiros Excel e artefactos de build. O índice Git ficou intacto. A referência, os registos e o procedimento de reposição estão indicados no fim.

## Execução reproduzível

Windows x64, Ryzen 5 5600H, 12 processadores lógicos, 31,4 GiB de RAM, Node 24.22.3, SQLite 3.54.1, pnpm 11.25.0, Next 16.4.6, Vitest 4.1.12 e Playwright 1.64.1. As suites usaram fixtures produzidas a partir de `tests/` e SQLite no diretório temporário dedicado, fora do projeto. Os servidores de teste pediram uma porta livre em loopback. Não houve emails reais. A compilação de ensaio usou um diretório separado. Os comandos seguintes podem ser executados da raiz, com TEMP e TMP a apontar para uma pasta temporária fora do projeto.

```powershell
$env:OMEUMES_BUILD_DIR = '.next-mu6-final'
$env:OMEUMES_TEST_TRANSITION = 'MU5'
pnpm quality
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
pnpm test:e2e --workers=2 --output=test-results/mu6-entrega
```

`MU5` é a autorização existente para as migrações de fixtures até v9. As próprias fixtures definem o caminho da base, a porta e o transporte de teste. O arranque habitual foi executado num processo separado, com o seu ambiente normal. As entradas temporárias que o Next acrescentou ao `tsconfig.json` foram identificadas e revertidas a partir da referência.

| Verificação | Resultado observado |
|---|---|
| Qualidade, tipos e compilação | Fronteiras e ciclos de imports, lint, formatação, TypeScript e build concluídos. |
| Unidade | 197 testes em 11 ficheiros. Inclui regressão financeira, validação de inteiros, identidade e comunicação com tempo controlado. |
| Integração final | 44 testes em 8 ficheiros. Inclui duas instâncias Next com PIDs distintos sobre o mesmo ficheiro SQLite, falha entre efeitos, recuperação e temporizador real de manutenção com relógio substituído no supervisor. |
| Navegador | Ver balanço das corridas no fim. Além da suite Edge, os três percursos de formulários passaram em cada um de Edge, Chrome, Brave e Firefox Playwright. Os resultados dos cofres nativos são discriminados em A35. |
| Dependências | `pnpm audit --prod --json` e `pnpm audit --json` devolveram zero avisos conhecidos nos conjuntos de 118 e 184 dependências reportados pelo registo. |
| Referencial | O confronto da coluna `req_id` do CSV oficial com os identificadores e níveis do mapa local encontrou 253 IDs únicos, sem diferenças de conjunto. O mapa distingue evidência estática, prova parcial e inaplicabilidade. |

## Matriz de aceitação

**Verificado localmente** cobre o resultado observável da fixture indicada. **Parcial** conserva uma parte do critério por demonstrar. Os nomes abreviados são os ficheiros `*.test.ts` em `tests/unit` ou `tests/integration` e `*.spec.ts` em `tests/e2e`, executados pelos comandos acima. Cada limitação indica até onde se pode usar a observação.

| Critério | Estado | Procedimento e resultado observado | Limite |
|---|---|---|---|
| A01 | Verificado localmente | `mu1-interface` + `mu2-spaces`. Registo com nomes compostos, confirmação por ligação e entrada. O primeiro espaço criado estava vazio e tinha GUID próprio. | Correio entregue numa caixa sintética. |
| A02 | Verificado localmente | `mu2-data`. Dois titulares abriram o mesmo período em espaços distintos. As consultas e catálogos mantiveram o âmbito de cada um. | SQLite local. |
| A03 | Verificado localmente | `mu3-concurrency` + `mu4-sharing`. Um movimento anterior ao convite ficou legível ao membro admitido, com a autoria correta. O exterior recebeu recusa. | Só o histórico autorizado pela aplicação. |
| A04 | Verificado localmente | `mu2-data`, `mu3-concurrency`, `mu6-permissions`. Foram recusados leituras, histórico, recibos, comandos, partilha e exportação do outro espaço. A revisão financeira e a lista de meses ficaram iguais após os pedidos recusados. | Pesquisa é feita sobre o estado autorizado. Caches de alojamento carecem de ensaio externo. |
| A05 | Verificado localmente | `mu3-concurrency` + `mu6-permissions`. O leitor leu estado e histórico. Escrita, referência de confirmação, convite e exportação devolveram 403. | O papel é avaliado no servidor em cada pedido. |
| A06 | Verificado localmente | `mu3-concurrency`, `mu4-data` e `mu4-sharing`. Duas aceitações concorrentes produziram uma pertença. Conta errada, expiração, revogação e código substituído foram recusados. Uma segunda aceitação não promoveu um leitor. | Partilha do código pelo sistema operativo tratada em A37. |
| A07 | Verificado localmente | `mu3-concurrency` em integração e navegador. Uma escrita confirmada antes da remoção permaneceu. A escrita, o recibo e a repetição posteriores foram recusados. O formulário desapareceu à deteção da revogação. | A remoção visual depende da atualização/foco do separador. |
| A08 | Verificado localmente | `mu2-spaces`. Respostas atrasadas de outro mês/espaço deixaram a seleção e o conteúdo atuais intactos. A MU6 reteve ainda uma descarga autorizada, mudou de espaço e observou o cancelamento sem ficheiro entregue. | Um download já concluído está sob controlo do destinatário. |
| A09 | Verificado localmente | `mu2-spaces`. A troca de pessoa no mesmo navegador limpou o formulário e conservou o pedido incerto associado ao primeiro titular. Foram examinados storage e respostas. | Rascunho em memória no separador testado. |
| A10 | Verificado localmente | `mu3-concurrency`. Dois processos tentaram pagar integralmente 100 €. Ficou um pagamento. Noutro caso, 40 € + 60 € liquidaram a obrigação. | Duas intenções sobre a mesma SQLite. |
| A11 | Verificado localmente | `mu3-concurrency` e `persistence`. A resposta do pagamento de 12 € foi descartada depois do commit. Outro processo confirmou o recibo. A mesma chave manteve um único débito, e a tentativa de 13 € foi rejeitada. | A consulta exige a autorização e a identidade atuais. |
| A12 | Verificado localmente | `mu3-concurrency`. Gravações simultâneas do plano inicial deixaram um snapshot. Edições seguintes e tentativas comuns de substituição preservaram a referência. | A redação autorizada de texto tem circuito próprio em A38. |
| A13 | Verificado localmente | `mu3-concurrency` + `server`. Dois processos pediram o mesmo mês. Releitura confirmou um período, uma cópia do modelo e ocorrências únicas. | Mesmo espaço e período. |
| A14 | Verificado localmente | `mu3-concurrency`. Compras concorrentes de 5 € e 30 € ficaram ambas registadas. Realizado de 35 €, banco em 265 € e escrita independente no outro espaço. | Pequena fixture de concorrência. |
| A15 | Verificado localmente | `mu2-data`. A API recusou a origem externa e as chaves estrangeiras compostas recusaram a ligação cruzada. A transação não deixou alocações ou efeitos parciais. | IDs de fixture conhecidos, integridade verificada em SQLite. |
| A16 | Verificado localmente | `mu3-concurrency`, `mu5-privacy` e `mu4-sharing`. Em encerramento, o titular conservou a propriedade até à aceitação. Recusa e expiração não eliminaram o espaço. Aceitação e disputa com eliminação deixaram um proprietário. | Prazos avançados no ensaio. |
| A17 | Verificado localmente | `mu5-privacy`. O ex-membro pediu redação. A decisão restrita retirou o texto também do snapshot e manteve uma despesa de 15 € e saldo de 85 €. | A apreciação jurídica individual cabe ao responsável real. |
| A18 | Verificado localmente | `mu5-privacy`, `mu2-spaces` e `mu6-permissions`. O proprietário obteve JSON do espaço com passe de uso único. Leitor e operador sem pertença receberam recusa. A rota antiga de backup permaneceu fechada. | Cópias pessoais externas ficam fora da aplicação. |
| A19 | Verificado localmente | `mu2-spaces`. Observados carregamento, zero espaços, espaço sem meses e criação do primeiro mês. O JSON inicial estava vazio. | Desktop e viewport móvel. |
| A20 | Verificado localmente | `engine`, `acceptance`, `mu0-financial`, `mu3-finance`, `server`, `persistence` e regressão de navegador. Valores esperados e efeitos abaixo. | Valores e históricos exclusivamente sintéticos. |
| A21 | Verificado localmente | `mu1-identity` + `mu6-permissions`. A sessão por confirmar não recebeu finanças. Visitar a ligação não a consumiu. Uma confirmação válida teve efeito único. | Inclui expiração e duas confirmações concorrentes. |
| A22 | Verificado localmente | `mu1-identity` e `mu1-interface`. Quota esgotada adiou sem chamar o transporte. Após o prazo, rodou o desafio e manteve a conta por verificar. 429, 503, timeout, limite de tentativas, retoma e aceitação sem prova de entrega foram ensaiados. | Remetente, quota contratada e entrega externos pendentes. |
| A23 | Verificado localmente | `mu1-identity` e `mu1-interface`. O reset preservou MFA. A substituição exigiu fatores e percurso restrito. Código consumido e contador TOTP impediram reutilização. | Autenticador e segredos de teste. |
| A24 | Verificado localmente | `mu1-concurrency`, `mu3-concurrency` e `mu1-interface`. A troca de email preservou o GUID. O convite para o endereço anterior deixou de poder ser aceite depois da confirmação do novo. | Sem transporte externo. |
| A25 | Verificado localmente | `mu1-identity`, `mu1-interface`, `mu2-spaces`. Relógio controlado para inatividade e duração absoluta nos dois modos. Polling não prolongou a sessão. Duas abas observaram revogação e a recuperação do rascunho exigiu a mesma pessoa. | Relógio do dispositivo e teclado físico móvel por validar. |
| A26 | Verificado localmente | `mu2-data` + `mu5-privacy`. Após encerramento efetivo, registo com o mesmo email recebeu outro GUID e zero pertenças anteriores. O restauro não recuperou a credencial antiga. | O registo novo pode exigir nova confirmação depois de um restauro. |
| A27 | Verificado localmente | `mu2-data` e unidade de identidade. A API aceitou pt-PT e recusou idioma e moeda fora do contrato. A preferência de comunicações manteve-se. SQLite recusou alterar EUR. | Portugal e EUR são o único contexto ativo. |
| A28 | Verificado localmente | `mu3-concurrency` e `mu3-finance`. Duas anulações de uma despesa de poupança de 20 € deixaram uma inversa e 50 € na poupança. Correção separada para 15 € deixou 35 €, despesa de 15 € e original preservado. | Sem reclassificar a compensação como receita. |
| A29 | Parcial | `mu5-privacy` em integração e navegador. O titular submeteu e recebeu resposta fundamentada dentro do prazo. O destinatário entrou com palavra-passe e TOTP. Ex-membro com conta acompanhou o processo. | Contacto externo para quem perdeu a conta e substituição humana continuam pendentes por decisão do utilizador. |
| A30 | Verificado localmente | `mu3-concurrency`, `mu3-finance`, `mu5-privacy`. Envelhecimento do recibo, limpeza, migração e restauro preservaram a chave ou recusaram a repetição incerta. Contagem final manteve um pagamento. | Conservar chaves mínimas enquanto o efeito puder ser repetido. |
| A31 | Verificado localmente | `mu3-concurrency`. Dois processos disputaram o bloqueio de escrita em WAL. A escrita anterior permaneceu. Remoção, aceitação, transferência e expurgo foram revalidados pela ordem de commit. | Intercalações explícitas da suite. |
| A32 | Verificado localmente | `mu3-finance`. Em v6 sintética com anulações e correções históricas, os bancos ficaram em 40 €/0 €, a poupança em 35 € e o património em 75 € após migração e restauro. Autoria desconhecida continuou identificável. | Só os formatos antigos presentes nas fixtures. |
| A33 | Verificado localmente | `mu3-concurrency.spec`. Falha na releitura durante edição mostrou aviso e «Atualizar dados» dentro do formulário. O montante e a descrição mantiveram-se nas duas larguras. | Rede controlada. |
| A34 | Verificado localmente | `mu2-data`, `mu3-finance`, `mu4-data` e `mu5-privacy`. Destino explícito, recusa sem autorização, falha intermédia, repetição e restauro compatível. Foram comparados bytes, relações e projeções conforme a versão. | Migrações só em fixtures. |
| A35 | Parcial | Formulários, cofres e versões na tabela de compatibilidade. Login por autofill nos cofres de Edge, Chrome e Firefox. A alteração no produto permitiu novo login nos quatro navegadores. | Cofres nativos, Brave, extensões e equipamentos físicos discriminados abaixo. |
| A36 | Verificado localmente | `mu3-concurrency`. Aviso de 10 € não gravou. Compra intermédia de 7,01 € invalidou o consentimento antigo. Nova confirmação e replay deixaram realizado de 62,01 € e banco em 237,99 €. | Aviso depende dos campos e janela definidos no domínio. |
| A37 | Parcial | `mu4-sharing`. Chromium Edge copiou o texto real para o clipboard em desktop e viewport móvel. Cancelamento simulado de Web Share devolveu estado de cancelamento. URLs dos serviços não levaram o segredo. | Folha de partilha e aplicações nativas sem interação real nesta corrida. |
| A38 | Verificado localmente | `mu5-privacy`. Busca após redação em catálogos, linhas, movimentos, snapshot, importação, recibos e mensagens verificou remoção do marcador. A auditoria não guardou o texto e o snapshot continuou protegido na via comum. | Variantes textuais, outros espaços e cópias externas requerem inventário por pedido. |
| A39 | Verificado localmente | `mu5-privacy` e `mu3-concurrency`. Sete dias de leitura, escrita recusada, cancelamento e expurgo confirmados. A consulta de encerramento e a repetição da criação já respeitam o vencimento antes da limpeza. | Leitura testada no intervalo entre o prazo e a manutenção. |
| A40 | Verificado localmente | `mu5-privacy`. Backup anterior, quarentena HTTP 503, recusa com registo pendente ou chave incorreta. Após reconciliação, nova autenticação válida e saldo de 85 €. Ver procedimento abaixo. | Custódia, disponibilidade e proteção contra reposição de versão antiga no alojamento continuam pendentes. |
| A41 | Parcial | `mu4-data`. Convite emitido e nunca partilhado ou aceite. Zero emails da emissão, endereço retirado à expiração e metadados terminais limpos após o prazo. | Falta demonstrar prestação de informação ou exceção individual antes da perda do contacto. |
| A42 | Parcial | `mu5-privacy`. Resposta parcial fundamentada, registo de destinatários, referência à CNPD e aos tribunais. A redação gerou avisos internos sem o texto removido. | Comunicação a destinatários externos, identidade sem acesso e prova das exceções exigem circuito do operador. |
| A43 | Verificado localmente | `recovery`, `mu2-data`, `mu3-finance`, `mu4-data`, `mu5-privacy`. Arranque e CLI recusaram transição não autorizada antes da mutação. Cópias antigas compatíveis, rollback, repetição e quarentena foram exercitados. | O arranque real final já partia de v9. |
| A44 | Verificado localmente | `mu3-concurrency` em integração e navegador. Consulta de chave ausente seguida de encerramento. O pedido antigo chegou tarde e foi recusado. A nova intenção foi aplicada uma vez. | A UI pede consulta explícita perante resultado incerto. |

## Resultados financeiros e carga

Os valores esperados são constantes dos cenários e contas aritméticas independentes do motor. A integração cruza o que a aplicação devolve com eventos, efeitos, recibos, referências e revisões lidos de SQLite. O navegador repete operações e recarrega o estado persistido.

| Regra financeira de A20 | Resultado conferido |
|---|---|
| Compras e totais | 40 € conhecidos e 60 € de total deram 60 €. Uma compra nova de 10 € levou a 70 €. Um detalhe já incluído não voltou a debitar a conta. Um total abaixo das compras exigiu resolução. |
| Poupança e transferência | De 100 €/50 €, reforçar 20 € deu 80 €/70 € e património de 150 €. Pagar 15 € pela poupança deu 80 €/55 €, património de 135 € e despesa de 15 €. Transferir 25 € entre contas com 100 €/0 € deu 75 €/25 €, património de 100 € e realizado zero no plano. |
| Desvio e conclusão | Plano de 85 €, pagamento de 92 €, excesso de 7 € e pendente zero. Concluir explicitamente por 80 € deu desvio de −5 € e também pendente zero. |
| Abertura e snapshot | O mês seguinte guardou os saldos conhecidos das contas, deixou por confirmar a poupança e copiou a receita prevista do Modelo Base. Ficou sem execução. Alterar o mês anterior conservou os iniciais já capturados. O plano inicial sobreviveu a renomeações, correções e novas linhas. |
| Agenda e insuficiências | Ocorrências de dias 29/30/31 e de 29 de fevereiro respeitaram o calendário. Lembretes e sobras não fizeram pagamentos ou reforços. O teste de distribuição respeitou o excedente de cada origem. A fixture de fundos restritos não cobriu a falta da conta à ordem. |
| Atomicidade e repetição | Falha antes de confirmar o recibo ou na validação do commit manteve revisão, operação original e saldo de poupança de 30 €. Após perda de resposta, o pagamento confirmado de 12 € teve um efeito. A suite também rejeitou overflow, decimais incompatíveis e montantes malformados. |

**Medição HTTP local.** Executou-se `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/mu3-concurrency.test.ts -t "MU6 mede" --reporter=verbose --silent=false`. Cada cenário enviou 8 lotes de 8 pedidos em paralelo, metade a cada um dos dois processos Next, duas sessões confirmadas e a mesma base v9 em WAL, com sincronização FULL. Um espaço, um mês, uma conta, uma poupança e uma rubrica. O cronómetro começa depois da criação da fixture e inclui a leitura do corpo JSON. Os percentis são por pedido, por ordem de duração. Na medição seguinte, o E2E também corria neste PC.

| Cenário em simultâneo com E2E | Pedidos concluídos | Duração total | Pedidos/s | p50 | p95 |
|---|---:|---:|---:|---:|---:|
| Ler o mês pequeno, inicialmente sem movimentos | 64/64 | 808 ms | 79 | 93 ms | 134 ms |
| Registar compras de 1 a 64 cêntimos na mesma rubrica | 64/64 | 2 894 ms | 22 | 323 ms | 473 ms |

Repetição na build entregue, depois de terminar as outras suites da MU6. A instância habitual ficou aberta em repouso. Com a mesma configuração, as 64 leituras demoraram 636 ms, 101 pedidos/s, p50 de 71 ms e p95 de 101 ms. As 64 compras demoraram 1 424 ms, 45 pedidos/s, p50 de 147 ms e p95 de 244 ms. Ambas as verificações de saldo passaram.

No fim havia 64 eventos. A soma de 1 a 64 é 2 080 cêntimos e o saldo passou de 30 000 a 27 920 cêntimos. Os números descrevem este lote curto. Ficam por medir históricos grandes, exportações e expurgos em paralelo, disco e backups de alojamento, latência de rede e carga prolongada. Não foi definido um número de utilizadores suportados.

## Revisão independente e correções entregues

O revisor inventariou as páginas, métodos e rotas antigas, seguiu as decisões de autorização e os campos serializados até ao consumidor e cruzou-os com os testes. Distinguimos operador de direitos e administrador offline da máquina. A revisão cobre os sete intervenientes pedidos. A integração acrescentou um teste HTTP de 12 operações por contexto, incluindo leitura do histórico, escrita financeira, recibos, exportação, privacidade e o antigo pedido de backup. Nos sete contextos, a revisão financeira ficou igual e nenhum mês adicional foi criado. Os direitos positivos de proprietário e editor têm ensaios separados. [Revisão das fronteiras](MU6_REVISAO.md)

| Achado | Correção e prova |
|---|---|
| Conteúdo de um espaço vencido ainda disponível entre o prazo e a limpeza | A consulta de encerramento usa a validação comum de sessão confirmada, admite encerramento pendente e filtra o prazo. A repetição da criação em v9 recusa a intenção vencida. Mantida a compatibilidade das fixtures anteriores. Teste com o espaço ainda presente e prazo vencido. |
| Exportação entregue em contexto posterior | Os dois POST usam um controlador de cancelamento por operação. A desmontagem ou a troca de conta/espaço invalida a entrega. Um teste atrasou o download, mudou de espaço e observou o pedido cancelado e zero downloads. |
| GUID do titular dispensável no painel de direitos | A consulta devolve o indicador de pertença do caso. O E2E verifica a ausência do campo `subject` na resposta recebida pelo operador. |
| Proteções diferentes entre páginas e respostas | A página de privacidade passou a receber a política com nonce da raiz. A configuração comum define nosniff, política de referência e recusa de enquadramento. Os testes verificam as duas páginas e o cache privado nos sete contextos. |
| Texto de ajuda do pedido privado pouco legível | O campo passou a usar a cor de texto secundário e foco explícito. O contraste medido do placeholder foi de 5,47:1 nas duas larguras. |
| Falsos negativos de ensaio | A verificação do cofre Brave passou a identificar o botão da credencial pelo nome acessível com a origem exata. A consulta de confirmação do prazo na SQLite sintética passou a esperar pelo bloqueio durante até cinco segundos. |

O [mapa ASVS 5.0.0](MU6_ASVS.md) cobre os 70 requisitos introduzidos no nível 1 e os 183 introduzidos no nível 2. O revisor classificou 86 com evidência local, 88 parciais e 79 sem pré-condição aplicável. Estes estados não constituem certificação. Entre as lacunas concretas estão a cobertura de palavras-passe comuns compatíveis com o mínimo de 15 caracteres, MFA opcional para contas comuns por decisão de produto, trilhos de autenticação e recusas e a configuração real de TLS, caches, chaves e alertas. A matriz inclui a evidência, a exceção e a ação por requisito. [Referencial oficial](https://asvs.owasp.org/)

## Interface, equipamentos e gestores

Inspeção direta das imagens renderizadas de entrada, erro de registo, diálogo financeiro desatualizado, partilha e resposta de direitos. A 390 × 844, o erro ficou junto ao campo focado, os valores válidos mantiveram-se e a ação de atualizar coube dentro do diálogo, acima do montante e da origem. Em Partilha, o nome do espaço, o mês e o papel estiveram legíveis antes da emissão. No estado sem meses, o primeiro controlo útil permite criar o mês. Na resposta privada, o prazo, os intervenientes e as vias de contestação continuaram legíveis em coluna única. No desktop a remoção pendente já estava indicada enquanto se carregava o espaço. A suite testou também Escape, regresso do foco ao botão de origem, seleção por setas e Enter, validação junto ao campo e perda efetiva de sessão ou de acesso.

Contrastámos amostras de texto com a superfície de fundo obtida de `getComputedStyle`. Nas duas larguras, os títulos de entrada, privacidade e partilha deram 12,06:1, o título do mês 11,11:1, «Atualizar pedidos» 7,44:1 e a ajuda do pedido 5,47:1. A amostra cobre estes elementos. Não houve auditoria completa com tecnologia assistiva nem verificação de todos os estados de cor. As capturas são locais e sintéticas. [Imagens da revisão](../../test-results/mu6-verificada/)

### A35 — Operações efetivamente exercitadas nesta entrega

Windows no PC de ensaio, perfis de navegador descartáveis, headless. `mu1-interface` foi repetido com o executável de cada linha, nos dois tamanhos de registo e no percurso de alteração de credenciais. Gerou-se localmente uma passphrase por navegador com Bitwarden CLI 2026.10.1, sem usar um cofre pessoal. A colagem passou pelo teclado. `native-manager.spec.ts` abre a interface interna do navegador, adiciona a credencial sintética, abre o produto e tenta autenticar por autofill. `OMEUMES_QA_MANAGER_UPDATE=1` acrescenta a verificação do valor preenchido após alterar a palavra-passe e sair.

| Navegador/executável | Formulário do produto | Interface do gestor nativo | Atualização do cofre |
|---|---|---|---|
| Microsoft Edge 157.0.4341.60 | Registo, colagem, confirmação, alteração e novo login passaram | `edge://wallet/passwords`. Guardar manualmente, preencher e autenticar passaram | O gestor voltou a preencher a anterior |
| Google Chrome 147.0.7727.103 | Os mesmos três percursos passaram | `chrome://password-manager/passwords`. Guardar, preencher e autenticar passaram | Voltou a preencher a anterior |
| Brave 158.1.100.58 | Os mesmos três percursos passaram | `brave://password-manager/passwords`. Entrada guardada visível pela origem exata. O cofre não preencheu os dois campos no ensaio, mesmo com a seleção por teclado | Sem pré-condição para verificar a atualização |
| Firefox 157.0 do Playwright | Os mesmos três percursos passaram | `about:logins`. Guardar, preencher e autenticar passaram no perfil com autofill ativo | Voltou a preencher a anterior |

As falhas da atualização são observações destes perfis headless. Para aceitar os diálogos de gravação/atualização no chrome do navegador é necessária evidência interativa. O Firefox 143 instalado teve um ensaio histórico por Selenium na MU1 e não foi o executável desta corrida. A regressão Edge inclui MFA, substituição de fator, códigos e campos de uso único. A matriz detalhada da MU1 conserva a proveniência das observações anteriores. [Resultados MU1](FASE_MU1_RESULTADOS.md)

**Pendentes A35.** QA de compatibilidade deve ensaiar geração no campo, sugestão de guardar após o registo e confirmação da atualização nativa nos quatro navegadores, além de resolver o autofill no Brave. Para cada navegador, falta gerar, guardar, preencher e atualizar com as **extensões Bitwarden e 1Password** em cofres sintéticos desbloqueados. O CLI só exercitou geração. `adb devices` indicou zero dispositivos disponíveis. Faltam Android físico, teclado/autofill do sistema e os navegadores previstos, bem como iPhone/iPad, Safari e os serviços móveis dos gestores. O operador de QA fornece equipamentos e contas de teste.

### A37 — Interfaces de partilha

Edge desktop a 1366 × 768 e Edge com viewport 390 × 844, com toque emulado no contexto do convidado. Confirmaram-se a escrita/leitura do clipboard do navegador, o texto com código e aviso de histórico e a ocultação posterior. A chamada a `navigator.share` e o cancelamento foram simulados. Inspecionaram-se os links Email, WhatsApp e Telegram sem código no URL. Não se abriu um compositor, não se escolheu um destinatário e não se enviou mensagem. QA deve observar a folha de partilha real do Windows, do Android e do iOS, cancelamento, retorno e alternativa de cópia, com apps de teste instaladas e ausentes. Esta pendência da MU4 mantém-se.

## Recuperação, manutenção e incidente

1. Em `mu5-privacy.test.ts`, a fixture configurou uma segunda SQLite, com caminho e chave independentes, para o registo protegido. Fez backup antes da revogação, redação e encerramento. Depois retirou a pertença, redigiu texto, eliminou um espaço e encerrou a conta. O novo registo com o mesmo email recebeu outro GUID.
2. O serviço da cópia arrancou em quarentena numa porta efémera. Identidade, login, aceitação de convite e finanças devolveram 503. O registo marcado pendente, o uso de outra chave ou uma cópia antiga demais impediram a libertação. O registo não continha em claro os marcadores pessoais pesquisados.
3. A reconciliação usou o último ponto protegido. Antes da nova autenticação havia zero sessões. A sessão e o convite antigos continuaram inutilizáveis. O espaço eliminado e as credenciais antigas ficaram indisponíveis. A pesquisa não encontrou o texto retirado nas representações verificadas. O processo de direitos sobreviveu. Com nova autenticação válida, a leitura devolveu 200, o mês esperado, 85 € no banco e uma despesa de 15 €. A origem anterior perdeu autorização.
4. O ensaio do supervisor avançou o relógio de uma manutenção para a seguinte, uma hora depois. Uma falha sintética de armazenamento interrompeu o lote. O instante da última limpeza e os dois marcadores ficaram iguais. Depois de retirar a falha, o worker voltou a tentar e removeu apenas o marcador vencido. Outros ensaios confirmaram rotação de backups geridos, retenção e limpeza repetida de processos.
5. A fila foi exercitada com quota esgotada, cinco timeouts, retoma, evento de outro identificador e aceitação sem entrega. A conta manteve-se única. O ensaio de interface mostrou o adiamento à pessoa ainda por confirmar. Nenhum pedido chegou à Brevo.

**Exercício de incidente.** No cenário de indisponibilidade da autoridade de recuperação, a ação técnica observada foi manter a cópia bloqueada, verificar linhagem, prazo e chave, sincronizar a origem e repetir sob quarentena. Para o exercício de decisão, os registos sintéticos mostram recusa do acesso e nenhuma evidência de divulgação. O responsável de turno registaria o instante de conhecimento, dados e pessoas potencialmente abrangidos, ação de contenção, evidência mínima e decisão de risco. Se surgisse prova de acesso, reavaliaria confidencialidade, integridade e disponibilidade. O operador decide e fundamenta a notificação à CNPD quando aplicável, se possível em 72 horas do conhecimento, e a comunicação aos titulares em caso de elevado risco, observadas as condições legais. A equipa humana, o substituto, a escalada fora de horas e a receção de alertas reais continuam por ensaiar. [Orientação da CNPD](https://www.cnpd.pt/organizacoes/outras-obrigacoes/violacao-de-dados-ou-data-breach/)

## Direitos, textos e informação ao convidado

**Receção até resposta.** O titular submeteu o pedido nas Definições e recebeu confirmação depois da gravação. O destinatário sintético designado em `OMEUMES_RIGHTS_HANDLER` entrou numa sessão separada com palavra-passe e TOTP, viu o pedido atribuído e recebeu 403 nas finanças do titular. A resposta parcial identificou o dado facultado, o motivo para omitir referências de terceiros, os destinatários e as vias de reclamação e recurso. O titular atualizou os pedidos e leu a resposta. A consulta independente do registo confirmou `received ≤ closed ≤ due`. No percurso renderizado de 20/11/2026, o prazo apresentado foi 21/12/2026.

Com relógio controlado, um pedido recebido em 31/01/2028 venceu em 29/02/2028. O esclarecimento do ex-membro conservou a receção original. A prorrogação fundamentada comunicada dentro do primeiro mês fixou o fim do prazo em 02/05/2028, depois de domingo e do feriado. A exceção documentada de conservação manteve o processo ao dia 31 e a limpeza retirou-o após o dia 45. O calendário civil do local efetivo do operador ainda precisa de validação. [CEPD, exercício dos direitos](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en)

**Inventário revisto.** O inventário MU5 continua a identificar a finalidade, as cópias, as rotinas e os acessos de identidade/fatores, aceitação documental, convites, finanças comuns, textos livres, recibos, comunicações, pedidos de direitos, exportações, logs, WAL, backups e autoridade de reconciliação. A MU6 reduziu a projeção de direitos no navegador e confirmou a retenção do recibo mínimo. As cópias exportadas, destinatários anteriores, texto repetido em vários espaços e eventuais referências a saúde precisam de avaliação individual. Os prazos 7/30/90 dias têm as finalidades descritas no inventário. A identificação do responsável, o fundamento concreto por finalidade, a avaliação da necessidade desses prazos e as condições dos subcontratantes continuam em aberto. [Inventário da MU5](FASE_MU5_RESULTADOS.md) · [Contrato de privacidade](PRIVACIDADE.md)

**Textos revistos.** O formulário distingue termos, informação de privacidade e declaração de maioridade. O aviso público de convites explica a origem do endereço, a finalidade, os membros que verão o nome e o acesso ao histórico. Os documentos conservam as versões de desenvolvimento. A descrição do canal privado só corresponde a receção operacional quando existe destinatário habilitado. Sem acesso à conta, o contacto externo real ficou expressamente adiado para a abertura. O operador tem de testar esse canal, o substituto e a entrega privada da resposta, com identificação proporcional. A MU6 não ativou um endereço nem designou uma pessoa real.

**A41, convite que nunca saiu da aplicação.** O endereço é recolhido quando o emissor gera o convite. Na fixture com validade de um dia, o relógio chegou ao vencimento sem partilha, adesão ou envio. O teste encontrou o endereço cifrado já removido e o estado expirado. Trinta dias mais tarde não havia registos de convites. Este resultado comprova retenção. A pessoa pode nunca ter tido oportunidade de ler a página ou de receber o texto.

Antes de permitir convites públicos, o responsável pelo tratamento deve escolher e validar um procedimento desde a recolha. Para cada emissão, registar uma referência mínima, origem, instante de obtenção, prazo e responsável de seguimento. Disponibilizar a informação aplicável do artigo 14.º por canal verificável, dentro do prazo pertinente e considerando primeira comunicação, primeira divulgação e o limite geral de um mês. Cobrir revogação e aceitação imediatas, que podem retirar o endereço logo após a emissão. Um controlo diário isolado pode chegar tarde. Uma opção de desenho a validar é prestar a informação antes da introdução do email e conservar prova proporcional da versão, momento e destinatário. Se se invocar uma exceção, identificar a disposição, os factos e o decisor de cada caso. Se faltar prova ou canal antes do desaparecimento do contacto, a emissão pública deve aguardar uma solução. A decisão e o ensaio com o operador continuam pendentes. [RGPD, artigo 14.º](https://eur-lex.europa.eu/eli/reg/2016/679/pt)

## Pendências e bloqueios à abertura pública

| Origem | Responsável | Ação e condição de fecho |
|---|---|---|
| MU4, A35 e A37 | QA de compatibilidade e operador dos equipamentos | Completar as combinações e ações discriminadas nas tabelas, registar versões, dispositivo e resultado por operação. Validar a interface de partilha e os cofres em perfis de teste. |
| MU4/MU5, A41 | Responsável pelo tratamento e engenharia de partilha | Aprovar fundamento e aviso de recolha indireta. Implementar e ensaiar seguimento desde a emissão, incluindo ausência de partilha e revogação imediata, com prova de informação ou exceção individual. |
| MU5, A29/A42 | Operador real e substituto | Nomear titular e suplente, configurar MFA e testar o circuito de continuidade dos casos já atribuídos. Definir contacto externo, triagem de ex-utilizadores, calendário, capacidade de resposta, comunicação a destinatários e justificação de exceções. |
| MU5, textos e inventário | Responsável pelo tratamento com apoio jurídico | Identificar operador, âmbito territorial e destinatários. Aprovar termos/aviso, fundamento, retenção e dados incidentais, avaliar subcontratação, transferências, necessidade de AIPD e EPD. Registar a decisão e a versão antes da abertura. |
| MU5, A22 | Operador de comunicações | Validar contrato, remetente, limites/quota, eventos de entrega e contenção de abuso. Ensaiar alertas, retoma e substituição de operador com configuração expressamente autorizada. |
| MU5, A40 e incidentes | Operador de recuperação e suplente | Ensaiar ACL, chaves separadas, indisponibilidade de uma chave, rotação e expiração de réplicas, controlo independente da versão mais recente e restauro no destino real. Um HMAC válido também pode pertencer a uma versão antiga genuína. Fixar tempos aceitáveis de perda e recuperação e simular a escalada humana. |
| MU5, intermitência sob carga | Engenharia de persistência e QA | Investigar recusas transitórias no reconhecimento de recibos, correlacionar com SQLite/Windows e o worker sem registar payloads. Ver balanço das corridas abaixo. Manter a inspeção do recibo antes de qualquer nova intenção financeira. |
| MU6, fronteiras e ASVS | Engenharia de identidade/segurança e operador de infraestrutura | Fechar ou justificar individualmente os 88 itens parciais aplicáveis ao lançamento. Prioridades no dicionário de credenciais comprometidas, autenticação, revogação, eventos de segurança minimizados, ACL/TLS/caches e alertas. Ensaiar carga e restauração na infraestrutura escolhida. |

A verificação local demonstra o circuito de direitos com um destinatário sintético. A equipa real, o calendário operacional, o contacto externo e as decisões jurídicas têm de existir antes da abertura. Esta entrega não publicou o serviço nem criou contas de fornecedores.

## Ficheiros afetados e reversão exclusiva

| Área | Caminhos relativos |
|---|---|
| Configuração e respostas | `biome.json`, `next.config.ts`, `src/proxy.ts`, `src/server/http.ts` |
| Espaços e direitos | `src/modules/spaces/schema.mjs`, `src/modules/spaces/ui/ExportSpace.tsx`, `src/modules/privacy/rights.ts`, `src/modules/identity/ui/identity.css` |
| Navegador | `tests/e2e/mu2-spaces.spec.ts`, `mu5-privacy.spec.ts`, `mu6-interface.spec.ts`, `mu6-permissions.spec.ts`, `native-manager.spec.ts`, todos no mesmo diretório |
| Integração | `tests/integration/mu3-concurrency.test.ts`, `mu5-privacy.test.ts`, `mu6-clock.mjs`, todos no mesmo diretório |
| Documentação | Este relatório, `MU6_REVISAO.md` e `MU6_ASVS.md`, em `docs/multiutilizador/` |

A referência fica neste PC em `%LOCALAPPDATA%\O-meu-mes-MU6\8227dea2c1744aacbcbbc576b2647fa5`. Contém a pasta `MU5`, o inventário inicial `MU5.csv`, o estado inicial do Git, os logs e o manifesto da entrega `alterados.json`. O utilitário compara primeiro o SHA-256 de **todos** os caminhos afetados e dos respetivos originais. Se detetar alteração posterior, interrompe antes da primeira escrita. Nesse caso, comparar os trechos com a referência e preservar as edições posteriores. Não usar reset global ou limpeza dos ficheiros fora do índice.

Na raiz do projeto, a primeira opção só verifica. Usar a segunda unicamente para desfazer a MU6. Reabrir `Iniciar.cmd` depois de fechar a instância em utilização para correr o código reposto.

```powershell
$refMU6 = Join-Path $env:LOCALAPPDATA 'O-meu-mes-MU6\8227dea2c1744aacbcbbc576b2647fa5'
python (Join-Path $refMU6 'reverter.py') --check
python (Join-Path $refMU6 'reverter.py') --apply
```

A reposição opera apenas nos caminhos do manifesto e conserva a situação local, incluindo os ficheiros da MU5 que estavam modificados ou fora do índice. A base v9 é compatível nos dois lados. As verificações deste relatório não requerem reposição da base nem utilização de um backup doméstico.

## Verificação do arranque habitual

A porta 3000 já estava ocupada pela instância habitual. A cadeia de processos confirmou `Iniciar.cmd` deste projeto, o supervisor e o servidor Next vinculado a 127.0.0.1. A operação encerrou essa instância e voltou a executar o mesmo launcher sem argumentos, em ambiente normal. O log confirmou compilação, SQLite 3.54.1, esquema 9 e o caminho habitual. A raiz e a identidade anónima responderam HTTP 200.

A comparação abriu a base habitual apenas em leitura, numa transação por observação. Comparou o conteúdo por tabela com uma chave HMAC aleatória só em memória, antes e depois do arranque. As 21 tabelas foram `users`, `credentials`, `spaces`, `memberships`, `accounts`, `categories`, `reserves`, `origins`, `base_lines`, `recurring`, `months`, `lines`, `initials`, `snapshots`, `events`, `effects`, `allocations`, `observations`, `occurrences`, `excel_imports` e `meta`. Todos os conteúdos coincidiram. O código de cálculo também coincide com a referência MU5. Esta é a prova de conservação dos dados e dos saldos. O login interativo com a palavra-passe pessoal fica reservado ao titular. Sessões e metadados de manutenção não fazem parte da comparação das 21 tabelas. Nenhum ensaio automatizado usou a base habitual ou as suas cópias como fixture.

## Balanço final e prova da reposição

- A corrida inicial de unidade passou 197/197. A integração de referência passou 41/41. Na entrega, a unidade voltou a passar 197/197 e a integração passou 44/44, já com a verificação da manutenção horária, das notificações da redação e dos convites durante a quarentena. A compilação normal e a de ensaio passaram. A última execução de `pnpm quality` verificou 107 módulos, 129 ficheiros no lint e 95 na formatação. `pnpm typecheck` terminou com código 0.
- Na primeira corrida de navegador com três workers, a leitura direta do prazo no teste móvel encontrou a base sintética temporariamente bloqueada. Passaram 108/109. Configurou-se a espera nessa leitura. Numa corrida posterior com três workers passaram 110/111. O caso da transferência encontrou um 503 em `ack` durante a preparação da fixture, antes de executar a transferência pela UI. A aplicação tinha respondido ao comando financeiro, mas o reconhecimento do recibo ficou incerto. A MU5 já reportava este sintoma. A causa interna desta ocorrência não ficou confirmada.
- Na entrega passaram **112/112** testes de navegador com dois workers, em 6,3 minutos, incluindo a mesma transferência e os 84 pares de operação/contexto. O percurso da transferência foi ainda repetido dez vezes, com dois workers e observação de erros SQLite na fixture. Passaram 10/10, sem nova ocorrência. A primeira tentativa de lançar o diagnóstico tinha uma opção de preload com caminho inválido e terminou antes de executar o teste. A repetição usou o caminho corrigido. A MU6 conserva a intermitência na lista de investigação.
- As 12 verificações adicionais de formulários passaram. No ensaio separado dos cofres, a gravação seguida de login passou em Edge, Chrome e Firefox. Brave confirmou a entrada guardada e falhou no preenchimento. Os três ensaios de atualização que chegaram ao novo preenchimento devolveram a palavra-passe anterior. Estes resultados permanecem fora da contagem dos 112 testes da suite geral.
- Na cópia física separada, `python verificar-entrega.py` comparou a referência com o inventário inicial, criou uma cópia dos 219 ficheiros da entrega, executou a reversão dos 19 caminhos e comparou recursivamente o resultado. Os 213 caminhos e os 213 SHA-256 coincidiram com a MU5. O diretório entregue passou também `reverter.py --check`. Não houve commit, push, publicação ou migração da base habitual.
