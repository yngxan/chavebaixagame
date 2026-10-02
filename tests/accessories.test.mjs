import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

test('accessories persist across login and reach another player with legacy defaults', { timeout:15000 }, async()=>{
  const fixture=await mkdtemp(join(tmpdir(),'lowkey-accessories-test-'));
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;await new Promise(done=>reservation.close(done));
  await copyFile(new URL('../server.mjs',import.meta.url),join(fixture,'server.mjs'));
  await copyFile(new URL('../city-layout.js',import.meta.url),join(fixture,'city-layout.js'));
  await copyFile(new URL('../world-systems.js',import.meta.url),join(fixture,'world-systems.js'));
  for(const file of ['zombies-server.mjs','game-security.mjs'])await copyFile(new URL('../'+file,import.meta.url),join(fixture,file));
  const child=spawn(process.execPath,[join(fixture,'server.mjs')],{env:{...process.env,PORT:String(port),DATABASE_URL:'',RENDER:'',CF_SFU_APP_ID:'',CF_SFU_APP_SECRET:''},stdio:['ignore','pipe','pipe']});
  const base=`http://127.0.0.1:${port}`,streams=[];
  async function waitFor(predicate){const deadline=Date.now()+4000;while(Date.now()<deadline){const value=predicate();if(value)return value;await delay(10);}throw new Error('Timed out waiting for avatar event');}
  const post=(cookie,path,data)=>fetch(base+path,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(data)});
  async function connect(cookie){
    const abort=new AbortController();streams.push(abort);const response=await fetch(base+'/api/events',{headers:{cookie},signal:abort.signal});assert.equal(response.status,200);
    const reader=response.body.getReader(),decoder=new TextDecoder(),events=[];let buffer='';
    void(async()=>{try{for(;;){const chunk=await reader.read();if(chunk.done)return;buffer+=decoder.decode(chunk.value,{stream:true});let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);if(block.startsWith('data: '))events.push(JSON.parse(block.slice(6)));}}}catch{}})();
    return{events,hello:await waitFor(()=>events.find(event=>event.type==='hello'))};
  }
  try{
    let ready=false;child.stdout.on('data',buffer=>{if(String(buffer).includes('multiplayer pronta'))ready=true;});await waitFor(()=>ready);
    const password='Synthetic-accessory-test-123';
    const registration=await post('','/api/auth/register',{username:'style_test',password});assert.equal(registration.status,201);
    const cookie=registration.headers.get('set-cookie').split(';')[0];const initial=(await registration.json()).user.profile.appearance;
    assert.equal(initial.headwear,'none');assert.equal(initial.shoeStyle,'classic');
    const appearance={...initial,hairStyle:'fade',headwear:'nyCap',hood:true,shoeStyle:'jordan',shoeAccent:'#24aaff'};
    const saved=await post(cookie,'/api/profile',{name:'STYLE TEST',appearance});assert.equal(saved.status,200);
    const login=await post('','/api/auth/login',{username:'style_test',password});assert.equal(login.status,200);
    const restored=(await login.json()).user.profile.appearance;
    assert.equal(restored.hairStyle,'fade');assert.equal(restored.headwear,'nyCap');assert.equal(restored.hood,false);assert.equal(restored.shoeStyle,'jordan');assert.equal(restored.shoeAccent,'#24aaff');
    const other=await post('','/api/auth/register',{username:'style_observer',password});assert.equal(other.status,201);
    const observer=await connect(other.headers.get('set-cookie').split(';')[0]),owner=await connect(cookie);
    const state=await post(cookie,'/api/state',{id:owner.hello.id,sequence:1,appearance:restored,position:owner.hello.spawn});assert.equal(state.status,204);
    const remote=await waitFor(()=>observer.events.find(event=>event.type==='state'&&event.player.id===owner.hello.id));
    assert.deepEqual(remote.player.appearance,restored);
    for(const hairStyle of ['lowBlack','braids']){
      const updated={...restored,hairStyle,headwear:'none'};
      assert.equal((await post(cookie,'/api/profile',{appearance:updated})).status,200);
      const relogged=(await (await post('','/api/auth/login',{username:'style_test',password})).json()).user.profile.appearance;
      assert.equal(relogged.hairStyle,hairStyle);
      await delay(50);
      assert.equal((await post(cookie,'/api/state',{id:owner.hello.id,sequence:hairStyle==='lowBlack'?2:3,appearance:relogged,position:owner.hello.spawn})).status,204);
      const haircut=await waitFor(()=>observer.events.find(event=>event.type==='state'&&event.player.id===owner.hello.id&&event.player.appearance.hairStyle===hairStyle));
      assert.equal(haircut.player.appearance.headwear,'none');
    }
    const invalid=await post(cookie,'/api/profile',{appearance:{headwear:'unknown',shoeStyle:'unknown',hairStyle:'unknown',shoeAccent:'not-a-color'}});assert.equal(invalid.status,200);
    const sanitized=(await (await fetch(base+'/api/auth/me',{headers:{cookie}})).json()).user.profile.appearance;
    assert.equal(sanitized.headwear,'none');assert.equal(sanitized.shoeStyle,'classic');assert.equal(sanitized.hairStyle,'long');assert.equal(sanitized.shoeAccent,'#ba2744');
  }finally{
    for(const stream of streams)stream.abort();const stopped=once(child,'exit');child.kill();await stopped;
    assert.equal(dirname(resolve(fixture)),resolve(tmpdir()));assert.ok(basename(fixture).startsWith('lowkey-accessories-test-'));await rm(fixture,{recursive:true,force:true});
  }
});
