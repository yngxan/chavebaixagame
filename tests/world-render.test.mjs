import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
let now=0;
const label={textContent:''},sandbox=vm.createContext({console:{warn(){},log(){}},performance:{now:()=>now},document:{querySelector:()=>label}});
for(const file of ['three.min.js','world-systems.js','motion-sync.js','environment.js','vehicles-client.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),sandbox);
const THREE=sandbox.THREE;

test('night actually changes sky, lamp illumination, moon and stars in the scene',()=>{
  const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xadcbd1,45,115);
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1),new THREE.ShaderMaterial({uniforms:{daylight:{value:1}}}));
  const sun=new THREE.DirectionalLight(),sunOrb=new THREE.Mesh(),hemi=new THREE.HemisphereLight(),fill=new THREE.DirectionalLight(),ambient=new THREE.AmbientLight();
  const lampMaterial=new THREE.MeshStandardMaterial(),lamps=[new THREE.PointLight()],renderer={toneMappingExposure:1};
  const environment=sandbox.LowkeyEnvironment.create({THREE,scene,sky,sun,sunOrb,hemi,fill,ambient,renderer,lamps,lampMaterial,cloudMaterials:[]});
  environment.sync(1800000+15000);assert.equal(environment.update(),0);assert.equal(lamps[0].intensity,0);assert.equal(sky.material.uniforms.daylight.value,1);
  environment.sync(2700000+15000);assert.equal(environment.update(),1);assert.equal(lamps[0].intensity,18);assert.equal(sky.material.uniforms.daylight.value,0);assert.equal(sunOrb.visible,false);
  assert.ok(scene.children.find(node=>node.type==='Points').material.opacity>.8);assert.ok(label.textContent.includes('NOITE'));
});

test('unoccupied vehicles do not attach themselves to an unconnected avatar; real drivers receive a seated pose',()=>{
  const scene=new THREE.Scene(),material=new THREE.MeshStandardMaterial();
  const box=(parent,x,y,z,sx,sy,sz,mat)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
  const controller=sandbox.LowkeyVehicles.create({THREE,scene,box,mats:{red:material}});
  assert.equal(controller.active(null),null);assert.equal(controller.active(undefined),null);assert.equal(controller.active('unconnected'),null);
  controller.update(1/60,0,0,null,{throttle:0,steer:0,brake:false},1);
  const records=sandbox.LowkeyWorld.initialVehicles();records[0].driverId='driver';
  controller.receive({vehicles:records,serverTime:100},100,100);
  controller.update(1/60,100,100,'driver',{throttle:1,steer:0,brake:false},1);
  const model=controller.active('driver');assert.ok(model);assert.equal(controller.driverPose(model).scale,.62);assert.ok(model.headlight.intensity>0);
});
