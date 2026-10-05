# MercaFlow

> **La tienda que entiende su propio movimiento.**

Entry for the Mercadona IT UPV hackathon 2026 — theme **"El supermercado del
futuro"**.

MercaFlow analyzes surveillance-style video of a supermarket (and, later, a
warehouse) with artificial vision to extract measurable data about how people
move through the space:

- **Heatmap** of where people move and stand over time.
- **Vector field** of the direction and magnitude of movement.

The focus is on **data extraction** — turning camera footage into anonymous,
actionable information (layout optimization, queue detection, staffing) is
left as suggestions.

## Repository layout

```
backend/     Flask + PyTorch (YOLO) service — detection, tracking, heatmap, vector field
frontend/    Angular + Tailwind web app — upload video, view results
```

## Quick start

### Backend

```bash
cd backend
uv sync
uv run flask --app app run --debug
```

The API runs at `http://127.0.0.1:5000`.

### Frontend

```bash
cd frontend
npm install
npm start
```

Open `http://localhost:4200`.

## How it works

1. Upload a video via the REST API (or the web app).
2. YOLO detects people; a tracker follows each person across frames.
3. Trajectories are accumulated into a **heatmap** and a **vector field**.
4. Results are returned as images + JSON trajectories.

See `AGENTS.md` for conventions and the full MVP scope.
