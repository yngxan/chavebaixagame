import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('repeated police snapshots reuse models, batch body panels and clean up only owned resources',async()=>{
  const element=()=>({appendChild(){},setAttribute(){},getContext:()=>({fillRect(){},fillText(){}})}),sandbox=vm.createContext({console:{warn(){}},Date,performance:{now:()=>1000},document:{createElement:element,querySelector:element,head:element()}});
  for(const name of ['three.min.js','police-client.js'])vm.runInContext(await readFile(new URL('../'+name,import.meta.url),'utf8'),sandbox);
  const T=sandbox.THREE,scene=new T.Scene();let created=0,cleaned=0,sharedDisposals=0;
  const controller=sandbox.LowkeyPolice.create({THREE:T,scene,getLocalId:()=>null,makeAvatar(){created++;const group=new T.Group(),head=new T.Group(),body=new T.Group();group.add(head,body);scene.add(group);return{group,head,body,arms:[new T.Group(),new T.Group()],legs:[new T.Group(),new T.Group()]};},disposeAvatar(group){cleaned++;group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}});
  const state={type:'police-state',serverTime:1000,cars:[{id:'car',x:0,y:0,z:0,rotation:0,speed:1,lights:false}],officers:[{id:'cop',position:{x:0,y:0,z:0},rotation:0,health:100,walking:false,seated:false}],wanted:[]};
  controller.receive(state);const model=controller.models.get('car'),rig=controller.rigs.get('cop');let meshes=0;model.group.traverse(o=>meshes+=Number(Boolean(o.isMesh)));assert.ok(meshes<=13,`batched car render meshes: ${meshes}`);
  for(const batch of model.batches){batch.geometry.addEventListener('dispose',()=>sharedDisposals++);batch.material.addEventListener('dispose',()=>sharedDisposals++);}
  for(let i=0;i<100;i++)controller.receive(state);assert.equal(created,1);assert.equal(scene.children.length,2);assert.equal(controller.models.get('car'),model);assert.equal(controller.rigs.get('cop'),rig);assert.ok(model.samples.length<=5);
  controller.receive({...state,officers:[]});assert.equal(cleaned,1);assert.equal(sharedDisposals,0,'removing a cop must not dispose shared car geometry or materials');
  controller.receive({...state,cars:[],officers:[]});assert.equal(scene.children.length,0);assert.equal(controller.models.size,0);assert.equal(controller.rigs.size,0);
});
