"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/apiClient";
import { useAuth } from "@/lib/authContext";

/**
 * Platform staff management: create SUPPORT_ADMIN accounts with restricted
 * permissions ("Manage platform staff permissions"). Only visible/usable
 * meaningfully by a SUPER_ADMIN — the backend enforces this regardless of what this
 * page renders (R4.3).
 */
export default function StaffPage() {
  const { actor } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"SUPER_ADMIN" | "SUPPORT_ADMIN">("SUPPORT_ADMIN");
  const [canApproveStores, setCanApproveStores] = useState(false);
  const [canSuspendStores, setCanSuspendStores] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await api.post("/platform/staff", {
        fullName, email, password, role,
        permissions: { canApproveStores, canSuspendStores },
      });
      setMessage("Xodim muvaffaqiyatli qo'shildi.");
      setFullName(""); setEmail(""); setPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Xatolik yuz berdi");
    }
  }

  if (actor?.role !== "SUPER_ADMIN") {
    return <p style={{ color: "var(--color-text-muted)" }}>Ushbu bo'lim faqat Super Admin uchun mavjud.</p>;
  }

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Platforma xodimlari</h1>

      <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 480 }}>
        <h3>Yangi xodim qo'shish</h3>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", marginBottom: 6, fontSize: 13 }}>To'liq ism</span>
          <input className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", marginBottom: 6, fontSize: 13 }}>Email</span>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", marginBottom: 6, fontSize: 13 }}>Vaqtinchalik parol</span>
          <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", marginBottom: 6, fontSize: 13 }}>Rol</span>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as never)}>
            <option value="SUPPORT_ADMIN">Support Admin (cheklangan)</option>
            <option value="SUPER_ADMIN">Super Admin (to'liq huquq)</option>
          </select>
        </label>

        {role === "SUPPORT_ADMIN" && (
          <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={canApproveStores} onChange={(e) => setCanApproveStores(e.target.checked)} />
              Do'konlarni tasdiqlash huquqi
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={canSuspendStores} onChange={(e) => setCanSuspendStores(e.target.checked)} />
              Do'konlarni to'xtatish huquqi
            </label>
          </div>
        )}

        {message && <p style={{ color: "var(--color-success)", fontSize: 13 }}>{message}</p>}
        {error && <p style={{ color: "var(--color-danger)", fontSize: 13 }}>{error}</p>}

        <button type="submit" className="btn btn-primary">Qo'shish</button>
      </form>
    </div>
  );
}
