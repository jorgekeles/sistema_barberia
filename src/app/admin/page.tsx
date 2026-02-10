"use client";

import { FormEvent, useEffect, useState } from "react";

type BusinessRow = {
  tenant_id: string;
  name: string;
  slug: string;
  reserved_count: number;
  subscription_status: string;
  subscription_type: "trial" | "paga" | "sin_plan";
  current_period_end: string | null;
};

export default function AdminPage() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("secret");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);

  async function loadOverview() {
    const res = await fetch("/api/v1/admin/overview", { cache: "no-store" });
    if (res.status === 401) {
      setLoggedIn(false);
      return;
    }
    const data = (await res.json().catch(() => null)) as { businesses?: BusinessRow[]; error?: { message?: string } } | null;
    if (!res.ok) {
      setError(data?.error?.message ?? "No se pudo cargar el panel admin");
      return;
    }
    setBusinesses(data?.businesses ?? []);
    setLoggedIn(true);
  }

  useEffect(() => {
    loadOverview().catch(() => setError("No se pudo cargar el panel admin"));
  }, []);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/v1/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(data?.error?.message ?? "Credenciales invalidas");
      return;
    }
    await loadOverview();
  }

  async function handleLogout() {
    await fetch("/api/v1/admin/logout", { method: "POST" });
    setLoggedIn(false);
    setBusinesses([]);
  }

  return (
    <main className="container">
      <section className="card surface">
        <div className="section-head">
          <h1>Admin Sistema</h1>
          <small>Vista de negocios, turnos reservados y tipo de suscripción.</small>
        </div>
        {!loggedIn ? (
          <form onSubmit={handleLogin} className="grid-form compact" style={{ maxWidth: "580px" }}>
            <label>
              Usuario
              <input value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button type="submit" disabled={loading}>{loading ? "Ingresando..." : "Entrar"}</button>
          </form>
        ) : (
          <>
            <div className="row-actions" style={{ marginBottom: "0.8rem" }}>
              <span className="pill">Negocios: {businesses.length}</span>
              <button className="btn-ghost" onClick={handleLogout}>Cerrar admin</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "0.55rem", borderBottom: "1px solid #d9d0bf" }}>Negocio</th>
                    <th style={{ textAlign: "left", padding: "0.55rem", borderBottom: "1px solid #d9d0bf" }}>Slug</th>
                    <th style={{ textAlign: "left", padding: "0.55rem", borderBottom: "1px solid #d9d0bf" }}>Turnos reservados</th>
                    <th style={{ textAlign: "left", padding: "0.55rem", borderBottom: "1px solid #d9d0bf" }}>Suscripción</th>
                    <th style={{ textAlign: "left", padding: "0.55rem", borderBottom: "1px solid #d9d0bf" }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {businesses.map((b) => (
                    <tr key={b.tenant_id}>
                      <td style={{ padding: "0.55rem", borderBottom: "1px solid #eee7d9" }}>{b.name}</td>
                      <td style={{ padding: "0.55rem", borderBottom: "1px solid #eee7d9" }}>{b.slug}</td>
                      <td style={{ padding: "0.55rem", borderBottom: "1px solid #eee7d9" }}>{b.reserved_count}</td>
                      <td style={{ padding: "0.55rem", borderBottom: "1px solid #eee7d9" }}>{b.subscription_type}</td>
                      <td style={{ padding: "0.55rem", borderBottom: "1px solid #eee7d9" }}>{b.subscription_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {error ? <p className="error-msg" style={{ marginTop: "0.7rem" }}>{error}</p> : null}
      </section>
    </main>
  );
}
