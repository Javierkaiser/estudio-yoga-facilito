---
name: estudio-yoga-brand
description: >-
  Define y aplica la identidad visual y verbal del Estudio de Yoga. Úsala antes
  de diseñar, construir o revisar cualquier pantalla del portal del alumnado, del
  panel de staff o de la consola del ledger. Mantiene la marca editorial, cálida
  y precisa del proyecto, y evita estéticas genéricas de SaaS o de wellness.
metadata:
  version: '1.0'
  scope: project
  canonical-reference: apps/web/src/styles.css
---

# Marca del Estudio de Yoga

Esta skill es la fuente de verdad para la dirección de arte del producto. La consola
visual del ledger en `apps/web` es la referencia canónica actual. Cualquier pantalla
nueva —portal del alumnado, panel de staff, emails, estados vacíos o modales— debe
extender ese sistema, no inventar otro.

## Cuándo usarla

- Antes de crear o modificar una pantalla, componente, modal, formulario o email.
- Al revisar una UI existente o al proponer un rediseño.
- Al escribir copy de interfaz, estados vacíos, errores o confirmaciones.
- Al agregar tokens, tipografías, iconografía o animaciones.

No la uses para tareas de backend, migraciones, tests de dominio o documentación
técnica que no tenga superficie visual.

## La idea de marca

**El libro de créditos.** Un estudio pequeño, humano y ordenado. La interfaz se
siente como un libro de cuentas bien llevado: papel cálido, tinta verde, reglas
finas, números claros y un acento terracota. Es editorial, no corporativa; es
precisa, no fría; es cálida, no ingenua.

La promesa visual es **claridad auditables**: que Andrea y las instructoras vean
en segundos qué pasó, cuánto queda y qué pueden hacer. Que cualquier estudiante
entienda su saldo sin sentir que entra a un banco.

La marca no es un spa. No usa lotos, mandalas, humo, piedras, hojas de monstera,
fotos de stock de gente meditando ni frases tipo “namaste”. La calma viene del
espacio, la tipografía y la jerarquía, no de clichés de wellness.

## Audiencia y trabajos

- **Andrea (administradora):** opera el estudio, necesita confianza, eficiencia y
  historial. Tolera densidad; no tolera ambigüedad.
- **Instructoras:** entran poco tiempo, desde el teléfono, a pasar lista o cancelar
  una clase. Necesitan acciones grandes y estados inequívocos.
- **Estudiantes:** consultan saldo, reservan y cancelan. Necesitan lenguaje simple,
  fechas claras y ningún dato interno.

La misma marca se adapta: el panel de staff puede ser más denso; el portal del
alumnado debe ser más generoso, con menos acciones por pantalla.

## Sistema visual

### Paleta

Usar los tokens existentes de `apps/web/src/styles.css`. No introducir colores
sueltos ni gradientes de marca.

| Token | Hex | Uso |
| --- | --- | --- |
| `--paper` | `#f2eee4` | Fondo principal, papel cálido |
| `--paper-soft` | `#f8f4ea` | Superficies elevadas, modales |
| `--paper-deep` | `#e7dfcf` | Rellenos suaves, pistas |
| `--ink` | `#1f2d27` | Texto principal, botón primario |
| `--ink-soft` | `#33453c` | Texto secundario de alta jerarquía |
| `--muted` | `#6d776f` | Metadatos, ayudas, texto no esencial |
| `--line` | `#d7cfbf` | Reglas finas, bordes |
| `--line-strong` | `#b9af9b` | Bordes interactivos, separadores fuertes |
| `--accent` | `#a34f2f` | Terracota: énfasis, acciones, foco |
| `--accent-soft` | `#eed6c7` | Fondos de énfasis muy suaves |
| `--moss` | `#526b58` | Verde musgo: positivo, salud, activo |
| `--moss-soft` | `#dfe6da` | Fondos de éxito suaves |
| `--danger` | `#983b2c` | Errores y vencimientos |
| `--danger-soft` | `#f4ddd5` | Fondos de error |

Regla de proporción: **60% papel, 30% tinta/neutros, 10% acentos**. El terracota
no debe cubrir grandes superficies; es una marca de énfasis. El verde musgo no es
decorativo: significa saldo, éxito o disponible. El rojo se reserva para error,
vencimiento o destrucción.

Nunca usar negro puro (`#000`) ni blanco puro (`#fff`) como superficies.

### Tipografía

- **Display:** `'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino,
  Georgia, serif`. Serif editorial, con cursivas para énfasis y titulares grandes.
- **Texto:** `'Avenir Next', Avenir, 'Segoe UI', 'Helvetica Neue', ui-sans-serif,
  system-ui, sans-serif`. Humanista, legible, sin personalidad invasiva.
- **Números:** `'SFMono-Regular', 'Cascadia Code', 'Roboto Mono', Menlo, monospace`.
  Siempre con `font-variant-numeric: tabular-nums`.

No usar Inter, Roboto, Arial, Montserrat ni Poppins. No cargar fuentes desde una
CDN en runtime: la app debe funcionar sin red. Si se incorpora una fuente propia,
autohospedarla y justificar el cambio.

Jerarquía:

- Titular de página: serif, `clamp(3.8rem, 8vw, 7rem)`, `line-height` 0.86–0.95,
  `letter-spacing` negativa.
- Título de sección: serif, 1.7–2rem.
- Cuerpo: sans, 0.9–1.05rem, `line-height` 1.6–1.7.
- Kickers y labels: mayúsculas, 0.6–0.7rem, `letter-spacing` 0.12–0.14em.
- Cifras de saldo: serif grandes o mono, nunca ambas en el mismo bloque.

### Espacio, grilla y composición

- Ancho máximo de página: 1320px. Márgenes laterales generosos.
- Grilla editorial: hero asimétrico, barra lateral de 330px + contenido flexible.
- Reglas de 1px en lugar de sombras para separar. Las sombras son excepcionales
  (modales, tarjetas al hover) y siempre duras, de papel/tinta, no difusas.
- Radios de borde: 0–2px. La marca no es “tarjeta SaaS redondeada”.
- Aire: mejor espacio en blanco que contenedores anidados. Evitar “card dentro de
  card dentro de card”.
- Los índices editoriales (`01 / personas`, `02 / catálogo`, `03 / ficha`) son
  parte de la marca; usarlos para orientar, no en cada párrafo.
- La barra superior es sticky, translúcida sobre papel, con blur sutil.

### Componentes

- **Botón primario:** fondo `--ink`, texto `--paper-soft`, borde recto, mayúsculas
  pequeñas con tracking. Hover: terracota. Deshabilitado: opacidad baja, sin
  cambiar de forma.
- **Botón secundario:** transparente, borde `--line-strong`, texto tinta.
- **Botón de texto:** subrayado, terracota, solo para acciones terciarias.
- **Tarjeta de paquete:** borde fino, borde superior de 3px en musgo/terracota/rojo
  según estado. Saldo enorme, barra de progreso de 3px, metadatos en dos columnas.
- **Estado:** pill compacta, mayúsculas, borde del color semántico. `Activo` en
  musgo, `Agotado` en neutro, `Vencido` en rojo.
- **Lista de estudiantes:** filas tipo libro mayor, avatar circular con iniciales,
  saldo a la derecha en mono. Fila activa: fondo tinta y texto papel.
- **Movimientos:** fecha en mono pequeña, tipo en mayúsculas, motivo en sans,
  delta y saldo resultante alineados a la derecha. Separadores punteados.
- **Modal:** overlay tinta con blur, panel papel, barra superior terracota, sombra
  dura desplazada. Título serif. Cerrar con “×” y con Escape.
- **Formularios:** labels en mayúsculas pequeñas, inputs de una línea, borde
  recto, foco terracota de 2px. Los mensajes de error van inline, con fondo
  `--danger-soft` y borde izquierdo rojo.
- **Toast:** tinta, texto papel, borde izquierdo terracota, aparece abajo a la
  derecha y se va solo.
- **Vacío:** no usar ilustraciones genéricas. Un número o marca tipográfica, un
  titular serif, una explicación breve y una acción primaria.

### Movimiento

- Entrada de página: `rise` de 14px, 700ms, con stagger de 80–100ms entre hero,
  stats y workspace.
- Microinteracciones: 160–240ms, `ease` suave. Hover de tarjeta: `translateY(-3px)`
  y sombra dura.
- Modal: fade del overlay + entrada de 18px/scale 0.985.
- Respetar `prefers-reduced-motion: reduce`; no hay animación infinita salvo el
  pulso de estado “en vivo” del modo desarrollo.
- No usar parallax, autoplay, confeti ni animaciones que bloqueen la lectura.

### Iconografía e imágenes

- Preferir tipografía, reglas y formas geométricas antes que iconos.
- Si se usan iconos, deben ser de trazo fino, geométricos, coherentes en grosor.
  Nada de iconos rellenos coloridos ni emojis.
- No usar fotos de stock. Si se incorpora fotografía real del estudio, debe ser
  cálida, natural, sin filtros saturados, y tratada como material editorial.
- No usar lotos, mandalas, chakras, incienso ni “espiritualidad” decorativa.

## Voz y copy

- Español rioplatense, con “vos”: “Creá un estudiante”, “Revisá el saldo”.
- Tono: sereno, directo, preciso, humano. Sin exclamaciones. Sin jerga corporativa.
- Preferir verbos concretos: “Comprar paquete”, “Ajustar créditos”, “Procesar
  vencimientos”, “Registrar ajuste”.
- Explicar las reglas sin sonar a manual: “El saldo no se edita: se agrega un
  movimiento.”
- Nunca mostrar precios, importes, medios de pago ni facturación. Siempre
  “créditos”, no “dinero”.
- Fechas en `America/Argentina/Buenos_Aires`; usar `es-AR`.
- Estados vacíos que invitan a actuar, no que se disculpan.
- Errores que dicen qué pasó y qué hacer; no “Error inesperado” si se puede ser
  específico.

### Lenguaje inclusivo

- Usar **“alumnado”** para el colectivo y **“estudiante”** para el singular.
- No usar “las alumnas” ni “los alumnos” como genérico. El estudio no es solo de
  mujeres.
- Si hace falta nombrar a las personas, usar “alumnos y alumnas” o “estudiantes”.
  No usar “alumna/o” con barras en la interfaz.
- Evitar artículos y adjetivos que asuman género cuando no hace falta:
  “Alta registrada”, “Se agregó un estudiante”, “La ficha no tiene paquetes”.
- Los nombres de secciones, labels y estados deben funcionar para cualquier
  persona: “Alumnado”, “Nuevo estudiante”, “Estudiantes”, “Buscar en el alumnado”.
- Los datos de demo también usan lenguaje inclusivo: “Estudiante Demo”, no
  “Alumna Demo”.

Ejemplos canónicos:

- “El libro de créditos.”
- “Cada compra, reserva, devolución y vencimiento deja una huella auditable.”
- “Saldo vigente.”
- “Historial append-only. Los movimientos no se editan ni se borran.”
- “Modo desarrollo.”
- “Todavía no hay estudiantes. Creá el primer registro.”

Evitar:

- “¡Bienvenido a tu espacio de bienestar!”
- “Namaste”, “flow”, “mindfulness”, “transformá tu práctica”.
- “Sinergia”, “empoderar”, “solución integral”.
- Signos de exclamación y emojis en la interfaz.

## Accesibilidad y responsive

- Contraste mínimo AA. El texto muted sobre paper debe mantenerse legible.
- `:focus-visible` siempre visible, 2px terracota con offset.
- Todo control con label o `aria-label`; los formularios no dependen del placeholder.
- Modales con `role="dialog"`, `aria-modal`, título asociado, Escape y bloqueo de
  scroll del body.
- Mensajes de estado con `role="status"` o `role="alert"` según corresponda.
- Targets táctiles de al menos 44px en mobile.
- Breakpoints de referencia: 1120px (workspace a una columna), 900px (hero y
  stats), 640px (topbar, formularios y movimientos).
- No sacrificar claridad por densidad: en mobile, una acción principal por bloque.

## Implementación

- Los tokens viven en `apps/web/src/styles.css`. Si se agrega un token, actualizar
  esa hoja y esta skill.
- Los componentes reutilizables viven en `apps/web/src/components/`; la composición
  de la consola en `apps/web/src/App.tsx`.
- No introducir Tailwind, una librería de componentes ni un segundo sistema de
  diseño sin aprobación explícita. La hoja actual es custom y deliberada.
- No cargar fuentes, imágenes ni servicios de diseño desde la red en runtime.
- No agregar campos de dinero, precios o pagos.
- No construir autenticación visual en la consola de desarrollo; el badge “Modo
  desarrollo” y la ausencia de login son intencionales. El portal y el panel con
  roles llegan en el grupo 8.
- Al modificar una pantalla, revisar también estados de carga, vacío y error.
- Los cambios de marca que afecten tokens, tipografía o componentes base requieren
  una propuesta explícita y una revisión visual a 1440px y 390px.

## Flujo de trabajo para agentes

1. Leer `apps/web/src/styles.css`, `apps/web/src/App.tsx` y los componentes
   existentes antes de proponer algo nuevo.
2. Identificar si la pantalla es del alumnado (más aire), de staff (más densidad)
   o de desarrollo (consola del ledger).
3. Reutilizar tokens, tipografía, reglas y patrones existentes. Si falta un patrón,
   diseñarlo como extensión coherente, no como un sistema paralelo.
4. Escribir el copy en rioplatense y verificar que no haya dinero.
5. Implementar estados de carga, vacío y error además del caso feliz.
6. Verificar teclado, foco, contraste, overflow de textos largos y mobile.
7. Tomar capturas a 1440px y 390px; comparar con la consola canónica.
8. Ejecutar `npm run typecheck`, `npm run lint` y `npm test` si se tocó código.

## Checklist de revisión

- [ ] ¿Se usan los tokens de color existentes y la proporción 60/30/10?
- [ ] ¿La tipografía display es serif editorial y el cuerpo es humanista?
- [ ] ¿Los números son tabulares y los saldos tienen jerarquía clara?
- [ ] ¿Los bordes son finos/rectos y las sombras son excepcionales?
- [ ] ¿El terracota se usa como acento, no como fondo dominante?
- [ ] ¿El verde musgo significa algo positivo y el rojo solo error/vencimiento?
- [ ] ¿El copy está en rioplatense, sin exclamaciones, sin clichés de wellness?
- [ ] ¿Usa “alumnado”/“estudiante” y evita “las alumnas” como genérico?
- [ ] ¿No hay precios, importes ni medios de pago?
- [ ] ¿Hay estados de carga, vacío, error y éxito?
- [ ] ¿Funciona con teclado, foco visible y `prefers-reduced-motion`?
- [ ] ¿Se ve bien a 1440px y 390px?
- [ ] ¿Parece parte del mismo libro de créditos y no una plantilla genérica?

## Antipatrones

- Gradientes violetas, glassmorphism, neón, blobs, “aurora” o fondos de malla.
- Tarjetas redondeadas con sombras difusas y mucho padding simétrico.
- Iconos coloridos rellenos, emojis, ilustraciones de stock o lotos.
- Tipografías Inter/Roboto/Arial/Poppins.
- Exceso de badges, pills y colores pastel sin significado.
- “Dashboard SaaS” con sidebar oscura, tarjetas KPI y gráficos decorativos.
- Mostrar datos técnicos crudos (UUID, `booking_id`, `credit_movements`) en la UI
  de estudiantes o staff; la consola de desarrollo puede mostrarlos con cuidado.
- Copiar la estética maximalista de otras skills de diseño sin adaptarla a este
  estudio editorial y sereno.

## Definición de “hecho”

Una pantalla está lista cuando se ve como una página del libro de créditos, se
entiende sin explicación, respeta las reglas de negocio visibles, funciona en
mobile y teclado, y no introduce ningún elemento que un estudio de yoga real no
pondría en su mostrador.
