// Versão funcional da fase. Atualizar junto com docs/CHANGELOG.md.
export const APP_VERSION = "1S";
const environmentLabel = import.meta.env.VITE_FIREBASE_PROJECT_ID === "seolleda-dev"
  ? "HML"
  : "Ambiente não configurado";
export const APP_VERSION_LABEL = `Seolleda · Versão ${APP_VERSION} · ${environmentLabel}`;
