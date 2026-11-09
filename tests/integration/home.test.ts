import { afterAll, beforeAll, expect, test } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, existsSync, mkdirSync } from 'node:fs';
import { request } from 'node:http';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { chromium } from '@playwright/test';
import { migrate } from '../../src/server/storage.mjs';
import { hashPassword, homeEntry } from '../../scripts/home-entry.mjs';
import { inHomeSubnet, networkLease } from '../../scripts/home-network.mjs';
import { lockDatabase } from '../../scripts/instance-lock.mjs';
import { seedTrial } from '../../scripts/trial-fixture.mjs';
import { calendarDate } from '../../src/domain/money';
import { balance, realized } from '../../src/domain/engine';

const period = calendarDate().slice(0,7);
const directory = mkdtempSync(join(tmpdir(), 'omeumes-test-home-'));
const db = join(directory, 'ficticio.sqlite');
const proof = randomUUID();
const password = randomUUID();
let origin: string, local: string, upstream: ChildProcess;
let entry: ReturnType<typeof homeEntry>;
let time = 1_000_000, allowed = true, enabled = true;
let diagnostic = '';
const pictures = 'docs/capturas/rede-domestica';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function availablePort() {
  const probe = createServer().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => probe.once('listening', resolve));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  return port;
}
beforeAll(async () => {
  const port = await availablePort();
  const entryPort = await availablePort();
  origin = `http://omeumes.test:${entryPort}`;
  local = `http://127.0.0.1:${port}`;
  migrate(db);
  upstream = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)], {
    env:{...process.env,OMEUMES_DB_PATH:db,OMEUMES_TEST_MODE:'1',OMEUMES_TRIAL:'1',OMEUMES_HOME_ORIGIN:origin,
      OMEUMES_HOME_ENTRY:proof,NEXT_TELEMETRY_DISABLED:'1'}, windowsHide:true,
  });
  upstream.stderr?.on('data', chunk => diagnostic += chunk);
  let ready = false;
  for (let i=0;i<100;i++) {
    try { if ((await fetch(local+'/api/state')).ok) { ready=true;break; } } catch {}
    if (upstream.exitCode!==null) break;
    await wait(100);
  }
  expect(ready, diagnostic).toBe(true);
  await seedTrial(local, period);
  entry = homeEntry({origin,upstream:port,proof,
    credential:await hashPassword(password), allowed:() => allowed, enabled:() => enabled, now:() => time});
  await new Promise<void>(resolve => entry.server.listen(entryPort,'127.0.0.1',resolve));
}, 25_000);
afterAll(async () => {
  entry?.invalidate();
  if(entry?.server.listening)await new Promise<void>(resolve=>entry.server.close(()=>resolve()));
  upstream?.kill();
});

function get(path:string, {method='GET',headers={},data=''}:{method?:string;headers?:Record<string,string>;data?:string}={}) {
  return new Promise<{status:number;headers:Record<string,unknown>;body:string}>((resolve,reject)=>{
    const address = new URL(origin);
    const req=request({hostname:'127.0.0.1',port:address.port,path,method,headers:{Host:address.host,...headers},agent:false},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);
      res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers,body}));
    });
    req.on('error',reject);req.end(data);
  });
}
async function login(secret:string=password) {
  return get('/entrar',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},
    data:new URLSearchParams({username:'omeumes',password:secret}).toString()});
}
const cookieFrom = (r:Awaited<ReturnType<typeof login>>) => (r.headers['set-cookie'] as string[])[0].split(';')[0];

test('HTTP, login, expiração deslizante, logout, revogação e restrição de origem', async () => {
  enabled=false;
  expect((await get('/')).status).toBe(503);
  expect((await get('/api/state')).status).toBe(503);
  enabled=true;
  expect((await get('/')).headers.location).toBe('/entrar');
  expect((await get('/api/state')).status).toBe(401);
  expect((await get('/api/state',{method:'POST',headers:{Origin:origin}})).status).toBe(401);
  expect((await get('/api/local-files?action=backup',{method:'POST',headers:{Origin:origin}})).status).toBe(401);
  expect((await get('/api/state',{headers:{Host:'exemplo.invalid'}})).status).toBe(403);
  const signed=await login();
  expect(signed.status).toBe(303);
  expect(signed.headers['set-cookie']).toEqual([expect.stringMatching(/^omeumes-lan=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict$/)]);
  const cookie=cookieFrom(signed);
  const home=await get('/',{headers:{cookie}});
  expect(home.status).toBe(200);
  expect(home.body).toContain('interactive-widget=resizes-content');
  expect(home.headers['cache-control']).toBe('private, no-store');
  expect((await get('/demo',{headers:{cookie}})).status).toBe(404);
  expect((await fetch(local+'/demo')).status).toBe(404);
  const statePath = `/api/state?period=${period}`;
  const viaHome = await get(statePath,{headers:{cookie}});
  expect(viaHome.status).toBe(200);
  expect(JSON.parse(viaHome.body)).toEqual(await (await fetch(local+statePath)).json());
  expect((await get('/api/state',{method:'POST',headers:{cookie}})).status).toBe(403);
  expect((await get('/api/state',{method:'POST',headers:{cookie,Origin:origin.replace('http:', 'https:')}})).status).toBe(403);
  expect((await get('/api/state',{method:'POST',headers:{cookie,Origin:'https://exemplo.invalid','X-Forwarded-Host':new URL(origin).host,'X-Forwarded-Proto':'https'}})).status).toBe(403);
  expect((await fetch(local+'/api/state',{headers:{host:new URL(origin).host,'x-omeumes-entry':'falso'}})).status).toBe(403);
  expect((await get('/api/local-files?action=export',{method:'POST',headers:{cookie,Origin:origin,'x-omeumes-entry':'falso','x-forwarded-host':new URL(local).host}})).status).toBe(403);
  const backup=await get('/api/local-files?action=backup',{method:'POST',headers:{cookie,Origin:origin}});
  expect(backup.status).toBe(200);
  const name=JSON.parse(backup.body).path;
  expect(name).toBe(basename(name));
  expect(existsSync(join(directory,'backups',name))).toBe(true);
  expect((await fetch(local+'/api/local-files?action=export',{method:'POST',headers:{Origin:local}})).status).toBe(200);
  time+=3*60*60*1000-1;
  expect((await get('/api/state',{headers:{cookie}})).status).toBe(200);
  time+=3*60*60*1000;
  expect((await get('/api/state',{headers:{cookie}})).status).toBe(401);
  expect((await get('/api/state',{method:'POST',headers:{cookie,Origin:origin}})).status).toBe(401);
  const renewed=cookieFrom(await login());
  const logout=await get('/sair',{method:'POST',headers:{cookie:renewed,Origin:origin}});
  expect(logout.headers['set-cookie']).toEqual([expect.stringContaining('Max-Age=0')]);
  expect((await get('/api/state',{headers:{cookie:renewed}})).status).toBe(401);
  expect((await get('/api/state',{method:'POST',headers:{cookie:renewed,Origin:origin}})).status).toBe(401);
  const revoked=cookieFrom(await login());
  allowed=false;
  await expect(get('/',{headers:{cookie:revoked}})).rejects.toThrow();
  entry.invalidate();
  allowed=true;
  expect((await get('/api/state',{headers:{cookie:revoked}})).status).toBe(401);
  time+=61_000;
  for(let i=0;i<5;i++)expect((await login('invalida')).status).toBe(401);
  expect((await login()).status).toBe(429);
  time+=61_000;
}, 25_000);

test('navegador HTTP em contexto inseguro, falhas antes/depois de gravar e conflito entre PC e telemóvel', async () => {
  const browser = await chromium.launch({ executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args:['--host-resolver-rules=MAP omeumes.test 127.0.0.1','--no-proxy-server'] });
  try {
    mkdirSync(pictures, { recursive:true });
    const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    await page.goto(origin);
    await page.screenshot({path:pictures+'/entrar-390.png'});
    await page.getByLabel('Palavra-passe').fill(password);
    const posted=page.waitForResponse(response=>new URL(response.url()).pathname==='/entrar'&&response.request().method()==='POST');
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    const loginResponse=await posted;
    expect(loginResponse.status()).toBe(303);
    await page.waitForURL(origin+'/');
    await page.locator('.app-shell[data-ready="true"]').waitFor();
    await page.getByRole('heading',{name:'Mês',exact:true}).waitFor();
    expect(await page.evaluate(()=>[isSecureContext,typeof crypto.randomUUID])).toEqual([false,'undefined']);
    const menu=page.getByRole('button',{name:'Menu',exact:true});
    await menu.focus();
    await page.keyboard.press('Enter');
    expect(await menu.getAttribute('aria-expanded')).toBe('true');
    await page.screenshot({path:pictures+'/menu-390.png'});
    expect(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label'))).toBe('Mês');
    await page.keyboard.press('Escape');
    expect(await menu.getAttribute('aria-expanded')).toBe('false');
    expect(await page.evaluate(()=>document.activeElement?.textContent)).toBe('Menu');
    for(const width of [360,390,1366]){
      await page.setViewportSize({width,height:width===1366?768:844});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:`${pictures}/mes-${width}.png`,fullPage:true});
    }
    await page.setViewportSize({width:390,height:844});
    await menu.click();
    await page.getByRole('navigation').getByRole('button',{name:'Plano e movimentos',exact:true}).click();
    const readLocal=async()=>(await fetch(local+'/api/state?period='+period)).json();
    for(const [id,commit] of [['trial-rent',true],['trial-health',false]] as const) {
      const before=(await readLocal()).state.months[period].events.length;
      let original='';
      let calls=0;
      const intercept=async(route:import('@playwright/test').Route)=>{
        if(route.request().method()!=='POST')return route.continue();
        calls++;
        const sent=route.request().postData()!;
        if(calls===1){
          original=sent;
          if(commit){
            const headers=await route.request().allHeaders();
            expect((await get('/api/state',{method:'POST',headers:{cookie:headers.cookie,Origin:origin,'Content-Type':'application/json'},data:sent})).status).toBe(200);
          }
          await route.abort('failed');
        } else {
          expect(sent).toBe(original);
          await route.continue();
        }
      };
      await page.route('**/api/state',intercept);
      const row=page.getByTestId('line-'+id);
      await row.getByRole('button',{name:'Pagar',exact:true}).click();
      const retry=page.getByRole('dialog').getByRole('button',{name:'Repetir confirmação',exact:true});
      await retry.waitFor();
      expect((await readLocal()).state.months[period].events.length).toBe(before+(commit?1:0));
      await retry.click();
      await row.getByText('Concluída',{exact:true}).first().waitFor();
      expect((await readLocal()).state.months[period].events.length).toBe(before+1);
      expect(calls).toBe(2);
      await page.unroute('**/api/state',intercept);
    }
    await page.getByRole('button',{name:'Detalhe de Serviços Essenciais'}).click();
    await page.getByRole('button',{name:'Parcial ou diferente'}).click();
    await page.getByLabel('Montante (€)',{exact:true}).fill('30');
    await page.setViewportSize({width:390,height:440});
    await page.screenshot({path:pictures+'/formulario-390-altura-reduzida.png'});
    expect(await page.getByRole('dialog').evaluate(el=>Math.round(el.getBoundingClientRect().height))).toBe(440);
    const before=await readLocal();
    expect((await fetch(local+'/api/state',{method:'POST',headers:{Origin:local,'Content-Type':'application/json'},
      body:JSON.stringify({period,revision:before.revision,requestId:randomUUID(),action:{type:'snapshot',date:period+'-02'}})})).status).toBe(200);
    await page.getByRole('button',{name:'Confirmar registo',exact:true}).click();
    const reload=page.getByRole('dialog').getByRole('button',{name:'Recarregar para voltar a editar'});
    await reload.waitFor();
    await page.screenshot({path:pictures+'/conflito-390.png'});
    expect((await readLocal()).state.months[period].events.length).toBe(before.state.months[period].events.length);
    await reload.click();
    await reload.waitFor({state:'hidden'});
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Detalhe de Serviços Essenciais'}).click();
    await page.getByRole('button',{name:'Parcial ou diferente'}).click();
    await page.getByLabel('Montante (€)',{exact:true}).fill('30');
    await page.getByRole('button',{name:'Confirmar registo',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    const food=page.getByTestId('line-trial-food');
    await food.getByRole('button',{name:'Registar',exact:true}).click();
    await page.getByLabel('Montante (€)',{exact:true}).fill('40');
    await page.getByRole('button',{name:'Confirmar registo',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await food.getByRole('button',{name:'Registar',exact:true}).click();
    await page.getByLabel('Tipo de registo').selectOption('total');
    await page.getByLabel('Total gasto até à data (€)').fill('60');
    await page.getByRole('button',{name:'Confirmar registo',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.getByRole('tab',{name:'Poupanças'}).click();
    await page.getByTestId('line-trial-saving').getByRole('button',{name:'Poupar',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Confirmar',exact:true}).click();
    await page.getByTestId('line-trial-saving').getByText('Objetivo atingido',{exact:true}).first().waitFor();
    await menu.click();
    await page.getByRole('navigation').getByRole('button',{name:'Contas',exact:true}).click();
    const account=page.locator('.account-card').filter({has:page.getByText('ActivoBank A',{exact:true})});
    await page.getByRole('button',{name:'Transferir entre contas',exact:true}).click();
    expect(await page.getByRole('dialog').getByLabel('Origem',{exact:true}).inputValue()).toBe('ActivoBank A');
    await page.getByRole('dialog').getByLabel('Destino',{exact:true}).fill('Santander');
    await page.getByRole('dialog').getByRole('option',{name:'Santander',exact:true}).click();
    await page.getByRole('dialog').getByLabel('Montante (€)',{exact:true}).fill('20');
    await page.getByRole('dialog').getByRole('button',{name:'Confirmar',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    expect(balance((await readLocal()).state.months[period],'a:act-r')).toBe(18_500);
    await account.getByText('Ver movimentos da conta',{exact:true}).click();
    // Anular only the 30 EUR partial payment, using its dated financial event.
    const state=await readLocal();
    const partial=state.state.months[period].events.find((event:{lineId:string;amount:number})=>event.lineId==='trial-services'&&event.amount===3000);
    const history=account.locator('.history>div').filter({hasText:partial.note});
    await history.filter({hasText:'30,00'}).getByRole('button',{name:'Anular',exact:true}).click();
    await account.getByRole('button',{name:'Atualizar montante',exact:true}).click();
    await page.getByLabel('Saldo observado no banco (€)').fill('220');
    await page.getByLabel('Motivo da diferença').fill('Conferência fictícia no ensaio HTTPS');
    await page.getByRole('dialog').getByRole('button',{name:'Confirmar',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    const confirmed=await readLocal();
    expect(balance(confirmed.state.months[period],'a:act-r')).toBe(22_000);
    expect(balance(confirmed.state.months[period],'a:san')).toBe(2000);
    expect(balance(confirmed.state.months[period],'a:moey-r')).toBe(5000);
    expect(balance(confirmed.state.months[period],'r:trial-em')).toBe(36_000);
    expect(realized(confirmed.state.months[period],'trial-food')).toBe(6000);
    expect(realized(confirmed.state.months[period],'trial-services')).toBe(2000);
    await menu.click();
    await page.getByRole('navigation').getByRole('button',{name:'Modelo Base',exact:true}).click();
    await page.getByTestId('line-trial-rent').getByRole('button',{name:'Editar',exact:true}).click();
    await page.getByLabel('Montante habitual (€) · opcional').fill('90');
    await page.getByRole('dialog').getByRole('button',{name:'Confirmar',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    const nextPeriod=Object.keys((await readLocal()).state.months).find(p=>p!==period)!;
    await page.getByLabel('Mês selecionado').selectOption(nextPeriod);
    await page.waitForFunction(p=>document.querySelector<HTMLSelectElement>('#month-select')?.value===p,nextPeriod);
    expect((await (await fetch(local+'/api/state?period='+nextPeriod)).json()).state.months[nextPeriod].events).toHaveLength(0);
    await menu.click();
    await page.getByRole('navigation').getByRole('button',{name:'Definições',exact:true}).click();
    await page.getByRole('button',{name:'Verificar controlos de acesso',exact:true}).click();
    for(const label of ['Consulta sem sessão · HTTP 401 · Conforme','Alteração sem sessão · HTTP 401 · Conforme','Exportação pela entrada doméstica · HTTP 403 · Conforme']){
      await page.getByText(label,{exact:true}).waitFor();
    }
    expect(await page.getByText('390 × 844 px CSS',{exact:true}).count()).toBe(1);
    await page.evaluate(()=>{
      if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
      window.scrollTo(0,0);
    });
    await page.screenshot({path:pictures+'/verificacoes-390.png',fullPage:true});
    expect(await page.getByRole('button',{name:'Exportar dados'}).count()).toBe(0);
    await page.getByRole('button',{name:'Criar backup'}).click();
    await page.getByText('Backup verificado',{exact:true}).waitFor();
    await menu.click();
    await page.getByRole('button',{name:'Terminar sessão',exact:true}).click();
    await page.getByLabel('Palavra-passe').waitFor();
  } finally { await browser.close(); }
}, 60_000);

test('rede ambígua, mudança de gateway e suspensão revogam a licença; a mesma base tem exclusão', () => {
  const config={address:'192.0.2.59',interfaceAlias:'Wi-Fi',interfaceGuid:'GUID',gateway:'192.0.2.1',gatewayMac:'a0-a0-a0-a0-a0-a0',networkName:'casa'};
  expect(inHomeSubnet(config.address,'192.0.2.9')).toBe(true);
  expect(inHomeSubnet(config.address,'192.0.2.224')).toBe(true);
  expect(inHomeSubnet(config.address,'198.51.100.9')).toBe(false);
  expect(inHomeSubnet(config.address,'::ffff:192.0.2.9')).toBe(false);
  let clock=10_000, wall=10_000;
  let address=config.address;
  const lease=networkLease(config,{monotonic:()=>clock,wall:()=>wall},()=>({'Wi-Fi':[{family:'IPv4',address,
    internal:false,netmask:'255.255.255.0',mac:'00:00:00:00:00:00',cidr:address+'/24'}]}));
  const home={...config,guid:'GUID',profile:'Private',firewall:true,prefix:24};
  expect(lease.renew({...home,prefix:16})).toBe(false);
  expect(lease.renew({...home,gatewayMac:'b0-b0-b0-b0-b0-b0'})).toBe(false);
  expect(lease.renew({...home,profile:'Public'})).toBe(false);
  expect(lease.renew({...home,networkName:'convidados'})).toBe(false);
  expect(lease.renew({...home,firewall:false})).toBe(false);
  expect(lease.renew(home)).toBe(true);
  expect(lease.live()).toBe(true);
  address='198.51.100.59';
  expect(lease.live()).toBe(false);
  address=config.address;
  expect(lease.renew(home)).toBe(true);
  wall+=12000;
  expect(lease.live()).toBe(false);
  expect(lease.renew(home)).toBe(true);
  clock+=12000;
  expect(lease.live()).toBe(false);
  const lock=lockDatabase(db);
  try { expect(()=>lockDatabase(db)).toThrow('Já existe uma instância'); } finally { lock.close(); }
  lockDatabase(db).close();
});

test('o arranque habitual recusa outra instância da mesma base e liberta o filho ao terminar', async () => {
  const launchPath=join(directory,'arranque-ficticio.sqlite');
  const launchPort=await availablePort();
  const launches=new WeakMap<ChildProcess,{output:string;url?:string}>();
  const start=()=>{
    const child=spawn(process.execPath,['scripts/next.mjs','start','--port',String(launchPort)],{
      env:{...process.env,OMEUMES_DB_PATH:launchPath,OMEUMES_TEST_MODE:'1',NEXT_TELEMETRY_DISABLED:'1'},
      windowsHide:true,stdio:'pipe',
    });
    const log:{output:string;url?:string}={output:''};
    launches.set(child,log);
    const receive=(chunk:Buffer)=>{
      log.output+=chunk;
      log.url=log.output.match(/Abra (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
    };
    child.stdout?.on('data',receive);
    child.stderr?.on('data',receive);
    return child;
  };
  async function ready(child:ChildProcess){
    let lastResponse='';
    for(let i=0;i<100;i++){
      const log=launches.get(child)!;
      if(log.url&&log.output.includes('Ready in')){
        try {
          const response=await fetch(log.url+'/api/state',{signal:AbortSignal.timeout(300)});
          if(response.ok)return await response.json();
          lastResponse=response.status+' '+await response.text();
        } catch(error) {
          lastResponse=(error as Error).message;
        }
      }
      if(child.exitCode!==null)throw new Error('O servidor de arranque isolado terminou.');
      await wait(100);
    }
    throw new Error('O servidor isolado não ficou disponível. '+lastResponse+' '+launches.get(child)?.output);
  }
  async function stop(child:ChildProcess){
    const url=launches.get(child)?.url;
    const exited=new Promise(resolve=>child.once('exit',resolve));
    child.kill();
    await exited;
    for(let i=0;i<40;i++){
      if(!url)return;
      try{await fetch(url+'/api/state',{signal:AbortSignal.timeout(300)});}catch{return;}
      await wait(50);
    }
    throw new Error('O filho Next continuou disponível depois do supervisor terminar.');
  }
  const first=start();
  let before;
  try{
    before=await ready(first);
    const duplicate=start();
    const status=await new Promise(resolve=>duplicate.once('exit',resolve));
    expect(status).toBe(1);
    expect(await (await fetch(launches.get(first)!.url!+'/api/state')).json()).toEqual(before);
  }finally{await stop(first);}
  const reopened=start();
  try{expect(await ready(reopened)).toEqual(before);}finally{await stop(reopened);}
},30_000);
