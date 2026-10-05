import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import '../city-layout.js';
import '../world-systems.js';
import {createMissionStore,deliveryPoints,deliveryReward} from '../missions-server.mjs';
import {createPoliceGame} from '../police-server.mjs';
test('plaza safe boundary includes all sidewalks but none of the surrounding asphalt or crosswalks',()=>{
 const l=LowkeyCityLayout,s=l.safeZone;
 for(const side of [-1,1]){
  for(const z of [-s.hz+.1,0,s.hz-.1]){assert.equal(l.inSafeZone({x:side*(s.hx-.01),z}),true);assert.equal(l.inSafeZone({x:side*(60-4.5+.1),z}),false);}
  for(const x of [-s.hx+.1,0,s.hx-.1]){assert.equal(l.inSafeZone({x,z:side*(s.hz-.01)}),true);assert.equal(l.inSafeZone({x,z:side*(64-4.5+.1)}),false);}
 }
 assert.equal(l.inSafeZone({x:60,z:0}),false,'east/west bordering road is not safe');
 assert.equal(l.inSafeZone({x:0,z:58}),true,'enlarged north/south sidewalk is protected');
});
test('delivery contacts are on accessible dry surfaces across the map; longer routes pay more',async()=>{
 const points=deliveryPoints(LowkeyCityLayout,LowkeyWorld);assert.ok(points.length>50);
 for(const p of points){assert.ok(LowkeyWorld.clearAt(p.x,p.z,.85));assert.notEqual(LowkeyCityLayout.groundKind(p.x,p.z),'road');assert.equal(p.y,LowkeyWorld.groundHeight(p.x,p.z));}
 for(const [x,z] of [[-1,-1],[1,-1],[-1,1],[1,1]])assert.ok(points.some(p=>p.x*x>30&&p.z*z>30));
 assert.ok(points.some(p=>p.z>200));assert.ok(deliveryReward(200)>deliveryReward(40));
 const root=await mkdtemp(join(tmpdir(),'lowkey-random-deliveries-'));let seed=123,time=100000;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 try{const options={root,layout:LowkeyCityLayout,world:LowkeyWorld,now:()=>time,random},store=await createMissionStore(options),p={health:100,position:{x:0,y:0,z:0}},routes=new Set(),looks=new Set();
  for(let i=0;i<30;i++){const a=(await store.run('user','start',p)).active;assert.ok(a.distance>=40);assert.equal(a.reward,deliveryReward(a.distance));routes.add(`${a.pickup.x}:${a.pickup.z}:${a.destination.x}:${a.destination.z}`);looks.add(JSON.stringify(a.pickup.contact.appearance));
   assert.equal(store.carrying('user'),false);p.position=a.pickup;await store.run('user','interact',p,{missionId:a.id});assert.equal(store.carrying('user'),true);
   if(i===0){const restart=await createMissionStore(options);assert.deepEqual((await restart.run('user','state',p)).active.pickup,a.pickup);assert.equal(restart.carrying('user'),true);}
   await store.cancel('user');assert.equal(store.carrying('user'),false);
  }assert.ok(routes.size>20);assert.ok(looks.size>20);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('car and motorcycle cannot pass through a real patrol footprint',()=>{
 const cop={id:'police-car-1',kind:'car',x:32,z:10,y:LowkeyWorld.groundHeight(32,10),rotation:Math.PI};
 for(const kind of ['car','moto']){const v={id:kind,kind,x:32,z:4,y:cop.y,rotation:0,speed:12},obstacles=LowkeyWorld.vehicleObstacles(v,[cop]);let hit=false;
  for(let i=0;i<100;i++){LowkeyWorld.advanceVehicle(v,{throttle:1,steer:0},.025,obstacles);if(v.collision){assert.equal(v.collision.vehicleId,cop.id);hit=true;break;}}
  assert.ok(hit,kind+' stops at patrol');assert.ok(v.z<cop.z-2);
 }
});
test('frontal patrol collision while carrying grants exactly two stars, not five each physics tick',()=>{
 let now=100000,carrying=true;const player={id:'p',accountId:'a',health:100,position:{x:60,y:-.025,z:10}},players=new Map([['p',player]]),game=createPoliceGame({world:LowkeyWorld,layout:LowkeyCityLayout,players,broadcast:()=>{},arrest:()=>{},release:()=>{},clock:()=>now,isDelivering:()=>carrying});
 const cop=game.cars[0];Object.assign(cop,{x:60,z:13,y:-.025,rotation:Math.PI});const v={kind:'car',x:60,z:10,y:-.025,rotation:0};
 assert.equal(game.deliveryCollision(player,v,cop.id,2),false);carrying=false;assert.equal(game.deliveryCollision(player,v,cop.id,10),false);carrying=true;
 v.speed=-8;assert.equal(game.deliveryCollision(player,v,cop.id,10),false);v.speed=10;
 cop.rotation=0;assert.equal(game.deliveryCollision(player,v,cop.id,10),false);cop.rotation=Math.PI;
 assert.equal(game.deliveryCollision(player,v,cop.id,10),true);for(let i=0;i<100;i++)assert.equal(game.deliveryCollision(player,v,cop.id,10),false);assert.equal(game.snapshot().wanted[0].stars,2);
 now+=11000;assert.equal(game.deliveryCollision(player,v,cop.id,10),true);assert.equal(game.snapshot().wanted[0].stars,2);
});
