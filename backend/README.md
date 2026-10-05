# MercaFlow backend

Flask + PyTorch (YOLO) service for person detection, tracking, heatmap and
vector field extraction.

## Setup

```bash
uv sync
```

## Run

```bash
uv run flask --app app run --debug
```

## API

- `POST /api/analyze` — multipart upload with a `video` file. Returns a result
  id and artifact URLs.
- `GET /api/results/<id>/heatmap.png` — rendered heatmap.
- `GET /api/results/<id>/vectorfield.png` — rendered vector field.
- `GET /api/results/<id>/trajectories.json` — raw trajectories.
- `GET /api/health` — liveness probe.

## Configuration

All via environment variables (see `app/config.py`):

- `INFERENCE_DEVICE` (default `cpu`)
- `DETECTOR_BACKEND` (`yolo` | `torchvision`)
- `YOLO_MODEL` (default `yolo11n.pt`)
- `DETECTION_CONF`, `VECTOR_GRID_SIZE`, ...
