const MAX_BYTES=10*1024*1024;
const TYPES=new Set(['indexing','merchant','wix']);
const json=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function error(status,message){return json({error:message},status);}
function configured(env){return Boolean(env.SEO_REPORTS&&env.ACCESS_TEAM_DOMAIN&&env.ACCESS_AUD);}
function b64url(input){const s=input.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(s+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));}
async function verifyAccess(request,env){
 const token=request.headers.get('Cf-Access-Jwt-Assertion');if(!token)return false;
 const parts=token.split('.');if(parts.length!==3)return false;
 try{
  const header=JSON.parse(new TextDecoder().decode(b64url(parts[0])));
  const payload=JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  if(header.alg!=='RS256'||!header.kid)return false;
  const now=Math.floor(Date.now()/1000);
  const issuer='https://'+env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//,'').replace(/\/$/,'');
  if(payload.iss!==issuer||!Array.isArray(payload.aud)||!payload.aud.includes(env.ACCESS_AUD)||payload.exp<=now||payload.nbf>now)return false;
  const jwksResponse=await fetch(issuer+'/cdn-cgi/access/certs');if(!jwksResponse.ok)return false;
  const jwks=await jwksResponse.json();const jwk=jwks.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)return false;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64url(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
 }catch{return false;}
}
export async function onRequest(context){
 const {request,env}=context;
 if(!configured(env))return error(503,'Admin API is not configured. Set ACCESS_TEAM_DOMAIN and ACCESS_AUD in Pages settings.');
 if(!await verifyAccess(request,env))return error(403,'Authentication could not be verified. Sign in through Cloudflare Access.');
 if(request.method==='GET'){
  const result=await env.SEO_REPORTS.list({prefix:'reports/',limit:1000});
  const reports=result.objects.map(o=>({key:o.key,type:o.customMetadata?.type||'',filename:o.customMetadata?.filename||o.key.split('/').at(-1),uploadedAt:o.uploaded.toISOString(),size:o.size})).sort((a,b)=>b.uploadedAt.localeCompare(a.uploadedAt));
  return json({reports,truncated:result.truncated});
 }
 if(request.method!=='POST')return error(405,'Method not allowed');
 const url=new URL(request.url),type=url.searchParams.get('type'),filename=url.searchParams.get('filename')||'';
 if(!TYPES.has(type))return error(400,'Invalid report type');
 if(filename.length>180||!filename||/[\/\\\x00-\x1f]/.test(filename)||! /\.(csv|xlsx|xls)$/i.test(filename))return error(400,'Upload a CSV or Excel file with a valid filename');
 const size=Number(request.headers.get('content-length')||0);if(size>MAX_BYTES)return error(413,'Maximum file size is 10 MB');
 const buffer=await request.arrayBuffer();if(buffer.byteLength>MAX_BYTES||!buffer.byteLength)return error(413,'File is empty or exceeds 10 MB');
 const id=crypto.randomUUID();const key='reports/'+type+'/'+new Date().toISOString().slice(0,10)+'/'+id+'/'+filename;
 await env.SEO_REPORTS.put(key,buffer,{httpMetadata:{contentType:'application/octet-stream'},customMetadata:{type,filename}});
 return json({saved:true,key,bytes:buffer.byteLength},201);
}
