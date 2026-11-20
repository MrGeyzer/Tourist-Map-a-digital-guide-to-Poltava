import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReport,reportText,reportEndpoint,sendReport} from './report-model.mjs';
import {handleReport} from '../backend/report-worker.mjs';
const draft={type:'data',title:'Неточна адреса укриття',object:'Вулиця Сковороди, 18',description:'Адресу на карті потрібно перевірити.',website:''};
const origin='https://mrgeyzer.github.io';
const env={ALLOWED_ORIGINS:origin,GITHUB_TOKEN:'test-secret-never-public',REPORT_RATE_LIMIT:{limit:async()=>({success:true})}};
const request=(body=draft,extra={})=>new Request('https://reports.example/report',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...extra},body:typeof body==='string'?body:JSON.stringify(body)});
test('report validation rejects empty/oversized fields, spam trap, invalid categories and unexpected field types',()=>{
  assert.equal(validateReport({...draft,title:'  Назва місця  '}).title,'Назва місця');
  for(const input of [{...draft,title:'    '},{...draft,description:'коротко'},{...draft,description:'а'.repeat(3001)},{...draft,type:'unsupported'},{...draft,website:'spam'},{...draft,description:{}},{...draft,title:'new\nline'}])assert.throws(()=>validateReport(input),/invalid/);
  assert.match(reportText(draft),/Сковороди/);
});
test('report endpoint supports static hosting and localhost but rejects credentials and insecure remote services',()=>{
  assert.equal(reportEndpoint('/api/report','https://example.test/map/'),'https://example.test/api/report');
  assert.equal(reportEndpoint('http://localhost:8787/report','http://localhost:8001/'),'http://localhost:8787/report');
  for(const value of ['', 'http://remote.test/report','javascript:alert(1)','https://user:secret@example.test/report'])assert.throws(()=>reportEndpoint(value,'https://example.test/'),/notConfigured/);
});
test('browser submission stays on site and accepts success only after a confirmed server receipt',async()=>{
  let called;
  const id=await sendReport('https://reports.example/report',draft,{fetcher:async(url,options)=>{called={url,options};return Response.json({ok:true,id:123},{status:201})}});
  assert.equal(id,123);assert.equal(called.options.method,'POST');assert.equal(called.options.credentials,'omit');assert.equal(JSON.parse(called.options.body).title,draft.title);
  for(const response of [Response.json({ok:false},{status:500}),Response.json({ok:true,id:123},{status:200}),Response.json({ok:true,id:'123'},{status:201})])await assert.rejects(sendReport('https://reports.example/report',draft,{fetcher:async()=>response}),/server/);
  await assert.rejects(sendReport('https://reports.example/report',draft,{fetcher:async()=>new Response(null,{status:429})}),/rateLimit/);
  await assert.rejects(sendReport('https://reports.example/report',draft,{fetcher:async()=>{throw new Error('offline')}}),/network/);
});
test('server creates an issue with a server-side token and returns only a receipt; no GPS/IP is sent upstream',async()=>{
  let upstream;
  const response=await handleReport(request(),env,{fetcher:async(url,options)=>{upstream={url,options};return Response.json({number:42,html_url:'https://github.com/example/issues/42'},{status:201})}});
  assert.equal(response.status,201);assert.deepEqual(await response.json(),{ok:true,id:42});assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal(upstream.options.headers.Authorization,'Bearer test-secret-never-public');
  assert.equal(upstream.url,'https://api.github.com/repos/MrGeyzer/Tourist-Map-a-digital-guide-to-Poltava/issues');
  const body=JSON.parse(upstream.options.body);assert.match(body.body,/    Адресу/);assert.doesNotMatch(body.body,/test-secret|latitude|longitude|CF-Connecting-IP/);
});
test('server rejects unconfigured receiver, forbidden origin, malformed JSON, oversized payload and throttled requests',async()=>{
  const unexpected=async()=>{throw new Error('Must not send upstream')};
  assert.equal((await handleReport(request(),{...env,GITHUB_TOKEN:''},{fetcher:unexpected})).status,503);
  assert.equal((await handleReport(request(draft,{Origin:'https://evil.test'}),env,{fetcher:unexpected})).status,403);
  assert.equal((await handleReport(request('{'),env,{fetcher:unexpected})).status,400);
  assert.equal((await handleReport(request('x'.repeat(16001)),env,{fetcher:unexpected})).status,413);
  assert.equal((await handleReport(request(),{...env,REPORT_RATE_LIMIT:{limit:async()=>({success:false})}},{fetcher:unexpected})).status,429);
  const preflight=await handleReport(new Request('https://reports.example/report',{method:'OPTIONS',headers:{Origin:origin}}),env,{fetcher:unexpected});assert.equal(preflight.status,204);
});
test('failed GitHub creation never returns a success message or leaks its response or token',async()=>{
  const response=await handleReport(request(),env,{fetcher:async()=>Response.json({message:'secret upstream details'},{status:403})});
  assert.equal(response.status,502);assert.deepEqual(await response.json(),{ok:false});
});
