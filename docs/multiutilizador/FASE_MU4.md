# MU4 — Convites, membros e propriedade

Estado: por implementar. Dependência: MU3 aceite. Ler F02–F04, S01 e [aceitação](ACEITACAO.md).

## Trabalho

1. Adicionar Partilha às definições existentes do espaço. Exibir natureza privada/partilhada, membros e papel; explicar antes de gerar convite que a aceitação dá acesso ao histórico inteiro.
2. Convites emitidos só pelo proprietário para email e papel editor/leitor. Token forte de uso único, hash, sete dias configuráveis; revogar/regenerar e invalidar anteriores. Segredo mostrado apenas quando necessário para partilhar; não em URL de analytics, logs ou notificações indiscriminadas.
3. Partilha por texto: copiar, mecanismo nativo quando suportado e alternativas de serviços externos; não enviar pelo backend por omissão. Tratar cancelamento/falha sem alegar envio. Templates sem finanças ou dados de terceiros, com acesso ao aviso de privacidade. Avaliar cumprimento da informação de recolha indireta mesmo quando o emissor nunca partilha/convite nunca é aceite, conforme P03; não alegar que o template prova entrega dessa informação.
4. Campo recolhido de convite no registo e área «Aceitar convite» nas definições de utilizador existente. Registo mantém intenção pendente; verificar novamente email, prazo, revogação, papel e estado do espaço após confirmar email. Não consumir token antes da aceitação efetiva.
5. Aceitação atómica/idempotente cria associação uma vez. Utilizador existente já membro não é promovido por reaproveitar convite. Aceitação não troca o espaço de trabalho de um formulário aberto sem ação explícita.
6. Gerir leitor/editor e remover membros com autorização atual. Atualizar UI e invalidar caches; servidor recusa leituras/escritas/replays após revogação segundo a ordenação definida.
7. Saída voluntária, perda do último espaço e proposta/aceitação/recusa/cancelamento de transferência de propriedade. Um proprietário por espaço em todas as transições. Antigo proprietário torna-se editor, ou sai como parte do seu encerramento na MU5.

## Percursos de erro

Convite errado/expirado no registo bloqueia conclusão enquanto associado, mas pode ser retirado explicitamente. Explicar possibilidade de usar novo convite nas definições mais tarde. Se expirar durante verificação, não apagar a conta nem forçar novo registo. Conta com email diferente recebe alerta genérico sem revelar destinatário. Alteração de email exige correspondência com o endereço verificado atual no instante da aceitação.

Revogação com separador aberto mostra perda de acesso e limpa dados. Quem ficar sem espaços pode criar um ou aceitar outro convite. Ausência de proprietário recuperável não autoriza um suporte a tomar posse; recuperação de identidade segue MU1.

## Aceitação

- A03–A09, A16, A24, A27, A31, A35, A37 e A41.
- Testar aceitação simultânea, repetida, expirada, revogada, reemitida, pela conta errada e após alteração de email; duas ligações/convites válidos para espaços diferentes não se confundem.
- Registo normal e por convite têm onboarding distinto; primeiro caso cria espaço pessoal, segundo não obriga.
- Só aceitação torna o espaço partilhado; gerar código não altera a visibilidade.
- UI e API aplicam toda a matriz de papéis. Rebaixar editor para leitor bloqueia também comandos pendentes; histórico não desaparece só por mudar papel.
- Transferência concorrente com saída/eliminação/revogação não cria zero/dois proprietários. Aceitação requer destinatário ainda membro e elegível.
- Inspecionar desktop e mobile; ensaiar partilha nativa/cancelamento num dispositivo real quando disponível. Emulação de viewport não comprova integração com aplicações externas; ausência dessa prova fica pendente de aceitação desse percurso.

## Entrega

Máquinas de estado de convite/transferência, matriz de permissões verificada por rota, evidências de corridas e UI. Sem convites reais, mensagens externas ou publicação sem pedido específico. Parar ao concluir.
