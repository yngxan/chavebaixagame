import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
const fail=(statusCode,message)=>{throw Object.assign(new Error(message),{statusCode});};
export const deliveryReward=distance=>75+Math.round(distance*2);
const milestones=[0,5,15,30];
export function careerProgress(state,career){const completed=Math.max(0,state.careers?.[career]?.completed??(career==='legal'?state.completed||0:0)),level=milestones.filter(n=>completed>=n).length;return {completed,level,title:(career==='illicit'?['Novato','Entregador conhecido','Distribuidor','Transportador']:['Novato','Entregador','Profissional','Veterano'])[level-1],nextAt:milestones[level]??null};}
export function deliveryPoints(layout,world){
  const points=[];
  function add(x,z,label){const kind=layout.groundKind(x,z);if(!['sidewalk','sand','promenade','pier','airport'].includes(kind)||!world.clearAt(x,z,.85)||points.some(p=>Math.hypot(p.x-x,p.z-z)<8))return;points.push({x,y:world.groundHeight(x,z),z,label});}
  for(const road of layout.roads.filter(r=>r.sector!=='bridge'))for(let t=-(road.axis==='z'?road.hz:road.hx)+8;t<(road.axis==='z'?road.hz:road.hx)-4;t+=20)for(const side of [-1,1]){
    const x=road.x+(road.axis==='z'?side*(road.hx+1.5):t),z=road.z+(road.axis==='x'?side*(road.hz+1.5):t);
    const district=layout.districts?.find(d=>layout.inRect(x,z,d));
    add(x,z,district?'Contato · '+district.name:`Contato no ${z<-36?'norte':z>36?'sul':x<0?'oeste':'leste'} da cidade`);
  }
  for(const a of layout.airports||[])add(a.terminal.x,a.terminal.z+(a.id==='airport-main'?-1:1)*(a.terminal.depth/2+3),'Carga · '+a.name);
  for(const z of [126,145,160])for(const x of [-100,-65,-30,30,65,100])add(x,z,z===126?'Contato no calçadão':'Contato na praia');
  for(const [x,z] of [[-29,210],[29,210],[29,234],[-29,234],[0,265]])add(x,z,'Contato no píer');
  return points;
}
export async function createMissionStore({root,database=null,layout,world=globalThis.LowkeyWorld,now=Date.now,random=Math.random}){
  const pickup={x:12,y:0,z:12,label:'Retirada na praça'},points=deliveryPoints(layout,world);
  if(points.length<2)throw Error('Mapa sem pontos seguros para entregas.');
  const choose=a=>a[Math.min(a.length-1,Math.max(0,Math.floor(random()*a.length)))];
  function contact(){return {name:choose(['Nando','Dudu','Rafa','Jota','Gui','Léo','Vini','Kauã']),appearance:{gender:'masculine',skin:choose(['#e6bd98','#ad7958','#76503c']),hair:'#201b19',hairStyle:choose(['fade','lowBlack','braids','short']),headwear:choose(['none','none','nyCap']),shirt:choose(['#704d8c','#d27640','#426c91','#50805c','#aa4249']),pants:choose(['#263348','#34342e','#49392f']),shoe:'#e5e4dc',eyeLeft:'#36312a',eyeRight:'#36312a'}};}
  const brokerPoint=points.filter(p=>layout.districts.some(d=>d.id==='favela'&&layout.inRect(p.x,p.z,d))).sort((a,b)=>Math.hypot(a.x+360,a.z-56)-Math.hypot(b.x+360,b.z-56))[0];
  if(!brokerPoint)throw Error('Favela sem ponto acessível para o contato.');
  const broker={...brokerPoint,label:'Zeca · contato da favela',contact:{name:'Zeca',appearance:{gender:'masculine',skin:'#ad7958',hair:'#201b19',hairStyle:'braids',headwear:'none',shirt:'#704d8c',pants:'#263348',shoe:'#e5e4dc',eyeLeft:'#36312a',eyeRight:'#36312a'}}};
  const file=join(root,'data','missions.json'),cache=new Map();let saved={},queue=Promise.resolve();
  if(database)await database.query('CREATE TABLE IF NOT EXISTS lowkey_missions (account_id UUID PRIMARY KEY,state JSONB NOT NULL)');
  else try{saved=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  function remember(id,state){cache.delete(id);cache.set(id,state);if(cache.size>256)cache.delete(cache.keys().next().value);return state;}
  async function load(id){if(database){if(cache.has(id))return remember(id,cache.get(id));return remember(id,(await database.query('SELECT state FROM lowkey_missions WHERE account_id=$1',[id])).rows[0]?.state||{});}return saved[id]||{};}
  async function save(id,state){if(database){await database.query('INSERT INTO lowkey_missions(account_id,state) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET state=EXCLUDED.state',[id,state]);remember(id,state);return;}const next={...saved,[id]:state};await mkdir(join(root,'data'),{recursive:true});await writeFile(file+'.tmp',JSON.stringify(next));await rename(file+'.tmp',file);saved=next;}
  const snapshot=s=>({balance:s.balance||0,completed:s.completed||0,careers:{legal:careerProgress(s,'legal'),illicit:careerProgress(s,'illicit')},broker,bestTimes:s.bestTimes||{},lastRace:s.lastRace||null,raceRoutes:layout.raceRoutes||[],cooldownUntil:s.cooldownUntil||0,active:s.active||null,pickup:s.active?.pickup||pickup,serverTime:now()});
  function near(player,point){return player?.position&&Math.hypot(player.position.x-point.x,player.position.z-point.z)<=3.5&&Math.abs(player.position.y-point.y)<=2;}
  async function operation(id,action,player,data,blocked){
    let state=structuredClone(await load(id)),time=now();
    if(state.active&&(time>=state.active.expiresAt||blocked||player?.health<=0||player?.ghost)){state.active=null;await save(id,state);}
    if(action==='state')return snapshot(state);
    if(action==='cancel'){state.active=null;await save(id,state);return snapshot(state);}
    if(!player||player.health<=0||player.ghost||blocked)fail(409,'Entrega indisponível agora. Saia do Zombies ou da prisão e esteja vivo.');
    if(action==='race-start'){
      if(state.active)fail(409,'Termine ou cancele a atividade atual.');if(time<(state.cooldownUntil||0))fail(429,'Espere 30 segundos antes de outra atividade.');
      if(!player.vehicleId||player.vehicleSeat!=='driver'||!['car','moto'].includes(data.vehicleKind))fail(409,'Entre como motorista de um carro ou moto.');
      const route=layout.raceRoutes.find(r=>r.id===data.routeId);if(!route)fail(400,'Circuito inválido.');
      if(!near(player,{...route.points[0],y:player.position.y}))fail(409,'Vá até a largada indicada no mapa.');
      const length=route.points.slice(1).reduce((total,p,i)=>total+Math.hypot(p.x-route.points[i].x,p.z-route.points[i].z),0);
      state.active={id:randomUUID(),kind:'race',stage:'race',routeId:route.id,name:route.name,checkpoints:route.points.slice(1),checkpoint:0,pickup:route.points[0],vehicleId:player.vehicleId,vehicleKind:data.vehicleKind,reward:deliveryReward(length),startsAt:time+5000,expiresAt:time+600000,length};
    }else if(action==='race-checkpoint'){
      const a=state.active;if(!a||a.kind!=='race'||a.id!==data.missionId)fail(409,'Essa corrida não está ativa.');
      if(player.vehicleId!==a.vehicleId||player.vehicleSeat!=='driver')fail(409,'Volte ao veículo usado na largada.');
      if(time<a.startsAt)fail(409,'Aguarde a largada.');
      const p=a.checkpoints[a.checkpoint];if(Math.hypot(player.position.x-p.x,player.position.z-p.z)>6||Math.abs(player.position.y-p.y)>2)fail(409,'Passe pelo próximo checkpoint.');
      const previous=a.checkpoint?a.checkpoints[a.checkpoint-1]:a.pickup,distance=Math.hypot(previous.x-p.x,previous.z-p.z);
      if(time-(a.lastCheckpointAt||a.startsAt)<distance/45*1000)fail(409,'Checkpoint alcançado rápido demais.');
      a.lastCheckpointAt=time;a.checkpoint++;
      if(a.checkpoint===a.checkpoints.length){const elapsed=time-a.startsAt,key=a.routeId+':'+a.vehicleKind;state.bestTimes||={};state.bestTimes[key]=Math.min(state.bestTimes[key]||Infinity,elapsed);state.lastRace={name:a.name,time:elapsed,record:state.bestTimes[key]===elapsed};state.balance=Math.min(Number.MAX_SAFE_INTEGER,(state.balance||0)+a.reward);state.active=null;state.cooldownUntil=time+30000;}
    }else if(action==='start'){
      if(state.active)fail(409,'Você já tem uma entrega.');if(time<(state.cooldownUntil||0))fail(429,'Espere 30 segundos antes de outra entrega.');
      const career=data.career||'legal';if(!['legal','illicit'].includes(career))fail(400,'Trabalho inválido.');const progress=careerProgress(state,career),start=career==='illicit'?broker:choose(points),limit=[180,320,550,Infinity][progress.level-1];
      if(career==='illicit'&&!near(player,broker))fail(409,'Vá até Zeca na favela para aceitar o contrato.');
      const destinations=points.filter(p=>{const d=Math.hypot(p.x-start.x,p.z-start.z);return d>=40&&d<=limit&&(career!=='illicit'||!layout.inSafeZone(p));});if(!destinations.length)fail(409,'Sem contratos disponíveis nesta região.');
      const end=choose(destinations),routeDistance=Math.round(Math.hypot(end.x-start.x,end.z-start.z));
      state.active={id:randomUUID(),kind:'delivery',career,level:progress.level,stage:'pickup',pickup:career==='illicit'?structuredClone(broker):{...start,contact:contact()},destination:{...end,contact:contact()},distance:routeDistance,reward:Math.round(deliveryReward(routeDistance)*(career==='illicit'?1.5+(progress.level-1)*.15:1)),expiresAt:time+600000};
    }else if(action==='interact'){
      const a=state.active;if(!a||a.kind==='race'||data.missionId!==a.id)fail(409,'Essa entrega não está ativa.');
      if(player.vehicleId||player.rideId)fail(409,'Desça do veículo para pegar ou entregar o pacote.');
      if(!near(player,a.stage==='pickup'?(a.pickup||pickup):a.destination))fail(409,'Chegue perto do ponto marcado.');
      if(a.stage==='pickup'){a.stage='deliver';a.pickedAt=time;}
      else {if(time-a.pickedAt<Math.max(4000,a.career==='illicit'?a.distance/45*1000:4000))fail(409,'Percorra o trajeto antes de entregar.');const career=a.career||'legal',progress=careerProgress(state,career);state.careers||={legal:{completed:careerProgress(state,'legal').completed},illicit:{completed:careerProgress(state,'illicit').completed}};state.careers[career]={completed:progress.completed+1};state.balance=Math.min(Number.MAX_SAFE_INTEGER,(state.balance||0)+a.reward);state.completed=(state.completed||0)+1;state.active=null;state.cooldownUntil=time+30000;}
    }else fail(404,'Ação de missão inválida.');
    await save(id,state);return snapshot(state);
  }
  return {raceStartUntil(id){const a=(database?cache.get(id):saved[id])?.active;return a?.kind==='race'?a.startsAt:0;},carrying(id){const a=(database?cache.get(id):saved[id])?.active;return Boolean(a&&a.stage==='deliver'&&a.expiresAt>now());},illicitCarrying(id){const a=(database?cache.get(id):saved[id])?.active;return Boolean(a?.career==='illicit'&&a.stage==='deliver'&&a.expiresAt>now());},run(id,action,player=null,data={},blocked=false){const task=queue.catch(()=>{}).then(()=>operation(id,action,player,data,blocked));queue=task;return task;},cancel(id){return this.run(id,'cancel');}};
}
