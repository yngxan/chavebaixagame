import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import '../city-layout.js';import '../world-systems.js';import '../motion-sync.js';
import {createMissionStore} from '../missions-server.mjs';
test('races enforce countdown, driver ownership, ordered checkpoints, plausible times and one durable payment',async()=>{
 const root=await mkdtemp(join(tmpdir(),'lowkey-race-test-'));let time=100000;const options={root,layout:LowkeyCityLayout,now:()=>time},store=await createMissionStore(options),p={health:100,position:{...LowkeyCityLayout.raceRoutes[0].points[0]},vehicleId:'car1',vehicleSeat:'driver'},data={routeId:'central',vehicleKind:'car'};
 try{p.vehicleSeat='passenger';await assert.rejects(store.run('a','race-start',p,data),{statusCode:409});p.vehicleSeat='driver';const a=(await store.run('a','race-start',p,data)).active;
  assert.equal(store.raceStartUntil('a'),time+5000);assert.equal(store.carrying('a'),false);await assert.rejects(store.run('a','start',p),{statusCode:409});
  p.position=a.checkpoints[0];await assert.rejects(store.run('a','race-checkpoint',p,{missionId:a.id}),{statusCode:409});time+=5000;await assert.rejects(store.run('a','race-checkpoint',p,{missionId:a.id}),{statusCode:409});
  p.position=a.checkpoints[1];time+=10000;await assert.rejects(store.run('a','race-checkpoint',p,{missionId:a.id}),{statusCode:409});p.position=a.checkpoints[0];p.vehicleId='car2';await assert.rejects(store.run('a','race-checkpoint',p,{missionId:a.id}),{statusCode:409});p.vehicleId='car1';
  for(let i=0;i<a.checkpoints.length;i++){p.position=a.checkpoints[i];time+=10000;const s=await store.run('a','race-checkpoint',p,{missionId:a.id,reward:999999});if(i<a.checkpoints.length-1)assert.equal(s.active.checkpoint,i+1);}
  const s=await store.run('a','state',p);assert.equal(s.active,null);assert.equal(s.balance,a.reward);assert.ok(s.bestTimes['central:car']>0);assert.equal(s.lastRace.record,true);
  await assert.rejects(store.run('a','race-checkpoint',p,{missionId:a.id}),{statusCode:409});const restart=await createMissionStore(options);assert.deepEqual((await restart.run('a','state',p)).bestTimes,s.bestTimes);assert.equal((await restart.run('a','state',p)).balance,a.reward);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('all race legs follow uninterrupted city roads and have clear checkpoint footprints',()=>{
 for(const r of LowkeyCityLayout.raceRoutes)for(let i=0;i<r.points.length;i++){const p=r.points[i];assert.equal(LowkeyCityLayout.groundKind(p.x,p.z),'road');assert.ok(LowkeyWorld.vehicleClearAt({kind:'car',y:p.y},p.x,p.z,0));if(!i)continue;const a=r.points[i-1],length=Math.hypot(p.x-a.x,p.z-a.z),heading=Math.atan2(p.x-a.x,p.z-a.z);for(let d=0;d<=length;d+=1){const x=a.x+(p.x-a.x)*d/length,z=a.z+(p.z-a.z)*d/length;assert.equal(LowkeyCityLayout.groundKind(x,z),'road');assert.ok(LowkeyWorld.vehicleClearAt({kind:'car',y:-.025},x,z,heading));}}
});
test('club entrance and stairs are accessible and floor support distinguishes lounge from suites',async()=>{
 const l=LowkeyCityLayout,w=LowkeyWorld,b=l.nightclub;assert.ok(b.z>100);assert.equal(b.kind,'nightclub');const front=l.clubPoint(0,8),inside=l.clubPoint(0,5);assert.ok(w.clearAt(front.x,front.z,.32));assert.ok(w.clearAt(inside.x,inside.z,.32));
 const upstairs=l.clubPoint(1.4,3);assert.equal(w.supportHeight(upstairs.x,upstairs.z,.4),.12);assert.equal(w.supportHeight(upstairs.x,upstairs.z,4.4),4.32);assert.equal(LowkeyMotion.supportHeight(LowkeyMotion.plazaSurfaces,upstairs.x,upstairs.z,.4),.12);assert.equal(LowkeyMotion.supportHeight(LowkeyMotion.plazaSurfaces,upstairs.x,upstairs.z,4.4),4.32);
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),sandbox=vm.createContext({PLAYER_COLLISION_RADIUS:.32,PLAYER_FEET_OFFSET:0,solidObstacles:l.obstacles.map(o=>({...o,type:o.r===undefined?'localbox':'circle'})),vehicleObstacles:[]});vm.runInContext(html.slice(html.indexOf('  function resolveWorldCollision('),html.indexOf('  function insidePlatform(')),sandbox);
 let y=.12;for(const step of l.interiorPlatforms.filter(p=>p.kind==='club-step')){assert.ok(step.y-y<=.211);const p={x:step.x,y,z:step.z};sandbox.p=p;vm.runInContext('resolveWorldCollision(p)',sandbox);assert.ok(Math.hypot(p.x-step.x,p.z-step.z)<.01,'stair is not blocked by upper floor');y=step.y;}
 const landing=l.clubPoint(-5.8,-5.1);sandbox.p={...landing,y:4.11};vm.runInContext('resolveWorldCollision(p)',sandbox);assert.ok(Math.hypot(sandbox.p.x-landing.x,sandbox.p.z-landing.z)<.01);
 const steps=l.interiorPlatforms.filter(p=>p.kind==='club-step'),top=l.interiorPlatforms.find(p=>p.kind==='motel-landing');assert.ok(top.z+top.hz>=steps.at(-1).z-steps.at(-1).hz-1e-9,'no unsupported gap between stairs and upstairs landing');
});
test('nightclub performers are adult-proportioned, opaque and bounded; lights turn off at distance',async()=>{
 const sandbox=vm.createContext({console:{warn(){},log(){}}});for(const f of ['three.min.js','city-layout.js','city-client.js'])vm.runInContext(await readFile(new URL('../'+f,import.meta.url),'utf8'),sandbox);const THREE=sandbox.THREE,c=sandbox.LowkeyCity.create({THREE,scene:new THREE.Scene(),signMaterial:()=>new THREE.MeshBasicMaterial()}),b=sandbox.LowkeyCityLayout.nightclub;
 assert.equal(c.dancers.length,2);assert.ok(c.dancers.every(d=>d.root.userData.age>=21&&d.root.userData.outfit==='opaque-bikini'));c.update(0,b,1000);assert.ok(c.clubLights.every(l=>l.intensity>0));c.update(1,{x:0,z:0},2000);assert.ok(c.clubLights.every(l=>l.intensity===0));assert.ok(c.dancers.every(d=>!d.root.visible));assert.ok(c.batchCount<60);
});
