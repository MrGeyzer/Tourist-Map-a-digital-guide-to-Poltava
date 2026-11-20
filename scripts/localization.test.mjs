import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {translateText} from './localization.mjs';
import {offlineStatusView} from './offline-status.mjs';
import {accessibilityCard} from './accessibility-ui.mjs';
import {reportText} from './report-model.mjs';
const cyrillic=/[А-Яа-яІіЇїЄєҐґ]/u;

test('offline phases, progress and saved receipts have complete English messages',()=>{
  for(const phase of ['checking','local','unsupported','saving','ready','update','error','incomplete']){
    for(const ready of [false,true]){
      const view=offlineStatusView({phase,ready,done:7,total:12,savedAt:'2026-11-20T12:00:00Z'});
      for(const value of [view.title,view.detail,view.label].filter(Boolean))assert.doesNotMatch(translateText(value),cyrillic,`${phase}: ${value}`);
    }
  }
  assert.equal(translateText('Зберігаємо офлайн: 58%'),'Saving offline: 58%');
});
test('accessibility cards and dynamic badges translate without changing evidence values',()=>{
  const html=accessibilityCard({wheelchair:'yes'});
  const text=html.replace(/<[^>]*>/g,'\n').split('\n').map(value=>translateText(value)).join('\n');
  assert.doesNotMatch(text,cyrillic);
  assert.match(text,/Wheelchair accessible/);
  assert.match(translateText('✓ Ознаки: Пандус · Ліфт'),/✓ Features: Ramp · Lift/);
});
test('source states, count templates and report receipts preserve their dynamic values',()=>{
  assert.equal(translateText(': джерело недоступне (HTTP 403)'),': source unavailable (HTTP 403)');
  assert.match(translateText('У локальному наборі 63 об’єктів Полтави з хоча б однією підтвердженою ознакою.'),/63 places/);
  assert.equal(translateText('Звернення №123 надіслано. Дякуємо за допомогу!'),'Report #123 sent. Thank you for your help!');
});
test('original place names, addresses and Ukrainian mode remain unchanged',()=>{
  for(const value of ['вул. Соборності, 36','Біла альтанка','Museum 123','Пандус біля музею'])assert.equal(translateText(value),value);
  assert.equal(translateText('Ознаки доступності','uk'),'Ознаки доступності');
});
test('downloaded reports use selected-language labels and preserve user input',()=>{
  const data={type:'data',title:'Адреса музею',description:'Уточнити адресу музею',object:''};
  assert.match(reportText(data,'en'),/^Data correction\nАдреса музею/);
  assert.match(reportText(data,'en'),/Place \/ address: Not specified/);
  assert.match(reportText(data),/Об’єкт \/ адреса: Не вказано/);
});
test('the translation module and dictionary are included in the offline package',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../offline-files.json',import.meta.url),'utf8'));
  assert.ok(manifest.files.includes('scripts/localization.mjs'));
  assert.ok(manifest.files.includes('locales/en.mjs'));
});
