(() => {
  function create({THREE,scene,signMaterial}){
    const layout=LowkeyCityLayout,f=layout.festival,screen=layout.festivalScreen,group=new THREE.Group();group.name='LowKey Main Stage';group.position.set(f.x,0,f.z);scene.add(group);
    const box=new THREE.BoxGeometry(1,1,1),disc=new THREE.CircleGeometry(1,12),materials=new Map(),batches=new Map(),dummy=new THREE.Object3D();
    const mat=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.8,flatShading:true}));return materials.get(color);};
    const dark=mat(0x10131c),steel=mat(0x74838e),floor=mat(0x343944),roof=mat(0xbbb6a8),cyan=mat(0x39b7ff),violet=mat(0xa45bff);steel.metalness=.6;
    for(const [m,color]of [[cyan,0x299aff],[violet,0x8647ff]]){m.emissive.set(color);m.emissiveIntensity=1.8;}
    function part(material,x,y,z,sx,sy,sz,geo=box,rotation=0){dummy.position.set(x,y,z);dummy.rotation.set(0,0,rotation);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();const key=material.uuid+geo.uuid,list=batches.get(key)||{material,geo,matrices:[]};list.matrices.push(dummy.matrix.clone());batches.set(key,list);}
    function beam(a,b,size=.13,material=steel){const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),d=q.clone().sub(p);dummy.position.copy(p).add(q).multiplyScalar(.5);dummy.scale.set(size,d.length(),size);dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());dummy.updateMatrix();const key=material.uuid+box.uuid,list=batches.get(key)||{material,geo:box,matrices:[]};list.matrices.push(dummy.matrix.clone());batches.set(key,list);}
    function truss(a,b,width=.8){for(const side of [-1,1])beam([a[0]+side*width/2,a[1],a[2]],[b[0]+side*width/2,b[1],b[2]],.16);const d=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),count=Math.ceil(d.length()/2);for(let i=0;i<count;i++){const p=new THREE.Vector3(...a).addScaledVector(d,i/count),q=new THREE.Vector3(...a).addScaledVector(d,(i+1)/count);beam([p.x-width/2,p.y,p.z],[q.x+width/2,q.y,q.z],.09);beam([p.x+width/2,p.y,p.z],[q.x-width/2,q.y,q.z],.09);}}
    // One coherent main stage: wide portal and integrated LED wings, no upper billboard.
    for(const p of layout.festivalPlatforms){part(p.kind==='festival-step'?floor:dark,p.x,p.y/2,p.z-f.z,p.hx*2,p.y,p.hz*2);if(p.kind!=='festival-step')part(floor,p.x,p.y-.015,p.z-f.z,p.hx*2,.03,p.hz*2);}
    for(const x of [-26,26])for(const z of [-10,10])truss([x,.18,z],[x,18.5,z],1.2);
    for(const z of [-10,10]){beam([-26,18,z],[26,18,z],.22);beam([-26,17,z],[26,17,z],.22);for(let x=-26;x<26;x+=3)beam([x,17,z],[Math.min(26,x+3),18,z],.12);}
    for(const x of [-26,26])beam([x,18,-10],[x,18,10],.25);
    // Four pitched tent-roof bays, as on large outdoor festival stages.
    for(const cx of [-19.5,-6.5,6.5,19.5])for(const side of [-1,1]){const rise=2.5,half=6.5,tilt=Math.atan2(rise,half);part(roof,cx+side*half/2,19.25,0,Math.hypot(half,rise),.18,21,box,-side*tilt);beam([cx-half,18,10],[cx,20.5,10],.13);beam([cx,20.5,10],[cx+half,18,10],.13);}
    function sign(text,x,y,z,width,height){let material=signMaterial(text,'#080c17','#d4ff00');if(typeof document!=='undefined'){const c=document.createElement('canvas'),scale=Math.min(1024/width,1024/height);c.width=Math.ceil(width*scale);c.height=Math.ceil(height*scale);const ctx=c.getContext('2d');ctx.fillStyle='#080c17';ctx.fillRect(0,0,c.width,c.height);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#d4ff00';const header=width/height>8;ctx.font='900 '+Math.floor(c.height*(header?.7:.25))+'px Arial';ctx.fillText(text[0],c.width/2,c.height*(header?.5:.39),c.width*.9);if(!header){ctx.font='700 '+Math.floor(c.height*.12)+'px Arial';ctx.fillText(text[1]||'',c.width/2,c.height*.68,c.width*.9);}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;material.map?.dispose();material.dispose();material=new THREE.MeshBasicMaterial({map:t});}const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);mesh.position.set(x,y,z);group.add(mesh);return mesh;}
    part(dark,0,17.4,10.2,52,2.2,.4);sign(['LOWKEY FESTIVAL','MAIN STAGE · PRAÇA 001'],0,17.4,10.415,50,2);
    part(dark,0,9.25,-8.6,50,15.7,.3);
    for(const x of [-20,-16,16,20])part(x<0?violet:cyan,x,9,-8.43,.14,12,.03);
    const sz=screen.z-f.z;part(dark,0,screen.y,sz-.17,24.4,13.9,.3);
    const banner=sign(['LOWKEY LIVE','MAIN STAGE'],0,screen.y,sz,screen.width,screen.height);banner.name='Telão integrado ao palco';
    for(const x of [-33,33]){
      part(dark,x,9.34,7,10.4,18.32,6);part(roof,x,18.5,7,11,.18,7);
      sign(['LOWKEY','LIVE'],x,10,10.015,9,14);
      for(const dx of [-5.3,5.3])truss([x+dx,.18,10.2],[x+dx,18.5,10.2],.55);
      part(cyan,x,2.15,10.035,9,.12,.03);part(violet,x,17.2,10.035,9,.12,.03);
      for(let i=0;i<10;i++)part(i%2?cyan:violet,x-4+i*.89,3.2+(i%4)*.2,10.04,.46,.8+(i%4)*.4,.03);
    }
    // Hanging line arrays and wedges; the stage entrance stays open.
    for(const x of [-24,24])for(let i=0;i<10;i++){const y=3+(i+.5)*1.1;part(dark,x,y,7.5,1.3,1.05,1.4);part(steel,x,y,8.215,.25,.25,1,disc);}
    for(const x of [-18,-9,9,18]){part(dark,x,f.y+.25,8,1.5,.5,.85);beam([x,f.y,0],[x,3.2,0],.035);part(dark,x,3.23,.08,.28,.08,.12);}
    for(const z of [-5,3,8])for(let i=0;i<14;i++){const x=-22+i*44/13;part(dark,x,16,z,.5,.35,.5);part(i%2?cyan:violet,x,15.8,z+.26,.22,.22,1,disc);}
    for(const x of [-2.36,2.36])part(cyan,x,1.44,17,.055,.04,16);
    part(violet,0,1.44,29.46,9.95,.04,.055);
    for(const batch of batches.values()){const mesh=new THREE.InstancedMesh(batch.geo,batch.material,batch.matrices.length);mesh.name='Festival batch';mesh.castShadow=true;mesh.receiveShadow=true;batch.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.computeBoundingSphere();group.add(mesh);}
    const lights=[-18,-6,6,18].map(x=>{const light=new THREE.PointLight(x<0?0x8056ff:0x35a8ff,0,32,2);light.position.set(x,7,5);group.add(light);return light;});
    // Bounded visual effects only: no NPCs, physics bodies or extra point lights.
    const cone=new THREE.ConeGeometry(1,1,8,1,true),beamMats=[0x4dafff,0x985eff].map(color=>new THREE.MeshBasicMaterial({color,transparent:true,opacity:.065,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
    const beams=Array.from({length:8},(_,i)=>{const mesh=new THREE.Mesh(cone,beamMats[i%2]);mesh.name='Festival light beam';group.add(mesh);return mesh;});
    const flameMat=new THREE.MeshBasicMaterial({color:0xff8c28,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending}),flameCore=new THREE.MeshBasicMaterial({color:0xffeaaa,transparent:true,opacity:.95,depthWrite:false,blending:THREE.AdditiveBlending});
    const flames=Array.from({length:8},(_,i)=>{const g=new THREE.Group();g.position.set(-35+i*10,18.6,8);const outer=new THREE.Mesh(cone,flameMat),inner=new THREE.Mesh(cone,flameCore);outer.position.y=.5;inner.position.y=.28;inner.scale.set(.5,.56,.5);g.add(outer,inner);group.add(g);return g;});
    function update(position,night,now=0){const near=Math.hypot(position.x-f.x,position.z-f.z)<100,t=now/1000;for(const light of lights)light.intensity=near?(8+night*180):0;
      for(let i=0;i<beams.length;i++){const mesh=beams[i];mesh.visible=near&&night>.1;if(!mesh.visible)continue;const from=new THREE.Vector3(-21+i*6,15.6,8),to=new THREE.Vector3(Math.sin(t*.32+i*.9)*23,1.6,18+Math.cos(t*.23+i)*12),d=from.clone().sub(to);mesh.position.copy(from).add(to).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize());mesh.scale.set(1.4,d.length(),1.4);}
      for(let i=0;i<flames.length;i++){const phase=(t+i*.08)%7,active=near&&night>.1&&phase<1.15;flames[i].visible=active;if(active){const height=2+4*Math.sin(Math.PI*phase/1.15);flames[i].scale.set(.65,height,.65);}}
    }
    return {group,banner,lights,beams,flames,update,batchCount:batches.size};
  }
  globalThis.LowkeyFestival={create};
})();
