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
        # Create table if it doesn't exist
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS photobooks (
                album_id TEXT PRIMARY KEY,
                config TEXT NOT NULL,
                assets_snapshot TEXT,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        # Note: assets_snapshot is a JSON array of {id, type, originalFileName, fileCreatedAt, localDateTime}
        
        # Migration: add assets_snapshot column if it doesn't exist
        cursor = conn.execute("PRAGMA table_info(photobooks)")
        columns = [row[1] for row in cursor.fetchall()]
        if "assets_snapshot" not in columns:
            print("Migrating photobooks table: adding assets_snapshot column")
            conn.execute("ALTER TABLE photobooks ADD COLUMN assets_snapshot TEXT")
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
    """Get photobook config only (no change detection)."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT config FROM photobooks WHERE album_id = ?", (album_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="No photobook for this album")
    
    config = json.loads(row[0])
    return JSONResponse(content=config)


@app.post("/photobooks/{album_id}/detect-changes")
async def detect_changes(album_id: str, request: Request):
    """
    Detect missing/new photos by comparing current asset IDs with stored snapshot.
    
    POST body: { "currentAssetIds": ["id1", "id2", ...] }
    """
    body = await request.body()
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    current_ids = set(payload.get("currentAssetIds", []))
    
    with get_db() as conn:
        row = conn.execute(
            "SELECT assets_snapshot FROM photobooks WHERE album_id = ?", (album_id,)
        ).fetchone()
    
    if row is None:
        # No photobook yet, all assets are "new"
        print(f"[detect-changes] No photobook found for {album_id}, {len(current_ids)} new assets", flush=True)
        return JSONResponse(content={
            "missingAssets": [],
            "newAssetIds": list(current_ids),
        })
    
    stored_assets = json.loads(row[0]) if row[0] else []
    
    # Handle case where snapshot exists but is empty/null
    if not stored_assets:
        print(f"[detect-changes] Empty snapshot for {album_id}, {len(current_ids)} new assets", flush=True)
        return JSONResponse(content={
            "missingAssets": [],
            "newAssetIds": list(current_ids),
        })
    
    stored_ids = set(asset["id"] for asset in stored_assets)
    
    # Detect changes
    missing_asset_ids = stored_ids - current_ids  # Was in photobook, no longer in album
    new_asset_ids = current_ids - stored_ids      # In album, not in photobook
    
    print(f"[detect-changes] {album_id}: {len(stored_ids)} stored, {len(current_ids)} current, {len(missing_asset_ids)} missing, {len(new_asset_ids)} new", flush=True)
    
    # Find full metadata for missing assets
    missing_assets = [asset for asset in stored_assets if asset["id"] in missing_asset_ids]
    
    return JSONResponse(content={
        "missingAssets": missing_assets,
        "newAssetIds": list(new_asset_ids),
    })


@app.put("/photobooks/{album_id}")
async def put_photobook(album_id: str, request: Request):
    body = await request.body()
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    config = payload.get("config", payload)  # Support both { config: ... } and direct config
    assets = payload.get("assets")  # Optional snapshot: [{id, type, originalFileName, fileCreatedAt, localDateTime}]
    
    with get_db() as conn:
        if assets is not None:
            # Update both config and snapshot
            conn.execute(
                """
                INSERT INTO photobooks (album_id, config, assets_snapshot, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(album_id) DO UPDATE SET
                    config = excluded.config,
                    assets_snapshot = excluded.assets_snapshot,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (album_id, json.dumps(config), json.dumps(assets)),
            )
        else:
            # Update only config, preserve existing snapshot
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
