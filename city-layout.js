(() => {
  // Shared deterministic geometry: no independent client/server map guesses.
  const MAP_HALF_SIZE=120, ROAD_HALF_WIDTH=4.5, SIDEWALK_WIDTH=3,roads=[];
  const bounds={minX:-210,maxX:210,minZ:-210,maxZ:340};
  const coast={shoreZ:181,waterY:-.38,
    surfaces:[
      {x:-127,z:24,hx:7,hz:158,y:-.05,kind:'sand',ground:true},
      {x:127,z:24,hx:7,hz:158,y:-.05,kind:'sand',ground:true},
      {x:0,z:-127,hx:120,hz:7,y:-.05,kind:'sand',ground:true},
      {x:0,z:126,hx:120,hz:6,y:.12,kind:'promenade',ground:true},
      {x:0,z:157,hx:120,hz:25,y:-.05,kind:'sand',ground:true},
      {x:0,z:171,hx:5,hz:39,y:.12,kind:'access',ground:true},
      {x:0,z:187,hx:5,hz:15,y:1.4,kind:'pier',ground:true},
      {x:0,z:224,hx:36,hz:22,y:1.4,kind:'pier',ground:true},
      {x:0,z:258.5,hx:7,hz:12.5,y:1.4,kind:'pier',ground:true},
    ],obstacles:[],lamps:[],palms:[],kiosks:[],umbrellas:[],wheel:{x:-18,z:223,radius:16,hubY:20.2},
  };
  // Broad, shallow steps form a walkable ramp from sand to the elevated pier.
  const access=coast.surfaces.find(s=>s.kind==='access');access.hz=14;access.z=146;
  for(let i=0;i<8;i++)coast.surfaces.push({x:0,z:160.75+i*1.5,hx:5,hz:.75,y:.12+(i+1)*.16,kind:'ramp',ground:true});
  for(const x of [-88,-60,-32,32,60,88])roads.push({x,z:0,hx:ROAD_HALF_WIDTH,hz:116,axis:'z'});
  for(const z of [-92,-64,-36,36,64,92])roads.push({x:0,z,hx:116,hz:ROAD_HALF_WIDTH,axis:'x'});
  for(const side of [-1,1]){
    roads.push({x:0,z:side*78.25,hx:ROAD_HALF_WIDTH,hz:37.75,axis:'z'});
    roads.push({x:side*76.25,z:0,hx:39.75,hz:ROAD_HALF_WIDTH,axis:'x'});
  }
  const inRect=(x,z,r,padding=0)=>{const c=Math.cos(r.rot||0),s=Math.sin(r.rot||0),dx=x-r.x,dz=z-r.z;return Math.abs(dx*c-dz*s)<=r.hx+padding&&Math.abs(dx*s+dz*c)<=r.hz+padding;};
  function groundKind(x,z){
    if(x<bounds.minX||x>bounds.maxX||z<bounds.minZ||z>bounds.maxZ)return null;
    if(Math.abs(x)>MAP_HALF_SIZE||Math.abs(z)>MAP_HALF_SIZE){let floor=null;for(const surface of coast.surfaces)if(inRect(x,z,surface)&&(!floor||surface.y>floor.y))floor=surface;return floor?.kind||null;}
    if(roads.some(r=>inRect(x,z,r)))return 'road';
    if(roads.some(r=>inRect(x,z,r,SIDEWALK_WIDTH)))return 'sidewalk';
    return 'grass';
  }
  const surfaces=[];
  // Partition the union so crossing roads never stack coplanar top faces.
  const edges=axis=>[...new Set([-MAP_HALF_SIZE,MAP_HALF_SIZE,...roads.flatMap(r=>{const h=r[axis==='x'?'hx':'hz'];return[r[axis]-h-SIDEWALK_WIDTH,r[axis]-h,r[axis]+h,r[axis]+h+SIDEWALK_WIDTH];})])].sort((a,b)=>a-b);
  const xs=edges('x'),zs=edges('z');let previous=new Map();
  for(let j=0;j<zs.length-1;j++){
    const row=new Map();let i=0;
    while(i<xs.length-1){const start=i,kind=groundKind((xs[i]+xs[i+1])/2,(zs[j]+zs[j+1])/2);
      while(i+1<xs.length-1&&groundKind((xs[i+1]+xs[i+2])/2,(zs[j]+zs[j+1])/2)===kind)i++;
      const end=++i;if(kind==='grass'||kind===null)continue;
      const key=`${start}:${end}:${kind}`,prior=previous.get(key);
      if(prior){const low=prior.z-prior.hz;prior.z=(low+zs[j+1])/2;prior.hz=(zs[j+1]-low)/2;row.set(key,prior);}
      else{const surface={x:(xs[start]+xs[end])/2,z:(zs[j]+zs[j+1])/2,hx:(xs[end]-xs[start])/2,hz:(zs[j+1]-zs[j])/2,y:kind==='road'?-.025:.12,kind,ground:true};surfaces.push(surface);row.set(key,surface);}
    }
    previous=row;
  }
  const entrances=[{x:0,z:-27.75,hx:5,hz:3.75,y:.045,ground:true},{x:0,z:27.75,hx:5,hz:3.75,y:.045,ground:true},{x:-20.25,z:4,hx:7.25,hz:2,y:.045,ground:true},{x:20.25,z:4,hx:7.25,hz:2,y:.045,ground:true}];
  const buildings=[],trees=[],lamps=[];
  const bx=[-112,-88,-60,-32,32,60,88,112],bz=[-116,-92,-64,-36,36,64,92,116];
  let seed=80371;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const palette=[0xffd58a,0xc3e7e7,0xf7eee0,0xf5bda8,0xb9dbbd,0xe2cbef];
  for(let ix=0;ix<bx.length-1;ix++)for(let iz=0;iz<bz.length-1;iz++){
    if(ix===3&&iz===3)continue;
    const xCenters=ix===3?[-16,16]:[ix===0?-104:ix===6?104:(bx[ix]+bx[ix+1])/2],zCenters=iz===3?[-18,18]:[iz===0?-108:iz===6?108:(bz[iz]+bz[iz+1])/2];
    for(const x of xCenters)for(const z of zCenters){
      const nearPark=Math.abs(x)<53&&Math.abs(z)<55,outer=ix===0||ix===6||iz===0||iz===6;
      const kind=outer?'house':nearPark&&random()<.55?'shop':'tower';
      const width=kind==='house'?10.5:kind==='shop'?15:13.5,depth=kind==='house'?12:kind==='shop'?13:14;
      const floors=kind==='tower'?3+Math.floor(random()*4):1,height=kind==='tower'?floors*3.1+.7:kind==='shop'?4.4:3.6;
      const rotation=Math.abs(x)>Math.abs(z)?(x>0?-Math.PI/2:Math.PI/2):(z>0?Math.PI:0);
      buildings.push({id:`city-building-${buildings.length}`,kind,x,z,width,depth,height,floors,rotation,color:palette[Math.floor(random()*palette.length)],accent:[0xffa84c,0x36b8b4,0xcc65cb,0xe46652][buildings.length%4],roof:buildings.length%2?0xcb694c:0xc64a39});
    }
  }
  for(const r of roads){const long=r.axis==='z'?'z':'x',short=r.axis==='z'?'x':'z',half=r.axis==='z'?r.hz:r.hx;
    for(let along=-half+10;along<half-5;along+=16){const p={x:r.x,z:r.z};p[long]+=along;p[short]+=ROAD_HALF_WIDTH+1.5;
      if(groundKind(p.x,p.z)!=='sidewalk'||roads.some(o=>o!==r&&inRect(p.x,p.z,o,2.5)))continue;
      lamps.push({...p});const t={...p};t[long]+=5.5;
      if(groundKind(t.x,t.z)==='sidewalk'&&!roads.some(o=>o!==r&&inRect(t.x,t.z,o,2.5)))trees.push({...t,size:.8+random()*.25});
    }
  }
  let shopIndex=0;for(const b of buildings)if(b.kind==='shop')b.shopName=['CAFÉ LOWKEY','MERCADO','GARAGEM','BOUTIQUE'][shopIndex++%4];
  const garage=buildings.find(b=>b.shopName==='GARAGEM');garage.kind='garage';
  const garagePoint=(x,z)=>({x:garage.x+x*Math.cos(garage.rotation)+z*Math.sin(garage.rotation),z:garage.z-x*Math.sin(garage.rotation)+z*Math.cos(garage.rotation)});
  const garageFloor={x:garage.x,z:garage.z,hx:garage.width/2,hz:garage.depth/2,rot:garage.rotation,y:.12,kind:'garage',ground:true};
  entrances.push(garageFloor,{...garagePoint(0,8),hx:6.4,hz:1.5,rot:garage.rotation,y:.12,kind:'garage-access',ground:true});
  const garageBays=[{id:'garage-car',kind:'car',...garagePoint(-3,0),rotation:garage.rotation},{id:'garage-moto',kind:'moto',...garagePoint(3,0),rotation:garage.rotation}];
  const boutiques=buildings.filter(b=>b.shopName==='BOUTIQUE');
  const storePoint=(b,x,z)=>({x:b.x+x*Math.cos(b.rotation)+z*Math.sin(b.rotation),z:b.z-x*Math.sin(b.rotation)+z*Math.cos(b.rotation)});
  for(const b of boutiques){b.kind='boutique';entrances.push({x:b.x,z:b.z,hx:7.5,hz:6.5,rot:b.rotation,y:.12,kind:'boutique',ground:true},{...storePoint(b,0,7.5),hx:1.4,hz:1.1,rot:b.rotation,y:.12,kind:'boutique-access',ground:true});}
  const obstacles=buildings.filter(b=>b!==garage&&b.kind!=='boutique').map(b=>({x:b.x,z:b.z,hx:b.width/2,hz:b.depth/2,rot:b.rotation,minY:.12,maxY:b.height+(b.kind==='house'?2.32:.8)}));
  for(const b of boutiques)for(const [x,z,hx,hz,minY,maxY] of [[-7.35,0,.15,6.5,.12,4.52],[7.35,0,.15,6.5,.12,4.52],[0,-6.35,7.5,.15,.12,4.52],[-4.4,6.35,3.1,.15,.12,4.52],[4.4,6.35,3.1,.15,.12,4.52],[0,6.35,1.3,.15,3.3,4.52],[0,0,7.5,6.5,4.4,4.7],[-2.7,-.7,1.1,1.3,.12,1.1],[2.7,-.7,1.1,1.3,.12,1.1],[4.6,-4.7,1.6,.65,.12,1.2]])obstacles.push({...storePoint(b,x,z),hx,hz,rot:b.rotation,minY,maxY,kind:'boutique-fixture'});
  for(const [x,z,hx,hz,minY,maxY] of [[-7.35,0,.15,6.5,.12,4.52],[7.35,0,.15,6.5,.12,4.52],[0,-6.35,7.5,.15,.12,4.52],[0,6.35,7.5,.15,3.75,4.52],[0,0,7.5,6.5,4.4,4.7]])obstacles.push({...garagePoint(x,z),hx,hz,rot:garage.rotation,minY,maxY,kind:'garage-wall'});
  obstacles.push(...trees.map(t=>({x:t.x,z:t.z,r:.26*t.size,minY:.12,maxY:3.8*t.size})),...lamps.map(l=>({x:l.x,z:l.z,r:.10,minY:.12,maxY:4.8})));
  const barrier=(x,z,hx,hz,height=1.2)=>coast.obstacles.push({x,z,hx,hz,minY:1.4,maxY:1.4+height,kind:'rail'});
  // Rails leave a continuous open route from the city, up the ramp and through the park.
  for(const side of [-1,1]){
    barrier(side*5,187,.1,15);barrier(side*36,224,.12,22);
    barrier(side*20.55,202,15.45,.12);barrier(side*21.55,246,14.45,.12);
    barrier(side*7,258.5,.1,12.5);
  }
  barrier(0,271,7,.12);
  // Collide with visible supports, not huge invisible boxes enclosing whole rides.
  for(const side of [-1,1])for(const depth of [-3,3])for(let i=0;i<12;i++){
    const t=(i+.5)/12;coast.obstacles.push({x:-18+side*9*(1-t),z:223+depth*(1-t*.5),hx:.62,hz:.31,minY:1.4+i/12*18.8,maxY:1.4+(i+1)/12*18.8,kind:'wheel-support'});
  }
  coast.trackPoints=[[5,4.5,212],[6,6,226],[17,13,228],[27,8,223],[26,4.5,211],[16,3.5,209]];
  coast.trackPoint=t=>{const p=t*coast.trackPoints.length,i=Math.floor(p),u=p-i,n=coast.trackPoints.length;return [0,1,2].map(axis=>{const a=coast.trackPoints[(i+n-1)%n][axis],b=coast.trackPoints[i%n][axis],c=coast.trackPoints[(i+1)%n][axis],d=coast.trackPoints[(i+2)%n][axis];return .5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u);});};
  coast.trackSupports=Array.from({length:14},(_,i)=>coast.trackPoint(i/14));
  for(const [x,y,z] of coast.trackSupports)coast.obstacles.push({x,z,r:.19,minY:1.4,maxY:y-.2,kind:'coaster-support'});
  coast.obstacles.push({x:-57,z:176,hx:2.4,hz:1.7,minY:1.1,maxY:4.3});
  for(const [x,z,color,name] of [[-23,240,0xe85a51,'PIPOCA'],[24,239,0x48c6bb,'ARCADE'],[17,206,0xf4b943,'SORVETE'],[-16,207,0x9b70d2,'LOWKEY PIER']]){
    const kiosk={x,z,width:7,depth:4.6,height:3.8,color,name};coast.kiosks.push(kiosk);coast.obstacles.push({x,z,hx:3.5,hz:2.3,minY:1.4,maxY:5.5});
  }
  for(let x=-108;x<=108;x+=18){if(Math.abs(x)<10)continue;const palm={x,z:130.5,size:.8+(Math.abs(x)%5)*.05};coast.palms.push(palm);coast.obstacles.push({x,z:palm.z,r:.23*palm.size,minY:.12,maxY:7});}
  for(const side of [-1,1])for(let i=0;i<5;i++)coast.palms.push({x:side*(19+i*20),z:151+(i%2)*16,size:.86+(i%3)*.12});
  for(const p of coast.palms.filter(p=>p.z>132))coast.obstacles.push({x:p.x,z:p.z,r:.23*p.size,minY:-.05,maxY:7});
  for(const side of [-1,1])for(let i=0;i<7;i++)coast.umbrellas.push({x:side*(17+i*14),z:160+(i%2)*13,color:[0xf16658,0xffd45c,0x44becb,0xad70d9][i%4]});
  for(const side of [-1,1])for(const z of [181,196,211,241,260])coast.lamps.push({x:side*(z>=246?6:z>=202?34:4),z,y:1.4});
  for(let x=-102;x<=102;x+=34)if(Math.abs(x)>10)coast.lamps.push({x,z:124,y:.12});
  for(const side of [-1,1])coast.lamps.push({x:side*8,z:235,y:1.4});
  for(const p of coast.lamps)coast.obstacles.push({x:p.x,z:p.z,r:.085,minY:p.y,maxY:p.y+4.5});
  obstacles.push(...coast.obstacles);
  globalThis.LowkeyCityLayout={MAP_HALF_SIZE,bounds,coast,roads,surfaces,entrances,buildings,trees,lamps,obstacles,groundKind,inRect,garage,garageBays,garagePoint,boutiques,storePoint};
})();
