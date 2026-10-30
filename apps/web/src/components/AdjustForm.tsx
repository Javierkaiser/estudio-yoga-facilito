import { useState, type FormEvent } from 'react';
import type { AdjustInput, StudentPackage } from '../api';

interface AdjustFormProps {
  packages: StudentPackage[];
  initialPackageId?: string;
  busy: boolean;
  error: string | null;
  onSubmit: (input: AdjustInput) => void;
  onCancel: () => void;
}

export function AdjustForm({
  packages,
  initialPackageId,
  busy,
  error,
  onSubmit,
  onCancel,
}: AdjustFormProps) {
  const fallback = packages.find((pkg) => pkg.status === 'active') ?? packages[0];
  const [packageId, setPackageId] = useState(initialPackageId ?? fallback?.id ?? '');
  const [delta, setDelta] = useState('1');
  const [reason, setReason] = useState('');
  const selectedPackage = packages.find((pkg) => pkg.id === packageId);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!packageId) return;
    onSubmit({ packageId, delta: Number(delta), reason: reason.trim() });
  };

  if (packages.length === 0) {
    return (
      <div className="form">
        <p className="form-intro">Este perfil todavía no tiene paquetes para ajustar.</p>
        <div className="form-actions">
          <button type="button" className="button ghost" onClick={onCancel}>
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <p className="form-intro">
        El ajuste crea un movimiento nuevo. No edita ni borra movimientos anteriores. Usá un número
        negativo para restar créditos.
      </p>

      <label className="field">
        <span>Paquete</span>
        <select
          autoFocus
          value={packageId}
          onChange={(event) => setPackageId(event.target.value)}
          required
        >
          {packages.map((pkg) => (
            <option key={pkg.id} value={pkg.id}>
              {pkg.plan_name} · saldo {pkg.balance}
            </option>
          ))}
        </select>
      </label>

      {selectedPackage && (
        <div className="form-summary">
          <span>Saldo actual</span>
          <strong>{selectedPackage.balance} créditos</strong>
          <small>
            {selectedPackage.expires_at
              ? `Vence el ${selectedPackage.expires_at.slice(0, 10)}`
              : 'Sin vencimiento'}
          </small>
        </div>
      )}

      <div className="field-row">
        <label className="field">
          <span>Créditos a sumar o restar</span>
          <input
            required
            step={1}
            type="number"
            value={delta}
            onChange={(event) => setDelta(event.target.value)}
          />
        </label>
      </div>

      <label className="field">
        <span>Motivo</span>
        <textarea
          required
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Ej.: compensación por una clase cancelada"
        />
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button type="button" className="button ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'Registrando…' : 'Registrar ajuste'}
        </button>
      </div>
    </form>
  );
}
