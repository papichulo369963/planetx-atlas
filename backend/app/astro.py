"""Two-body astrodynamics: Kepler propagation, Lambert problem, mission budgets.

References
- Curtis, H. D. (2014) "Orbital Mechanics for Engineering Students", 3rd ed.,
  Algorithm 3.4 (universal Kepler), Algorithm 5.2 (Lambert, universal variables).
- Standish, E. M. "Keplerian Elements for Approximate Positions of the Major
  Planets", JPL Solar System Dynamics (Table 1, valid 1800-2050 AD).
- Tsiolkovsky rocket equation: dv = Isp * g0 * ln(m0 / mf).
Units: km, s, km/s, degrees for angles in element tables, JD (TDB ~ TT) for time.
"""
from __future__ import annotations

import math

import numpy as np

from .config import AU_KM, DAY_S, G0, MU_EARTH, MU_SUN, R_EARTH

J2000 = 2451545.0
# a[au], e, I[deg], L[deg], varpi[deg], Omega[deg] and their rates per Julian century.
PLANETS = {
    "mercury": ([0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
                [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]),
    "venus": ([0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
              [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]),
    "earth": ([1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
              [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]),
    "mars": ([1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
             [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]),
    "jupiter": ([5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
                [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]),
    "saturn": ([9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
               [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]),
    "uranus": ([19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
               [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]),
    "neptune": ([30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
                [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]),
}


def solve_kepler(M: float, e: float, tol: float = 1e-12) -> float:
    """Eccentric anomaly E [rad] from mean anomaly M [rad] (Newton-Raphson)."""
    E = M if e < 0.8 else math.pi
    for _ in range(50):
        d = (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
        E -= d
        if abs(d) < tol:
            break
    return E


def elements_to_state(a_au: float, e: float, i: float, om: float, w: float, M: float,
                      mu: float = MU_SUN) -> tuple[np.ndarray, np.ndarray]:
    """Heliocentric ecliptic J2000 state [km, km/s] from elements (angles in deg)."""
    a = a_au * AU_KM
    E = solve_kepler(math.radians(M) % (2 * math.pi), e)
    cE, sE = math.cos(E), math.sin(E)
    r = a * (1 - e * cE)
    x_p, y_p = a * (cE - e), a * math.sqrt(1 - e * e) * sE
    k = math.sqrt(mu * a) / r
    vx_p, vy_p = -k * sE, k * math.sqrt(1 - e * e) * cE
    i, om, w = map(math.radians, (i, om, w))
    co, so, ci, si, cw, sw = math.cos(om), math.sin(om), math.cos(i), math.sin(i), math.cos(w), math.sin(w)
    R = np.array([[co * cw - so * sw * ci, -co * sw - so * cw * ci],
                  [so * cw + co * sw * ci, -so * sw + co * cw * ci],
                  [sw * si, cw * si]])
    return R @ np.array([x_p, y_p]), R @ np.array([vx_p, vy_p])


def planet_elements(name: str, jd: float) -> tuple[float, float, float, float, float, float]:
    """Standish Table 1 mean elements -> (a, e, i, Omega, omega, M) at JD."""
    base, rate = PLANETS[name]
    T = (jd - J2000) / 36525.0
    a, e, I, L, varpi, Om = (b + r * T for b, r in zip(base, rate))
    return a, e, I, Om, varpi - Om, (L - varpi) % 360.0


def planet_state(name: str, jd: float) -> tuple[np.ndarray, np.ndarray]:
    return elements_to_state(*planet_elements(name, jd))


def propagate_elements(el: dict, jd: float) -> tuple[np.ndarray, np.ndarray]:
    """State of a small body from SBDB-style elements (a, e, i, om, w, ma, epoch)."""
    n = 0.9856076686 * el["a"] ** -1.5  # deg/day, Gaussian constant
    M = el["ma"] + n * (jd - el["epoch"])
    return elements_to_state(el["a"], el["e"], el["i"], el["om"], el["w"], M)


def _stumpff(z: float) -> tuple[float, float]:
    if z > 1e-8:
        s = math.sqrt(z)
        return (1 - math.cos(s)) / z, (s - math.sin(s)) / s ** 3
    if z < -1e-8:
        s = math.sqrt(-z)
        return (math.cosh(s) - 1) / (-z), (math.sinh(s) - s) / s ** 3
    return 0.5, 1 / 6


def lambert(r1: np.ndarray, r2: np.ndarray, dt: float, mu: float = MU_SUN,
            prograde: bool = True) -> tuple[np.ndarray, np.ndarray]:
    """Single-revolution Lambert solver (Curtis Algorithm 5.2). Returns v1, v2 [km/s]."""
    R1, R2 = np.linalg.norm(r1), np.linalg.norm(r2)
    cross = np.cross(r1, r2)
    dth = math.acos(max(-1.0, min(1.0, float(np.dot(r1, r2) / (R1 * R2)))))
    if (prograde and cross[2] < 0) or (not prograde and cross[2] >= 0):
        dth = 2 * math.pi - dth
    A = math.sin(dth) * math.sqrt(R1 * R2 / (1 - math.cos(dth)))

    def y(z: float) -> float:
        C, S = _stumpff(z)
        return R1 + R2 + A * (z * S - 1) / math.sqrt(C)

    def F(z: float) -> float:
        C, S = _stumpff(z)
        return (y(z) / C) ** 1.5 * S + A * math.sqrt(y(z)) - math.sqrt(mu) * dt

    z_max = 4 * math.pi ** 2 - 1e-6  # single revolution: TOF -> infinity as z -> 4 pi^2
    lo = -100.0
    while y(lo) < 0:  # y(z) must be positive for a real solution
        lo += 0.1
        if lo >= z_max:
            raise ValueError("Lambert: no valid z bracket")
    hi = z_max
    if F(lo) > 0 or F(hi) < 0:
        raise ValueError("Lambert: time of flight outside single-rev range")
    for _ in range(200):  # bisection on the monotonic time-of-flight function
        mid = 0.5 * (lo + hi)
        if y(mid) < 0 or F(mid) < 0:
            lo = mid
        else:
            hi = mid
        if hi - lo < 1e-10:
            break
    z = 0.5 * (lo + hi)
    yz = y(z)
    f, g, gdot = 1 - yz / R1, A * math.sqrt(yz / mu), 1 - yz / R2
    v1 = (r2 - f * r1) / g
    v2 = (gdot * r2 - r1) / g
    return v1, v2


def departure_dv_from_leo(vinf: float, alt_km: float = 400.0) -> float:
    """Impulsive dv [km/s] from circular LEO to a hyperbola with excess speed vinf."""
    r = R_EARTH + alt_km
    return math.sqrt(vinf ** 2 + 2 * MU_EARTH / r) - math.sqrt(MU_EARTH / r)


def tsiolkovsky_mass_ratio(dv_kms: float, isp_s: float) -> float:
    """m0/mf required for dv with specific impulse Isp (Tsiolkovsky)."""
    return math.exp(dv_kms * 1000.0 / (isp_s * G0))


def porkchop(el: dict, jd0: float, jd1: float, tof_min: float, tof_max: float,
             n_dep: int = 36, n_tof: int = 30) -> dict:
    """Grid of one-way rendezvous budgets Earth -> small body.

    C3 = |v1 - v_earth|^2 [km^2/s^2]; dv_total = dv(LEO->vinf_dep) + |v2 - v_body|.
    Earth: Standish EM-barycentre elements. Body: SBDB osculating elements, two-body.
    """
    deps = np.linspace(jd0, jd1, n_dep)
    tofs = np.linspace(tof_min, tof_max, n_tof)
    c3 = np.full((n_tof, n_dep), np.nan)
    dv = np.full((n_tof, n_dep), np.nan)
    for j, jd in enumerate(deps):
        rE, vE = planet_state("earth", jd)
        for k, tof in enumerate(tofs):
            rT, vT = propagate_elements(el, jd + tof)
            try:
                v1, v2 = lambert(rE, rT, tof * DAY_S)
            except (ValueError, ZeroDivisionError):
                continue
            vinf_d = float(np.linalg.norm(v1 - vE))
            vinf_a = float(np.linalg.norm(v2 - vT))
            if vinf_d > 25 or vinf_a > 25:
                continue
            c3[k, j] = vinf_d ** 2
            dv[k, j] = departure_dv_from_leo(vinf_d) + vinf_a
    best = np.unravel_index(np.nanargmin(dv), dv.shape) if np.isfinite(dv).any() else None
    return {
        "departures_jd": deps.round(3).tolist(),
        "tof_days": tofs.round(2).tolist(),
        "c3": np.where(np.isfinite(c3), c3.round(3), None).tolist(),
        "dv_total": np.where(np.isfinite(dv), dv.round(3), None).tolist(),
        "best": None if best is None else {
            "departure_jd": float(deps[best[1]]), "tof_days": float(tofs[best[0]]),
            "dv_total": float(dv[best]), "c3": float(c3[best])},
    }
