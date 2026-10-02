// The server owns waves, enemy movement, health and damage. Clients only render them.
export function createZombiesGame({world,players,broadcast,damagePlayer,restorePlayers,clock=Date.now,random=Math.random}) {
  const zombies=new Map();let serial=0,lastAt=clock(),lastBroadcast=0,spawnAt=0,ownerId=null;
  let state={active:false,phase:'idle',round:0,total:0,pending:0,kills:0,nextRoundAt:0};
  const palettes={skin:['#71875d','#859568','#617e69','#9a9870'],hair:['#16151b','#483026','#70503b','#b5aa87','#a95436'],shirt:['#623c48','#465d74','#3f6356','#8b6742','#6c557d','#797969'],pants:['#282a32','#41474b','#433b34','#303d48']};
  const pick=values=>values[Math.floor(random()*values.length)];
  const meta=()=>({...state,remaining:state.pending+zombies.size,alive:zombies.size});
  const snapshot=()=>({type:'zombies-state',serverTime:clock(),state:meta(),zombies:[...zombies.values()].map(z=>({...z,position:{...z.position}}))});
  function announce(text){broadcast({type:'system',text});}
  function nextRound(now){
    state.round++;state.phase='fighting';state.total=Math.min(64,4+state.round*2+Math.min(4,players.size)*2);state.pending=state.total;state.nextRoundAt=0;spawnAt=now;
    announce(`ZOMBIES · ROUND ${state.round} · ${state.total} zumbis`);broadcast(snapshot());
  }
  function start(accountId){
    if(state.active&&state.phase!=='gameover')return {started:false,state:meta()};
    zombies.clear();ownerId=accountId;state={active:true,phase:'fighting',round:0,total:0,pending:0,kills:0,nextRoundAt:0};lastAt=clock();restorePlayers();nextRound(lastAt);return {started:true,state:meta()};
  }
  function stop(reason='Modo Zombies encerrado.') {const wasActive=state.active;state.active=false;state.phase='idle';state.pending=0;state.nextRoundAt=0;zombies.clear();if(wasActive)restorePlayers();announce(reason);broadcast(snapshot());}
  function hurt(id,damage,attackerId,impulse=null){
    const zombie=zombies.get(id);if(!state.active||!zombie||zombie.health<=0||clock()<zombie.spawnAt+1600)return false;
    zombie.health=Math.max(0,zombie.health-Math.min(100,Math.max(0,damage)));
    if(impulse){zombie.knockback={x:impulse.x||0,z:impulse.z||0};zombie.stunnedUntil=clock()+180;}
    const killed=zombie.health===0;broadcast({type:'zombie-hit',id,shooterId:attackerId,health:zombie.health,killed,time:clock()});
    if(killed){zombies.delete(id);state.kills++;}return true;
  }
  function spawn(now){
    const targets=[...players.values()].filter(p=>p.health>0&&world.groundHeight(p.position.x,p.position.z)!==null),anchor=pick(targets)||{position:{x:0,z:5}};let position;
    for(let i=0;i<40;i++){
      const angle=random()*Math.PI*2,radius=10+random()*6,x=Math.max(-42,Math.min(42,anchor.position.x+Math.cos(angle)*radius)),z=Math.max(-42,Math.min(42,anchor.position.z+Math.sin(angle)*radius));
      if(world.clearAt(x,z,.45)&&targets.every(p=>Math.hypot(p.position.x-x,p.position.z-z)>6)&&[...zombies.values()].every(p=>Math.hypot(p.position.x-x,p.position.z-z)>.8)){position={x,y:world.groundHeight(x,z),z};break;}
    }
    if(!position)return;
    const zombie={id:`zombie-${++serial}`,enemy:true,position,rotation:0,spawnAt:now,health:40+state.round*12,maxHealth:40+state.round*12,speed:Math.min(3.8,1.4+state.round*.14),attackAt:0,appearance:{skin:pick(palettes.skin),hair:pick(palettes.hair),hairStyle:pick(['buzz','messy','lowBlack','braids','mohawk']),shirt:pick(palettes.shirt),pants:pick(palettes.pants)}};
    zombies.set(zombie.id,zombie);state.pending--;broadcast({type:'zombie-spawn',zombie,serverTime:now,state:meta()});
  }
  function tick(){
    const now=clock(),dt=Math.max(0,Math.min(.1,(now-lastAt)/1000));lastAt=now;if(!state.active)return;
    if(!players.size){stop('Zombies encerrado: a sala ficou vazia.');return;}
    const humans=[...players.values()].filter(p=>p.health>0&&p.position.y>=-.3&&world.groundHeight(p.position.x,p.position.z)!==null);
    if(![...players.values()].some(p=>p.health>0)){
      stop(`ZOMBIES CONCLUÍDO · ROUND ${state.round} · ${state.kills} eliminações. A cidade voltou ao modo normal.`);
      return;
    }
    if(state.phase==='gameover')return;
    if(state.phase==='intermission'){if(now>=state.nextRoundAt)nextRound(now);}
    if(state.pending>0&&zombies.size<14&&now>=spawnAt){spawn(now);spawnAt=now+450;}
    for(const zombie of zombies.values()){
      if(now<zombie.spawnAt+1600)continue;
      const target=humans.reduce((best,p)=>!best||Math.hypot(p.position.x-zombie.position.x,p.position.z-zombie.position.z)<Math.hypot(best.position.x-zombie.position.x,best.position.z-zombie.position.z)?p:best,null);if(!target)continue;
      const dx=target.position.x-zombie.position.x,dz=target.position.z-zombie.position.z,length=Math.hypot(dx,dz);zombie.rotation=Math.atan2(dx,dz);
      if(zombie.knockback){const x=zombie.position.x+zombie.knockback.x*dt,z=zombie.position.z+zombie.knockback.z*dt;if(world.clearAt(x,z,.32)){zombie.position.x=x;zombie.position.z=z;}zombie.knockback.x*=Math.exp(-5*dt);zombie.knockback.z*=Math.exp(-5*dt);}
      if(length>1.12&&now>=(zombie.stunnedUntil||0)){
        const travel=zombie.speed*dt;
        for(const turn of [0,.55,-.55,1.1,-1.1,1.65,-1.65]){
          const direction=zombie.rotation+turn,x=zombie.position.x+Math.sin(direction)*travel,z=zombie.position.z+Math.cos(direction)*travel;
          if(world.clearAt(x,z,.32)){zombie.position.x=x;zombie.position.z=z;zombie.rotation=direction;break;}
        }
      }
      zombie.position.y=world.groundHeight(zombie.position.x,zombie.position.z)??-.05;
      if(length<1.5&&Math.abs(target.position.y-zombie.position.y)<1.5&&now>=zombie.attackAt&&world.shotBlock?.({x:zombie.position.x,y:zombie.position.y+1.4,z:zombie.position.z},{x:target.position.x,y:target.position.y+1.4,z:target.position.z})===null){
        zombie.attackAt=now+1150;damagePlayer(target,Math.min(24,10+Math.floor(state.round/3)*2),zombie);broadcast({type:'zombie-attack',id:zombie.id,targetId:target.id,time:now});
      }
    }
    if(!state.pending&&!zombies.size&&state.phase==='fighting'){state.phase='intermission';state.nextRoundAt=now+5500;announce(`ROUND ${state.round} CONCLUÍDO · próximo em 5 segundos`);broadcast(snapshot());}
    if(now-lastBroadcast>=100){lastBroadcast=now;broadcast({type:'zombies-motion',serverTime:now,state:meta(),zombies:[...zombies.values()].map(z=>[z.id,z.position.x,z.position.y,z.position.z,z.rotation,z.health])});}
  }
  return {zombies,start,stop,hurt,tick,snapshot,get active(){return state.active;},get ownerId(){return ownerId;}};
}
