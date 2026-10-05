"""Heatmap generation from accumulated person positions."""

from __future__ import annotations

import cv2
import numpy as np


class HeatmapAccumulator:
    """Accumulates person positions into a 2D histogram and renders a heatmap."""

    def __init__(self, frame_shape: tuple[int, int]) -> None:
        self.height, self.width = frame_shape[:2]
        self.accumulator = np.zeros((self.height, self.width), dtype=np.float32)

    def add_point(self, x: float, y: float) -> None:
        px, py = int(x), int(y)
        if 0 <= px < self.width and 0 <= py < self.height:
            self.accumulator[py, px] += 1.0

    def render(
        self,
        colormap: int = cv2.COLORMAP_JET,
        blur_kernel: int = 41,
        background: np.ndarray | None = None,
    ) -> np.ndarray:
        """Return a colored heatmap, optionally blended over a background frame."""
        blurred = cv2.GaussianBlur(self.accumulator, (blur_kernel, blur_kernel), 0)
        if blurred.max() > 0:
            normalized = (blurred / blurred.max() * 255).astype(np.uint8)
        else:
            normalized = np.zeros_like(blurred, dtype=np.uint8)
        heatmap = cv2.applyColorMap(normalized, colormap)

        if background is None:
            return heatmap
        if background.shape[:2] != (self.height, self.width):
            background = cv2.resize(
                background, (self.width, self.height)
            )
        return cv2.addWeighted(background, 0.5, heatmap, 0.5, 0)
