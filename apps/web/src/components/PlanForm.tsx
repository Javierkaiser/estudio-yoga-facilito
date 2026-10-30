import { useState, type FormEvent } from 'react';
import type { CreatePlanInput } from '../api';

interface PlanFormProps {
  busy: boolean;
  error: string | null;
  onSubmit: (input: CreatePlanInput) => void;
  onCancel: () => void;
}

export function PlanForm({ busy, error, onSubmit, onCancel }: PlanFormProps) {
  const [name, setName] = useState('');
  const [credits, setCredits] = useState('10');
  const [noExpiry, setNoExpiry] = useState(false);
  const [validityDays, setValidityDays] = useState('90');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      credits: Number(credits),
      validityDays: noExpiry ? null : Number(validityDays),
    });
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <p className="form-intro">
        Un plan define cuántos créditos compra una persona y en cuántos días vencen. No contiene
        precios ni información de pago.
      </p>

      <label className="field">
        <span>Nombre del plan</span>
        <input
          autoFocus
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Plan de 10 clases"
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Créditos</span>
          <input
            required
            min={1}
            step={1}
            type="number"
            value={credits}
            onChange={(event) => setCredits(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Vigencia en días</span>
          <input
            required={!noExpiry}
            min={1}
            step={1}
            type="number"
            value={validityDays}
            disabled={noExpiry}
            onChange={(event) => setValidityDays(event.target.value)}
          />
        </label>
      </div>

      <label className="check-field">
        <input
          type="checkbox"
          checked={noExpiry}
          onChange={(event) => setNoExpiry(event.target.checked)}
        />
        <span>
          <strong>Sin vencimiento</strong>
          <small>Los créditos del plan no vencen automáticamente.</small>
        </span>
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
          {busy ? 'Creando…' : 'Crear plan'}
        </button>
      </div>
    </form>
  );
}
