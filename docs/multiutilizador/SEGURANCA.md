# Identidade, segurança e evidência

Contrato a implementar nas fases MU1–MU6. Não descreve proteções já presentes. Ver [permissões](DECISOES.md) e [aceitação](ACEITACAO.md).

## S01 — Registo e email

Registo recolhe primeiro/último nome, email, palavra-passe, país, declaração 18+ e aceitação de versão dos Termos. Sem guest nem acesso financeiro antes da verificação. Mostrar política de privacidade separada. Formulários usam rótulos e atributos autocomplete apropriados, permitem colar e gerar palavras-passe e não apagam campos válidos quando há erro.

Verificação e estado de entrega são campos distintos: email não verificado/verificado; entrega pendente, aceite pelo fornecedor, adiada por quota, falhada ou entregue quando houver evidência. `accepted` do fornecedor não prova receção nem valida a conta. A causa de indisponibilidade do serviço não é culpa do utilizador e não muda permissões.

Mensagem quando adiado: «A tua conta foi criada. A confirmação por email está temporariamente pendente. Não precisas de voltar a registar-te.» Reenviar com limites, preservar conta e intenção de convite sem duplicar registos. Priorizar comunicações de segurança na fila. Tokens expirados durante atraso exigem emissão válida quando adequado; um email antigo nunca reativa token revogado. Um GET de ligação de email não deve, só por pré-visualização/scanner, consumir uma ação sensível: exigir confirmação apropriada do utilizador.

Brevo foi escolhido para começar, através de adaptador substituível. Em 17/11/2026, a documentação indica 300 envios/dia e fila adicional limitada para transacionais. Não depender dessa fila como única garantia de entrega: manter estado durável de tarefas, tentativas limitadas, tratamento de duplicados e observabilidade sem segredos. Antes de integrar revalidar plano, remetente, contrato de tratamento e limites. [Brevo — limites do plano gratuito](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan).

Não enviar automaticamente convites: partilha externa continua manual. Emails de confirmação/recuperação são funções distintas. Sem marketing ou rastreio de aberturas/cliques por defeito.

## S02 — Palavras-passe, MFA e recuperação

Política inicial: mínimo de 15 caracteres, suportar pelo menos 64, espaços e passphrases, sem regras artificiais de composição nem rotação periódica. Validar palavras-passe comuns/comprometidas com solução proporcional sem enviar a palavra-passe em claro para terceiros. Hash adaptativo mantido, preferencialmente Argon2id, parametrizado e verificado no ambiente alvo; nunca cifragem reversível. Estas são escolhas de segurança, não imposições legais gerais. [OWASP — autenticação](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

Escolher biblioteca mantida compatível com Next e o armazenamento, documentando suporte a sessões, TOTP e recuperação. Não implementar algoritmos criptográficos próprios. MFA por TOTP é opcional para utilizadores comuns e obrigatório em qualquer acesso administrativo ao serviço; proprietário de espaço não é administrador.

Ativar MFA exige confirmar um código antes de considerar configurado; segredo cifrado no servidor com gestão separada da chave, nunca em logs. Códigos de recuperação fortes, de uso único, mostrados para guardar e armazenados por hash; regenerar invalida os anteriores. Validar anti-replay TOTP, limites de tentativas e tolerância de relógio documentada.

Percursos mínimos:

- Palavra-passe esquecida: token de email de uso único, prazo e limites. Alterar palavra-passe não desativa MFA.
- Perda do autenticador: palavra-passe e código de recuperação permitem percurso restrito de substituição, com reautenticação e revogação de sessões adequada.
- Perda de email sem MFA: código de recuperação previamente emitido permite apenas recuperação restrita, confirmação do novo email e revogação das sessões anteriores. Não concede navegação financeira direta antes de concluir a recuperação.
- Perda de todos os fatores: não prometer recuperação automática por conhecer movimentos, nomes ou ser proprietário. Não criar atalho de suporte.

Códigos de recuperação para contas ativadas não substituem a primeira confirmação de email. Desenhar e testar matriz de fatores na MU1 antes de concluir o módulo; não reduzir MFA a uma verificação só na UI.

Alterar email exige reautenticação recente, confirmar novo endereço e notificar o anterior quando possível; manter o anterior até concluir. GUID mantém-se. Resolver conflitos de unicidade atomicamente; invalidar tokens antigos e reavaliar convites pendentes sem transferir propriedade por coincidência de email.

## S03 — Sessões e configuração

Cookies de sessão HttpOnly, Secure no serviço HTTPS e SameSite adequado; sem credenciais em localStorage. Rotação após autenticação e mudanças relevantes; revogação individual e de todas as sessões. Logout invalida servidor e cliente. Exceção de transporte para HTTP loopback do desenvolvimento, se exigida pela biblioteca, é limitada explicitamente ao ambiente local; nunca desliga autenticação/autorização.

Valores de sessão confirmados, centralizados no servidor e editáveis pelo developer:

| Modo | Inatividade | Duração absoluta |
|---|---:|---:|
| Normal; «Manter sessão» desligado por defeito | 30 minutos | 12 horas |
| Manter sessão, escolhido explicitamente | 7 dias | 30 dias |

Polling de fundo não pode prolongar indefinidamente a sessão. Definir atividade interativa relevante, reautenticação recente e comportamento em vários separadores. Expiração absoluta não se renova por polling/refresh de token.

Também centralizar validade de convites (7 dias), tokens de verificação/reset, janela de reautenticação, tolerância TOTP, limites de tentativas, intervalo de atualização, janela de aviso de duplicado e retenção. Os valores ainda não aprovados são decisões técnicas documentadas e testáveis da fase, não números a espalhar pelo código. Configuração inválida falha de modo seguro. Relógio injetável nos testes.

## S04 — Modelo de ameaças

| Ator/cenário | Controlo necessário | Evidência |
|---|---|---|
| Anónimo ou conta não verificada conhece IDs | Negar dados e mutações antes do repositório; nenhuma rota financeira esquecida | API direta sem sessão/sem verificação |
| Membro do espaço B pede recursos de A | Escopo em consultas, relações, exportações, caches e recibos | IDs reais de A em todos os endpoints de B |
| Leitor altera corpo/rota | Capacidade por ação no servidor | Escrita direta negada e BD sintética inalterada |
| Antigo membro repete pedido já gravado | Autorizar antes de replay/consulta de recibo | Revogação intercalada com leitura/escrita |
| Membro malicioso força outra origem financeira | Foreign keys de escopo + domínio | Relações cruzadas recusadas na API e BD |
| Conta comprometida muda email/propriedade | Reautenticação, MFA quando ativo, notificações, revogação | Sessão roubada sem fatores insuficiente |
| Abuso esgota emails ou enumera contas | Respostas exteriores genéricas, limites por conta/IP/contexto e orçamento de envio | Registo/reset/reenvio em massa controlados |
| Script injetado ou pedido cross-site | Escaping, sem HTML arbitrário, política de conteúdo adequada, CSRF/Origin e cookies | Payloads XSS/CSRF negativos |
| Restaura backup anterior à revogação | Reaplicar revogações/apagamentos antes de servir | Restauro sintético bloqueia acessos antigos |

Limites devem considerar redes partilhadas; não bloquear indefinidamente famílias pelo mesmo IP. Não adicionar CAPTCHA externo por defeito sem avaliar necessidade e privacidade.

## S05 — Controlo técnico verificável

SQL parametrizado; validação no servidor de tipos, limites, datas, relações e autorização. Recusar propriedades de identidade/papel fornecidas como prova pelo cliente. Mensagens públicas sem stack traces, caminhos locais, tokens ou informação de outros espaços.

Segredos só no servidor/configuração apropriada; exemplos sem valores reais; redigir logs e excluir ficheiros sensíveis do Git. Distinguir logs operacionais, auditoria de segurança e histórico financeiro, cada qual com finalidade e acesso. Acesso administrativo excecional deve ser mínimo, reautenticado e auditado; não criar permissão geral de suporte para ler finanças.

OWASP ASVS **5.0.0**, publicado em 30/05/2025, foi verificado como versão estável na fonte oficial em 17/11/2026. Usar nível 2 como referência proposta de revisão, registando requisitos aplicáveis, evidência, exceções fundamentadas e lacunas. Confirmar IDs no texto oficial durante a implementação; não inventar números nem declarar certificação. Top 10 sozinho não é checklist de aceitação. [OWASP ASVS](https://asvs.owasp.org/).

Acesso de desenvolvimento: sessão legítima persistente e fixtures sintéticas autenticadas nos testes. Estado autenticado de Playwright fora do Git e dos artefactos públicos. Sem rota secreta, palavra-passe universal, parâmetro developer ou flag distribuída que contorne autorização. No Windows, manter o arranque habitual em `http://127.0.0.1:3000/` através de `Iniciar.cmd`.
