"""Person detection and tracking.

Two backends are provided:

- ``YoloDetector`` (default): YOLO via ``ultralytics``, with built-in ByteTrack
  tracking through ``model.track()``.
- ``TorchvisionDetector``: a pretrained ``torchvision`` detector used as a
  fallback when YOLO weights cannot be downloaded on-site. Tracking is handled
  by the simple :class:`CentroidTracker` defined below.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np


@dataclass
class Detection:
    """A single tracked person in a frame."""

    track_id: int
    center: tuple[float, float]  # (cx, cy) in pixel coordinates
    bbox: tuple[float, float, float, float]  # (x1, y1, x2, y2)


class Detector(Protocol):
    def detect(self, frame: np.ndarray) -> list[Detection]:
        """Return tracked detections for a single BGR frame."""


class YoloDetector:
    def __init__(
        self,
        model_name: str,
        device: str,
        person_class: int,
        conf: float,
    ) -> None:
        from ultralytics import YOLO  # local import keeps startup light

        self.person_class = person_class
        self.conf = conf
        self.device = device
        self.model = YOLO(model_name)

    def detect(self, frame: np.ndarray) -> list[Detection]:
        results = self.model.track(
            frame,
            classes=[self.person_class],
            conf=self.conf,
            persist=True,
            device=self.device,
            verbose=False,
        )
        boxes = results[0].boxes
        if boxes is None or len(boxes) == 0:
            return []

        detections: list[Detection] = []
        xyxy = boxes.xyxy.cpu().numpy()
        ids = boxes.id
        for i, box in enumerate(xyxy):
            x1, y1, x2, y2 = box
            cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
            track_id = int(ids[i].item()) if ids is not None else -1
            detections.append(Detection(track_id, (cx, cy), (x1, y1, x2, y2)))
        return detections


class TorchvisionDetector:
    def __init__(self, device: str, person_class: int, conf: float) -> None:
        import torch
        from torchvision.models.detection import (
            FasterRCNN_ResNet50_FPN_Weights,
            fasterrcnn_resnet50_fpn,
        )

        self.person_class = person_class
        self.conf = conf
        self.device = device
        self.model = fasterrcnn_resnet50_fpn(
            weights=FasterRCNN_ResNet50_FPN_Weights.DEFAULT
        )
        self.model.eval().to(self._torch_device())
        self._torch = torch
        self._tracker = CentroidTracker()

    def _torch_device(self):
        return self._torch.device(self.device if self.device != "cpu" else "cpu")

    def detect(self, frame: np.ndarray) -> list[Detection]:
        import torch

        image = torch.from_numpy(frame).permute(2, 0, 1).float() / 255.0
        image = image.unsqueeze(0).to(self._torch_device())

        with torch.no_grad():
            outputs = self.model(image)[0]

        centers: list[tuple[float, float]] = []
        bboxes: list[tuple[float, float, float, float]] = []
        for box, label, score in zip(
            outputs["boxes"], outputs["labels"], outputs["scores"]
        ):
            if label.item() != self.person_class or score.item() < self.conf:
                continue
            x1, y1, x2, y2 = box.tolist()
            centers.append(((x1 + x2) / 2.0, (y1 + y2) / 2.0))
            bboxes.append((x1, y1, x2, y2))

        track_ids = self._tracker.update(centers)
        return [
            Detection(tid, center, bbox)
            for tid, center, bbox in zip(track_ids, centers, bboxes)
        ]


class CentroidTracker:
    """Minimal IoU/centroid tracker used by the torchvision fallback."""

    def __init__(self, max_disappeared: int = 10, max_distance: float = 50.0) -> None:
        self.next_id = 0
        self.objects: dict[int, tuple[float, float]] = {}
        self.disappeared: dict[int, int] = {}
        self.max_disappeared = max_disappeared
        self.max_distance = max_distance

    def update(self, centers: list[tuple[float, float]]) -> list[int]:
        if not centers:
            for oid in list(self.disappeared):
                self.disappeared[oid] += 1
                if self.disappeared[oid] > self.max_disappeared:
                    self.objects.pop(oid, None)
                    self.disappeared.pop(oid, None)
            return []

        if not self.objects:
            for center in centers:
                self.objects[self.next_id] = center
                self.disappeared[self.next_id] = 0
                self.next_id += 1

        # Match existing objects to input centroids greedily by distance.
        object_ids = list(self.objects.keys())
        used_rows: set[int] = set()
        used_cols: set[int] = set()
        matches: dict[int, int] = {}

        import numpy as np

        for r, oid in enumerate(object_ids):
            distances = [
                np.linalg.norm(np.array(self.objects[oid]) - np.array(c))
                for c in centers
            ]
            if not distances:
                break
            c = int(np.argmin(distances))
            if c in used_cols or distances[c] > self.max_distance:
                continue
            matches[oid] = c
            used_rows.add(r)
            used_cols.add(c)

        ids: list[int] = [0] * len(centers)
        for oid, c in matches.items():
            ids[c] = oid
            self.objects[oid] = centers[c]
            self.disappeared[oid] = 0

        for c, center in enumerate(centers):
            if c in used_cols:
                continue
            self.objects[self.next_id] = center
            self.disappeared[self.next_id] = 0
            ids[c] = self.next_id
            self.next_id += 1

        for oid in list(self.objects.keys()):
            if oid not in matches.values() and oid not in ids:
                self.disappeared[oid] += 1
                if self.disappeared[oid] > self.max_disappeared:
                    self.objects.pop(oid, None)
                    self.disappeared.pop(oid, None)

        return ids


def build_detector(config) -> Detector:
    """Instantiate the configured detector backend."""

    if config.DETECTOR_BACKEND == "torchvision":
        return TorchvisionDetector(
            device=config.INFERENCE_DEVICE,
            person_class=config.PERSON_CLASS,
            conf=config.DETECTION_CONF,
        )
    return YoloDetector(
        model_name=config.YOLO_MODEL,
        device=config.INFERENCE_DEVICE,
        person_class=config.PERSON_CLASS,
        conf=config.DETECTION_CONF,
    )
