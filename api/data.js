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
const error=e=>{console.error('Cascade API',e.code||e.message);return 'Erro ao processar solicitação'};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(!['GET','POST','PATCH','DELETE'].includes(req.method))return bad(res,405,'Método inválido');
  if(req.method!=='GET'&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return bad(res,403,'Origem inválida');
  const uid=session(req);if(!uid)return bad(res,401,'Entre na conta');
  const mine=await db.collection('users').doc(uid).get();if(!mine.exists)return bad(res,401,'Conta não encontrada');
  const me=mine.data(),isAdmin=me.isAdmin===true&&me.role==='admin',isBarber=me.role==='barber';
  const col=req.query.collection,id=req.query.id;
  if(!['users','services','slots','appointments'].includes(col))return bad(res,400,'Coleção inválida');
  const ref=db.collection(col),body=req.body||{};
  if(req.method==='GET'){
   if(id){const d=await ref.doc(id).get();if(!d.exists)return bad(res,404,'Não encontrado');const x=d.data();if(col==='users'&&!isAdmin&&id!==uid&&x.role!=='barber')return bad(res,403,'Acesso negado');if(col==='appointments'&&!isAdmin&&x.clientId!==uid&&x.barberId!==uid)return bad(res,403,'Acesso negado');return res.json({id:d.id,...clean(x)})}
   if(col==='users'&&isAdmin){const docs=await ref.limit(500).get();return res.json(docs.docs.map(d=>({id:d.id,...clean(d.data())})))}
   let q=ref;if(col==='users')q=q.where('role','==','barber');
   if(col==='appointments'&&!isAdmin)q=q.where(isBarber?'barberId':'clientId','==',uid);
   const docs=await q.limit(500).get();return res.json(docs.docs.map(d=>({id:d.id,...clean(d.data())})));
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
    if(typeof slotId!=='string'||!validTime(time)||typeof serviceId!=='string')return bad(res,400,'Dados inválidos');
    const slotRef=db.collection('slots').doc(slotId),serviceRef=db.collection('services').doc(serviceId),appointmentRef=ref.doc();
    await db.runTransaction(async tx=>{
     const [slot,service]=await Promise.all([tx.get(slotRef),tx.get(serviceRef)]);
     if(!slot.exists||!service.exists||slot.data().active===false||service.data().active===false)throw Error('Serviço ou horário indisponível');
     const s=slot.data(),v=service.data(),start=minutes(time),duration=v.duration;
     if(start<minutes(s.time)||start+duration>minutes(s.time)+s.duration)throw Error('Horário incompatível');
     const locks=Array.from({length:Math.ceil(duration/5)},(_,i)=>db.collection('bookingLocks').doc(s.barberId+'_'+s.date+'_'+(start+i*5)));
     const docs=await Promise.all(locks.map(x=>tx.get(x)));if(docs.some(x=>x.exists))throw Error('Horário ocupado');
     tx.create(appointmentRef,{clientId:uid,barberId:s.barberId,slotId,date:s.date,time,service:v.name,price:me.clubActive===true&&me.club==='cabelo'&&v.name==='Corte'?0:v.price,duration,status:'scheduled',createdAt:admin.firestore.FieldValue.serverTimestamp()});
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
     tx.update(d.ref,{status});
     if(status==='cancelled'){const start=minutes(x.time);const locks=Array.from({length:Math.ceil(x.duration/5)},(_,i)=>db.collection('bookingLocks').doc(x.barberId+'_'+x.date+'_'+(start+i*5)));for(const l of locks){const snap=await tx.get(l);if(snap.exists&&snap.data().appointmentId===id)tx.delete(l)}}
    });return res.json({ok:true});
   }
  }
  return bad(res,403,'Operação não permitida');
 }catch(e){return bad(res,e.message==='Horário ocupado'||e.message==='Horário incompatível'||e.message==='Agendamento já atualizado'?409:500,error(e))}
}
