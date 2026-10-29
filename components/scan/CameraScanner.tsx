"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

const CARD_RATIO = 85.6 / 54;

/** Caméra plein écran avec cadre au format carte de visite ; chaque déclenchement renvoie l'image recadrée. */
export function CameraScanner({ onCapture, onClose }: { onCapture: (dataUrl: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [count, setCount] = useState(0);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => setError("Caméra inaccessible : autorise l'accès à la caméra, ou importe une photo à la place."));
    if (!navigator.mediaDevices) setError("Ce navigateur ne donne pas accès à la caméra : importe une photo à la place.");
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  const capture = () => {
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame || !video.videoWidth) return;
    // Recadre sur la zone du cadre (la vidéo est affichée en object-cover).
    const vb = video.getBoundingClientRect();
    const fb = frame.getBoundingClientRect();
    const scale = Math.max(vb.width / video.videoWidth, vb.height / video.videoHeight);
    const offX = (video.videoWidth * scale - vb.width) / 2;
    const offY = (video.videoHeight * scale - vb.height) / 2;
    const margin = 0.06;
    const sx = Math.max(0, (fb.left - vb.left + offX) / scale - fb.width * margin / scale);
    const sy = Math.max(0, (fb.top - vb.top + offY) / scale - fb.height * margin / scale);
    const sw = Math.min(video.videoWidth - sx, (fb.width * (1 + 2 * margin)) / scale);
    const sh = Math.min(video.videoHeight - sy, (fb.height * (1 + 2 * margin)) / scale);
    const out = Math.min(1600, Math.round(sw));
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = Math.round((sh / sw) * out);
    canvas.getContext("2d")!.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL("image/jpeg", 0.88));
    setCount((c) => c + 1);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        {flash && <div className="absolute inset-0 bg-white/70" />}
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div
            ref={frameRef}
            className="w-full max-w-xl rounded-2xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
            style={{ aspectRatio: String(CARD_RATIO) }}
          />
        </div>
        <p className="absolute top-4 right-0 left-0 text-center text-sm font-medium text-white drop-shadow">
          {error || "Place la carte dans le cadre, bien à plat et éclairée"}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 rounded-full bg-black/50 p-2 text-white"
          aria-label="Fermer la caméra"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-4 bg-black px-6 py-5">
        <span className="w-28 text-sm text-white/80">{count ? `${count} carte${count > 1 ? "s" : ""} prise${count > 1 ? "s" : ""}` : ""}</span>
        <button
          type="button"
          onClick={capture}
          disabled={!!error}
          className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
          aria-label="Prendre la photo"
        >
          <Camera className="h-7 w-7 text-white" aria-hidden="true" />
        </button>
        <button type="button" onClick={onClose} className="w-28 text-right text-sm font-semibold text-white">
          {count ? "Terminer" : "Annuler"}
        </button>
      </div>
    </div>
  );
}
