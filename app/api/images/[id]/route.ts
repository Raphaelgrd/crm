import { NextRequest } from "next/server";
import { doc, getDoc } from "firebase/firestore/lite";
import { crmDb } from "@/lib/server/db";

// Sert publiquement une image de la banque (utilisable dans les emails).
// Les ids sont aléatoires et le contenu ne change jamais : cache permanent.

export const runtime = "nodejs";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^img_[a-z0-9]{8,30}$/.test(id)) return new Response("Introuvable", { status: 404 });
  const snap = await getDoc(doc(await crmDb(), "image_blobs", id));
  const data = snap.data() as { mime?: string; data?: string } | undefined;
  if (!data?.data || !ALLOWED.has(data.mime ?? "")) return new Response("Introuvable", { status: 404 });
  return new Response(Buffer.from(data.data, "base64"), {
    headers: {
      "Content-Type": data.mime!,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
