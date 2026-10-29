import { NextRequest } from "next/server";
import { doc, setDoc } from "firebase/firestore/lite";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { crmDb } from "@/lib/server/db";
import { checkContractFile, fillContract, findContract, loadContractFile, readContractBody } from "@/lib/server/contracts";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Importe (ou remplace) le modèle PDF d'un contrat. Réservé aux admins. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  if (!user.isAdmin) return Response.json({ error: "Seul un admin peut changer le modèle." }, { status: 403 });
  const contract = findContract((await params).id);
  if (!contract) return Response.json({ error: "Contrat inconnu." }, { status: 404 });
  const { pdfBase64 } = (await req.json()) as { pdfBase64?: string };
  // Un document Firestore est limité à 1 Mo.
  if (!pdfBase64 || pdfBase64.length > 900_000) return Response.json({ error: "PDF manquant ou trop lourd (650 Ko max)." }, { status: 400 });
  const bytes = new Uint8Array(Buffer.from(pdfBase64, "base64"));
  if (Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") return Response.json({ error: "Ce fichier n'est pas un PDF." }, { status: 400 });
  const problem = await checkContractFile(contract, bytes);
  if (problem) return Response.json({ error: problem }, { status: 422 });
  await setDoc(doc(await crmDb(), "contract_files", contract.id), {
    id: contract.id,
    data: pdfBase64,
    uploadedAt: new Date().toISOString(),
    uploadedBy: user.email,
  }, { merge: true });
  return Response.json({ ok: true });
}

/** Aperçu du contrat rempli, avant envoi. */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!(await verifyCrmUser(req))) return unauthorized();
  const parsed = readContractBody({ ...((await req.json()) as Record<string, unknown>), contractId: (await params).id });
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  const template = await loadContractFile(parsed.contract.id);
  if (!template) return Response.json({ error: "Modèle PDF pas encore importé." }, { status: 404 });
  const pdf = await fillContract(parsed.contract, template, parsed.data);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" } });
}
