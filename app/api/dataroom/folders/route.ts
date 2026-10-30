import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { listFolders, saveFolder, storageError } from "@/lib/server/dataroom";

export const runtime = "nodejs";

/** Data Rooms visibles par le membre : publiques, partagées avec lui, ou toutes pour un admin. */
export async function GET(req: NextRequest) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  try {
    const email = user.email.toLowerCase();
    const folders = (await listFolders()).filter(
      (f) => user.isAdmin || f.visibility === "public" || f.sharedWith.map((e) => e.toLowerCase()).includes(email),
    );
    return Response.json({ folders });
  } catch (e) {
    return storageError(e);
  }
}

/** Crée une Data Room (admins). Sans effet si elle existe déjà. */
export async function POST(req: NextRequest) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  if (!user.isAdmin) return Response.json({ error: "Seul un admin peut créer une Data Room." }, { status: 403 });
  const { name } = (await req.json()) as { name?: unknown };
  const clean = typeof name === "string" ? name.trim().replace(/\//g, "-").slice(0, 120) : "";
  if (!clean) return Response.json({ error: "Nom manquant." }, { status: 400 });
  try {
    const existing = (await listFolders()).find((f) => f.name === clean);
    if (existing) return Response.json({ folder: existing });
    const folder = {
      id: `folder_${clean.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 40)}_${Date.now().toString(36)}`,
      name: clean,
      visibility: "public" as const,
      sharedWith: [],
      createdAt: new Date().toISOString(),
    };
    await saveFolder(folder);
    return Response.json({ folder });
  } catch (e) {
    return storageError(e);
  }
}
