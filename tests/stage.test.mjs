import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,copyFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import vm from 'node:vm';

test('YouTube links with shared parameters, shorts and multiple lines remain valid',async()=>{
 const source=await readFile(new URL('../stage-media.js',import.meta.url),'utf8');
 const parser=source.match(/function parseVideoLink\(text\)\{(.+?)return id;\}/)[0];
 const parse=Function('return ('+parser+')')();
 for(const url of ['https://www.youtube.com/watch?v=M7lc1UVf-VE','https://youtu.be/M7lc1UVf-VE?si=test','https://m.youtube.com/shorts/M7lc1UVf-VE','https://www.youtube.com/live/M7lc1UVf-VE?feature=share'])assert.equal(parse(url),'M7lc1UVf-VE');
 assert.throws(()=>parse('https://example.com/watch?v=M7lc1UVf-VE'));
 assert.throws(()=>parse('https://www.youtube.com/watch?v=short'));
 assert.ok(source.includes('split(/\\s+/)'));
 assert.ok(source.includes("join('\\n')"));
});

test('video is composed behind the depth-tested world, not on top of avatars',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),media=await readFile(new URL('../stage-media.js',import.meta.url),'utf8');
 assert.match(html,/WebGLRenderer\(\{alpha:true/);
 assert.match(media,/opacity:0,transparent:false,blending:THREE.NoBlending,depthWrite:true/);
 assert.match(media,/#game\{z-index:1\}/);
 assert.match(html,/<div class="hud" style="z-index:3">/);
 assert.match(media,/aperture.visible=!surface.hidden/);
 assert.doesNotMatch(media,/occluded=ray/);
});

test('screen projection preserves all four perspective corners and validates stored volumes',async()=>{
 const window={},context={window,localStorage:{getItem:()=>'{"master":0.5,"voice":2,"music":-1}'}};
 vm.runInNewContext(await readFile(new URL('../stage-media.js',import.meta.url),'utf8'),context);
 assert.equal(window.lowkeyAudioGain('voice'),.5);assert.equal(window.lowkeyAudioGain('music'),0);
 const points=[[30,25],[400,50],[350,280],[45,240]],matrix=window.lowkeyScreenTransform(points).slice(9,-1).split(',').map(Number);
 [[0,0],[480,0],[480,270],[0,270]].forEach(([x,y],i)=>{const w=matrix[3]*x+matrix[7]*y+matrix[15];assert.ok(Math.abs((matrix[0]*x+matrix[4]*y+matrix[12])/w-points[i][0])<1e-6);assert.ok(Math.abs((matrix[1]*x+matrix[5]*y+matrix[13])/w-points[i][1])<1e-6);});
});

test('only existing owner account controls shared video; join snapshot includes server clock', {timeout:15000},async()=>{
 const fixture=await mkdtemp(join(tmpdir(),'lowkey-stage-test-'));
 const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(done=>reservation.close(done));
 await copyFile(new URL('../server.mjs',import.meta.url),join(fixture,'server.mjs'));await mkdir(join(fixture,'data'));
  await copyFile(new URL('../world-systems.js',import.meta.url),join(fixture,'world-systems.js'));
 const hash=token=>createHash('sha256').update(token).digest('hex');
 await writeFile(join(fixture,'data','accounts.json'),JSON.stringify({accounts:[{id:'owner',username:'yngxan',profile:{}},{id:'guest',username:'guest',profile:{name:'YNGXAN'}}],sessions:['owner','guest'].map(id=>({tokenHash:hash(id+'-token'),accountId:id,expiresAt:new Date(Date.now()+60000).toISOString()}))}));
 const launch=()=>spawn(process.execPath,[join(fixture,'server.mjs')],{env:{...process.env,PORT:String(port),DATABASE_URL:'',RENDER:'',CF_SFU_APP_ID:'',CF_SFU_APP_SECRET:''},stdio:['ignore','pipe','pipe']});
 let child=launch();
 const base=`http://127.0.0.1:${port}`;
 const request=(id,path,body)=>fetch(base+path,{headers:{cookie:`lowkey_session=${id}-token`,'content-type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 try{let ready=false;child.stdout.on('data',data=>{if(String(data).includes('multiplayer pronta'))ready=true;});for(let i=0;i<400&&!ready;i++)await delay(10);assert.ok(ready);
  assert.equal((await request('owner','/api/auth/me').then(r=>r.json())).user.role,'admin');assert.equal((await request('guest','/api/auth/me').then(r=>r.json())).user.role,'player');
  assert.equal((await request('guest','/api/stage',{action:'load',videoId:'M7lc1UVf-VE'})).status,403);
  assert.equal((await request('owner','/api/stage',{action:'load',videoId:'<script>'})).status,400);
  const loaded=await request('owner','/api/stage',{action:'load',videoId:'M7lc1UVf-VE'});assert.equal(loaded.status,200);assert.equal((await loaded.json()).playing,true);
  await delay(100);const paused=await request('owner','/api/stage',{action:'pause'}).then(r=>r.json());assert.ok(paused.position>=.09);assert.equal(paused.playing,false);
  const state=await request('guest','/api/stage').then(r=>r.json());assert.equal(state.position,paused.position);assert.ok(state.serverTime);
  const abort=new AbortController(),stream=await fetch(base+'/api/events',{headers:{cookie:'lowkey_session=guest-token'},signal:abort.signal}),reader=stream.body.getReader();const first=new TextDecoder().decode((await reader.read()).value);assert.ok(first.includes('stageMedia'));assert.ok(first.includes('M7lc1UVf-VE'));abort.abort();
  const stopped=await request('owner','/api/stage',{action:'stop'}).then(r=>r.json());assert.equal(stopped.position,0);assert.equal(stopped.playing,false);
  const added=await Promise.all(['aaaaaaaaaaa','bbbbbbbbbbb','ccccccccccc'].map(videoId=>request('owner','/api/stage',{action:'enqueue',videoId})));assert.ok(added.every(r=>r.status===200));
  let queued=await request('owner','/api/stage').then(r=>r.json());assert.equal(queued.queue.length,3);
  const privateState=await request('guest','/api/stage').then(r=>r.json());assert.equal(privateState.queueCount,3);assert.equal(privateState.queue,undefined);
  assert.equal((await request('guest','/api/stage',{action:'next'})).status,403);
  const last=queued.queue[2];queued=await request('owner','/api/stage',{action:'move',itemId:last.id,direction:-1}).then(r=>r.json());assert.equal(queued.queue[1].id,last.id);
  queued=await request('owner','/api/stage',{action:'remove',itemId:queued.queue[2].id}).then(r=>r.json());assert.equal(queued.queue.length,2);
  const originalPlayback=queued.playbackId;
  queued=await request('owner','/api/stage',{action:'next'}).then(r=>r.json());assert.equal(queued.videoId,'aaaaaaaaaaa');assert.equal(queued.playing,true);
  assert.equal((await request('owner','/api/stage',{action:'duration',playbackId:originalPlayback,duration:1})).status,409);
  assert.equal((await request('owner','/api/stage',{action:'duration',playbackId:queued.playbackId,duration:1})).status,200);
  await delay(2300);queued=await request('owner','/api/stage').then(r=>r.json());assert.equal(queued.videoId,'ccccccccccc');assert.equal(queued.queue.length,0);assert.equal(queued.duration,null);
  await request('owner','/api/stage',{action:'enqueue',videoId:'ccccccccccc'});
  const repeated=await request('owner','/api/stage',{action:'next'}).then(r=>r.json());assert.equal(repeated.videoId,queued.videoId);assert.notEqual(repeated.playbackId,queued.playbackId);
  await request('owner','/api/stage',{action:'enqueue',videoId:'ddddddddddd'});
  child.kill();await once(child,'exit');child=launch();let restarted=false;child.stdout.on('data',data=>{if(String(data).includes('multiplayer pronta'))restarted=true;});for(let i=0;i<400&&!restarted;i++)await delay(10);assert.ok(restarted);
  const restored=await request('owner','/api/stage').then(r=>r.json());assert.equal(restored.videoId,'ccccccccccc');assert.equal(restored.queue[0].videoId,'ddddddddddd');assert.equal(restored.playing,true);assert.equal(restored.updatedAt,repeated.updatedAt);
  const lateJoin=await request('guest','/api/stage').then(r=>r.json());assert.equal(lateJoin.playbackId,restored.playbackId);assert.equal(lateJoin.updatedAt,restored.updatedAt);assert.ok(lateJoin.serverTime>lateJoin.updatedAt);
 }finally{child.kill();await once(child,'exit').catch(()=>{});assert.equal(dirname(resolve(fixture)),resolve(tmpdir()));assert.ok(basename(fixture).startsWith('lowkey-stage-test-'));await rm(fixture,{recursive:true,force:true});}
});
