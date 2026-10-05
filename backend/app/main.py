"""Flask entrypoint.

Run with::

    uv run flask --app app run --debug
"""

from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
