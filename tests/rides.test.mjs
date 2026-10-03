import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const sandbox=vm.createContext({console:{warn(){},log(){}}});
for(const file of ['three.min.js','city-layout.js','world-systems.js','coast-client.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),sandbox);
const {THREE,LowkeyRides:rides,LowkeyWorld:world}=sandbox;
test('boarding pauses, wheel visits every bank, and both passengers follow actual rendered benches',()=>{
  const coast=sandbox.LowkeyCoast.create({THREE,scene:new THREE.Scene()});
  const seen=new Set();for(let step=0;step<16;step++){const phase=rides.phase('wheel',step*16000+2000);seen.add(phase.bench);assert.equal(phase.boarding,true);assert.ok(Math.abs(rides.bench('wheel',phase.bench,step*16000+2000).y-2.9)<1e-8);}
  assert.equal(seen.size,16);assert.equal(rides.phase('coaster',9000).boarding,true);assert.equal(rides.phase('coaster',11000).boarding,false);
  assert.deepEqual(rides.bench('coaster',0,0),rides.bench('coaster',0,9000));
  for(const time of [0,8000,12000,45000,60000,137000,1770000132456]){
    coast.update(0,{x:0,z:224},0,time);coast.group.updateMatrixWorld(true);
    for(const kind of ['wheel','coaster'])for(let bench=0;bench<(kind==='wheel'?16:3);bench++){
      const model=kind==='wheel'?coast.cabins[bench]:coast.train[bench],p=model.getWorldPosition(new THREE.Vector3()),pose=rides.bench(kind,bench,time);
      assert.ok(p.distanceTo(new THREE.Vector3(pose.x,pose.y,pose.z))<1e-6,kind+' seats match rendered motion');
      const a=rides.seat(kind,bench,0,time),b=rides.seat(kind,bench,1,time);assert.ok(Math.abs(Math.hypot(a.x-b.x,a.z-b.z)-.92)<1e-7);assert.ok(Object.values(a).every(Number.isFinite));
    }
  }
});
test('ride snapshots retain two seats and clear disconnected riders; station stairs have real support',()=>{
  const coast=sandbox.LowkeyCoast.create({THREE,scene:new THREE.Scene()});coast.receiveRides({rides:[{id:'a',kind:'wheel',bench:12,seat:0},{id:'b',kind:'wheel',bench:12,seat:1}]});assert.equal(coast.rideSeats.size,2);assert.notEqual(coast.riderPose('a',0).x,coast.riderPose('b',0).x);coast.receiveRides({rides:[]});assert.equal(coast.riderPose('a',0),null);
  assert.equal(world.groundHeight(5,207.5),3.35);for(let i=0;i<5;i++)assert.ok(Math.abs(world.groundHeight(5,203+i*.6)-(1.4+(i+1)*.39))<1e-8);
});
