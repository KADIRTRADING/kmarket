"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/authContext";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Umumiy ko'rinish" },
  { href: "/dashboard/applications", label: "Kutilayotgan arizalar" },
  { href: "/dashboard/stores", label: "Do'konlar" },
  { href: "/dashboard/audit-log", label: "Faoliyat jurnali" },
  { href: "/dashboard/staff", label: "Platforma xodimlari" },
  { href: "/dashboard/integrations", label: "Integratsiyalar holati" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { actor, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !actor) {
      router.replace("/login");
    }
  }, [loading, actor, router]);

  if (loading || !actor) return null;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside style={{ width: 240, borderRight: "1px solid var(--color-border)", padding: 20, display: "flex", flexDirection: "column" }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 24 }}>TezKassa</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                color: pathname === item.href ? "white" : "var(--color-text)",
                background: pathname === item.href ? "var(--color-primary)" : "transparent",
                fontSize: 14,
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>{actor.fullName}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>{actor.role}</div>
          <button className="btn" onClick={logout} style={{ width: "100%" }}>
            Chiqish
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 32, maxWidth: 1200 }}>{children}</main>
    </div>
  );
}
