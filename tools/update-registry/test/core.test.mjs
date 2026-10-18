import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHandler, digest, unsubscribeToken, csvValue } from '../src/core.mjs';

const adminToken='A'.repeat(64),unsubscribeSecret='B'.repeat(64);
async function fixture(maxPerHour=4) {
  const rows=new Map(),mail=[];
  const store={
    async upsertPending(email,confirmationHash,confirmationExpiresAt,unsubscribeHash,createdAt) {
      const old=rows.get(email);
      if(old?.status==='confirmed')return false;
      rows.set(email,{email,confirmationHash,confirmationExpiresAt,unsubscribeHash,createdAt,status:'pending'});return true;
    },
    async confirm(hash,now) {
      for(const row of rows.values())if(row.status==='pending'&&row.confirmationHash===hash&&row.confirmationExpiresAt>now) {
        row.status='confirmed';row.confirmedAt=now;delete row.confirmationHash;return true;
      }
      return false;
    },
    async unsubscribe(hash,now) {for(const row of rows.values())if(row.unsubscribeHash===hash&&row.status==='confirmed'){rows.delete(row.email);return true;}return false;},
    async countConfirmed() {return [...rows.values()].filter(r=>r.status==='confirmed').length},
    async listConfirmed(offset,limit) {return [...rows.values()].filter(r=>r.status==='confirmed').slice(offset,offset+limit)},
  };
  const server=createServer(createHandler({store,mailer:async message=>mail.push(message),publicUrl:'https://updates.example.test',adminToken,unsubscribeSecret,maxPerHour}));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=server.address().port,base=`http://127.0.0.1:${port}`;
  const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data),redirect:'manual'});
  return {base,post,mail,rows,server,close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}

test('opt-in → email confirmation → admin list → unsubscribe, all explicit',async t=>{
  const f=await fixture();t.after(()=>f.close());
  const page=await fetch(f.base+'/');assert.equal(page.status,200);assert.match(await page.text(),/facultative/);
  const noOpt=await f.post('/subscribe',{email:'Person@Example.org'});assert.equal(noOpt.status,400);
  const signed=await f.post('/subscribe',{email:' Person@Example.org ',updates:'yes'});assert.equal(signed.status,200);
  assert.equal(f.mail.length,1);assert.equal(f.mail[0].to,'person@example.org');
  const pending=f.rows.get('person@example.org');assert.equal(pending.status,'pending');
  assert.equal(await (await fetch(f.base+'/admin/stats',{headers:{authorization:`Bearer ${adminToken}`}})).json().then(x=>x.confirmedSubscribers),0);
  assert.equal((await fetch(f.base+'/admin/subscribers.csv')).status,401);
  const token=new URL(f.mail[0].text.match(/https:\/\/[^\s]+/)[0]).searchParams.get('token');
  assert.equal(token.length,64);assert.equal(digest(token),pending.confirmationHash);
  assert.equal((await fetch(f.base+`/confirm?token=${token}`)).status,200);
  assert.equal(f.rows.get('person@example.org').status,'pending'); // scanners cannot confirm GET
  assert.equal((await f.post('/confirm',{token})).status,200);
  assert.equal((await f.post('/confirm',{token})).status,410); // replay rejected
  assert.equal((await (await fetch(f.base+'/admin/stats',{headers:{authorization:`Bearer ${adminToken}`}})).json()).confirmedSubscribers,1);
  let csv=await (await fetch(f.base+'/admin/subscribers.csv',{headers:{authorization:`Bearer ${adminToken}`}})).text();
  assert.match(csv,/person@example.org/);assert.doesNotMatch(csv,/password|secret|token/);
  const unsub=unsubscribeToken(unsubscribeSecret,'person@example.org');
  assert.equal((await fetch(f.base+`/unsubscribe?token=${unsub}`)).status,200);
  assert.equal(f.rows.get('person@example.org').status,'confirmed');
  assert.equal((await f.post('/unsubscribe',{token:unsub})).status,200);
  assert.equal(f.rows.has('person@example.org'),false); // deletion, not hidden retention
  assert.equal((await (await fetch(f.base+'/admin/stats',{headers:{authorization:`Bearer ${adminToken}`}})).json()).confirmedSubscribers,0);
});

test('prevents form abuse, oversized bodies, and unauthorized exports',async t=>{
  const f=await fixture(2);t.after(()=>f.close());
  assert.equal((await fetch(f.base+'/admin/stats',{headers:{authorization:'Bearer wrong'}})).status,401);
  assert.equal((await f.post('/subscribe',{email:'a@b.co',updates:'yes'})).status,200);
  assert.equal((await f.post('/subscribe',{email:'b@b.co',updates:'yes'})).status,200);
  assert.equal((await f.post('/subscribe',{email:'c@b.co',updates:'yes'})).status,429);
  assert.equal(f.mail.length,2);
  const oversized=await fetch(f.base+'/confirm',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'x'.repeat(10000)});
  assert.equal(oversized.status,413);
  assert.equal((await fetch(f.base+'/confirm?token=not-a-token')).status,400);
  assert.equal((await fetch(f.base+'/admin/subscribers.csv',{headers:{authorization:'Bearer '+adminToken.slice(0,-1)}})).status,401);
  assert.equal(csvValue('=IMPORTXML("x")'),'"\'=IMPORTXML(""x"")"');
  assert.equal((await fetch(f.base+'/does-not-exist')).status,404);
});

test('mail delivery failure does not disclose address or internal errors',async t=>{
  const server=createServer(createHandler({store:{upsertPending:async()=>true},mailer:async()=>{throw new Error('SMTP secret user@example.org');},publicUrl:'https://updates.example.test',adminToken,unsubscribeSecret}));
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const res=await fetch(`http://127.0.0.1:${server.address().port}/subscribe`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'email=user%40example.org&updates=yes'});
  assert.equal(res.status,503);let text=await res.text();assert.doesNotMatch(text,/SMTP|user@example.org/);
});
