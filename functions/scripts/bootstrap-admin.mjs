import {getApps, initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Uso: node functions/scripts/bootstrap-admin.mjs <email>");
  process.exit(2);
}

if (!getApps().length) initializeApp({projectId: "seolleda-dev"});
const auth = getAuth();
const user = await auth.getUserByEmail(email);
const currentClaims = user.customClaims ?? {};
await auth.setCustomUserClaims(user.uid, {...currentClaims, roles: ["admin"]});
console.log(JSON.stringify({projectId: "seolleda-dev", uid: user.uid, email: user.email, roles: ["admin"]}));
