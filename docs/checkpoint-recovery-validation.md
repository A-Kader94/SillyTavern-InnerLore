# Checkpoint recovery validation — 2026-10-17

Baseline: 4ab4050b0e37d5d0c8413c367b8dc50e3672cb4c.

The first fix permits failed-rebuild checkpoint recovery without a history edit.
This follow-up restores the actual store from storage response envelopes,
rejects delayed reloads after chat/world/load-generation/revision changes,
restores the prior live store after failed replacement saves, and checks chat
identity and the full analyzed history before saving a rebuild. Intentional
rebuild deletions explicitly bypass the stale-state entity shrink guard.
Embedded metadata restores its previous in-memory snapshot if persistence fails.
Lorebook compensation recognizes the failed rebuild's own rendered text while
preserving distinct manual edits.

## Checks

Run from the repository root:

```sh
node --test tests/lorebook-rollback.test.mjs tests/rebuild-commit.test.mjs tests/storage-reload.test.mjs tests/sqlite-checkpoint-persistence.test.mjs tests/embedded-save-failure.test.mjs tests/incremental-rebuild.test.mjs tests/completed-batch-recovery.test.mjs tests/incremental-derivation.test.mjs tests/llm-client.test.mjs tests/npc-lorebook-integration.test.mjs tests/storage-client.test.mjs
node --check index.js
node --check lorebook.js
node --check embedded-storage.js
git diff --check
```

Result: 40 tests passed; syntax and whitespace checks passed on Node 24.19.0.
The new reload and rebuild commit regressions were observed failing before their
fixes. Entry-point function tests execute the production function source in a VM
with controlled dependencies. Full entry-point integration tests also exercise
rebuild recovery with mocked provider requests and embedded metadata.
SQLite persistence tests call the actual bundled server handlers against a
fresh temporary database, including revision conflicts, subsequent writes,
close/reopen checkpoint restoration and world forks. They do not exercise HTTP
authentication or a running SillyTavern server. Lorebook tests use the real
synchronization implementation with an in-memory World Info service.

## Limits and next checks

- No Android, actual model/provider, or full browser lifecycle test yet.
- SQLite and World Info are separate persistence systems; compensation is
  best-effort, not a cross-system atomic transaction. Persistent failures of
  both the original save and compensation still require recovery.
- Full process interruption after each completed batch is not solved: batch
  checkpoints currently persist on handled failure, not after every batch.
- Live authored-lorebook changes and configuration changes still need explicit
  checkpoint invalidation coverage.
- Abort timing, repeated chat switches, failure before the first batch, and
  full SQLite-backed browser rebuild recovery need broader integration tests.
- Provider reasoning translation and ordinary prompt compaction remain separate
  work. Keep the PR draft until runtime validation.
