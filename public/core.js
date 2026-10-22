(function(root){
  function stamp(seconds){
    const n=Math.max(0,Math.round(Number(seconds)*100)||0);
    return String(Math.floor(n/6000)).padStart(2,'0')+':'+String(Math.floor(n/100)%60).padStart(2,'0')+'.'+String(n%100).padStart(2,'0');
  }
  function parseTime(value){
    const match=String(value).trim().match(/^(\d{1,3}):([0-5]?\d)(?:[.:](\d{1,3}))?$/);
    if(!match)return null;
    return Number(match[1])*60+Number(match[2])+(match[3]?Number('0.'+match[3]):0);
  }
  function parseLrc(text){
    const rows=[]; let offset=0;
    for(const line of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
      const off=line.match(/^\[offset:([+-]?\d+)\]/i); if(off){offset=Number(off[1])/1000;continue;}
      const stamps=[...line.matchAll(/\[(\d{1,3}:[0-5]?\d(?:[.:]\d{1,3})?)\]/g)];
      if(stamps.length){const lyric=line.replace(/\[\d{1,3}:[0-5]?\d(?:[.:]\d{1,3})?\]/g,'').trim();for(const m of stamps)rows.push({time:parseTime(m[1]),text:lyric,review:false});}
      else if(line.trim()&&!/^\[[a-z]+:/i.test(line))rows.push({time:null,text:line.trim(),review:false});
    }
    return rows.map(r=>({...r,time:r.time===null?null:Math.max(0,r.time+offset)}));
  }
  function exportLrc(rows,title,artist){
    const clean=s=>String(s||'').replace(/[\r\n\[\]]/g,' ').trim();
    const usable=rows.filter(r=>r.text.trim());
    if(!usable.length)throw new Error('先添加一些歌词再导出');
    if(usable.some(r=>!Number.isFinite(r.time)||r.time<0))throw new Error('还有歌词没有时间点，请先打轴或删除空白占位行');
    const meta=[];if(clean(title))meta.push('[ti:'+clean(title)+']');if(clean(artist))meta.push('[ar:'+clean(artist)+']');meta.push('[by:听歌校词]');
    return '\uFEFF'+[...meta,...usable.slice().sort((a,b)=>a.time-b.time).map(r=>'['+stamp(r.time)+']'+r.text.replace(/[\r\n]+/g,' ').trim())].join('\r\n')+'\r\n';
  }
  function validateProject(data){
    if(!data || data.version!==1 || !Array.isArray(data.rows) || data.rows.length>10000)throw new Error('这不是有效的歌词工程文件');
    return {title:String(data.title||'').slice(0,200),artist:String(data.artist||'').slice(0,200),filename:String(data.filename||'').slice(0,300),rows:cleanSyncGroups(data.rows.map(r=>{if(!r||typeof r.text!=='string'||(r.time!==null&&(!Number.isFinite(r.time)||r.time<0)))throw new Error('工程里的歌词或时间点无效');const row={time:r.time,text:r.text.slice(0,4000),review:!!r.review};if(typeof r.syncGroup==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(r.syncGroup))row.syncGroup=r.syncGroup;return row;}))};
  }
  function normalizeLyric(text){return String(text||'').normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{Z}\p{S}\s]/gu,'');}
  function lyricSimilarity(first,second){
    const a=Array.from(normalizeLyric(first)),b=Array.from(normalizeLyric(second));
    if(!a.length||!b.length)return 0;
    if(a.join('')===b.join(''))return 1;
    // Short refrains need exact matches; avoid costly comparisons on accidentally pasted paragraphs.
    if(Math.min(a.length,b.length)<4||Math.max(a.length,b.length)>300)return 0;
    if(Math.min(a.length,b.length)/Math.max(a.length,b.length)<.55)return 0;
    let prev=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(prev[j]+1,next[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=next;}
    return 1-prev[b.length]/Math.max(a.length,b.length);
  }
  function findSimilarLyrics(rows,sourceId,{previousText='',showAll=false,threshold=.7}={}){
    const source=rows.find(r=>r.id===sourceId);if(!source)return [];
    return rows.flatMap((row,index)=>{
      if(row.id===sourceId||!row.text.trim())return [];
      const score=Math.max(lyricSimilarity(source.text,row.text),lyricSimilarity(previousText,row.text));
      const linked=!!source.syncGroup&&source.syncGroup===row.syncGroup;
      return linked||showAll||score>=threshold?[{id:row.id,index,text:row.text,time:row.time,score,linked,exact:score===1,otherGroup:!!row.syncGroup&&!linked}]:[];
    }).sort((a,b)=>Number(b.linked)-Number(a.linked)||Number(b.exact)-Number(a.exact)||b.score-a.score||a.index-b.index);
  }
  function cleanSyncGroups(rows){
    const groups=new Map();
    for(const row of rows)if(row.syncGroup){const entries=groups.get(row.syncGroup)||[];entries.push(row);groups.set(row.syncGroup,entries);}
    // A group from an edited project file must never silently propagate conflicting text.
    return rows.map(row=>{const group=groups.get(row.syncGroup);if(group&&(group.length<2||group.some(r=>r.text!==group[0].text))){const {syncGroup,...rest}=row;return rest;}return row;});
  }
  function detachLyrics(rows,ids){
    const targets=new Set(ids);
    return cleanSyncGroups(rows.map(row=>{if(!targets.has(row.id))return row;const {syncGroup,...rest}=row;return rest;}));
  }
  function linkLyrics(rows,sourceId,targetIds,text,groupId){
    const source=rows.find(r=>r.id===sourceId);if(!source)throw new Error('请先选择一句歌词');
    if(!text.trim())throw new Error('请输入要同步的歌词');
    const targets=new Set([sourceId,...targetIds]);
    if(rows.filter(r=>targets.has(r.id)).length<2)throw new Error('至少勾选另一句歌词');
    if(typeof groupId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(groupId))throw new Error('无效的联动组');
    return cleanSyncGroups(rows.map(row=>{
      if(targets.has(row.id))return {...row,text,syncGroup:groupId};
      if(source.syncGroup&&row.syncGroup===source.syncGroup){const {syncGroup,...rest}=row;return rest;}
      return row;
    }));
  }
  function editLyric(rows,id,text){
    const source=rows.find(r=>r.id===id);if(!source)return rows;
    return rows.map(row=>row.id===id||(source.syncGroup&&row.syncGroup===source.syncGroup)?{...row,text}:row);
  }
  const api={stamp,parseTime,parseLrc,exportLrc,validateProject,normalizeLyric,lyricSimilarity,findSimilarLyrics,cleanSyncGroups,detachLyrics,linkLyrics,editLyric};
  if(typeof module!=='undefined')module.exports=api;else root.LyricCore=api;
})(typeof window!=='undefined'?window:globalThis);
