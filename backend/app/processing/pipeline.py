"""End-to-end video processing pipeline.

Takes a video path, runs person detection + tracking over every frame, and
produces:

- a heatmap image,
- a vector field image,
- a JSON file with the raw per-track trajectories.
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2

from app.config import Config
from app.processing.detector import Detection, build_detector
from app.processing.heatmap import HeatmapAccumulator
from app.processing.vectorfield import VectorFieldAccumulator

# Loaded lazily so models are shared across requests (Flask reload-safe via cache).
_detector = None


def get_detector():
    global _detector
    if _detector is None:
        _detector = build_detector(Config)
    return _detector


def process_video(video_path: str | Path, output_dir: str | Path) -> dict:
    """Process a video and write artifacts into ``output_dir``.

    Returns a dict describing the produced artifacts.
    """
    video_path = Path(video_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    detector = get_detector()
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    frame_count = 0
    heatmap = None
    vectorfield = None
    trajectories: dict[str, list[list[float]]] = {}
    background = None

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            frame_count += 1

            if background is None:
                background = frame
                heatmap = HeatmapAccumulator(frame.shape)
                vectorfield = VectorFieldAccumulator(
                    frame.shape, grid_size=Config.VECTOR_GRID_SIZE
                )

            detections: list[Detection] = detector.detect(frame)
            for det in detections:
                cx, cy = det.center
                heatmap.add_point(cx, cy)
                vectorfield.update(det.track_id, cx, cy)
                trajectories.setdefault(str(det.track_id), []).append([cx, cy])
    finally:
        cap.release()

    if background is None:
        raise ValueError("Video contained no readable frames")

    heatmap_img = heatmap.render(background=background)
    vector_img = vectorfield.render(background=background)

    heatmap_path = output_dir / "heatmap.png"
    vector_path = output_dir / "vectorfield.png"
    trajectories_path = output_dir / "trajectories.json"

    cv2.imwrite(str(heatmap_path), heatmap_img)
    cv2.imwrite(str(vector_path), vector_img)
    with open(trajectories_path, "w") as fh:
        json.dump(
            {
                "frame_count": frame_count,
                "tracks": len(trajectories),
                "trajectories": trajectories,
            },
            fh,
        )

    return {
        "frame_count": frame_count,
        "tracks": len(trajectories),
        "heatmap": heatmap_path.name,
        "vectorfield": vector_path.name,
        "trajectories": trajectories_path.name,
    }
