# PostgreSQL local con Podman o Docker

El archivo `compose.yaml` de la raíz levanta PostgreSQL 16 en un contenedor y guarda los datos en `data/postgres/pgdata/`. El directorio es un bind mount del proyecto, así que los datos sobreviven a `podman compose down` y a reinicios del equipo. PostgreSQL usa `PGDATA=/var/lib/postgresql/data/pgdata` para no inicializar sobre la raíz del montaje, que contiene los archivos de control de Git.

## Requisitos

- Podman con `podman compose` (en este entorno: Podman 5.8 y `podman-compose`), o Docker con `docker compose`.
- La imagen `postgres:16-alpine` se descarga la primera vez. Después el contenedor funciona sin red.

## Arranque

```bash
podman compose up -d db
```

Con Docker:

```bash
docker compose up -d db
```

Verificar que la base esté lista:

```bash
podman compose ps
podman compose logs -f db
podman exec estudio-yoga-db pg_isready -U estudio_yoga -d estudio_yoga
```

## Variables de entorno

Copiar el ejemplo y ajustar si hace falta:

```bash
cp .env.example .env
```

La aplicación usa `DATABASE_URL`; el harness de tests usa `TEST_DATABASE_URL` y, por defecto, crea `estudio_yoga_test` sobre la misma instancia. El archivo `.env` está ignorado por Git. Si personalizás `TEST_DATABASE_URL`, usá una base exclusiva de tests: el harness la elimina y la recrea en cada corrida.

## Conexión

| Dato | Valor por defecto |
| --- | --- |
| Host | `127.0.0.1` |
| Puerto | `5432` |
| Base | `estudio_yoga` |
| Usuario | `estudio_yoga` |
| Contraseña | `estudio_yoga_dev` |

Cadena de conexión:

```text
postgresql://estudio_yoga:estudio_yoga_dev@127.0.0.1:5432/estudio_yoga
```

Para abrir `psql` dentro del contenedor:

```bash
podman exec -it estudio-yoga-db psql -U estudio_yoga -d estudio_yoga
```

La contraseña por defecto es solo para desarrollo. `POSTGRES_DB`, `POSTGRES_USER` y `POSTGRES_PASSWORD` se aplican únicamente cuando PostgreSQL inicializa el directorio de datos por primera vez. Para una base nueva, definir los valores en un `.env` en la raíz (está ignorado por Git) antes del primer arranque:

```dotenv
POSTGRES_DB=estudio_yoga
POSTGRES_USER=estudio_yoga
POSTGRES_PASSWORD=una_clave_local
POSTGRES_PORT=5432
```

Para cambiar la contraseña de una base ya creada, usar SQL y luego actualizar la cadena de conexión de la aplicación:

```bash
podman exec -it estudio-yoga-db psql -U estudio_yoga -d estudio_yoga \
  -c "ALTER USER estudio_yoga WITH PASSWORD 'una_clave_local';"
```

Cambiar `POSTGRES_PASSWORD` en `.env` y recrear el contenedor no modifica una base ya inicializada.

## Persistencia y reseteo

Los archivos de PostgreSQL quedan en `data/postgres/pgdata/`. Ese directorio está ignorado por Git salvo `.gitkeep` y `.gitignore`. El directorio padre `data/postgres/` debe ser traversable por el usuario `postgres` del contenedor; por eso el proyecto lo deja con permisos `755`.

Para detener el contenedor sin borrar datos:

```bash
podman compose down
```

Para volver a levantarlo:

```bash
podman compose up -d db
```

Para borrar la base y empezar de cero, detener el contenedor y eliminar el directorio de datos (sin borrar los archivos de control):

```bash
podman compose down
podman unshare rm -rf data/postgres/pgdata
podman compose up -d db
```

En Docker rootful, el equivalente es `sudo rm -rf data/postgres/pgdata`.

## Podman rootless y SELinux

El compose usa la opción `:Z` en el bind mount para etiquetar el directorio con SELinux, que es lo que necesita este entorno. El directorio `data/postgres/` debe poder ser traversado por el usuario `postgres` del contenedor; el proyecto lo crea con permisos `755`.

Si el contenedor no puede crear `pgdata`:

```bash
podman compose down
chmod 755 data/postgres
podman unshare chown -R 0:0 data/postgres
podman unshare rm -rf data/postgres/pgdata
podman compose up -d db
```

El `chown` dentro de `podman unshare` devuelve el directorio al usuario del host y el `rm` limpia una inicialización fallida. Después del arranque, `pgdata` queda propiedad del usuario `postgres` mapeado por el contenedor, por eso puede no ser legible directamente desde el host; se inspecciona con `podman exec`.

En Docker Desktop para macOS, si la opción `:Z` no es aceptada, quitarla del `compose.yaml`; no hay SELinux en ese host.

## Puerto ocupado

Si el puerto `5432` ya está en uso:

```bash
POSTGRES_PORT=5433 podman compose up -d db
```

La cadena de conexión cambia al puerto elegido.
