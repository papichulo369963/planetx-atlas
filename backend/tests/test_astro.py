"""Validation of the astrodynamics module against published reference values."""
import math

import numpy as np
import pytest

from app import astro
from app.config import AU_KM, MU_EARTH


def test_lambert_curtis_example_5_2():
    """Curtis (2014) Example 5.2: geocentric transfer, dt = 1 h."""
    r1 = np.array([5000.0, 10000.0, 2100.0])
    r2 = np.array([-14600.0, 2500.0, 7000.0])
    v1, v2 = astro.lambert(r1, r2, 3600.0, mu=MU_EARTH)
    assert v1 == pytest.approx([-5.9925, 1.9254, 3.2456], abs=2e-3)
    assert v2 == pytest.approx([-3.3125, -4.1966, -0.38529], abs=2e-3)


def test_kepler_equation_residual():
    for e in (0.0, 0.1, 0.5, 0.9, 0.99):
        for M in np.linspace(0, 2 * math.pi, 13):
            E = astro.solve_kepler(M, e)
            assert E - e * math.sin(E) == pytest.approx(M, abs=1e-10)


def test_earth_distance_and_speed_physical_range():
    """Earth's heliocentric distance must stay within perihelion/aphelion (0.983-1.017 au)."""
    for jd in np.linspace(2460000.5, 2460365.5, 12):
        r, v = astro.planet_state("earth", jd)
        d = np.linalg.norm(r) / AU_KM
        assert 0.982 < d < 1.018
        assert 29.2 < np.linalg.norm(v) < 30.4  # km/s


def test_hohmann_like_earth_mars_c3_reasonable():
    """Earth->Mars minimum C3 for 2026 window is ~9-12 km^2/s^2 in the literature."""
    mars = dict(zip(["a", "e", "i", "om", "w", "ma"], astro.planet_elements("mars", 2461000.5)))
    mars["epoch"] = 2461000.5
    res = astro.porkchop(mars, 2461300.5, 2461420.5, 150, 350, n_dep=25, n_tof=20)
    assert res["best"] is not None
    assert 7.0 < res["best"]["c3"] < 16.0


def test_tsiolkovsky():
    assert astro.tsiolkovsky_mass_ratio(0.0, 300) == 1.0
    assert astro.tsiolkovsky_mass_ratio(3.0, 450) == pytest.approx(math.exp(3000 / (450 * 9.80665)))
