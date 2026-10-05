# MercaFlow AI - API Documentation

Este documento describe los endpoints disponibles en el backend (FastAPI) para que un frontend externo pueda integrarse con el sistema de visión artificial, enviar vídeo en tiempo real y recibir los mapas de calor y metadatos.

## URL Base
El servidor se levanta por defecto en `http://0.0.0.0:8000`.

---

## 📡 WebSockets (Tiempo real)

### 1. Ingesta de Vídeo
`ws://<host>:8000/ws/v1/stream`

Endpoint para **enviar** los frames de vídeo crudos (raw) desde la cámara al motor de IA.
- **Formato esperado**: Frames en binario puro (bytes), preferiblemente codificados en JPEG.
- **Frecuencia**: Se recomienda no exceder los 30 FPS para no saturar la cola.

### 2. Datos Analíticos (Metadatos)
`ws://<host>:8000/ws/v1/heatmap/data`

Endpoint para **recibir** los datos analíticos de cada frame procesado. No envía imágenes pesadas, solo datos estructurados para renderizado UI (ideal para Angular/React).
- **Formato de respuesta (JSON)**:
  ```json
  {
    "timestamp": 1696512345000,
    "stats": {
      "count": 4, 
      "fps": 28,
      "latency": 35,
      "device": "CUDA",
      "hotspots": [
        { "rank": 1, "x": 320, "y": 240, "traffic": 150.5 },
        { "rank": 2, "x": 100, "y": 150, "traffic": 85.2 }
      ]
    },
    "points": [
      { "id": 1, "x": 120, "y": 300 },
      { "id": 2, "x": 400, "y": 210 }
    ]
  }
  ```
  - `stats.count`: Número de personas actualmente en cámara.
  - `stats.hotspots`: Top 3 zonas con más tránsito (basado en el histórico del vector field).
  - `points`: Coordenadas en tiempo real de los peatones detectados.

### 3. Demo Visual (Imágenes renderizadas)
`ws://<host>:8000/ws/v1/video/demo`

Endpoint para **recibir** los fotogramas ya procesados y renderizados por el backend.
- **Formato de respuesta (JSON)**:
  ```json
  {
    "image_raw": "<base64_string_jpeg>",
    "image_heat": "<base64_string_jpeg>",
    "image_flow": "<base64_string_jpeg>",
    "image_persistent_heat": "<base64_string_jpeg>"
  }
  ```
  - Contiene las imágenes en codificación Base64 listas para insertar en el `src` de etiquetas `<img>` HTML (`data:image/jpeg;base64,...`).

---

## 🔌 API REST (Control y Configuración)

### 1. Obtener Configuración Actual
**`GET /api/v1/config`**

Devuelve el estado completo de la configuración del motor de IA.

- **Respuesta Exitosa (200 OK)**
  ```json
  {
    "processing_enabled": true,
    "show_heatmap": true,
    "show_pheat": true,
    "show_boxes": true,
    "show_flow": true,
    "heatmap_only": false,
    "intensity": 5.0,
    "radius": 31,
    "decay": 0.85,
    "flow_decay": 0.90,
    "confidence": 0.4,
    "resolution": 640
  }
  ```

### 2. Modificar Configuración
**`PATCH /api/v1/config`**

Permite alterar la configuración del motor en caliente (sin reiniciar). Todos los campos son opcionales; solo se actualizarán los provistos en el payload.

- **Cuerpo de la petición (JSON)** (Cualquier subconjunto de propiedades):
  ```json
  {
    "processing_enabled": false,
    "radius": 51,
    "confidence": 0.5
  }
  ```
- **Respuesta Exitosa (200 OK)**: Devuelve el objeto de configuración actualizado.

### 3. Limpiar Datos Históricos (Reset)
**`POST /api/v1/heatmap/clear`**

Reinicia a cero todos los mapas (calor, calor persistente y campo vectorial) y olvida los tracks antiguos.

- **Respuesta Exitosa (200 OK)**
  ```json
  {
    "status": "ok"
  }
  ```
