export function offlineStatusView({phase='checking',ready=false,done=0,total=0,savedAt=null,message=''}={}){
  let saved='';if(savedAt&&!Number.isNaN(Date.parse(savedAt)))saved=' Збережено '+new Intl.DateTimeFormat('uk-UA',{dateStyle:'short',timeStyle:'short'}).format(new Date(savedAt))+'.';
  const percent=total?Math.min(100,Math.round(done/total*100)):0;
  const states={
    checking:{title:'Перевіряємо офлайн-копію…',detail:'Готовність перевіряється на цьому пристрої.'},
    local:{title:'Сайт ще не збережено офлайн',detail:'Локальний запуск: натисніть кнопку, щоб зберегти сайт на цьому пристрої.',action:'save',label:'Зберегти офлайн'},
    unsupported:{title:'Офлайн-збереження недоступне',detail:message||'Відкрийте сайт через HTTPS або localhost у браузері з підтримкою PWA.'},
    saving:{title:`Зберігаємо офлайн: ${percent}%`,detail:`Завантажено ${done} із ${total||'…'} файлів. `+(ready?'Попередня збережена копія доступна.':'Залиште сторінку відкритою до завершення.'),progress:true},
    ready:{title:'✓ Сайт збережено офлайн',detail:'Об’єкти, укриття, фото й підкладка центру доступні без мережі.'+saved,action:'check',label:'Перевірити'},
    update:{title:ready?'✓ Сайт збережено · є оновлення':'Нова офлайн-копія готова до застосування',detail:ready?'Попередня копія працює. Оновіть застосунок, щоб перейти на нову.':'Натисніть «Оновити», щоб почати використовувати завантажену копію.',action:'update',label:'Оновити'},
    error:{title:ready?'Оновлення не збережено':'Сайт не збережено офлайн',detail:(ready?'Попередня збережена копія доступна. ':'')+(message||'Перевірте інтернет і вільне місце та спробуйте ще раз.'),action:'retry',label:'Спробувати ще'},
    incomplete:{title:'Офлайн-копія неповна',detail:'Частину збережених файлів втрачено. Для відновлення підключіться до інтернету.',action:'retry',label:'Відновити'}
  };
  return {...states[phase]||states.checking,phase,ready,percent};
}
