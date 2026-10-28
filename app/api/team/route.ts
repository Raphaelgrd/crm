import { NextRequest } from "next/server";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { rapportAdminApp } from "@/lib/server/admin";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { MEMBERS_CUTOFF, isOwnerEmail } from "@/lib/owners";

// Gestion de l'équipe (admins uniquement) : liste de tous les comptes Firebase et création de comptes.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  const app = rapportAdminApp();
  if (!app) return { error: Response.json({ error: "Compte de service non configuré." }, { status: 503 }) };
  const user = await verifyCrmUser(req);
  if (!user) return { error: unauthorized() };
  if (!user.isAdmin) return { error: Response.json({ error: "Réservé aux admins." }, { status: 403 }) };
  return { app };
}

export async function GET(req: NextRequest) {
  const r = await requireAdmin(req);
  if (r.error) return r.error;
  const auth = getAuth(r.app);
  const records: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    records.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);

  const docs = await getFirestore(r.app).collection("users").get();
  const byUid = new Map(docs.docs.map((d) => [d.id, d.data()]));

  const members = records.map((u) => {
    const d = byUid.get(u.uid) ?? {};
    const createdAt = new Date(u.metadata.creationTime).toISOString();
    const isOwner = isOwnerEmail(u.email);
    const isAdmin = isOwner || d.isAdmin === true;
    const isBot = d.isBot === true;
    return {
      uid: u.uid,
      name: (d.name as string) || u.displayName || u.email?.split("@")[0] || "?",
      email: u.email ?? "",
      isOwner,
      isAdmin,
      isBot,
      member: !isBot && d.disabled !== true && (isAdmin || d.member === true || createdAt < MEMBERS_CUTOFF),
      createdAt,
      lastSignIn: u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).toISOString() : null,
    };
  });
  return Response.json({ members });
}

export async function POST(req: NextRequest) {
  const r = await requireAdmin(req);
  if (r.error) return r.error;
  const b = (await req.json()) as { name?: string; email?: string; password?: string; isAdmin?: boolean };
  const name = (b.name ?? "").trim();
  const email = (b.email ?? "").trim().toLowerCase();
  const password = b.password ?? "";
  if (!name || !email || password.length < 6) {
    return Response.json({ error: "Prénom, email et mot de passe (6 caractères min.) obligatoires." }, { status: 400 });
  }
  try {
    const user = await getAuth(r.app).createUser({ email, password, displayName: name });
    await getFirestore(r.app).collection("users").doc(user.uid).set({
      name,
      email,
      validators: ["Laurent", "Sébastien"],
      isAdmin: b.isAdmin === true,
      member: true,
      createdAt: new Date().toISOString(),
    });
    return Response.json({ uid: user.uid });
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    const msg =
      code === "auth/email-already-exists"
        ? "Ce compte existe déjà : il apparaît dans la liste."
        : code === "auth/invalid-email"
          ? "Email invalide."
          : "Création impossible.";
    return Response.json({ error: msg }, { status: 400 });
  }
}
