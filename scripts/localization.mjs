import english from '../locales/en.mjs';

export function savedLanguage(){
  try{return localStorage.getItem('poltava-language')==='en'?'en':'uk'}catch{return 'uk'}
}
const phrases=Object.entries(english).filter(([key])=>key.length>=20).sort((a,b)=>b[0].length-a[0].length);
export function translateText(value,language='en'){
  if(language!=='en'||!/[А-Яа-яІіЇїЄєҐґ]/u.test(value))return value;
  const core=value.trim();
  if(Object.hasOwn(english,core))return value.replace(core,english[core]);
  let text=value
    .replace(/У локальному наборі (\d+) об’єктів Полтави з хоча б однією підтвердженою ознакою\./g,'The local dataset contains $1 places in Poltava with at least one confirmed feature.')
    .replace(/Звернення №([^\s]+) надіслано\. Дякуємо за допомогу!/g,'Report #$1 sent. Thank you for your help!')
    .replace(/Зберігаємо офлайн: (\d+)%/g,'Saving offline: $1%')
    .replace(/Завантажено (\d+) із ([\d…]+) файлів\./g,'Downloaded $1 of $2 files.')
    .replace(/Збережено ([\d.,:/\s]+)\./g,'Saved $1.')
    .replace(/✓ Ознаки: (.+)/g,(_,keys)=>'✓ Features: '+keys.split(' · ').map(key=>english[key]||key).join(' · '))
    .replace(/^([✓−?]) (Є|Немає|Немає даних)$/u,(_,icon,label)=>`${icon} ${english[label]}`)
    .replace(/Джерело: не вказано · Перевірено: немає даних/g,'Source: not specified · Checked: no data')
    .replace(/Перевірено:/g,'Checked:')
    .replace(/Checked: Немає даних/g,'Checked: No data')
    .replace(/Джерело:/g,'Source:')
    .replace(/(: |· )(підключено|лише загальні оцінки|відкритий експорт недоступний|джерело недоступне|потрібна перевірка формату|Імпортований набір|немає даних)(?=\s*(?:\(|$))/g,(_,prefix,label)=>prefix+english[label]);
  // Composed status messages reuse these same complete phrases. Never translate arbitrary words in dataset content.
  for(const [source,target] of phrases)text=text.replaceAll(source,target);
  return text;
}

export function mountLocalization(){
  const remembered=new WeakMap(),attributes=['aria-label','aria-description','aria-valuetext','title','placeholder','alt'];
  let pending=false;
  function write(target,key,value,set){
    const record=remembered.get(target)||{},previous=record[key];
    const source=previous&&value===previous.output?previous.source:value;
    const output=translateText(source,document.documentElement.lang);
    record[key]={source,output};remembered.set(target,record);
    if(output!==value)set(output);
  }
  function refresh(){
    pending=false;
    const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      const element=node.nodeType===Node.TEXT_NODE?node.parentElement:node;
      if(element.closest('script,style,[data-l10n-ignore]')||(node.nodeType===Node.TEXT_NODE&&element.closest('textarea')))continue;
      if(node.nodeType===Node.TEXT_NODE)write(node,'text',node.nodeValue,value=>node.nodeValue=value);
      else for(const key of attributes)if(node.hasAttribute(key))write(node,key,node.getAttribute(key),value=>node.setAttribute(key,value));
    }
  }
  const observer=new MutationObserver(()=>{if(!pending){pending=true;queueMicrotask(refresh)}});
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['lang',...attributes]});
  refresh();
  return {refresh,disconnect:()=>observer.disconnect()};
}
