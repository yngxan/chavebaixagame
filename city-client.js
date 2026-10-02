(() => {
  function create({THREE,scene,signMaterial}){
    const layout=LowkeyCityLayout,group=new THREE.Group();group.name='LowKey City';scene.add(group);
    const materials=new Map(),batches=new Map(),boxGeo=new THREE.BoxGeometry(1,1,1),leafGeo=new THREE.IcosahedronGeometry(1,1);
    const roofGeo=new THREE.BufferGeometry(),v=[[-.5,0,-.5],[.5,0,-.5],[0,1,-.5],[-.5,0,.5],[.5,0,.5],[0,1,.5]],faces=[[0,2,1],[3,4,5],[0,3,5],[0,5,2],[2,5,4],[2,4,1],[0,1,4],[0,4,3]];
    roofGeo.setAttribute('position',new THREE.Float32BufferAttribute(faces.flatMap(f=>f.flatMap(i=>v[i])),3));roofGeo.computeVertexNormals();
    function material(color){if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.84,flatShading:true}));return materials.get(color);}
    const white=material(0xf3eee1),asphalt=material(0x424d54),pavement=material(0xbfc8c4),trim=material(0xfaf9ec),dark=material(0x304454),wood=material(0x795641),glass=material(0x63c8db),roofFlat=material(0x879687),leaf=material(0x6cbb36),leafLight=material(0x99ce48),bark=material(0x866145),lamp=material(0xffe3a2);
    glass.emissive.set(0x9fc8df);lamp.emissive.set(0xffc775);
    function part(mat,x,y,z,sx,sy,sz,rotation=0,geo=boxGeo,cast=true){
      const key=`${mat.uuid}:${geo.uuid}:${cast}`,batch=batches.get(key)||{mat,geo,cast,items:[]};
      batch.items.push({x,y,z,sx,sy,sz,rotation});batches.set(key,batch);
    }
    for(const s of layout.surfaces)part(s.kind==='road'?asphalt:pavement,s.x,s.y-.075,s.z,s.hx*2,.15,s.hz*2,0,boxGeo,false);
    for(const s of layout.entrances.filter(s=>s.kind!=='boutique'&&!s.kind?.startsWith('garage')))part(material(0xc5b785),s.x,s.y-.05,s.z,s.hx*2,.1,s.hz*2,s.rot||0,boxGeo,false);
    // Lane markings stop at intersections; zebra crossings sit beside, not over, them.
    const onOtherRoad=(x,z,r,pad=0)=>layout.roads.some(o=>o!==r&&layout.inRect(x,z,o,pad));
    for(const r of layout.roads){const vertical=r.axis==='z',half=vertical?r.hz:r.hx;
      for(let a=-half+3;a<half-2;a+=5){const x=r.x+(vertical?0:a),z=r.z+(vertical?a:0);if(onOtherRoad(x,z,r,2.3))continue;part(white,x,-.019,z,vertical?.14:2.6,.012,vertical?2.6:.14,0,boxGeo,false);}
      for(const edge of [-1,1])for(let a=-half+2;a<half-1;a+=3){const x=r.x+(vertical?edge*4.16:a),z=r.z+(vertical?a:edge*4.16);if(onOtherRoad(x,z,r,1.6))continue;part(white,x,-.019,z,vertical?.1:2.9,.012,vertical?2.9:.1,0,boxGeo,false);}
    }
    const intersections=[];
    for(const a of layout.roads.filter(r=>r.axis==='z'))for(const b of layout.roads.filter(r=>r.axis==='x'))if(layout.inRect(a.x,b.z,a)&&layout.inRect(a.x,b.z,b))intersections.push({x:a.x,z:b.z});
    for(const p of intersections)for(const side of [-1,1])for(let i=-3;i<=3;i++){
      part(white,p.x+i*1.05,-.018,p.z+side*6.15,.57,.014,2.05,0,boxGeo,false);
      part(white,p.x+side*6.15,-.018,p.z+i*1.05,2.05,.014,.57,0,boxGeo,false);
    }
    // Crosswalks from each park entrance, preserving the original plaza geometry.
    for(let i=-3;i<=3;i++)for(const side of [-1,1]){
      part(white,side*32,-.018,4+i*.65,8,.014,.35,0,boxGeo,false);
      part(white,i*.8,-.018,side*36,.42,.014,8,0,boxGeo,false);
    }
    for(const b of layout.buildings){
      const c=Math.cos(b.rotation),s=Math.sin(b.rotation),wall=material(b.color),accent=material(b.accent);
      const local=(mat,x,y,z,sx,sy,sz,geo=boxGeo)=>part(mat,b.x+x*c+z*s,.12+y,b.z-x*s+z*c,sx,sy,sz,b.rotation,geo);
      const w=b.width,d=b.depth,h=b.height;
      if(b.kind==='boutique'){
        local(wall,-7.35,h/2,0,.3,h,d);local(wall,7.35,h/2,0,.3,h,d);local(wood,0,h/2,-6.35,w,h,.3);local(roofFlat,0,h+.1,0,w+.4,.2,d+.4);
        local(wood,0,-.04,0,w,.08,d);
        for(const x of [-4.4,4.4]){local(glass,x,1.7,6.35,6.2,3.2,.10);local(trim,x,.22,6.35,6.2,.44,.3);}
        local(accent,0,3.84,6.35,w,1.1,.3);for(const x of [-1.3,1.3])local(trim,x,1.6,6.35,.10,3.2,.20);
        for(const x of [-5.9,5.9]){local(dark,x,1.8,0,.08,.08,6);for(const z of [-2.7,2.7])local(dark,x,.9,z,.08,1.8,.08);for(let i=0;i<10;i++){const z=-2.4+i*.53,tint=i%3===0?accent:i%3===1?white:dark;local(tint,x,1.28,z,.48,.68,.13);local(tint,x,1.53,z,.74,.18,.13);}}
        for(const x of [-2.7,2.7]){local(wood,x,.45,-.7,2.2,.9,2.6);local(trim,x,.92,-.7,2.3,.08,2.7);for(let i=0;i<3;i++)for(let k=0;k<3;k++)local(i%2?accent:white,x+(i-1)*.66,1.02+k*.065,-.7,.50,.055,.65);}
        local(wood,4.6,.54,-4.7,3.2,1.08,1.3);local(dark,4.6,1.2,-4.7,.6,.35,.4);local(trim,-4,1.35,-6.13,2.3,2.4,.06);local(glass,-4,1.35,-6.08,2,2.1,.04);
        for(const x of [-4,0,4])local(lamp,x,4.1,0,1.8,.07,.5);
        if(signMaterial){for(const [text,x,y,z,width,height] of [['BOUTIQUE',0,3.97,6.53,6.8,.7],['PROVADOR',-4,2.9,-6.02,2,.35]]){const p=layout.storePoint(b,x,z);const sign=new THREE.Mesh(new THREE.PlaneGeometry(width,height),signMaterial([text],'#24383b','#f4f6da'));sign.position.set(p.x,y,p.z);sign.rotation.y=b.rotation;group.add(sign);}}
        continue;
      }
      if(b.kind==='garage'){
        local(wall,-w/2+.15,h/2,0,.30,h,d);local(wall,w/2-.15,h/2,0,.30,h,d);local(wall,0,h/2,-d/2+.15,w,h,.30);
        local(wall,0,4.08,d/2-.15,w,.74,.30);local(roofFlat,0,h+.1,0,w+.4,.2,d+.4);
        local(material(0x879da2),0,-.04,0,w,.08,d);local(trim,0,-.05,8,12.8,.1,3);
        for(const x of [-3,3]){for(const side of [-1,1])local(white,x+side*1.3,.005,0,.07,.008,5);local(white,x,.005,-2.5,2.65,.008,.07);local(lamp,x,3.95,0,2,.07,.45);}
        for(let i=0;i<14;i++){const x=-w/2+(i+.5)*w/14;local(i%2?white:accent,x,3.68,d/2+.8,w/14,.16,1.8);}
        if(signMaterial){const sign=new THREE.Mesh(new THREE.PlaneGeometry(6.8,.55),signMaterial(['GARAGEM','CARRO E MOTO · GRÁTIS'],'#24383b','#f4f6da'));sign.position.set(b.x+(d/2+.18)*s,4.30,b.z+(d/2+.18)*c);sign.rotation.y=b.rotation;group.add(sign);}
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
        local(pavement,-2,h+.55,-1,2.2,.75,1.8);local(dark,-2,h+.95,-1,1.65,.06,1.3);
        local(glass,0,1.15,d/2+.08,2.4,2.2,.14);local(dark,0,1.15,d/2+.17,.09,2.2,.03);
        local(accent,0,2.7,d/2+.75,3.4,.18,1.7);
      }else if(b.kind==='shop'){
        local(glass,-3,1.9,d/2+.07,5.4,2.6,.14);local(glass,3.3,1.9,d/2+.07,4.3,2.6,.14);
        local(trim,-.25,1.6,d/2+.16,.24,3.0,.14);local(trim,5.6,1.6,d/2+.16,.24,3.0,.14);
        for(let i=0;i<14;i++){const x=-w/2+(i+.5)*w/14;local(i%2?white:accent,x,3.35,d/2+.8,w/14,.16,1.8);local(i%2?white:accent,x,3.1,d/2+1.6,w/14,.42,.13);}
        local(roofFlat,0,h+.1,0,w+.4,.2,d+.4);
        for(const side of [-1,1]){local(accent,side*(w/2+.13),h+.36,0,.26,.55,d+.4);local(accent,0,h+.36,side*(d/2+.13),w+.4,.55,.26);}
        if(signMaterial){const sign=new THREE.Mesh(new THREE.PlaneGeometry(6.8,.85),signMaterial([b.shopName,'PRAÇA CENTRAL'],'#24383b','#f4f6da'));sign.position.set(b.x+(d/2+.10)*s,4.02,b.z+(d/2+.10)*c);sign.rotation.y=b.rotation;group.add(sign);}
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
    // Static instance batches keep the expanded city inexpensive to draw.
    const dummy=new THREE.Object3D();let instanceCount=0;
    for(const batch of batches.values()){
      const mesh=new THREE.InstancedMesh(batch.geo,batch.mat,batch.items.length);mesh.castShadow=batch.cast;mesh.receiveShadow=true;mesh.name='City batch';
      batch.items.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.rotation,0);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);instanceCount+=batch.items.length;
    }
    // Only nearby street lamps need actual point lights, not every pole in town.
    const lights=Array.from({length:6},()=>{const light=new THREE.PointLight(0xffd494,0,20,2);group.add(light);return light;});let lastSelection=-Infinity,selected=[];
    function update(night,position,now){
      glass.emissiveIntensity=.04+night*.72;lamp.emissiveIntensity=.04+night*2;
      if(night<.02){for(const light of lights)light.intensity=0;lastSelection=-Infinity;return;}
      if(now-lastSelection>300){lastSelection=now;selected=layout.lamps.map(l=>({...l,distance:Math.hypot(l.x-position.x,l.z-position.z)})).filter(l=>l.distance<26).sort((a,b)=>a.distance-b.distance).slice(0,lights.length);}
      lights.forEach((light,i)=>{const p=selected[i];light.intensity=p?night*14:0;if(p)light.position.set(p.x+.83,4.38,p.z);});
    }
    return{group,update,lights,instanceCount,batchCount:batches.size};
  }
  globalThis.LowkeyCity={create};
})();
