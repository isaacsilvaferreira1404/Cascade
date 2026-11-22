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
 document.getElementById('bookingOverlay')?.remove();
 document.body.classList.remove('booking-modal-open');
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
 shell('<section class="hero"><div><div class="eyebrow">BARBEARIA CASCADE · DESDE 2016</div><h1>Seu estilo.<br><em>Nossa assinatura.</em></h1><p>Cortes, barba e cuidados masculinos com agendamento online.</p><a class="cta" href="#agenda">Agendar agora</a></div><div class="heroart">✂<small>CASCADE</small></div></section><section class="section" id="agenda"><div class="eyebrow">AGENDE SEU HORÁRIO</div><h2>Escolha seu serviço</h2><div class="servicegrid">'+[...defaults.filter(([name])=>!services.some(x=>x.name===name&&x.active!==false)).map(([name,price,duration])=>({id:'default:'+name,name,price,duration})),...services.filter(x=>x.active!==false)].map(s=>'<button class="service" data-service="'+esc(s.id)+'"><b>'+esc(s.name)+'</b><span>'+money(s.price)+' · '+s.duration+' min</span></button>').join('')+'</div><div id="booking"></div></section><section class="section" id="club"><div class="eyebrow">BENEFÍCIOS EXCLUSIVOS</div><h2>Cascade Club</h2><div class="cards">'+Object.entries(plans).map(([key,v])=>'<article class="plan"><h3>'+v[0]+'</h3><strong>'+money(v[1])+'</strong><p>mensalidade</p></article>').join('')+'</div></section>'+(user?'<section class="section"><h2>Minha área</h2><div id="dashboard"></div></section>':'<section class="section panel"><h2>Entre para agendar</h2><button id="enter">Login ou cadastro</button></section>')+'<p id="notice"></p>');
 document.querySelectorAll('[data-service]').forEach(b=>b.onclick=()=>choose(b.dataset.service));
 if(el('enter'))el('enter').onclick=()=>login();
 if(user)dashboard();
}
function choose(id){
 document.getElementById('bookingOverlay')?.remove();
 document.body.classList.remove('booking-modal-open');
 const service=services.find(x=>x.id===id&&x.active!==false);
 if(!service){el('booking').innerHTML='<div class="panel"><p>Procedimento ainda não disponível para agendamento.</p></div>';return}
 if(!user){login();return}
 selected={serviceId:id,barberId:null};
 const barbers=users.filter(x=>x.role==='barber');
 el('booking').innerHTML='<div class="panel booking-panel"><div class="eyebrow">SEU AGENDAMENTO</div><h3>'+esc(service.name)+'</h3><p class="muted">'+money(service.price)+' · '+service.duration+' minutos</p><h4>1. Escolha seu barbeiro</h4><div class="barbergrid">'+barbers.map(b=>'<button type="button" class="barber-card" data-book-barber="'+esc(b.id)+'"><span class="barber-avatar">✂</span><b>'+esc(b.name)+'</b><small>Ver horários disponíveis</small></button>').join('')+'</div>'+(barbers.length?'':'<p>Nenhum barbeiro cadastrado no Firestore.</p>')+'<div id="dateSelection" hidden><h4>2. Escolha o dia</h4><div class="day-tabs" id="clientDayTabs"></div><input id="bookDate" type="hidden"></div><div id="available"></div><p id="notice" role="status"></p></div>';
 document.querySelectorAll('[data-book-barber]').forEach(button=>button.onclick=()=>{
  selected.barberId=button.dataset.bookBarber;
  document.querySelectorAll('[data-book-barber]').forEach(b=>b.classList.toggle('selected',b===button));
  el('dateSelection').hidden=false;
  const days=nextSevenDays();
  el('clientDayTabs').innerHTML=days.map(d=>'<button type="button" class="day-tab" data-book-date="'+d.date+'">'+esc(d.label)+'</button>').join('');
  document.querySelectorAll('[data-book-date]').forEach(b=>b.onclick=()=>{el('bookDate').value=b.dataset.bookDate;document.querySelectorAll('[data-book-date]').forEach(x=>x.classList.toggle('selected',x===b));available()});
  el('clientDayTabs').querySelector('[data-book-date]')?.click();
 });
 
 const overlay=document.createElement('div');
 overlay.className='booking-overlay';
 overlay.id='bookingOverlay';
 overlay.setAttribute('role','dialog');
 overlay.setAttribute('aria-modal','true');
 overlay.setAttribute('aria-label','Agendar procedimento');
 const panel=el('booking').firstElementChild;
 const back=document.createElement('button');
 back.type='button';back.className='secondary booking-back';back.textContent='← Voltar';
 back.onclick=()=>{overlay.remove();document.body.classList.remove('booking-modal-open');selected=null;};
 panel.prepend(back);
 overlay.appendChild(panel);
 document.body.appendChild(overlay);
 document.body.classList.add('booking-modal-open');
 back.focus();
 overlay.addEventListener('click',e=>{if(e.target===overlay)back.click()});

}
let availabilityRequest=0;
async function available(){
 const target=el('available');
 if(!target||!selected?.barberId)return;
 const date=el('bookDate').value,service=services.find(x=>x.id===selected.serviceId);
 if(!date||!service)return;
 const request=++availabilityRequest;
 target.innerHTML='<h4>3. Escolha seu horário</h4><p>Consultando agenda do barbeiro...</p>';
 try{
  const url='/api/data?collection=availability&barberId='+encodeURIComponent(selected.barberId)+'&date='+encodeURIComponent(date)+'&serviceId='+encodeURIComponent(selected.serviceId);
  const times=await api(url);
  if(request!==availabilityRequest||!el('available'))return;
  target.innerHTML='<h4>3. Escolha seu horário</h4><p class="muted">Os horários ocupados são pulados automaticamente conforme a duração dos procedimentos.</p>'+(times.length?'<div class="times">'+times.map((x,i)=>'<button type="button" class="time" data-time="'+i+'">'+esc(x.time)+'</button>').join('')+'</div>':'<p class="sold-out" role="status">Os horários deste dia acabaram ou ainda não foram disponibilizados. Escolha outro dia.</p>');
  target.querySelectorAll('[data-time]').forEach(button=>button.onclick=async()=>{
   const choice=times[Number(button.dataset.time)];
   target.querySelectorAll('[data-time]').forEach(b=>b.disabled=true);
   try{
    await data('appointments','POST',{slotId:choice.slotId,time:choice.time,serviceId:selected.serviceId});
    await reload();home();message('Agendamento confirmado para '+choice.time+'!');
   }catch(err){message(err.message);await available()}
  });
 }catch(err){if(request===availabilityRequest&&el('available'))target.innerHTML='<p>Não foi possível consultar horários: '+esc(err.message)+'</p>'}
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
 shell('<section class="section"><div class="eyebrow">ADMINISTRAÇÃO CASCADE</div><h2>Gerenciar logins</h2><p>Contas do Cloud Firestore. Senhas nunca são exibidas.</p><div id="userList"></div><h2>Cadastrar contas da equipe</h2><form class="panel" id="teamForm"><label>Nome<input id="teamName" required minlength="2"></label><label>E-mail<input id="teamEmail" type="email" required></label><label>Senha inicial (mínimo 12 caracteres)<input id="teamPassword" type="password" minlength="12" required></label><label>Função<select id="teamRole"><option value="barber">Barbeiro</option><option value="client">Cliente</option></select></label><button>Criar conta no Firestore</button></form><h2>Procedimentos</h2><form class="panel" id="serviceForm"><label>Nome<input id="serviceName" required></label><label>Preço (R$)<input id="servicePrice" type="number" step="0.01" min="0" required></label><label>Duração (minutos)<input id="serviceDuration" type="number" min="5" max="480" required></label><button>Cadastrar procedimento</button></form><div id="serviceList"></div><p id="notice"></p></section>');
 el('userList').innerHTML=users.map(u=>'<form class="panel admin-user" data-id="'+esc(u.id)+'"><strong>'+esc(u.name)+'</strong><p>'+esc(u.email)+'</p><label>Função<select name="role"><option value="client" '+(u.role==='client'?'selected':'')+'>Cliente</option><option value="barber" '+(u.role==='barber'?'selected':'')+'>Barbeiro</option><option value="admin" '+(u.role==='admin'?'selected':'')+'>Administrador</option></select></label><label>Plano<select name="club">'+['none','cabelo','barba','completo'].map(c=>'<option value="'+c+'" '+(u.club===c?'selected':'')+'>'+c+'</option>').join('')+'</select></label><label><input type="checkbox" name="clubActive" '+(u.clubActive?'checked':'')+'> Plano ativo</label><label>Início<input type="time" name="workStart" value="'+esc(u.workStart||'09:00')+'"></label><label>Fim<input type="time" name="workEnd" value="'+esc(u.workEnd||'18:00')+'"></label><button type="submit" '+(u.id===user.uid?'disabled title="Sua própria função não pode ser alterada"':'')+'>Salvar permissões</button></form>').join('');
 document.querySelectorAll('.admin-user').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const x=new FormData(f),role=x.get('role');try{await data('users','PATCH',{role:role==='admin'?'admin':role,isAdmin:role==='admin',club:x.get('club'),clubActive:x.get('clubActive')==='on',workStart:x.get('workStart'),workEnd:x.get('workEnd')},f.dataset.id);await reload();management();message('Permissões atualizadas')}catch(err){message(err.message)}});
 el('serviceList').innerHTML=services.map(s=>'<div class="panel"><strong>'+esc(s.name)+'</strong> · '+money(s.price)+' · '+s.duration+' min <button class="secondary" data-remove="'+esc(s.id)+'">Excluir</button></div>').join('');
 document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('Excluir procedimento?'))return;try{await data('services','DELETE',undefined,b.dataset.remove);await reload();management()}catch(err){message(err.message)}});
 el('teamForm').onsubmit=async e=>{e.preventDefault();try{await auth('admin-create','POST',{name:el('teamName').value,email:el('teamEmail').value,password:el('teamPassword').value,role:el('teamRole').value});await reload();management();message('Conta criada no Firestore. Entregue a senha inicial ao usuário por um canal seguro.')}catch(err){message(err.message)}};
 el('serviceForm').onsubmit=async e=>{e.preventDefault();try{await data('services','POST',{name:el('serviceName').value,price:Number(el('servicePrice').value),duration:Number(el('serviceDuration').value)});await reload();management();message('Procedimento cadastrado')}catch(err){message(err.message)}};
}
const weekdays=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const nextSevenDays=()=>Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i);const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);const day=new Date(date+'T12:00:00Z').getUTCDay();return {date,day,label:weekdays[day].split('-')[0]+' '+date.slice(8,10)}});
async function weeklyEditor(){
 if(!barber()&&!admin())return;
 const barberId=admin()?el('weeklyBarber')?.value:user.uid;
 if(!barberId)return;
 const container=el('weeklyEditor');
 const days=nextSevenDays();let selectedDate=days[0].date;
 container.innerHTML='<p class="muted">Escolha o dia e marque os horários de trabalho. Salvar disponibiliza imediatamente os horários no Firestore.</p><div class="day-tabs" id="staffDayTabs">'+days.map(d=>'<button type="button" class="day-tab" data-day-date="'+d.date+'">'+esc(d.label)+'</button>').join('')+'</div><div id="staffDayHours"></div>';
 async function showDate(date){
  selectedDate=date;
  container.querySelectorAll('[data-day-date]').forEach(b=>{const active=b.dataset.dayDate===date;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active))});
  const target=el('staffDayHours');target.innerHTML='<p>Carregando horários...</p>';
  try{
   const [day,week]=await Promise.all([api('/api/data?collection=daySchedule&barberId='+encodeURIComponent(barberId)+'&date='+date),api('/api/data?collection=weeklySchedule&barberId='+encodeURIComponent(barberId))]);
   if(selectedDate!==date||!el('staffDayHours'))return;
   const weekday=new Date(date+'T12:00:00Z').getUTCDay();
   const selectedHours=day.configured?day.hours:(week.days?.[weekday]||[]);
   target.innerHTML='<h4>Horários de '+esc(days.find(d=>d.date===date)?.label||date)+'</h4><div class="weekly-hours">'+Array.from({length:16},(_,n)=>{const hour=String(n+6).padStart(2,'0')+':00';const active=selectedHours.includes(hour);return '<button type="button" class="weekly-hour '+(active?'selected':'')+'" data-hour="'+hour+'" aria-pressed="'+active+'">'+hour+'</button>'}).join('')+'</div><button id="saveDayHours" type="button">Salvar horários deste dia</button><p id="daySaveStatus" role="status"></p>';
   target.querySelectorAll('[data-hour]').forEach(b=>b.onclick=()=>{b.classList.toggle('selected');b.setAttribute('aria-pressed',String(b.classList.contains('selected')))});
   el('saveDayHours').onclick=async()=>{const button=el('saveDayHours');button.disabled=true;try{const hours=[...target.querySelectorAll('.weekly-hour.selected')].map(b=>b.dataset.hour);await api('/api/data?collection=daySchedule','POST',{barberId,date,hours});el('daySaveStatus').textContent=hours.length?'Horários salvos e disponíveis para os clientes.':'Dia salvo sem horários disponíveis.';}catch(err){el('daySaveStatus').textContent=err.message}finally{button.disabled=false}};
  }catch(err){target.innerHTML='<p>'+esc(err.message)+'</p>'}
 }
 container.querySelectorAll('[data-day-date]').forEach(b=>b.onclick=()=>showDate(b.dataset.dayDate));
 showDate(selectedDate);
}
function staff(){
 if(!barber()&&!admin()){home();return}
 shell('<section class="section"><div class="eyebrow">EQUIPE CASCADE</div><h2>Horários e atendimentos</h2><form id="slotForm" class="panel">'+(admin()?'<label>Barbeiro<select id="slotBarber">'+users.filter(x=>x.role==='barber').map(u=>'<option value="'+esc(u.id)+'">'+esc(u.name)+'</option>').join('')+'</select></label>':'')+'<label>Data<input id="slotDate" type="date" min="'+today()+'" required></label><label>Início<input id="slotTime" type="time" required></label><label>Duração (min)<input id="slotDuration" type="number" min="15" max="720" value="480" required></label><button>Disponibilizar horário</button></form><h3>Configurar horários por dia · próximos 7 dias</h3>'+(admin()?'<label>Escolha o barbeiro<select id="weeklyBarber">'+users.filter(x=>x.role==='barber').map(u=>'<option value="'+esc(u.id)+'">'+esc(u.name)+'</option>').join('')+'</select></label>':'')+'<div id="weeklyEditor" class="panel"></div><h3>Horários avulsos</h3><div id="slotList"></div><h3>Agendamentos</h3><div id="appointmentList"></div><p id="notice"></p></section>');
 weeklyEditor();if(el('weeklyBarber'))el('weeklyBarber').onchange=weeklyEditor;
 el('slotForm').onsubmit=async e=>{e.preventDefault();try{await data('slots','POST',{barberId:admin()?el('slotBarber').value:user.uid,date:el('slotDate').value,time:el('slotTime').value,duration:Number(el('slotDuration').value)});await reload();staff();message('Horário cadastrado')}catch(err){message(err.message)}};
 el('slotList').innerHTML=slots.filter(s=>admin()||s.barberId===user.uid).map(s=>'<div class="panel">'+esc(s.date)+' '+esc(s.time)+' · '+s.duration+'min <button class="secondary" data-slot="'+esc(s.id)+'" data-active="'+(s.active!==false)+'">'+(s.active!==false?'Desativar':'Ativar')+'</button></div>').join('');
 document.querySelectorAll('[data-slot]').forEach(b=>b.onclick=async()=>{try{await data('slots','PATCH',{active:b.dataset.active!=='true'},b.dataset.slot);await reload();staff()}catch(err){message(err.message)}});
 el('appointmentList').innerHTML=appointments.map(a=>'<div class="panel">'+esc(a.service)+' · '+esc(a.date)+' '+esc(a.time)+' · '+esc(a.status)+(a.status==='scheduled'?'<button data-complete="'+esc(a.id)+'">Concluir</button>':'')+'</div>').join('');
 document.querySelectorAll('[data-complete]').forEach(b=>b.onclick=async()=>{try{await data('appointments','PATCH',{status:'completed'},b.dataset.complete);await reload();staff()}catch(err){message(err.message)}});
}
window.addEventListener('hashchange',()=>{if(location.hash==='#configurar-administrador')ownerSetup()});
init().then(()=>{if(location.hash==='#configurar-administrador')ownerSetup()});
