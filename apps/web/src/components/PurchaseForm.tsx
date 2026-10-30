import { useState, type FormEvent } from 'react';
import type { Plan, PurchaseInput } from '../api';

interface PurchaseFormProps {
  studentId: string;
  studentName: string;
  plans: Plan[];
  busy: boolean;
  error: string | null;
  onSubmit: (input: PurchaseInput) => void;
  onCancel: () => void;
}

export function PurchaseForm({
  studentId,
  studentName,
  plans,
  busy,
  error,
  onSubmit,
  onCancel,
}: PurchaseFormProps) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? '');
  const selectedPlan = plans.find((plan) => plan.id === planId);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!planId) return;
    onSubmit({ studentId, planId });
  };

  if (plans.length === 0) {
    return (
      <div className="form">
        <p className="form-intro">
          Todavía no hay planes activos. Creá un plan antes de registrar una compra para{' '}
          <strong>{studentName}</strong>.
        </p>
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
        Se registra una compra para <strong>{studentName}</strong>. El saldo inicial es la cantidad
        de créditos del plan.
      </p>

      <label className="field">
        <span>Plan</span>
        <select
          autoFocus
          value={planId}
          onChange={(event) => setPlanId(event.target.value)}
          required
        >
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} · {plan.credits} créditos
            </option>
          ))}
        </select>
      </label>

      {selectedPlan && (
        <div className="form-summary">
          <span>Saldo inicial</span>
          <strong>{selectedPlan.credits} créditos</strong>
          <small>
            {selectedPlan.validity_days === null
              ? 'Sin vencimiento'
              : `Vence a los ${selectedPlan.validity_days} días`}
          </small>
        </div>
      )}

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
          {busy ? 'Registrando…' : 'Comprar paquete'}
        </button>
      </div>
    </form>
  );
}
