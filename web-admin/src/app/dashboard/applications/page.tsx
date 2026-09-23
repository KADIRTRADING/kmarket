"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, ApiError } from "@/lib/apiClient";

interface StoreListItem {
  id: string;
  name: string;
  contact_phone: string;
  contact_email: string | null;
  address: string;
  status: string;
  created_at: string;
}

/**
 * Pending store applications queue. This is the primary Super Admin workflow: view
 * submitted information, then approve or reject with a recorded reason (R3.3, R3.4).
 */
export default function ApplicationsPage() {
  const { data, error, isLoading, mutate } = useSWR<{ items: StoreListItem[] }>("/platform/stores?status=PENDING", (url) => api.get(url));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  async function approve(storeId: string) {
    setBusyId(storeId);
    setActionError(null);
    try {
      await api.post(`/platform/stores/${storeId}/approve`);
      await mutate();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Xatolik yuz berdi");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(storeId: string) {
    if (!rejectReason.trim()) return;
    setBusyId(storeId);
    setActionError(null);
    try {
      await api.post(`/platform/stores/${storeId}/reject`, { reason: rejectReason });
      setRejectingId(null);
      setRejectReason("");
      await mutate();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Xatolik yuz berdi");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Kutilayotgan arizalar</h1>
      {isLoading && <p>Yuklanmoqda...</p>}
      {error && <p style={{ color: "var(--color-danger)" }}>Yuklashda xatolik.</p>}
      {actionError && <p style={{ color: "var(--color-danger)" }}>{actionError}</p>}

      {data && data.items.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>Hozircha kutilayotgan arizalar yo'q.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {data?.items.map((store) => (
          <div key={store.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ margin: 0 }}>{store.name}</h3>
                <p style={{ color: "var(--color-text-muted)", margin: "4px 0" }}>{store.address}</p>
                <p style={{ color: "var(--color-text-muted)", margin: "4px 0" }}>
                  {store.contact_phone} {store.contact_email ? `· ${store.contact_email}` : ""}
                </p>
                <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  Topshirilgan: {new Date(store.created_at).toLocaleString("uz-UZ")}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" disabled={busyId === store.id} onClick={() => approve(store.id)}>
                  Tasdiqlash
                </button>
                <button className="btn btn-danger" disabled={busyId === store.id} onClick={() => setRejectingId(store.id)}>
                  Rad etish
                </button>
              </div>
            </div>

            {rejectingId === store.id && (
              <div style={{ marginTop: 16, borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
                <label style={{ display: "block", marginBottom: 8, fontSize: 13 }}>Rad etish sababi (majburiy)</label>
                <textarea
                  className="input"
                  rows={2}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-danger" disabled={!rejectReason.trim() || busyId === store.id} onClick={() => reject(store.id)}>
                    Tasdiqlash va rad etish
                  </button>
                  <button className="btn" onClick={() => { setRejectingId(null); setRejectReason(""); }}>
                    Bekor qilish
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
