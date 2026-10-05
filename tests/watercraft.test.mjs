import test from 'node:test';
import assert from 'node:assert/strict';
import '../city-layout.js';
import '../world-systems.js';
const W=LowkeyWorld;
test('marina stock has clear water hulls, a connected boarding deck and bounded automatic replacement',()=>{
  const records=new Map(W.initialVehicles().map(v=>[v.id,v]));
  for(const bay of W.city.coast.marinaBays){const v=records.get(bay.id);assert.ok(W.vehicleClearAt(v,v.x,v.z,v.rotation,W.vehicleObstacles(v,records.values())),bay.id+' clear spawn');assert.equal(W.passengerCapacity(v),v.kind==='boat'?9:1);assert.ok(W.exitPosition(v));}
  for(let z=270;z<281;z+=.1)assert.notEqual(W.groundHeight(0,z),null,'continuous dock');
  assert.equal(W.replenishMarina(records,1000).length,0);const jet=records.get('marina-jetski');jet.z+=15;jet.driverId='driver';const replacement=W.replenishMarina(records,2000);assert.equal(replacement.length,1);assert.equal(jet.marinaBay,null);assert.equal(W.replenishMarina(records,3000).length,0);
  jet.driverId=null;W.expireUnoccupiedVehicles(records,3000);W.expireUnoccupiedVehicles(records,184000);assert.equal(records.has(jet.id),false);assert.equal(records.has(replacement[0].id),true);
});
test('both watercraft accelerate, steer, brake and reverse; synchronized buoyancy and deterministic replay',()=>{
  for(const base of W.initialVehicles().filter(W.isWatercraft)){
    const a={...base,x:90,z:250,rotation:0},b={...a};const run=(controls,count)=>{for(let i=0;i<count;i++){const input={...controls,serverTime:100000+i*25};W.advanceVehicle(a,input,.025,[]);W.advanceVehicle(b,input,.025,[]);assert.deepEqual(a,b);assert.equal(a.y,W.waterHeight(a.x,a.z,input.serverTime));}};
    run({throttle:1},100);assert.ok(a.speed>9);const heading=a.rotation;run({throttle:1,steer:1},20);assert.ok(a.rotation<heading);run({brake:true},100);assert.ok(a.speed<.1);run({throttle:-1},100);assert.ok(a.speed<0);
    for(const steer of [-1,1])for(const speed of [-4,8]){const v={...base,x:90,z:250,speed,rotation:0};W.advanceVehicle(v,{steer,serverTime:100000},.025,[]);assert.equal(Math.sign(v.rotation),-steer*Math.sign(speed));}
  }
});
test('hulls cannot drive onto sand, underneath the pier, through another boat or beyond the ocean bounds',()=>{
  for(const base of W.initialVehicles().filter(W.isWatercraft)){
    assert.equal(W.vehicleClearAt(base,0,240,0,[]),false);assert.equal(W.vehicleClearAt(base,80,165,0,[]),false);
    const v={...base,x:80,z:191,rotation:Math.PI,speed:29};for(let i=0;i<120;i++)W.advanceVehicle(v,{throttle:1,serverTime:100000+i*25},.025,[]);assert.equal(v.speed,0);assert.ok(v.z>182);
    const obstacle={x:90,z:254,hx:4,hz:.15};const hit={...base,x:90,z:246,speed:29,rotation:0};for(let i=0;i<80;i++)W.advanceVehicle(hit,{throttle:1},.025,[obstacle]);assert.equal(hit.speed,0);assert.ok(hit.z<254);
    const edge={...base,x:230,z:300,speed:29,rotation:Math.PI/2};for(let i=0;i<100;i++)W.advanceVehicle(edge,{throttle:1},.025,[]);assert.ok(edge.x<240);assert.equal(edge.speed,0);
  }
});
test('boat has ten unique seat positions and refuses an eleventh rider',()=>{
  const v=W.initialVehicles().find(v=>v.kind==='boat'),poses=[W.driverPose(v),...Array.from({length:9},(_,i)=>W.passengerPose(v,i))];assert.equal(new Set(poses.map(p=>p.x+':'+p.z)).size,10);assert.ok(poses.every(p=>Object.values(p).every(Number.isFinite)));
  v.driverId='d';v.passengerIds=Array.from({length:9},(_,i)=>'p'+i);assert.equal(W.vehicleInteraction(v,{x:v.x,z:v.z}).blocked,true);v.passengerIds.pop();assert.equal(W.vehicleInteraction(v,{x:v.x,z:v.z}).blocked,false);
});

test('submerged beach relief permits jet navigation at real depth but still blocks shallow sand and dry land',()=>{
  const x=45,edge=W.city.beachEdge(x),jet={kind:'jetski'};
  assert.notEqual(W.groundHeight(x,edge-1),null,'probe lies over underwater sand, not empty ocean');assert.equal(W.vehicleClearAt(jet,x,edge-1,Math.PI/2,[]),true,'deep sand is not a phantom shore wall');assert.equal(W.vehicleClearAt(jet,x,edge-5,Math.PI/2,[]),false,'the hull cannot ground on the shallows');assert.equal(W.vehicleClearAt(jet,x,165,Math.PI/2,[]),false);
});
