import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import AutomationRunner from "@/components/automation/AutomationRunner";
import type { ReactNode } from "react";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="bg-surface-page flex h-screen overflow-hidden">
      <AutomationRunner />
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden lg:ml-0">
        <Header />
        <div className="flex-1 overflow-y-auto">
          <div className="h-full">{children}</div>
        </div>
      </main>
    </div>
  );
}
