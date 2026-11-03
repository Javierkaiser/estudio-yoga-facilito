import { useState, type FormEvent } from 'react';
import {
  WEEKDAYS,
  type ClassTemplate,
  type CreateTemplateInput,
  type Instructor,
  type UpdateTemplateInput,
} from '../api';

interface TemplateFormProps {
  busy: boolean;
  error: string | null;
  instructors: Instructor[];
  template?: ClassTemplate | null;
  onSubmit: (input: CreateTemplateInput | UpdateTemplateInput) => void;
  onCancel: () => void;
}

export function TemplateForm({
  busy,
  error,
  instructors,
  template,
  onSubmit,
  onCancel,
}: TemplateFormProps) {
  const [weekday, setWeekday] = useState(template?.weekday ?? 2);
  const [startTime, setStartTime] = useState(template ? template.start_time.slice(0, 5) : '18:00');
  const [durationMinutes, setDurationMinutes] = useState(String(template?.duration_minutes ?? 60));
  const [capacity, setCapacity] = useState(String(template?.capacity ?? 12));
  const [instructorId, setInstructorId] = useState(
    template?.instructor_id ?? instructors[0]?.id ?? '',
  );
  const [active, setActive] = useState(template?.active ?? true);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = {
      weekday,
      startTime,
      durationMinutes: Number(durationMinutes),
      capacity: Number(capacity),
      instructorId,
    };
    onSubmit(template ? { ...input, active } : input);
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <p className="form-intro">
        Una plantilla se repite cada semana. Cada sesión generada guarda su propio cupo e
        instructora, así que los cambios posteriores no alteran lo ya agendado.
      </p>

      <div className="field-row">
        <label className="field">
          <span>Día de la semana</span>
          <select value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>
            {WEEKDAYS.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Hora local</span>
          <input
            required
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
          <small>Buenos Aires. Se almacena convertida a UTC.</small>
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Duración en minutos</span>
          <input
            required
            min={1}
            step={1}
            type="number"
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Cupo</span>
          <input
            required
            min={1}
            step={1}
            type="number"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </label>
      </div>

      <label className="field">
        <span>Instructora</span>
        <select
          required
          value={instructorId}
          onChange={(event) => setInstructorId(event.target.value)}
        >
          {instructors.length === 0 && <option value="">Sin instructoras activas</option>}
          {instructors.map((instructor) => (
            <option key={instructor.id} value={instructor.id}>
              {instructor.name}
            </option>
          ))}
        </select>
        <small>Solo se listan instructoras activas con rol de instructora.</small>
      </label>

      {template && (
        <label className="check-field">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
          />
          <span>
            <strong>Plantilla activa</strong>
            <small>Una plantilla inactiva no permite generar sesiones nuevas.</small>
          </span>
        </label>
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
        <button
          type="submit"
          className="button primary"
          disabled={busy || instructors.length === 0}
        >
          {busy ? 'Guardando…' : template ? 'Guardar cambios' : 'Crear plantilla'}
        </button>
      </div>
    </form>
  );
}
