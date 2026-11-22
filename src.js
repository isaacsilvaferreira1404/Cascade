import './style.css';
const app=document.getElementById('app');
const owner='isaacsilvaferreira1234@gmail.com';
const defaults=[['Corte',40,60],['Sobrancelha',10,10],['Corte + sobrancelha',50,60],['Barba desenhada',30,40],['Corte e barba',65,80],['Corte + barba + sobrancelha',70,80],['Penteado',30,30],['Luzes',80,30],['Platinado',125,30],['Relaxamento',30,15],['Botox',70,60],['Progressiva',80,90],['Nudreds',60,80],['Lavagem',20,10],['Skin care',25,30],['Pezinho',15,15],['Hidratação',25,20],['Dedoliss',35,30],['Coloração',35,40],['Fio a fio',110,60]];
const plans={cabelo:['Club Cabelo',149.99],barba:['Club Barba',114.99],completo:['Club Completo',219.99]};
let user=null,users=[],services=[],slots=[],appointments=[],selected=null;
const el=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const admin=()=>user?.isAdmin===true&&user?.role==='admin';
const barber=()=>user?.role==='barber';
const min=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function api(path,method='GET',body){
 const response=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(result.error||'Erro ao acessar servidor');
 return result;
}
const data=(collection,method='GET',body,id)=>api('/api/data?collection='+encodeURIComponent(collection)+(id?'&id='+encodeURIComponent(id):''),method,body);
const auth=(action,method='GET',body)=>api('/api/auth?action='+action,method,body);
function shell(html){
 app.innerHTML='<header><div class="brand">✂ CAS<span>CADE</span><small>BARBEARIA · DESDE 2016</small></div><nav><button id="homeNav" class="secondary">Início</button><button id="accountNav">'+(user?'Minha conta':'Entrar')+'</button>'+(admin()?'<button id="adminNav">Gerenciar logins</button>':'')+'</nav></header><main>'+html+'</main><footer>CASCADE BARBEARIA · ESTILO E PRECISÃO</footer>';
 el('homeNav').onclick=home;el('accountNav').onclick=()=>user?account():login();if(el('adminNav'))el('adminNav').onclick=management;
}
function message(t){if(el('notice'))el('notice').textContent=t}
async function reload(){
 if(!user)return;
 const [u,s,l,a]=await Promise.all([data('users'),data('services'),data('slots'),data('appointments')]);
 users=u;services=s;slots=l;appointments=a;
}
async function init(){
 try{const result=await auth('me');user=result.user;await reload()}catch(e){user=null}
 home();
}
function login(register=false){
 shell('<section class="section account-section"><div class="panel account-card"><div class="eyebrow">CASCADE · ACESSO SEGURO</div><h2>'+(register?'Criar conta':'Entrar na conta')+'</h2><form id="authForm">'+(register?'<label>Nome completo<input id="name" required minlength="2" maxlength="80" autocomplete="name"></label>':'')+'<label>E-mail<input id="email" type="email" required autocomplete="email"></label><label>Senha<input id="password" type="password" required minlength="12" autocomplete="'+(register?'new-password':'current-password')+'"></label><button type="submit">'+(register?'Cadastrar':'Entrar')+'</button></form><p id="notice" role="status"></p><button class="secondary" id="switch">'+(register?'Já tenho conta':'Criar uma conta')+'</button>'+(register?'':'<p class="muted">Se sua conta era do sistema antigo, cadastre uma nova senha no sistema Firestore.</p>')+'</div></section>');
 el('switch').onclick=()=>login(!register);
 el('authForm').onsubmit=async e=>{e.preventDefault();try{await auth(register?'register':'login','POST',{name:register?el('name').value:undefined,email:el('email').value,password:el('password').value});user=(await auth('me')).user;await reload();home()}catch(err){message(err.message)}};
}
function ownerSetup(){
 shell('<section class="section account-section"><div class="panel account-card"><div class="eyebrow">CONFIGURAÇÃO INICIAL</div><h2>Ativar administrador</h2><p>Ativação única da conta proprietária '+esc(owner)+'.</p><form id="setupForm"><label>Código de ativação<input id="setupCode" type="password" required></label><label>Seu nome<input id="setupName" required maxlength="80"></label><label>Nova senha (mínimo 12 caracteres)<input id="setupPassword" type="password" required minlength="12"></label><button type="submit">Criar administrador</button></form><p id="notice"></p></div></section>');
 el('setupForm').onsubmit=async e=>{e.preventDefault();try{const x=await api('/api/owner-setup','POST',{code:el('setupCode').value,name:el('setupName').value,password:el('setupPassword').value});login();setTimeout(()=>{},0)}catch(err){message(err.message)}};
}
function home(){
 shell('<section class="hero"><div><div class="eyebrow">BARBEARIA CASCADE · DESDE 2016</div><h1>Seu estilo.<br><em>Nossa assinatura.</em></h1><p>Cortes, barba e cuidados masculinos com agendamento online.</p><a class="cta" href="#agenda">Agendar agora</a></div><div class="heroart">✂<small>CASCADE</small></div></section><section class="section" id="agenda"><div class="eyebrow">AGENDE SEU HORÁRIO</div><h2>Escolha seu serviço</h2><div class="servicegrid">'+[...defaults.map(([name,price,duration])=>({id:'default:'+name,name,price,duration})),...services.filter(x=>x.active!==false)].map(s=>'<button class="service" data-service="'+esc(s.id)+'"><b>'+esc(s.name)+'</b><span>'+money(s.price)+' · '+s.duration+' min</span></button>').join('')+'</div><div id="booking"></div></section><section class="section" id="club"><div class="eyebrow">BENEFÍCIOS EXCLUSIVOS</div><h2>Cascade Club</h2><div class="cards">'+Object.entries(plans).map(([key,v])=>'<article class="plan"><h3>'+v[0]+'</h3><strong>'+money(v[1])+'</strong><p>mensalidade</p></article>').join('')+'</div></section>'+(user?'<section class="section"><h2>Minha área</h2><div id="dashboard"></div></section>':'<section class="section panel"><h2>Entre para agendar</h2><button id="enter">Login ou cadastro</button></section>')+'<p id="notice"></p>');
 document.querySelectorAll('[data-service]').forEach(b=>b.onclick=()=>choose(b.dataset.service));
 if(el('enter'))el('enter').onclick=()=>login();
 if(user)dashboard();
}
function choose(id){
 const service=id.startsWith('default:')?null:services.find(x=>x.id===id);
 if(!service){el('booking').innerHTML='<div class="panel"><p>Este serviço ainda não foi cadastrado pela administração no Firestore. Solicite o cadastro para liberar agendamentos.</p></div>';return}
 if(!user){login();return}
 selected={serviceId:id};const barbers=users.filter(x=>x.role==='barber');
 el('booking').innerHTML='<div class="panel"><h3>'+esc(service.name)+'</h3><label>Barbeiro<select id="bookBarber"><option value="">Selecione</option>'+barbers.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join('')+'</select></label><label>Data<input id="bookDate" type="date" min="'+today()+'"></label><div id="available"></div><p id="notice"></p></div>';
 el('bookBarber').onchange=available;el('bookDate').onchange=available;
}
function available(){
 const barberId=el('bookBarber').value,date=el('bookDate').value,service=services.find(x=>x.id===selected?.serviceId);
 if(!barberId||!date||!service)return;
 const times=[];
 const occupied=appointments.filter(a=>a.barberId===barberId&&a.date===date&&a.status!=='cancelled');
 const relevant=slots.filter(s=>s.barberId===barberId&&s.date===date&&s.active!==false);
 for(const s of relevant)for(let t=min(s.time);t+service.duration<=min(s.time)+s.duration;t+=15){
  if(occupied.some(a=>t<min(a.time)+a.duration&&t+service.duration>min(a.time)))continue;
  if(date===today()){const now=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date());if(t<=min(now))continue}
  const time=String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');times.push({slotId:s.id,time});
 }
 el('available').innerHTML=times.length?'<h4>Horários disponíveis</h4><div class="times">'+times.map((x,i)=>'<button class="time" data-time="'+i+'">'+x.time+'</button>').join('')+'</div>':'<p>Nenhum horário disponível.</p>';
 document.querySelectorAll('[data-time]').forEach(b=>b.onclick=async()=>{const x=times[Number(b.dataset.time)];b.disabled=true;try{await data('appointments','POST',{slotId:x.slotId,time:x.time,serviceId:selected.serviceId});await reload();home();message('Agendamento confirmado!')}catch(err){b.disabled=false;message(err.message)}});
}
function dashboard(){
 el('dashboard').innerHTML='<div class="panel"><h3>Meus agendamentos</h3>'+(appointments.length?appointments.map(a=>'<p>'+esc(a.service)+' · '+esc(a.date)+' '+esc(a.time)+' · '+esc(a.status)+' '+(a.status==='scheduled'?'<button class="secondary" data-cancel="'+esc(a.id)+'">Cancelar</button>':'')+'</p>').join(''):'<p>Nenhum agendamento.</p>')+'</div>'+(barber()?'<button id="staff">Painel do barbeiro</button>':'');
 document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=async()=>{try{await data('appointments','PATCH',{status:'cancelled'},b.dataset.cancel);await reload();home()}catch(err){message(err.message)}});
 if(el('staff'))el('staff').onclick=staff;
}
function account(){
 shell('<section class="section account-section"><div class="panel account-card"><div class="eyebrow">PERFIL CASCADE</div><h2>Minha conta</h2><p>'+esc(user.email)+'</p><form id="profile"><label>Nome<input id="profileName" required minlength="2" value="'+esc(user.name)+'"></label><label>Telefone<input id="profilePhone" maxlength="20" value="'+esc(user.phone||'')+'"></label><button>Salvar</button></form><p id="notice"></p>'+(admin()?'<button id="manage">Gerenciar logins e administração</button>':'')+(barber()?'<button id="staff">Painel do barbeiro</button>':'')+'<button id="logout" class="secondary">Sair</button></div></section>');
 el('profile').onsubmit=async e=>{e.preventDefault();try{await data('users','PATCH',{name:el('profileName').value,phone:el('profilePhone').value},user.uid);user.name=el('profileName').value;message('Dados salvos')}catch(err){message(err.message)}};
 if(el('manage'))el('manage').onclick=management;if(el('staff'))el('staff').onclick=staff;
 el('logout').onclick=async()=>{await auth('logout','POST');user=null;users=[];services=[];slots=[];appointments=[];home()};
}
function management(){
 if(!admin()){account();return}
 shell('<section class="section"><div class="eyebrow">ADMINISTRAÇÃO CASCADE</div><h2>Gerenciar logins</h2><p>Contas do Cloud Firestore. Senhas nunca são exibidas.</p><div id="userList"></div><h2>Procedimentos</h2><form class="panel" id="serviceForm"><label>Nome<input id="serviceName" required></label><label>Preço (R$)<input id="servicePrice" type="number" step="0.01" min="0" required></label><label>Duração (minutos)<input id="serviceDuration" type="number" min="5" max="480" required></label><button>Cadastrar procedimento</button></form><div id="serviceList"></div><p id="notice"></p></section>');
 el('userList').innerHTML=users.map(u=>'<form class="panel admin-user" data-id="'+esc(u.id)+'"><strong>'+esc(u.name)+'</strong><p>'+esc(u.email)+'</p><label>Função<select name="role"><option value="client" '+(u.role==='client'?'selected':'')+'>Cliente</option><option value="barber" '+(u.role==='barber'?'selected':'')+'>Barbeiro</option><option value="admin" '+(u.role==='admin'?'selected':'')+'>Administrador</option></select></label><label>Plano<select name="club">'+['none','cabelo','barba','completo'].map(c=>'<option value="'+c+'" '+(u.club===c?'selected':'')+'>'+c+'</option>').join('')+'</select></label><label><input type="checkbox" name="clubActive" '+(u.clubActive?'checked':'')+'> Plano ativo</label><label>Início<input type="time" name="workStart" value="'+esc(u.workStart||'09:00')+'"></label><label>Fim<input type="time" name="workEnd" value="'+esc(u.workEnd||'18:00')+'"></label><button type="submit" '+(u.id===user.uid?'disabled title="Sua própria função não pode ser alterada"':'')+'>Salvar permissões</button></form>').join('');
 document.querySelectorAll('.admin-user').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const x=new FormData(f),role=x.get('role');try{await data('users','PATCH',{role:role==='admin'?'admin':role,isAdmin:role==='admin',club:x.get('club'),clubActive:x.get('clubActive')==='on',workStart:x.get('workStart'),workEnd:x.get('workEnd')},f.dataset.id);await reload();management();message('Permissões atualizadas')}catch(err){message(err.message)}});
 el('serviceList').innerHTML=services.map(s=>'<div class="panel"><strong>'+esc(s.name)+'</strong> · '+money(s.price)+' · '+s.duration+' min <button class="secondary" data-remove="'+esc(s.id)+'">Excluir</button></div>').join('');
 document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('Excluir procedimento?'))return;try{await data('services','DELETE',undefined,b.dataset.remove);await reload();management()}catch(err){message(err.message)}});
 el('serviceForm').onsubmit=async e=>{e.preventDefault();try{await data('services','POST',{name:el('serviceName').value,price:Number(el('servicePrice').value),duration:Number(el('serviceDuration').value)});await reload();management();message('Procedimento cadastrado')}catch(err){message(err.message)}};
}
function staff(){
 if(!barber()&&!admin()){home();return}
 shell('<section class="section"><div class="eyebrow">EQUIPE CASCADE</div><h2>Horários e atendimentos</h2><form id="slotForm" class="panel">'+(admin()?'<label>Barbeiro<select id="slotBarber">'+users.filter(x=>x.role==='barber').map(u=>'<option value="'+esc(u.id)+'">'+esc(u.name)+'</option>').join('')+'</select></label>':'')+'<label>Data<input id="slotDate" type="date" min="'+today()+'" required></label><label>Início<input id="slotTime" type="time" required></label><label>Duração (min)<input id="slotDuration" type="number" min="15" max="720" value="480" required></label><button>Disponibilizar horário</button></form><h3>Horários</h3><div id="slotList"></div><h3>Agendamentos</h3><div id="appointmentList"></div><p id="notice"></p></section>');
 el('slotForm').onsubmit=async e=>{e.preventDefault();try{await data('slots','POST',{barberId:admin()?el('slotBarber').value:user.uid,date:el('slotDate').value,time:el('slotTime').value,duration:Number(el('slotDuration').value)});await reload();staff();message('Horário cadastrado')}catch(err){message(err.message)}};
 el('slotList').innerHTML=slots.filter(s=>admin()||s.barberId===user.uid).map(s=>'<div class="panel">'+esc(s.date)+' '+esc(s.time)+' · '+s.duration+'min <button class="secondary" data-slot="'+esc(s.id)+'" data-active="'+(s.active!==false)+'">'+(s.active!==false?'Desativar':'Ativar')+'</button></div>').join('');
 document.querySelectorAll('[data-slot]').forEach(b=>b.onclick=async()=>{try{await data('slots','PATCH',{active:b.dataset.active!=='true'},b.dataset.slot);await reload();staff()}catch(err){message(err.message)}});
 el('appointmentList').innerHTML=appointments.map(a=>'<div class="panel">'+esc(a.service)+' · '+esc(a.date)+' '+esc(a.time)+' · '+esc(a.status)+(a.status==='scheduled'?'<button data-complete="'+esc(a.id)+'">Concluir</button>':'')+'</div>').join('');
 document.querySelectorAll('[data-complete]').forEach(b=>b.onclick=async()=>{try{await data('appointments','PATCH',{status:'completed'},b.dataset.complete);await reload();staff()}catch(err){message(err.message)}});
}
window.addEventListener('hashchange',()=>{if(location.hash==='#configurar-administrador')ownerSetup()});
init().then(()=>{if(location.hash==='#configurar-administrador')ownerSetup()});
