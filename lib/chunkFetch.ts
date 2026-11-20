// Téléchargement rapide des fichiers de la Data Room (équipe et invités) :
// les morceaux sont récupérés plusieurs à la fois au lieu d'un par un, et chaque fichier n'est téléchargé
// qu'une fois (l'aperçu ouvert après un survol réutilise le téléchargement déjà commencé).

/** Morceaux demandés en même temps : assez pour aller vite, sans surcharger o2switch. */
export const PARALLEL_CHUNKS = 4;

/** Récupère `count` morceaux, `parallel` à la fois, et les renvoie dans l'ordre. */
export async function fetchChunks(count: number, get: (i: number) => Promise<ArrayBuffer>, parallel = PARALLEL_CHUNKS): Promise<ArrayBuffer[]> {
  const parts: ArrayBuffer[] = new Array(count);
  let next = 0;
  const worker = async () => {
    while (next < count) {
      const i = next++;
      parts[i] = await get(i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, count) }, worker));
  return parts;
}

/**
 * Mémoire des fichiers déjà téléchargés pendant la session (jusqu'à `maxBytes`, les plus anciens sortent en premier).
 * Un téléchargement en cours est partagé : demander deux fois le même fichier ne le télécharge qu'une fois.
 */
export class BlobMemory {
  private items = new Map<string, { p: Promise<Blob>; size: number }>();
  constructor(private maxBytes = 200 * 1024 * 1024) {}

  get(key: string, size: number, make: () => Promise<Blob>): Promise<Blob> {
    const hit = this.items.get(key);
    if (hit) {
      // Le plus récemment utilisé passe en dernier (sorti en dernier).
      this.items.delete(key);
      this.items.set(key, hit);
      return hit.p;
    }
    const p = make();
    this.items.set(key, { p, size });
    // Un échec n'est pas mémorisé : la prochaine demande réessaie.
    p.catch(() => {
      if (this.items.get(key)?.p === p) this.items.delete(key);
    });
    this.trim();
    return p;
  }

  /** Fichier qu'on vient d'envoyer : déjà en mémoire, pas besoin de le retélécharger. */
  set(key: string, blob: Blob) {
    this.items.delete(key);
    this.items.set(key, { p: Promise.resolve(blob), size: blob.size });
    this.trim();
  }

  delete(key: string) {
    this.items.delete(key);
  }

  has(key: string) {
    return this.items.has(key);
  }

  private trim() {
    let total = 0;
    for (const v of this.items.values()) total += v.size;
    for (const [k, v] of this.items) {
      if (total <= this.maxBytes || this.items.size <= 1) break;
      this.items.delete(k);
      total -= v.size;
    }
  }
}

/** Fichiers qu'on télécharge en avance au survol (ceux dont l'aperçu a besoin du fichier entier). */
export const PREFETCH_MAX_BYTES = 30 * 1024 * 1024;
