import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import '../city-layout.js';
import '../world-systems.js';
import {createMissionStore} from '../missions-server.mjs';
test('delivery validates server position, identity, stages, cooldown, concurrency and durable rewards',async()=>{
 const root=await mkdtemp(join(tmpdir(),'lowkey-mission-test-'));let time=100000;const options={root,layout:LowkeyCityLayout,now:()=>time},store=await createMissionStore(options),p={position:{x:0,y:0,z:0},health:100};
 try{
  let state=await store.run('a','start',p),id=state.active.id,reward=state.active.reward;assert.equal(state.balance,0);
  await assert.rejects(store.run('a','start',p),{statusCode:409});
  await assert.rejects(store.run('a','interact',p,{missionId:id}),{statusCode:409});
  p.position={...state.pickup};await assert.rejects(store.run('a','interact',p,{missionId:'wrong'}),{statusCode:409});
  p.vehicleId='car';await assert.rejects(store.run('a','interact',p,{missionId:id}),{statusCode:409});p.vehicleId=null;
  state=await store.run('a','interact',p,{missionId:id});assert.equal(state.active.stage,'deliver');
  p.position={...state.active.destination};await assert.rejects(store.run('a','interact',p,{missionId:id}),{statusCode:409});time+=5000;
  const results=await Promise.allSettled([store.run('a','interact',p,{missionId:id}),store.run('a','interact',p,{missionId:id})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  state=await store.run('a','state',p);assert.equal(state.balance,reward);assert.equal(state.completed,1);assert.equal(state.active,null);
  assert.equal((await store.run('b','state',p)).balance,0);await assert.rejects(store.run('a','start',p),{statusCode:429});
  const restart=await createMissionStore(options);assert.equal((await restart.run('a','state',p)).balance,reward);
  time+=30000;state=await restart.run('a','start',p);assert.notEqual(state.active.id,id);const reconnect=await createMissionStore(options);assert.equal((await reconnect.run('a','state',p)).active.id,state.active.id);
  p.health=0;assert.equal((await reconnect.run('a','state',p)).active,null);p.health=100;
  await reconnect.run('a','start',p);time+=600001;assert.equal((await reconnect.run('a','state',p)).active,null);
  await reconnect.run('a','start',p);assert.equal((await reconnect.run('a','state',p,{},true)).active,null);
  await reconnect.run('a','start',p);await reconnect.cancel('a');assert.equal((await reconnect.run('a','state',p)).balance,reward);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('failed persistence never grants phantom balance and queue recovers',async()=>{
 let state={},fail=false;const database={async query(sql,args){if(sql.startsWith('CREATE'))return{};if(sql.startsWith('SELECT'))return{rows:state[args[0]]?[{state:structuredClone(state[args[0]])}]:[]};if(fail)throw Error('offline');state[args[0]]=structuredClone(args[1]);return{};}};let time=0;const store=await createMissionStore({database,root:'unused',layout:LowkeyCityLayout,now:()=>time}),p={position:{x:12,y:0,z:12},health:100};let s=await store.run('a','start',p),reward=s.active.reward;p.position=s.active.pickup;await store.run('a','interact',p,{missionId:s.active.id});p.position=s.active.destination;time=5000;fail=true;await assert.rejects(store.run('a','interact',p,{missionId:s.active.id}));fail=false;assert.equal((await store.run('a','state',p)).balance,0);assert.equal((await store.run('a','interact',p,{missionId:s.active.id})).balance,reward);
});
