const EPS = 1e-10;
export const regionPolygons = geometry => geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
function onSegment(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],cross=(p[0]-a[0])*dy-(p[1]-a[1])*dx;return Math.abs(cross)<=EPS*Math.max(1,Math.abs(dx),Math.abs(dy))&&p[0]>=Math.min(a[0],b[0])-EPS&&p[0]<=Math.max(a[0],b[0])+EPS&&p[1]>=Math.min(a[1],b[1])-EPS&&p[1]<=Math.max(a[1],b[1])+EPS}
// 0 outside, 1 inside, 2 on the boundary. Boundary points are permitted.
function inRing(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[j],b=ring[i];if(onSegment(p,a,b))return 2;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside?1:0}
export function pointInRegion(point,geometry){
  if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))return false;
  return regionPolygons(geometry).some(poly=>{const outer=inRing(point,poly[0]);return outer===2||(outer===1&&!poly.slice(1).some(hole=>inRing(point,hole)===1))});
}
export function regionBounds(geometry){const pts=regionPolygons(geometry).flatMap(poly=>poly[0]);if(!pts.length)throw new Error('regionUnavailable');return [[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1]))],[Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))]]}
export function nearestRegionPoint(point,geometry){
  if(pointInRegion(point,geometry))return point;let best=null,distance=Infinity;const scale=Math.cos(point[1]*Math.PI/180);
  for(const poly of regionPolygons(geometry))for(const ring of poly)for(let i=1;i<ring.length;i++){
    const a=ring[i-1],b=ring[i],dx=(b[0]-a[0])*scale,dy=b[1]-a[1],t=Math.max(0,Math.min(1,(((point[0]-a[0])*scale)*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy||1))),p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],d=((p[0]-point[0])*scale)**2+(p[1]-point[1])**2;
    if(d<distance){distance=d;best=p}
  }return best;
}
export function lineInRegion(coordinates,geometry){
  if(!Array.isArray(coordinates)||coordinates.length<2||!coordinates.every(p=>pointInRegion(p,geometry)))return false;
  const rings=regionPolygons(geometry).flat();
  for(let i=1;i<coordinates.length;i++){
    const a=coordinates[i-1],b=coordinates[i],dx=b[0]-a[0],dy=b[1]-a[1],cuts=[0,1];
    for(const ring of rings)for(let j=1;j<ring.length;j++){
      const c=ring[j-1],d=ring[j];if(Math.max(a[0],b[0])<Math.min(c[0],d[0])||Math.min(a[0],b[0])>Math.max(c[0],d[0])||Math.max(a[1],b[1])<Math.min(c[1],d[1])||Math.min(a[1],b[1])>Math.max(c[1],d[1]))continue;
      const ex=d[0]-c[0],ey=d[1]-c[1],den=dx*ey-dy*ex;if(Math.abs(den)<1e-16)continue;
      const qx=c[0]-a[0],qy=c[1]-a[1],t=(qx*ey-qy*ex)/den,u=(qx*dy-qy*dx)/den;if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);
    }
    cuts.sort((x,y)=>x-y);for(let j=1;j<cuts.length;j++){const t=(cuts[j-1]+cuts[j])/2;if(!pointInRegion([a[0]+dx*t,a[1]+dy*t],geometry))return false}
  }return true;
}
