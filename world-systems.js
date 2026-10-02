(() => {
  const SEGMENT_MS = 15 * 60 * 1000, TRANSITION_MS = 10000;
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
    return [{id:'plaza-car',kind:'car',x:-14.5,y:-.05,z:5,rotation:Math.PI/2,speed:0,driverId:null},
      {id:'plaza-moto',kind:'moto',x:-13.5,y:-.05,z:8.8,rotation:Math.PI/2,speed:0,driverId:null}];
  }
  function advanceVehicle(vehicle, input, dt, obstacles = drivingObstacles) {
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
      if (!clearAt(x,z,radius,obstacles)) { vehicle.speed=0;vehicle.rotation=oldRotation;break; }
      vehicle.x=x;vehicle.z=z;
    }
    vehicle.y=groundHeight(vehicle.x,vehicle.z)??-.05;
    return vehicle;
  }
  function driverPose(vehicle) {
    const offset=vehicle.kind==='car'?.32:0,scale=vehicle.kind==='car'?.62:.85;
    return {x:vehicle.x+Math.cos(vehicle.rotation)*offset,y:vehicle.y+(vehicle.kind==='car'?-.015:.02),z:vehicle.z-Math.sin(vehicle.rotation)*offset,rotation:vehicle.rotation,scale};
  }
  function exitPosition(vehicle) {
    const radius=vehicle.kind==='car'?1.05:.46;
    for (const [side,forward] of [[1,0],[-1,0],[0,-1],[0,1]]) {
      const distance=radius+1.05,x=vehicle.x+Math.cos(vehicle.rotation)*side*distance+Math.sin(vehicle.rotation)*forward*distance,z=vehicle.z-Math.sin(vehicle.rotation)*side*distance+Math.cos(vehicle.rotation)*forward*distance;
      if (clearAt(x,z,.34))return{x,y:groundHeight(x,z),z};
    }
    return null;
  }
  globalThis.LowkeyWorld={SEGMENT_MS,daylight,groundHeight,initialVehicles,advanceVehicle,driverPose,exitPosition,clearAt,drivingObstacles};
})();
