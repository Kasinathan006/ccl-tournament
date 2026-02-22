const http = require('http'), fs = require('fs'), path = require('path'), url = require('url'), mongoose = require('mongoose');
const PORT = process.env.PORT || 3001, ADMIN_PASSWORD = 'ccl2025', MAX_SLOTS = 12;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ccl';

mongoose.connect(MONGODB_URI).then(() => console.log('Connected to MongoDB')).catch(err => console.error('DB Conn Err:', err));

const teamSchema = new mongoose.Schema({
  id: String, name: String, players: [String], slot: Number, registeredAt: Date, verified: Boolean, screenshot: String
});
const Team = mongoose.model('Team', teamSchema);

const scheduleSchema = new mongoose.Schema({
  date: String, time: String, isLive: Boolean, countdown: String
});
const Schedule = mongoose.model('Schedule', scheduleSchema);

async function getSchedule() {
  let s = await Schedule.findOne();
  if (!s) { s = new Schedule({ date: '', time: '', isLive: false, countdown: '' }); await s.save(); }
  return s;
}

const SS_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR);

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50e6) { // 50MB Limit
        console.error('Payload too large:', body.length);
        resolve({ _error: 'Payload too large' });
      }
    });
    req.on('end', () => {
      try {
        if (!body) return resolve({});
        resolve(JSON.parse(body));
      } catch (e) {
        console.error('Body parse err:', e.message);
        resolve({ _error: 'Invalid JSON' });
      }
    });
  });
}
function setCORS(res) { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization'); }
function json(res, c, d) { setCORS(res); res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); }
function serve(res, f, ct) { const p = path.join(__dirname, f); if (!fs.existsSync(p)) { res.writeHead(404); res.end('Not found'); return; } res.writeHead(200, { 'Content-Type': ct }); fs.createReadStream(p).pipe(res); }
function isAdmin(req) { return req.headers['authorization'] === `Bearer ${ADMIN_PASSWORD}`; }

const server = http.createServer(async (req, res) => {
  try {
    const p = url.parse(req.url, true).pathname, m = req.method;
    if (m === 'OPTIONS') { setCORS(res); res.writeHead(204); res.end(); return; }
    if (m === 'GET' && (p === '/' || p === '/index.html')) { serve(res, 'index.html', 'text/html'); return; }
    if (m === 'GET' && p === '/admin.html') { serve(res, 'admin.html', 'text/html'); return; }

    // Screenshot serving
    if (m === 'GET' && p.startsWith('/api/screenshot/')) {
      const tid = p.replace('/api/screenshot/', '').replace(/[^a-z0-9]/gi, '');
      const team = await Team.findOne({ id: tid });
      if (!team || !team.screenshot) { setCORS(res); res.writeHead(404); res.end(); return; }
      try {
        const raw = team.screenshot;
        const mm = raw.match(/^data:(image\/[a-z]+);base64,/);
        const ct = mm ? mm[1] : 'image/jpeg';
        const buf = Buffer.from(raw.replace(/^data:image\/[a-z]+;base64,/, ''), 'base64');
        setCORS(res); res.writeHead(200, { 'Content-Type': ct, 'Content-Length': buf.length, 'Cache-Control': 'max-age=86400' }); res.end(buf);
      } catch (e) { res.writeHead(500); res.end(); }
      return;
    }

    // Admin panel
    if (m === 'GET' && p === '/admin') {
      const adminHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CCL Admin Panel</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Rajdhani:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Rajdhani',sans-serif;background:radial-gradient(ellipse at 50% 30%,#0a1a3a,#040e1f 50%,#020810 80%,#000);color:#fff;min-height:100vh}
#lw{display:flex;align-items:center;justify-content:center;min-height:100vh}
#lb{background:linear-gradient(135deg,rgba(79,195,247,.06),rgba(2,136,209,.08));border:1px solid rgba(79,195,247,.2);border-radius:14px;padding:40px 35px;width:100%;max-width:380px;text-align:center}
#lb h2{font-family:'Orbitron',monospace;color:#4fc3f7;font-size:1rem;letter-spacing:3px;margin-bottom:6px}
#lb p{color:rgba(79,195,247,.4);font-size:.75rem;letter-spacing:2px;margin-bottom:24px}
#lb input{width:100%;padding:11px 15px;background:rgba(79,195,247,.05);border:1px solid rgba(79,195,247,.25);border-radius:7px;color:#fff;font-family:'Rajdhani',sans-serif;font-size:1rem;outline:none;margin-bottom:14px;transition:.3s}
#lb input:focus{border-color:#4fc3f7;box-shadow:0 0 12px rgba(79,195,247,.15)}
#lb button{width:100%;padding:11px;font-family:'Orbitron',monospace;font-size:.7rem;font-weight:700;letter-spacing:3px;background:linear-gradient(135deg,#0288d1,#4fc3f7);color:#000;border:none;border-radius:7px;cursor:pointer;transition:.3s}
#lb button:hover{box-shadow:0 0 20px rgba(79,195,247,.3)}
#le{color:#ef5350;font-size:.8rem;margin-top:10px;display:none}
.adm{display:none;padding:20px;max-width:1200px;margin:0 auto}
.abar{display:flex;align-items:center;justify-content:space-between;margin-bottom:25px;flex-wrap:wrap;gap:12px;padding-bottom:18px;border-bottom:1px solid rgba(79,195,247,.1)}
.abar h1{font-family:'Orbitron',monospace;font-size:clamp(.9rem,2.5vw,1.3rem);color:#4fc3f7;letter-spacing:4px;text-shadow:0 0 15px rgba(79,195,247,.3)}
.ldot{display:inline-block;width:8px;height:8px;background:#4fc3f7;border-radius:50%;margin-left:10px;animation:lp 1.5s infinite;box-shadow:0 0 8px #4fc3f7;vertical-align:middle}
@keyframes lp{0%,100%{opacity:1;box-shadow:0 0 8px #4fc3f7}50%{opacity:.3;box-shadow:0 0 2px #4fc3f7}}
.abtns{display:flex;gap:8px;flex-wrap:wrap}
.ab{padding:8px 16px;font-family:'Orbitron',monospace;font-size:.55rem;font-weight:700;letter-spacing:2px;border:none;border-radius:4px;cursor:pointer;transition:.3s;text-transform:uppercase}
.abv{background:rgba(79,195,247,.1);color:#4fc3f7;border:1px solid rgba(79,195,247,.25)!important;text-decoration:none;display:inline-flex;align-items:center}
.abv:hover{background:rgba(79,195,247,.2)}
.abr{background:linear-gradient(135deg,#0288d1,#4fc3f7);color:#000}
.abr:hover{box-shadow:0 2px 15px rgba(79,195,247,.3)}
.abc{background:rgba(79,195,247,.08);color:#64b5f6;border:1px solid rgba(79,195,247,.2)!important}
.abc:hover{background:rgba(79,195,247,.15);color:#fff}
.stats{display:flex;gap:12px;margin-bottom:25px;flex-wrap:wrap}
.stat{background:linear-gradient(135deg,rgba(79,195,247,.06),rgba(2,136,209,.08));border:1px solid rgba(79,195,247,.15);border-radius:10px;padding:14px 20px;text-align:center;flex:1;min-width:90px;transition:.3s}
.sn{font-family:'Orbitron',monospace;font-size:1.8rem;font-weight:900;color:#4fc3f7;text-shadow:0 0 10px rgba(79,195,247,.3);transition:.3s}
.sl{font-size:.65rem;letter-spacing:2px;color:rgba(79,195,247,.5);text-transform:uppercase;margin-top:3px}
.tg{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:15px}
.tc{background:linear-gradient(135deg,rgba(79,195,247,.04),rgba(2,136,209,.06));border:1px solid rgba(79,195,247,.15);border-radius:10px;padding:18px;transition:.3s}
.tc:hover{border-color:rgba(79,195,247,.35);box-shadow:0 0 20px rgba(79,195,247,.08)}
.tc.nw{animation:nf 2s ease-out}
@keyframes nf{0%{border-color:#4fc3f7;box-shadow:0 0 35px rgba(79,195,247,.4);background:rgba(79,195,247,.08)}100%{border-color:rgba(79,195,247,.15);box-shadow:none;background:linear-gradient(135deg,rgba(79,195,247,.04),rgba(2,136,209,.06))}}
.tc-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.tc-slot{font-family:'Orbitron',monospace;font-size:.6rem;color:rgba(79,195,247,.45);letter-spacing:2px}
.tc-time{font-size:.65rem;color:rgba(79,195,247,.25)}
.tc-nr{display:flex;gap:8px;margin-bottom:12px;align-items:center}
.tc-nr label{font-family:'Orbitron',monospace;font-size:.5rem;color:rgba(79,195,247,.4);letter-spacing:1px;min-width:40px}
.tc-nr input{flex:1;padding:8px 12px;font-family:'Orbitron',monospace;font-size:.85rem;font-weight:700;background:rgba(79,195,247,.06);border:1px solid rgba(79,195,247,.2);border-radius:5px;color:#fff;outline:none;letter-spacing:1px;transition:.3s}
.tc-nr input:focus{border-color:#4fc3f7;box-shadow:0 0 10px rgba(79,195,247,.1)}
.tc-pls{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.tc-pr{display:flex;align-items:center;gap:8px}
.tc-pr label{font-family:'Orbitron',monospace;font-size:.55rem;color:rgba(79,195,247,.35);min-width:22px;letter-spacing:1px}
.tc-pr input{flex:1;padding:7px 10px;font-family:'Rajdhani',sans-serif;font-size:.95rem;font-weight:600;background:rgba(79,195,247,.04);border:1px solid rgba(79,195,247,.12);border-radius:4px;color:rgba(255,255,255,.85);outline:none;transition:.3s}
.tc-pr input:focus{border-color:rgba(79,195,247,.4);background:rgba(79,195,247,.08)}
.tc-pay{display:flex;align-items:center;gap:10px;margin-bottom:14px;padding:10px 12px;background:rgba(79,195,247,.04);border:1px solid rgba(79,195,247,.1);border-radius:6px}
.tc-thumb{width:60px;height:60px;border-radius:4px;border:1px solid rgba(79,195,247,.2);overflow:hidden;cursor:pointer;flex-shrink:0;transition:.3s;background:rgba(79,195,247,.06)}
.tc-thumb:hover{border-color:#4fc3f7;box-shadow:0 0 12px rgba(79,195,247,.2);transform:scale(1.05)}
.tc-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.tc-pi{flex:1;display:flex;flex-direction:column;gap:4px}
.tc-pl{font-family:'Orbitron',monospace;font-size:.5rem;color:rgba(79,195,247,.4);letter-spacing:2px}
.tc-ps{font-family:'Rajdhani',sans-serif;font-size:.85rem;font-weight:600}
.tc-ps.vf{color:#4fc3f7}.tc-ps.pd{color:rgba(79,195,247,.5)}
.no-ss{font-family:'Rajdhani',sans-serif;font-size:.8rem;color:rgba(79,195,247,.2);font-style:italic}
.bvr{padding:6px 14px;font-family:'Orbitron',monospace;font-size:.5rem;font-weight:700;letter-spacing:2px;border:none;border-radius:4px;cursor:pointer;transition:.3s;white-space:nowrap}
.bvr.dv{background:linear-gradient(135deg,#0288d1,#4fc3f7);color:#000}
.bvr.dv:hover{box-shadow:0 2px 10px rgba(79,195,247,.3)}
.bvr.uv{background:rgba(79,195,247,.08);color:#64b5f6;border:1px solid rgba(79,195,247,.15)!important}
.bvr.uv:hover{background:rgba(79,195,247,.15)}
.tc-btns{display:flex;gap:8px}
.tc-btns button{flex:1;padding:8px;font-family:'Orbitron',monospace;font-size:.55rem;font-weight:700;letter-spacing:2px;border:none;border-radius:5px;cursor:pointer;transition:.3s;text-transform:uppercase}
.bsv{background:linear-gradient(135deg,#0288d1,#4fc3f7);color:#000}
.bsv:hover{box-shadow:0 2px 15px rgba(79,195,247,.3)}
.bdl{background:rgba(79,195,247,.06);color:#64b5f6;border:1px solid rgba(79,195,247,.15)!important}
.bdl:hover{background:rgba(244,67,54,.15);color:#ef5350;border-color:rgba(244,67,54,.3)!important}
.empty{text-align:center;padding:60px;color:rgba(79,195,247,.25);font-family:'Orbitron',monospace;font-size:.75rem;letter-spacing:3px;grid-column:1/-1}
.imgm{position:fixed;inset:0;background:rgba(0,0,0,.92);backdrop-filter:blur(10px);z-index:300;display:none;align-items:center;justify-content:center;padding:20px;cursor:pointer;flex-direction:column;gap:12px}
.imgm.show{display:flex}
.imgm img{max-width:90vw;max-height:85vh;border-radius:8px;border:2px solid rgba(79,195,247,.3);box-shadow:0 0 40px rgba(79,195,247,.15);object-fit:contain}
.imgm-close{font-family:'Orbitron',monospace;font-size:.6rem;color:rgba(79,195,247,.5);letter-spacing:2px}
.toast{position:fixed;top:18px;right:18px;padding:14px 26px;font-family:'Rajdhani',sans-serif;font-size:1rem;font-weight:600;color:#fff;background:linear-gradient(135deg,#0277bd,#0288d1);border:1px solid #4fc3f7;border-radius:8px;box-shadow:0 4px 25px rgba(79,195,247,.25);z-index:400;transform:translateX(130%);transition:transform .35s cubic-bezier(.23,1,.32,1)}
.toast.show{transform:translateX(0)}
</style>
</head>
<body>
<div id="lw">
  <div id="lb">
    <h2>⚡ CCL ADMIN</h2>
    <p>COMRADE CHAMPION LEAGUE</p>
    <input type="password" id="pi" placeholder="Enter password" onkeydown="if(event.key==='Enter')login()">
    <button onclick="login()">LOGIN</button>
    <div id="le">❌ Wrong password</div>
  </div>
</div>
<div class="adm" id="adm">
  <div class="abar">
    <h1>⚡ CCL ADMIN PANEL <span class="ldot"></span></h1>
    <div class="abtns">
      <a href="/" class="ab abv">VIEW SITE</a>
      <button class="ab abr" onclick="loadTeams()">REFRESH</button>
      <button class="ab abc" onclick="clearAll()">CLEAR ALL</button>
    </div>
  </div>
  <div class="stats">
    <div class="stat"><div class="sn" id="sReg">0</div><div class="sl">Registered</div></div>
    <div class="stat"><div class="sn" id="sLeft">12</div><div class="sl">Slots Left</div></div>
    <div class="stat"><div class="sn" id="sVer">0</div><div class="sl">Verified</div></div>
    <div class="stat"><div class="sn" id="sPen">0</div><div class="sl">Pending</div></div>
    <div class="stat"><div class="sn" id="sPly">0</div><div class="sl">Players</div></div>
  </div>
  
  <div class="schedule-panel tc" style="margin-bottom:20px; max-width:100%">
    <div class="tc-top"><span class="tc-slot">MATCH SCHEDULE & COUNTDOWN</span></div>
    <div style="display:flex; gap:15px; flex-wrap:wrap; margin-top:10px;">
      <div class="tc-nr" style="flex:1; min-width:200px;"><label>DATE</label><input type="text" id="schedDate" placeholder="e.g. 25 FEB"></div>
      <div class="tc-nr" style="flex:1; min-width:200px;"><label>TIME</label><input type="text" id="schedTime" placeholder="e.g. 07:00 PM"></div>
      <div class="tc-nr" style="flex:2; min-width:250px;"><label>COUNTDOWN</label><input type="datetime-local" id="schedCount"></div>
      <div class="tc-nr" style="width:auto; display:flex; align-items:center; gap:8px;">
        <label style="min-width:auto">LIVE</label>
        <input type="checkbox" id="schedLive" style="width:20px; height:20px;">
      </div>
      <button class="bsv" onclick="updateSchedule()" style="padding:10px 25px; font-size:0.7rem;">UPDATE SCHEDULE</button>
    </div>
  </div>

  <div class="tg" id="tg"></div>
</div>
<div class="imgm" id="imgm" onclick="closeImg()">
  <img id="imgmi" src="" alt="Payment Screenshot">
  <div class="imgm-close">CLICK ANYWHERE TO CLOSE</div>
</div>
<div class="toast" id="toast"></div>
<script>
const PWD='${ADMIN_PASSWORD}';
let auth='',knownIds=new Set(),firstLoad=true;

function login(){
  const v=document.getElementById('pi').value;
  if(v===PWD){auth=v;document.getElementById('lw').style.display='none';document.getElementById('adm').style.display='block';loadTeams();initSched();setInterval(loadTeams,5000);}
  else{document.getElementById('le').style.display='block';document.getElementById('pi').value='';document.getElementById('pi').focus();}
}

async function initSched(){
  const r=await fetch('/api/schedule'), d=await r.json(), s=d.schedule;
  document.getElementById('schedDate').value=s.date||'';
  document.getElementById('schedTime').value=s.time||'';
  document.getElementById('schedCount').value=s.countdown||'';
  document.getElementById('schedLive').checked=!!s.isLive;
}

async function updateSchedule(){
  const b={
    date: document.getElementById('schedDate').value,
    time: document.getElementById('schedTime').value,
    countdown: document.getElementById('schedCount').value,
    isLive: document.getElementById('schedLive').checked
  };
  const r=await fetch('/api/admin/schedule',{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+auth},body:JSON.stringify(b)});
  const d=await r.json();
  if(d.success)toast('Schedule updated!');else toast('ERR: '+d.error);
}

async function loadTeams(){
  try{
    const r=await fetch('/api/teams'),d=await r.json();
    const newIds=[];
    if(!firstLoad){d.teams.forEach(t=>{if(!knownIds.has(t.id))newIds.push(t.id);});}
    d.teams.forEach(t=>knownIds.add(t.id));
    if(newIds.length&&!firstLoad){const nt=d.teams.find(t=>t.id===newIds[0]);toast('🔔 NEW: "'+nt.name+'" registered! Slot #'+nt.slot);}
    document.getElementById('sReg').textContent=d.teams.length;
    document.getElementById('sLeft').textContent=d.slotsLeft;
    document.getElementById('sVer').textContent=d.teams.filter(t=>t.verified).length;
    document.getElementById('sPen').textContent=d.teams.filter(t=>t.hasScreenshot&&!t.verified).length;
    document.getElementById('sPly').textContent=d.teams.length*4;
    renderTeams(d.teams,new Set(newIds));
    firstLoad=false;
  }catch(e){console.error(e);}
}

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function renderTeams(teams,newIds){
  const tg=document.getElementById('tg');
  if(!teams.length){tg.innerHTML='<div class="empty">NO TEAMS REGISTERED YET</div>';return;}
  tg.innerHTML=teams.map(function(t){
    var isNew=newIds.has(t.id);
    var pay='';
    if(t.hasScreenshot){
      var sc=t.verified?'vf':'pd',st=t.verified?'&#10003; VERIFIED':'&#9679; PENDING';
      var bc=t.verified?'uv':'dv',bt=t.verified?'UNVERIFY':'VERIFY';
      pay='<div class="tc-pay">'+
        '<div class="tc-thumb" data-action="img" data-id="'+t.id+'"><img src="/api/screenshot/'+t.id+'" alt="pay" onerror="this.style.opacity=0.3"></div>'+
        '<div class="tc-pi"><span class="tc-pl">PAYMENT SCREENSHOT</span><span class="tc-ps '+sc+'">'+st+'</span></div>'+
        '<button class="bvr '+bc+'" data-action="verify" data-id="'+t.id+'" data-val="'+(!t.verified)+'">'+bt+'</button>'+
        '</div>';
    }else{
      pay='<div class="tc-pay"><span class="no-ss">No payment screenshot uploaded</span></div>';
    }
    var players=t.players.map(function(pl,i){return '<div class="tc-pr"><label>P'+(i+1)+'</label><input type="text" id="p'+i+'-'+t.id+'" value="'+esc(pl)+'"></div>';}).join('');
    return '<div class="tc'+(isNew?' nw':'')+'" id="card-'+t.id+'">'+
      '<div class="tc-top"><span class="tc-slot">SLOT #'+t.slot+'</span><span class="tc-time">'+new Date(t.registeredAt).toLocaleString()+'</span></div>'+
      '<div class="tc-nr"><label>TEAM</label><input type="text" id="n-'+t.id+'" value="'+esc(t.name)+'"></div>'+
      '<div class="tc-pls">'+players+'</div>'+
      pay+
      '<div class="tc-btns"><button class="bsv" data-action="save" data-id="'+t.id+'">SAVE</button><button class="bdl" data-action="del" data-id="'+t.id+'" data-name="'+esc(t.name)+'">DELETE</button></div>'+
      '</div>';
  }).join('');
}

document.addEventListener('click',async function(e){
  const el=e.target.closest('[data-action]');
  if(!el)return;
  const action=el.dataset.action, id=el.dataset.id;
  if(action==='img'){openImg(id);}
  else if(action==='verify'){await toggleV(id, el.dataset.val==='true');}
  else if(action==='save'){await saveTeam(id);}
  else if(action==='del'){await delTeamById(id, el.dataset.name);}
});

async function toggleV(id,val){
  const r=await fetch('/api/admin/verify/'+id,{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+auth},body:JSON.stringify({verified:val})});
  const d=await r.json();
  if(d.success){toast(val?'Payment VERIFIED!':'Unverified');loadTeams();}
  else toast('ERR: '+d.error);
}

async function saveTeam(id){
  const name=document.getElementById('n-'+id).value;
  const players=[0,1,2,3].map(i=>document.getElementById('p'+i+'-'+id).value);
  const r=await fetch('/api/admin/team/'+id,{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+auth},body:JSON.stringify({teamName:name,players})});
  const d=await r.json();
  if(d.success)toast(name+' updated!');else toast('ERR: '+d.error);
}

async function delTeamById(id,name){
  if(!confirm('Delete team "'+name+'"?'))return;
  const r=await fetch('/api/admin/team/'+id,{method:'DELETE',headers:{'Authorization':'Bearer '+auth}});
  const d=await r.json();
  if(d.success){toast(name+' removed');loadTeams();}else toast('ERR: '+d.error);
}

async function clearAll(){
  if(!confirm('Clear ALL teams? Cannot be undone!'))return;
  const r=await fetch('/api/admin/teams',{method:'DELETE',headers:{'Authorization':'Bearer '+auth}});
  const d=await r.json();
  if(d.success){toast('All cleared!');loadTeams();}
}

function openImg(id){document.getElementById('imgmi').src='/api/screenshot/'+id;document.getElementById('imgm').classList.add('show');}
function closeImg(){document.getElementById('imgm').classList.remove('show');document.getElementById('imgmi').src='';}

function toast(m){const t=document.getElementById('toast');t.textContent=m;t.className='toast';setTimeout(()=>t.classList.add('show'),10);setTimeout(()=>t.classList.remove('show'),3500);}
</script>
</body>
</html>`;
      setCORS(res); res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(adminHtml); return;
    }

    // GET /api/teams
    if (m === 'GET' && p === '/api/teams') {
      const teams = await Team.find().sort({ slot: 1 });
      const out = teams.map(t => ({ id: t.id, name: t.name, players: t.players, slot: t.slot, registeredAt: t.registeredAt, verified: t.verified, hasScreenshot: !!t.screenshot }));
      json(res, 200, { teams: out, maxSlots: MAX_SLOTS, slotsLeft: MAX_SLOTS - teams.length }); return;
    }

    // POST /api/register
    if (m === 'POST' && p === '/api/register') {
      const b = await parseBody(req);
      if (b._error) { json(res, 400, { error: b._error }); return; }
      if (!b.teamName || !b.teamName.trim()) { json(res, 400, { error: 'Team name required' }); return; }
      if (!b.players || b.players.length !== 4 || b.players.some(x => !x || !x.trim())) { json(res, 400, { error: 'All 4 players required' }); return; }
      const count = await Team.countDocuments();
      if (count >= MAX_SLOTS) { json(res, 400, { error: 'All slots filled!' }); return; }
      const exists = await Team.findOne({ name: new RegExp('^' + b.teamName.trim() + '$', 'i') });
      if (exists) { json(res, 400, { error: 'Team name taken!' }); return; }
      const team = new Team({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
        name: b.teamName.trim(),
        players: b.players.map(x => x.trim()),
        slot: count + 1,
        registeredAt: new Date(),
        verified: false,
        screenshot: b.paymentScreenshot || ''
      });
      await team.save();
      console.log(`[REG] "${team.name}" slot #${team.slot}`);
      json(res, 200, { success: true, team, slotsLeft: MAX_SLOTS - (count + 1) }); return;
    }

    // Static files (after all API routes)
    if (m === 'GET' && !p.startsWith('/api/') && p !== '/' && p !== '/admin') {
      const dp = decodeURIComponent(p);
      const lp = path.join(__dirname, dp);
      if (fs.existsSync(lp) && fs.lstatSync(lp).isFile()) {
        const ext = path.extname(dp).toLowerCase();
        let ct = 'text/plain';
        if (ext === '.png') ct = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') ct = 'image/jpeg';
        else if (ext === '.gif') ct = 'image/gif';
        else if (ext === '.css') ct = 'text/css';
        else if (ext === '.js') ct = 'text/javascript';
        else if (ext === '.html') ct = 'text/html';
        serve(res, dp, ct); return;
      }
    }

    // PUT /api/admin/verify/:id
    if (m === 'PUT' && p.startsWith('/api/admin/verify/')) {
      if (!isAdmin(req)) { json(res, 401, { error: 'Unauthorized' }); return; }
      const id = p.replace('/api/admin/verify/', ''), b = await parseBody(req);
      const team = await Team.findOne({ id });
      if (!team) { json(res, 404, { error: 'Not found' }); return; }
      team.verified = !!b.verified; await team.save();
      console.log(`[ADMIN] ${team.verified ? 'Verified' : 'Unverified'} "${team.name}"`);
      json(res, 200, { success: true, verified: team.verified }); return;
    }

    // PUT /api/admin/team/:id
    if (m === 'PUT' && p.startsWith('/api/admin/team/')) {
      if (!isAdmin(req)) { json(res, 401, { error: 'Unauthorized' }); return; }
      const id = p.split('/').pop(), b = await parseBody(req);
      const team = await Team.findOne({ id });
      if (!team) { json(res, 404, { error: 'Not found' }); return; }
      if (b.teamName) team.name = b.teamName.trim();
      if (b.players && b.players.length === 4) team.players = b.players.map(x => x.trim());
      await team.save(); console.log(`[ADMIN] Updated "${team.name}"`);
      json(res, 200, { success: true, team }); return;
    }

    // DELETE /api/admin/team/:id
    if (m === 'DELETE' && p.startsWith('/api/admin/team/')) {
      if (!isAdmin(req)) { json(res, 401, { error: 'Unauthorized' }); return; }
      const id = p.split('/').pop();
      const team = await Team.findOneAndDelete({ id });
      if (!team) { json(res, 404, { error: 'Not found' }); return; }
      const all = await Team.find().sort({ slot: 1 });
      for (let i = 0; i < all.length; i++) { all[i].slot = i + 1; await all[i].save(); }
      console.log(`[ADMIN] Removed "${team.name}"`);
      json(res, 200, { success: true, removed: team.name, slotsLeft: MAX_SLOTS - all.length }); return;
    }

    // DELETE /api/admin/teams
    if (m === 'DELETE' && p === '/api/admin/teams') {
      if (!isAdmin(req)) { json(res, 401, { error: 'Unauthorized' }); return; }
      await Team.deleteMany({});
      console.log('[ADMIN] Cleared all');
      json(res, 200, { success: true }); return;
    }

    // GET /api/schedule
    if (m === 'GET' && p === '/api/schedule') { const s = await getSchedule(); json(res, 200, { schedule: s }); return; }

    // PUT /api/admin/schedule
    if (m === 'PUT' && p === '/api/admin/schedule') {
      if (!isAdmin(req)) { json(res, 401, { error: 'Unauthorized' }); return; }
      const b = await parseBody(req), s = await getSchedule();
      if (typeof b.date === 'string') s.date = b.date;
      if (typeof b.time === 'string') s.time = b.time;
      if (typeof b.countdown === 'string') s.countdown = b.countdown;
      if (typeof b.isLive === 'boolean') s.isLive = b.isLive;
      await s.save();
      console.log(`[ADMIN] Schedule updated: ${s.date} ${s.time} count=${s.countdown} live=${s.isLive}`);
      json(res, 200, { success: true, schedule: s }); return;
    }

    res.writeHead(404); res.end('Not found');
  } catch (err) {
    console.error('Server Err:', err.message);
    try { json(res, 500, { error: 'Internal Server Error' }); } catch (e) { res.end(); }
  }
});

server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  COMRADE CHAMPION LEAGUE SERVER`);
  console.log(`========================================`);
  console.log(`  Website:  http://localhost:${PORT}`);
  console.log(`  Admin:    http://localhost:${PORT}/admin`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
  console.log(`========================================\n`);
});
