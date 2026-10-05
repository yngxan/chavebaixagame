import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import '../city-layout.js';import '../world-systems.js';import '../motion-sync.js';
const l=LowkeyCityLayout,w=LowkeyWorld,m=LowkeyMotion;
test('three original islands preserve plaza landmarks, navigation channels and matching peer floors',()=>{
  assert.equal(l.islands.length,4);assert.equal(l.bridges.length,3);assert.equal(l.nightclub.z,108);assert.equal(w.groundHeight(0,5),.18);assert.equal(l.inSafeZone({x:0,z:0}),true);
  for(const p of [l.garage,l.policeStation,l.nightclub,...l.boutiques])assert.equal(l.islandAt(p.x,p.z).id,'main');
  for(let x=-510.7;x<210;x+=9.17)for(let z=-399.2;z<320;z+=11.19){const a=w.groundHeight(x,z),b=m.supportHeight(m.plazaSurfaces,x,z,a===null?Infinity:a+.01);assert.ok(a===null?b===null:Math.abs(a-b)<1e-8,`shared floor ${x},${z}: ${a}/${b}`);}
  for(const p of [[-138,0],[-229,5],[-200,-140],[190,-170]])assert.equal(w.groundHeight(...p),null);
  for(const r of l.expansionRoads.filter(r=>r.sector!=='bridge'))for(let d=0;d<=1;d+=.02){const x=r.axis==='x'?r.x-r.hx+2*r.hx*d:r.x,z=r.axis==='z'?r.z-r.hz+2*r.hz*d:r.z;assert.notEqual(w.groundHeight(x,z),null,`no road ends in water ${x},${z}`);}
});
test('cars and motorcycles traverse every bridge and both smooth ramps in either direction',()=>{
  for(const bridge of l.bridges)for(const kind of ['car','moto'])for(const direction of [-1,1]){const v={kind,x:direction===1?-398:-107,z:bridge.z,y:-.025,rotation:direction*Math.PI/2,speed:18,wheelieAngle:0,health:100};let high=0;for(let i=0;i<1150&&Math.abs(v.x-(direction===1?-106:-399))>1;i++){const before=v.y;w.advanceVehicle(v,{throttle:1},1/60);assert.equal(v.collision,null,`${kind} at ${v.x},${v.z}`);assert.ok(Math.abs(v.y-before)<.18,'no vertical snap');high=Math.max(high,v.y);if(direction===1&&v.x>-106||direction===-1&&v.x<-399)break;}assert.ok(high>=9.19);assert.ok(direction===1?v.x>-108:v.x<-397);}
});
test('boats and jets pass under bridges, but collide with their visible piers and cannot drive on land',()=>{
  for(const b of l.bridges)for(const kind of ['boat','jetski']){const v={kind,x:-229,z:b.z-12,y:l.coast.waterY,rotation:0,speed:10};for(let i=0;i<180;i++){w.advanceVehicle(v,{throttle:1,serverTime:100000+i*1000/60},1/60);assert.equal(v.collision,null,'clear central waterway beside the enlarged monument island');}assert.ok(v.z>b.z+12);}
  const p={x:-220,y:-1.6,z:-64};assert.equal(w.waterAt(p),true);assert.equal(w.supportHeight(p.x,p.z,2),null);w.keepCameraAboveGround(p);assert.ok(p.y<1,'underpass camera never snaps on top');
  assert.equal(w.waterAt({x:-300,y:-1.6,z:-64}),false,'land beneath a ramp never becomes fake water');const exit={x:-300,y:-1.6,z:-64};assert.equal(w.advanceSwimmer(exit,0,0,.04,100000),false);assert.equal(exit.y,-.025,'swimmer lands on the street beneath the ramp, not on top of the bridge');
  assert.ok(w.shotBlock({x:-220,y:11,z:-64},{x:-220,y:7,z:-64})!==null,'visible deck stops rays');
  const v={kind:'jetski',x:-225,z:-75,y:-.38,rotation:0,speed:10};assert.equal(w.groundHeight(v.x,v.z),null);for(let i=0;i<150;i++)w.advanceVehicle(v,{throttle:1,serverTime:100000},1/60);assert.ok(v.z<-68,'visible pillar blocks vessel');
});
test('actual avatar steps and lands continuously across the bridge, not into a phantom wall',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  for(const direction of [-1,1]){const sandbox=vm.createContext({LowkeyCityLayout:l,LowkeyMotion:m,avatar:{position:{x:direction===1?-398:-107,y:-.025,z:-64}},solidPlatforms:m.plazaSurfaces,solidObstacles:l.obstacles.map(o=>({...o,type:o.r===undefined?'localbox':'circle'})),vehicleObstacles:[],PLAYER_COLLISION_RADIUS:.32,PLAYER_FEET_OFFSET:0,velocityY:0,onGround:true,lastLandingAt:0,performance:{now:()=>0},direction});
    vm.runInContext(html.slice(html.indexOf('  function resolveWorldCollision('),html.indexOf('  function applyIdleBreath(')),sandbox);
    for(let i=0;i<2920;i++){vm.runInContext('{moveWithWorldCollision(avatar.position,direction*.1,0);tryStepUp();const previousY=avatar.position.y;velocityY-=20/60;avatar.position.y+=velocityY/60;if(!resolvePlatformLanding(previousY))onGround=false;}',sandbox);assert.ok(Math.abs(sandbox.avatar.position.y-w.groundHeight(sandbox.avatar.position.x,-64))<.08,'foot height follows slope');}
    assert.ok(direction===1?sandbox.avatar.position.x>-108:sandbox.avatar.position.x<-397);
  }
});

test('every crossing street passes under all bridges without piers, ceiling hits or snapping onto the deck',()=>{
  for(const p of l.bridgePillars)assert.equal(l.roads.some(r=>r.sector!=='bridge'&&l.inRect(p.x,p.z,r,.4)),false,'no pillar footprint intrudes on a street');
  for(const b of l.bridges)for(const x of [-366,-312,-260])for(const direction of [-1,1])for(const kind of ['car','moto']){
    const v={kind,x,z:b.z-direction*18,y:-.025,rotation:direction===1?0:Math.PI,speed:10,wheelieAngle:0};
    for(let i=0;i<140;i++){w.advanceVehicle(v,{throttle:1},1/60);assert.equal(v.collision,null,`${kind} under ${b.name} on ${x}`);assert.ok(v.y<.2,'never jumps onto the high deck');assert.ok(m.supportHeight(m.plazaSurfaces,v.x,v.z,v.y+.3)<.2,'feet also select the lower street');}
    assert.ok(direction*(v.z-b.z)>10,'crosses the entire bridge footprint');
    const exit=w.exitPosition(v);assert.ok(exit&&exit.y<.2,'exiting keeps you at street level');
  }
});
