// Disposable browser fixture; never reads production accounts.
import {mkdtemp,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const fixture=await mkdtemp(join(tmpdir(),'lowkey-startup-preview-'));
for(const file of ['server.mjs','index.html','three.min.js','stage-media.js','motion-sync.js','world-systems.js','environment.js','vehicles-client.js','zombies-client.js','zombies-server.mjs','game-security.mjs'])await copyFile(new URL('../'+file,import.meta.url),join(fixture,file));
const child=spawn(process.execPath,[join(fixture,'server.mjs')],{env:{...process.env,PORT:'4196',DATABASE_URL:'',RENDER:'',CF_SFU_APP_ID:'',CF_SFU_APP_SECRET:''},stdio:['ignore','inherit','inherit']});
console.log('Isolated startup preview: http://localhost:4196');
let stopping=false;
async function cleanup(){if(stopping)return;stopping=true;const stopped=once(child,'exit');child.kill();await stopped;if(dirname(resolve(fixture))!==resolve(tmpdir())||!basename(fixture).startsWith('lowkey-startup-preview-'))throw new Error('Unsafe fixture target');await rm(fixture,{recursive:true,force:true});process.exit();}
process.on('SIGINT',cleanup);process.on('SIGTERM',cleanup);
