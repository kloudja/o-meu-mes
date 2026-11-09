import { afterEach, expect, test, vi } from 'vitest';
import { accessMode, writeAccess } from '../../src/server/access';

afterEach(()=>vi.unstubAllEnvs());

test('localhost usa a autoridade efetiva e ignora cabeçalhos encaminhados do cliente',()=>{
  const headers=new Headers({host:'127.0.0.1:3000',origin:'http://127.0.0.1:3000',
    'x-forwarded-host':'casa.example:8443','x-forwarded-proto':'https'});
  expect(accessMode(headers)).toBe('local');
  expect(writeAccess(new Request('http://localhost:3000/api/state',{headers}))).toBe('local');
  headers.set('origin','https://casa.example:8443');
  expect(writeAccess(new Request('http://localhost:3000/api/state',{headers}))).toBeNull();
  headers.delete('host');
  expect(accessMode(headers)).toBeNull();
});

test('a entrada doméstica exige origem exata e prova privada, também para leituras',()=>{
  const origin='https://192.0.2.59:8443';
  const secret='a'.repeat(64);
  vi.stubEnv('OMEUMES_HOME_ORIGIN',origin);
  vi.stubEnv('OMEUMES_HOME_ENTRY',secret);
  const headers=new Headers({host:'192.0.2.59:8443',origin});
  expect(accessMode(headers)).toBeNull();
  headers.set('x-omeumes-entry','b'.repeat(64));
  expect(accessMode(headers)).toBeNull();
  headers.set('x-omeumes-entry',secret);
  expect(accessMode(headers)).toBe('home');
  const request=()=>new Request(origin+'/api/state',{headers});
  expect(writeAccess(request())).toBe('home');
  for(const supplied of ['null','https://exemplo.invalid','http://192.0.2.59:8443','https://192.0.2.59:8443/']){
    headers.set('origin',supplied);
    expect(writeAccess(request())).toBeNull();
  }
  headers.delete('origin');
  expect(writeAccess(request())).toBeNull();
  headers.set('host','127.0.0.1:3000');
  expect(accessMode(headers)).toBeNull();
  headers.set('host','192.0.2.59:8443');
  headers.set('x-omeumes-entry','é'.repeat(64));
  expect(accessMode(headers)).toBeNull();
});
