# MercaTrack

> **La tienda que entiende su propio movimiento.**

Proyecto para la hackathon de la Cátedra Mercadona IT organizado en la UPV 2026 — temática **"El supermercado del futuro"**.

MercaTrack analiza vídeos de estilo vigilancia de un supermercado utilizando visión artificial para extraer datos medibles sobre cómo se mueven las personas por el espacio:

- **Mapa de calor (Regular)**: Visualiza por dónde se mueven y se detienen las personas en tiempo real, con una estela de decaimiento temporal.
- **Mapa de calor (Persistente)**: Acumula todo el movimiento a lo largo del tiempo sin decaimiento para mostrar los pasillos y zonas con mayor tráfico.

El enfoque principal es la **extracción de datos** — transformar las grabaciones de cámara en información anónima y procesable (optimización de la distribución, detección de colas, gestión de personal).

## Estructura del repositorio

- `model/` — Servicio backend con FastAPI + PyTorch (YOLOv8) para la detección en tiempo real, seguimiento y generación de mapas de calor vía WebSockets. Incluye una dashboard estática integrada.
- `frontend/` — Aplicación web en Angular + Tailwind para subir vídeos y visualizar los resultados.

## Inicio rápido

### Backend (Model)

El motor de IA y la API están construidos con FastAPI y YOLOv8.

```bash
cd model
python -m venv venv
source venv/bin/activate  # En Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

La API y los WebSockets se ejecutan en `http://127.0.0.1:8000`.
Puedes acceder al visualizador en tiempo real (dashboard) en `http://127.0.0.1:8000/static/dashboard.html`.

Para consultar la documentación completa de los endpoints de la API, revisa [`model/API.md`](model/API.md).

### Frontend

El frontend en Angular se conecta al backend para renderizar los datos.

```bash
cd frontend
npm install
npm start
```

Abre `http://localhost:4200`.

## Cómo funciona

1. Se procesa una señal de cámara o vídeo fotograma a fotograma.
2. Un modelo YOLOv8 (`yolov8s.pt`) detecta a las personas. Está optimizado con seguimiento de centroides mediante suavizado EMA (Media Móvil Exponencial) para manejar vistas cenitales (desde arriba) de forma eficaz.
3. El algoritmo ByteTrack sigue a cada persona de forma única entre fotogramas.
4. Las trayectorias se acumulan en **mapas de calor** tanto regulares como persistentes.
5. Los datos se transmiten en tiempo real vía WebSockets a los clientes conectados (frontend/dashboard).

## Equipo

- Boris: Organización + presentación
- Salva: Organización + soporte
- Daniel: IA + backend
- Bohdan: IA + backend
- Edy: Frontend
- Carlos: Frontend
