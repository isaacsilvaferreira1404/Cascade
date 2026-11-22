import admin from 'firebase-admin';
import {createHmac,timingSafeEqual} from 'node:crypto';
if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db=admin.firestore();
const bad=(res,status,error)=>res.status(status).json({error});
function session(req){const secret=process.env.SESSION_SECRET;const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('cascade_session='))?.slice(16);if(!secret||!value)return null;const i=value.lastIndexOf('.');if(i<0)return null;const payload=value.slice(0,i),sig=value.slice(i+1),expected=createHmac('sha256',secret).update(payload).digest('base64url');if(sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;try{const d=JSON.parse(Buffer.from(payload,'base64url'));return d.exp>Date.now()?d.uid:null}catch{return null}}
const clean=d=>{const {passwordHash,...rest}=d;return rest};
const validTime=t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d);
const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
const clubCovers=(member,service)=>{
 if(member?.clubActive!==true)return false;
 const name=String(service||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const cut=name==='corte',beard=name==='barba'||name==='barba desenhada',combo=name==='corte e barba'||name==='corte + barba';
 if(member.club==='cabelo')return cut;
 if(member.club==='barba')return beard;
 if(member.club==='completo')return cut||beard||combo;
 return false;
};
const error=e=>{console.error('Cascade API',e.code||e.message);return 'Erro ao processar solicitação'};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(!['GET','POST','PATCH','DELETE','PUT'].includes(req.method))return bad(res,405,'Método inválido');
  if(req.method!=='GET'&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return bad(res,403,'Origem inválida');
  const uid=session(req);if(!uid)return bad(res,401,'Entre na conta');
  const mine=await db.collection('users').doc(uid).get();if(!mine.exists)return bad(res,401,'Conta não encontrada');
  const me=mine.data(),isAdmin=me.isAdmin===true&&me.role==='admin',isBarber=me.role==='barber';
  const col=req.query.collection,id=req.query.id;
  if(!['users','services','slots','appointments','availability','weeklySchedule','daySchedule'].includes(col))return bad(res,400,'Coleção inválida');
  const ref=db.collection(col),body=req.body||{};
  if(col==='daySchedule'){
   const target=req.method==='GET'?req.query.barberId:body.barberId;
   const date=req.method==='GET'?req.query.date:body.date;
   if(typeof target!=='string'||target.length>150||!validDate(date))return bad(res,400,'Barbeiro e data obrigatórios');
   const barberDoc=await db.collection('users').doc(target).get();
   if(!barberDoc.exists||barberDoc.data().role!=='barber')return bad(res,404,'Barbeiro não encontrado');
   const scheduleRef=db.collection('daySchedules').doc(target+'_'+date);
   if(req.method==='GET'){
    const snap=await scheduleRef.get();
    return res.json({barberId:target,date,hours:snap.exists?snap.data().hours:[],configured:snap.exists});
   }
   if(req.method==='POST'||req.method==='PUT'){
    if(!isAdmin&&(!isBarber||uid!==target))return bad(res,403,'Sem permissão');
    if(!Array.isArray(body.hours)||body.hours.length>24||body.hours.some(h=>!validTime(h)||minutes(h)%60!==0))return bad(res,400,'Horários inválidos');
    await scheduleRef.set({barberId:target,date,hours:[...new Set(body.hours)].sort(),updatedAt:admin.firestore.FieldValue.serverTimestamp()});
    return res.json({ok:true});
   }
  }
  if(col==='weeklySchedule'){
   if(req.method==='GET'){
    const target=req.query.barberId||uid;
    const profile=await db.collection('users').doc(target).get();
    if(!profile.exists||profile.data().role!=='barber')return bad(res,404,'Barbeiro não encontrado');
    const doc=await db.collection('weeklySchedules').doc(target).get();
    return res.json({barberId:target,days:doc.data()?.days||{}});
   }
   if(req.method==='PUT'||req.method==='POST'){
    if(!isAdmin&&!isBarber)return bad(res,403,'Apenas equipe');
    const target=body.barberId||uid;
    if(!isAdmin&&target!==uid)return bad(res,403,'Sem permissão');
    const profile=await db.collection('users').doc(target).get();
    if(!profile.exists||profile.data().role!=='barber')return bad(res,404,'Barbeiro não encontrado');
    const days=body.days;
    if(!days||typeof days!=='object'||Array.isArray(days)||Object.keys(days).some(k=>!/^[0-6]$/.test(k)))return bad(res,400,'Semana inválida');
    const cleaned={};
    for(let day=0;day<7;day++){
     const hours=days[day]||[];
     if(!Array.isArray(hours)||hours.length>24||hours.some(t=>!validTime(t)||minutes(t)%60!==0))return bad(res,400,'Horários inválidos');
     cleaned[day]=[...new Set(hours)].sort();
    }
    await db.collection('weeklySchedules').doc(target).set({barberId:target,days:cleaned,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
    return res.json({ok:true});
   }
  }
  if(col==='availability'&&req.method==='GET'){
   const barberId=req.query.barberId,date=req.query.date,serviceId=req.query.serviceId;
   if(typeof barberId!=='string'||barberId.length>150||!validDate(date)||typeof serviceId!=='string'||serviceId.length>150)return bad(res,400,'Selecione barbeiro, data e procedimento');
   const [service,barber,windows,appointmentsForDay]=await Promise.all([
    db.collection('services').doc(serviceId).get(),
    db.collection('users').doc(barberId).get(),
    db.collection('slots').where('barberId','==',barberId).get(),
    db.collection('appointments').where('barberId','==',barberId).get()
   ]);
   if(!service.exists||service.data().active===false||!barber.exists||barber.data().role!=='barber')return bad(res,404,'Procedimento ou barbeiro indisponível');
   const [weekly,daySchedule]=await Promise.all([db.collection('weeklySchedules').doc(barberId).get(),db.collection('daySchedules').doc(barberId+'_'+date).get()]);
   const weekday=new Date(date+'T12:00:00Z').getUTCDay();
   const weeklyHours=daySchedule.exists?(daySchedule.data()?.hours||[]):(weekly.data()?.days?.[weekday]||[]);
   const duration=Number(service.data().duration);
   const occupied=appointmentsForDay.docs.map(d=>d.data()).filter(a=>a.date===date&&a.status!=='cancelled').map(a=>({start:minutes(a.time),end:minutes(a.time)+Number(a.duration||0)})).sort((a,b)=>a.start-b.start);
   const todayBR=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const nowBR=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
   const output=[],seen=new Set();
   for(const w of windows.docs){
    const slot=w.data();if(slot.date!==date||slot.active===false||!validTime(slot.time))continue;
    const start=minutes(slot.time),end=start+Number(slot.duration);
    for(let t=Math.ceil(start/60)*60;t+duration<=end&&t<1440;t+=60){
     const collision=occupied.find(a=>t<a.end&&t+duration>a.start);
     if(collision)continue
     if(date>=todayBR&&(date!==todayBR||t>minutes(nowBR))){
      const time=String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
      if(!seen.has(time)){seen.add(time);output.push({slotId:w.id,time})}
     }
     }
   }
   for(const hour of weeklyHours){
    if(!validTime(hour)||minutes(hour)%60!==0)continue;
    const start=minutes(hour);
    if(occupied.some(a=>start<a.end&&start+duration>a.start))continue;
    if(date<todayBR||(date===todayBR&&start<=minutes(nowBR)))continue;
    const time=hour;
    if(!seen.has(time)){seen.add(time);output.push({slotId:'weekly:'+barberId+':'+date+':'+time,time})}
   }
   return res.json(output.sort((a,b)=>a.time.localeCompare(b.time)));
  }
  if(req.method==='GET'){
   if(id){const d=await ref.doc(id).get();if(!d.exists)return bad(res,404,'Não encontrado');const x=d.data();if(col==='users'&&!isAdmin&&id!==uid&&x.role!=='barber')return bad(res,403,'Acesso negado');if(col==='appointments'&&!isAdmin&&x.clientId!==uid&&x.barberId!==uid)return bad(res,403,'Acesso negado');return res.json({id:d.id,...clean(x)})}
   if(col==='users'&&isAdmin){const docs=await ref.limit(500).get();return res.json(docs.docs.map(d=>({id:d.id,...clean(d.data())})))}
   let q=ref;if(col==='users')q=q.where('role','==','barber');
   if(col==='appointments'&&!isAdmin)q=q.where(isBarber?'barberId':'clientId','==',uid);
   const docs=await q.limit(500).get();const rows=docs.docs.map(d=>({id:d.id,...clean(d.data())}));if(col==='appointments'&&(isAdmin||isBarber)){const missing=[...new Set(rows.filter(a=>!a.clientName&&a.clientId).map(a=>a.clientId))];const profiles=await Promise.all(missing.map(clientId=>db.collection('users').doc(clientId).get()));const names=new Map(profiles.map((p,i)=>[missing[i],p.exists?p.data().name:'Cliente']));return res.json(rows.map(a=>({...a,clientName:a.clientName||names.get(a.clientId)||'Cliente'})))}return res.json(rows);
  }
  if(col==='users'&&req.method==='PATCH'){
   if(id===uid&&typeof body.name==='string'&&body.name.trim().length>=2&&typeof body.phone==='string'&&body.phone.length<=20){await ref.doc(uid).update({name:body.name.trim().slice(0,80),phone:body.phone});return res.json({ok:true})}
   if(!isAdmin||!id||id===uid)return bad(res,403,'Sem permissão');
   const patch={};
   if(typeof body.isAdmin==='boolean'){patch.isAdmin=body.isAdmin;patch.role=body.isAdmin?'admin':body.role==='barber'?'barber':'client'}
   else if(['client','barber'].includes(body.role))patch.role=body.role;
   if(['none','cabelo','barba','completo'].includes(body.club))patch.club=body.club;
   if(typeof body.clubActive==='boolean')patch.clubActive=body.clubActive;
   if(validTime(body.workStart))patch.workStart=body.workStart;
   if(validTime(body.workEnd))patch.workEnd=body.workEnd;
   if(!Object.keys(patch).length)return bad(res,400,'Alteração inválida');
   await ref.doc(id).update(patch);return res.json({ok:true});
  }
  if(col==='services'){
   if(!isAdmin)return bad(res,403,'Apenas administradores');
   if(req.method==='DELETE'&&id){await ref.doc(id).delete();return res.json({ok:true})}
   const {name,price,duration,active}=body;
   if(typeof name!=='string'||name.trim().length<2||name.length>100||typeof price!=='number'||!Number.isFinite(price)||price<0||!Number.isInteger(duration)||duration<5||duration>480)return bad(res,400,'Serviço inválido');
   const value={name:name.trim(),price,duration,active:active!==false};
   if(req.method==='POST'){const d=await ref.add(value);return res.status(201).json({id:d.id})}
   if(req.method==='PATCH'&&id){await ref.doc(id).update(value);return res.json({ok:true})}
  }
  if(col==='slots'){
   if(!isAdmin&&!isBarber)return bad(res,403,'Apenas equipe');
   if(req.method==='POST'){
    const {barberId,date,time,duration}=body;
    if(!validDate(date)||!validTime(time)||!Number.isInteger(duration)||duration<15||duration>720)return bad(res,400,'Horário inválido');
    if(!isAdmin&&barberId!==uid)return bad(res,403,'Barbeiro inválido');
    const barber=await db.collection('users').doc(barberId).get();if(!barber.exists||barber.data().role!=='barber')return bad(res,400,'Barbeiro não encontrado');
    const d=await ref.add({barberId,date,time,duration,active:true,booked:false});return res.status(201).json({id:d.id});
   }
   if(req.method==='PATCH'&&id){
    const d=await ref.doc(id).get();if(!d.exists)return bad(res,404,'Horário inexistente');if(!isAdmin&&d.data().barberId!==uid)return bad(res,403,'Sem permissão');
    if(typeof body.active!=='boolean')return bad(res,400,'Status inválido');await d.ref.update({active:body.active});return res.json({ok:true});
   }
  }
  if(col==='appointments'){
   if(req.method==='POST'){
    const {slotId,time,serviceId}=body;
    if(typeof slotId!=='string'||!validTime(time)||minutes(time)%60!==0||typeof serviceId!=='string')return bad(res,400,'Dados inválidos');
    const weeklyMatch=/^weekly:([^:]+):(\\d{4}-\\d{2}-\\d{2}):(\\d{2}:\\d{2})$/.exec(slotId);
    const slotRef=weeklyMatch?null:db.collection('slots').doc(slotId),serviceRef=db.collection('services').doc(serviceId),appointmentRef=ref.doc();
    await db.runTransaction(async tx=>{
     const scheduleRef=weeklyMatch?db.collection('daySchedules').doc(weeklyMatch[1]+'_'+weeklyMatch[2]):null;
     const fallbackRef=weeklyMatch?db.collection('weeklySchedules').doc(weeklyMatch[1]):null;
     const [slot,service,fallback]=await Promise.all([tx.get(slotRef||scheduleRef),tx.get(serviceRef),fallbackRef?tx.get(fallbackRef):Promise.resolve(null)]);
     if((!slot.exists&&!weeklyMatch)||!service.exists||(!weeklyMatch&&slot.data().active===false)||service.data().active===false)throw Error('Serviço ou horário indisponível');
     let s=slot.data()||{},v=service.data(),start=minutes(time),duration=v.duration;
     if(weeklyMatch){
      const [barberId,date,hour]=weeklyMatch.slice(1);
      const day=new Date(date+'T12:00:00Z').getUTCDay();
      const allowed=slot.exists?s.hours:fallback?.data()?.days?.[day];
      if(time!==hour||!allowed?.includes(hour))throw Error('Horário não autorizado');
      s={barberId,date,time:hour,duration:60};
     }
     if(start<minutes(s.time)||(!weeklyMatch&&start+duration>minutes(s.time)+s.duration))throw Error('Horário incompatível');
     const locks=Array.from({length:Math.ceil(duration/5)},(_,i)=>db.collection('bookingLocks').doc(s.barberId+'_'+s.date+'_'+(start+i*5)));
     const docs=await Promise.all(locks.map(x=>tx.get(x)));if(docs.some(x=>x.exists))throw Error('Horário ocupado');
     tx.create(appointmentRef,{clientId:uid,clientName:me.name||'Cliente',clientPhone:me.phone||'',barberId:s.barberId,slotId,date:s.date,time,service:v.name,price:clubCovers(me,v.name)?0:v.price,clubCovered:clubCovers(me,v.name),duration,status:'scheduled',createdAt:admin.firestore.FieldValue.serverTimestamp()});
     locks.forEach((l,i)=>tx.create(l,{appointmentId:appointmentRef.id,barberId:s.barberId,date:s.date,clientId:uid,minute:start+i*5}));
    });return res.status(201).json({id:appointmentRef.id});
   }
   if(req.method==='PATCH'&&id){
    const d=await ref.doc(id).get();if(!d.exists)return bad(res,404,'Agendamento não encontrado');
    const x=d.data(),status=body.status;
    if(x.status!=='scheduled'||!['cancelled','completed'].includes(status))return bad(res,400,'Alteração inválida');
    if(status==='cancelled'&&!isAdmin&&x.clientId!==uid)return bad(res,403,'Sem permissão');
    if(status==='completed'&&!isAdmin&&x.barberId!==uid)return bad(res,403,'Sem permissão');
    await db.runTransaction(async tx=>{
     const latest=await tx.get(d.ref);if(latest.data()?.status!=='scheduled')throw Error('Agendamento já atualizado');
     let held=[];
     if(status==='cancelled'){const start=minutes(x.time);const locks=Array.from({length:Math.ceil(x.duration/5)},(_,i)=>db.collection('bookingLocks').doc(x.barberId+'_'+x.date+'_'+(start+i*5)));held=await Promise.all(locks.map(l=>tx.get(l)))}
     tx.update(d.ref,{status});
     held.forEach(snap=>{if(snap.exists&&snap.data().appointmentId===id)tx.delete(snap.ref)});
    });return res.json({ok:true});
   }
  }
  return bad(res,403,'Operação não permitida');
 }catch(e){return bad(res,['Horário ocupado','Horário incompatível','Agendamento já atualizado','Horário não autorizado','Serviço ou horário indisponível'].includes(e.message)?409:500,['Horário ocupado','Horário incompatível','Agendamento já atualizado','Horário não autorizado','Serviço ou horário indisponível'].includes(e.message)?e.message:error(e))}
}
