import './weapons.js';
const W=globalThis.LowkeyWeapons;
const finite=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
export function resolveWeaponAttack({weaponId,data,player,targets,segmentHit,block,random=Math.random}){
  const def=W.get(weaponId),facing=Math.atan2(Math.sin(finite(data.facing,player.rotation)),Math.cos(finite(data.facing,player.rotation)));
  let yaw=Math.atan2(Math.sin(finite(data.cameraYaw,-facing)),Math.cos(finite(data.cameraYaw,-facing))),pitch=Math.max(-Math.PI/2+.04,Math.min(Math.PI/2-.04,finite(data.pitch)));
  let position=player.position;const snapshot=data.shotPosition;
  if(snapshot&&[snapshot.x,snapshot.y,snapshot.z].every(Number.isFinite)&&Math.hypot(snapshot.x-position.x,snapshot.y-position.y,snapshot.z-position.z)<=1.8)position=snapshot;
  let origin={x:position.x+Math.sin(facing)*.38,y:position.y+1.43,z:position.z+Math.cos(facing)*.38};const supplied=data.launchOrigin;
  if(W.firearm(weaponId)&&supplied&&[supplied.x,supplied.y,supplied.z].every(Number.isFinite)&&Math.hypot(supplied.x-position.x,supplied.z-position.z)<=1.5&&supplied.y-position.y>=.2&&supplied.y-position.y<=2.8)origin={...supplied};
  const aim=data.aimPoint;if(W.firearm(weaponId)&&aim&&[aim.x,aim.y,aim.z].every(Number.isFinite)){const dx=aim.x-origin.x,dy=aim.y-origin.y,dz=aim.z-origin.z,length=Math.hypot(dx,dy,dz);if(length>.1&&length<=110){yaw=Math.atan2(-dx,dz);pitch=Math.atan2(-dy,Math.hypot(dx,dz));}}
  if(weaponId==='knife'){yaw=-facing;origin={x:position.x,y:position.y+1.42,z:position.z};}
  const burst=finite(data.burst,1),ground=globalThis.LowkeyWorld.groundHeight(position.x,position.z)??position.y;
  const spread=weaponId==='knife'?0:((def.spread||0)+burst*(def.bloom||0)+(player.speed>5.2?.009:player.speed>2?.0035:0)+(position.y>ground+.2?.013:0))*(data.aiming===true?.7:1);
  const directions=W.shotDirections(weaponId,yaw,pitch,spread,random),shots=[],hitMap=new Map();
  for(const direction of directions){const end={x:origin.x+direction.x*def.range,y:origin.y+direction.y*def.range,z:origin.z+direction.z*def.range};let nearest=block(origin,end)??Infinity,target=null;
    for(const candidate of targets){if(candidate.id===player.id||(player.vehicleId&&candidate.vehicleId===player.vehicleId)||candidate.health<=0||candidate.ghost||globalThis.LowkeyCityLayout.inSafeZone(candidate.position))continue;const hit=segmentHit(origin,end,candidate.position,weaponId==='knife'?.39:.34);if(hit!==null&&hit<nearest){target=candidate;nearest=hit;}}
    const hitPoint=Number.isFinite(nearest)?{x:origin.x+(end.x-origin.x)*nearest,y:origin.y+(end.y-origin.y)*nearest,z:origin.z+(end.z-origin.z)*nearest}:end;
    const headshot=Boolean(target&&weaponId!=='knife'&&hitPoint.y>=target.position.y+1.63);
    if(target){const falloff=weaponId==='shotgun'?Math.max(.25,1-nearest*.7):1,damage=Math.max(1,Math.round((headshot?def.headDamage:def.damage)*falloff)),previous=hitMap.get(target.id)||{target,damage:0,headshot:false,direction};previous.damage+=damage;previous.headshot||=headshot;hitMap.set(target.id,previous);}
    shots.push({end:hitPoint,hit:Boolean(target),targetId:target?.id||null,headshot});
  }
  return{origin,facing,pitch,shots,hits:[...hitMap.values()]};
}
