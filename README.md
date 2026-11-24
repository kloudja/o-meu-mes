# O meu mês

Aplicação local em português de Portugal. **Fases 1–6 concluídas.** Inclui planeamento mensal, execução, persistência SQLite, backups, recuperação e exportação.

**MU5 entregue para verificação local com dados sintéticos.** O esquema v9 acrescenta eliminação cancelável, encerramento, direitos, exportação por espaço e recuperação em quarentena. O âmbito está descrito na documentação de [privacidade](docs/multiutilizador/PRIVACIDADE.md) e [segurança](docs/multiutilizador/SEGURANCA.md). `Iniciar.cmd` e `pnpm db:migrate` recusam a transição de esquemas anteriores na base diária antes de a abrir em SQLite. A utilização diária continua no endereço [127.0.0.1:3000](http://127.0.0.1:3000/) com o código correspondente à versão da base. A base diária fica em `data/o-meu-mes.sqlite` e a chave de identidade em `data/identity-key.dpapi`, protegida pelo perfil Windows que a criou.

O avatar abre as definições da conta, onde é possível alterar a palavra-passe ou aceitar um convite. Os recibos de confirmações financeiras ficam no servidor. O histórico da MU3 mostra a autoria conhecida e permite corrigir um registo através de uma compensação e uma substituição gravadas em conjunto. `Restaurar.cmd` prepara a cópia recuperada num ficheiro separado em quarentena. A abertura de uma cópia recuperada exige o esquema compatível com o código usado. Consulte também a [arquitetura](docs/multiutilizador/ARQUITETURA.md) e a [matriz de aceitação](docs/multiutilizador/ACEITACAO.md).

As secções seguintes documentam o funcionamento histórico da MU0.

## Abrir no Windows com a MU0

Abra `Iniciar.cmd` nesta pasta. O comando compila o código atual, prepara a base SQLite e abre a aplicação no endereço fixo [http://127.0.0.1:3000](http://127.0.0.1:3000/). Deixe a janela aberta. Para ver alterações de código, termine a instância com **Ctrl+C**, abra novamente `Iniciar.cmd` e atualize o separador. Se a porta estiver ocupada, o arranque pede que feche a instância existente.

Instale Node.js **24.22.1** e pnpm **11.25.0** e confirme que estão no PATH. Numa instalação nova, execute este comando na pasta do projeto e depois abra `Iniciar.cmd`.

```powershell
pnpm install --frozen-lockfile
```

## Dados locais

A base por omissão fica em **`data/o-meu-mes.sqlite` nesta pasta do projeto**. O caminho é resolvido pelo script de arranque, mesmo quando este é chamado noutra diretoria. Não mover/apagar ficheiros de base ou WAL/SHM enquanto o servidor está aberto. Não existe botão de apagar a base. Configuração opcional: variável `OMEUMES_DB_PATH` com caminho **absoluto**, fora de `public`. É necessária permissão de leitura/escrita na pasta. Os registos financeiros definitivos ficam em SQLite; o navegador conserva apenas pedidos ainda por confirmar.

Migrações também podem ser aplicadas por `pnpm db:migrate`. Se o arranque falhar, confira o caminho mostrado na janela, a versão da aplicação e a permissão de escrita na pasta. Em caso de ficheiro danificado, use uma cópia verificada com `Restaurar.cmd`.

Uma base nova começa com o mês atual vazio. Pode criar contas em **Contas** e categorias em **Definições**. Para fornecer um catálogo privado na criação da base, guarde um `catalog.local.json` ao lado do ficheiro SQLite, com as listas `accounts` e `categories`. As contas têm `id`, `name`, `color` hexadecimal e `restricted` booleano. As categorias têm `id` e `name`. Guarde a base, o catálogo privado e as exportações em `data/` ou numa pasta privada fora do repositório.

## Backup, exportação e recuperação

O painel **Dados locais** está oculto por defeito. Para o abrir, inicie a aplicação no PowerShell com `$env:OMEUMES_SHOW_LOCAL_DATA='1'` e `./Iniciar.cmd`.

Em **Definições → Dados locais**, escolha **Criar backup**. Aguarde por **Backup verificado**, com a data e o caminho completo. Use **Copiar caminho** para o colar no Explorador ou no assistente de restauro. O ficheiro SQLite fica na pasta `backups` junto à base, normalmente em `data/backups`. Pode usar a aplicação durante a cópia. Guarde também uma cópia do ficheiro verificado num local privado separado para o caso de perder o disco.

**Exportar dados** descarrega um JSON UTF-8 (versão 1) com todos os meses, planos, movimentos, contas, categorias, poupanças, Modelo Base e lembretes. Use-o para consulta ou tratamento noutra ferramenta. Para recuperar a aplicação, selecione o ficheiro SQLite criado pelo backup. Ambos os ficheiros contêm dados financeiros em texto legível por software, sem encriptação própria.

1. Na pasta do projeto, abra **Restaurar.cmd**. No Explorador, pode selecionar o backup e premir **Ctrl+Shift+C** para copiar o caminho completo. Cole-o no assistente.
2. Prima **Enter** para aceitar o nome novo sugerido junto ao backup, ou indique um caminho absoluto para um ficheiro `.sqlite` novo numa pasta privada existente em NTFS. Confira **Origem** e **Destino**. Responda **s** para criar e verificar a cópia.
3. Quando aparecer **Restauro verificado**, feche a instância habitual e responda **s** a **Abrir a cópia agora?**. Abra o endereço habitual. O topo da página indica **Cópia recuperada**. Confira os meses, o plano inicial e os últimos movimentos confirmados até à data do backup.
4. Para voltar à base habitual, pare o servidor da cópia com **Ctrl+C** e abra **Iniciar.cmd** sem argumentos. Para voltar a abrir a cópia mais tarde, use `.\Iniciar.cmd --base "C:\caminho\copia.sqlite"` no PowerShell com a porta livre.

O restauro guarda a cópia num caminho separado e recusa ficheiros existentes e pastas `public`. Mantenha a base habitual e os ficheiros auxiliares no lugar. Se o assistente recusar o backup, tente uma cópia verificada anterior. Se indicar falha de escrita, escolha uma pasta privada com espaço livre e permissões de escrita.

## Quanto transferir para cada conta

Em **Contas**, o botão **Quanto transferir para cada conta** mostra, para o mês aberto, o valor que falta em cada conta: despesas por pagar + reforços de poupança por realizar − saldo atual, com mínimo zero. Mostra a divisão do cálculo e identifica saldos/montantes ainda por indicar. Não antecipa receitas nem usa as poupanças para compensar outra conta.

**Quanto transferir para cada conta** apresenta a origem, o destino e o montante. **Já fiz as transferências** regista a lista de uma vez depois de a executar no banco. **Preparar esta transferência** abre o formulário para registar uma operação individual. A lista também mostra o valor que ainda fica por cobrir. Quando uma despesa paga por outra conta cria uma falta, a sugestão dá prioridade à conta prevista para essa despesa, até ao excedente que pode ceder.

## Lembretes no painel

Em **Pagamentos recorrentes**, escreva uma nota e indique quantos dias antes do pagamento quer vê-la. Por exemplo, use «Renegociar seguro auto» com 30 dias de antecedência para um pagamento anual. A nota aparece em **Mês**, em **Lembretes de pagamentos**, e pode começar no mês anterior ao pagamento.

## Confirmações e correções

Sucesso só depois de commit. Durante a gravação os controlos relevantes ficam bloqueados. Em erro, o formulário mantém os valores. **Resposta por confirmar:** use **Repetir confirmação**, que conserva a mesma chave/conteúdo e verifica o resultado sem novo pagamento. Só a tentativa pendente fica em localStorage deste navegador/origem, para sobreviver a recarga e fecho do separador; não é a base financeira. Ao voltar a abrir a aplicação no mesmo navegador/endereço, resolva a confirmação pendente. Não limpe os dados do navegador durante uma resposta incerta.

Dois separadores usam revisão global. No modo local, há atualização por foco/a cada 5 segundos. Um conflito apresenta **Recarregar para voltar a editar** e exige abrir uma edição nova. A seleção do mês pertence ao separador. Todos os comandos levam o período explícito. Ao criar um mês, os saldos conhecidos das contas no mês imediatamente anterior são guardados como saldos iniciais. As receitas do Modelo Base entram como previstas e só aumentam o saldo quando o recebimento é registado.

Execução funciona antes de Guardar plano inicial. A referência guardada é imutável. Reforços, despesas e transferências são distintos. Iniciais em falta e movimento são confirmados juntos. Para uma poupança por confirmar, o primeiro movimento pode usar o saldo conhecido do mês anterior ou zero. Compras novas e detalhe de compras já incluídas têm intenções diferentes; atualizar um total só movimenta a diferença. Conferências conservam a base observada. A UI corrige execução por **Anular** e **novo registo**, duas confirmações separadas; `correct` atómico está disponível no serviço/domínio e testado.

## Rever alterações antes do commit

Use `git status --short` e `git diff` para rever as alterações. Depois de reiniciar com **Iniciar.cmd**, confira o resultado no endereço habitual e faça commit quando estiver satisfeito.

Para rejeitar uma alteração antes do commit, use `git restore --worktree -- <ficheiro>` no PowerShell, depois de confirmar que o ficheiro só contém alterações que quer descartar. Se o ficheiro também tiver trabalho anterior, use `git restore --patch -- <ficheiro>` para selecionar os trechos a descartar. Remova ficheiros novos individualmente. O Git reverte código e documentação. Os registos financeiros feitos na aplicação continuam em SQLite.

## Verificação automatizada

```powershell
pnpm build
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
```

`test` verifica o domínio, o repositório, as migrações e a API. `test:integration` e `test:e2e` arrancam e encerram a aplicação em portas efémeras, com bases temporárias fora do projeto. Os testes de navegador usam o mesmo ecrã inicial e a mesma API da aplicação. As bases temporárias são preservadas para diagnóstico. Se a aplicação estiver aberta, compile e teste numa pasta de build isolada, definindo `OMEUMES_BUILD_DIR` na sessão antes dos comandos.

O navegador verificado é Microsoft Edge no Windows. Se necessário, definir `$env:BROWSER_PATH = 'C:/caminho/para/o/navegador.exe'`.

Consulte o [guia de instalação e recuperação](docs/DEPLOYMENT.md) e as [regras do domínio](docs/DOMINIO_FINANCEIRO.md). As capturas, as instruções de rede e a configuração específica do PC ficam na cópia privada.

## GitHub Actions

O workflow [CI](.github/workflows/ci.yml) corre em cada push para `master`. Também pode iniciá-lo em **Actions → CI → Run workflow**, depois de o ficheiro chegar ao ramo principal. Usa runners Windows com Edge e Ubuntu com Chromium para cobrir a aplicação e os scripts de arranque e restauro. Instala com `pnpm install --frozen-lockfile`, reutiliza a cache da pnpm e executa os comandos de verificação acima. A etapa `pnpm quality` verifica as fronteiras de módulos, a análise estática e a formatação, definidas no [verificador de fronteiras](scripts/check-boundaries.mjs) e na [configuração Biome](biome.json).

Configure `origin` com o URL completo do repositório, incluindo o nome da conta GitHub. Se `origin` já existir, use `git remote set-url origin <URL>`. Depois do primeiro push, confirme que `master` é o ramo predefinido. Se o separador **Actions** indicar que os workflows estão desativados, reveja **Settings → Actions → General** e permita as ações usadas pelo workflow.

Antes de publicar, reveja o conteúdo preparado com `git diff --cached` e confirme o e-mail do autor com `git log -1 --format="%an <%ae>"`. Use o endereço `noreply` do GitHub na configuração local deste repositório. Guarde diagnósticos e exportações de router, firewall ou tráfego na pasta ignorada `private/` ou fora do repositório. A configuração doméstica e os dados financeiros ficam no PC. O `.gitignore` só abrange ficheiros ainda não versionados.

Para investigar uma falha, abra **Actions → CI**, escolha a execução do commit e consulte o primeiro passo que falhou no job **Build and test**. Reproduza o comando correspondente localmente. Para reverter um commit defeituoso, use `git revert <SHA>`, verifique e teste a nova versão e faça push para `master`. Para aplicar a reversão à instalação local, compile de novo e reinicie a aplicação. O histórico do Git abrange o código. Para recuperar dados, siga as instruções de restauro de SQLite acima.

## Alojamento

A primeira instalação restrita no VPS Linux com Docker e Caddy concluiu o deployment em 24/11/2026, na [corrida 44942187836, tentativa 4](https://github.com/kloudja/o-meu-mes/actions/runs/44942187836). O HTTPS sem credenciais respondeu 401, como previsto pela proteção adicional. Faltam os percursos autenticados, a entrega real de email e a verificação de backup/restauro no destino descritos no guia.

A verificação seguinte identificou uma regra de loopback ainda aplicada à página inicial, que mostrava 404 depois das credenciais Caddy. Esta revisão aceita o domínio exato configurado, reforça a prontidão com a página HTML e acrescenta o teste de navegador desse domínio. Confirmar a nova imagem no VPS conforme a secção 5.3 do guia; o sucesso da corrida anterior não prova que a página carregava.

A CI conserva os checks Windows, acrescenta build/testes Ubuntu e exercita uma imagem Linux amd64 antes de a transferir para o ambiente `production`. Os deployments são serializados e usam a mesma imagem validada, com SQLite persistente fora da imagem e snapshot antes de migrações. As próximas atualizações normais seguem commit/push autorizado → Actions → verificação na aplicação; não repetem `init` ou o bootstrap. Um `git revert` não faz downgrade do esquema da base.

O [guia de instalação e recuperação](docs/DEPLOYMENT.md) começa pelo estado atual e próximos passos, e distingue primeira instalação, atualizações normais, diagnóstico e recuperação. Separa comandos PowerShell, Ubuntu e definições GitHub. Novas alterações no VPS e exercícios reais continuam dependentes de autorização explícita. O fluxo Windows mantém [127.0.0.1:3000](http://127.0.0.1:3000/) e a sua base habitual.
