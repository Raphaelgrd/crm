import { NextRequest } from "next/server";
import { getApps, initializeApp } from "firebase/app";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore/lite";

// Reçoit les formulaires du site netforce-defense.com (contact + investisseurs).
// Le serveur du site POST ici avec l'en-tête `x-webhook-secret`, qui doit
// correspondre à CONTACT_FORM_WEBHOOK_SECRET dans les variables Vercel.
// Un nouvel email crée un contact « Nouveau » ; un email déjà connu ajoute
// simplement une note dans sa timeline (pas de doublon).

export const runtime = "nodejs";

const APP_NAME = "webhook";

function db() {
  const app =
    getApps().find((a) => a.name === APP_NAME) ??
    initializeApp(
      {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      },
      APP_NAME,
    );
  return getFirestore(app);
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Sujet du formulaire → catégorie du CRM (le premier sujet reconnu l'emporte). */
const CATEGORY_BY_SUBJECT: Record<string, string> = {
  "Investissement & financement": "Investisseur",
  "Devenir distributeur": "Distributeur",
  "Devenir ambassadeur": "Ambassadeur",
  "Partenariat institutionnel": "Institutionnel",
  "Presse & médias": "Prospect",
  "Autre demande": "Prospect",
};

export async function POST(req: NextRequest) {
  const secret = process.env.CONTACT_FORM_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: "CONTACT_FORM_WEBHOOK_SECRET manquant" }, { status: 500 });
  }
  if (req.headers.get("x-webhook-secret") !== secret) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }

  const firstName = str(b.firstName);
  const lastName = str(b.lastName);
  const email = str(b.email).toLowerCase();
  const message = str(b.message);
  if (!firstName || !lastName || !email) {
    return Response.json({ error: "Prénom, nom et email obligatoires" }, { status: 400 });
  }

  const subjects = Array.isArray(b.subjects)
    ? b.subjects.filter((s): s is string => typeof s === "string")
    : [];
  const category =
    subjects.map((s) => CATEGORY_BY_SUBJECT[s]).find(Boolean) ?? "Prospect";
  const phone = str(b.phone);
  const company = str(b.companyName) || str(b.company);
  const amount = str(b.amount);
  // La page Investisseurs lit extra["Investissement"] comme un nombre entier.
  const amountDigits = amount.replace(/\D/g, "");
  const country = str(b.country);
  const city = str(b.city);
  const siret = str(b.siret).replace(/\s/g, "").slice(0, 14);
  const activities = str(b.activities).slice(0, 1000);
  // Provenance du visiteur (ex. « linkedin (social) »), envoyée par le site.
  const source = str(b.source).slice(0, 120);

  const note = [
    `Formulaire site web${subjects.length ? ` — ${subjects.join(", ")}` : ""}`,
    amount && `Montant : ${amount}`,
    city && `Ville : ${city}`,
    country && `Pays : ${country}`,
    siret && `SIRET : ${siret}`,
    activities && `Activités : ${activities}`,
    message,
  ]
    .filter(Boolean)
    .join("\n");

  const now = new Date().toISOString();
  const firestore = db();

  try {
    const existing = await getDocs(
      query(collection(firestore, "contacts"), where("email", "==", email), limit(1)),
    );

    let contactId: string;
    let created = false;
    if (existing.empty) {
      contactId = makeId("c");
      const extra: Record<string, string> = { Source: "Site web" };
      if (source) extra["Provenance"] = source;
      if (subjects.length) extra["Sujets"] = subjects.join(", ");
      if (amountDigits) extra["Investissement"] = amountDigits;
      if (city) extra["Ville"] = city;
      if (siret) extra["SIRET"] = siret;
      if (activities) extra["Activités"] = activities;
      if (typeof b.consent === "boolean") extra["Consentement"] = b.consent ? "Oui" : "Non";
      await setDoc(doc(firestore, "contacts", contactId), {
        id: contactId,
        firstName,
        lastName,
        email,
        phone,
        company,
        category,
        stage: "Nouveau",
        notes: note,
        tags: source ? ["Site web", `Via ${source.split(" ")[0]}`] : ["Site web"],
        extra,
        ...(country ? { country } : {}),
        createdAt: now,
        updatedAt: now,
      });
      created = true;
    } else {
      const found = existing.docs[0];
      contactId = found.id;
      const patch: Record<string, unknown> = { updatedAt: now };
      const data = found.data();
      if (!data.phone && phone) patch.phone = phone;
      if (!data.company && company) patch.company = company;
      if (amountDigits && !data.extra?.["Investissement"]) {
        patch["extra.Investissement"] = amountDigits;
      }
      if (siret && !data.extra?.["SIRET"]) patch["extra.SIRET"] = siret;
      if (activities && !data.extra?.["Activités"]) patch["extra.Activités"] = activities;
      await updateDoc(found.ref, patch);
    }

    const activityId = makeId("a");
    await setDoc(doc(firestore, "activities", activityId), {
      id: activityId,
      contactId,
      type: "note",
      text: note,
      at: now,
      auto: true,
      createdAt: now,
      updatedAt: now,
    });

    return Response.json({ ok: true, id: contactId, created }, { status: created ? 201 : 200 });
  } catch (err) {
    console.error("[webhook contact-form]", err);
    return Response.json({ error: "Écriture Firestore impossible" }, { status: 500 });
  }
}
