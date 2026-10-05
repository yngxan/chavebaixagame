(() => {
  function create({THREE,scene,makeAvatar,disposeAvatar,getLocalId,getPosition=()=>null,onArrest,onRelease,poseWeapon=()=>{},onShot=()=>{}}) {
    const rigs=new Map(),models=new Map();let jailUntil=0,clockOffset=0,previousHud='';
    const hud=document.createElement('div');hud.className='police-hud';hud.hidden=true;hud.setAttribute('role','status');document.querySelector('.hud').appendChild(hud);
    let taskIndex=0,workUntil=0,workPending=false,workError='';const workPanel=document.createElement('div');workPanel.hidden=true;workPanel.style.cssText='position:absolute;left:50%;bottom:80px;transform:translateX(-50%);width:min(340px,90vw);padding:10px;border:1px solid #52dded;border-radius:12px;background:#0c1723ee;color:#fff;text-align:center;pointer-events:auto;font-size:12px';const workText=document.createElement('div'),workButton=document.createElement('button');workButton.textContent='Trabalhar · descontar 15s';workButton.style.cssText='margin-top:8px;padding:9px;background:#d4ff00;border:0;border-radius:8px;cursor:pointer';workPanel.append(workText,workButton);document.querySelector('.hud').appendChild(workPanel);
    const taskRing=new THREE.Mesh(new THREE.RingGeometry(.8,1,24),new THREE.MeshBasicMaterial({color:0x52dded,side:THREE.DoubleSide}));taskRing.rotation.x=-Math.PI/2;taskRing.visible=false;scene.add(taskRing);
    async function requestWork(action){const response=await fetch('/api/prison',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:getLocalId(),action})}),data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível fazer a tarefa.');jailUntil=data.until;taskIndex=data.taskIndex;clockOffset=data.serverTime-Date.now();workUntil=data.startedAt?data.startedAt+8000:0;return data;}
    workButton.addEventListener('click',async()=>{if(workPending)return;workPending=true;workError='';try{await requestWork('start');}catch(error){workError=error.message;}finally{workPending=false;}});
    const style=document.createElement('style');style.textContent='.police-hud{position:absolute;right:18px;top:78px;padding:8px 12px;border:1px solid #7f9bb4;border-radius:10px;background:rgba(12,23,35,.9);color:#f7e294;font-weight:900;font-size:13px;pointer-events:none;white-space:nowrap}.police-hud[hidden]{display:none!important}@media(pointer:coarse),(max-width:760px){.police-hud{top:calc(170px + env(safe-area-inset-top));right:14px;font-size:11px;padding:6px 9px}}@media(orientation:landscape) and (pointer:coarse){.police-hud{top:48px;right:160px}}';document.head.appendChild(style);
    const paint=new THREE.MeshStandardMaterial({color:0xf0eee7,roughness:.55}),dark=new THREE.MeshStandardMaterial({color:0x182432,roughness:.8}),glass=new THREE.MeshStandardMaterial({color:0x76a8be,transparent:true,opacity:.32,roughness:.25,depthWrite:false});
    const blue=new THREE.MeshStandardMaterial({color:0x396cff,emissive:0x2458ff,emissiveIntensity:1}),red=new THREE.MeshStandardMaterial({color:0xff4141,emissive:0xff1010,emissiveIntensity:1});
    const boxGeo=new THREE.BoxGeometry(1,1,1),wheelGeo=new THREE.CylinderGeometry(.41,.41,.28,12);
    function batchOfficer(rig){
      const protectedParts=new Set(rig.arms.flatMap(a=>[...(a.userData.handParts||[]),a.userData.fist,a.userData.snowball])),sources=new THREE.Group();sources.visible=false;rig.batchSources=sources;
      // Merge fixed meshes inside each animated bone, keeping the exact surfaces.
      // Originals remain owned for cleanup, outside the per-frame scene traversal.
      const parents=[rig.head,rig.body,...rig.legs,...rig.arms,...rig.arms.map(a=>a.userData.forearm).filter(Boolean)],boundaries=new Set([...parents,...rig.arms.map(a=>a.userData.glock).filter(Boolean),sources]);
      for(const parent of parents){
        parent.updateWorldMatrix(true,true);const inverse=new THREE.Matrix4().copy(parent.matrixWorld).invert(),groups=new Map();
        function collect(node){for(const mesh of [...node.children]){
          if(!mesh.visible||boundaries.has(mesh)||protectedParts.has(mesh))continue;
          if(!mesh.isMesh){collect(mesh);continue;}
          if(mesh.isInstancedMesh||Array.isArray(mesh.material)||mesh.material.transparent)continue;
          const key=mesh.material.uuid+':'+mesh.castShadow+':'+mesh.receiveShadow,list=groups.get(key)||[];list.push({mesh,matrix:new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld)});groups.set(key,list);
        }}collect(parent);
        for(const pieces of groups.values()){
          if(pieces.length<2)continue;const transformed=pieces.map(({mesh,matrix})=>{const copy=mesh.geometry.clone().applyMatrix4(matrix);if(!copy.attributes.normal)copy.computeVertexNormals();if(!copy.index)return copy;const flat=copy.toNonIndexed();copy.dispose();return flat;}),geometry=new THREE.BufferGeometry();
          for(const [name,size] of [['position',3],['normal',3],['uv',2]]){
            const total=transformed.reduce((n,g)=>n+g.attributes.position.count,0),values=new Float32Array(total*size);let offset=0;
            for(const g of transformed){const attr=g.attributes[name];for(let i=0;i<g.attributes.position.count;i++)for(let j=0;j<size;j++)values[offset++]=attr?attr.array[i*attr.itemSize+j]:0;}
            geometry.setAttribute(name,new THREE.BufferAttribute(values,size));
          }
          transformed.forEach(g=>g.dispose());geometry.computeBoundingSphere();const merged=new THREE.Mesh(geometry,pieces[0].mesh.material);merged.castShadow=pieces[0].mesh.castShadow;merged.receiveShadow=pieces[0].mesh.receiveShadow;parent.add(merged);for(const {mesh} of pieces)sources.add(mesh);
        }
      }
    }
    function part(group,x,y,z,sx,sy,sz,mat){const mesh=new THREE.Mesh(boxGeo,mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;}
    function carModel(state){const group=new THREE.Group();scene.add(group);const wheels=[];
      part(group,0,.55,0,1.82,.28,3.55,dark);part(group,0,.82,0,1.79,.32,3.5,paint);
      part(group,0,1.29,-.18,1.52,.58,1.75,glass);part(group,0,1.62,-.18,1.6,.1,1.7,dark);
      for(const x of [-.77,.77]){for(const z of [-1,.67])part(group,x,1.32,z,.08,.64,.08,paint);part(group,x,.96,-.1,.025,.21,2.65,dark);}
      for(const x of [-.92,.92])for(const z of [-1.16,1.16]){const wheel=new THREE.Mesh(wheelGeo,dark);wheel.position.set(x,.41,z);wheel.rotation.z=Math.PI/2;group.add(wheel);wheels.push(wheel);}
      part(group,0,1.73,-.2,1,.09,.28,dark);const lights=[part(group,-.28,1.82,-.2,.44,.13,.24,blue),part(group,.28,1.82,-.2,.44,.13,.24,red)];
      for(const x of [-.61,.61]){part(group,x,.91,1.77,.36,.12,.04,paint);part(group,x,.91,-1.77,.34,.1,.04,red);}
      const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#182432';ctx.fillRect(0,0,256,64);ctx.fillStyle='#f3f4e7';ctx.font='bold 38px Arial';ctx.textAlign='center';ctx.fillText('POLÍCIA',128,46);const texture=new THREE.CanvasTexture(canvas),mat=new THREE.MeshBasicMaterial({map:texture});
      for(const side of [-1,1]){const sign=new THREE.Mesh(new THREE.PlaneGeometry(1.2,.29),mat);sign.position.set(side*.91,.99,0);sign.rotation.y=side*Math.PI/2;group.add(sign);}
      // Batch the fixed body panels without changing their geometry or lighting.
      const byMaterial=new Map(),batches=[];for(const mesh of [...group.children])if(mesh.geometry===boxGeo&&!lights.includes(mesh)){const pieces=byMaterial.get(mesh.material)||[];pieces.push(mesh);byMaterial.set(mesh.material,pieces);}
      for(const [material,pieces]of byMaterial){const batch=new THREE.InstancedMesh(boxGeo,material,pieces.length);batch.castShadow=true;batch.receiveShadow=true;pieces.forEach((mesh,i)=>{mesh.updateMatrix();batch.setMatrixAt(i,mesh.matrix);group.remove(mesh);});batch.instanceMatrix.needsUpdate=true;group.add(batch);batches.push(batch);}
      return {group,wheels,lights,batches,samples:[],state,owned:[texture,mat]};
    }
    function sample(entry,state,p,at){entry.state=state;entry.samples.push({at,x:p.x,y:p.y,z:p.z,rotation:state.rotation});while(entry.samples.length>5)entry.samples.shift();}
    function pose(entry,now){const samples=entry.samples;if(!samples.length)return;const at=now-120;while(samples.length>2&&samples[1].at<=at)samples.shift();const a=samples[0],b=samples[1]||a,t=Math.max(0,Math.min(1,(at-a.at)/Math.max(1,b.at-a.at))),delta=Math.atan2(Math.sin(b.rotation-a.rotation),Math.cos(b.rotation-a.rotation));entry.group.position.set(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t);entry.group.rotation.y=a.rotation+delta*t;}
    let stars=0;
    function receive(message){if(message.type==='prison-progress'){if(message.id===getLocalId()){jailUntil=message.until;taskIndex=message.taskIndex;workUntil=message.startedAt?message.startedAt+8000:0;clockOffset=message.serverTime-Date.now();}return true;}if(message.type==='police-arrest'){clockOffset=message.serverTime-Date.now();jailUntil=message.until;taskIndex=0;workUntil=0;workError='';onArrest(message);return true;}if(message.type==='police-release'){jailUntil=0;stars=0;workUntil=0;onRelease(message);return true;}
      if(message.type==='police-shot'){const rig=rigs.get(message.officerId);if(rig){rig.fireUntil=performance.now()+140;rig.state={...rig.state,armed:true,aiming:true,aimPitch:message.pitch};}onShot(message);return true;}
      if(message.type==='police-wanted'){if(message.id===getLocalId())stars=message.stars;return true;}
      if(!['police-state','police-motion'].includes(message.type))return false;
      if(message.type==='police-motion'){message={...message,cars:message.cars.map(([id,x,y,z,rotation,speed,lights])=>({...models.get(id)?.state,id,x,y,z,rotation,speed,lights})),officers:message.officers.map(([id,x,y,z,rotation,walking,seated,health,armed,aiming,aimPitch])=>({...rigs.get(id)?.state,id,position:{x,y,z},rotation,walking,seated,health,armed,aiming,aimPitch}))};}
      const now=performance.now();clockOffset=message.serverTime-Date.now();const me=(message.wanted||[]).find(p=>p.id===getLocalId());stars=me?.stars||0;jailUntil=me?.jailUntil||0;taskIndex=me?.taskIndex||0;
      if(message.reset){for(const model of models.values())model.samples.length=0;for(const rig of rigs.values())rig.samples.length=0;}
      for(const state of message.cars){let model=models.get(state.id);if(!model){model=carModel(state);models.set(state.id,model);}sample(model,state,state,now);}
      for(const [id,model] of models)if(!message.cars.some(c=>c.id===id)){scene.remove(model.group);for(const batch of model.batches)batch.dispose();for(const owned of model.owned)owned.dispose();model.group.traverse(o=>{if(o.geometry?.type==='PlaneGeometry')o.geometry.dispose();});models.delete(id);}
      for(const state of message.officers){let rig=rigs.get(state.id);if(!rig){rig={...makeAvatar(state.appearance,'POLICIAL'),samples:[]};batchOfficer(rig);rig.group.traverse(o=>{if(o.isSprite)o.visible=false;});const cap=new THREE.Mesh(new THREE.BoxGeometry(.96,.13,.74),dark);cap.position.set(0,2.53,0);rig.head.add(cap);rig.policeParts=[cap,part(rig.head,0,2.46,.41,.77,.04,.28,dark),part(rig.body,-.27,1.58,.37,.1,.15,.025,paint)];rigs.set(state.id,rig);}sample(rig,state,state.position,now);}
      for(const [id,rig] of rigs)if(!message.officers.some(o=>o.id===id)){scene.remove(rig.group);for(const p of rig.policeParts){p.parent.remove(p);if(p.geometry!==boxGeo)p.geometry.dispose();}rig.group.add(rig.batchSources);disposeAvatar(rig.group);rigs.delete(id);}return true;
    }
    function update(dt,now){for(const model of models.values()){pose(model,now);model.wheels.forEach(w=>w.rotation.x+=(model.state.speed||0)*dt/.41);model.lights.forEach((light,i)=>light.visible=model.state.lights&&(Math.floor(now/140)%2===i));}
      const jailed=jailUntil>Date.now()+clockOffset,task=LowkeyCityLayout.prison.tasks[taskIndex%3],position=getPosition(),distance=position?Math.hypot(position.x-task.x,position.z-task.z):Infinity;workPanel.hidden=!jailed;taskRing.visible=jailed;taskRing.position.set(task.x,.135,task.z);if(jailed){workText.textContent=workError||`${task.name} · ${Math.ceil(distance)}m · permaneça no ponto por 8s`;workButton.disabled=workPending||Boolean(workUntil)||distance>2.5;workButton.textContent=workUntil?`Trabalhando… ${Math.max(0,Math.ceil((workUntil-Date.now()-clockOffset)/1000))}s`:'Trabalhar · descontar 15s';if(workUntil&&Date.now()+clockOffset>=workUntil&&!workPending){workPending=true;workUntil=0;requestWork('complete').catch(error=>workError=error.message).finally(()=>workPending=false);}}
      for(const rig of rigs.values()){pose(rig,now);const s=rig.state;rig.group.scale.setScalar(s.seated?.68:1);if(s.health<=0){rig.group.rotation.z=Math.PI/2;rig.group.position.y+=.3;}else rig.group.rotation.z=0;
        rig.legs.forEach((leg,i)=>leg.rotation.x=s.seated?-1.35:s.walking?Math.sin(now/110+(i?Math.PI:0))*.66:0);rig.arms.forEach((arm,i)=>{arm.rotation.x=s.seated?-1.15:s.walking?Math.sin(now/110+(i?0:Math.PI))*.4:0;arm.rotation.z=0;});
        poseWeapon(rig,dt,Math.max(0,(rig.fireUntil||0)-now)/140*.045);
      }
      const seconds=Math.max(0,Math.ceil((jailUntil-(Date.now()+clockOffset))/1000)),text=seconds?`PRESO · LIBERADO EM ${seconds}s`:`${'★'.repeat(stars)} · PROCURADO ${stars}/5`;hud.hidden=!getLocalId()||(!stars&&!seconds);if(text!==previousHud){previousHud=text;hud.textContent=text;hud.setAttribute('aria-label',seconds?`Preso, ${seconds} segundos restantes`:`Nível de perseguição: ${stars} estrelas`);}
    }
    return {receive,update,models,rigs,stars:()=>stars,isJailed:()=>jailUntil>Date.now()+clockOffset};
  }
  globalThis.LowkeyPolice={create};
})();
