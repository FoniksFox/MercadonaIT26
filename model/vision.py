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
        
        # Mapa de flujos (Vector Field)
        self.flow_grid_size = 35
        self.flow_u = None
        self.flow_v = None
        self.flow_counts = None
        self.last_track_positions = {}
        
        self.config = {
            'processing_enabled': True,
            'show_heatmap': True,
            'show_boxes': True,
            'show_flow': True,
            'heatmap_only': False,
            'intensity': 5.0,
            'radius': 31,
            'decay': 0.85,
            'flow_decay': 0.90,
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
        if self.flow_u is not None:
            self.flow_u.fill(0.0)
            self.flow_v.fill(0.0)
            self.flow_counts.fill(0.0)
        self.last_track_positions.clear()


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
            stats = {'count': 0, 'fps': int(1000/max(latency, 1)), 'latency': int(latency), 'device': self.device, 'hotspots': []}
            return frame_resized, None, None, stats, points

        if self.heatmap_canvas is None or self.heatmap_canvas.shape[:2] != (target_h, target_w):
            self.heatmap_canvas = np.zeros((target_h, target_w), dtype=np.float32)

        cols = max(1, target_w // self.flow_grid_size)
        rows = max(1, target_h // self.flow_grid_size)
        if self.flow_u is None or self.flow_u.shape != (rows, cols):
            self.flow_u = np.zeros((rows, cols), dtype=np.float32)
            self.flow_v = np.zeros((rows, cols), dtype=np.float32)
            self.flow_counts = np.zeros((rows, cols), dtype=np.float32)

        results = self.model.track(
            frame_resized, persist=True, classes=[0], 
            conf=self.config['confidence'], tracker="bytetrack.yaml", verbose=False
        )

        self.heatmap_canvas *= self.config['decay']
        
        flow_decay = float(self.config.get('flow_decay', 0.90))
        self.flow_u *= flow_decay
        self.flow_v *= flow_decay
        self.flow_counts *= flow_decay

        count = 0
        boxes_data = results[0].boxes
        
        active_ids = set()
        if boxes_data is not None and boxes_data.id is not None:
            boxes = boxes_data.xyxy.cpu().numpy()
            track_ids = boxes_data.id.int().cpu().tolist()

            for box, track_id in zip(boxes, track_ids):
                x1, y1, x2, y2 = map(int, box)
                count += 1
                active_ids.add(track_id)
                
                w_box = max(x2 - x1, 1)
                h_box = max(y2 - y1, 1)
                aspect_ratio = h_box / w_box

                # Detección de persona incompleta / clipeada por los bordes
                # Si toca el borde inferior del encuadre y no tiene la proporción completa de una persona (ratio < 1.85),
                # significa que sus pies aún no han entrado en el plano (o ya han salido).
                is_bottom_clipped = (y2 >= target_h - 4) and (aspect_ratio < 1.85)
                is_side_clipped = (x1 <= 3 or x2 >= target_w - 3) and (w_box < 25)
                is_clipped = is_bottom_clipped or is_side_clipped

                # Posición bruta: centroide del rectángulo (mucho más estable que los pies)
                cx_raw = (x1 + x2) / 2.0
                cy_raw = (y1 + y2) / 2.0
                
                # Aplicar suavizado (Exponential Moving Average) para evitar saltos bruscos
                alpha = 0.2  # Factor de suavizado
                if track_id in self.last_track_positions:
                    prev_x, prev_y, prev_clipped = self.last_track_positions[track_id]
                    cx = int(alpha * cx_raw + (1 - alpha) * prev_x)
                    cy = int(alpha * cy_raw + (1 - alpha) * prev_y)
                else:
                    cx = int(cx_raw)
                    cy = int(cy_raw)
                
                # Asegurar coordenadas válidas dentro del lienzo (sin el pad forzado de 20px)
                cx = int(np.clip(cx, 0, target_w - 1))
                cy = int(np.clip(cy, 0, target_h - 1))

                points.append({"id": track_id, "x": cx, "y": cy})

                # Solo pintar en el mapa de calor si los pies están realmente en el plano visible.
                # Esto evita la acumulación irreal de calor en el borde mientras la persona entra.
                if not is_bottom_clipped:
                    cv2.circle(self.heatmap_canvas, (cx, cy), 10, float(self.config['intensity']), -1)

                # Acumulación de desplazamiento vectorial (Vector Field)
                if track_id in self.last_track_positions:
                    # Ya tenemos prev_x, prev_y, prev_clipped
                    
                    # Solo calculamos vector de flujo si la persona ya estaba completa y visible en el frame anterior.
                    # Cuando los pies aparecen por primera vez (transición de clipped a no-clipped),
                    # el cambio brusco de y2 no es desplazamiento real, sino la corrección del cuadro de detección.
                    if not prev_clipped and not is_clipped:
                        dx = cx - prev_x
                        dy = cy - prev_y
                        dist = float(np.hypot(dx, dy))
                        # Filtrar vibraciones mínimas (<2px) y saltos irreales de detección (>15% del ancho)
                        if 2.0 < dist < (target_w * 0.15):
                            c = int(np.clip(cx // self.flow_grid_size, 0, cols - 1))
                            r = int(np.clip(cy // self.flow_grid_size, 0, rows - 1))
                            self.flow_u[r, c] += dx
                            self.flow_v[r, c] += dy
                            self.flow_counts[r, c] += 1.0

                # Guardamos posición y estado de recorte para el siguiente frame
                self.last_track_positions[track_id] = (cx, cy, is_clipped)

                if self.config['show_boxes']:
                    box_color = (0, 165, 255) if is_bottom_clipped else (0, 255, 0)
                    cv2.rectangle(frame_resized, (x1, y1), (x2, y2), box_color, 2)
                    label = f"ID: {track_id}" + (" [Entrando...]" if is_bottom_clipped else "")
                    cv2.putText(frame_resized, label, (x1, y1 - 10), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 2)


        # Limpiar tracks viejos para evitar fuga de memoria
        if len(self.last_track_positions) > 100:
            self.last_track_positions = {k: v for k, v in self.last_track_positions.items() if k in active_ids}

        # Generar Heatmap
        colored_heatmap = None
        if self.config['show_heatmap']:
            radius = int(self.config['radius'])
            heatmap_blurred = cv2.GaussianBlur(self.heatmap_canvas, (radius, radius), 0)
            heatmap_norm = np.clip(heatmap_blurred * 50, 0, 255).astype(np.uint8) 
            colored_heatmap = cv2.applyColorMap(heatmap_norm, cv2.COLORMAP_JET)

        # Generar Mapa de Flujos (Vector Field)
        flow_img = None
        if self.config.get('show_flow', True):
            # Base oscura semitransparente sobre la imagen de la cámara
            flow_img = (frame_resized * 0.4).astype(np.uint8)
            for r in range(rows):
                for c in range(cols):
                    cnt = self.flow_counts[r, c]
                    if cnt > 0.3:
                        u = self.flow_u[r, c] / max(cnt, 1e-4)
                        v = self.flow_v[r, c] / max(cnt, 1e-4)
                        mag = float(np.hypot(u, v))
                        
                        start_x = int((c + 0.5) * self.flow_grid_size)
                        start_y = int((r + 0.5) * self.flow_grid_size)

                        # Color según afluencia (verde -> amarillo -> rojo)
                        if cnt > 5.0:
                            color = (0, 50, 255) # Rojo / Alta afluencia
                            thickness = 2
                        elif cnt > 2.0:
                            color = (0, 220, 255) # Amarillo / Afluencia media
                            thickness = 2
                        else:
                            color = (0, 255, 120) # Verde / Flujo bajo
                            thickness = 1

                        if mag > 1.2:
                            scale = min(mag * 2.8, self.flow_grid_size * 1.3)
                            ang = np.arctan2(v, u)
                            end_x = int(start_x + scale * np.cos(ang))
                            end_y = int(start_y + scale * np.sin(ang))
                            cv2.arrowedLine(flow_img, (start_x, start_y), (end_x, end_y), 
                                            color, thickness, tipLength=0.35)
                        else:
                            # Si están parados (alta afluencia estática), dibujar círculo de retención
                            cv2.circle(flow_img, (start_x, start_y), int(min(cnt * 2, 12)), color, 1)

        # Zonas de mayor afluencia (top 3)
        hotspots = []
        if np.max(self.flow_counts) > 0.5:
            flat_indices = np.argsort(self.flow_counts.ravel())[::-1][:3]
            for rank, idx in enumerate(flat_indices):
                r, c = divmod(idx, cols)
                traffic = float(self.flow_counts[r, c])
                if traffic > 0.5:
                    hotspots.append({
                        "rank": rank + 1,
                        "x": int((c + 0.5) * self.flow_grid_size),
                        "y": int((r + 0.5) * self.flow_grid_size),
                        "traffic": round(traffic, 1)
                    })

        latency = (time.time() - start_time) * 1000
        fps = int(1000 / latency) if latency > 0 else 0

        stats = {
            'count': count, 
            'fps': fps, 
            'latency': int(latency), 
            'device': self.device,
            'hotspots': hotspots
        }

        return frame_resized, colored_heatmap, flow_img, stats, points

