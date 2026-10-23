import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// Only a dedicated ephemeral Mongo instance should be supplied by the test runner.
// There is deliberately no fallback to LibreChat's configured Mongo URI.
test('MongoDB subscriber lifecycle, indexed deduplication, and announcement idempotence', {skip:!process.env.REGISTRY_TEST_MONGODB_URI}, async () => {
  const { MongoClient }=await import('mongodb');
  const {connectStore}=await import('../src/storage.mjs');
  const uri=process.env.REGISTRY_TEST_MONGODB_URI;
  if(!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(uri))throw new Error('Tests require explicit ephemeral loopback MongoDB');
  const dbName='botmode_registry_ci_'+randomBytes(6).toString('hex');
  const {store,close}=await connectStore(uri,dbName);
  const now=new Date('2026-10-18T12:00:00.000Z');
  const email='user@example.org',conf='a'.repeat(64),unsub='b'.repeat(64);
  try {
    assert.equal(await store.upsertPending(email,conf,new Date(now.getTime()+3600000),unsub,now),true);
    assert.equal(await store.upsertPending(email,'z'.repeat(64),new Date(now.getTime()+3600000),unsub,now),false);
    assert.equal(await store.countConfirmed(),0);
    assert.equal(await store.confirm('c'.repeat(64),now),false);
    assert.equal(await store.confirm(conf,now),true);
    assert.equal(await store.confirm(conf,now),false);
    assert.equal(await store.upsertPending(email,conf,new Date(now.getTime()+3600000),unsub,now),false);
    assert.equal(await store.countConfirmed(),1);
    assert.equal((await store.listConfirmed(0,10))[0].email,email);
    assert.equal(await store.reserveAnnouncement('v1.0.0','recipient-hmac',now),true);
    assert.equal(await store.reserveAnnouncement('v1.0.0','recipient-hmac',now),false);
    assert.equal(await store.reserveAnnouncement('v1.0.0','recipient-hmac',new Date(now.getTime()+11*60*1000)),true); // crash recovery lease
    assert.equal(await store.reserveAnnouncement('v1.0.0','recipient-hmac',new Date(now.getTime()+12*60*1000)),false);
    await store.markAnnouncementSent('v1.0.0','recipient-hmac',now);
    assert.equal(await store.reserveAnnouncement('v1.0.0','recipient-hmac',now),false);
    assert.equal(await store.unsubscribe(unsub,now),true);
    assert.equal(await store.countConfirmed(),0);
    assert.equal(await store.unsubscribe(unsub,now),false);
    assert.equal(await store.upsertPending(email,conf,new Date(now.getTime()+3600000),unsub,now),true);
    assert.equal(await store.confirm(conf,new Date(now.getTime()+2*3600000)),false);
  } finally {
    // The test database name is randomly generated, namespaced and is never used by production.
    const cleanupClient=new MongoClient(uri);
    await cleanupClient.connect();
    await cleanupClient.db(dbName).dropDatabase();
    await cleanupClient.close();
    await close();
  }
});
