const assert=require('node:assert/strict');
const {fixture}=require('./helpers/session-state-fixture');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {parse}=require('@babel/parser'),generate=require('@babel/generator').default;
const tagFor=(id,form,z=7)=>({u:id,f:form,m:form===1?'b':'o',y:1,z,n:'Hidden coffee',p:1,e:'Participant session',t:4,d:261019,i:99});
const snapshot=env=>JSON.stringify(env.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,env.sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]));
async function saveOwn(env,id,sample,form){
 if(form===1)return env.save(id,sample);
 const loaded=await env.repo.getLegacyResponse(id,sample);
 return env.repo.saveLegacyResponse({sessionId:id,sampleId:sample,response:env.legacy(),complete:true,expectedFingerprint:loaded.savedFingerprint});
}
async function lifecycle(form){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'cup-r1-069-retained-')),file=path.join(folder,'test.db');
 const env=fixture(file),id=`lifecycle00${form}`,tag=tagFor(id,form),scan=(cup,z)=>env.repo.resolveActiveSampleFromCupMetadata({cupUUID:cup,metadata:{...tag,z}});
 const a=await scan('FIRST',7),b=await scan('SECOND',12);
 assert.equal(a.cupIndex,0);assert.equal(b.cupIndex,1);assert.equal(b.cupTotal,2);assert.equal(b.sampleNumber,12);
 await saveOwn(env,id,a.sampleId,form);await saveOwn(env,id,b.sampleId,form);await env.complete(id);
 const complete=await env.repo.getLocalTastingPresentation(id);assert.equal(complete.tasting.completed,true);
 const beforeRescan=snapshot(env);await scan('FIRST',7);assert.equal(snapshot(env),beforeRescan,'matching rescan is an exact durable no-op');
 const third=await scan('THIRD',20);assert.equal(third.cupTotal,3);
 assert.equal((await env.repo.getLocalTastingPresentation(id)).tasting.completed,false);
 if(form===1)assert.equal((await env.repo.getLocalTastingPresentation(id)).identityHidden,true);
 const beforeFailure=snapshot(env),token=await env.repo.getParticipantSampleRemovalContext(id,a.sampleId);
 env.failAt('DELETE FROM samples');await assert.rejects(env.repo.removeParticipantSample({sessionId:id,sampleId:a.sampleId,expectedRemovalToken:token.removalToken}),/injected/);env.failAt(null);
 assert.equal(snapshot(env),beforeFailure,'all rows roll back if deletion fails');
 await env.repo.removeParticipantSample({sessionId:id,sampleId:a.sampleId,expectedRemovalToken:token.removalToken});
 await assert.rejects(saveOwn(env,id,a.sampleId,form));
 await assert.rejects(env.repo.removeParticipantSample({sessionId:id,sampleId:a.sampleId,expectedRemovalToken:token.removalToken}));
 const fourth=await scan('FOURTH',30);assert.equal(fourth.cupIndex,2);assert.equal(fourth.sampleNumber,30);
 assert.equal(new Set((await env.repo.getSessionById(id)).samples.map(row=>row.positionIndex)).size,3,'new membership after a gap has unique local ordering');
 for(const row of (await env.repo.getSessionById(id)).samples){const context=await env.repo.getParticipantSampleRemovalContext(id,row.id);assert.equal(context.canRemove,true);await env.repo.removeParticipantSample({sessionId:id,sampleId:row.id,expectedRemovalToken:context.removalToken});}
 env.restart();const empty=await env.repo.getLocalTastingPresentation(id);
 assert.equal(empty.session.samples.length,0);assert.equal(empty.session.status,'in_progress');assert.equal(empty.tasting.canComplete,false);
 await assert.rejects(env.complete(id));
 const readded=await scan('FIRST',7);assert.notEqual(readded.sampleId,a.sampleId);
 const source=form===1?await env.repo.getCvaResponse(id,readded.sampleId):await env.repo.getLegacyResponse(id,readded.sampleId);
 assert.equal(source.access.state,'fresh','re-added membership cannot resurrect deleted results');
 env.sqlite.close();fs.unlinkSync(file);fs.rmdirSync(folder);
}
async function negativeAndRaces(form){
 const env=fixture(),id=`negative000${form}`,tag=tagFor(id,form);
 await assert.rejects(env.repo.resolveActiveSampleFromCupMetadata({cupUUID:'NO-POSITION',metadata:{...tag,z:undefined}}));
 const row=await env.repo.resolveActiveSampleFromCupMetadata({cupUUID:'FIRST',metadata:tag});
 const initial=await env.repo.getParticipantSampleRemovalContext(id,row.sampleId);assert.equal(initial.canRemove,true);
 await saveOwn(env,id,row.sampleId,form);
 await assert.rejects(env.repo.removeParticipantSample({sessionId:id,sampleId:row.sampleId,expectedRemovalToken:initial.removalToken}));
 env.sqlite.prepare('UPDATE sessions SET local_creator_profile_id=? WHERE id=?').run(env.actorB,id);
 assert.equal((await env.repo.getParticipantSampleRemovalContext(id,row.sampleId)).canRemove,false,'another installation creator is not a participant copy');
 env.sqlite.prepare('UPDATE sessions SET local_creator_profile_id=NULL WHERE id=?').run(id);
 env.actor(env.actorB);assert.equal((await env.repo.getParticipantSampleRemovalContext(id,row.sampleId)).canRemove,false,'foreign saved stream cannot be removed');env.actor(env.actorA);
 const own=await env.repo.getParticipantSampleRemovalContext(id,row.sampleId);assert.equal(own.canRemove,true);
 if(form===2){const loaded=await env.repo.getLegacyResponse(id,row.sampleId);await env.repo.saveLegacyResponse({sessionId:id,sampleId:row.sampleId,response:{...env.legacy(),notes:'recovery'},intent:'recovery',expectedFingerprint:loaded.savedFingerprint});
  await assert.rejects(env.repo.removeParticipantSample({sessionId:id,sampleId:row.sampleId,expectedRemovalToken:own.removalToken}));
  env.sqlite.prepare("UPDATE local_legacy_recovery_drafts SET base_fingerprint='corrupt' WHERE sample_id=?").run(row.sampleId);
  assert.equal((await env.repo.getParticipantSampleRemovalContext(id,row.sampleId)).canRemove,false);
 }
 const race=fixture(),raceId=`incarnation0${form}`,metadata=tagFor(raceId,form);
 await race.repo.resolveActiveSampleFromCupMetadata({cupUUID:'OLD-X',metadata});
 const original=race.bridge.getFirstAsync;let interleaved=false;
 race.bridge.getFirstAsync=async(sql,args)=>{const result=await original(sql,args);
  if(!interleaved&&sql==='SELECT status, local_creator_profile_id AS creator FROM sessions WHERE id = ?'){
   interleaved=true;await race.repo.deleteSessionById(raceId);await race.repo.resolveActiveSampleFromCupMetadata({cupUUID:'NEW-Z',metadata:{...metadata,z:20}});
  }return result;};
 await assert.rejects(race.repo.resolveActiveSampleFromCupMetadata({cupUUID:'STALE-Y',metadata:{...metadata,z:12}}),/stale|removed|changed/);
 assert.equal(interleaved,true);assert.deepEqual((await race.repo.getSessionById(raceId)).samples.map(value=>value.cupUUID),['NEW-Z']);
 race.bridge.getFirstAsync=original;
 await race.repo.resolveActiveSampleFromCupMetadata({cupUUID:'STALE-Y',metadata:{...metadata,z:12}});
 const phone=fixture(),phoneId=`phonecopy00${form}`,sample=await phone.create(phoneId,form);
 const phoneTag={...tagFor(phoneId,form),n:'Secret coffee'};
 await phone.repo.deleteSessionById(phoneId);
 const imported=await phone.repo.resolveActiveSampleFromCupMetadata({cupUUID:`TAG-${sample}`,metadata:phoneTag});
 assert.equal(phone.sqlite.prepare('SELECT local_creator_profile_id AS creator FROM sessions WHERE id=?').get(phoneId).creator,null);
 assert.equal((await phone.repo.getSessionById(phoneId)).samples.length,1);
 assert.equal((await phone.repo.getParticipantSampleRemovalContext(phoneId,imported.sampleId)).canRemove,true);
}
async function oldFeedback(){
 const env=fixture(),id='oldfeedback01',sample=(await env.repo.resolveActiveSampleFromCupMetadata({cupUUID:'OLD',metadata:tagFor(id,1)})).sampleId;await env.save(id,sample);
 env.sqlite.exec('CREATE TABLE sample_feedback(id TEXT PRIMARY KEY,session_id TEXT,sample_id TEXT,field_name TEXT,score REAL,comments TEXT,temp_snapshot REAL,time_snapshot TEXT,created_at TEXT,updated_at TEXT)');
 env.sqlite.prepare('INSERT INTO sample_feedback VALUES(?,NULL,?,?,?, ?,NULL,NULL,?,?)').run('old-null',sample,'fragrance',7,'private orphan','2026-10-19','2026-10-19');
 assert.equal((await env.repo.getParticipantSampleRemovalContext(id,sample)).canRemove,false);
}
async function screenChecks(){
 const source=fs.readFileSync(path.resolve(__dirname,'../src/features/cupping/screens/CuppingSessionDetailsScreen.js'),'utf8'),ast=parse(source,{sourceType:'module',plugins:['jsx']});
 function find(node,test){if(!node||typeof node!=='object')return null;if(test(node))return node;for(const value of Object.values(node))for(const child of Array.isArray(value)?value:[value]){const match=find(child,test);if(match)return match;}return null;}
 const init=name=>find(ast,node=>node.type==='VariableDeclarator'&&node.id?.name===name).init;
 const evaluate=(node,deps)=>new Function(...Object.keys(deps),`return (${generate(node).code})`)(...Object.values(deps));
 const candidate={sessionId:'local',sampleId:'sample',token:'token',label:'Sample 7',epoch:1},ref={current:candidate},busy={current:null};
 let release,calls=0,refreshed=null,closed=0,exit=0;
 const deps={participantRemovalRef:ref,participantRemovalBusyRef:busy,sessionId:'local',savedSessionIdRef:{current:'local'},setupEpochRef:{current:1},
  setParticipantRemoval:value=>{if(value===null)closed++;},setIsRemovingParticipantSample(){},removeParticipantSample:async()=>{calls++;return new Promise(resolve=>{release=resolve;});},
  setTastingPresentation:value=>{refreshed=value;},setSamples(){},setSessionStatus(){},setSetupAccess(){},setSampleStatusById(){},setIsSessionDirty(){},setPresentationRevision(){},setScanStatusMessage(){}};
 deps.dismissParticipantRemoval=evaluate(init('dismissParticipantRemoval'),deps);
 const confirm=evaluate(init('confirmParticipantRemoval'),deps),pending=confirm(candidate);
 await confirm(candidate);deps.dismissParticipantRemoval(candidate);assert.equal(ref.current,candidate,'Cancel/Close after accepted Delete cannot discard its pending refresh');assert.equal(calls,1);
 const presentation={session:{id:'local',status:'in_progress',samples:[]},tasting:{completed:false}};
 release({presentation,statuses:{}});await pending;assert.equal(refreshed,presentation);assert.equal(ref.current,null);assert.equal(closed,1);
 ref.current=candidate;deps.dismissParticipantRemoval(candidate);assert.equal(ref.current,null,'Cancel before Delete performs no command');assert.equal(calls,1);
 const exitDeps={...deps,saveOperationRef:{current:null},isNfcWriting:false,isCheckingCup:false,isCompletingSession:false,isDeleting:false,isRemovingParticipantSample:true,verifyingSampleId:null,rewritingSampleId:null,setupContinuationRef:{current:false},isSessionDirty:false};
 evaluate(init('requestSetupExit'),exitDeps)(()=>exit++);assert.equal(exit,0,'header/scan navigation is blocked while deletion settles');
 const h=require('./cva-zero-default-check');const props=await h.fixture(1),swipes=[];
 for(const [number,index]of[[7,0],[12,1]]){const opened=await h.open({...props,sampleNumber:number,cupIndex:index,cupTotal:2,canSwipeSamples:true,onSampleSwipe:value=>swipes.push(value)});
  const pager=h.first(opened.tree,node=>typeof node.props?.onPanResponderRelease==='function');
  pager.props.onPanResponderRelease(null,{dx:-80});pager.props.onPanResponderRelease(null,{dx:80});opened.ui.close();}
 assert.deepEqual(swipes,['next','previous'],'paging uses dense local indexes rather than assigned cup numbers');h.db.close();
}
async function main(){
 for(const form of [1,2]){
  const env=fixture(),id=form===1?'participant001':'participant002';
  const tag={u:id,f:form,m:form===1?'b':'o',y:5,z:7,n:'Hidden coffee',p:1,e:'Participant session',t:4,d:261019,i:10};
  const first=await env.repo.resolveActiveSampleFromCupMetadata({cupUUID:'tag-first',metadata:tag});
  assert.equal((await env.repo.getSessionById(id)).samples.length,1);
  assert.equal(first.sampleNumber,7);
  assert.equal((await env.repo.getSessionSetupAccess(id)).canManageSetup,false);
  const get=()=>env.repo.getParticipantSampleRemovalContext(id,first.sampleId);
  assert.equal((await get()).canRemove,true);
  const remove=await env.repo.removeParticipantSample({sessionId:id,sampleId:first.sampleId,expectedRemovalToken:(await get()).removalToken});
  assert.equal(remove.presentation.session.status,'in_progress');
  assert.equal(remove.presentation.session.samples.length,0);assert.equal(remove.presentation.tasting.canComplete,false);
  const readded=await env.repo.resolveActiveSampleFromCupMetadata({cupUUID:'tag-first',metadata:tag});
  assert.notEqual(readded.sampleId,first.sampleId);
 }
 for(const form of [1,2]){await lifecycle(form);await negativeAndRaces(form);}
 await oldFeedback();await screenChecks();
 console.log('Participant local sample lifecycle checks passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
