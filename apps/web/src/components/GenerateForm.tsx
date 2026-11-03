import { useState, type FormEvent } from 'react';
import {
  addDaysToInput,
  studioTodayInput,
  templateTimeLabel,
  weekdayLabel,
  type ClassTemplate,
  type GenerateSessionsInput,
} from '../api';

interface GenerateFormProps {
  busy: boolean;
  error: string | null;
  templates: ClassTemplate[];
  initialTemplateId?: string;
  onSubmit: (templateId: string, input: GenerateSessionsInput) => void;
  onCancel: () => void;
}

export function GenerateForm({
  busy,
  error,
  templates,
  initialTemplateId,
  onSubmit,
  onCancel,
}: GenerateFormProps) {
  const today = studioTodayInput();
  const [templateId, setTemplateId] = useState(
    initialTemplateId ?? templates.find((template) => template.active)?.id ?? '',
  );
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDaysToInput(today, 27));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(templateId, { from, to });
  };

  const selected = templates.find((template) => template.id === templateId);

  return (
    <form className="form" onSubmit={handleSubmit}>
      <p className="form-intro">
        Se crean las sesiones futuras de una plantilla dentro del rango. Volver a generar el mismo
        rango no duplica nada: las sesiones existentes se conservan tal como están.
      </p>

      <label className="field">
        <span>Plantilla</span>
        <select required value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
          {templates.length === 0 && <option value="">Sin plantillas activas</option>}
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {weekdayLabel(template.weekday)} {templateTimeLabel(template.start_time)} ·{' '}
              {template.instructor_name}
            </option>
          ))}
        </select>
      </label>

      {selected && (
        <div className="form-summary">
          <span>Se va a generar</span>
          <strong>
            {weekdayLabel(selected.weekday)} {templateTimeLabel(selected.start_time)}
          </strong>
          <small>
            {selected.duration_minutes} minutos · cupo {selected.capacity} ·{' '}
            {selected.instructor_name}
          </small>
        </div>
      )}

      <div className="field-row">
        <label className="field">
          <span>Desde</span>
          <input
            required
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Hasta</span>
          <input
            required
            type="date"
            min={from}
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
      </div>

      <p className="form-note">
        El rango máximo es de 26 semanas. Las fechas que ya pasaron se informan como omitidas.
      </p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button type="button" className="button ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="submit" className="button primary" disabled={busy || templates.length === 0}>
          {busy ? 'Generando…' : 'Generar sesiones'}
        </button>
      </div>
    </form>
  );
}
