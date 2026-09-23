"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { api, ApiError, fetcher } from "@/lib/apiClient";

interface StoreListItem {
  id: string;
  name: string;
  contact_phone: string;
  status: string;
  created_at: string;
  suspended_at: string | null;
}

const STATUS_FILTERS = ["ALL", "PENDING", "ACTIVE", "REJECTED", "SUSPENDED"] as const;

export default function StoresPage() {
  const [status, setStatus] = useState<typeof STATUS_FILTERS[number]>("ALL");
  const query = status === "ALL" ? "" : `?status=${status}`;
  const { data, error, isLoading, mutate } = useSWR<{ items: StoreListItem[] }>(`/platform/stores${query}`, fetcher);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  async function suspend(storeId: string) {
    if (!reason.trim()) return;
    setBusyId(storeId);
    setActionError(null);
    try {
      await api.post(`/platform/stores/${storeId}/suspend`, { reason });
      setSuspendingId(null);
      setReason("");
      await mutate();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Xatolik");
    } finally {
      setBusyId(null);
    }
  }

  async function reactivate(storeId: string) {
    setBusyId(storeId);
    setActionError(null);
    try {
      await api.post(`/platform/stores/${storeId}/reactivate`);
      await mutate();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Xatolik");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>Do'konlar</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {STATUS_FILTERS.map((s) => (
          <button key={s} className="btn" onClick={() => setStatus(s)} style={status === s ? { background: "var(--color-primary)", color: "white" } : undefined}>
            {s}
          </button>
        ))}
      </div>

      {isLoading && <p>Yuklanmoqda...</p>}
      {error && <p style={{ color: "var(--color-danger)" }}>Yuklashda xatolik.</p>}
      {actionError && <p style={{ color: "var(--color-danger)" }}>{actionError}</p>}

      <table>
        <thead>
          <tr>
            <th>Nomi</th>
            <th>Telefon</th>
            <th>Holati</th>
            <th>Ro'yxatdan o'tgan</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((store) => (
            <tr key={store.id}>
              <td><Link href={`/dashboard/stores/${store.id}`}>{store.name}</Link></td>
              <td>{store.contact_phone}</td>
              <td><span className={`badge badge-${store.status.toLowerCase()}`}>{store.status}</span></td>
              <td>{new Date(store.created_at).toLocaleDateString("uz-UZ")}</td>
              <td>
                {store.status === "ACTIVE" && (
                  <button className="btn btn-danger" disabled={busyId === store.id} onClick={() => setSuspendingId(store.id)}>
                    To'xtatish
                  </button>
                )}
                {store.status === "SUSPENDED" && (
                  <button className="btn btn-primary" disabled={busyId === store.id} onClick={() => reactivate(store.id)}>
                    Qayta faollashtirish
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {suspendingId && (
        <div className="card" style={{ marginTop: 20, maxWidth: 480 }}>
          <h3>Do'konni to'xtatish</h3>
          <label style={{ display: "block", marginBottom: 8, fontSize: 13 }}>Sabab (majburiy)</label>
          <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} style={{ marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-danger" disabled={!reason.trim()} onClick={() => suspend(suspendingId)}>Tasdiqlash</button>
            <button className="btn" onClick={() => { setSuspendingId(null); setReason(""); }}>Bekor qilish</button>
          </div>
        </div>
      )}
    </div>
  );
}
