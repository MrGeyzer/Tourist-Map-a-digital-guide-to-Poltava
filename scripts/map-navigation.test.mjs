import test from 'node:test';
import assert from 'node:assert/strict';
import {validMapPoint, routeURL, parseRoute, requestLocation} from './map-navigation.mjs';

test('coordinate validation accepts global coordinates; city containment is enforced separately', () => {
  assert.equal(validMapPoint([34.8,49.7]), true);
  assert.equal(validMapPoint([30.52,50.45]), true);
  for (const point of [[181,49], [34,86], [NaN,49], [34,Infinity], [34], null]) assert.equal(validMapPoint(point), false);
});
test('walking request preserves longitude/latitude order and asks for actual path geometry', () => {
  const url = new URL(routeURL([34.55,49.59], [34.56,49.58]));
  assert.match(url.pathname, /routed-foot\/route\/v1\/foot\/34.55,49.59;34.56,49.58$/);
  assert.equal(url.searchParams.get('geometries'), 'geojson');
  assert.equal(url.searchParams.get('overview'), 'full');
  assert.throws(() => routeURL([34,90],[34,49]), /outside/);
});
test('route geometry, distance and duration must all be usable before drawing a path', () => {
  const route = {geometry: {type:'LineString',coordinates:[[34.55,49.59],[34.56,49.58]]},distance:1700,duration:1200};
  assert.equal(parseRoute({code:'Ok',routes:[route]}),route);
  for (const broken of [null, {...route,distance:-1}, {...route,duration:NaN}, {...route,geometry:{type:'LineString',coordinates:null}}, {...route,geometry:{type:'LineString',coordinates:[[34,86],[34,49]]}}]) assert.throws(() => parseRoute({code:'Ok',routes:[broken]}), /routeError/);
});
test('no-path responses remain errors, never a straight-line substitute', () => {
  assert.throws(() => parseRoute({code:'NoRoute'}), /noRoute/);
  assert.throws(() => parseRoute({code:'NoSegment'}), /noRoute/);
  assert.throws(() => parseRoute({code:'Ok',routes:[]}), /routeError/);
});
test('GPS provider returns coordinates before the separate city containment check', async () => {
  const geolocation = {getCurrentPosition(success, failure, options) {
    assert.equal(options.enableHighAccuracy,false);
    success({coords:{longitude:34.8,latitude:49.7}});
  }};
  assert.deepEqual(await requestLocation({secureContext:true,geolocation}),[34.8,49.7]);
});
test('HTTP, permission denied, unavailable GPS and out-of-map coordinates have distinct errors', async () => {
  await assert.rejects(requestLocation({secureContext:false}), /insecure/);
  await assert.rejects(requestLocation({secureContext:true}), /unavailable/);
  for (const [code, key] of [[1,'permissionUnknown'],[2,'unavailable'],[3,'timeout']]) {
    await assert.rejects(requestLocation({secureContext:true,geolocation:{getCurrentPosition(success,failure){failure({code})}}}),new RegExp(key));
  }
  await assert.rejects(requestLocation({secureContext:true,geolocation:{getCurrentPosition(success){success({coords:{longitude:34,latitude:87}})}}}), /outside/);
});

test('a granted permission is never reported as denied when the OS/provider fails', async()=>{
  const permissions={query:async()=>({state:'granted'})};let attempts=0;
  await assert.rejects(requestLocation({secureContext:true,permissions,geolocation:{getCurrentPosition(ok,fail){attempts++;fail({code:1})}}}),/deviceUnavailable/);
  assert.equal(attempts,2);
});
test('geolocation recovers when the first request fails immediately after permission was granted',async()=>{
  let attempts=0;const flags=[];const permissions={query:async()=>({state:'granted'})};
  const result=await requestLocation({secureContext:true,permissions,geolocation:{getCurrentPosition(ok,fail,options){attempts++;flags.push(options.enableHighAccuracy);if(attempts===1)fail({code:1});else ok({coords:{longitude:34.55,latitude:49.59}})}}});
  assert.deepEqual(result,[34.55,49.59]);assert.deepEqual(flags,[false,true]);
});
test('a real browser denial and a blocked embedding policy remain distinct',async()=>{
  await assert.rejects(requestLocation({secureContext:true,policyAllowed:false}),/policyBlocked/);
  await assert.rejects(requestLocation({secureContext:true,permissions:{query:async()=>({state:'denied'})},geolocation:{getCurrentPosition(ok,fail){fail({code:1})}}}),/^Error: denied$/);
});
test('a timeout with granted permission reports missing coordinates rather than a denial',async()=>{
  await assert.rejects(requestLocation({secureContext:true,permissions:{query:async()=>({state:'granted'})},geolocation:{getCurrentPosition(ok,fail){fail({code:3})}}}),/deviceTimeout/);
});
