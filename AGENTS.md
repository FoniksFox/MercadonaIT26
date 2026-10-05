# AGENTS.md

Guidance for humans and AI agents working in this repository.

## Project

**MercaFlow** ("La tienda que entiende su propio movimiento") — entry for the
Mercadona IT UPV hackathon 2026. Theme: "El supermercado del futuro".

Goal: analyze surveillance-style video of a supermarket (and optionally a
warehouse) with artificial vision to extract:

1. A **heatmap** of where people move / stand over time.
2. A **vector field** of the direction and magnitude of movement.

The focus is **data extraction**. Uses of that data (layout optimization,
queue detection, staffing suggestions) are stretch goals / suggestions only,
to be tackled if time allows.

### MVP scope

- Take a video of a supermarket.
- Detect people with AI.
- Track the movement of each person.
- Generate a heatmap automatically.
- (Stretch) divide the store into sections.

### Team

| Person  | Role                        |
| ------- | --------------------------- |
| Boris   | Organization + presentation |
| Salva   | Organization + support      |
| Daniel  | PyTorch + backend           |
| Bohdan  | PyTorch + backend           |
| Edy     | Frontend                    |
| Carlos  | Frontend                    |

## Stack

- **Data / CV**: PyTorch (`torch`, `torchvision`) + `ultralytics` (YOLO) for
  person detection and tracking.
- **Backend**: Flask (Python), exposes a REST API to upload video and retrieve
  heatmap + vector field artifacts.
- **Frontend**: Angular with Tailwind CSS.
- **Env / deps**: `uv` for the Python backend (`pyproject.toml` + `uv.lock`).

## Layout

```
backend/     Flask + PyTorch service
frontend/    Angular + Tailwind web app
```

## Conventions

- **Language**: code, comments, and docs are written in **English**.
- **Backend** lives in `backend/`, managed with `uv`. Never edit `uv.lock` by
  hand — run `uv sync` / `uv add`.
- **Frontend** lives in `frontend/`, managed with npm + Angular CLI. Run ng
  commands via `npx ng ...` (no global `ng` install).
- Keep the heavy inference code in `backend/app/processing/` and isolate it
  from the Flask HTTP layer so models can be loaded once and reused.
- Inference is **CPU-only for now**. Select device via `INFERENCE_DEVICE`
  (defaults to `cpu`); the code auto-detects CUDA if present but the default
  dependency set is CPU-only (see `backend/pyproject.toml`).

## Common commands

Backend (from `backend/`):

```bash
uv sync                                  # create/refresh venv + install deps
uv run flask --app app run --debug       # run dev server
uv run pytest                            # run tests
uv add <package>                         # add a dependency
```

Frontend (from `frontend/`):

```bash
npm install
npm start            # ng serve
npm run build        # production build
```

## Notes / decisions

- Person detection uses YOLO (`ultralytics`). `torchvision` is available as an
  alternative detector if YOLO weights cannot be downloaded on-site.
- Heatmaps and vector fields are rendered server-side as images/JSON so the
  frontend stays simple; raw trajectories are also returned as JSON for
  flexibility.
- Video input is via **Flask file upload** (no bundled sample videos committed
  to git).
