param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('Diagnose','Elevate','Prepare','Configure','SetAddress','UndoAddress','Credential','Probe','Audit','Firewall','RemoveFirewall','Install','Run','Manual','Start','OpenTrial','Stop','Status','Disable','Enable')]
  [string]$Action,
  [string]$Address, [string]$InterfaceAlias = 'Wi-Fi', [string]$LocalName,
  [string]$DhcpStart, [string]$DhcpEnd, [string]$ExpectedGateway, [string]$ExpectedGatewayMac
)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -eq 'Desktop') {
  # Windows PowerShell must use its own signed Windows modules, even when launched by PowerShell 7.
  $env:PSModulePath = "$PSHOME\Modules;$env:windir\System32\WindowsPowerShell\v1.0\Modules;$env:ProgramFiles\WindowsPowerShell\Modules"
}
if ($Action -in @('Probe','Diagnose')) {
  [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
}
$configDir = Join-Path $env:LOCALAPPDATA 'O-meu-mes-rede'
$configFile = Join-Path $configDir 'casa.json'
$stopFile = Join-Path $configDir 'parar'
$task = 'O meu mes - Ensaio domestico'
# Keep the installed rule ID so the old port rule is replaced in place.
$ruleName = 'Omeumes-Home-HTTPS-8443'
$ruleDisplayName = 'O meu mes - HTTP domestico'
if ($Action -eq 'Elevate') {
  $command = '/d /c ""'+(Join-Path $PSScriptRoot 'Preparar-Rede.cmd')+'" --elevated"'
  $elevated = Start-Process -FilePath "$env:SystemRoot\System32\cmd.exe" -ArgumentList $command -Verb RunAs -WindowStyle Normal -PassThru -Wait
  exit $elevated.ExitCode
}
if ($Action -eq 'Diagnose') {
  $nic = Get-NetAdapter -Name $InterfaceAlias
  $ips = @(Get-NetIPAddress -InterfaceIndex $nic.ifIndex -AddressFamily IPv4 | Select-Object IPAddress,PrefixLength,PrefixOrigin,AddressState)
  $routes = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' | Select-Object InterfaceIndex,NextHop,RouteMetric)
  $gateways = foreach ($route in $routes) {
    $gateway = $route.NextHop
    & "$env:SystemRoot\System32\PING.EXE" -4 -n 1 -w 500 $gateway | Out-Null
    Get-NetNeighbor -InterfaceIndex $route.InterfaceIndex -IPAddress $gateway -ErrorAction SilentlyContinue |
      Select-Object IPAddress,LinkLayerAddress,@{n='State';e={[string]$_.State}}
  }
  [ordered]@{
    administrator=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    interfaceAlias=$nic.Name; guid=[string]$nic.InterfaceGuid; mac=$nic.MacAddress; status=[string]$nic.Status
    addresses=$ips; routes=$routes; gateways=@($gateways)
    profile=[string](Get-NetConnectionProfile -InterfaceIndex $nic.ifIndex).NetworkCategory
    configurationExists=(Test-Path -LiteralPath $configFile)
  } | ConvertTo-Json -Depth 5
  return
}
function Require-Admin {
  if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Abra o PowerShell como administrador, com a mesma conta Windows.'
  }
}
function Assert-Stopped {
  if (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3077 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Execute Stop e aguarde pelo encerramento do ensaio.'
  }
}
function Stop-Ensaio {
  New-Item -ItemType File -Path $stopFile -Force | Out-Null
  $deadline = (Get-Date).AddSeconds(25)
  do {
    $listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3077 -State Listen -ErrorAction SilentlyContinue
    $scheduled = Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
    if (-not $listener -and $scheduled.State -ne 'Running') { return }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  throw 'O ensaio ainda nao terminou. Consulte Status antes de voltar a iniciar.'
}
function Get-Link($aliasName, $localAddress) {
  $nic = Get-NetAdapter -Name $aliasName
  if ($nic.Status -ne 'Up') { throw 'Interface desligada.' }
  $pc = @(Get-NetIPAddress -InterfaceIndex $nic.ifIndex -AddressFamily IPv4 -AddressState Preferred | Where-Object IPAddress -eq $localAddress)
  $route = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' | Where-Object { $_.NextHop -ne '0.0.0.0' })
  if ($pc.Count -ne 1 -or $route.Count -ne 1 -or $route[0].ifIndex -ne $nic.ifIndex) { throw 'Endereco ou rota ambigua.' }
  $gateway = $route[0].NextHop
  $ping = New-Object Net.NetworkInformation.Ping
  try { $answered = $ping.Send($gateway,500).Status -eq 'Success' } finally { $ping.Dispose() }
  $neighbor = Get-NetNeighbor -InterfaceIndex $nic.ifIndex -IPAddress $gateway
  if (-not $answered -or
      $neighbor.State -in @('Unreachable','Incomplete') -or
      $neighbor.LinkLayerAddress -notmatch '^(?:[0-9A-F]{2}-){5}[0-9A-F]{2}$') { throw 'Gateway por confirmar.' }
  [pscustomobject]@{ guid = [string]$nic.InterfaceGuid; address = $localAddress; gateway = $gateway
    gatewayMac = $neighbor.LinkLayerAddress; index = $nic.ifIndex; prefix = $pc[0].PrefixLength }
}
function Same-Subnet($first, $second, $prefix) {
  $a = [Net.IPAddress]::Parse($first).GetAddressBytes()
  $b = [Net.IPAddress]::Parse($second).GetAddressBytes()
  for ($i = 0; $i -lt $prefix; $i++) {
    $octet = [int][Math]::Floor($i / 8)
    $mask = 128 -shr ($i % 8)
    if (($a[$octet] -band $mask) -ne ($b[$octet] -band $mask)) { return $false }
  }
  return $true
}
function Home-Subnet($link) {
  if ($link.prefix -ne 24 -or -not (Same-Subnet $link.address $link.gateway 24)) { throw 'Sub-rede domestica /24 por confirmar.' }
  return ($link.address -replace '\.\d+$','.0/24')
}
function IPv4-Number($addressText) {
  $parsed = [Net.IPAddress]::Parse($addressText)
  if ($parsed.AddressFamily -ne 'InterNetwork' -or $parsed.ToString() -ne $addressText) { throw 'IPv4 invalido.' }
  $bytes = $parsed.GetAddressBytes()
  return [uint64]$bytes[0]*16777216 + [uint64]$bytes[1]*65536 + [uint64]$bytes[2]*256 + [uint64]$bytes[3]
}
function Restore-Dhcp($saved, $index) {
  Get-NetRoute -InterfaceIndex $index -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
    Where-Object { $_.NextHop -eq $saved.gateway -and $_.Protocol -eq 'NetMgmt' } | Remove-NetRoute -Confirm:$false
  Get-NetIPAddress -InterfaceIndex $index -AddressFamily IPv4 -IPAddress $saved.manualAddress -ErrorAction SilentlyContinue | Remove-NetIPAddress -Confirm:$false
  Set-NetIPInterface -InterfaceIndex $index -AddressFamily IPv4 -Dhcp Enabled
  if ($saved.staticDns) { Set-DnsClientServerAddress -InterfaceIndex $index -ServerAddresses @($saved.dns) }
  else { Set-DnsClientServerAddress -InterfaceIndex $index -ResetServerAddresses }
}
function Write-PrivateDirectory {
  New-Item -ItemType Directory -Force -Path $configDir | Out-Null
  $acl = Get-Acl -LiteralPath $configDir
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($ace in $acl.Access) { $acl.RemoveAccessRuleSpecific($ace) }
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
  Set-Acl -LiteralPath $configDir -AclObject $acl
}
if ($Action -eq 'Prepare') {
  Require-Admin
  Assert-Stopped
  if (Test-Path -LiteralPath $configFile) { throw 'Ja existe configuracao nesta sessao. Use SetAddress ou confira primeiro Rede.ps1 Status.' }
  $nic = Get-NetAdapter -Name $InterfaceAlias
  $current = @(Get-NetIPAddress -InterfaceIndex $nic.ifIndex -AddressFamily IPv4 -AddressState Preferred | Where-Object PrefixOrigin -eq 'Dhcp')
  if ($current.Count -ne 1) { throw 'Nao foi possivel identificar um unico IPv4 DHCP no PC.' }
  $observed = Get-Link $InterfaceAlias $current[0].IPAddress
  if ($observed.gateway -ne $ExpectedGateway -or $observed.gatewayMac -ne $ExpectedGatewayMac) { throw 'O gateway observado nao corresponde ao que foi identificado em casa. Nenhuma configuracao IP foi alterada.' }
  & $PSCommandPath Configure -Address $current[0].IPAddress -InterfaceAlias $InterfaceAlias
  & $PSCommandPath SetAddress -Address $Address -DhcpStart $DhcpStart -DhcpEnd $DhcpEnd
  return
}
if ($Action -eq 'Configure') {
  Assert-Stopped
  $null = IPv4-Number $Address
  if ($Address -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)') { throw 'Indique um IPv4 privado.' }
  if ($LocalName -and $LocalName -cnotmatch '^[a-z0-9-]+(?:\.[a-z0-9-]+)+$') { throw 'Nome DNS local invalido.' }
  $link = Get-Link $InterfaceAlias $Address
  $null = Home-Subnet $link
  Write-PrivateDirectory
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  $nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
  if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Node.js nao foi encontrado. Use o mesmo Node.js 24 de Iniciar.cmd.' }
  [ordered]@{
    name = $LocalName; address = $Address; interfaceAlias = $InterfaceAlias; interfaceGuid = $link.guid
    networkName = [string](Get-NetConnectionProfile -InterfaceIndex $link.index).Name
    gateway = $link.gateway; gatewayMac = $link.gatewayMac; node = $nodePath
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $configFile -Encoding UTF8
  Write-Output "Configuracao em $configFile. Confirme os enderecos no router antes de ativar."
  return
}
$cfg = Get-Content -Raw -Encoding UTF8 -LiteralPath $configFile | ConvertFrom-Json
if ($Action -eq 'Probe' -and $Address) { $cfg.address = $Address }
$siteName = if ($cfg.name) { $cfg.name } else { $cfg.address }
switch ($Action) {
  'SetAddress' {
    Require-Admin
    Assert-Stopped
    $link = Get-Link $cfg.interfaceAlias $cfg.address
    if ($link.guid -ne $cfg.interfaceGuid -or $link.gateway -ne $cfg.gateway -or $link.gatewayMac -ne $cfg.gatewayMac) { throw 'Rede nao reconhecida.' }
    $number = IPv4-Number $Address
    $first = IPv4-Number $DhcpStart
    $last = IPv4-Number $DhcpEnd
    if ($link.prefix -ne 24 -or -not (Same-Subnet $Address $cfg.address 24) -or
      -not (Same-Subnet $DhcpStart $cfg.address 24) -or -not (Same-Subnet $DhcpEnd $cfg.address 24) -or
      $first -gt $last -or ($number -ge $first -and $number -le $last) -or
      $Address -eq $cfg.gateway -or $Address -match '\.(0|255)$') { throw 'O IPv4 manual deve estar livre e fora do intervalo DHCP confirmado.' }
    $ipInterface = Get-NetIPInterface -InterfaceIndex $link.index -AddressFamily IPv4
    if ($ipInterface.Dhcp -ne 'Enabled') { throw 'Este percurso espera DHCP ativo no PC. Confira o estado antes de substituir uma configuracao manual.' }
    $neighbor = Get-NetNeighbor -InterfaceIndex $link.index -IPAddress $Address -ErrorAction SilentlyContinue
    $ping = New-Object Net.NetworkInformation.Ping
    try { $occupied = $ping.Send($Address,500).Status -eq 'Success' } finally { $ping.Dispose() }
    if ($occupied -or ($neighbor -and $neighbor.State -notin @('Unreachable','Incomplete') -and $neighbor.LinkLayerAddress -ne '00-00-00-00-00-00')) { throw 'O endereco parece estar ocupado. Foi mantido o DHCP do PC.' }
    $savedFile = Join-Path $configDir 'rede-anterior.json'
    if (Test-Path -LiteralPath $savedFile) { throw 'Ja existe uma configuracao anterior guardada. Use UndoAddress ou confira-a antes de voltar a mudar.' }
    $registry = Get-ItemProperty -LiteralPath ("HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\"+$cfg.interfaceGuid)
    $saved = [pscustomobject]@{ guid=$cfg.interfaceGuid; address=$cfg.address; manualAddress=$Address; gateway=$cfg.gateway;
      profile=[string](Get-NetConnectionProfile -InterfaceIndex $link.index).NetworkCategory;
      dns=@((Get-DnsClientServerAddress -InterfaceIndex $link.index -AddressFamily IPv4).ServerAddresses); staticDns=[bool]$registry.NameServer }
    $saved | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $savedFile -Encoding UTF8
    Remove-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    try {
      Set-NetIPInterface -InterfaceIndex $link.index -AddressFamily IPv4 -Dhcp Disabled
      Get-NetRoute -InterfaceIndex $link.index -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
        Where-Object NextHop -eq $cfg.gateway | Remove-NetRoute -Confirm:$false
      Get-NetIPAddress -InterfaceIndex $link.index -AddressFamily IPv4 -IPAddress $cfg.address -ErrorAction SilentlyContinue | Remove-NetIPAddress -Confirm:$false
      New-NetIPAddress -InterfaceIndex $link.index -AddressFamily IPv4 -IPAddress $Address -PrefixLength 24 -DefaultGateway $cfg.gateway | Out-Null
      Set-DnsClientServerAddress -InterfaceIndex $link.index -ServerAddresses $cfg.gateway
      for ($i=0; $i -lt 30; $i++) {
        $newIp = Get-NetIPAddress -InterfaceIndex $link.index -AddressFamily IPv4 -IPAddress $Address
        if ($newIp.AddressState -eq 'Preferred') { break }
        if ($newIp.AddressState -eq 'Duplicate') { throw 'O Windows detetou um endereco duplicado.' }
        Start-Sleep -Milliseconds 250
      }
      $observed = Get-Link $cfg.interfaceAlias $Address
      if ($observed.guid -ne $cfg.interfaceGuid -or $observed.gatewayMac -ne $cfg.gatewayMac) { throw 'Nao foi possivel confirmar o gateway depois da mudanca.' }
      Set-NetConnectionProfile -InterfaceIndex $link.index -NetworkCategory Private
    } catch {
      Restore-Dhcp $saved $link.index
      throw 'Nao foi possivel confirmar o IPv4 manual. O DHCP foi reativado. Confira o endereco atual do PC antes de voltar a configurar.'
    }
    $cfg.address = $Address
    $cfg | Add-Member -NotePropertyName networkName -NotePropertyValue ([string](Get-NetConnectionProfile -InterfaceIndex $link.index).Name) -Force
    $cfg | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $configFile -Encoding UTF8
    & $PSCommandPath Firewall
    Write-Output "PC configurado em http://${Address}:8443/. Falta definir a credencial pessoal."
  }
  'UndoAddress' {
    Require-Admin
    Assert-Stopped
    $saved = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $configDir 'rede-anterior.json') | ConvertFrom-Json
    $link = Get-Link $cfg.interfaceAlias $cfg.address
    if ($link.guid -ne $saved.guid -or $link.gatewayMac -ne $cfg.gatewayMac) { throw 'Rede nao reconhecida. Nao foi alterada a configuracao IP.' }
    Remove-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    Restore-Dhcp $saved $link.index
    Set-NetConnectionProfile -InterfaceIndex $link.index -NetworkCategory $saved.profile
    $cfg.address = $saved.address
    $cfg | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $configFile -Encoding UTF8
    Write-Output 'DHCP reativado e regra removida. Confira o IPv4 recebido. O modo domestico precisa de nova configuracao antes de voltar a aceitar ligacoes.'
  }
  'Probe' {
    try {
      $link = Get-Link $cfg.interfaceAlias $cfg.address
      $subnet = Home-Subnet $link
      $maskForm = $subnet.Replace('/24','/255.255.255.0')
      $profile = Get-NetConnectionProfile -InterfaceIndex $link.index
      $fw = Get-NetFirewallProfile -Name Private -PolicyStore ActiveStore
      $rule = Get-NetFirewallRule -Name $ruleName -PolicyStore ActiveStore
      $addresses = $rule | Get-NetFirewallAddressFilter
      $ports = $rule | Get-NetFirewallPortFilter
      $iface = $rule | Get-NetFirewallInterfaceFilter
      $app = $rule | Get-NetFirewallApplicationFilter
      $firewall = $fw.Enabled -eq 'True' -and $fw.DefaultInboundAction -eq 'Block' -and
        $rule.Enabled -eq 'True' -and $rule.Profile -eq 'Private' -and $rule.Direction -eq 'Inbound' -and
        $rule.Action -eq 'Allow' -and $rule.EdgeTraversalPolicy -eq 'Block' -and $ports.Protocol -eq 'TCP' -and
        $ports.LocalPort -eq '8443' -and $iface.InterfaceAlias -eq $cfg.interfaceAlias -and
        $app.Program -eq $cfg.node -and @($addresses.LocalAddress).Count -eq 1 -and $addresses.LocalAddress -eq $cfg.address -and
        @($addresses.RemoteAddress).Count -eq 1 -and [string]$addresses.RemoteAddress -in @($subnet,$maskForm)
      @{ profile = [string]$profile.NetworkCategory; networkName = [string]$profile.Name; firewall = [bool]$firewall; guid = $link.guid;
        address = $link.address; gateway = $link.gateway; gatewayMac = $link.gatewayMac; prefix = $link.prefix } | ConvertTo-Json -Compress
    } catch { '{}' }
  }
  'Audit' {
    Get-NetFirewallProfile -PolicyStore ActiveStore | Format-Table Name,Enabled,DefaultInboundAction
    Get-NetTCPConnection -State Listen | Where-Object LocalPort -in @(8443,3076,3077) | Format-Table LocalAddress,LocalPort,OwningProcess
    Get-NetFirewallRule -PolicyStore ActiveStore -Direction Inbound -Enabled True -Action Allow | ForEach-Object {
      $app = $_ | Get-NetFirewallApplicationFilter
      $port = $_ | Get-NetFirewallPortFilter
      if ($app.Program -eq $cfg.node -or $port.LocalPort -contains '8443' -or ($app.Program -eq 'Any' -and $port.LocalPort -contains 'Any')) {
        [pscustomobject]@{ Name=$_.Name; Profile=$_.Profile; Program=$app.Program; Port=$port.LocalPort }
      }
    } | Format-Table -AutoSize
  }
  'Firewall' {
    Require-Admin
    Assert-Stopped
    $link = Get-Link $cfg.interfaceAlias $cfg.address
    if ($link.guid -ne $cfg.interfaceGuid -or $link.gateway -ne $cfg.gateway -or $link.gatewayMac -ne $cfg.gatewayMac) { throw 'Rede nao reconhecida.' }
    $profile = Get-NetConnectionProfile -InterfaceIndex $link.index
    if ($profile.NetworkCategory -ne 'Private' -or $profile.Name -ne $cfg.networkName) { throw 'Perfil privado da rede de casa por confirmar.' }
    $subnet = Home-Subnet $link
    $filters = @{ Name=$ruleName; PolicyStore='PersistentStore'; Direction='Inbound'; Action='Allow'; Enabled='True';
      Profile='Private'; InterfaceAlias=$cfg.interfaceAlias; Program=$cfg.node; Protocol='TCP'; LocalPort=8443;
      LocalAddress=$cfg.address; RemoteAddress=$subnet; EdgeTraversalPolicy='Block' }
    if (Get-NetFirewallRule -Name $ruleName -PolicyStore PersistentStore -ErrorAction SilentlyContinue) {
      Set-NetFirewallRule @filters -NewDisplayName $ruleDisplayName
    } else {
      New-NetFirewallRule @filters -DisplayName $ruleDisplayName
    }
    Write-Output "Regra HTTP aplicada para $subnet na porta 8443."
  }
  'RemoveFirewall' { Require-Admin; Remove-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue }
  'Credential' {
    Assert-Stopped
    $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $secure = Read-Host 'Palavra-passe gerada no Bitwarden (20 a 256 caracteres)' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) | & $cfg.node (Join-Path $PSScriptRoot 'scripts\home-credential.mjs') (Join-Path $configDir 'credencial.json')
      if ($LASTEXITCODE -ne 0) { throw 'Falha ao substituir a credencial.' }
    } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  }
  'Run' {
    & $cfg.node (Join-Path $PSScriptRoot 'scripts\run-home.mjs')
    exit $LASTEXITCODE
  }
  'Manual' {
    Remove-Item -LiteralPath $stopFile -ErrorAction SilentlyContinue
    Write-Output 'Ensaio ficticio. Nesta janela, Ctrl+C para terminar. Estado e diagnostico em Rede.ps1 Status.'
    & $cfg.node (Join-Path $PSScriptRoot 'scripts\run-home.mjs')
    exit $LASTEXITCODE
  }
  'Install' {
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $command = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -WorkingDirectory $PSScriptRoot -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+$PSCommandPath+'" Run')
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $owner
    $trigger.Delay = 'PT30S'
    $principal = New-ScheduledTaskPrincipal -UserId $owner -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval ([TimeSpan]::FromMinutes(1))
    Register-ScheduledTask -TaskName $task -Action $command -Trigger $trigger -Principal $principal -Settings $settings -Force
  }
  'Start' {
    Remove-Item -LiteralPath $stopFile -ErrorAction SilentlyContinue
    Start-ScheduledTask -TaskName $task
  }
  'OpenTrial' {
    $url = 'http://127.0.0.1:3076/'
    if ((Get-ScheduledTask -TaskName $task).State -ne 'Running') {
      Remove-Item -LiteralPath $stopFile -ErrorAction SilentlyContinue
      Start-ScheduledTask -TaskName $task
    }
    $deadline = (Get-Date).AddSeconds(25)
    do {
      $page = $null
      try { $page = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 } catch {}
      if ($page.Content -match '<title>[^<]*Ensaio fict[^<]*</title>') {
        Start-Process $url
        return
      }
      Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    throw 'O ensaio nao respondeu. Execute Rede.ps1 Status para verificar o arranque.'
  }
  'Stop' { Stop-Ensaio }
  'Status' {
    Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue | Format-List TaskName,State
    Get-ScheduledTaskInfo -TaskName $task -ErrorAction SilentlyContinue | Format-List LastRunTime,LastTaskResult
    Get-Content -LiteralPath (Join-Path $configDir 'estado.txt') -Encoding UTF8 -ErrorAction SilentlyContinue
    Get-NetTCPConnection -State Listen | Where-Object LocalPort -in @(8443,3076,3077) | Format-Table LocalAddress,LocalPort,OwningProcess
  }
  'Disable' { Stop-Ensaio; Disable-ScheduledTask -TaskName $task }
  'Enable' { Enable-ScheduledTask -TaskName $task }
}
