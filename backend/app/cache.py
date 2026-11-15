"""Tiny disk cache: JSON documents keyed by a stable hash of the request."""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any, Callable

from .config import CACHE


def key(*parts: Any) -> str:
    raw = json.dumps(parts, sort_keys=True, default=str)
    return hashlib.sha1(raw.encode()).hexdigest()[:20]


def cached_json(namespace: str, k: str, ttl_s: float | None, producer: Callable[[], Any]) -> Any:
    """Return cached value or compute it. ttl_s=None means never expire."""
    folder = CACHE / namespace
    folder.mkdir(parents=True, exist_ok=True)
    path: Path = folder / f"{k}.json"
    if path.exists() and (ttl_s is None or time.time() - path.stat().st_mtime < ttl_s):
        return json.loads(path.read_text(encoding="utf-8"))
    try:
        value = producer()
    except Exception:
        if path.exists():  # serve the last good answer when the archive is down (stale-on-error)
            return json.loads(path.read_text(encoding="utf-8"))
        raise
    path.write_text(json.dumps(value), encoding="utf-8")
    return value
