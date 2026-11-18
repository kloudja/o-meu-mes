import { expect, test } from 'vitest';
import { localAccess, writeAccess } from '../../src/server/access';

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
