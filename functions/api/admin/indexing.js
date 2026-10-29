import { unzipSync, strFromU8 } from 'fflate';

const respond=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const decode=s=>s.replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi,(_,num,named)=>num?String.fromCodePoint(num[0].toLowerCase()==='x'?parseInt(num.slice(1),16):Number(num)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[named]));
const b64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
async function authorized(request,env){
 const token=request.headers.get('Cf-Access-Jwt-Assertion');if(!token||!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD)return false;
 try{
  const parts=token.split('.');if(parts.length!==3)return false;
  const header=JSON.parse(new TextDecoder().decode(b64(parts[0]))),p=JSON.parse(new TextDecoder().decode(b64(parts[1])));
const issuer='https://'+env.ACCESS_TEAM_DOMAIN
  .trim()
  .replace(/^https?:\/\//,'')
  .replace(/\/+$/,'');

const normalizeIssuer=s=>String(s||'')
  .trim()
  .replace(/\/+$/,'');  const aud=env.ACCESS_AUD.trim();
  if(header.alg!=='RS256'||!header.kid||normalizeIssuer(p.iss)!==normalizeIssuer(issuer)||!(Array.isArray(p.aud)?p.aud.includes(aud):p.aud===aud)||p.exp<=Date.now()/1000||(p.nbf&&p.nbf>Date.now()/1000))return false;
  const res=await fetch(issuer+'/cdn-cgi/access/certs');if(!res.ok)return false;
  const keys=await res.json(),jwk=keys.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)return false;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
 }catch{return false;}
}
function rowsFromXML(xml,shared){
 const rows=[];
 for(const match of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){
  const row=[];
  for(const cell of match[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
   const addr=cell[1].match(/\br="([A-Z]+)\d+"/),type=cell[1].match(/\bt="([^"]+)"/),body=cell[2]||'';
   if(!addr)continue;
   let col=0;for(const ch of addr[1])col=col*26+ch.charCodeAt(0)-64;col--;
   const value=body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/),inline=body.match(/<is\b[^>]*>([\s\S]*?)<\/is>/);
   let v=value?decode(value[1]):inline?[...inline[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x=>decode(x[1])).join(''):'';
   if(type?.[1]==='s')v=shared[Number(v)]??'';
   else if(!type||type[1]==='n')v=v===''?'':Number(v);
   row[col]=v;
  }
  rows.push(row);
 }
 return rows;
}
function parseWorkbook(bytes){
 const zip=unzipSync(bytes),file=name=>zip[name]?strFromU8(zip[name]):'';
 const sharedXML=file('xl/sharedStrings.xml');
 const shared=[...sharedXML.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m=>[...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x=>decode(x[1])).join(''));
 const workbook=file('xl/workbook.xml'),rels=file('xl/_rels/workbook.xml.rels');
 const relations={};for(const m of rels.matchAll(/<Relationship\b([^>]+)\/?\s*>/g)){
  const id=m[1].match(/\bId="([^"]+)"/),target=m[1].match(/\bTarget="([^"]+)"/);if(id&&target)relations[id[1]]=target[1];
 }
 const sheets={};for(const m of workbook.matchAll(/<sheet\b([^>]+)\/?\s*>/g)){
  const name=m[1].match(/\bname="([^"]+)"/),id=m[1].match(/\br:id="([^"]+)"/);if(!name||!id)continue;
  const target=relations[id[1]];if(!target)continue;
  const path=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');
  sheets[decode(name[1])]=rowsFromXML(file(path),shared);
 }
 if(!sheets.Chart||!sheets['Critical issues'])throw Error('Missing Chart or Critical issues worksheet');
 const chart=sheets.Chart.slice(1).map(r=>({date:String(r[0]||'').slice(0,10),notIndexed:Number(r[1]),indexed:Number(r[2]),impressions:Number(r[3])})).filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&Number.isFinite(r.indexed)&&Number.isFinite(r.notIndexed)&&r.indexed>0&&r.notIndexed>0);
 const issues=[...sheets['Critical issues'].slice(1),...(sheets['Non-critical issues']||[]).slice(1)].filter(r=>r[0]&&Number.isFinite(Number(r[3]))).map(r=>({reason:String(r[0]),source:String(r[1]||''),validation:String(r[2]||''),pages:Number(r[3])})).sort((a,b)=>b.pages-a.pages);
 if(!chart.length)throw Error('No indexed/not-indexed chart data');
 return {latest:chart.at(-1),chart,issues};
}
export async function onRequestGet({request,env}){
 if(!env.SEO_REPORTS)return respond({error:'R2 binding SEO_REPORTS is missing'},503);
if(!request.headers.get('Cf-Access-Jwt-Assertion'))
  return respond({
    error:'Cloudflare Access JWT header is missing',
    code:'missing_access_header'
  },403);

if(!await authorized(request,env)){
  const token=request.headers.get('Cf-Access-Jwt-Assertion');
  let diagnostic={};

  try{
    const payload=JSON.parse(
      new TextDecoder().decode(b64(token.split('.')[1]))
    );

    const expectedIssuer='https://'+env.ACCESS_TEAM_DOMAIN
      .trim()
      .replace(/^https?:\/\//,'')
      .replace(/\/+$/,'');

    diagnostic={
      tokenIssuerHost:new URL(payload.iss).hostname,
      expectedIssuerHost:new URL(expectedIssuer).hostname,
      audienceMatches:Array.isArray(payload.aud)
        ?payload.aud.includes(env.ACCESS_AUD.trim())
        :payload.aud===env.ACCESS_AUD.trim(),
      tokenExpired:payload.exp<=Date.now()/1000
    };
  }catch{
    diagnostic={decodeFailed:true};
  }

  return respond({
    error:'Cloudflare Access token verification failed',
    diagnostic
  },403);
}
 try{
  let cursor,latest=null;
  do{
   const result=await env.SEO_REPORTS.list({prefix:'reports/indexing/',limit:1000,...(cursor?{cursor}:{})});
   for(const item of result.objects)if(/\.xlsx$/i.test(item.key)&&(!latest||item.uploaded>latest.uploaded))latest=item;
   cursor=result.truncated?result.cursor:null;
  }while(cursor);
  if(!latest)return respond({available:false,message:'No Excel Page Indexing report uploaded yet'});
  const object=await env.SEO_REPORTS.get(latest.key);if(!object)return respond({error:'Report could not be retrieved'},404);
  const parsed=parseWorkbook(new Uint8Array(await object.arrayBuffer()));
  return respond({available:true,filename:latest.customMetadata?.filename||latest.key.split('/').at(-1),uploadedAt:latest.uploaded.toISOString(),...parsed});
 }catch(e){return respond({error:'Could not parse indexing report: '+e.message},422);}
}
