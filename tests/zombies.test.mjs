import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createZombiesGame} from '../zombies-server.mjs';
import '../city-layout.js';
import '../world-systems.js';

function fixture(){let now=10000,seed=812;const events=[],players=new Map([['p',{id:'p',health:100,position:{x:0,y:.18,z:5}}]]);let restored=0,hits=0;
  const game=createZombiesGame({world:LowkeyWorld,players,clock:()=>now,random:()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;},broadcast:e=>events.push(e),restorePlayers:()=>restored++,damagePlayer:(p,damage)=>{hits++;p.health=Math.max(0,p.health-damage);}});
  return {game,events,players,advance(ms){now+=ms;game.tick();},get now(){return now;},get restored(){return restored;},get hits(){return hits;}};
}
test('rounds spawn varied ground enemies, reject premature hits and advance only after every kill',()=>{
  const f=fixture();assert.equal(f.game.start('owner').started,true);assert.equal(f.restored,1);assert.equal(f.game.start('other').started,false);assert.equal(f.game.ownerId,'owner');
  f.advance(1);const first=[...f.game.zombies.values()][0];assert.ok(first);assert.equal(f.game.hurt(first.id,100,'p'),false,'emergence cannot be hit');
  for(let i=0;i<8;i++)f.advance(450);
  assert.equal(f.game.snapshot().state.pending,0);assert.equal(f.game.zombies.size,8);assert.ok(new Set([...f.game.zombies.values()].map(z=>z.appearance.shirt)).size>1);
  for(const z of f.game.zombies.values()){assert.equal(z.position.y,LowkeyWorld.groundHeight(z.position.x,z.position.z));assert.equal(LowkeyWorld.clearAt(z.position.x,z.position.z,.32),true);}
  f.advance(1800);for(const z of [...f.game.zombies.values()])assert.equal(f.game.hurt(z.id,100,'p'),true);
  f.advance(50);assert.equal(f.game.snapshot().state.phase,'intermission');assert.equal(f.game.snapshot().state.kills,8);
  f.advance(5499);assert.equal(f.game.snapshot().state.round,1);f.advance(1);assert.equal(f.game.snapshot().state.round,2);assert.equal(f.game.snapshot().state.total,10);
});
test('server attacks obey emergence, walls, attack cooldown and game-over cleanup',()=>{
  const f=fixture();f.game.start('owner');f.advance(1);const z=[...f.game.zombies.values()][0];z.position={x:0,y:.18,z:6};
  f.advance(1000);assert.equal(f.hits,0);f.advance(650);assert.equal(f.hits,1);f.advance(50);assert.equal(f.hits,1);
  f.players.get('p').position={x:0,y:0,z:-18.5};z.position={x:0,y:0,z:-21};f.advance(1200);assert.equal(f.hits,1,'stage wall blocks attacks');
  f.players.get('p').health=0;f.advance(50);assert.equal(f.game.active,false);assert.equal(f.game.zombies.size,0);
  f.game.start('owner');f.players.clear();f.advance(50);assert.equal(f.game.active,false);
});
test('client renders emergence, compact movement, hits and reconnect snapshots without leaking enemies',async()=>{
  let now=0;const hud={hidden:true,textContent:''},sandbox=vm.createContext({performance:{now:()=>now},console});
  for(const file of ['three.min.js','city-layout.js','motion-sync.js','zombies-client.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),sandbox);
  const scene=new sandbox.THREE.Scene(),client=sandbox.LowkeyZombies.create({THREE:sandbox.THREE,scene,hud}),z={id:'zombie-1',position:{x:2,y:.18,z:3},rotation:0,spawnAt:10000,health:52,speed:1.5,appearance:{skin:'#71875d',hair:'#16151b',hairStyle:'braids',shirt:'#623c48',pants:'#282a32'}};
  client.receive({type:'zombies-state',serverTime:10000,state:{active:true,round:1,remaining:8},zombies:[z]},now);client.update(.016,now);assert.ok(client.models.get(z.id).group.position.y<-2);assert.equal(hud.hidden,false);
  now=1700;client.update(.04,now);assert.equal(client.models.get(z.id).group.position.y,.18);client.receive({type:'zombies-motion',serverTime:11700,state:{active:true,round:1,remaining:8},zombies:[[z.id,2.1,.18,3.1,.2,18]]},now);client.update(.04,now);
  const entry=client.models.get(z.id);assert.equal(entry.record.health,18);assert.ok(Number.isFinite(entry.group.position.x));client.receive({type:'zombie-hit',id:z.id,killed:true,health:0},now);now+=900;client.update(.04,now);assert.equal(client.models.size,0);assert.equal(scene.children.length,0);
  client.receive({type:'zombies-state',serverTime:12600,state:{active:false},zombies:[]},now);assert.equal(hud.hidden,true);
});
