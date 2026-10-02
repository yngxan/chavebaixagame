import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('female silhouette has modest clothed chest and pelvis volume without changing male rig',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),context=vm.createContext({console:{warn(){},log(){}}});
  vm.runInContext(await readFile(new URL('../three.min.js',import.meta.url),'utf8'),context);
  vm.runInContext('const avatarSphereGeo=new THREE.SphereGeometry(1,20,16),combatSnowMaterial=new THREE.MeshStandardMaterial();function makeGlockModel(parent){const g=new THREE.Group();parent.add(g);return g;}',context);
  for(const name of ['solid','addRoundVolume','avatarMesh','profileSurface','curvedLock','clothPanel','addRoundTorso','addRoundLimbs','pointInsideBodyCollider']){
    const start=html.indexOf('  function '+name+'(');assert.ok(start>=0,name);let depth=0,end=html.indexOf('{',start);for(;end<html.length;end++){if(html[end]==='{')depth++;if(html[end]==='}'&&--depth===0){end++;break;}}vm.runInContext(html.slice(start,end),context);
  }
  const THREE=context.THREE,shirt=new THREE.MeshStandardMaterial(),pants=new THREE.MeshStandardMaterial(),skin=new THREE.MeshStandardMaterial(),shoe=new THREE.MeshStandardMaterial();
  const bodies={};
  for(const gender of ['masculine','feminine']){
    const body=new THREE.Group();context.body=body;context.gender=gender;context.shirt=shirt;context.pants=pants;context.skin=skin;context.shoe=shoe;
    vm.runInContext('addRoundTorso(body,gender,shirt);addRoundLimbs(body,gender,shirt,pants,skin,shoe);',context);body.updateMatrixWorld(true);bodies[gender]=body;
    body.traverse(mesh=>{if(mesh.geometry)assert.ok(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite));});
  }
  const round=(body,mat)=>body.children.filter(m=>m.geometry?.type==='SphereGeometry'&&m.material===mat);
  assert.equal(round(bodies.masculine,shirt).length,0);assert.equal(round(bodies.feminine,shirt).length,2);
  assert.equal(round(bodies.masculine,pants).length,0);assert.equal(round(bodies.feminine,pants).length,2);
  assert.ok(round(bodies.feminine,shirt).every(m=>m.position.z+m.scale.z<=.26));
  assert.ok(round(bodies.feminine,pants).every(m=>m.position.z-m.scale.z>=-.24));
  context.body=bodies.feminine;context.point=new THREE.Vector3(.12,1.35,.24);
  assert.equal(vm.runInContext('pointInsideBodyCollider(body,point)',context),true,'clothed volume participates in hand clearance');
  const arms=bodies.feminine.children.filter(c=>c.userData.forearm);assert.equal(arms.length,2);assert.ok(arms.some(a=>a.userData.side===-1)&&arms.some(a=>a.userData.side===1));
});
