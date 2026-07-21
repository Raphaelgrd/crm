# Netforce CRM — reconstruction

## D'où ça vient
Reconstruit à partir d'un export HTML ("Enregistrer la page complète") de
`https://netforce.vercel.app/templates`. Le fichier `.html` fourni contenait
le DOM déjà rendu (après JS), donc j'ai pu en extraire fidèlement :
- la sidebar (logo, nav, bouton créer, déconnexion)
- le header (recherche, notifications, menu utilisateur)
- la page **Templates** complète, avec les 4 vrais templates affichés

## Ce qui est fidèle vs. approximatif

✅ **Fidèle** (copié depuis le vrai DOM) :
- Structure HTML/JSX de la sidebar, du header, de la page Templates
- Classes Tailwind exactes
- Icônes Lucide exactes
- Nav complète : Dashboard, Contacts, Agenda, Closing, Projets, Mes tâches,
  Automatisations, Templates, Data Room, Paramètres
- Contenu réel des 4 templates (merci, email_signature, relance MOU EN/FR)

⚠️ **Approximatif** — le fichier CSS réel n'était pas dans l'export (seulement
les balises `<link>` qui pointent vers lui) :
- Les couleurs exactes (`--primary`, `--sidebar`, `--border`, etc. dans
  `app/globals.css`) sont des valeurs plausibles, pas les vraies. Ouvre les
  DevTools sur l'appli en ligne → `:root` dans l'onglet Computed → copie les
  vraies valeurs dedans. 5 minutes de travail pour un rendu pixel-perfect.

🧱 **Placeholders vides** (pas encore d'export HTML fourni) :
- `/dashboard`, `/contacts`, `/agenda`, `/closing`, `/projets`,
  `/projets/mes-taches`, `/automatisation`, `/data-room`, `/settings`
- Envoie-moi l'export HTML complet de chacune (avec des vraies données
  affichées, connecté à ton compte) et je les reconstruis à l'identique,
  une par une.

## Backend — à toi de jouer
Ce repo ne contient que le frontend. Comme tu as déjà :
- la base de données
- l'intégration Yousign
- (probablement) l'auth

... il faut créer les API routes / server actions dans `app/api/` ou en
server components pour reconnecter chaque page à tes vraies données. Le
composant `templates/page.tsx` a un commentaire à l'endroit exact où
brancher un `fetch` vers ta DB à la place des données de seed.

## Lancer le projet
```bash
npm install
npm run dev
```

## Déployer sur un nouveau Vercel
```bash
npx vercel
```
(ou connecte le repo GitHub directement depuis le dashboard Vercel)

## Prochaine étape recommandée
Envoie l'export HTML de `/dashboard` (la page la plus consultée) et on
continue la reconstruction page par page.
# crm
# crm
# crm
# crm
# crm
# crm
# crm
