'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('disposable original broker registers LibreChat mongoose models before model-backed methods', () => {
  const broker = fs.readFileSync(
    path.join(__dirname, '../ci-native-original-provider-broker-server.cjs'), 'utf8');
  const apiDb = fs.readFileSync(path.join(__dirname, '../../../api/db/index.js'), 'utf8');
  assert.match(apiDb, /createModels\(mongoose\)/);
  assert.match(broker, /const \{ createModels \} = require\('@librechat\/data-schemas'\)/);
  const register = broker.indexOf('createModels(mongoose);');
  const getDb = broker.indexOf("const db = require('~/models');");
  const firstMongoQuery = broker.indexOf('db.getUserById(userId)');
  assert.ok(register > 0 && register < getDb && getDb < firstMongoQuery);
  assert.match(broker, /await mongoose.connect\(mongoUri,/);
  assert.doesNotMatch(broker, /seedDatabase\s*\(/);
});
