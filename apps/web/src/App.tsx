import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  errorMessage,
  formatDate,
  formatDateTime,
  formatDelta,
  formatNumber,
  initials,
  ledgerApi,
  movementLabel,
  planValidity,
  statusLabel,
  type AdjustInput,
  type CreatePlanInput,
  type CreateStudentInput,
  type Overview,
  type PurchaseInput,
  type StudentDetail,
  type StudentPackage,
  type StudentSummary,
} from './api';
import { AdjustForm } from './components/AdjustForm';
import { Modal } from './components/Modal';
import { PlanForm } from './components/PlanForm';
import { PurchaseForm } from './components/PurchaseForm';
import { SchedulingView } from './components/SchedulingView';
import { StudentForm } from './components/StudentForm';

type FormKind = 'student' | 'plan' | 'purchase' | 'adjust' | null;
type View = 'ledger' | 'clases';

function viewFromHash(): View {
  return window.location.hash === '#clases' ? 'clases' : 'ledger';
}

const EMPTY_TOTALS = {
  students: 0,
  active_packages: 0,
  total_balance: 0,
  movements: 0,
};

export function App() {
  const [view, setView] = useState<View>(viewFromHash);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormKind>(null);
  const [adjustPackageId, setAdjustPackageId] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const refreshOverview = useCallback(async (preferredId?: string) => {
    const data = await ledgerApi.overview();
    setOverview(data);
    setSelectedId((current) => {
      const candidate = preferredId ?? current;
      if (candidate && data.students.some((student) => student.id === candidate)) {
        return candidate;
      }
      return data.students[0]?.id ?? null;
    });
    return data;
  }, []);

  const refreshDetail = useCallback(async (studentId: string) => {
    setDetailLoading(true);
    try {
      const data = await ledgerApi.studentDetail(studentId);
      setDetail(data);
      return data;
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    let active = true;
    setInitialLoading(true);
    refreshOverview()
      .catch((error) => {
        if (active) setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (active) setInitialLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshOverview]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    let active = true;
    setDetailLoading(true);
    ledgerApi
      .studentDetail(selectedId)
      .then((data) => {
        if (active) setDetail(data);
      })
      .catch((error) => {
        if (active) setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const closeForm = useCallback(() => {
    setForm(null);
    setAdjustPackageId(undefined);
    setFormError(null);
  }, []);

  const openForm = (kind: Exclude<FormKind, null>, packageId?: string) => {
    setForm(kind);
    setAdjustPackageId(packageId);
    setFormError(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setLoadError(null);
    try {
      await refreshOverview();
      if (selectedId) {
        await refreshDetail(selectedId);
      }
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  const handleExpire = async () => {
    setBusy(true);
    setLoadError(null);
    try {
      const result = await ledgerApi.expire();
      setNotice(
        result.processed === 0
          ? 'No había paquetes vencidos para procesar.'
          : `${result.processed} paquete${result.processed === 1 ? '' : 's'} procesado${
              result.processed === 1 ? '' : 's'
            }.`,
      );
      await refreshOverview();
      if (selectedId) await refreshDetail(selectedId);
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateStudent = async (input: CreateStudentInput) => {
    setBusy(true);
    setFormError(null);
    try {
      const student = await ledgerApi.createStudent(input);
      closeForm();
      setNotice('Alta registrada.');
      await refreshOverview(student.id);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleCreatePlan = async (input: CreatePlanInput) => {
    setBusy(true);
    setFormError(null);
    try {
      const plan = await ledgerApi.createPlan(input);
      closeForm();
      setNotice(`Plan “${plan.name}” creado.`);
      await refreshOverview();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handlePurchase = async (input: PurchaseInput) => {
    setBusy(true);
    setFormError(null);
    try {
      await ledgerApi.purchase(input);
      closeForm();
      setNotice('Paquete comprado. El saldo ya está disponible.');
      await refreshOverview();
      if (selectedId) await refreshDetail(selectedId);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleAdjust = async (input: AdjustInput) => {
    setBusy(true);
    setFormError(null);
    try {
      await ledgerApi.adjust(input);
      closeForm();
      setNotice('Ajuste registrado en el historial.');
      await refreshOverview();
      if (selectedId) await refreshDetail(selectedId);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const selectedStudent: StudentSummary | null =
    overview?.students.find((student) => student.id === selectedId) ?? null;
  const selectedDetail = detail?.student.id === selectedId ? detail : null;
  const packages: StudentPackage[] = selectedDetail?.packages ?? [];
  const movements = selectedDetail?.movements ?? [];
  const activePlans = overview?.plans.filter((plan) => plan.active) ?? [];
  const totals = overview?.totals ?? EMPTY_TOTALS;

  const filteredStudents = useMemo(() => {
    const students = overview?.students ?? [];
    const query = filter.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) =>
      [student.name, student.phone_e164, student.email ?? ''].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [overview, filter]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            EY
          </span>
          <span className="brand-copy">
            <span className="brand-kicker">Estudio de Yoga</span>
            <strong>Libro de créditos</strong>
          </span>
        </div>

        <nav className="view-switcher" aria-label="Secciones de la consola">
          <button
            type="button"
            className={view === 'ledger' ? 'is-active' : ''}
            onClick={() => {
              setView('ledger');
              window.location.hash = 'creditos';
            }}
            aria-current={view === 'ledger' ? 'page' : undefined}
          >
            Créditos
          </button>
          <button
            type="button"
            className={view === 'clases' ? 'is-active' : ''}
            onClick={() => {
              setView('clases');
              window.location.hash = 'clases';
            }}
            aria-current={view === 'clases' ? 'page' : undefined}
          >
            Clases
          </button>
        </nav>

        <div className="topbar-actions">
          <span className="dev-badge">
            <span className="pulse-dot" aria-hidden="true" />
            Modo desarrollo
          </span>
          {view === 'ledger' && (
            <>
              <button
                type="button"
                className="button ghost compact"
                onClick={handleExpire}
                disabled={busy}
              >
                Procesar vencimientos
              </button>
              <button
                type="button"
                className="button ghost compact"
                onClick={handleRefresh}
                disabled={refreshing || busy}
              >
                {refreshing ? 'Actualizando…' : 'Actualizar'}
              </button>
            </>
          )}
        </div>
      </header>

      <main className="page">
        {view === 'ledger' && (
          <>
            <section className="hero">
              <div className="hero-main">
                <p className="eyebrow">Ledger / consola local</p>
                <h1>
                  El libro de
                  <br />
                  <em>créditos.</em>
                </h1>
                <p className="hero-copy">
                  Cada compra, reserva, devolución y vencimiento deja una huella auditable. Esta
                  vista te deja operar el ledger de punta a punta.
                </p>
              </div>
              <aside className="hero-note">
                <span className="hero-note-index">01 / 04</span>
                <p>
                  Consola de desarrollo sin autenticación. En producción se reemplaza por el panel
                  de staff con roles.
                </p>
                <p className="hero-note-small">
                  El saldo no se edita: se agrega un movimiento. El historial es append-only.
                </p>
              </aside>
            </section>

            <section className="stats" aria-label="Resumen del ledger">
              <article className="stat">
                <span className="stat-label">Alumnado</span>
                <strong>{formatNumber(totals.students)}</strong>
                <small>en el estudio</small>
              </article>
              <article className="stat">
                <span className="stat-label">Créditos vigentes</span>
                <strong>{formatNumber(totals.total_balance)}</strong>
                <small>disponibles para reservar</small>
              </article>
              <article className="stat">
                <span className="stat-label">Paquetes activos</span>
                <strong>{formatNumber(totals.active_packages)}</strong>
                <small>con saldo</small>
              </article>
              <article className="stat">
                <span className="stat-label">Movimientos</span>
                <strong>{formatNumber(totals.movements)}</strong>
                <small>en el historial</small>
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
                    <p className="section-index">01 / personas</p>
                    <h2>Alumnado</h2>
                  </div>
                  <button
                    type="button"
                    className="button primary small"
                    onClick={() => openForm('student')}
                  >
                    Agregar
                  </button>
                </div>

                <label className="search-field">
                  <span className="sr-only">Buscar en el alumnado</span>
                  <input
                    type="search"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="Buscar por nombre, teléfono o email"
                  />
                </label>

                <div className="student-list">
                  {initialLoading && <p className="list-note">Cargando estudiantes…</p>}
                  {!initialLoading && filteredStudents.length === 0 && (
                    <div className="list-empty">
                      <p>
                        {overview?.students.length
                          ? 'No hay coincidencias.'
                          : 'Todavía no hay estudiantes.'}
                      </p>
                      {!overview?.students.length && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => openForm('student')}
                        >
                          Crear el primer registro
                        </button>
                      )}
                    </div>
                  )}
                  {filteredStudents.map((student) => (
                    <button
                      key={student.id}
                      type="button"
                      className={`student-card${student.id === selectedId ? ' is-active' : ''}`}
                      onClick={() => setSelectedId(student.id)}
                      aria-pressed={student.id === selectedId}
                    >
                      <span className="avatar" aria-hidden="true">
                        {initials(student.name)}
                      </span>
                      <span className="student-meta">
                        <strong>{student.name}</strong>
                        <small>{student.phone_e164}</small>
                      </span>
                      <span className="student-credit">
                        <strong>{formatNumber(student.total_balance)}</strong>
                        <small>créditos</small>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="plans-mini">
                  <div className="section-heading small">
                    <div>
                      <p className="section-index">02 / catálogo</p>
                      <h2>Planes</h2>
                    </div>
                    <button
                      type="button"
                      className="button ghost small"
                      onClick={() => openForm('plan')}
                    >
                      Nuevo
                    </button>
                  </div>

                  <div className="plan-mini-list">
                    {overview?.plans.length === 0 && (
                      <p className="list-note">Sin planes todavía.</p>
                    )}
                    {overview?.plans.map((plan) => (
                      <div key={plan.id} className="plan-mini">
                        <span
                          className={`plan-dot${plan.active ? '' : ' is-off'}`}
                          aria-hidden="true"
                        />
                        <span>
                          <strong>{plan.name}</strong>
                          <small>
                            {plan.credits} créditos · {planValidity(plan)}
                          </small>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>

              <section className="ledger" aria-live="polite">
                {initialLoading && !selectedStudent && (
                  <div className="ledger-empty">
                    <span className="empty-mark">◌</span>
                    <h2>Abriendo el libro…</h2>
                    <p>Estamos leyendo el ledger local.</p>
                  </div>
                )}

                {!initialLoading && !selectedStudent && (
                  <div className="ledger-empty">
                    <span className="empty-mark">01</span>
                    <p className="eyebrow">El libro está en blanco</p>
                    <h2>Empezá por una persona.</h2>
                    <p>
                      Creá una persona y un plan de créditos. Después registrá una compra y todo el
                      historial va a quedar visible acá.
                    </p>
                    <div className="empty-actions">
                      <button
                        type="button"
                        className="button primary"
                        onClick={() => openForm('student')}
                      >
                        Agregar estudiante
                      </button>
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => openForm('plan')}
                      >
                        Nuevo plan
                      </button>
                    </div>
                  </div>
                )}

                {selectedStudent && (
                  <>
                    <div className="ledger-head">
                      <div>
                        <p className="section-index">03 / ficha</p>
                        <h2>{selectedStudent.name}</h2>
                        <p className="contact-line">
                          {selectedStudent.phone_e164}
                          <span aria-hidden="true">·</span>
                          {selectedStudent.email ?? 'Sin email'}
                          <span aria-hidden="true">·</span>
                          {selectedStudent.whatsapp_consent_at
                            ? 'WhatsApp habilitado'
                            : 'Sin consentimiento'}
                        </p>
                      </div>
                      <div className="balance-hero">
                        <span>Saldo vigente</span>
                        <strong>{formatNumber(selectedStudent.total_balance)}</strong>
                        <small>créditos</small>
                      </div>
                    </div>

                    <div className="ledger-actions">
                      <button
                        type="button"
                        className="button primary"
                        onClick={() => openForm('purchase')}
                        disabled={activePlans.length === 0}
                      >
                        Comprar paquete
                      </button>
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => openForm('adjust')}
                        disabled={packages.length === 0}
                      >
                        Ajustar créditos
                      </button>
                      {activePlans.length === 0 && (
                        <span className="inline-hint">
                          Creá un plan para poder registrar una compra.
                        </span>
                      )}
                    </div>

                    <section className="block">
                      <div className="block-head">
                        <h3>Paquetes</h3>
                        <span>{packages.length}</span>
                      </div>

                      {detailLoading && <p className="list-note">Cargando paquetes…</p>}

                      {!detailLoading && packages.length === 0 && (
                        <div className="block-empty">
                          <p>Este perfil todavía no tiene paquetes.</p>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => openForm('purchase')}
                            disabled={activePlans.length === 0}
                          >
                            Registrar la primera compra
                          </button>
                        </div>
                      )}

                      <div className="package-grid">
                        {packages.map((pkg) => {
                          const progress = Math.min(
                            100,
                            Math.round((pkg.balance / Math.max(1, pkg.credits_purchased)) * 100),
                          );

                          return (
                            <article key={pkg.id} className={`package-card is-${pkg.status}`}>
                              <div className="package-top">
                                <span className="package-plan">{pkg.plan_name}</span>
                                <span className={`status-pill is-${pkg.status}`}>
                                  {statusLabel(pkg.status)}
                                </span>
                              </div>
                              <div className="package-balance">
                                <strong>{formatNumber(pkg.balance)}</strong>
                                <span>créditos</span>
                              </div>
                              <div className="progress-track" aria-hidden="true">
                                <span style={{ width: `${progress}%` }} />
                              </div>
                              <div className="package-meta">
                                <span>{pkg.credits_purchased} comprados</span>
                                <span>
                                  {pkg.expires_at
                                    ? `Vence ${formatDate(pkg.expires_at)}`
                                    : 'Sin vencimiento'}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => openForm('adjust', pkg.id)}
                              >
                                Ajustar este paquete
                              </button>
                            </article>
                          );
                        })}
                      </div>
                    </section>

                    <section className="block">
                      <div className="block-head">
                        <h3>Historial</h3>
                        <span>
                          {movements.length} movimiento{movements.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      {!detailLoading && movements.length === 0 && (
                        <div className="block-empty">
                          <p>El primer movimiento va a aparecer acá.</p>
                        </div>
                      )}

                      <div className="movement-list">
                        {movements.map((movement) => (
                          <div key={movement.id} className="movement-row">
                            <time dateTime={movement.created_at}>
                              {formatDateTime(movement.created_at)}
                            </time>
                            <div className="movement-main">
                              <span className={`movement-type is-${movement.type}`}>
                                {movementLabel(movement.type)}
                              </span>
                              <small>{movement.reason ?? 'Movimiento de créditos'}</small>
                            </div>
                            <strong
                              className={`movement-delta ${
                                movement.delta > 0 ? 'is-positive' : 'is-negative'
                              }`}
                            >
                              {formatDelta(movement.delta)}
                            </strong>
                            <div className="movement-balance">
                              <span>saldo</span>
                              <strong>{formatNumber(movement.balance_after)}</strong>
                            </div>
                          </div>
                        ))}
                      </div>

                      <p className="ledger-footnote">
                        Historial append-only. Los movimientos no se editan ni se borran: cada
                        cambio de saldo es una fila nueva.
                      </p>
                    </section>
                  </>
                )}
              </section>
            </div>
          </>
        )}

        {view === 'clases' && <SchedulingView onNotice={setNotice} />}
      </main>

      {notice && (
        <div className="toast" role="status">
          <span className="pulse-dot" aria-hidden="true" />
          {notice}
        </div>
      )}

      {form === 'student' && (
        <Modal eyebrow="Alta / 01" title="Nuevo estudiante" onClose={closeForm}>
          <StudentForm
            busy={busy}
            error={formError}
            onSubmit={handleCreateStudent}
            onCancel={closeForm}
          />
        </Modal>
      )}

      {form === 'plan' && (
        <Modal eyebrow="Catálogo / 02" title="Nuevo plan" onClose={closeForm}>
          <PlanForm
            busy={busy}
            error={formError}
            onSubmit={handleCreatePlan}
            onCancel={closeForm}
          />
        </Modal>
      )}

      {form === 'purchase' && selectedStudent && (
        <Modal eyebrow="Movimiento / compra" title="Comprar paquete" onClose={closeForm}>
          <PurchaseForm
            studentId={selectedStudent.id}
            studentName={selectedStudent.name}
            plans={activePlans}
            busy={busy}
            error={formError}
            onSubmit={handlePurchase}
            onCancel={closeForm}
          />
        </Modal>
      )}

      {form === 'adjust' && selectedStudent && (
        <Modal eyebrow="Movimiento / ajuste" title="Ajustar créditos" onClose={closeForm}>
          <AdjustForm
            packages={packages}
            initialPackageId={adjustPackageId}
            busy={busy}
            error={formError}
            onSubmit={handleAdjust}
            onCancel={closeForm}
          />
        </Modal>
      )}
    </div>
  );
}
