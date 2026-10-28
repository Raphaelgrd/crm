import { NextRequest, NextResponse } from "next/server";
import { escapeHtml } from "@/lib/escapeHtml";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return new NextResponse("Lien invalide.", { status: 400 });
  }

  try {
    const email = Buffer.from(token, "base64url").toString("utf-8");
    // TODO: stocker le désabonnement dans Firestore si nécessaire
    return new NextResponse(
      `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>Désabonnement</title>
      <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb}
      .box{text-align:center;padding:40px;max-width:400px}h1{font-size:1.5rem;color:#111}p{color:#555}</style>
      </head><body><div class="box">
      <h1>Désabonnement confirmé</h1>
      <p>${escapeHtml(email)} ne recevra plus d'emails de Netforce Défense.</p>
      </div></body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } }
    );
  } catch {
    return new NextResponse("Lien invalide.", { status: 400 });
  }
}
