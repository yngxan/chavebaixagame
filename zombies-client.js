// Lightweight shared geometry; enemy logic and damage remain on the server.
(()=>{
  function create({THREE,scene,hud}){
    const models=new Map(),materials=new Map(),cube=new THREE.BoxGeometry(1,1,1),sphere=new THREE.SphereGeometry(1,8,6);
    const material=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.95}));return materials.get(color);};
    function part(parent,color,x,y,z,sx,sy,sz,round=false){const mesh=new THREE.Mesh(round?sphere:cube,material(color));mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;parent.add(mesh);return mesh;}
    function limb(root,color,x,y,z,w,h){const pivot=new THREE.Group();pivot.position.set(x,y,z);root.add(pivot);part(pivot,color,0,-h/2,0,w,h,w);return pivot;}
    function build(zombie){
      const a=zombie.appearance,group=new THREE.Group();scene.add(group);
      const legs=[limb(group,a.pants,-.19,.9,0,.28,.85),limb(group,a.pants,.19,.9,0,.28,.85)];
      legs.forEach(leg=>part(leg,'#1c2020',0,-.81,.08,.3,.16,.43));
      part(group,a.shirt,0,1.25,0,.73,.78,.43);part(group,a.skin,.18,1.15,.225,.22,.2,.025);part(group,'#433027',-.2,.99,.23,.16,.14,.025);
      const arms=[limb(group,a.shirt,-.49,1.57,0,.26,.7),limb(group,a.shirt,.49,1.57,0,.26,.7)];
      arms.forEach(arm=>{part(arm,a.skin,0,-.7,0,.24,.24,.25);arm.rotation.x=-1.25;});
      const head=new THREE.Group();head.position.y=1.88;group.add(head);part(head,a.skin,0,0,0,.7,.64,.59);
      for(const x of [-.18,.18]){part(head,'#28332a',x,.05,.302,.21,.18,.025);part(head,'#d5b750',x,.04,.32,.08,.07,.02);}
      part(head,'#352326',.035,-.18,.305,.36,.16,.04);for(const x of [-.08,.04,.14])part(head,'#d3ccb0',x,-.135,.332,.06,.07,.025);
      if(a.hairStyle==='buzz')part(head,a.hair,0,.33,-.01,.72,.065,.6);
      else if(a.hairStyle==='lowBlack'){part(head,a.hair,0,.33,0,.38,.16,.32,true);for(const x of [-.21,0,.21])for(const z of [-.17,.06,.2])part(head,a.hair,x,.35,z,.14,.14,.14,true);}
      else if(a.hairStyle==='braids'){for(let i=-2;i<=2;i++)for(let k=0;k<5;k++)part(head,a.hair,i*.13,.34,-.23+k*.105,.055,.055,.067,true);}
      else if(a.hairStyle==='mohawk'){for(let k=0;k<5;k++)part(head,a.hair,0,.4,-.23+k*.11,.14,.25,.13);}
      else{for(let i=0;i<7;i++){const p=part(head,a.hair,Math.sin(i*2.4)*.24,.34,-.03+Math.cos(i*2.4)*.16,.22,.23,.23);p.rotation.z=Math.sin(i)*.4;}}
      const dirt=part(scene,'#69573c',zombie.position.x,zombie.position.y+.01,zombie.position.z,.85,.025,.7);dirt.castShadow=false;
      const entry={group,head,arms,legs,dirt,buffer:new LowkeyMotion.MotionBuffer(),record:zombie,bornAt:performance.now(),ageOffset:0,attackUntil:0,deathAt:0};models.set(zombie.id,entry);return entry;
    }
    function push(zombie,time,arrival){const entry=models.get(zombie.id)||build(zombie);entry.record=zombie;entry.ageOffset=Math.max(0,time-zombie.spawnAt);entry.bornAt=arrival;entry.buffer.push({...zombie.position,rotation:zombie.rotation,motionTime:time,walking:true,speed:zombie.speed||1.5},arrival);return entry;}
    function remove(id){const entry=models.get(id);if(!entry)return;scene.remove(entry.group,entry.dirt);models.delete(id);}
    function receive(message,arrival=performance.now()){
      if(!message.type.startsWith('zombie'))return false;
      if(message.state&&hud){hud.hidden=!message.state.active;hud.textContent=message.state.phase==='intermission'?`ROUND ${message.state.round} ✓ · PRÓXIMO ROUND…`:`ZOMBIES · ROUND ${message.state.round} · ${message.state.remaining} RESTANTES`;}
      if(message.type==='zombies-state'){const ids=new Set(message.zombies.map(z=>z.id));for(const id of models.keys())if(!ids.has(id))remove(id);for(const z of message.zombies)push(z,message.serverTime,arrival);}
      else if(message.type==='zombie-spawn')push(message.zombie,message.serverTime,arrival);
      else if(message.type==='zombies-motion'){for(const row of message.zombies){const entry=models.get(row[0]);if(entry&&!entry.deathAt)push({...entry.record,position:{x:row[1],y:row[2],z:row[3]},rotation:row[4],health:row[5]},message.serverTime,arrival);}}
      else if(message.type==='zombie-attack'){const entry=models.get(message.id);if(entry)entry.attackUntil=arrival+450;}
      else if(message.type==='zombie-hit'){const entry=models.get(message.id);if(entry){entry.record.health=message.health;if(message.killed)entry.deathAt=arrival;}}
      return true;
    }
    function update(dt,now){for(const[id,entry]of models){const pose=entry.buffer.sample(now,dt);if(!pose)continue;const age=(entry.ageOffset+now-entry.bornAt)/1600,rise=Math.min(1,Math.max(0,age)),dy=entry.deathAt?Math.min(1,(now-entry.deathAt)/850):0;if(dy>=1){remove(id);continue;}entry.group.position.set(pose.x,pose.y-2.3*(1-rise)-dy*2.3,pose.z);entry.group.rotation.set(0,pose.rotation,dy*.55);const stride=Math.sin(now*.006+Number(id.split('-').at(-1)))*.28*(pose.walking?1:0);entry.legs[0].rotation.x=stride;entry.legs[1].rotation.x=-stride;entry.head.rotation.z=Math.sin(now*.002)*.07;entry.arms.forEach((arm,i)=>{arm.rotation.x=-1.25+Math.sin(now*.004+i)*.08-(entry.attackUntil>now?.55*Math.sin((entry.attackUntil-now)/450*Math.PI):0);});entry.dirt.visible=rise<1||Boolean(entry.deathAt);}}
    return {receive,update,models};
  }
  globalThis.LowkeyZombies={create};
})();
