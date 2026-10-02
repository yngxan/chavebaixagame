import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const sandbox=vm.createContext({console:{warn(){},log(){}}});
for(const file of ['three.min.js','city-layout.js','world-systems.js','motion-sync.js','vehicles-client.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),sandbox);
const {THREE,LowkeyWorld:world,LowkeyCityLayout:city}=sandbox;
function controller(){const box=(parent,x,y,z,sx,sy,sz,mat)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};return sandbox.LowkeyVehicles.create({THREE,scene:new THREE.Scene(),box,mats:{}});}
test('collision checks look up the floor once per probe, regardless of city size',()=>{
  const original=city.groundKind;let calls=0;
  city.groundKind=(...args)=>{calls++;return original(...args);};
  try{assert.equal(world.clearAt(-88,-80,.78),true);assert.equal(calls,1);}finally{city.groundKind=original;}
});
test('remote and parked vehicles do not build collision lists every rendered frame',()=>{
  const c=controller(),original=world.vehicleObstacles;let calls=0;
  world.vehicleObstacles=(...args)=>{calls++;return original(...args);};
  try{
    c.update(1/60,1000,1000,'player',{throttle:0,steer:0},0,new THREE.Vector3());assert.equal(calls,0);
    const records=world.initialVehicles();records[0].driverId='player';
    c.receive({vehicles:records,serverTime:1000},1000,1000);c.update(1/60,1000,1000,'player',{throttle:0,steer:0},0,new THREE.Vector3());assert.equal(calls,1);
  }finally{world.vehicleObstacles=original;}
});
test('boarding a delayed snapshot predicts to the current frame rather than packet arrival time',()=>{
  for(const kind of ['car','moto']){
    const c=controller(),state={...world.initialVehicles().find(v=>v.kind===kind),x:-88,z:-80,rotation:0,speed:10,driverId:'player'},input={throttle:1,steer:0,brake:false};
    c.receive({vehicles:[state],serverTime:1000},1100,1100);
    c.update(1/60,1250,1250,'player',input,0,new THREE.Vector3());
    const expected={...state};for(let i=0;i<10;i++)world.advanceVehicle(expected,input,.025);world.advanceVehicle(expected,input,1/60);
    const actual=c.models.get(state.id).predicted;
    assert.ok(Math.abs(actual.z-expected.z)<1e-8);assert.ok(actual.z>state.z+2.5);
    let previous=actual.z;
    for(let i=0;i<60;i++){c.update(1/60,1250+(i+1)*1000/60,1250+(i+1)*1000/60,'player',input,0,new THREE.Vector3());assert.ok(actual.z>=previous,'vehicle advances continuously');previous=actual.z;}
  }
});

test('airborne snapshots preserve motorcycle height and seated rider positions',()=>{
  const c=controller(),state={...world.initialVehicles().find(v=>v.kind==='moto'),x:-88,z:-80,y:3,rotation:0,speed:10,driverId:'pilot',passengerIds:['passenger'],airborne:true,airVelocityY:6,airVelocityX:0,airVelocityZ:10,airPitch:.6,airTime:.2,rampCooldown:1};
  c.receive({vehicles:[state],serverTime:1000},1000,1000);
  c.update(1/60,1000,1000,'pilot',{throttle:1,steer:0},0,new THREE.Vector3());
  const model=c.models.get(state.id);assert.ok(model.predicted.y>3);assert.ok(model.group.position.y>3);
  assert.ok(c.pose(model,'pilot').y>2.8);assert.ok(c.pose(model,'passenger').y>2.8);
  c.receive({vehicles:[{...state,y:3.4,airVelocityY:4}],serverTime:1100},1200,1200);
  c.update(1/60,1200,1200,'pilot',{throttle:1,steer:0},0,new THREE.Vector3());assert.ok(model.predicted.y>3);assert.ok(model.predicted.airborne);
  // A spectator follows the remote snapshot, not a stale local prediction.
  c.receive({vehicles:[{...state,y:0,airborne:false,airPitch:0,airVelocityY:0}],serverTime:2000},2000,2000);
  c.update(1/60,2200,2200,'spectator',{throttle:0,steer:0},0,new THREE.Vector3());assert.equal(model.owned,false);
});
