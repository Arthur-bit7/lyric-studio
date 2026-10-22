const test=require('node:test');
const assert=require('node:assert/strict');
const {stamp,parseTime,parseLrc,exportLrc,validateProject}=require('../public/core');
test('timestamps carry centiseconds into the next minute',()=>{
  assert.equal(stamp(59.999),'01:00.00');assert.equal(stamp(73.45),'01:13.45');assert.equal(parseTime('01:13.450'),73.45);assert.equal(parseTime('00:99.00'),null);assert.equal(parseTime('bad'),null);
});
test('LRC imports repeated timestamps, metadata, BOM, and offsets',()=>{
  const rows=parseLrc('\uFEFF[ti:测试]\n[offset:-500]\n[00:01.20][00:05.20]同一句\n[00:00.10]开始\n无时间文字');
  assert.deepEqual(rows.map(r=>r.time),[.7,4.7,0,null]);assert.equal(rows[0].text,'同一句');
});
test('export preserves edited Unicode lyrics and orders time without mutating editor',()=>{
  const rows=[{time:8.75,text:'修改后的歌词'},{time:1.25,text:'第一句'}];const result=exportLrc(rows,'歌曲','歌手');
  assert.ok(result.startsWith('\uFEFF[ti:歌曲]\r\n'));assert.ok(result.indexOf('[00:01.25]第一句')<result.indexOf('[00:08.75]修改后的歌词'));assert.equal(rows[0].time,8.75);
  assert.deepEqual(parseLrc(result).map(r=>[r.time,r.text]),[[1.25,'第一句'],[8.75,'修改后的歌词']]);
});
test('export rejects missing timestamps rather than silently fabricating them',()=>{
  assert.throws(()=>exportLrc([{time:null,text:'未打轴'}]),/没有时间点/);assert.throws(()=>exportLrc([]),/添加/);assert.throws(()=>exportLrc([{time:NaN,text:'错误'}]),/没有时间点/);
});
test('project import validates text and time values',()=>{
  assert.equal(validateProject({version:1,rows:[{time:null,text:'待打轴'}]}).rows[0].time,null);
  assert.throws(()=>validateProject({version:1,rows:[{time:-3,text:'坏时间'}]}));assert.throws(()=>validateProject({version:2,rows:[]}));
});
