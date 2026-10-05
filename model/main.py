import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, Set
import asyncio
import cv2
import numpy as np
import base64
import json
import socket
import time
from vision import VisionProcessor

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

processor = VisionProcessor()
raw_frame_queue = asyncio.Queue(maxsize=1)

heatmap_clients: Set[WebSocket] = set()
demo_clients: Set[WebSocket] = set()

class ConfigUpdate(BaseModel):
    processing_enabled: Optional[bool] = None
    show_heatmap: Optional[bool] = None
    show_boxes: Optional[bool] = None
    show_flow: Optional[bool] = None
    heatmap_only: Optional[bool] = None
    intensity: Optional[float] = None
    radius: Optional[int] = None
    decay: Optional[float] = None
    flow_decay: Optional[float] = None
    confidence: Optional[float] = None
    resolution: Optional[int] = None


def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'
    finally:
        s.close()

async def broadcast_ws(clients: Set[WebSocket], payload: str):
    disconnected = set()
    for client in clients:
        try:
            await client.send_text(payload)
        except WebSocketDisconnect:
            disconnected.add(client)
        except Exception:
            disconnected.add(client)
    for client in disconnected:
        clients.remove(client)

async def processing_loop():
    while True:
        try:
            frame_bytes = await raw_frame_queue.get()
            np_arr = np.frombuffer(frame_bytes, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            
            if frame is not None:
                raw_img, heat_img, flow_img, stats, points = await asyncio.to_thread(processor.process_frame, frame)
                
                if heatmap_clients:
                    heatmap_payload = json.dumps({
                        'timestamp': int(time.time() * 1000),
                        'stats': stats,
                        'points': points
                    })
                    await broadcast_ws(heatmap_clients, heatmap_payload)

                if demo_clients:
                    _, buf_raw = cv2.imencode('.jpg', raw_img, [cv2.IMWRITE_JPEG_QUALITY, 75])
                    b64_raw = base64.b64encode(buf_raw).decode('utf-8')
                    
                    b64_heat = None
                    if heat_img is not None:
                        _, buf_heat = cv2.imencode('.jpg', heat_img, [cv2.IMWRITE_JPEG_QUALITY, 75])
                        b64_heat = base64.b64encode(buf_heat).decode('utf-8')

                    b64_flow = None
                    if flow_img is not None:
                        _, buf_flow = cv2.imencode('.jpg', flow_img, [cv2.IMWRITE_JPEG_QUALITY, 75])
                        b64_flow = base64.b64encode(buf_flow).decode('utf-8')
                    
                    demo_payload = json.dumps({
                        'image_raw': b64_raw,
                        'image_heat': b64_heat,
                        'image_flow': b64_flow
                    })
                    await broadcast_ws(demo_clients, demo_payload)

                
        except Exception as e:
            print(e)
            await asyncio.sleep(0.01)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(processing_loop())
    ip = get_local_ip()
    print("\n" + "="*60)
    print(f"Camara: http://{ip}:8000/static/phone.html")
    print(f"Dashboard: http://{ip}:8000/static/dashboard.html")
    print("="*60 + "\n")

@app.websocket("/ws/v1/stream")
async def ws_stream(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_bytes()
            if raw_frame_queue.full():
                try: raw_frame_queue.get_nowait()
                except asyncio.QueueEmpty: pass
            raw_frame_queue.put_nowait(data)
    except WebSocketDisconnect:
        pass

@app.websocket("/ws/v1/heatmap/data")
async def ws_heatmap_data(websocket: WebSocket):
    await websocket.accept()
    heatmap_clients.add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        heatmap_clients.remove(websocket)

@app.websocket("/ws/v1/video/demo")
async def ws_video_demo(websocket: WebSocket):
    await websocket.accept()
    demo_clients.add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        demo_clients.remove(websocket)

@app.get("/api/v1/config")
def get_config():
    return processor.config

@app.patch("/api/v1/config")
def update_config(config: ConfigUpdate):
    update_data = config.dict(exclude_unset=True)
    processor.update_config(update_data)
    return processor.config

@app.post("/api/v1/heatmap/clear")
def clear_heatmap():
    processor.clear_heatmap()
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, access_log=False)
