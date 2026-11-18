# MU5 — Encerramento, direitos e recuperação

Estado: por implementar. Dependência: MU4 aceite. Ler [privacidade](PRIVACIDADE.md) integralmente; não substituir avaliação de necessidade por soft delete uniforme.

## Trabalho

1. Inventário por categoria de dado, finalidade, fundamento, prazo, cópias, responsável e rotina de limpeza. Concluir questões jurídicas que afetam o esquema antes de implementar uma retenção definitiva.
2. Eliminação do espaço: reautenticação, explicação de efeitos, sete dias canceláveis em só leitura e aviso aos membros. Cancelar/transferir exige ação explícita autorizada. Após efetivação, negar acesso e executar política de limpeza; pedidos legais concretos podem exigir tratamento antecipado próprio.
3. Encerramento da conta: usar estado pendente (`PendingClosure`) antes de eliminação efetiva. Revogar sessões normais e restringir essa identidade à gestão do encerramento; não marcar o utilizador como eliminado, retirar a pertença proprietária ou destruir os fatores necessários ao acesso restrito enquanto exista espaço próprio por resolver. Transferência só resolve a propriedade quando aceite; eliminação só a resolve quando efetivada. Após resolver todos os espaços, retirar pertenças restantes, revogar/remover credenciais devidas e concluir eliminação. Os restantes membros mantêm acesso ao espaço: normal se ativo, só leitura durante eliminação cancelável. Limpar dados pessoais conforme fundamento/prazo e substituir email sem preservar o original numa string. Recusa/expiração de transferência exige nova escolha explícita, nunca eliminação automática do espaço; pedidos RGPD concretos não ficam dependentes dessa espera.
4. Área Privacidade: submissão privada, estado, esclarecimentos e resposta; contacto alternativo externo. Definir fila/destinatário operacional autenticado antes de backoffice, com acesso mínimo. Fundamentar recusas e informar vias de contestação; avaliar/comunicar alterações a destinatários nos termos aplicáveis. Não enviar dados financeiros por email como rotina de apoio nem reproduzir nas notificações conteúdo apagado.
5. Procedimento de apagamento/redação de conteúdo pessoal de histórico partilhado, snapshots e cópias. Separar do comando de reversão financeira. Não permitir ao proprietário vetar nem ao utilizador reescrever snapshots por uma rota normal.
6. Exportação de espaço só pelo proprietário e de baixo destaque. Serviço separado de pedidos de dados pessoais e de backup administrativo; validar autorização ao preparar e disponibilizar resultado, expirar ficheiros temporários e impedir acesso por URL permanente reutilizável.
7. Limpeza periódica idempotente, limitada e observável, sem logs pessoais completos. Falhas são retomáveis e não deixam a conta reativada. Conservar apenas evidência mínima necessária de cumprimento.
8. Adaptar backup/restauro à nova versão. Após restaurar, reaplicar revogações, eliminações e restrições antes de servir pedidos; invalidar sessões que não possam ser consideradas atuais. Registo protegido de ações posteriores à cópia não pode depender apenas do backup que está a ser restaurado.

## Aceitação

- A16–A18, A26, A29, A34 e A38–A42.
- Espaço privado eliminado não fica como arquivo identificável ilimitado. Utilizador recriado com o mesmo email tem novo GUID sem acesso anterior.
- Pedido individual num espaço partilhado preserva saldos quando só remove notas/identificadores; cópias antigas acessíveis não mantêm o conteúdo apagado. Restrição/apagamento excecional é auditado sem copiar o segredo/texto removido.
- Testar prazos com relógio controlado: cancelamento antes de efetivar, tarefas repetidas, falhas parciais, exceção fundamentada, expiração e limpeza de dados dispensáveis. Intercalar cancelamento, aceitação de transferência e efetivação: uma ordem transacional determina o resultado sem reativar conta eliminada, criar espaço órfão ou limpar dados de uma eliminação já cancelada.
- Backup sintético anterior à eliminação não ressuscita conta, convite, sessão ou dados indevidos. Integridade de referências e resultados financeiros verificada antes de devolver serviço.
- Direitos acessíveis a leitores e ex-membros, com proteção de terceiros. Prazo de um mês contado desde a receção, segundo as regras aplicáveis, não 30 dias fixos.
- UI desktop/mobile: consequências claras, escolhas por espaço, estado só de leitura, pedido pendente/cancelado/efetivado, área privada de direitos utilizável.

## Entrega

Matriz de retenção fundamentada, procedimento de direitos, modelo de eliminação, manual de recuperação e testes. Revisor jurídico avalia lacunas de fundamento; revisor técnico confirma que imutabilidade normal e limpeza restrita coexistem. Não declarar conformidade só por haver campos de auditoria. Parar ao concluir.
