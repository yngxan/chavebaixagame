import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import '../city-layout.js';
import '../world-systems.js';
import '../motion-sync.js';
const city=LowkeyCityLayout,world=LowkeyWorld,motion=LowkeyMotion;

test('island coast has shared support heights and no invisible ocean floor',()=>{
  assert.equal(city.bounds.minZ,-585);assert.equal(city.bounds.maxZ,350);
  for(const [x,z,y] of [[0,120,.12],[40,125,.12],[40,160,-.05],[0,156,.12],[0,172,1.4],[0,200,1.4],[30,225,1.4],[0,265,1.4],[90,225,null],[30,275,null]]){
    assert.equal(world.groundHeight(x,z),y,`server floor ${x},${z}`);assert.equal(motion.supportHeight(motion.plazaSurfaces,x,z),y,`client floor ${x},${z}`);
  }
  for(let x=-119.5;x<120;x+=4.4)for(let z=120;z<280;z+=2.3)assert.equal(world.groundHeight(x,z),motion.supportHeight(motion.plazaSurfaces,x,z));
  for(const p of city.coast.surfaces)for(const dx of [-p.hx,p.hx])for(const dz of [-p.hz,p.hz])assert.equal(world.groundHeight(p.x+dx,p.z+dz),motion.supportHeight(motion.plazaSurfaces,p.x+dx,p.z+dz),'ramp/deck seams agree');
});

test('ocean surrounds all sides; buoyancy follows synchronized waves without a fake floor',()=>{
  const now=1770000123456;
  for(const [x,z] of [[-138,0],[175,0],[0,-400],[90,240]]){
    assert.equal(world.groundHeight(x,z),null);assert.equal(world.waterAt({x,y:0,z}),true);
    const position={x,y:-.5,z};for(let i=0;i<300;i++)assert.equal(world.advanceSwimmer(position,0,0,1/60,now+i*1000/60),true);
    const height=world.waterHeight(x,z,now+299*1000/60);assert.ok(Math.abs(position.y-(height-1.27))<.08);assert.equal(world.isSwimming(position,now+5000),true);
    assert.equal(world.clearAt(x,z,.5),false,'vehicles cannot drive on water');
  }
  for(const [x,z] of [[135,0],[-127,0],[0,-127]])assert.equal(world.groundHeight(x,z),-.05);
  const exiting={x:135,y:-1.65,z:50};assert.equal(world.advanceSwimmer(exiting,-2,0,.04,now),false);assert.equal(exiting.y,-.05);
  assert.equal(world.isSwimming({x:0,y:1.4,z:220},now),false,'standing on pier');
  assert.equal(world.isSwimming({x:0,y:-1.6,z:220},now),true,'water below pier');
  const bounds={x:239,y:-1.65,z:0};world.advanceSwimmer(bounds,10,0,.04,now);assert.ok(bounds.x<=238.5);
});

test('swimming pose is animated and motion buffers retain its discrete state',()=>{
  const rig=()=>({rotation:{set(x,y,z){Object.assign(this,{x,y,z});}},position:{},scale:{set(){}},userData:{}});
  const body=rig(),head=rig(),arms=[rig(),rig()],legs=[rig(),rig()];arms.forEach((a,i)=>{a.userData.side=i?1:-1;a.userData.forearm=rig();});
  motion.applySwimPose(arms,legs,body,head,1,3);const previous=arms[0].rotation.x;motion.applySwimPose(arms,legs,body,head,1.1,3);assert.notEqual(arms[0].rotation.x,previous);assert.ok(arms[0].rotation.z<0&&arms[1].rotation.z>0);
  const buffer=new motion.MotionBuffer();for(let i=0;i<8;i++)buffer.push({x:i*.1,y:-1.6,z:240,motionTime:1000+i*50,swimming:true,walking:true,speed:3},1000+i*50);assert.equal(buffer.sample(1400,.016).swimming,true);
});

test('actual movement and landing code walks from the city up the ramp and across the pier',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),sandbox=vm.createContext({LowkeyCityLayout:city,LowkeyMotion:motion,avatar:{position:{x:0,y:.12,z:125}},solidPlatforms:motion.plazaSurfaces,solidObstacles:city.obstacles.map(o=>({...o,type:o.r===undefined?'localbox':'circle'})),vehicleObstacles:[],PLAYER_COLLISION_RADIUS:.32,PLAYER_FEET_OFFSET:0,velocityY:0,onGround:true,lastLandingAt:0,performance:{now:()=>0}});
  vm.runInContext(html.slice(html.indexOf('  function resolveWorldCollision('),html.indexOf('  function applyIdleBreath(')),sandbox);
  for(let i=0;i<1400;i++){
    vm.runInContext('{moveWithWorldCollision(avatar.position,0,.1);tryStepUp();const previousY=avatar.position.y;velocityY-=20/60;avatar.position.y+=velocityY/60;if(!resolvePlatformLanding(previousY))onGround=false;}',sandbox);
    assert.ok(sandbox.avatar.position.y>=-.051,'no fall through a ramp seam');
  }
  assert.ok(sandbox.avatar.position.z>264);assert.equal(sandbox.avatar.position.y,1.4);assert.equal(sandbox.onGround,true);
  const p={x:0,y:.2,z:230};world.keepCameraAboveGround(p);assert.equal(p.y,1.72);
});

test('rides, kiosks and guardrails block entry while the park path stays open',()=>{
  for(const [x,z] of [[-23,240],[84,224],[4.5,271]])assert.equal(world.clearAt(x,z,.32),false);
  assert.equal(world.clearAt(36,224,.32),true,'expanded pier wing has no old phantom side rail');
  assert.equal(world.clearAt(0,271,.32),true,'marina gate is open');
  for(const [x,z] of [[-18,223],[16,220]])assert.equal(world.clearAt(x,z,.32),true,'empty space below a ride is walkable');
  for(const [x,y,z] of city.coast.trackSupports)assert.equal(world.clearAt(x,z,.32),false,'visible track column blocks movement');
  for(const z of [125,156,171,180,201,214,224,240,260])assert.equal(world.clearAt(0,z,.32),true,`open center route at ${z}`);
  assert.equal(world.clearAt(90,225,.32),false,'cars cannot drive on ocean');
  assert.ok(city.coast.obstacles.filter(o=>o.kind==='rail').length>=10);
});

test('coast renders bounded detail batches; animation stays upright, finite and server-clock synchronized',async()=>{
  const sandbox=vm.createContext({console:{warn(){},log(){}}});
  for(const file of ['three.min.js','city-layout.js','world-systems.js','coast-client.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),sandbox);
  const THREE=sandbox.THREE,controller=sandbox.LowkeyCoast.create({THREE,scene:new THREE.Scene(),signMaterial:()=>new THREE.MeshBasicMaterial()});
  assert.ok(controller.instanceCount>500);assert.ok(controller.batchCount<60);assert.equal(controller.cabins.length,16);assert.equal(controller.lights.length,3);
  const time=1770000132456;controller.update(0,{x:0,z:224},1000,time);assert.ok(Math.abs(controller.wheelRig.rotation.z+controller.cabins[0].rotation.z)<1e-8);
  const previous=controller.train[0].position.clone();controller.update(1,{x:0,z:235},1400,time+500);assert.ok(previous.distanceTo(controller.train[0].position)>.1);assert.ok(controller.lights.some(l=>l.intensity>0));
  const angle=controller.wheelRig.rotation.z;controller.update(1,{x:0,z:235},2000,time+500);assert.equal(controller.wheelRig.rotation.z,angle,'render clock alone does not desynchronize rides');
  for(const car of controller.train)assert.ok([...car.position.toArray(),...car.quaternion.toArray()].every(Number.isFinite));
  assert.equal(controller.water.material.uniforms.night.value,1);controller.update(0,{x:0,z:0},2500,time+1000);assert.ok(controller.lights.every(l=>l.intensity===0));
});
