import test from 'node:test';
import assert from 'node:assert/strict';
import '../city-layout.js';
import '../world-systems.js';
import '../motion-sync.js';
import {createPoliceGame} from '../police-server.mjs';
const l=LowkeyCityLayout,w=LowkeyWorld,m=LowkeyMotion;

test('coast relief descends continuously into swimming depth and agrees on both peers',()=>{
  for(const x of [-90,-45,45,90]){let previous=w.groundHeight(x,172);let submerged=false;for(let z=172;z<l.beachEdge(x);z+=.1){const y=w.groundHeight(x,z);assert.ok(Math.abs(y-previous)<.03);assert.equal(m.supportHeight(m.plazaSurfaces,x,z),y);assert.equal(y,l.beachHeight(x,z));previous=y;if(y<l.coast.waterY-.2){assert.equal(w.waterAt({x,y,z}),true);submerged=true;}}assert.ok(submerged);assert.equal(w.groundHeight(x,l.beachEdge(x)+1),null);}
});
test('expanded skyline, civic services, bridge towers and pier keep shared walkable routes',()=>{
  assert.equal(l.buildings.filter(b=>!b.district&&b.kind==='house').length,0);assert.equal(l.buildings.filter(b=>b.civic).length,2);assert.ok(new Set(l.buildings.filter(b=>!b.district&&b.kind==='tower').map(b=>b.height)).size>8);
  for(const p of l.gasStations){assert.ok(l.islandAt(p.x,p.z));assert.equal(w.clearAt(p.x,p.z,.32),true);assert.equal(w.clearAt(p.x+8,p.z+8,.32),false);}
  for(const x of [-50,50])for(const z of [216,232])assert.equal(w.groundHeight(x,z),1.4);
  assert.equal(w.groundHeight(l.jail.x,l.jail.z),.12);for(const p of l.prison.tasks)assert.equal(w.clearAt(p.x,p.z,.32),true);assert.equal(l.islandAt(l.jail.x,l.jail.z).id,'prison');
  for(const b of l.bridges)for(const x of [-225,-195])assert.equal(w.vehicleClearAt({kind:'car',x,y:9.2,z:b.z,rotation:Math.PI/2},x,b.z,Math.PI/2),true);
  for(const b of l.buildings.filter(b=>b.kind==='barn'))assert.equal(w.clearAt(b.x,b.z,.32),true,'pavilion center and doorway are accessible');
});
test('carousel boarding pauses and every saddle has a distinct synchronized ride pose',()=>{
  assert.equal(LowkeyRides.stations.carousel.seats,1);assert.equal(LowkeyRides.phase('carousel',30000).boarding,true);assert.equal(LowkeyRides.phase('carousel',39000).boarding,false);const positions=[];for(let i=0;i<12;i++){const pose=LowkeyRides.seat('carousel',i,0,42000);assert.ok([pose.x,pose.y,pose.z,pose.rotation].every(Number.isFinite));assert.ok(Math.abs(Math.hypot(pose.x-l.coast.carousel.x,pose.z-l.coast.carousel.z)-4.8)<1e-8);positions.push(pose);}assert.equal(new Set(positions.map(p=>p.x.toFixed(4)+':'+p.z.toFixed(4))).size,12);assert.notEqual(positions[0].x,LowkeyRides.seat('carousel',0,0,45000).x);
});
function detention(options={}){let now=100000;const player={id:'p',accountId:'a',health:100,position:{x:-60,y:-.025,z:-60}},players=new Map([['p',player]]);let sentence;const game=createPoliceGame({layout:l,world:w,players,clock:()=>now,broadcast(){},release(p,pos){p.position={...pos};},arrest(p,until,pos){sentence=until-now;p.position={...pos};}});game.crime(player,1,options);const officer=game.officers.get('police-5');officer.position={...player.position};officer.seated=false;for(let i=0;i<40&&!sentence;i++){now+=50;game.tick();}assert.ok(sentence);return{game,player,sentence,advance(ms){now+=ms;game.tick();}};}
test('sentences are minutes, increase for theft and police kills, and cannot be shortened by reconnect',()=>{
  const base=detention(),theft=detention({theftValue:25000}),kill=detention({policeKill:true});assert.equal(base.sentence,68000);assert.equal(theft.sentence,93000);assert.equal(kill.sentence,108000);const until=base.game.snapshot().wanted[0].jailUntil;base.game.connect(base.player);assert.equal(base.game.snapshot().wanted[0].jailUntil,until);
});
test('prison chores require proximity, real work time, and cannot pay a second time',()=>{
  const f=detention(),p=f.player,g=f.game;assert.throws(()=>g.prisonWork(p,'start'),/perto/);p.position={...l.prison.tasks[0],y:.12};const start=g.prisonWork(p,'start');assert.throws(()=>g.prisonWork(p,'complete'),/oito/);f.advance(8100);const done=g.prisonWork(p,'complete');assert.equal(start.until-done.until,15000);assert.equal(done.taskIndex,1);assert.throws(()=>g.prisonWork(p,'complete'),/perto/);p.position={...l.prison.tasks[1],y:.12};g.prisonWork(p,'start');p.position={...l.jail};f.advance(9000);p.position={...l.prison.tasks[1],y:.12};assert.throws(()=>g.prisonWork(p,'complete'),/oito/);f.advance(100000);assert.equal(g.isJailed(p),false);assert.throws(()=>g.prisonWork(p,'start'),/não está preso/);
});
