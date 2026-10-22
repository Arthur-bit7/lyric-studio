'use strict';
const $=id=>document.getElementById(id);
const {stamp,parseTime,parseLrc,exportLrc,validateProject,findSimilarLyrics,cleanSyncGroups,detachLyrics,linkLyrics,editLyric}=window.LyricCore;
const audio=$('audio');
let rows=[],selected=null,file=null,filename='',objectUrl=null,token='',jobId=null,busy=false,looping=false,demo=false,history=[],wave=null,saveTimer=null,toastTimer=null,activeRow=null,lastCursor=0,engineReady=false,pollTimer=null;
const uid=()=>crypto.randomUUID();
const cloneRows=list=>list.map(r=>({...r}));
const editOrigins=new Map();
let syncSourceId=null,syncChoices=new Map(),syncCandidates=[];
function notify(message,error=false){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').className='toast'+(error?' error':'');$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function ask(message,title='替换当前内容？'){
  return new Promise(resolve=>{
    const dialog=$('confirm-dialog');$('confirm-title').textContent=title;$('confirm-message').textContent=message;dialog.showModal();
    const finish=value=>{dialog.close();$('confirm-yes').onclick=null;$('confirm-no').onclick=null;dialog.oncancel=null;resolve(value);};
    $('confirm-yes').onclick=()=>finish(true);$('confirm-no').onclick=()=>finish(false);dialog.oncancel=e=>{e.preventDefault();finish(false);};
  });
}
function snapshot(){history.push({rows:cloneRows(rows),selected,title:$('song-title').value,artist:$('song-artist').value});if(history.length>60)history.shift();$('undo').disabled=false;}
function project(){return {version:1,title:$('song-title').value,artist:$('song-artist').value,filename,rows:rows.map(({time,text,review,syncGroup})=>({time,text,review,...(syncGroup?{syncGroup}:{})}))};}
function save(){clearTimeout(saveTimer);$('save-state').textContent='正在保存草稿…';saveTimer=setTimeout(()=>{try{localStorage.setItem('lyric-studio-v1',JSON.stringify(project()));$('save-state').textContent='草稿已保存在本机';}catch{$('save-state').textContent='草稿保存失败，请保存工程';}},350);updateCount();}
function updateCount(){const missing=rows.filter(r=>r.time===null&&r.text.trim()).length;const review=rows.filter(r=>r.review).length;$('row-count').textContent=rows.length+' 行'+(missing?' · '+missing+' 行待打点':review?' · '+review+' 行待复听':'歌词');}
function updateSelection(){for(const el of $('rows').children)el.classList.toggle('selected',el.dataset.id===selected);updateSyncStatus();}
function updateSyncStatus(){
  const row=rows.find(r=>r.id===selected);const count=row?.syncGroup?rows.filter(r=>r.syncGroup===row.syncGroup).length:0;
  $('sync-button').disabled=busy||!row||!row.text.trim();$('unlink-row').hidden=count<2;$('unlink-row').disabled=busy;
  $('sync-status').textContent=count>1?`已联动 ${count} 句 · 改一处，整组文字同步`:row?'可查找相同或相似句，选择后一起修改':'选中一句，关联其他重复歌词';
}
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function actionButton(action,label,text){const b=el('button','icon-button',text);b.dataset.action=action;b.title=label;b.setAttribute('aria-label',label);return b;}
function render(){
  $('empty-state').hidden=rows.length>0;$('rows').replaceChildren();
  const groupCounts=new Map();for(const row of rows)if(row.syncGroup)groupCounts.set(row.syncGroup,(groupCounts.get(row.syncGroup)||0)+1);
  rows.forEach((row,index)=>{
    const line=el('div','lyric-row');line.dataset.id=row.id;
    line.append(el('span','row-num',String(index+1).padStart(2,'0')));
    const time=el('input','time-input');time.value=row.time===null?'':stamp(row.time);time.placeholder='待打点';time.dataset.field='time';time.setAttribute('aria-label','第 '+(index+1)+' 行开始时间');line.append(time);
    const content=el('div','row-content');const text=el('textarea','lyric-text');text.value=row.text;text.rows=1;text.dataset.field='text';text.setAttribute('aria-label','第 '+(index+1)+' 行歌词');content.append(text);if(row.review)content.append(el('span','review-label','· 建议复听'));if(row.syncGroup)content.append(el('span','sync-badge','↔ '+groupCounts.get(row.syncGroup)+' 句联动'));line.append(content);
    const buttons=el('div','row-actions');buttons.append(actionButton('listen','试听这一句','▷'),actionButton('time','标记当前播放时间','⌖'),actionButton('delete','删除这一句','×'));line.append(buttons);
    const extra=el('div','row-extra');for(const [act,label] of [['split','在光标处拆句'],['merge','合并下一句'],['review','标为已校对']]){const b=el('button','text-button'+(act==='review'?' reviewed':''),label);b.dataset.action=act;extra.append(b);}line.append(extra);
    $('rows').append(line);
  });
  updateSelection();updateCount();updatePlayback(false);requestAnimationFrame(()=>{document.querySelectorAll('.lyric-text').forEach(resizeText);});
}
function resizeText(input){input.style.height='auto';input.style.height=Math.max(34,input.scrollHeight)+'px';}
function replaceRows(data){rows=cleanSyncGroups(data.map(r=>({...r,id:uid()})));editOrigins.clear();selected=rows[0]?.id||null;render();save();}
function setBusy(value){busy=value;document.body.classList.toggle('busy',value);$('generate').disabled=value||!file||!engineReady||demo;$('audio-input').disabled=value;$('replace-audio').disabled=value;$('demo-button').disabled=value;$('paste-button').disabled=value;$('import-lrc').disabled=value;$('open-project').disabled=value;$('language').disabled=value;$('model').disabled=value;$('rows').inert=value;['add-row','offset-button','stamp'].forEach(id=>$(id).disabled=value);$('undo').disabled=value||!history.length;updateSyncStatus();}
async function status(){
  if(location.protocol==='file:'){engineReady=false;$('engine-state').textContent='界面预览 · 完整自动识别请双击 start.cmd';document.querySelector('.local-pill').textContent='界面预览';setBusy(busy);return;}
  try{const response=await fetch('/api/status');if(!response.ok)throw new Error();const info=await response.json();token=info.token;engineReady=info.engine;
    const model=$('model').value;$('engine-state').textContent=!info.engine?'运行 install.cmd，安装本地识别引擎':info.models.includes(model)?'模型已就绪 · 本机识别，音频不上传':'首次使用将下载模型 · 音频始终留在本机';setBusy(busy);if(info.active&&!jobId&&!busy){jobId=info.active;setBusy(true);$('job-state').hidden=false;$('cancel-job').hidden=false;pollJob();}return info;
  }catch{engineReady=false;$('engine-state').textContent='本地服务未连接，请运行 start.cmd';$('generate').disabled=true;}
}
$('model').addEventListener('change',status);
function basicTime(value){if(!Number.isFinite(value))value=0;return String(Math.floor(value/60)).padStart(2,'0')+':'+String(Math.floor(value%60)).padStart(2,'0');}
function drawWave(){
  const canvas=$('waveform'),ratio=window.devicePixelRatio||1,width=canvas.clientWidth,height=56;canvas.width=width*ratio;canvas.height=height*ratio;const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);
  const progress=audio.duration?audio.currentTime/audio.duration:0;const bars=Math.max(20,Math.floor(width/5));
  for(let i=0;i<bars;i++){const x=i*width/bars;const amplitude=wave?wave[Math.floor(i/bars*wave.length)]:.08;const h=Math.max(3,amplitude*48);ctx.fillStyle=x/width<progress?'#719659':wave?'#c9d7bc':'#e1e8d8';ctx.beginPath();ctx.roundRect(x,(height-h)/2,2.5,h,1.3);ctx.fill();}
}
async function createWave(blob){
  const localFile=file;let ctx;
  try{ctx=new AudioContext();const decoded=await ctx.decodeAudioData(await blob.arrayBuffer());const data=decoded.getChannelData(0),bins=400,points=[];let peak=.01;for(let i=0;i<bins;i++){const start=Math.floor(i*data.length/bins),end=Math.floor((i+1)*data.length/bins);let energy=0;let count=0;for(let j=start;j<end;j+=Math.max(1,Math.floor((end-start)/80))){energy+=data[j]*data[j];count++;}const level=Math.sqrt(energy/(count||1));points.push(level);peak=Math.max(peak,level);}if(localFile===file){wave=points.map(x=>Math.max(.035,x/peak));drawWave();}}catch{wave=null;drawWave();}finally{if(ctx)await ctx.close();}
}
function displayTrack(name,detail){$('dropzone').hidden=true;$('track-art').hidden=false;$('track-meta').hidden=false;$('track-name').textContent=name;$('track-name').title=name;$('track-detail').textContent=detail;}
async function chooseAudio(next){
  if(!next||busy)return;
  if(next.size>120*1024*1024){notify('请选择 120 MB 以内的音频',true);return;}
  if(!/\.(m4a|mp3|wav|flac|aac|ogg|mp4)$/i.test(next.name)){notify('请选择 M4A、MP3、WAV 等音频文件',true);return;}
  const changing=filename&&filename!==next.name&&rows.length;
  if(changing&&!await ask('更换歌曲会清空当前歌词。需要保留的话，请先取消并保存工程。','更换这首歌？'))return;
  audio.pause();if(objectUrl)URL.revokeObjectURL(objectUrl);file=next;demo=false;objectUrl=URL.createObjectURL(file);audio.src=objectUrl;filename=file.name;wave=null;history=[];$('undo').disabled=true;
  if(changing){rows=[];selected=null;render();}
  if(changing||!$('song-title').value)$('song-title').value=file.name.replace(/\.[^.]+$/,'');
  displayTrack(file.name,(file.size/1024/1024).toFixed(1)+' MB · '+file.name.split('.').pop().toUpperCase());$('play').disabled=false;$('job-state').hidden=true;setBusy(false);save();drawWave();createWave(file);notify('音频已载入，可以开始识别或打轴');
}
$('dropzone').onclick=()=>$('audio-input').click();$('replace-audio').onclick=()=>$('audio-input').click();$('audio-input').onchange=e=>{chooseAudio(e.target.files[0]);e.target.value='';};
['dragenter','dragover'].forEach(type=>$('dropzone').addEventListener(type,e=>{e.preventDefault();$('dropzone').classList.add('dragging');}));['dragleave','drop'].forEach(type=>$('dropzone').addEventListener(type,e=>{e.preventDefault();$('dropzone').classList.remove('dragging');}));$('dropzone').addEventListener('drop',e=>chooseAudio(e.dataTransfer.files[0]));
async function play(){if(!audio.src)return;try{if(audio.paused)await audio.play();else audio.pause();}catch{notify('浏览器无法播放这个音频。可尝试换成标准 M4A 或 WAV。',true);}}
$('play').onclick=play;$('back-five').onclick=()=>audio.currentTime=Math.max(0,audio.currentTime-5);$('forward-five').onclick=()=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration,audio.currentTime+5);};
$('seek').oninput=e=>{if(audio.duration)audio.currentTime=audio.duration*Number(e.target.value)/100;};$('waveform').onclick=e=>{if(audio.duration)audio.currentTime=audio.duration*(e.clientX-e.currentTarget.getBoundingClientRect().left)/e.currentTarget.clientWidth;};
$('speed').onchange=e=>audio.playbackRate=Number(e.target.value);$('loop').onclick=()=>{looping=!looping;$('loop').setAttribute('aria-pressed',String(looping));notify(looping?'循环试听已开启：选中一句后点击行前播放':'循环试听已关闭');};
audio.onloadedmetadata=()=>{if(audio.duration>1800)notify('此音频超过 30 分钟，自动识别前请先截短',true);$('duration').textContent=basicTime(audio.duration);};
audio.onplay=()=>{$('play').textContent='Ⅱ';$('play').setAttribute('aria-label','暂停音频');$('track-art').classList.add('playing-art');};audio.onpause=()=>{$('play').textContent='▶';$('play').setAttribute('aria-label','播放音频');$('track-art').classList.remove('playing-art');};
audio.onerror=()=>{if(audio.src)notify('这个文件无法在浏览器里播放，请检查音频格式。',true);};
function updatePlayback(scroll=true){
  $('current-time').textContent=basicTime(audio.currentTime);$('seek').value=audio.duration?audio.currentTime/audio.duration*100:0;drawWave();
  const timed=rows.filter(r=>r.time!==null).slice().sort((a,b)=>a.time-b.time);let current=null;for(const row of timed){if(row.time<=audio.currentTime)current=row.id;else break;}
  for(const node of $('rows').children)node.classList.toggle('playing',node.dataset.id===current);
  if(current!==activeRow){activeRow=current;if(scroll&&$('follow').checked&&!audio.paused&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){const node=[...$('rows').children].find(e=>e.dataset.id===current);if(node){const top=node.offsetTop-$('rows').offsetTop;const body=$('lyrics-body');if(top<body.scrollTop||top+node.offsetHeight>body.scrollTop+body.clientHeight)body.scrollTo({top:Math.max(0,top-body.clientHeight/3),behavior:'smooth'});}}}
  if(looping&&!audio.paused){const row=rows.find(r=>r.id===selected);if(row&&row.time!==null){const next=timed.find(r=>r.time>row.time);const end=next?next.time:(audio.duration||row.time+5);if(audio.currentTime>=end-.06)audio.currentTime=row.time;}}
}
audio.ontimeupdate=()=>updatePlayback();new ResizeObserver(drawWave).observe($('waveform'));
function stampRow(id,advance=false){if(!audio.src){notify('先选择音频，再标记播放时间',true);return;}const row=rows.find(r=>r.id===id);if(!row){notify('先选择一句歌词');return;}snapshot();row.time=Math.round(audio.currentTime*100)/100;if(advance){const index=rows.indexOf(row);if(index<rows.length-1)selected=rows[index+1].id;}render();save();}
$('stamp').onclick=()=>stampRow(selected,true);
$('rows').addEventListener('focusin',e=>{const line=e.target.closest('.lyric-row');if(!line)return;selected=line.dataset.id;updateSelection();if(e.target.matches('input,textarea')){snapshot();if(e.target.dataset.field==='text'){lastCursor=e.target.selectionStart||0;editOrigins.set(selected,rows.find(r=>r.id===selected).text);}}});
$('rows').addEventListener('input',e=>{const line=e.target.closest('.lyric-row');if(!line)return;const row=rows.find(r=>r.id===line.dataset.id);if(e.target.dataset.field==='text'){
  rows=editLyric(rows,row.id,e.target.value);lastCursor=e.target.selectionStart;resizeText(e.target);
  if(row.syncGroup){const byId=new Map(rows.map(r=>[r.id,r]));for(const node of $('rows').children){const peer=byId.get(node.dataset.id);if(peer.id!==row.id&&peer.syncGroup===row.syncGroup){const input=node.querySelector('.lyric-text');input.value=peer.text;resizeText(input);}}}
  updateSyncStatus();save();
}});
$('rows').addEventListener('keyup',e=>{if(e.target.dataset.field==='text')lastCursor=e.target.selectionStart;});
$('rows').addEventListener('change',e=>{if(e.target.dataset.field!=='time')return;const row=rows.find(r=>r.id===e.target.closest('.lyric-row').dataset.id);const value=e.target.value.trim();const time=value?parseTime(value):null;if(value&&time===null){e.target.classList.add('invalid');notify('请输入 mm:ss.xx，例如 01:23.45',true);e.target.value=row.time===null?'':stamp(row.time);return;}e.target.classList.remove('invalid');row.time=time;e.target.value=time===null?'':stamp(time);save();});
$('rows').addEventListener('click',async e=>{
  const line=e.target.closest('.lyric-row');if(!line)return;selected=line.dataset.id;updateSelection();if(e.target.dataset.field==='text')lastCursor=e.target.selectionStart;
  const button=e.target.closest('[data-action]');if(!button)return;const index=rows.findIndex(r=>r.id===selected),action=button.dataset.action;let row=rows[index];
  if(action==='listen'){if(!audio.src)return notify('请先选择原音频');if(row.time===null)return notify('这一句还没有时间点，可以用右侧标记按钮打点');audio.currentTime=row.time;try{await audio.play();}catch{notify('无法播放这个音频',true);}return;}
  if(action==='time')return stampRow(selected);
  if(action==='merge'&&index===rows.length-1)return notify('已经是最后一句了');
  if(action==='split'&&(lastCursor<=0||lastCursor>=row.text.length))return notify('先点击歌词，把光标放在要拆开的文字之间');
  snapshot();
  if(action==='split'||action==='merge'){rows=detachLyrics(rows,action==='split'?[row.id]:[row.id,rows[index+1].id]);row=rows[index];}
  if(action==='delete'){rows.splice(index,1);selected=rows[Math.min(index,rows.length-1)]?.id||null;}
  if(action==='split'){const text=row.text;row.text=text.slice(0,lastCursor).trim();rows.splice(index+1,0,{id:uid(),time:null,text:text.slice(lastCursor).trim(),review:row.review});notify('已拆成两句，请为新的一句打点');}
  if(action==='merge'){row.text=row.text+' '+rows[index+1].text;row.review=row.review||rows[index+1].review;rows.splice(index+1,1);}
  if(action==='review')row.review=false;
  rows=cleanSyncGroups(rows);render();save();
});
$('add-row').onclick=()=>{snapshot();const row={id:uid(),time:null,text:'',review:false};const index=rows.findIndex(r=>r.id===selected);rows.splice(index>=0?index+1:rows.length,0,row);selected=row.id;render();save();const node=[...$('rows').children].find(e=>e.dataset.id===row.id);node.querySelector('textarea').focus();node.scrollIntoView({block:'nearest'});};
$('undo').onclick=()=>{const prev=history.pop();if(!prev)return;rows=prev.rows;editOrigins.clear();selected=prev.selected;$('song-title').value=prev.title;$('song-artist').value=prev.artist;$('undo').disabled=!history.length;render();save();};
function updateSyncSummary(){
  const count=[...syncChoices.values()].filter(Boolean).length;
  $('sync-summary').textContent=`本句 + ${count} 句`;$('confirm-sync').disabled=!count||!$('sync-text').value.trim();
}
function renderSyncCandidates(){
  syncCandidates=findSimilarLyrics(rows,syncSourceId,{previousText:editOrigins.get(syncSourceId)||'',showAll:$('sync-show-all').checked});
  const container=$('sync-candidates');container.replaceChildren();
  if(!syncCandidates.length)container.append(el('p','sync-no-match','没有找到相似句。可以勾选“显示全部歌词”，手动选择其他位置。'));
  for(const match of syncCandidates){
    if(!syncChoices.has(match.id))syncChoices.set(match.id,match.linked||(match.exact&&!match.otherGroup));
    const label=el('label','sync-candidate');const check=el('input');check.type='checkbox';check.checked=syncChoices.get(match.id);check.dataset.id=match.id;check.setAttribute('aria-label','联动第 '+(match.index+1)+' 行');
    const info=el('span','sync-candidate-info');info.append(el('small','',`第 ${match.index+1} 行 · ${match.time===null?'待打点':stamp(match.time)}`),el('span','',match.text));
    const kind=match.linked?'已联动':match.exact?'文字相同':match.score>=.7?`相似 ${Math.round(match.score*100)}%`:'手动选择';
    label.append(check,info,el('span','sync-match-kind',kind+(match.otherGroup?' · 另一组':'')));container.append(label);
  }
  // Keep selections visible: hiding the all-lyrics list also deselects those hidden rows.
  const visible=new Set(syncCandidates.map(c=>c.id));for(const id of syncChoices.keys())if(!visible.has(id))syncChoices.delete(id);
  updateSyncSummary();
}
$('sync-button').onclick=()=>{
  const source=rows.find(r=>r.id===selected);if(busy||!source||!source.text.trim())return;
  syncSourceId=source.id;syncChoices=new Map();$('sync-text').value=source.text;$('sync-show-all').checked=false;
  $('sync-source-label').textContent=`以第 ${rows.indexOf(source)+1} 行为准 · 这组统一使用的歌词`;
  renderSyncCandidates();$('sync-dialog').showModal();
};
$('sync-show-all').onchange=renderSyncCandidates;$('sync-text').oninput=updateSyncSummary;
$('sync-candidates').onchange=e=>{if(e.target.matches('input[type=checkbox]')){syncChoices.set(e.target.dataset.id,e.target.checked);updateSyncSummary();}};
$('sync-select-all').onclick=()=>{for(const match of syncCandidates)syncChoices.set(match.id,true);renderSyncCandidates();};
$('confirm-sync').onclick=()=>{
  try{const targets=[...syncChoices].filter(([,checked])=>checked).map(([id])=>id);const next=linkLyrics(rows,syncSourceId,targets,$('sync-text').value,uid());snapshot();rows=next;editOrigins.clear();selected=syncSourceId;render();save();$('sync-dialog').close();notify(`已联动 ${targets.length+1} 句，之后修改任一句都会同步；时间点保持独立`);}catch(error){notify(error.message,true);}
};
$('unlink-row').onclick=()=>{if(busy)return;snapshot();rows=detachLyrics(rows,[selected]);render();save();notify('已解除本句联动，现有文字保持不变');};
function showPaste(){if(busy)return notify('请先等待识别完成或取消识别');$('paste-text').value='';$('paste-dialog').showModal();setTimeout(()=>$('paste-text').focus(),50);}
$('paste-button').onclick=showPaste;$('empty-paste').onclick=showPaste;
$('confirm-paste').onclick=()=>{const data=parseLrc($('paste-text').value);if(!data.length)return notify('先粘贴一些歌词',true);snapshot();replaceRows(data);$('paste-dialog').close();notify('歌词已放入，未带时间戳的句子需要手动打点');};
$('import-lrc').onclick=()=>$('lrc-input').click();$('lrc-input').onchange=async e=>{const source=e.target.files[0];e.target.value='';if(!source)return;if(source.size>2*1024*1024)return notify('歌词文件不能超过 2 MB',true);if(rows.length&&!await ask('导入将替换当前歌词，可以用撤销恢复。'))return;try{const buffer=await source.arrayBuffer();let text=new TextDecoder('utf-8').decode(buffer);if(text.includes('\uFFFD'))text=new TextDecoder('gb18030').decode(buffer);const data=parseLrc(text);if(!data.length)throw new Error('没有找到歌词内容');snapshot();replaceRows(data);const title=text.match(/\[ti:([^\]]*)\]/i),artist=text.match(/\[ar:([^\]]*)\]/i);if(title)$('song-title').value=title[1];if(artist)$('song-artist').value=artist[1];save();notify('歌词已导入');}catch(error){notify(error.message,true);}};
$('offset-button').onclick=()=>{if(!rows.some(r=>r.time!==null))return notify('先为歌词添加时间点');$('offset-dialog').showModal();};$('confirm-offset').onclick=()=>{const value=Number($('offset-value').value);if(!Number.isFinite(value)||Math.abs(value)>1800)return notify('请输入 -1800 到 1800 之间的秒数',true);snapshot();rows.forEach(r=>{if(r.time!==null)r.time=Math.round(Math.max(0,r.time+value)*100)/100;});render();save();$('offset-dialog').close();notify('全部歌词已'+(value>=0?'延后 ':'提前 ')+Math.abs(value)+' 秒');};
function download(content,name,type){const link=document.createElement('a');const url=URL.createObjectURL(new Blob([content],{type}));link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function baseName(){return (filename?filename.replace(/\.[^.]+$/,''):$('song-title').value||'我的歌词').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');}
$('export-lrc').onclick=()=>{try{const content=exportLrc(rows,$('song-title').value,$('song-artist').value);download(content,baseName()+'.lrc','text/plain;charset=utf-8');notify('LRC 已导出。与同名音频放在一起，再在 QQ 音乐里加载。');}catch(error){notify(error.message,true);}};
$('save-project').onclick=()=>{download(JSON.stringify(project(),null,2),baseName()+'.lyrics.json','application/json');notify('工程已保存，包含歌词和时间轴；音频请单独保留');};
$('open-project').onclick=()=>$('project-input').click();$('project-input').onchange=async e=>{const source=e.target.files[0];e.target.value='';if(!source)return;if(source.size>5*1024*1024)return notify('工程文件过大',true);try{const data=validateProject(JSON.parse(await source.text()));if(rows.length&&!await ask('打开工程将替换当前歌词。'))return;snapshot();if(filename!==data.filename){audio.pause();audio.removeAttribute('src');audio.load();if(objectUrl)URL.revokeObjectURL(objectUrl);file=null;objectUrl=null;wave=null;demo=false;$('play').disabled=true;$('dropzone').hidden=false;$('track-art').hidden=true;$('track-meta').hidden=true;}$('song-title').value=data.title;$('song-artist').value=data.artist;filename=data.filename;replaceRows(data.rows);setBusy(false);notify(file?'工程已打开':'工程已打开，请重新选择对应的原音频');}catch(error){notify(error.message,true);}};
$('song-title').oninput=save;$('song-artist').oninput=save;
async function pollJob(){
  if(!jobId)return;
  try{const response=await fetch('/api/jobs/'+jobId);if(response.status===404){jobId=null;setBusy(false);$('cancel-job').hidden=true;$('job-message').textContent='任务已结束或本地服务已重启，请重新识别';return;}if(!response.ok)throw new Error('读取任务失败');const state=await response.json();$('job-message').textContent=state.message;$('job-progress').value=state.progress||0;
    if(state.status==='done'){snapshot();replaceRows(state.rows);jobId=null;setBusy(false);$('cancel-job').hidden=true;await status();notify(state.rows.length?'识别完成，请逐句复听和校对':'没有识别出歌词，可以粘贴文字手动打轴');return;}
    if(state.status==='error'||state.status==='cancelled'){jobId=null;setBusy(false);$('cancel-job').hidden=true;notify(state.message,state.status==='error');return;}
    pollTimer=setTimeout(pollJob,1000);
  }catch(error){$('job-message').textContent='与本地服务的连接中断，5 秒后重试…';pollTimer=setTimeout(pollJob,5000);}
}
$('generate').onclick=async()=>{
  if(!file||busy)return;if(audio.duration>1800)return notify('首版支持 30 分钟以内的音频',true);
  if(rows.length&&!await ask('识别完成后会替换当前歌词。你可以用撤销恢复，或先保存工程。','重新生成歌词？'))return;
  setBusy(true);$('job-state').hidden=false;$('cancel-job').hidden=true;$('job-message').textContent='正在把音频交给本机识别引擎…';$('job-progress').value=1;
  try{await status();const response=await fetch('/api/jobs?model='+$('model').value+'&language='+$('language').value,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name),'X-Lyric-Token':token},body:file});const data=await response.json();if(!response.ok)throw new Error(data.error||'任务启动失败');jobId=data.id;$('cancel-job').hidden=false;pollJob();}catch(error){setBusy(false);$('job-message').textContent=error.message;notify(error.message,true);}
};
$('cancel-job').onclick=async()=>{if(!jobId)return;try{const response=await fetch('/api/jobs/'+jobId+'/cancel',{method:'POST',headers:{'X-Lyric-Token':token}});if(!response.ok)throw new Error();$('job-message').textContent='正在取消…';}catch{notify('取消失败，请检查本地服务是否仍在运行',true);}};
$('help-button').onclick=()=>$('help-dialog').showModal();
$('demo-button').onclick=async()=>{
  if(rows.length&&!await ask('演示会替换当前音频和歌词。需要保留的话，请先保存工程。','打开操作演示？'))return;
  audio.pause();if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;file=null;filename='操作演示.wav';demo=true;audio.src='./demo.wav';$('song-title').value='微风经过 · 操作演示';$('song-artist').value='合成伴奏 / 示例文字';displayTrack('微风经过 · 操作演示','合成伴奏 · 用于体验编辑与打轴');$('play').disabled=false;$('job-state').hidden=true;snapshot();replaceRows([{time:0,text:'微风经过窗前',review:false},{time:4,text:'把午后的光写成诗篇',review:false},{time:8,text:'微风经过窗前',review:false},{time:12,text:'把午后的光写成诗篇',review:false},{time:16,text:'微风经国窗前',review:true}]);setBusy(false);try{const response=await fetch('./demo.wav');createWave(await response.blob());}catch{}notify('这是编辑操作演示：伴奏为合成音，示例歌词并非自动识别结果');
};
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select')||document.querySelector('dialog[open]'))return;if(e.code==='Space'){e.preventDefault();play();}if(e.key.toLowerCase()==='t'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();stampRow(selected,true);}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$('undo').click();}});
window.addEventListener('beforeunload',e=>{try{localStorage.setItem('lyric-studio-v1',JSON.stringify(project()));}catch{}if(busy){e.preventDefault();e.returnValue='';}});
try{const saved=localStorage.getItem('lyric-studio-v1');if(saved){const data=validateProject(JSON.parse(saved));filename=data.filename;$('song-title').value=data.title;$('song-artist').value=data.artist;rows=data.rows.map(r=>({...r,id:uid()}));selected=rows[0]?.id||null;if(rows.length)$('save-state').textContent='已恢复草稿 · 请重新选择音频';}}catch{}
render();status();
