export const OFFLINE_BOUNDS=[34.50,49.55,34.61,49.62];
const palettes={light:{background:'#f3f0e8',land:'#e7e6d9',park:'#d4e6c6',water:'#a8cadb',building:'#d1ccc1',road:'#fffdf4',major:'#eed093',path:'#bead93',text:'#35443d',halo:'#fffefa',border:'#17664f'},dark:{background:'#15171a',land:'#202327',park:'#272a2e',water:'#1c2836',building:'#33373e',road:'#70747d',major:'#8b8175',path:'#565b64',text:'#d4d6dc',halo:'#15171a',border:'#99c4f4'}};
export function baseLayers(source,dark=false){
  const p=palettes[dark?'dark':'light'],make=(id,type,layer,paint,extra={})=>({id:`base-${source}-${id}`,type,source,'source-layer':layer,paint,...extra});
  return [
    make('land','fill','landcover',{'fill-color':p.land}),
    make('park','fill','park',{'fill-color':p.park}),
    make('water','fill','water',{'fill-color':p.water}),
    make('waterway','line','waterway',{'line-color':p.water,'line-width':2}),
    make('building','fill','building',{'fill-color':p.building,'fill-outline-color':p.background},{minzoom:13}),
    make('roads','line','transportation',{'line-color':['match',['get','class'],['motorway','trunk','primary','secondary','tertiary'],p.major,['path','track','footway','cycleway'],p.path,p.road],'line-width':['interpolate',['linear'],['zoom'],10,.6,14,2.5,18,10]},{layout:{'line-join':'round','line-cap':'round'}}),
    make('buildings-3d','fill-extrusion','building',{
      'fill-extrusion-color':p.building,
      'fill-extrusion-height':['interpolate',['linear'],['zoom'],13,0,14,['coalesce',['get','render_height'],0]],
      'fill-extrusion-base':['coalesce',['get','render_min_height'],0],
      'fill-extrusion-opacity':0.95
    },{minzoom:13,filter:['all',['!=',['get','hide_3d'],true],['!=',['get','hide_3d'],1],['!=',['get','hide_3d'],'true']]}),
    make('streets','symbol','transportation_name',{'text-color':p.text,'text-halo-color':p.halo,'text-halo-width':1.4},{minzoom:13,layout:{'symbol-placement':'line','text-field':['coalesce',['get','name:uk'],['get','name'],['get','name:latin'],''],'text-font':['Noto Sans Regular'],'text-size':12,'text-max-angle':30}}),
    make('places','symbol','place',{'text-color':p.text,'text-halo-color':p.halo,'text-halo-width':1.5},{layout:{'text-field':['coalesce',['get','name:uk'],['get','name'],['get','name:latin'],''],'text-font':['Noto Sans Bold'],'text-size':13,'text-max-width':8}})
  ];
}
export function createMapStyle(baseURL,{dark=false,offline=false}={}){
  const local=new URL('./data/offline/',baseURL).href;
  return {version:8,glyphs:local+'fonts/{fontstack}/{range}.pbf',sources:{
    online:{type:'vector',...(offline?{tiles:[local+'tiles/{z}/{x}/{y}.pbf'],minzoom:10,maxzoom:14}:{url:'https://tiles.openfreemap.org/planet'}),attribution:'<a href="https://openfreemap.org/">OpenFreeMap</a> · © OpenMapTiles · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>'},
    offline:{type:'vector',tiles:[local+'tiles/{z}/{x}/{y}.pbf'],bounds:OFFLINE_BOUNDS,minzoom:10,maxzoom:14,attribution:'Офлайн-центр · OpenFreeMap · © OpenMapTiles · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>'}
  },layers:[{id:'base-background',type:'background',paint:{'background-color':palettes[dark?'dark':'light'].background}},...['online','offline'].flatMap(source=>baseLayers(source,dark).map(layer=>({...layer,layout:{...layer.layout,visibility:(source==='offline')===offline?'visible':'none'}})))]};
}
export function applyMapTheme(map,dark){
  if(!map.getLayer('base-background'))return;
  map.setPaintProperty('base-background','background-color',palettes[dark?'dark':'light'].background);
  for(const source of ['online','offline'])for(const layer of baseLayers(source,dark))if(map.getLayer(layer.id))for(const [key,value]of Object.entries(layer.paint))map.setPaintProperty(layer.id,key,value);
  if(map.getLayer('outside-city-mask'))map.setPaintProperty('outside-city-mask','fill-color',dark?'#07080a':'#444b58');
}
export function showOfflineBasemap(map,offline){
  for(const source of ['online','offline'])for(const layer of baseLayers(source))if(map.getLayer(layer.id))map.setLayoutProperty(layer.id,'visibility',(source==='offline')===offline?'visible':'none');
}

export function applyMapLanguage(map,language){
  const field=['coalesce',['get',language==='en'?'name:en':'name:uk'],...language==='en'?[['get','name:latin']]:[],['get','name'],''];
  for(const source of ['online','offline'])for(const type of ['streets','places']){
    const id=`base-${source}-${type}`;
    if(map.getLayer(id))map.setLayoutProperty(id,'text-field',field);
  }
}
