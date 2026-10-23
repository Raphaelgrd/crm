import AdminGuard from "@/components/AdminGuard";
import type { ReactNode } from "react";

export default function DataRoomLayout({ children }: { children: ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
