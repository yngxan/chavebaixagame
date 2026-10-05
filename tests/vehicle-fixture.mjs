import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

// Synthetic vehicles belong only to the disposable server fixture. Production
// stock is now restricted to the garage/marina, leaving the festival plaza empty.
export async function addTestVehicles(directory,xOffset=0){
  const path=join(directory,'world-systems.js'),source=await readFile(path,'utf8');
  await writeFile(path,source+`\n{const stock=LowkeyWorld.initialVehicles;LowkeyWorld.initialVehicles=()=>[{...stock().find(v=>v.kind==='car'),id:'plaza-car',garageBay:null,x:${-14.5+xOffset},y:.18,z:5,rotation:Math.PI/2},{...stock().find(v=>v.kind==='moto'),id:'plaza-moto',garageBay:null,x:${-13.5+xOffset},y:.18,z:8.8,rotation:Math.PI/2},...stock()];}\n`);
}
