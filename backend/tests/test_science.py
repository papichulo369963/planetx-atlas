"""Unit tests: coordinate parsing, proper-motion propagation, grids, validation logic, prospect index."""
import math

import numpy as np
import pytest

from app import coords, prospect, spherex, validate


def test_parse_challenge_coordinates_wise0855():
    """Challenge text: RA 08h55m10.831s, Dec -07d14m42.53s."""
    c = coords.parse_coords("08h55m10.831s", "-07d14m42.53s")
    assert c.ra.deg == pytest.approx(133.795129, abs=1e-5)
    assert c.dec.deg == pytest.approx(-7.245147, abs=1e-5)


def test_parse_decimal_and_errors():
    c = coords.parse_coords("269.452", "4.693")
    assert (c.ra.deg, c.dec.deg) == pytest.approx((269.452, 4.693))
    for bad in [("400", "0"), ("10", "95"), ("abc", "1")]:
        with pytest.raises(coords.CoordError):
            coords.parse_coords(*bad)


def test_barnard_proper_motion_propagation():
    """Barnard's star moves ~10.39"/yr; from J2000 to 2026.0 it should shift ~270"."""
    ra, dec = coords.propagate(269.4520769586187, 4.693364966576667, -801.551, 10362.394, 546.9759,
                               -110.11, "J2000", 2026.0)
    shift = math.hypot((ra - 269.4520769586187) * math.cos(math.radians(dec)), dec - 4.693364966576667) * 3600
    assert 255 < shift < 285
    assert dec > 4.693  # northward


def test_common_grid_centre_and_binning():
    w, n = spherex.common_grid(10.0, 20.0, 0.1)
    x, y = w.world_to_pixel_values(10.0, 20.0)
    assert (x, y) == pytest.approx(((n - 1) / 2, (n - 1) / 2), abs=1e-6)
    assert spherex.bin_factor(0.1) == 1 and spherex.bin_factor(0.6) == 2
    _, n6 = spherex.common_grid(10.0, 20.0, 0.6)
    assert n6 <= spherex.MAX_GRID


def test_select_frames_one_per_day_and_window():
    imgs = [{"mjd": 61000 + d + h / 24, "detector": 2} for d in range(5) for h in (1, 5, 9)]
    picks = spherex.select_frames(imgs, 2, 10)
    assert len(picks) == 5 and len({int(p["mjd"]) for p in picks}) == 5
    win = spherex.select_frames(imgs, 2, 10, 61001.0, 61002.0)
    assert all(61001 <= p["mjd"] <= 61002 for p in win) and len(win) == 3


def test_gauss_centroid_recovers_subpixel_position():
    yy, xx = np.mgrid[0:31, 0:31]
    img = 100 * np.exp(-((xx - 15.3) ** 2 + (yy - 14.6) ** 2) / (2 * 1.1 ** 2)) + 5
    c = validate.gauss_centroid(img.astype(np.float32), 15, 15, 3)
    assert c == pytest.approx((15.3, 14.6), abs=0.02)


def test_verdict_rules():
    good = {"pmra_masyr": 3700, "pmra_err": 270, "pmdec_masyr": -2530, "pmdec_err": 200}
    assert validate.verdict(good, 3982, -2467)["status"] == "validated"
    noisy = {"pmra_masyr": -14000, "pmra_err": 2100, "pmdec_masyr": 2500, "pmdec_err": 2100}
    assert validate.verdict(noisy, -8124, 673)["status"] == "inconclusive"
    wrong = {"pmra_masyr": 0, "pmra_err": 50, "pmdec_masyr": 0, "pmdec_err": 50}
    assert validate.verdict(wrong, 3982, -2467)["status"] == "does not match"


def test_prospect_components_in_range_and_unknowns():
    rec = {"des": "X", "fullname": "X", "min_dv": {"dv": "5.0", "dur": 300}, "min_dur": {"dv": "9", "dur": 150},
           "min_size": "100", "max_size": "300", "h": "21", "occ": "2", "n_via_traj": 5000, "obs_start": None}
    c = prospect.components(rec, None)
    for k, v in c["c"].items():
        assert v is None or 0 <= v <= 1, k
    assert c["c"]["volatile"] is None and c["c"]["metal"] is None  # no taxonomy -> unknown, not zero
    c2 = prospect.components({**rec, "min_size": None, "max_size": None, "h": None}, {"spec_B": "Ch"})
    assert c2["size_m"] is None and c2["c"]["size"] is None and c2["c"]["volatile"] == 0.9
