import admin from 'firebase-admin';
import {scryptSync,randomBytes,timingSafeEqual,createHmac,randomUUID} from 'node:crypto';
const config=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const secret=process.env.SESSION_SECRET;
if(!config||!secret||secret.length<32)throw Error('Server credentials not configured');
if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(JSON.parse(config))});
const db=admin.firestore();
const sign=x=>createHmac('sha256',secret).update(x).digest('base64url');
const passwordHash=p=>{const salt=randomBytes(24).toString('hex');return salt+':'+scryptSync(p,salt,64).toString('hex')};
const check=(p,stored)=>{if(typeof stored!=='string')return false;const [salt,hash]=stored.split(':');if(!salt||!hash||hash.length!==128)return false;return timingSafeEqual(scryptSync(p,salt,64),Buffer.from(hash,'hex'))};
const session=uid=>{const x=Buffer.from(JSON.stringify({uid,exp:Date.now()+604800000})).toString('base64url');return x+'.'+sign(x)};
const cookie=(x,age)=>'cascade_session='+x+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age='+age;
const current=req=>{const v=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('cascade_session='))?.slice(16);if(!v)return null;const i=v.lastIndexOf('.');if(i<0)return null;const x=v.slice(0,i),sig=v.slice(i+1),expected=sign(x);if(sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;try{const obj=JSON.parse(Buffer.from(x,'base64url'));return obj.exp>Date.now()?obj.uid:null}catch{return null}};
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');const action=req.query.action;try{
if(req.method==='GET'&&action==='me'){const uid=current(req);if(!uid)return res.status(401).json({error:'Não autenticado'});const doc=await db.collection('users').doc(uid).get();if(!doc.exists)return res.status(401).json({error:'Conta não encontrada'});const {passwordHash,...data}=doc.data();return res.json({user:{uid,...data}})}
if(req.method==='POST'&&action==='logout'){res.setHeader('Set-Cookie',cookie('',0));return res.json({ok:true})}
if(req.method!=='POST')return res.status(405).end();
const {email,password,name}=req.body||{};if(typeof email!=='string'||typeof password!=='string'||email.length>254||password.length>256)return res.status(400).json({error:'Dados inválidos'});const normalized=email.trim().toLowerCase();
if(action==='register'){if(password.length<12||typeof name!=='string'||name.trim().length<2||name.length>80)return res.status(400).json({error:'Nome e senha de pelo menos 12 caracteres obrigatórios'});const uid=randomUUID(),index=db.collection('loginEmails').doc(normalized);await db.runTransaction(async tx=>{if((await tx.get(index)).exists)throw Error('E-mail já cadastrado');tx.create(index,{uid});tx.create(db.collection('users').doc(uid),{name:name.trim(),email:normalized,phone:'',role:'client',isAdmin:false,club:'none',clubActive:false,passwordHash:passwordHash(password)})});res.setHeader('Set-Cookie',cookie(session(uid),604800));return res.status(201).json({ok:true})}
if(action==='login'){const index=await db.collection('loginEmails').doc(normalized).get();const uid=index.data()?.uid;const doc=uid?await db.collection('users').doc(uid).get():null;if(!doc?.exists||!check(password,doc.data().passwordHash))return res.status(401).json({error:'Credenciais inválidas'});res.setHeader('Set-Cookie',cookie(session(uid),604800));return res.json({ok:true})}
return res.status(404).end()}catch(e){console.error(e.code||e.message);return res.status(e.message==='E-mail já cadastrado'?409:500).json({error:e.message==='E-mail já cadastrado'?e.message:'Erro no servidor'})}}
