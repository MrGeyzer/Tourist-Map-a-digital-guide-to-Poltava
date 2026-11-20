import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pointInRegion,lineInRegion,nearestRegionPoint,regionBounds} from './map-region.mjs';
const district=JSON.parse(fs.readFileSync(new URL('../data/poltava-district.geojson',import.meta.url))).features[0].geometry;
test('the real district includes Poltava and its northern suburbs, excludes Kyiv and bounding-box corners',()=>{
  assert.equal(pointInRegion([34.5514,49.5883],district),true);
  assert.equal(pointInRegion([34.56,49.7],district),true);
  assert.equal(pointInRegion([30.52,50.45],district),false);
  // This point passes the rectangular bounds check but is outside the district polygon.
  assert.equal(pointInRegion([33.68,50.35],district),false);
  assert.deepEqual(regionBounds(district),[[33.6675166,48.7233941],[35.4907973,50.3614103]]);
});
test('polygon holes and border points are handled explicitly',()=>{
  const g={type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[1,2],[2,2],[2,1],[1,1]]]};
  assert.equal(pointInRegion([0,2],g),true);assert.equal(pointInRegion([3,3],g),true);assert.equal(pointInRegion([1.5,1.5],g),false);
  assert.equal(lineInRegion([[.5,1.5],[3,1.5]],g),false);
  assert.equal(lineInRegion([[.5,3],[3,3]],g),true);
});
test('a route may not cross an excluded concavity even when both endpoints are inside',()=>{
  const g={type:'Polygon',coordinates:[[[0,0],[3,0],[3,3],[2,3],[2,1],[1,1],[1,3],[0,3],[0,0]]]};
  assert.equal(lineInRegion([[.5,2],[2.5,2]],g),false);
  assert.equal(lineInRegion([[.5,.5],[2.5,.5]],g),true);
});
test('camera correction chooses a point on the actual district boundary',()=>{
  const p=nearestRegionPoint([33.68,50.35],district);assert.equal(pointInRegion(p,district),true);
});

const city=JSON.parse(fs.readFileSync(new URL('../data/poltava-boundary.geojson',import.meta.url))).features[0].geometry;
test('city scope excludes suburbs accepted by the former district and rejects a route leaving the city',()=>{
  assert.equal(pointInRegion([34.5514,49.5883],city),true);
  assert.equal(pointInRegion([34.56,49.7],city),false);
  assert.equal(lineInRegion([[34.5514,49.5883],[34.56,49.7]],city),false);
  const corrected=nearestRegionPoint([34.56,49.7],city);
  assert.equal(pointInRegion(corrected,city),true);
});
