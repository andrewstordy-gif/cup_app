// TEMPORARY R154 diagnostic. Never pass objects, errors or physical/user data.
const STAGES=new Set(['ui-write','prepare','context','before-write']);
const CATEGORIES=new Set(['native-request','read-callback','observers','prepare-call','prepared','native-return','envelope','drawer','destination-context','pending-context','revision','cup-binding','cup-uid','cup-family','assignment','smart-binding','eligibility','staging-or-ack','ready','ledger','candidate-context','dispatch-context','dispatch-revision','dispatch-eligibility','authorized']);
export function logReassignmentProbe(stage,category,rejected=false){
 try{
  if(typeof __DEV__==='undefined'||__DEV__!==true||!STAGES.has(stage)||!CATEGORIES.has(category)||typeof rejected!=='boolean')return;
  console.log('NFC reassignment probe',{stage,category,rejected});
 }catch{/* Diagnostics must never affect NFC, persistence or error identity. */}
}
