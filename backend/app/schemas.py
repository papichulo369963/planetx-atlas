"""Pydantic contracts for the public read-only API (mirrored in frontend/src/types.ts)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Evidence = Literal["observed", "calculated", "inferred", "illustrative", "unknown"]


class Target(BaseModel):
    query: str
    main_id: str | None = None
    otype: str | None = None
    ra_catalog: float = Field(description="ICRS RA [deg] at catalog epoch")
    dec_catalog: float = Field(description="ICRS Dec [deg] at catalog epoch")
    catalog_epoch: str = "J2000.0"
    ra: float = Field(description="ICRS RA [deg] propagated to target_epoch")
    dec: float = Field(description="ICRS Dec [deg] propagated to target_epoch")
    target_epoch: float = Field(description="Julian year of the propagated position")
    pmra_masyr: float | None = None
    pmdec_masyr: float | None = None
    plx_mas: float | None = None
    moved_arcsec: float = Field(0.0, description="Offset between catalog and propagated position")
    source: str
    evidence: Evidence = "calculated"


class OverlayPoint(BaseModel):
    id: str
    x: float = Field(description="Pixel x on the common grid (0-based)")
    y: float = Field(description="Pixel y on the common grid (0-based)")
    label: str
    kind: Literal["gaia", "catwise", "simbad", "asteroid", "comet", "vizier"]
    extra: dict = {}


class Overlay(BaseModel):
    source: str
    epoch_note: str
    points: list[OverlayPoint]


class ApiError(BaseModel):
    detail: str
