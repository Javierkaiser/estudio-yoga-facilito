import { useState, type FormEvent } from 'react';
import type { CreateStudentInput } from '../api';

interface StudentFormProps {
  busy: boolean;
  error: string | null;
  onSubmit: (input: CreateStudentInput) => void;
  onCancel: () => void;
}

export function StudentForm({ busy, error, onSubmit, onCancel }: StudentFormProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(true);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      whatsappConsent: consent,
    });
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <p className="form-intro">
        El alta se crea con su teléfono E.164. El email es opcional y se usa para el acceso al
        portal en una próxima etapa.
      </p>

      <label className="field">
        <span>Nombre</span>
        <input
          autoFocus
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nombre y apellido"
        />
      </label>

      <label className="field">
        <span>Teléfono E.164</span>
        <input
          required
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+5491123456789"
          inputMode="tel"
        />
        <small>Ejemplo: +5491123456789. Se usa para los avisos por WhatsApp.</small>
      </label>

      <label className="field">
        <span>Email <em>opcional</em></span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="andrea@example.com"
        />
      </label>

      <label className="check-field">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        <span>
          <strong>Consentimiento de WhatsApp</strong>
          <small>Registra la fecha de consentimiento para poder enviar avisos.</small>
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
          {busy ? 'Creando…' : 'Crear estudiante'}
        </button>
      </div>
    </form>
  );
}
