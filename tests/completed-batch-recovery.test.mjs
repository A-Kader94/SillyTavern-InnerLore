// Integration smoke test: real rebuild orchestration, mocked provider and
// embedded metadata storage. The injected timeout is not an elapsed deadline.
import assert from 'node:assert/strict';

import {
    createEmptyStore,
    createStoreCheckpoint,
    mergeEntityOperations,
    snapshotMessageRange,
} from '../core.js';

const waitFor = async (predicate, timeout = 12_000) => {
    const started = Date.now();
    while (!predicate()) {
        if (Date.now() - started > timeout) throw new Error('Timed out in checkpoint failure probe.');
        await new Promise(resolve => setTimeout(resolve, 20));
    }
};

const chat = [{ is_user: false, is_system: false, name: 'Narrator', mes: 'Turn 0.' }];
for (let i = 1; i <= 23; i++) {
    const user = i % 2 === 1;
    chat.push({ is_user: user, is_system: false, name: user ? 'Jet' : 'Narrator', mes: `Turn ${i}.` });
}
const originalChat = structuredClone(chat);
const chatId = `checkpoint-failure-${Date.now()}`;

const checkpointStore = createEmptyStore(chatId);
checkpointStore.lastProcessedIndex = 18;
checkpointStore.processedFingerprints = snapshotMessageRange(originalChat, 0, 18);
mergeEntityOperations(checkpointStore, [{
    type: 'location',
    name: 'Old Landmark',
    importance: 80,
    facts: ['This survives a resumable rebuild.'],
}], { messageIndex: 5, minimumImportance: 0 });
const checkpoint = createStoreCheckpoint(checkpointStore);

const store = createEmptyStore(chatId);
store.lastProcessedIndex = 22;
store.processedFingerprints = snapshotMessageRange(originalChat, 0, 22);
store.checkpoints = [checkpoint];
store.entities = structuredClone(checkpoint.entities);

chat[22] = { is_user: false, is_system: false, name: 'Narrator', mes: 'Turn 22 rewritten after the checkpoint.' };

let requests = 0;
const listeners = new Map();
const extensionSettings = {
    disabledExtensions: [],
    connectionManager: {
        selectedProfile: 'probe-profile',
        profiles: [{ id: 'probe-profile', name: 'Probe', model: 'mock/model' }],
    },
    inner_lore: {
        enabled: true,
        autoUpdate: true,
        innerSelfEnabled: true,
        autoLoreEnabled: true,
        worldProgressionEnabled: false,
        processEveryAssistantTurns: 1,
        maintenanceSchedulingVersion: 1,
        lookbackMessages: 10,
        connectionSource: 'profile',
        connectionProfileId: 'probe-profile',
        requestMaximumAttempts: 1,
        requestTimeoutSeconds: 15,
        autoRebuildOnHistoryChange: true,
        autoRebuildMessageLimit: 120,
        storageBackend: 'embedded',
    },
};
const events = {
    MESSAGE_RECEIVED: 'message_received',
    GENERATION_STARTED: 'generation_started',
    CHAT_CHANGED: 'chat_changed',
    MESSAGE_EDITED: 'message_edited',
    MESSAGE_SWIPED: 'message_swiped',
    MESSAGE_DELETED: 'message_deleted',
};
const context = {
    extensionSettings,
    chatMetadata: { inner_lore: store },
    chat,
    chatId,
    name1: 'Jet',
    name2: 'Narrator',
    getCurrentChatId: () => chatId,
    getCharacterCardFields: () => ({}),
    saveSettingsDebounced: () => {},
    saveMetadata: async () => {},
    saveMetadataDebounced: () => {},
    saveChat: async () => {},
    setExtensionPrompt: () => {},
    renderExtensionTemplateAsync: async () => '',
    loadWorldInfo: async () => ({ entries: {} }),
    saveWorldInfo: async () => {},
    updateWorldInfoList: async () => {},
    eventSource: { on: (event, callback) => listeners.set(event, callback) },
    eventTypes: events,
    SlashCommandParser: null,
    SlashCommand: null,
    ConnectionManagerRequestService: {
        getSupportedProfiles: () => extensionSettings.connectionManager.profiles,
        sendRequest: async () => {
            requests++;
            if (requests === 2) throw new Error('upstream timed out');
            if (requests === 1) {
                return { content: JSON.stringify({
                    entities: [{
                        type: 'location',
                        name: 'Prefix Discovery',
                        importance: 70,
                        facts: ['Created only in the completed prefix batch.'],
                    }],
                    minds: [],
                }) };
            }
            return { content: '{"entities":[],"minds":[]}' };
        },
    },
};

globalThis.document = {
    body: { classList: { add() {}, remove() {}, contains() { return false; } } },
    activeElement: null,
    getElementById: () => null,
    querySelectorAll: () => [],
};
globalThis.$ = () => ({ append: () => {} });
globalThis.toastr = { error: () => {}, warning: () => {}, success: () => {}, info: () => {} };
globalThis.confirm = () => true;
globalThis.SillyTavern = { getContext: () => context };

await import(`../index.js?checkpoint-failure-probe=${Date.now()}`);

await waitFor(() => {
    const current = context.chatMetadata.inner_lore;
    return requests >= 2
        && current?.needsRebuild === true
        && current.checkpoints?.some(item => item.index === 20);
});

const failed = context.chatMetadata.inner_lore;
assert.equal(failed.needsRebuild, true);
assert.equal(failed.lastProcessedIndex, 22, 'failed rebuild leaves the prior live watermark intact');
assert.ok(failed.entities['location:old landmark'], 'live state remains available while rebuild is quarantined');
assert.equal(failed.entities['location:prefix discovery'], undefined, 'a completed prefix is not published before the rebuild commits');
assert.deepEqual(failed.checkpoints.map(item => item.index), [18, 20], 'only the completed prefix checkpoint is persisted');

await waitFor(() => {
    const current = context.chatMetadata.inner_lore;
    return requests >= 3 && current?.needsRebuild === false && current.lastProcessedIndex === 22;
});

const recovered = context.chatMetadata.inner_lore;
assert.ok(recovered.entities['location:old landmark'], 'retry resumes from the completed checkpoint');
assert.ok(recovered.entities['location:prefix discovery'], 'the completed prefix survives inside the checkpoint');
assert.equal(Object.keys(recovered.entities).filter(id => id === 'location:old landmark').length, 1);
assert.equal(recovered.needsRebuild, false);
assert.equal(requests, 3, 'retry requests only the unfinished batch');
assert.equal(recovered.entities['location:prefix discovery'].facts.length, 1, 'retry does not duplicate the completed batch fact');
