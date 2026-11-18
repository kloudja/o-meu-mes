# Matriz de aceitação e estratégia de verificação

Estes são cenários a executar nas fases indicadas, não testes realizados nesta consolidação. Pessoas, nomes e valores abaixo são fictícios. A matriz complementa as regras de `../REQUISITOS.md` e AGENTS atuais; não substitui casos financeiros já existentes.

## Estratégia comum

- Unidade: cálculos e transições com resultados independentes; relógio/IDs controlados; limites de inteiros, datas e moedas.
- Integração: SQLite sintética fora do projeto, restrições, transações, isolamento, autenticação, tokens, limpeza e falhas antes/depois do commit. Nenhum teste usa dados reais.
- Concorrência: conexões/processos independentes com ordem controlável; verificar base após as duas intenções, não apenas mensagens HTTP.
- Navegador: fluxos completos, dados persistidos, teclado/foco, estado vazio/erro/loading, desktop e mobile; não aceitar só snapshots de DOM.
- Segurança: API direta com identidades/papéis distintos, IDs conhecidos de outros espaços, tokens expirados e dados malformados. Esconder botão não comprova autorização.
- Visual/manual: inspecionar UI renderizada na instância/endereço previstos no AGENTS. Testes automatizados podem usar portas efémeras e fixtures; não criar demonstração manual separada. Evidências com dados reais não entram em artefactos públicos.
- Registar comando, ambiente/versão, fixture, esperado, obtido, prova e limitação. Um cenário parcialmente executado continua parcial. Uma fase só declara revisão visual se a realizou.

## Cenários

| ID | Precondição | Ação | Resultado esperado | Verificação / fase |
|---|---|---|---|---|
| A01 | Instalação sintética sem identidade; catálogo privado não faz parte da fixture pública | Ana regista, confirma email e começa | GUID novo, nome composto, primeiro espaço próprio sem dados do dono original | API + UI + BD; MU1–2 |
| A02 | Ana e Bruno são proprietários de espaços diferentes | Ambos criam o mesmo período | Dois meses independentes, cada qual com Modelo Base/IDs no seu espaço | Constraints + integrações; MU2 |
| A03 | Ana proprietária, Bruno editor, Carla fora do espaço | Consultar histórico antes/depois de Bruno entrar | Ana/Bruno veem todo o histórico autorizado; Carla não vê nada | API + UI; MU4 |
| A04 | Carla conhece IDs válidos do espaço de Ana | Ler, pesquisar, escrever, consultar recibos e exportar pela API | Sem conteúdo/efeitos/detalhes de A; nenhuma relação cruzada | Testes negativos por endpoint; MU2/4/6 |
| A05 | Bruno é leitor | Chama diretamente comandos financeiros e gestão de membros | Negado; BD inalterada; leitura autorizada continua possível | API + BD; MU2/4 |
| A06 | Convites válidos, expirados, revogados e reemitidos | Aceitar duas vezes e com outra conta/email | Uma pertença no caso válido; recusas genéricas nos restantes; sem promoção implícita | Transações + navegador; MU4 |
| A07 | Editor com formulário e pedido incerto abertos | Proprietário revoga acesso; editor consulta/reenvia | Nenhuma nova operação ordenada após revogação; sem resultado financeiro de replay; UI limpa ao detetar | Dois processos + navegador; MU3–4 |
| A08 | Resposta de espaço A atrasada | Mudar para B antes de receber resposta | B mantém dados/seleção; A não contamina revisões nem feedback | Rede controlada + UI; MU2–3 |
| A09 | Ana tem rascunho/pedido incerto | Logout, Bruno entra no mesmo navegador | Sem rascunhos/dados de Ana, sem reexecução; Ana pode resolver estado por mecanismo autenticado próprio | Storage/rede/UI; MU2–3 |
| A10 | Obrigação fictícia de 100 EUR ainda aberta | Dois integrais simultâneos; depois caso separado de parcelas 40/60 | Integrais não duplicam obrigação; parcelas legítimas totalizam 100 após invariantes atuais | Processos + efeitos na BD; MU3 |
| A11 | Gravação de despesa 12 EUR confirmada no servidor, resposta perdida | Consultar/repetir mesmo pedido; repetir ID com 13 EUR | Efeito único de 12; conteúdo diferente recusado | Falha após commit + recibo; MU3 |
| A12 | Mês ainda sem plano inicial | Dois pedidos concorrentes guardam snapshot | Uma referência inicial, sem substituição silenciosa; resposta identifica resultado atual | Processos + snapshot; MU3 |
| A13 | Mesmo espaço sem mês alvo | Dois pedidos de criar mês | Um mês, uma cópia do Modelo Base, lembretes sem duplicação | Constraints + processos; MU2–3 |
| A14 | Dois espaços independentes; duas despesas aditivas na mesma rubrica de A | Alterar B; em A registar café 5 EUR e supermercado 30 EUR simultaneamente | B não provoca conflito em A; ambas entradas de A aceites, soma 35 EUR | Processos + projeção; MU3 |
| A15 | Conta/poupança pertence a B | Tentar financiar movimento de A com esse ID | Recusa na API e na restrição relacional; nenhum efeito parcial | API e SQL direto de teste; MU2 |
| A16 | Ana única proprietária, Bruno membro | Ana pede encerramento; propõe transferência e Bruno aceita/recusa/expira | Conta em encerramento restrito mantém propriedade até resolução; só aceitação válida transfere; nunca órfão/dois donos nem eliminação automática por recusa; restantes membros mantêm acesso conforme estado do espaço | Estado/transações/UI; MU4–5 |
| A17 | Ex-membro pede apagamento de nota pessoal num movimento comum | Avaliar e executar decisão fundamentada | Sem veto do proprietário, sem alteração de saldo pela mera limpeza; proteção de terceiros | Caso jurídico documentado + integração; MU5 |
| A18 | Proprietário pede exportação; cópia de backup sintética existe | Exportar como proprietário/leitor; restaurar | Só proprietário recebe exportação do espaço; ninguém recebe backup global pelo produto; restauro mantém limites atuais | API + recovery; MU5 |
| A19 | Utilizador sem espaços; depois espaço sem meses | Abrir aplicação e criar contexto | Estado vazio útil, sem erro por falta de mês, sem seed privado | UI/API; MU2 |
| A20 | Fixtures das regras financeiras abaixo | Executar operações e reabrir dados | Resultados exatos mantidos; snapshots e iniciais preservados | Unidade + persistência + navegador; MU0–6 |
| A21 | Conta não verificada; tokens usados/expirados | Tentar acesso financeiro e consumir token | Sem finanças antes de confirmação; uma verificação válida, sem replay indevido | Auth/API; MU1 |
| A22 | Fornecedor de teste em quota, timeout ou aceitação sem entrega | Registar, reenviar e retomar fila | Conta única pendente por serviço; sem bypass, sem sucesso de entrega inventado; tentativas limitadas | Fila/relógio/UI; MU1 |
| A23 | Contas com/sem MFA e códigos de recuperação | Reset, perder fator, reutilizar código, tentar remover MFA só por email | Matriz de fatores cumprida; recuperação restrita; códigos usados não reutilizáveis; sessões revogadas | Integração + UI; MU1 |
| A24 | Email atual verificado, alteração pendente e convite dirigido ao anterior | Confirmar novo email e tentar convite | GUID mantém-se; novo endereço confirmado atomicamente; convites exigem email atual correspondente | Corridas + UI; MU1/4 |
| A25 | Sessão normal/mantida, duas tabs e polling | Avançar relógio, revogar sessão e reautenticar | Tempos configurados; polling não mantém sessão viva; rascunho só volta à mesma pessoa com permissão | Relógio + navegador; MU1 |
| A26 | Conta efetivamente encerrada, email limpo | Novo registo com o email anterior | Novo GUID, sem sessões/pertenças/histórico indevido; vínculo antigo não revive | BD/API/UI; MU2/5 |
| A27 | Portugal/pt-PT/EUR únicos ativos | Mudar preferência de interface; tentar moeda/país não suportado | Não muda idioma de emails/lei/moeda por efeito lateral; configurações não ativas recusadas; moeda do espaço imutável | Contratos/UI; MU2/4 |
| A28 | Despesa 20 EUR financiada por poupança | Reverter duas vezes; em caso separado corrigir para 15 EUR | Uma inversa; original preservado; efeito líquido correto; sem receita falsa | Domínio + BD + UI; MU3 |
| A29 | Leitor e ex-utilizador pedem dados próprios | Submeter, acompanhar, responder/recusar parcialmente | Canal real privado, identificação proporcional, prazo de um mês e fundamentação; não depende de exportação de proprietário | Processo + UI; MU1/5 |
| A30 | Pedido antigo aplicado, payload/recibo sujeito a limpeza | Repetir após prazo e após restauro | Nunca reaplica efeito por ter esquecido a chave; replay autorizado mínimo ou recusa segura | Relógio/limpeza/recovery; MU3/5 |
| A31 | Escrita/aceitação/transferência competem com revogação | Controlar ordem de commit em processos separados | Operação anterior válida mantém efeitos; ordenada depois revalida e falha quando não autorizada | Intercalações reais; MU3–4 |
| A32 | Base sintética antiga com `voided`, correções e efeitos ligados | Migrar para modelo compensatório | Saldos/totais idênticos; sem retirar efeito duas vezes; autoria desconhecida identificada | Comparação independente; MU3 |
| A33 | Outro membro altera dados; atualização seguinte falha | Manter formulário aberto e tentar agir | UI indica desatualização/permite atualizar; não apaga rascunho seguro nem inventa sucesso | Rede controlada + UI; MU3 |
| A34 | Versão antiga sintética com IDs e metadados | Migrar, repetir, falhar a meio e restaurar versão compatível | Sem perda/duplicação; integridade e resultados iguais; destinatário explícito | Migrações + recovery; MU2/5 |
| A35 | Formulários de registo/login/alteração e MFA | Usar navegadores e Bitwarden/1Password | Colar, gerar, guardar, preencher e atualizar funcionam; labels/autocomplete adequados | Desktop/mobile real, matriz de combinações; MU1/4/6 |
| A36 | Entrada recente de 10 EUR na mesma rubrica | Outro membro tenta 10; terceiro altera antes de confirmar aviso | Sem gravação no aviso; intenção distinta confirmada grava uma vez após reavaliação; novo conflito não ignorado | Processos + UI; MU3 |
| A37 | Código criado; serviços externos disponíveis/indisponíveis | Copiar, abrir partilha, cancelar | Texto/código/aviso corretos, sem finanças; cancelamento não é envio; fallback copiar | Desktop/mobile e dispositivo; MU4 |
| A38 | Dado pessoal repetido em notas, nomes, snapshots, recibos e fila | Executar limpeza autorizada | Cópias cobertas; auditoria não conserva texto apagado; snapshots continuam imutáveis nas rotas comuns | Inventário + buscas sintéticas + API; MU5 |
| A39 | Espaço em eliminação cancelável | Ler, escrever, cancelar; depois caso separado efetivar | Leitura permitida aos membros, escrita negada; cancelamento retoma; após efetivação acesso negado/limpeza devida | Relógio/API/UI; MU5 |
| A40 | Backup anterior a revogação/apagamento; registo posterior protegido | Restaurar e tentar login/convite/leitura antes de reconciliar | Serviço não disponibiliza dados até reaplicar restrições; conta nova com mesmo email não herda nada | Recovery integrado; MU5–6 |
| A41 | Convite criado para pessoa não registada; emissor não o partilha | Aplicar política de informação e retenção | Origem/fundamento e prestação de informação ou exceção documentados; prazo acompanhado; expiração não é prova de informação | Avaliação jurídica + processo/fila; MU4–6 |
| A42 | Pedido parcialmente recusado; dados foram disponibilizados a destinatários | Responder e aplicar retificação/apagamento/limitação | Fundamentação e vias de contestação; comunicação devida ou exceção justificada, sem repetir conteúdo sensível | Processo + integração/UI; MU5 |
| A43 | Cópia sintética representa base habitual de versão anterior; transição MU não autorizada | Executar caminho real de arranque; depois testar transição autorizada/reabertura | Primeiro arranque interrompe antes de mutar; migração autorizada é recuperável/idempotente; backups reconhecidos e restaurados na mesma fase | Scripts/migração/recovery sintéticos; MU1–6 quando muda esquema |
| A44 | Pedido nunca recebido ou atrasado; cliente perde payload e termina sessão | Reentrar, consultar chave ausente, resolver original, criar nova intenção; entregar pedido antigo tarde | Ausência não é sucesso/fracasso definitivo; servidor impede execução da chave encerrada; sem duplicação nem reconstrução silenciosa | Rede + transações/relógio + UI; MU3 |

## Resultados financeiros independentes mínimos para A20

1. Compras conhecidas de 40 EUR e total manual atualizado para 60 EUR resultam em 60 EUR, nunca 100 EUR. Total inferior às compras conhecidas exige resolução explícita.
2. Conta principal com 100 EUR e poupança com 50 EUR: reforçar 20 deixa 80/70 e património 150; não há despesa. Pagar despesa de 15 pela poupança deixa 80/55, património 135 e despesa 15 uma única vez.
3. Transferir 25 EUR entre contas próprias com 100/0 deixa 75/25; património 100, receita/despesa zero.
4. Despesa planeada de 85 EUR paga por 92: realizado 92, excesso 7, por realizar zero. Conclusão explícita abaixo do previsto não força pagamento da diferença.
5. Criar mês captura saldos conhecidos de contas no mês imediatamente anterior. Ausência de saldo é desconhecido, não zero. Receitas previstas vêm do Modelo Base; execução, pendentes e sobras não transitam. Iniciais de poupança seguem confirmação própria. Alteração posterior do mês anterior não reescreve iniciais já capturados.
6. Plano inicial guardado permanece igual após editar plano atual, renomear catálogo ou corrigir execução; pode executar antes de o guardar. Rubrica acrescentada depois tem referência inicial zero e indicação adequada.
7. Lembrete recorrente não mexe em saldo/total; associar ao plano não duplica; datas 29/30/31 e 29 de fevereiro seguem regra existente documentada. Consultar mês futuro não muda datas globais de outros meses.
8. Sobra orçamental não cria reforço de poupança. Insuficiência avaliada por conta; excedente proposto para uma transferência não se reutiliza noutra. Fundos restritos não compensam falta de dinheiro livre; não reintroduzir Cartão Refeição retirado do produto.
9. Falha entre efeitos de reforço/despesa/transferência/correção reverte toda a transação e não grava recibo de sucesso. Resposta perdida após commit permite confirmar efeito único.
10. Montantes e resultados intermédios respeitam limites de inteiros; rejeitar overflow, valores malformados e casas decimais incompatíveis, sem arredondamento oculto.

## Modelo de relatório de fase

Registar fase e revisão do código; decisões/requisitos cobertos; ficheiros alterados nesta fase; comandos e resultados; IDs Axx executados/parciais; evidências desktop/mobile; revisão independente e correções; limitações/bloqueios; forma de desfazer só o trabalho da fase. Não declarar «todos os testes passaram» quando algum foi omitido ou já falhava no baseline.
