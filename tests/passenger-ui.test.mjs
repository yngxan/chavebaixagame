import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=html.match(/  function placeVehicleDriver\([^\n]+/)[0];
function rig(){return{position:{set(){}},rotation:{set(){},y:0},scale:{setScalar(){}}};}
test('passenger aims independently while seated, on both vehicles',()=>{
  for(const kind of ['car','moto'])for(const driver of [false,true]){
    const group=rig(),body=rig(),arms=[rig(),rig()],legs=[rig(),rig()],calls=[];arms.forEach(a=>a.userData={side:1});
    const model={state:{kind},group:rig()},context={localId:'me',selectedWeapon:'glock',yaw:-1.2,pitch:-.3,remotePlayers:new Map(),vehicleController:{pose:()=>({x:0,y:0,z:0,rotation:.2,scale:1}),isDriver:()=>driver},holdThirdPersonGlock:(...args)=>calls.push(args)};
    vm.runInNewContext(source+';globalThis.place=placeVehicleDriver;',context);context.place(model,group,arms,legs,body);
    assert.equal(calls.length,driver?0:1);if(!driver){assert.ok(Math.abs(body.rotation.y-1)<1e-8);assert.equal(calls[0][4],-.3);}
  }
});
test('passenger HUD is not hidden by the driver CSS',()=>{assert.ok(html.includes('.driving:not(.passenger) .combat-bar'));assert.ok(html.includes("document.body.classList.toggle('passenger',isLocalPassenger())"));});
