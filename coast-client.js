(() => {
  function create({THREE,scene,signMaterial}){
    const layout=LowkeyCityLayout.coast,group=new THREE.Group();group.name='LowKey Beach & Pier';scene.add(group);
    const boxGeo=new THREE.BoxGeometry(1,1,1),poleGeo=new THREE.CylinderGeometry(1,1,1,8),batches=new Map(),materials=new Map();
    const material=(color)=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.8,flatShading:true}));return materials.get(color);};
    const sand=material(0xe9cf98),wetSand=material(0xc4b587),wood=material(0xb37d4d),woodLight=material(0xd0a572),darkWood=material(0x624830),white=material(0xf6f0db),teal=material(0x3daab2),red=material(0xe45252),yellow=material(0xf8c94b),purple=material(0x9369c5),steel=material(0xabbfc8),dark=material(0x263c48),pavement=material(0xd9d2bb),leaf=material(0x4e9d48),leafLight=material(0x81b443),lampMat=material(0xffd9a0);
    lampMat.emissive.set(0xffbf65);
    function part(mat,x,y,z,sx,sy,sz,geo=boxGeo,q=null,cast=true){const key=`${mat.uuid}:${geo.uuid}:${cast}`,batch=batches.get(key)||{mat,geo,cast,items:[]};batch.items.push({x,y,z,sx,sy,sz,q});batches.set(key,batch);}
    function beam(a,b,width,mat,depth=width){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),middle=start.clone().add(end).multiplyScalar(.5),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());part(mat,middle.x,middle.y,middle.z,width,delta.length(),depth,boxGeo,q);}
    for(const s of layout.surfaces){const board=s.kind==='pier'||s.kind==='ramp'||s.kind==='access';part(s.kind==='sand'?sand:s.kind==='promenade'?pavement:wood,s.x,s.y-(board?.17:.30),s.z,s.hx*2,board?.34:.60,s.hz*2,boxGeo,null,false);
      if(board)for(let z=s.z-s.hz+.3;z<s.z+s.hz;z+=.65)part(darkWood,s.x,s.y+.001,z,s.hx*2,.005,.035,boxGeo,null,false);
    }
    part(wetSand,0,-.052,180.8,240,.012,2.4,boxGeo,null,false);
    // Seafront tile seams and the city-to-beach wayfinding.
    for(let x=-118;x<120;x+=3)part(material(0xb5b5a8),x,.124,126,.035,.008,12,boxGeo,null,false);
    for(const side of [-1,1])for(let x=14;x<120;x+=18){part(teal,side*x,.62,133,.08,1.3,.08);part(white,side*(x+6),.48,133,12,.1,.08);}
    function sign(text,x,y,z,width,height,rotation=0){if(!signMaterial)return;const panel=new THREE.Mesh(new THREE.PlaneGeometry(width,height),signMaterial([text,'LOWKEY BEACH'],'#24383b','#fff3c5'));panel.position.set(x,y,z);panel.rotation.y=rotation;group.add(panel);}
    for(const side of [-1,1])part(teal,side*5.9,2.8,161,.3,5.6,.3);
    part(teal,0,5.1,161,12.3,.6,.45);sign('LOWKEY PIER',0,5.08,161.25,10,.8);
    sign('LOWKEY PIER',0,5.08,160.75,10,.8,Math.PI);
    sign('PRAIA →',9,2.3,128,4.5,1.4);part(dark,9,1.3,127.9,.14,2.6,.14);
    // Boardwalk support piles descend into the ocean rather than floating on it.
    for(const s of layout.surfaces.filter(s=>s.kind==='pier')){
      for(let x=s.x-s.hx+.65;x<s.x+s.hx;x+=8)for(let z=s.z-s.hz+.65;z<s.z+s.hz;z+=7){part(darkWood,x,-1.05,z,.42,4.6,.42,poleGeo);}
      for(const side of [-1,1])part(darkWood,s.x+side*(s.hx-.5),.63,s.z,.3,.55,s.hz*2);
    }
    for(const o of layout.obstacles.filter(o=>o.kind==='rail')){
      const alongX=o.hx>o.hz,len=(alongX?o.hx:o.hz)*2;
      for(const y of [1.94,2.58])part(darkWood,o.x,y,o.z,alongX?len:.12,.10,alongX?.12:len);
      for(let a=-len/2;a<=len/2+.01;a+=2.2)part(white,o.x+(alongX?a:0),2,o.z+(alongX?0:a),.14,1.2,.14);
    }
    // Beach seating, striped umbrellas and a compact lifeguard hut.
    const umbrellaGeos=Array.from({length:8},(_,i)=>new THREE.ConeGeometry(2.25,.8,1,1,true,i*Math.PI/4,Math.PI/4));
    for(const u of layout.umbrellas){part(white,u.x,1.22,u.z,.07,2.55,.07,poleGeo);
      for(let i=0;i<8;i++)part(i%2?white:material(u.color),u.x,2.6,u.z,1,1,1,umbrellaGeos[i],null,false);
      for(const side of [-1,1]){part(white,u.x+side*.85,.22,u.z+.45,.85,.14,2.05);part(material(u.color),u.x+side*.85,.31,u.z+.45,.7,.025,1.95);}
    }
    part(white,-57,2.5,176,4.8,2.8,3.4);part(teal,-57,4.08,176,5.4,.28,4.1);part(teal,-57,2.7,177.72,3.5,1,.06);
    for(const side of [-1,1])part(darkWood,-57+side*1.9,.8,176,.18,1.8,.18);
    part(white,-57,1.25,173.5,3.6,.25,2);sign('SALVA-VIDAS',-57,3.65,177.79,3.7,.6);
    // Low-poly palm fronds, each a long tapered diamond instead of a cubic treetop.
    const frondGeo=new THREE.BufferGeometry();frondGeo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0, .7,-.35,2.2, 0,-1.1,5, 0,0,0, 0,-1.1,5, -.7,-.35,2.2],3));frondGeo.computeVertexNormals();
    const palmLeaf=leaf.clone();palmLeaf.side=THREE.DoubleSide;const palmLight=leafLight.clone();palmLight.side=THREE.DoubleSide;
    for(const p of layout.palms){const y=p.z<=132?.12:-.05,size=p.size;
      beam([p.x,y,p.z],[p.x+.45*size,y+6.3*size,p.z],.28*size,darkWood);
      for(let i=0;i<8;i++){const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),i*Math.PI/4);part(i%2?palmLight:palmLeaf,p.x+.45*size,y+6.3*size,p.z,size,size,size,frondGeo,q);}
      part(darkWood,p.x+.45*size,y+6.05*size,p.z,.55*size,.55*size,.55*size,poleGeo);
    }
    for(const k of layout.kiosks){const color=material(k.color);part(color,k.x,1.4+k.height/2,k.z,k.width,k.height,k.depth);part(white,k.x,5.31,k.z,k.width+.7,.3,k.depth+.7);part(dark,k.x,3.12,k.z+2.33,k.width-1.5,1.4,.08);
      for(let i=0;i<10;i++){part(i%2?color:white,k.x-k.width/2+(i+.5)*k.width/10,4.12,k.z+2.9,k.width/10,.14,1.4);}
      sign(k.name,k.x,4.72,k.z+2.36,k.width-.8,.7);
    }
    // Ferris wheel: one rotating rig; cabins counter-rotate to stay upright.
    const wheel=layout.wheel,wheelRig=new THREE.Group();wheelRig.position.set(wheel.x,wheel.hubY,wheel.z);group.add(wheelRig);
    for(const side of [-1,1])for(const depth of [-3,3])beam([wheel.x+side*9,1.4,wheel.z+depth],[wheel.x,wheel.hubY,wheel.z+depth*.5],.45,white);
    const ringGeo=new THREE.TorusGeometry(wheel.radius,.20,8,72),spokeGeo=new THREE.CylinderGeometry(.07,.07,wheel.radius,6),cabins=[];
    for(const depth of [-1.5,1.5]){const rim=new THREE.Mesh(ringGeo,yellow);rim.position.z=depth;rim.castShadow=true;wheelRig.add(rim);
      for(let i=0;i<16;i++){const angle=i*Math.PI/8,spoke=new THREE.Mesh(spokeGeo,white);spoke.position.set(Math.cos(angle)*wheel.radius/2,Math.sin(angle)*wheel.radius/2,depth);spoke.rotation.z=angle-Math.PI/2;wheelRig.add(spoke);}
    }
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,4,12),teal);hub.rotation.x=Math.PI/2;wheelRig.add(hub);
    function mesh(parent,mat,x,y,z,sx,sy,sz){const m=new THREE.Mesh(boxGeo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
    for(let i=0;i<16;i++){const angle=i*Math.PI/8,pivot=new THREE.Group(),cabin=new THREE.Group();pivot.position.set(Math.cos(angle)*wheel.radius,Math.sin(angle)*wheel.radius,0);wheelRig.add(pivot);pivot.add(cabin);const color=[red,yellow,teal,purple][i%4];
      mesh(cabin,color,0,-1.0,0,2.1,.95,2.8);mesh(cabin,color,0,.2,0,2.35,.16,3);for(const x of [-.95,.95])for(const z of [-1.2,1.2])mesh(cabin,white,x,-.35,z,.1,1.1,.1);cabins.push(cabin);
    }
    const bulbs=[];
    const bulbGeo=new THREE.SphereGeometry(.16,6,4),bulbMat=new THREE.MeshBasicMaterial({color:0xffe492});
    for(let i=0;i<48;i++){const a=i*Math.PI/24,bulb=new THREE.Mesh(bulbGeo,bulbMat);bulb.position.set(Math.cos(a)*wheel.radius,Math.sin(a)*wheel.radius,1.75);wheelRig.add(bulb);bulbs.push(bulb);}
    // A compact looping coaster with two rails, sleepers and a visually moving train.
    const points=[[5,4.5,212],[6,6,226],[17,13,228],[27,8,223],[26,4.5,211],[16,3.5,209]].map(p=>new THREE.Vector3(...p));
    const track=new THREE.CatmullRomCurve3(points,true,'centripetal'),railCurve=side=>new THREE.CatmullRomCurve3(Array.from({length:96},(_,i)=>{const t=i/96,p=track.getPointAt(t),d=track.getTangentAt(t),normal=new THREE.Vector3(d.z,0,-d.x).normalize();return p.addScaledVector(normal,side*.67);}),true,'centripetal');
    for(const side of [-1,1]){const rail=new THREE.Mesh(new THREE.TubeGeometry(railCurve(side),144,.12,6,true),yellow);rail.castShadow=true;group.add(rail);}
    for(let i=0;i<72;i++){const t=i/72,p=track.getPointAt(t),d=track.getTangentAt(t),n=new THREE.Vector3(d.z,0,-d.x).normalize();beam([p.x-n.x*.9,p.y-.17,p.z-n.z*.9],[p.x+n.x*.9,p.y-.17,p.z+n.z*.9],.12,teal);}
    for(let i=0;i<14;i++){const p=track.getPointAt(i/14);beam([p.x,1.4,p.z],[p.x,p.y-.2,p.z],.26,purple);}
    const train=[];
    for(let i=0;i<3;i++){const car=new THREE.Group();mesh(car,i%2?teal:red,0,.48,0,1.35,.75,1.9);mesh(car,dark,0,.92,-.24,1.1,.1,1.2);mesh(car,yellow,0,1.08,.63,1.35,.1,.1);group.add(car);train.push(car);}
    for(const l of layout.lamps){part(teal,l.x,l.y+2.15,l.z,.12,4.3,.12);part(white,l.x,l.y+4.38,l.z,.75,.18,.75);part(lampMat,l.x,l.y+4.19,l.z,.55,.25,.55);}
    // Warm festoon lights across the park.
    for(const z of [204,244]){for(const x of [-35,35])part(teal,x,4.2,z,.16,5.6,.16);beam([-35,7,z],[35,7,z],.035,dark);for(let x=-32;x<=32;x+=4)part(lampMat,x,6.72,z,.14,.24,.14,poleGeo,null,false);}
    const dummy=new THREE.Object3D();let instanceCount=0;
    for(const b of batches.values()){const m=new THREE.InstancedMesh(b.geo,b.mat,b.items.length);m.castShadow=b.cast;m.receiveShadow=true;
      b.items.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.scale.set(p.sx,p.sy,p.sz);dummy.quaternion.copy(p.q||new THREE.Quaternion());dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);});m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();group.add(m);instanceCount+=b.items.length;
    }
    // The water is visual, not a fake walking platform. Only actual sand/deck supports feet.
    const water=new THREE.Mesh(new THREE.PlaneGeometry(1200,1200,160,160),new THREE.ShaderMaterial({fog:true,transparent:false,side:THREE.DoubleSide,uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),time:{value:0},night:{value:0}},
      vertexShader:`uniform float time;varying vec3 vWater;varying vec3 vNormalWater;varying float vWave;
        #include <fog_pars_vertex>
        void main(){vec3 p=position;vec3 w=(modelMatrix*vec4(p,1.)).xyz;
          float a=w.x*.095+w.z*.055-time*.85,b=w.x*-.06+w.z*.14-time*1.15;
          vWave=sin(a)*.17+sin(b)*.075;p.z+=vWave;
          vNormalWater=normalize(vec3(-cos(a)*.01615+cos(b)*.0045,1.,-cos(a)*.00935-cos(b)*.0105));
          vWater=(modelMatrix*vec4(p,1.)).xyz;vec4 mvPosition=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader:`uniform float time;uniform float night;varying vec3 vWater;varying vec3 vNormalWater;varying float vWave;
        #include <fog_pars_fragment>
        void main(){vec2 p=vWater.xz;vec3 n=normalize(vNormalWater+vec3(sin(p.y*1.1+time*1.8)*.025,0.,sin(p.x*1.25-time*1.6)*.022));
          vec3 view=normalize(cameraPosition-vWater);float fresnel=pow(1.-max(0.,dot(n,view)),3.);
          vec2 island=max(abs(p-vec2(0.,24.))-vec2(134.,158.),vec2(0.));float shore=length(island);
          vec3 deep=vec3(.018,.19,.27),shallow=vec3(.025,.43,.42),sky=vec3(.34,.64,.72);
          vec3 color=mix(shallow,deep,smoothstep(0.,75.,shore));color=mix(color,sky,fresnel*.7);
          float glint=pow(max(0.,dot(reflect(-normalize(vec3(-.45,.8,-.35)),n),view)),110.);
          float crest=smoothstep(.15,.235,vWave)*.10;
          float foam=(1.-smoothstep(.1,2.7,shore))*smoothstep(.4,.8,sin(shore*2.4+time*1.1+sin(p.x*.22)*.3));
          color+=vec3(.7,.75,.65)*(glint*.7+crest);color=mix(color,vec3(.72,.87,.82),foam*.55);
          color=mix(color,color*.21+vec3(.008,.019,.035)+vec3(.16,.22,.29)*fresnel*.25,night);gl_FragColor=vec4(color,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`
    }));water.rotation.x=-Math.PI/2;water.position.set(0,layout.waterY,0);water.renderOrder=0;water.frustumCulled=false;scene.add(water);
    const surf=[];
    for(let i=0;i<4;i++){const foam=new THREE.Mesh(new THREE.PlaneGeometry(244,.75),new THREE.MeshBasicMaterial({color:0xf1f7dc,transparent:true,opacity:.35,depthWrite:false}));foam.rotation.x=-Math.PI/2;foam.position.set(0,layout.waterY+.12,182+i*2.2);scene.add(foam);surf.push(foam);}
    const lights=Array.from({length:3},()=>{const l=new THREE.PointLight(0xffcd88,0,20,2);group.add(l);return l;});let lastSelect=-Infinity,selected=[];
    function update(night,position,now,serverTime=now){
      const time=serverTime/1000;water.material.uniforms.time.value=time%10000;water.material.uniforms.night.value=night;
      wheelRig.rotation.z=(time*.085)%(Math.PI*2);for(const cabin of cabins)cabin.rotation.z=-wheelRig.rotation.z;
      for(let i=0;i<train.length;i++){const t=(time*.036-i*.027)%1,p=track.getPointAt((t+1)%1),d=track.getTangentAt((t+1)%1);train[i].position.copy(p);train[i].lookAt(p.clone().add(d));}
      lampMat.emissiveIntensity=.05+night*1.9;bulbMat.color.setRGB(1,.8+.12*(1-night),.42+.22*(1-night));
      surf.forEach((foam,i)=>{const phase=(time*.13+i*.25)%1;foam.position.z=182+phase*7;foam.position.y=layout.waterY+.14+Math.sin(time*.7+i)*.035;foam.material.opacity=Math.sin(phase*Math.PI)*(.24+.12*(1-night));});
      if(now-lastSelect>350){lastSelect=now;selected=layout.lamps.map(p=>({...p,distance:Math.hypot(p.x-position.x,p.z-position.z)})).filter(p=>p.distance<25).sort((a,b)=>a.distance-b.distance).slice(0,3);}
      lights.forEach((l,i)=>{const p=selected[i];l.intensity=p?night*12:0;if(p)l.position.set(p.x,p.y+4,p.z);});
    }
    return{group,water,update,wheelRig,cabins,train,track,lights,instanceCount,batchCount:batches.size};
  }
  globalThis.LowkeyCoast={create};
})();
