import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import '../world-systems.js';
const world=globalThis.LowkeyWorld;

test('day/night alternates every fifteen minutes, stays synchronized after restart and fades over ten seconds',()=>{
  const day=world.SEGMENT_MS*2;
  assert.equal(world.daylight(day+12000),1);
  assert.equal(world.daylight(day+world.SEGMENT_MS+12000),0);
  assert.equal(world.daylight(day+world.SEGMENT_MS*2+12000),1);
  assert.ok(Math.abs(world.daylight(day+world.SEGMENT_MS+5000)-.5)<.001);
  assert.equal(world.daylight(day+world.SEGMENT_MS),1,'transition begins at previous daylight level');
});

test('both vehicles accelerate, steer, brake, reverse and obey boundaries without tunneling',()=>{
  for(const vehicle of world.initialVehicles()) {
    vehicle.x=0;vehicle.z=20;vehicle.rotation=0;
    for(let i=0;i<30;i++)world.advanceVehicle(vehicle,{throttle:1,steer:0},1/60,[]);
    assert.ok(vehicle.speed>4);assert.ok(vehicle.z>21);
    const before=vehicle.rotation;
    for(let i=0;i<20;i++)world.advanceVehicle(vehicle,{throttle:1,steer:1},1/60,[]);
    assert.ok(vehicle.rotation<before,'D turns toward the driver’s right (-X when facing +Z)');
    for(let i=0;i<120;i++)world.advanceVehicle(vehicle,{brake:true},1/60,[]);
    assert.ok(Math.abs(vehicle.speed)<.1);
    for(let i=0;i<60;i++)world.advanceVehicle(vehicle,{throttle:-1,steer:0},1/60,[]);
    assert.ok(vehicle.speed<0);
    vehicle.x=0;vehicle.z=0;vehicle.rotation=0;vehicle.speed=20;
    world.advanceVehicle(vehicle,{throttle:1},.05,[{x:0,z:1.3,hx:2,hz:.2}]);
    assert.equal(vehicle.speed,0);assert.ok(vehicle.z<1.1,'substeps stop before prop');
    vehicle.x=48;vehicle.z=20;vehicle.rotation=Math.PI/2;vehicle.speed=27;
    for(let i=0;i<30;i++)world.advanceVehicle(vehicle,{throttle:1},1/60,[]);
    assert.ok(vehicle.x<=49);assert.equal(vehicle.speed,0);
  }
});

test('A and D turn left and right from every heading, with natural reverse steering',()=>{
  for(const base of world.initialVehicles())for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const steer of [-1,1])for(const speed of [8,-4]){
    const vehicle={...base,x:0,z:20,rotation:heading,speed};
    world.advanceVehicle(vehicle,{steer},1/60,[]);
    const turn=Math.atan2(Math.sin(vehicle.rotation-heading),Math.cos(vehicle.rotation-heading));
    assert.equal(Math.sign(turn),-steer*Math.sign(speed),`${base.kind}: steering ${steer} at speed ${speed}`);
  }
});

test('steering eases in, recenters and stays controllable at top speed',()=>{
  for(const base of world.initialVehicles()){
    const vehicle={...base,x:0,z:20,rotation:0,speed:base.kind==='car'?22:27};
    world.advanceVehicle(vehicle,{throttle:1,steer:1},1/60,[]);
    assert.ok(vehicle.steering>0&&vehicle.steering<.2,'no instant full steering lock');
    let previous=vehicle.rotation;
    for(let i=0;i<60;i++){
      world.advanceVehicle(vehicle,{throttle:1,steer:1},1/60,[]);
      const delta=Math.atan2(Math.sin(vehicle.rotation-previous),Math.cos(vehicle.rotation-previous));
      assert.ok(Math.abs(delta)<=1.25/60+1e-8,'yaw rate remains bounded at speed');
      previous=vehicle.rotation;
    }
    const before=vehicle.steering;
    world.advanceVehicle(vehicle,{steer:-1},1/60,[]);
    assert.ok(vehicle.steering>0&&vehicle.steering<before,'opposite input does not snap the wheels');
    for(let i=0;i<60;i++)world.advanceVehicle(vehicle,{steer:0,brake:true},1/60,[]);
    assert.ok(Math.abs(vehicle.steering)<.002,'release recenters the rack');
    vehicle.speed=0;const stopped=vehicle.rotation;
    world.advanceVehicle(vehicle,{steer:1},1/60,[]);
    assert.equal(vehicle.rotation,stopped,'stationary steering does not spin the vehicle');
  }
});

test('seat poses and safe exits follow vehicle direction and floor height',()=>{
  const car=world.initialVehicles()[0];car.x=0;car.z=5;car.y=.18;
  const pose=world.driverPose(car);assert.equal(pose.rotation,car.rotation);assert.equal(pose.scale,.62);
  const exit=world.exitPosition(car);assert.ok(exit);assert.equal(exit.y,world.groundHeight(exit.x,exit.z));assert.ok(Math.hypot(exit.x-car.x,exit.z-car.z)>2);
  const moto=world.initialVehicles()[1];assert.equal(world.driverPose(moto).scale,.85);
});

test('road and plaza have no duplicate coplanar upper slabs',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(!html.includes('box(scene,0,.06,0,13,.08,28,mats.stone2)'));
  assert.ok(html.includes('for(const z of [-11.5,11.5])'));
  for(const scriptName of ['world-systems.js','environment.js','vehicles-client.js'])new vm.Script(await readFile(new URL('../'+scriptName,import.meta.url),'utf8'));
});
