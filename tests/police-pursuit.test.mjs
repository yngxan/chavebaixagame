import test from 'node:test';
import assert from 'node:assert/strict';
import '../city-layout.js';
import '../world-systems.js';
import {createPoliceGame} from '../police-server.mjs';
function make({world=LowkeyWorld,segmentHit=()=>null}={}){let now=100000,paused=false;const players=new Map(),events=[],hits=[],game=createPoliceGame({world,layout:LowkeyCityLayout,players,broadcast:e=>events.push(e),clock:()=>now,random:()=>.5,segmentHit,arrest(){},release(){},damagePlayer:(...args)=>hits.push(args),paused:()=>paused});return{game,players,events,hits,pause(v){paused=v;},step(n=1){for(let i=0;i<n;i++){now+=50;game.tick();}}};}
test('pursuit runs faster, keeps a suspect after leaving the old 32m leash, and uses separate vehicle approaches',()=>{
  const f=make(),p={id:'p',accountId:'a',position:{x:-60,y:3.2,z:-58},health:100};f.players.set(p.id,p);f.game.crime(p);f.step(20);
  const officer=f.game.officers.get('police-1'),before={...officer.position};assert.equal(officer.seated,false);
  p.position={x:-60,y:3.2,z:-20};f.game.crime(p);f.step(20);assert.ok(officer.position.z>before.z+6,'must keep chasing on foot beyond 32 meters');
  p.position={x:88,y:3.2,z:36};f.game.crime(p);f.step(200);assert.ok(f.events.filter(e=>e.type==='police-motion').some(e=>e.cars.some(c=>c[5]>=24)),'viaturas accelerate beyond old 17 speed');
  assert.equal(f.game.snapshot().wanted[0].stars>0,true);
});
test('officers do not stack while chasing diagonal turns or waiting around the same suspect',()=>{
  const f=make(),p={id:'p',accountId:'a',position:{x:-60,y:3.2,z:-52},health:100};f.players.set(p.id,p);f.game.crime(p);
  for(let i=0;i<400;i++){
    if(i===100){p.position={x:-66,y:3.2,z:-36};f.game.crime(p);}if(i===180){p.position={x:-84,y:3.2,z:-34};f.game.crime(p);}f.step();
    const foot=[...f.game.officers.values()].filter(o=>o.health>0&&!o.seated);for(let a=0;a<foot.length;a++)for(let b=a+1;b<foot.length;b++)assert.ok(Math.hypot(foot[a].position.x-foot[b].position.x,foot[a].position.z-foot[b].position.z)>=.575,'walking officers need separate physical space');
  }
});
const openWorld={...LowkeyWorld,shotBlock:()=>null,crossesSolid:()=>false,clearAt:()=>true,vehicleClearAt:()=>true};
test('police only return fire after accepted gunfire, have a reaction delay, and cap collective cadence',()=>{
  const f=make({world:openWorld,segmentHit:(_a,_b,p)=>p===target.position?.5:null}),target={id:'shooter',accountId:'a',position:{...LowkeyCityLayout.policePoint(0,9),y:3},health:100};f.players.set(target.id,target);
  f.game.crime(target,3);f.step(60);assert.equal(f.hits.length,0);assert.equal(f.events.some(e=>e.type==='police-shot'),false,'punching is not permission for firearm retaliation');
  f.game.crime(target,1,{gunfire:true});f.step(8);assert.equal(f.hits.length,0,'must allow time to react');f.step(100);
  const shots=f.events.filter(e=>e.type==='police-shot');assert.ok(shots.length>0);assert.ok(f.hits.length>0);assert.ok(f.hits.every(h=>h[0]===target&&h[1]===8));for(let i=1;i<shots.length;i++)assert.ok(shots[i].serverTime-shots[i-1].serverTime>=260);
});
test('walls, safe plaza, unconnected sight lines and Zombies stop retaliation',()=>{
  let blocked=true;const f=make({world:{...openWorld,shotBlock:()=>blocked?.2:null},segmentHit:()=>.5}),target={id:'p',accountId:'a',position:{x:-60,y:3,z:-50},health:100};f.players.set(target.id,target);f.game.crime(target,1,{gunfire:true});f.step(60);assert.equal(f.hits.length,0);
  blocked=false;target.position={x:0,y:0,z:0};f.step(60);assert.equal(f.hits.length,0,'safe zone is protected');
  target.position={x:-60,y:3,z:-50};f.pause(true);f.step(60);assert.equal(f.hits.length,0);assert.equal(f.events.some(e=>e.type==='police-shot'),false);
});
