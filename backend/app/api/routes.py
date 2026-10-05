"""REST API routes for video upload and result retrieval."""

from __future__ import annotations

import uuid
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_from_directory

from app.processing.pipeline import process_video

bp = Blueprint("api", __name__)

ALLOWED_EXTENSIONS = {"mp4", "avi", "mov", "mkv", "webm", "m4v"}


def _allowed(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@bp.get("/health")
def health():
    return jsonify(status="ok")


@bp.post("/analyze")
def analyze():
    if "video" not in request.files:
        return jsonify(error="Missing 'video' file in request"), 400

    file = request.files["video"]
    if file.filename == "" or not _allowed(file.filename):
        return jsonify(error="Invalid or unsupported video file"), 400

    upload_dir: Path = current_app.config["UPLOAD_DIR"]
    output_dir: Path = current_app.config["OUTPUT_DIR"]

    result_id = uuid.uuid4().hex
    ext = file.filename.rsplit(".", 1)[1].lower()
    video_path = upload_dir / f"{result_id}.{ext}"
    file.save(video_path)

    result_output_dir = output_dir / result_id
    try:
        result = process_video(video_path, result_output_dir)
    except Exception as exc:  # noqa: BLE001 - surface a clean JSON error
        return jsonify(error=f"Processing failed: {exc}"), 500

    return jsonify(
        id=result_id,
        **result,
        artifacts={
            "heatmap": f"/api/results/{result_id}/heatmap.png",
            "vectorfield": f"/api/results/{result_id}/vectorfield.png",
            "trajectories": f"/api/results/{result_id}/trajectories.json",
        },
    )


@bp.get("/results/<result_id>/<path:filename>")
def get_artifact(result_id: str, filename: str):
    directory = Path(current_app.config["OUTPUT_DIR"]) / result_id
    return send_from_directory(directory, filename)
