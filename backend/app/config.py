"""Application configuration, loaded from environment variables."""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


class Config:
    # Inference device: "cpu" (default), "cuda", or "mps". The dependency set is
    # CPU-only for now, so "cpu" is what works out of the box.
    INFERENCE_DEVICE: str = os.getenv("INFERENCE_DEVICE", "cpu")

    # Which detector backend to use: "yolo" (default) or "torchvision".
    DETECTOR_BACKEND: str = os.getenv("DETECTOR_BACKEND", "yolo")

    # YOLO model to download/load (see https://docs.ultralytics.com/models/).
    YOLO_MODEL: str = os.getenv("YOLO_MODEL", "yolo11n.pt")

    # COCO class id for "person".
    PERSON_CLASS: int = 1

    # Minimum confidence for a detection to be kept.
    DETECTION_CONF: float = float(os.getenv("DETECTION_CONF", "0.25"))

    # Directories for uploaded videos and generated artifacts.
    UPLOAD_DIR: Path = Path(os.getenv("UPLOAD_DIR", BASE_DIR / "data" / "uploads"))
    OUTPUT_DIR: Path = Path(os.getenv("OUTPUT_DIR", BASE_DIR / "data" / "output"))

    # Max upload size (bytes) — 512 MB by default.
    MAX_CONTENT_LENGTH: int = int(os.getenv("MAX_CONTENT_LENGTH", str(512 * 1024 * 1024)))

    # Grid resolution (pixels per cell) for the vector field.
    VECTOR_GRID_SIZE: int = int(os.getenv("VECTOR_GRID_SIZE", "40"))


UPLOAD_DIR = Config.UPLOAD_DIR
OUTPUT_DIR = Config.OUTPUT_DIR
