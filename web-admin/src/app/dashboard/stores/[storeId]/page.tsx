"use client";

import useSWR from "swr";
import { useParams } from "next/navigation";
import { api } from "@/lib/apiClient";

interface StoreDetail {
  store: { id: string; name: string; status: string; address: string; contact_phone: string; business_details: string | null };
  documents: Array<{ id: string; file_name: string; file_url: string }>;
  branches: Array<{ id: string; name: string; is_active: boolean }>;
  users: Array<{ id: string; full_name: string; phone: string; role: string; is_active: boolean }>;
}

/**
 * Read-only detail view: branches, users, activity — per the Super Admin capability
 * to "View stores, branches, users, activity logs". No endpoint here allows editing
 * the store's accounting records (R3.8).
 */
export default function StoreDetailPage() {
  const params = useParams<{ storeId: string }>();
  const { data, isLoading, error } = useSWR<StoreDetail>(`/platform/stores/${params.storeId}`, (url) => api.get(url));

  if (isLoading) return <p>Yuklanmoqda...</p>;
  if (error || !data) return <p style={{ color: "var(--color-danger)" }}>Yuklashda xatolik.</p>;

  return (
    <div>
      <h1>{data.store.name}</h1>
      <p className={`badge badge-${data.store.status.toLowerCase()}`}>{data.store.status}</p>
      <p>{data.store.address} · {data.store.contact_phone}</p>
      {data.store.business_details && <p style={{ color: "var(--color-text-muted)" }}>{data.store.business_details}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24 }}>
        <div className="card">
          <h3>Filiallar</h3>
          <ul>
            {data.branches.map((b) => (
              <li key={b.id}>{b.name} {!b.is_active && "(faol emas)"}</li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3>Xodimlar</h3>
          <ul>
            {data.users.map((u) => (
              <li key={u.id}>{u.full_name} — {u.role} {!u.is_active && "(faol emas)"}</li>
            ))}
          </ul>
        </div>
      </div>

      {data.documents.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3>Yuklangan hujjatlar</h3>
          <ul>
            {data.documents.map((d) => (
              <li key={d.id}><a href={d.file_url} target="_blank" rel="noreferrer">{d.file_name}</a></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
