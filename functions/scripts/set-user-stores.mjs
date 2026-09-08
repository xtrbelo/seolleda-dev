import {getApps, initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";

const email = process.argv[2]?.trim().toLowerCase();
const storeIds = process.argv.slice(3).map((storeId) => storeId.trim()).filter(Boolean);
if (!email || !email.includes("@") || !storeIds.length || storeIds.length > 30 || storeIds.some((storeId) => !/^[A-Za-z0-9_-]{1,128}$/.test(storeId))) {
  console.error("Uso: node functions/scripts/set-user-stores.mjs <email> <storeId> [storeId ...]");
  process.exit(2);
}
if (!getApps().length) initializeApp({projectId: "seolleda-dev"});
const auth = getAuth();
const user = await auth.getUserByEmail(email);
const currentClaims = user.customClaims ?? {};
await auth.setCustomUserClaims(user.uid, {...currentClaims, storeIds});
console.log(JSON.stringify({projectId: "seolleda-dev", uid: user.uid, email: user.email, storeIds}));
