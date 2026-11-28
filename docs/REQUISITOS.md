# Requisitos — O meu mês

Estado: decisões consolidadas em 02/11/2026, com atualização durante a fase 2, entregue em 03/11/2026. A fase 3 acrescentou persistência local separada da demonstração. A utilização financeira diária continua dependente das garantias de fiabilidade posteriores.

O arranque de utilização e revisão segue o endereço único definido no `AGENTS.md`.

## Finalidade e limites

Aplicação de finanças pessoais em localhost, para uma pessoa no seu computador Windows. Prioridades: planeamento mensal, pagamentos, recebimentos, poupanças e saldos por conta. Interface em português de Portugal, EUR e datas locais. Não é uma reprodução da grelha do Excel.

Este projeto chama-se **O meu mês**. É independente de **Finanças Pessoais**. Não modificar nem reutilizar automaticamente o código ou a base de dados desse outro projeto. A fusão será uma decisão futura, com requisitos próprios.

Começar sem histórico. Aproveitar apenas nomes de contas, categorias e movimentos habituais do Excel, depois de confirmar a respetiva natureza. Não importar montantes históricos, saldos, pagamentos ou meses anteriores. Não reconstruir valores que tenham sido apagados. Não inventar categorias nem variantes de categorias existentes.

Referência de consulta, sem alterações: o ficheiro Excel de referência indicado pelo utilizador. Se não estiver disponível, usar os requisitos e declarar a falta da referência; não inventar uma análise do ficheiro. O Excel não é uma dependência necessária para executar a aplicação.

## Conceitos e planeamento

- **Modelo Base:** definições editáveis de receitas, despesas e reforços habituais. Um mês novo nasce deste modelo, nunca da execução do mês anterior.
- **Plano atual:** o que se prevê neste momento, editável durante o mês.
- **Plano inicial:** cópia imutável do plano quando se escolhe **Guardar plano inicial**. Mostrar a data. Uma nova confirmação não pode substituir silenciosamente a cópia existente.
- **Realizado:** pagamentos, recebimentos e reforços efetivamente registados.
- **Por realizar:** compromisso ainda aberto, calculado pelo plano atual e pela execução. Nunca negativo. Um valor diferente do previsto pode ser explicitamente concluído por um montante inferior; não obrigar a pagar a diferença.
- **Desvio:** apresentar o valor e a base de comparação. Distinguir alteração do plano de diferença entre realização e previsão. Uma despesa de 92 € face a 85 € tem excesso de 7 €, não pendente de −7 €.

A execução funciona antes de guardar o plano inicial. Uma linha adicionada depois tem referência inicial de zero e aparece como adicionada depois do plano inicial. Alterar o plano atual não altera a referência inicial.

Ao criar um mês, guardar como iniciais os saldos conhecidos das contas no mês imediatamente anterior. As receitas mensais são copiadas do Modelo Base como valores previstos. Pendentes, sobras de orçamento e execução ficam no mês onde foram registados. Os saldos das poupanças têm confirmação própria. Criar um mês mesmo que o anterior tenha pendentes, sem avisos ou associações de transporte. Catálogos partilhados não autorizam reescrever planos históricos.

## Contas, despesas e poupanças

Contas em âmbito: ActivoBank (titulares A e B), Moey! (titulares A e B), Santander e Bankinter (titular A). **Decisão posterior do utilizador na fase 2: «Ignora cartão de refeição. Nem vale a pena existir por agora».** O Cartão Refeição foi retirado das fixtures e da interface. A regra geral mantém-se: dinheiro de utilização restrita não pode compensar insuficiências nem aumentar dinheiro livre. Não se presume autorização para voltar a introduzir esse cartão.

Categorias existentes: Habitação; Serviços Essenciais; Refeições/Supermercado; Seguros; Comunicações; Mobilidade; Poupanças; Lazer/Outros; Educação/Infância; Cartões e Créditos; Alimentação; Saúde; Casa-OutrosGastos; uma categoria com nome privado. Não fundir categorias parecidas sem pedido. Permitir adicionar, editar e arquivar; uma referência usada no histórico não deve desaparecer por eliminação do catálogo.

Conta e categoria são seleções pesquisáveis. As cores das contas são discretas, consistentes entre listas e acompanhadas pelo nome. Novas linhas recebem automaticamente a indicação da conta selecionada. A cor não é o único indicador de estado.

Nas contas moey, as Poupanças são dinheiro separado por finalidade. Um reforço reduz o saldo utilizável da conta principal e aumenta o saldo da poupança. Distinguir saldo principal, saldo das poupanças e património total. Ao introduzir um saldo do banco, indicar se corresponde à conta principal ou à poupança.

Uma transferência entre contas próprias altera origem e destino, sem criar rendimento ou despesa. Um pagamento financiado por uma poupança reduz o saldo dessa poupança e conta uma única vez como despesa. Uma devolução à conta principal é uma operação própria. O PPR pertence aos investimentos.

Exemplos de finalidades existentes: Fundo Emergência, Gasolina, IUC Carro, Seguro do Carro, Seguro Multirriscos, Férias 2026, Google One, Prime, ADSE e Revisão Carro. Estes nomes não provam que exista um compromisso mensal nem que a respetiva despesa já tenha acontecido.

## Registo e conferência

Pagamento integral: uma ação, com conta, valor e data predefinidos e uma forma clara de corrigir. Parcial ou diferente: pequeno formulário com montante, data e origem. O estado resulta dos registos e da indicação de conclusão; não pedir ao utilizador para manter valores e estados contraditórios.

Comida, Mimos e Outras Despesas permitem compras individuais ou atualização do total gasto até à data. Compras de 40 € mais uma atualização do total para 60 € significam 60 €, não 100 €. Mostrar a parcela conciliada e os ajustes. Um total inferior às compras conhecidas exige resolução explícita; não apagar compras silenciosamente. Uma atualização agregada deve indicar a conta de financiamento para não inventar os saldos bancários.

Saldos calculados a partir do saldo inicial do mês e movimentos realizados. Conferir com o banco e registar uma diferença datada, explícita e auditável. Não substituir o saldo por cima nem contar duas vezes a correção. Edição/anulação de movimentos deve atualizar os efeitos relacionados de forma atómica na versão persistida.

Sobras de Comida, Mimos e Outras Despesas: mostrar o valor líquido disponível desses orçamentos, incluindo excessos, como possível reforço do Fundo de Emergência. Distinguir sobra de orçamento de dinheiro efetivamente disponível no banco depois dos restantes compromissos. O utilizador regista o reforço quando o fizer; não transferir nem criar compromissos automaticamente.

## Pagamentos recorrentes

Página para subscrições e obrigações periódicas como Google One, Amazon Prime, IUC e seguros. Os campos incluem nome, data de referência, periodicidade mensal ou anual e estado. Montante previsto, conta e poupança são opcionais. O montante desconhecido fica por indicar.

Ao criar um mês, mostrar ocorrências desse período como lembretes, mesmo que não existam no Modelo Base. Um lembrete não altera os totais. Ações: **Adicionar ao plano**, **Associar a movimento existente**, **Dispensar neste mês**. Identificadores estáveis e associação explícita evitam duplicações; não confiar apenas em nomes iguais. Reabrir/criar novamente o mesmo mês não duplica linhas.

Gerar ocorrências pelo período, sem avançar indevidamente uma data global ao consultar um mês futuro. Alterações de definições não alteram referências iniciais já guardadas. Documentar a regra para dias 29/30/31 e 29 de fevereiro. Confirmar um lembrete não significa automaticamente pagar. Cada pagamento recorrente pode ter uma nota no painel com antecedência de 0 a 365 dias, incluindo no mês anterior. A nota é informativa.

## Experiência e qualidade

Prioridade à leitura diária e ao menor número de ações: mês sempre visível, hierarquia clara, espaços entre secções, detalhes progressivos e valores alinhados. Evitar dezenas de colunas horizontais e indicadores redundantes. Não recriar os problemas de tabelas coladas ou totais misturados dentro de listas.

Mostrar poucos indicadores com definições explícitas. O painel apresenta o saldo atual das contas à ordem ativas, as despesas por pagar, as poupanças por realizar e o saldo previsto após as saídas ainda planeadas. A suficiência tem de ser verificável por conta; um total global positivo não basta. Por pedido do utilizador em 03/11/2026, Contas inclui «Quanto transferir para cada conta»: falta para despesas e reforços ainda por realizar, descontando o saldo atual da própria conta. Valores em falta ficam por apurar. A consulta inclui origem, destino e montante sugeridos: distribui os excedentes depois dos compromissos próprios pelas contas em falta, pela ordem apresentada, sem reutilizar dinheiro. Indica o que fica por cobrir quando os excedentes não chegam. A consulta pode preparar uma transferência individual. Depois de fazer todas as transferências sugeridas no banco, o utilizador pode registar o lote numa confirmação. Uma despesa paga noutra conta dá prioridade à conta prevista para cobrir uma falta até ao excedente disponível.

Feedback imediato após cada ação: valor, estado, saldo e indicadores coerentes. Cobrir vazio, erro, carregamento, ausência de saldo inicial, parcial, concluído, excesso e falta de fundos. Teclado, foco visível, rótulos, contraste e navegação móvel utilizável. Sem cor como único sinal. Formatos `1.234,56 €` e datas pt-PT; aritmética em cêntimos inteiros.

Aplicação real: SQLite, migrações, backups, restauro verificado e exportação antes do uso diário. Servidor local por omissão. Não depender de localStorage para a guarda definitiva. Sem serviços de banco, cloud, multiutilizador ou IA dentro do produto nesta fase.
