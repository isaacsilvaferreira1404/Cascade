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
  });
  return res.status(201).json({ok:true,message:'Administrador criado. Entre com seu e-mail e nova senha.'});
 }catch(e){console.error('owner setup',e.code||e.message);return res.status(e.message==='A ativação já foi concluída'?409:500).json({error:e.message==='A ativação já foi concluída'?e.message:'Não foi possível ativar'})}
}
