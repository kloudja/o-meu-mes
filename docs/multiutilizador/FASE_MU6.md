# MU6 — Verificação integrada e condições de abertura

Estado: por implementar. Dependência: MU0–MU5 aceites. Esta fase demonstra preparação; não publica o serviço. Alojamento, contas externas, configuração real e deployment exigem pedido próprio.

## Trabalho e evidência

1. Executar [matriz de aceitação](ACEITACAO.md) e regressão financeira em bases sintéticas. Confirmar testes unitários, integração, concorrência real, navegador e recuperação. Registar comandos, versões, resultados e falhas; não substituir execução por leitura de testes.
2. Revisão independente de fronteiras e rotas: anónimo, não verificado, membro de outro espaço, leitor, ex-membro, sessão expirada e administração. Verificar referências cruzadas, exportações, caches, dados serializados e operações antigas.
3. Mapa ASVS 5.0.0 nível 2 proposto: requisito oficial verificado, aplicabilidade, implementação, evidência, estado e exceções. Rever dependências/segredos, abuso, XSS/CSRF, validação e operações sensíveis. Não declarar certificação.
4. Revisão de UI/UX em desktop e mobile em todas as áreas. Teclado, foco, nomes acessíveis, contraste, erros, loading, estado vazio, orientação do espaço/mês, atualização concorrente e expiração. Verificar navegadores/gestores de palavras-passe solicitados; indicar combinações efetivamente testadas.
5. Ensaiar recuperação, fila de emails, quota/esgotamento e indisponibilidade, limpeza programada e incidentes sem dados reais. Estado aceite pelo fornecedor não é entrega garantida. Integração real depende de configuração autorizada e nunca envia convites/mensagens a terceiros por iniciativa do agente.
6. Rever textos jurídicos finais e inventário do tratamento com operador real. Demonstrar receção e resposta a pedidos, prazos, dados sensíveis incidentais, informação de recolha indireta e reexecução de apagamentos após restauro. Não publicar placeholders legais. Resolver informação ao destinatário de convite nunca partilhado/aceite, sem presumir que uma página pública ou o template bastam.
7. Avaliar carga e limites razoáveis com cenários sintéticos; medir antes de prometer capacidade. SQLite e SQL explícito mantêm-se até existir motivo verificado para outra decisão. Registar o que depende do ambiente operacional ainda não contratado/configurado.

## Condições de conclusão

- Todos os critérios obrigatórios têm evidência, e limitações não são descritas como testes passados.
- Falhas de isolamento, escrita não autorizada, duplicação/perda financeira, bypass de identidade, eliminação/recuperação insegura ou ausência de resposta operacional a direitos impedem abertura pública.
- Pendências de operador, remetente, textos legais, fundamentos aplicáveis e ambiente real têm responsável e ação concreta. A especificação pode estar fechada enquanto estas ações de lançamento continuam por cumprir.
- O utilizador recebe relatório legível com funcionalidades, restrições, resultados de testes e próximas ações operacionais. Não promover «protótipo» a «produção» por conclusão documental.
- Verificações finais preservam a base habitual, backups, único endereço manual e trabalho anterior.

## Fora desta entrega

Sem publicar, alterar DNS, criar serviços externos, ligar bancos, enviar comunicações reais, executar migração real ou ativar outros países/moedas por iniciativa própria. Sem backoffice completo. A necessidade de operações administrativas mínimas e de resposta a direitos deve ter solução operacional segura antes do lançamento, sem se transformar numa autorização de acesso geral às finanças.
