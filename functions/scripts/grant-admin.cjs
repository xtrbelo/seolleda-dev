const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error("Uso: npm run grant-admin -- usuario@exemplo.com");
  process.exitCode = 1;
} else {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GCLOUD_PROJECT || "seolleda-dev",
  });

  getAuth()
    .getUserByEmail(email)
    .then(async (existingUser) => {
      let user = existingUser;
      if (!user.emailVerified) {
        user = await getAuth().updateUser(user.uid, { emailVerified: true });
        console.log(`E-mail verificado para ${email}.`);
      }
      await getAuth().setCustomUserClaims(user.uid, {
        ...user.customClaims,
        admin: true,
      });
      console.log(`Acesso administrativo concedido a ${email}.`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
