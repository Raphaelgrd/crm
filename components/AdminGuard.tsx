"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CRM_ADMINS, useCrmUser } from "@/lib/rapport";
import type { ReactNode } from "react";

export default function AdminGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useCrmUser();
  const router = useRouter();
  const isAdmin = CRM_ADMINS.map((e) => e.toLowerCase()).includes(
    (user?.email ?? "").toLowerCase(),
  );

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [loading, isAdmin, router]);

  if (loading || !isAdmin) return null;
  return <>{children}</>;
}
