import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Netforce CRM",
    short_name: "Netforce",
    description: "Netforce CRM — Gestion de contacts et activité commerciale",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#1C1917",
    theme_color: "#1C1917",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ],
  };
}
