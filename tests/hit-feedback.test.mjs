import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function load(name,bindings={}){
  const start=html.indexOf('function '+name+'('),brace=html.indexOf('{',start);let depth=1,end=brace+1;
  while(depth){if(html[end]==='{')depth++;if(html[end]==='}')depth--;end++;}
  return Function(...Object.keys(bindings),'return ('+html.slice(start,end)+');')(...Object.values(bindings));
}
function element(){const classes=new Set();return{classes,classList:{add(...xs){xs.forEach(x=>classes.add(x));},remove(...xs){xs.forEach(x=>classes.delete(x));},toggle(x,on){on?classes.add(x):classes.delete(x);}}};}
test('only confirmed hits produce feedback, and repeated hits restart the indicator',()=>{
  const marker=element(),crosshair=element(),damage=element(),body={},remote={},hurtBodies=new Map(),timers=[];let sounds=0;
  const handle=load('handleGlockHit',{localId:'me',bodyGroup:body,remotePlayers:new Map([['other',{body:remote}]]),hurtBodies,hitMarker:marker,crosshair,damageFeedback:damage,hitFeedbackTimer:null,damageFeedbackTimer:null,performance:{now:()=>100},playHitConfirm:()=>sounds++,showCombatBadge:()=>{},localEmoteDisplay:{},clearTimeout:()=>{},setTimeout:fn=>{timers.push(fn);return timers.length;}});
  handle({shooterId:'me',hit:false,targetId:null});assert.equal(sounds,0);assert.equal(hurtBodies.size,0);
  handle({shooterId:'me',hit:true,targetId:'other',headshot:true});assert.equal(sounds,1);assert.equal(marker.classes.has('headshot'),true);assert.equal(hurtBodies.has(remote),true);assert.equal(damage.classes.size,0);
  handle({shooterId:'other',hit:true,targetId:'me'});assert.equal(sounds,1);assert.equal(damage.classes.has('active'),true);assert.equal(hurtBodies.has(body),true);
  timers.forEach(fn=>fn());assert.equal(marker.classes.has('active'),false);assert.equal(crosshair.classes.has('hit'),false);assert.equal(damage.classes.has('active'),false);
});
test('damage reaction is subtle and returns to neutral',()=>{
  const reaction=load('hitReactionAt');assert.equal(reaction(-1),0);assert.equal(reaction(0),0);assert.equal(reaction(280),0);assert.equal(reaction(999),0);
  for(let t=1;t<280;t++)assert.ok(reaction(t)>0&&reaction(t)<1);
});
