# Decisões funcionais e percursos

Fonte de verdade funcional da evolução multiutilizador. Ler em conjunto com [arquitetura](ARQUITETURA.md), [segurança](SEGURANCA.md) e [privacidade](PRIVACIDADE.md). «Confirmado» descreve decisões do utilizador; valores operacionais não explicitamente confirmados devem constar como proposta na fase que os introduzir.

## F01 — Utilizador, espaço e dados

- Utilizador tem GUID estável, primeiro e último nome obrigatórios, nome de apresentação composto automaticamente, email alterável, país da conta, preferências e credenciais separadas. Email não é chave primária.
- Um utilizador pode possuir ou integrar vários espaços privados e partilhados. Conta de utilizador é distinta de conta financeira registada num espaço.
- Cada espaço nasce privado com um único proprietário. Criar um convite não o torna partilhado; a primeira aceitação válida torna-o partilhado. O indicador atual de partilha resulta dos membros ativos: se voltar a restar só o proprietário, deixa de haver acesso partilhado. O histórico de partilha não desaparece.
- O espaço contém contas financeiras, categorias, poupanças, Modelo Base, recorrências, meses, planos iniciais, movimentos e respetivas definições. Não há catálogos domésticos globais por omissão.
- A partilha abrange todo o espaço e todo o seu histórico, incluindo leitores. Não existem permissões por mês/conta nem agregação, cópia, sincronização ou movimentos entre espaços nesta versão.
- Todos os espaços têm exatamente um proprietário ativo. Não se pode sair, eliminar a conta ou despromover o proprietário deixando um espaço ativo sem proprietário.
- Sem contas convidado/guest. Um utilizador autenticado pode ficar sem espaços após saída ou revogação: mostrar criar espaço/aceitar convite, não erro interno.

## F02 — Navegação e onboarding

No canto superior direito, ícone de utilizador abre perfil/definições/sessões/sair. À sua esquerda, seletor «Espaço». O espaço e o mês ativo devem estar sempre claros. Definições do utilizador: Perfil, Segurança, Preferências e Privacidade. Definições do espaço mantêm as definições financeiras existentes e acrescentam Partilha.

Registo normal conduz à criação do primeiro espaço após verificação de email, com escolha orientada «Começar rapidamente» ou «Configurar agora». Não obrigar a preencher todo o catálogo antes de começar. Não inventar dados domésticos. Um espaço sem meses é um estado válido e permite criar o primeiro mês.

Registo por convite pode conduzir só ao espaço convidado, sem criar um pessoal. Campo «Tenho um código de convite» recolhido por defeito. A confirmação do formulário exprime a intenção de aceitar; a associação definitiva exige email verificado e convite ainda válido. Não criar acesso financeiro temporário durante a verificação.

Convite inválido impede concluir o formulário enquanto estiver associado. A pessoa pode corrigi-lo ou retirá-lo explicitamente e seguir registo normal. Explicar: «Podes aceitar um novo convite mais tarde nas definições da tua conta.» Se expirar durante a verificação, a conta continua criada e verificada, e a pessoa pode obter outro convite ou criar um espaço. Não prender a conta ao convite falhado.

## F03 — Permissões

As permissões são verificadas no servidor em cada ação, inclusive tentativas repetidas. UI esconde/desativa o que não é permitido, mas não constitui controlo de acesso.

| Ação no espaço | Proprietário | Editor | Leitor |
|---|---|---|---|
| Consultar meses, valores e todo o histórico | Sim | Sim | Sim |
| Gerir catálogos, Modelo Base, recorrências e definições financeiras | Sim | Sim | Não |
| Criar mês, saldos iniciais e guardar plano inicial | Sim | Sim | Não |
| Registar, corrigir e reverter movimentos, mesmo de outro autor | Sim | Sim | Não |
| Reescrever plano inicial já guardado | Não | Não | Não |
| Convidar, remover membros e alterar papéis | Sim | Não | Não |
| Exportar o espaço | Sim | Não | Não |
| Transferir propriedade e pedir eliminação do espaço | Sim | Não | Não |
| Sair do espaço | Só depois de transferir ou concluir eliminação | Sim | Sim |
| Exercer direitos sobre os seus próprios dados | Sim | Sim | Sim |

Propriedade de espaço não é administração do serviço. Nenhum papel funcional dá acesso a backups globais, credenciais ou dados de outros espaços. O proprietário não controla os pedidos legais de outros titulares. A identidade de outros membros é minimizada; não expor emails ao leitor só para identificar autoria.

## F04 — Convites e propriedade

Convite: espaço, destinatário por email, papel editor/leitor, prazo, estado, emissor e token aleatório forte. Prazo inicial confirmado: sete dias, configurável. Só o proprietário emite, revoga ou regenera. Regenerar para o mesmo destinatário/espaço invalida o anterior com indicação explícita.

Só uma conta cujo email verificado corresponda ao destinatário pode aceitar. Usar a mesma política documentada de comparação/normalização de email no registo, alteração e convite; não inventar equivalência por remoção de pontos ou sufixos «+». Mensagem para outro email: convite inválido para esta conta, sem revelar o destinatário.

Aceitação é atómica e idempotente: não duplica membros nem altera silenciosamente papel de quem já pertence ao espaço. Um convite não é mecanismo de promover membro existente. Convites expirados, revogados ou consumidos por outra intenção são recusados; a repetição exata de uma aceitação concluída pelo mesmo utilizador pode confirmar o resultado atual se continuar autorizado.

Partilha externa é manual por texto: copiar código/mensagem, partilha nativa quando disponível e alternativas apropriadas de email/WhatsApp/Telegram. Mensagem explica que dá acesso ao espaço e inclui o código e acesso ao aviso de privacidade. Não incluir saldos, notas ou nomes de terceiros. Partilhar abre o serviço escolhido; só o utilizador envia. Não mostrar «convite enviado» sem evidência desse envio. Imagens não são requisito. O dever de informação sobre o email recebido de terceiros é tratado em P03, incluindo convites nunca enviados/aceites.

Transferência de propriedade é proposta a um membro existente selecionado numa dropdown, exige reautenticação e aceitação do destinatário. Até aceitar, proprietário atual mantém responsabilidade. Recusa, expiração, revogação ou perda de pertença do destinatário não transferem nada. Após aceitação, antigo proprietário passa a editor; no encerramento da sua conta, sai de seguida. Esta é a regra operacional adotada na consolidação, a validar nos testes de percurso; não introduz copropriedade. Transferência cancela um pedido pendente de eliminação apenas numa ação explícita apresentada aos intervenientes.

## F05 — Identidade e internacionalização

Email e palavra-passe inicialmente. Sem trocas periódicas forçadas. Compatibilidade com gestores de palavras-passe de Brave, Edge, Chrome, Firefox, Bitwarden e 1Password. MFA opcional por aplicação autenticadora na primeira versão pública. Passkeys ficam para evolução posterior.

Email confirmado é condição de acesso financeiro. A escolha anterior de acesso sem confirmação e a ideia de códigos alternativos por falta de quota foram substituídas. A indisponibilidade do serviço de emails não confirma uma conta nem cria uma via alternativa de acesso. Ver estado de entrega separado da verificação em [segurança](SEGURANCA.md).

Lançamento em Portugal, para adultos, com declaração de maioridade e país de residência escolhido no registo. Não recolher data de nascimento/documentos por defeito. Termos aceites por checkbox desmarcada, com versão, data e idioma; política de privacidade disponível separadamente. Não tratar aceitação dos termos como consentimento genérico.

Idioma da interface, idioma das comunicações do utilizador, país/residência, versão jurídica aceite e moeda do espaço são conceitos separados. Inicialmente pt-PT/EUR/Portugal. Estrutura preparada para outras configurações; não é pedido para traduzir já nem ativar outros países. Um país não determina permissões num espaço. Partilha entre residentes de países diferentes deve ser possível quando esses países forem suportados, após análise aplicável.

Cada espaço tem uma única moeda, imutável depois de criado. Sem conversões nem APIs cambiais. A moeda não depende do idioma ou residência de cada membro.

## F06 — Concorrência, autoria e histórico

- Entradas independentes podem ser gravadas simultaneamente. Uma alteração noutro espaço nunca cria conflito neste.
- Mesmo montante, mesma despesa/rubrica ou finalidade de poupança, mesmo mês/espaço e proximidade temporal suscitam aviso, não eliminação automática. Mostrar dados atualizados e contexto suficiente: quem, quando, origem e descrição. Permitir confirmar «Registar como operação diferente». Janela temporal é parâmetro técnico a justificar/testar, não prazo já aprovado.
- Montantes diferentes não tornam segura uma edição do mesmo registo nem uma substituição de total. Conflitos reais de recurso/obrigação exigem releitura e confirmação. Duas parcelas legítimas podem entrar; o segundo pagamento integral não pode pagar novamente a obrigação como se ainda estivesse aberta.
- Repetir o mesmo pedido com o mesmo conteúdo não cria nova operação. Reusar identificador com conteúdo diferente é erro.
- Histórico mostra todos os movimentos pertinentes aos membros atuais, autoria disponível e datas, com detalhes progressivos. «Autoria histórica não disponível» é preferível a inventar autores.
- Reverter preserva o original e acrescenta operação inversa ligada. Corrigir agrupa original, compensação e substituição atómicas. Não reverter duas vezes. Reversão não é receita/despesa nova independente.
- Reversão é registada no mês original. Não alterar silenciosamente saldos iniciais já capturados em meses posteriores. Uma eventual conferência posterior é explícita.
- Atualizar valores após gravação e mudanças remotas. Se atualização falhar, indicar desatualização e permitir atualizar manualmente. Preservar rascunho quando seguro.

## F07 — Sessão, rascunhos e confirmação incerta

Expiração durante edição oculta dados e permite recuperar rascunho em memória no mesmo separador apenas após autenticar a mesma pessoa e validar permissões atuais. Logout ou entrada de outra pessoa limpa os rascunhos e dados visíveis. Não prometer recuperação de rascunho após fechar navegador.

Mudança de espaço não muda o destino de um comando em curso. Respostas atrasadas do contexto anterior não atualizam o ecrã atual. Revogação retira acesso no servidor e limpa o cliente quando detetada. Não se pode retirar o que alguém já exportou legitimamente.

Para uma gravação incerta, consultar o resultado pelo identificador original no contexto autorizado; se necessário repetir exatamente a mesma intenção. Não apagar a única referência sem mecanismo de recuperação nem reenviar em nome de outra pessoa/espaço. O desenho técnico deve preservar idempotência além da retenção dos dados pessoais da mensagem original.

## F08 — Encerramento e âmbito excluído

Eliminação comum usa soft delete e campos de ciclo de vida. A conservação e limpeza efetivas seguem [privacidade](PRIVACIDADE.md), incluindo exceções necessárias à lei. Espaço em prazo de cancelamento de sete dias fica só de leitura, com aviso aos membros; não desaparece do histórico financeiro durante esse prazo. Encerramento de conta resolve cada espaço próprio por transferência aceite ou eliminação explícita, sem espaços órfãos. Enquanto pendente, a conta tem acesso restrito à gestão do encerramento e mantém a pertença proprietária necessária; só se efetiva a eliminação da identidade depois de resolver as propriedades. Convite de transferência recusado/expirado não elimina automaticamente o espaço.

Não incluir: guest, divisão de despesas entre pessoas, dívidas/compensações de casal, bancos, IA no produto, conversão cambial, agregação entre espaços, backoffice completo, operadores white-label independentes, migração pública de convidados, imagens de convite ou alojamento. A migração do único utilizador atual é uma operação técnica única e não um percurso de produto.
