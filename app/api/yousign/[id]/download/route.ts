import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { getRecord } from "@/lib/server/signatures";
import { YousignError, downloadSigned } from "@/lib/server/yousign";

export const runtime = "nodejs";

/** PDF signé, servi depuis Yousign. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  const rec = await getRecord((await params).id);
  if (!rec) return Response.json({ error: "Demande introuvable." }, { status: 404 });
  try {
    const res = await downloadSigned(rec.yousignId);
    return new Response(res.body, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/pdf",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return Response.json({ error: e instanceof YousignError ? e.message : "Téléchargement impossible." }, { status: 502 });
  }
}
