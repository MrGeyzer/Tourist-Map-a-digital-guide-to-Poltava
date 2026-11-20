import {applyMapTheme} from './map-style.mjs';
export function mountTheme(map){
  const button=document.querySelector('#themeToggle');
  const update=()=>{const dark=document.documentElement.dataset.theme==='dark';button.setAttribute('aria-pressed',String(dark));button.setAttribute('aria-label',dark?'Увімкнути світлу тему':'Увімкнути темну тему');button.title=button.getAttribute('aria-label');document.querySelector('meta[name="theme-color"]').content=dark?'#121316':'#f4f1e9';applyMapTheme(map,dark)};
  button.addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('poltava-theme',theme)}catch{}update()});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',event=>{let saved;try{saved=localStorage.getItem('poltava-theme')}catch{}if(!saved){document.documentElement.dataset.theme=event.matches?'dark':'light';update()}});
  map.on('load',update);update();
}
