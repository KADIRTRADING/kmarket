"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/apiClient";

interface PlatformStats {
  storesByStatus: Record<string, number>;
  totalStores: number;
  activeStoreUsers: number;
  last30Days: { completedSales: number; totalRevenueUzs: number };
}

function formatUzs(amount: number): string {
  return `${amount.toLocaleString("ru-RU").replace(/,/g, " ")} so'm`;
}

export default function DashboardHomePage() {
  const { data, error, isLoading } = useSWR<PlatformStats>("/platform/stats", fetcher);

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Platforma statistikasi</h1>

      {isLoading && <p>Yuklanmoqda...</p>}
      {error && <p style={{ color: "var(--color-danger)" }}>Ma'lumotlarni yuklashda xatolik yuz berdi.</p>}

      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          <StatCard label="Jami do'konlar" value={data.totalStores} />
          <StatCard label="Kutilayotgan arizalar" value={data.storesByStatus.PENDING ?? 0} highlight={(data.storesByStatus.PENDING ?? 0) > 0} />
          <StatCard label="Faol do'konlar" value={data.storesByStatus.ACTIVE ?? 0} />
          <StatCard label="To'xtatilgan do'konlar" value={data.storesByStatus.SUSPENDED ?? 0} />
          <StatCard label="Faol xodimlar" value={data.activeStoreUsers} />
          <StatCard label="So'nggi 30 kun savdolar" value={data.last30Days.completedSales} />
          <StatCard label="So'nggi 30 kun aylanma" value={formatUzs(data.last30Days.totalRevenueUzs)} />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="card" style={highlight ? { borderColor: "var(--color-warning)" } : undefined}>
      <div style={{ color: "var(--color-text-muted)", fontSize: 13, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
