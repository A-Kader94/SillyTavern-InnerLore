import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createEmptyStore, normalizeStore } from '../core.js';

// Exercise the actual entrypoint function with controlled storage scheduling,
// without starting browser UI or unrelated background maintenance.
const source = await fs.readFile(new URL('../index.js', import.meta.url), 'utf8');
const functionSource = source.slice(source.indexOf('async function reloadCurrentChatStore()'), source.indexOf('\nasync function saveChatStore('));
function harness() {
    let chatId = 'chat-a';
    let finish;
    const runtime = { store: createEmptyStore(chatId), storeChatId: chatId, storageWorldId: 'world-a', storageRevision: 1, storageLoadGeneration: 1 };
    const sandbox = { runtime, normalizeStore, console, currentChatId: () => chatId,
        activeStorageClient: () => ({ load: () => new Promise(resolve => { finish = resolve; }) }), updateUI() {} };
    vm.createContext(sandbox);
    vm.runInContext(functionSource, sandbox);
    return { runtime, reload: () => sandbox.reloadCurrentChatStore(), finish: value => finish(value), switchChat: value => { chatId = value; } };
}
function response() {
    const store = createEmptyStore('chat-a');
    store.entities = { landmark: { id: 'landmark', name: 'Landmark', type: 'location', facts: ['Persisted fact'] } };
    store.checkpoints = [{ index: 0, lastProcessedIndex: 0, processedFingerprints: { 0: 'test' }, entities: {}, brains: {} }];
    return { chatId: 'chat-a', store, revision: 7, snapshotHash: 'saved-hash' };
}
test('reload restores the persisted store inside the storage response envelope', async () => {
    const h = harness();
    const pending = h.reload();
    const saved = response();
    h.finish(saved);
    await pending;
    assert.deepEqual(h.runtime.store, normalizeStore(saved.store, 'chat-a'));
    assert.equal(h.runtime.committedEntityCount, 1);
    assert.equal(h.runtime.storageRevision, 7);
});
test('a delayed reload cannot replace the store after a chat switch', async () => {
    const h = harness();
    const pending = h.reload();
    h.switchChat('chat-b');
    h.runtime.storeChatId = 'chat-b';
    h.runtime.storageWorldId = 'world-b';
    const next = h.runtime.store = createEmptyStore('chat-b');
    h.finish(response());
    await pending;
    assert.equal(h.runtime.store, next);
    assert.equal(h.runtime.storageRevision, 1);
});
test('a delayed reload cannot overwrite a newer save in the same world', async () => {
    const h = harness();
    const pending = h.reload();
    h.runtime.storageRevision = 8;
    const newer = h.runtime.store = createEmptyStore('chat-a');
    h.finish(response());
    await pending;
    assert.equal(h.runtime.store, newer);
    assert.equal(h.runtime.storageRevision, 8);
});
