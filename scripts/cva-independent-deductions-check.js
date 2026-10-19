const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PROFILE,resolveForm,resolvePinnedForm,validateResponse,scoreResponse}=require('../src/features/forms/contract');
const {canonicalize,sha256}=require('../src/features/forms/contract/canonical');
const {createCvaDraft,changeCvaMask,RATINGS,cvaEnvelope}=require('../src/features/cupping/data/cvaResponse');
const {fixture:stateFixture}=require('./helpers/session-state-fixture');
const state=require('../src/data/localTastingState');
const ui=require('./cva-zero-default-check');
const trusted={profile:PROFILE,f:1,identity:resolveForm(PROFILE,1).identity};
const oldManifest=require('../src/features/forms/contract/manifests/cva-v2.json');
const oldPin={form_key:oldManifest.form_key,form_version:'2.0.0',form_hash:'74c34bdb55364410f9ba828940b5453984188c4ac5a8cc314b567c86c52a581f'};
const oldTrusted={profile:PROFILE,f:1,identity:oldPin};
const ratings=Object.fromEntries(Object.values(RATINGS).map(key=>[key,7]));
const final=n=>({...createCvaDraft(n),ratings:{...ratings}});
const score=(response,n,context=trusted)=>scoreResponse(cvaEnvelope(response,context,n,true),context);
async function main(){
  assert.equal(trusted.identity.form_version,'3.0.0');
  assert.equal(sha256(canonicalize(oldManifest)),oldPin.form_hash);
  assert.equal(fs.readFileSync(require.resolve('../src/features/forms/contract/fixtures/cva-v2.canonical.json'),'utf8'),canonicalize(oldManifest)+'\n');
  for(let n=1;n<=8;n++){
    const all=Array.from({length:n},(_,i)=>i+1);
    for(const selected of [[1],all])for(const uniform of n===1?[[]]:[[],[n],all])for(const even of [null,false,true,undefined]){
      let response=changeCvaMask(final(n),'phenolic',selected,n);
      response=changeCvaMask(response,'potato',selected,n);
      response={...response,non_uniform_cups:uniform,evenly_defective_all_cups:even};
      if(even===undefined)delete response.evenly_defective_all_cups;
      const result=score(response,n);assert.equal(result.ok,true,JSON.stringify(result));
      const quarter=Math.floor((2*(21*56*n+1688*n-320*uniform.length-640*selected.length)+8*n)/(16*n));
      assert.equal(result.display_score,(quarter/4).toFixed(2));
      assert.match(result.label,/Cup App.*independent deductions/);assert.equal(result.export_projection.label,result.label);
      assert.deepEqual(response.non_uniform_cups,uniform,'defect selection does not mirror Uniformity');
    }
    assert.equal(score({...final(n),non_uniform_cups:null},n).ok,false);
    assert.equal(score({...final(n),ratings:{}},n).ok,false);
  }
  const defect=changeCvaMask(final(5),'phenolic',[3],5);
  assert.equal(score(final(5),5).display_score,'89.50');assert.equal(score(defect,5).display_score,'85.50');
  assert.equal(score({...defect,non_uniform_cups:[3]},5).display_score,'83.50');
  assert.equal(score({...defect,non_uniform_cups:[2]},5).display_score,'83.50');
  for(const response of [{...defect,defective_cups:[]},{...defect,defect_type_masks:{phenolic:[6]}},{...defect,non_uniform_cups:[2,2]},
    {...defect,evenly_defective_all_cups:'yes'},{...defect,ratings:{...ratings,aroma:10}}])assert.equal(score(response,5).ok,false);
  assert.equal(score({...final(1),non_uniform_cups:[1]},1).ok,false);
  assert.ok(score(defect,5,oldTrusted).errors.includes('defective_cups:not_non_uniform'),'frozen v2 retains subset rule');
  assert.equal(score({...defect,non_uniform_cups:[3]},5,oldTrusted).display_score,'83.50');
  assert.equal(resolvePinnedForm(PROFILE,1,{...oldPin,form_hash:trusted.identity.form_hash}).ok,false);
  assert.equal(validateResponse(cvaEnvelope(defect,trusted,5),oldTrusted).ok,false);
  for(let n=1;n<=8;n++){
    const props=await ui.fixture(n);let {tree,ui:screen}=await ui.open(props);
    for(const label of Object.keys(RATINGS)){ui.first(tree,node=>node.props?.accessibilityLabel===`${label} 7 of 9`).props.onPress();tree=screen.render();}
    ui.first(tree,node=>node.type==='DefectsSection').props.onChangeDefectCupSlots('phenolic',Array.from({length:n},(_,i)=>i+1));tree=screen.render();
    assert.ok(!JSON.stringify(tree).includes('Are the defects even across all cups?'));
    if(n>1)assert.deepEqual(ui.first(tree,node=>node.type?.name==='ZeroAssessment'&&node.props.label==='Uniformity').props.cups,[]);
    await ui.first(tree,node=>node.type==='FooterButton').props.onPress();tree=screen.render();
    const saved=await ui.repo.getCvaResponse(props.sessionId,props.sampleId);assert.equal(saved.complete,true);assert.equal(saved.result.display_score,'69.50');
    assert.deepEqual(saved.response.non_uniform_cups,[]);screen.close();
    const reopened=await ui.open(props);assert.equal((await ui.repo.getCvaResponse(props.sessionId,props.sampleId)).result.display_score,'69.50');reopened.ui.close();
    const p=await ui.repo.getLocalTastingPresentation(props.sessionId);assert.equal((await ui.repo.completeLocalTasting(props.sessionId,{expectedContextToken:p.tasting.contextToken})).status,'complete');
  }
  const env=stateFixture(),id='historical-v2',sample=await env.create(id);
  env.sqlite.prepare('UPDATE samples SET cup_number=5 WHERE id=?').run(sample);
  env.sqlite.prepare('UPDATE sessions SET form_key=?,form_version=?,form_hash=? WHERE id=?').run(oldPin.form_key,oldPin.form_version,oldPin.form_hash,id);
  const oldResponse={...defect,non_uniform_cups:[3]},oldResult=score(oldResponse,5,oldTrusted),now='2026-10-19T08:00:00.000Z';
  env.sqlite.prepare('INSERT INTO cva_response_revisions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('old-v2',id,sample,1,oldPin.form_key,oldPin.form_version,oldPin.form_hash,5,canonicalize(oldResponse),1,canonicalize(oldResult),'sca104-exact-quarter-v1','sca104-three-types-v1',now);
  env.sqlite.prepare('INSERT INTO local_response_streams(session_id,sample_id,local_profile_id,bound_at) VALUES(?,?,?,?)').run(id,sample,env.actorA,now);
  await env.bridge.withExclusiveTransactionAsync(txn=>state.completeWithDb(txn,id,env.actorA));
  const snapshot=()=>JSON.stringify(env.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name})=>[name,env.sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]));
  const before=snapshot();env.reload();
  const historical=await env.repo.getCvaResponse(id,sample);
  assert.equal(historical.historicalReadOnly,true);assert.equal(historical.access.canWrite,false);assert.equal(historical.access.canAdopt,false);
  assert.equal(historical.identity.visible,true,'previous qualified blind reveal remains qualified');assert.deepEqual(historical.result,oldResult);
  assert.equal((await env.repo.getSessionSampleFinalStatus(id))[sample].finalScore,'83.50');
  assert.equal((await env.repo.getSampleFeedback(sample)).Fragrance[0].score,7);
  const presentation=await env.repo.getLocalTastingPresentation(id);assert.equal(presentation.tasting.canManageSetup,false);assert.equal(presentation.tasting.canComplete,false);
  await assert.rejects(env.save(id,sample,oldResponse),/historical_read_only/);
  await assert.rejects(env.repo.getOwnedSessionSetup(id));
  await assert.rejects(env.repo.adoptSavedTasting({sessionId:id,sampleId:sample,expectedSourceToken:'forged'}));
  await assert.rejects(env.repo.completeLocalTasting(id,{expectedContextToken:presentation.tasting.contextToken}));
  assert.equal(snapshot(),before,'historical reads and denied writes retain every stored byte/pin/result/history');
  const oldProps=await ui.fixture(5);
  ui.db.prepare('UPDATE sessions SET form_key=?,form_version=?,form_hash=? WHERE id=?').run(oldPin.form_key,oldPin.form_version,oldPin.form_hash,oldProps.sessionId);
  const oldDraft={...final(5),ratings:{},non_uniform_cups:null};
  ui.db.prepare('INSERT INTO cva_response_revisions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('old-draft',oldProps.sessionId,oldProps.sampleId,1,oldPin.form_key,oldPin.form_version,oldPin.form_hash,5,canonicalize(oldDraft),0,null,'sca104-exact-quarter-v1','sca104-three-types-v1',now);
  const oldBytes=ui.rows(),oldPins=ui.pins(),oldScreen=await ui.open(oldProps);
  assert.match(JSON.stringify(oldScreen.tree),/Historical CVA version 2.0.0 — read-only/);
  assert.equal(ui.first(oldScreen.tree,node=>node.props?.accessibilityLabel==='Fragrance 7 of 9').props.disabled,true);
  oldScreen.ui.close();assert.equal(ui.rows(),oldBytes);assert.equal(ui.pins(),oldPins);
  ui.db.close();console.log('Independent CVA v3 deductions, actual screen/SQLite Save/reopen/completion, frozen-v2 read-only preservation passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
