// Règles Firestore du projet crm-netforce : copie exacte de firebase/crm.firestore.rules (à garder identiques).
export const CRM_RULES = "rules_version = '2';\n\n// Projet crm-netforce. Seules les sessions ouvertes par le serveur du CRM\n// (/api/auth/crm-token, jeton portant crm: true) peuvent lire ou \u00e9crire.\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if request.auth != null && request.auth.token.crm == true;\n    }\n  }\n}\n";

const norm = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\s+/g, " ").trim();
/** Les règles publiées sont-elles les mêmes que celles du CRM (commentaires et espaces ignorés) ? */
export const sameRules = (published: string) => norm(published) === norm(CRM_RULES);
