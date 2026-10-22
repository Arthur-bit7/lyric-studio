const test=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {requestHandler}=require('../server');
const {generateDemo}=require('../scripts/generate-demo');
function request(method,url,headers={}){
  return new Promise((resolve,reject)=>{
    const req=Readable.from([]);req.method=method;req.url=url;req.headers={host:'127.0.0.1:3218',...headers};
    const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){resolve({status:this.status,headers:this.headers,body});}};
    Promise.resolve(requestHandler(req,res)).catch(reject);
  });
}
test('local API rejects foreign hosts and unauthenticated changes',async()=>{
  assert.equal((await request('GET','/api/status',{host:'evil.example'})).status,403);
  assert.equal((await request('POST','/api/jobs')).status,403);
  const health=JSON.parse((await request('GET','/api/status')).body);
  assert.equal(health.app,'LyricStudio');assert.ok(health.token);
  assert.equal((await request('POST','/api/jobs',{'x-lyric-token':health.token,origin:'https://evil.example'})).status,403);
});
test('static assets are available while config and runtime files remain inaccessible',async()=>{
  for(const route of ['/','/app.js','/core.js','/styles.css','/repeat.css','/demo.wav'])assert.equal((await request('GET',route)).status,200,route);
  for(const route of ['/config.local.json','/.runtime/last-error.log','/.venv/pyvenv.cfg','/../server.js'])assert.equal((await request('GET',route)).status,404,route);
});
test('demo generator makes a valid twenty-second mono PCM WAV',()=>{
  const data=generateDemo();assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WAVE');
  assert.equal(data.readUInt32LE(24),22050);assert.equal(data.readUInt16LE(22),1);assert.equal(data.readUInt16LE(34),16);
  assert.equal(data.readUInt32LE(40),22050*20*2);assert.equal(data.length,44+22050*20*2);
});
