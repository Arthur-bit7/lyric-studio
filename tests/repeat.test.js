const test=require('node:test');
const assert=require('node:assert/strict');
const {lyricSimilarity,findSimilarLyrics,linkLyrics,editLyric,detachLyrics,cleanSyncGroups,validateProject,exportLrc,parseLrc}=require('../public/core');
const chorus=()=>[
  {id:'a',time:12,text:'微风经过你的窗前',review:true},
  {id:'b',time:48,text:'微风经过你的窗前',review:false},
  {id:'c',time:84,text:'微风经国你的窗前',review:true},
  {id:'d',time:90,text:'我们走向不同的远方',review:false},
];
test('matches punctuation and case variants, while short similar phrases need exact text',()=>{
  assert.equal(lyricSimilarity('Hello, WORLD!','hello world'),1);
  assert.equal(lyricSimilarity('微风，经过窗前。','微风经过窗前'),1);
  assert.equal(lyricSimilarity('我爱你','我想你'),0);
  assert.equal(lyricSimilarity('♪','！'),0);
  assert.equal(lyricSimilarity('ＡＢＣ','abc'),1);
});
test('finds two repeated choruses and distinguishes the misrecognized one',()=>{
  const matches=findSimilarLyrics(chorus(),'a');
  assert.deepEqual(matches.map(x=>x.id),['b','c']);assert.equal(matches[0].exact,true);assert.equal(matches[1].exact,false);assert.ok(matches[1].score>.8);
  assert.equal(findSimilarLyrics(chorus(),'a',{showAll:true}).length,3);
});
test('can find repetitions using the text from before a correction',()=>{
  const rows=chorus();rows[0].text='窗前的微风轻轻经过';
  assert.equal(findSimilarLyrics(rows,'a',{previousText:'微风经过你的窗前'}).find(r=>r.id==='b').exact,true);
});
test('only selected repeated lyrics are linked and all timestamps survive correction and LRC export',()=>{
  const original=chorus();const linked=linkLyrics(original,'a',['b','c'],'微风经过你的窗前','chorus-1');
  const edited=editLyric(linked,'c','微风轻轻经过窗前');
  assert.deepEqual(edited.map(r=>r.text),['微风轻轻经过窗前','微风轻轻经过窗前','微风轻轻经过窗前','我们走向不同的远方']);
  assert.deepEqual(edited.map(r=>r.time),[12,48,84,90]);assert.deepEqual(edited.map(r=>r.review),original.map(r=>r.review));
  assert.equal(original[2].text,'微风经国你的窗前');assert.equal(original[0].syncGroup,undefined);
  assert.deepEqual(parseLrc(exportLrc(edited)).map(r=>r.time),[12,48,84,90]);
});
test('fuzzy suggestions do not modify an unselected line',()=>{
  const linked=linkLyrics(chorus(),'a',['b'],'微风经过你的窗前','group');const edited=editLyric(linked,'a','更正之后的一整句');
  assert.equal(edited[1].text,'更正之后的一整句');assert.equal(edited[2].text,'微风经国你的窗前');
});
test('unlinking one occurrence preserves the other two; singleton groups dissolve',()=>{
  let rows=linkLyrics(chorus(),'a',['b','c'],'重复的副歌','group');
  rows=detachLyrics(rows,['b']);rows=editLyric(rows,'a','改好的副歌');
  assert.equal(rows[1].text,'重复的副歌');assert.equal(rows[2].text,'改好的副歌');
  rows=detachLyrics(rows,['a']);assert.ok(rows.every(r=>!r.syncGroup));
});
test('regrouping does not accidentally change another existing group',()=>{
  let rows=[...chorus(),{id:'e',time:100,text:'另一组'},{id:'f',time:110,text:'另一组'}];
  rows=linkLyrics(rows,'d',['e','f'],'另一组','other');rows=linkLyrics(rows,'a',['d'],'第一组','first');
  assert.equal(rows.find(r=>r.id==='e').syncGroup,'other');assert.equal(rows.find(r=>r.id==='f').text,'另一组');
});
test('groups persist through project round trips; malformed or contradictory groups safely dissolve',()=>{
  const linked=linkLyrics(chorus(),'a',['b','c'],'副歌','persist');
  const saved=validateProject(JSON.parse(JSON.stringify({version:1,rows:linked}))).rows;
  assert.equal(saved[2].syncGroup,'persist');assert.equal(saved[2].time,84);
  const corrupt=[{time:1,text:'不同',syncGroup:'bad'},{time:2,text:'文字',syncGroup:'bad'}];
  assert.ok(validateProject({version:1,rows:corrupt}).rows.every(r=>!r.syncGroup));
  assert.equal(cleanSyncGroups([{id:'a',text:'alone',syncGroup:'one'}])[0].syncGroup,undefined);
});
test('undo snapshots can restore every linked occurrence together',()=>{
  const before=linkLyrics(chorus(),'a',['b','c'],'副歌','undo');const snapshot=before.map(r=>({...r}));
  const changed=editLyric(before,'b','新歌词');assert.equal(changed[0].text,'新歌词');assert.ok(snapshot.slice(0,3).every(r=>r.text==='副歌'));
  assert.throws(()=>linkLyrics(chorus(),'a',[],'新歌词','group'),/至少/);
});
