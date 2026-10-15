import test from 'node:test';
import assert from 'node:assert/strict';
import { extractLorebookNpcs, scopedLorebookNames, formatNpcLorebookFoundation } from '../npc-lorebook-importer.js';
import { reconcileNpcLorebookBrains } from '../npc-lorebook-runtime.js';

const npc={uid:7,comment:'[NPC] Elara',key:['Elara'],content:'Personality: guarded. Motivation: protect the princess.'};
const book={name:'Cast',data:{entries:{7:npc}}};
const normalizeBrainRecord=({name,aliases=[]})=>({id:name.toLowerCase(),name,aliases,persistentSelf:{facets:{},voice:{},relationships:{}}});
const helpers={normalizeBrainRecord,canonicalNameKey:name=>name.toLowerCase()};
test('imports explicitly identified NPC',()=>{assert.equal(extractLorebookNpcs([book])[0].name,'Elara');});
test('does not import generic entry in balanced mode',()=>{assert.equal(extractLorebookNpcs([{name:'Other',data:{entries:{1:{comment:'Castle',content:'Stone walls',key:['Castle']}}}}]).length,0);});
test('restricts to attached books',()=>{const ctx={chatMetadata:{world_info:'Cast'},characters:[{data:{extensions:{world:'History'}}}],characterId:0};assert.deepEqual(scopedLorebookNames(ctx),['Cast','History']);});
test('injects canon with explicit provenance',()=>{const n=extractLorebookNpcs([book]);assert.match(formatNpcLorebookFoundation(n),/AUTHORITATIVE_NPC_LOREBOOK/);});
test('preserves source and story memory separately',()=>{
 const store={brains:{}},n=extractLorebookNpcs([book]);
 assert.equal(reconcileNpcLorebookBrains(store,n,helpers).created,1);
 store.brains.elara.persistentSelf.facets.friendship={basis:'story',statement:'Trusted player'};
 assert.equal(reconcileNpcLorebookBrains(store,[],helpers).removed,1);
 assert.equal(store.brains.elara.persistentSelf.facets.friendship.statement,'Trusted player');
});
test('adds source to established brain and reports change',()=>{
 const store={brains:{elara:normalizeBrainRecord({name:'Elara'})}};
 const result=reconcileNpcLorebookBrains(store,extractLorebookNpcs([book]),helpers);
 assert.equal(result.updated,1);assert.equal(result.changed,true);
});
