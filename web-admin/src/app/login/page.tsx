"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/authContext";
import { ApiError } from "@/lib/apiClient";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kirishda xatolik yuz berdi. Qaytadan urinib ko'ring.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: 360 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>TezKassa</h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: 0, marginBottom: 24 }}>Super Admin panel</p>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", marginBottom: 6, fontSize: 13 }}>Email</span>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>

        <label style={{ display: "block", marginBottom: 20 }}>
          <span style={{ display: "block", marginBottom: 6, fontSize: 13 }}>Parol</span>
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>

        {error && <p style={{ color: "var(--color-danger)", fontSize: 13, marginBottom: 16 }}>{error}</p>}

        <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={submitting}>
          {submitting ? "Kirilmoqda..." : "Kirish"}
        </button>
      </form>
    </div>
  );
}
