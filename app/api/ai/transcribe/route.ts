import { NextRequest } from "next/server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return Response.json({ error: "Clé GROQ_API_KEY manquante." }, { status: 500 });

  const formData = await req.formData();
  const audio = formData.get("audio") as Blob | null;
  if (!audio) return Response.json({ error: "Fichier audio manquant." }, { status: 400 });

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
  return Response.json({ text: data.text ?? "" }, { headers: CORS });
}
