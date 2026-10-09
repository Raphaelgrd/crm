"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { initials, signOutRapport, useCrmUser } from "@/lib/rapport";
import {
  LayoutDashboard,
  Users,
  Building2,
  Calendar,
  Columns3,
  Zap,
  Clock,
  FileText,
  FolderLock,
  Package,
  Handshake,
  ShieldCheck,
  Settings,
  LogOut,
  PanelLeftOpen,
  PanelLeftClose,
  TrendingUp,
  Share2,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/investisseurs", label: "Pipeline levée", icon: TrendingUp },
  { href: "/reseaux", label: "Réseaux sociaux", icon: Share2 },
  { href: "/organisations", label: "Organisations", icon: Building2 },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/closing", label: "Closing", icon: Columns3 },
  { href: "/automatisation", label: "Automatisations", icon: Zap },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/data-room", label: "Data Room", icon: FolderLock },
  { href: "/stock", label: "Stock", icon: Package },
  { href: "/prets", label: "Prêts & Envois", icon: Handshake },
  { href: "/conformite", label: "Conformité export", icon: ShieldCheck },
  { href: "/rapport", label: "Rapport d'activité", icon: Clock },
  { href: "/settings", label: "Paramètres", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { name } = useCrmUser();
  const userInitial = initials(name) || "?";
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border-sidebar-border bg-sidebar text-sidebar-foreground fixed top-0 left-0 z-40 flex h-screen flex-col border-r shadow-(--shadow-card) transition-all duration-300 ease-(--ease-standard) lg:relative -translate-x-full lg:translate-x-0 ${expanded ? "w-64" : "w-16"}`}
    >
      {/* Logo */}
      <div className="border-sidebar-border flex h-16 items-center justify-center border-b px-2">
        {expanded ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt="Netforce"
            width={200}
            height={36}
            className="h-8 w-auto object-contain"
            src="/netforce-logo.svg"
          />
        ) : (
          <svg viewBox="0 0 306 267" className="h-7 w-7" fill="white" aria-label="Netforce">
            <path d="M0 262.053V48.5568C0 18.4978 16.5694 0 43.5429 0C55.4882 0 64.7363 3.85371 75.1403 13.488L229.66 154.534V4.23909H305.956V218.12C305.956 247.794 289.387 266.677 262.413 266.677C250.468 266.677 241.22 262.438 230.43 252.418L76.6817 112.143V262.053H0Z" />
          </svg>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        <div className="px-2">
          <div className="space-y-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  className={
                    `flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors duration-150 active:scale-[0.97] ` +
                    (expanded ? "px-3" : "justify-center px-2") +
                    " " +
                    (active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {expanded && (
                    <span className="whitespace-nowrap overflow-hidden">{label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Toggle */}
      <div className="border-sidebar-border border-t p-2">
        <button
          onClick={() => setExpanded(!expanded)}
          title={expanded ? "Réduire la navigation" : "Développer la navigation"}
          aria-label={expanded ? "Réduire la navigation" : "Développer la navigation"}
          className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full cursor-pointer items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors duration-150 justify-center px-2"
        >
          {expanded ? (
            <>
              <PanelLeftClose className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">Réduire</span>
            </>
          ) : (
            <PanelLeftOpen className="h-5 w-5 shrink-0" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Utilisateur / déconnexion */}
      <div className="border-sidebar-border border-t p-2">
        <div className={`flex items-center gap-2 ${expanded ? "px-2" : "flex-col justify-center"}`}>
          <div className="bg-sidebar-accent text-sidebar-accent-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
            {userInitial}
          </div>
          {expanded && (
            <span className="text-sidebar-foreground/80 text-sm truncate flex-1">{name}</span>
          )}
          <button
            title="Déconnexion"
            aria-label="Déconnexion"
            onClick={() => void signOutRapport()}
            className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer rounded-lg p-2 transition-colors duration-150"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
