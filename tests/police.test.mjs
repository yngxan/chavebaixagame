import test from 'node:test';
import assert from 'node:assert/strict';
import '../city-layout.js';
import '../world-systems.js';
import {createPoliceGame} from '../police-server.mjs';
function fixture(){let now=100000,paused=false;const players=new Map(),events=[],arrests=[],releases=[];const game=createPoliceGame({world:LowkeyWorld,layout:LowkeyCityLayout,players,broadcast:e=>events.push(e),clock:()=>now,paused:()=>paused,arrest:(...args)=>arrests.push(args),release:(...args)=>releases.push(args)});return{game,players,events,arrests,releases,step(n=1){for(let i=0;i<n;i++){now+=50;game.tick();}},pause(v){paused=v;}};}

test('reinforcement officers leave the real station, board their cars and resume patrol after the suspect leaves',()=>{
  const f=fixture(),p={id:'dispatch',accountId:'dispatch',health:100,position:{x:160,y:3.2,z:310}};f.players.set(p.id,p);f.game.crime(p,10);
  let departure=false;
  for(let i=0;i<1200;i++){f.step();for(const c of f.game.cars.filter(c=>Number(c.id.split('-').at(-1))>2)){if(!c.deploying&&c.speed>0)departure=true;for(const id of c.officerIds){const o=f.game.officers.get(id);if(!o.seated)assert.ok(LowkeyWorld.clearAt(o.position.x,o.position.z,.30),'walking stays outside walls');}}}
  assert.ok(departure,'reinforcements must actually board and drive away, not circle the station');
  f.players.clear();f.step(1200);assert.ok(f.game.cars.every(c=>!c.deploying&&c.officerIds.every(id=>f.game.officers.get(id).seated)),'all crews return to their assigned vehicles');
});

test('a patrol with a missing officer collects a second officer and resumes its route',()=>{
  const f=fixture(),car=f.game.cars[0];f.game.hurt(car.officerIds[0],100,null);let repaired=false;
  for(let i=0;i<2400;i++){f.step();if(car.officerIds.length===2&&!car.recruiting&&!car.deploying&&car.speed>0&&car.officerIds.every(id=>f.game.officers.get(id).seated)){repaired=true;break;}}
  assert.ok(repaired,'a surviving officer must not leave a half-crewed car parked forever');
  assert.equal(new Set(f.game.cars.flatMap(c=>c.officerIds)).size,f.game.cars.flatMap(c=>c.officerIds).length,'an officer belongs to only one car');
});

test('crime dispatches a search without visual contact and station teams finish the exit before following moving targets',()=>{
  const f=fixture(),p={id:'hidden',accountId:'hidden',health:100,position:{x:160,y:3.2,z:310}};f.players.set(p.id,p);f.game.crime(p,10);f.step();
  assert.ok(f.game.cars.every(c=>c.targetId===p.id),'cars start a city-wide search immediately, outside sight range');
  f.step(245);const car=f.game.cars.find(c=>c.deploying);assert.ok(car);let usedDoor=false,departed=false;
  for(let i=0;i<800;i++){if(i%30===0){p.position.x=-p.position.x;f.game.crime(p,1);}f.step();for(const id of car.officerIds){const o=f.game.officers.get(id);if(!o.seated){const gate=LowkeyCityLayout.policePoint(0,7.5);usedDoor||=Math.hypot(o.position.x-gate.x,o.position.z-gate.z)<1.1;}}departed||=!car.deploying&&car.speed>0;}
  assert.ok(usedDoor,'the assigned team crosses the station doorway');assert.ok(departed,'target movement cannot interrupt deployment');
});
test('station has walkable entrance and a contained jail; two cars carry four officers plus two at station',()=>{
  const f=fixture();assert.equal(f.game.cars.length,2);assert.equal(f.game.officers.size,6);assert.equal([...f.game.officers.values()].filter(o=>o.seated).length,4);
  assert.equal(LowkeyWorld.clearAt(LowkeyCityLayout.jailExit.x,LowkeyCityLayout.jailExit.z,.32),true);
  assert.equal(LowkeyWorld.clearAt(LowkeyCityLayout.jail.x,LowkeyCityLayout.jail.z,.32),true);
  for(let z=2;z<=8;z+=.25){const p=LowkeyCityLayout.policePoint(0,z);assert.equal(LowkeyWorld.clearAt(p.x,p.z,.32),true,'entrance must not be an invisible wall');}
});
test('real patrol routes move without teleporting or crossing building geometry',()=>{
  const f=fixture(),start=f.game.cars.map(c=>({x:c.x,z:c.z}));let travel=0;
  for(let i=0;i<2400;i++){const previous=f.game.cars.map(c=>({x:c.x,z:c.z}));f.step();f.game.cars.forEach((c,k)=>{const d=Math.hypot(c.x-previous[k].x,c.z-previous[k].z);assert.ok(d<=.401);travel+=d;assert.ok(LowkeyCityLayout.roads.some(r=>LowkeyCityLayout.inRect(c.x,c.z,r)));assert.equal(LowkeyWorld.vehicleClearAt(c,c.x,c.z),true);});}
  assert.ok(travel>500,`patrol must not get stuck: ${travel}`);assert.ok(f.game.cars.every((c,k)=>Math.hypot(c.x-start[k].x,c.z-start[k].z)>10));
});
test('stars escalate to five, safe zone and Zombies do not generate pursuit; escaping decays stars',()=>{
  const f=fixture(),p={id:'p',accountId:'a',position:{x:180,y:-.38,z:310},health:100};f.players.set(p.id,p);
  for(let i=0;i<40;i++)assert.ok(f.game.crime(p));assert.equal(f.game.snapshot().wanted[0].stars,5);
  f.step(420);assert.equal(f.game.snapshot().wanted[0].stars,5,'a brief escape must not cancel pursuit');f.step(800);assert.equal(f.game.snapshot().wanted[0].stars,4);f.step(1600);assert.equal(f.game.snapshot().wanted[0].stars,0);
  p.position={x:0,y:0,z:0};assert.equal(f.game.crime(p),false);p.position={x:-60,y:0,z:-64};f.pause(true);assert.equal(f.game.crime(p),false);
});
test('police approach, arrest for 20 seconds, retain detention on reconnect, and release',()=>{
  const f=fixture(),p={id:'p',accountId:'a',position:{x:-60,y:-.025,z:-60},health:100};f.players.set(p.id,p);f.game.crime(p);f.step(200);
  assert.equal(f.arrests.length,1);assert.equal(f.game.isJailed(p),true);assert.equal(f.arrests[0][2],LowkeyCityLayout.jail);assert.equal(f.game.snapshot().wanted[0].stars,0);
  f.game.connect({...p,id:'reconnected'});assert.equal(f.arrests.length,2);assert.equal(f.arrests[0][1],f.arrests[1][1],'reconnect cannot shorten detention');
  f.step(401);assert.equal(f.game.isJailed(p),false);assert.equal(f.releases.length,1);
});
test('NPC damage is server-owned, escalates crimes, respawns officers, and keeps reinforcements bounded',()=>{
  const f=fixture(),p={id:'p',accountId:'a',position:{x:100,y:0,z:156},health:100};f.players.set(p.id,p);
  assert.equal(f.game.hurt('unknown',100,p),false);assert.ok(f.game.hurt('police-5',100,p));assert.equal(f.game.officers.get('police-5').health,0);assert.equal(f.game.snapshot().wanted[0].stars,2);
  f.step(601);assert.equal(f.game.officers.get('police-5').health,100);assert.ok(f.game.officers.size<=f.game.MAX_OFFICERS);f.pause(true);assert.equal(f.game.hurt('police-5',100,p),false);
});
test('station officers find the doorway and walk around walls rather than through the building',()=>{
  const f=fixture(),p={id:'p',accountId:'a',position:{x:-55,y:0,z:-4},health:100};f.players.set(p.id,p);f.game.crime(p);
  for(let i=0;i<1000&&!f.arrests.length;i++){f.step();for(const id of ['police-5','police-6']){const o=f.game.officers.get(id);assert.ok(LowkeyWorld.clearAt(o.position.x,o.position.z,.30));}}
  assert.ok(f.arrests.length,'officers must get out of the station and reach a suspect behind it');
});
test('frequent motion snapshots are compact and do not resend avatar appearances',()=>{
  const f=fixture();f.step();const motion=f.events.find(e=>e.type==='police-motion');assert.equal(motion.officers.length,6);assert.equal(motion.cars.length,2);assert.equal(JSON.stringify(motion).includes('appearance'),false);assert.ok(JSON.stringify(motion).length<JSON.stringify(f.game.snapshot()).length/2);
});
test('an empty patrol is reused by a fresh two-officer crew; dead officers respawn in the station',()=>{
  const f=fixture(),car=f.game.cars[0],ids=[...car.officerIds],before={x:car.x,z:car.z};for(const id of ids)assert.ok(f.game.hurt(id,100,null));
  f.step(200);assert.ok(f.game.cars.includes(car));assert.deepEqual({x:car.x,z:car.z},before);assert.equal(car.speed,0);assert.equal(car.lights,false);
  f.step(400);assert.equal(f.game.cars.some(c=>c.id===car.id),true);assert.equal(car.officerIds.length,2);assert.ok(car.officerIds.every(id=>!ids.includes(id)),'reuse the car with a living replacement crew');for(const id of ids){const o=f.game.officers.get(id);assert.equal(o.health,100);assert.equal(o.carId,null);assert.equal(o.seated,false);assert.ok(Math.hypot(o.position.x-o.home.x,o.position.z-o.home.z)<.01);}
  const positions=ids.map(id=>({...f.game.officers.get(id).position}));f.step(100);assert.ok(ids.some((id,i)=>Math.hypot(f.game.officers.get(id).position.x-positions[i].x,f.game.officers.get(id).position.z-positions[i].z)>1));
  f.step(800);assert.ok(f.game.cars.filter(c=>!c.abandonedUntil).length>=2,'replacement patrol is dispatched');assert.ok(car.officerIds.every(id=>f.game.officers.get(id).seated),'replacement crew boards and resumes patrol');
});
test('reinforcements spawn in the station during pursuit, remain bounded, and stop spawning in Zombies',()=>{
  const f=fixture(),p={id:'wanted',accountId:'wanted',position:{x:160,y:3.2,z:310},health:100};f.players.set(p.id,p);f.game.crime(p,10,{gunfire:true});f.game.hurt('police-5',100,null);f.game.hurt('police-6',100,null);f.step(241);
  const reinforcements=[...f.game.officers.values()].filter(o=>o.reinforcement);assert.ok(reinforcements.length>0);assert.ok(reinforcements.every(o=>Math.hypot(o.position.x-LowkeyCityLayout.policeStation.x,o.position.z-LowkeyCityLayout.policeStation.z)<8));
  for(let cycle=0;cycle<4;cycle++){for(const o of f.game.officers.values())if(o.health>0&&o.carId)f.game.hurt(o.id,100,p);f.game.crime(p,10);f.step(650);assert.ok(f.game.officers.size<=f.game.MAX_OFFICERS);assert.ok(f.game.cars.filter(c=>!c.abandonedUntil).length<=f.game.MAX_PATROL_CARS);}
  f.pause(true);const count=f.game.officers.size;f.step(240);assert.ok(f.game.officers.size<=count,'no new officers are dispatched while Zombies is active');
});
test('wanted players can be followed and captured in the safe plaza, but innocent players cannot generate a crime there',()=>{
  const f=fixture(),p={id:'wanted',accountId:'wanted',position:{x:-34,y:0,z:1},health:100};f.players.set(p.id,p);f.game.crime(p);p.position={x:-23,y:0,z:1};const o=f.game.officers.get('police-5');o.position={x:-31,y:0,z:1};f.step(180);assert.ok(f.arrests.length,'crossing the plaza boundary does not stop arrest');
  const innocent={id:'innocent',accountId:'innocent',position:{x:0,y:0,z:0},health:100};f.players.set(innocent.id,innocent);assert.equal(f.game.crime(innocent,10,{gunfire:true}),false);f.step(60);assert.equal(f.game.isJailed(innocent),false);
});
test('head-on patrols give way and pass without teleporting or freezing on the same lane',()=>{
  const f=fixture(),[a,b]=f.game.cars,north=f.game.roadNodes.findIndex(p=>p.x===-60&&p.z===-36),south=f.game.roadNodes.findIndex(p=>p.x===-60&&p.z===-64);
  Object.assign(a,{x:-60,z:-55,rotation:0,node:south,path:[north],planAt:Infinity});Object.assign(b,{x:-60,z:-50,rotation:Math.PI,node:north,path:[south],planAt:Infinity});let passed=false,siding=false;
  for(let i=0;i<240;i++){const before=[{x:a.x,z:a.z},{x:b.x,z:b.z}];f.step();siding||=Math.abs(b.x+60)>1;passed||=a.z>b.z+3;for(const [j,c] of [a,b].entries()){assert.ok(Math.hypot(c.x-before[j].x,c.z-before[j].z)<=.401,'no teleport');assert.equal(LowkeyWorld.vehicleClearAt(c,c.x,c.z),true,'stay on navigable geometry');}}
  assert.ok(siding,'lower priority patrol opens a siding');assert.ok(passed,'both cars get past the head-on conflict');
});
test('multiple wanted players split patrol assignments; additional teams leave the station without exceeding limits',()=>{
  const f=fixture(),a={id:'a',accountId:'aa',health:100,position:{x:-60,y:3.2,z:-52}},b={id:'b',accountId:'bb',health:100,position:{x:60,y:3.2,z:52}};f.players.set(a.id,a);f.players.set(b.id,b);f.game.crime(a);f.game.crime(b);f.step(20);
  assert.equal(new Set(f.game.cars.filter(c=>!c.abandonedUntil).map(c=>c.targetId)).size,2,'both suspects receive a patrol');
  f.step(500);assert.ok(f.game.cars.length>=4,'multiple suspects request extra cars');assert.ok(f.game.officers.size<=18);assert.ok(f.game.cars.filter(c=>!c.abandonedUntil).length<=6);
  b.health=0;f.step(20);assert.ok(f.game.cars.filter(c=>!c.deploying&&!c.abandonedUntil).every(c=>c.targetId===a.id),'teams retarget surviving wanted players');
});
