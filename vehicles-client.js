(() => {
  function create({THREE,scene,box,mats}) {
    const models=new Map(),rubber=new THREE.MeshStandardMaterial({color:0x16191d,roughness:.95}),chrome=new THREE.MeshStandardMaterial({color:0xb9c3ce,metalness:.7,roughness:.3});
    const glass=new THREE.MeshStandardMaterial({color:0x9dc6db,transparent:true,opacity:.34,roughness:.2,metalness:.1,depthWrite:false});
    const lamp=new THREE.MeshStandardMaterial({color:0xffe9bc,emissive:0xffdba0,emissiveIntensity:1});
    for(const state of LowkeyWorld.initialVehicles()) {
      const group=new THREE.Group(),wheels=[],frontWheels=[];scene.add(group);let doorPivot=null;
      const paint=new THREE.MeshStandardMaterial({color:state.kind==='car'?0x236fa7:0xbf343d,roughness:.4,metalness:.3});
      function wheel(x,z,radius,width,front){const root=new THREE.Group();root.position.set(x,radius,z);group.add(root);const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,width,14),rubber);mesh.rotation.z=Math.PI/2;mesh.castShadow=true;root.add(mesh);const hub=new THREE.Mesh(new THREE.CylinderGeometry(radius*.52,radius*.52,width+.015,10),chrome);hub.rotation.z=Math.PI/2;root.add(hub);wheels.push(root);if(front)frontWheels.push(root);}
      if(state.kind==='car') {
        box(group,0,.48,0,1.8,.20,3.4,rubber);box(group,0,.73,0,1.78,.38,3.45,paint);
        box(group,0,1.2,-.22,1.55,.76,1.58,glass,{cast:false});box(group,0,1.62,-.22,1.62,.12,1.72,paint);
        for(const x of [-.76,.76])for(const z of [-.96,.53])box(group,x,1.24,z,.10,.68,.10,paint);
        box(group,0,.97,1.10,1.70,.08,1.06,paint);box(group,0,.82,-1.42,1.72,.16,.58,paint);
        for(const x of [-.91,.91])for(const z of [-1.14,1.14])wheel(x,z,.41,.28,z>0);
        doorPivot=new THREE.Group();doorPivot.position.set(.90,.78,.52);group.add(doorPivot);box(doorPivot,.40,0,0,.09,.58,1.02,paint);box(doorPivot,.405,.14,0,.07,.28,.84,glass,{cast:false});box(doorPivot,.43,.30,0,.08,.06,.9,paint);
        for(const x of [-.58,.58]){box(group,x,.80,1.74,.38,.16,.06,lamp,{cast:false});box(group,x,.8,-1.74,.4,.14,.06,mats.red);box(group,x,1.11,.35,.2,.09,.2,paint);}
        box(group,0,.55,1.76,1.68,.12,.08,chrome);box(group,0,.55,-1.76,1.68,.12,.08,chrome);
        for(const x of [-.35,.35])box(group,x,.57,-.10,.55,.12,.57,rubber);
      } else {
        wheel(0,-.85,.36,.16,false);wheel(0,.9,.36,.16,true);
        box(group,0,.58,0,.2,.16,1.7,chrome);box(group,0,.9,.21,.47,.37,.66,paint);
        box(group,0,.8,-.38,.42,.12,.80,rubber);box(group,0,.60,-.69,.49,.09,.5,paint);
        for(const x of [-.1,.1]){const fork=box(group,x,.72,.8,.06,.72,.06,chrome);fork.rotation.x=-.2;}
        box(group,0,1.08,.73,.70,.06,.07,chrome);for(const x of [-.33,.33])box(group,x,1.08,.73,.16,.08,.08,rubber);
        box(group,0,1.02,.89,.26,.20,.08,lamp);box(group,0,.80,-.84,.24,.10,.05,mats.red);
        box(group,.25,.48,-.45,.11,.11,.6,chrome);
      }
      const headlight=new THREE.PointLight(0xffdfa5,0,10,2);headlight.position.set(0,.90,state.kind==='car'?2:1.2);group.add(headlight);
      group.position.set(state.x,state.y,state.z);group.rotation.y=state.rotation;
      models.set(state.id,{group,wheels,frontWheels,headlight,doorPivot,state:{...state},motion:new LowkeyMotion.MotionBuffer(),predicted:{...state},driverRevision:0,wheelAngle:0});
    }
    function receive(world,arrival,serverNow) {
      for(const state of world.vehicles||[]) {
        const model=models.get(state.id);if(!model)continue;
        if(model.state.driverId!==state.driverId)model.driverRevision++;
        model.state={...state};model.authoritativeAt=world.serverTime;
        model.motion.push({x:state.x,y:state.y,z:state.z,rotation:state.rotation,motionTime:world.serverTime,motionReset:model.driverRevision,walking:Math.abs(state.speed)>.05,speed:Math.abs(state.speed)},arrival);
        model.pending={...state};model.pendingAge=Math.min(.2,Math.max(0,(serverNow-world.serverTime)/1000));
      }
    }
    function update(dt,now,serverNow,localId,input,night) {
      for(const model of models.values()) {
        const owned=localId&&model.state.driverId===localId;
        let pose;
        if(owned) {
          if(model.pending) {
            const expected=model.pending,steps=Math.ceil(model.pendingAge/.025);
            for(let i=0;i<steps;i++)LowkeyWorld.advanceVehicle(expected,input,model.pendingAge/steps);
            if(Math.hypot(model.predicted.x-expected.x,model.predicted.z-expected.z)>4||model.predicted.driverId!==expected.driverId)model.predicted={...expected};
            else model.correction={x:expected.x-model.predicted.x,z:expected.z-model.predicted.z,rotation:Math.atan2(Math.sin(expected.rotation-model.predicted.rotation),Math.cos(expected.rotation-model.predicted.rotation))};
            model.predicted.speed=expected.speed;model.predicted.steering=expected.steering;model.pending=null;
          }
          LowkeyWorld.advanceVehicle(model.predicted,input,dt);
          if(model.correction){const blend=1-Math.exp(-10*dt);for(const axis of ['x','z','rotation']){const delta=model.correction[axis]*blend;model.predicted[axis]+=delta;model.correction[axis]-=delta;}}
          pose=model.predicted;
        } else {pose=model.motion.sample(now,dt)||model.state;model.pending=null;}
        model.group.position.x=pose.x;model.group.position.z=pose.z;model.group.position.y=THREE.MathUtils.damp(model.group.position.y,pose.y,14,dt);model.group.rotation.y=pose.rotation;
        const speed=owned?model.predicted.speed:model.state.speed,steer=(owned?model.predicted.steering:model.state.steering)||0;
        model.group.rotation.z=THREE.MathUtils.damp(model.group.rotation.z,model.state.kind==='moto'?Math.max(-.24,Math.min(.24,steer*speed*.013)):0,8,dt);
        if(model.doorPivot){const age=(serverNow-(model.state.hijacking?.startedAt||0))/1000,progress=model.state.hijacking?Math.max(0,Math.min(1,age/.65)):0,open=model.state.wrecked?.35:Math.sin(progress*Math.PI)*.95;model.doorPivot.rotation.y=THREE.MathUtils.damp(model.doorPivot.rotation.y,-open,18,dt);model.group.rotation.x=THREE.MathUtils.damp(model.group.rotation.x,model.state.wrecked?.08:0,5,dt);}
        model.wheelAngle+=speed*dt/(model.state.kind==='car'?.41:.36);
        for(const wheel of model.wheels){wheel.rotation.x=model.wheelAngle;wheel.rotation.y=model.frontWheels.includes(wheel)?-steer*.35:0;}
        model.headlight.intensity=night*(model.state.kind==='car'?7:4);
      }
    }
    function active(id){if(!id)return null;return [...models.values()].find(model=>model.state.driverId===id||(model.state.passengerIds||[]).includes(id))||null;}
    function isDriver(id,model){return Boolean(id&&model?.state.driverId===id);}
    function canBoard(model){return Boolean(model&&!model.state.wrecked&&!model.state.hijacking&&(model.state.passengerIds||[]).length<(model.state.kind==='car'?1:1));}
    function driverPose(model){return LowkeyWorld.driverPose({...model.state,x:model.group.position.x,y:model.group.position.y,z:model.group.position.z,rotation:model.group.rotation.y});}
    function passengerPose(model,seat=0){return LowkeyWorld.passengerPose({...model.state,x:model.group.position.x,y:model.group.position.y,z:model.group.position.z,rotation:model.group.rotation.y},seat);}
    function pose(model,id){if(isDriver(id,model))return driverPose(model);const seat=(model.state.passengerIds||[]).indexOf(id);return seat>=0?passengerPose(model,seat):driverPose(model);}
    function nearest(position){return [...models.values()].filter(model=>!model.state.wrecked&&Math.hypot(position.x-model.group.position.x,position.z-model.group.position.z)<=3.2&&Math.abs(position.y-model.group.position.y)<1.5).sort((a,b)=>position.distanceTo(a.group.position)-position.distanceTo(b.group.position))[0]||null;}
    return{models,receive,update,active,isDriver,canBoard,driverPose,passengerPose,pose,nearest};
  }
  globalThis.LowkeyVehicles={create};
})();
