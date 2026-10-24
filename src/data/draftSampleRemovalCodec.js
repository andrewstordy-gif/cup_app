// Approved isolated clearing profile. No radio, database or logging side effects.
const {canonicalize,sha256,validateMetadata,validateSettings,metadataMatches,encodeUtf8,decodeTextPayload}=require('./sampleCodeProfile');
const fail=()=>{throw new Error('removal:unsupported_cup');};
function flatObject(raw){
  let value;try{value=JSON.parse(raw);}catch{fail();}
  if(!value||typeof value!=='object'||Array.isArray(value))fail();
  let at=0;const skip=()=>{while(at<raw.length&&/\s/.test(raw[at]))at++;};
  const string=()=>{const start=at++;while(at<raw.length){const c=raw[at++];if(c==='\\'){at++;continue;}if(c==='"')return raw.slice(start,at);}fail();};
  skip();if(raw[at++]!=='{')fail();skip();const seen=new Set();
  while(raw[at]!=='}'){
    if(raw[at]!=='"')fail();const key=JSON.parse(string());if(seen.has(key))fail();seen.add(key);skip();if(raw[at++]!==':')fail();skip();
    if(raw[at]==='"')string();else{if(raw[at]==='{'||raw[at]==='[')fail();while(at<raw.length&&raw[at]!==','&&raw[at]!=='}')at++;}
    skip();if(raw[at]===','){at++;skip();}else if(raw[at]!=='}')fail();
  }
  at++;skip();if(at!==raw.length)fail();return value;
}
function hardwareUid(tag){
  const id=tag?.id??tag?.identifier??tag?.serialNumber;
  if(Array.isArray(id)){if(!id.length||id.some(n=>!Number.isInteger(n)||n<0||n>255))fail();return id.map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();}
  if(typeof id!=='string'||!id.replace(/[^a-z0-9]/gi,''))fail();return id.replace(/[^a-z0-9]/gi,'').toUpperCase();
}
function state(value){if(!value||Object.keys(value).length!==1||!Number.isInteger(value.s)||value.s<0||value.s>4)fail();return value.s;}
function telemetry(value){
  if(Object.keys(value).some(k=>!['t','m','b','u','v'].includes(k)))fail();
  if(Object.hasOwn(value,'t')&&!Number.isSafeInteger(value.t)||Object.hasOwn(value,'m')&&(!Number.isSafeInteger(value.m)||value.m<0)||
    Object.hasOwn(value,'b')&&(!Number.isInteger(value.b)||value.b<0||value.b>100)||
    Object.hasOwn(value,'u')&&(typeof value.u!=='string'||!value.u.trim())||
    Object.hasOwn(value,'v')&&!semanticVersion(value.v))fail();
}
function semanticVersion(value){
  if(typeof value!=='string')return false;
  const match=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  return Boolean(match&&match[0]===value&&(!match[4]||match[4].split('.').every(part=>!/^\d+$/.test(part)||part==='0'||part[0]!=='0')));
}
function readRemovalTag(result){
  const uid=hardwareUid(result?.tag),records=result?.tag?.ndefMessage;
  if(!Array.isArray(records)||![1,4].includes(records.length)||result.recordCount!==records.length)fail();
  const values=records.map(record=>{
    if(record?.tnf!==1||!Array.isArray(record.type)||record.type.length!==1||record.type[0]!==84||
      record.id!=null&&(!Array.isArray(record.id)||record.id.length)||!Array.isArray(record.payload)||
      record.payload.some(n=>!Number.isInteger(n)||n<0||n>255))fail();
    return flatObject(decodeTextPayload(record.payload));
  });
  if(records.length===1){
    if(result.tag.icManufacturerCode||result.tag.icSerialNumber||/^E0/.test(uid))fail();
    const metadata=Object.keys(values[0]).length?validateMetadata(values[0]):{};
    return {uid,kind:'ntag',state:null,settings:null,metadata};
  }
  const s=state(values[0]);telemetry(values[1]);
  return {uid,kind:'smart',state:s,settings:validateSettings(values[2]),metadata:Object.keys(values[3]).length?validateMetadata(values[3]):{}};
}
function clearBytes(context){
  const values=context.kind==='ntag'?[{}]:context.kind==='smart'?[{s:state({s:context.state})},{},validateSettings(context.settings),{}]:fail();
  return values.flatMap((value,index)=>{
    const payload=[2,101,110,...encodeUtf8(JSON.stringify(value))];
    if(payload.length>255)fail();
    return [(index===0?128:0)|(index===values.length-1?64:0)|17,1,payload.length,84,...payload];
  });
}
function freezeClear(read){
  validateMetadata(read.metadata);if(!['ntag','smart'].includes(read.kind)||!read.uid)fail();
  if(typeof read.uid!=='string'||!/^[A-Z0-9]+$/.test(read.uid)||read.kind==='ntag'&&(read.state!==null||read.settings!==null))fail();
  const bytes=clearBytes(read);
  return JSON.parse(canonicalize({...read,bytes,bytesHash:sha256(canonicalize(bytes))}));
}
function validateFrozen(value){
  if(!value||Object.keys(value).sort().join(',')!=='bytes,bytesHash,kind,metadata,settings,state,uid')fail();
  const expected=freezeClear({uid:value.uid,kind:value.kind,state:value.state,settings:value.settings,metadata:value.metadata});
  if(canonicalize(value)!==canonicalize(expected))fail();return expected;
}
function compareRemovalRead(frozen,read){
  validateFrozen(frozen);
  if(read.uid!==frozen.uid||read.kind!==frozen.kind)return 'mismatch';
  if(read.kind==='smart'&&canonicalize(read.settings)!==canonicalize(frozen.settings))return 'mismatch';
  if(!Object.keys(read.metadata).length)return 'cleared';
  if(metadataMatches(read.metadata,frozen.metadata)&&(read.kind!=='smart'||read.state===frozen.state))return 'original';
  return 'mismatch';
}
function isClearedRead(result){try{return !Object.keys(readRemovalTag(result).metadata).length;}catch{return false;}}
module.exports={flatObject,hardwareUid,readRemovalTag,clearBytes,freezeClear,validateFrozen,compareRemovalRead,isClearedRead};
