# MU3 — Concorrência, confirmações e histórico compensatório

Estado: por implementar. Dependência: MU2 aceite. Ler F06–F07 e AR06–AR07. Nos testes, membros sintéticos adicionais podem ser preparados por fixtures, sem criar convites reais ou uma demonstração manual.

## Trabalho

1. Substituir bloqueio global por revisão das entidades/dependências relevantes. Classificar comandos: adição independente, edição de recurso, atualização de total, pagamento de restante, snapshot, criação de mês e reversão.
2. Aplicar intenções aditivas sobre estado atual dentro de transação; comparar versões nos comandos que substituem estado. Preservar limites/invariantes financeiras, inclusive quando montantes diferem.
3. Implementar aviso de montante igual no mesmo espaço/mês/rubrica/finalidade e janela temporal configurável. Mostrar contexto atualizado e permitir intenção distinta explícita. A confirmação deve vincular-se ao comando e dados revistos; novas mudanças relevantes reabrem conflito.
4. Recibos com escopo, fingerprint, versão e referência mínima. Consultar resultado após falha de rede antes de oferecer repetição. «Não encontrado» não é prova de não execução futura: definir estados e mecanismo terminal do servidor conforme AR07 para excluir chegada tardia antes de permitir intenção substituta. Não reconstruir conteúdo perdido nem mudar o identificador de uma repetição. Nunca retornar dados de replay a quem perdeu acesso. Definir duração da garantia e rejeição segura de pedidos antigos se forem limpas evidências.
5. Histórico com autor, data efetiva do movimento e instantes de criação/correção distintos. Paginação e detalhe; sem transformar histórico numa tabela extensa.
6. Reversão acrescenta operação inversa e preserva original. Correção acrescenta compensação e substituição num grupo atómico, com efeitos ligados completos. Definir projeção única para não excluir original e subtrair também compensação.
7. Migrar interpretação dos eventos antigos `voided`/correções, conservando resultados financeiros e histórico honesto. Não inventar data/autor de uma compensação histórica. Snapshots continuam referências do plano, sem serem recalculados por alterações de execução.
8. Atualização remota coerente e feedback de desatualização. Contexto do pedido original sobrevive à resposta incerta; logout/mudança de utilizador/espaço nunca desloca a operação nem dispara nova intenção.

## Aceitação

- A07–A14, A20, A28, A30–A33, A36, A43 e A44.
- Dois processos/conexões reais disputam a mesma base sintética. Testar commits, falhas injetadas antes/depois de recibo/commit, resposta perdida e repetição tardia. Promises no mesmo processo síncrono não bastam como prova de concorrência.
- Ana regista 5 EUR no café e Bruno 30 EUR no supermercado na mesma rubrica: ambos entram, total aumenta 35 EUR. Dois montantes iguais próximos geram aviso no segundo; confirmação distinta cria só mais um efeito.
- Dois pedidos de pagamento integral da mesma obrigação não a executam duas vezes; parciais legítimos são reavaliados e aceites sem ultrapassar a intenção confirmada silenciosamente. Total manual concorrente com compra exige releitura adequada.
- Reversão de despesa financiada por poupança devolve os efeitos corretos e não cria receita. Reversão concorrente só produz uma inversa. Correção preserva original e muda efeito líquido uma vez.
- Revogação e escrita têm ordenação definida; nenhuma escrita ordenada após revogação é aceite. Repetir pedido confirmado anteriormente não revela resultado financeiro a ex-membro.
- Desktop/mobile: aviso claro, rascunho preservado quando permitido, atualização visível e botão de atualizar se falhar; sucesso só após confirmação real.

## Entrega

Tabela de comandos com precondições/revisões/invariantes, formato de recibo e política de retenção, projeção de histórico, evidência concorrente e visual. Toda a mudança de esquema desta fase inclui compatibilidade de backup/restauro e barreira de transição AR04. Revisor financeiro calcula resultados independentemente. Não avançar para partilha sem estes critérios. Parar ao concluir.
