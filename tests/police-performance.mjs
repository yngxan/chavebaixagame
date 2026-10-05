import {performance} from 'node:perf_hooks';
import '../city-layout.js';
import '../world-systems.js';
import {createPoliceGame} from '../police-server.mjs';

// Same simulation and map for before/after measurements; no real accounts or network.
for (const scenario of ['patrol','pursuit','replacement']) {
  let now=100000,bytes=0,packets=0;
  const players=new Map(),counts={},world={...LowkeyWorld};
  for(const name of ['clearAt','crossesSolid','vehicleClearAt','shotBlock']) {
    counts[name]=0;world[name]=(...args)=>{counts[name]++;return LowkeyWorld[name](...args);};
  }
  const game=createPoliceGame({world,layout:LowkeyCityLayout,players,clock:()=>now,random:()=>.5,
    broadcast:message=>{bytes+=Buffer.byteLength(JSON.stringify(message));packets++;},arrest(){},release(){}});
  if(scenario!=='patrol')for(let i=0;i<3;i++){
    const p={id:'p'+i,accountId:'a'+i,health:100,position:{x:(i-1)*100,y:3.2,z:310}};
    players.set(p.id,p);game.crime(p,20,{gunfire:true});
  }
  const durations=[];
  for(let i=0;i<2400;i++) {
    if(scenario==='replacement'&&i===1200)for(const o of game.officers.values())game.hurt(o.id,100,null);
    if(i%400===0&&scenario!=='patrol')for(const p of players.values())game.crime(p,20,{gunfire:true});
    now+=50;const start=performance.now();game.tick();durations.push(performance.now()-start);
  }
  durations.sort((a,b)=>a-b);
  const round=n=>Math.round(n*100)/100;
  console.log(JSON.stringify({scenario,meanMs:round(durations.reduce((a,b)=>a+b)/durations.length),
    p95Ms:round(durations[Math.floor(durations.length*.95)]),p99Ms:round(durations[Math.floor(durations.length*.99)]),
    maxMs:round(durations.at(-1)),counts,packets,bytesPerSecond:Math.round(bytes/120),officers:game.officers.size,cars:game.cars.length}));
}
