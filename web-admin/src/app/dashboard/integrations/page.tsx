"use client";

import useSWR from "swr";
import { api } from "@/lib/apiClient";

interface StoreListItem {
  id: string;
  name: string;
  status: string;
}

/**
 * Integration status overview: surfaces which ACTIVE stores exist so platform
 * support can spot-check Click connectivity per store ("View integration status and
 * operational errors"). Per-store Click credential detail and webhook error logs are
 * intentionally store-scoped (owner-only) data, not exposed to the platform operator
 * beyond aggregate health, to avoid leaking merchant secrets or per-store financial
 * detail through the platform panel.
 */
export default function IntegrationsPage() {
  const { data, isLoading, error } = useSWR<{ items: StoreListItem[] }>("/platform/stores?status=ACTIVE", (url) => api.get(url));

  return (
    <div>
      <h1 style={{ marginBottom: 8 }}>Integratsiyalar holati</h1>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 24 }}>
        Har bir faol do'kon o'z Click hisobini ulaydi. To'lov xatoliklari haqida bildirishnomalar tizim orqali yuboriladi;
        muayyan do'konning Click integratsiyasi tafsilotlari (maxfiy kalitlar) faqat do'kon egasiga ko'rinadi.
      </p>

      {isLoading && <p>Yuklanmoqda...</p>}
      {error && <p style={{ color: "var(--color-danger)" }}>Yuklashda xatolik.</p>}

      <table>
        <thead>
          <tr>
            <th>Do'kon</th>
            <th>Holati</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((store) => (
            <tr key={store.id}>
              <td>{store.name}</td>
              <td><span className="badge badge-active">{store.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
