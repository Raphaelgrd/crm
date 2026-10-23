import AdminGuard from "@/components/AdminGuard";
import type { ReactNode } from "react";

export default function EquipeLayout({ children }: { children: ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
