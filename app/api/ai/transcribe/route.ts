import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";
import { apiKeyOk } from "@/lib/server/apiKey";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  // Le CRM envoie le jeton de l'utilisateur ; l'extension Chrome envoie la clé d'API (x-api-key).
  if (!apiKeyOk(req, { allowBearer: false }) && !(await verifyCrmUser(req))) return unauthorized();

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: "Clé GROQ_API_KEY manquante." }, { status: 500 });

  const formData = await req.formData();
  const audio = formData.get("audio") as Blob | null;
  if (!audio) return Response.json({ error: "Fichier audio manquant." }, { status: 400 });
  if (audio.size > MAX_AUDIO_BYTES) return Response.json({ error: "Fichier audio trop lourd (25 Mo max)." }, { status: 413 });

  const fd = new FormData();
  fd.append("file", audio, "audio.webm");
  fd.append("model", "whisper-large-v3-turbo");
  fd.append("language", "fr");
  fd.append("response_format", "json");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: `Groq Whisper : ${err}` }, { status: 502 });
  }

  const data = (await res.json()) as { text?: string };
  return Response.json({ text: data.text ?? "" });
}
