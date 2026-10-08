import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Netforce",
  description: "Netforce CRM — Gestion de contacts et activité commerciale",
  themeColor: "#1C1917",
  appleWebApp: {
    capable: true,
    title: "Netforce",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
