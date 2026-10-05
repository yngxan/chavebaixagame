import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import '../weapons.js';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function functionSource(name){
  const start=html.indexOf(`function ${name}(`),brace=html.indexOf('{',start);
  let depth=1,end=brace+1;
  while(depth&&end<html.length){if(html[end]==='{')depth++;if(html[end]==='}')depth--;end++;}
  assert.ok(start>=0);
  return html.slice(start,end);
}

test('each press sends a punch while earlier requests and swings are still pending',async()=>{
  const requests=[],resolvers=[];
  const context=vm.createContext({
    performance:{now:()=>100},LowkeyWeapons,
    fetch:(_url,options)=>{requests.push(JSON.parse(options.body));return new Promise(resolve=>resolvers.push(resolve));},
  });
  vm.runInContext(`
    let localCombat=null,localCombatNextAt=0,punchSwingSequence=0,localEmote=null,localEmoteUntil=0;
    const localVehicleId=null,authenticatedUser=true,connected=true,localId='synthetic-player';
    const glockEquipped=false,localHealth=100,avatar={rotation:{y:0}},arms=[],bodyGroup={};
    const yaw=.7,pitch=-.2,firstPerson=true,localEmoteDisplay=null,avatarSmokingProps={};
    const resetCombatPose=()=>{},updateSmokingProps=()=>{},showCombatBadge=()=>{},showToast=()=>{};
    const coastController={rideSeats:new Map()},localHijackPending=false,localGhost=false,weaponWheel=null,gamePhone=null,gameMap={isOpen:()=>false},policeController={isJailed:()=>false},LowkeyCityLayout={inSafeZone:()=>false};
    const selectedWeapon='punch',weaponSwitchPending=false,weaponSwitchUntil=0;
    ${functionSource('beginLocalCombat')}
    async ${functionSource('triggerCombat')}
    globalThis.pending=Array.from({length:8},()=>triggerCombat('attack'));
  `,context);
  assert.equal(requests.length,8);
  assert.deepEqual(requests.map(request=>request.swingId),[1,2,3,4,5,6,7,8]);
  for(const request of requests){assert.equal(request.facing,-.7);assert.equal(request.pitch,-.2);}
  assert.equal(vm.runInContext('localCombat.until-localCombat.startedAt',context),180);
  resolvers[0]({ok:false,status:429,json:async()=>({error:'synthetic delayed rejection'})});
  await context.pending[0];
  assert.equal(vm.runInContext('localCombat!==null',context),true,'an old rejected request cannot cancel the latest swing');
  for(const resolve of resolvers.slice(1))resolve({ok:true});
  await Promise.all(context.pending);
});
