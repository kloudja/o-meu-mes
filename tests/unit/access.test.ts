import { expect, test } from 'vitest';
import { applicationAccess, localAccess, writeAccess } from '../../src/server/access';

test('sem origem configurada a página continua limitada ao loopback', () => {
  expect(applicationAccess(new Headers({ host: '127.0.0.1:3000' }), '')).toBe(true);
  expect(applicationAccess(new Headers({ host: 'omeumes.example.invalid' }), '')).toBe(false);
});

test('a página aceita apenas o domínio da origem configurada, sem abrir o acesso local de escrita', () => {
  const headers = new Headers({ host: 'omeumes.example.invalid' });
  expect(applicationAccess(headers, 'https://omeumes.example.invalid')).toBe(true);
  expect(localAccess(headers)).toBe(false);
  expect(writeAccess(new Request('https://omeumes.example.invalid', { headers }))).toBe(false);
  headers.set('host', 'other.example.invalid');
  headers.set('x-forwarded-host', 'omeumes.example.invalid');
  expect(applicationAccess(headers, 'https://omeumes.example.invalid')).toBe(false);
  headers.set('host', '127.0.0.1:3000');
  expect(applicationAccess(headers, 'https://omeumes.example.invalid')).toBe(false);
  expect(applicationAccess(headers, 'http://127.0.0.1:3000')).toBe(true);
  headers.delete('host');
  expect(applicationAccess(headers, 'https://omeumes.example.invalid')).toBe(false);
});

test('a página recusa origens inválidas e compara também a porta', () => {
  const headers = new Headers({ host: 'omeumes.example.invalid:8443' });
  expect(applicationAccess(headers, 'https://omeumes.example.invalid:8443')).toBe(true);
  expect(applicationAccess(headers, 'https://omeumes.example.invalid')).toBe(false);
  for (const origin of ['invalid', 'http://omeumes.example.invalid:8443', 'ftp://omeumes.example.invalid:8443',
    'https://omeumes.example.invalid:8443/path', 'https://user@omeumes.example.invalid:8443']) {
    expect(applicationAccess(headers, origin)).toBe(false);
  }
});

test('aceita loopback e exige a origem efetiva para gravar',()=>{
  const url='http://127.0.0.1:3000';
  const headers=new Headers({host:'127.0.0.1:3000',origin:url,
    'x-forwarded-host':'casa.example:8443','x-forwarded-proto':'https'});
  const request=()=>new Request(url+'/api/state',{headers});
  expect(localAccess(headers)).toBe(true);
  expect(writeAccess(request())).toBe(true);
  for(const origin of ['null','http://localhost:3000','https://casa.example:8443']){
    headers.set('origin',origin);
    expect(writeAccess(request())).toBe(false);
  }
  headers.delete('origin');
  expect(writeAccess(request())).toBe(false);
  headers.set('host','192.0.2.59:8443');
  expect(localAccess(headers)).toBe(false);
  headers.delete('host');
  expect(localAccess(headers)).toBe(false);
});
