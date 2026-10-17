import assert from 'node:assert/strict';
import test from 'node:test';
import { EmbeddedStorageClient } from '../embedded-storage.js';

test('failed metadata persistence restores the previous embedded snapshot', async () => {
    const old = { chatId: 'a', entities: { prior: {} }, brains: {}, revision: 2 };
    const ctx = { chatMetadata: { inner_lore: old }, saveMetadata: async () => { throw new Error('disk unavailable'); } };
    globalThis.SillyTavern = { getContext: () => ctx };
    await assert.rejects(new EmbeddedStorageClient().save('embedded', 'a', { entities: {}, brains: {} }, { expectedRevision: 2 }), /disk unavailable/);
    assert.equal(ctx.chatMetadata.inner_lore, old);
});
test('failed older metadata save does not undo a newer in-memory replacement', async () => {
    const newer = { chatId: 'a', entities: { newer: {} } };
    const ctx = { chatMetadata: {}, saveMetadata: async () => { ctx.chatMetadata.inner_lore = newer; throw new Error('disk unavailable'); } };
    globalThis.SillyTavern = { getContext: () => ctx };
    await assert.rejects(new EmbeddedStorageClient().save('embedded', 'a', { entities: {}, brains: {} }), /disk unavailable/);
    assert.equal(ctx.chatMetadata.inner_lore, newer);
});
