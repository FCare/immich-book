import io
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import List

import httpx
from fastapi import FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from pypdf import PdfWriter

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
        
        # Migration: add user_id column, attributing any pre-existing
        # (pre-multi-user) photobooks to a single default account
        if "user_id" not in columns:
            print("Migrating photobooks table: adding user_id column")
            conn.execute("ALTER TABLE photobooks ADD COLUMN user_id TEXT")

            # Drop old primary key and create new composite primary key
            # SQLite doesn't support DROP PRIMARY KEY, so we need to recreate the table
            print("Recreating photobooks table with composite primary key (user_id, album_id)")
            conn.execute("ALTER TABLE photobooks RENAME TO photobooks_old")
            conn.execute(
                """
                CREATE TABLE photobooks (
                    user_id TEXT NOT NULL,
                    album_id TEXT NOT NULL,
                    config TEXT NOT NULL,
                    assets_snapshot TEXT,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, album_id)
                )
                """
            )

            DEFAULT_MIGRATED_USER_ID = "admin"
            conn.execute(
                """
                INSERT INTO photobooks (user_id, album_id, config, assets_snapshot, updated_at)
                SELECT ?, album_id, config, assets_snapshot, updated_at FROM photobooks_old
                """,
                (DEFAULT_MIGRATED_USER_ID,),
            )
            conn.execute("DROP TABLE photobooks_old")

            photobook_count = conn.execute(
                "SELECT COUNT(*) FROM photobooks WHERE user_id = ?",
                (DEFAULT_MIGRATED_USER_ID,),
            ).fetchone()[0]
            print(f"Migration complete: attributed {photobook_count} photobooks to '{DEFAULT_MIGRATED_USER_ID}'")
        
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS global_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                config TEXT NOT NULL
            )
            """
        )

        # Table for per-user Immich configuration
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_immich_config (
                user_id TEXT PRIMARY KEY,
                immich_server_url TEXT NOT NULL,
                immich_api_key TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
def list_photobooks(request: Request):
    """Album ids that currently have a stored photobook - used by the
    frontend to prune photobooks whose Immich album no longer exists."""
    # Authentik ForwardAuth injects X-Authentik-Username with the user's username
    user_id = request.headers.get("x-authentik-username")
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing x-authentik-username header")
    
    with get_db() as conn:
        rows = conn.execute("SELECT album_id FROM photobooks WHERE user_id = ?", (user_id,)).fetchall()
    return {"albumIds": [r[0] for r in rows]}


@app.get("/photobooks/{album_id}")
def get_photobook(album_id: str, request: Request):
    """Get photobook config only (no change detection)."""
    # Authentik ForwardAuth injects X-Authentik-User with the user's UUID
    user_id = request.headers.get("x-authentik-username")
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing x-authentik-username header")
    
    with get_db() as conn:
        row = conn.execute(
            "SELECT config FROM photobooks WHERE user_id = ? AND album_id = ?", (user_id, album_id)
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
    user_id = request.headers.get("x-authentik-username")
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing x-authentik-username header")
    
    body = await request.body()
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    current_ids = set(payload.get("currentAssetIds", []))
    
    with get_db() as conn:
        row = conn.execute(
            "SELECT assets_snapshot FROM photobooks WHERE user_id = ? AND album_id = ?", (user_id, album_id)
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
    user_id = request.headers.get("x-authentik-username")
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing x-authentik-username header")
    
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
                INSERT INTO photobooks (user_id, album_id, config, assets_snapshot, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, album_id) DO UPDATE SET
                    config = excluded.config,
                    assets_snapshot = excluded.assets_snapshot,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (user_id, album_id, json.dumps(config), json.dumps(assets)),
            )
        else:
            # Update only config, preserve existing snapshot
            conn.execute(
                """
                INSERT INTO photobooks (user_id, album_id, config, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, album_id) DO UPDATE SET
                    config = excluded.config,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (user_id, album_id, json.dumps(config)),
            )
        conn.commit()
    return {"status": "ok"}


@app.delete("/photobooks/{album_id}")
def delete_photobook(album_id: str, request: Request):
    user_id = request.headers.get("x-authentik-username")
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing x-authentik-username header")
    
    with get_db() as conn:
        conn.execute("DELETE FROM photobooks WHERE user_id = ? AND album_id = ?", (user_id, album_id))
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


@app.get("/user/immich-config")
def get_user_immich_config(request: Request):
    """Get the user's Immich server configuration."""
    user_id = request.headers.get("x-authentik-username")
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing x-authentik-username header")

    with get_db() as conn:
        row = conn.execute(
            "SELECT immich_server_url, immich_api_key FROM user_immich_config WHERE user_id = ?",
            (user_id,)
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="No Immich config for this user")

    return {
        "immichServerUrl": row[0],
        "immichApiKey": row[1],
    }


@app.put("/user/immich-config")
async def put_user_immich_config(request: Request):
    """Set the user's Immich server configuration."""
    user_id = request.headers.get("x-authentik-username")
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing x-authentik-username header")

    body = await request.body()
    try:
        config = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    immich_server_url = config.get("immichServerUrl")
    immich_api_key = config.get("immichApiKey")

    if not immich_server_url or not immich_api_key:
        raise HTTPException(
            status_code=400,
            detail="Missing immichServerUrl or immichApiKey"
        )

    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO user_immich_config (user_id, immich_server_url, immich_api_key, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                immich_server_url = excluded.immich_server_url,
                immich_api_key = excluded.immich_api_key,
                updated_at = CURRENT_TIMESTAMP
            """,
            (user_id, immich_server_url, immich_api_key),
        )
        conn.commit()

    return {"status": "ok"}


@app.api_route("/immich-proxy/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def immich_proxy(path: str, request: Request):
    """Proxy requests to the user's configured Immich server with their API key."""
    user_id = request.headers.get("x-authentik-username")
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing x-authentik-username header")

    # Get user's Immich config
    with get_db() as conn:
        row = conn.execute(
            "SELECT immich_server_url, immich_api_key FROM user_immich_config WHERE user_id = ?",
            (user_id,)
        ).fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="No Immich config set. Please configure your Immich server in Settings."
        )

    immich_server_url, immich_api_key = row

    # Build the upstream URL
    upstream_url = f"{immich_server_url.rstrip('/')}/api/{path}"

    # Forward query parameters
    if request.url.query:
        upstream_url += f"?{request.url.query}"

    # Prepare headers
    headers = dict(request.headers)
    headers["x-api-key"] = immich_api_key
    # Remove host header to avoid conflicts
    headers.pop("host", None)

    # Forward the request
    async with httpx.AsyncClient() as client:
        try:
            response = await client.request(
                method=request.method,
                url=upstream_url,
                headers=headers,
                content=await request.body(),
                timeout=180.0,
            )

            # Stream the response back
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=dict(response.headers),
            )
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Error connecting to Immich server: {str(e)}")


@app.post("/pdf/merge")
def merge_pdf(files: List[UploadFile] = File(...)):
    """
    Concatenates already-rendered PDF parts (uploaded in order) into one
    file. The frontend renders a large book's interior in page chunks
    client-side (react-pdf's WASM layout engine crashes the tab on a
    document with hundreds of pages built in one pass) and asks this
    endpoint to do only the final concatenation - a large book's combined
    size (multiple GB for a several-hundred-photo book at full quality)
    can exceed what a browser tab can hold as one contiguous buffer, but
    the server has far more memory headroom. No re-encoding happens here,
    pages are copied as-is, so this costs nothing in image quality.

    Declared as a plain (non-async) endpoint on purpose: pypdf is
    synchronous/CPU-bound, and merging a large book can take a while.
    FastAPI runs a `def` path operation in a worker thread automatically,
    so this doesn't block the event loop - and everything else served
    off it, health checks included - the way an `async def` endpoint
    calling this same blocking code directly would.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    writer = PdfWriter()
    try:
        for part in files:
            writer.append(io.BytesIO(part.file.read()))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid PDF part: {e}")

    output = io.BytesIO()
    writer.write(output)
    writer.close()

    # A plain Response with the full bytes, not StreamingResponse(output):
    # Starlette iterates a raw file-like object's own __iter__, which for
    # BytesIO means "split on \n" (its default line-iteration), not "read
    # in binary chunks" - the wrong behavior for arbitrary PDF bytes. The
    # merged file is already fully built in memory at this point either
    # way, so there's nothing to gain from streaming it out incrementally.
    return Response(
        content=output.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="photobook.pdf"'},
    )
