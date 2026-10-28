"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCrmUser } from "@/lib/rapport";
import type { ReactNode } from "react";

export default function AdminGuard({ children }: { children: ReactNode }) {
  const { loading, isAdmin } = useCrmUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [loading, isAdmin, router]);

  if (loading || !isAdmin) return null;
  return <>{children}</>;
}
