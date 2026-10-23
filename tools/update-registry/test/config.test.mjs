import test from 'node:test';
import assert from 'node:assert/strict';
import {readConfig} from '../src/config.mjs';

test('reject example secrets, non-HTTPS public endpoints and unsafe credentials',()=>{
 const keys=['REGISTRY_PUBLIC_URL','REGISTRY_ADMIN_TOKEN','REGISTRY_UNSUBSCRIBE_SECRET','REGISTRY_PORT','REGISTRY_MONGODB_URI','REGISTRY_SMTP_HOST','REGISTRY_SMTP_PORT','REGISTRY_SMTP_USER','REGISTRY_SMTP_PASSWORD','REGISTRY_SMTP_FROM'];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try {
  Object.assign(process.env,{
   REGISTRY_PUBLIC_URL:'https://updates.mytest.invalid',
   REGISTRY_ADMIN_TOKEN:'A'.repeat(64),REGISTRY_UNSUBSCRIBE_SECRET:'B'.repeat(64),
   REGISTRY_PORT:'8789',REGISTRY_MONGODB_URI:'mongodb://127.0.0.1:27017/botmode_updates',
   REGISTRY_SMTP_HOST:'127.0.0.1',REGISTRY_SMTP_PORT:'587',
   REGISTRY_SMTP_USER:'test@mytest.invalid',REGISTRY_SMTP_PASSWORD:'C'.repeat(64),
   REGISTRY_SMTP_FROM:'updates@mytest.invalid',
  });
  assert.equal(readConfig().port,8789);
  process.env.REGISTRY_PUBLIC_URL='http://updates.mytest.invalid';assert.throws(readConfig,/HTTPS/);
  process.env.REGISTRY_PUBLIC_URL='https://updates.mytest.invalid';
  process.env.REGISTRY_ADMIN_TOKEN='REPLACE_WITH_RANDOM_64_CHARACTER_SECRET';assert.throws(readConfig,/example secrets/);
  process.env.REGISTRY_ADMIN_TOKEN='A'.repeat(64);
  process.env.REGISTRY_MONGODB_URI='mongodb://admin:CHANGE_ME@127.0.0.1:27017/test';assert.throws(readConfig,/example MongoDB/);
  process.env.REGISTRY_MONGODB_URI='mongodb://127.0.0.1:27017/test';
  process.env.REGISTRY_SMTP_PASSWORD='REPLACE_WITH_SMTP_SECRET';assert.throws(readConfig,/example SMTP/);
  process.env.REGISTRY_SMTP_PASSWORD='C'.repeat(64);
  process.env.REGISTRY_UNSUBSCRIBE_SECRET=process.env.REGISTRY_ADMIN_TOKEN;assert.throws(readConfig,/Strong distinct/);
 } finally {for(const [key,value] of Object.entries(previous)) value===undefined?delete process.env[key]:process.env[key]=value;}
});
