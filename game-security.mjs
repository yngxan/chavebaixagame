export function createGameGuard({siteKey='',secretKey='',hostname='',fetcher=fetch,clock=Date.now}={}) {
  const buckets=new Map();
  function allow(key,rate,capacity){const now=clock(),bucket=buckets.get(key)||{tokens:capacity,at:now};bucket.tokens=Math.min(capacity,bucket.tokens+Math.max(0,now-bucket.at)*rate/1000);bucket.at=now;const allowed=bucket.tokens>=1;if(allowed)bucket.tokens--;buckets.set(key,bucket);return allowed;}
  async function verifyHuman(token,address){
    if(!siteKey&&!secretKey)return;
    if(!siteKey||!secretKey)throw Object.assign(new Error('Verificação humana incompleta no servidor.'),{statusCode:503});
    if(typeof token!=='string'||!token||token.length>2048)throw Object.assign(new Error('Complete a verificação humana para entrar.'),{statusCode:403});
    let result;
    try{const response=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',signal:AbortSignal.timeout(8000),body:new URLSearchParams({secret:secretKey,response:token,remoteip:address})});if(!response.ok)throw new Error();result=await response.json();}
    catch{throw Object.assign(new Error('A verificação humana está indisponível. Tente novamente.'),{statusCode:503});}
    if(result.success!==true||result.action!=='auth'||hostname&&result.hostname!==hostname)throw Object.assign(new Error('Verificação humana inválida ou expirada. Tente novamente.'),{statusCode:403});
  }
  function sweep(){const now=clock();for(const[key,bucket]of buckets)if(now-bucket.at>3600000)buckets.delete(key);}
  return {allow,verifyHuman,sweep,publicConfig(){return {enabled:Boolean(siteKey||secretKey),siteKey};}};
}
