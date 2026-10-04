# DarConverter

All-in-One File Converter built with **Astro, TypeScript, Svelte, PostgreSQL and Drizzle ORM**.

DarConverter converts images, vectors and PDFs. The homepage is the converter: pick a conversion, drop a file, watch the real output render, then download it. This README describes the current, verified state.

---

## Phase status

| Area | Status |
| ---- | ------ |
| Astro SSR with Node adapter | Implemented |
| TypeScript, Tailwind CSS, Svelte 5 islands | Implemented |
| Layout, navigation, footer, dark mode | Implemented |
| Centralised tool configuration | Implemented |
| Dynamic tool pages generated from config | Implemented |
| PostgreSQL schema and Drizzle migrations | Implemented |
| Database-aware conversion flow | Implemented |
| Temporary storage with UUID filenames | Implemented |
| Automatic cleanup of expired files and jobs | Implemented |
| Server-side image conversion (Sharp, Resvg, pdf-lib) | Implemented |
| Browser-side image conversion (Canvas) | Implemented |
| Upload validation (size, extension, MIME, magic bytes) | Implemented |
| Result preview from real output bytes (image, SVG, PDF, text) | Implemented |
| Pan and zoom in every preview | Implemented |
| Health endpoint for the database | Implemented |
| Blackbox HTTP test suite (`qa-blackbox.mjs`) | Implemented |
| PDF tools (merge, split, rotate, protect, PDF to image/text) | Not built |
| PDF to Word via FastAPI | Not built |
| Office documents to PDF via LibreOffice | Not built |
| CSV, JSON, XLSX, XML, YAML conversion | Not built |
| Audio and video conversion via FFmpeg | Not built |
| Asynchronous job queue and polling | Not built |
| Rate limiting middleware and CORS policy | Not built |
| Docker, docker-compose, containers | Not built |

Anything not listed as implemented does not exist yet. There are no placeholder endpoints, and no route that pretends to convert a file.

---

## Implemented tools

All 15 tools are declared once in `src/data/tools.ts` and rendered from that single source.

| Tool | Runs in | Notes |
| ---- | ------- | ----- |
| PNG to JPG | Browser or server | Quality, background, resize, rotation |
| JPG to PNG | Browser or server | Resize, rotation |
| PNG to WebP | Browser or server | Quality, resize, rotation |
| JPG to WebP | Browser or server | Quality, resize, rotation |
| WebP to PNG | Browser or server | Resize, rotation |
| WebP to JPG | Browser or server | Quality, background, resize, rotation |
| SVG to PNG | Server | Rendered with Resvg, arbitrary output size |
| SVG to JPG | Server | Quality and background |
| SVG to WebP | Server | Quality and background |
| SVG to PDF | Server | One page per SVG |
| Image to PDF | Server | Multiple images into one multi-page PDF |
| Image to SVG | Server | Traced with ImageTracer |
| PNG to SVG | Server | Traced with ImageTracer |
| JPG to SVG | Server | Traced with ImageTracer |
| WebP to SVG | Server | Traced with ImageTracer |

Server-side decoding accepts PNG, JPG/JPEG, WebP, GIF, TIFF, AVIF and SVG. Two formats are deliberately refused instead of half-supported:

* **HEIC / HEIF** are detected but rejected, because decoding depends on the codecs compiled into the runtime.
* **BMP** is rejected as well. The Sharp build in this project has no BMP decoder, so accepting it would only ever produce a late 422. It is not advertised on any page and not listed as an accepted upload.

### Preview

The preview is never a stand-in for the file:

* images and SVG results are rendered from the converted object URL;
* PDF results are rendered from the returned bytes with PDF.js, page one, at up to 2× device pixel ratio;
* text-shaped results are read back from the blob;
* everything else shows the real MIME type and byte size instead of a picture.

Every preview can be panned by dragging, zoomed with the wheel, a pinch gesture or the on-screen controls, and operated from the keyboard (arrows to pan, `+`/`-` to zoom, `0` to fit).

---

## Requirements

* Node.js 20 or newer
* PostgreSQL 14 or newer (tested against PostgreSQL 18 on Neon)
* pgAdmin 4 for database management

Neon is the currently configured host: `DATABASE_URL` points at a Neon pooler endpoint and `npm run db:migrate` applies `drizzle/0000_tearful_gateway.sql` to it. Any PostgreSQL 14+ host works the same way.

---

## Setup

Install dependencies:

```bash
npm install
```

Copy the environment template and adjust the values:

```bash
cp .env.example .env
```

```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/file_converter

MAX_FILE_SIZE_MB=50

TEMP_FILE_TTL_MINUTES=30

PUBLIC_APP_NAME=DarConverter

PUBLIC_MAX_FILE_SIZE_MB=50

PDF2DOCX_URL=http://pdf2docx:8000
```

`.env` is ignored by Git and must never be committed.

### Create the database

Using pgAdmin, or the PostgreSQL CLI:

```bash
createdb -h localhost -U postgres file_converter
```

Then apply the schema:

```bash
npm run db:migrate
```

### Start the development server

```bash
npm run dev
```

Open http://localhost:4321.

Useful scripts:

```bash
npm run check       # Astro, TypeScript and Svelte diagnostics
npm run build       # Production build
npm run preview     # Run the production build
npm run db:generate # Generate a migration from the schema
npm run db:migrate  # Apply pending migrations
npm run db:push     # Push the schema without a migration file
npm run db:studio   # Open Drizzle Studio
```

---

## Database

PostgreSQL stores metadata only. Binary files never enter the database; they stay in temporary filesystem storage and are deleted automatically.

```text
users
  id, email (unique), password_hash, name, created_at, updated_at

conversion_jobs
  id, status, tool_slug, error_message, created_at, updated_at, expires_at

conversion_files
  id, job_id, original_name, stored_name, input_format, output_format,
  input_size, output_size, input_path, output_path, created_at, expires_at

conversion_history
  id, job_id, user_id (nullable), tool_slug, input_format, output_format,
  input_size, output_size, created_at
```

Notes:

* Primary keys are UUIDs generated by PostgreSQL (`gen_random_uuid()`).
* `conversion_jobs.status` is an enum: `waiting`, `processing`, `completed`, `failed`, `expired`.
* `conversion_history.user_id` is nullable so authenticated history can be added later without a migration that rewrites existing rows.
* Sizes use `bigint` so large multi-file PDF exports do not overflow.
* Deleting a job cascades to `conversion_files` and `conversion_history`.

---

## Conversion flow

```text
Browser
  -> validate file (extension, MIME, magic bytes, size)
  -> POST /api/image-convert
  -> conversion_jobs row (processing)
  -> temporary input file with a UUID name
  -> Sharp / Resvg / pdf-lib
  -> temporary output file with a UUID name
  -> conversion_files row
  -> conversion_history row
  -> conversion_jobs row (completed)
  -> file streamed to the browser
  -> removed later by the cleanup job
```

If the conversion fails, temporary files are deleted immediately, the job row is marked `failed` with a readable message, and the client receives a JSON error.

Simple conversions do not touch the database at all: they run in the browser through the Canvas API.

---

## Temporary storage

```text
storage/
  input/
  output/
  temp/
```

The contents are ignored by Git, only `.gitkeep` files are tracked.

Rules:

* Every stored file gets a UUID filename, for example `550e8400-e29b-41d4-a716-446655440000.png`.
* The original filename is never used to build a path. It is stored as metadata and sanitised before it reaches a response header.
* Path resolution rejects anything that does not match `kind/uuid.extension`, which blocks path traversal.
* Files expire after `TEMP_FILE_TTL_MINUTES`.

### Cleanup

`src/lib/cleanup.ts` runs a sweep 10 seconds after the first API request and then every 5 minutes. Each sweep:

* deletes `input/`, `output/` and `temp/` files older than the TTL, using modification time;
* marks overdue jobs as `expired`;
* deletes jobs that expired more than an hour ago, which cascades to their file and history rows.

The sweep is idempotent and never throws: a missing or already deleted file is ignored.

---

## API

Responses are consistent.

Success:

```json
{ "success": true, "data": {} }
```

Error:

```json
{ "success": false, "error": "Human readable error message." }
```

### POST /api/image-convert

Converts one image, or several images into one PDF. Because the result is a file, a successful response is a binary download rather than a JSON envelope. Errors always use the JSON envelope.

Request: `multipart/form-data`

| Field | Required | Description |
| ----- | -------- | ----------- |
| `file` | yes | One file, or several when `output=PDF` |
| `output` | yes | `PNG`, `JPG`, `WEBP`, `AVIF`, `TIFF`, `GIF`, `PDF` or `SVG` |
| `tool` | no | Tool slug recorded on the job |
| `quality` | no | 1 to 100, default 85 |
| `width`, `height` | no | Target size; the aspect ratio is preserved |
| `background` | no | Hex colour such as `#ffffff` |
| `rotation` | no | `0`, `90`, `180` or `270` |
| `keepMetadata` | no | `true` keeps EXIF, ICC and IPTC data |
| `traceMode` | no | `bw` or `color`, for SVG output |
| `traceColors`, `traceDetail`, `traceSmoothing`, `traceMaxEdge` | no | ImageTracer tuning, for SVG output |

```bash
curl -X POST \
  -H "Origin: http://localhost:4321" \
  -F "file=@image.png" \
  -F "output=JPG" \
  -F "quality=85" \
  -F "tool=png-to-jpg" \
  http://localhost:4321/api/image-convert \
  --output converted.jpg
```

Multiple images into one PDF:

```bash
curl -X POST \
  -H "Origin: http://localhost:4321" \
  -F "file=@first.png" \
  -F "file=@second.jpg" \
  -F "output=PDF" \
  http://localhost:4321/api/image-convert \
  --output images.pdf
```

Successful response headers:

```text
Content-Type: image/jpeg
Content-Disposition: attachment; filename="image.jpg"
X-Conversion-Job-Id: 1f0c…
X-Conversion-Expires-At: 2026-01-01T10:30:00.000Z
X-Output-Width: 320
X-Output-Height: 200
```

Status codes:

| Code | Meaning |
| ---- | ------- |
| 400 | Missing file, unsupported format, extension/MIME/content mismatch |
| 403 | Request rejected by Astro's cross-site origin protection |
| 422 | The file was accepted but could not be decoded or encoded |
| 503 | The database is not configured or not reachable |

Astro's built-in origin check is active, so requests must come from the same origin. Command-line clients have to send an `Origin` header; browsers send it automatically.

### GET /api/health

Reports the database connection and whether the tables the app writes to exist. It never leaks the connection string.

```json
{
  "success": true,
  "data": {
    "connected": true,
    "driver": "neon-postgresql",
    "migrationsApplied": true,
    "missingTables": [],
    "serverVersion": "PostgreSQL 18.6 …",
    "appName": "DarConverter"
  }
}
```

| Code | Meaning |
| ---- | ------- |
| 200 | Connected, and every required table is present |
| 503 | `DATABASE_URL` missing, the database is unreachable, or tables are missing (`X-Missing-Tables` lists them) |

### Endpoints not implemented yet

`POST /api/jobs`, `GET /api/jobs/:id`, `GET /api/jobs/:id/download` and `POST /api/pdf-to-word` do not exist.

---

## Security

Implemented:

* Upload size limit from `MAX_FILE_SIZE_MB`
* Extension, MIME type and magic byte validation
* UUID storage names, original names kept as metadata only
* Path traversal protection through strict stored-path validation
* Sanitised download filenames in `Content-Disposition`
* `X-Content-Type-Options: nosniff` and `no-store` on responses
* Astro origin protection on server-rendered routes
* Automatic deletion of temporary files
* Errors returned as readable messages, never as stack traces

Not implemented yet: rate limiting and an explicit CORS policy. There is currently no request throttling, so do not expose this build to the public internet as-is.

---

## Project structure

```text
src/
  components/
    Converter.svelte        Upload, options, queue, result and download island
    QuickConvert.svelte     Homepage converter with the tool picker
    ToolSelect.svelte       Grouped conversion picker
    UploadZone.svelte       Drag and drop plus file picker
    PreviewPanel.svelte     Live before/after preview
    ImageCompare.svelte     Overlay comparison with a draggable divider
    PreviewViewport.svelte  Shared pan and zoom surface for every preview
    ResultPreview.svelte    Preview rendered from the converted bytes
    PreviewInfo.svelte      Dimensions and size of a preview
    StepRail.svelte         Upload, Convert, Preview, Download progress
    Footer.astro
    Navbar.astro
    Toolcard.astro
  data/
    tools.ts                Single source of truth for every tool
  db/
    index.ts                Lazy pg Pool and Drizzle instance
    schema/
      conversion-files.ts
      conversion-history.ts
      conversion-jobs.ts
      index.ts
      users.ts
  layouts/
    Layouts.astro
  lib/
    api.ts                  JSON envelope and download responses
    cleanup.ts              Expiry sweep and scheduler
    env.ts                  Typed environment access
    file-utils.ts           Filename helpers for the client
    format-utils.ts         Format labels, sizes and aspect ratios
    image-convert.ts        Sharp, Resvg and pdf-lib pipeline
    image-preview.ts        Browser-side live preview pipeline
    result-preview.ts       PDF.js rendering and text read-back
    storage.ts              UUID storage paths
    validation.ts           Upload validation and magic bytes
    vectorize.ts            ImageTracer options
  pages/
    index.astro             Converter-first homepage and tool directory
    [slug].astro            One prerendered page per tool
    api/
      health.ts
      image-convert.ts
  styles/
    global.css
  env.d.ts

qa-blackbox.mjs             Blackbox HTTP test suite
drizzle/                    Generated migrations
storage/                    Temporary files, Git-ignored
drizzle.config.ts
```

---

## Testing

`npm run check` and `npm run build` are the static gate. `astro check` currently reports 0 errors, 0 warnings and 0 hints across 36 files.

`qa-blackbox.mjs` is the behavioural suite. It only talks HTTP to a running server, so it verifies what a user or a client actually gets:

```bash
npm run dev            # or: npx astro dev --background
node qa-blackbox.mjs   # in a second terminal
```

It covers, against the real API and the real database:

* the health endpoint and the Neon schema check;
* all 15 tools, verifying the returned bytes are really the requested format (decoded with Sharp, parsed with pdf-lib, SVG asserted to contain real `<path>` data);
* a three-file PDF batch, asserting page count, page size and filename;
* every advertised input format, plus BMP being refused rather than half-supported;
* options that must change the output: width, rotation, background flattening, quality, bw tracing;
* validation failures: empty file, wrong content, extension/MIME mismatch, oversize upload, HEIC, unsupported output, missing file, non-multipart body, multi-file raster;
* CSRF origin protection in all three directions;
* branding and routing on the homepage and all 15 tool pages, including that no fake prototype copy survives.

Last run: **64 checks, 64 passing, 0 failing.**

Not covered by automation: the browser-only code paths (Canvas conversion, pan/zoom gestures, PDF.js worker startup) and visual responsive checks. There is no browser automation in this repository, so those are verified by hand in a real browser.

---

## Known limitations

* HEIC and HEIF are detected but rejected, because decoding depends on the codecs compiled into the runtime.
* BMP is rejected, because the bundled Sharp build has no BMP decoder.
* PDF pages produced by SVG to PDF and Image to PDF follow the proportions of each image rather than a fixed paper size, and pixels are converted to points as CSS pixels (72/96), so a 320×240 image becomes a 240×180 pt page.
* Multi-page PDF embeds each page as PNG when the image has an alpha channel and as JPG otherwise, to keep the file size reasonable.
* SVG output is traced, not reconstructed: ImageTracer produces new paths from the raster, so text does not stay selectable.
* Temporary files live on the local filesystem, which is fine locally but would need object storage for multiple instances.
* There is no authentication, so `conversion_history.user_id` is always null.
* There is no rate limiting yet.
* Tool pages are prerendered, so adding a tool requires a rebuild.
* `astro` is declared as `latest` in `package.json`, so a fresh install can pull a different major version than the one this was verified against (Astro 7.3.5). Pin it before relying on reproducible builds.

---

## License

This project is intended for educational, portfolio and development purposes. Add the appropriate license before public distribution.
