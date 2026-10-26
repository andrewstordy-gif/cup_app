// Purpose-specific ordinary assignment bytes. No clear proof, radio or storage.
const {canonicalize,sha256,validateMetadata,validateSettings,wireProof,encodeUtf8,metadataMatches}=require('./sampleCodeProfile');
const {readRemovalTag}=require('./draftSampleRemovalCodec');
const fail=()=>{throw new Error('direct_reassignment:unfinished');};
function original(value){
 if(!value||Object.keys(value).sort().join(',')!=='kind,metadata,settings,state,uid'||typeof value.uid!=='string'||!/^[A-Z0-9]+$/.test(value.uid))fail();
 const metadata=validateMetadata(value.metadata);
 if(value.kind==='ntag'){if(value.state!==null||value.settings!==null)fail();}
 else if(value.kind==='smart'){if(!Number.isInteger(value.state)||value.state<0||value.state>4)fail();validateSettings(value.settings);}else fail();
 return JSON.parse(canonicalize({...value,metadata,settings:value.kind==='smart'?validateSettings(value.settings):null}));
}
function bytesFor(kind,settings,payload){
 const wire=wireProof(payload),values=kind==='ntag'?[wire.wireMetadataJson]:kind==='smart'?['{"s":1}','{}',JSON.stringify(validateSettings(settings)),wire.wireMetadataJson]:fail();
 return values.flatMap((text,index)=>{const payload=[2,101,110,...encodeUtf8(text)],n=payload.length;if(n>262144)fail();const short=n<256;
  return [(index===0?128:0)|(index===values.length-1?64:0)|(short?16:0)|1,1,...(short?[n]:[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]),84,...payload];});
}
function freezeAssignment(old,payload){old=original(old);payload=validateMetadata(payload);const bytes=bytesFor(old.kind,old.settings,payload);
 return JSON.parse(canonicalize({kind:old.kind,settings:old.settings,payload,...wireProof(payload),bytes,bytesHash:sha256(canonicalize(bytes))}));}
function validateAssignment(old,value){if(!value||canonicalize(value)!==canonicalize(freezeAssignment(old,value.payload)))fail();return value;}
const metadataHash=metadata=>sha256(canonicalize(validateMetadata(metadata)));
const bindingHash=old=>sha256(canonicalize({uid:old.uid,kind:old.kind,metadataHash:metadataHash(old.metadata)}));
function sameFamily(old,read){return read.uid===old.uid&&read.kind===old.kind&&(old.kind!=='smart'||canonicalize(read.settings)===canonicalize(old.settings));}
function compare(old,attempt,read){original(old);validateAssignment(old,attempt.frozen);
 if(!sameFamily(old,read))return 'mismatch';
 if(metadataMatches(read.metadata,attempt.frozen.payload)&&(old.kind!=='smart'||read.state===1))return 'written';
 if(metadataMatches(read.metadata,old.metadata)&&(old.kind!=='smart'||read.state===old.state))return 'original';return 'mismatch';}
function allowedRewrite(old,attempts,read){
 if(!sameFamily(old,read))return false;
 if(metadataMatches(read.metadata,old.metadata))return old.kind!=='smart'||read.state===old.state;
 return (old.kind!=='smart'||read.state===1)&&attempts.some(attempt=>attempt.metadataHash===metadataHash(read.metadata)&&attempt.code===read.metadata.z);
}
module.exports={fail,original,read:readRemovalTag,bytesFor,freezeAssignment,validateAssignment,metadataHash,bindingHash,sameFamily,compare,allowedRewrite};
