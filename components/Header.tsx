"use client";

import { Menu, Search, Bell, ChevronDown } from "lucide-react";
import { initials, useCrmUser } from "@/lib/rapport";

export function Header() {
  const { name, user } = useCrmUser();
  const userName = name || user?.email?.split("@")[0] || "";
  const userInitial = initials(userName) || "?";

  return (
    <header className="border-border bg-background/95 sticky top-0 z-40 border-b px-4 py-3 backdrop-blur-sm sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            aria-label="Ouvrir ou fermer le menu"
            className="text-foreground/80 hover:bg-muted focus-visible:ring-primary cursor-pointer rounded-lg p-2 transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-foreground text-base font-bold sm:text-lg">
              Netforce
            </span>
          </div>
          {userName && (
            <span className="text-muted-foreground hidden text-sm sm:inline">
              Salut {userName} !
            </span>
          )}
        </div>

        <div className="hidden flex-1 justify-center px-4 md:flex">
          <div className="relative w-full max-w-md">
            <div className="relative">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder="Rechercher... (⌘K)"
                role="combobox"
                aria-expanded="false"
                aria-autocomplete="list"
                autoComplete="off"
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:bg-background focus:ring-primary/40 w-full rounded-lg border py-2 pr-8 pl-10 text-sm transition-colors outline-none focus:ring-1"
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            aria-label="Rechercher"
            className="text-muted-foreground hover:bg-muted focus-visible:ring-primary cursor-pointer rounded-lg p-2 transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none md:hidden"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="relative">
            <button
              aria-label="Notifications"
              className="text-muted-foreground hover:bg-muted focus-visible:ring-primary relative cursor-pointer rounded-lg p-2 transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="relative">
            <button
              aria-label="Menu utilisateur"
              className="hover:bg-accent focus-visible:ring-primary flex cursor-pointer items-center gap-1.5 rounded-md transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none sm:gap-2"
            >
              <div className="bg-primary/15 text-primary flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold sm:h-9 sm:w-9 sm:text-sm">
                {userInitial}
              </div>
              <ChevronDown
                className="text-muted-foreground hover:text-foreground hidden h-4 w-4 transition-colors sm:block"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
