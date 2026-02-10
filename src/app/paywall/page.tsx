export default function PaywallPage() {
  return (
    <main className="container">
      <div className="card hero-strip">
        <p className="eyebrow">Suscripcion</p>
        <h1>Tu periodo de acceso finalizo</h1>
        <p>Para seguir recibiendo reservas online, activa tu suscripcion mensual.</p>
        <div className="row-actions">
          <a href="/dashboard">Ir al panel</a>
        </div>
      </div>
    </main>
  );
}
