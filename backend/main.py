import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

DB_PATH = Path("/data/photobooks.db")
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

app = FastAPI()


def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS photobooks (
                album_id TEXT PRIMARY KEY,
                config TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS global_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                config TEXT NOT NULL
            )
            """
        )


init_db()


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    try:
        yield conn
    finally:
        conn.close()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/photobooks")
def list_photobooks():
    """Album ids that currently have a stored photobook - used by the
    frontend to prune photobooks whose Immich album no longer exists."""
    with get_db() as conn:
        rows = conn.execute("SELECT album_id FROM photobooks").fetchall()
    return {"albumIds": [r[0] for r in rows]}


@app.get("/photobooks/{album_id}")
def get_photobook(album_id: str):
    with get_db() as conn:
        row = conn.execute(
            "SELECT config FROM photobooks WHERE album_id = ?", (album_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="No photobook for this album")
    return JSONResponse(content=json.loads(row[0]))


@app.put("/photobooks/{album_id}")
async def put_photobook(album_id: str, request: Request):
    body = await request.body()
    try:
        config = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO photobooks (album_id, config, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(album_id) DO UPDATE SET
                config = excluded.config,
                updated_at = CURRENT_TIMESTAMP
            """,
            (album_id, json.dumps(config)),
        )
        conn.commit()
    return {"status": "ok"}


@app.delete("/photobooks/{album_id}")
def delete_photobook(album_id: str):
    with get_db() as conn:
        conn.execute("DELETE FROM photobooks WHERE album_id = ?", (album_id,))
        conn.commit()
    return {"status": "ok"}


@app.get("/globalconfig")
def get_global_config():
    with get_db() as conn:
        row = conn.execute(
            "SELECT config FROM global_config WHERE id = 1"
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="No global config yet")
    return JSONResponse(content=json.loads(row[0]))


@app.put("/globalconfig")
async def put_global_config(request: Request):
    body = await request.body()
    try:
        config = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO global_config (id, config) VALUES (1, ?)
            ON CONFLICT(id) DO UPDATE SET config = excluded.config
            """,
            (json.dumps(config),),
        )
        conn.commit()
    return {"status": "ok"}
