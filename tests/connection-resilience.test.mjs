import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');

test('a temporary state error or an old request does not disable the open room connection',async()=>{
  let tick,resolveRequest,reconnects=0;
  const sandbox=vm.createContext({AbortController,setTimeout,clearTimeout,
    setInterval:callback=>{tick=callback;},fetch:()=>new Promise(resolve=>{resolveRequest=resolve;}),
    connected:true,localId:'current-player',stateRequestsInFlight:0,stateSequence:0,localVehicleId:null,
    document:{hidden:false},performance:{now:()=>1000},currentProfilePayload:()=>({name:'TEST',appearance:{}}),
    avatar:{position:{x:0,y:0,z:0},rotation:{y:0}},currentMoveSpeed:5,onGround:true,voiceEnabled:false,
    glockEquipped:false,pitch:0,glockAiming:false,setConnection:()=>{},updateRoomStatus:()=>{},connectRoom:()=>{reconnects++;}});
  vm.runInContext(html.slice(html.indexOf('  let lastMovementProfile='),html.indexOf('  const colorControls=')),sandbox);
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  tick();resolveRequest({ok:false,status:503});await settle();
  assert.equal(sandbox.connected,true);assert.equal(sandbox.stateRequestsInFlight,0);
  tick();sandbox.localId='replacement-player';resolveRequest({ok:false,status:401});await settle();
  assert.equal(sandbox.connected,true);assert.equal(reconnects,0,'an old session response cannot restart the replacement session');
  tick();resolveRequest({ok:false,status:401});await settle();assert.equal(reconnects,1,'a lost current room session reconnects');
});
