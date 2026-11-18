# MU1 — Identidade, sessões e comunicações

Estado: por implementar. Dependência: MU0 aceite. Ler [segurança](SEGURANCA.md), [privacidade](PRIVACIDADE.md), F02/F05/F07 de [decisões](DECISOES.md) e [aceitação](ACEITACAO.md).

## Objetivo e limites

Implementar identidade real antes do acesso financeiro multiutilizador. Registo e onboarding ainda não ficam abertos ao público. Conta sem espaço é um estado válido; a criação efetiva do primeiro espaço entra na MU2 e aceitação de convites na MU4. Nesta fase, o campo de convite não pode simular aceitação que ainda não exista.

## Trabalho

1. Antes da primeira mudança de esquema, aplicar a barreira de transição descrita em AR04 ao arranque automático: a base habitual não pode ser migrada só por abrir `Iniciar.cmd` se essa transição ainda não estiver autorizada. Definir entidades de utilizador GUID, email atual/pendente, credenciais, sessões, desafios de verificação/recuperação, MFA/códigos, consentimentos/aceitações documentais e entregas de email, com ciclo de vida e minimização. Atualizar reconhecimento de versão, backup/restauro e testes nesta mesma fase.
2. Selecionar solução mantida de autenticação e criptografia compatível com a stack e com SQL explícito. Registar opções, cobertura e limitações. Não delegar autorização de espaços numa biblioteca que apenas autentica.
3. Registo, confirmação, login/logout, sessão mantida opcional, lista de sessões/revogação, mudança de email e palavra-passe. Email normalizado de forma consistente, unicidade atómica e mensagens que não enumerem contas.
4. Recuperação de palavra-passe, TOTP e códigos de recuperação conforme S02. Elaborar matriz explícita de fatores exigidos em cada transição, incluindo recuperação sem acesso a email, ativação/desativação de MFA e revogação posterior. Nenhuma transição pode remover MFA só por conhecer a palavra-passe ou abrir email.
5. Configuração central dos prazos e limites. Sessão limitada para conta não verificada/reautenticação/recuperação não herda autorização financeira. Não permitir rotas locais antigas como via alternativa de leitura global; se ainda não houver isolamento, esses dados permanecem indisponíveis a novas contas.
6. Adaptador Brevo, templates pt-PT com idioma de comunicações separado, fila durável e estado de entrega. Desenvolvimento/testes usam transporte de teste isolado, sem enviar mensagens reais por omissão; nunca expor tokens por endpoint público de teste. Preparar configuração real sem publicar segredos.
7. Estrutura de documentos jurídicos por versão/país/idioma e registo da aceitação. Mostrar apenas conteúdo de desenvolvimento até existir aprovação de lançamento; o registo local de teste não implica termos públicos concluídos.

## Percursos e UI

Mostrar por campo erros de registo, email por confirmar, entrega adiada e reenvio limitado. Preservar dados válidos do formulário sem reter palavra-passe desnecessariamente. Mensagem de confirmação de email não pode dar acesso se o backend ainda não a validou. Acessibilidade dos códigos TOTP e recuperação; impressão/cópia dos códigos só por ação explícita e sem logs.

Testar autofill, geração, colagem, guardar e atualizar palavra-passe em navegadores/gestores pedidos. Reutilizar sessão legítima no desenvolvimento; não criar bypass. Expiração no mesmo separador pode restaurar rascunho apenas para o mesmo utilizador, nunca após logout/entrada de outra pessoa.

## Aceitação

- A01, A21–A25, A29, A35 e A43 da matriz, na parte implementada; testar também tokens expirados, replay, falha de fornecedor, quota, novo envio e confirmação concorrente.
- Nenhuma rota financeira ou de backup fica acessível a conta nova/não verificada. A segurança intermédia não depende de esconder botões.
- Integração usa base sintética e transporte de email de teste; segredos/estado autenticado fora do Git.
- Rever schemas/migrações e superfície HTTP. Desktop e mobile inspecionados, incluindo teclado virtual e gestores; falhas de compatibilidade ficam explícitas.
- MU1 não é aceite sem matriz de recuperação completa e controlo de sessões no servidor. Não resolver perda de todos os fatores por atalho administrativo.

## Entrega

Contratos de identidade, estados/transições, configuração com valores sem segredos, relatório de testes e limitações. Acesso aos dados do único utilizador existente exige atribuição explícita na MU2, não «primeira conta que se registar». Não executar migração real nesta fase. Parar e aguardar autorização da MU2.
