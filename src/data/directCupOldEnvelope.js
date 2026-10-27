// Explicit reassignment ONLY: old assignment bytes are not an import contract.
const {canonicalize,sha256,decodeTextPayload,parseMetadata}=require('./sampleCodeProfile');
const {hardwareUid,readRemovalTag}=require('./draftSampleRemovalCodec');
const fail=()=>{throw new Error('direct_reassignment:unfinished');};
function assignment(payloadBytes){
 if(!Array.isArray(payloadBytes)||payloadBytes.length>262144||!payloadBytes.every(v=>Number.isInteger(v)&&v>=0&&v<=255))fail();
 const text=decodeTextPayload(payloadBytes);let typedMetadata=null;
 try{const typed=parseMetadata(text);canonicalize(typed);typedMetadata=typed;}catch{}
 return {payloadBytes:[...payloadBytes],payloadHash:sha256(canonicalize(payloadBytes)),typedMetadata};
}
function read(result){
 const uid=hardwareUid(result?.tag),records=result?.tag?.ndefMessage;
 if(!Array.isArray(records)||![1,4].includes(records.length)||result.recordCount!==records.length||records.reduce((n,r)=>n+(r?.payload?.length||0),0)>1048576)fail();
 for(const r of records)if(r.tnf!==1||!Array.isArray(r.type)||r.type.length!==1||r.type[0]!==84||r.id!=null&&(!Array.isArray(r.id)||r.id.length)||!Array.isArray(r.payload)||r.payload.length>262144||!r.payload.every(v=>Number.isInteger(v)&&v>=0&&v<=255))fail();
 const old=assignment(records[records.length-1].payload);
 // Reuse the UNCHANGED strict physical/protected-record validator. This synthetic
 // final {} validates only the envelope; it is never a physical clear proof.
 const protectedRead=readRemovalTag({...result,tag:{...result.tag,ndefMessage:records.map((r,i)=>i===records.length-1?{...r,payload:[2,101,110,123,125]}:r)}});
 return JSON.parse(canonicalize({uid,kind:protectedRead.kind,state:protectedRead.state,settings:protectedRead.settings,assignment:old}));
}
function blank(read){try{const text=decodeTextPayload(read.assignment.payloadBytes);if(!text.trim())return true;const v=JSON.parse(text);return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===0;}catch{return false;}}
module.exports={assignment,read,blank};
