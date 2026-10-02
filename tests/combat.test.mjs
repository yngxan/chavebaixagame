import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const server=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
function loadFunction(source,name,dependencies={}){
  const start=source.indexOf(`function ${name}(`),brace=source.indexOf('{',start);let depth=1,end=brace+1;
  assert.ok(start>=0,`Missing ${name}`);
  while(depth&&end<source.length){if(source[end]==='{')depth++;if(source[end]==='}')depth--;end++;}
  return Function(...Object.keys(dependencies),`return (${source.slice(start,end)});`)(...Object.values(dependencies));
}
const poseAt=loadFunction(html,'combatPoseAt');
const hit=loadFunction(server,'playerSegmentHit');

test('administrator permission is bound to the existing account ID, not avatar names',()=>{
  const isAdmin=loadFunction(server,'isAdministrator',{administratorAccountId:'owner-id',additionalAdministrators:new Set(['promoted-id'])});
  assert.equal(isAdmin({id:'owner-id',username:'yngxan'}),true);
  assert.equal(isAdmin({id:'other-id',username:'yngxan',role:'admin'}),false);
  assert.equal(isAdmin(null),false);
  assert.equal(isAdmin({id:'promoted-id'}),true);
  const disabled=loadFunction(server,'isAdministrator',{administratorAccountId:null,additionalAdministrators:new Set()});
  assert.equal(disabled({id:null,username:'yngxan'}),false);
});
test('camera can look vertically up and down without flipping',()=>{
  const clamp=loadFunction(html,'clampCameraPitch');
  assert.ok(clamp(-10)<-1.55);assert.ok(clamp(10)>1.55);
  assert.ok(clamp(-10)>-Math.PI/2);assert.ok(clamp(10)<Math.PI/2);
  assert.equal(clamp(0),0);assert.equal(clamp(.7),.7);
});

test('first-person fist extends forward and returns to its resting position',()=>{
  const hand=joint();hand.position.set=function(x,y,z){Object.assign(this,{x,y,z});};hand.scale={setScalar(value){this.value=value;}};hand.userData.ball={visible:false};const camera={aspect:16/9};
  const action={kind:'punch',startedAt:0,until:520};
  const update=loadFunction(html,'updateFirstPersonHand',{firstPersonHand:hand,localCombat:action,combatPoseAt:poseAt,walkTime:0,currentMoveSpeed:0,camera});
  update(218,true);assert.ok(hand.position.z<-.8);assert.ok(hand.position.y>-.22);assert.equal(hand.visible,true);
  update(520,true);assert.equal(hand.position.x,.34);assert.equal(hand.position.y,-.32);assert.equal(hand.position.z,-.62);
  update(520,false);assert.equal(hand.visible,false);
  camera.aspect=390/844;update(520,true);assert.ok(hand.position.x<.12);assert.equal(hand.scale.value,.55);
});

test('both action cycles stay bounded, continuous and return to neutral',()=>{
  for(const kind of ['punch','snowball']){
    let previous=poseAt(kind,0);
    for(let frame=0;frame<=1000;frame++){
      const pose=poseAt(kind,frame/1000);
      for(const [joint,value] of Object.entries(pose)){
        assert.ok(Number.isFinite(value));assert.ok(Math.abs(value-previous[joint])<.04);
      }
      assert.ok(pose.shoulder>=-2.26&&pose.shoulder<=.001);
      assert.ok(pose.elbow>=-1.16&&pose.elbow<=.001);
      assert.ok(pose.outward>=0&&pose.outward<=.281);previous=pose;
    }
    for(const p of [-1,0,1,2])for(const value of Object.values(poseAt(kind,p)))assert.equal(value,0);
  }
});

function joint(){return{rotation:{x:0,y:0,z:0,set(x,y,z){Object.assign(this,{x,y,z});}},position:{z:0},userData:{}};}
test('finishing an attack restores the hand and removes all combat offsets',()=>{
  const arms=[joint(),joint()],body=joint();
  for(const arm of arms){arm.userData.forearm=joint();arm.userData.handParts=[{visible:true}];arm.userData.fist={visible:false};arm.userData.snowball={visible:false};}
  const resetSmoking=loadFunction(html,'resetSmokingArmPose');
  const reset=loadFunction(html,'resetCombatPose',{resetSmokingArmPose:resetSmoking});
  const apply=loadFunction(html,'applyCombatPose',{resetCombatPose:reset,combatPoseAt:poseAt});
  for(const kind of ['punch','snowball']){
    const action={kind,startedAt:0,until:680};body.rotation.y=4;
    assert.equal(apply(arms,action,200,body),true);assert.equal(body.rotation.y,0);
    assert.equal(arms[1].userData.fist.visible,true);
    assert.equal(arms[1].userData.snowball.visible,kind==='snowball');
    assert.equal(apply(arms,action,680,body),false);
    for(const arm of arms){assert.equal(arm.rotation.x,0);assert.equal(arm.rotation.z,0);assert.equal(arm.userData.forearm.rotation.x,0);assert.equal(arm.userData.handParts[0].visible,true);assert.equal(arm.userData.fist.visible,false);assert.equal(arm.userData.snowball.visible,false);}
  }
});

test('aimed punches hit in every camera direction, and miss behind or out of reach',()=>{
  const origin={x:0,y:1.42,z:0};
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    const forward={x:-Math.sin(yaw),z:Math.cos(yaw)};
    const end={x:forward.x*1.7,y:1.42,z:forward.z*1.7};
    assert.notEqual(hit(origin,end,{x:forward.x*1.2,y:0,z:forward.z*1.2},.36),null);
    assert.equal(hit(origin,end,{x:-forward.x,y:0,z:-forward.z},.36),null);
    assert.equal(hit(origin,end,{x:forward.x*2.4,y:0,z:forward.z*2.4},.36),null);
  }
});

test('swept snowballs hit upper and lower body without tunnelling',()=>{
  const target={x:0,y:0,z:2};
  for(const y of [.4,1.4,2.1])assert.notEqual(hit({x:0,y,z:0},{x:0,y,z:5},target,.43),null);
  assert.equal(hit({x:.8,y:1.4,z:0},{x:.8,y:1.4,z:5},target,.43),null);
});
