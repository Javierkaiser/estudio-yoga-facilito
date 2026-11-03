import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  errorMessage,
  formatSessionDayLabel,
  formatSessionTime,
  schedulingApi,
  sessionDayKey,
  templateTimeLabel,
  weekdayLabel,
  type ClassSession,
  type ClassTemplate,
  type CreateTemplateInput,
  type EditSessionInput,
  type GenerateSessionsInput,
  type SchedulingOverview,
  type UpdateTemplateInput,
} from '../api';
import { GenerateForm } from './GenerateForm';
import { Modal } from './Modal';
import { SessionForm } from './SessionForm';
import { TemplateForm } from './TemplateForm';

type ModalKind = 'template' | 'generate' | 'session' | 'cancel' | null;

interface SchedulingViewProps {
  onNotice: (message: string) => void;
}

interface SessionGroup {
  key: string;
  label: string;
  sessions: ClassSession[];
}

const EMPTY_STATS = {
  activeTemplates: 0,
  upcoming: 0,
  available: 0,
  waitlisted: 0,
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function sessionStatusLabel(status: ClassSession['status']): string {
  if (status === 'scheduled') return 'Programada';
  if (status === 'cancelled') return 'Cancelada';
  return 'Completada';
}

export function SchedulingView({ onNotice }: SchedulingViewProps) {
  const [data, setData] = useState<SchedulingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [editingTemplate, setEditingTemplate] = useState<ClassTemplate | null>(null);
  const [generatingTemplate, setGeneratingTemplate] = useState<ClassTemplate | null>(null);
  const [editingSession, setEditingSession] = useState<ClassSession | null>(null);
  const [cancellingSession, setCancellingSession] = useState<ClassSession | null>(null);

  const refresh = useCallback(async () => {
    const next = await schedulingApi.overview();
    setData(next);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    schedulingApi
      .overview()
      .then((next) => {
        if (active) setData(next);
      })
      .catch((error) => {
        if (active) setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
    setEditingTemplate(null);
    setGeneratingTemplate(null);
    setEditingSession(null);
    setCancellingSession(null);
    setFormError(null);
  }, []);

  const openTemplate = (template: ClassTemplate | null) => {
    setEditingTemplate(template);
    setModal('template');
    setFormError(null);
  };

  const openGenerate = (template: ClassTemplate | null = null) => {
    setGeneratingTemplate(template);
    setModal('generate');
    setFormError(null);
  };

  const openSession = (session: ClassSession) => {
    setEditingSession(session);
    setModal('session');
    setFormError(null);
  };

  const openCancel = (session: ClassSession) => {
    setCancellingSession(session);
    setModal('cancel');
    setFormError(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setLoadError(null);
    try {
      await refresh();
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  const handleDemoInstructors = async () => {
    setBusy(true);
    setLoadError(null);
    try {
      const result = await schedulingApi.demoInstructors();
      await refresh();
      onNotice(
        result.instructors.length > 0
          ? `Instructoras demo disponibles: ${result.instructors
              .map((instructor) => instructor.name)
              .join(', ')}.`
          : 'No se pudieron agregar instructoras demo.',
      );
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveTemplate = async (input: CreateTemplateInput | UpdateTemplateInput) => {
    setBusy(true);
    setFormError(null);
    try {
      if (editingTemplate) {
        await schedulingApi.updateTemplate(editingTemplate.id, input);
      } else {
        await schedulingApi.createTemplate(input as CreateTemplateInput);
      }
      closeModal();
      onNotice(editingTemplate ? 'Plantilla actualizada.' : 'Plantilla creada.');
      try {
        await refresh();
      } catch (error) {
        setLoadError(errorMessage(error));
      }
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleGenerate = async (templateId: string, input: GenerateSessionsInput) => {
    setBusy(true);
    setFormError(null);
    try {
      const result = await schedulingApi.generate(templateId, input);
      closeModal();
      const created =
        result.created === 0
          ? 'No se crearon sesiones nuevas'
          : plural(result.created, 'sesión creada', 'sesiones creadas');
      onNotice(
        result.skipped > 0
          ? `${created}. ${plural(result.skipped, 'sesión omitida', 'sesiones omitidas')}.`
          : `${created}.`,
      );
      try {
        await refresh();
      } catch (error) {
        setLoadError(errorMessage(error));
      }
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleEditSession = async (input: EditSessionInput) => {
    if (!editingSession) return;
    setBusy(true);
    setFormError(null);
    try {
      const result = await schedulingApi.editSession(editingSession.id, input);
      closeModal();
      onNotice(
        result.promoted
          ? 'Sesión actualizada. Se ofreció el lugar liberado a la primera persona en espera.'
          : 'Sesión actualizada.',
      );
      try {
        await refresh();
      } catch (error) {
        setLoadError(errorMessage(error));
      }
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleCancelClass = async () => {
    if (!cancellingSession) return;
    setBusy(true);
    setFormError(null);
    try {
      const result = await schedulingApi.cancelSession(cancellingSession.id);
      closeModal();
      if (result.alreadyCancelled) {
        onNotice('La clase ya estaba cancelada.');
      } else {
        onNotice(
          `Clase cancelada. ${plural(
            result.refunded,
            'devolución registrada',
            'devoluciones registradas',
          )} y ${plural(result.notified, 'aviso en cola', 'avisos en cola')}.`,
        );
      }
      try {
        await refresh();
      } catch (error) {
        setLoadError(errorMessage(error));
      }
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const templates = data?.templates ?? [];
  const instructors = data?.instructors ?? [];
  const activeTemplates = templates.filter((template) => template.active);

  const stats = useMemo(() => {
    if (!data) return EMPTY_STATS;
    const scheduled = data.sessions.filter((session) => session.status === 'scheduled');
    return {
      activeTemplates: data.templates.filter((template) => template.active).length,
      upcoming: scheduled.length,
      available: scheduled.reduce((total, session) => total + session.available, 0),
      waitlisted: scheduled.reduce((total, session) => total + session.waitlisted, 0),
    };
  }, [data]);

  const groups = useMemo<SessionGroup[]>(() => {
    const result: SessionGroup[] = [];
    for (const session of data?.sessions ?? []) {
      const key = sessionDayKey(session.starts_at);
      const last = result[result.length - 1];
      if (last && last.key === key) {
        last.sessions.push(session);
      } else {
        result.push({
          key,
          label: formatSessionDayLabel(session.starts_at),
          sessions: [session],
        });
      }
    }
    return result;
  }, [data]);

  return (
    <>
      <section className="hero">
        <div className="hero-main">
          <p className="eyebrow">Clases / agenda semanal</p>
          <h1>
            El ritmo de
            <br />
            <em>la semana.</em>
          </h1>
          <p className="hero-copy">
            Plantillas que se repiten, sesiones con cupo propio y una agenda que muestra lo que pasa
            en el estudio. Las horas se leen en Buenos Aires y se guardan en UTC.
          </p>
        </div>
        <aside className="hero-note">
          <span className="hero-note-index">01 / agenda</span>
          <p>
            Generá las próximas semanas desde una plantilla. Cada sesión conserva el cupo y la
            instructora que tenía al generarse.
          </p>
          <p className="hero-note-small">
            Cancelar una clase devuelve créditos y deja los avisos en cola, sin enviar nada en el
            momento.
          </p>
        </aside>
      </section>

      <section className="stats" aria-label="Resumen de clases">
        <article className="stat">
          <span className="stat-label">Plantillas activas</span>
          <strong>{stats.activeTemplates}</strong>
          <small>en la semana fija</small>
        </article>
        <article className="stat">
          <span className="stat-label">Próximas sesiones</span>
          <strong>{stats.upcoming}</strong>
          <small>programadas</small>
        </article>
        <article className="stat">
          <span className="stat-label">Lugares disponibles</span>
          <strong>{stats.available}</strong>
          <small>para reservar</small>
        </article>
        <article className="stat">
          <span className="stat-label">En lista de espera</span>
          <strong>{stats.waitlisted}</strong>
          <small>esperando un lugar</small>
        </article>
      </section>

      {loadError && (
        <div className="error-banner" role="alert">
          <span>{loadError}</span>
          <button type="button" className="text-button" onClick={handleRefresh}>
            Reintentar
          </button>
        </div>
      )}

      <div className="workspace">
        <aside className="roster">
          <div className="section-heading">
            <div>
              <p className="section-index">01 / plantillas</p>
              <h2>Semana fija</h2>
            </div>
            <button
              type="button"
              className="button primary small"
              onClick={() => openTemplate(null)}
              disabled={instructors.length === 0 || busy}
            >
              Nueva
            </button>
          </div>

          {loading && !data && <p className="list-note">Cargando plantillas…</p>}

          {!loading && instructors.length === 0 && (
            <div className="demo-callout">
              <p>
                Para crear plantillas hacen falta instructoras activas. Podés agregar dos cuentas de
                demostración.
              </p>
              <button
                type="button"
                className="button ghost small"
                onClick={handleDemoInstructors}
                disabled={busy}
              >
                {busy ? 'Agregando…' : 'Agregar instructoras demo'}
              </button>
            </div>
          )}

          {!loading && instructors.length > 0 && templates.length === 0 && (
            <div className="list-empty">
              <p>Todavía no hay plantillas semanales.</p>
              <button type="button" className="text-button" onClick={() => openTemplate(null)}>
                Crear la primera
              </button>
            </div>
          )}

          <div className="template-list">
            {templates.map((template) => (
              <article
                key={template.id}
                className={`template-card${template.active ? '' : ' is-inactive'}`}
              >
                <div className="template-head">
                  <div className="template-time">
                    <strong>{templateTimeLabel(template.start_time)}</strong>
                    <span>{weekdayLabel(template.weekday)}</span>
                  </div>
                  <span className={`status-pill${template.active ? '' : ' is-exhausted'}`}>
                    {template.active ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
                <p className="template-instructor">{template.instructor_name}</p>
                <p className="template-meta">
                  {template.duration_minutes} min · cupo {template.capacity}
                </p>
                <div className="template-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => openTemplate(template)}
                  >
                    Editar
                  </button>
                  {template.active && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => openGenerate(template)}
                    >
                      Generar
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>

          <p className="sidebar-footnote">
            Las plantillas no crean sesiones solas. Elegí un rango y generá solo las fechas futuras.
          </p>
        </aside>

        <section className="ledger" aria-live="polite">
          <div className="section-heading agenda-heading">
            <div>
              <p className="section-index">02 / agenda</p>
              <h2>Próximas clases</h2>
            </div>
            <div className="agenda-heading-actions">
              <button
                type="button"
                className="button ghost small"
                onClick={handleRefresh}
                disabled={refreshing || busy}
              >
                {refreshing ? 'Actualizando…' : 'Actualizar'}
              </button>
              <button
                type="button"
                className="button primary small"
                onClick={() => openGenerate()}
                disabled={activeTemplates.length === 0 || busy}
              >
                Generar sesiones
              </button>
            </div>
          </div>

          <p className="agenda-note">
            Próximas ocho semanas · horas de Buenos Aires · cada sesión muestra su ocupación y su
            lista de espera.
          </p>

          {loading && !data && (
            <div className="ledger-empty">
              <span className="empty-mark">◌</span>
              <h2>Abriendo la agenda…</h2>
              <p>Estamos leyendo las plantillas y las sesiones.</p>
            </div>
          )}

          {!loading && templates.length === 0 && (
            <div className="ledger-empty">
              <span className="empty-mark">02</span>
              <p className="eyebrow">La semana todavía no tiene forma</p>
              <h2>Empezá por una plantilla.</h2>
              <p>
                Definí un día, una hora y un cupo. Después generá las sesiones de las próximas
                semanas y la agenda aparece acá.
              </p>
              <div className="empty-actions">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => openTemplate(null)}
                  disabled={instructors.length === 0}
                >
                  Crear plantilla
                </button>
                {instructors.length === 0 && (
                  <button
                    type="button"
                    className="button ghost"
                    onClick={handleDemoInstructors}
                    disabled={busy}
                  >
                    Agregar instructoras demo
                  </button>
                )}
              </div>
            </div>
          )}

          {!loading && templates.length > 0 && data?.sessions.length === 0 && (
            <div className="ledger-empty">
              <span className="empty-mark">03</span>
              <p className="eyebrow">La agenda está vacía</p>
              <h2>Generá la primera tanda.</h2>
              <p>
                Elegí una plantilla y un rango de fechas. Solo se crean las sesiones futuras; si
                volvés a generar, no se duplican.
              </p>
              <div className="empty-actions">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => openGenerate()}
                  disabled={activeTemplates.length === 0}
                >
                  Generar sesiones
                </button>
              </div>
            </div>
          )}

          <div className="agenda">
            {groups.map((group) => (
              <section key={group.key} className="agenda-group">
                <header className="agenda-day">
                  <h3>{group.label}</h3>
                  <span>{plural(group.sessions.length, 'clase', 'clases')}</span>
                </header>

                <div className="session-list">
                  {group.sessions.map((session) => {
                    const isFuture = new Date(session.starts_at).getTime() > Date.now();
                    const canEdit = session.status === 'scheduled' && isFuture;
                    const percent = Math.min(
                      100,
                      Math.round((session.occupied / Math.max(1, session.capacity)) * 100),
                    );

                    return (
                      <article key={session.id} className={`session-row is-${session.status}`}>
                        <div className="session-time">
                          <strong>{formatSessionTime(session.starts_at)}</strong>
                          <span>{session.duration_minutes} min</span>
                        </div>

                        <div className="session-body">
                          <div className="session-line">
                            <strong>{session.instructor_name}</strong>
                            <span className={`status-pill is-${session.status}`}>
                              {sessionStatusLabel(session.status)}
                            </span>
                            {session.status === 'scheduled' && session.available === 0 && (
                              <span className="waitlist-pill">Llena</span>
                            )}
                            {session.waitlisted > 0 && (
                              <span className="waitlist-pill">
                                {session.waitlisted} en lista de espera
                              </span>
                            )}
                          </div>

                          {session.status === 'cancelled' ? (
                            <p className="session-note">
                              Las reservas quedaron canceladas y los avisos en cola.
                            </p>
                          ) : (
                            <div className="session-capacity">
                              <div
                                className={`progress-track${
                                  session.available === 0 ? ' is-full' : ''
                                }`}
                                aria-hidden="true"
                              >
                                <span style={{ width: `${percent}%` }} />
                              </div>
                              <p>
                                {session.occupied} de {session.capacity} ocupados
                                <span aria-hidden="true"> · </span>
                                {plural(
                                  session.available,
                                  'lugar disponible',
                                  'lugares disponibles',
                                )}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="session-actions">
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => openSession(session)}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="text-button is-danger"
                                onClick={() => openCancel(session)}
                              >
                                Cancelar
                              </button>
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {data && data.sessions.length > 0 && (
            <p className="ledger-footnote">
              La ocupación incluye reservas confirmadas y ofrecidas. Una clase cancelada no acepta
              reservas nuevas.
            </p>
          )}
        </section>
      </div>

      {modal === 'template' && (
        <Modal
          eyebrow={editingTemplate ? 'Plantilla / edición' : 'Plantilla / alta'}
          title={editingTemplate ? 'Editar plantilla' : 'Nueva plantilla'}
          onClose={closeModal}
        >
          <TemplateForm
            busy={busy}
            error={formError}
            instructors={instructors}
            template={editingTemplate}
            onSubmit={handleSaveTemplate}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {modal === 'generate' && (
        <Modal eyebrow="Sesiones / generación" title="Generar sesiones" onClose={closeModal}>
          <GenerateForm
            busy={busy}
            error={formError}
            templates={activeTemplates}
            initialTemplateId={generatingTemplate?.id}
            onSubmit={handleGenerate}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {modal === 'session' && editingSession && (
        <Modal eyebrow="Sesión / edición" title="Editar sesión" onClose={closeModal}>
          <SessionForm
            busy={busy}
            error={formError}
            session={editingSession}
            instructors={instructors}
            onSubmit={handleEditSession}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {modal === 'cancel' && cancellingSession && (
        <Modal eyebrow="Clase / cancelación" title="Cancelar clase" onClose={closeModal}>
          <div className="form">
            <p className="form-intro">
              Se devuelve un crédito a cada reserva confirmada. Las reservas en espera también se
              cancelan, sin devolución. Cada persona afectada deja un aviso en la cola de envío; no
              se envía nada durante la operación.
            </p>

            <div className="cancel-card">
              <span>
                {formatSessionDayLabel(cancellingSession.starts_at)} ·{' '}
                {formatSessionTime(cancellingSession.starts_at)}
              </span>
              <strong>{cancellingSession.instructor_name}</strong>
              <small>
                {plural(cancellingSession.occupied, 'reserva activa', 'reservas activas')} ·{' '}
                {cancellingSession.waitlisted} en lista de espera
              </small>
            </div>

            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}

            <div className="form-actions">
              <button type="button" className="button ghost" onClick={closeModal} disabled={busy}>
                Volver
              </button>
              <button
                type="button"
                className="button danger"
                onClick={handleCancelClass}
                disabled={busy}
              >
                {busy ? 'Cancelando…' : 'Cancelar clase'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
