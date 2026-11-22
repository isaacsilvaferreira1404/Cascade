import admin from 'firebase-admin';
import {scryptSync,randomBytes,timingSafeEqual,createHmac} from 'node:crypto';
const owner='isaacsilvaferreira1234@gmail.com';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Método inválido'});
 try{
  const {code,password,name}=req.body||{};
  const expected=process.env.OWNER_SETUP_CODE;
  if(!expected||typeof code!=='string'||code.length!==expected.length||!timingSafeEqual(Buffer.from(code),Buffer.from(expected)))return res.status(403).json({error:'Código de ativação inválido'});
  if(typeof password!=='string'||password.length<12||password.length>256)return res.status(400).json({error:'Use uma senha com pelo menos 12 caracteres'});
  if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
  const db=admin.firestore(),ref=db.collection('loginEmails').doc(owner),setup=db.collection('system').doc('ownerSetup');
  const salt=randomBytes(24).toString('hex'),passwordHash=salt+':'+scryptSync(password,salt,64).toString('hex');
  const uid='cascade-owner';
  await db.runTransaction(async tx=>{
   const done=await tx.get(setup),index=await tx.get(ref);
   if(done.exists||index.exists)throw Error('A ativação já foi concluída');
   tx.create(ref,{uid});
   tx.set(db.collection('users').doc(uid),{name:typeof name==='string'&&name.trim().length>1?name.trim().slice(0,80):'Administrador',email:owner,role:'admin',isAdmin:true,phone:'',club:'none',clubActive:false,passwordHash});
   tx.create(setup,{completedAt:admin.firestore.FieldValue.serverTimestamp()});
   const defaults=[['Corte',40,60],['Sobrancelha',10,10],['Corte + sobrancelha',50,60],['Barba desenhada',30,40],['Corte e barba',65,80],['Corte + barba + sobrancelha',70,80],['Penteado',30,30],['Luzes',80,30],['Platinado',125,30],['Relaxamento',30,15],['Botox',70,60],['Progressiva',80,90],['Nudreds',60,80],['Lavagem',20,10],['Skin care',25,30],['Pezinho',15,15],['Hidratação',25,20],['Dedoliss',35,30],['Coloração',35,40],['Fio a fio',110,60]];
   defaults.forEach(([name,price,duration])=>tx.create(db.collection('services').doc('default-'+name.toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9]+/g,'-')),{name,price,duration,active:true}));
  });
  return res.status(201).json({ok:true,message:'Administrador criado. Entre com seu e-mail e nova senha.'});
 }catch(e){console.error('owner setup',e.code||e.message);return res.status(e.message==='A ativação já foi concluída'?409:500).json({error:e.message==='A ativação já foi concluída'?e.message:'Não foi possível ativar'})}
}
