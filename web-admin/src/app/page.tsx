"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";

export default function RootPage() {
  const { actor, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(actor ? "/dashboard" : "/login");
  }, [loading, actor, router]);

  return null;
}
