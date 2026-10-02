import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import '../world-systems.js';

test('vehicles are shared, proximity-checked, server-driven and freed on disconnect', {timeout:20000}, async()=>{
  const fixture=await mkdtemp(join(tmpdir(),'lowkey-vehicle-test-'));
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;await new Promise(done=>reservation.close(done));
  for(const file of ['server.mjs','world-systems.js'])await copyFile(new URL('../'+file,import.meta.url),join(fixture,file));
  const child=spawn(process.execPath,[join(fixture,'server.mjs')],{env:{...process.env,PORT:String(port),DATABASE_URL:'',RENDER:'',CF_SFU_APP_ID:'',CF_SFU_APP_SECRET:''},stdio:['ignore','pipe','pipe']});
  const base=`http://127.0.0.1:${port}`,streams=[];let logs='';child.stderr.on('data',chunk=>logs+=chunk);
  const post=(cookie,path,data)=>fetch(base+path,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(data)});
  async function waitFor(predicate){const deadline=Date.now()+5000;while(Date.now()<deadline){const value=predicate();if(value)return value;await delay(10);}throw new Error('Timed out: '+logs);}
  async function connect(username){
    const registered=await post('','/api/auth/register',{username,password:'Synthetic-vehicle-test-123'});assert.equal(registered.status,201);
    const cookie=registered.headers.get('set-cookie').split(';')[0],abort=new AbortController();streams.push(abort);
    const response=await fetch(base+'/api/events?motion=2',{headers:{cookie},signal:abort.signal});assert.equal(response.status,200);
    const reader=response.body.getReader(),decoder=new TextDecoder(),events=[];let buffer='';
    void(async()=>{try{for(;;){const chunk=await reader.read();if(chunk.done)return;buffer+=decoder.decode(chunk.value,{stream:true});let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);if(block.startsWith('data: '))events.push(JSON.parse(block.slice(6)));}}}catch{}})();
    const hello=await waitFor(()=>events.find(event=>event.type==='hello'));
    return{cookie,events,abort,id:hello.id,position:hello.spawn,sequence:0};
  }
  const latest=(player)=>player.events.filter(event=>event.type==='world-state').at(-1);
  async function walk(player,target){
    const origin=player.position,steps=Math.max(1,Math.ceil(Math.hypot(target.x-origin.x,target.z-origin.z)/.65));
    for(let i=1;i<=steps;i++){
      const t=i/steps,x=origin.x+(target.x-origin.x)*t,z=origin.z+(target.z-origin.z)*t;
      const response=await post(player.cookie,'/api/state',{id:player.id,sequence:++player.sequence,sampledAt:player.sequence*90,position:{x,y:LowkeyWorld.groundHeight(x,z),z},jumping:false});
      assert.equal(response.status,204);await delay(90);
    }
    player.position={...target,y:LowkeyWorld.groundHeight(target.x,target.z)};
  }
  try{
    let ready=false;child.stdout.on('data',chunk=>{if(String(chunk).includes('multiplayer pronta'))ready=true;});await waitFor(()=>ready);
    const owner=await connect('vehicle_owner'),observer=await connect('vehicle_observer'),thief=await connect('vehicle_hijacker');
    const initial=await waitFor(()=>latest(owner));assert.equal(initial.vehicles.length,2);assert.equal(initial.segmentMs,900000);
    const carId='plaza-car',motoId='plaza-moto';
    assert.equal((await post(owner.cookie,'/api/vehicle',{id:owner.id,action:'enter',vehicleId:carId})).status,403);
    await walk(owner,{x:-12,z:5});
    assert.equal((await post(owner.cookie,'/api/vehicle',{id:owner.id,action:'enter',vehicleId:carId})).status,200);
    await waitFor(()=>latest(observer)?.vehicles.find(vehicle=>vehicle.id===carId)?.driverId===owner.id);
    await walk(observer,{x:-12,z:5});
    assert.equal((await post(observer.cookie,'/api/vehicle',{id:observer.id,action:'enter',vehicleId:carId})).status,200);
    await waitFor(()=>latest(observer)?.vehicles.find(vehicle=>vehicle.id===carId)?.passengerIds?.includes(observer.id));
    await walk(thief,{x:-12,z:5});
    assert.equal((await post(thief.cookie,'/api/vehicle',{id:thief.id,action:'steal',vehicleId:carId})).status,202,'nearby player starts a timed hijack');
    await waitFor(()=>latest(thief)?.vehicles.find(vehicle=>vehicle.id===carId)?.driverId===thief.id);
    const ejection=await waitFor(()=>owner.events.find(event=>event.type==='vehicle-exit'&&event.pulled));assert.ok(ejection.impulse.y>0,'hijacked driver gets pulled out');
    await walk(owner,{x:-12,z:5});
    assert.equal((await post(observer.cookie,'/api/vehicle',{id:observer.id,action:'input',sequence:1,throttle:1,steer:0})).status,403);
    assert.equal((await post(thief.cookie,'/api/vehicle',{id:thief.id,action:'input',sequence:1,throttle:100,steer:0})).status,400);
    assert.equal((await post(owner.cookie,'/api/combat',{id:owner.id,action:'punch'})).status,200,'the pulled-out driver can act on foot');
    const before=latest(thief).vehicles.find(vehicle=>vehicle.id===carId).x;
    for(let i=1;i<=12;i++){assert.equal((await post(thief.cookie,'/api/vehicle',{id:thief.id,action:'input',sequence:i,throttle:1,steer:0})).status,204);await delay(80);}
    const moving=await waitFor(()=>{const vehicle=latest(observer)?.vehicles.find(vehicle=>vehicle.id===carId);return vehicle?.speed>3&&vehicle.x>before+.5&&vehicle;});
    assert.ok(moving.x<0);
    const impact=await waitFor(()=>owner.events.find(event=>event.type==='vehicle-impact'&&event.targetId===owner.id));assert.ok(impact.impulse.y>=5,'a car impact launches the player into the air');
    await post(thief.cookie,'/api/state',{id:thief.id,sequence:10000,position:{x:40,y:18,z:40}});
    assert.equal((await post(thief.cookie,'/api/vehicle',{id:thief.id,action:'exit'})).status,409,'must brake before exiting');
    await delay(1300);
    const stopped=await waitFor(()=>{const vehicle=latest(observer)?.vehicles.find(vehicle=>vehicle.id===carId);return vehicle&&Math.abs(vehicle.speed)<1&&vehicle;});
    assert.ok(stopped.x<0,'client position spoof does not move the vehicle');
    assert.equal((await post(thief.cookie,'/api/vehicle',{id:thief.id,action:'exit'})).status,200);
    const exit=await waitFor(()=>thief.events.find(event=>event.type==='vehicle-exit'));
    thief.position=exit.position;assert.equal(exit.position.y,LowkeyWorld.groundHeight(exit.position.x,exit.position.z));
    await walk(owner,{x:-13.5,z:10.5});
    assert.equal((await post(owner.cookie,'/api/vehicle',{id:owner.id,action:'enter',vehicleId:motoId})).status,200);
    await waitFor(()=>latest(observer)?.vehicles.find(vehicle=>vehicle.id===motoId)?.driverId===owner.id);
    owner.abort.abort();
    await waitFor(()=>latest(observer)?.vehicles.find(vehicle=>vehicle.id===motoId)?.driverId===null);
    assert.equal(logs.includes('[anti-cheat]'),false,'normal driving must not trigger movement protection');
  }finally{
    for(const stream of streams)stream.abort();const stopped=once(child,'exit');child.kill();await stopped;
    assert.equal(dirname(resolve(fixture)),resolve(tmpdir()));assert.ok(basename(fixture).startsWith('lowkey-vehicle-test-'));await rm(fixture,{recursive:true,force:true});
  }
});
