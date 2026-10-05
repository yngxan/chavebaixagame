(() => {
  function create({THREE,scene,signMaterial}){
    const layout=LowkeyCityLayout,group=new THREE.Group();group.name='LowKey City';scene.add(group);
    const materials=new Map(),batches=new Map(),boxGeo=new THREE.BoxGeometry(1,1,1),leafGeo=new THREE.IcosahedronGeometry(1,1);
    const roofGeo=new THREE.BufferGeometry(),v=[[-.5,0,-.5],[.5,0,-.5],[0,1,-.5],[-.5,0,.5],[.5,0,.5],[0,1,.5]],faces=[[0,2,1],[3,4,5],[0,3,5],[0,5,2],[2,5,4],[2,4,1],[0,1,4],[0,4,3]];
    roofGeo.setAttribute('position',new THREE.Float32BufferAttribute(faces.flatMap(f=>f.flatMap(i=>v[i])),3));roofGeo.computeVertexNormals();
    function material(color){if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.84,flatShading:true}));return materials.get(color);}
    const white=material(0xf3eee1),asphalt=material(0x424d54),pavement=material(0xbfc8c4),trim=material(0xfaf9ec),dark=material(0x304454),wood=material(0x795641),glass=material(0x63c8db),roofFlat=material(0x879687),leaf=material(0x6cbb36),leafLight=material(0x99ce48),bark=material(0x866145),lamp=material(0xffe3a2);
    glass.emissive.set(0x9fc8df);lamp.emissive.set(0xffc775);
    const showroomGlass=new THREE.MeshStandardMaterial({color:0x92b7c6,roughness:.14,metalness:.25,transparent:true,opacity:.16,depthWrite:false});
    function part(mat,x,y,z,sx,sy,sz,rotation=0,geo=boxGeo,cast=true){
      const key=`${mat.uuid}:${geo.uuid}:${cast}`,batch=batches.get(key)||{mat,geo,cast,items:[]};
      batch.items.push({x,y,z,sx,sy,sz,rotation});batches.set(key,batch);
    }
    function beam(mat,a,b,width=.16){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),mid=start.clone().add(end).multiplyScalar(.5),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());part(mat,mid.x,mid.y,mid.z,width,delta.length(),width,q,boxGeo,false);}
    const neonPink=material(0xf153ca),neonBlue=material(0x35dded);for(const m of [neonPink,neonBlue]){m.emissive.copy(m.color);m.emissiveIntensity=.8;}
    const shoreMaterial=material(0xd7c28e);shoreMaterial.polygonOffset=true;shoreMaterial.polygonOffsetFactor=-2;shoreMaterial.polygonOffsetUnits=-3;
    // Low-poly island outlines stay cheap at any distance; detail batches remain shared.
    const islandSectors=[];
    for(const island of layout.islands){const sector=new THREE.Group();sector.name=island.name;group.add(sector);islandSectors.push(sector);const shape=new THREE.Shape(island.polygon.map(([x,z])=>new THREE.Vector2(x,-(island.id==='main'?Math.min(z,172):z)))),soil=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:7.85,bevelEnabled:false,steps:1}),material(0x866145));soil.rotation.x=-Math.PI/2;soil.position.y=-8;soil.receiveShadow=true;sector.add(soil);
      const surface=new THREE.Mesh(new THREE.ShapeGeometry(shape),material(0x6cbb36));surface.rotation.x=-Math.PI/2;surface.position.y=-.065;surface.receiveShadow=true;sector.add(surface);
      // Explicit perimeter strips avoid self-intersecting triangulation around concave bays.
      const shoreVertices=[],outer=island.polygon.map(([x,z])=>[x,island.id==='main'?Math.min(z,172):z]),inner=island.inner.map(([x,z])=>[x,island.id==='main'?Math.min(z,171.9):z]);for(let i=0;i<outer.length;i++){const j=(i+1)%outer.length,a=outer[i],b=outer[j],c=inner[i],d=inner[j];shoreVertices.push(a[0],-.052,a[1],c[0],-.052,c[1],b[0],-.052,b[1],b[0],-.052,b[1],c[0],-.052,c[1],d[0],-.052,d[1]);}const shoreGeo=new THREE.BufferGeometry();shoreGeo.setAttribute('position',new THREE.Float32BufferAttribute(shoreVertices,3));shoreGeo.computeVertexNormals();const shore=new THREE.Mesh(shoreGeo,material(0xd7c28e));shore.material.side=THREE.DoubleSide;shore.receiveShadow=true;sector.add(shore);
    }
    for(const s of [...layout.surfaces,...layout.expansionSurfaces])part(s.kind==='rural-yard'?material(0xd7c28e):s.kind==='road'||s.kind==='airport'?asphalt:pavement,s.x,s.y-.075,s.z,s.hx*2,.15,s.hz*2,0,boxGeo,false);
    function districtSign(text,x,y,z,width,height,rotation=0){if(!signMaterial)return;let mat;if(typeof document==='undefined')mat=signMaterial([text],'#16272e','#eff7dc');else{const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.max(48,Math.round(1024*height/width));const ctx=canvas.getContext('2d');ctx.fillStyle='#16272e';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#eff7dc';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${Math.round(canvas.height*.72)}px Arial`;ctx.fillText(text,512,canvas.height/2,984);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;mat=new THREE.MeshBasicMaterial({map:texture});}const sign=new THREE.Mesh(new THREE.PlaneGeometry(width,height),mat);sign.position.set(x,y,z);sign.rotation.y=rotation;group.add(sign);return sign;}
    for(const a of layout.airports){
      // Markings sit slightly above the shared flat runway; no invisible fences.
      for(let x=-a.runwayHalf+10;x<a.runwayHalf-6;x+=8)part(white,a.x+x,-.002,a.runwayZ,4,.012,.18,0,boxGeo,false);
      for(const side of [-1,1]){part(white,a.x,-.002,a.runwayZ+side*4.2,a.runwayHalf*2,.012,.12,0,boxGeo,false);for(let i=-3;i<=3;i++)part(white,a.x+side*(a.runwayHalf-5),-.002,a.runwayZ+i*.95,4,.012,.5,0,boxGeo,false);}
      for(let x=-a.runwayHalf;x<=a.runwayHalf;x+=10)for(const side of [-1,1])part(lamp,a.x+x,.025,a.runwayZ+side*5,.22,.07,.22,0,boxGeo,false);
      for(const x of [a.terminal.x-8,a.terminal.x+8])for(let z=Math.min(a.terminal.z,a.runwayZ)+4;z<Math.max(a.terminal.z,a.runwayZ)-5;z+=2)part(material(0xffd58a),x,.001,z,.15,.014,1,0,boxGeo,false);
      districtSign(a.name,a.x,3.2,a.z+a.hz,16,1.4);
    }
    const hp=layout.heliport;part(dark,hp.x,hp.y-.014,hp.z,20,.028,20,0,boxGeo,false);
    for(const side of [-1,1]){part(white,hp.x+side*2,hp.y+.014,hp.z,.6,.014,7,0,boxGeo,false);part(white,hp.x+side*9,hp.y+.014,hp.z,.18,.014,18,0,boxGeo,false);part(white,hp.x,hp.y+.014,hp.z+side*9,18,.014,.18,0,boxGeo,false);for(const z of [-9,9])part(lamp,hp.x+side*9,hp.y+.04,hp.z+z,.22,.06,.22,0,boxGeo,false);}part(white,hp.x,hp.y+.014,hp.z,4,.014,.6,0,boxGeo,false);districtSign('HELIPORTO',hp.x,hp.y+1.1,hp.z-11.8,10,1);
    for(const f of layout.farmFields){part(wood,f.x,-.024,f.z,f.hx*2,.014,f.hz*2,0,boxGeo,false);for(let x=-f.hx+2;x<f.hx;x+=2.5)for(let z=-f.hz+1;z<f.hz;z+=3)part(leafLight,f.x+x,.17,f.z+z,.55,.35,1.2,0,boxGeo,false);}
    // Static rural props reuse existing materials and geometry; no extra AI loops.
    for(const f of layout.ruralFixtures){if(f.kind==='silo'){part(roofFlat,f.x,2.6,f.z,f.r*2,5.2,f.r*2);part(trim,f.x,5.2,f.z,f.r*2+.2,.15,f.r*2+.2);part(material(0xc64a39),f.x,5.25,f.z,f.r*2,.75,f.r*2,0,roofGeo);}
      else if(f.kind==='water-tower'){for(const side of [-1,1])for(const z of [-1.6,1.6])part(wood,f.x+side*1.6,3.4,f.z+z,.25,6.8,.25);part(roofFlat,f.x,7.5,f.z,3.6,2.8,3.6);part(trim,f.x,8.92,f.z,3.8,.16,3.8);for(let y=.6;y<6.5;y+=.55)part(dark,f.x, y,f.z+1.7,1,.08,.12);}
      else{for(const side of [-1,1])part(dark,f.x+side*.5,3.6,f.z,.12,7.2,.12);part(dark,f.x,7.3,f.z,3.2,.16,.25);part(trim,f.x,7.3,f.z,.16,3.2,.25);part(roofFlat,f.x,7.3,f.z,.55,.55,.4);}}
    for(const f of layout.farmFields)for(const side of [-1,1]){for(let x=-f.hx;x<=f.hx;x+=4)part(wood,f.x+x,.55,f.z+side*f.hz,.13,1.2,.13);part(wood,f.x,.48,f.z+side*f.hz,f.hx*2,.12,.1);part(wood,f.x,.85,f.z+side*f.hz,f.hx*2,.12,.1);}
    districtSign('VILA RURAL · FAZENDAS',-339,3.8,-131,19,1.2);
    // An original LowKey monument: cartoon face, crown, robe and a raised golden key.
    // Merge its static pieces into three meshes instead of drawing every limb separately.
    const monument=new THREE.Group(),st=layout.statue;monument.name='Monumento LowKey';monument.position.set(st.x,0,st.z);monument.scale.setScalar(st.scale);group.add(monument);
    part(pavement,st.x,.035,st.z,64,.17,64);part(trim,st.x,8.7,st.z,48,17.16,48);part(dark,st.x,17.04,st.z,48,.72,48);
    const bronze=new THREE.MeshStandardMaterial({color:0x76aa94,metalness:.38,roughness:.68,flatShading:true}),gold=new THREE.MeshStandardMaterial({color:0xd4ff00,metalness:.5,roughness:.42,flatShading:true});
    const headGeo=new THREE.SphereGeometry(1,12,8),robeGeo=new THREE.CylinderGeometry(1.9,3.4,8.7,10),limbGeo=new THREE.CylinderGeometry(1,1,1,8),spikeGeo=new THREE.ConeGeometry(1,1,6),keyRingGeo=new THREE.TorusGeometry(1.1,.28,8,18),statueGeometry=new Map();
    function sculpt(mat,geo,x,y,z,sx=1,sy=1,sz=1,quaternion=null){const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);if(quaternion)mesh.quaternion.copy(quaternion);mesh.updateMatrix();const g=geo.index?geo.toNonIndexed():geo.clone();g.applyMatrix4(mesh.matrix);const bucket=statueGeometry.get(mat)||{positions:[],normals:[]};bucket.positions.push(...g.attributes.position.array);bucket.normals.push(...g.attributes.normal.array);statueGeometry.set(mat,bucket);g.dispose();}
    function limb(a,b,r){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),mid=start.clone().add(end).multiplyScalar(.5),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());sculpt(bronze,limbGeo,...mid.toArray(),r,delta.length(),r,q);}
    sculpt(bronze,robeGeo,0,8.7,0);sculpt(bronze,headGeo,0,14.2,0,2.6,2.1,1.7);sculpt(bronze,headGeo,0,17.7,0,2.2,2.4,2);sculpt(bronze,headGeo,0,17.65,2.05,.4,.48,.35);
    for(const side of [-1,1]){sculpt(dark,headGeo,side*.72,18.15,1.83,.19,.28,.13);sculpt(bronze,headGeo,side*2.14,17.6,0,.35,.55,.4);}
    sculpt(dark,boxGeo,0,16.95,1.95,.75,.12,.12);sculpt(bronze,limbGeo,0,19.5,0,2.3,.65,2.1);
    for(let i=0;i<7;i++){const angle=(i-3)*.35,dir=new THREE.Vector3(Math.sin(angle),Math.cos(angle),0),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir);sculpt(bronze,spikeGeo,Math.sin(angle)*2.5,19.5+Math.cos(angle)*1.8,0,.37,2.4,.37,q);}
    limb([2.1,14.8,0],[4.35,18.2,0],.7);limb([4.35,18.2,0],[4.8,21.4,0],.55);sculpt(bronze,headGeo,4.8,21.5,0,.72,.8,.72);
    limb([-2.1,14.7,0],[-3.5,12.4,.3],.65);limb([-3.5,12.4,.3],[-2.9,13.2,1.3],.55);sculpt(bronze,boxGeo,-2.8,13.1,1.5,2.3,3.3,.55);sculpt(gold,boxGeo,-2.8,13.1,1.8,1.7,.16,.08);
    sculpt(gold,keyRingGeo,4.8,25.5,0);sculpt(gold,boxGeo,4.8,23.1,0,.5,3,.5);for(const y of [22,22.8])sculpt(gold,boxGeo,5.35,y,0,.9,.35,.5);
    for(const [mat,bucket]of statueGeometry){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(bucket.positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(bucket.normals,3));geo.computeBoundingSphere();const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;monument.add(mesh);}
    for(const geo of [headGeo,robeGeo,limbGeo,spikeGeo,keyRingGeo])geo.dispose();districtSign('LOWKEY',st.x,11.6,st.z+24.02,32,4.8);
    const field=layout.footballField;part(material(0x398a2b),field.x,-.045,field.z,field.hx*2,.012,field.hz*2,0,boxGeo,false);
    for(const side of [-1,1]){part(white,field.x+side*field.hx,-.026,field.z,.12,.014,field.hz*2,0,boxGeo,false);part(white,field.x,-.026,field.z+side*field.hz,field.hx*2,.014,.12,0,boxGeo,false);for(const x of [-2.8,2.8]){part(white,field.x+x,1.05,field.z+side*field.hz,.14,2.2,.14);for(const z of [0,1.4])part(white,field.x+x,2.05,field.z+side*(field.hz+z),.08,.08,.08);}
      part(white,field.x,2.1,field.z+side*field.hz,5.6,.1,.1);for(let x=-2.8;x<=2.8;x+=.7)part(trim,field.x+x,1,field.z+side*(field.hz+1.4),.035,2,.035,0,boxGeo,false);for(let y=.3;y<2.1;y+=.4)part(trim,field.x,y,field.z+side*(field.hz+1.4),5.6,.025,.025,0,boxGeo,false);}
    part(white,field.x,-.026,field.z,field.hx*2,.014,.12,0,boxGeo,false);
    const circle=new THREE.Mesh(new THREE.RingGeometry(2.2,2.3,24),white);circle.rotation.x=-Math.PI/2;circle.position.set(field.x,-.019,field.z);group.add(circle);districtSign('CAMPINHO KEYLOW',field.x,2.4,field.z-17,10,.7);
    const slopeGeos=new Map();
    function slopedPart(mat,p,width,height,depth,y){if(!p.slopeX){part(mat,p.x,y,p.z,width,height,depth,0,boxGeo,false);return;}const key=`${p.slopeX*width/height}`;if(!slopeGeos.has(key)){const geo=boxGeo.clone(),a=geo.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,a.getY(i)+p.slopeX*a.getX(i)*width/height);a.needsUpdate=true;geo.computeVertexNormals();slopeGeos.set(key,geo);}part(mat,p.x,y,p.z,width,height,depth,0,slopeGeos.get(key),false);}
    for(const p of layout.bridgeSurfaces){slopedPart(asphalt,p,p.hx*2,.26,p.hz*2,p.y-.13);for(const side of [-1,1]){slopedPart(pavement,{...p,z:p.z+side*5.4},p.hx*2,.12,1.6,p.y+.06);slopedPart(trim,{...p,z:p.z+side*6.18},p.hx*2,.15,.24,p.y+1.06);}}
    for(const p of layout.bridgePillars)part(dark,p.x,(p.minY+p.maxY)/2,p.z,p.hx*2,p.maxY-p.minY,p.hz*2,0,boxGeo,false);
    for(const b of layout.bridges){for(const x of [-225,-195]){for(const side of [-1,1]){const z=b.z+side*9;part(pavement,x,15.5,z,4.2,43,4.2);part(trim,x,29,z,4.6,.65,4.6);part(dark,x,35.7,z,4.5,.45,4.5);part(trim,x,37,z,4.3,2.1,4.3,0,roofGeo);for(const dx of [-1.55,1.55])part(trim,x+dx,36.3,z,.35,5,.35);for(let y=13;y<34;y+=4)for(const edge of [-1,1])part(glass,x+edge*2.12,y,z,.06,2.1,1.3);part(neonBlue,x,9.4,z,4.5,.12,4.5,0,boxGeo,false);}part(trim,x,28.5,b.z,4.6,1.1,18);part(dark,x,12.9,b.z,4.2,.7,18);}
      part(pavement,-210,29,b.z,30,1.4,3);for(const side of [-1,1]){part(neonPink,-210,30,b.z+side*1.6,30,.14,.14,0,boxGeo,false);for(const [from,to,anchor]of [[-325,-225,-225],[-195,-164,-195]]){let previous=null;for(let x=from;x<=to;x+=2){const t=(x-from)/(to-from),y=anchor===to?10.5+24*t*t:10.5+24*(1-t)*(1-t),p=[x,y,b.z+side*6.45];if(previous)beam(trim,previous,p,.2);if(Math.round(x-from)%10===0)beam(neonBlue,[x,9.4,b.z+side*6.45],p,.07);previous=p;}}}}
    // Civic landmarks, filling stations and prison architecture share instance batches.
    for(const b of layout.buildings.filter(b=>b.civic)){const p=layout.storePoint(b,0,b.depth/2+.15);districtSign(b.shopName,p.x,8,p.z,b.width*.92,1.7,b.rotation);}
    for(const p of layout.gasStations){part(pavement,p.x,.065,p.z,20,.11,20,0,boxGeo,false);part(trim,p.x,5.6,p.z,20,.4,20);part(neonPink,p.x,5.6,p.z+10.02,20,.25,.08,0,boxGeo,false);for(const x of [-8,8])for(const z of [-8,8])part(dark,p.x+x,2.86,p.z+z,.32,5.48,.32);for(const x of [-4,4]){part(white,p.x+x,1,p.z,.9,1.76,1.3);part(dark,p.x+x,1.4,p.z+.66,.65,.4,.03);beam(dark,[p.x+x+.55,1.5,p.z],[p.x+x+.55,.5,p.z],.09);}districtSign(p.name,p.x,5.65,p.z+10.1,12,.8);}
    const jail=layout.prison;for(const side of [-1,1]){part(pavement,jail.x+side*jail.hx,3.62,jail.z,.6,7,jail.hz*2);part(pavement,jail.x,3.62,jail.z+side*jail.hz,jail.hx*2,7,.6);for(const x of [-jail.hx,jail.hx]){part(dark,jail.x+x,6,jail.z+side*jail.hz,4,12,4);part(glass,jail.x+x,11,jail.z+side*jail.hz,4.15,1.4,4.15);part(trim,jail.x+x,12.3,jail.z+side*jail.hz,4.8,.4,4.8);}}
    part(pavement,jail.x,.065,jail.z,jail.hx*2,.11,jail.hz*2,0,boxGeo,false);part(dark,jail.x,6,jail.z-30,39,12,12);for(let x=-16;x<=16;x+=4)for(const y of [3,7,10]){part(glass,jail.x+x,y,jail.z-23.9,2,1.5,.1);for(const dx of [-.6,0,.6])part(trim,jail.x+x+dx,y,jail.z-23.8,.08,1.5,.08);}districtSign(jail.name,jail.x,8,jail.z+20.32,26,2);for(const t of jail.tasks)districtSign(t.name,t.x,1.9,t.z,5,.7);
    for(const p of layout.fishingSpots){part(wood,p.x,1+p.y,p.z-6,.14,2,.14);districtSign(p.name,p.x,2+p.y,p.z-5.91,6,.7);}
    // Roads get emissive strips, not hundreds of expensive real lights.
    for(const r of layout.roads){if(r.sector==='bridge')continue;const vertical=r.axis==='z',half=vertical?r.hz:r.hx;for(let a=-half+3;a<half-2;a+=6)for(const side of [-1,1]){const x=r.x+(vertical?side*4.32:a),z=r.z+(vertical?a:side*4.32);if(layout.roads.some(o=>o!==r&&layout.inRect(x,z,o,1)))continue;const deck=layout.bridgeSurfaces.find(p=>layout.inRect(x,z,p));part(side===1?neonBlue:neonPink,x,(deck?layout.surfaceHeight(deck,x,z):-.025)+.025,z,vertical?.07:3,.024,vertical?3:.07,0,boxGeo,false);}}
    for(const p of layout.publicSpaces.pieces)part(material(p.color),p.x,p.y,p.z,p.w,p.h,p.d,p.rotation,boxGeo,p.h>.3);
    for(const p of layout.publicSpaces.signs)districtSign(p.text,p.x,p.y,p.z,p.width,p.height,p.rotation);
    for(const p of layout.publicSpaces.paths.filter(p=>p.kind==='pier'))for(let x=-p.hx+.7;x<p.hx;x+=1.2)part(roofFlat,p.x+x,p.y+.004,p.z,.025,.008,p.hz*2,0,boxGeo,false);
    for(const s of layout.entrances.filter(s=>!s.publicDetail&&s.kind!=='boutique'&&s.kind!=='nightclub'&&!s.kind?.startsWith('garage')))part(material(0xc5b785),s.x,s.y-.05,s.z,s.hx*2,.1,s.hz*2,s.rot||0,boxGeo,false);
    // Lane markings stop at intersections; zebra crossings sit beside, not over, them.
    const onOtherRoad=(x,z,r,pad=0)=>layout.roads.some(o=>o!==r&&layout.inRect(x,z,o,pad));
    for(const r of layout.roads){const vertical=r.axis==='z',half=vertical?r.hz:r.hx;
      for(let a=-half+3;a<half-2;a+=5){const x=r.x+(vertical?0:a),z=r.z+(vertical?a:0);if(onOtherRoad(x,z,r,2.3))continue;const deck=layout.bridgeSurfaces.find(p=>layout.inRect(x,z,p));part(white,x,(deck?layout.surfaceHeight(deck,x,z):-.025)+.006,z,vertical?.14:2.6,.012,vertical?2.6:.14,0,boxGeo,false);}
      for(const edge of [-1,1])for(let a=-half+2;a<half-1;a+=3){const x=r.x+(vertical?edge*4.16:a),z=r.z+(vertical?a:edge*4.16);if(onOtherRoad(x,z,r,1.6))continue;const deck=layout.bridgeSurfaces.find(p=>layout.inRect(x,z,p));part(white,x,(deck?layout.surfaceHeight(deck,x,z):-.025)+.006,z,vertical?.1:2.9,.012,vertical?2.9:.1,0,boxGeo,false);}
    }
    const intersections=[];
    for(const a of layout.roads.filter(r=>r.axis==='z'))for(const b of layout.roads.filter(r=>r.axis==='x'))if(layout.inRect(a.x,b.z,a)&&layout.inRect(a.x,b.z,b))intersections.push({x:a.x,z:b.z});
    for(const p of intersections)for(const side of [-1,1])for(let i=-3;i<=3;i++){
      part(white,p.x+i*1.05,-.018,p.z+side*6.15,.57,.014,2.05,0,boxGeo,false);
      part(white,p.x+side*6.15,-.018,p.z+i*1.05,2.05,.014,.57,0,boxGeo,false);
    }
    // Crosswalks from each park entrance, preserving the original plaza geometry.
    for(let i=-3;i<=3;i++)for(const side of [-1,1]){
      part(white,side*60,-.018,4+i*.65,8,.014,.35,0,boxGeo,false);
      part(white,i*.8,-.018,side*64,.42,.014,8,0,boxGeo,false);
    }
    const safeLine=material(0xd4ff00);safeLine.emissive.set(0x485c00);
    const safe=layout.safeZone;
    for(let offset=-safe.hx;offset<safe.hx;offset+=4){const length=Math.min(2.15,safe.hx-offset),middle=offset+length/2;
      for(const side of [-1,1])part(safeLine,safe.x+middle,.205,safe.z+side*(safe.hz-.06),length,.028,.12,0,boxGeo,false);
    }
    for(let offset=-safe.hz;offset<safe.hz;offset+=4){const length=Math.min(2.15,safe.hz-offset),middle=offset+length/2;
      for(const side of [-1,1])part(safeLine,safe.x+side*(safe.hx-.06),.205,safe.z+middle,.12,.028,length,0,boxGeo,false);
    }
    const clubLights=[],dancers=[],personGeo=new THREE.CylinderGeometry(1,1,1,8),personHeadGeo=new THREE.SphereGeometry(1,10,8);
    function adultPerformer(b,x,z,index){const root=new THREE.Group(),p=layout.storePoint(b,x,z);root.position.set(p.x,.56,p.z);root.rotation.y=b.rotation;group.add(root);const skin=material([0xc28b67,0xe4b991,0x8b5d43][index]),outfit=material([0xc337a9,0x28bcb9,0x734cc4][index]);
      const mesh=(mat,x,y,z,sx,sy,sz,geo=personGeo)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);root.add(m);return m;};
      mesh(skin,0,1.45,0,.23,.75,.16);mesh(outfit,0,1.06,0,.25,.19,.19);mesh(skin,0,2.18,0,.18,.23,.18,personHeadGeo);mesh(dark,0,2.33,-.03,.20,.12,.2,personHeadGeo);
      for(const side of [-1,1]){mesh(skin,side*.14,.53,0,.095,1.02,.095);mesh(dark,side*.14,.045,.07,.10,.09,.19);mesh(outfit,side*.12,1.67,.13,.14,.14,.12,personHeadGeo);const arm=mesh(skin,side*.34,1.42,0,.068,.72,.068);arm.rotation.z=side*.18;mesh(dark,side*.067,2.22,.163,.022,.027,.013,personHeadGeo);}
      dancers.push({root,baseY:.56,index});root.userData.adult=true;root.userData.age=25+index*3;root.userData.outfit='opaque-bikini';return root;
    }
    for(const b of layout.buildings){
      const c=Math.cos(b.rotation),s=Math.sin(b.rotation),wall=material(b.color),accent=material(b.accent);
      const local=(mat,x,y,z,sx,sy,sz,geo=boxGeo)=>part(mat,b.x+x*c+z*s,.12+y,b.z-x*s+z*c,sx,sy,sz,b.rotation,geo);
      const w=b.width,d=b.depth,h=b.height;
      if(b.kind==='nightclub'){
        const pink=material(0xde43b5),violet=material(0x6b39ce),velvet=material(0x602344);pink.emissive.set(0xa82075);violet.emissive.set(0x34136e);
        local(wall,-7.35,h/2,0,.3,h,14);local(wall,7.35,h/2,0,.3,h,14);local(wall,0,h/2,-6.85,15,h,.3);local(dark,0,-.04,0,15,.08,14);local(dark,0,h+.1,0,15.4,.2,14.4);
        for(const x of [-4.4,4.4]){local(wall,x,h/2,6.85,6.2,h,.3);local(pink,x,2,7.02,4.7,.12,.04);local(violet,x,6.1,7.02,4.7,.12,.04);}
        local(wall,0,5.96,6.85,2.6,5.32,.3);for(const x of [-1.3,1.3])local(pink,x,1.65,6.95,.08,3.3,.12);
        for(const p of layout.interiorPlatforms)local(wood,p.x-b.x,p.y-.12-.075,p.z-b.z,p.hx*2,.15,p.hz*2);
        for(const x of [-1.9,1.9]){local(velvet,x,.22,-3.3,2.7,.44,2.5);local(trim,x,1.9,-3.3,.055,3.4,.055);}
        local(wood,4.9,.54,-4.5,3.8,1.08,1.1);local(pink,4.9,1.1,-4.5,3.9,.07,1.2);
        for(const x of [4.8,6.3])for(const z of [1,4]){local(velvet,x,.48,z,1.3,.65,1.6);local(velvet,x,.98,z-.65,1.3,.9,.22);}
        for(const z of [-1.5,2.5]){local(dark,0,.02,z,5,.035,2);for(const x of [-1.8,0,1.8])local((x+z)>0?pink:violet,x,.045,z,.8,.02,.8);}
        for(const x of [0,3.6])local(wall,x,6.22,-3,.16,4.04,7.4);
        for(const x of [-1.8,1.8,5.4]){local(wood,x,4.52,-4.4,2.2,.64,3.4);local(white,x,4.86,-4.4,2.1,.16,3.3);local(velvet,x,4.98,-3.6,2.1,.08,1.4);local(white,x,5.03,-5.5,1.6,.18,.6);local(wall,x-.95,6.22,.7,1.6,4.04,.16);}
        for(const [text,x,y,z,width,height]of [['VELVET · CLUB',0,3.7,7.06,10,.9],['MOTEL · SUÍTES',0,7.4,7.06,9,.7],['SUBIR · SUÍTES',-5.8,2.8,5.8,2.1,.38],['LOUNGE · 21+',0,2.8,-6.66,4.5,.6]])if(signMaterial&&typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.round(1024*height/width);const ctx=canvas.getContext('2d');ctx.fillStyle='#28132e';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#ff79df';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${Math.floor(canvas.height*.72)}px Arial`;ctx.fillText(text,512,canvas.height/2,980);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const p=layout.storePoint(b,x,z),sign=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture}));sign.position.set(p.x,y,p.z);group.add(sign);}
        adultPerformer(b,-1.9,-3.3,0);adultPerformer(b,1.9,-3.3,1);
        for(const x of [-2,2]){const p=layout.storePoint(b,x,-2),light=new THREE.PointLight(x<0?0xce43ff:0xff407d,0,13,2);light.position.set(p.x,3.5,p.z);group.add(light);clubLights.push(light);}
        continue;
      }
      if(b.kind==='customs'){
        const brick=material(0x85504e),concrete=material(0x777872),steel=material(0x36424a),yellow=material(0xe2bf70),red=material(0xaa343b),light=material(0xe8f8f3);light.emissive.set(0xa6bfb4);
        local(concrete,0,.01,0,15,.12,13);local(brick,-7.35,3.25,0,.3,6.5,13);local(brick,7.35,3.25,0,.3,6.5,13);local(brick,0,3.25,-6.35,15,6.5,.3);
        for(const x of [-5.7,5.7])local(brick,x,3.25,6.35,3.6,6.5,.3);local(brick,0,5.65,6.35,7.8,1.7,.3);local(steel,0,6.6,0,15.4,.2,13.4);
        for(let y=.45;y<6.5;y+=.45)for(const x of [-5.7,5.7])local(concrete,x,y,6.515,3.6,.018,.015);
        for(const x of [-5.9,5.9]){local(yellow,x,4.2,6.52,1.0,1.35,.035);for(const dx of [-.32,0,.32])local(steel,x+dx,4.2,6.56,.05,1.4,.04);}
        for(const x of [-4,4])local(yellow,x,2.4,6.55,.14,4.8,.18);
        for(let z=-4.5;z<6;z+=3){local(steel,0,6.22,z,14,.16,.18);for(const x of [-3.7,3.7])local(light,x,6.1,z,3.2,.055,.16);}
        local(steel,0,.10,0,6.3,.06,8.5);for(const x of [-3,3]){local(yellow,x,.14,0,.08,.02,8.5);local(red,x,1.55,-1,.24,3.1,.25);local(steel,x*.65,.25,-1,2,.15,.3);}
        for(const z of [-3,0,3]){local(red,-6,.55,z,1.5,1.1,2.3);local(steel,-6,1.15,z,1.8,.12,2.5);for(const y of [.35,.65,.95])local(trim,-5.22,y,z,.03,.035,1.7);}
        for(const x of [4.8,5.8,6.8]){local(steel,x,.55,-4,.8,1.1,.8);local(yellow,x,1.12,-4,.85,.06,.85);}
        local(steel,5.4,7.3,-3.5,2.7,1.4,2.6);local(concrete,5.4,6.7,-3.5,3.1,.15,3);
        for(const [label,x,y,z,w,h]of [['LOWKEY CUSTOMS',0,5.8,6.55,7.1,.85],['PINTURA · RODAS',0,4.95,6.57,5.6,.38],['LOWKEY CUSTOMS',0,3.9,-6.15,7,1],['ESTACIONE PARA PERSONALIZAR',0,.19,3.8,4.4,.35]]){const p=layout.storePoint(b,x,z);districtSign(label,p.x,y+.12,p.z,w,h,b.rotation);}
        continue;
      }
      if(b.kind==='police'){
        // Limestone joints, recessed window frames and horizontal blue reveals.
        for(const side of [-1,1])for(const y of [.65,1.25,1.85,2.45,3.05])local(trim,side*4.5,y,6.515,5.7,.022,.018);
        local(wall,-7.35,h/2,0,.3,h,d);local(wall,7.35,h/2,0,.3,h,d);local(wall,0,h/2,-6.35,w,h,.3);local(roofFlat,0,h+.1,0,w+.4,.2,d+.4);local(pavement,0,-.04,0,w,.08,d);
        for(const x of [-4.5,4.5]){local(wall,x,1.7,6.35,6,3.4,.3);local(glass,x,1.8,6.53,4.5,1.65,.04);}
        local(accent,0,3.86,6.35,w,1.1,.3);for(const x of [-1.5,1.5])local(trim,x,1.6,6.35,.1,3.2,.2);
        for(let z=-6.2;z<=-1.3;z+=.35)local(dark,1.9,1.65,z,.06,3.3,.06);
        for(let x=2;x<=7.2;x+=.35)local(dark,x,1.65,-1.3,.06,3.3,.06);
        for(const y of [.45,2.9]){local(dark,1.9,y,-3.8,.07,.07,5);local(dark,4.6,y,-1.3,5.3,.07,.07);}
        local(dark,5,.4,-5.2,2.7,.55,1.3);local(white,5,.73,-5.2,2.6,.12,1.2);local(wood,-3,.51,-1.5,2.8,1.02,1.3);local(dark,-3,1.2,-1.5,.7,.35,.3);
        for(const x of [-4,0,4])local(lamp,x,4.1,0,1.8,.07,.5);
        // Two-storey civic silhouette, kept above the existing AI/entry floor.
        local(white,0,6.54,0,w,3.64,d);local(accent,0,4.95,6.53,w,.17,.12);
        for(const side of [-1,1]){local(white,side*6.8,4.35,5.9,1.15,8.5,1.2);local(accent,side*6.8,3.15,6.55,1.2,.22,.08);}
        for(const x of [-4.5,0,4.5]){local(glass,x,6.6,6.54,3.85,2.8,.08);local(accent,x,4.98,6.9,4.1,.12,1.1);for(const dx of [-1.9,0,1.9])local(trim,x+dx,6.6,6.60,.08,2.8,.08);}
        for(const side of [-1,1]){local(accent,side*7.54,6.8,0,.08,.25,d);for(const z of [-3,1,4])local(glass,side*7.58,6.5,z,.08,2.3,2.5);}
        local(white,0,8.48,0,w+.2,.24,d+.2);local(dark,0,8.63,0,w+.4,.06,d+.4);
        const towerX=-5.3,towerZ=-4.2;
        local(white,towerX,10.9,towerZ,4.2,4.56,4.2);local(accent,towerX,11.85,towerZ,4.3,.65,4.3);
        local(trim,towerX,12.35,towerZ,4.5,.22,4.5);local(glass,towerX,13.25,towerZ,4.1,1.6,4.1);
        for(const side of [-1,1])for(const dz of [-1.98,1.98])local(trim,towerX+side*1.98,13.25,towerZ+dz,.12,1.6,.12);
        local(accent,towerX,14.15,towerZ,4.5,.22,4.5);local(roofFlat,towerX,14.28,towerZ,4.2,.04,4.2);
        // Rooftop pad matches a shared physical support surface.
        local(dark,1.65,8.66,.65,6.5,.06,6.5);
        for(const x of [.45,2.85])local(white,x,8.70,.65,.16,.018,3.2);local(white,1.65,8.70,.65,2.55,.018,.16);
        for(const x of [-6,6])for(const z of [-5.2,5.2])local(neonBlue,x,8.7,z,.24,.08,.24);
        for(const x of [4.8,6.1]){local(pavement,x,8.84,-4.8,1,.4,1);local(dark,x,9.07,-4.8,.75,.06,.75);}
        const towerSignPoint=layout.policePoint(towerX,towerZ+2.18);districtSign('POLÍCIA',towerSignPoint.x,11.96,towerSignPoint.z,3.8,.48,b.rotation);
        for(const [text,x,y,z,width,height] of [['POLÍCIA · LOWKEY',0,4,6.62,9,.65],['CELA',4.6,3.45,-1.18,1.6,.38],['POLÍCIA LOWKEY',-3,2.9,-6.13,3.6,.6]]){const p=layout.storePoint(b,x,z);districtSign(text,p.x,y,p.z,width,height,b.rotation);}
        const lightPoint=layout.storePoint(b,0,-1),interiorLight=new THREE.PointLight(0xffe4b0,12,15,2);interiorLight.position.set(lightPoint.x,3.9,lightPoint.z);interiorLight.castShadow=false;group.add(interiorLight);
        continue;
      }
      if(b.kind==='boutique'){
        for(const side of [-1,1]){local(trim,side*7.28,2,6.55,.22,4,.16);local(wood,side*6.7,.12,5,1.25,.16,2.2);}local(lamp,0,3.48,6.4,14.4,.045,.08);
        local(wall,-7.35,h/2,0,.3,h,d);local(wall,7.35,h/2,0,.3,h,d);local(wood,0,h/2,-6.35,w,h,.3);local(roofFlat,0,h+.1,0,w+.4,.2,d+.4);
        local(wood,0,-.04,0,w,.08,d);
        for(const x of [-4.4,4.4]){local(showroomGlass,x,1.7,6.35,6.2,3.2,.10);local(trim,x,.14,6.35,6.2,.28,.3);for(const dx of [-2,0,2])local(dark,x+dx,1.7,6.42,.045,3.2,.045);}
        local(white,0,3.84,6.35,w,1.1,.3);local(glass,0,4.06,6.53,w-1,.28,.04);for(const x of [-1.3,1.3]){local(trim,x,1.6,6.35,.22,3.2,.20);local(trim,x,2.4,6.5,.45,.8,.20);}
        // Oversized rooftop tee and architectural fins, as in the reference.
        for(const x of [-5.7,-4.7,-3.7,-2.7])local(trim,x,5.05,-1,.18,1.05,5.7);
        for(const x of [3.2,4.2])local(dark,x,4.9,1,.08,.9,.08);
        local(dark,3.7,6.5,1,2,2.8,.28);local(dark,3.7,7.25,1,3.4,.85,.28);local(trim,3.7,7.6,1.16,.58,.2,.035);
        // Static stylized mannequins: no avatar animation or multiplayer traffic.
        for(const x of [-4.6,4.6]){local(trim,x,.04,4.9,1.2,.08,1);local(accent,x,1.25,4.9,.65,.85,.35);local(trim,x,1.95,4.9,.45,.5,.42,leafGeo);for(const side of [-1,1]){local(dark,x+side*.19,.53,4.9,.16,1,.18);local(trim,x+side*.47,1.23,4.9,.17,.8,.18);}local(dark,x,1.75,4.9,.13,.15,.16);}
        for(const x of [-5.9,5.9]){local(dark,x,1.8,0,.08,.08,6);for(const z of [-2.7,2.7])local(dark,x,.9,z,.08,1.8,.08);for(let i=0;i<10;i++){const z=-2.4+i*.53,tint=i%3===0?accent:i%3===1?white:dark;local(tint,x,1.28,z,.48,.68,.13);local(tint,x,1.53,z,.74,.18,.13);}}
        for(const x of [-2.7,2.7]){local(wood,x,.45,-.7,2.2,.9,2.6);local(trim,x,.92,-.7,2.3,.08,2.7);for(let i=0;i<3;i++)for(let k=0;k<3;k++)local(i%2?accent:white,x+(i-1)*.66,1.02+k*.065,-.7,.50,.055,.65);}
        local(wood,4.6,.54,-4.7,3.2,1.08,1.3);local(dark,4.6,1.2,-4.7,.6,.35,.4);local(trim,-4,1.35,-6.13,2.3,2.4,.06);local(glass,-4,1.35,-6.08,2,2.1,.04);
        for(const x of [-4,0,4])local(lamp,x,4.1,0,1.8,.07,.5);
        for(const [text,x,y,z,width,height] of [['LOWKEY · BOUTIQUE',0,3.79,6.62,6.8,.44],['PROVADOR',-4,2.9,-6.02,2,.35]]){const p=layout.storePoint(b,x,z);districtSign(text,p.x,y,p.z,width,height,b.rotation);}
        continue;
      }
      if(b.kind==='garage'){
        // Dealership keeps the original two driveable bays and a wide, open entrance.
        const glazing=showroomGlass,red=material(0xc64a39);
        local(dark,0,h/2,-d/2+.15,w,h,.30);
        for(let x=-7;x<7;x+=1.4)local(trim,x,.012,0,.018,.012,12.5);
        for(let z=-6;z<6;z+=1.4)local(trim,0,.013,z,14.6,.012,.018);
        for(const x of [-5,0,5]){local(dark,x,4.13,0,.12,.08,10);for(const z of [-4,0,4])local(lamp,x,4.07,z,1.5,.045,.24);}
        local(white,0,-.04,0,w,.08,d);local(asphalt,0,-.05,8,12.8,.1,3);
        for(const side of [-1,1]){
          local(dark,side*(w/2-.15),.35,0,.30,.7,d);
          for(const z of [-4.3,0,4.3]){local(glazing,side*(w/2-.15),2.1,z,.12,2.8,4.1);local(trim,side*(w/2-.1),2.1,z-2.1,.20,2.8,.12);}
          // Narrow end vitrines never cut across the car/motorcycle exit paths.
          local(glazing,side*6.1,2.1,6.35,2.5,2.8,.12);
          local(dark,side*6.1,.35,6.35,2.5,.7,.3);
          local(trim,side*4.8,1.9,6.35,.12,3.6,.2);
          local(dark,side*(w/2-.15),4.08,0,.3,.74,d);
          local(neonBlue,side*(w/2+.03),4.35,0,.08,.075,d);
          local(red,side*(w/2+.03),3.71,0,.08,.075,d);
        }
        local(dark,0,4.08,6.35,w,.74,.30);local(roofFlat,0,h+.1,0,w+.4,.2,d+.4);
        // Stepped L-shaped parapet, metal ribs and red/blue luminous fascia.
        local(dark,-2,4.93,5.5,w-4,1.05,1.8);local(dark,6,4.93,1.6,3,1.05,9.6);
        local(trim,-2,5.5,5.5,w-3.8,.12,2);local(trim,6,5.5,1.6,3.2,.12,9.8);
        for(let x=-7.2;x<=3.3;x+=.32)local(trim,x,4.98,6.42,.035,.88,.055);
        local(neonBlue,0,4.42,6.55,w+.2,.07,.09);local(red,0,3.71,6.55,w+.2,.09,.09);
        local(trim,0,3.62,6.7,w+.4,.12,.8);
        for(const x of [-3,3]){for(const side of [-1,1])local(dark,x+side*1.3,.005,0,.07,.008,5);local(dark,x,.005,-2.5,2.65,.008,.07);local(lamp,x,4.12,0,2,.07,.45);}
        // Original low-poly sports silhouettes on display: no network entities or AI.
        for(const display of layout.dealershipDisplays){const x=display.localX,z=display.localZ,paint=material(display.color);
          local(dark,x,.06,z,4.1,.12,2.05);local(paint,x,.55,z,3.45,.4,1.6);
          local(dark,x-.15,.91,z,1.65,.38,1.35);local(paint,x-.2,1.14,z,1.35,.08,1.36);
          local(paint,x-1.45,.92,z, .12,.1,1.9);for(const dz of [-.65,.65])local(trim,x+1.73,.6,z+dz,.04,.12,.32);
          for(const dx of [-1.05,1.05])for(const dz of [-.82,.82]){local(dark,x+dx,.35,z+dz,.65,.65,.2);local(trim,x+dx,.35,z+dz*1.04,.32,.32,.08,leafGeo);}
        }
        local(wood,0,.6,-5.6,2.2,1.2,.7);local(dark,0,1.24,-5.6,2.3,.08,.8);local(dark,.5,1.46,-5.6,.5,.35,.08);
        for(const side of [-1,1]){local(wood,side*6.2,.2,7.8,1.1,.4,1);local(leaf,side*6.2,.65,7.8,.9,.65,.9,leafGeo);}
        for(const [text,x,y,z,width,height] of [['LOWKEY MOTORS',-1.5,4.94,6.72,9.7,.7],['SPORT · SHOWROOM',0,4.04,6.56,8.7,.4],['EXPOSIÇÃO',0,2.8,-6.17,3.4,.45]]){const p=layout.garagePoint(x,z);districtSign(text,p.x,y+.12,p.z,width,height,b.rotation);}
        continue;
      }
      if(b.kind==='airport-tower'){
        local(wall,0,4,0,2.4,8,2.4);local(dark,0,8,0,w,.3,d);local(glass,0,9.35,0,w,2.4,d);local(trim,0,10.8,0,w,.4,d);
        for(const side of [-1,1]){local(trim,side*2.25,9.35,0,.15,2.4,d);local(trim,0,9.35,side*2.25,w,2.4,.15);}continue;
      }
      if(b.kind==='hangar'){local(wall,0,h/2,0,w,h,d);local(roofFlat,0,h+.12,0,w+.7,.24,d+.7);local(dark,0,h*.43,d/2+.05,w*.77,h*.78,.12);for(let y=.6;y<h*.85;y+=.6)local(trim,0,y,d/2+.13,w*.77,.06,.08);districtSign('HANGAR · LOWKEY',b.x,7,b.z+d/2+.15,18,.85);continue;}
      if(b.kind==='mansion'){
        local(wall,0,1.65,0,w,3.3,d);local(trim,0,3.38,0,w+.5,.22,d+.5);
        const upperWidth=w*(b.style==='mediterranean'?.70:b.style==='modern'?.64:.54),upperX=b.style==='mediterranean'?0:b.style==='modern'?w*.15:-w*.21,upperDepth=d*.68,upperZ=-d*.14;
        local(wall,upperX,(3.5+h)/2,upperZ,upperWidth,h-3.5,upperDepth);local(trim,upperX,h+.14,upperZ,upperWidth+.6,.28,upperDepth+.6);
        for(const side of [-1,1]){local(glass,side*w*.29,1.7,d/2+.06,w*.32,2.4,.10);for(const x of [-.23,.23])local(glass,upperX+upperWidth*x,5.15,upperZ+side*upperDepth/2+side*.06,upperWidth*.37,2.4,.09);local(glass,side*(w/2+.045),1.7,0,.08,2.2,d*.62);}
        local(wood,0,1.45,d/2+.13,2.1,2.9,.1);for(const x of [-1.25,1.25])local(lamp,x,2,d/2+.2,.13,1.1,.10);
        local(glass,upperX,3.98,d/2-.4,upperWidth,1.05,.09);local(dark,upperX,4.55,d/2-.4,upperWidth,.06,.09);
        for(const x of [-w*.44,w*.44])local(accent,x,1.7,d/2+.15,.45,3.4,.55);
        if(b.style==='mediterranean'){local(material(0xc64a39),upperX,h+.28,upperZ,upperWidth+1,1.8,upperDepth+1,roofGeo);for(const x of [-w*.32,0,w*.32])local(trim,x,1.55,d/2+.4,.38,3.1,.38);local(trim,0,3.15,d/2+.4,w*.78,.32,1.2);}
        else if(b.style==='modern'){for(let x=-w*.46;x<-w*.10;x+=.65)local(wood,x,2,d/2+.18,.12,3.2,.12);local(dark,-w*.3,3.65,0,w*.35,.3,d*.93);local(neonBlue,upperX,h+.31,upperZ+upperDepth/2,upperWidth,.07,.08);}
        else{local(accent,w*.32,4.4,-d*.17,w*.30,2,d*.7);local(trim,w*.32,5.52,-d*.17,w*.32,.22,d*.74);for(const x of [w*.2,w*.4])local(glass,x,4.3,d*.18,w*.15,1.5,.09);for(let x=-w*.45;x<w*.08;x+=.8)local(wood,x,h+.48,upperZ,.15,.22,upperDepth+.5);}
        districtSign(b.estateName,b.x,2.75,b.z+d/2+.24,w*.75,.55);continue;
      }
      if(b.kind==='airport-terminal'){
        local(wall,0,h/2,0,w,h,d);local(dark,0,h+.15,0,w+1,.3,d+1);local(glass,0,3.3,d/2+.07,w-2,4.8,.10);for(let x=-w/2+2;x<w/2;x+=4)local(trim,x,3.3,d/2+.15,.18,4.9,.14);local(wood,0,1.45,d/2+.22,3,2.9,.12);local(neonBlue,0,h+.33,d/2+.3,w,.10,.12);local(trim,0,h+.65,-1,w*.42,1,4);districtSign('LOWKEY INTERNATIONAL',b.x,6.15,b.z+d/2+.25,w*.8,.8);continue;
      }
      if(b.kind==='favela'){
        local(wall,0,h/2,0,w,h,d);if(b.roofStyle==='slanted')local(material(b.roof),0,h,0,w+.2,.65,d+.2,roofGeo);else local(roofFlat,0,h+.1,0,w+.2,.2,d+.2);
        for(const x of [-w*.28,w*.28])for(let y=1.9;y<h-.4;y+=2.7){local(dark,x,y,d/2+.04,1.1,1.3,.08);local(trim,x,y+.7,d/2+.08,1.3,.14,.15);}
        local(wood,0,1.2,d/2+.08,1.5,2.4,.12);local(glass,w/2+.04,1.9,0,.08,1.3,2);local(dark,-2,h+.45,-2,1.2,.7,1.2);continue;
      }
      if(b.kind==='barn'){
        for(const side of [-1,1]){local(wall,side*w/2,h/2,0,.3,h,d);local(wall,side*(w/4+1),h/2,d/2,w/2-2,h,.3);}local(wall,0,h/2,-d/2,w,h,.3);local(pavement,0,.04,0,w,.08,d);local(material(b.roof),0,h,0,w+.8,2.2,d+.8,roofGeo);
        for(const side of [-1,1])local(trim,side*2,2,d/2+.12,.2,4,.1);local(trim,0,4.1,d/2+.12,4.2,.2,.1);
        // Fictional contraband scenery only, never a real production simulation.
        for(const x of [-w*.32,w*.32])for(let z=-d/2+2;z<d/2-2;z+=2.4){local(wood,x,.3,z,1.1,.6,1.1);local(leaf,x,1.1,z,.18,1.2,.18);for(const side of [-1,1])local(leafLight,x+side*.35,1.4,z,.65,.12,.35,leafGeo);local(lamp,x,h-.4,z,1,.06,.7);}local(wood,0,.5,-d/2+1.5,3,1,.9);for(const x of [-.8,0,.8])local(white,x,1.1,-d/2+1.5,.55,.18,.4);districtSign('PAVILHÃO · MERCADORIA',b.x,3.8,b.z+d/2+.18,Math.min(w-1,14),.65);continue;
      }
      if(b.kind==='house'&&b.district==='rural'){
        local(wall,0,h/2,0,w,h,d);local(trim,0,.06,0,w+.12,.12,d+.12);
        if(b.roofStyle==='slanted')local(material(b.roof),0,h,0,w+.6,1.2,d+.6,roofGeo);else{local(roofFlat,0,h+.1,0,w+.5,.2,d+.5);for(let x=-w/2;x<=w/2;x+=1.1)local(dark,x,h+.22,0,.05,.06,d+.3);}
        for(const x of [-w*.28,w*.28]){local(dark,x,1.75,d/2+.04,1.8,1.6,.08);local(trim,x,1.75,d/2+.1,1.6,1.35,.06);local(glass,x,1.75,d/2+.14,1.4,1.15,.06);}
        local(wood,0,1.25,d/2+.1,1.6,2.5,.12);local(wood,0,-.08,d/2+1,w*.8,.16,2.2);local(roofFlat,0,2.89,d/2+1,w*.84,.18,2.4);
        for(const x of [-w*.35,w*.35])local(wood,x,1.4,d/2+1.8,.18,2.8,.18);local(wood,-w*.24,.35,d/2+1,w*.23,.7,.6);local(dark,-w*.24,.73,d/2+1,w*.23,.06,.6);
        for(const side of [-1,1])local(glass,side*(w/2+.04),1.8,-1,.08,1.2,2);continue;
      }
      if(b.kind==='shop'&&b.shopName==='CAFÉ LOWKEY'){
        const red=material(0xc64a39);local(white,0,h/2,0,w,h,d);local(white,0,h+.08,0,w+.4,.16,d+.4);
        for(const side of [-1,1]){local(red,0,h+.28,side*(d/2+.13),w+.6,.45,.3);local(red,side*(w/2+.13),h+.28,0,.3,.45,d+.6);}
        local(dark,0,1.45,d/2+.08,2,2.9,.12);local(glass,0,1.5,d/2+.16,1.6,2.6,.05);local(trim,.65,1.35,d/2+.21,.07,.5,.06);
        for(const x of [-4.6,4.6]){local(dark,x,1.9,d/2+.07,4.1,2.5,.1);local(glass,x,1.9,d/2+.14,3.85,2.3,.06);for(let i=0;i<12;i++){local(i%2?white:red,x-2.1+(i+.5)*4.2/12,3.32,d/2+.72,4.2/12,.12,1.4);local(i%2?white:red,x-2.1+(i+.5)*4.2/12,3.16,d/2+1.37,4.2/12,.32,.06);}}
        for(const side of [-1,1])for(const z of [-3,1.3]){local(dark,side*(w/2+.06),1.9,z,.08,2.4,3);local(glass,side*(w/2+.12),1.9,z,.05,2.15,2.75);}
        for(const x of [-5.9,5.9]){local(wood,x,.22,d/2+.6,.7,.44,.7);local(leafLight,x,.65,d/2+.6,.7,.75,.7,leafGeo);}
        local(pavement,-2,h+.4,-2,2.1,.6,1.7);local(dark,-2,h+.73,-2,1.7,.06,1.3);
        // Giant burger icon made from cheap shared primitives.
        local(wood,0,h+1.25,1,2.3,.28,.8,leafGeo);local(leaf,0,h+.97,1,2.4,.14,.84);local(red,0,h+.87,1,2.2,.12,.84);local(dark,0,h+.70,1,2.25,.22,.8);local(wood,0,h+.48,1,2.3,.17,.8,leafGeo);
        for(const side of [-1,1]){for(let y=.4;y<2.9;y+=.22)local(wood,side*(w/2+.17),y,-3,.025,.07,2.8);local(trim,side*4.6,.65,d/2+.21,4.1,.045,.08);local(trim,side*4.6,1.88,d/2+.21,.06,2.35,.08);}
        const p=layout.storePoint(b,0,d/2+.32);districtSign('LOWKEY · COFFEE & BURGERS',p.x,3.98,p.z,w-1,.58,b.rotation);
        const menu=layout.storePoint(b,2,d/2+.42);districtSign('CAFÉ · LANCHES',menu.x,1.7,menu.z,1.25,.9,b.rotation);
        continue;
      }
      local(wall,0,h/2,0,w,h,d);local(trim,0,.16,0,w+.18,.32,d+.18);
      if(b.kind==='tower'){
        for(let floor=0;floor<b.floors;floor++){
          const y=1.8+floor*3.1;
          for(const side of [-1,1]){
            for(let i=-2;i<=2;i++)local(glass,i*w/5.4,y,side*(d/2+.035),w/6.5,1.85,.08);
            for(let i=-2;i<=2;i++)local(glass,side*(w/2+.035),y,i*d/5.4,.08,1.85,d/6.5);
            local(trim,0,y-1.05,side*(d/2+.11),w+.15,.14,.27);
            local(trim,side*(w/2+.11),y-1.05,0,.27,.14,d+.15);
          }
        }
        for(const side of [-1,1]){local(trim,side*(w/2-.12),h/2,d/2+.1,.35,h,.3);local(trim,side*(w/2-.12),h/2,-d/2-.1,.35,h,.3);}
        local(roofFlat,0,h+.1,0,w,.2,d);
        for(const side of [-1,1]){local(trim,side*(w/2-.13),h+.38,0,.26,.55,d);local(trim,0,h+.38,side*(d/2-.13),w,.55,.26);}
        if(!b.rooftopHelipad){local(pavement,-2,h+.55,-1,2.2,.75,1.8);local(dark,-2,h+.95,-1,1.65,.06,1.3);}
        local(glass,0,1.15,d/2+.08,2.4,2.2,.14);local(dark,0,1.15,d/2+.17,.09,2.2,.03);
        local(accent,0,2.7,d/2+.75,3.4,.18,1.7);
      }else if(b.kind==='shop'){
        local(glass,-3,1.9,d/2+.07,5.4,2.6,.14);local(glass,3.3,1.9,d/2+.07,4.3,2.6,.14);
        local(trim,-.25,1.6,d/2+.16,.24,3.0,.14);local(trim,5.6,1.6,d/2+.16,.24,3.0,.14);
        for(let i=0;i<14;i++){const x=-w/2+(i+.5)*w/14;local(i%2?white:accent,x,3.35,d/2+.8,w/14,.16,1.8);local(i%2?white:accent,x,3.1,d/2+1.6,w/14,.42,.13);}
        local(roofFlat,0,h+.1,0,w+.4,.2,d+.4);
        for(const side of [-1,1]){local(accent,side*(w/2+.13),h+.36,0,.26,.55,d+.4);local(accent,0,h+.36,side*(d/2+.13),w+.4,.55,.26);}
        if(signMaterial){if(b.district)districtSign(b.shopName,b.x+(d/2+.10)*s,Math.min(4.02,h-.35),b.z+(d/2+.10)*c,Math.min(w*.8,24),.85,b.rotation);else{const sign=new THREE.Mesh(new THREE.PlaneGeometry(6.8,.85),signMaterial([b.shopName,'PRAÇA CENTRAL'],'#24383b','#f4f6da'));sign.position.set(b.x+(d/2+.10)*s,4.02,b.z+(d/2+.10)*c);sign.rotation.y=b.rotation;group.add(sign);}}
        for(const side of [-1,1])local(glass,side*(w/2+.04),2,0,.08,2.2,6);
        local(pavement,2,h+.5,-1,2.3,.8,1.6);
      }else{
        local(material(b.roof),0,h,0,w+1.2,2.2,d+1.2,roofGeo);
        local(trim,0,h-.08,0,w+.8,.2,d+.8);
        for(const side of [-1,1]){local(glass,side*3.1,1.95,d/2+.035,1.8,1.65,.08);local(accent,side*4.25,1.95,d/2+.12,.28,1.85,.13);local(accent,side*1.95,1.95,d/2+.12,.28,1.85,.13);local(glass,side*(w/2+.04),1.95,1,.08,1.65,2);}
        local(wood,0,1.3,d/2+.06,1.7,2.6,.15);local(trim,0,2.9,d/2+.78,3.3,.17,1.8);
        local(pavement,0,.04,d/2+1.2,3.6,.08,2.4);
        local(wall,w/2-1,h+.45,-d/3,.65,2,.65);
        for(const side of [-1,1])local(leafLight,side*(w/2+1.5),.65,0,1.1,1.4,d*.76,leafGeo);
      }
    }
    for(const t of layout.trees){const size=t.size;
      part(bark,t.x,.12+1.55*size,t.z,.34*size,3.1*size,.34*size);
      for(const [dx,dy,dz,r] of [[0,3.8,0,1.5],[-.7,3.35,.15,1.1],[.7,3.4,-.2,1.15],[.15,4.5,.1,.94]])part(dy>4?leafLight:leaf,t.x+dx*size,.12+dy*size,t.z+dz*size,r*size,r*size,r*size,0,leafGeo);
      part(pavement,t.x,.20,t.z,1.25,.16,1.25,0,boxGeo,false);
    }
    for(const l of layout.lamps){part(dark,l.x,2.37,l.z,.12,4.5,.12);part(dark,l.x+.45,4.63,l.z,1.1,.12,.13);part(dark,l.x+.83,4.56,l.z,.55,.16,.4);part(lamp,l.x+.83,4.46,l.z,.42,.06,.31,0,boxGeo,false);}
    const adverts=[];if(typeof document!=='undefined')for(const [i,b]of layout.buildings.filter(b=>!b.district&&b.kind==='tower').filter((b,i)=>i%3===0).slice(0,12).entries()){const panel=districtSign('LOWKEY',...(()=>{const p=layout.storePoint(b,0,b.depth/2+.16);return[p.x,Math.min(b.height-3,14+i%3*5),p.z];})(),b.width*.9,4,b.rotation),canvas=panel.material.map.image;adverts.push({panel,canvas,index:i,next:-Infinity});}
    // Static instance batches keep the expanded city inexpensive to draw.
    const dummy=new THREE.Object3D();let instanceCount=0;
    for(const batch of batches.values()){
      const mesh=new THREE.InstancedMesh(batch.geo,batch.mat,batch.items.length);mesh.castShadow=batch.cast;mesh.receiveShadow=true;mesh.name='City batch';
      batch.items.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);if(typeof p.rotation==='number')dummy.rotation.set(0,p.rotation,0);else dummy.quaternion.copy(p.rotation);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);instanceCount+=batch.items.length;
    }
    // Only nearby street lamps need actual point lights, not every pole in town.
    const lights=Array.from({length:6},()=>{const light=new THREE.PointLight(0xffd494,0,20,2);group.add(light);return light;});let lastSelection=-Infinity,selected=[];
    function setPerformerFactory(factory){for(const d of dancers){const rig=factory(d.index),root=rig.group;root.position.copy(d.root.position);root.rotation.copy(d.root.rotation);Object.assign(root.userData,d.root.userData,{avatarStyle:'shared-player-rig'});group.remove(d.root);group.add(root);d.root=root;d.rig=rig;}}
    function update(night,position,now){
      for(const ad of adverts)if(now>=ad.next&&Math.hypot(position.x-ad.panel.position.x,position.z-ad.panel.position.z)<170){ad.next=now+3000;const ctx=ad.canvas.getContext('2d'),phase=Math.floor(now/3000)+ad.index,brands=['LOWKEY LIVE','VELVET · NIGHT','KEYLOW RACING','LOWKEY BEACH'];ctx.fillStyle=phase%2?'#18132e':'#092a34';ctx.fillRect(0,0,ad.canvas.width,ad.canvas.height);ctx.fillStyle=phase%2?'#ff61d2':'#57e8ff';ctx.font=`900 ${Math.round(ad.canvas.height*.44)}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(brands[phase%brands.length],ad.canvas.width/2,ad.canvas.height*.44,ad.canvas.width*.94);ctx.fillStyle='#e4ff63';ctx.fillRect(ad.canvas.width*.04,ad.canvas.height*.8,ad.canvas.width*(.25+phase%3*.2),ad.canvas.height*.07);ad.panel.material.map.needsUpdate=true;}
      const clubNear=Math.hypot(position.x-layout.nightclub.x,position.z-layout.nightclub.z)<35;
      clubLights.forEach(l=>l.intensity=clubNear?8:0);for(const d of dancers){d.root.visible=clubNear;if(clubNear){d.root.rotation.z=Math.sin(now*.0018+d.index)*.05;d.root.position.y=d.baseY+Math.sin(now*.003+d.index)*.02;if(d.rig)for(const arm of d.rig.arms)arm.rotation.z=arm.userData.side*(.1+Math.sin(now*.0018+d.index)*.045);}}
      glass.emissiveIntensity=.04+night*.72;lamp.emissiveIntensity=.04+night*2;
      if(night<.02){for(const light of lights)light.intensity=0;lastSelection=-Infinity;return;}
      if(now-lastSelection>300){lastSelection=now;selected=layout.lamps.map(l=>({...l,distance:Math.hypot(l.x-position.x,l.z-position.z)})).filter(l=>l.distance<26).sort((a,b)=>a.distance-b.distance).slice(0,lights.length);}
      lights.forEach((light,i)=>{const p=selected[i];light.intensity=p?night*14:0;if(p)light.position.set(p.x+.83,4.38,p.z);});
    }
    return{group,update,lights,clubLights,dancers,setPerformerFactory,islandSectors,monument,instanceCount,batchCount:batches.size,adverts};
  }
  globalThis.LowkeyCity={create};
})();
