import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const sandbox=vm.createContext({console:{warn(){},log(){}}});
for(const file of ['three.min.js','city-layout.js','world-systems.js','motion-sync.js','city-client.js','coast-client.js','vehicles-client.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),sandbox);
const {THREE,LowkeyWorld:world,LowkeyCityLayout:city}=sandbox;
test('garage bays and boutique corridor have shared, open floors and real walls',()=>{
  for(const bay of city.garageBays){const vehicle=world.garageVehicle(bay);assert.equal(world.vehicleClearAt(vehicle,bay.x,bay.z),true);assert.equal(vehicle.y,.12);}
  for(const b of [city.garage,...city.boutiques]){
    for(const z of [0,3,6,7.5]){const p=city.storePoint(b,0,z);assert.equal(world.clearAt(p.x,p.z,.32),true);assert.equal(world.groundHeight(p.x,p.z),.12);}
    const wall=city.storePoint(b,-7.35,0);assert.equal(world.clearAt(wall.x,wall.z,.32),false);
  }
});
test('free garage replaces only departed stock without overlapping a vehicle',()=>{
  const records=new Map(world.initialVehicles().map(v=>[v.id,v]));assert.equal(world.replenishGarage(records,100).length,0);
  const original=records.get('garage-car');original.x+=12;original.driverId='driver';const replacements=world.replenishGarage(records,101);
  assert.equal(replacements.length,1);assert.equal(original.garageBay,null);assert.equal(original.driverId,'driver');assert.equal(world.replenishGarage(records,102).length,0);
});
test('sand traces cover players and both vehicle types, reset on teleports and expire in bounded pools',()=>{
  const coast=sandbox.LowkeyCoast.create({THREE,scene:new THREE.Scene()});
  for(let i=0;i<30;i++)coast.updateTracks(i*100,[{id:'player',x:40+i*.7,y:-.05,z:160,rotation:0}],[{id:'car',kind:'car',x:45+i*.7,y:-.05,z:164,rotation:Math.PI/2},{id:'moto',kind:'moto',x:50+i*.7,y:-.05,z:169,rotation:Math.PI/2}]);
  assert.ok(coast.traces[0].index>10);assert.ok(coast.traces[1].index>40);
  for(const pool of coast.traces){assert.equal(pool.mesh.count,640);assert.ok(pool.born.array.some(value=>value>=0));assert.ok(pool.mesh.material.uniforms.life.value<=28);}
  const before=coast.traces[0].index;coast.updateTracks(3100,[{id:'player',x:100,y:-.05,z:160,rotation:0}],[]);assert.equal(coast.traces[0].index,before);
  coast.updateTracks(40000,[],[]);for(const pool of coast.traces)assert.equal(pool.mesh.material.uniforms.now.value,40);
});
test('vehicle paints update on shared snapshots and new stock renders',()=>{
  const scene=new THREE.Scene(),box=(parent,x,y,z,sx,sy,sz,mat)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
  const controller=sandbox.LowkeyVehicles.create({THREE,scene,box,mats:{}}),records=world.initialVehicles();records[0].color='#e84045';controller.receive({vehicles:records,serverTime:10},10,10);assert.equal(controller.models.get(records[0].id).paint.color.getHexString(),'e84045');
  records.push({...records[2],id:'replacement'});controller.receive({vehicles:records,serverTime:20},20,20);assert.ok(controller.models.has('replacement'));
});
test('braking while steering retains sideways momentum; throttle sustains a donut without bypassing collision',()=>{
  for(const kind of ['car','moto']){const v={...world.initialVehicles().find(v=>v.kind===kind),x:0,z:20,rotation:0,speed:12};
    for(let i=0;i<60;i++)world.advanceVehicle(v,{throttle:1,steer:1,brake:true},1/60,[]);
    assert.equal(v.drifting,true);assert.ok(v.speed>3);assert.ok(Math.abs(v.rotation)>1);assert.ok(Math.abs(v.rotation-v.driftHeading)>.2);
    for(let i=0;i<180;i++)world.advanceVehicle(v,{throttle:0,steer:0,brake:true},1/60,[]);assert.equal(v.speed,0);assert.equal(v.drifting,false);
  }
});
