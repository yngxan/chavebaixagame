import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';

test('delayed movement, city travel, rapid falling and return to the actual reconnect spawn do not kick a player',{timeout:25000},async()=>{
  const fixture=await mkdtemp(join(tmpdir(),'lowkey-recovery-test-'));
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;await new Promise(done=>reservation.close(done));
  for(const file of ['server.mjs','city-layout.js','world-systems.js','zombies-server.mjs','game-security.mjs'])await copyFile(new URL('../'+file,import.meta.url),join(fixture,file));
  const child=spawn(process.execPath,[join(fixture,'server.mjs')],{env:{...process.env,PORT:String(port),DATABASE_URL:'',RENDER:'',CF_SFU_APP_ID:'',CF_SFU_APP_SECRET:''},stdio:['ignore','pipe','pipe']});
  let logs='',ready=false;child.stderr.on('data',chunk=>logs+=chunk);child.stdout.on('data',chunk=>{if(String(chunk).includes('multiplayer pronta'))ready=true;});
  const base=`http://127.0.0.1:${port}`,streams=[];
  const post=(cookie,path,data)=>fetch(base+path,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(data)});
  async function waitFor(predicate){const deadline=Date.now()+4000;while(Date.now()<deadline){const result=predicate();if(result)return result;await delay(10);}throw new Error('Timed out: '+logs);}
  async function connect(cookie){
    const abort=new AbortController();streams.push(abort);
    const response=await fetch(base+'/api/events?motion=2',{headers:{cookie},signal:abort.signal});assert.equal(response.status,200);
    const events=[],reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    void(async()=>{try{for(;;){const chunk=await reader.read();if(chunk.done)return;buffer+=decoder.decode(chunk.value,{stream:true});let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);if(block.startsWith('data: '))events.push(JSON.parse(block.slice(6)));}}}catch{}})();
    return{abort,events,hello:await waitFor(()=>events.find(event=>event.type==='hello'))};
  }
  try{
    await waitFor(()=>ready);
    const registration=await post('','/api/auth/register',{username:'motion_recovery',password:'Synthetic-recovery-test-123'});assert.equal(registration.status,201);
    const cookie=registration.headers.get('set-cookie').split(';')[0];
    let player=await connect(cookie),sequence=0;
    const state=async(position)=>{await delay(35);return post(cookie,'/api/state',{id:player.hello.id,sequence:++sequence,position,jumping:true});};
    const first=player.hello.spawn,position={x:first.x+3,y:0,z:first.z};
    assert.equal((await state(position)).status,204);
    player.abort.abort();await delay(80);player=await connect(cookie);sequence=0;
    assert.equal(player.hello.spawn.x,position.x,'reconnect resumes the saved position');
    await delay(800);position.x+=8;assert.equal((await state(position)).status,204,'delayed valid running movement is accepted');
    for(let y=-4;y>=-40;y-=4){position.y=y;assert.equal((await state({...position})).status,204);}
    position.x=player.hello.spawn.x;position.y=18;
    assert.equal((await state(position)).status,204);
    await delay(50);assert.equal(player.events.some(event=>event.type==='movement-correction'),false,'valid fall and respawn do not cause corrections');
    assert.equal(logs.includes('[anti-cheat]'),false);
    // Legal movement crosses the former 65-unit validation limit.
    position.y=.12;
    while(position.x<72){await delay(350);position.x=Math.min(72,position.x+4);assert.equal((await state({...position})).status,204);}
    await delay(50);assert.equal(player.events.some(event=>event.type==='movement-correction'),false,'new city bounds do not pull a valid player back');
    player.abort.abort();await delay(80);player=await connect(cookie);sequence=0;
    assert.equal(player.hello.spawn.x,72,'city positions survive reconnect');
    Object.assign(position,player.hello.spawn);
    for(let i=0;i<6;i++)assert.equal((await state({x:64,y:18,z:64})).status,204,'one burst of bad queued packets does not instantly kick');
    await waitFor(()=>player.events.some(event=>event.type==='movement-correction'));
    const correction=player.events.filter(event=>event.type==='movement-correction').at(-1);
    assert.deepEqual(correction.position,position,'teleports are still rejected and corrected');
    assert.equal((await state(position)).status,204,'the client can resume from the corrected position');
  }finally{
    for(const stream of streams)stream.abort();const stopped=once(child,'exit');child.kill();await stopped;
    assert.equal(dirname(resolve(fixture)),resolve(tmpdir()));assert.ok(basename(fixture).startsWith('lowkey-recovery-test-'));await rm(fixture,{recursive:true,force:true});
  }
});
