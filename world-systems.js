(() => {
  const SEGMENT_MS = 15 * 60 * 1000, TRANSITION_MS = 10000, HIJACK_MS=1800;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function daylight(now) {
    const phase = Math.floor(now / SEGMENT_MS) % 2, elapsed = now % SEGMENT_MS;
    const t = clamp(elapsed / TRANSITION_MS, 0, 1), blend = t * t * (3 - 2 * t);
    return phase ? 1 - blend : blend;
  }
  function groundHeight(x, z) {
    if (Math.abs(x) > 50 || Math.abs(z) > 50) return null;
    let height = -.05;
    if (Math.abs(x) <= 8 && Math.abs(z) <= 24) height = .045;
    if ((Math.abs(x) <= 6.5 && Math.abs(z) <= 14) || (Math.abs(x) <= 13 && Math.abs(z) <= 9)) height = .1;
    if (Math.abs(x) <= 11 && Math.abs(z) <= 7) height = .18;
    return height;
  }
  const drivingObstacles = [{x:0,z:-11.7,hx:7.1,hz:4.1}];
  for (const [x,z,size] of [[-18,-19,1.5],[-9,-25,1.25],[10,-25,1.35],[21,-18,1.55],[-24,-7,1.4],[24,-3,1.3],[-22,12,1.35],[22,15,1.45],[-13,24,1.45],[1,27,1.3],[14,23,1.55],[-29,4,1.3],[30,9,1.3]]) drivingObstacles.push({x,z,r:.58*size});
  for (const [x,z,rot] of [[-6,2,Math.PI/2],[6,2,-Math.PI/2],[-5,-4,Math.PI/4],[5,-4,-Math.PI/4]]) drivingObstacles.push({x,z,hx:1.3,hz:.48,rot});
  for (const [x,z] of [[-10,-4],[10,-4],[-10,8],[10,8]]) drivingObstacles.push({x,z,r:.13});
  const combatObstacles=[{x:0,z:-11.7,hx:6.7,hz:3.35,minY:0,maxY:1.15}];
  const standingPlatforms=[{x:0,z:-11.7,hx:6.7,hz:3.35,y:1.15}];
  for(let i=0;i<4;i++)standingPlatforms.push({x:-4.35,z:-11.7+4.59-i*.39,hx:.875,hz:.23,y:.27*(i+1)});
  for(const obstacle of drivingObstacles.slice(1)){
    if(obstacle.r!==undefined)combatObstacles.push({...obstacle,hx:obstacle.r*.71,hz:obstacle.r*.71,minY:0,maxY:obstacle.r>.2?3.1*obstacle.r/.58:3.44});
    else{combatObstacles.push({...obstacle,hx:1.25,hz:.09,offsetZ:-.27,minY:.61,maxY:1.51});standingPlatforms.push({...obstacle,hx:1.25,hz:.36,y:.66});}
  }
  function supportHeight(x,z){let height=groundHeight(x,z);if(height===null)return null;for(const p of standingPlatforms){const c=Math.cos(p.rot||0),s=Math.sin(p.rot||0),dx=x-p.x,dz=z-p.z;if(Math.abs(dx*c-dz*s)<=p.hx+.1&&Math.abs(dx*s+dz*c)<=p.hz+.1)height=Math.max(height,p.y);}return height;}
  function keepCameraAboveGround(position,clearance=.32){const floor=supportHeight(position.x,position.z)??-.05;if(position.y<floor+clearance)position.y=floor+clearance;return position;}
  function boxHit(from,to,obstacle,padding=0){
    const c=Math.cos(obstacle.rot||0),s=Math.sin(obstacle.rot||0);
    const transform=p=>[(p.x-obstacle.x)*c-(p.z-obstacle.z)*s,(p.y), (p.x-obstacle.x)*s+(p.z-obstacle.z)*c-(obstacle.offsetZ||0)];
    const a=transform(from),b=transform(to),lo=[-obstacle.hx-padding,obstacle.minY??0,-obstacle.hz-padding],hi=[obstacle.hx+padding,obstacle.maxY??3.5,obstacle.hz+padding];let enter=0,exit=1;
    for(let i=0;i<3;i++){const delta=b[i]-a[i];if(Math.abs(delta)<1e-9){if(a[i]<lo[i]||a[i]>hi[i])return null;continue;}const t1=(lo[i]-a[i])/delta,t2=(hi[i]-a[i])/delta;enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));if(enter>exit)return null;}
    return enter<=1&&exit>=0?Math.max(0,enter):null;
  }
  function shotBlock(from,to,vehicles=[]){let nearest=null;const obstacles=[...combatObstacles,...vehicles.map(v=>({x:v.x,z:v.z,rot:v.rotation,hx:v.kind==='car'?.86:.2,hz:v.kind==='car'?1.7:.55,minY:v.y+.35,maxY:v.y+(v.kind==='car'?1.65:.95)}))];for(const obstacle of obstacles){const t=boxHit(from,to,obstacle);if(t!==null&&(nearest===null||t<nearest))nearest=t;}return nearest;}
  function crossesSolid(from,to){if(from.y>=5||to.y<-.3)return false;for(const obstacle of combatObstacles){if(to.y>=obstacle.maxY-.12||from.y>=obstacle.maxY-.12)continue;const t=boxHit({...from,y:from.y+.75},{...to,y:to.y+.75},obstacle,.18);if(t!==null&&t>.01&&t<.99)return true;}return false;}
  function clearAt(x, z, radius, obstacles = drivingObstacles) {
    if (Math.abs(x) > 49-radius || Math.abs(z) > 49-radius) return false;
    for (const obstacle of obstacles) {
      const dx=x-obstacle.x, dz=z-obstacle.z;
      if (obstacle.r !== undefined) { if (Math.hypot(dx,dz) < obstacle.r+radius) return false; }
      else {
        const c=Math.cos(obstacle.rot||0),s=Math.sin(obstacle.rot||0);
        const lx=dx*c-dz*s,lz=dx*s+dz*c;
        if (Math.hypot(Math.max(0,Math.abs(lx)-obstacle.hx),Math.max(0,Math.abs(lz)-obstacle.hz)) < radius) return false;
      }
    }
    return true;
  }
  function initialVehicles() {
    return [{id:'plaza-car',kind:'car',x:-14.5,y:-.05,z:5,rotation:Math.PI/2,speed:0,driverId:null,passengerIds:[],health:250,wrecked:false,wheelieAngle:0},
      {id:'plaza-moto',kind:'moto',x:-13.5,y:-.05,z:8.8,rotation:Math.PI/2,speed:0,driverId:null,passengerIds:[],health:100,wrecked:false,wheelieAngle:0}];
  }
  function vehicleInteraction(vehicle,position) {
    const dx=position.x-vehicle.x,dz=position.z-vehicle.z,c=Math.cos(vehicle.rotation),s=Math.sin(vehicle.rotation);
    const seat=vehicle.kind==='car'?(dx*c-dz*s>=0?'driver':'passenger'):(dx*s+dz*c>=-.34?'driver':'passenger');
    return {seat,action:seat==='driver'&&vehicle.driverId?'steal':'enter',blocked:Boolean(vehicle.wrecked||vehicle.hijacking||(seat==='passenger'&&(vehicle.passengerIds||[]).length>=1))};
  }
  function advanceVehicle(vehicle, input, dt, obstacles = drivingObstacles) {
    vehicle.collision=null;
    dt=clamp(dt,0,.05);const moto=vehicle.kind==='moto',throttle=clamp(Number(input.throttle)||0,-1,1),steer=clamp(Number(input.steer)||0,-1,1);
    const maximum=moto?27:22,acceleration=moto?11:9,radius=moto?.46:1.05;
    if (input.brake) vehicle.speed *= Math.exp(-8*dt);
    else if (throttle) {
      if (vehicle.speed*throttle<0) vehicle.speed *= Math.exp(-6*dt);
      vehicle.speed=clamp(vehicle.speed+throttle*acceleration*dt,-6,maximum);
    } else vehicle.speed *= Math.exp(-1.8*dt);
    if (Math.abs(vehicle.speed)<.035)vehicle.speed=0;
    const oldRotation=vehicle.rotation;
    // Ease the steering rack back to center instead of instantly flipping lock.
    vehicle.steering=(Number(vehicle.steering)||0)+(steer-(Number(vehicle.steering)||0))*(1-Math.exp(-7*dt));
    // Reduce steering lock at speed and bound yaw rate to avoid spinning in place.
    const steeringAngle=vehicle.steering*(moto?.43:.50)/(1+Math.abs(vehicle.speed)*.055);
    const yawRate=clamp(-vehicle.speed*Math.tan(steeringAngle)/(moto?1.75:2.55),-1.25,1.25);
    vehicle.rotation += yawRate*dt;
    vehicle.rotation=Math.atan2(Math.sin(vehicle.rotation),Math.cos(vehicle.rotation));
    const middleRotation=oldRotation+yawRate*dt*.5;
    const dx=Math.sin(middleRotation)*vehicle.speed*dt,dz=Math.cos(middleRotation)*vehicle.speed*dt;
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
    for(let step=0;step<steps;step++) {
      const x=vehicle.x+dx/steps,z=vehicle.z+dz/steps;
      if (!clearAt(x,z,radius,obstacles)) { const obstacle=clearAt(x,z,radius,[])?obstacles.find(item=>!clearAt(x,z,radius,[item])):null;vehicle.collision={vehicleId:obstacle?.vehicleId||null,speed:Math.abs(vehicle.speed)};vehicle.speed=0;vehicle.rotation=oldRotation;break; }
      vehicle.x=x;vehicle.z=z;
    }
    vehicle.y=groundHeight(vehicle.x,vehicle.z)??-.05;
    const wheelieTarget=moto&&input.wheelie&&!input.brake&&!vehicle.collision&&!vehicle.wrecked&&!vehicle.hijacking&&vehicle.speed>2.8&&throttle>=0?.60:0;
    vehicle.wheelieAngle=moto?(Number(vehicle.wheelieAngle)||0)+(wheelieTarget-(Number(vehicle.wheelieAngle)||0))*(1-Math.exp(-(wheelieTarget?6:9)*dt)):0;
    return vehicle;
  }
  function vehicleFrame(vehicle) {
    const angle=vehicle.kind==='moto'?clamp(Number(vehicle.wheelieAngle)||0,0,.60):0,shift=-.85*(1-Math.cos(angle))+.36*Math.sin(angle);
    return {x:vehicle.x+Math.sin(vehicle.rotation)*shift,y:vehicle.y+.36*(1-Math.cos(angle))+.85*Math.sin(angle),z:vehicle.z+Math.cos(vehicle.rotation)*shift,pitch:-angle};
  }
  function seatPose(vehicle,offset,scale) {
    const frame=vehicleFrame(vehicle),angle=-frame.pitch,c=Math.cos(vehicle.rotation),s=Math.sin(vehicle.rotation),z=offset.z*Math.cos(angle)-offset.y*Math.sin(angle);
    return {x:frame.x+offset.x*c+z*s,y:frame.y+offset.y*Math.cos(angle)+offset.z*Math.sin(angle),z:frame.z-offset.x*s+z*c,rotation:vehicle.rotation,pitch:frame.pitch,scale};
  }
  function driverPose(vehicle) {
    const offset=vehicle.kind==='car'?.32:0,scale=vehicle.kind==='car'?.62:.85;
    return seatPose(vehicle,{x:offset,y:vehicle.kind==='car'?-.015:.02,z:0},scale);
  }
  function passengerPose(vehicle,seat=0) {
    const offset=vehicle.kind==='car'?{x:-.48,z:-.08}:{x:0,z:-.67};
    return {...seatPose(vehicle,{...offset,y:vehicle.kind==='car'?-.015:.02},vehicle.kind==='car'?.62:.85),seat};
  }
  function exitPosition(vehicle) {
    const radius=vehicle.kind==='car'?1.05:.46;
    for (const [side,forward] of [[1,0],[-1,0],[0,-1],[0,1]]) {
      const distance=radius+1.05,x=vehicle.x+Math.cos(vehicle.rotation)*side*distance+Math.sin(vehicle.rotation)*forward*distance,z=vehicle.z-Math.sin(vehicle.rotation)*side*distance+Math.cos(vehicle.rotation)*forward*distance;
      if (clearAt(x,z,.34))return{x,y:groundHeight(x,z),z};
    }
    return null;
  }
  function vehicleObstacles(vehicle,records){return [...drivingObstacles,...[...records].filter(other=>other.id!==vehicle.id).map(other=>({x:other.x,z:other.z,r:other.kind==='car'?1.05:.46,vehicleId:other.id}))];}
  function hijackPose(vehicle,role,now){
    const action=vehicle.hijacking;if(!action)return null;
    const progress=clamp((now-action.startedAt)/HIJACK_MS,0,1),smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);},seat=driverPose(vehicle),outside=action.outside;
    const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
    const approach=mix(outside,seat,.38);approach.y=groundHeight(approach.x,approach.z)??vehicle.y;
    if(role==='victim'){
      const pull=smooth((progress-.32)/.38),position=mix(action.from,outside,pull);
      position.y+=Math.sin(pull*Math.PI)*.12;
      return {...position,rotation:vehicle.rotation+pull*.7,scale:seat.scale+(1-seat.scale)*pull,progress,pull,enter:0};
    }
    const arrive=smooth(progress/.22),enter=smooth((progress-.7)/.3),position=mix(mix(action.thiefFrom||outside,approach,arrive),seat,enter);
    position.y+=Math.sin(enter*Math.PI)*.1;
    const face=Math.atan2(seat.x-approach.x,seat.z-approach.z),turn=Math.atan2(Math.sin(vehicle.rotation-face),Math.cos(vehicle.rotation-face));
    return {...position,rotation:face+turn*enter,scale:1+(seat.scale-1)*enter,progress,pull:smooth((progress-.32)/.38),enter};
  }
  globalThis.LowkeyWorld={SEGMENT_MS,HIJACK_MS,daylight,groundHeight,supportHeight,keepCameraAboveGround,shotBlock,crossesSolid,initialVehicles,advanceVehicle,vehicleInteraction,vehicleFrame,driverPose,passengerPose,exitPosition,clearAt,drivingObstacles,vehicleObstacles,hijackPose};
})();
