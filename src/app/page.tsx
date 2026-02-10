"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AuthMode = "login" | "signup";

type ApiError = { error?: { message?: string } };

type LoginRes = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [ownerName, setOwnerName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [timezone, setTimezone] = useState("America/Argentina/Buenos_Aires");
  const [countryCode, setCountryCode] = useState("AR");

  const title = useMemo(() => (mode === "login" ? "Acceso de propietarios" : "Crea tu cuenta"), [mode]);

  async function loginWithCredentials(loginEmail: string, loginPassword: string) {
    const loginRes = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    });

    const loginData = (await loginRes.json()) as LoginRes & ApiError;
    if (!loginRes.ok || !loginData.access_token) {
      throw new Error(loginData.error?.message ?? "No se pudo iniciar sesion");
    }

    localStorage.setItem("access_token", loginData.access_token);
    localStorage.setItem("refresh_token", loginData.refresh_token);
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await loginWithCredentials(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesion");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/businesses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          owner_name: ownerName,
          owner_email: email,
          owner_password: password,
          business_name: businessName,
          slug: slug || undefined,
          timezone,
          country_code: countryCode,
        }),
      });

      const data = (await res.json()) as ApiError;
      if (!res.ok) throw new Error(data.error?.message ?? "No se pudo crear la cuenta");

      await loginWithCredentials(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container home-grid">
      <section className="card hero-card hero-strip">
        <p className="eyebrow">Sistema Barberia</p>
        <h1>Gestiona turnos de tu negocio</h1>
        <p>Desde aqui puedes entrar a tu panel o crear una cuenta nueva para publicar tu pagina de reservas.</p>
        <div className="meta-pills">
          <span className="pill">Servicios personalizables</span>
          <span className="pill">Link publico de reservas</span>
          <span className="pill">Agenda anti-overbooking</span>
        </div>
      </section>

      <section className="card surface panel-auth">
        <div className="row-actions">
          <button className={mode === "login" ? "" : "btn-ghost"} onClick={() => setMode("login")} type="button">Entrar</button>
          <button className={mode === "signup" ? "" : "btn-ghost"} onClick={() => setMode("signup")} type="button">Crear cuenta</button>
        </div>

        <h2>{title}</h2>

        <form onSubmit={mode === "login" ? handleLogin : handleSignup} className="grid-form">
          {mode === "signup" ? (
            <>
              <label>
                Nombre del propietario
                <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required minLength={2} />
              </label>
              <label>
                Nombre publico del negocio
                <input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Ej: Peluqueria El Pelo"
                  required
                  minLength={2}
                />
              </label>
              <label>
                Link publico (slug)
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="peluqueria-el-pelo"
                />
              </label>
              <div className="grid-form compact">
                <label>
                  Timezone
                  <input value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
                </label>
                <label>
                  Pais (2 letras)
                  <input value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} required maxLength={2} />
                </label>
              </div>
            </>
          ) : null}

          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>

          <label>
            Contrasena
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={8} />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "Procesando..." : mode === "login" ? "Entrar al panel" : "Crear cuenta y continuar"}
          </button>
        </form>

        {error ? <p className="error-msg">{error}</p> : null}
      </section>

      <section className="card surface">
        <h2>Pagina de clientes</h2>
        <p>
          Tu pagina publica de reservas se publica como <code>/b/tu-slug</code>. Tras crear la cuenta podras compartir ese link en Instagram,
          WhatsApp o Google Business.
        </p>
        <Link href="/b/barberia-demo">Ver ejemplo de pagina de reservas</Link>
      </section>
    </main>
  );
}
