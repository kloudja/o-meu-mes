# Alojamento de O meu mês

**Estado em 24/11/2026:** versão `3fce0bf` instalada pela [corrida 45509910966](https://github.com/kloudja/o-meu-mes/actions/runs/45509910966), com os quatro jobs bem-sucedidos. A proteção HTTP adicional foi depois removida no host a pedido do utilizador. A consulta externa sem credenciais HTTP devolveu **200**, e o navegador mostrou o formulário Entrar. As APIs de espaços e movimentos devolveram 403 sem sessão, sem desafio HTTP Basic. Login pessoal, entrega real de email, registo financeiro pelo navegador e restauro no VPS ainda precisam da validação descrita abaixo.

**Decisão posterior do utilizador, aplicada:** remover a palavra-passe HTTP adicional do Caddy. A rota passa diretamente para o formulário da aplicação; sessões e permissões continuam a ser verificadas pela aplicação. A secção 5.4 documenta a operação já feita neste VPS e serve para atualizar outras instalações antigas, sem necessidade de repetir aqui. A validação inicial usa dados sintéticos. As outras fases do produto mantêm-se fora desta tarefa. Commit, push, alterações no VPS e exercícios reais exigem instrução explícita. Os textos e condições de abertura pública identificados na MU6 continuam pendentes.

**Histórico do 404:** a imagem anterior ainda usava a regra antiga de acesso apenas por loopback. A versão `3fce0bf` permite o Host da origem configurada e verifica o HTML real da aplicação na prontidão e no teste da imagem. O formulário foi depois observado no endereço público. Ver secção 5.3 para a causa; não voltar a executar os reparos históricos numa instalação já corrigida.

## O que fazer agora

1. Abrir [omeumes.pt](https://omeumes.pt) diretamente no formulário da aplicação e usar a conta pessoal. Não existe uma conta adicional `verificacao` no fluxo pretendido. Se ainda aparecer um pedido HTTP Basic ou HTTP 401 antes do formulário, a rota antiga ainda precisa da atualização da secção 5.4.
2. Registar/entrar com uma conta controlada, confirmar a entrega do email e criar um espaço de teste vazio. Ensaiar saldo inicial 100,00 €, despesa 12,34 €, pagamento e recarga: uma despesa e saldo 87,66 €. Ver secção 6 para o percurso e evidência. Não importar a base Windows nem histórico para este teste.
3. Antes de dados financeiros reais, completar o backup cifrado fora do servidor e o restauro verificado das secções 6–8. O snapshot automático pré-deploy fica no próprio VPS e não substitui uma cópia recuperável fora dele.
4. Nas próximas alterações normais de código, o fluxo é revisão/testes locais → commit/push autorizado para `master` → acompanhar Actions → abrir a aplicação e confirmar os dados. **Não repetir `init`, bootstrap ou SCP da imagem.** A pipeline transfere a imagem e conserva os dados automaticamente. Alterações aos helpers root-owned, Compose ou Caddy são manutenção do host e continuam a exigir uma atualização explícita desses ficheiros.

## Como usar este guia

- **VPS atual:** começar pela secção anterior e pela validação da secção 6. A primeira instalação já terminou.
- **Instalação nova:** secções 1–5. Não voltar a executar esses blocos sobre a instalação atual; incluem configuração inicial e geração de segredos.
- **Diagnóstico dos erros já encontrados:** secções 5.1 e 5.2. Não são passos de rotina depois de um deployment bem-sucedido.
- **Backup e recuperação:** secções 7–8. As operações que interrompem o serviço são exercícios explícitos.

Esta versão inclui as correções de correspondência entre IDs de imagem, sintaxe Caddy anterior a 2.8, confirmação correta do rollback e acesso à página pelo domínio configurado. A verificação num servidor instalado não equivale a um novo ensaio integral de instalação numa máquina limpa; as pendências funcionais e de recuperação estão identificadas na secção 6.

## O que será executado

`master` → testes Windows e Ubuntu → imagem Docker Linux amd64 → ensaio dessa imagem → artefacto imutável da corrida → SSH restrito → snapshot offline → preparação da base → arranque → prontidão → Caddy. Um erro nos checks impede o job de deployment. Não se recompila no VPS e não se usa uma etiqueta `latest`. A transferência confere SHA-256 do arquivo e a identidade da imagem selecionada. Docker clássico pode reportar o digest da configuração, enquanto o armazenamento containerd pode reportar o digest do manifesto ou índice. O helper verifica a ligação entre esses digests no arquivo conferido e fixa a release pelo ID local do VPS. A base Node está fixada por digest; atualizar Node implica alterar ambos os `FROM` e repetir os checks.

O endereço Windows continua a ser `http://127.0.0.1:3000/`, através de `Iniciar.cmd`, com a sua base e chave DPAPI. Não copiar a pasta `data`, backups, Excel ou a chave Windows para o servidor. A imagem admite apenas código/configuração de build através de `.dockerignore`; não recebe documentos, testes nem segredos. As dependências nativas são instaladas em Linux. `hosted.mjs` usa o mesmo worker de email, limpeza e rotação do launcher Windows.

No VPS, Caddy termina TLS. Só `127.0.0.1:3000` é publicado pelo Docker. A porta 3001 de prontidão só existe em loopback dentro do contentor. A imagem é de leitura, corre com UID 1000 e não recebe o socket Docker. Há uma só instância SQLite, com lock de supervisor; não aumentar réplicas.

| Local no VPS | Conteúdo | Sobrevive ao deployment |
|---|---|---|
| `/var/lib/omeumes/database` | Base, WAL/SHM, backups autónomos e lock | Sim |
| `/var/lib/omeumes/authority` | Autoridade de recuperação, em diretório separado da base | Sim |
| `/etc/omeumes/app.env` | Chaves independentes, origem, Brevo, caminho da base | Sim; não pertence à imagem |
| `/etc/omeumes/release.env` | Referência da imagem ativa | Atualizada pelo deployment |
| `/var/backups/omeumes` | Snapshots anteriores a migrações e backups cifrados | Sim; só root |
| `/opt/omeumes/compose.yaml` | Política de execução instalada e revista pelo administrador | Sim |

## 1. Rever e autorizar a release local

Preservar o trabalho multiutilizador anterior: módulos de identidade, espaços, privacidade e alterações financeiras/HTTP fazem parte do comportamento necessário à release. Incluir os respetivos testes e auxiliares de fixtures. Não selecionar apenas os ficheiros de deployment: isso publicaria código sem as suas dependências. Os relatórios locais de fases, configuração doméstica e documentação privada não são necessários à imagem nem à primeira release pública. O inventário específico desta conversa e a cópia anterior às edições ficam no relatório local de revisão, ignorado pelo Git.

**Windows PowerShell**, na raiz do projeto, antes de um commit autorizado:

```powershell
git status --short
git diff --check
git diff --stat
# Depois de selecionar explicitamente os ficheiros aprovados:
git diff --cached --stat
git diff --cached
```

Confirmar que o índice não contém dados, exportações, segredos, capturas privadas ou relatórios locais. Não usar `git add .` sem rever essa seleção. Um push autorizado para `master` inicia a pipeline; sem configuração completa, o deployment falha mantendo a manutenção.

## 2. Preparar ficheiros do VPS (apenas após autorização)

Usar a mesma autenticação pessoal que já permite entrar como `omeumes-admin`, incluindo a opção `-i` ou o agente necessário. A chave de `omeumes-deploy` pertence à pipeline e não permite SCP. Se surgir `Permission denied (publickey)`, resolver esse acesso antes de continuar; um SHA impresso posteriormente não confirma que houve transferência.

Usar o IPv4 nos comandos SSH: a consulta DNS de 21/11/2026 não encontrou `vps.omeumes.pt`. O hostname do servidor não cria um registo DNS. A aplicação continua em `https://omeumes.pt`; não é necessário alterar DNS para este percurso.

**Windows PowerShell:**

```powershell
Set-Location 'C:\caminho\para\o-meu-mes'
scp -r .\deploy omeumes-admin@82.108.206.102:~/omeumes-deploy-review
ssh omeumes-admin@82.108.206.102
```

**Ubuntu, por SSH**, confirmar a pasta recebida antes de instalar:

```bash
ls -la ~/omeumes-deploy-review
sudo install -d -o root -g root -m 0755 /opt/omeumes /usr/local/libexec
sudo install -d -o root -g root -m 0700 /etc/omeumes /var/backups/omeumes
sudo install -d -o 1000 -g 1000 -m 0700 /var/lib/omeumes /var/lib/omeumes/database /var/lib/omeumes/authority /var/lib/omeumes/import
sudo install -o root -g root -m 0644 ~/omeumes-deploy-review/compose.yaml /opt/omeumes/compose.yaml
sudo install -o root -g root -m 0755 ~/omeumes-deploy-review/omeumes-deploy.sh /usr/local/sbin/omeumes-deploy
sudo install -o root -g root -m 0755 ~/omeumes-deploy-review/omeumes-backup.sh /usr/local/sbin/omeumes-backup
sudo install -o root -g root -m 0755 ~/omeumes-deploy-review/ssh-receive.sh /usr/local/libexec/omeumes-ssh-receive
sudo install -o root -g root -m 0755 ~/omeumes-deploy-review/image-identity.py /usr/local/libexec/omeumes-image-identity.py
if sudo test -e /etc/omeumes/app.env; then
  echo 'app.env já existe; conservar a configuração e as chaves existentes.'
else
  sudo install -o root -g root -m 0600 ~/omeumes-deploy-review/app.env.example /etc/omeumes/app.env
fi
```

Gerar as duas chaves **uma única vez**, sem as mostrar. Este comando recusa repetir a geração. Guardar cópia cifrada fora do VPS antes de usar dados reais.

```bash
sudo python3 - <<'PY'
from pathlib import Path
import secrets, base64
p = Path('/etc/omeumes/app.env')
s = p.read_text()
assert 'GENERATE_ON_VPS' in s and 'GENERATE_SEPARATELY_ON_VPS' in s, 'Chaves já configuradas; não rodar aqui'
s = s.replace('GENERATE_ON_VPS', base64.b64encode(secrets.token_bytes(32)).decode())
s = s.replace('GENERATE_SEPARATELY_ON_VPS', base64.b64encode(secrets.token_bytes(32)).decode())
p.write_text(s)
p.chmod(0o600)
PY
sudo nano /etc/omeumes/app.env
```

No editor privado, substituir apenas os placeholders Brevo por uma API key transacional e remetente verificado. Não colar valores no chat, nem colocá-los em argumentos de comandos ou no Git. Não ativar transporte `test` no alojamento. A conta de operador e o seu ID para `OMEUMES_RIGHTS_HANDLER` só se configuram depois do registo. Confirmar remetente, domínio, entrega, quota e eventos Brevo durante o ensaio restrito; a prontidão não envia emails.

### Caddy: conservar a manutenção até à prontidão

```bash
sudo cp -an /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-omeumes
sudo install -o root -g caddy -m 0640 ~/omeumes-deploy-review/route-maintenance.caddy /etc/omeumes/route-maintenance.caddy
if sudo test -e /etc/omeumes/route-app.caddy; then
  echo 'route-app.caddy já existe; conservar alterações próprias e atualizar a rota antiga pela secção 5.4.'
else
  sudo install -o root -g caddy -m 0640 ~/omeumes-deploy-review/route-app.caddy.example /etc/omeumes/route-app.caddy
fi
sudo install -o root -g caddy -m 0640 /etc/omeumes/route-maintenance.caddy /etc/caddy/omeumes-route.caddy
sudo nano /etc/caddy/Caddyfile
```

No `Caddyfile`, conservar outras configurações existentes e substituir só o conteúdo do bloco `omeumes.pt` por `import /etc/caddy/omeumes-route.caddy`; ver o exemplo `deploy/Caddyfile`. Não importar já a rota da aplicação. A rota da aplicação contém apenas o proxy para 127.0.0.1:3000 e os cabeçalhos; não gerar nem configurar uma palavra-passe Caddy adicional.

O exemplo atual não usa `basicauth` nem `basic_auth`. Confirmar a versão com `caddy version` e validar a configuração antes de a recarregar. As instalações antigas que ainda usam a proteção adicional devem seguir a secção 5.4.

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
curl -I https://omeumes.pt
sudo ss -lntp
```

O HTTPS deve continuar em 503. Não abrir 3000/3001 na firewall nem no painel NoLimitCloud. Preservar SSH e 80/443 existentes.

## 3. Criar identidade SSH exclusiva da pipeline

**Bitwarden no Windows:** gerar e guardar a chave no cofre, conforme a preferência do utilizador. Criar um item novo do tipo **SSH key / Chave SSH**, dar-lhe o nome `O meu mês — GitHub Actions — VPS` e guardar. O Bitwarden gera Ed25519. Este par é exclusivo do deployment; a chave pessoal de `omeumes-admin` permanece separada. [Instruções oficiais](https://bitwarden.com/help/about-ssh/).

Copiar apenas o campo **Public key / Chave pública** do novo item. Na sessão **Ubuntu por SSH**, abrir:

```bash
nano ~/omeumes-actions.pub
```

Colar a chave pública completa numa única linha, iniciada por `ssh-ed25519`. Guardar com Ctrl+O, Enter e sair com Ctrl+X. Conferir o formato e a impressão digital:

```bash
ssh-keygen -lf ~/omeumes-actions.pub -E sha256
```

Este último comando apenas inspeciona a chave pública; não gera outra chave. A parte privada permanece no Bitwarden e será copiada diretamente para o secret GitHub no passo 4, sem criar um ficheiro privado no Windows nem a colocar no VPS. A pipeline atual usa um secret GitHub: o agente SSH do Bitwarden no PC não está disponível ao runner remoto. Uma integração com Bitwarden Secrets Manager seria um percurso diferente, não configurado nesta entrega.

**Ubuntu, por SSH:**

```bash
sudo adduser --disabled-password --gecos '' omeumes-deploy
sudo install -d -o root -g root -m 0755 /home/omeumes-deploy/.ssh
{ printf 'restrict,command="/usr/local/libexec/omeumes-ssh-receive" '; cat ~/omeumes-actions.pub; } | sudo tee /home/omeumes-deploy/.ssh/authorized_keys >/dev/null
sudo chown root:root /home/omeumes-deploy/.ssh/authorized_keys
sudo chmod 0644 /home/omeumes-deploy/.ssh/authorized_keys
sudo chown root:root /home/omeumes-deploy
sudo chmod 0755 /home/omeumes-deploy
printf '%s\n' 'omeumes-deploy ALL=(root) NOPASSWD: /usr/local/sbin/omeumes-deploy' | sudo tee /etc/sudoers.d/omeumes-deploy >/dev/null
sudo chmod 0440 /etc/sudoers.d/omeumes-deploy
sudo visudo -cf /etc/sudoers.d/omeumes-deploy
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
```

Esta conta não pertence ao grupo Docker. A chave tem comando forçado e não permite terminal, forwarding nem SCP. O helper root aceita apenas `deploy COMMIT IMAGE_ID ARCHIVE_HASH`; recebe o arquivo em stdin e não aceita caminhos ou shell arbitrários. Todos os helpers, Compose e rotas instalados são propriedade de root. Alterações futuras a estes ficheiros exigem revisão e instalação explícita pelo administrador; uma imagem nova não substitui a política do host.

**Ubuntu, na sessão SSH pessoal já autenticada:** recolher diretamente a chave pública do servidor e a sua impressão digital:

```bash
awk '{print "82.108.206.102 " $1 " " $2}' /etc/ssh/ssh_host_ed25519_key.pub
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
```

O primeiro comando imprime uma linha pública completa para known_hosts. O segundo imprime a identificação `SHA256:...`. Copiar estes dois valores da sessão pessoal de confiança. Este percurso evita depender de `ssh-keyscan`, que não devolveu dados no cliente Windows durante a instalação guiada; a causa não foi determinada porque stderr estava oculto.

**Windows PowerShell:** colar o bloco inteiro, desde `& {` até à última `}`. Os pedidos de introdução só surgem depois de o bloco estar completo. Em caso de erro, a execução termina antes de substituir o ficheiro ou anunciar sucesso.

```powershell
& {
    $ErrorActionPreference = 'Stop'
    $publicLine = (Read-Host 'Cola a linha pública completa do primeiro comando Ubuntu').Trim()
    $expectedFingerprint = (Read-Host 'Cola apenas a impressão SHA256:... confirmada no Ubuntu').Trim()
    $parts = $publicLine -split '\s+'
    if ($parts.Count -ne 3 -or $parts[0] -cne '82.108.206.102' -or $parts[1] -cne 'ssh-ed25519') {
        throw 'A linha pública não tem o formato esperado.'
    }
    if ($expectedFingerprint -cnotmatch '^SHA256:[A-Za-z0-9+/]{43}$') {
        throw 'A impressão digital não tem o formato esperado.'
    }
    $sshDirectory = Join-Path $env:USERPROFILE '.ssh'
    New-Item -ItemType Directory -Force $sshDirectory | Out-Null
    $knownHosts = Join-Path $sshDirectory 'omeumes-actions-known-hosts'
    $candidate = "$knownHosts.pending"
    $publicLine | Set-Content -Encoding ascii $candidate
    $info = @(ssh-keygen -lf $candidate -E sha256)
    if ($LASTEXITCODE -ne 0 -or $info.Count -ne 1) {
        throw 'Não foi possível validar a chave pública do servidor.'
    }
    $actual = ($info[0] -split '\s+')[1]
    if ($actual -cne $expectedFingerprint) {
        throw 'A impressão digital não corresponde. O ficheiro de confiança não foi substituído.'
    }
    Move-Item -LiteralPath $candidate -Destination $knownHosts -Force
    Write-Output "Servidor confirmado: $actual"
}
```

Não aceitar uma impressão diferente sem investigar. A pipeline usa `StrictHostKeyChecking=yes`; não recolhe a chave do host durante o deployment. Os comandos acima só tratam da chave pública do servidor; a chave privada de deployment permanece no Bitwarden até à configuração do secret GitHub.

## 4. GitHub

Em **Settings → Environments → production**:

- Deployment branches and tags: **Selected branches and tags**, só regra de **branch `master`**, sem tags.
- Sem required reviewers, wait timer ou outra proteção que exija intervenção, para permitir automatismo.
- Environment variables: `VPS_HOST=82.108.206.102` e `VPS_USER=omeumes-deploy`.
- Environment secrets: `VPS_DEPLOY_KEY` e `VPS_KNOWN_HOSTS`.

Verificação read-only efetuada em 21/11/2026: `production` existe, tem apenas a política de branch `master`, não tem reviewers/timer e Actions está habilitado. Não existiam secrets ou variables de ambiente. Revalidar no momento da instalação. O token da pipeline só necessita de `contents: read`; não há registry nem PAT de packages.

**Windows PowerShell**, após autorizar a configuração, definir as variáveis e o secret público de known_hosts:

```powershell
gh variable set VPS_HOST --env production --repo kloudja/o-meu-mes --body '82.108.206.102'
gh variable set VPS_USER --env production --repo kloudja/o-meu-mes --body 'omeumes-deploy'
$knownHosts = Join-Path $env:USERPROFILE '.ssh\omeumes-actions-known-hosts'
Get-Content -Raw $knownHosts | gh secret set VPS_KNOWN_HOSTS --env production --repo kloudja/o-meu-mes
```

**GitHub no navegador**, para o secret privado: abrir o repositório → **Settings → Environments → production → Environment secrets → Add secret**. Nome: `VPS_DEPLOY_KEY`. No Bitwarden, copiar o campo **Private key / Chave privada** do item `O meu mês — GitHub Actions — VPS` e colá-lo diretamente no valor do secret, incluindo as linhas de início e fim OpenSSH. Guardar o secret. Não colocar a chave no chat, em comandos, no repositório ou num ficheiro local. [Secrets de ambiente no GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#creating-secrets-for-an-environment).

Configurar os secrets depois do bootstrap abaixo ou aceitar que a primeira tentativa de deploy fique recusada. Não colocar as chaves de aplicação nem Brevo no build/Actions: ficam no VPS e no backup cifrado.

## 5. Bootstrap da primeira imagem aprovada

Depois do commit/push autorizado, acompanhar os checks. Não executar comandos de release com um SHA inventado nem uma imagem recompilada à parte. No primeiro arranque, descarregar a imagem do job `image` que passou nessa corrida. Se o job `deploy` falhar por falta de setup, isso é esperado e a manutenção permanece.

**Windows PowerShell**, substituir o número da corrida pelo observado em `gh run list`:

```powershell
gh run list --repo kloudja/o-meu-mes --workflow ci.yml --limit 5
$runId = Read-Host 'Número da corrida aprovada'
$releaseSha = gh run view $runId --repo kloudja/o-meu-mes --json headSha --jq .headSha
if ($LASTEXITCODE -ne 0 -or $releaseSha -cnotmatch '^[0-9a-f]{40}$') { throw 'Não foi possível obter o commit Git da corrida.' }
$artifactDir = Join-Path $env:TEMP "omeumes-release-$runId"
gh run download $runId --repo kloudja/o-meu-mes --name "linux-image-$releaseSha" --dir $artifactDir
if ($LASTEXITCODE -ne 0) { throw 'Download falhou; não continuar.' }
Get-FileHash (Join-Path $artifactDir 'image.tar.gz') -Algorithm SHA256
scp (Join-Path $artifactDir 'image.tar.gz') omeumes-admin@82.108.206.102:~/omeumes-first-image.tar.gz
if ($LASTEXITCODE -ne 0) { throw 'Transferência falhou; não continuar no VPS.' }
Write-Output $releaseSha
```

**Ubuntu, por SSH**, usar o **commit Git de 40 caracteres** impresso no último comando Windows; não usar o checksum SHA-256 do arquivo, que tem 64 caracteres. Conferir também esse checksum com o do Windows. O bloco usa uma subshell para uma entrada inválida não fechar a sessão SSH:

```bash
(
set -euo pipefail
read -r -p 'Commit Git aprovado (40 caracteres, não o checksum do arquivo): ' release_sha
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Commit Git inválido.' >&2; exit 1; }
sha256sum ~/omeumes-first-image.tar.gz
gzip -dc ~/omeumes-first-image.tar.gz | sudo docker load
image_id=$(sudo docker image inspect "omeumes:$release_sha" --format '{{.Id}}')
printf '%s\n' "$image_id"
printf 'OMEUMES_IMAGE=%s\n' "$image_id" | sudo tee /etc/omeumes/release.env >/dev/null
sudo chmod 0600 /etc/omeumes/release.env
sudo docker compose --env-file /etc/omeumes/release.env -f /opt/omeumes/compose.yaml config --quiet
sudo docker compose --env-file /etc/omeumes/release.env -f /opt/omeumes/compose.yaml run --rm --no-deps -T app node scripts/hosted.mjs init
curl -I https://omeumes.pt
)
```

`init` cria esquema completo vazio e autoridade independente, sem contas, categorias, meses, movimentos ou utilizadores. Não é uma migração da base Windows. Repetir `init` recusa substituir os ficheiros. Não usar `OMEUMES_TEST_TRANSITION` nem fixtures em produção. Se houver falha parcial, preservar os ficheiros e investigar; não apagar/reinicializar uma base para ultrapassar o erro.

Depois de instalar os secrets, autorizar a repetição do job `deploy` dessa corrida (interface Actions → Re-run failed jobs, ou `gh run rerun $runId --failed --repo kloudja/o-meu-mes`). O helper mantém 503, para a instância, guarda o par base/autoridade e configuração, executa `prepare`, inicia a imagem e testa prontidão. Só depois ativa a rota da aplicação. A prontidão exige SQLite íntegra/esquema exato, escrita disponível, autoridade e chave corretas, base fora de quarentena, Next a responder e worker com ciclo concluído. Não prova entrega Brevo nem substitui o ensaio no navegador.

### 5.1. Falha após «Loaded image»: IDs de Docker clássico e containerd

Se o arquivo tem o SHA-256 esperado mas o deployment termina imediatamente depois de `Loaded image`, a versão antiga do helper pode estar a comparar um digest de configuração do runner com um digest de manifesto do VPS. O bootstrap pode estar concluído e o 503 continuar a ser a manutenção prevista. Não repetir `init`, não trocar a base, não alterar os hashes da pipeline nem desativar a conferência do arquivo.

A correção tem de ser instalada no **host**, porque uma imagem nova não substitui os scripts root-owned. Os comandos seguintes atualizam apenas os dois helpers e guardam a versão anterior do script. Usar a autenticação SSH pessoal já funcional; se exige uma opção `-i`, aplicá-la também a `scp`.

**Ubuntu, na sessão pessoal:**

```bash
mkdir -p ~/omeumes-image-identity-fix
```

**Windows PowerShell, na raiz deste projeto:**

```powershell
scp .\deploy\omeumes-deploy.sh .\deploy\image-identity.py omeumes-admin@82.108.206.102:~/omeumes-image-identity-fix/
if ($LASTEXITCODE -ne 0) { throw 'Transferência falhou; não continuar no VPS.' }
```

**Ubuntu, depois da transferência bem-sucedida:**

```bash
(
  set -euo pipefail
  cd ~/omeumes-image-identity-fix
  bash -n omeumes-deploy.sh
  printf '%s  %s\n' \
    8b07025b4365a5756c55c85484ab86598de1aa59d88cdccef8c20de9827a5e44 \
    "$HOME/omeumes-first-image.tar.gz" | sha256sum --check
  python3 image-identity.py \
    ~/omeumes-first-image.tar.gz \
    omeumes:42741b568413c5a0859fd1fa4a9655b24b4ffd44 \
    sha256:be1247b87250b8eab7c271b4c604d28005e5d66c50f0c0d271c704f00abdb57f \
    "$(sudo docker image inspect omeumes:42741b568413c5a0859fd1fa4a9655b24b4ffd44 --format '{{.Id}}')"
  sudo cp -an /usr/local/sbin/omeumes-deploy /usr/local/sbin/omeumes-deploy.before-image-identity
  sudo install -o root -g root -m 0755 image-identity.py /usr/local/libexec/omeumes-image-identity.py
  sudo install -o root -g root -m 0755 omeumes-deploy.sh /usr/local/sbin/omeumes-deploy
)
```

O exemplo de verificação usa a release e o arquivo observados nesta instalação; para outra release, usar a respetiva etiqueta e ID da CI. O verificador lê metadados sem extrair ficheiros, confirma os seus SHA-256 e só admite os digests ligados à configuração linux/amd64 da etiqueta pedida. O script principal confere sempre o SHA-256 do arquivo antes de `docker load` e dessa verificação. Python 3 é necessário no host, tal como no bootstrap.

Depois desta atualização autorizada, repetir **apenas o job falhado** da mesma corrida. A correção aceita os outputs antigos da CI; não é necessário reconstruir a imagem para esta corrida. Não executar `init` novamente. Uma nova falha de identidade apresenta os IDs recebido/carregado e as identidades verificadas antes de alterar a rota, parar a aplicação ou executar `prepare`.

Para desfazer só a atualização do host, reinstalar a cópia `omeumes-deploy.before-image-identity` em `/usr/local/sbin/omeumes-deploy` com proprietário root e modo 0755. O helper Python novo pode ficar sem uso. Isto não repõe dados, imagens, rotas ou configuração de aplicação.

Referências: [armazenamento containerd do Docker](https://docs.docker.com/engine/storage/containerd/) e [implementação de inspeção no Moby](https://github.com/moby/moby/blob/master/daemon/containerd/image_inspect.go).

### 5.2. Histórico da incompatibilidade da proteção HTTP adicional

A configuração inicial usava `basic_auth`, nome que o Caddy anterior a 2.8 não reconhecia. A correção anterior usou a grafia antiga e corrigiu o rollback para só anunciar sucesso depois de validar e ativar a rota. Esta proteção adicional foi entretanto retirada do fluxo a pedido do utilizador; não voltar a configurar credenciais Caddy. Para atualizar uma instalação que ainda a utiliza, seguir a secção 5.4.

O rollback continua a exigir prontidão, validação e reload para anunciar retoma. Se a rota da aplicação falhar, tenta manutenção; se a própria manutenção falhar, informa essa falha. A manutenção temporária durante deployment e backup mantém-se.

### 5.3. Credenciais aceites mas página 404

Antes de remover a proteção HTTP adicional, o Brave no perfil normal não apresentou o pedido de credenciais; a janela anónima apresentou-o. A remoção dessa proteção elimina a dependência desse diálogo. A aplicação apresenta agora o seu próprio formulário.

O 404 depois das credenciais era uma falha da aplicação: `src/app/page.tsx` usava `localAccess`, que só aceita localhost/127.0.0.1. A página passa a usar `applicationAccess` com o Host exato de `OMEUMES_AUTH_ORIGIN`, incluindo a porta. Sem origem configurada mantém a regra local; origens inválidas e domínios diferentes continuam recusados. Os cabeçalhos forwarded não concedem acesso. A regra de escrita local não foi alterada, e as APIs mantêm os seus controlos de origem e sessão.

O [Next.js pode devolver HTTP 200 quando mostra uma página not-found depois de começar o streaming](https://nextjs.org/docs/app/api-reference/file-conventions/not-found). Por isso, o `curl` que apenas imprime o estado não chega para aceitar a página. A prontidão desta revisão exige a estrutura HTML da aplicação, além da API de identidade. O teste da imagem exige também CSS e JavaScript acessíveis. O teste de navegador usa o domínio HTTPS sintético configurado e confirma o formulário Entrar após recarga, sem contactar o VPS ou fornecedores externos.

Esta correção é código da aplicação e da imagem. Depois de revisão e commit/push autorizados, deixar a CI construir, verificar e fazer deployment da nova imagem. Não executar `init`, não voltar a copiar a imagem à mão e não reinstalar os helpers do host por causa desta correção. Depois do deployment, confirmar no navegador autenticado que aparece o formulário **Entrar**, sem aceitar apenas o estado verde da corrida antiga.

### 5.4. Remover a conta HTTP adicional de uma instalação existente

Esta operação foi expressamente pedida pelo utilizador. O formulário de login/registo fica acessível diretamente; a autenticação e autorização dos dados continuam na aplicação. O exemplo do repositório já não inclui a conta `verificacao`.

Uma imagem nova não altera os ficheiros Caddy root-owned. É necessário atualizar tanto `/etc/omeumes/route-app.caddy`, que os deployments voltam a instalar, como `/etc/caddy/omeumes-route.caddy`, a rota ativa. O bloco seguinte corre na sessão SSH pessoal do VPS, serializa com deployments/backups, guarda ambas as versões anteriores e restaura-as se houver falha. Não altera a base, as chaves da aplicação ou as contas.

```bash
sudo bash <<'BASH'
set -Eeuo pipefail
exec 9>/run/lock/omeumes-deployment.lock
flock -n 9 || { echo 'Another deployment/backup is running.' >&2; exit 1; }
backup=$(mktemp -d /etc/omeumes/before-remove-access-gate-XXXXXX)
cp -a /etc/omeumes/route-app.caddy "$backup/app.caddy"
cp -a /etc/caddy/omeumes-route.caddy "$backup/active.caddy"
restore() {
  trap - ERR
  install -o root -g caddy -m 0640 "$backup/app.caddy" /etc/omeumes/route-app.caddy
  install -o root -g caddy -m 0640 "$backup/active.caddy" /etc/caddy/omeumes-route.caddy
  if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then systemctl reload caddy || true; fi
  echo "Failed; previous routes restored from $backup" >&2
  exit 1
}
trap restore ERR
cat > "$backup/new.caddy" <<'CADDY'
# Application sign-in and permissions are enforced by the application.
header Cache-Control "private, no-store"
reverse_proxy 127.0.0.1:3000 {
    # Sessions use cookies; do not forward stale browser Basic credentials.
    header_up -Authorization
}
CADDY
install -o root -g caddy -m 0640 "$backup/new.caddy" /etc/omeumes/route-app.caddy
install -o root -g caddy -m 0640 "$backup/new.caddy" /etc/caddy/omeumes-route.caddy
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
echo "Extra access gate removed. Backups: $backup"
BASH
```

Depois da mensagem de sucesso, abrir `https://omeumes.pt/` sem credenciais HTTP: deve mostrar o formulário Entrar, com HTTP 200. Sem sessão pessoal, `/api/spaces` e as APIs financeiras continuam a devolver 401/403. Se a operação falhar, conservar a pasta de backup impressa e investigar o erro antes de repetir.

Para uma reversão explícita, usar os dois ficheiros `app.caddy` e `active.caddy` da pasta de backup guardada, repondo cada um no caminho correspondente com root:caddy e 0640, validar o Caddyfile e só então recarregar o serviço. Isso volta a ativar a proteção anterior se ela existia nessa cópia. Não voltar a executar o bootstrap ou `init`.

## 6. Validação depois do primeiro deployment

Em 24/11/2026, o novo push `3fce0bf` passou Windows, Linux, imagem e deployment. A remoção posterior da proteção HTTP adicional foi verificada com formulário público e APIs protegidas. Os percursos autenticados abaixo e o backup/restauro real ainda não foram comprovados nesta instalação. Não repetir a configuração inicial para os executar.

A evidência antiga de prontidão verificava a API e não validava o formulário pelo domínio público. A nova imagem e a inspeção do formulário no VPS cobrem essa lacuna. A conservação de um movimento feito no navegador entre dois deployments ainda exige o percurso específico abaixo.

1. **Acesso da aplicação:** obter HTTP 200 e o formulário Entrar sem credenciais Caddy. Sem sessão da aplicação, as APIs financeiras devem recusar o acesso. Verificar cookie `__Host-omeumes` Secure/HttpOnly, registar uma conta controlada de teste, confirmar o email real Brevo e criar um espaço vazio. Usar apenas nomes/valores sintéticos. Criar banco fictício com saldo 100,00 €, despesa prevista 12,34 € e pagar 12,34 €. Recarregar: uma despesa e saldo 87,66 €. Consultar `/etc/omeumes/deployed` para confirmar SHA e ID escritos pelo deployment; registar resultado de `compose exec -T app node scripts/healthcheck.mjs`, screenshot sem segredos e entrega do email. Não guardar palavras-passe ou tokens no relatório público.
2. **Segundo push automático:** após autorização específica, fazer uma alteração inócua revista na documentação, commit/push para `master` e acompanhar a corrida. Não fazer deployment manual. Confirmar novo SHA e ID no host. Entrar/recarregar e confirmar a mesma despesa única de 12,34 € e saldo 87,66 €. A pasta de dados e as chaves não mudam.
3. **CI falhada:** após autorização, executar o exercício controlado abaixo. Ele corre os checks e falha deliberadamente o job Linux; `image` e `deploy` devem ficar skipped. Confirmar o mesmo `/etc/omeumes/deployed`, contentor e movimento. Esta é uma falha induzida da pipeline, registada como tal; não altera código do produto.

   **Windows PowerShell:** `gh workflow run ci.yml --ref master -f verify_failure_gate=true --repo kloudja/o-meu-mes`

4. **Backup fora do servidor e restauro:** preparar o destinatário age abaixo; criar backup depois do movimento, descarregar, conferir o hash e conservar o ficheiro original fora do VPS. Durante o exercício, manter acesso restrito e não efetuar outras alterações de identidades/permissões/privacidade. Restaurar a cópia descarregada, não a cópia que ficou no VPS. Confirmar novamente saldo 87,66 €, um movimento e integridade. Registar tempos, ponto de recuperação e hashes. Ver distinção entre o ensaio sintético e recuperação com dados reais abaixo.

## 7. Backup cifrado fora do VPS

Instalar `age` no computador de custódia a partir das [releases oficiais](https://github.com/FiloSottile/age/releases), verificar a checksum da release e colocar `age.exe`/`age-keygen.exe` no PATH. Gerar a identidade **no computador de custódia**, conservar a chave privada em cofre e ter uma cópia recuperável separada do VPS. Não a enviar ao GitHub, ao VPS nem ao chat.

**Windows PowerShell:**

```powershell
$backupRoot = Join-Path $env:USERPROFILE 'O meu mes backups privados'
New-Item -ItemType Directory -Force $backupRoot | Out-Null
age-keygen -o (Join-Path $backupRoot 'recovery-identity.txt')
age-keygen -y (Join-Path $backupRoot 'recovery-identity.txt') | Set-Content -Encoding ascii (Join-Path $backupRoot 'recipients.txt')
scp (Join-Path $backupRoot 'recipients.txt') omeumes-admin@82.108.206.102:~/omeumes-backup-recipients.txt
```

**Ubuntu, por SSH:**

```bash
sudo apt-get update
sudo apt-get install -y age
sudo install -o root -g root -m 0600 ~/omeumes-backup-recipients.txt /etc/omeumes/backup-recipients.txt
sudo /usr/local/sbin/omeumes-backup
```

O script serializa com deployments, exporta a imagem exata, coloca manutenção, para aplicação e jobs, cifra o par SQLite/autoridade, as chaves/configuração e `image.tar`, retoma a imagem e só repõe a rota anterior depois da prontidão. O backup inclui WAL; não copiar só o `.sqlite` de uma instância ativa. A imagem também vai no arquivo cifrado para permitir recuperação sem depender dos sete dias de retenção do artefacto GitHub. Não se agenda nem se elimina backup por iniciativa desta entrega. Antes de dados reais, definir frequência, alertas, retenção/expiração de todas as réplicas e ponto máximo aceitável de perda. Os snapshots pré-deploy em root também contêm dados e segredos; não os publicar. Manter pelo menos a imagem anterior enquanto houver backups que dela dependam; não executar `docker system prune -a` indiscriminadamente.

O script imprime nome e SHA-256 do arquivo cifrado. **Ubuntu**, disponibilizar só esse arquivo ao administrador pessoal, substituindo o nome pelo impresso:

```bash
read -r -p 'Nome do arquivo offsite (sem diretórios): ' backup_name
[[ "$backup_name" =~ ^offsite-[0-9]{8}T[0-9]{6}Z\.tar\.gz\.age$ ]] || exit 1
sudo install -o omeumes-admin -g omeumes-admin -m 0600 "/var/backups/omeumes/$backup_name" "/home/omeumes-admin/$backup_name"
```

**Windows PowerShell:**

```powershell
$backupName = Read-Host 'Nome do arquivo offsite impresso pelo VPS'
scp "omeumes-admin@82.108.206.102:~/$backupName" $backupRoot
Get-FileHash (Join-Path $backupRoot $backupName) -Algorithm SHA256
```

Comparar com o SHA-256 impresso no VPS e conservar hash/data/SHA da release num registo off-server. Copiar apenas o ficheiro cifrado não confirma que se conhece a chave de recuperação; o ensaio de desencriptação é obrigatório.

### Exercício de restauro integral, exclusivamente com dados sintéticos

**Windows PowerShell**, desencriptar para uma pasta privada fora do projeto; a ferramenta recusa substituir um destino existente:

```powershell
$restoredArchive = Join-Path $backupRoot ('restore-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.tar.gz')
age --decrypt -i (Join-Path $backupRoot 'recovery-identity.txt') -o $restoredArchive (Join-Path $backupRoot $backupName)
scp $restoredArchive omeumes-admin@82.108.206.102:~/omeumes-synthetic-restore.tar.gz
```

**Ubuntu, por SSH**, com autorização explícita para interromper o serviço sintético. O original é preservado num destino novo; não reutilizar nomes. A cópia deve ter sido feita sem alterações posteriores de credenciais, permissões ou privacidade. Se isso não for demonstrável, conservar manutenção e usar reconciliação.

```bash
sudo -i
exec 9>/run/lock/omeumes-deployment.lock
flock -n 9 || exit 1
stamp=$(date -u +%Y%m%dT%H%M%SZ)
restore_dir="/var/tmp/omeumes-restore-$stamp"
install -d -m 0700 "$restore_dir"
tar -tzf /home/omeumes-admin/omeumes-synthetic-restore.tar.gz
# Conferir só image.tar, var/lib/omeumes e etc/omeumes/{app.env,release.env}; depois:
tar -xzf /home/omeumes-admin/omeumes-synthetic-restore.tar.gz -C "$restore_dir"
docker image load -i "$restore_dir/image.tar"
install -o root -g caddy -m 0640 /etc/omeumes/route-maintenance.caddy /etc/caddy/omeumes-route.caddy
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
docker compose --env-file /etc/omeumes/release.env -f /opt/omeumes/compose.yaml stop app
cp -a /etc/omeumes/app.env "/etc/omeumes/app.env.before-restore-$stamp"
cp -a /etc/omeumes/release.env "/etc/omeumes/release.env.before-restore-$stamp"
mv /var/lib/omeumes "/var/lib/omeumes.before-restore-$stamp"
cp -a "$restore_dir/var/lib/omeumes" /var/lib/omeumes
install -m 0600 "$restore_dir/etc/omeumes/app.env" /etc/omeumes/app.env
install -m 0600 "$restore_dir/etc/omeumes/release.env" /etc/omeumes/release.env
docker compose --env-file /etc/omeumes/release.env -f /opt/omeumes/compose.yaml run --rm --no-deps -T app node scripts/hosted.mjs check
docker compose --env-file /etc/omeumes/release.env -f /opt/omeumes/compose.yaml up -d --no-build app
```

Repetir `docker compose --env-file /etc/omeumes/release.env -f /opt/omeumes/compose.yaml exec -T app node scripts/healthcheck.mjs` até devolver 0. Só então:

```bash
install -o root -g caddy -m 0640 /etc/omeumes/route-app.caddy /etc/caddy/omeumes-route.caddy
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
exit
```

Reautenticar na aplicação e conferir a despesa, saldo, contagens e recusa das APIs financeiras sem sessão. O formulário de acesso deve estar disponível sem palavra-passe Caddy adicional. Preservar o estado anterior, arquivo cifrado e evidência até concluir a revisão. As cópias desencriptadas contêm segredos e devem ser eliminadas segundo o procedimento de custódia aprovado, após a validação.

## 8. Migração, rollback e recuperação com dados reais

Antes de cada `prepare`, o helper para a aplicação e guarda snapshot **conjunto**, com WAL/autoridade/configuração, fora do volume. Não inicia a base alojada se estiver ausente: a criação é sempre `init` explícito. A versão atual é v9; bases Windows antigas não são aceites como atalho de alojamento. Não existem migrações de downgrade.

Se o candidato falhar, o helper compara a versão real da base com a versão da imagem anterior. Se coincidem, volta à imagem anterior e testa prontidão, sem restaurar dados. Se diferem ou a base está indisponível, conserva manutenção. Não repõe automaticamente um snapshot: isso poderia perder gravações ou ressuscitar acessos/nomes apagados. O SHA/ID da última release bem-sucedida permanece em `/etc/omeumes/deployed`.

Para rollback manual **compatível**, parar primeiro o candidato, verificar o esquema com a imagem anterior e alterar só `/etc/omeumes/release.env` para a referência antiga já validada. Executar `check`, `up -d --no-build`, prontidão e só depois repor a rota. Se o esquema mudou, escolher a imagem correspondente ao snapshot; uma imagem antiga sobre a base nova não é um rollback seguro.

Uma cópia autónoma criada por `hosted.mjs backup` fica em quarentena. O restauro normal usa a **autoridade atual independente**, chaves originais e um destino novo. Com a aplicação parada e manutenção ativa, por exemplo:

```bash
sudo docker compose --env-file /etc/omeumes/release.env -f /opt/omeumes/compose.yaml run --rm --no-deps -T app node scripts/hosted-recover.mjs /state/import/backup.sqlite /state/database/recovered-UNIQUE.sqlite
```

O comando recusa substituir ficheiros e só liberta a cópia após reconciliação das revogações, redações, encerramentos e chaves idempotentes. Depois do sucesso, editar **apenas** `OMEUMES_DB_PATH` em `/etc/omeumes/app.env` para o destino impresso, executar `check`, arrancar e verificar prontidão. A autoridade passa para o novo caminho; a base anterior permanece preservada e já não pode ser usada como se fosse a ativa. As sessões são invalidadas: voltar a entrar. Falta de autoridade atual, chave errada, credenciais incompatíveis ou backup fora da retenção mantém a recuperação bloqueada.

Um snapshot integral antigo contém uma autoridade antiga genuína: um HMAC válido não prova atualidade. Não aplicar o exercício integral sintético a dados reais sem verificar o ponto mais recente por registo independente e reconciliar tudo o que ocorreu depois. Na perda total da autoridade atual, conservar manutenção e tratar como incidente; não libertar uma cópia apenas porque abre. A custódia de checkpoints atuais fora do servidor e o seu ensaio com o operador continuam condições para abertura pública.

## Referências técnicas

[Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [Node 24 SQLite/backup](https://nodejs.org/docs/latest-v24.x/api/sqlite.html), [GitHub: ambientes e concorrência](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments), [Docker: transportar a mesma imagem entre jobs](https://docs.docker.com/build/ci/github-actions/share-image-jobs/), [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) e [age](https://github.com/FiloSottile/age).
