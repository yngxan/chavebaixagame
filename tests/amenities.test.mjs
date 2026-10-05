import test from 'node:test';
import assert from 'node:assert/strict';
import '../city-layout.js';
import '../world-systems.js';
import '../motion-sync.js';
const l=LowkeyCityLayout,w=LowkeyWorld,m=LowkeyMotion;
test('both fuel stations have a driveable lane from asphalt to canopy, with no pump or tree across it',()=>{
  for(const p of l.gasStations){const angle=Math.atan2(p.entry.x-p.road.x,p.entry.z-p.road.z);for(let i=0;i<=80;i++){const t=i/80,x=p.road.x+(p.entry.x-p.road.x)*t,z=p.road.z+(p.entry.z-p.road.z)*t,y=w.groundHeight(x,z);assert.notEqual(y,null);assert.equal(w.vehicleClearAt({kind:'car',x,y,z,rotation:angle},x,z,angle),true,`station ${p.name}, ${i}`);assert.equal(m.supportHeight(m.plazaSurfaces,x,z),y);}}
});
test('fishing approaches connect the roads to supported decks and promenade remains unobstructed',()=>{
  for(const [start,end,z]of [[-420,-476,-258],[88,171,-250]])for(let i=0;i<=150;i++){const x=start+(end-start)*i/150,y=w.groundHeight(x,z);assert.equal(y,.12);assert.equal(m.supportHeight(m.plazaSurfaces,x,z),y);assert.ok(w.clearAt(x,z,.32),`fishing route ${x},${z}`);}
  for(let z=-295;z<151;z+=1)assert.ok(w.clearAt(130,z,.32),`seafront walking corridor ${z}`);
});
test('estate variety and landscaping retain twelve lots and clear runway/crossing space',()=>{
  const homes=l.buildings.filter(b=>b.kind==='mansion');assert.equal(homes.length,12);assert.equal(new Set(homes.map(b=>b.style)).size,3);assert.equal(new Set(homes.map(b=>b.width*b.depth)).size,3);assert.equal(new Set(homes.map(b=>b.estateName)).size,12);assert.ok(l.trees.length>300);assert.equal(l.publicSpaces.busStops.length,6);
  for(const a of l.airports)for(let x=a.x-a.runwayHalf+2;x<a.x+a.runwayHalf-2;x+=2)assert.ok(w.clearAt(x,a.runwayZ,.8),`runway ${a.id}, ${x}`);
});
