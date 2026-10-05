import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import '../city-layout.js';
import '../world-systems.js';
import {createMissionStore,deliveryPoints,careerProgress,deliveryReward} from '../missions-server.mjs';
const layout=LowkeyCityLayout,world=LowkeyWorld;
test('delivery destinations cover all districts and both airport terminals, never bridges or water',()=>{
 const points=deliveryPoints(layout,world);for(const area of [...layout.districts,...layout.airports])assert.ok(points.some(p=>layout.inRect(p.x,p.z,area)),area.name);
 for(const p of points){assert.equal(world.waterAt(p),false);assert.equal(world.clearAt(p.x,p.z,.85),true);assert.equal(p.y,world.groundHeight(p.x,p.z));assert.notEqual(layout.groundKind(p.x,p.z),'bridge');}
});
test('clandestine work has a fixed accessible broker, isolated durable reputation and server-owned rewards',async()=>{
 const root=await mkdtemp(join(tmpdir(),'lowkey-careers-'));let time=100000,seed=77;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;},options={root,layout,world,now:()=>time,random},p={health:100,position:{x:0,y:0,z:0}};
 try{const store=await createMissionStore(options);let state=await store.run('a','state',p),broker=state.broker;assert.ok(layout.inRect(broker.x,broker.z,layout.districts.find(d=>d.id==='favela')));assert.equal(world.clearAt(broker.x,broker.z,.85),true);
  await assert.rejects(store.run('a','start',p,{career:'illicit'}),{statusCode:409});await assert.rejects(store.run('a','start',p,{career:'admin'}),{statusCode:400});
  for(let i=0;i<30;i++){p.position=broker;state=await store.run('a','start',p,{career:'illicit',level:99,reward:999999});const a=state.active;assert.equal(a.pickup.contact.name,'Zeca');assert.equal(a.level,careerProgress({careers:{illicit:{completed:i}}},'illicit').level);assert.ok(a.distance<=[180,320,550,Infinity][a.level-1]+1);assert.equal(layout.inSafeZone(a.destination),false);assert.equal(a.reward,Math.round(deliveryReward(a.distance)*(1.5+(a.level-1)*.15)));assert.equal(store.illicitCarrying('a'),false);
   await store.run('a','interact',p,{missionId:a.id});assert.equal(store.illicitCarrying('a'),true);p.position=a.destination;await assert.rejects(store.run('a','interact',p,{missionId:a.id}),{statusCode:409});time+=20000;state=await store.run('a','interact',p,{missionId:a.id});assert.equal(state.careers.illicit.completed,i+1);assert.equal(state.careers.legal.completed,0);assert.equal(store.illicitCarrying('a'),false);await assert.rejects(store.run('a','interact',p,{missionId:a.id}),{statusCode:409});time+=30001;
  }
  assert.equal(state.careers.illicit.level,4);const restart=await createMissionStore(options);state=await restart.run('a','state',p);assert.equal(state.careers.illicit.completed,30);assert.equal(state.broker.contact.name,broker.contact.name);
  p.position=broker;state=await restart.run('a','start',p,{career:'illicit'});await restart.run('a','interact',p,{missionId:state.active.id});const balance=state.balance;state=await restart.run('a','state',p,{},true);assert.equal(state.active,null);assert.equal(state.balance,balance);assert.equal(state.careers.illicit.completed,30);assert.equal(restart.illicitCarrying('a'),false);
  state=await restart.run('a','start',p,{career:'legal'});p.position=state.active.pickup;await restart.run('a','interact',p,{missionId:state.active.id});assert.equal(restart.carrying('a'),true);assert.equal(restart.illicitCarrying('a'),false);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('old deliveries migrate into the legal career without losing balance',async()=>{
 const root=await mkdtemp(join(tmpdir(),'lowkey-career-migration-'));try{await mkdir(join(root,'data'));await writeFile(join(root,'data','missions.json'),JSON.stringify({a:{completed:17,balance:1400}}));const store=await createMissionStore({root,layout,world});const state=await store.run('a','state');assert.equal(state.balance,1400);assert.equal(state.careers.legal.level,3);assert.equal(state.careers.legal.completed,17);assert.equal(state.careers.illicit.completed,0);}finally{await rm(root,{recursive:true,force:true});}
});
