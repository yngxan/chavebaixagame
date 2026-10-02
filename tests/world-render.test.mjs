import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
let now=0;
const label={textContent:''},sandbox=vm.createContext({console:{warn(){},log(){}},performance:{now:()=>now},document:{querySelector:()=>label}});
for(const file of ['three.min.js','world-systems.js','motion-sync.js','environment.js','vehicles-client.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),sandbox);
const THREE=sandbox.THREE;

test('hijack opens the door, animates both characters into their final positions and resets on cancellation',()=>{
  const scene=new THREE.Scene(),material=new THREE.MeshStandardMaterial();
  const box=(parent,x,y,z,sx,sy,sz,mat)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
  for(const kind of ['car','moto']){
    const controller=sandbox.LowkeyVehicles.create({THREE,scene,box,mats:{red:material}}),records=sandbox.LowkeyWorld.initialVehicles(),vehicle=records.find(item=>item.kind===kind);
    vehicle.driverId='victim';vehicle.hijacking={thiefId:'thief',victimId:'victim',startedAt:100,from:sandbox.LowkeyWorld.driverPose(vehicle),outside:sandbox.LowkeyWorld.exitPosition(vehicle),thiefFrom:{x:vehicle.x+3,y:vehicle.y,z:vehicle.z}};
    controller.receive({vehicles:records,serverTime:100},100,100);
    const rig=()=>({group:new THREE.Group(),body:new THREE.Group(),arms:[0,1].map(()=>{const arm=new THREE.Group();arm.userData.forearm=new THREE.Group();return arm;}),legs:[new THREE.Group(),new THREE.Group()]});
    const thief=rig(),victim=rig(),animate=(id,rig,time)=>controller.animateHijack(id,rig.group,rig.arms,rig.legs,rig.body,time);
    assert.equal(animate('thief',thief,100),true);assert.ok(Math.abs(thief.group.position.x-vehicle.hijacking.thiefFrom.x)<1e-8);
    controller.update(.04,1000,1000,null,{brake:true},0);
    if(kind==='car')assert.ok(controller.models.get(vehicle.id).doorPivot.rotation.y<-.4,'door stays open while pulling');
    animate('thief',thief,1000);assert.ok(thief.arms[0].rotation.x<-1,'arm reaches the driver');
    animate('victim',victim,1900);assert.ok(victim.group.position.distanceTo(new THREE.Vector3(vehicle.hijacking.outside.x,vehicle.hijacking.outside.y,vehicle.hijacking.outside.z))<1e-8);assert.equal(victim.group.scale.x,1);
    animate('thief',thief,1900);const seat=sandbox.LowkeyWorld.driverPose(vehicle);assert.ok(thief.group.position.distanceTo(new THREE.Vector3(seat.x,seat.y,seat.z))<1e-8);assert.equal(thief.group.scale.x,seat.scale);
    for(const arm of thief.arms)assert.ok(Number.isFinite(arm.rotation.x)&&Number.isFinite(arm.userData.forearm.rotation.x));
    vehicle.hijacking=null;controller.receive({vehicles:records,serverTime:1950},1950,1950);
    assert.equal(animate('thief',thief,1950),false);assert.equal(thief.group.scale.x,1);assert.equal(thief.arms[0].rotation.x,0);assert.equal(thief.arms[0].userData.forearm.rotation.x,0);
  }
});

test('a passenger does not block a free driver seat and prediction stops at another vehicle',()=>{
  const scene=new THREE.Scene(),material=new THREE.MeshStandardMaterial();
  const box=(parent,x,y,z,sx,sy,sz,mat)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
  const controller=sandbox.LowkeyVehicles.create({THREE,scene,box,mats:{red:material}}),records=sandbox.LowkeyWorld.initialVehicles();
  records[0].passengerIds=['passenger'];records[0].x=0;records[0].z=20;records[0].rotation=0;
  records[1].x=0;records[1].z=23;
  controller.receive({vehicles:records,serverTime:100},100,100);
  assert.equal(controller.canBoard(controller.models.get(records[0].id)),true);
  records[0].driverId='driver';records[0].speed=22;
  controller.receive({vehicles:records,serverTime:150},150,150);
  for(let i=0;i<20;i++)controller.update(.04,150+i*40,150+i*40,'driver',{throttle:1,steer:0},0);
  const car=controller.active('driver');assert.ok(car.group.position.z<=21.49);assert.equal(car.predicted.speed,0);
});

test('night actually changes sky, lamp illumination, moon and stars in the scene',()=>{
  const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xadcbd1,45,115);
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1),new THREE.ShaderMaterial({uniforms:{daylight:{value:1}}}));
  const sun=new THREE.DirectionalLight(),sunOrb=new THREE.Mesh(),hemi=new THREE.HemisphereLight(),fill=new THREE.DirectionalLight(),ambient=new THREE.AmbientLight();
  const lampMaterial=new THREE.MeshStandardMaterial(),lamps=[new THREE.PointLight()],renderer={toneMappingExposure:1};
  const environment=sandbox.LowkeyEnvironment.create({THREE,scene,sky,sun,sunOrb,hemi,fill,ambient,renderer,lamps,lampMaterial,cloudMaterials:[]});
  environment.sync(1800000+15000);assert.equal(environment.update(),0);assert.equal(lamps[0].intensity,0);assert.equal(sky.material.uniforms.daylight.value,1);
  environment.sync(2700000+15000);assert.equal(environment.update(),1);assert.equal(lamps[0].intensity,18);assert.equal(sky.material.uniforms.daylight.value,0);assert.equal(sunOrb.visible,false);
  assert.ok(scene.children.find(node=>node.type==='Points').material.opacity>.8);assert.ok(label.textContent.includes('NOITE'));
});

test('unoccupied vehicles do not attach themselves to an unconnected avatar; real drivers receive a seated pose',()=>{
  const scene=new THREE.Scene(),material=new THREE.MeshStandardMaterial();
  const box=(parent,x,y,z,sx,sy,sz,mat)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
  const controller=sandbox.LowkeyVehicles.create({THREE,scene,box,mats:{red:material}});
  assert.equal(controller.active(null),null);assert.equal(controller.active(undefined),null);assert.equal(controller.active('unconnected'),null);
  controller.update(1/60,0,0,null,{throttle:0,steer:0,brake:false},1);
  const records=sandbox.LowkeyWorld.initialVehicles();records[0].driverId='driver';
  controller.receive({vehicles:records,serverTime:100},100,100);
  controller.update(1/60,100,100,'driver',{throttle:1,steer:0,brake:false},1);
  const model=controller.active('driver');assert.ok(model);assert.equal(controller.driverPose(model).scale,.62);assert.ok(model.headlight.intensity>0);
});
