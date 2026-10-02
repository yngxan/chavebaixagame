import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(await readFile(new URL('../motion-sync.js', import.meta.url), 'utf8'), context);
const { MotionBuffer, plazaSurfaces, supportHeight } = context.LowkeyMotion;

test('feet and shadows follow the actual overlapping plaza slabs, grass and island edge', () => {
  assert.equal(supportHeight(plazaSurfaces, 0, 5), .18);
  assert.equal(supportHeight(plazaSurfaces, 12, 5), .1);
  assert.equal(supportHeight(plazaSurfaces, 0, 13), .1);
  assert.equal(supportHeight(plazaSurfaces, 7, 20), .045);
  assert.equal(supportHeight(plazaSurfaces, 20, 20), -.05);
  assert.equal(supportHeight(plazaSurfaces, 51, 0), null);
  const surfaces = [...plazaSurfaces, {x:0, z:-11.7, hx:6.7, hz:3.35, y:1.15}];
  assert.equal(supportHeight(surfaces, 0, -11.7, .2), .1, 'do not snap a player below the stage onto its roof');
  assert.equal(supportHeight(surfaces, 0, -11.7, 1.2), 1.15);
});

test('bursty 20Hz updates and dropped packets remain continuous at rendering frame rate', () => {
  const buffer = new MotionBuffer(), packets = [];
  for (let i=0; i<60; i++) {
    if ([14,15,31].includes(i)) continue;
    const time=i*50, delay=[40,90,150,65,110][i%5];
    packets.push({arrival:time+delay, state:{motionTime:time,x:time*.006,y:.18,z:0,rotation:0,walking:true,speed:6}});
  }
  packets.sort((a,b)=>a.arrival-b.arrival);
  let previous=null, maximumStep=0, minimumStep=Infinity;
  for (let now=0; now<=3100; now+=1000/60) {
    while (packets.length && packets[0].arrival<=now) {const packet=packets.shift();buffer.push(packet.state,packet.arrival);}
    const pose=buffer.sample(now,1/60);
    if (pose && previous!==null && now>450 && now<2850) {
      maximumStep=Math.max(maximumStep,pose.x-previous);minimumStep=Math.min(minimumStep,pose.x-previous);
    }
    if (pose) previous=pose.x;
  }
  assert.ok(maximumStep<.22, `no network teleport on a frame: ${maximumStep}`);
  assert.ok(minimumStep>=0, `jitter must never rewind the moving player: ${minimumStep}`);
  assert.ok(buffer.delay>=90 && buffer.delay<=180);
});

test('stops, stale duplicates, disconnects and rotation across ±pi do not pop or slide forever', () => {
  const buffer=new MotionBuffer();
  buffer.push({motionTime:0,x:0,y:.18,z:0,rotation:3.1,walking:true,speed:6},100);
  buffer.push({motionTime:50,x:.3,y:.18,z:0,rotation:-3.1,walking:true,speed:6},150);
  assert.equal(buffer.push({motionTime:0,x:9,y:0,z:0,rotation:0},160),false);
  let pose;
  for(let now=150;now<500;now+=1000/60)pose=buffer.sample(now,1/60);
  assert.ok(pose.x<=.91, 'prediction is capped at 100ms');
  assert.equal(pose.walking,false, 'animation stops when packets stop arriving');
  assert.ok(Math.abs(Math.cos(pose.rotation)+1)<.02,'turn uses shortest arc');
  buffer.push({motionTime:450,x:.3,y:.18,z:0,rotation:-3.1,walking:false,speed:0},550);
  for(let now=550;now<1000;now+=1000/60)pose=buffer.sample(now,1/60);
  assert.ok(Math.abs(pose.x-.3)<.02, 'prediction error settles back to stopped position');
  buffer.push({motionTime:1000,motionReset:1,x:3,y:.18,z:5,rotation:0,walking:false},1100);
  assert.equal(buffer.sample(1100,1/60).x,3,'respawn resets instead of sweeping across the map');
});

test('all inline browser scripts compile after the physics and rendering edits', async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  for (const [,script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script);
});

test('actual landing and stepping code settles on the plaza, descends onto grass and falls off the island', async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const sandbox=vm.createContext({LowkeyMotion:context.LowkeyMotion,avatar:{position:{x:0,y:18,z:5}},solidPlatforms:plazaSurfaces,
    PLAYER_COLLISION_RADIUS:.32,velocityY:0,onGround:false,lastLandingAt:0,performance:{now:()=>0}});
  const source=html.slice(html.indexOf('  function insidePlatform('),html.indexOf('  function applyIdleBreath('));
  vm.runInContext(source,sandbox);
  const step=()=>vm.runInContext(`{tryStepUp(); const supportNow=groundBelow(avatar.position);if(onGround&&(supportNow===null||Math.abs(avatar.position.y-supportNow)>.045))onGround=false;
    const previousY=avatar.position.y;velocityY-=20/60;avatar.position.y+=velocityY/60;if(!resolvePlatformLanding(previousY))onGround=false;}`,sandbox);
  for(let i=0;i<150;i++)step();
  assert.equal(sandbox.avatar.position.y,.18);assert.equal(sandbox.onGround,true);
  sandbox.avatar.position.x=11.05;
  for(let i=0;i<30;i++)step();
  assert.equal(sandbox.avatar.position.y,.1);assert.equal(sandbox.onGround,true,'floor borders must not leave player permanently airborne');
  sandbox.avatar.position.x=20;sandbox.avatar.position.z=20;
  for(let i=0;i<30;i++)step();
  assert.equal(sandbox.avatar.position.y,-.05);assert.equal(sandbox.onGround,true);
  sandbox.avatar.position.x=51;
  for(let i=0;i<30;i++)step();
  assert.ok(sandbox.avatar.position.y<-1);assert.equal(sandbox.onGround,false);
});
