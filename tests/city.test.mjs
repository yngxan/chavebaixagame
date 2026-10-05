import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import '../city-layout.js';
import '../world-systems.js';
import '../motion-sync.js';
const city=LowkeyCityLayout,world=LowkeyWorld,motion=LowkeyMotion;

test('city preserves the central plaza, extends the playable terrain and agrees with client floor physics',()=>{
  assert.equal(world.groundHeight(0,5),.18);assert.equal(world.groundHeight(12,5),.18);
  assert.equal(world.groundHeight(0,-11.7),.18);assert.equal(world.supportHeight(0,city.festival.z),city.festival.y);
  assert.equal(world.groundHeight(0,28),.18);assert.equal(world.groundHeight(60,20),-.025);
  assert.equal(world.groundHeight(54,20),.12);assert.equal(world.groundHeight(120.1,0),.12,'new seafront access');assert.equal(world.groundHeight(135,0),-.05);assert.equal(world.groundHeight(175,0),null);
  assert.ok(city.buildings.length>=50);assert.ok(city.buildings.every(b=>Math.abs(b.x)>32||Math.abs(b.z)>36));
  for(let x=-119.83;x<120;x+=2.71)for(let z=-119.67;z<120;z+=2.83)assert.equal(motion.supportHeight(motion.plazaSurfaces,x,z,world.groundHeight(x,z)+.01),world.groundHeight(x,z),`floor at ${x},${z}`);
  for(const p of city.surfaces)for(const dx of [-p.hx,p.hx])for(const dz of [-p.hz,p.hz])assert.equal(motion.supportHeight(motion.plazaSurfaces,p.x+dx,p.z+dz),world.groundHeight(p.x+dx,p.z+dz),'curb borders agree, too');
  for(let i=0;i<city.surfaces.length;i++)for(let j=i+1;j<city.surfaces.length;j++){
    const a=city.surfaces[i],b=city.surfaces[j];assert.ok(Math.abs(a.x-b.x)>=a.hx+b.hx-1e-8||Math.abs(a.z-b.z)>=a.hz+b.hz-1e-8,'road intersections have no overlapping top faces');
  }
});

test('new buildings match foot, car, bullet and third-person camera collisions',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),b=city.buildings.find(b=>b.kind==='tower'&&b.rotation===0),c=Math.cos(b.rotation),s=Math.sin(b.rotation);
  const center={x:b.x,y:.12,z:b.z},outside={x:b.x+s*(b.depth/2+3),y:1.6,z:b.z+c*(b.depth/2+3)};
  assert.equal(world.clearAt(center.x,center.z,.32),false);assert.equal(world.clearAt(outside.x,outside.z,.32),true);
  assert.ok(world.shotBlock(outside,{...center,y:1.6})<1);
  const camera={...center,y:1.6};world.constrainCamera(outside,camera);assert.ok(Math.hypot(camera.x-b.x,camera.z-b.z)>b.depth/2);
  const sandbox=vm.createContext({PLAYER_COLLISION_RADIUS:.32,PLAYER_FEET_OFFSET:0,solidObstacles:city.obstacles.map(o=>({...o,type:o.r===undefined?'localbox':'circle'})),vehicleObstacles:[]});
  vm.runInContext(html.slice(html.indexOf('  function resolveWorldCollision('),html.indexOf('  function insidePlatform(')),sandbox);
  sandbox.p={...center};vm.runInContext('resolveWorldCollision(p)',sandbox);
  assert.equal(world.clearAt(sandbox.p.x,sandbox.p.z,.30),true,'client resolves outside the same server building footprint');
  for(const building of city.buildings){const c=Math.cos(building.rotation),s=Math.sin(building.rotation);
    for(const dx of [-building.width/2,building.width/2])for(const dz of [-building.depth/2,building.depth/2])assert.notEqual(city.groundKind(building.x+dx*c+dz*s,building.z-dx*s+dz*c),'road','building does not obstruct asphalt');
  }
});

test('cars and bikes can travel the new ring roads past the previous multiplayer boundary',()=>{
  for(const base of world.initialVehicles().filter(v=>!world.isWatercraft(v))){
    const vehicle={...base,x:60,z:72,rotation:0,speed:18};let previous=vehicle.z;
    for(let i=0;i<55;i++){world.advanceVehicle(vehicle,{throttle:1},.05);assert.ok(vehicle.z>=previous);assert.equal(vehicle.collision,null);assert.equal(vehicle.y,world.groundHeight(vehicle.x,vehicle.z));previous=vehicle.z;}
    assert.ok(vehicle.z>90);assert.equal(world.clearAt(vehicle.x,vehicle.z,.5),true);
  }
});

test('city renderer batches thousands of details and budgets six nearby night lights',async()=>{
  const sandbox=vm.createContext({console:{warn(){},log(){}}});
  for(const file of ['three.min.js','city-layout.js','city-client.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),sandbox);
  const THREE=sandbox.THREE,scene=new THREE.Scene(),controller=sandbox.LowkeyCity.create({THREE,scene,signMaterial:()=>new THREE.MeshBasicMaterial()});
  assert.ok(controller.instanceCount>3000);assert.ok(controller.batchCount<60);assert.equal(controller.lights.length,6);
  assert.equal(controller.islandSectors.length,4);for(const sector of controller.islandSectors){const [soil,turf,sand]=sector.children;assert.ok(soil.position.y+soil.geometry.parameters.options.depth<turf.position.y&&turf.position.y<sand.position.y,'terrain layers never overlap the soil cap');}
  for(const mesh of controller.group.children.filter(m=>m.isInstancedMesh))for(let i=0;i<mesh.count;i++){const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);assert.ok(matrix.elements.every(Number.isFinite));}
  const safe=sandbox.LowkeyCityLayout.safeZone,line=controller.group.children.find(m=>m.isInstancedMesh&&m.material.color.getHex()===0xd4ff00);assert.ok(line,'safe boundary is rendered');
  for(let i=0;i<line.count;i++){const matrix=new THREE.Matrix4();line.getMatrixAt(i,matrix);const e=matrix.elements;assert.ok(Math.abs(e[12])+Math.abs(e[0])/2<=safe.hx+.00001);assert.ok(Math.abs(e[14])+Math.abs(e[10])/2<=safe.hz+.00001);}
  const position=sandbox.LowkeyCityLayout.lamps[0];controller.update(1,position,1000);assert.ok(controller.lights.some(l=>l.intensity>0));
  controller.update(0,position,1100);assert.ok(controller.lights.every(l=>l.intensity===0));
  controller.update(1,{x:0,z:0},1500);assert.ok(controller.lights.every(l=>l.intensity===0),'distant lamp pool does not light the central plaza');
});
