"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Columns3,
  FolderKanban,
  SquareCheckBig,
  Zap,
  Clock,
  FileText,
  FolderLock,
  Package,
  Settings,
  Plus,
  LogOut,
  PanelLeftOpen,
} from "lucide-react";

// Reconstruit depuis la nav réelle trouvée dans l'export HTML (page /templates).
// Si d'autres pages révèlent des entrées supplémentaires, ajoute-les ici.
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/closing", label: "Closing", icon: Columns3 },
  { href: "/projets", label: "Projets", icon: FolderKanban },
  { href: "/projets/mes-taches", label: "Mes tâches", icon: SquareCheckBig },
  { href: "/automatisation", label: "Automatisations", icon: Zap },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/data-room", label: "Data Room", icon: FolderLock },
  { href: "/stock", label: "Stock", icon: Package },
  { href: "/rapport", label: "Rapport d'activité", icon: Clock },
  { href: "/settings", label: "Paramètres", icon: Settings },
];

export function Sidebar({ userInitial = "R" }: { userInitial?: string }) {
  const pathname = usePathname();

  return (
    <div className="group border-sidebar-border bg-sidebar text-sidebar-foreground fixed top-0 left-0 z-40 flex h-screen flex-col border-r shadow-(--shadow-card) transition-all duration-300 ease-(--ease-standard) lg:relative -translate-x-full lg:translate-x-0 w-64 lg:w-16">
      {/* Logo + bouton créer */}
      <div className="border-sidebar-border flex items-center border-b transition-all duration-300 h-16 flex-col justify-center gap-1 px-2 py-2 lg:px-2">
        <div className="flex items-center flex-col gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Netforce"
            width={140}
            height={140}
            className="object-contain transition-all duration-300 h-7 w-7 lg:h-7 lg:w-7"
            src="/netforce.jpg"
          />
        </div>
        <div className="relative">
          <button
            type="button"
            title="Créer (Alt+T pour une tâche)"
            aria-label="Créer"
            className="flex cursor-pointer items-center justify-center rounded-lg border border-sidebar-border bg-sidebar text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 w-8"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 overflow-y-auto py-4">
        <div className="px-3 lg:px-2">
          <div className="space-y-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  className={
                    "flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-[color,background-color,box-shadow] duration-(--duration-normal) ease-(--ease-standard) px-3 lg:justify-center lg:px-2 active:scale-[0.97] " +
                    (active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="lg:hidden">{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Développer la nav (desktop) */}
      <div className="border-sidebar-border hidden border-t lg:block p-3 lg:p-2">
        <button
          title="Développer la navigation"
          aria-label="Développer la navigation"
          className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full cursor-pointer items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors duration-200 justify-center px-2"
        >
          <div className="flex gap-2">
            <PanelLeftOpen className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="hidden whitespace-nowrap group-hover:block">
              Développer la navigation
            </span>
          </div>
        </button>
      </div>

      {/* Utilisateur / déconnexion */}
      <div className="border-sidebar-border border-t transition-all duration-300 p-4 lg:p-2">
        <div className="flex flex-col items-center gap-2">
          <div className="bg-sidebar-accent text-sidebar-accent-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            {userInitial}
          </div>
          <button
            title="Déconnexion"
            aria-label="Déconnexion"
            className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer rounded-lg p-2 transition-colors duration-200"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
