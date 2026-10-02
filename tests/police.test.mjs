import test from 'node:test';
import assert from 'node:assert/strict';
import '../city-layout.js';
import '../world-systems.js';
import {createPoliceGame} from '../police-server.mjs';
function fixture(){let now=100000,paused=false;const players=new Map(),events=[],arrests=[],releases=[];const game=createPoliceGame({world:LowkeyWorld,layout:LowkeyCityLayout,players,broadcast:e=>events.push(e),clock:()=>now,paused:()=>paused,arrest:(...args)=>arrests.push(args),release:(...args)=>releases.push(args)});return{game,players,events,arrests,releases,step(n=1){for(let i=0;i<n;i++){now+=50;game.tick();}},pause(v){paused=v;}};}
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
test('NPC damage is server-owned, escalates crimes, respawns officers, and does not grow NPC counts',()=>{
  const f=fixture(),p={id:'p',accountId:'a',position:{x:100,y:0,z:156},health:100};f.players.set(p.id,p);
  assert.equal(f.game.hurt('unknown',100,p),false);assert.ok(f.game.hurt('police-5',100,p));assert.equal(f.game.officers.get('police-5').health,0);assert.equal(f.game.snapshot().wanted[0].stars,2);
  f.step(601);assert.equal(f.game.officers.get('police-5').health,100);assert.equal(f.game.officers.size,6);f.pause(true);assert.equal(f.game.hurt('police-5',100,p),false);
});
test('station officers find the doorway and walk around walls rather than through the building',()=>{
  const f=fixture(),p={id:'p',accountId:'a',position:{x:-55,y:0,z:-4},health:100};f.players.set(p.id,p);f.game.crime(p);
  for(let i=0;i<1000&&!f.arrests.length;i++){f.step();for(const id of ['police-5','police-6']){const o=f.game.officers.get(id);assert.ok(LowkeyWorld.clearAt(o.position.x,o.position.z,.30));}}
  assert.ok(f.arrests.length,'officers must get out of the station and reach a suspect behind it');
});
test('frequent motion snapshots are compact and do not resend avatar appearances',()=>{
  const f=fixture();f.step();const motion=f.events.find(e=>e.type==='police-motion');assert.equal(motion.officers.length,6);assert.equal(motion.cars.length,2);assert.equal(JSON.stringify(motion).includes('appearance'),false);assert.ok(JSON.stringify(motion).length<JSON.stringify(f.game.snapshot()).length/2);
});
