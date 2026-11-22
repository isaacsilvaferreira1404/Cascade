import admin from 'firebase-admin';
const email='isaacsilvaferreira1234@gmail.com';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  try{
    if(!admin.apps.length){
      const credentials=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if(!credentials)return res.status(503).json({error:'Servidor não configurado'});
      admin.initializeApp({credential:admin.credential.cert(JSON.parse(credentials))});
    }
    const token=(req.headers.authorization||'').match(/^Bearer (.+)$/)?.[1];
    if(!token)return res.status(401).json({error:'Faça login primeiro'});
    const identity=await admin.auth().verifyIdToken(token,true);
    if(identity.email?.toLowerCase()!==email)return res.status(403).json({error:'Conta não autorizada'});
    if(identity.email_verified!==true)return res.status(403).json({error:'Verifique seu e-mail antes de ativar o administrador'});
    const ref=admin.firestore().collection('users').doc(identity.uid);
    await admin.firestore().runTransaction(async tx=>{
      const snapshot=await tx.get(ref);
      tx.set(ref,{email,name:snapshot.data()?.name||identity.name||'Administrador',role:'admin',isAdmin:true,phone:snapshot.data()?.phone||'',club:snapshot.data()?.club||'none',clubActive:snapshot.data()?.clubActive===true},{merge:true});
    });
    return res.json({ok:true});
  }catch(err){console.error('admin bootstrap',err.code||err.message);return res.status(401).json({error:'Não foi possível validar a conta. Entre novamente.'})}
}
