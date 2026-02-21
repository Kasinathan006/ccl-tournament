
const PWD='ccl2025';
let auth='',knownIds=new Set(),firstLoad=true;

function login(){
  const v=document.getElementById('pi').value;
  if(v===PWD){auth=v;document.getElementById('lw').style.display='none';document.getElementById('adm').style.display='block';loadTeams();setInterval(loadTeams,5000);}
  else{document.getElementById('le').style.display='block';document.getElementById('pi').value='';document.getElementById('pi').focus();}
}

async function loadTeams(){
  try{
    const r=await fetch('/api/teams'),d=await r.json();
    const newIds=[];
    if(!firstLoad){d.teams.forEach(t=>{if(!knownIds.has(t.id))newIds.push(t.id);});}
    d.teams.forEach(t=>knownIds.add(t.id));
    if(newIds.length&&!firstLoad){const nt=d.teams.find(t=>t.id===newIds[0]);toast('ð NEW: "'+nt.name+'" registered! Slot #'+nt.slot);}
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

