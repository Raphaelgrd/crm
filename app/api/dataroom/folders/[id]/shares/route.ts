import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { listFolders, listShares, storageError, type ShareRecord } from "@/lib/server/dataroom";
import { SHARE_DURATIONS, createGuestShare } from "@/lib/server/shares";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function adminAndFolder(req: NextRequest, ctx: Ctx) {
  const user = await verifyCrmUser(req);
  if (!user) return { res: unauthorized() };
  if (!user.isAdmin) return { res: Response.json({ error: "Seul un admin peut partager une Data Room." }, { status: 403 }) };
  const id = (await ctx.params).id;
  const found = (await listFolders()).find((f) => f.id === id);
  if (!found) return { res: Response.json({ error: "Data Room introuvable." }, { status: 404 }) };
  return { user, folder: found };
}

const publicShare = (s: ShareRecord) => ({
  id: s.id,
  email: s.email,
  expiresAt: s.expiresAt,
  createdAt: s.createdAt,
  createdBy: s.createdBy,
  activatedAt: s.activatedAt ?? null,
  lastOpenedAt: s.lastOpenedAt ?? null,
  opens: s.opens ?? 0,
});

/** Invités de la Data Room (partages actifs, les plus récents d'abord). */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const r = await adminAndFolder(req, ctx);
    if ("res" in r) return r.res;
    const now = Date.now();
    const shares = (await listShares())
      .filter((s) => s.folderId === r.folder.id && !s.revoked && new Date(s.expiresAt).getTime() > now)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(publicShare);
    return Response.json({ shares });
  } catch (e) {
    return storageError(e);
  }
}

/** Partage la Data Room avec une adresse email pour une durée limitée, et envoie le lien. */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const r = await adminAndFolder(req, ctx);
    if ("res" in r) return r.res;
    const b = (await req.json()) as { email?: unknown; days?: unknown; message?: unknown; senderName?: unknown };
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    const days = Number(b.days);
    const message = typeof b.message === "string" ? b.message.trim().slice(0, 1000) : "";
    const senderName = (typeof b.senderName === "string" && b.senderName.trim().slice(0, 60)) || "L'équipe Netforce";
    if (!EMAIL.test(email)) return Response.json({ error: "Adresse email invalide." }, { status: 400 });
    if (!SHARE_DURATIONS.includes(days)) return Response.json({ error: "Durée invalide." }, { status: 400 });

    const { share, url, emailed, emailError } = await createGuestShare({
      folder: r.folder,
      email,
      days,
      message,
      senderName,
      senderEmail: r.user.email,
    });
    return Response.json({ share: publicShare(share), url, emailed, emailError });
  } catch (e) {
    return storageError(e);
  }
}
