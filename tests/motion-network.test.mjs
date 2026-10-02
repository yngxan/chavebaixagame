import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

test('server preserves capture cadence and profiles in small movement packets, ignores old sequences', {timeout:15000}, async()=>{
  const fixture=await mkdtemp(join(tmpdir(),'lowkey-motion-test-'));
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;await new Promise(done=>reservation.close(done));
  await copyFile(new URL('../server.mjs',import.meta.url),join(fixture,'server.mjs'));
  await copyFile(new URL('../world-systems.js',import.meta.url),join(fixture,'world-systems.js'));
  const child=spawn(process.execPath,[join(fixture,'server.mjs')],{env:{...process.env,PORT:String(port),DATABASE_URL:'',RENDER:'',CF_SFU_APP_ID:'',CF_SFU_APP_SECRET:''},stdio:['ignore','pipe','pipe']});
  const base=`http://127.0.0.1:${port}`,streams=[];
  let logs='';child.stderr.on('data',chunk=>logs+=chunk);
  const post=(cookie,path,data)=>fetch(base+path,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(data)});
  async function waitFor(predicate){const deadline=Date.now()+4000;while(Date.now()<deadline){const value=predicate();if(value)return value;await delay(10);}throw new Error('Timed out: '+logs);}
  async function connect(username){
    const registered=await post('','/api/auth/register',{username,password:'Synthetic-motion-test-123'});assert.equal(registered.status,201);
    const cookie=registered.headers.get('set-cookie').split(';')[0],abort=new AbortController();streams.push(abort);
    const response=await fetch(base+'/api/events?motion=2',{headers:{cookie},signal:abort.signal});assert.equal(response.status,200);
    const reader=response.body.getReader(),decoder=new TextDecoder(),events=[];let buffer='';
    void(async()=>{try{for(;;){const chunk=await reader.read();if(chunk.done)return;buffer+=decoder.decode(chunk.value,{stream:true});let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);if(block.startsWith('data: '))events.push(JSON.parse(block.slice(6)));}}}catch{}})();
    return{cookie,events,hello:await waitFor(()=>events.find(event=>event.type==='hello'))};
  }
  try{
    let ready=false;child.stdout.on('data',chunk=>{if(String(chunk).includes('multiplayer pronta'))ready=true;});await waitFor(()=>ready);
    const player=await connect('motion_owner'),observer=await connect('motion_observer');
    const id=player.hello.id,origin=player.hello.spawn;
    const move=async(sequence,sampledAt,dx,extra={})=>{
      assert.equal((await post(player.cookie,'/api/state',{id,sequence,sampledAt,position:{x:origin.x+dx,y:origin.y,z:origin.z},jumping:false,...extra})).status,204);
      return waitFor(()=>observer.events.filter(event=>event.type==='state'&&event.player.id===id).at(-1)?.player);
    };
    const first=await move(1,1000,0,{name:'MOVE TEST',appearance:{hairStyle:'braids',shirt:'#333333'}});
    assert.equal(first.name,'MOVE TEST');assert.equal(first.appearance.hairStyle,'braids');
    await delay(25);
    await move(2,1050,.25);
    const second=await waitFor(()=>observer.events.filter(event=>event.type==='state'&&event.player.id===id).at(-1)?.player.position.x===origin.x+.25&&observer.events.filter(event=>event.type==='state'&&event.player.id===id).at(-1).player);
    assert.equal(second.motionTime-first.motionTime,50,'capture interval survives faster packet arrival');
    assert.equal(second.speed,5);assert.equal(second.jumping,false);
    assert.equal(second.appearance,undefined,'unchanged appearance is not rebroadcast 20 times a second');
    const count=observer.events.filter(event=>event.type==='state'&&event.player.id===id).length;
    await delay(25);await post(player.cookie,'/api/state',{id,sequence:1,sampledAt:1000,position:origin});await delay(40);
    assert.equal(observer.events.filter(event=>event.type==='state'&&event.player.id===id).length,count);
    const newcomer=await connect('motion_newcomer');
    const snapshot=newcomer.hello.players.find(value=>value.id===id);
    assert.equal(snapshot.name,'MOVE TEST');assert.equal(snapshot.appearance.hairStyle,'braids');assert.equal(snapshot.position.x,origin.x+.25);
  }finally{
    for(const stream of streams)stream.abort();const stopped=once(child,'exit');child.kill();await stopped;
    assert.equal(dirname(resolve(fixture)),resolve(tmpdir()));assert.ok(basename(fixture).startsWith('lowkey-motion-test-'));await rm(fixture,{recursive:true,force:true});
  }
});
