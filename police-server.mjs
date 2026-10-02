// Small server-owned police simulation. No client command can grant stars or arrest a player.
export function createPoliceGame({world,layout,players,vehicles=new Map(),broadcast,arrest,release,damagePlayer=()=>{},segmentHit=()=>null,clock=Date.now,paused=()=>false,random=Math.random}) {
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),angle=(a,b)=>Math.atan2(b.x-a.x,b.z-a.z);
  const nodes=[],edges=new Map(),offenders=new Map(),officers=new Map(),cars=[];
  for(const a of layout.roads.filter(r=>r.axis==='z'))for(const b of layout.roads.filter(r=>r.axis==='x')){
    if(!layout.inRect(a.x,b.z,a)||!layout.inRect(a.x,b.z,b)||nodes.some(p=>p.x===a.x&&p.z===b.z))continue;
    nodes.push({x:a.x,z:b.z});
  }
  nodes.forEach((_,i)=>edges.set(i,[]));
  for(const road of layout.roads){const on=nodes.map((p,i)=>({p,i})).filter(v=>layout.inRect(v.p.x,v.p.z,road)).sort((a,b)=>road.axis==='z'?a.p.z-b.p.z:a.p.x-b.p.x);
    for(let k=1;k<on.length;k++){const a=on[k-1],b=on[k];let clear=true;const length=distance(a.p,b.p);
      for(let t=0;t<=length;t+=1){const f=t/length,x=a.p.x+(b.p.x-a.p.x)*f,z=a.p.z+(b.p.z-a.p.z)*f;if(!world.vehicleClearAt({kind:'car',y:world.groundHeight(x,z),rotation:angle(a.p,b.p)},x,z,angle(a.p,b.p))){clear=false;break;}}
      if(clear){edges.get(a.i).push(b.i);edges.get(b.i).push(a.i);}
    }
  }
  const nearest=p=>nodes.reduce((best,n,i)=>distance(n,p)<distance(nodes[best],p)?i:best,0);
  function path(start,end){const q=[start],prev=new Map([[start,null]]);for(let k=0;k<q.length&&!prev.has(end);k++)for(const n of edges.get(q[k])||[])if(!prev.has(n)){prev.set(n,q[k]);q.push(n);}if(!prev.has(end))return[];const result=[];for(let n=end;n!==start;n=prev.get(n))result.unshift(n);return result;}
  const patrolPoints=[[-88,-92],[88,-92],[88,92],[-88,92]].map(([x,z])=>nearest({x,z}));
  const appearance={skin:'#d3ac87',hair:'#292725',hairStyle:'fade',headwear:'none',shirt:'#263f64',pants:'#172a42',shoe:'#121821',eyeLeft:'#454843',eyeRight:'#454843'};
  for(let i=0;i<2;i++){
    const node=nearest({x:i?60:-60,z:i?64:-64}),p=nodes[node],car={id:`police-car-${i+1}`,kind:'car',x:p.x,y:world.groundHeight(p.x,p.z),z:p.z,rotation:i?Math.PI:0,speed:0,node,path:[],patrol:i*2,planAt:0,targetId:null,lights:false,officerIds:[]};
    for(let seat=0;seat<2;seat++){const officer={id:`police-${i*2+seat+1}`,police:true,carId:car.id,seat,position:{x:car.x,y:car.y,z:car.z},rotation:car.rotation,walking:false,seated:true,health:100,appearance:{...appearance,skin:seat?'#976c50':'#d3ac87'},respawnAt:0};officers.set(officer.id,officer);car.officerIds.push(officer.id);}
    cars.push(car);
  }
  for(let i=0;i<2;i++){const home={...layout.policePoint(-4+i*3,3),y:.12};officers.set(`police-${5+i}`,{id:`police-${5+i}`,police:true,carId:null,home,position:{...home},rotation:layout.policeStation.rotation,walking:false,seated:false,health:100,appearance:{...appearance},respawnAt:0});}
  let lastAt=clock(),lastBroadcast=-Infinity,nextVolleyAt=0;
  const getRecord=p=>offenders.get(p.accountId);
  const walkPlans=new Map(),walkable=new Map();
  const cell=p=>({x:Math.round(p.x/1.5),z:Math.round(p.z/1.5)}),key=p=>`${p.x}:${p.z}`;
  function cellClear(p){const k=key(p);if(!walkable.has(k)){if(walkable.size>16000)walkable.clear();walkable.set(k,world.clearAt(p.x*1.5,p.z*1.5,.36)&&!layout.inSafeZone({x:p.x*1.5,z:p.z*1.5}));}return walkable.get(k);}
  function footPath(from,to){const start=cell(from),goal=cell(to);if(!cellClear(goal))return[];const open=[{...start,g:0,f:distance(start,goal)}],cost=new Map([[key(start),0]]),previous=new Map(),visited=new Set();
    // Bounded search is only used when a straight path is obstructed, not every frame.
    for(let attempts=0;open.length&&attempts<1500;attempts++){
      let best=0;for(let i=1;i<open.length;i++)if(open[i].f<open[best].f)best=i;const p=open.splice(best,1)[0],k=key(p);if(visited.has(k))continue;visited.add(k);
      if(k===key(goal)){const points=[];for(let n=k;n!==key(start);n=previous.get(n)){const [x,z]=n.split(':').map(Number);points.unshift({x:x*1.5,z:z*1.5});}return points;}
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const n={x:p.x+dx,z:p.z+dz},nk=key(n);if(visited.has(nk)||!cellClear(n)||dx&&dz&&(!cellClear({x:p.x+dx,z:p.z})||!cellClear({x:p.x,z:p.z+dz})))continue;const g=p.g+Math.hypot(dx,dz);if(g>=(cost.get(nk)??Infinity))continue;cost.set(nk,g);previous.set(nk,k);open.push({...n,g,f:g+distance(n,goal)});}
    }return[];
  }
  const stars=score=>Math.min(5,score>=35?5:score>=20?4:score>=10?3:score>=4?2:1);
  function crime(player,weight=1,{gunfire=false}={}){if(paused()||!player||player.health<=0||player.ghost||layout.inSafeZone(player.position)||isJailed(player))return false;const now=clock(),old=getRecord(player),record=old||{score:0,level:0,lastCrime:0,lastSeen:now,jailUntil:0,arrestProgress:0};
    record.score=Math.min(40,record.score+weight);record.level=stars(record.score);record.lastCrime=now;record.lastSeen=now;record.lastPosition={...player.position};record.decayAt=now+60000;record.senseAt=0;if(gunfire)record.armedUntil=now+90000;offenders.set(player.accountId,record);broadcast({type:'police-wanted',id:player.id,stars:record.level,serverTime:now});return true;
  }
  function isJailed(player){return Boolean(player&&getRecord(player)?.jailUntil>clock());}
  function connect(player){const record=getRecord(player);if(record?.jailUntil>clock())arrest(player,record.jailUntil,layout.jail);else if(record?.jailUntil){record.jailUntil=0;release(player,layout.jailExit);}}
  function hurt(id,damage,attacker){const officer=officers.get(id);if(!officer||officer.health<=0||paused())return false;officer.health=Math.max(0,officer.health-Math.max(0,Math.min(100,damage)));crime(attacker,officer.health?3:8);if(!officer.health){officer.seated=false;officer.walking=false;officer.respawnAt=clock()+30000;}return true;}
  const visible=(a,b)=>world.shotBlock({x:a.x,y:a.y+1.4,z:a.z},{x:b.x,y:b.y+1.4,z:b.z})===null;
  function suspectFrom(actor,radius=Infinity){const position=actor.position||actor,eligible=[...players.values()].filter(player=>{const r=getRecord(player);return r?.level>0&&!r.jailUntil&&player.health>0&&!player.ghost&&!layout.inSafeZone(player.position);}),locked=eligible.find(p=>p.accountId===actor.targetAccountId);const target=locked||eligible.filter(p=>distance(position,getRecord(p).lastPosition||p.position)<=radius).sort((a,b)=>distance(position,getRecord(a).lastPosition||a.position)-distance(position,getRecord(b).lastPosition||b.position))[0];actor.targetAccountId=target?.accountId||null;return target;}
  function formationPoint(officer,position){const i=Number(officer.id.split('-').at(-1))-1,a=i*Math.PI/3;return {...position,x:position.x+Math.cos(a)*1.05,z:position.z+Math.sin(a)*1.05};}
  function walk(officer,destination,dt,speed=9.2){let waypoint=destination;const blocked=world.crossesSolid({...officer.position,y:officer.position.y+.15},{...destination,y:officer.position.y+.15});
    if(blocked){let plan=walkPlans.get(officer.id);if(!plan||clock()>=plan.until||distance(plan.goal,destination)>4){plan={points:footPath(officer.position,destination),goal:{...destination},until:clock()+2200};walkPlans.set(officer.id,plan);}while(plan.points.length&&distance(officer.position,plan.points[0])<.3)plan.points.shift();if(plan.points.length)waypoint=plan.points[0];}
    const remaining=distance(officer.position,waypoint),travel=Math.min(remaining,speed*dt);officer.walking=false;if(travel<.02)return;
    let dx=(waypoint.x-officer.position.x)/Math.max(.001,remaining),dz=(waypoint.z-officer.position.z)/Math.max(.001,remaining);
    for(const other of officers.values()){if(other===officer||other.seated||other.health<=0)continue;const d=distance(officer.position,other.position);if(d<1.25&&d>.001){const force=(1.25-d)/1.25;dx+=(officer.position.x-other.position.x)/d*force;dz+=(officer.position.z-other.position.z)/d*force;}}
    const heading=Math.atan2(dx,dz),side=Number(officer.id.split('-').at(-1))%2?1:-1;
    for(const turn of [0,.35*side,-.35*side,.7*side,-.7*side,1.25*side,-1.25*side,1.8*side,-1.8*side]){const rotation=heading+turn,x=officer.position.x+Math.sin(rotation)*travel,z=officer.position.z+Math.cos(rotation)*travel;
      if([...officers.values()].some(other=>other!==officer&&!other.seated&&other.health>0&&distance({x,z},other.position)<.58))continue;
      if(world.clearAt(x,z,.32)&&!layout.inSafeZone({x,z})){officer.position={x,y:world.groundHeight(x,z),z};officer.rotation=rotation;officer.walking=true;break;}}
  }
  function crossesSafe(a,b){let enter=0,exit=1;const s=layout.safeZone;for(const [axis,half] of [['x',s.hx],['z',s.hz]]){const d=b[axis]-a[axis],lo=s[axis]-half,hi=s[axis]+half;if(Math.abs(d)<1e-9){if(a[axis]<lo||a[axis]>hi)return false;continue;}const t1=(lo-a[axis])/d,t2=(hi-a[axis])/d;enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));if(enter>exit)return false;}return true;}
  function returnFire(officer,target,now){const record=target&&getRecord(target);officer.armed=Boolean(record?.armedUntil>now&&record.level&&!officer.seated);officer.aiming=false;officer.aimPitch=0;
    if(!officer.armed||officer.health<=0||paused()||isJailed(target)||target.health<=0||layout.inSafeZone(target.position)||distance(officer.position,target.position)>65||!visible(officer.position,target.position)||crossesSafe(officer.position,target.position))return;
    officer.aiming=true;officer.rotation=angle(officer.position,target.position);const d=distance(officer.position,target.position);officer.aimPitch=Math.atan2(officer.position.y+1.5-(target.position.y+1.15),Math.max(.1,d));
    if(officer.fireAt===undefined)officer.fireAt=now+650+Number(officer.id.split('-').at(-1))*85;
    if(now<officer.fireAt||now<nextVolleyAt)return;officer.fireAt=now+1100+random()*350;nextVolleyAt=now+260;
    const start={x:officer.position.x+Math.sin(officer.rotation)*.38,y:officer.position.y+1.5,z:officer.position.z+Math.cos(officer.rotation)*.38},spread=Math.max(.12,d*.035),end={x:target.position.x+(random()-.5)*spread*2,y:target.position.y+1.15+(random()-.5)*spread*2,z:target.position.z+(random()-.5)*spread*2};
    let nearest=world.shotBlock(start,end,[...vehicles.values(),...cars])??1,hit=null;
    for(const candidate of [...players.values(),...officers.values()]){if(candidate===officer||candidate.health<=0||candidate.ghost)continue;const t=segmentHit(start,end,candidate.position,.33);if(t!==null&&t<nearest){nearest=t;hit=candidate;}}
    const stop={x:start.x+(end.x-start.x)*nearest,y:start.y+(end.y-start.y)*nearest,z:start.z+(end.z-start.z)*nearest},damaged=hit===target&&!layout.inSafeZone(hit.position);
    if(damaged)damagePlayer(target,8,officer);
    broadcast({type:'police-shot',officerId:officer.id,targetId:target.id,start,end:stop,hit:damaged,damage:damaged?8:0,health:target.health,facing:officer.rotation,pitch:officer.aimPitch,serverTime:now});
  }
  function tick(){const now=clock(),dt=Math.max(0,Math.min(.1,(now-lastAt)/1000));lastAt=now;
    for(const player of players.values()){const r=getRecord(player);if(!r)continue;if(r.jailUntil){if(now>=r.jailUntil||paused()){r.jailUntil=0;release(player,layout.jailExit);broadcast({type:'police-wanted',id:player.id,stars:0,serverTime:now});}continue;}
      if(paused()||player.health<=0||player.ghost){r.score=0;r.level=0;r.arrestProgress=0;continue;}
      if(r.level&&now>=(r.senseAt||0)){r.senseAt=now+200;const seen=[...officers.values()].some(o=>o.health>0&&distance(o.position,player.position)<85&&!layout.inSafeZone(player.position)&&visible(o.position,player.position));if(seen){r.lastSeen=now;r.lastPosition={...player.position};r.decayAt=now+60000;}}
      if(r.level&&now>=r.decayAt&&now-r.lastCrime>=60000){r.level--;r.score=[0,1,4,10,20,35][r.level];r.decayAt=now+20000;broadcast({type:'police-wanted',id:player.id,stars:r.level,serverTime:now});}
      const close=[...officers.values()].some(o=>o.health>0&&!o.seated&&distance(o.position,player.position)<1.65&&Math.abs(o.position.y-player.position.y)<1.6&&visible(o.position,player.position));
      const slow=!player.vehicleId||Math.abs(vehicles.get(player.vehicleId)?.speed||0)<1.5;
      r.arrestProgress=r.level&&close&&slow&&!layout.inSafeZone(player.position)?r.arrestProgress+dt:0;
      if(r.arrestProgress>=1.2){r.level=0;r.score=0;r.arrestProgress=0;r.jailUntil=now+20000;arrest(player,r.jailUntil,layout.jail);broadcast({type:'police-wanted',id:player.id,stars:0,serverTime:now});}
    }
    for(const car of cars){const target=paused()?null:suspectFrom(car),goal=target&&(getRecord(target).lastPosition||target.position),foot=car.officerIds.some(id=>!officers.get(id).seated&&officers.get(id).health>0),fastTarget=target?.vehicleId&&Math.abs(vehicles.get(target.vehicleId)?.speed||0)>6;
      if(foot&&(!target||distance(car,goal)>70||fastTarget&&distance(car,goal)>25))car.recalling=true;
      if(!foot)car.recalling=false;
      const near=goal&&!car.recalling&&!fastTarget&&(distance(car,goal)<14||!car.path.length&&distance(car,goal)<45);car.targetId=target?.id||null;car.lights=Boolean(target);car.speed=0;
      if(near||foot){for(const id of car.officerIds){const officer=officers.get(id);if(officer.health<=0)continue;
        if(officer.seated&&near){const side=officer.seat?1:-1;for(const offset of [1.65,2.2,2.7]){const p={x:car.x+Math.cos(car.rotation)*side*offset,y:car.y,z:car.z-Math.sin(car.rotation)*side*offset};if(world.clearAt(p.x,p.z,.32)){officer.position=p;officer.seated=false;break;}}}
        if(!officer.seated){if(goal&&!car.recalling)walk(officer,formationPoint(officer,goal),dt,9.2+Math.min(1.4,getRecord(target).level*.28));else if(distance(officer.position,car)<1.8)officer.seated=true;else walk(officer,car,dt);}
      }}else{if(!car.path.length||now>=car.planAt&&distance(car,nodes[car.node])<.15){let goalNode;if(target){goalNode=nearest(goal);const occupied=cars.some(c=>c!==car&&c.targetId===target.id&&(c.goalNode===goalNode||distance(c,nodes[goalNode])<5));if(occupied){const alternatives=[...(edges.get(goalNode)||[])].filter(n=>!cars.some(c=>c!==car&&c.goalNode===n));if(alternatives.length)goalNode=alternatives.sort((a,b)=>distance(nodes[a],goal)-distance(nodes[b],goal))[0];}}else{goalNode=patrolPoints[car.patrol%4];if(car.node===goalNode){car.patrol++;goalNode=patrolPoints[car.patrol%4];}}car.goalNode=goalNode;car.path=path(car.node,goalNode);car.planAt=now+650;}
        const chaseSpeed=target?24+Math.min(4,getRecord(target).level*.8):8;let budget=chaseSpeed*dt;while(car.path.length&&budget>0){const next=nodes[car.path[0]],d=distance(car,next),step=Math.min(budget,d),heading=angle(car,next),x=car.x+Math.sin(heading)*step,z=car.z+Math.cos(heading)*step;
          const blockers=[...world.drivingObstacles,...[...vehicles.values()].map(c=>({x:c.x,z:c.z,hx:c.kind==='car'?.9:.4,hz:c.kind==='car'?1.8:1,rot:c.rotation,minY:c.y,maxY:c.y+1.8})),...cars.filter(c=>c!==car).map(c=>({x:c.x,z:c.z,hx:.9,hz:1.8,rot:c.rotation,minY:c.y,maxY:c.y+1.8}))];
          if(!world.vehicleClearAt({...car,rotation:heading},x,z,heading,blockers))break;
          car.x=x;car.z=z;car.y=world.groundHeight(x,z);car.rotation=heading;car.speed=chaseSpeed;budget-=step;if(d<=step+.001){car.node=car.path.shift();break;}else break;
        }
      }
      for(const id of car.officerIds){const o=officers.get(id);if(o.seated){const pose=o.seat?world.passengerPose(car):world.driverPose(car);o.position={x:pose.x,y:pose.y,z:pose.z};o.rotation=car.rotation;o.walking=false;}}
      for(const id of car.officerIds)returnFire(officers.get(id),target,now);
    }
    for(const o of officers.values()){
      if(o.health<=0){if(now>=o.respawnAt){o.health=100;o.position={...(o.home||layout.policePoint(-4+(Number(o.id.slice(-1))%2)*3,3)),y:.12};o.seated=false;}continue;}
      if(o.carId)continue;const target=paused()?null:suspectFrom(o,95);if(target)walk(o,formationPoint(o,getRecord(target).lastPosition||target.position),dt,9.2+Math.min(1.4,getRecord(target).level*.28));else if(distance(o.position,o.home)>.1)walk(o,o.home,dt,3.5);else{o.walking=false;o.rotation=layout.policeStation.rotation;}
      returnFire(o,target,now);
    }
    for(const [accountId,r] of offenders)if(![...players.values()].some(p=>p.accountId===accountId)&&now-Math.max(r.lastCrime,r.jailUntil)>180000)offenders.delete(accountId);
    if(now-lastBroadcast>=100){lastBroadcast=now;broadcast({type:'police-motion',serverTime:now,cars:cars.map(c=>[c.id,c.x,c.y,c.z,c.rotation,c.speed,c.lights]),officers:[...officers.values()].map(o=>[o.id,o.position.x,o.position.y,o.position.z,o.rotation,o.walking,o.seated,o.health,Boolean(o.armed),Boolean(o.aiming),o.aimPitch||0]),wanted:wanted()});}
  }
  function wanted(){return [...players.values()].map(p=>({id:p.id,stars:getRecord(p)?.level||0,jailUntil:getRecord(p)?.jailUntil||0}));}
  function snapshot(){return {type:'police-state',serverTime:clock(),station:{x:layout.policeStation.x,z:layout.policeStation.z},cars:cars.map(({path,node,planAt,patrol,targetAccountId,goalNode,recalling,...car})=>({...car})),officers:[...officers.values()].map(({home,respawnAt,targetAccountId,fireAt,...o})=>({...o,position:{...o.position}})),wanted:wanted()};}
  return {tick,crime,hurt,connect,isJailed,snapshot,officers,cars,roadNodes:nodes};
}
