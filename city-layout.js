(() => {
  // Shared deterministic geometry: no independent client/server map guesses.
  const MAP_HALF_SIZE=120, ROAD_HALF_WIDTH=4.5, SIDEWALK_WIDTH=3,roads=[];
  const bounds={minX:-535,maxX:240,minZ:-585,maxZ:350};
  // The plaza remains the city center; its enlarged square moves nearby shops outwards.
  function pointInPolygon(x,z,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[j],b=points[i],cross=(x-a[0])*(b[1]-a[1])-(z-a[1])*(b[0]-a[0]);if(Math.abs(cross)<1e-7&&x>=Math.min(a[0],b[0])-1e-7&&x<=Math.max(a[0],b[0])+1e-7&&z>=Math.min(a[1],b[1])-1e-7&&z<=Math.max(a[1],b[1])+1e-7)return true;if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
  const islands=[
    {id:'main',name:'ILHA LOWKEY',polygon:[[-127,182],[120,182],[142,165],[156,128],[163,60],[159,-25],[165,-104],[150,-180],[158,-252],[142,-320],[103,-358],[32,-374],[-55,-365],[-101,-343],[-122,-290],[-134,-236],[-142,-174],[-138,-132],[-127,-120]],label:{x:32,z:-240}},
    {id:'west',name:'ILHA DO PORTO',polygon:[[-458,-280],[-405,-325],[-332,-318],[-268,-286],[-240,-231],[-236,-136],[-233,-28],[-241,95],[-244,176],[-255,231],[-292,245],[-409,245],[-452,231],[-470,176],[-480,32],[-475,-119]],label:{x:-370,z:-20}},
    {id:'estates',name:'ILHA DO LOWKEY',polygon:[[-222,-22],[-204,-42],[-174,-40],[-145,-17],[-148,26],[-178,49],[-208,40],[-225,15]],label:{x:-187,z:37}},
    {id:'prison',name:'ILHA PENITENCIÁRIA',polygon:Array.from({length:32},(_,i)=>{const a=i*Math.PI/16,r=1+.06*Math.sin(i*2.7);return[-195+Math.cos(a)*62*r,-476+Math.sin(a)*49*r];}),label:{x:-195,z:-476}},
  ];
  // Subdivide and push outwards, preserving every old street and landmark on dry land.
  for(const island of islands.filter(p=>p.id==='main'||p.id==='west')){const original=island.polygon,cx=original.reduce((s,p)=>s+p[0],0)/original.length,cz=original.reduce((s,p)=>s+p[1],0)/original.length;island.polygon=original.flatMap((p,i)=>{const next=original[(i+1)%original.length];return Array.from({length:4},(_,j)=>{const t=j/4,x=p[0]+(next[0]-p[0])*t,z=p[1]+(next[1]-p[1])*t,d=Math.hypot(x-cx,z-cz),bump=j===0?0:Math.sin(t*Math.PI)*(2.5+2*Math.sin(i*2.1+j));return[x+(x-cx)/d*bump,z+(z-cz)/d*bump];});});}
  for(const island of islands){const p=island.polygon,cx=p.reduce((s,v)=>s+v[0],0)/p.length,cz=p.reduce((s,v)=>s+v[1],0)/p.length;island.inner=p.map(([x,z])=>[island.id==='main'?Math.min(122,cx+(x-cx)*.94):cx+(x-cx)*.94,cz+(z-cz)*.97]);island.minX=Math.min(...p.map(v=>v[0]));island.maxX=Math.max(...p.map(v=>v[0]));island.minZ=Math.min(...p.map(v=>v[1]));island.maxZ=Math.max(...p.map(v=>v[1]));}
  const islandAt=(x,z)=>islands.find(p=>x>=p.minX&&x<=p.maxX&&z>=p.minZ&&z<=p.maxZ&&pointInPolygon(x,z,p.polygon));
  const islandSurfaces=islands.map(p=>({x:(p.minX+p.maxX)/2,z:(p.minZ+p.maxZ)/2,hx:(p.maxX-p.minX)/2,hz:(p.maxZ-p.minZ)/2,y:-.05,polygon:p.polygon,ground:true,kind:'island'}));
  // Districts follow the annotated plan without relocating existing saved landmarks.
  const districts=[
    {id:'downtown',name:'CENTRO ALTO',x:-350,z:-260,hx:88,hz:42,color:0x98b5c3},
    {id:'favela',name:'BAIRRO KEYLOW',x:-350,z:52,hx:88,hz:97,color:0xc88760},
    {id:'rural',name:'VILA RURAL',x:-350,z:-139,hx:88,hz:66,color:0xc9b887},
    {id:'mansions',name:'BAIRRO DAS MANSÕES',x:0,z:-243,hx:79,hz:73,color:0x97c7a0},
  ];
  const airports=[
    {id:'airport-west',name:'AEROPORTO DO PORTO',x:-353,z:190,hx:95,hz:32,runwayZ:208,runwayHalf:89,number:'09',terminal:{x:-353,z:174,width:42,depth:14},tower:{x:-423,z:174}},
    {id:'airport-main',name:'AEROPORTO LOWKEY',x:0,z:-342,hx:72,hz:13,runwayZ:-343,runwayHalf:66,number:'27',terminal:{x:-38,z:-330.5,width:22,depth:7},tower:{x:62,z:-333}},
  ];
  const heliport={x:-286,z:-253,hx:10,hz:10,y:32.5,name:'HELIPORTO · COBERTURA'};
  const statue={x:-187,z:4,baseY:-.05,hx:24,hz:24,pedestalY:17.4,height:112,scale:4,name:'MONUMENTO LOWKEY'};
  // Roofs are height-aware platforms, never ground floors that teleport cars upwards.
  const elevatedPlatforms=[{...heliport,ground:true,kind:'helipad-roof'},{x:statue.x,z:statue.z,hx:32,hz:32,y:.12,ground:true,kind:'monument-plaza'}];
  const ruralYards=[{x:-393,z:-172,hx:18,hz:28},{x:-339,z:-172,hx:18,hz:28},{x:-286,z:-172,hx:17,hz:28},{x:-393,z:-96,hx:18,hz:25},{x:-339,z:-96,hx:18,hz:25},{x:-286,z:-96,hx:17,hz:25}];
  const districtSurfaces=[...airports.map(a=>({x:a.x,z:a.z,hx:a.hx,hz:a.hz,y:-.015,ground:true,kind:'airport'})),...ruralYards.map(p=>({...p,y:-.035,ground:true,kind:'rural-yard'}))];
  const farmFields=[{x:-393,z:-185,hx:15,hz:13},{x:-393,z:-107,hx:15,hz:11},{x:-286,z:-185,hx:14,hz:13}];
  const ruralFixtures=[{kind:'silo',x:-409,z:-151,r:1.7,height:6},{kind:'silo',x:-407,z:-78,r:1.7,height:6},{kind:'water-tower',x:-300,z:-151,hx:1.8,hz:1.8,height:9},{kind:'windpump',x:-272,z:-152,hx:.6,hz:.6,height:8}];
  const festival={x:0,z:-35,hx:25,hz:9,y:1.4,roofY:18};
  const festivalScreen={x:0,y:9.6,z:-42.95,width:24,height:13.5};
  const festivalApron={x:0,z:-9,hx:24,hz:41,y:.18,ground:true,kind:'festival-apron'};
  const plazaLamps=[];for(const xSide of [-1,1])for(const zSide of [-1,1])plazaLamps.push({x:festivalApron.x+xSide*(festivalApron.hx-.65),z:festivalApron.z+zSide*(festivalApron.hz-.65),y:festivalApron.y});
  const festivalPlatforms=[{...festival,ground:true,kind:'festival-deck'}];
  for(let i=0;i<6;i++)festivalPlatforms.push({x:-15,z:festival.z+12.5-i*.65,hx:2.4,hz:.375,y:festivalApron.y+(i+1)*(festival.y-festivalApron.y)/6,ground:true,kind:'festival-step'});
  festivalPlatforms.push({x:0,z:-18,hx:2.4,hz:8,y:festival.y,ground:true,kind:'festival-runway'},{x:0,z:-9,hx:5,hz:3.5,y:festival.y,ground:true,kind:'festival-thrust'});
  for(let i=0;i<6;i++)festivalPlatforms.push({x:0,z:-2.25-i*.65,hx:2.4,hz:.375,y:festivalApron.y+(i+1)*(festival.y-festivalApron.y)/6,ground:true,kind:'festival-step'});
  const plazaTrees=[[-18,-19,1.5],[-9,-25,1.25],[10,-25,1.35],[21,-18,1.55],[-24,-7,1.4],[24,-3,1.3],[-22,12,1.35],[22,15,1.45],[-13,24,1.45],[1,27,1.3],[14,23,1.55],[-23,4,1.3],[23,9,1.3]].map(([x,z,size])=>({x:Math.abs(x)>15&&z<-15?Math.sign(x)*49:x*2,z:z<-15?-54:z*1.8,size}));
  const footballField={x:-332,z:-22,hx:8,hz:14};
  const beachEdge=x=>194+4*Math.sin(x*.07)+2*Math.sin(x*.19);
  const beachHeight=(x,z)=>{if(Math.abs(x)<=8||z<172)return -.05;const t=Math.max(0,Math.min(1,(z-172)/(beachEdge(x)-172))),blend=Math.min(1,(Math.abs(x)-8)/8);return -.05+(Math.sin(t*Math.PI)*.65-t*t*1.45)*blend;};
  const surfaceHeight=(p,x,z)=>p.beachRelief||p.kind==='island'&&Math.abs(x)<=120&&z>=172?beachHeight(x,z):p.y+(p.slopeX||0)*(x-p.x);
  const expansionRoads=[],bridges=[],bridgeSurfaces=[],bridgeObstacles=[],bridgePillars=[];
  const avenue=(x1,z1,x2,z2,sector)=>{const axis=x1===x2?'z':'x';expansionRoads.push({x:(x1+x2)/2,z:(z1+z2)/2,hx:axis==='z'?4.5:Math.abs(x2-x1)/2,hz:axis==='x'?4.5:Math.abs(z2-z1)/2,axis,sector});};
  for(const x of [-88,88])avenue(x,-322,x,-116,'north');
  for(const z of [-164,-210,-274,-322])avenue(z===-322?-88:-110,z,z===-322?88:110,z,'north');
  for(const x of [-420,-366,-312])avenue(x,-260,x,156,'west');
  avenue(-260,-210,-260,92,'west');
  for(const z of [-210,-130,-64,20,92,156])avenue(-433,z,z===156?-312:-260,z,'west');
  avenue(-312,156,-312,177,'west');avenue(20,-322,20,-335,'north');
  for(const z of [-210,-64,92]){
    const bridge={id:`bridge-${z}`,name:z===-210?'PONTE NORTE':z===-64?'PONTE CENTRAL':'PONTE DA MARINA',x:-265,z,hx:155,hz:6.3,y:9.2};bridges.push(bridge);
    // Long, driveable approaches lead smoothly onto the high deck; boats still pass below.
    for(const [x,hx,y,slopeX]of [[-375,45,4.6,9.2/90],[-265,65,9.2,0],[-155,45,4.6,-9.2/90]]){
      bridgeSurfaces.push({x,z,hx,hz:6.3,y,slopeX,kind:'bridge',ground:true});
      bridgeObstacles.push({x,z,hx,hz:6.3,minY:y-.26,maxY:y,slopeX,kind:'bridge-floor'});
      for(let a=-hx;a<hx;a+=8){const length=Math.min(8,hx-a),px=x+a+length/2,py=y+slopeX*(px-x);for(const side of [-1,1])bridgeObstacles.push({x:px,z:z+side*6.18,hx:length/2,hz:.12,minY:py-.08,maxY:py+1.15,kind:'bridge-rail'});}
    }
    // All piers are in the canal, never in a crossing street or on its sidewalk.
    for(const x of [-225,-195])for(const side of [-1,1]){const p={x,z:z+side*5.25,hx:.375,hz:.375,minY:-2.15,maxY:8.95,kind:'bridge-pillar'};bridgePillars.push(p);bridgeObstacles.push(p);}
    avenue(-395,z,-110,z,'bridge');
  }
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
  const beach=coast.surfaces.find(s=>s.kind==='sand'&&s.x===0&&s.z===157);beach.z=166;beach.hz=34;beach.beachRelief=true;beach.polygon=[[-120,132],[120,132],...Array.from({length:49},(_,i)=>{const x=120-i*5;return[x,beachEdge(x)];})];
  for(let i=0;i<8;i++)coast.surfaces.push({x:0,z:160.75+i*1.5,hx:5,hz:.75,y:.12+(i+1)*.16,kind:'ramp',ground:true});
  for(const x of [-88,-60,60,88])roads.push({x,z:0,hx:ROAD_HALF_WIDTH,hz:116,axis:'z'});
  for(const z of [-92,-64,64,92])roads.push({x:0,z,hx:116,hz:ROAD_HALF_WIDTH,axis:'x'});
  for(const side of [-1,1]){
    roads.push({x:0,z:side*92.25,hx:ROAD_HALF_WIDTH,hz:23.75,axis:'z'});
    roads.push({x:side*90.25,z:0,hx:25.75,hz:ROAD_HALF_WIDTH,axis:'x'});
  }
  const inRect=(x,z,r,padding=0)=>{const c=Math.cos(r.rot||0),s=Math.sin(r.rot||0),dx=x-r.x,dz=z-r.z;return Math.abs(dx*c-dz*s)<=r.hx+padding&&Math.abs(dx*s+dz*c)<=r.hz+padding&&(!r.polygon||pointInPolygon(x,z,r.polygon));};
  // Inside curb of the four roads bordering the plaza, not an arbitrary radius.
  const safeZone={x:0,z:0,hx:60-ROAD_HALF_WIDTH-.02,hz:64-ROAD_HALF_WIDTH-.02};
  const inSafeZone=position=>Boolean(position&&Math.abs(position.x-safeZone.x)<=safeZone.hx&&Math.abs(position.z-safeZone.z)<=safeZone.hz);
  function groundKind(x,z){
    if(x<bounds.minX||x>bounds.maxX||z<bounds.minZ||z>bounds.maxZ)return null;
    if(bridgeSurfaces.some(p=>inRect(x,z,p)))return 'bridge';
    if(Math.abs(x)>MAP_HALF_SIZE||Math.abs(z)>MAP_HALF_SIZE){let floor=null;for(const surface of coast.surfaces)if(inRect(x,z,surface)&&(!floor||surface.y>floor.y))floor=surface;if(floor)return floor.kind;const island=islandAt(x,z);if(!island)return null;const district=districtSurfaces.find(p=>inRect(x,z,p));if(district)return district.kind;if(expansionRoads.some(r=>inRect(x,z,r)))return 'road';if(expansionRoads.some(r=>inRect(x,z,r,SIDEWALK_WIDTH)))return 'sidewalk';return pointInPolygon(x,z,island.inner)?'grass':'sand';}
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
  const entrances=[festivalApron,{x:0,z:-55,hx:5,hz:4.5,y:.12,ground:true},{x:0,z:46,hx:5,hz:13.5,y:.12,ground:true},{x:-40,z:4,hx:16,hz:2,y:.12,ground:true},{x:40,z:4,hx:16,hz:2,y:.12,ground:true}];
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
  // Move inner conveniences back one block, replacing the generic building there.
  const moved=buildings.filter(b=>Math.abs(b.x)<60&&Math.abs(b.z)<64&&b.kind==='shop');
  for(const b of moved){if(Math.abs(b.x)>Math.abs(b.z))b.x=Math.sign(b.x)*74;else b.z=Math.sign(b.z)*78;}
  for(let i=buildings.length-1;i>=0;i--){const b=buildings[i];if(!moved.includes(b)&&((Math.abs(b.x)<60&&Math.abs(b.z)<64)||moved.some(p=>p.x===b.x&&p.z===b.z)))buildings.splice(i,1);}
  const garage=buildings.find(b=>b.shopName==='GARAGEM');garage.kind='garage';
  const garagePoint=(x,z)=>({x:garage.x+x*Math.cos(garage.rotation)+z*Math.sin(garage.rotation),z:garage.z-x*Math.sin(garage.rotation)+z*Math.cos(garage.rotation)});
  const garageFloor={x:garage.x,z:garage.z,hx:garage.width/2,hz:garage.depth/2,rot:garage.rotation,y:.12,kind:'garage',ground:true};
  entrances.push(garageFloor,{...garagePoint(0,8),hx:6.4,hz:1.5,rot:garage.rotation,y:.12,kind:'garage-access',ground:true});
  const garageBays=[{id:'garage-car',kind:'car',...garagePoint(-3,0),rotation:garage.rotation},{id:'garage-moto',kind:'moto',...garagePoint(3,0),rotation:garage.rotation}];
  garage.shopName='LOWKEY MOTORS';
  const dealershipDisplays=[{localX:-4,localZ:-4.7,color:0xc64a39},{localX:4,localZ:-4.7,color:0x35dded}];
  const boutiques=buildings.filter(b=>b.shopName==='BOUTIQUE');
  const storePoint=(b,x,z)=>({x:b.x+x*Math.cos(b.rotation)+z*Math.sin(b.rotation),z:b.z-x*Math.sin(b.rotation)+z*Math.cos(b.rotation)});
  const policeStation=buildings.find(b=>b.shopName==='MERCADO');
  policeStation.kind='police';policeStation.shopName='DELEGACIA';policeStation.color=0xd1dbe0;policeStation.accent=0x315b9c;
  const policePoint=(x,z)=>storePoint(policeStation,x,z);
  elevatedPlatforms.push({...policePoint(0,0),hx:7.5,hz:6.5,rot:policeStation.rotation,y:8.78,ground:true,kind:'police-helipad-roof'});
  const jail={x:-195,z:-476,y:.12},jailExit={...policePoint(0,8),y:.12};
  entrances.push({x:policeStation.x,z:policeStation.z,hx:7.5,hz:6.5,rot:policeStation.rotation,y:.12,kind:'police',ground:true},{...policePoint(0,7.5),hx:1.5,hz:1.2,rot:policeStation.rotation,y:.12,kind:'police-access',ground:true});
  for(const b of boutiques){b.kind='boutique';entrances.push({x:b.x,z:b.z,hx:7.5,hz:6.5,rot:b.rotation,y:.12,kind:'boutique',ground:true},{...storePoint(b,0,7.5),hx:1.4,hz:1.1,rot:b.rotation,y:.12,kind:'boutique-access',ground:true});}
  const nightclub=buildings.filter(b=>b.kind==='house').sort((a,b)=>Math.hypot(a.x-16,a.z-130)-Math.hypot(b.x-16,b.z-130))[0];
  Object.assign(nightclub,{kind:'nightclub',shopName:'LOWKEY VELVET',width:15,depth:14,height:8.6,rotation:0,color:0x263044,accent:0xde43b5});
  for(const b of buildings)if(b.kind==='house'||b.kind==='tower'){b.kind='tower';b.width=Math.max(b.width,13.5);b.depth=14;b.floors=7+Math.floor(random()*12);b.height=b.floors*3.1+.7;}
  const civic=[];for(const [name,x,z,color]of [['PREFEITURA',-74,-108,0xe2cbef],['HOSPITAL LOWKEY',74,-108,0xc3e7e7]]){const b=buildings.filter(p=>p.kind==='tower'&&!civic.includes(p)).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0];b.shopName=name;b.civic=true;b.color=color;civic.push(b);}
  const clubPoint=(x,z)=>storePoint(nightclub,x,z),interiorPlatforms=[];
  entrances.push({...clubPoint(0,0),hx:7.5,hz:7,y:.12,kind:'nightclub',ground:true},{...clubPoint(0,8),hx:1.6,hz:1.3,y:.12,kind:'nightclub-access',ground:true});
  for(let i=0;i<20;i++)interiorPlatforms.push({...clubPoint(-5.8,5.25-i*.5),hx:1.15,hz:.25,y:.12+(i+1)*.21,ground:true,kind:'club-step'});
  interiorPlatforms.push({...clubPoint(1.4,0),hx:5.8,hz:6.7,y:4.32,ground:true,kind:'motel-floor'},{...clubPoint(-5.8,-5.55),hx:1.4,hz:1.05,y:4.32,ground:true,kind:'motel-landing'});
  for(const x of [-1.9,1.9])interiorPlatforms.push({...clubPoint(x,-3.3),hx:1.35,hz:1.25,y:.56,ground:true,kind:'club-stage'},{...clubPoint(x,-1.8),hx:1.35,hz:.25,y:.34,ground:true,kind:'club-stage-step'});
  const clubFixtures=[[-7.35,0,.15,7,.12,8.72],[7.35,0,.15,7,.12,8.72],[0,-6.85,7.5,.15,.12,8.72],[-4.4,6.85,3.1,.15,.12,8.72],[4.4,6.85,3.1,.15,.12,8.72],[0,6.85,1.3,.15,3.3,8.72],[0,0,7.5,7,8.72,8.92],[1.4,0,5.8,6.7,4.17,4.32],[-5.8,-5.55,1.4,1.05,4.17,4.32],[4.9,-4.5,1.9,.55,.12,1.2]];
  for(const x of [0,3.6])clubFixtures.push([x,-3,.08,3.7,4.32,8.6]);
  for(const x of [4.8,6.3])for(const z of [1,4])clubFixtures.push([x,z,.65,.8,.12,1.55]);
  for(const x of [-1.8,1.8,5.4]){clubFixtures.push([x,-4.4,1.1,1.7,4.32,5.05],[x-.95,.7,.8,.08,4.32,8.6]);}
  const raceRoutes=[{id:'central',name:'Circuito da Praça',points:[[-60,20],[-60,-64],[60,-64],[60,64],[-60,64],[-60,20]]},{id:'city',name:'Volta da Cidade',points:[[60,64],[60,92],[-88,92],[-88,-92],[88,-92],[88,64],[60,64]]},{id:'coast',name:'Sprint do Litoral',points:[[-60,92],[-60,64],[60,64],[60,92],[88,92],[88,64]]}].map(r=>({...r,points:r.points.map(([x,z])=>({x,y:-.025,z}))}));
  // Static district silhouettes only: no new NPC loops or autonomous traffic.
  function districtBuilding(x,z,kind,district,options={}){const b={id:`district-${district}-${buildings.length}`,x,z,kind,district,sector:district==='mansions'?'north':'west',width:14,depth:18,height:4.4,floors:1,rotation:0,color:palette[buildings.length%palette.length],accent:0x36b8b4,roof:0xc64a39,...options};buildings.push(b);return b;}
  for(const [x,z,floors]of [[-393,-252,11],[-339,-252,15],[-393,-290,9],[-339,-290,12]])districtBuilding(x,z,'tower','downtown',{width:20,depth:23,height:floors*3.1+.7,floors});
  districtBuilding(heliport.x,heliport.z,'tower','downtown',{width:28,depth:28,height:31.7,floors:10,rooftopHelipad:true,color:0xc3e7e7});
  for(const cx of [-393,-339,-286])for(const cz of [-22,56,126]){
    const plots=cx===-339&&cz===-22?[[-17,-22],[-17,-3],[-17,18],[-2,-26],[12,-26],[8,26]]:[[-12,-12],[0,-12],[12,-12],[-12,12],[0,12],[12,12]];
    for(const [dx,dz]of plots){const width=5.3+random()*3,depth=6+random()*3,height=3.1+Math.floor(random()*3)*1.65+random()*.45;districtBuilding(cx+dx+(random()-.5)*1.2,cz+dz+(random()-.5)*1.2,'favela','favela',{width,depth,height,rotation:(random()-.5)*.12,color:palette[Math.floor(random()*palette.length)],roofStyle:random()<.32?'slanted':'flat'});}
  }
  let estateIndex=0;
  for(const side of [-1,1])for(const z of [-190,-244,-300])for(const x of [34,65]){const i=estateIndex++,tier=1+i%3;districtBuilding(side*x,z,'mansion','mansions',{width:19+tier*2.5,depth:18+tier*2,height:5.8+tier*1.15,floors:2,style:['mediterranean','modern','resort'][i%3],estateTier:tier,estateName:['VILLA SOL','CASA HORIZONTE','RESIDÊNCIA AURORA'][i%3]+' '+(i+1),color:[0xf7eee0,0xc3e7e7,0xe2cbef,0xffd58a][i%4],accent:[0x795641,0x304454,0x36b8b4][i%3]});}
  // A real low-rise farming village sits between the favela and the towers.
  for(const [x,z,width,depth]of [[-393,-152,19,14],[-393,-79,17,12],[-286,-153,16,13]])districtBuilding(x,z,'barn','rural',{width,depth,height:4.7,color:0xe46652});
  for(const [x,z,width,depth]of [[-351,-184,10,12],[-327,-184,11,10],[-351,-155,12,11],[-327,-155,10,13],[-349,-80,12,11],[-326,-80,11,12],[-297,-101,11,13],[-274,-101,10,11],[-291,-80,12,10],[-271,-80,9,10]]){const b=districtBuilding(x,z,'house','rural',{width,depth,height:3.2+random()*.7,color:palette[Math.floor(random()*palette.length)],roofStyle:random()<.55?'flat':'slanted'});elevatedPlatforms.push({x,z:z+depth/2+1,hx:width*.4,hz:1.1,y:.12,ground:true,kind:'rural-porch',buildingId:b.id});}
  districtBuilding(-339,-105,'shop','rural',{width:24,depth:12,height:4,shopName:'ARMAZÉM DA VILA',color:0xffd58a,accent:0xe46652});
  districtBuilding(-287,174,'hangar','airport-west',{width:30,depth:23,height:8,color:0xbfc8c4});
  Object.assign(airports[1].terminal,{x:-34,z:-331,width:42,depth:8});
  for(const a of airports){districtBuilding(a.terminal.x,a.terminal.z,a.id==='airport-main'?'airport-terminal':'shop',a.id,{width:a.terminal.width,depth:a.terminal.depth,height:a.id==='airport-main'?6.8:4.4,color:0xc3e7e7,shopName:a.name,rotation:0});districtBuilding(a.tower.x,a.tower.z,'airport-tower',a.id,{width:5,depth:5,height:11,color:0xf7eee0});}
  const customs=buildings.filter(b=>b.kind==='tower'&&!b.district&&!b.civic).sort((a,b)=>Math.hypot(a.x-garage.x,a.z-garage.z)-Math.hypot(b.x-garage.x,b.z-garage.z))[0];
  Object.assign(customs,{kind:'customs',shopName:'LOWKEY CUSTOMS',width:15,depth:13,height:6.5,color:0x85504e,accent:0xe2bf70});
  const customsBay={x:customs.x,z:customs.z,hx:4.1,hz:4.5,rot:customs.rotation};
  entrances.push({...customsBay,hx:7.5,hz:6.5,y:.12,ground:true,kind:'customs'},{...storePoint(customs,0,8),hx:4,hz:2,rot:customs.rotation,y:.12,ground:true,kind:'customs-access'});
  const obstacles=buildings.filter(b=>b!==garage&&b.kind!=='boutique'&&b.kind!=='police'&&b.kind!=='nightclub'&&b!==customs).flatMap(b=>b.kind==='airport-tower'?[{x:b.x,z:b.z,hx:1.2,hz:1.2,minY:.12,maxY:8.12},{x:b.x,z:b.z,hx:b.width/2,hz:b.depth/2,minY:7.97,maxY:11.12}]:[{x:b.x,z:b.z,hx:b.width/2,hz:b.depth/2,rot:b.rotation,minY:.12,maxY:b.height+(b.kind==='house'&&b.district==='rural'?(b.roofStyle==='slanted'?1.32:.32):['house','barn'].includes(b.kind)?2.32:.8)}]);
  for(const [x,z,hx,hz,minY,maxY]of [[-7.35,0,.15,6.5,.12,6.62],[7.35,0,.15,6.5,.12,6.62],[0,-6.35,7.5,.15,.12,6.62],[-5.7,6.35,1.8,.15,.12,6.62],[5.7,6.35,1.8,.15,.12,6.62],[0,6.35,3.9,.15,4.8,6.62],[0,0,7.5,6.5,6.5,6.8],[-6,0,.9,4,.12,1.3],[5.8,-4,1.2,1.2,.12,2.3]])obstacles.push({...storePoint(customs,x,z),hx,hz,rot:customs.rotation,minY,maxY,kind:'customs-fixture'});
  for(const f of ruralFixtures){if(f.kind==='water-tower'){for(const x of [-1.6,1.6])for(const z of [-1.6,1.6])obstacles.push({x:f.x+x,z:f.z+z,hx:.125,hz:.125,minY:0,maxY:6.8,kind:'rural-fixture'});obstacles.push({x:f.x,z:f.z,hx:1.9,hz:1.9,minY:6.1,maxY:9,kind:'rural-fixture'});}else obstacles.push({x:f.x,z:f.z,hx:f.r||f.hx,hz:f.r||f.hz,minY:-.035,maxY:f.height,kind:'rural-fixture'});}
  for(const b of buildings.filter(b=>b.kind==='barn')){const solid=obstacles.findIndex(o=>o.x===b.x&&o.z===b.z);if(solid>=0)obstacles.splice(solid,1);for(const side of [-1,1]){obstacles.push({x:b.x+side*b.width/2,z:b.z,hx:.15,hz:b.depth/2,minY:.12,maxY:b.height,kind:'barn-wall'},{x:b.x+side*(b.width/4+1),z:b.z+b.depth/2,hx:b.width/4-1,hz:.15,minY:.12,maxY:b.height,kind:'barn-wall'});}obstacles.push({x:b.x,z:b.z-b.depth/2,hx:b.width/2,hz:.15,minY:.12,maxY:b.height,kind:'barn-wall'},{x:b.x,z:b.z,hx:b.width/2,hz:b.depth/2,minY:b.height,maxY:b.height+2.32,kind:'barn-roof'});entrances.push({x:b.x,z:b.z,hx:b.width/2,hz:b.depth/2,y:.12,kind:'barn',ground:true});}
  for(const b of buildings.filter(b=>b.kind==='house'&&b.district==='rural')){for(const x of [-b.width*.35,b.width*.35])obstacles.push({x:b.x+x,z:b.z+b.depth/2+1.8,hx:.09,hz:.09,minY:.12,maxY:2.92,kind:'rural-porch-post'});obstacles.push({x:b.x,z:b.z+b.depth/2+1,hx:b.width*.42,hz:1.2,minY:2.92,maxY:3.1,kind:'rural-porch-roof'},{x:b.x-b.width*.24,z:b.z+b.depth/2+1,hx:b.width*.115,hz:.3,minY:.12,maxY:.88,kind:'rural-porch-bench'});}
  for(const f of farmFields)for(const side of [-1,1])obstacles.push({x:f.x,z:f.z+side*f.hz,hx:f.hx,hz:.07,minY:-.05,maxY:1.15,kind:'farm-fence'});
  obstacles.push({x:statue.x,z:statue.z,hx:statue.hx,hz:statue.hz,minY:.12,maxY:statue.pedestalY,kind:'monument-pedestal'},{x:statue.x,z:statue.z,hx:16.8,hz:12,minY:statue.pedestalY,maxY:84,kind:'monument-statue'},{x:statue.x+18.8,z:statue.z,hx:7.2,hz:6,minY:68,maxY:statue.height,kind:'monument-key'});
  for(const [x,z,hx,hz,minY,maxY]of clubFixtures)obstacles.push({...clubPoint(x,z),hx,hz,minY,maxY,kind:maxY===4.32?'club-floor':'club-fixture'});
  for(const [x,z,hx,hz,minY,maxY] of [[-7.35,0,.15,6.5,.12,4.52],[7.35,0,.15,6.5,.12,4.52],[0,-6.35,7.5,.15,.12,4.52],[-4.5,6.35,3,.15,.12,4.52],[4.5,6.35,3,.15,.12,4.52],[0,6.35,1.5,.15,3.3,4.52],[0,0,7.5,6.5,4.4,4.7],[1.9,-3.8,.08,2.5,.12,3.5],[4.6,-1.3,2.65,.08,.12,3.5],[-3,-1.5,1.4,.65,.12,1.15]])obstacles.push({...policePoint(x,z),hx,hz,rot:policeStation.rotation,minY,maxY,kind:'police-wall'});
  obstacles.push({...policePoint(0,0),hx:7.7,hz:6.7,rot:policeStation.rotation,minY:4.7,maxY:8.78,kind:'police-upper-floor'},
    {...policePoint(-5.3,-4.2),hx:2.25,hz:2.25,rot:policeStation.rotation,minY:8.78,maxY:14.52,kind:'police-tower'});
  for(const b of boutiques)for(const [x,z,hx,hz,minY,maxY] of [[-7.35,0,.15,6.5,.12,4.52],[7.35,0,.15,6.5,.12,4.52],[0,-6.35,7.5,.15,.12,4.52],[-4.4,6.35,3.1,.15,.12,4.52],[4.4,6.35,3.1,.15,.12,4.52],[0,6.35,1.3,.15,3.3,4.52],[0,0,7.5,6.5,4.4,4.7],[-2.7,-.7,1.1,1.3,.12,1.1],[2.7,-.7,1.1,1.3,.12,1.1],[4.6,-4.7,1.6,.65,.12,1.2]])obstacles.push({...storePoint(b,x,z),hx,hz,rot:b.rotation,minY,maxY,kind:'boutique-fixture'});
  for(const [x,z,hx,hz,minY,maxY] of [[-7.35,0,.15,6.5,.12,4.52],[7.35,0,.15,6.5,.12,4.52],[0,-6.35,7.5,.15,.12,4.52],[0,6.35,7.5,.15,3.75,4.52],[0,0,7.5,6.5,4.4,4.7]])obstacles.push({...garagePoint(x,z),hx,hz,rot:garage.rotation,minY,maxY,kind:'garage-wall'});
  for(const side of [-1,1])obstacles.push({...garagePoint(side*6.1,6.35),hx:1.25,hz:.15,rot:garage.rotation,minY:.12,maxY:3.75,kind:'dealership-window'});
  for(const display of dealershipDisplays)obstacles.push({...garagePoint(display.localX,display.localZ),hx:2.05,hz:1.025,rot:garage.rotation,minY:.12,maxY:1.35,kind:'dealership-display'});
  obstacles.push(...trees.map(t=>({x:t.x,z:t.z,r:.26*t.size,minY:.12,maxY:3.8*t.size})),...lamps.map(l=>({x:l.x,z:l.z,r:.10,minY:.12,maxY:4.8})));
  const barrier=(x,z,hx,hz,height=1.2)=>coast.obstacles.push({x,z,hx,hz,minY:1.4,maxY:1.4+height,kind:'rail'});
  // Rails leave a continuous open route from the city, up the ramp and through the park.
  for(const side of [-1,1]){
    barrier(side*5,187,.1,15);barrier(side*36,205,.12,3);barrier(side*36,243,.12,3);
    coast.surfaces.push({x:side*60,z:224,hx:24,hz:16,y:1.4,kind:'pier',ground:true});
    barrier(side*84,224,.12,16);for(const z of [208,240])barrier(side*60,z,24,.12);
    barrier(side*20.55,202,15.45,.12);barrier(side*21.55,246,14.45,.12);
    barrier(side*7,258.5,.1,12.5);
  }
  barrier(-4.5,271,2.5,.12);barrier(4.5,271,2.5,.12);
  // Open central gate and shallow gangway lead to the marina's low boarding deck.
  for(let i=0;i<8;i++)coast.surfaces.push({x:0,z:271.5+i,hx:2,hz:.5,y:1.4-(i+1)*.13,kind:'dock',ground:true});
  coast.surfaces.push({x:0,z:280,hx:10,hz:1.5,y:.36,kind:'dock',ground:true});
  coast.marinaBays=[{id:'marina-jetski',kind:'jetski',x:-5,z:284,rotation:0},{id:'marina-boat',kind:'boat',x:5,z:285,rotation:0}];
  // Collide with visible supports, not huge invisible boxes enclosing whole rides.
  for(const side of [-1,1])for(const depth of [-3,3])for(let i=0;i<12;i++){
    const t=(i+.5)/12;coast.obstacles.push({x:-18+side*9*(1-t),z:223+depth*(1-t*.5),hx:.62,hz:.31,minY:1.4+i/12*18.8,maxY:1.4+(i+1)/12*18.8,kind:'wheel-support'});
  }
  coast.trackPoints=[[5,4.5,212],[6,6,226],[17,13,228],[27,8,223],[26,4.5,211],[16,3.5,209]];
  coast.surfaces.push({x:7,z:209,hx:4.5,hz:3,y:3.35,kind:'ride-station',ground:true});
  for(let i=0;i<5;i++)coast.surfaces.push({x:5,z:203+i*.6,hx:2,hz:.3,y:1.4+(i+1)*.39,kind:'ride-step',ground:true});
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
  // Partition new asphalt and curbs separately, avoiding duplicate intersection slabs.
  const expansionSurfaces=[];
  for(const sector of ['north','west']){const rs=expansionRoads.filter(r=>r.sector===sector),edge=axis=>[...new Set(rs.flatMap(r=>{const h=r[axis==='x'?'hx':'hz'];return[r[axis]-h-3,r[axis]-h,r[axis]+h,r[axis]+h+3];}))].sort((a,b)=>a-b),xx=edge('x'),zz=edge('z');let previous=new Map();
    const kindAt=(x,z)=>rs.some(r=>inRect(x,z,r))?'road':rs.some(r=>inRect(x,z,r,3))?'sidewalk':null;
    for(let j=0;j<zz.length-1;j++){const row=new Map();let i=0;while(i<xx.length-1){const start=i,kind=kindAt((xx[i]+xx[i+1])/2,(zz[j]+zz[j+1])/2);while(i+1<xx.length-1&&kindAt((xx[i+1]+xx[i+2])/2,(zz[j]+zz[j+1])/2)===kind)i++;const end=++i;if(!kind)continue;const key=`${start}:${end}:${kind}`,prior=previous.get(key);if(prior){const low=prior.z-prior.hz;prior.z=(low+zz[j+1])/2;prior.hz=(zz[j+1]-low)/2;row.set(key,prior);}else{const p={x:(xx[start]+xx[end])/2,z:(zz[j]+zz[j+1])/2,hx:(xx[end]-xx[start])/2,hz:(zz[j+1]-zz[j])/2,y:kind==='road'?-.025:.12,kind,sector,ground:true};expansionSurfaces.push(p);row.set(key,p);}}previous=row;}}
  expansionSurfaces.push(...districtSurfaces);
  roads.push(...expansionRoads);obstacles.push(...bridgeObstacles);
  obstacles.push(...plazaTrees.map(t=>({x:t.x,z:t.z,hx:.41*t.size,hz:.41*t.size,minY:-.05,maxY:5.7*t.size,kind:'plaza-tree'})));
  obstacles.push(...plazaLamps.map(p=>({x:p.x,z:p.z,hx:.07,hz:.07,minY:p.y,maxY:p.y+3.44,kind:'plaza-lamp'})));
  for(const p of festivalPlatforms.filter(p=>p.kind!=='festival-step'))obstacles.push({x:p.x,z:p.z,hx:p.hx,hz:p.hz,minY:0,maxY:p.y,kind:p.kind});
  obstacles.push({x:0,z:festivalScreen.z-.17,hx:12.2,hz:.15,minY:2.65,maxY:16.55,kind:'festival-screen'},{x:0,z:festival.z,hx:26,hz:10.5,minY:17.8,maxY:20.6,kind:'festival-roof'},{x:0,z:-24.8,hx:26,hz:.2,minY:16.3,maxY:18.5,kind:'festival-brand'});
  obstacles.push({x:0,z:festival.z-8.6,hx:25,hz:.15,minY:1.4,maxY:17.1,kind:'festival-backdrop'});
  for(const x of [-26,26])for(const z of [-45,-25])obstacles.push({x,z,hx:.6,hz:.6,minY:.18,maxY:18.5,kind:'festival-truss'});
  for(const x of [-33,33]){obstacles.push({x,z:-28,hx:5.2,hz:3,minY:.18,maxY:18.5,kind:'festival-side-screen'});}
  for(const x of [-24,24])obstacles.push({x,z:-27.5,hx:.65,hz:.7,minY:3,maxY:14,kind:'festival-speakers'});
  for(const side of [-1,1])for(const x of [-2.8,2.8])obstacles.push({x:footballField.x+x,z:footballField.z+side*footballField.hz,hx:.07,hz:.07,minY:-.05,maxY:2.15,kind:'goal-post'});
  const prison={x:-195,z:-476,hx:28,hz:20,y:.12,name:'PENITENCIÁRIA LOWKEY',tasks:[{id:'laundry',x:-216,z:-476,name:'Separar roupa'},{id:'yard',x:-195,z:-490,name:'Limpar o pátio'},{id:'supplies',x:-174,z:-476,name:'Organizar caixas'}]};
  entrances.push({...prison,ground:true,kind:'prison-yard'});
  for(const side of [-1,1]){obstacles.push({x:prison.x+side*prison.hx,z:prison.z,hx:.3,hz:prison.hz,minY:.12,maxY:7.12,kind:'prison-wall'},{x:prison.x,z:prison.z+side*prison.hz,hx:prison.hx,hz:.3,minY:.12,maxY:7.12,kind:'prison-wall'});}
  const gasStations=[{x:-42,z:-139,name:'POSTO LOWKEY'},{x:-451,z:58,name:'POSTO DO PORTO'}];
  for(const p of gasStations){entrances.push({...p,hx:10,hz:10,y:.12,ground:true,kind:'gas-station'});for(const x of [-8,8])for(const z of [-8,8])obstacles.push({x:p.x+x,z:p.z+z,hx:.16,hz:.16,minY:.12,maxY:5.6,kind:'gas-post'});obstacles.push({...p,hx:10,hz:10,minY:5.4,maxY:5.8,kind:'gas-canopy'});for(const x of [-4,4])obstacles.push({x:p.x+x,z:p.z,hx:.45,hz:.65,minY:.12,maxY:1.85,kind:'gas-pump'});}
  const fishingSpots=[{x:-75,z:230,y:1.4,name:'PESCA · PÍER OESTE'},{x:75,z:230,y:1.4,name:'PESCA · PÍER LESTE'},{x:-453,z:-258,y:-.05,name:'PESCA · PORTO'},{x:126,z:-250,y:-.05,name:'PESCA · MANSÕES'}];
  for(const b of bridges){for(const x of [-225,-195]){for(const side of [-1,1])obstacles.push({x,z:b.z+side*9,hx:2.1,hz:2.1,minY:-6,maxY:39,kind:'bridge-tower'});obstacles.push({x,z:b.z,hx:2.3,hz:9,minY:12.55,maxY:13.25,kind:'bridge-arch'},{x,z:b.z,hx:2.3,hz:9,minY:27.95,maxY:29.05,kind:'bridge-walkway'});}obstacles.push({x:-210,z:b.z,hx:15,hz:1.5,minY:28.3,maxY:29.7,kind:'bridge-walkway'});}
  for(const x of [-450,-112,112])for(let z=-302;z<110;z+=29){const px=x+Math.sin(z*.17)*2;if(!islandAt(px,z)||groundKind(px,z)!=='grass'||obstacles.some(o=>Math.abs(px-o.x)<(o.hx||o.r||0)+4&&Math.abs(z-o.z)<(o.hz||o.r||0)+4)||gasStations.some(p=>Math.hypot(p.x-px,p.z-z)<18))continue;const t={x:px,z,size:1.1+(Math.sin(z*1.7)+1)*.35};trees.push(t);obstacles.push({x:px,z,r:.26*t.size,minY:-.05,maxY:3.8*t.size,kind:'coastal-tree'});}
  coast.carousel={x:-60,z:222,y:1.4,radius:7};coast.obstacles.push({x:-60,z:222,r:.45,minY:1.4,maxY:7.4,kind:'carousel-axis'});
  // One description owns both the visible street furniture and its exact collision.
  const publicSpaces={pieces:[],paths:[],signs:[],busStops:[],fishing:[],gardens:[]};
  function detail(color,x,y,z,w,h,d,solid=false,rotation=0){const p={color,x,y,z,w,h,d,rotation};publicSpaces.pieces.push(p);if(solid)obstacles.push({x,z,hx:w/2,hz:d/2,rot:rotation,minY:y-h/2,maxY:y+h/2,kind:'public-detail'});return p;}
  function walkway(x,z,hx,hz,color=0xbfc8c4,y=.12,overWater=false){const p={x,z,hx,hz,y,kind:overWater?'pier':'public-path',ground:true,publicDetail:true};(overWater?coast.surfaces:entrances).push(p);publicSpaces.paths.push(p);detail(color,x,y-.06,z,hx*2,.12,hz*2);return p;}
  function localDetail(cx,cz,angle){const c=Math.cos(angle),s=Math.sin(angle);return(color,x,y,z,w,h,d,solid=false)=>detail(color,cx+x*c+z*s,y,cz-x*s+z*c,w,h,d,solid,angle);}
  function bench(x,z,angle=0,y=.12){const p=localDetail(x,z,angle);for(const dx of [-1.05,1.05])p(0x304454,dx,y+.28,0,.12,.56,.62,true);p(0x795641,0,y+.58,0,2.6,.16,.7,true);p(0x795641,0,y+1.05,-.3,2.6,.65,.12,true);}
  function pergola(x,z,hx=3,hz=3,y=.12){for(const dx of [-hx,hx])for(const dz of [-hz,hz])detail(0x795641,x+dx,y+1.7,z+dz,.18,3.4,.18,true);for(let dx=-hx;dx<=hx;dx+=.65)detail(0xfaf9ec,x+dx,y+3.5,z,.18,.22,hz*2+.5,true);}
  function planter(x,z,w=2,d=1.2){detail(0xbfc8c4,x,.36,z,w,.6,d,true);detail(0x6cbb36,x,.81,z,w*.9,.5,d*.9);}
  function sign(text,x,y,z,width=5,rotation=0){publicSpaces.signs.push({text,x,y,z,width,height:.65,rotation});}
  // Driveways join the nearest existing road; no curb or prop seals the entrance.
  for(const [i,p]of gasStations.entries()){
    const entry={x:p.x,z:p.z-(i?6:0)},road=i===0?{x:p.x,z:-164}:{x:-420,z:entry.z};p.road=road;p.entry=entry;
    walkway((entry.x+road.x)/2,(entry.z+road.z)/2,i===0?3.6:Math.abs(entry.x-road.x)/2,i===0?Math.abs(entry.z-road.z)/2:3.6,0x424d54);
    detail(0x304454,p.x,5.65,p.z,20.5,.65,20.5);for(const side of [-1,1]){detail(i?0x35dded:0xf153ca,p.x,5.69,p.z+side*10.3,20.6,.24,.08);detail(i?0x35dded:0xf153ca,p.x+side*10.3,5.69,p.z,.08,.24,20.6);}
    for(const x of [-4,4]){detail(0xbfc8c4,p.x+x,.23,p.z,2.5,.22,4);for(const dz of [-1.4,1.4])detail(0xffd58a,p.x+x,.43,p.z+dz,1.7,.17,.25);detail(0x35dded,p.x+x,1.44,p.z+.69,.45,.2,.035);}
    const sz=p.z+15;detail(0xf3eee1,p.x,1.85,sz,18,3.5,7,true);detail(0x304454,p.x,3.75,sz,19,.3,8,true);detail(0x63c8db,p.x,1.7,sz-3.56,15,2.5,.08);detail(0x795641,p.x,1.4,sz-3.63,1.9,2.8,.08);sign('LOWKEY EXPRESS · CAFÉ',p.x,3.18,sz-3.68,14,Math.PI);
    walkway(p.x,sz-5.5,10,2);for(const x of [-7,7])planter(p.x+x,sz-5.5);bench(p.x+3.5,sz-5.5,Math.PI);
    const sx=i===0?p.x+8:p.x+13,szn=i===0?p.z-12:p.z+8;detail(0x304454,sx,2.8,szn,.38,5.6,.38,true);detail(0x304454,sx,4.9,szn,4.4,2.4,.38,true);sign('KEY FUEL',sx,5.5,szn+.21,4);sign('GAS 5.49 · ET 3.89',sx,4.65,szn+.21,4);
    for(const side of [-1,1])for(let n=0;n<3;n++)detail(0xfaf9ec,p.x+side*7,.14,p.z-6+n*2.4,.1,.016,1.4);
  }
  // Fishing decks connect all the way to land, with open access and real guardrail pieces.
  for(const [i,p]of fishingSpots.entries()){
    const dock=i===2?{x:-476,z:p.z,hx:7,hz:8}:i===3?{x:171,z:p.z,hx:7,hz:8}:{x:p.x,z:p.z,hx:5,hz:6};
    publicSpaces.fishing.push({...dock,name:p.name});if(i>=2){const start=i===2?-420:88;walkway((start+dock.x)/2,p.z,Math.abs(start-dock.x)/2,2,0x795641,.12,true);walkway(dock.x,dock.z,dock.hx,dock.hz,0x795641,.12,true);p.x=dock.x;p.y=.12;
      for(const dx of [-dock.hx+1,dock.hx-1])for(const dz of [-dock.hz+1,dock.hz-1])detail(0x795641,dock.x+dx,-1.2,dock.z+dz,.3,2.6,.3,true);
      for(const side of [-1,1]){detail(0x795641,dock.x,1,dock.z+side*dock.hz,14,.12,.12,true);for(const dx of [-6,0,6])detail(0x795641,dock.x+dx,.58,dock.z+side*dock.hz,.12,1.1,.12,true);}
    }
    const y=p.y;pergola(dock.x,dock.z-3,3,2,y);bench(dock.x,dock.z-4,0,y);bench(dock.x+3.7,dock.z+3.5,Math.PI/2,y);detail(0x304454,dock.x-4,y+.5,dock.z-3.5,1,.9,1,true);detail(0xffd58a,dock.x-4,y+1,dock.z-3.5,1.1,.12,1.1);for(const dz of [2,4]){detail(0x795641,dock.x-5,y+.35,dock.z+dz,1.1,.7,.9,true);detail(0xfaf9ec,dock.x-5,y+.74,dock.z+dz,.8,.1,.6);}
  }
  // Landscaped seafront promenade, kiosks, shaded seating and access from the avenues.
  walkway(130,-72,2.4,224,0xbfc8c4);
  for(const z of [-274,-210,-164,-92,0,92])walkway(118,z,12,2.2,0xbfc8c4);
  for(const [i,z]of [-275,-185,-70,40,130].entries()){
    const x=i===4?113:142;walkway(x,z,5.5,6,0xc5b785);detail([0x36b8b4,0xe46652,0xffd58a][i%3],x,1.6,z,5.5,3,4.5,true);detail(0xfaf9ec,x,3.28,z,6.7,.35,5.6,true);detail(0x304454,x-2.79,1.7,z,.08,1.3,3.4);detail(0x795641,x-3.2,1.02,z,.9,.15,4,true);sign(['ÁGUA DE COCO','CAFÉ DA ORLA','SORVETES','AÇAÍ LOWKEY','BEACH BAR'][i],x-2.84,2.8,z,4.3,-Math.PI/2);
    bench(x-1,z+4,Math.PI/2);bench(x+3,z+4,-Math.PI/2);planter(x+4,z-4);detail(0x795641,x+1,1,z+4,1.3,.16,1.3,true);detail(0x304454,x+1,.5,z+4,.14,1,.14,true);
  }
  for(const z of [-306,-236,-126,-20,78]){pergola(139,z,3,3);bench(139,z-2);bench(139,z+2,Math.PI);for(const dx of [-4.4,4.4])planter(139+dx,z,1.4,1.4);}
  // Shelters sit off the asphalt, leaving crossings and the footpath usable.
  for(const [i,[x,z,a]]of [[30,100,0],[-30,-100,Math.PI],[-429,0,Math.PI/2],[-375,-173,-Math.PI/2],[98,-235,-Math.PI/2],[2,-313,0]].entries()){
    publicSpaces.busStops.push({x,z,rotation:a});const p=localDetail(x,z,a);walkway(x,z,Math.abs(Math.sin(a))>0.5?1.8:4,Math.abs(Math.sin(a))>0.5?4:1.8);for(const dx of [-3,3])p(0x304454,dx,1.6,0,.12,3,.12,true);p(0x304454,0,3.16,0,7,.26,2.8,true);p(0x35dded,0,3.2,1.45,7,.12,.08);p(0x63c8db,0,1.5,-1.1,6,2.7,.07,true);bench(x,z,a);p(0x304454,3.8,1.65,0,.1,3.1,.1,true);p(0xffd58a,3.8,3.1,0,.75,.7,.12);sign('ÔNIBUS · LINHA '+(i<3?'01 CENTRO':'02 LITORAL'),x+Math.sin(a)*1.46,2.76,z+Math.cos(a)*1.46,6,a);
  }
  // Main airport: a real forecourt and portal on its existing access lane.
  walkway(-9,-313,12,3.5,0x424d54);walkway(8,-313,5,3.5,0x424d54);
  for(let x=-18;x<=0;x+=3){detail(0xfaf9ec,x,.14,-313,.09,.015,5);}
  for(const x of [14.4,25.6])detail(0x304454,x,2.8,-318,.25,5.6,.25,true);detail(0x304454,20,5.7,-318,12,.6,.3,true);sign('AEROPORTO LOWKEY · EMBARQUE',20,5.72,-317.82,11);
  for(const x of [-50,-35,-20]){detail(0xfaf9ec,x,3.1,-326.5,.18,6,.18,true);detail(0x304454,x,6.25,-327.3,13,.2,2.8,true);}
  for(const x of [38,44,50]){detail(0xffd58a,x,.32,-332,1.8,.6,1.1,true);for(const dx of [-.65,.65])detail(0x304454,x+dx,.17,-332,.3,.3,.8);}
  // Mansion gardens stay outside the enclosed building; sizes encode future value tiers.
  for(const b of buildings.filter(b=>b.kind==='mansion')){const front=b.z+b.depth/2;walkway(b.x,front+3,b.width/2,3,0xc5b785);detail(0xfaf9ec,b.x-4,.19,front+2.8,8,.14,3.8);detail(0x35dded,b.x-4,.275,front+2.8,7.3,.02,3.1);for(const x of [b.x+b.width/2-1,b.x-b.width/2+1])planter(x,front+3,1.5,1.5);pergola(b.x+5,front+2.6,2,1.6);bench(b.x+5,front+3.5,Math.PI);publicSpaces.gardens.push({x:b.x,z:front+3,tier:b.estateTier});}
  // Deterministic planting clusters: keep roads, doors, playgrounds and airfields clear.
  let landscapeSeed=9431;const landscapeRandom=()=>{landscapeSeed=(landscapeSeed*1664525+1013904223)>>>0;return landscapeSeed/4294967296;};
  for(const region of [{x0:-469,x1:-243,z0:-312,z1:151},{x0:-116,x1:119,z0:-310,z1:-128},{x0:103,x1:119,z0:-115,z1:113}])for(let x=region.x0;x<region.x1;x+=11)for(let z=region.z0;z<region.z1;z+=11){const px=x+landscapeRandom()*7,pz=z+landscapeRandom()*7;if(landscapeRandom()<.22||groundKind(px,pz)!=='grass'||!islandAt(px,pz)||airports.some(a=>inRect(px,pz,a,9))||farmFields.some(f=>inRect(px,pz,f,3))||inRect(px,pz,footballField,4)||publicSpaces.paths.some(p=>inRect(px,pz,p,2.5))||obstacles.some(o=>Math.abs(px-o.x)<(o.hx||o.r||0)+2.8&&Math.abs(pz-o.z)<(o.hz||o.r||0)+2.8))continue;const size=.8+landscapeRandom()*.85,t={x:px,z:pz,size};trees.push(t);obstacles.push({x:px,z:pz,r:.26*size,minY:-.05,maxY:3.8*size,kind:'landscape-tree'});for(let i=0;i<2;i++){const bx=px+(landscapeRandom()-.5)*4,bz=pz+(landscapeRandom()-.5)*4;detail(i?0x99ce48:0x6cbb36,bx,.2,bz,.9,.5,.9);}}
  globalThis.LowkeyCityLayout={MAP_HALF_SIZE,bounds,coast,roads,surfaces,entrances,buildings,trees,lamps,obstacles,groundKind,inRect,safeZone,inSafeZone,garage,garageBays,garagePoint,dealershipDisplays,boutiques,storePoint,policeStation,policePoint,jail,jailExit,nightclub,clubPoint,interiorPlatforms,raceRoutes,islands,islandSurfaces,islandAt,pointInPolygon,surfaceHeight,expansionSurfaces,expansionRoads,bridges,bridgeSurfaces,bridgePillars,districts,airports,heliport,farmFields,ruralYards,ruralFixtures,statue,elevatedPlatforms,festivalScreen,festival,festivalApron,festivalPlatforms,plazaTrees,plazaLamps,footballField,prison,gasStations,fishingSpots,beachEdge,beachHeight,publicSpaces};
  Object.assign(globalThis.LowkeyCityLayout,{customs,customsBay});
})();
