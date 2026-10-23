import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,writeBatch,serverTimestamp,deleteDoc,runTransaction,Timestamp} from 'firebase/firestore';
const environment=await initializeTestEnvironment({projectId:'demo-renax-backup',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8')}});
try{
await environment.clearFirestore();const a=environment.authenticatedContext('accountA').firestore(),b=environment.authenticatedContext('accountB').firestore(),guest=environment.unauthenticatedContext().firestore();
const data=(revision,payload='{"type":"song","song":{"id":"s"}}')=>({schema:1,revision,payload,deleted:false,operationId:crypto.randomUUID(),device:'test',updatedAt:serverTimestamp()});
const ref=doc(a,'users/accountA/records/song');
async function permit(tx,db,path,value){
  const [,uid,,recordId]=path.split('/'),limitRef=doc(db,'users/'+uid+'/limits/writes');
  const snap=await tx.get(limitRef),old=snap.exists()?snap.data():null;
  const reset=!old||Date.now()>=old.windowStart.toMillis()+60000;
  return ()=>tx.set(limitRef,{windowStart:reset?serverTimestamp():old.windowStart,count:reset?1:old.count+1,recordId,operationId:value.operationId,updatedAt:serverTimestamp()});
}
async function paired(db,path,value){return runTransaction(db,async tx=>{const commitPermit=await permit(tx,db,path,value);commitPermit();tx.set(doc(db,path),value);tx.set(doc(db,path+'/history/'+value.revision),value);});}
await assertFails(getDoc(doc(guest,'users/accountA/records/song')));
await assertFails(paired(guest,'users/accountA/records/song',data(1)));
await assertSucceeds(paired(a,'users/accountA/records/song',data(1)));
await assertSucceeds(getDoc(ref));await assertFails(getDoc(doc(b,'users/accountA/records/song')));
await assertFails(paired(b,'users/accountA/records/song',data(2)));
await assertFails(setDoc(ref,data(2))); // A revision must have an atomic history entry.
await assertFails(paired(a,'users/accountA/records/song',data(3))); // No skipped revision.
await assertFails(paired(a,'users/accountA/records/song',{...data(2),schema:2}));
await assertFails(paired(a,'users/accountA/records/song',{...data(2),injected:true}));
await assertFails(paired(a,'users/accountA/records/song',{...data(2),deleted:true,payload:'not-empty'}));
await assertFails(paired(a,'users/accountA/records/song',{...data(2),updatedAt:new Date(0)}));
await assertSucceeds(paired(a,'users/accountA/records/song',data(2))); console.log('After revision2:',(await getDoc(ref)).data().revision);
await assertFails(setDoc(doc(a,'users/accountA/records/song/history/1'),data(1)));
await assertFails(deleteDoc(ref));await assertFails(deleteDoc(doc(a,'users/accountA/records/song/history/1')));
console.log('Before tombstone:',(await getDoc(ref)).data().revision);await assertSucceeds(paired(a,'users/accountA/records/song',{...data(3,''),deleted:true}));console.log('Tombstone pass');
await assertFails(getDoc(doc(b,'users/accountA/records/song/history/1')));
// Two clients with revision 3: one atomic writer wins; the second sees a conflict.
const apply=()=>runTransaction(a,async tx=>{const snap=await tx.get(ref);if(snap.data().revision!==3)return 'conflict';const value=data(4),commitPermit=await permit(tx,a,'users/accountA/records/song',value);commitPermit();tx.set(ref,value);tx.set(doc(a,'users/accountA/records/song/history/4'),value);return 'written';});
const outcomes=await Promise.allSettled([apply(),apply()]);assert.equal(outcomes.filter(r=>r.status==='fulfilled'&&r.value==='written').length,1);
assert(outcomes.some(r=>r.status==='fulfilled'&&r.value==='conflict'||r.status==='rejected'&&r.reason.code==='permission-denied'));
assert.equal((await getDoc(ref)).data().revision,4);
await assertFails(getDoc(doc(a,'unrelated/public')));
await assertFails(setDoc(doc(a,'security/deployment'),{enforceWriteBudget:false}));
// A hostile client cannot omit the permit, reset its window or use one permit
// for several records. These exercise the server rules, not a UI debounce.
const hostile=data(5),batch=writeBatch(a);batch.set(ref,hostile);batch.set(doc(a,'users/accountA/records/song/history/5'),hostile);
await assertFails(batch.commit());
const budget=doc(a,'users/accountA/limits/writes');
await assertFails(getDoc(doc(b,'users/accountA/limits/writes')));
await environment.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),'users/accountA/limits/writes'),{windowStart:Timestamp.now(),count:120,recordId:'song',operationId:crypto.randomUUID(),updatedAt:Timestamp.now()});});
await assertFails(paired(a,'users/accountA/records/song',data(5)));
await assertFails(setDoc(budget,{windowStart:serverTimestamp(),count:1,recordId:'song',operationId:crypto.randomUUID(),updatedAt:serverTimestamp()}));
await environment.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),'users/accountA/limits/writes'),{windowStart:Timestamp.fromMillis(Date.now()-61000),count:120,recordId:'song',operationId:crypto.randomUUID(),updatedAt:Timestamp.now()});});
await assertSucceeds(paired(a,'users/accountA/records/song',data(5)));
assert.equal((await getDoc(budget)).data().count,1);
await assertFails(runTransaction(a,async tx=>{const first=data(1),second=data(1),commitPermit=await permit(tx,a,'users/accountA/records/extra',first);commitPermit();for(const [id,value]of [['extra',first],['bypass',second]]){tx.set(doc(a,'users/accountA/records/'+id),value);tx.set(doc(a,'users/accountA/records/'+id+'/history/1'),value);}}));
console.log('Server write budget PASS: no omitted permit, no early reset, no cross-account read, exhausted window denied, expired window reset, multi-record bypass denied');
console.log('Firestore rules PASS: anonymous denial, account isolation, immutable history, schema/fields, server time, revision CAS, tombstones and atomic concurrent writers');
}finally{await environment.cleanup();}
