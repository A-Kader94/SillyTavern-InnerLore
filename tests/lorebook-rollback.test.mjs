import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyStore, mergeEntityOperations } from '../core.js';
import { syncLorebook } from '../lorebook.js';

for (const manuallyEdited of [false, true]) {
    test(`lorebook rollback restores prior text and preserves external edits: ${manuallyEdited}`, async () => {
        const worlds = new Map();
        globalThis.SillyTavern = { getContext: () => ({
            loadWorldInfo: async name => structuredClone(worlds.get(name)),
            saveWorldInfo: async (name, data) => worlds.set(name, structuredClone(data)),
            updateWorldInfoList: async () => {},
        }) };
        const old = createEmptyStore('rollback');
        mergeEntityOperations(old, [{ type: 'location', name: 'Hall', importance: 80, facts: ['Original fact'] }], { messageIndex: 0, minimumImportance: 0 });
        await syncLorebook(old);
        const original = Object.values(worlds.get(old.lorebookName).entries)[0].content;
        const replacement = structuredClone(old);
        replacement.entities['location:hall'].facts = ['Replacement fact'];
        await syncLorebook(replacement);
        if (manuallyEdited) Object.values(worlds.get(old.lorebookName).entries)[0].content = 'User edited this entry';
        await syncLorebook(old, { removeMissing: true, rollbackRenderedHashes: {
            'location:hall': replacement.entities['location:hall'].renderedHash,
        } });
        const content = Object.values(worlds.get(old.lorebookName).entries)[0].content;
        assert.equal(content, manuallyEdited ? 'User edited this entry' : original);
        assert.equal(Boolean(old.entities['location:hall'].manualOverride), manuallyEdited);
    });
}
