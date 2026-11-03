import { useState, type FormEvent } from 'react';
import {
  formatSessionDayLabel,
  formatSessionTime,
  type ClassSession,
  type EditSessionInput,
  type Instructor,
} from '../api';

interface SessionFormProps {
  busy: boolean;
  error: string | null;
  session: ClassSession;
  instructors: Instructor[];
  onSubmit: (input: EditSessionInput) => void;
  onCancel: () => void;
}

export function SessionForm({
  busy,
  error,
  session,
  instructors,
  onSubmit,
  onCancel,
}: SessionFormProps) {
  const [capacity, setCapacity] = useState(String(session.capacity));
  const [instructorId, setInstructorId] = useState(session.instructor_id);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({ capacity: Number(capacity), instructorId });
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <p className="form-intro">
        {formatSessionDayLabel(session.starts_at)} a las {formatSessionTime(session.starts_at)}. El
        cupo no puede quedar por debajo de las reservas confirmadas y ofrecidas.
      </p>

      <div className="form-summary">
        <span>Ocupación actual</span>
        <strong>
          {session.occupied} / {session.capacity}
        </strong>
        <small>
          {session.available} lugar{session.available === 1 ? '' : 'es'} disponible
          {session.available === 1 ? '' : 's'}
          {session.waitlisted > 0
            ? ` · ${session.waitlisted} en lista de espera`
            : ' · sin lista de espera'}
        </small>
      </div>

      <label className="field">
        <span>Cupo total</span>
        <input
          required
          min={Math.max(1, session.occupied)}
          step={1}
          type="number"
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
        />
        <small>
          Mínimo {Math.max(1, session.occupied)} según las reservas activas. Si aumentás el cupo y
          hay espera, se ofrece el lugar a la primera persona elegible.
        </small>
      </label>

      <label className="field">
        <span>Instructora</span>
        <select
          required
          value={instructorId}
          onChange={(event) => setInstructorId(event.target.value)}
        >
          {instructors.map((instructor) => (
            <option key={instructor.id} value={instructor.id}>
              {instructor.name}
            </option>
          ))}
        </select>
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
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
