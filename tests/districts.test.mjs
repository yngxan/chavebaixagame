import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import '../city-layout.js';
import '../world-systems.js';
import '../motion-sync.js';
const l=LowkeyCityLayout,w=LowkeyWorld,m=LowkeyMotion;

test('both airports and district buildings stay entirely on land, clear of roads',()=>{
  assert.equal(l.airports.length,2);assert.equal(l.districts.length,4);
  for(const a of l.airports){
    for(const dx of [-a.hx,0,a.hx])for(const dz of [-a.hz,0,a.hz])assert.ok(l.islandAt(a.x+dx,a.z+dz),a.name+' stays on its island');
    for(let x=-a.runwayHalf+2;x<=a.runwayHalf-2;x+=3){assert.equal(w.clearAt(a.x+x,a.runwayZ,.6),true,'runway is not blocked by terminal or tower');assert.equal(w.waterAt({x:a.x+x,y:0,z:a.runwayZ}),false);}
  }
  for(const b of l.buildings.filter(b=>b.district)){const c=Math.cos(b.rotation),s=Math.sin(b.rotation);for(const dx of [-b.width/2,b.width/2])for(const dz of [-b.depth/2,b.depth/2]){const x=b.x+dx*c+dz*s,z=b.z-dx*s+dz*c;assert.ok(l.islandAt(x,z),b.id+' is on land');assert.notEqual(l.groundKind(x,z),'road',b.id+' is clear of asphalt');}}
  assert.ok(l.buildings.some(b=>b.district==='downtown'&&b.height>40));
  const houses=l.buildings.filter(b=>b.kind==='favela');assert.equal(houses.length,54);assert.ok(new Set(houses.map(b=>b.width.toFixed(2))).size>30);assert.ok(new Set(houses.map(b=>b.height.toFixed(2))).size>30);
  assert.equal(l.buildings.filter(b=>b.kind==='mansion').length,12);
  assert.equal(l.farmFields.length,3);
});

test('walkable airport and rooftop helipad floors agree without lifting street vehicles',()=>{
  for(const p of l.airports)for(let dx=-p.hx;dx<=p.hx;dx+=2.73)for(let dz=-p.hz;dz<=p.hz;dz+=2.11){const x=p.x+dx,z=p.z+dz,h=w.groundHeight(x,z);assert.equal(m.supportHeight(m.plazaSurfaces,x,z,h+.02),h);}
  const hp=l.heliport,tower=l.buildings.find(b=>b.rooftopHelipad);assert.equal(tower.x,hp.x);assert.equal(tower.z,hp.z);assert.ok(hp.y>30&&hp.y>=tower.height+.8);
  for(let dx=-hp.hx;dx<=hp.hx;dx+=2.73)for(let dz=-hp.hz;dz<=hp.hz;dz+=2.11){const x=hp.x+dx,z=hp.z+dz;assert.equal(w.supportHeight(x,z,hp.y+.02),hp.y);assert.equal(m.supportHeight(m.plazaSurfaces,x,z,hp.y+.02),hp.y);assert.ok(w.drivingFloor(x,z,0)<.2,'roof is not a ground floor');assert.ok(m.supportHeight(m.plazaSurfaces,x,z,.2)<.2);}
  for(const [x,z,direction]of [[-312,150,1],[20,-317,-1]])for(const base of w.initialVehicles().filter(v=>['car','moto'].includes(v.kind))){const v={...base,x,z,y:w.groundHeight(x,z),rotation:direction===1?0:Math.PI,speed:6};for(let i=0;i<30;i++){w.advanceVehicle(v,{throttle:1},.05);assert.equal(v.collision,null);assert.equal(v.y,w.groundHeight(v.x,v.z));}assert.ok(Math.abs(v.z-z)>15);}
});

test('airport, favela, agricultural village and downtown follow the corrected south-to-north order',()=>{
  const district=id=>l.districts.find(d=>d.id===id),a=l.airports.find(a=>a.id==='airport-west');
  assert.ok(a.z>district('favela').z&&district('favela').z>district('rural').z&&district('rural').z>district('downtown').z);
  assert.ok(a.hx>85&&a.hz>=30&&a.runwayHalf>80);assert.ok(l.buildings.some(b=>b.kind==='hangar'&&b.district===a.id));
  assert.ok(l.buildings.filter(b=>b.kind==='favela').every(b=>b.z< a.z-a.hz));
  const rural=l.buildings.filter(b=>b.district==='rural');assert.ok(rural.length>=14);assert.ok(rural.every(b=>b.z<-65&&b.z>-210&&b.height<6));assert.equal(rural.filter(b=>b.kind==='barn').length,3);assert.ok(rural.some(b=>b.shopName==='ARMAZÉM DA VILA'));
  for(const f of l.farmFields){assert.ok(f.z< -65);assert.ok(rural.every(b=>Math.abs(f.x-b.x)>=f.hx+b.width/2||Math.abs(f.z-b.z)>=f.hz+b.depth/2),'crops have their own ground');}
  for(const f of l.ruralFixtures){assert.notEqual(l.groundKind(f.x,f.z),'road');assert.ok(l.islandAt(f.x,f.z));if(f.kind==='water-tower'){assert.equal(w.clearAt(f.x,f.z,.2),true,'you can walk between the water tower legs');assert.equal(w.clearAt(f.x-1.6,f.z-1.6,.2),false);}else assert.equal(w.clearAt(f.x,f.z,.2),false);}
  for(const p of l.elevatedPlatforms.filter(p=>p.kind==='rural-porch')){assert.equal(w.supportHeight(p.x,p.z,.2),p.y);assert.equal(m.supportHeight(m.plazaSurfaces,p.x,p.z,.2),p.y);assert.equal(w.clearAt(p.x,p.z,.32),true,'porch entrance stays open');}
});

test('LowKey monument has shared island, pedestal collision and a compact static sculpture',async()=>{
  const st=l.statue;assert.equal(l.islandAt(st.x,st.z).id,'estates');assert.equal(w.clearAt(st.x,st.z,.32),false);assert.ok(w.shotBlock({x:st.x,y:2,z:st.z+10},{x:st.x,y:2,z:st.z})<1);
  assert.equal(w.supportHeight(st.x+7,st.z,.2),.12);assert.equal(m.supportHeight(m.plazaSurfaces,st.x+7,st.z,.2),.12);
  const sandbox=vm.createContext({console:{warn(){},log(){}}});for(const file of ['three.min.js','city-layout.js','city-client.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),sandbox);
  const t=sandbox.THREE,c=sandbox.LowkeyCity.create({THREE:t,scene:new t.Scene(),signMaterial:()=>new t.MeshBasicMaterial()});assert.equal(c.monument.children.length,3);assert.ok(c.batchCount<60);
  const box=new t.Box3().setFromObject(c.monument);assert.ok(box.max.y>104&&box.min.y>=st.pedestalY-.001);assert.ok(box.min.x>st.x-st.hx&&box.max.x<st.x+st.hx+4);
  const count=c.group.children.length;for(let now=0;now<5000;now+=100)c.update(.5,{x:-350,z:-140},now);assert.equal(c.group.children.length,count);
});

test('integrated festival screen geometry shares its collision and media projection; no duplicate player',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),media=await readFile(new URL('../stage-media.js',import.meta.url),'utf8');
  assert.equal(l.festivalScreen.width/l.festivalScreen.height,16/9);assert.ok(l.festivalScreen.y+l.festivalScreen.height/2<l.festival.roofY,'main screen is integrated under the canopy');assert.ok(l.festivalScreen.z<l.festival.z,'screen sits at the back of the performance deck');
  const hit=w.shotBlock({x:0,y:l.festivalScreen.y,z:5},{x:0,y:l.festivalScreen.y,z:-45});assert.ok(hit!==null&&hit<1,'upper panel blocks shots at its own height');
  assert.equal((html.match(/setupStageMedia\(/g)||[]).length,1);assert.equal((media.match(/new YT.Player\(/g)||[]).length,1);
  assert.match(media,/banner\.geometry\.parameters/);assert.match(media,/banner\.localToWorld/);assert.doesNotMatch(media,/-15\.005/);assert.match(media,/distanceTo\(audioCenter\)/);
  const screenBox=l.obstacles.find(p=>p.kind==='festival-screen');assert.ok(l.festivalScreen.z>screenBox.z+screenBox.hz+.01,'screen is in front of its backing, not a coplanar flickering face');
  const sandbox=vm.createContext({console:{warn(){},log(){}}});vm.runInContext(await readFile(new URL('../three.min.js',import.meta.url),'utf8'),sandbox);const t=sandbox.THREE,parent=new t.Group(),banner=new t.Mesh(new t.PlaneGeometry(l.festivalScreen.width,l.festivalScreen.height));parent.position.z=l.festival.z;banner.position.set(0,l.festivalScreen.y,l.festivalScreen.z-l.festival.z);parent.add(banner);sandbox.banner=banner;sandbox.cornerCheck=undefined;
  const projection=media.slice(media.indexOf('    banner.updateWorldMatrix'),media.indexOf('    // A zero-alpha'));vm.runInContext(projection+';cornerCheck={corners,center,front,audioCenter};',sandbox);
  assert.ok(Math.abs(sandbox.cornerCheck.center.z-l.festivalScreen.z)<1e-10);assert.equal(sandbox.cornerCheck.audioCenter.y,1.5);assert.equal(sandbox.cornerCheck.front.z,1);assert.equal(sandbox.cornerCheck.corners[0].y,l.festivalScreen.y+l.festivalScreen.height/2);
  for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
});

test('expanded plaza, moved conveniences and mixed football lot have consistent footprints',()=>{
  assert.equal(l.safeZone.hx,55.48);assert.equal(l.safeZone.hz,59.48);
  assert.equal(l.inSafeZone({x:54,z:58}),true);assert.equal(l.inSafeZone({x:60,z:64}),false);
  assert.ok(l.buildings.filter(b=>!b.district).every(b=>Math.abs(b.x)>60||Math.abs(b.z)>64));
  for(const b of [l.garage,l.policeStation,...l.boutiques])assert.equal(l.inSafeZone(b),false);
  assert.ok(w.initialVehicles().every(v=>!l.inSafeZone(v)),'initial vehicles belong to the shops, not the audience floor');assert.ok(w.initialVehicles().some(v=>v.garageBay&&v.kind==='car'));assert.ok(w.initialVehicles().some(v=>v.garageBay&&v.kind==='moto'));
  assert.equal(l.plazaLamps.length,4);for(const p of l.plazaLamps){assert.equal(Math.abs(p.x-l.festivalApron.x),l.festivalApron.hx-.65);assert.equal(Math.abs(p.z-l.festivalApron.z),l.festivalApron.hz-.65);assert.equal(p.y,l.festivalApron.y);assert.ok(l.obstacles.some(o=>o.kind==='plaza-lamp'&&o.x===p.x&&o.z===p.z));}
  for(const [x,z]of [[-6,2],[6,2],[-5,-4],[5,-4],[-10,-4],[10,-4],[-10,8],[10,8]])assert.equal(w.clearAt(x,z,.4),true,'removed furniture leaves no invisible collider');
  const f=l.footballField;assert.equal(w.clearAt(f.x,f.z,.4),true);for(const side of [-1,1])assert.equal(w.clearAt(f.x,f.z+side*f.hz,.4),true,'goal mouth remains open');
  for(const b of l.buildings.filter(b=>b.kind==='favela')){const dx=Math.max(0,Math.abs(b.x-f.x)-f.hx),dz=Math.max(0,Math.abs(b.z-f.z)-f.hz);assert.ok(dx>b.width/2||dz>b.depth/2,'no house intrudes on the pitch');}
  assert.ok(l.buildings.filter(b=>b.kind==='favela'&&Math.abs(b.x-f.x)<28&&Math.abs(b.z-f.z)<35).length>=6,'the field shares its block with houses');
});

test('actual avatar climbs the festival stairs and renderer retains a small static batch budget',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),sandbox=vm.createContext({LowkeyCityLayout:l,LowkeyMotion:m,avatar:{position:{x:-15,y:.18,z:-21.5}},solidPlatforms:m.plazaSurfaces,solidObstacles:l.obstacles.map(o=>({...o,type:o.r===undefined?'localbox':'circle'})),vehicleObstacles:[],PLAYER_COLLISION_RADIUS:.32,PLAYER_FEET_OFFSET:0,velocityY:0,onGround:true,lastLandingAt:0,performance:{now:()=>0}});
  vm.runInContext(html.slice(html.indexOf('  function resolveWorldCollision('),html.indexOf('  function applyIdleBreath(')),sandbox);
  for(let i=0;i<65;i++){vm.runInContext('{moveWithWorldCollision(avatar.position,0,-.1);tryStepUp();const oldY=avatar.position.y;velocityY-=20/60;avatar.position.y+=velocityY/60;resolvePlatformLanding(oldY);}',sandbox);}
  assert.ok(sandbox.avatar.position.z<-26.5);assert.equal(sandbox.avatar.position.y,l.festival.y);
  sandbox.avatar.position={x:0,y:l.festivalApron.y,z:-1.5};sandbox.velocityY=0;sandbox.onGround=true;
  for(let i=0;i<300;i++){vm.runInContext('{moveWithWorldCollision(avatar.position,0,-.1);tryStepUp();const oldY=avatar.position.y;velocityY-=20/60;avatar.position.y+=velocityY/60;resolvePlatformLanding(oldY);}',sandbox);}
  assert.ok(sandbox.avatar.position.z<-31,'front stairs, thrust platform and runway connect to the main deck');assert.equal(sandbox.avatar.position.y,l.festival.y);
  for(const file of ['three.min.js','festival-client.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),sandbox);
  const t=sandbox.THREE,c=sandbox.LowkeyFestival.create({THREE:t,scene:new t.Scene(),signMaterial:()=>new t.MeshBasicMaterial()});assert.ok(c.batchCount<12);assert.equal(c.lights.length,4);assert.equal(c.banner.geometry.parameters.width,l.festivalScreen.width);assert.equal(c.banner.geometry.parameters.height,l.festivalScreen.height);
  assert.equal(w.supportHeight(0,-18,1.5),l.festival.y);assert.equal(w.supportHeight(0,-9,1.5),l.festival.y);
  const count=c.group.children.length;for(let now=0;now<15000;now+=50){c.update({x:0,z:-20},1,now);for(const beam of c.beams)assert.ok([...beam.position.toArray(),...beam.scale.toArray(),...beam.quaternion.toArray()].every(Number.isFinite));}assert.equal(c.group.children.length,count,'effects reuse a fixed mesh pool');
  c.update({x:0,z:-20},1,500);assert.ok(c.lights.every(light=>light.intensity>0));assert.ok(c.beams.every(beam=>beam.visible));assert.ok(c.flames.some(flame=>flame.visible));c.update({x:-350,z:-200},1,500);assert.ok(c.lights.every(light=>light.intensity===0));assert.ok([...c.beams,...c.flames].every(effect=>!effect.visible));
});
