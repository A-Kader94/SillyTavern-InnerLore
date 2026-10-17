import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as core from '../core.js';
import * as progression from '../progression.js';

const source = await fs.readFile(new URL('../index.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('async function rebuildFromChat('), source.indexOf('\nfunction scheduleQueuedHistoryRebuild('));
function harness({ failSave = false, duringSync = () => {} } = {}) {
    let chatId = 'a';
    const ctx = { chat: [{ mes: 'Opening', is_user: false }], chatMetadata: {}, name2: 'Narrator' };
    const old = core.createEmptyStore('a');
    old.entities = { prior: { name: 'Prior' } };
    const runtime = { store: old, storeChatId: 'a', historyRevision: 0, npcLorebookWarnings: [] };
    const saves = [], mirrors = [], statuses = [];
    const sandbox = { ...core, ...progression, runtime, AbortController, DOMException, console,
        getSettings: () => ({ innerSelfEnabled: true, worldProgressionEnabled: false }),
        getChatStore: () => runtime.store, context: () => ctx, currentChatId: () => chatId,
        lastCompletedStoryIndex: () => 0, completedRebuildBatchEnd: () => 0,
        clone: structuredClone, resetTriggerEventRuntime: state => state,
        setStatus: (...args) => statuses.push(args), updateUI() {}, recordTelemetryEntry() {},
        analyzeRange: async store => { store.entities = { rebuilt: { name: 'Rebuilt' } }; store.lastProcessedIndex = 0; store.processedFingerprints = core.snapshotMessageRange(ctx.chat, 0, 0); return {}; },
        throwForSubsystemFailure() {}, carryManualState() {}, copyCardExpressionFoundation() {},
        isInnerLoreStoragePointer: () => false, MODULE_KEY: 'inner_lore', DISPLAY_NAME: 'InnerLore', LOG_PREFIX: 'Test',
        syncLorebook: async store => { mirrors.push(store); await duringSync({ runtime, ctx, switchChat: id => { chatId = id; } }); },
        saveChatStore: async options => { saves.push({ store: runtime.store, options }); if (failSave && saves.length === 1) throw new Error('disk unavailable'); },
        clearHistoryFallback() {}, updateInjection() {}, getProgressionStats: () => ({ clock: '0' }),
        isTransientRequestError: () => false, scheduleQueuedHistoryRebuild() {},
        toastr: { error() {}, success() {}, warning() {} },
    };
    vm.createContext(sandbox); vm.runInContext(code, sandbox);
    return { runtime, old, saves, mirrors, statuses, run: () => sandbox.rebuildFromChat() };
}
test('failed replacement save restores prior live state and lore mirror', async () => {
    const h = harness({ failSave: true });
    await h.run();
    assert.equal(h.runtime.store, h.old);
    assert.equal(h.saves.at(-1).store, h.old);
    assert.equal(h.mirrors.at(-1), h.old);
    assert.equal(h.old.needsRebuild, true);
    assert.ok(!h.statuses.some(status => status[1] === 'Rebuilt'));
});
test('successful rebuild explicitly permits intentional entity removal', async () => {
    const h = harness(); await h.run();
    assert.equal(h.saves[0].options?.allowEntityShrink, true);
});
test('switching chats during lore synchronization cannot save into the new chat', async () => {
    const h = harness({ duringSync: ({ runtime, switchChat }) => { switchChat('b'); runtime.store = core.createEmptyStore('b'); runtime.storeChatId = 'b'; } });
    await h.run();
    assert.equal(h.runtime.store.chatId, 'b');
    assert.equal(h.saves.length, 0);
    assert.ok(!h.statuses.some(status => status[1] === 'Rebuilt'));
});
test('an edit to an already analyzed message during synchronization rejects the replacement', async () => {
    let changed = false;
    const h = harness({ duringSync: ({ ctx }) => { if (!changed) { changed = true; ctx.chat[0].mes = 'Edited opening'; } } });
    await h.run();
    assert.equal(h.runtime.store, h.old);
    assert.equal(h.saves.length, 1, 'only the prior state with rebuild-needed status is saved');
    assert.equal(h.saves[0].store, h.old);
    assert.equal(h.old.needsRebuild, true);
    assert.ok(!h.statuses.some(status => status[1] === 'Rebuilt'));
});
