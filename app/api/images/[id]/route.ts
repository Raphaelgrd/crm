import { NextRequest } from "next/server";
import { store } from "@/lib/server/store";

// Sert publiquement une image de la banque (utilisable dans les emails).
// Les ids sont aléatoires et le contenu ne change jamais : cache permanent.

export const runtime = "nodejs";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^img_[a-z0-9]{8,30}$/.test(id)) return new Response("Introuvable", { status: 404 });
  const data = (await (await store()).get("image_blobs", id)) as { mime?: string; data?: string } | null;
  if (!data?.data || !ALLOWED.has(data.mime ?? "")) return new Response("Introuvable", { status: 404 });
  return new Response(Buffer.from(data.data, "base64"), {
    headers: {
      "Content-Type": data.mime!,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
