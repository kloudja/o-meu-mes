# O meu mês

Aplicação local em português de Portugal. **Fases 1–5 concluídas; Fase 6 em validação com o utilizador.** Inclui planeamento mensal, execução, persistência SQLite, backups, recuperação e exportação. O ensaio está preparado; falta a experimentação e aceitação dos ajustes pelo utilizador.

## Abrir no Windows

Abra `Iniciar.cmd` nesta pasta e use o endereço mostrado no terminal, normalmente [http://127.0.0.1:3000](http://127.0.0.1:3000). Deixe a janela aberta; Ctrl+C para parar. O arranque prepara as migrações antes do servidor. Se a porta estiver ocupada, escolhe outra entre as 20 seguintes, sem terminar processos alheios. Só escuta em `127.0.0.1`.

Instale Node.js **24.22.1** e pnpm **11.25.0** e confirme que estão no PATH. `Iniciar.cmd` também procura Node no runtime local do Codex. Numa instalação nova, execute este comando na pasta do projeto e depois abra `Iniciar.cmd`.

```powershell
pnpm install --frozen-lockfile
```

Para desenvolvimento: `pnpm dev`. Pare o servidor de desenvolvimento antes de compilar. Após alterar código, execute `pnpm build` antes de `pnpm start` ou `Iniciar.cmd`. Sem build, `Iniciar.cmd` compila no primeiro arranque. Os scripts desativam a telemetria do Next.

## Dados reais e ensaio

- **Dados reais:** `Iniciar.cmd` abre a base habitual no PC, normalmente em [127.0.0.1:3000](http://127.0.0.1:3000/).
- **Ensaio doméstico:** numa instalação com a rede doméstica já configurada, `Ensaio.cmd` abre [127.0.0.1:3076](http://127.0.0.1:3076/) no PC. A entrada na rede doméstica exige login e abre a mesma base fictícia. Para uma cópia nova, use o ensaio local descrito abaixo.

A base por omissão fica em **`data/o-meu-mes.sqlite` nesta pasta do projeto**. O caminho é resolvido pelo script de arranque, mesmo quando este é chamado noutra diretoria. Não mover/apagar ficheiros de base ou WAL/SHM enquanto o servidor está aberto. Não existe botão de apagar a base. Configuração opcional: variável `OMEUMES_DB_PATH` com caminho **absoluto**, fora de `public`. É necessária permissão de leitura/escrita na pasta. Os registos financeiros definitivos ficam em SQLite; o navegador conserva apenas pedidos ainda por confirmar.

Migrações também podem ser aplicadas por `pnpm db:migrate`. Se o arranque falhar, confira o caminho mostrado na janela, a versão da aplicação e a permissão de escrita na pasta. Em caso de ficheiro danificado, use uma cópia verificada com `Restaurar.cmd`.

Uma base nova recebe os nomes de exemplo do catálogo incluído no código. Para usar um catálogo privado, guarde um `catalog.local.json` ao lado da base a criar, com o formato de `src/data/catalog.json`. A inicialização só lê esse ficheiro quando prepara uma base nova. Guarde a base, o catálogo privado e as exportações em `data/` ou numa pasta privada fora do repositório.

## Backup, exportação e recuperação

Em **Definições → Dados locais**, escolha **Criar backup**. Aguarde por **Backup verificado**, com a data e o caminho completo. Use **Copiar caminho** para o colar no Explorador ou no assistente de restauro. O ficheiro SQLite fica na pasta `backups` junto à base, normalmente em `data/backups`. Pode usar a aplicação durante a cópia. Guarde também uma cópia do ficheiro verificado num local privado separado para o caso de perder o disco.

**Exportar dados** descarrega um JSON UTF-8 (versão 1) com todos os meses, planos, movimentos, contas, categorias, reservas, Modelo Base e lembretes. Use-o para consulta ou tratamento noutra ferramenta. Para recuperar a aplicação, selecione o ficheiro SQLite criado pelo backup. Ambos os ficheiros contêm dados financeiros em texto legível por software, sem encriptação própria.

1. Na pasta do projeto, abra **Restaurar.cmd**. No Explorador, pode selecionar o backup e premir **Ctrl+Shift+C** para copiar o caminho completo. Cole-o no assistente.
2. Prima **Enter** para aceitar o nome novo sugerido junto ao backup, ou indique um caminho absoluto para um ficheiro `.sqlite` novo numa pasta privada existente em NTFS. Confira **Origem** e **Destino**. Responda **s** para criar e verificar a cópia.
3. Quando aparecer **Restauro verificado**, responda **s** a **Abrir a cópia agora?**. Use o endereço apresentado, normalmente `http://127.0.0.1:3100`. O topo da página indica **Cópia recuperada**. Confira os meses, o plano inicial e os últimos movimentos confirmados até à data do backup.
4. Para voltar à base habitual, pare o servidor da cópia com **Ctrl+C** e abra **Iniciar.cmd** sem argumentos, ou volte ao endereço habitual se o servidor original ainda estiver aberto. Para voltar a abrir a cópia mais tarde, use `.\Iniciar.cmd --base "C:\caminho\copia.sqlite"` no PowerShell.

O restauro guarda a cópia num caminho separado e recusa ficheiros existentes e pastas `public`. Mantenha a base habitual e os ficheiros auxiliares no lugar. Se o assistente recusar o backup, tente uma cópia verificada anterior. Se indicar falha de escrita, escolha uma pasta privada com espaço livre e permissões de escrita.

## Quanto transferir para cada conta

Em **Contas**, o botão **Quanto transferir para cada conta** mostra, para o mês aberto, o valor que falta em cada conta: despesas por pagar + reforços de poupança por realizar − saldo atual, com mínimo zero. Mostra a divisão do cálculo e identifica saldos/montantes ainda por indicar. Não antecipa receitas nem usa as reservas para compensar outra conta.

**Quanto transferir para cada conta** apresenta a origem, o destino e o montante. **Já fiz as transferências** regista a lista de uma vez depois de a executar no banco. **Preparar esta transferência** abre o formulário para registar uma operação individual. A lista também mostra o valor que ainda fica por cobrir. Quando uma despesa paga por outra conta cria uma falta, a sugestão dá prioridade à conta prevista para essa despesa, até ao excedente que pode ceder.

## Lembretes no painel

Em **Pagamentos recorrentes**, escreva uma nota e indique quantos dias antes do pagamento quer vê-la. Por exemplo, use «Renegociar seguro auto» com 30 dias de antecedência para um pagamento anual. A nota aparece em **Mês**, em **Lembretes de pagamentos**, e pode começar no mês anterior ao pagamento.

## Confirmações e correções

Sucesso só depois de commit. Durante a gravação os controlos relevantes ficam bloqueados. Em erro, o formulário mantém os valores. **Resposta por confirmar:** use **Repetir confirmação**, que conserva a mesma chave/conteúdo e verifica o resultado sem novo pagamento. Só a tentativa pendente fica em localStorage deste navegador/origem, para sobreviver a recarga e fecho do separador; não é a base financeira. Ao voltar a abrir a aplicação no mesmo navegador/endereço, resolva a confirmação pendente. Não limpe os dados do navegador durante uma resposta incerta.

Dois separadores usam revisão global. No modo local, há atualização por foco/a cada 5 segundos. Um conflito apresenta **Recarregar para voltar a editar** e exige abrir uma edição nova. A seleção do mês pertence ao separador. Todos os comandos levam o período explícito. Não há transporte automático entre meses.

Execução funciona antes de Guardar plano inicial. A referência guardada é imutável. Reforços, despesas e transferências são distintos. Iniciais em falta e movimento são confirmados juntos. Reserva vazia exige zero explícito. Compras novas e detalhe de compras já incluídas têm intenções diferentes; atualizar um total só movimenta a diferença. Conferências conservam a base observada. A UI corrige execução por **Anular** e **novo registo**, duas confirmações separadas; `correct` atómico está disponível no serviço/domínio e testado.

## Validação manual com valores fictícios

O ensaio dos ajustes da Fase 6 abre em [127.0.0.1:3072](http://127.0.0.1:3072/). Escolha **novembro de 2026**. Use **Mês** para consultar saldos e despesas por pagar. Em **Plano e movimentos**, pode criar e registar despesas, recebimentos extra e objetivos de poupança. Em **Poupanças**, confira o total acumulado e experimente registar um reforço para o objetivo ou um reforço extra.

Para arrancar o ensaio no PC, compile numa pasta própria e execute o script local.

```powershell
$env:OMEUMES_BUILD_DIR = '.next-fase-6-ajustes'
pnpm build
$env:OMEUMES_BUILD_DIR = $null
node scripts/trial-local.mjs
```

O ensaio grava em `data/ensaios/fase-6-ajustes/ensaio-ficticio.sqlite`. Reabrir conserva os registos. A [demonstração](http://127.0.0.1:3072/demo) usa exemplos em memória que são repostos ao recarregar. A aceitação dos ajustes continua pendente.

## Verificação automatizada

```powershell
pnpm build
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
```

`test` mantém os testes de domínio e acrescenta repositório/migrações/API. `test:integration` inicia e encerra servidores reais, incluindo dois processos concorrentes. `test:e2e` inicia a build compilada numa porta livre e numa base temporária `omeumes-test-browser-*`, deixando a base local intacta. Bases temporárias são preservadas para diagnóstico. Nunca correr testes com dados reais.

O navegador verificado é Microsoft Edge no Windows. Se necessário, definir `$env:BROWSER_PATH = 'C:/caminho/para/o/navegador.exe'`. Os testes anteriores usam `/demo`; os novos fluxos persistidos só correm através do executor isolado.

Consulte os [resultados da recuperação](docs/FASE_5_RESULTADOS.md) e as [regras do domínio](docs/DOMINIO_FINANCEIRO.md). As capturas, as instruções de rede e a configuração específica do PC ficam na cópia privada.

## GitHub Actions

O workflow [CI](.github/workflows/ci.yml) corre em cada push para `master`. Também pode iniciá-lo em **Actions → CI → Run workflow**, depois de o ficheiro chegar ao ramo principal. Usa um runner Windows com Edge para cobrir também os scripts de arranque e restauro. Instala com `pnpm install --frozen-lockfile`, reutiliza a cache da pnpm e executa os comandos de verificação acima. O projeto não tem um linter configurado.

Configure `origin` com o URL completo do repositório, incluindo o nome da conta GitHub. Se `origin` já existir, use `git remote set-url origin <URL>`. Depois do primeiro push, confirme que `master` é o ramo predefinido. Se o separador **Actions** indicar que os workflows estão desativados, reveja **Settings → Actions → General** e permita as ações usadas pelo workflow.

Antes de publicar, reveja o conteúdo preparado com `git diff --cached` e confirme o e-mail do autor com `git log -1 --format="%an <%ae>"`. Use o endereço `noreply` do GitHub na configuração local deste repositório. Guarde diagnósticos e exportações de router, firewall ou tráfego na pasta ignorada `private/` ou fora do repositório. A configuração doméstica e os dados financeiros ficam no PC. O `.gitignore` só abrange ficheiros ainda não versionados.

Para investigar uma falha, abra **Actions → CI**, escolha a execução do commit e consulte o primeiro passo que falhou no job **Build and test**. Reproduza o comando correspondente localmente. Para reverter um commit defeituoso, use `git revert <SHA>`, verifique e teste a nova versão e faça push para `master`. Para aplicar a reversão à instalação local, compile de novo e reinicie a aplicação. O histórico do Git abrange o código. Para recuperar dados, siga as instruções de restauro de SQLite acima.

## Alojamento

A CI verifica a build do Next.js. A aplicação continua a correr localmente no endereço apresentado no arranque. O GitHub Pages serve ficheiros estáticos e as rotas de gravação, backup, exportação e acesso doméstico precisam de um processo Node.js com acesso a SQLite. Por isso, o workflow termina após os testes e não existe URL pública da aplicação.

Para atualizar a instalação local, confirme a CI no GitHub, obtenha a revisão aprovada, instale as dependências com o lockfile e compile a nova versão. Valide primeiro com o ensaio fictício. Use o backup da aplicação antes de atualizar a instalação com dados reais.

Se for necessário alojar a aplicação completa, a opção mais pequena é um único servidor Node.js com volume persistente para SQLite, HTTPS e autenticação apropriada para o acesso pretendido. [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) · [Limitações da exportação estática do Next.js](https://nextjs.org/docs/app/guides/static-exports)
