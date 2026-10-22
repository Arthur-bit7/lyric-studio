const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');

const ROOT = __dirname;
require('./scripts/generate-demo').ensureDemo(path.join(ROOT, 'public', 'demo.wav'));
const configFile = path.join(ROOT, 'config.local.json');
const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8').replace(/^\uFEFF/, '')) : {};
const RUNTIME = path.resolve(ROOT, config.runtime || '.runtime');
const PYTHON = config.python ? path.resolve(ROOT,config.python) : (process.platform === 'win32' ? path.join(ROOT, '.venv', 'Scripts', 'python.exe') : path.join(ROOT, '.venv', 'bin', 'python'));
const PORT = Number(process.argv.find(a=>a.startsWith('--port='))?.split('=')[1] || process.env.PORT || 3218);
const TOKEN = crypto.randomBytes(24).toString('hex');
const jobs = new Map();
let active = null;
fs.mkdirSync(path.join(RUNTIME, 'jobs'), {recursive: true});
fs.mkdirSync(path.join(RUNTIME, 'models'), {recursive: true});
function reply(res, status, data) {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
  res.end(JSON.stringify(data));
}
function publicJob(job) {
  const {child, file, ...result} = job;
  return result;
}
function removeAudio(job) {
  try { fs.unlinkSync(job.file); } catch {}
}
function run(job, language, model) {
  job.status = 'running'; job.message = '正在启动识别引擎…';
  const child = spawn(PYTHON, ['-u', path.join(ROOT, 'transcribe.py'), job.file, model, language, path.join(RUNTIME, 'models')], {
    windowsHide: true, env: {...process.env, PYTHONIOENCODING: 'utf-8', HF_HUB_DISABLE_SYMLINKS_WARNING: '1', HF_HUB_DISABLE_XET: '1', HF_HUB_DISABLE_TELEMETRY: '1'},
    stdio: ['ignore', 'pipe', 'pipe']
  });
  job.child = child;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let buffer = '', errors = '';
  child.stdout.on('data', data => {
    buffer += data.toString('utf8');
    const lines = buffer.split('\n'); buffer = lines.pop();
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (job.status === 'cancelled') continue;
        if (event.type === 'progress') { job.message = event.message; job.progress = event.progress; }
        if (event.type === 'result') { job.rows = event.rows; job.language = event.language; job.duration = event.duration; job.status = 'done'; job.message = event.rows.length ? '识别完成，可以开始校对' : '未识别到歌词，可以手动添加'; job.progress = 100; }
        if (event.type === 'error') { job.status = 'error'; job.message = event.message; }
      } catch {}
    }
  });
  child.stderr.on('data', data => { errors = (errors + data.toString('utf8')).slice(-8000); });
  child.on('error', error => {
    job.status = 'error'; job.message = error.code === 'ENOENT' ? '识别环境未安装。请双击 install.cmd 安装后重试。' : '识别引擎启动失败：' + error.message;
    if (active === job.id) active = null;
    removeAudio(job);
  });
  child.on('close', code => {
    if (!['done', 'cancelled', 'error'].includes(job.status)) { job.status = 'error'; job.message = '识别进程退出，请重试或换一个音频。'; }
    if (job.status === 'error') fs.writeFileSync(path.join(RUNTIME, 'last-error.log'), errors || job.message);
    job.child = null;
    if (active === job.id) active = null;
    removeAudio(job);
    if (jobs.size > 30) { for (const [id, old] of jobs) { if (id !== active && id !== job.id) jobs.delete(id); if (jobs.size <= 20) break; } }
  });
}
const server = http.createServer(async (req, res) => {
  const allowedHosts = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
  if (!allowedHosts.includes(req.headers.host)) return reply(res, 403, {error:'仅允许本机访问'});
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/api/status') {
    const models = ['tiny','base','small'].filter(m => ['model.bin','config.json','tokenizer.json','vocabulary.txt'].every(f=>fs.existsSync(path.join(RUNTIME,'models',m,f))));
    return reply(res, 200, {ok:true, app:'LyricStudio', token:TOKEN, engine:fs.existsSync(PYTHON), models, active});
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
    const job = jobs.get(url.pathname.split('/').pop());
    return reply(res, job ? 200 : 404, job ? publicJob(job) : {error:'任务不存在'});
  }
  if (req.method === 'POST') {
    if (req.headers['x-lyric-token'] !== TOKEN) return reply(res, 403, {error:'页面已过期，请刷新后重试'});
    const origin = req.headers.origin;
    if (origin && !allowedHosts.some(host => origin === 'http://' + host)) return reply(res,403,{error:'来源不允许'});
    if (/^\/api\/jobs\/[a-f0-9]+\/cancel$/.test(url.pathname)) {
      const job = jobs.get(url.pathname.split('/')[3]);
      if (!job) return reply(res,404,{error:'任务不存在'});
      if (job.status === 'running' || job.status === 'uploading') { job.status='cancelled'; job.message='已取消识别'; job.child?.kill(); }
      return reply(res,200,publicJob(job));
    }
    if (url.pathname === '/api/jobs') {
      if (active) return reply(res,409,{error:'已有识别任务正在运行，请等待完成或取消任务'});
      if (!fs.existsSync(PYTHON)) return reply(res,503,{error:'请先运行 install.cmd 安装本地识别环境'});
      const size = Number(req.headers['content-length']);
      if (!Number.isInteger(size) || size <= 0 || size > 120 * 1024 * 1024) return reply(res,413,{error:'请选择 120 MB 以内的音频'});
      const model = url.searchParams.get('model') || 'small';
      const language = url.searchParams.get('language') || 'zh';
      if (!['tiny','base','small'].includes(model) || !['zh','en','ja','ko','auto'].includes(language)) return reply(res,400,{error:'无效的识别设置'});
      let name;
      try { name = decodeURIComponent(req.headers['x-file-name'] || 'audio.m4a'); } catch { return reply(res,400,{error:'文件名无效'}); }
      const ext = path.extname(name).toLowerCase();
      if (!['.m4a','.mp3','.wav','.flac','.aac','.ogg','.mp4'].includes(ext)) return reply(res,400,{error:'暂不支持此音频格式'});
      const id = crypto.randomBytes(12).toString('hex');
      const file = path.join(RUNTIME,'jobs',id + ext);
      const job = {id, file, status:'uploading', progress:0, message:'正在读取音频', rows:[]};
      jobs.set(id, job); active=id;
      try {
        const chunks=[]; let total=0;
        for await (const chunk of req) { total += chunk.length; if(total > 120 * 1024 * 1024) throw new Error('文件过大'); chunks.push(chunk); }
        if (total !== size) throw new Error('文件接收不完整');
        fs.writeFileSync(file,Buffer.concat(chunks));
        run(job,language,model);
        return reply(res,202,{id});
      } catch (error) { active=null; job.status='error'; job.message=error.message; removeAudio(job); return reply(res,400,{error:error.message}); }
    }
    return reply(res,404,{error:'接口不存在'});
  }
  if (req.method !== 'GET') return reply(res,405,{error:'不支持的请求'});
  const assets = {'/':'index.html','/index.html':'index.html','/app.js':'app.js','/core.js':'core.js','/styles.css':'styles.css','/repeat.css':'repeat.css','/demo.wav':'demo.wav'};
  const asset=assets[url.pathname];
  if (!asset || !fs.existsSync(path.join(ROOT,'public',asset))) return reply(res,404,{error:'文件不存在'});
  const content=fs.readFileSync(path.join(ROOT,'public',asset));
  const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wav':'audio/wav'}[path.extname(asset)];
  res.writeHead(200,{'Content-Type':mime,'Content-Length':content.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self'; img-src 'self' data: blob:; object-src 'none'; frame-ancestors 'none'"});
  res.end(content);
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${PORT} 已被占用，请打开 http://127.0.0.1:${PORT} 或更换 PORT。` : error);
  process.exitCode=1;
});
if (require.main === module) server.listen(PORT,'127.0.0.1',()=>{
  console.log(`LyricStudio ready: http://127.0.0.1:${PORT}`);
  if (process.argv.includes('--open')) spawn('explorer.exe',[`http://127.0.0.1:${PORT}`],{windowsHide:true,stdio:'ignore'}).on('error',()=>{});
});
function stop() { for(const job of jobs.values()) {job.child?.kill();removeAudio(job);} server.close(()=>process.exit(0)); }
process.on('SIGINT',stop); process.on('SIGTERM',stop);
module.exports = {server, requestHandler:server.listeners('request')[0], jobs};
