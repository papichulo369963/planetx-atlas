// Planet positions from Standish "Keplerian Elements for Approximate Positions of the
// Major Planets" (JPL SSD, Table 1, 1800-2050). Heliocentric ecliptic J2000, au.
const D2R = Math.PI / 180;
export const J2000 = 2451545.0;

type Row = [number[], number[]];
export const PLANETS: Record<string, Row & { color?: string }> = {
  Mercury: [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  Venus: [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
  Earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
  Mars: [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  Jupiter: [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  Saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  Uranus: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  Neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
};

export const PLANET_INFO: Record<string, { color: string; radiusKm: number; moons: { name: string; aKm: number; periodD: number }[] }> = {
  Mercury: { color: "#a8a29e", radiusKm: 2440, moons: [] },
  Venus: { color: "#fcd34d", radiusKm: 6052, moons: [] },
  Earth: { color: "#60a5fa", radiusKm: 6371, moons: [{ name: "Moon", aKm: 384400, periodD: 27.322 }] },
  Mars: { color: "#f87171", radiusKm: 3390, moons: [{ name: "Phobos", aKm: 9376, periodD: 0.319 }, { name: "Deimos", aKm: 23463, periodD: 1.262 }] },
  Jupiter: { color: "#fdba74", radiusKm: 69911, moons: [{ name: "Io", aKm: 421700, periodD: 1.769 }, { name: "Europa", aKm: 671034, periodD: 3.551 }, { name: "Ganymede", aKm: 1070412, periodD: 7.155 }, { name: "Callisto", aKm: 1882709, periodD: 16.689 }] },
  Saturn: { color: "#fde68a", radiusKm: 58232, moons: [{ name: "Enceladus", aKm: 238042, periodD: 1.370 }, { name: "Titan", aKm: 1221870, periodD: 15.945 }] },
  Uranus: { color: "#a5f3fc", radiusKm: 25362, moons: [{ name: "Titania", aKm: 435910, periodD: 8.706 }] },
  Neptune: { color: "#93c5fd", radiusKm: 24622, moons: [{ name: "Triton", aKm: 354759, periodD: -5.877 }] },
};

export function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 30; k++) { const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-10) break; }
  return E;
}

/** Elements (a au, e, i, Omega, omega, M deg) -> ecliptic xyz [au]. */
export function elementsToXYZ(a: number, e: number, i: number, om: number, w: number, M: number): [number, number, number] {
  const E = solveKepler(((M % 360) + 360) % 360 * D2R, e);
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const [I, O, W] = [i * D2R, om * D2R, w * D2R];
  const cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I), cW = Math.cos(W), sW = Math.sin(W);
  return [
    (cO * cW - sO * sW * cI) * xp + (-cO * sW - sO * cW * cI) * yp,
    (sO * cW + cO * sW * cI) * xp + (-sO * sW + cO * cW * cI) * yp,
    sW * sI * xp + cW * sI * yp,
  ];
}

export function planetElements(name: string, jd: number): [number, number, number, number, number, number] {
  const [b, r] = PLANETS[name];
  const T = (jd - J2000) / 36525;
  const [a, e, I, L, varpi, Om] = b.map((v, k) => v + r[k] * T);
  return [a, e, I, Om, varpi - Om, L - varpi];
}

export function planetXYZ(name: string, jd: number): [number, number, number] {
  return elementsToXYZ(...planetElements(name, jd));
}

export function orbitPath(a: number, e: number, i: number, om: number, w: number, steps = 256): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let k = 0; k <= steps; k++) pts.push(elementsToXYZ(a, e, i, om, w, (360 * k) / steps));
  return pts;
}

export function dateToJD(d: Date): number { return d.getTime() / 86400000 + 2440587.5; }
export function jdToDate(jd: number): Date { return new Date((jd - 2440587.5) * 86400000); }
