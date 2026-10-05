import cv2
import numpy as np
import torch
from ultralytics import YOLO
import time

original_load = torch.load
def patched_load(*args, **kwargs):
    kwargs['weights_only'] = False
    return original_load(*args, **kwargs)
torch.load = patched_load

class VisionProcessor:
    def __init__(self):
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        print(f"\n--- Usando dispositivo: {self.device.upper()} ---")
        
        self.model = YOLO('yolov8n.pt')
        self.model.to(self.device)
        
        self.heatmap_canvas = None
        
        self.config = {
            'processing_enabled': True,
            'show_heatmap': True,
            'show_boxes': True,
            'heatmap_only': False,
            'intensity': 5.0,
            'radius': 31,
            'decay': 0.85,
            'confidence': 0.4,
            'resolution': 640
        }

    def update_config(self, new_config):
        for key, value in new_config.items():
            if value is not None:
                self.config[key] = value
        if self.config['radius'] % 2 == 0:
            self.config['radius'] += 1

    def clear_heatmap(self):
        if self.heatmap_canvas is not None:
            self.heatmap_canvas.fill(0.0)

    def process_frame(self, frame):
        start_time = time.time()
        
        h, w = frame.shape[:2]
        target_w = 480 if 'resolution' not in self.config else self.config['resolution']
        scale = target_w / w
        target_h = int(h * scale)
        frame_resized = cv2.resize(frame, (target_w, target_h))
        
        points = []

        if not self.config['processing_enabled']:
            latency = (time.time() - start_time) * 1000
            stats = {'count': 0, 'fps': int(1000/max(latency, 1)), 'latency': int(latency), 'device': self.device}
            return frame_resized, None, stats, points

        if self.heatmap_canvas is None or self.heatmap_canvas.shape[:2] != (target_h, target_w):
            self.heatmap_canvas = np.zeros((target_h, target_w), dtype=np.float32)

        results = self.model.track(
            frame_resized, persist=True, classes=[0], 
            conf=self.config['confidence'], tracker="bytetrack.yaml", verbose=False
        )

        self.heatmap_canvas *= self.config['decay']
        count = 0
        boxes_data = results[0].boxes
        
        if boxes_data is not None and boxes_data.id is not None:
            boxes = boxes_data.xyxy.cpu().numpy()
            track_ids = boxes_data.id.int().cpu().tolist()

            for box, track_id in zip(boxes, track_ids):
                x1, y1, x2, y2 = map(int, box)
                cx, cy = int((x1 + x2) / 2), int(y2)
                count += 1
                
                pad = 20
                cx = max(pad, min(cx, target_w - pad))
                cy = max(pad, min(cy, target_h - pad))

                points.append({"id": track_id, "x": cx, "y": cy})

                cv2.circle(self.heatmap_canvas, (cx, cy), 10, float(self.config['intensity']), -1)

                if self.config['show_boxes']:
                    cv2.rectangle(frame_resized, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    cv2.putText(frame_resized, f"ID: {track_id}", (x1, y1 - 10), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        colored_heatmap = None
        if self.config['show_heatmap']:
            radius = int(self.config['radius'])
            heatmap_blurred = cv2.GaussianBlur(self.heatmap_canvas, (radius, radius), 0)
            heatmap_norm = np.clip(heatmap_blurred * 50, 0, 255).astype(np.uint8) 
            colored_heatmap = cv2.applyColorMap(heatmap_norm, cv2.COLORMAP_JET)

        latency = (time.time() - start_time) * 1000
        fps = int(1000 / latency) if latency > 0 else 0

        stats = {
            'count': count, 'fps': fps, 'latency': int(latency), 'device': self.device
        }

        return frame_resized, colored_heatmap, stats, points
