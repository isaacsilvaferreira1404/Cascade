const admin=require('firebase-admin');
const email='isaacsilvaferreira1234@gmail.com';
if(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON)throw Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON secret');
admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
(async()=>{const user=await admin.auth().getUserByEmail(email);await admin.firestore().doc('users/'+user.uid).set({email,name:user.displayName||'Administrador Cascade',role:'client',isAdmin:true,club:'none',clubActive:false},{merge:true});console.log('Admin configured for UID '+user.uid+'. Firestore isAdmin=true; refresh the site.');})().catch(e=>{console.error(e.message);process.exitCode=1});
