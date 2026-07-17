import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Netforce",
  description: "Netforce CRM",
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
