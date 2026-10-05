"""Vector field generation from person trajectories.

The vector field encodes the dominant direction and magnitude of movement per
grid cell, computed by averaging the displacement vectors of every tracked
person that passes through each cell.
"""

from __future__ import annotations

import cv2
import numpy as np


class VectorFieldAccumulator:
    def __init__(self, frame_shape: tuple[int, int], grid_size: int = 40) -> None:
        self.height, self.width = frame_shape[:2]
        self.grid_size = grid_size
        self.cols = max(1, self.width // grid_size)
        self.rows = max(1, self.height // grid_size)
        self.accum_u = np.zeros((self.rows, self.cols), dtype=np.float64)
        self.accum_v = np.zeros((self.rows, self.cols), dtype=np.float64)
        self.counts = np.zeros((self.rows, self.cols), dtype=np.int64)
        # Per-track last seen position, so we can compute per-frame displacement.
        self._last: dict[int, tuple[float, float]] = {}

    def update(self, track_id: int, x: float, y: float) -> None:
        last = self._last.get(track_id)
        self._last[track_id] = (x, y)
        if last is None:
            return
        dx = x - last[0]
        dy = y - last[1]

        col = int(np.clip(x / self.grid_size, 0, self.cols - 1))
        row = int(np.clip(y / self.grid_size, 0, self.rows - 1))
        self.accum_u[row, col] += dx
        self.accum_v[row, col] += dy
        self.counts[row, col] += 1

    def field(self) -> tuple[np.ndarray, np.ndarray]:
        """Return (u, v) arrays of average displacement per cell."""
        safe = np.where(self.counts > 0, self.counts, 1)
        u = self.accum_u / safe
        v = self.accum_v / safe
        return u, v

    def render(
        self,
        scale: float = 1.0,
        color: tuple[int, int, int] = (0, 255, 0),
        thickness: int = 2,
        background: np.ndarray | None = None,
    ) -> np.ndarray:
        u, v = self.field()
        if background is None:
            canvas = np.zeros((self.height, self.width, 3), dtype=np.uint8)
        else:
            canvas = background.copy()
            if canvas.shape[:2] != (self.height, self.width):
                canvas = cv2.resize(canvas, (self.width, self.height))

        for row in range(self.rows):
            for col in range(self.cols):
                if self.counts[row, col] == 0:
                    continue
                cx = int((col + 0.5) * self.grid_size)
                cy = int((row + 0.5) * self.grid_size)
                du = u[row, col] * scale
                dv = v[row, col] * scale
                mag = float(np.hypot(du, dv))
                if mag < 1e-6:
                    continue
                end = (cx + int(du), cy + int(dv))
                cv2.arrowedLine(canvas, (cx, cy), end, color, thickness, tipLength=0.3)
        return canvas
