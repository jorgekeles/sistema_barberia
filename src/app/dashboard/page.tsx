"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Service = {
  id: string;
  name: string;
  duration_min: number;
  buffer_before_min: number;
  buffer_after_min: number;
  price_amount_cents: number;
  price_currency: string;
  is_active: boolean;
};

type Staff = {
  id: string;
  full_name: string;
  email: string;
  role: string;
};

type Rule = {
  id: string;
  day_of_week: number;
  start_local: string;
  end_local: string;
  slot_step_min: number;
  staff_user_id: string | null;
};

type Exception = {
  id: string;
  exception_date: string;
  kind: string;
  start_local: string | null;
  end_local: string | null;
  reason: string | null;
  staff_user_id: string | null;
};

type Appointment = {
  id: string;
  service_name: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  start_at: string;
  end_at: string;
  status: string;
};

type RevenueSummary = {
  period: "weekly" | "monthly";
  period_start: string;
  period_end: string;
  total_appointments: number;
  total_revenue_cents: number;
  currency: string;
  by_service: Array<{
    service_name: string;
    appointments: number;
    revenue_cents: number;
    currency: string;
  }>;
};

const DOW = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [businessNameDraft, setBusinessNameDraft] = useState("");
  const [timezone, setTimezone] = useState("");
  const [slug, setSlug] = useState("");

  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [revenuePeriod, setRevenuePeriod] = useState<"weekly" | "monthly">("weekly");
  const [revenueSummary, setRevenueSummary] = useState<RevenueSummary | null>(null);
  const [whatsEnabled, setWhatsEnabled] = useState(false);
  const [whatsPhoneNumberId, setWhatsPhoneNumberId] = useState("");
  const [whatsApiToken, setWhatsApiToken] = useState("");
  const [whatsHasToken, setWhatsHasToken] = useState(false);

  const [newServiceName, setNewServiceName] = useState("Corte");
  const [newServiceDuration, setNewServiceDuration] = useState(30);
  const [newServicePrice, setNewServicePrice] = useState(0);
  const [servicePriceDrafts, setServicePriceDrafts] = useState<Record<string, string>>({});

  const [ruleStaff, setRuleStaff] = useState("");
  const [ruleDow, setRuleDow] = useState(1);
  const [ruleStart, setRuleStart] = useState("09:00");
  const [ruleEnd, setRuleEnd] = useState("18:00");
  const [ruleStep, setRuleStep] = useState(15);

  const [newStaffName, setNewStaffName] = useState("");

  const [exDate, setExDate] = useState("");
  const [exKind, setExKind] = useState("closed_full_day");
  const [exStart, setExStart] = useState("12:00");
  const [exEnd, setExEnd] = useState("14:00");
  const [exReason, setExReason] = useState("");

  const slotPreviewLink = useMemo(() => {
    if (!slug) return "";
    return `/b/${slug}`;
  }, [slug]);

  async function fetchAll(currentToken: string, period: "weekly" | "monthly") {
    const bizRes = await fetch("/api/v1/businesses/me", { headers: { Authorization: `Bearer ${currentToken}` } });
    if (bizRes.status === 401) throw new Error("UNAUTHORIZED");
    if (!bizRes.ok) throw new Error("No se pudo cargar el negocio");
    const bizData = await bizRes.json();

    setBusinessName(bizData.name ?? "");
    setBusinessNameDraft(bizData.name ?? "");
    setTimezone(bizData.timezone ?? "");
    setSlug(bizData.slug ?? "");

    const [servicesRes, staffRes, rulesRes, exRes, appRes, revenueRes] = await Promise.allSettled([
      fetch("/api/v1/businesses/me/services", { headers: { Authorization: `Bearer ${currentToken}` } }),
      fetch("/api/v1/businesses/me/staff", { headers: { Authorization: `Bearer ${currentToken}` } }),
      fetch("/api/v1/businesses/me/availability-rules", { headers: { Authorization: `Bearer ${currentToken}` } }),
      fetch("/api/v1/businesses/me/availability-exceptions", { headers: { Authorization: `Bearer ${currentToken}` } }),
      fetch("/api/v1/businesses/me/appointments", { headers: { Authorization: `Bearer ${currentToken}` } }),
      fetch(`/api/v1/businesses/me/analytics/revenue?period=${period}`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      }),
    ]);

    if (servicesRes.status === "fulfilled" && servicesRes.value.ok) {
      const servicesData = await servicesRes.value.json();
      setServices(servicesData.services ?? []);
      setServicePriceDrafts(
        Object.fromEntries(
          (servicesData.services ?? []).map((s: Service) => [s.id, String((s.price_amount_cents ?? 0) / 100)]),
        ),
      );
    } else {
      setServices([]);
      setServicePriceDrafts({});
    }

    if (staffRes.status === "fulfilled" && staffRes.value.ok) {
      const staffData = await staffRes.value.json();
      setStaff(staffData.staff ?? []);
    } else {
      setStaff([]);
    }

    if (rulesRes.status === "fulfilled" && rulesRes.value.ok) {
      const rulesData = await rulesRes.value.json();
      setRules(rulesData.rules ?? []);
    } else {
      setRules([]);
    }

    if (exRes.status === "fulfilled" && exRes.value.ok) {
      const exData = await exRes.value.json();
      setExceptions(exData.exceptions ?? []);
    } else {
      setExceptions([]);
    }

    if (appRes.status === "fulfilled" && appRes.value.ok) {
      const appData = await appRes.value.json();
      setAppointments(appData.appointments ?? []);
    } else {
      setAppointments([]);
    }

    if (revenueRes.status === "fulfilled" && revenueRes.value.ok) {
      const revenueJson = (await revenueRes.value.json()) as RevenueSummary;
      setRevenueSummary(revenueJson);
    } else {
      setRevenueSummary(null);
    }

    try {
      const waRes = await fetch("/api/v1/businesses/me/notifications/whatsapp", {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (waRes.ok) {
        const waData = await waRes.json();
        setWhatsEnabled(Boolean(waData.enabled));
        setWhatsPhoneNumberId(waData.phone_number_id ?? "");
        setWhatsHasToken(Boolean(waData.has_api_token));
        setWhatsApiToken("");
      } else {
        setWhatsEnabled(false);
        setWhatsPhoneNumberId("");
        setWhatsHasToken(false);
      }
    } catch {
      setWhatsEnabled(false);
      setWhatsPhoneNumberId("");
      setWhatsHasToken(false);
    }
  }

  async function refreshUpcomingAppointments(currentToken: string) {
    const res = await fetch("/api/v1/businesses/me/appointments", {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setAppointments(data.appointments ?? []);
  }

  useEffect(() => {
    const saved = localStorage.getItem("access_token");
    if (!saved) {
      router.replace("/");
      return;
    }
    setToken(saved);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    const currentToken = token;
    let cancelled = false;

    async function run() {
      setLoading(true);
      try {
        await fetchAll(currentToken, revenuePeriod);
      } catch (err) {
        const refreshToken = localStorage.getItem("refresh_token");
        const isUnauthorized = err instanceof Error && err.message === "UNAUTHORIZED";
        if (isUnauthorized && refreshToken) {
          try {
            const res = await fetch("/api/v1/auth/refresh", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ refresh_token: refreshToken }),
            });
            if (res.ok) {
              const data = (await res.json()) as { access_token?: string };
              if (data.access_token) {
                localStorage.setItem("access_token", data.access_token);
                if (!cancelled) {
                  setToken(data.access_token);
                  await fetchAll(data.access_token, revenuePeriod);
                }
                return;
              }
            }
          } catch {
            // fallback to login below
          }
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          if (!cancelled) router.replace("/");
          return;
        }
        if (!cancelled) setError("No se pudieron cargar los datos");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token, revenuePeriod, router]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      await refreshUpcomingAppointments(token);
    };

    const interval = window.setInterval(tick, 8000);
    tick();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token]);

  async function createService(e: FormEvent) {
    e.preventDefault();
    if (!token) return;

    const res = await fetch("/api/v1/businesses/me/services", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        name: newServiceName,
        duration_min: newServiceDuration,
        buffer_before_min: 0,
        buffer_after_min: 0,
        price_amount_cents: Math.max(0, Math.round(newServicePrice * 100)),
        price_currency: "ARS",
        is_active: true,
      }),
    });

    if (!res.ok) {
      setError("No se pudo crear el servicio");
      return;
    }

    setNewServiceName("Corte");
    setNewServiceDuration(30);
    setNewServicePrice(0);
    await fetchAll(token, revenuePeriod);
  }

  async function toggleService(service: Service) {
    if (!token) return;
    const res = await fetch(`/api/v1/businesses/me/services/${service.id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ is_active: !service.is_active }),
    });

    if (!res.ok) {
      setError("No se pudo actualizar el servicio");
      return;
    }

    await fetchAll(token, revenuePeriod);
  }

  async function deleteService(service: Service) {
    if (!token) return;
    const ok = window.confirm(`Eliminar servicio "${service.name}"?`);
    if (!ok) return;

    const res = await fetch(`/api/v1/businesses/me/services/${service.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      setError("No se pudo eliminar el servicio");
      return;
    }

    await fetchAll(token, revenuePeriod);
  }

  async function updateServicePrice(service: Service) {
    if (!token) return;
    const raw = servicePriceDrafts[service.id] ?? "0";
    const asNumber = Number(raw);
    if (!Number.isFinite(asNumber) || asNumber < 0) {
      setError("El precio debe ser un numero mayor o igual a 0");
      return;
    }

    const res = await fetch(`/api/v1/businesses/me/services/${service.id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({
        price_amount_cents: Math.round(asNumber * 100),
        price_currency: service.price_currency || "ARS",
      }),
    });

    if (!res.ok) {
      setError("No se pudo actualizar el precio del servicio");
      return;
    }

    await fetchAll(token, revenuePeriod);
  }

  async function createRule(e: FormEvent) {
    e.preventDefault();
    if (!token) return;

    const res = await fetch("/api/v1/businesses/me/availability-rules", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        staff_user_id: ruleStaff || null,
        day_of_week: ruleDow,
        start_local: ruleStart,
        end_local: ruleEnd,
        slot_step_min: ruleStep,
      }),
    });

    if (!res.ok) {
      setError("No se pudo crear la regla");
      return;
    }

    await fetchAll(token, revenuePeriod);
  }

  async function createStaff(e: FormEvent) {
    e.preventDefault();
    if (!token) return;

    const res = await fetch("/api/v1/businesses/me/staff", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        full_name: newStaffName,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error?.message ?? "No se pudo crear el barbero");
      return;
    }

    setNewStaffName("");
    await fetchAll(token, revenuePeriod);
  }

  async function createException(e: FormEvent) {
    e.preventDefault();
    if (!token) return;

    const payload: Record<string, unknown> = {
      exception_date: exDate,
      kind: exKind,
      reason: exReason || null,
      staff_user_id: null,
    };

    if (exKind !== "closed_full_day") {
      payload.start_local = exStart;
      payload.end_local = exEnd;
    }

    const res = await fetch("/api/v1/businesses/me/availability-exceptions", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      setError("No se pudo crear la excepción");
      return;
    }

    await fetchAll(token, revenuePeriod);
  }

  async function updateBusinessPublicName(e: FormEvent) {
    e.preventDefault();
    if (!token) return;

    const nextName = businessNameDraft.trim();
    if (!nextName || nextName === businessName) return;

    const res = await fetch("/api/v1/businesses/me", {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ name: nextName }),
    });

    if (!res.ok) {
      setError("No se pudo actualizar el nombre publico");
      return;
    }

    await fetchAll(token, revenuePeriod);
  }

  async function saveWhatsAppSettings(e: FormEvent) {
    e.preventDefault();
    if (!token) return;

    const payload: Record<string, unknown> = {
      enabled: whatsEnabled,
      phone_number_id: whatsPhoneNumberId,
    };

    if (whatsApiToken.trim()) payload.api_token = whatsApiToken.trim();

    const res = await fetch("/api/v1/businesses/me/notifications/whatsapp", {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      setError("No se pudo guardar la configuracion de WhatsApp");
      return;
    }

    await fetchAll(token, revenuePeriod);
  }

  async function cancelAppointmentAsOwner(appointmentId: string) {
    if (!token) return;
    const ok = window.confirm("Cancelar este turno?");
    if (!ok) return;

    const res = await fetch(`/api/v1/businesses/me/appointments/${appointmentId}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      setError("No se pudo cancelar el turno");
      return;
    }

    await fetchAll(token, revenuePeriod);
  }

  function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    router.replace("/");
  }

  if (!token) return null;

  const publicUrl = slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/b/${slug}` : "";

  return (
    <main className="container dashboard-grid">
      <section className="card panel-head hero-strip">
        <p className="eyebrow">Consola de Negocio</p>
        <h1>Sistema Barberia</h1>
        <p>
          Nombre publico del negocio: <strong>{businessName || "-"}</strong>
        </p>
        <div className="meta-pills">
          <span className="pill">Timezone: {timezone || "-"}</span>
          <span className="pill">Slug: {slug || "-"}</span>
          <span className="pill">Servicios: {services.length}</span>
          <span className="pill">Barberos: {staff.length}</span>
        </div>
        <div className="row-actions">
          {slotPreviewLink ? <a href={slotPreviewLink} target="_blank" rel="noreferrer">Abrir pagina de reservas</a> : null}
          <button onClick={logout} className="btn-ghost">Cerrar sesión</button>
        </div>
        <div className="inline-form" style={{ marginTop: "0.65rem" }}>
          <input value={publicUrl} readOnly placeholder="Link publico" />
          <span />
          <button
            type="button"
            onClick={() => {
              if (!publicUrl) return;
              navigator.clipboard.writeText(publicUrl).catch(() => undefined);
            }}
          >
            Copiar link para publicar
          </button>
        </div>
        <form onSubmit={updateBusinessPublicName} className="inline-form" style={{ marginTop: "0.75rem" }}>
          <input
            value={businessNameDraft}
            onChange={(e) => setBusinessNameDraft(e.target.value)}
            placeholder="Ej: Peluqueria El Pelo"
            minLength={2}
            maxLength={120}
            required
          />
          <span />
          <button type="submit">Guardar nombre publico</button>
        </form>
        {error ? <p className="error-msg">{error}</p> : null}
        {loading ? <p>Cargando...</p> : null}
      </section>

      <section className="card surface">
        <div className="section-head">
          <h2>Servicios</h2>
          <small>Configura corte, coloracion, barberia y otros servicios.</small>
        </div>
        <form onSubmit={createService} className="grid-form compact">
          <input value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} placeholder="Corte, Coloración, Barbería" />
          <input
            value={newServiceDuration}
            onChange={(e) => setNewServiceDuration(Number(e.target.value))}
            type="number"
            min={5}
            max={480}
          />
          <input
            value={newServicePrice}
            onChange={(e) => setNewServicePrice(Number(e.target.value))}
            type="number"
            min={0}
            step="0.01"
            placeholder="Precio ARS"
          />
          <button type="submit">Agregar</button>
        </form>
        <ul className="list-clean">
          {services.map((service) => (
            <li key={service.id} className="list-row">
              <div>
                <strong>
                  {service.name} ({service.duration_min} min)
                </strong>
                <div style={{ marginTop: "0.3rem" }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}>
                    <span>Precio</span>
                    <input
                      style={{ width: "110px" }}
                      type="number"
                      min={0}
                      step="0.01"
                      value={servicePriceDrafts[service.id] ?? String((service.price_amount_cents ?? 0) / 100)}
                      onChange={(e) =>
                        setServicePriceDrafts((prev) => ({
                          ...prev,
                          [service.id]: e.target.value,
                        }))
                      }
                    />
                    <span>{service.price_currency ?? "ARS"}</span>
                  </label>
                </div>
              </div>
              <div className="row-actions">
                <button onClick={() => updateServicePrice(service)}>Guardar precio</button>
                <button onClick={() => toggleService(service)}>{service.is_active ? "Desactivar" : "Activar"}</button>
                <button onClick={() => deleteService(service)} className="btn-ghost">Eliminar</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card surface">
        <div className="section-head">
          <h2>Barberos / Staff</h2>
          <small>Equipo habilitado para recibir reservas.</small>
        </div>
        <form onSubmit={createStaff} className="grid-form compact" style={{ marginBottom: "0.8rem" }}>
          <label>
            Nombre
            <input
              value={newStaffName}
              onChange={(e) => setNewStaffName(e.target.value)}
              placeholder="Ej: Juan Perez"
              required
              minLength={2}
            />
          </label>
          <button type="submit">Agregar barbero</button>
        </form>
        <ul className="list-clean">
          {staff.map((s) => (
            <li key={s.id} className="list-row">
              <span>{s.full_name}</span>
              <small>{s.role}</small>
            </li>
          ))}
        </ul>
      </section>

      <section className="card surface">
        <div className="section-head">
          <h2>Disponibilidad semanal</h2>
          <small>Define la jornada base por dia y profesional.</small>
        </div>
        <form onSubmit={createRule} className="grid-form compact">
          <label>
            Barbero
            <select value={ruleStaff} onChange={(e) => setRuleStaff(e.target.value)}>
              <option value="">General</option>
              {staff.map((s) => (
                <option value={s.id} key={s.id}>{s.full_name}</option>
              ))}
            </select>
          </label>
          <label>
            Día
            <select value={ruleDow} onChange={(e) => setRuleDow(Number(e.target.value))}>
              {DOW.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            Inicio
            <input type="time" value={ruleStart} onChange={(e) => setRuleStart(e.target.value)} />
          </label>
          <label>
            Fin
            <input type="time" value={ruleEnd} onChange={(e) => setRuleEnd(e.target.value)} />
          </label>
          <label>
            Paso slot (min)
            <input type="number" value={ruleStep} onChange={(e) => setRuleStep(Number(e.target.value))} min={5} max={60} />
          </label>
          <button type="submit">Guardar regla</button>
        </form>
        <ul className="list-clean">
          {rules.map((r) => (
            <li key={r.id}>
              {DOW[r.day_of_week]} {r.start_local.slice(0, 5)}-{r.end_local.slice(0, 5)} | step {r.slot_step_min}m
            </li>
          ))}
        </ul>
      </section>

      <section className="card surface">
        <div className="section-head">
          <h2>Excepciones / Bloqueos</h2>
          <small>Cierres, aperturas especiales y bloqueos manuales.</small>
        </div>
        <form onSubmit={createException} className="grid-form compact">
          <label>
            Fecha
            <input type="date" value={exDate} onChange={(e) => setExDate(e.target.value)} required />
          </label>
          <label>
            Tipo
            <select value={exKind} onChange={(e) => setExKind(e.target.value)}>
              <option value="closed_full_day">Cierre total</option>
              <option value="closed_partial">Cierre parcial</option>
              <option value="open_special">Apertura especial</option>
              <option value="manual_block">Bloqueo manual</option>
            </select>
          </label>
          <label>
            Inicio
            <input type="time" value={exStart} onChange={(e) => setExStart(e.target.value)} disabled={exKind === "closed_full_day"} />
          </label>
          <label>
            Fin
            <input type="time" value={exEnd} onChange={(e) => setExEnd(e.target.value)} disabled={exKind === "closed_full_day"} />
          </label>
          <label>
            Motivo
            <input value={exReason} onChange={(e) => setExReason(e.target.value)} placeholder="Feriado, capacitación..." />
          </label>
          <button type="submit">Guardar excepción</button>
        </form>
        <ul className="list-clean">
          {exceptions.map((ex) => (
            <li key={ex.id}>
              {ex.exception_date} - {ex.kind}
              {ex.start_local && ex.end_local ? ` (${ex.start_local.slice(0, 5)}-${ex.end_local.slice(0, 5)})` : ""}
              {ex.reason ? ` - ${ex.reason}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section className="card surface">
        <div className="section-head">
          <h2>Resumen</h2>
          <small>Ingresos y turnos finalizados del periodo.</small>
        </div>
        <div className="row-actions" style={{ marginBottom: "0.65rem" }}>
          <button
            type="button"
            className={revenuePeriod === "weekly" ? "" : "btn-ghost"}
            onClick={() => setRevenuePeriod("weekly")}
          >
            Semanal
          </button>
          <button
            type="button"
            className={revenuePeriod === "monthly" ? "" : "btn-ghost"}
            onClick={() => setRevenuePeriod("monthly")}
          >
            Mensual
          </button>
        </div>
        <div className="summary-grid">
          <article className="summary-card">
            <small>Turnos completados</small>
            <strong>{revenueSummary?.total_appointments ?? 0}</strong>
          </article>
          <article className="summary-card">
            <small>Ingresos del periodo</small>
            <strong>{formatMoney(revenueSummary?.total_revenue_cents ?? 0, revenueSummary?.currency ?? "ARS")}</strong>
          </article>
        </div>
        <ul className="list-clean summary-scroll" style={{ marginTop: "0.75rem" }}>
          {(revenueSummary?.by_service ?? []).map((item) => (
            <li key={item.service_name} className="list-row">
              <span>
                {item.service_name} ({item.appointments})
              </span>
              <strong>{formatMoney(item.revenue_cents, item.currency || revenueSummary?.currency || "ARS")}</strong>
            </li>
          ))}
          {(revenueSummary?.by_service?.length ?? 0) === 0 ? <li>No hay turnos completados en este periodo.</li> : null}
        </ul>
      </section>

      <section className="card surface">
        <div className="section-head">
          <h2>Turnos proximos</h2>
          <small>Resumen de agenda confirmada.</small>
        </div>
        <ul className="list-clean upcoming-scroll">
          {appointments.map((a) => (
            <li key={a.id} className="list-row">
              <span>
                <strong>{new Date(a.start_at).toLocaleString()}</strong> - {a.service_name} - {a.customer_name} -{" "}
                {a.customer_phone || "Sin telefono"} ({a.status})
              </span>
              <button className="btn-ghost" onClick={() => cancelAppointmentAsOwner(a.id)}>Cancelar</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card surface">
        <div className="section-head">
          <h2>Notificaciones WhatsApp</h2>
          <small>Configura el envio automatico de confirmaciones al cliente.</small>
        </div>
        <form onSubmit={saveWhatsAppSettings} className="grid-form">
          <label>
            Habilitar WhatsApp
            <select value={whatsEnabled ? "yes" : "no"} onChange={(e) => setWhatsEnabled(e.target.value === "yes")}>
              <option value="yes">Si</option>
              <option value="no">No</option>
            </select>
          </label>
          <label>
            Phone Number ID (Meta)
            <input
              value={whatsPhoneNumberId}
              onChange={(e) => setWhatsPhoneNumberId(e.target.value)}
              placeholder="123456789012345"
            />
          </label>
          <label>
            API Token (Meta WhatsApp Cloud)
            <input
              value={whatsApiToken}
              onChange={(e) => setWhatsApiToken(e.target.value)}
              placeholder={whatsHasToken ? "Token guardado (deja vacio para mantener)" : "Pega tu token"}
            />
          </label>
          <button type="submit">Guardar configuracion WhatsApp</button>
        </form>
        <p>{whatsHasToken ? "Token guardado en el negocio." : "Aun no hay token guardado."}</p>
      </section>
    </main>
  );
}
