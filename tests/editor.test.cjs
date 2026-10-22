const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../public');
const fixture=[{time:12,text:'微风经过你的窗前',review:false},{time:48,text:'微风经过你的窗前',review:false},{time:84,text:'微风经国你的窗前',review:true},{time:90,text:'我们走向不同的远方',review:false}];
async function setup(){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://127.0.0.1:3218',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  w.crypto.randomUUID=randomUUID;w.ResizeObserver=class{observe(){}};
  w.HTMLCanvasElement.prototype.getContext=()=>({scale(){},beginPath(){},roundRect(){},fill(){}});
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.fetch=async()=>({ok:true,json:async()=>({token:'test',engine:false,models:[],active:null})});
  w.localStorage.setItem('lyric-studio-v1',JSON.stringify({version:1,title:'测试',rows:fixture}));
  w.eval(fs.readFileSync(path.join(root,'core.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8'));
  await new Promise(r=>setTimeout(r,10));
  const doc=w.document,click=id=>doc.getElementById(id).click();
  function type(input,value){input.focus();input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));}
  return {dom,w,doc,click,type,texts:()=>[...doc.querySelectorAll('.lyric-text')].map(e=>e.value)};
}
function linkAll(ctx){ctx.click('sync-button');const fuzzy=ctx.doc.querySelectorAll('#sync-candidates input')[1];fuzzy.click();ctx.type(ctx.doc.getElementById('sync-text'),'微风轻轻经过窗前');ctx.click('confirm-sync');}
test('editor offers exact and fuzzy matches, then edits any linked occurrence without moving timestamps',async()=>{
  const ctx=await setup();try{
    ctx.click('sync-button');const candidates=[...ctx.doc.querySelectorAll('#sync-candidates input')];assert.equal(candidates.length,2);assert.equal(candidates[0].checked,true);assert.equal(candidates[1].checked,false);
    candidates[1].click();ctx.type(ctx.doc.getElementById('sync-text'),'微风轻轻经过窗前');ctx.click('confirm-sync');
    assert.deepEqual(ctx.texts().slice(0,3),Array(3).fill('微风轻轻经过窗前'));
    const second=ctx.doc.querySelectorAll('.lyric-text')[1];ctx.type(second,'更正之后的副歌');
    assert.equal(ctx.doc.activeElement,second);assert.deepEqual(ctx.texts(),['更正之后的副歌','更正之后的副歌','更正之后的副歌','我们走向不同的远方']);
    assert.deepEqual([...ctx.doc.querySelectorAll('.time-input')].map(e=>e.value),['00:12.00','00:48.00','01:24.00','01:30.00']);
    ctx.click('undo');assert.deepEqual(ctx.texts().slice(0,3),Array(3).fill('微风轻轻经过窗前'));
    ctx.click('undo');assert.deepEqual(ctx.texts(),fixture.map(r=>r.text));assert.equal(ctx.doc.querySelectorAll('.sync-badge').length,0);
  }finally{ctx.dom.window.close();}
});
test('unlinking one row keeps the other occurrences linked and draft persists the group',async()=>{
  const ctx=await setup();try{
    linkAll(ctx);ctx.doc.querySelectorAll('.lyric-text')[1].focus();ctx.click('unlink-row');
    ctx.type(ctx.doc.querySelectorAll('.lyric-text')[0],'只有另外两句改变');
    assert.deepEqual(ctx.texts().slice(0,3),['只有另外两句改变','微风轻轻经过窗前','只有另外两句改变']);
    await new Promise(r=>setTimeout(r,400));const saved=JSON.parse(ctx.w.localStorage.getItem('lyric-studio-v1'));
    assert.ok(saved.rows[0].syncGroup);assert.equal(saved.rows[0].syncGroup,saved.rows[2].syncGroup);assert.equal(saved.rows[1].syncGroup,undefined);
  }finally{ctx.dom.window.close();}
});
test('manual selection can include different wording and unchecking is respected',async()=>{
  const ctx=await setup();try{
    ctx.click('sync-button');ctx.click('sync-show-all');const options=[...ctx.doc.querySelectorAll('#sync-candidates input')];assert.equal(options.length,3);
    options[0].click();options[2].click();ctx.click('confirm-sync');
    assert.equal(ctx.texts()[3],fixture[0].text);assert.equal(ctx.doc.querySelectorAll('.sync-badge').length,2);assert.equal(ctx.texts()[2],fixture[2].text);
  }finally{ctx.dom.window.close();}
});
test('splitting a linked lyric detaches that occurrence and leaves the repeated lines intact',async()=>{
  const ctx=await setup();try{
    linkAll(ctx);const first=ctx.doc.querySelector('.lyric-text');first.focus();first.setSelectionRange(4,4);first.click();
    ctx.doc.querySelector('[data-action=split]').click();assert.equal(ctx.texts().length,5);
    assert.deepEqual(ctx.texts().slice(2,4),['微风轻轻经过窗前','微风轻轻经过窗前']);
    assert.equal(ctx.doc.querySelectorAll('.sync-badge').length,2);
    ctx.type(ctx.doc.querySelector('.lyric-text'),'独立修改');assert.equal(ctx.texts()[2],'微风轻轻经过窗前');
  }finally{ctx.dom.window.close();}
});
