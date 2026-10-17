import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Calls the real bundled plugin handlers with a minimal router/response adapter.
// SQLite is real; Express, HTTP authentication and browser lifecycle are not exercised.
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'innerlore-study-'));
process.env.INNERLORE_STORAGE_DB = path.join(temporaryDirectory, 'state.db');
const plugin = await import('../server/innerlore-storage/index.js');
let routes;
function open() {
  routes = new Map();
  const router = Object.fromEntries(['get', 'post', 'put', 'delete'].map(method => [method,
    (route, handler) => routes.set(`${method} ${route}`, handler)]));
  plugin.init(router);
}
function call(method, route, {body={}, params={worldId:'study-world'}, query={}}={}) {
  let status=200, payload;
  routes.get(`${method} ${route}`)({body, params, query}, {
    status(value) {status=value; return this;},
    json(value) {payload=value; return this;},
  });
  return {status, payload};
}
try {
  open();
  assert.equal(call('post','/v1/worlds/',{body:{id:'study-world'}}).status,200);
  const snapshot={chatId:'study-chat',entities:{},brains:{},checkpoints:[{index:1,processedFingerprints:{0:'a',1:'b'},brains:{ada:{name:'Ada'}}}]};
  const save=(expectedRevision, store=snapshot)=>call('put','/v1/worlds/:worldId/innerlore/store',{body:{chatId:'study-chat',expectedRevision,store}});
  assert.equal(save(0).payload.data.revision,1);
  assert.equal(save(0).status,409);
  assert.equal(save(1).payload.data.revision,2, 'conflict must not leak an open transaction');
  plugin.exit(); open();
  const loaded=call('get','/v1/worlds/:worldId/innerlore/store').payload.data;
  assert.equal(loaded.revision,2);
  assert.deepEqual(loaded.store.checkpoints,snapshot.checkpoints);
  const fork=call('post','/v1/worlds/:worldId/innerlore/fork',{body:{targetWorldId:'study-branch',targetChatId:'branch-chat'}});
  assert.equal(fork.payload.data.chatId,'branch-chat');
  assert.deepEqual(fork.payload.data.store.checkpoints,snapshot.checkpoints);
  assert.equal(call('post','/v1/worlds/:worldId/innerlore/context/build').payload.data,null);
  console.log('PASS: real SQLite snapshot save, revision conflict, post-conflict write, close/reopen checkpoint persistence, fork snapshot and local-context fallback contract.');
} finally {
  plugin.exit();
  fs.rmSync(temporaryDirectory,{recursive:true,force:true});
  delete process.env.INNERLORE_STORAGE_DB;
}
