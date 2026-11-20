import {validateReport,REPORT_TYPES} from '../scripts/report-model.mjs';
const MAX_BYTES=16000;
async function readJSON(request){
  if(Number(request.headers.get('Content-Length'))>MAX_BYTES)throw new Error('large');
  const reader=request.body?.getReader();if(!reader)throw new Error('invalid');let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw new Error('large')}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
const code=text=>String(text).split('\n').map(line=>'    '+line).join('\n');
export async function handleReport(request,env,{fetcher=fetch}={}){
  const origin=request.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  const cors={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
  if(allowed.includes(origin))cors['Access-Control-Allow-Origin']=origin;
  const reply=(status,data,extra={})=>Response.json(data,{status,headers:{...cors,...extra}});
  if(new URL(request.url).pathname!=='/report')return reply(404,{ok:false});
  if(!origin||!allowed.includes(origin))return reply(403,{ok:false});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
  if(request.method!=='POST')return reply(405,{ok:false},{Allow:'POST, OPTIONS'});
  if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return reply(415,{ok:false});
  const repo=env.GITHUB_REPOSITORY||'MrGeyzer/Tourist-Map-a-digital-guide-to-Poltava';
  if(!env.GITHUB_TOKEN||!env.REPORT_RATE_LIMIT||!/^[-\w.]+\/[-\w.]+$/.test(repo))return reply(503,{ok:false});
  try{const rate=await env.REPORT_RATE_LIMIT.limit({key:request.headers.get('CF-Connecting-IP')||'anonymous'});if(!rate.success)return reply(429,{ok:false},{'Retry-After':'60'})}catch{return reply(503,{ok:false})}
  let data;try{data=validateReport(await readJSON(request))}catch(error){return reply(error.message==='large'?413:400,{ok:false})}
  const body=`## ${REPORT_TYPES[data.type]}\n\n### Об’єкт / адреса\n\n${code(data.object||'Не вказано')}\n\n### Опис\n\n${code(data.description)}\n\n---\nНадіслано через форму «Полтава поруч». Позиція користувача та контактні дані автоматично не збираються.`;
  try{
    const response=await fetcher(`https://api.github.com/repos/${repo}/issues`,{method:'POST',headers:{Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'PoltavaPoruch-Reports','X-GitHub-Api-Version':'2026-03-10'},body:JSON.stringify({title:`[${REPORT_TYPES[data.type]}] ${data.title}`,body}),signal:AbortSignal.timeout(12000)});
    const issue=await response.json().catch(()=>null);
    if(response.status!==201||!Number.isSafeInteger(issue?.number)||issue.number<1)return reply(502,{ok:false});
    return reply(201,{ok:true,id:issue.number});
  }catch{return reply(502,{ok:false})}
}
export default {fetch:handleReport};
