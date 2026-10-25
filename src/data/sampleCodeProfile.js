// Integrated two-character sample-code profile. No radio or DB-open effects.
const { canonicalize, sha256 } = require('../features/forms/contract/canonical');
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const POOL = Object.freeze(Array.from(ALPHABET, a => Array.from(ALPHABET, b => a + b)).flat());
const validCode = value => typeof value === 'string' && value.length === 2 && /^[A-Z0-9]{2}$/.test(value);
const validSession = value => typeof value === 'string' && value.length === 14 && /^[a-z0-9]{14}$/.test(value);
const fail = () => { throw new Error('Unsupported or damaged sample-code assignment. No local data was changed.'); };
const KEYS = ['n','p','y','i','z','m','f','e','t','d','u'];
function validateMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !KEYS.includes(k)) || KEYS.filter(k=>k!=='i').some(k=>!Object.hasOwn(value,k))) fail();
  if (!validCode(value.z) || !validSession(value.u) || !Number.isInteger(value.y) || value.y<1 || value.y>8 || ![1,2].includes(value.f) || !['b','o'].includes(value.m) || value.f===2&&value.m!=='o') fail();
  if (!['n','e'].every(k=>typeof value[k]==='string'&&value[k].length>0&&value[k]===value[k].trim()) || !Number.isInteger(value.p)||value.p<1||value.p>23||!Number.isInteger(value.t)||value.t<1||value.t>7) fail();
  if (!Number.isSafeInteger(value.d)||value.d<0||value.d>991231 || Object.hasOwn(value,'i')&&(!Number.isSafeInteger(value.i)||value.i<1)) fail();
  const year=2000+Math.floor(value.d/10000),month=Math.floor(value.d/100)%100,day=value.d%100,date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)fail();
  return Object.fromEntries(KEYS.filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]]));
}
function parseFlatObject(raw) {
  if(typeof raw!=='string')fail();
  let parsed;try{parsed=JSON.parse(raw);}catch{fail();}
  let at=0;const skip=()=>{while(at<raw.length&&/\s/.test(raw[at]))at++;};
  function stringEnd(){const start=at++;while(at<raw.length){const c=raw[at++];if(c==='\\'){at++;continue;}if(c==='"')return raw.slice(start,at);}fail();}
  skip();if(raw[at++]!=='{')fail();skip();const seen=new Set();
  while(raw[at]!=='}'){
    if(raw[at]!=='"')fail();const key=JSON.parse(stringEnd());if(seen.has(key))fail();seen.add(key);
    skip();if(raw[at++]!==':')fail();skip();
    if(raw[at]==='"')stringEnd();else{if(raw[at]==='{'||raw[at]==='[')fail();while(at<raw.length&&raw[at]!==','&&raw[at]!=='}')at++;}
    skip();if(raw[at]===','){at++;skip();}else if(raw[at]!=='}')fail();
  }
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail();
  return parsed;
}
function parseMetadata(raw){return validateMetadata(parseFlatObject(raw));}
function secureIndex(length) {
  const Crypto=require('expo-crypto');
  if(typeof Crypto.getRandomValues!=='function')throw new Error('Secure random generation is unavailable. No cup was written.');
  const limit=Math.floor(65536/length)*length;
  for(let attempt=0;attempt<32;attempt++){const bytes=new Uint8Array(2);Crypto.getRandomValues(bytes);const n=bytes[0]*256+bytes[1];if(n<limit)return n%length;}
  throw new Error('Secure random generation failed. No cup was written.');
}
const SCHEMA = `CREATE TABLE IF NOT EXISTS sample_code_issuers (
  session_id TEXT PRIMARY KEY NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL, incarnation TEXT NOT NULL UNIQUE, profile INTEGER NOT NULL CHECK(profile=103)
);
CREATE TABLE IF NOT EXISTS issued_sample_codes (
  session_id TEXT NOT NULL REFERENCES sample_code_issuers(session_id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK(length(code)=2 AND code NOT GLOB '*[^A-Z0-9]*'),
  operation_id TEXT NOT NULL UNIQUE, PRIMARY KEY(session_id,code)
);
CREATE TABLE IF NOT EXISTS physical_code_observations (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  code TEXT NOT NULL, physical_uid TEXT NOT NULL,
  PRIMARY KEY(session_id,code,physical_uid)
);
CREATE TABLE IF NOT EXISTS sample_code_commit_outcomes (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL UNIQUE, actor_id TEXT NOT NULL, outcome_json TEXT NOT NULL,
  PRIMARY KEY(session_id,operation_id)
);`;
async function reserveWithDb(db,sessionId,actor,operationId) {
  if(!validSession(sessionId))fail();
  const issuer=await db.getFirstAsync('SELECT * FROM sample_code_issuers WHERE session_id=?',[sessionId]);
  if(!issuer||issuer.actor_id!==actor||issuer.profile!==103||!issuer.incarnation)throw new Error('This session has no complete local code ledger. Setup is unavailable.');
  const rows=await db.getAllAsync('SELECT code FROM issued_sample_codes WHERE session_id=?',[sessionId]);
  if(rows.some(row=>!validCode(row.code)))fail();
  const used=new Set(rows.map(row=>row.code)),remaining=POOL.filter(code=>!used.has(code));
  if(!remaining.length)throw new Error('All 1,296 sample codes in this session have been used. No cup was written.');
  const code=remaining[secureIndex(remaining.length)];
  await db.runAsync('INSERT INTO issued_sample_codes(session_id,code,operation_id) VALUES (?,?,?)',[sessionId,code,operationId]);
  return code;
}
function metadataMatches(actual,expected){try{return canonicalize(validateMetadata(actual))===canonicalize(validateMetadata(expected));}catch{return false;}}
function logInvalidSettings(value,keys){
  try{
    if(typeof __DEV__==='undefined'||__DEV__!==true)return;
    const shape=value===null?'null':Array.isArray(value)?'array':typeof value;
    const object=shape==='object';
    const fields=keys.map(field=>{
      const descriptor=object?Object.getOwnPropertyDescriptor(value,field):null;
      if(!descriptor)return {field,type:'absent',reason:field==='k'?'optional_absent':'missing'};
      if(!Object.hasOwn(descriptor,'value'))return {field,type:'accessor',reason:'unavailable'};
      const entry=descriptor.value,type=entry===null?'null':Array.isArray(entry)?'array':typeof entry;
      const reason=type!=='number'?'invalid_type':!Number.isSafeInteger(entry)?'not_safe_integer':entry<0?'negative':field==='k'&&![1,3].includes(entry)?'unsupported_led_count':'valid';
      return {field,type,reason};
    });
    console.log('NFC settings validation rejected',{shape,unexpectedFieldCount:object?Object.keys(value).filter(key=>!keys.includes(key)).length:0,fields});
  }catch{ /* Diagnostics must not mask the original validation failure. */ }
}
function validateSettings(value){
  const keys=['r','a','w','c','x','l','k'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||keys.filter(k=>k!=='k').some(k=>!Object.hasOwn(value,k))||Object.values(value).some(v=>!Number.isSafeInteger(v)||v<0)||Object.hasOwn(value,'k')&&![1,3].includes(value.k)){
    logInvalidSettings(value,keys);
    throw new Error('Smart cup settings are invalid. No cup was written.');
  }
  return Object.fromEntries(keys.filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]]));
}
function tagContext(result){
  const count=result?.recordCount;
  if(count===0||count===1)return {kind:'ntag'};
  if(count!==4)throw new Error('Unsupported cup record structure. No cup was written.');
  const state=parseFlatObject(result.parsed.raw.text1);
  if(Object.keys(state).length!==1||!Number.isInteger(state.s)||state.s<0||state.s>4)throw new Error('Smart cup state is invalid. No cup was written.');
  let settings;try{settings=parseFlatObject(result.parsed.raw.text3);}catch{throw new Error('Smart cup settings are unavailable.');}
  return {kind:'smart',settings:validateSettings(settings)};
}
function encodeUtf8(text){
  canonicalize(text);const out=[];
  for(const character of text){const p=character.codePointAt(0);if(p<128)out.push(p);else if(p<2048)out.push(192|(p>>6),128|(p&63));else if(p<65536)out.push(224|(p>>12),128|((p>>6)&63),128|(p&63));else out.push(240|(p>>18),128|((p>>12)&63),128|((p>>6)&63),128|(p&63));}
  return out;
}
function decodeTextPayload(payload){
  if(!Array.isArray(payload)||payload[0]!==2||payload[1]!==101||payload[2]!==110)fail();
  let text='';
  for(let i=3;i<payload.length;){const first=payload[i++];let point,length,min;
    if(first<128){point=first;length=0;min=0;}else if(first>=194&&first<=223){point=first&31;length=1;min=128;}else if(first>=224&&first<=239){point=first&15;length=2;min=2048;}else if(first>=240&&first<=244){point=first&7;length=3;min=65536;}else fail();
    for(let n=0;n<length;n++){const byte=payload[i++];if(!Number.isInteger(byte)||byte<128||byte>191)fail();point=(point<<6)|(byte&63);}
    if(point<min||point>1114111||point>=55296&&point<=57343)fail();text+=String.fromCodePoint(point);
  }
  return text;
}
function wireProof(payload){
  const validated=validateMetadata(payload),order=['n','p','y','i','z','e','t','d','u','m','f'];
  const wireMetadataJson=JSON.stringify(Object.fromEntries(order.filter(key=>Object.hasOwn(validated,key)).map(key=>[key,validated[key]])));
  return {wireMetadataJson,wireMetadataBytes:encodeUtf8(wireMetadataJson),semanticHash:sha256(canonicalize(validated))};
}
module.exports={POOL,validCode,validSession,validateMetadata,parseMetadata,metadataMatches,validateSettings,tagContext,encodeUtf8,decodeTextPayload,wireProof,SCHEMA,reserveWithDb,canonicalize,sha256};
