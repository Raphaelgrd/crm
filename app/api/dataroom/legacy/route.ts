import { NextRequest } from "next/server";
import { unauthorized, verifyCrmUser } from "@/lib/server/auth";

// Import de la Data Room de l'ancien CRM (netforce.vercel.app).
// Ses fichiers sont dans le stockage Supabase (espace « data-room », chemins docs/<idDossier>/<uuid>-<nom>),
// les noms des dossiers dans sa base. Cette route liste le tout et renvoie des liens signés (1 h) :
// le navigateur télécharge chaque fichier puis le range dans la Data Room du CRM.
// Variables Vercel : OLD_SUPABASE_URL et OLD_SUPABASE_SERVICE_KEY (clé service_role, jamais côté client).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "data-room";

interface StorageItem {
  name: string;
  id: string | null;
  created_at?: string;
  metadata?: { size?: number; mimetype?: string } | null;
}

export interface LegacyFile {
  path: string;
  name: string;
  folder: string;
  size: number;
  mime: string;
  createdAt: string;
  url: string;
}

function config() {
  const url = process.env.OLD_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.OLD_SUPABASE_SERVICE_KEY;
  return url && key ? { url, key } : null;
}

async function sb<T>(cfg: { url: string; key: string }, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${cfg.url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} sur ${path.split("?")[0]} : ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** Liste récursive des fichiers de l'espace de stockage. */
async function listAll(cfg: { url: string; key: string }, prefix: string): Promise<(StorageItem & { path: string })[]> {
  const out: (StorageItem & { path: string })[] = [];
  for (let offset = 0; ; offset += 1000) {
    const items = await sb<StorageItem[]>(cfg, `/storage/v1/object/list/${BUCKET}`, {
      prefix,
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    for (const it of items) {
      if (it.name === ".emptyFolderPlaceholder") continue;
      const path = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null) out.push(...(await listAll(cfg, path)));
      else out.push({ ...it, path });
    }
    if (items.length < 1000) return out;
  }
}

const pick = (row: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (typeof row[k] === "string" && row[k]) return row[k] as string;
  return "";
};

/**
 * Noms lisibles depuis la base de l'ancien CRM : dossiers (id → nom) et fichiers (chemin → nom d'origine).
 * Les tables sont repérées par leur nom ; si la base n'est pas accessible, on garde les noms du stockage.
 */
async function readableNames(cfg: { url: string; key: string }, folderIds: Set<string>, paths: Set<string>) {
  const folders = new Map<string, string>();
  const files = new Map<string, string>();
  let tables: string[] = [];
  try {
    const spec = await sb<{ definitions?: Record<string, unknown>; paths?: Record<string, unknown> }>(cfg, "/rest/v1/");
    tables = Object.keys(spec.definitions ?? {});
  } catch {
    return { folders, files };
  }
  for (const table of tables) {
    const isFolder = /folder|dossier|room/i.test(table);
    const isFile = /doc|file|fichier/i.test(table);
    if (!isFolder && !isFile) continue;
    let rows: Record<string, unknown>[] = [];
    try {
      rows = await sb<Record<string, unknown>[]>(cfg, `/rest/v1/${encodeURIComponent(table)}?select=*&limit=5000`);
    } catch {
      continue;
    }
    for (const row of rows) {
      const id = typeof row.id === "string" ? row.id : "";
      if (id && folderIds.has(id)) {
        const name = pick(row, ["name", "nom", "title", "label"]);
        if (name) folders.set(id, name);
      }
      const stored = Object.values(row).find((v) => typeof v === "string" && paths.has(v.replace(/^data-room\//, ""))) as string | undefined;
      if (stored) {
        const name = pick(row, ["originalName", "original_name", "fileName", "file_name", "filename", "name", "nom", "title"]);
        if (name && !name.includes("/")) files.set(stored.replace(/^data-room\//, ""), name);
      }
    }
  }
  return { folders, files };
}

/** Nom tiré du chemin : « 21ab…-TABLE_DE_CAPITALISATION.xlsx » → « TABLE DE CAPITALISATION.xlsx ». */
function nameFromPath(path: string) {
  const base = path.split("/").pop() ?? path;
  return base
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "")
    .replace(/_+/g, " ")
    .replace(/\s+(\.[^.]+)$/, "$1")
    .trim();
}

export async function GET(req: NextRequest) {
  const user = await verifyCrmUser(req);
  if (!user) return unauthorized();
  if (!user.isAdmin) return Response.json({ error: "Réservé aux administrateurs du CRM." }, { status: 403 });
  const cfg = config();
  if (!cfg) {
    return Response.json(
      { error: "Ajoute OLD_SUPABASE_URL et OLD_SUPABASE_SERVICE_KEY dans les variables Vercel, puis redéploie." },
      { status: 503 },
    );
  }

  try {
    const items = await listAll(cfg, "");
    // Chemins docs/<idDossier>/<fichier> : le dossier est le segment qui précède le nom du fichier.
    const folderOf = (p: string) => {
      const parts = p.split("/");
      return parts.length >= 2 ? parts[parts.length - 2] : "";
    };
    const folderIds = new Set(items.map((i) => folderOf(i.path)).filter(Boolean));
    const names = await readableNames(cfg, folderIds, new Set(items.map((i) => i.path)));

    const signed: { path: string | null; signedURL: string | null }[] = [];
    for (let i = 0; i < items.length; i += 100) {
      signed.push(
        ...(await sb<{ path: string | null; signedURL: string | null }[]>(cfg, `/storage/v1/object/sign/${BUCKET}`, {
          expiresIn: 3600,
          paths: items.slice(i, i + 100).map((x) => x.path),
        })),
      );
    }
    const urlOf = new Map(signed.filter((s) => s.path && s.signedURL).map((s) => [s.path as string, `${cfg.url}/storage/v1${s.signedURL}`]));

    const files: LegacyFile[] = items
      .filter((it) => urlOf.has(it.path))
      .map((it) => {
        const fid = folderOf(it.path);
        return {
          path: it.path,
          name: names.files.get(it.path) || nameFromPath(it.path),
          folder: fid ? names.folders.get(fid) || fid : "",
          size: it.metadata?.size ?? 0,
          mime: it.metadata?.mimetype ?? "application/octet-stream",
          createdAt: it.created_at ?? new Date().toISOString(),
          url: urlOf.get(it.path) as string,
        };
      });

    return Response.json({ files, foldersNamed: names.folders.size, folders: folderIds.size });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Lecture de l'ancien CRM impossible." }, { status: 502 });
  }
}
