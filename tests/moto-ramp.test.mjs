import test from 'node:test';
import assert from 'node:assert/strict';
import '../city-layout.js';
import '../world-systems.js';
const W=LowkeyWorld;
const make=()=>({id:'moto',kind:'moto',driverId:'pilot',passengerIds:['passenger'],x:-40,z:12,y:W.groundHeight(-40,12),rotation:Math.PI/2,speed:12,wheelieAngle:.6});
const controls={throttle:1,steer:0,brake:false,wheelie:true};
const obstacle={x:-36,z:12,hx:.35,hz:2,minY:-.025,maxY:.8};
function advanceUntil(vehicle,predicate,input=controls,obstacles=[obstacle],limit=240){for(let i=0;i<limit;i++){W.advanceVehicle(vehicle,input,.025,obstacles);if(predicate(vehicle))return true;}return false;}
test('wheelie impact launches the motorcycle with both seated occupants and lands under gravity',()=>{
  const bike=make();assert.ok(advanceUntil(bike,v=>v.airborne));assert.equal(bike.collision,null);const takeoff=bike.x;let peak=bike.y;
  assert.ok(advanceUntil(bike,v=>{peak=Math.max(peak,v.y);const driver=W.driverPose(v),passenger=W.passengerPose(v);assert.ok(Math.abs(driver.y-passenger.y)<1);return !v.airborne;}));
  assert.ok(peak>1.7);assert.ok(bike.x>takeoff+3);assert.equal(bike.y,W.groundHeight(bike.x,bike.z));assert.equal(bike.airVelocityY,0);assert.equal(bike.airPitch,0);assert.equal(bike.driverId,'pilot');assert.deepEqual(bike.passengerIds,['passenger']);assert.ok(bike.speed>0);
});
test('ordinary crashes, low speed, reverse, braking, cars and tall walls do not launch',()=>{
  for(const overrides of [{wheelieAngle:0},{speed:3},{speed:-10},{kind:'car'},{wrecked:true}]){const v={...make(),...overrides};advanceUntil(v,s=>s.collision,{...controls,throttle:0,wheelie:overrides.wheelieAngle!==0});assert.ok(!v.airborne,JSON.stringify(overrides));}
  const wall={...obstacle,maxY:12},bike=make();assert.ok(advanceUntil(bike,v=>v.collision,controls,[wall]));assert.ok(!bike.airborne);
  for(const input of [{...controls,wheelie:false},{...controls,brake:true}]){const v=make();advanceUntil(v,s=>s.collision,input);assert.ok(!v.airborne);}
});
test('airborne collision still blocks a tall wall rather than tunnelling',()=>{
  const bike=make();assert.ok(advanceUntil(bike,v=>v.airborne));const wall={x:-31,z:12,hx:.25,hz:3,maxY:15};
  assert.ok(advanceUntil(bike,v=>v.collision,controls,[obstacle,wall]));assert.ok(bike.x<-31.25);assert.equal(bike.speed,0);
});
test('takeoff and landing replay deterministically on server and predicted client',()=>{
  const server=make(),client=make();for(let i=0;i<160;i++){W.advanceVehicle(server,controls,.025,[obstacle]);W.advanceVehicle(client,controls,.025,[obstacle]);assert.deepEqual(server,client);}
});

test('the actual pier rail launches the underside of a wheelie into the sea; speed increases distance',()=>{
  const distances=[];
  for(const speed of [10,24]){
    const bike={...make(),x:81,z:224,y:1.4,speed};let airborne=false,peak=1.4;
    for(let i=0;i<350&&!bike.submerged;i++){W.advanceVehicle(bike,controls,.025);airborne||=Boolean(bike.airborne);peak=Math.max(peak,bike.y);}
    assert.ok(airborne,'outer rail of enlarged pier must launch the raised bike');assert.ok(bike.submerged,'bike crosses the edge and lands in water');assert.ok(bike.x>84);assert.ok(peak>2.6);distances.push(bike.x);
  }
  assert.ok(distances[1]>distances[0]+10,'faster approach carries the motorcycle farther');
});
