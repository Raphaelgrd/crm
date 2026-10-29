"use client";

import { useState } from "react";
import { Images } from "lucide-react";
import { useImageBank, type ImageMeta } from "@/lib/imageBank";
import { ImageDetail, ImageGrid, UploadZone, useImageFilter } from "@/components/images/ImageBank";

export default function ImagesPage() {
  const { images, loading } = useImageBank();
  const f = useImageFilter(images);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = images.find((i) => i.id === openId) ?? null;
  const missing = images.filter((i) => !i.description).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-foreground flex items-center gap-2 text-2xl font-bold">
          <Images className="h-6 w-6 text-violet-600" aria-hidden="true" />
          Banque d&apos;images
        </h1>
        <p className="text-muted-foreground text-sm">
          {images.length} image{images.length > 1 ? "s" : ""} utilisables dans les modèles d&apos;email et par l&apos;Assistant IA
          {missing > 0 && <span className="text-amber-600"> · {missing} sans description (l&apos;IA ne saura pas quand les utiliser)</span>}
        </p>
      </header>

      <UploadZone onUploaded={(imgs) => imgs.length === 1 && setOpenId(imgs[0].id)} />
      {f.bar}

      {loading ? (
        <p className="text-muted-foreground py-16 text-center text-sm">Chargement…</p>
      ) : f.filtered.length ? (
        <ImageGrid images={f.filtered} onSelect={(img: ImageMeta) => setOpenId(img.id)} />
      ) : (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {images.length ? "Aucune image ne correspond." : "Aucune image pour l'instant : dépose tes premiers visuels ci-dessus."}
        </p>
      )}

      {open && <ImageDetail key={open.id} img={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}
