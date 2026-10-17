/** Reconcile creator-authored NPC source facets without changing story-earned memories. */
const sourceKey = id => {let n=2166136261;for(const ch of String(id))n=Math.imul(n^ch.charCodeAt(0),16777619);return 'lorebook_source_'+(n>>>0).toString(16);};
export function reconcileNpcLorebookBrains(store,npcs,{normalizeBrainRecord,canonicalNameKey}={}) {
    if(!store||typeof normalizeBrainRecord!=='function')throw Error('Core brain normalizer required');
    store.brains ||= {};
    store.npcLorebookSources ||= {};
    const previous=store.npcLorebookSources, seen=new Set();
    let created=0,updated=0,removed=0,unchanged=0;
    for(const npc of npcs||[]){
        const sourceId=npc?.source?.sourceId, fingerprint=npc?.source?.fingerprint, name=npc?.name;
        if(!sourceId||!fingerprint||!name||seen.has(sourceId))continue;
        seen.add(sourceId);
        const prior=previous[sourceId];
        let brain=(prior?.brainId&&store.brains[prior.brainId])||store.brains[canonicalNameKey(name)];
        const newBrain=!brain;
        if(!brain){
            brain=normalizeBrainRecord({name,identityKind:'public_name',aliases:npc.aliases||[],firstSeenMessage:-1,lastSeenMessage:-1});
            if(!brain)continue;
            store.brains[brain.id]=brain;
            created++;
        }
        brain.persistentSelf ||= {facets:{},voice:{},relationships:{}};
        brain.persistentSelf.facets ||= {};
        const key=sourceKey(sourceId), statement=String(npc.content||'').trim().slice(0,1200);
        if(!statement)continue;
        const entry=brain.persistentSelf.facets[key];
        if(entry?.basis!=='lorebook'||entry.statement!==statement||prior?.fingerprint!==fingerprint){
            brain.persistentSelf.facets[key]={key,kind:'personal_anchor',statement,confidence:'confirmed',basis:'lorebook',sourceMessage:-1,updatedAt:Date.now()};
            if(!newBrain)updated++;
        }else unchanged++;
        brain.aliases=[...new Set([...(brain.aliases||[]),...(npc.aliases||[])])].slice(0,20);
        previous[sourceId]={brainId:brain.id,facetKey:key,fingerprint};
    }
    for(const [id,prior] of Object.entries(previous)){
        if(seen.has(id))continue;
        const facets=store.brains[prior.brainId]?.persistentSelf?.facets;
        if(facets?.[prior.facetKey]?.basis==='lorebook')delete facets[prior.facetKey];
        delete previous[id];removed++;
    }
    return {created,updated,removed,unchanged,count:seen.size,changed:created+updated+removed>0};
}
