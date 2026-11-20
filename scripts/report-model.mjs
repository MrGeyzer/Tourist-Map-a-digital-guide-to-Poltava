export const REPORT_TYPES={data:'Неточність у даних',bug:'Помилка сайту',other:'Інше'};
export function validateReport(input){
  if(!input||typeof input!=='object')throw new Error('invalid');
  const value={type:input.type,title:input.title,object:input.object??'',description:input.description,website:input.website??''};
  if(!Object.hasOwn(REPORT_TYPES,value.type))throw new Error('invalid');
  for(const key of ['title','object','description','website']){
    if(typeof value[key]!=='string')throw new Error('invalid');value[key]=value[key].replace(/\r\n?/g,'\n').trim();
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value[key]))throw new Error('invalid');
  }
  if(value.title.length<4||value.title.length>100||value.title.includes('\n')||value.object.length>160||value.description.length<10||value.description.length>3000||value.website)throw new Error('invalid');
  return value;
}
export function reportText(input,language='uk'){
  const data=validateReport(input);return `${language==='en'?{data:'Data correction',bug:'Website bug',other:'Other'}[data.type]:REPORT_TYPES[data.type]}\n${data.title}\n\n${language==='en'?'Place / address':'Об’єкт / адреса'}: ${data.object||(language==='en'?'Not specified':'Не вказано')}\n\n${data.description}\n`;
}
export function reportEndpoint(value,base){
  if(!value||typeof value!=='string')throw new Error('notConfigured');
  const url=new URL(value,base);
  if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new Error('notConfigured');
  return url.href;
}
export async function sendReport(endpoint,input,{fetcher=fetch,signal}={}){
  const payload=validateReport(input);
  let response;try{response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),credentials:'omit',referrerPolicy:'no-referrer',signal})}catch{throw new Error('network')}
  if(response.status===429)throw new Error('rateLimit');
  if(response.status===400||response.status===413)throw new Error('invalid');
  const result=await response.json().catch(()=>null);
  if(response.status!==201||result?.ok!==true||!Number.isSafeInteger(result.id)||result.id<1)throw new Error('server');
  return result.id;
}
