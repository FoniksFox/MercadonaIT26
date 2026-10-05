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
        self.persistent_heatmap_canvas = None
        
        # Mapa de flujos (Vector Field)
        self.flow_grid_size = 45
        self.flow_u = None
        self.flow_v = None
        self.flow_counts = None
        self.last_track_positions = {}
        
        self.config = {
            'processing_enabled': True,
            'show_heatmap': True,
            'show_pheat': True,
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
            self.persistent_heatmap_canvas.fill(0.0)
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
            return frame_resized, None, None, None, stats, points

        if self.heatmap_canvas is None or self.heatmap_canvas.shape[:2] != (target_h, target_w):
            self.heatmap_canvas = np.zeros((target_h, target_w), dtype=np.float32)
            self.persistent_heatmap_canvas = np.zeros((target_h, target_w), dtype=np.float32)

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
        
        # El mapa de flujos ahora es acumulativo (sin decaimiento)

        count = 0
        boxes_data = results[0].boxes
        
        # Máscara para acumular el calor de este frame sin sobrescribir el historial
        frame_heat_mask = np.zeros_like(self.persistent_heatmap_canvas)
        
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
                    # Para el heatmap normal (con decaimiento), sobrescribir en este frame es aceptable
                    cv2.circle(self.heatmap_canvas, (cx, cy), 10, float(self.config['intensity']), -1)
                    
                    # Acumular en el frame actual de manera aditiva (si hay varias personas juntas, suman)
                    person_mask = np.zeros_like(frame_heat_mask)
                    cv2.circle(person_mask, (cx, cy), 10, 1.0, -1)
                    frame_heat_mask += person_mask

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
                        
                        c = int(np.clip(cx // self.flow_grid_size, 0, cols - 1))
                        r = int(np.clip(cy // self.flow_grid_size, 0, rows - 1))
                        
                        # Acumular SIEMPRE el conteo para medir tiempo de permanencia en la celda
                        self.flow_counts[r, c] += 1.0
                        
                        # Filtrar vibraciones mínimas (<2px) y saltos irreales de detección (>15% del ancho)
                        if 2.0 < dist < (target_w * 0.15):
                            self.flow_u[r, c] += dx
                            self.flow_v[r, c] += dy

                # Guardamos posición y estado de recorte para el siguiente frame
                self.last_track_positions[track_id] = (cx, cy, is_clipped)

                if self.config['show_boxes']:
                    box_color = (0, 165, 255) if is_bottom_clipped else (0, 255, 0)
                    cv2.rectangle(frame_resized, (x1, y1), (x2, y2), box_color, 2)
                    label = f"ID: {track_id}" + (" [Entrando...]" if is_bottom_clipped else "")
                    cv2.putText(frame_resized, label, (x1, y1 - 10), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 2)


        # Acumular el calor de este frame al lienzo persistente
        self.persistent_heatmap_canvas += frame_heat_mask

        # Limpiar tracks viejos para evitar fuga de memoria
        if len(self.last_track_positions) > 100:
            self.last_track_positions = {k: v for k, v in self.last_track_positions.items() if k in active_ids}

        # Generar Heatmaps
        colored_heatmap = None
        persistent_colored_heatmap = None
        if self.config.get('show_heatmap', True):
            radius = int(self.config['radius'])
            # Heatmap regular con decaimiento
            heatmap_blurred = cv2.GaussianBlur(self.heatmap_canvas, (radius, radius), 0)
            heatmap_norm = np.clip(heatmap_blurred * 50, 0, 255).astype(np.uint8) 
            colored_heatmap = cv2.applyColorMap(heatmap_norm, cv2.COLORMAP_JET)
            colored_heatmap[heatmap_norm == 0] = [0, 0, 0] # Fondo negro puro para mejorar contraste
            
        if self.config.get('show_pheat', True):
            radius = int(self.config['radius'])
            # Heatmap persistente (sin decaimiento, escalado respecto al valor máximo)
            p_heatmap_blurred = cv2.GaussianBlur(self.persistent_heatmap_canvas, (radius, radius), 0)
            p_max = float(np.max(p_heatmap_blurred))
            if p_max > 0:
                p_max = max(p_max, 50.0) # Evitar que los primeros frames sean puro rojo intenso
                # Aplicamos raíz cuadrada al ratio para que los caminos débiles sean mucho más visibles
                # aunque haya otra zona muy saturada.
                ratio = p_heatmap_blurred / p_max
                ratio = np.sqrt(ratio)
                p_heatmap_norm = np.clip(ratio * 255, 0, 255).astype(np.uint8)
            else:
                p_heatmap_norm = np.zeros_like(p_heatmap_blurred, dtype=np.uint8)
            persistent_colored_heatmap = cv2.applyColorMap(p_heatmap_norm, cv2.COLORMAP_JET)
            persistent_colored_heatmap[p_heatmap_norm == 0] = [0, 0, 0] # Fondo negro puro

        # Generar Mapa de Flujos (Vector Field)
        flow_img = None
        if self.config.get('show_flow', True):
            # Fondo completamente negro para limpiar la visualización
            flow_img = np.zeros_like(frame_resized)
            
            # Usar un mínimo de 30 frames para que no se ponga rojo de inmediato con poco movimiento
            max_cnt = max(float(np.max(self.flow_counts)), 30.0)
            
            for r in range(rows):
                for c in range(cols):
                    cnt = self.flow_counts[r, c]
                    # Solo mostrar celdas que tengan algo de tráfico real (más de medio segundo acumulado)
                    if cnt > 15.0:
                        u = self.flow_u[r, c] / max(cnt, 1e-4)
                        v = self.flow_v[r, c] / max(cnt, 1e-4)
                        mag = float(np.hypot(u, v))
                        
                        start_x = int((c + 0.5) * self.flow_grid_size)
                        start_y = int((r + 0.5) * self.flow_grid_size)

                        # Color dinámico según afluencia relativa (verde -> amarillo -> rojo)
                        ratio = min(cnt / max_cnt, 1.0)
                        if ratio < 0.5:
                            # Verde a Amarillo
                            t = ratio * 2.0
                            color = (0, int(255 * (1-t) + 220 * t), int(120 * (1-t) + 255 * t))
                        else:
                            # Amarillo a Rojo
                            t = (ratio - 0.5) * 2.0
                            color = (0, int(220 * (1-t) + 50 * t), 255)
                            
                        # El grosor escala con el tráfico
                        thickness = 1 + int(ratio * 3)

                        if mag > 0.5:
                            ang = np.arctan2(v, u)
                            # El tamaño de la flecha depende del volumen de gente (ratio), no de su velocidad
                            base_size = self.flow_grid_size * 0.3
                            scale = base_size + (self.flow_grid_size * 0.55 * ratio)
                            
                            end_x = int(start_x + scale * np.cos(ang))
                            end_y = int(start_y + scale * np.sin(ang))
                            cv2.arrowedLine(flow_img, (start_x, start_y), (end_x, end_y), 
                                            color, thickness, tipLength=0.4)
                        else:
                            # Si están parados, dibujar círculo de retención que crece con el tráfico
                            circle_radius = int(self.flow_grid_size * 0.15 + self.flow_grid_size * 0.3 * ratio)
                            cv2.circle(flow_img, (start_x, start_y), circle_radius, color, thickness)

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

        return frame_resized, colored_heatmap, flow_img, persistent_colored_heatmap, stats, points

