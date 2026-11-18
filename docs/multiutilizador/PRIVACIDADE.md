# Privacidade, conservação e condições jurídicas

Investigação e especificação de produto revistas com fontes oficiais em 17/11/2026. Não são Termos e Condições prontos a publicar nem certificação jurídica. Obrigações dependentes do operador/modelo real devem ser concluídas antes da abertura. As fontes e a avaliação devem ser atualizadas nessa altura.

## P01 — Operador e documentos públicos

Uma pessoa singular pode ser responsável pelo tratamento. A identidade e os contactos reais do operador estão por preencher; não inventar empresa, morada ou representante. Pessoa singular é hipótese inicial; sociedade unipessoal ou entidade existente só se assumir efetivamente a atividade. O dever de transparência exige identificar o responsável, finalidades, fundamentos, destinatários, conservação e direitos. [RGPD, artigos 4.º e 13.º](https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32016R0679).

Avaliar o enquadramento económico concreto do serviço e a aplicabilidade do artigo 10.º do DL 7/2004. Não presumir que gratuitidade dispensa identificação pública nem que todo projeto pessoal exige automaticamente publicar morada doméstica/NIF. Email profissional sozinho não resolve todos os deveres eventualmente aplicáveis. [Diário da República — DL 7/2004 consolidado](https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/2004-73199154).

Entregáveis antes de lançamento: Termos e Condições, informação de privacidade, informação sobre armazenamento/cookies efetivamente usados, contacto e procedimento de direitos. Versionar documento, país, idioma, vigência e conteúdo publicado; conservar evidência mínima da aceitação e das alterações relevantes. Não exigir consentimento genérico para todos os tratamentos. Não acrescentar análise de utilização, publicidade ou rastreio por defeito.

MU1 implementa a infraestrutura e o percurso com documentos de desenvolvimento claramente identificados; estes não podem passar como textos aprovados para registo público. MU6 exige versões finais e identidade real. Dados privados de identificação/configuração do operador ficam em local adequado e fora de documentação pública inadvertida.

## P02 — País e adultos

Decisão de produto: Portugal, adultos, declaração 18+; uma plataforma e um operador. País declarado não escolhe livremente toda a lei aplicável, nem o idioma/IP o substituem. Futuras versões por país exigem análise própria; normas imperativas podem prevalecer sobre termos contratuais. [Roma I, artigo 6.º](https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32008R0593).

O limiar português de 13 anos previsto na Lei 58/2019 refere-se ao consentimento para serviços da sociedade da informação, não a autorização universal de acesso ou capacidade contratual. Registar avaliação proporcional da declaração de maioridade e procedimento para conhecimento credível de utilização por menor, sem recolher documentos/data de nascimento por defeito. [Lei 58/2019, artigo 16.º](https://diariodarepublica.pt/dr/detalhe/lei/58-2019-123815982), [CEPD — garantia de idade](https://www.edpb.europa.eu/system/files/documents/2025-04/edpb_statement_20250211ageassurance_v1-2_en.pdf).

## P03 — Alcance dos dados e minimização

Dados pessoais não se limitam a email/nome ou às siglas PII/PHI. Notas, valores e relações podem identificar uma pessoa; GUID e autor «utilizador eliminado» podem ser apenas pseudonimização. Substituir email não anonimiza o restante histórico. [Comissão Europeia — proteção de dados](https://commission.europa.eu/law/law-topic/data-protection/data-protection-explained_en).

Não desenvolver funcionalidades clínicas. Orientar descrições financeiras neutras e minimizar dados de terceiros. Quando uma nota constitua dado de saúde de pessoa identificada ou identificável, exige enquadramento válido no artigo 9.º, além do fundamento geral; não presumir que o contrato ou os termos resolvem isso. Antes do lançamento, concluir avaliação do tratamento incidental e procedimento de remoção/restrição, sem fingir detetar automaticamente todo o conteúdo sensível. [RGPD, artigo 9.º](https://eur-lex.europa.eu/eli/reg/2016/679/).

Inventário deve incluir dados estruturados e cópias em `payload`, notas, nomes históricos de contas/origens/linhas, snapshots/catalogs, metadados de importação, recibos, emails/filas, caches, logs, exportações temporárias e backups. Referências mínimas de idempotência também precisam de fundamento, acesso e retenção. Não usar logs como segunda base financeira.

Convites recolhem dados de pessoas ainda não registadas através de outro utilizador. Documentar fundamento, origem, finalidade, retenção e cumprimento do dever de informação da recolha indireta, incluindo quando o convite nunca é aceite ou partilhado. O template manual deve disponibilizar aviso de privacidade; validar antes do lançamento como assegurar a informação nos prazos aplicáveis e fundamentar qualquer exceção. Página pública ou link no template, por si só, não provam que a informação foi prestada. A partilha manual mantém-se; não introduzir envio automático de convites como consequência implícita. [RGPD, artigo 14.º](https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32016R0679).

## P04 — Soft delete e apagamento efetivo

Soft delete é o comportamento normal da aplicação; não é cumprimento automático do apagamento. Preservar estrutura apenas quando necessária e justificável. Limpar/anonimizar efetivamente conteúdo pessoal quando termine a finalidade; se manter linhas, IDs ou relações inviabilizar obrigação aplicável, a regra técnica cede. Não manter espaços privados eliminados indefinidamente para «possível auditoria».

A Lei 58/2019 relaciona conservação com prazo legal ou necessidade da finalidade. Necessidades concretas de prova não são autorização para guardar todos os dados domésticos para sempre. Exceções exigem dados limitados, fundamento, acesso restrito, prazo e revisão. [Lei 58/2019, artigo 21.º](https://diariodarepublica.pt/dr/detalhe/lei/58-2019-123815982).

Os sete dias canceláveis são decisão funcional confirmada. Os valores de 30/90/30 dias abaixo foram aceites como política inicial sujeita a avaliação de necessidade e fundamentação jurídica. Implementar de forma configurável, validar essa fundamentação na MU5 e ajustar se a avaliação o exigir; não são prazos legais universais nem autorização para conservar dados sem finalidade. Prazos não numéricos exigem conclusão fundamentada antes da abertura.

| Categoria/estado | Política inicial para implementar e justificar | Limpeza/controlo |
|---|---|---|
| Conta nunca confirmada | 30 dias | Encerrar intenção e limpar dados desnecessários; não deixar pendente para sempre |
| Convite expirado/revogado/usado | Metadados até 30 dias | Token inutilizável imediatamente; evitar destinatário em arquivo indefinido |
| Sessões e credenciais de conta encerrada | Revogação imediata | Remover segredos na eliminação efetiva; evidência mínima separada |
| Logs operacionais | 30 dias | Sem conteúdo financeiro ou segredos; limpeza automática verificável |
| Auditoria de segurança | 90 dias | Finalidade e acessos próprios; exceção concreta documentada |
| Backups operacionais | Rotação até 30 dias | Só recuperação; reaplicar apagamentos/revogações antes de servir |
| Espaço com pedido de eliminação | 7 dias canceláveis, só leitura | Avisos; depois inacessível e executar limpeza devida |
| Histórico financeiro de espaço ativo | Necessidade documentada do serviço e dos intervenientes | Não atribuir automaticamente prazo de logs; avaliar pedidos individuais |
| Evidência de aceitação jurídica/idempotência/encerramento | Prazo necessário a justificar por finalidade | Não inclui palavra-passe, token utilizável ou cópia integral de movimentos |

Cada categoria exige responsável, início da contagem, rotina de limpeza, prova de execução e tratamento de falhas. Prazo cancelável de produto não pode atrasar indevidamente apagamento legalmente exigível. Um pedido RGPD pode existir sem encerramento da conta.

Email de conta eliminada é substituído por identificador técnico único sem o endereço original quando a sua conservação deixe de ser necessária. Não acrescentar um sufixo ao email original. Novo registo com esse email recebe novo GUID, sem recuperar membros, autoria, convites consumidos ou sessões antigos.

## P05 — Espaços partilhados e histórico

Saída ou encerramento de um membro não apaga automaticamente todos os movimentos comuns. Tampouco autoriza conservar todas as notas e identificadores. Analisar por dado/finalidade e fundamentar eventuais recusas; o proprietário não tem veto sobre direitos. A preferência por histórico completo não é, só por si, exceção legal. [CNPD — apagamento](https://www.cnpd.pt/cidadaos/direitos/direito-ao-apagamento-dos-dados/).

Apagar conteúdo pessoal não é reverter financeiramente um movimento. Criar via restrita de redação/limpeza que alcance também cópias históricas/snapshots, sem deixar o conteúdo apagado no log de alterações. Manter imutabilidade financeira para operações comuns. Limitação do tratamento aplica-se quando se verifiquem os pressupostos próprios; não declarar que todo pedido impõe automaticamente a mesma medida.

Encerramento da conta apresenta os espaços próprios e permite transferir propriedade para membro que aceite ou pedir eliminação. Revogar sessões e entradas normais; se houver processo pendente, acesso dessa identidade restrito apenas à gestão do encerramento. A identidade e a pertença proprietária necessárias mantêm-se até resolver os espaços, sem a marcar como efetivamente eliminada antes disso; os demais membros mantêm o acesso permitido pelo estado do espaço. Não condicionar pedidos sobre dados concretos à aceitação de um novo proprietário. Ex-membros devem poder contactar o operador sem voltar a ter acesso às finanças do grupo.

## P06 — Direitos, exportação e operação

Área Privacidade nas definições permite apresentar, acompanhar e receber resposta privada aos pedidos; existe contacto externo para quem não consegue entrar. Identificação é proporcional, sem recolher documentos indiscriminadamente. Definir quem recebe e trata pedidos antes de existir backoffice. Não criar um formulário sem destino operacional.

Resposta sem demora injustificada e em um mês; extensão até dois meses adicionais quando justificada, comunicada no primeiro mês. Acesso e eventual portabilidade legais não se confundem com exportação do espaço exclusiva do proprietário; proteger direitos de terceiros. [CEPD — direitos dos titulares](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en).

Recusa total ou parcial é fundamentada e informa sobre reclamação à CNPD e recurso judicial. Avaliar e executar comunicação de retificação, apagamento ou limitação aos destinatários, documentando exceções aplicáveis. Não reproduzir conteúdo sensível removido nas notificações nem prometer apagar remotamente ficheiros já exportados. [RGPD, artigos 12.º, n.º 4, e 19.º](https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32016R0679).

Exportação funcional é de baixo destaque e contém apenas o espaço autorizado, formato/versão claros e dados necessários. Não inclui credenciais, tokens, caminhos locais ou backup global. Exportação de dados pessoais responde ao requerente e ao pedido, não entrega automaticamente o espaço inteiro.

Recuperação de backup deve reaplicar eliminações, restrições e revogações ocorridas após a cópia, antes de disponibilizar o sistema. Testar também conta recriada com o mesmo email. Rotação sozinha não evita ressurreição de dados. [CEPD — relatório de apagamento, 2026](https://www.edpb.europa.eu/system/files/documents/2026-02/edpb_cef-report_2025_right-to-erasure_en.pdf).

Antes do lançamento: inventariar tratamentos/subcontratantes/transferências, validar fundamentos por finalidade, avaliar necessidade de AIPD e EPD e documentar a conclusão. Não impor automaticamente essas figuras, PCI DSS, PSD2, NIS2 ou ISO só por o produto organizar finanças pessoais. [CNPD — AIPD](https://www.cnpd.pt/organizacoes/outras-obrigacoes/avaliacao-de-impacto/), [CNPD — EPD](https://www.cnpd.pt/organizacoes/outras-obrigacoes/encarregado-de-protecao-de-dados/).

Manter procedimento de incidentes: deteção, contenção, avaliação de risco, decisão de notificações e evidência. Quando aplicável, a notificação à autoridade segue o prazo do artigo 33.º (em regra até 72 horas do conhecimento); comunicação aos titulares tem pressupostos próprios. Não aplicar um aviso automático universal. [RGPD, artigos 33.º e 34.º](https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32016R0679).
