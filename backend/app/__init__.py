"""MercaFlow backend application factory."""

from __future__ import annotations

from flask import Flask
from flask_cors import CORS

from app.config import Config


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(app)

    Config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    Config.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    from app.api.routes import bp

    app.register_blueprint(bp, url_prefix="/api")

    return app
