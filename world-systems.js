(() => {
  const SEGMENT_MS = 15 * 60 * 1000, TRANSITION_MS = 10000, HIJACK_MS=1800;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const CAR_SCALE=1.3;
  const city=LowkeyCityLayout,MAP_HALF_SIZE=city.MAP_HALF_SIZE;
  const groundSurfaces=[...city.surfaces,...city.expansionSurfaces,...city.bridgeSurfaces,...city.coast.surfaces,...city.entrances],groundCells=new Map(),GROUND_CELL=32;
  for(const p of groundSurfaces){const c=Math.abs(Math.cos(p.rot||0)),s=Math.abs(Math.sin(p.rot||0)),hx=p.hx*c+p.hz*s,hz=p.hz*c+p.hx*s;for(let x=Math.floor((p.x-hx)/GROUND_CELL);x<=Math.floor((p.x+hx)/GROUND_CELL);x++)for(let z=Math.floor((p.z-hz)/GROUND_CELL);z<=Math.floor((p.z+hz)/GROUND_CELL);z++){const key=`${x}:${z}`,cell=groundCells.get(key)||[];cell.push(p);groundCells.set(key,cell);}}
  function daylight(now) {
    const phase = Math.floor(now / SEGMENT_MS) % 2, elapsed = now % SEGMENT_MS;
    const t = clamp(elapsed / TRANSITION_MS, 0, 1), blend = t * t * (3 - 2 * t);
    return phase ? 1 - blend : blend;
  }
  function groundHeight(x, z, maximumY=Infinity) {
    const kind=city.groundKind(x,z);if(kind===null)return null;
    let height = (Math.abs(x)<=MAP_HALF_SIZE&&Math.abs(z)<=MAP_HALF_SIZE)||city.islandAt(x,z)?(kind==='sand'&&Math.abs(x)<=120&&z>=172?city.beachHeight(x,z):-.05):-Infinity;
    // At shared edges the higher adjacent surface supports feet on both peers.
    for(const surface of groundCells.get(`${Math.floor(x/GROUND_CELL)}:${Math.floor(z/GROUND_CELL)}`)||[]){const y=city.surfaceHeight(surface,x,z);if(y<=maximumY&&city.inRect(x,z,surface))height=Math.max(height,y);}
    if (Math.abs(x) <= 8 && Math.abs(z) <= 24) height = Math.max(height,.045);
    if ((Math.abs(x) <= 6.5 && Math.abs(z) <= 14) || (Math.abs(x) <= 13 && Math.abs(z) <= 9)) height = Math.max(height,.1);
    if (Math.abs(x) <= 11 && Math.abs(z) <= 7) height = Math.max(height,.18);
    return height===-Infinity||height>maximumY?null:height;
  }
  // Same wave function in physics and the water shader, synchronized to room time.
  function waterHeight(x,z,serverTime){const t=(serverTime/1000)%10000;return city.coast.waterY+Math.sin(x*.095+z*.055-t*.85)*.17+Math.sin(x*-.06+z*.14-t*1.15)*.075;}
  function waterAt(position){const {x,y,z}=position,b=city.bounds;if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)return false;const kind=city.groundKind(x,z),floor=groundHeight(x,z);return kind===null||kind==='sand'&&floor<city.coast.waterY-.2||kind==='pier'&&y<1.1||kind==='bridge'&&y<(floor??Infinity)-.3&&groundHeight(x,z,city.coast.waterY+1)===null;}
  function isSwimming(position,serverTime){return waterAt(position)&&position.y<=waterHeight(position.x,position.z,serverTime)+.12;}
  function advanceSwimmer(position,dx,dz,dt,serverTime,move=null){
    const previous={...position};if(move)move(position,dx,dz);else{position.x+=dx;position.z+=dz;}
    const b=city.bounds;position.x=clamp(position.x,b.minX+1.5,b.maxX-1.5);position.z=clamp(position.z,b.minZ+1.5,b.maxZ-1.5);
    const floor=groundHeight(position.x,position.z,city.groundKind(position.x,position.z)==='bridge'?city.coast.waterY+1:Infinity);
    if(!waterAt(position)){
      if(floor!==null&&floor<=.2){position.y=floor;return false;}
      // You cannot climb from underneath the pier straight through its deck.
      position.x=previous.x;position.z=previous.z;
    }
    const surface=waterHeight(position.x,position.z,serverTime),target=surface-1.27;
    position.y+=(target-position.y)*(1-Math.exp(-5*dt));return true;
  }
  const drivingObstacles = [];
  const combatObstacles=[];
  const standingPlatforms=[...city.festivalPlatforms];
  for(const obstacle of drivingObstacles){
    if(obstacle.r!==undefined)combatObstacles.push({...obstacle,hx:obstacle.r*.71,hz:obstacle.r*.71,minY:0,maxY:obstacle.r>.2?3.1*obstacle.r/.58:3.44});
    else{combatObstacles.push({...obstacle,hx:1.25,hz:.09,offsetZ:-.27,minY:.61,maxY:1.51});standingPlatforms.push({...obstacle,hx:1.25,hz:.36,y:.66});}
  }
  drivingObstacles.push(...city.obstacles);
  combatObstacles.push(...city.obstacles.map(o=>o.r===undefined?o:{...o,hx:o.r,hz:o.r}));
  const supportPlatforms=[...standingPlatforms,...(city.interiorPlatforms||[]),...(city.elevatedPlatforms||[])];
  function supportHeight(x,z,maximumY=Infinity){let height=groundHeight(x,z,city.groundKind(x,z)==='bridge'?maximumY:Infinity);if(height===null)return null;for(const p of supportPlatforms){const c=Math.cos(p.rot||0),s=Math.sin(p.rot||0),dx=x-p.x,dz=z-p.z;if(p.y<=maximumY&&Math.abs(dx*c-dz*s)<=p.hx+.1&&Math.abs(dx*s+dz*c)<=p.hz+.1)height=Math.max(height,p.y);}return height;}
  function keepCameraAboveGround(position,clearance=.32){const floor=supportHeight(position.x,position.z,position.y)??-.05;if(position.y<floor+clearance)position.y=floor+clearance;return position;}
  function constrainCamera(target,position,clearance=.25){
    const length=Math.hypot(position.x-target.x,position.y-target.y,position.z-target.z);if(length<.001)return position;
    let nearest=1;
    for(const obstacle of combatObstacles){const t=boxHit(target,position,obstacle,.12);if(t!==null&&t>.001)nearest=Math.min(nearest,t);}
    if(nearest<1){const t=Math.max(0,nearest-clearance/length);position.x=target.x+(position.x-target.x)*t;position.y=target.y+(position.y-target.y)*t;position.z=target.z+(position.z-target.z)*t;}
    return position;
  }
  function boxHit(from,to,obstacle,padding=0){
    const c=Math.cos(obstacle.rot||0),s=Math.sin(obstacle.rot||0);
    const transform=p=>[(p.x-obstacle.x)*c-(p.z-obstacle.z)*s,p.y-(obstacle.slopeX||0)*(p.x-obstacle.x),(p.x-obstacle.x)*s+(p.z-obstacle.z)*c-(obstacle.offsetZ||0)];
    const a=transform(from),b=transform(to),lo=[-obstacle.hx-padding,obstacle.minY??0,-obstacle.hz-padding],hi=[obstacle.hx+padding,obstacle.maxY??3.5,obstacle.hz+padding];let enter=0,exit=1;
    for(let i=0;i<3;i++){const delta=b[i]-a[i];if(Math.abs(delta)<1e-9){if(a[i]<lo[i]||a[i]>hi[i])return null;continue;}const t1=(lo[i]-a[i])/delta,t2=(hi[i]-a[i])/delta;enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));if(enter>exit)return null;}
    return enter<=1&&exit>=0?Math.max(0,enter):null;
  }
  function shotBlock(from,to,vehicles=[]){let nearest=null;const obstacles=[...combatObstacles,...vehicles.map(v=>({x:v.x,z:v.z,rot:v.rotation,hx:v.kind==='boat'?1.4:v.kind==='jetski'?.45:v.kind==='car'?.86*CAR_SCALE:.2,hz:v.kind==='boat'?3.25:v.kind==='jetski'?1.25:v.kind==='car'?1.7*CAR_SCALE:.55,minY:v.y+(isWatercraft(v)?-.1:.35),maxY:v.y+(v.kind==='car'?1.65*CAR_SCALE:v.kind==='boat'?1.4:.95)}))];for(const obstacle of obstacles){const t=boxHit(from,to,obstacle);if(t!==null&&(nearest===null||t<nearest))nearest=t;}return nearest;}
  function crossesSolid(from,to){if(to.y<-.3)return false;for(const obstacle of combatObstacles){if(to.y>=obstacle.maxY-.12||from.y>=obstacle.maxY-.12)continue;const t=boxHit({...from,y:from.y+.75},{...to,y:to.y+.75},obstacle,.18);if(t!==null&&t>.01&&t<.99)return true;}return false;}
  function clearAt(x, z, radius, obstacles = drivingObstacles,probeHeight=null) {
    const bounds=city.bounds;
    if (x<bounds.minX+1+radius||x>bounds.maxX-1-radius||z<bounds.minZ+1+radius||z>bounds.maxZ-1-radius) return false;
    // The ground depends on the probe, not on each obstacle in the whole city.
    const floor=probeHeight===null?groundHeight(x,z):drivingFloor(x,z,probeHeight);if(floor===null)return false;
    for (const obstacle of obstacles) {
      const height=probeHeight??floor;
      if(obstacle.kind==='bridge-floor'){const lower=obstacle.minY+(obstacle.slopeX||0)*(x-obstacle.x),upper=obstacle.maxY+(obstacle.slopeX||0)*(x-obstacle.x);if(upper<=height+.4||lower>=height+1.8)continue;const dx=x-obstacle.x,dz=z-obstacle.z;if(Math.abs(dx)<obstacle.hx+radius&&Math.abs(dz)<obstacle.hz+radius)return false;continue;}
      if((obstacle.minY!==undefined&&obstacle.minY>height+1.8)||(obstacle.maxY!==undefined&&obstacle.maxY<height+.02))continue;
      const dx=x-obstacle.x, dz=z-obstacle.z;
      const reach=(obstacle.r??Math.hypot(obstacle.hx,obstacle.hz))+radius;
      if(Math.abs(dx)>reach||Math.abs(dz)>reach)continue;
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
    return [...city.garageBays.map(b=>garageVehicle(b)),...city.coast.marinaBays.map(b=>marinaVehicle(b))];
  }
  const isWatercraft=vehicle=>vehicle.kind==='jetski'||vehicle.kind==='boat';
  const passengerCapacity=vehicle=>vehicle.kind==='boat'?9:1;
  function marinaVehicle(bay,id=bay.id){return{id,kind:bay.kind,x:bay.x,y:city.coast.waterY,z:bay.z,rotation:bay.rotation,speed:0,steering:0,driverId:null,passengerIds:[],health:bay.kind==='boat'?250:100,wrecked:false,wheelieAngle:0,marinaBay:bay.id};}
  function replenishMarina(records,now){const added=[];for(const bay of city.coast.marinaBays){const stock=[...records.values()].find(v=>v.marinaBay===bay.id);if(stock&&!stock.wrecked&&Math.hypot(stock.x-bay.x,stock.z-bay.z)<7)continue;if(stock)stock.marinaBay=null;
    if(records.size>=48||[...records.values()].some(v=>Math.hypot(v.x-bay.x,v.z-bay.z)<(v.kind==='boat'?6:3)))continue;
    const next=marinaVehicle(bay,bay.id+'-'+now+'-'+records.size);records.set(next.id,next);added.push(next);
  }return added;}
  function garageVehicle(bay,id=bay.id){return{id,kind:bay.kind,x:bay.x,y:groundHeight(bay.x,bay.z),z:bay.z,rotation:bay.rotation,speed:0,steering:0,driverId:null,passengerIds:[],health:bay.kind==='car'?250:100,wrecked:false,wheelieAngle:0,garageBay:bay.id};}
  function replenishGarage(records,now){
    const added=[];for(const bay of city.garageBays){const stock=[...records.values()].find(v=>v.garageBay===bay.id);
      if(stock&&!stock.wrecked&&Math.hypot(stock.x-bay.x,stock.z-bay.z)<5)continue;
      if(stock)stock.garageBay=null;
      // Do not spawn a replacement on top of a parked or abandoned vehicle.
      if([...records.values()].some(v=>Math.hypot(v.x-bay.x,v.z-bay.z)<(v.kind==='car'?2.9:1.7)))continue;
      if(records.size>=48){const unused=[...records.values()].find(v=>v.id.startsWith('garage-')&&!v.garageBay&&!v.driverId&&!v.passengerIds?.length&&!v.hijacking);if(!unused)continue;records.delete(unused.id);}
      const id=bay.id+'-'+now+'-'+records.size,next=garageVehicle(bay,id);records.set(id,next);added.push(next);
    }return added;
  }
  function expireUnoccupiedVehicles(records,now,timeout=180000){
    const expired=[];
    for(const [id,vehicle] of records){
      if(vehicle.garageBay||vehicle.marinaBay||vehicle.hijacking)continue;
      const occupied=Boolean(vehicle.driverId||vehicle.passengerIds?.some(Boolean));
      if(occupied){delete vehicle.unoccupiedSince;continue;}
      if(!Number.isFinite(vehicle.unoccupiedSince)){vehicle.unoccupiedSince=now;continue;}
      if(now-vehicle.unoccupiedSince<timeout)continue;
      records.delete(id);expired.push(id);
    }
    return expired;
  }
  function vehicleClearAt(vehicle,x,z,rotation=vehicle.rotation,obstacles=drivingObstacles){
    if(isWatercraft(vehicle))return watercraftClearAt(vehicle,x,z,rotation,obstacles);
    const moto=vehicle.kind==='moto',radius=moto?.29:.78*CAR_SCALE;
    if(moto)return !motoContact(vehicle,x,z,rotation,obstacles);
    return [-1,0,1].every(side=>clearAt(x+Math.sin(rotation)*side*1.18*CAR_SCALE,z+Math.cos(rotation)*side*1.18*CAR_SCALE,radius,obstacles,vehicle.y));
  }
  function drivingFloor(x,z,y=0){return groundHeight(x,z,city.groundKind(x,z)==='bridge'?y+.4:Infinity);}
  function motoContact(vehicle,x,z,rotation,obstacles){
    const bounds=city.bounds;if(x<bounds.minX+1.3||x>bounds.maxX-1.3||z<bounds.minZ+1.3||z>bounds.maxZ-1.3||(!vehicle.airborne&&groundHeight(x,z)===null))return{part:'boundary',obstacle:null};
    const frame=vehicleFrame({...vehicle,x,z,rotation}),angle=-frame.pitch,c=Math.cos(angle),s=Math.sin(angle);
    // Contact points match the visible wheels and the engine's lower centre.
    for(const [part,localY,localZ,radius] of [['belly',.48,.08,.30],['rear-wheel',.36,-.85,.36],['front-wheel',.36,.90,.36]]){
      const y=frame.y+localY*c+localZ*s,forward=localZ*c-localY*s,px=frame.x+Math.sin(rotation)*forward,pz=frame.z+Math.cos(rotation)*forward;
      for(const obstacle of obstacles){
        const slope=obstacle.kind==='bridge-floor'?(obstacle.slopeX||0)*(px-obstacle.x):0,minY=(obstacle.minY??-.05)+slope,maxY=(obstacle.maxY??Infinity)+slope;
        if(obstacle.kind==='bridge-floor'&&!vehicle.airborne&&maxY<=vehicle.y+.4)continue;
        const dy=Math.max(0,minY-y,y-maxY),dx=px-obstacle.x,dz=pz-obstacle.z;
        // A raised front tyre brushes the rail; the belly/rear contact hooks it.
        if(part==='front-wheel'&&!vehicle.airborne&&vehicle.wheelieAngle>.24&&obstacle.kind==='rail'&&y-radius>(groundHeight(x,z)??vehicle.y)+.65)continue;
        if(dy>=radius)continue;
        let horizontal;
        if(obstacle.r!==undefined)horizontal=Math.max(0,Math.hypot(dx,dz)-obstacle.r);
        else{const oc=Math.cos(obstacle.rot||0),os=Math.sin(obstacle.rot||0),lx=dx*oc-dz*os,lz=dx*os+dz*oc;horizontal=Math.hypot(Math.max(0,Math.abs(lx)-obstacle.hx),Math.max(0,Math.abs(lz)-obstacle.hz));}
        if(horizontal*horizontal+dy*dy<radius*radius)return{part,obstacle,y,lower:y-radius};
      }
    }
    return null;
  }
  function vehicleInteraction(vehicle,position) {
    if(isWatercraft(vehicle)){const seat=vehicle.driverId?'passenger':'driver';return{seat,action:'enter',blocked:Boolean(vehicle.wrecked||vehicle.hijacking||seat==='passenger'&&(vehicle.passengerIds||[]).length>=passengerCapacity(vehicle))};}
    const dx=position.x-vehicle.x,dz=position.z-vehicle.z,c=Math.cos(vehicle.rotation),s=Math.sin(vehicle.rotation);
    const seat=vehicle.kind==='car'?(dx*c-dz*s>=0?'driver':'passenger'):(dx*s+dz*c>=-.34?'driver':'passenger');
    return {seat,action:seat==='driver'&&vehicle.driverId?'steal':'enter',blocked:Boolean(vehicle.wrecked||vehicle.hijacking||(seat==='passenger'&&(vehicle.passengerIds||[]).length>=1))};
  }
  function advanceVehicle(vehicle, input, dt, obstacles = drivingObstacles) {
    if(isWatercraft(vehicle))return advanceWatercraft(vehicle,input,dt,obstacles);
    vehicle.collision=null;
    dt=clamp(dt,0,.05);const moto=vehicle.kind==='moto',throttle=clamp(Number(input.throttle)||0,-1,1),steer=clamp(Number(input.steer)||0,-1,1);
    vehicle.rampCooldown=Math.max(0,(Number(vehicle.rampCooldown)||0)-dt);
    if(vehicle.submerged){vehicle.speed=0;return vehicle;}
    if(moto&&vehicle.airborne)return advanceAirborneMoto(vehicle,input,dt,obstacles);
    const maximum=moto?27:22,acceleration=moto?11:9;
    const drifting=Boolean(input.brake&&Math.abs(steer)>.12&&(Math.abs(vehicle.speed)>.5||throttle));vehicle.drifting=drifting;
    if(drifting){vehicle.speed*=Math.exp(-(moto?1.65:1.2)*dt);vehicle.speed=clamp(vehicle.speed+throttle*acceleration*.72*dt,-6,maximum);}
    else if (input.brake) vehicle.speed *= Math.exp(-8*dt);
    else if (throttle) {
      if (vehicle.speed*throttle<0) vehicle.speed *= Math.exp(-6*dt);
      vehicle.speed=clamp(vehicle.speed+throttle*acceleration*dt,-6,maximum);
    } else vehicle.speed *= Math.exp(-1.8*dt);
    if (Math.abs(vehicle.speed)<.035)vehicle.speed=0;
    const oldRotation=vehicle.rotation;
    // Ease the steering rack back to center instead of instantly flipping lock.
    vehicle.steering=(Number(vehicle.steering)||0)+(steer-(Number(vehicle.steering)||0))*(1-Math.exp(-(steer?10:13)*dt));
    // Reduce steering lock at speed and bound yaw rate to avoid spinning in place.
    const steeringAngle=vehicle.steering*(moto?.62:.66)/(1+Math.abs(vehicle.speed)*.065);
    const lock=drifting?(moto?2.2:2.8):(moto?1.25:1.15);
    const yawRate=clamp(-vehicle.speed*Math.tan(steeringAngle)/(moto?1.65:2.55)*(drifting?2.8:1),-lock,lock);
    vehicle.rotation += yawRate*dt;
    vehicle.rotation=Math.atan2(Math.sin(vehicle.rotation),Math.cos(vehicle.rotation));
    const heading=Number.isFinite(vehicle.driftHeading)?vehicle.driftHeading:oldRotation;
    const headingDelta=Math.atan2(Math.sin(vehicle.rotation-heading),Math.cos(vehicle.rotation-heading));
    vehicle.driftHeading=heading+headingDelta*(1-Math.exp(-(drifting?1.8:16)*dt));
    const middleRotation=drifting||Math.abs(headingDelta)>.03?vehicle.driftHeading:oldRotation+yawRate*dt*.5;
    const dx=Math.sin(middleRotation)*vehicle.speed*dt,dz=Math.cos(middleRotation)*vehicle.speed*dt;
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
    for(let step=0;step<steps;step++) {
      const x=vehicle.x+dx/steps,z=vehicle.z+dz/steps;
      const rotation=oldRotation+yawRate*dt*(step+1)/steps;
      if (!vehicleClearAt(vehicle,x,z,rotation,obstacles)) {
        const contact=moto?motoContact(vehicle,x,z,rotation,obstacles):null;
        const obstacle=contact?.obstacle||(vehicleClearAt(vehicle,x,z,rotation,[])?obstacles.find(item=>!vehicleClearAt(vehicle,x,z,rotation,[item])):null);
        const top=obstacle?.maxY,ground=drivingFloor(vehicle.x,vehicle.z,vehicle.y)??vehicle.y;
        if(moto&&contact?.part!=='front-wheel'&&input.wheelie&&!input.brake&&!vehicle.wrecked&&!vehicle.hijacking&&vehicle.wheelieAngle>.24&&vehicle.speed>5.5&&!vehicle.rampCooldown&&Number.isFinite(top)&&top-ground<=2.5&&top>=ground+.08){
          launchMoto(vehicle,Math.min(13,4+vehicle.speed*.34),middleRotation);break;
        }
        vehicle.collision={vehicleId:obstacle?.vehicleId||null,speed:Math.abs(vehicle.speed)};vehicle.speed=0;vehicle.rotation=oldRotation;vehicle.driftHeading=oldRotation;break;
      }
      const floor=drivingFloor(x,z,vehicle.y),previousFloor=drivingFloor(vehicle.x,vehicle.z,vehicle.y);
      if(moto&&input.wheelie&&!input.brake&&!vehicle.wrecked&&!vehicle.hijacking&&vehicle.wheelieAngle>.24&&vehicle.speed>5.5&&!vehicle.rampCooldown&&floor!==null&&previousFloor!==null&&floor-previousFloor>=.09&&floor-previousFloor<=.6){
        launchMoto(vehicle,Math.min(8,3.8+vehicle.speed*.16),middleRotation);break;
      }
      vehicle.x=x;vehicle.z=z;vehicle.y=floor??vehicle.y;
    }
    if(vehicle.airborne)return vehicle;
    vehicle.y=drivingFloor(vehicle.x,vehicle.z,vehicle.y)??-.05;
    const wheelieTarget=moto&&input.wheelie&&!input.brake&&!vehicle.collision&&!vehicle.wrecked&&!vehicle.hijacking&&vehicle.speed>2.8&&throttle>=0?.60:0;
    vehicle.wheelieAngle=moto?(Number(vehicle.wheelieAngle)||0)+(wheelieTarget-(Number(vehicle.wheelieAngle)||0))*(1-Math.exp(-(wheelieTarget?6:9)*dt)):0;
    return vehicle;
  }
  function launchMoto(vehicle,velocity,heading){
    vehicle.airborne=true;vehicle.airVelocityY=velocity;vehicle.airVelocityX=Math.sin(heading)*vehicle.speed*.96;vehicle.airVelocityZ=Math.cos(heading)*vehicle.speed*.96;
    vehicle.speed*=.96;vehicle.airPitch=Math.max(.3,vehicle.wheelieAngle||0);vehicle.airTime=0;vehicle.rampCooldown=1.3;
  }
  function advanceAirborneMoto(vehicle,input,dt,obstacles){
    vehicle.airTime=(vehicle.airTime||0)+dt;
    vehicle.airVelocityY=(vehicle.airVelocityY||0)-12*dt;vehicle.y+=vehicle.airVelocityY*dt;
    const steer=clamp(Number(input.steer)||0,-1,1);vehicle.rotation+=-steer*.55*dt;vehicle.rotation=Math.atan2(Math.sin(vehicle.rotation),Math.cos(vehicle.rotation));
    const dx=(vehicle.airVelocityX||0)*dt,dz=(vehicle.airVelocityZ||0)*dt,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
    for(let i=0;i<steps;i++){
      const x=vehicle.x+dx/steps,z=vehicle.z+dz/steps;
      if(!vehicleClearAt(vehicle,x,z,vehicle.rotation,obstacles)){
        const obstacle=obstacles.find(item=>!vehicleClearAt(vehicle,x,z,vehicle.rotation,[item]));
        // A low launch obstacle holds the rear wheel until the bike clears its top.
        if(vehicle.airVelocityY>0&&vehicle.airTime<.6&&Number.isFinite(obstacle?.maxY)&&obstacle.maxY-(groundHeight(vehicle.x,vehicle.z)??vehicle.y)<=2.5)break;
        vehicle.collision={vehicleId:obstacle?.vehicleId||null,speed:Math.abs(vehicle.speed)};vehicle.speed=0;vehicle.airVelocityX=0;vehicle.airVelocityZ=0;break;
      }
      vehicle.x=x;vehicle.z=z;
    }
    vehicle.airPitch=clamp(Math.atan2(vehicle.airVelocityY,Math.max(7,Math.abs(vehicle.speed)))+.18,-.4,.85);vehicle.wheelieAngle=Math.max(0,vehicle.airPitch);
    const land=groundHeight(vehicle.x,vehicle.z,city.groundKind(vehicle.x,vehicle.z)==='bridge'?vehicle.y+Math.max(.4,-vehicle.airVelocityY*dt+.05):Infinity),floor=land??city.coast.waterY;
    if(vehicle.y<=floor&&vehicle.airVelocityY<=0){
      vehicle.y=floor;vehicle.airborne=false;vehicle.submerged=land===null;vehicle.airVelocityY=0;vehicle.airVelocityX=0;vehicle.airVelocityZ=0;vehicle.airPitch=0;vehicle.wheelieAngle=0;vehicle.speed=land===null?0:vehicle.speed*.82;vehicle.driftHeading=vehicle.rotation;vehicle.rampCooldown=.5;
    }
    return vehicle;
  }
  function vehicleFrame(vehicle) {
    const angle=vehicle.kind==='moto'?(vehicle.airborne?clamp(Number(vehicle.airPitch)||0,-.4,.85):clamp(Number(vehicle.wheelieAngle)||0,0,.60)):0,shift=-.85*(1-Math.cos(angle))+.36*Math.sin(angle);
    return {x:vehicle.x+Math.sin(vehicle.rotation)*shift,y:vehicle.y+.36*(1-Math.cos(angle))+.85*Math.sin(angle),z:vehicle.z+Math.cos(vehicle.rotation)*shift,pitch:-angle};
  }
  function seatPose(vehicle,offset,scale) {
    if(vehicle.kind==='car'){offset={x:offset.x*CAR_SCALE,y:offset.y*CAR_SCALE,z:offset.z*CAR_SCALE};scale*=CAR_SCALE;}
    const frame=vehicleFrame(vehicle),angle=-frame.pitch,c=Math.cos(vehicle.rotation),s=Math.sin(vehicle.rotation),z=offset.z*Math.cos(angle)-offset.y*Math.sin(angle);
    return {x:frame.x+offset.x*c+z*s,y:frame.y+offset.y*Math.cos(angle)+offset.z*Math.sin(angle),z:frame.z-offset.x*s+z*c,rotation:vehicle.rotation,pitch:frame.pitch,scale};
  }
  function driverPose(vehicle) {
    if(isWatercraft(vehicle))return seatPose(vehicle,{x:vehicle.kind==='boat'?.55:0,y:vehicle.kind==='boat'?-.12:-.30,z:vehicle.kind==='boat'?.9:-.1},vehicle.kind==='boat'?.72:.85);
    const offset=vehicle.kind==='car'?.32:0,scale=vehicle.kind==='car'?.62:.85;
    return seatPose(vehicle,{x:offset,y:vehicle.kind==='car'?-.015:.02,z:0},scale);
  }
  function passengerPose(vehicle,seat=0) {
    if(isWatercraft(vehicle)){const offset=vehicle.kind==='jetski'?{x:0,y:-.30,z:-.75}:{x:seat===0?-.55:(seat%2?-.90:.90),y:-.12,z:seat===0?.9:-.45-Math.floor((seat-1)/2)*.58};return{...seatPose(vehicle,offset,vehicle.kind==='boat'?.72:.85),seat};}
    const offset=vehicle.kind==='car'?{x:-.48,z:-.08}:{x:0,z:-.67};
    return {...seatPose(vehicle,{...offset,y:vehicle.kind==='car'?-.015:.02},vehicle.kind==='car'?.62:.85),seat};
  }
  function exitPosition(vehicle) {
    if(isWatercraft(vehicle)){
      const reach=vehicle.kind==='boat'?4.2:2.2;
      for(let i=0;i<16;i++){const angle=i*Math.PI/8,x=vehicle.x+Math.sin(angle)*reach,z=vehicle.z+Math.cos(angle)*reach,floor=groundHeight(x,z);if(floor!==null&&floor<=1.4&&clearAt(x,z,.34))return{x,y:floor,z};}
      for(let i=0;i<16;i++){const angle=i*Math.PI/8,x=vehicle.x+Math.sin(angle)*reach,z=vehicle.z+Math.cos(angle)*reach;if(watercraftPointClear(x,z,.34,drivingObstacles))return{x,y:waterHeight(x,z,Date.now())-1.27,z};}return null;
    }
    const radius=vehicle.kind==='car'?1.05*CAR_SCALE:.46;
    for (const [side,forward] of [[1,0],[-1,0],[0,-1],[0,1]]) {
      const distance=radius+1.05,x=vehicle.x+Math.cos(vehicle.rotation)*side*distance+Math.sin(vehicle.rotation)*forward*distance,z=vehicle.z-Math.sin(vehicle.rotation)*side*distance+Math.cos(vehicle.rotation)*forward*distance;
      if (clearAt(x,z,.34,drivingObstacles,vehicle.y))return{x,y:drivingFloor(x,z,vehicle.y),z};
    }
    return null;
  }
  function vehicleObstacles(vehicle,records){return [...drivingObstacles,...[...records].filter(other=>other.id!==vehicle.id).map(other=>({x:other.x,z:other.z,hx:other.kind==='boat'?1.5:other.kind==='car'?.9*CAR_SCALE:other.kind==='jetski'?.5:.35,hz:other.kind==='boat'?3.25:other.kind==='car'?1.75*CAR_SCALE:1.15,rot:other.rotation,minY:other.y,maxY:other.y+(other.kind==='car'?1.7*CAR_SCALE:1.1),vehicleId:other.id}))];}
  function waterObstacleHit(x,z,radius,o){if((o.minY??-Infinity)>city.coast.waterY+2.2)return false;const dx=x-o.x,dz=z-o.z,reach=(o.r??o.hx+o.hz)+radius;if(Math.abs(dx)>reach||Math.abs(dz)>reach)return false;if(o.r!==undefined)return Math.hypot(dx,dz)<o.r+radius;const c=Math.cos(o.rot||0),s=Math.sin(o.rot||0),lx=dx*c-dz*s,lz=dx*s+dz*c;return Math.hypot(Math.max(0,Math.abs(lx)-o.hx),Math.max(0,Math.abs(lz)-o.hz))<radius;}
  function watercraftImpact(vehicle,x,z,rotation,obstacles){const boat=vehicle.kind==='boat',radius=boat?.73:.42,length=boat?2.5:.8,width=boat?.75:0,c=Math.cos(rotation),s=Math.sin(rotation);for(const o of obstacles)for(const side of [-1,0,1])for(const forward of [-1,0,1])if(waterObstacleHit(x+c*side*width+s*forward*length,z-s*side*width+c*forward*length,radius,o))return o;return null;}
  function watercraftPointClear(x,z,radius,obstacles,draft=.65){const b=city.bounds;if(x<b.minX+radius||x>b.maxX-radius||z<b.minZ+radius||z>b.maxZ-radius)return false;
    // Hull probes never cross the shore or pass underneath any visible pier/deck.
    if([[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]].some(([dx,dz])=>{const floor=groundHeight(x+dx,z+dz,city.groundKind(x+dx,z+dz)==='bridge'?city.coast.waterY+1:Infinity);return floor!==null&&floor>city.coast.waterY-draft-.1;}))return false;
    for(const o of obstacles)if(waterObstacleHit(x,z,radius,o))return false;return true;
  }
  function watercraftClearAt(vehicle,x,z,rotation,obstacles){const boat=vehicle.kind==='boat',r=boat?.73:.42,length=boat?2.5:.8,width=boat?.75:0;
    for(const side of [-1,0,1])for(const forward of [-1,0,1]){const px=x+Math.cos(rotation)*side*width+Math.sin(rotation)*forward*length,pz=z-Math.sin(rotation)*side*width+Math.cos(rotation)*forward*length;if(!watercraftPointClear(px,pz,r,obstacles,boat?.65:.35))return false;}return true;
  }
  function advanceWatercraft(vehicle,input,dt,obstacles){dt=clamp(dt,0,.05);vehicle.collision=null;vehicle.airborne=false;vehicle.submerged=false;vehicle.wheelieAngle=0;vehicle.drifting=false;
    const jet=vehicle.kind==='jetski',throttle=clamp(Number(input.throttle)||0,-1,1),steer=clamp(Number(input.steer)||0,-1,1);vehicle.speed=Number(vehicle.speed)||0;
    vehicle.speed*=Math.exp(-(input.brake?4.5:throttle?.35:1.1)*dt);vehicle.speed=clamp(vehicle.speed+(input.brake?0:throttle*(jet?10:6)*dt),-4,jet?29:20);
    if(Math.abs(vehicle.speed)<.035)vehicle.speed=0;vehicle.steering=(vehicle.steering||0)+(steer-(vehicle.steering||0))*(1-Math.exp(-7*dt));
    const previous=vehicle.rotation,rate=clamp(-vehicle.steering*vehicle.speed/(jet?13:22),jet?-1.65:-.85,jet?1.65:.85),rotation=Math.atan2(Math.sin(previous+rate*dt),Math.cos(previous+rate*dt)),dx=Math.sin(previous+rate*dt*.5)*vehicle.speed*dt,dz=Math.cos(previous+rate*dt*.5)*vehicle.speed*dt,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.10));
    for(let i=0;i<steps;i++){const x=vehicle.x+dx/steps,z=vehicle.z+dz/steps,r=previous+rate*dt*(i+1)/steps;if(!watercraftClearAt(vehicle,x,z,r,obstacles)){const obstacle=watercraftImpact(vehicle,x,z,r,obstacles);vehicle.collision={speed:Math.abs(vehicle.speed),vehicleId:obstacle?.vehicleId||null};vehicle.speed=0;vehicle.rotation=previous;break;}vehicle.x=x;vehicle.z=z;vehicle.rotation=r;}
    vehicle.rotation=Math.atan2(Math.sin(vehicle.rotation),Math.cos(vehicle.rotation));vehicle.y=waterHeight(vehicle.x,vehicle.z,Number.isFinite(input.serverTime)?input.serverTime:Date.now());return vehicle;
  }
  function hijackPose(vehicle,role,now){
    const action=vehicle.hijacking;if(!action)return null;
    const progress=clamp((now-action.startedAt)/HIJACK_MS,0,1),smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);},seat=driverPose(vehicle),outside=action.outside;
    const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
    const approach=mix(outside,seat,.38);approach.y=drivingFloor(approach.x,approach.z,vehicle.y)??vehicle.y;
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
  globalThis.LowkeyWorld={CAR_SCALE,MAP_HALF_SIZE,city,SEGMENT_MS,HIJACK_MS,daylight,groundHeight,drivingFloor,supportHeight,waterHeight,waterAt,isSwimming,advanceSwimmer,keepCameraAboveGround,constrainCamera,shotBlock,crossesSolid,initialVehicles,garageVehicle,replenishGarage,expireUnoccupiedVehicles,vehicleClearAt,advanceVehicle,vehicleInteraction,vehicleFrame,driverPose,passengerPose,exitPosition,clearAt,drivingObstacles,vehicleObstacles,hijackPose,isWatercraft,passengerCapacity,marinaVehicle,replenishMarina};
  // One deterministic timeline and arc-length table for server, seats and scenery.
  const wrap=n=>((n%1)+1)%1,curve=city.coast.trackPoint,arc=[0];let previous=curve(0);
  for(let i=1;i<=200;i++){const p=curve(i/200);arc.push(arc[i-1]+Math.hypot(...p.map((v,a)=>v-previous[a])));previous=p;}
  function trackParameter(t){const length=wrap(t)*arc[200];let low=0,high=200;while(low+1<high){const mid=(low+high)>>1;if(arc[mid]<length)low=mid;else high=mid;}return(low+(length-arc[low])/(arc[high]-arc[low]||1))/200;}
  function trackPose(t){const u=trackParameter(t),p=curve(u),a=curve(wrap(u-.0001)),b=curve(wrap(u+.0001)),d=b.map((v,i)=>v-a[i]);return{x:p[0],y:p[1],z:p[2],rotation:Math.atan2(d[0],d[2]),pitch:-Math.atan2(d[1],Math.hypot(d[0],d[2]))};}
  function ridePhase(kind,time){if(kind==='carousel'){const elapsed=(time%30000+30000)%30000,t=Math.max(0,(elapsed-6000)/24000),smooth=t*t*(3-2*t);return{boarding:elapsed<6000,angle:(Math.floor(time/30000)+smooth)*Math.PI*2,remaining:Math.ceil((30000-elapsed)/1000)};}if(kind==='wheel'){const step=Math.floor(time/16000),elapsed=(time%16000+16000)%16000;return{boarding:elapsed<5000,bench:((12-step)%16+16)%16,angle:(step+Math.max(0,elapsed-5000)/11000)*Math.PI/8,remaining:Math.ceil((16000-elapsed)/1000)};}const elapsed=(time%60000+60000)%60000;return{boarding:elapsed<10000,t:Math.max(0,elapsed-10000)/50000,remaining:Math.ceil((60000-elapsed)/1000)};}
  function rideBench(kind,index,time){if(kind==='carousel'){const c=city.coast.carousel,a=index*Math.PI/6-ridePhase(kind,time).angle;return{x:c.x+Math.cos(a)*4.8,y:c.y+1.28+Math.sin(time/1000*1.3+index*Math.PI/6)*.22,z:c.z+Math.sin(a)*4.8,rotation:-a,pitch:0};}if(kind==='wheel'){const w=city.coast.wheel,angle=index*Math.PI/8+ridePhase(kind,time).angle;return{x:w.x+Math.cos(angle)*w.radius,y:w.hubY-1.3+Math.sin(angle)*w.radius,z:w.z,rotation:0,pitch:0};}return trackPose(ridePhase(kind,time).t-index*.027);}
  function rideSeat(kind,bench,seat,time){const p=rideBench(kind,bench,time),side=kind==='carousel'?0:seat===0?-.46:.46;return{...p,x:p.x+Math.cos(p.rotation)*side,y:p.y+(kind==='carousel'?0:kind==='wheel'?-.92:.65),z:p.z-Math.sin(p.rotation)*side,scale:.65};}
  const rideStations={wheel:{x:-18,y:1.4,z:226.2,name:'RODA-GIGANTE',benches:16},coaster:{x:5,y:3.35,z:207.5,name:'MONTANHA-RUSSA',benches:3},carousel:{x:-60,y:1.4,z:230,name:'CARROSSEL',benches:12,seats:1}};
  globalThis.LowkeyRides={phase:ridePhase,bench:rideBench,seat:rideSeat,stations:rideStations};
})();
