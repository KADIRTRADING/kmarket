"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/apiClient";

interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  actor_name: string;
  created_at: string;
}

/** Platform-level activity log: every approve/reject/suspend/reactivate/staff-change
 * action, with actor and timestamp, satisfying "Record who approved, rejected, or
 * suspended a store and when." */
export default function AuditLogPage() {
  const { data, isLoading, error } = useSWR<AuditLogEntry[]>("/platform/audit-log", fetcher);

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Faoliyat jurnali</h1>
      {isLoading && <p>Yuklanmoqda...</p>}
      {error && <p style={{ color: "var(--color-danger)" }}>Yuklashda xatolik.</p>}

      <table>
        <thead>
          <tr>
            <th>Vaqt</th>
            <th>Xodim</th>
            <th>Amal</th>
            <th>Obyekt</th>
            <th>Sabab</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((entry) => (
            <tr key={entry.id}>
              <td>{new Date(entry.created_at).toLocaleString("uz-UZ")}</td>
              <td>{entry.actor_name}</td>
              <td>{entry.action}</td>
              <td>{entry.entity_type} {entry.entity_id?.slice(0, 8)}</td>
              <td>{entry.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
