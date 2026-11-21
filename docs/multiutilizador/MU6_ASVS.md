# MU6 · Mapa ASVS 5.0.0 para o nível 2

Em 20 de novembro de 2026, a revisão independente comparou o código local com o CSV em inglês da versão estável de 30 de maio de 2025, fixada na etiqueta `v5.0.0`. O nível 2 acumula **70 requisitos de nível 1 e 183 de nível 2**. As tabelas identificam os 253 requisitos uma vez cada. O número entre parênteses indica o nível de introdução. Para ler o requisito integral, procurar o identificador na coluna `req_id` do CSV oficial. [Publicação da OWASP](https://asvs.owasp.org/) · [CSV original da versão 5.0.0](https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv)

**E** indica evidência local do controlo na inspeção estática, com o teste relacionado quando identificado. **P** indica requisito aplicável com prova parcial, exceção de produto ou trabalho por realizar. **N** indica pré-condição ausente, com o motivo indicado. Contagem por requisito individual: **86 E, 88 P e 79 N**. Uma linha pode reunir requisitos com a mesma evidência. As datas e os resultados de execução pertencem ao relatório de fase. A engenharia responde pelas lacunas de código e testes. O operador responde pelo ambiente, acessos, procedimentos, retenção e decisões de risco. A verificação de eficácia no futuro ambiente externo continua pendente. [Resultados MU6](FASE_MU6_RESULTADOS.md) · [Revisão independente](MU6_REVISAO.md)

## Evidência transversal

- `account.ts`, `policy.mjs`, `mail.mjs`, `input.ts` e `secrets.mjs` referem-se a `src/modules/identity/`. `http.ts` pertence a `src/server/`. `rights.ts`, `sharing.ts` e os repositórios financeiros pertencem aos respetivos módulos de `src/modules/`.
- `pnpm.cmd audit --prod --json` devolveu código 0 e zero avisos nas cinco classes de gravidade, com 118 dependências no total reportado. `pnpm.cmd audit --json` devolveu código 0 e zero avisos, com 184 dependências no total reportado. A consulta cobre a informação que o registo forneceu nessa data.
- A pesquisa por nomes rastreados ou não ignorados de bases, chaves, exportações em formatos de folha, capturas e diretórios privados encontrou zero correspondências nos padrões verificados. A pesquisa por assinaturas de chave privada, AWS, GitHub e Brevo em `src`, `scripts`, `tests` e `.github` terminou com `rg` a devolver 1, sem correspondências. Estes controlos têm cobertura limitada aos padrões e locais indicados. A revisão não abriu segredos, bases ou backups reais.
- A contagem do dicionário usou a dependência instalada `@zxcvbn-ts/language-common`, propriedade `dictionary['passwords-common']`, e o número de pontos de código de cada entrada. Dos 49 233 termos, 41 têm pelo menos 15 caracteres.

## V1 · Codificação e saneamento

| Requisito v5.0.0 (nível) | Estado | Implementação, evidência ou ação pendente |
|---|---|---|
| `1.1.1` (2) | P | JSON passa por um único parse nas rotas e os tokens têm formato restrito. Falta inventário dos pontos de descodificação do framework. |
| `1.1.2` (2), `1.2.1` (1) | E | JSX apresenta nomes, notas e mensagens como texto. As rotas usam Response.json. Inspeção de src/app e src/modules sem sinks de HTML arbitrário. |
| `1.2.2` (1) | E | Parâmetros do espaço e do mês escapados na construção da consulta em usePersistentStore. O URL de comunicação tem origem validada por settings. |
| `1.2.3` (1) | E | JSON.stringify e Response.json serializam os DTO. Nenhum script inline monta JavaScript com texto do titular nas páginas revistas. |
| `1.2.4` (1) | E | http.ts, sharing.ts, rights.ts e state-tables.ts vinculam valores. Nomes SQL interpolados vêm de tabelas/colunas internas. |
| `1.2.5` (1) | E | scripts/next.mjs e scripts/start-local.mjs separam programa e argumentos. As rotas de produto não executam comandos de sistema. |
| `1.2.6` (2), `1.2.7` (2), `1.2.8` (2) | N | Inventário de dependências e rotas sem LDAP, XPath ou processamento LaTeX. |
| `1.2.9` (2) | N | As expressões de input.ts e validation.ts são constantes. Pesquisa de texto da redação usa includes e HMAC. |
| `1.3.1` (1), `1.3.4` (2), `1.3.5` (2) | N | Sem editor HTML, SVG recebido ou linguagem de marcação utilizável pelo titular. SVG estático pertence ao código. |
| `1.3.2` (1) | E | Execução dinâmica de strings ausente nas rotas e componentes de aplicação revistos. CSP da raiz restringe scripts. |
| `1.3.3` (2) | P | Schemas Zod, limites de corpo e validação de contexto no domínio. Revisão por amostragem dos destinos. |
| `1.3.6` (2) | E | Ambas as chamadas de mail.mjs têm origem Brevo fixa, redirect error e limite de tempo. O identificador do fornecedor entra por URLSearchParams. |
| `1.3.7` (2) | E | Mensagens em mail.mjs usam templates internos de texto, localidade e tipo definidos pelo serviço. |
| `1.3.8` (2), `1.3.9` (2) | N | Sem runtime Java/JNDI e sem memcache na arquitetura. |
| `1.3.10` (2) | E | Dado do utilizador é valor, sem formato interpretado nas saídas HTTP ou nas operações SQL revistas. |
| `1.3.11` (2) | E | input.ts valida o endereço e mail.mjs envia JSON com cabeçalhos fixos. Não há cliente SMTP/IMAP no produto. |
| `1.4.1` (2), `1.4.3` (2) | P | TypeScript usa gestão automática de memória, SQLite fecha em finally e o cliente cancela pedidos. Extensões nativas Node/Argon2 não foram auditadas linha a linha. |
| `1.4.2` (2) | E | finance/domain/validation.ts usa Number.isSafeInteger, limites e BigInt para somas. Evidência executável em mu0-financial e engine. |
| `1.5.1` (1) | N | Sem parser de XML de entrada no produto. |
| `1.5.2` (2) | E | JSON seguido de schemas discriminados e estritos em identity/input, sharing, rights e command-schema. Não carrega tipos executáveis do cliente. |

## V2 · Validação e lógica de negócio

| Requisito v5.0.0 (nível) | Estado | Implementação, evidência ou ação pendente |
|---|---|---|
| `2.1.1` (1), `2.1.2` (2) | E | REQUISITOS, DOMINIO_FINANCEIRO, SEGURANCA e ACEITACAO explicitam entradas, datas, combinações de fontes e totais. |
| `2.1.3` (2) | P | policy.mjs explicita limites por sujeito e globais para identidade e envios. Faltam limites justificados para volumes de espaços, exportações e pedidos de direitos. |
| `2.2.1` (1), `2.2.2` (1), `2.2.3` (2) | E | Parsing e validação de regras no servidor, validação de sessão antes de mutações e integridade SQLite. command-schema, engine, sharing, rights e testes mu0-command-schema/mu2-data. |
| `2.3.1` (1) | E | Conta pendente, confirmação, recuperação restrita e reautenticação têm transições no servidor. account.ts e mu1-identity. |
| `2.3.2` (2) | P | Regras por conta/poupança testadas em acceptance/engine. Sem limites operacionais definidos para todos os percursos. |
| `2.3.3` (2), `2.3.4` (2) | E | BEGIN IMMEDIATE ordena pertença, recibo e efeitos financeiros. Unicidade e revalidação em applyCommand e acceptInvite. mu3-concurrency/mu4-data. |
| `2.4.1` (2) | P | Contadores temporais e quota de email em policy/account/mail. Avaliar abuso de direitos, criação de espaços, exportação e limite global partilhado antes de abrir. |

## V3 · Segurança do navegador

| Requisito v5.0.0 (nível) | Estado | Implementação, evidência ou ação pendente |
|---|---|---|
| `3.2.1` (1) | P | APIs com tipo JSON e exportação por Blob. Confirmar proteções no ponto de entrada definitivo e nos erros do servidor. |
| `3.2.2` (1) | E | JSX apresenta nomes, notas e mensagens como texto. As rotas usam Response.json. Inspeção de src/app e src/modules sem sinks de HTML arbitrário. |
| `3.3.1` (1), `3.3.3` (2) | P | settings e identity/route aplicam Secure e __Host- em HTTPS. A exceção documentada de HTTP só admite loopback. Falta execução no serviço externo. |
| `3.3.2` (2), `3.3.4` (2) | E | Cookie HttpOnly e SameSite Lax. A rota retira cookie e maxAge do DTO e envia o segredo por Set-Cookie. |
| `3.4.1` (1) | P | HSTS de pelo menos um ano com subdomínios depende do domínio e do terminador HTTPS real. Confirmar em todas as respostas na abertura. |
| `3.4.2` (1) | E | Sem resposta CORS com origens arbitrárias. Para escrita http.ts e identity/route exigem origem configurada fixa. |
| `3.4.3` (2), `3.4.4` (2), `3.4.5` (2), `3.4.6` (2) | P | A referência MU5 aplicava CSP com nonce, frame-ancestors e referrer à raiz, e nosniff à identidade. Ver correções de âmbito no relatório. Falta provar todos os caminhos no ambiente externo. |
| `3.5.1` (1), `3.5.3` (1) | E | Escrita exige Origin exata e POST de JSON. GET das ligações apresenta confirmação e não consome o desafio. Revisão de http.ts, rotas e identity/account. |
| `3.5.2` (1) | N | Desenho usa validação explícita da origem no servidor sem confiar no preflight. |
| `3.5.4` (2) | P | Origem única neste PC. Operador deve dedicar hostname ao serviço e rever aplicações irmãs na implantação. |
| `3.5.5` (2) | N | Sem interface window.postMessage entre origens. BroadcastChannel apenas sinaliza nova consulta ao servidor na mesma origem. |
| `3.7.1` (2) | E | Frontend React/HTML, sem plug-ins de execução no cliente. Compatibilidade física consta de A35/A37. |
| `3.7.2` (2) | E | Convite usa partilha acionada pelo utilizador. Fluxos de identidade/finanças usam caminhos da própria aplicação sem destino de redireção configurado pelo cliente. |

## V4 · APIs e serviços

| Requisito v5.0.0 (nível) | Estado | Implementação, evidência ou ação pendente |
|---|---|---|
| `4.1.1` (1) | P | Next serve páginas e serializa JSON, CSS e recursos estáticos. Falta inventário de tipos de todas as respostas da infraestrutura final. |
| `4.1.2` (2) | P | Serviço local usa HTTP loopback. Definir comportamento de portas e redirecionamento de APIs no ponto de entrada externo. |
| `4.1.3` (2) | E | X-Account vincula contexto, comparado à sessão. Identidade e rate limit não confiam em X-Forwarded-For. Rever cabeçalhos quando existir proxy. |
| `4.2.1` (2) | P | Parser HTTP de Node/Next. Versões, terminação e compatibilidade entre intermediários por demonstrar no alojamento. |
| `4.3.1` (2), `4.3.2` (2) | N | Sem GraphQL nem DSL de consultas recebida por HTTP. |
| `4.4.1` (1), `4.4.2` (2), `4.4.3` (2), `4.4.4` (2) | N | Sem WebSocket de aplicação em modo de utilização. Atualização por fetch periódico. |

## V5 · Ficheiros

| Requisito v5.0.0 (nível) | Estado | Implementação, evidência ou ação pendente |
|---|---|---|
| `5.1.1` (2), `5.2.1` (1), `5.2.2` (1), `5.2.3` (2), `5.3.1` (1), `5.4.3` (2) | N | Sem upload ou redistribuição de ficheiros externos nas rotas. Recuperação é operação local offline com validação própria. |
| `5.3.2` (1) | E | A rota antiga de ficheiros está fechada. local-files.mjs restringe caminhos de operações locais. Browser não escolhe caminho no servidor. |
| `5.4.1` (2), `5.4.2` (2) | E | ExportSpace cria Blob e nome constante o-meu-mes-espaco.json. O endpoint entrega JSON sem aceitar nome de ficheiro. |

## V6 · Autenticação

| Requisito v5.0.0 (nível) | Estado | Implementação, evidência ou ação pendente |
|---|---|---|
| `6.1.1` (1), `6.3.1` (1) | P | SEGURANCA S01–S04, policy e limits documentam e implementam limites por ação/sujeito e teto partilhado. Estratégia de rede para a abertura por provar. |
| `6.1.2` (2), `6.2.11` (2) | P | Não se identificou uma lista documentada e aplicada de termos específicos do serviço. Engenharia deve definir origens, manutenção e testes. |
| `6.1.3` (2), `6.3.4` (2) | E | SEGURANCA S02 e mu1-identity cobrem registo, email, perda de fator/email, reautenticação e restrição de escopo. |
| `6.2.1` (1), `6.2.5` (1), `6.2.8` (1), `6.2.9` (2), `6.2.10` (2) | E | input.ts e policy.mjs admitem 15–256 pontos de código e espaços sem classes obrigatórias. Argon2 recebe a entrada original. Sem rotação periódica. |
| `6.2.2` (1), `6.2.3` (1) | E | account.ts exige a prova atual e nova palavra-passe nas alterações iniciadas em sessão. Redefinição verifica desafio com prazo. |
| `6.2.4` (1), `6.2.12` (2) | P | Dicionário local passwords-common com 49 233 entradas e só 41 de comprimento ≥15. Faltam os 3 000 candidatos elegíveis e evidência de cobertura/atualização de credenciais comprometidas. |
| `6.2.6` (1) | E | IdentityForm usa tipo password nos campos próprios. Ver inspeção e limitações A35. |
| `6.2.7` (1) | P | Campos têm autocomplete e permitem colar. Cada gestor real, navegador e equipamento exige a evidência de A35. |
| `6.3.2` (1) | E | Nenhuma conta universal/default nas migrações. O operador é uma conta ativa com TOTP apontada por configuração. |
| `6.3.3` (2) | P | MFA facultativo para utilizadores comuns por decisão de produto. MFA obrigatório na operação de direitos. Operador deve aprovar justificação e mitigação da exceção ou rever requisito. |
| `6.4.1` (1) | E | Tokens aleatórios de verificação expiram, são consumidos e não se convertem em palavra-passe. |
| `6.4.2` (1) | E | Matriz de recuperação exige fatores definidos. Nenhuma pergunta secreta ou pista de palavra-passe. |
| `6.4.3` (2), `6.4.4` (2) | E | reset mantém TOTP, recoverMfa associa palavra-passe e código de recuperação à sessão restrita. Código de substituição só é ativado após prova. |
| `6.5.1` (2) | E | Código de recuperação consumido, desafio invalidado, contador TOTP monotónico, cada caminho dentro de transação. mu1-identity e mu1-concurrency. |
| `6.5.2` (2), `6.5.3` (2), `6.5.4` (2) | E | Crypto de Node e OTPAuth geram segredo TOTP e códigos. Recuperação tem 128 bits por código guardado por digest, links têm 256 bits. |
| `6.5.5` (2) | P | Passo TOTP 30 s com tolerância de um passo adjacente. Distinguir passo de janela de aceitação. Links de recuperação por email têm 30 minutos. Rever limites segundo finalidade e risco. |
| `6.6.1` (2) | N | Sem telefone ou SMS de autenticação. |
| `6.6.2` (2), `6.6.3` (2) | E | Nos percursos de verificação/recuperação por email, challenges guarda tipo, titular, alvo, digest e expiração. enqueue substitui anterior. limits restringe tentativas. |
| `6.8.1` (2), `6.8.2` (2), `6.8.3` (2), `6.8.4` (2) | N | Identidade local sem IdP, SAML, federação ou validação de asserções assinadas. |

## V7 · Sessões

| Requisito v5.0.0 (nível) | Estado | Implementação, evidência ou ação pendente |
|---|---|---|
| `7.1.1` (2) | P | S03 e policy.mjs documentam inatividade e duração absoluta. Fundamentação explícita das diferenças face ao perfil NIST por fechar. |
| `7.1.2` (2) | P | Utilizador lista e revoga sessões paralelas. Política de máximo/ausência de máximo precisa de justificação operacional. |
| `7.1.3` (2), `7.6.1` (2) | N | Sem IdP federado, RP ou SSO. |
| `7.2.1` (1), `7.2.2` (1), `7.2.3` (1), `7.2.4` (1) | E | validSession consulta digest no backend. createSession gera 32 bytes imprevisíveis, reauth troca digest e login elimina o cookie anterior. |
| `7.3.1` (2), `7.3.2` (2), `7.4.1` (1) | E | O predicado de sessão consulta inatividade e prazo absoluto antes de autorizar. Logout elimina a linha. GET passivo não renova atividade. mu1-identity. |
| `7.4.2` (1), `7.4.3` (2) | E | Encerramento e alterações de fatores invalidam sessões anteriores na mesma transação. PendingClosure só conserva acesso funcional restrito. |
| `7.4.4` (2) | P | Logout visível nas áreas de identidade e gestão. Ver revisão renderizada para os tamanhos e fluxos que foram realmente percorridos. |
| `7.4.5` (2) | P | A conta pode revogar as próprias sessões. Falta procedimento operacional ensaiado de revogação administrativa seletiva/global sem poder financeiro geral. |
| `7.5.1` (2), `7.5.2` (2) | E | verifyProof valida fatores. Revogação de sessões exige autenticação recente, e a própria conta pode inspecioná-las. mu1-identity e account.ts. |
| `7.6.2` (2) | E | Criação de sessão exige ação de identidade explícita. Um GET apenas lê identidade pública/própria. |

## V8 · Autorização

| Requisito v5.0.0 (nível) | Estado | Implementação, evidência ou ação pendente |
|---|---|---|
| `8.1.1` (1), `8.1.2` (2) | E | DECISOES, ARQUITETURA e SEGURANCA definem por ação, espaço, papel e fase do ciclo de vida. Ver revisão independente por rota. |
| `8.2.1` (1), `8.2.2` (1), `8.2.3` (2), `8.3.1` (1), `8.4.1` (2) | P | Sessão confirmada + pertença atual + capacidade transacional, FKs compostas e provas mu2-data/mu4-data/mu5-privacy. A revisão identificou exceções de DTO e prazo. Ver MU6_REVISAO e resultados dinâmicos por critério. |

## V9 · Tokens autocontidos

| Requisito v5.0.0 (nível) | Estado | Implementação, evidência ou ação pendente |
|---|---|---|
| `9.1.1` (1), `9.1.2` (1), `9.1.3` (1), `9.2.1` (1), `9.2.2` (2), `9.2.3` (2), `9.2.4` (2) | N | Sem tokens autocontidos com claims. Sessão, convite e desafio são referências opacas verificadas no servidor. |

## V10 · OAuth e OpenID Connect

| Requisito v5.0.0 (nível) | Estado | Implementação, evidência ou ação pendente |
|---|---|---|
| `10.1.1` (2), `10.1.2` (2), `10.2.1` (2), `10.2.2` (2), `10.3.1` (2), `10.3.2` (2), `10.3.3` (2), `10.3.4` (2), `10.4.1` (1), `10.4.2` (1), `10.4.3` (1), `10.4.4` (1), `10.4.5` (1), `10.4.6` (2), `10.4.7` (2), `10.4.8` (2), `10.4.9` (2), `10.4.10` (2), `10.4.11` (2), `10.5.1` (2), `10.5.2` (2), `10.5.3` (2), `10.5.4` (2), `10.5.5` (2), `10.6.1` (2), `10.6.2` (2), `10.7.1` (2), `10.7.2` (2), `10.7.3` (2) | N | Sem papéis de cliente OAuth/OIDC, servidor de autorização, recurso OAuth ou OpenID Provider. A aceitação dos termos é local. |

## V11 · Criptografia

| Requisito v5.0.0 (nível) | Estado | Implementação, evidência ou ação pendente |
|---|---|---|
| `11.1.1` (2), `11.1.2` (2), `11.2.2` (2) | P | DPAPI no Windows, env para segredos, HMAC/registo independente e AES-GCM por propósito. Faltam inventário operacional, rotação completa e ensaio de recifragem. |
| `11.2.1` (2) | E | node:crypto, implementação Argon2 mantida e OTPAuth. Versões fixadas em pnpm-lock.yaml. |
| `11.2.3` (2), `11.4.1` (1) | P | 256 bits nas chaves principais. TOTP usa HMAC-SHA1 por interoperabilidade. Engenharia deve justificar por uso e política criptográfica. |
| `11.3.1` (1), `11.3.2` (1), `11.3.3` (2) | E | seal/unseal usam AES-256-GCM, IV aleatório de 12 bytes e AAD por propósito. Não se encontrou cifra de blocos legada nas operações revistas. |
| `11.4.2` (2) | P | Argon2id com 19 MiB, duas iterações e paralelismo 1. Medir custo e documentar parâmetros para o ambiente definitivo. |
| `11.4.3` (2) | E | HMAC-SHA256 no registo protegido e nas comparações de endereço de convite. Segredos opacos de alta entropia guardados por SHA-256. |
| `11.4.4` (2) | N | Nenhuma chave de cifra derivada da palavra-passe do titular. Argon2id é verificador de autenticação. |
| `11.5.1` (2) | E | Segredos opacos de 32 bytes e códigos de recuperação de 16 bytes usam randomBytes. UUIDs identificam objetos e não substituem autorização. |
| `11.6.1` (2) | N | Sem geração de chave assimétrica ou assinatura digital de aplicação. Certificado e TLS dependem do operador. |

## V12 · Comunicação segura

| Requisito v5.0.0 (nível) | Estado | Implementação, evidência ou ação pendente |
|---|---|---|
| `12.1.1` (1), `12.1.2` (2), `12.2.1` (1), `12.2.2` (1) | P | Loopback nesta fase. Operador deve validar TLS 1.2/1.3, preferência, cifras e cadeia pública do hostname no ambiente contratado. |
| `12.1.3` (2) | N | A autenticação por certificado de cliente mTLS não faz parte deste serviço. |
| `12.3.1` (2), `12.3.2` (2) | P | Comunicações externas do adaptador Brevo usam HTTPS e verificação normal do cliente Node. Falta evidência de infraestrutura, monitoração e fornecedor reais. |
| `12.3.3` (2), `12.3.4` (2) | N | Base SQLite local e worker no host. Não existe ligação HTTP interserviços interna na topologia em análise. |

## V13 · Configuração

| Requisito v5.0.0 (nível) | Estado | Implementação, evidência ou ação pendente |
|---|---|---|
| `13.1.1` (2) | E | ARQUITETURA e SEGURANCA identificam navegador, servidor, armazenamento, fila e adaptador. O cliente não fornece URL de backend. |
| `13.2.1` (2), `13.2.2` (2) | P | A fila suporta fornecedor com chave API estática e acesso local a SQLite. Privilégios do processo, chave e renovação operacional por provar. |
| `13.2.3` (2) | E | settings recusa Brevo sem chave/remetente e HTTPS. Sem valor de credencial predefinido. |
| `13.2.4` (2) | E | Ambas as chamadas de mail.mjs têm origem Brevo fixa, redirect error e limite de tempo. O identificador do fornecedor entra por URLSearchParams. |
| `13.2.5` (2) | P | Destinos fixos no código do adaptador. Restrições de saída do host e permissões de leitura de ficheiros por configurar. |
| `13.3.1` (2), `13.3.2` (2) | P | Chave local protegida por DPAPI, credenciais de integração no ambiente, segredo TOTP cifrado. Falta verificar ACL, eliminação e acesso mínimo no alojamento. |
| `13.4.1` (1), `13.4.2` (2), `13.4.3` (2), `13.4.4` (2), `13.4.5` (2) | P | Iniciar usa build e start, sem rota de listagem/diagnóstico. Rever exposição de metadados Git, depuração, diretórios, TRACE e monitorização no servidor que vier a ser publicado. |

## V14 · Proteção de dados

| Requisito v5.0.0 (nível) | Estado | Implementação, evidência ou ação pendente |
|---|---|---|
| `14.1.1` (2), `14.1.2` (2), `14.2.4` (2) | P | PRIVACIDADE e inventário MU5 identificam texto livre, contas, finanças, fila, retenções e backups. Falta fechar classificação por nível, fundamentos, controlos de disco e obrigações do operador. |
| `14.2.1` (1) | P | Cookie e POST transportam segredos. Links de email usam fragmento retirado por replaceState. Consultas de histórico transportam IDs e período. Excluir query strings dos registos operacionais. |
| `14.2.2` (2), `14.3.2` (2) | E | Rotas force-dynamic com private, no-store, cliente com cache no-store, shell sem dados financeiros. Revalidar política nos intermediários da abertura. |
| `14.2.3` (2) | P | Aplicação local sem trackers e sem envio automático dos convites. Brevo é um futuro destinatário contratual e o contrato/configuração real fica por validar. |
| `14.3.1` (1) | P | IdentityApp limpa DOM e invalida respostas em expiração/mudança. Rascunho permitido em memória para o mesmo contexto. Ver exceção da exportação e revisão pós-correção em MU6_REVISAO. |
| `14.3.3` (2) | E | Revisão das chamadas não encontrou localStorage/sessionStorage/IndexedDB nas rotas ativas. Cookie é opaco e HttpOnly, rascunhos são voláteis. |

## V15 · Arquitetura e código

| Requisito v5.0.0 (nível) | Estado | Implementação, evidência ou ação pendente |
|---|---|---|
| `15.1.1` (1), `15.2.1` (1) | P | Lockfile e verificação de advisories no dia. Engenharia deve aprovar prazos de correção proporcionais à gravidade e acompanhamento continuado. |
| `15.1.2` (2) | P | package.json e pnpm-lock.yaml inventariam diretas e transitivas. Atestação das origens e manutenção continuada de cada componente dependem da operação. |
| `15.1.3` (2), `15.2.2` (2) | P | Identidade tem limite por sujeito/rede e fila com quota, exportação carrega todos os meses e a reconciliação usa transação. Medições do relatório têm âmbito local. Definir limites e alertas com volumes de operação. |
| `15.2.3` (2) | P | Arranque separado dos fixtures e do código de testes. Confirmar empacotamento, permissões e exclusão de código auxiliar no ambiente operacional. |
| `15.3.1` (1) | P | readMonth remove notas e nomes de origem. readIdentity seleciona campos públicos e próprios. Achados de minimização e contexto identificados em MU6_REVISAO. |
| `15.3.2` (2) | E | Ambas as chamadas de mail.mjs têm origem Brevo fixa, redirect error e limite de tempo. O identificador do fornecedor entra por URLSearchParams. |
| `15.3.3` (2), `15.3.5` (2) | E | Zod usa uniões por operação e objetos estritos. Comandos financeiros têm parser próprio. Identidade e papel são calculados no servidor. |
| `15.3.4` (2) | P | Loopback partilha limite global e ignora IP encaminhado. Desenhar e testar confiança no proxy externo antes da abertura. |
| `15.3.6` (2) | P | validId recusa nomes reservados, há Map em reconstrução de efeitos e schemas de fronteira. Não houve verificação exaustiva dos objetos e dependências. |
| `15.3.7` (2) | P | Origem, cookie, cabeçalho de contexto, corpo JSON e parâmetros de pesquisa são lidos separadamente. Falta política transversal de rejeição de parâmetros singulares duplicados. |

## V16 · Registos e erros

| Requisito v5.0.0 (nível) | Estado | Implementação, evidência ou ação pendente |
|---|---|---|
| `16.1.1` (2), `16.2.1` (2) | P | Inventário MU5 distingue auditoria de direitos, histórico financeiro e operações. Faltam matriz de eventos de segurança, atribuição e acesso em todas as camadas. |
| `16.2.2` (2) | P | Serviço regista epochs e instantes ISO. Confirmar sincronização do relógio do host, fornecedor e eventual proxy. |
| `16.2.3` (2), `16.2.4` (2) | P | Mensagens operacionais discretas e tabela local privacy_audit. Destinos, formato comum e correlação em ambiente operacional por demonstrar. |
| `16.2.5` (2) | P | privacy_audit contém referência, ação e instante. Sem credenciais nos DTO públicos. Rever filtragem e retenção no proxy, backups e diagnóstico de infraestrutura. |
| `16.3.1` (2), `16.3.2` (2), `16.3.3` (2), `16.3.4` (2) | P | Existem contadores e auditoria de privacidade. Não há trilho suficiente de autenticações bem/mal sucedidas, negações, violações de limites e falhas inesperadas. Engenharia e operador devem definir eventos mínimos, privacidade e alertas. |
| `16.4.1` (2), `16.4.2` (2), `16.4.3` (2) | P | Mensagens próprias e campos estruturados no circuito de direitos. Falta ensaio de codificação, imutabilidade, acesso e transferência para análise independente de logs. |
| `16.5.1` (2), `16.5.2` (2), `16.5.3` (2) | E | http.ts e identity/route apresentam erros públicos controlados. Transações fecham em rollback perante falha, fila tem repetição limitada e recuperação bloqueia em quarentena. Ver resultados sintéticos de atomicidade e indisponibilidade. |

## V17 · WebRTC

| Requisito v5.0.0 (nível) | Estado | Implementação, evidência ou ação pendente |
|---|---|---|
| `17.1.1` (2), `17.2.1` (2), `17.2.2` (2), `17.2.3` (2), `17.2.4` (2), `17.3.1` (2), `17.3.2` (2) | N | Sem WebRTC, TURN, sinalização ou transferência de áudio/vídeo em tempo real. Documentado no inventário de superfícies. |
