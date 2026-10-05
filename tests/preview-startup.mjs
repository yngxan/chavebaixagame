// Disposable browser fixture; never reads production accounts.
import {mkdtemp,copyFile,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const fixture=await mkdtemp(join(tmpdir(),'lowkey-startup-preview-'));
const previewPort=Number(process.env.LOWKEY_PREVIEW_PORT||4196);if(!Number.isInteger(previewPort)||previewPort<1024||previewPort>65535)throw new Error('Invalid preview port');
for(const file of ['server.mjs','index.html','mobile-ui.css','missions-client.js','three.min.js','stage-media.js','motion-sync.js','city-layout.js','world-systems.js','city-client.js','festival-client.js','coast-client.js','environment.js','vehicles-client.js','zombies-client.js','zombies-server.mjs','game-security.mjs','weapons.js','weapons-server.mjs','social-server.mjs','missions-server.mjs','police-server.mjs','weapon-wheel.js','voice-face.js','phone-client.js','police-client.js','map-client.js'])await copyFile(new URL('../'+file,import.meta.url),join(fixture,file));
// Optional test-drive spawn exists only in this disposable local server copy.
if(process.env.LOWKEY_TEST_DRIVE==='1'){
  const path=join(fixture,'server.mjs'),source=await readFile(path,'utf8'),original='position: lastKnownPositions.get(authenticatedAccount.id) || { x: Math.cos(angle) * radius, y: 18, z: 5 + Math.sin(angle) * radius }';
  if(!source.includes(original))throw new Error('Test-drive spawn source changed');
  const spawn="position: (()=>{const occupied=[...vehicles.keys()].filter(key=>key.startsWith('test-drive-')).length,p=LowkeyWorld.city.garagePoint(-3+occupied*6,12),v={...vehicles.get('garage-car'),id:'test-drive-'+id,x:p.x,z:p.z,y:LowkeyWorld.groundHeight(p.x,p.z),garageBay:null,driverId:id,passengerIds:[]};vehicles.set(v.id,v);vehicleInputs.set(v.id,{throttle:0,steer:0,brake:true,at:Date.now(),sequence:-1});const seat=LowkeyWorld.driverPose(v);return {x:seat.x,y:seat.y,z:seat.z};})()";
  const locationSpawn=process.env.LOWKEY_CUSTOMS==='1'?spawn.replace('LowkeyWorld.city.garagePoint(-3+occupied*6,12)','LowkeyWorld.city.storePoint(LowkeyWorld.city.customs,0,0)'):spawn;
  await writeFile(path,source.replace(original,locationSpawn).replace('if(savedVitals){player.health=',"player.vehicleId='test-drive-'+id;player.vehicleSeat='driver';player.rotation=LowkeyWorld.city.garage.rotation;\n    if(savedVitals){player.health="));
}
const child=spawn(process.execPath,[join(fixture,'server.mjs')],{env:{...process.env,PORT:String(previewPort),DATABASE_URL:'',RENDER:'',CF_SFU_APP_ID:'',CF_SFU_APP_SECRET:''},stdio:['ignore','inherit','inherit']});
console.log(`Isolated startup preview: http://localhost:${previewPort}`);
let stopping=false;
async function cleanup(){if(stopping)return;stopping=true;const stopped=once(child,'exit');child.kill();await stopped;if(dirname(resolve(fixture))!==resolve(tmpdir())||!basename(fixture).startsWith('lowkey-startup-preview-'))throw new Error('Unsafe fixture target');await rm(fixture,{recursive:true,force:true});process.exit();}
process.on('SIGINT',cleanup);process.on('SIGTERM',cleanup);
