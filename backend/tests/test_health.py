from app import create_app


def test_health():
    app = create_app()
    client = app.test_client()
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_analyze_rejects_missing_file():
    app = create_app()
    client = app.test_client()
    response = client.post("/api/analyze")
    assert response.status_code == 400
