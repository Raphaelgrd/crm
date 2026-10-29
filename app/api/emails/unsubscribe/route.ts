import { NextRequest, NextResponse } from "next/server";
import { escapeHtml } from "@/lib/escapeHtml";
import { emailFromToken, unsubscribe } from "@/lib/server/unsubscribe";

export const runtime = "nodejs";

// Lien « Se désabonner » des emails du CRM.
// GET affiche une confirmation (les antivirus de messagerie ouvrent les liens : un simple clic ne doit rien enregistrer),
// POST enregistre — y compris le désabonnement en un clic de Gmail / Outlook (en-tête List-Unsubscribe-Post).

function page(title: string, text: string, form = "") {
  return new NextResponse(
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a}
.box{text-align:center;padding:40px 24px;max-width:420px}h1{font-size:1.4rem;margin:0 0 12px}p{color:#475569;line-height:1.5}
button{margin-top:16px;background:#0f172a;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:15px;cursor:pointer}</style>
</head><body><div class="box"><h1>${title}</h1><p>${text}</p>${form}</div></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
      },
    },
  );
}

const invalid = () => page("Lien invalide", "Ce lien de désabonnement n'est pas valide. Répondez simplement à l'email pour demander votre désabonnement.");

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const email = emailFromToken(token);
  if (!email) return invalid();
  return page(
    "Se désabonner",
    `Ne plus recevoir d'emails de Netforce à l'adresse <strong>${escapeHtml(email)}</strong> ?`,
    `<form method="post" action="?token=${encodeURIComponent(token)}"><button type="submit">Confirmer le désabonnement</button></form>`,
  );
}

export async function POST(req: NextRequest) {
  const email = emailFromToken(req.nextUrl.searchParams.get("token") ?? "");
  if (!email) return invalid();
  const oneClick = (await req.text()).includes("List-Unsubscribe=One-Click");
  try {
    await unsubscribe(email, oneClick ? "one-click" : "lien");
  } catch (e) {
    console.error("[unsubscribe]", e);
    return page("Erreur", "Le désabonnement n'a pas pu être enregistré. Réessayez dans un instant, ou répondez à l'email.");
  }
  return page("Désabonnement confirmé", `${escapeHtml(email)} ne recevra plus d'emails de Netforce.`);
}
