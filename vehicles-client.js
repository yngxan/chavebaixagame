(() => {
  function create({THREE,scene,box,mats}) {
    const models=new Map(),rubber=new THREE.MeshStandardMaterial({color:0x16191d,roughness:.95}),chrome=new THREE.MeshStandardMaterial({color:0xb9c3ce,metalness:.7,roughness:.3});
    const glass=new THREE.MeshStandardMaterial({color:0x152129,roughness:.18,metalness:.35});
    const trim=new THREE.MeshStandardMaterial({color:0x252b33,roughness:.55,metalness:.25}),seatMaterial=new THREE.MeshStandardMaterial({color:0x343d49,roughness:.9});
    const rearLamp=new THREE.MeshStandardMaterial({color:0xe83c40,emissive:0xbd1724,emissiveIntensity:.55,roughness:.3});
    const lamp=new THREE.MeshStandardMaterial({color:0xffe9bc,emissive:0xffdba0,emissiveIntensity:1});
    function addModel(state) {
      const group=new THREE.Group(),wheels=[],frontWheels=[];scene.add(group);let doorPivot=null;
      const paint=new THREE.MeshStandardMaterial({color:state.color||(state.kind==='car'?'#a7cd24':'#5067ed'),roughness:.36,metalness:.32});
      function panel(x,y,z,width,height,depth,topWidth,topDepth,mat=paint){
        const geometry=new THREE.BoxGeometry(width,height,depth),positions=geometry.attributes.position;
        for(let i=0;i<positions.count;i++)if(positions.getY(i)>0){positions.setX(i,positions.getX(i)*topWidth/width);positions.setZ(i,positions.getZ(i)*topDepth/depth);}
        geometry.userData.vehicleOwned=true;geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
      }
      function wheel(x,z,radius,width,front){const root=new THREE.Group();root.position.set(x,radius,z);group.add(root);const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,width,16),rubber);mesh.rotation.z=Math.PI/2;mesh.castShadow=true;root.add(mesh);const hub=new THREE.Mesh(new THREE.CylinderGeometry(radius*.67,radius*.67,width+.018,12),trim);hub.rotation.z=Math.PI/2;root.add(hub);for(const side of [-1,1]){for(let i=0;i<5;i++){const spoke=box(root,side*(width/2+.014),0,0,.018,radius*1.16,.055,chrome,{cast:false});spoke.rotation.x=i*Math.PI/5;}box(root,side*(width/2+.022),0,0,.026,.10,.10,chrome,{cast:false});}wheels.push(root);if(front)frontWheels.push(root);}
      if(state.kind==='car') {
        box(group,0,.48,0,1.8,.20,3.4,trim);panel(0,.73,0,1.78,.38,3.45,1.68,3.3);
        panel(0,1.29,-.22,1.58,.62,1.85,1.40,1.28,glass);
        box(group,0,1.62,-.22,1.48,.10,1.36,paint);
        const windshield=box(group,0,1.29,.56,1.4,.57,.035,glass,{cast:false});windshield.rotation.x=-.32;
        const rearWindow=box(group,0,1.29,-1.02,1.4,.55,.035,glass,{cast:false});rearWindow.rotation.x=.3;
        for(const x of [-.74,.74]){
          const frontPillar=box(group,x,1.3,.56,.065,.63,.065,paint);frontPillar.rotation.x=-.32;
          const rearPillar=box(group,x,1.3,-1.02,.075,.61,.075,paint);rearPillar.rotation.x=.3;
          box(group,x,1.3,-.37,.07,.58,.055,trim);
          if(x<0)box(group,x,1.31,.06,.025,.43,.77,glass,{cast:false});
          box(group,x,1.31,-.7,.025,.43,.47,glass,{cast:false});
          box(group,x*1.18,.52,0,.08,.09,2.3,trim);
          box(group,x*1.27,1.14,.5,.22,.12,.20,paint);
          box(group,x*1.4,1.14,.49,.025,.09,.15,glass,{cast:false});
        }
        const hood=panel(0,.96,1.14,1.7,.15,1.00,1.57,.90);hood.rotation.x=.08;
        box(group,0,.91,-1.42,1.72,.15,.58,paint);
        for(const x of [-.49,.49])box(group,x,.99,1.12,.04,.012,.83,trim,{cast:false});
        for(const x of [-.91,.91])for(const z of [-1.14,1.14])wheel(x,z,.41,.28,z>0);
        doorPivot=new THREE.Group();doorPivot.position.set(.90,.78,.52);group.add(doorPivot);box(doorPivot,.015,0,-.49,.065,.32,.98,paint);box(doorPivot,-.15,.53,-.43,.025,.43,.77,glass,{cast:false});box(doorPivot,-.13,.28,-.43,.07,.045,.88,trim);box(doorPivot,.06,.1,-.75,.025,.045,.15,chrome,{cast:false});
        box(group,-.90,.88,-.23,.025,.045,.15,chrome,{cast:false});
        for(const x of [-.61,.61]){box(group,x,.84,1.74,.4,.15,.065,lamp,{cast:false});box(group,x,.85,-1.74,.43,.12,.065,rearLamp,{cast:false});}
        box(group,0,.68,1.755,.73,.17,.025,trim);for(const y of [.64,.69,.74])box(group,0,y,1.775,.68,.012,.012,chrome,{cast:false});
        box(group,0,.54,1.76,1.68,.08,.10,trim);box(group,0,.54,-1.76,1.68,.08,.10,trim);
        box(group,0,.70,-1.765,.34,.09,.012,chrome,{cast:false});box(group,-.59,.48,-1.77,.15,.08,.15,chrome);
        for(const x of [-.40,.40]){box(group,x,.59,-.12,.52,.15,.57,seatMaterial);const back=box(group,x,.87,-.42,.52,.48,.12,seatMaterial);back.rotation.x=-.1;box(group,x,1.15,-.44,.27,.17,.13,seatMaterial);}
        box(group,0,.97,.39,1.36,.13,.23,trim);const steering=new THREE.Mesh(new THREE.TorusGeometry(.14,.027,6,12),trim);steering.position.set(.32,1.08,.26);steering.rotation.x=-.35;group.add(steering);
      } else {
        wheel(0,-.85,.36,.16,false);wheel(0,.9,.36,.16,true);
        box(group,0,.56,-.04,.22,.16,1.65,trim);
        const tank=box(group,0,.89,.21,.45,.30,.62,paint);tank.rotation.x=.12;
        panel(0,.66,.33,.59,.60,.98,.47,.72);
        const nose=panel(0,1.02,.72,.53,.39,.52,.40,.34);nose.rotation.x=-.20;
        const screen=panel(0,1.30,.65,.35,.32,.055,.27,.045,glass);screen.rotation.x=-.34;
        for(const x of [-.30,.30]){const fairing=box(group,x,.67,.25,.045,.34,.51,paint);fairing.rotation.z=x<0?-.12:.12;box(group,x*1.02,.72,.40,.025,.09,.24,trim);}
        box(group,0,1.05,.18,.18,.022,.13,chrome,{cast:false});
        const engine=new THREE.Mesh(new THREE.CylinderGeometry(.20,.21,.27,8),chrome);engine.position.set(0,.5,.04);engine.rotation.z=Math.PI/2;group.add(engine);
        for(const y of [.42,.48,.54,.60])box(group,0,y,.09,.40,.025,.31,trim,{cast:false});
        for(const x of [-.16,.16]){const frame=box(group,x,.61,-.11,.05,.52,.055,trim);frame.rotation.x=.7;box(group,x,.39,-.31,.055,.07,.62,chrome);}
        box(group,0,.83,-.29,.43,.12,.59,rubber);box(group,0,.88,-.64,.38,.12,.25,rubber);
        const tail=box(group,0,.75,-.75,.41,.14,.40,paint);tail.rotation.x=-.12;
        for(const z of [-.85,.9]){const fender=box(group,0,.73,z,.25,.07,.47,paint);fender.rotation.x=z>0?.07:-.15;}
        for(const x of [-.1,.1]){const fork=box(group,x,.73,.79,.065,.77,.065,chrome);fork.rotation.x=-.2;const shock=box(group,x,.56,-.68,.055,.36,.055,chrome);shock.rotation.x=.42;}
        box(group,0,1.10,.72,.70,.055,.065,chrome);for(const x of [-.33,.33]){box(group,x,1.10,.72,.16,.085,.085,rubber);const stem=box(group,x,1.25,.75,.025,.27,.025,chrome);stem.rotation.z=x<0?-.25:.25;box(group,x*1.14,1.36,.75,.18,.09,.05,trim);}
        box(group,0,1.06,.89,.27,.23,.14,trim);box(group,0,1.06,.98,.22,.16,.035,lamp,{cast:false});
        box(group,0,.80,-.95,.22,.075,.035,rearLamp,{cast:false});box(group,0,.63,-1.04,.16,.14,.025,chrome,{cast:false});
        for(const x of [-.26,.26]){box(group,x,.42,-.2,.18,.045,.08,trim);box(group,x,.46,-.63,.14,.035,.07,trim);}
        box(group,.27,.43,-.49,.13,.13,.75,chrome);box(group,.27,.43,-.88,.08,.08,.04,rubber);
      }
      const headlight=new THREE.PointLight(0xffdfa5,0,10,2);headlight.position.set(0,.90,state.kind==='car'?2:1.2);group.add(headlight);
      group.position.set(state.x,state.y,state.z);group.rotation.y=state.rotation;
      models.set(state.id,{group,wheels,frontWheels,headlight,doorPivot,paint,state:{...state},motion:new LowkeyMotion.MotionBuffer(),predicted:{...state},driverRevision:0,wheelAngle:0});
    }
    for(const state of LowkeyWorld.initialVehicles())addModel(state);
    function receive(world,arrival,serverNow) {
      const current=new Set((world.vehicles||[]).map(v=>v.id));
      for(const [id,model] of models)if(!current.has(id)){scene.remove(model.group);const geos=new Set();model.group.traverse(o=>{if(o.geometry&&(o.geometry.type!=='BoxGeometry'||o.geometry.userData.vehicleOwned))geos.add(o.geometry);});for(const g of geos)g.dispose();model.paint.dispose();model.headlight.dispose();models.delete(id);}
      for(const state of world.vehicles||[]) {
        if(!models.has(state.id))addModel(state);const model=models.get(state.id);
        if(model.state.driverId!==state.driverId)model.driverRevision++;
        model.state={...state};model.authoritativeAt=world.serverTime;
        model.paint.color.set(state.color||(state.kind==='car'?'#a7cd24':'#5067ed'));
        model.motion.push({x:state.x,y:state.y,z:state.z,rotation:state.rotation,motionTime:world.serverTime,motionReset:model.driverRevision,walking:Math.abs(state.speed)>.05,speed:Math.abs(state.speed)},arrival);
        model.pending={...state};model.pendingAge=Math.min(.2,Math.max(0,(serverNow-world.serverTime)/1000));
      }
    }
    function update(dt,now,serverNow,localId,input,night,localPosition) {
      const focus=localPosition||active(localId)?.group.position||new THREE.Vector3(),lit=new Set([...models.values()].filter(m=>m.group.position.distanceTo(focus)<28).sort((a,b)=>a.group.position.distanceToSquared(focus)-b.group.position.distanceToSquared(focus)).slice(0,4).map(m=>m.state.id));
      for(const model of models.values()) {
        const owned=localId&&model.state.driverId===localId;
        const obstacles=LowkeyWorld.vehicleObstacles(model.state,[...models.values()].map(other=>({...other.state,x:other.group.position.x,z:other.group.position.z}))),controls=model.state.wrecked||model.state.hijacking?{throttle:0,steer:0,brake:true}:input;
        let pose;
        if(owned) {
          if(model.pending) {
            const expected=model.pending,steps=Math.ceil(model.pendingAge/.025);
            for(let i=0;i<steps;i++){LowkeyWorld.advanceVehicle(expected,controls,model.pendingAge/steps,obstacles);if(expected.collision)break;}
            if(Math.hypot(model.predicted.x-expected.x,model.predicted.z-expected.z)>4||model.predicted.driverId!==expected.driverId||model.state.hijacking||model.state.wrecked){model.predicted={...expected};model.correction=null;}
            else model.correction={x:expected.x-model.predicted.x,z:expected.z-model.predicted.z,rotation:Math.atan2(Math.sin(expected.rotation-model.predicted.rotation),Math.cos(expected.rotation-model.predicted.rotation))};
            model.predicted.speed=expected.speed;model.predicted.steering=expected.steering;model.predicted.wheelieAngle=expected.wheelieAngle;model.pending=null;
          }
          LowkeyWorld.advanceVehicle(model.predicted,controls,dt,obstacles);
          if(model.correction){const blend=1-Math.exp(-10*dt),x=model.predicted.x+model.correction.x*blend,z=model.predicted.z+model.correction.z*blend;if(LowkeyWorld.vehicleClearAt(model.predicted,x,z,model.predicted.rotation+model.correction.rotation*blend,obstacles)){for(const axis of ['x','z','rotation']){const delta=model.correction[axis]*blend;model.predicted[axis]+=delta;model.correction[axis]-=delta;}}else model.correction=null;}
          pose=model.predicted;
        } else {pose=model.motion.sample(now,dt)||model.state;model.pending=null;}
        model.wheelieAngle=THREE.MathUtils.damp(model.wheelieAngle||0,(owned?model.predicted.wheelieAngle:model.state.wheelieAngle)||0,18,dt);
        const frame=LowkeyWorld.vehicleFrame({...model.state,x:pose.x,y:pose.y,z:pose.z,rotation:pose.rotation,wheelieAngle:model.wheelieAngle});
        model.group.position.set(frame.x,frame.y,frame.z);model.group.rotation.order='YXZ';model.group.rotation.x=frame.pitch;model.group.rotation.y=pose.rotation;
        const speed=owned?model.predicted.speed:model.state.speed,steer=(owned?model.predicted.steering:model.state.steering)||0;
        model.group.rotation.z=THREE.MathUtils.damp(model.group.rotation.z,model.state.kind==='moto'?Math.max(-.24,Math.min(.24,steer*speed*.013)):0,8,dt);
        if(model.doorPivot){const progress=model.state.hijacking?Math.max(0,Math.min(1,(serverNow-model.state.hijacking.startedAt)/LowkeyWorld.HIJACK_MS)):0,open=model.state.wrecked?.35:model.state.hijacking?Math.min(1,progress/.28)*Math.min(1,(1-progress)/.12)*1.05:0;model.doorPivot.rotation.y=THREE.MathUtils.damp(model.doorPivot.rotation.y,-open,18,dt);model.group.rotation.x=THREE.MathUtils.damp(model.group.rotation.x,model.state.wrecked?.08:0,5,dt);}
        model.wheelAngle+=speed*dt/(model.state.kind==='car'?.41:.36);
        for(const wheel of model.wheels){wheel.rotation.x=model.wheelAngle;wheel.rotation.y=model.frontWheels.includes(wheel)?-steer*.35:0;}
        model.headlight.visible=night>.01&&lit.has(model.state.id);model.headlight.intensity=night*(model.state.kind==='car'?7:4);
      }
    }
    function active(id){if(!id)return null;return [...models.values()].find(model=>model.state.driverId===id||(model.state.passengerIds||[]).includes(id))||null;}
    function isDriver(id,model){return Boolean(id&&model?.state.driverId===id);}
    function canBoard(model){return Boolean(model&&!model.state.wrecked&&!model.state.hijacking&&(!model.state.driverId||(model.state.passengerIds||[]).length<1));}
    function renderedState(model){const frame=LowkeyWorld.vehicleFrame({...model.state,x:0,y:0,z:0,rotation:model.group.rotation.y,wheelieAngle:model.wheelieAngle});return {...model.state,x:model.group.position.x-frame.x,y:model.group.position.y-frame.y,z:model.group.position.z-frame.z,rotation:model.group.rotation.y,wheelieAngle:model.wheelieAngle};}
    function driverPose(model){return LowkeyWorld.driverPose(renderedState(model));}
    function passengerPose(model,seat=0){return LowkeyWorld.passengerPose(renderedState(model),seat);}
    function interaction(model,position){return LowkeyWorld.vehicleInteraction(renderedState(model),position);}
    function pose(model,id){if(isDriver(id,model))return driverPose(model);const seat=(model.state.passengerIds||[]).indexOf(id);return seat>=0?passengerPose(model,seat):driverPose(model);}
    function nearest(position,predicate=()=>true){return [...models.values()].filter(model=>!model.state.wrecked&&predicate(model)&&Math.hypot(position.x-model.group.position.x,position.z-model.group.position.z)<=3.5&&Math.abs(position.y-model.group.position.y)<1.5).sort((a,b)=>position.distanceTo(a.group.position)-position.distanceTo(b.group.position))[0]||null;}
    function animateHijack(id,group,arms,legs,body,serverNow){
      const model=[...models.values()].find(item=>item.state.hijacking&&(item.state.hijacking.thiefId===id||item.state.hijacking.victimId===id));
      if(!model){if(group.userData.hijacking){group.userData.hijacking=false;group.scale.setScalar(1);body.rotation.set(0,0,0);for(const arm of arms){arm.rotation.set(0,0,0);arm.userData.forearm?.rotation.set(0,0,0);}for(const leg of legs)leg.rotation.set(0,0,0);}return false;}
      const victim=model.state.hijacking.victimId===id,state={...model.state,x:model.group.position.x,y:model.group.position.y,z:model.group.position.z,rotation:model.group.rotation.y},pose=LowkeyWorld.hijackPose(state,victim?'victim':'thief',serverNow),t=pose.progress;
      group.userData.hijacking=true;group.position.set(pose.x,pose.y,pose.z);group.rotation.y=pose.rotation;group.scale.setScalar(pose.scale);
      if(victim){body.rotation.set(-.15*Math.sin(pose.pull*Math.PI),0,-.2*Math.sin(pose.pull*Math.PI));for(const [i,arm] of arms.entries()){arm.rotation.set(-.8*(1-pose.pull),0,(i?1:-1)*(.12+Math.sin(pose.pull*Math.PI)*.35));arm.userData.forearm?.rotation.set(-.3,0,0);}for(const [i,leg] of legs.entries())leg.rotation.set(-1.35*(1-pose.pull)+Math.sin(pose.pull*Math.PI)*(i?-.25:.3),0,0);}
      else{const reach=Math.max(0,Math.min(1,(t-.12)/.13)),pull=pose.pull,enter=pose.enter;body.rotation.set(.18*reach*(1-enter)-.12*Math.sin(pull*Math.PI),0,-.08*Math.sin(pull*Math.PI));for(const [i,arm] of arms.entries()){const forward=i===0?reach:reach*Math.max(0,Math.min(1,(t-.27)/.1));arm.rotation.set(-1.45*forward*(1-enter)-1.1*enter,0,(i?1:-1)*.16);arm.userData.forearm?.rotation.set(-.2-forward*pull*.75,0,0);}for(const [i,leg] of legs.entries()){const stride=t<.22?Math.sin(t/.22*Math.PI*2)*(i?-.25:.25):0;leg.rotation.set(stride-1.35*enter-(i===0?Math.sin(enter*Math.PI)*.65:0),0,0);}}
      return true;
    }
    return{models,receive,update,active,isDriver,canBoard,interaction,driverPose,passengerPose,pose,nearest,animateHijack};
  }
  globalThis.LowkeyVehicles={create};
})();
