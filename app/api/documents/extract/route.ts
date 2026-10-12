export const runtime = "nodejs";

import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const { file, mimeType } = (await req.json()) as {
    file: string; // base64
    mimeType: string;
  };

  if (!file) {
    return Response.json({ error: "Fichier manquant." }, { status: 400 });
  }

  const buffer = Buffer.from(file, "base64");

  try {
    // DOCX
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword"
    ) {
      const mammoth = await import("mammoth");
      const result = await mammoth.default.extractRawText({ buffer });
      return Response.json({ text: result.value.trim() });
    }

    // PDF — import from lib path to avoid Next.js test-file issue
    if (mimeType === "application/pdf") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
        buf: Buffer,
      ) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      return Response.json({ text: result.text.trim() });
    }

    return Response.json({ error: "Format non supporté (DOCX ou PDF uniquement)." }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur extraction";
    return Response.json({ error: msg }, { status: 500 });
  }
}
