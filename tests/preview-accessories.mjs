// Isolated local preview: never opens production accounts or their saved data.
import { mkdtemp,copyFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname,basename,resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const fixture=await mkdtemp(join(tmpdir(),'lowkey-accessories-preview-'));
for(const file of ['server.mjs','index.html','three.min.js','stage-media.js','motion-sync.js','world-systems.js','environment.js','vehicles-client.js'])await copyFile(new URL('../'+file,import.meta.url),join(fixture,file));
const child=spawn(process.execPath,[join(fixture,'server.mjs')],{env:{...process.env,PORT:'4187',DATABASE_URL:'',RENDER:'',CF_SFU_APP_ID:'',CF_SFU_APP_SECRET:''},stdio:['ignore','inherit','inherit']});
console.log('Accessory preview: http://localhost:4187');
let stopping=false;async function cleanup(){if(stopping)return;stopping=true;const stopped=once(child,'exit');child.kill();await stopped;assertFixture();await rm(fixture,{recursive:true,force:true});process.exit();}
function assertFixture(){if(dirname(resolve(fixture))!==resolve(tmpdir())||!basename(fixture).startsWith('lowkey-accessories-preview-'))throw new Error('Unsafe preview cleanup target');}
process.on('SIGINT',cleanup);process.on('SIGTERM',cleanup);
