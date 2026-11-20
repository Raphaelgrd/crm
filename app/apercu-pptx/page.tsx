"use client";

import { useEffect, useRef, useState } from "react";

// Lecteur PowerPoint isolé. Cette page n'est affichée que dans un cadre « bac à sable » sans origine
// (sandbox="allow-scripts", sans allow-same-origin) par l'aperçu de la Data Room : elle n'a accès ni à la
// session, ni aux données, ni au stockage du CRM. Le fichier lui est transmis par postMessage par la page parente.
// La bibliothèque pptx-preview insère le texte des diapositives en HTML : cet isolement empêche tout
// contenu piégé d'atteindre le CRM.

type Msg = { type: "pptx"; buffer: ArrayBuffer };

export default function PptxFrame() {
  const box = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"waiting" | "loading" | "done" | "error">("waiting");
  const [error, setError] = useState("");

  useEffect(() => {
    const onMessage = async (e: MessageEvent<Msg>) => {
      // Seule la page qui affiche ce cadre peut lui envoyer un fichier.
      if (e.source !== window.parent || e.data?.type !== "pptx" || !(e.data.buffer instanceof ArrayBuffer)) return;
      if (!box.current) return;
      setStatus("loading");
      try {
        const { init } = await import("pptx-preview");
        box.current.innerHTML = "";
        const width = Math.min(box.current.clientWidth || 960, 1280);
        const previewer = init(box.current, { width, mode: "list" });
        await previewer.preview(e.data.buffer);
        // La bibliothèque ignore en silence les présentations qu'elle ne sait pas lire : on le signale.
        if (!previewer.slideCount) throw new Error("présentation non reconnue par l'aperçu");
        setStatus("done");
        window.parent.postMessage({ type: "pptx-done", slides: previewer.slideCount }, "*");
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
        window.parent.postMessage({ type: "pptx-error", message: err instanceof Error ? err.message : String(err) }, "*");
      }
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "pptx-ready" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div style={{ background: "#e5e7eb", minHeight: "100vh", padding: 16 }}>
      {status !== "done" && (
        <p style={{ fontFamily: "system-ui, sans-serif", fontSize: 14, color: "#4b5563", textAlign: "center", margin: "24px 0" }}>
          {status === "error" ? `Aperçu impossible : ${error}` : "Chargement de la présentation…"}
        </p>
      )}
      <div ref={box} style={{ margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }} />
    </div>
  );
}
