import {getApps, initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";

const projectId = process.env.GCLOUD_PROJECT?.trim();
const email = process.argv[2]?.trim().toLowerCase();

if (projectId !== "seolleda-dev") {
  console.error("Defina GCLOUD_PROJECT=seolleda-dev. Este script é restrito ao ambiente de homologação.");
  process.exit(2);
}
if (!email || !email.includes("@")) {
  console.error("Uso: node functions/scripts/bootstrap-master.mjs <email>");
  process.exit(2);
}

if (!getApps().length) initializeApp({projectId});
const auth = getAuth();
const user = await auth.getUserByEmail(email);
const nextClaims = {...(user.customClaims ?? {}), roles: ["master"]};
delete nextClaims.admin;
delete nextClaims.storeIds;
await auth.setCustomUserClaims(user.uid, nextClaims);
await auth.revokeRefreshTokens(user.uid);
console.log(JSON.stringify({projectId, uid: user.uid, email: user.email, roles: ["master"]}));
