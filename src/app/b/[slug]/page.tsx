"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

type PublicService = {
  id: string;
  name: string;
  duration_min: number;
  buffer_before_min: number;
  buffer_after_min: number;
  price_amount_cents: number;
  price_currency: string;
};

type PublicStaff = {
  id: string;
  full_name: string;
};

type Slot = {
  start_at: string;
  end_at: string;
  staff_user_id: string | null;
};

type PublicConfigResponse = {
  business: { name: string; slug: string; timezone: string };
  services: PublicService[];
  staff: PublicStaff[];
};

type CreateAppointmentResponse = {
  appointment_id: string;
  status: string;
  scheduled_start_at?: string;
  whatsapp_notification_sent?: boolean;
  whatsapp_reason?: string | null;
};

type LookupAppointment = {
  appointment_id: string;
  service_id: string;
  staff_user_id: string | null;
  status: string;
  scheduled_start_at: string;
  service_name: string;
  staff_name: string | null;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoToLocalDateTimeInput(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function localDateTimeInputToIso(localValue: string) {
  return new Date(localValue).toISOString();
}

export default function PublicBookingPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [businessName, setBusinessName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [services, setServices] = useState<PublicService[]>([]);
  const [staff, setStaff] = useState<PublicStaff[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [fromDate, setFromDate] = useState(toDateInput(new Date()));
  const [toDate, setToDate] = useState(toDateInput(addDays(new Date(), 7)));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [manageMessage, setManageMessage] = useState("");
  const [manageError, setManageError] = useState("");
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupAppointments, setLookupAppointments] = useState<LookupAppointment[]>([]);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const [manageScheduledAtLocal, setManageScheduledAtLocal] = useState("");
  const [managePhone, setManagePhone] = useState("");
  const [loading, setLoading] = useState(false);
  const confirmationRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!slug) return;

    setLoading(true);
    fetch(`/api/v1/public/b/${slug}/config`)
      .then(async (res) => {
        const data = (await res.json()) as PublicConfigResponse;
        if (!res.ok) throw new Error("No se pudo cargar la configuración pública");
        setBusinessName(data.business.name);
        setTimezone(data.business.timezone);
        setServices(data.services);
        setStaff(data.staff);
        if (data.services[0]) setServiceId(data.services[0].id);
        if (data.staff.length === 1) {
          setStaffId(data.staff[0].id);
        } else {
          setStaffId("");
        }
      })
      .catch(() => setError("No se pudo cargar la página de reservas"))
      .finally(() => setLoading(false));
  }, [slug]);

  async function searchSlots(options?: { keepMessage?: boolean }) {
    if (!slug || !serviceId) return;
    setError("");
    if (!options?.keepMessage) setMessage("");

    const query = new URLSearchParams({
      from: fromDate,
      to: toDate,
      service_id: serviceId,
    });

    if (staffId) query.set("staff_user_id", staffId);

    const res = await fetch(`/api/v1/public/b/${slug}/slots?${query.toString()}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error?.message ?? "No se pudieron cargar slots");
      return;
    }

    setSlots(data.slots ?? []);
    setSelectedSlot("");
  }

  async function createAppointment(e: FormEvent) {
    e.preventDefault();
    if (!slug || !serviceId || !selectedSlot) return;

    setError("");
    setMessage("");

    const res = await fetch(`/api/v1/public/b/${slug}/appointments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        service_id: serviceId,
        staff_user_id: staffId || undefined,
        start_at: selectedSlot,
        customer_name: customerName,
        customer_phone: customerPhone,
      }),
    });

    const data = (await res.json()) as CreateAppointmentResponse & { error?: { message?: string } };
    if (!res.ok) {
      setError(data?.error?.message ?? "No se pudo crear el turno");
      return;
    }

    setMessage("Turno confirmado. Tu reserva quedó agendada.");
    setLookupPhone(customerPhone);
    setManageScheduledAtLocal(isoToLocalDateTimeInput(data.scheduled_start_at ?? selectedSlot));
    setManagePhone(customerPhone);
    setSelectedAppointmentId(data.appointment_id);
    setCustomerName("");
    setCustomerPhone("");
    setSelectedSlot("");
    requestAnimationFrame(() => {
      confirmationRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    await searchSlots({ keepMessage: true });
  }

  async function lookupAppointmentsByPhone() {
    if (!slug || !lookupPhone) return;
    setManageError("");
    setManageMessage("");
    setLookupLoading(true);
    setLookupAppointments([]);

    const query = new URLSearchParams({ phone: lookupPhone });
    const res = await fetch(`/api/v1/public/b/${slug}/appointments/by-phone?${query.toString()}`);
    const data = (await res.json()) as { appointments?: LookupAppointment[]; error?: { message?: string } };
    setLookupLoading(false);

    if (!res.ok) {
      setManageError(data?.error?.message ?? "No se pudieron buscar turnos.");
      return;
    }

    const rows = data.appointments ?? [];
    setLookupAppointments(rows);
    if (!rows.length) {
      setManageError("No encontramos turnos activos con ese telefono.");
      return;
    }

    const first = rows[0];
    setSelectedAppointmentId(first.appointment_id);
    setManagePhone(lookupPhone);
    setManageScheduledAtLocal(isoToLocalDateTimeInput(first.scheduled_start_at));
    setServiceId(first.service_id);
    setStaffId(first.staff_user_id ?? "");
    setManageMessage("Selecciona tu turno y luego cancela o reprograma.");
  }

  function selectAppointmentForManage(appt: LookupAppointment) {
    setSelectedAppointmentId(appt.appointment_id);
    setManageScheduledAtLocal(isoToLocalDateTimeInput(appt.scheduled_start_at));
    setServiceId(appt.service_id);
    setStaffId(appt.staff_user_id ?? "");
    setManageMessage("Turno seleccionado. Si quieres reprogramar, busca un nuevo horario y confirma.");
    setManageError("");
  }

  async function manageAppointment(action: "cancel" | "reschedule") {
    if (!slug || !manageScheduledAtLocal || !managePhone) return;
    setManageError("");
    setManageMessage("");

    const payload: Record<string, unknown> = {
      action,
      scheduled_start_at: localDateTimeInputToIso(manageScheduledAtLocal),
      customer_phone: managePhone,
    };

    if (selectedAppointmentId) payload.appointment_id = selectedAppointmentId;

    if (action === "reschedule") {
      if (!selectedSlot) {
        setManageError("Para reprogramar, primero selecciona un horario disponible.");
        return;
      }
      payload.new_start_at = selectedSlot;
    }

    const res = await fetch(`/api/v1/public/b/${slug}/appointments/manage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as { error?: { message?: string } };
    if (!res.ok) {
      setManageError(data?.error?.message ?? "No se pudo gestionar el turno.");
      return;
    }

    if (action === "cancel") {
      setManageMessage("Turno cancelado correctamente.");
      setLookupAppointments((prev) => prev.filter((a) => a.appointment_id !== selectedAppointmentId));
      setSelectedAppointmentId("");
    } else {
      setManageMessage("Turno reprogramado correctamente.");
      setManageScheduledAtLocal(isoToLocalDateTimeInput(selectedSlot));
      setSelectedSlot("");
    }

    await searchSlots({ keepMessage: true });
  }

  const selectedService = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);

  return (
    <main className="container public-grid">
      <section className="card hero-strip">
        <p className="eyebrow">Reserva Online</p>
        <h1>{businessName || "Agenda online"}</h1>
        <p>
          Reserva tu turno en minutos, sin llamadas ni esperas.
        </p>
        <div className="meta-pills">
          <span className="pill">Timezone: {timezone || "-"}</span>
          <span className="pill">Servicios: {services.length}</span>
          <span className="pill">Barberos: {staff.length}</span>
        </div>

        <div className="grid-form compact">
          <label>
            Servicio
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.duration_min} min) - {formatMoney(s.price_amount_cents ?? 0, s.price_currency ?? "ARS")}
                </option>
              ))}
            </select>
          </label>

          <label>
            Barbero
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Cualquier profesional</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Desde
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>

          <label>
            Hasta
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
        </div>

        <div className="cta-row">
          <button onClick={() => searchSlots()} disabled={loading || !serviceId}>
            {loading ? "Buscando..." : "Buscar disponibilidad"}
          </button>
        </div>
        {selectedService ? (
          <p>
            Duración estimada: {selectedService.duration_min} minutos | Precio:{" "}
            {formatMoney(selectedService.price_amount_cents ?? 0, selectedService.price_currency ?? "ARS")}
          </p>
        ) : null}
        {error ? <p className="error-msg">{error}</p> : null}
        {message ? <p className="ok-msg">{message}</p> : null}
      </section>

      <section className="card surface slots-panel">
        <div className="section-head">
          <h2>Horarios disponibles</h2>
          <small>Selecciona el turno que mejor te quede.</small>
        </div>
        {slots.length === 0 ? <p>No hay horarios disponibles para ese rango. Prueba con otras fechas.</p> : null}
        <div className="slot-grid slots-scroll">
          {slots.map((slot) => {
            const label = new Date(slot.start_at).toLocaleString();
            return (
              <button
                key={slot.start_at}
                className={selectedSlot === slot.start_at ? "slot-btn selected" : "slot-btn"}
                onClick={() => setSelectedSlot(slot.start_at)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card surface booking-panel">
        <div className="section-head">
          <h2>Confirmar reserva</h2>
          <small>Completa tus datos para bloquear el horario.</small>
        </div>
        <form onSubmit={createAppointment} className="grid-form">
          <label>
            Nombre
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required minLength={2} />
          </label>
          <label>
            Teléfono
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} required minLength={8} />
          </label>
          <p>
            Horario elegido:{" "}
            <strong>
              {selectedSlot ? new Date(selectedSlot).toLocaleString() : "Selecciona un horario disponible"}
            </strong>
          </p>
          <button type="submit" disabled={!selectedSlot || !serviceId || !customerName || !customerPhone}>Confirmar turno</button>
        </form>
        {message ? (
          <div className="confirmation-banner" ref={confirmationRef}>
            <strong>Reserva confirmada</strong>
            <p>{message}</p>
          </div>
        ) : null}
      </section>

      <section className="card surface">
        <div className="section-head">
          <h2>Gestionar turno existente</h2>
          <small>Busca por teléfono, elige tu turno y luego cancela o reprograma.</small>
        </div>
        <div className="grid-form compact">
          <label>
            Tu teléfono
            <input
              value={lookupPhone}
              onChange={(e) => setLookupPhone(e.target.value)}
              placeholder="+54911..."
            />
          </label>
          <button type="button" onClick={() => lookupAppointmentsByPhone()} disabled={!lookupPhone || lookupLoading}>
            {lookupLoading ? "Buscando..." : "Buscar mis turnos"}
          </button>
        </div>
        <div className="manage-list">
          {lookupAppointments.map((appt) => (
            <button
              type="button"
              key={appt.appointment_id}
              className={selectedAppointmentId === appt.appointment_id ? "slot-btn selected" : "slot-btn"}
              onClick={() => selectAppointmentForManage(appt)}
            >
              <strong>{new Date(appt.scheduled_start_at).toLocaleString()}</strong>
              <div>{appt.service_name}{appt.staff_name ? ` · ${appt.staff_name}` : ""}</div>
            </button>
          ))}
        </div>
        <div className="grid-form compact" style={{ marginTop: "0.75rem" }}>
          <label>
            Horario programado
            <input
              type="datetime-local"
              value={manageScheduledAtLocal}
              onChange={(e) => setManageScheduledAtLocal(e.target.value)}
            />
          </label>
          <label>
            Teléfono usado en la reserva
            <input
              value={managePhone}
              onChange={(e) => setManagePhone(e.target.value)}
              placeholder="+54911..."
            />
          </label>
        </div>
        <div className="row-actions manage-actions">
          <button type="button" className="btn-ghost" onClick={() => manageAppointment("cancel")}>Cancelar turno</button>
          <button type="button" onClick={() => manageAppointment("reschedule")}>Reprogramar al horario elegido</button>
        </div>
        {manageError ? <p className="error-msg">{manageError}</p> : null}
        {manageMessage ? <p className="ok-msg">{manageMessage}</p> : null}
      </section>
    </main>
  );
}
