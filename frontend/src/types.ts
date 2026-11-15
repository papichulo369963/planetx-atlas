// Contracts mirrored from backend/app/schemas.py and endpoint payloads.
export type Evidence = "observed" | "calculated" | "inferred" | "illustrative" | "unknown";

export interface Target {
  query: string; main_id: string | null; otype: string | null;
  ra_catalog: number; dec_catalog: number; catalog_epoch: string;
  ra: number; dec: number; target_epoch: number;
  pmra_masyr: number | null; pmdec_masyr: number | null; plx_mas: number | null;
  moved_arcsec: number; source: string; evidence: Evidence;
}

export interface Frame {
  id: string; url: string; mjd: number; mjd_end: number; detector: number;
  em_min_um: number; em_max_um: number; collection: string; exptime_s: number;
  date_utc: string; wavelength_um: number; bandwidth_um: number; version: string;
  zodi_median: number; flag_counts: Record<string, number>;
  data: string; sigma_median?: number; bad: string;
}

export interface Availability {
  total: number; per_detector: Record<string, number>;
  seasons: { start: string; end: string; n: number }[];
  detector_ranges_um: Record<string, [number, number]>;
}

export interface Series {
  ra: number; dec: number; fov_deg: number; detector: number; n: number; pixel_arcsec: number;
  frames: Frame[]; available: Availability; processing: string[];
  fallback?: boolean; fallback_reason?: string; case?: Record<string, unknown>;
}

export interface DecodedFrame extends Frame { img: Float32Array; badMask: Uint8Array; }

export interface OverlayPoint { id: string; x: number; y: number; label: string; kind: string; extra: Record<string, number | string | null>; }
export interface Overlay { source: string; epoch_note: string; points: OverlayPoint[]; }

export interface Spectrum {
  wavelength_um: number[]; flux_mjy: (number | null)[]; err_mjy: (number | null)[];
  method: string; evidence: string; tile: string; pixel_arcsec: number;
}

export interface DemoCase {
  id: string; title: string; ra: number; dec: number; detector: number; fov: number; file: string;
  frames: number; generated_utc: string; kind: string; expected: string; mjd_min?: number | null; mjd_max?: number | null;
  user?: boolean; failed?: string; size_kb?: number;
}

export interface ProspectRow {
  des: string; name: string; dv_min: number; dur_at_min_dv: number; dur_min: number; dv_at_min_dur: number;
  size_m: number | null; size_source: string; H: number | null; taxonomy: string | null; albedo: number | null; occ: number;
  n_traj: number; next_obs: string | null;
  c: { access: number; size: number | null; volatile: number | null; metal: number | null; evidence: number; windows: number };
}

export interface Porkchop {
  departures_jd: number[]; tof_days: number[]; c3: (number | null)[][]; dv_total: (number | null)[][];
  best: { departure_jd: number; tof_days: number; dv_total: number; c3: number; departure_iso?: string } | null;
  method: string;
}

export interface Annotation { id: string; ra: number; dec: number; note: string; created: string; status: "flagged by user"; field: string; frameDate: string; }

export interface Job { id: string; kind: string; status: "running" | "done" | "error"; log: string[]; error?: string; result?: unknown }
