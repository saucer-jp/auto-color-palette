export const LIGHTNESS_CURVE_MODES = Object.freeze({
  CUSTOM: "custom",
  S: "s",
});

export const DEFAULTS = Object.freeze({
  baseHue: 259.8,
  chromaMin: 0,
  chromaMax: 0.4,
  chromaCurve: Object.freeze({
    start: 0.188,
    middle: 0.188,
    end: 0.188,
  }),
  lightnessCurve: Object.freeze({
    start: 0.263,
    middle: 0.623,
    end: 0.983,
  }),
  lightnessCurveMode: LIGHTNESS_CURVE_MODES.CUSTOM,
  lightnessSCurve: Object.freeze({
    start: 0.263,
    end: 0.983,
    amount: 0.7,
  }),
  hueCount: 12,
  stepCount: 12,
  gap: 8,
  showGamutWarnings: true,
});

export const LIMITS = Object.freeze({
  baseHue: { min: 0, max: 359.9 },
  chroma: { min: 0, max: 0.4 },
  lightness: { min: 0, max: 1 },
  lightnessSCurveAmount: { min: -1, max: 1 },
  hueCount: { min: 2, max: 24 },
  stepCount: { min: 5, max: 30 },
  gap: { min: 0, max: 40 },
});

const CURVE_POINTS = Object.freeze(["start", "middle", "end"]);
const CURVE_X = Object.freeze([0, 0.5, 1]);
const CURVE_PRECISION = 1000;
const HUE_PRECISION = 10;
const SRGB_EPSILON = 0.00001;

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundTo(value, precision) {
  return Math.round(value * precision) / precision;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRangeValue(value, limits, fallback) {
  return Math.round(
    clamp(finiteNumber(value, fallback), limits.min, limits.max),
  );
}

function normalizeBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeDecimal(value, limits, fallback) {
  return roundTo(
    clamp(finiteNumber(value, fallback), limits.min, limits.max),
    CURVE_PRECISION,
  );
}

export function normalizeHue(value, fallback = DEFAULTS.baseHue) {
  const number = finiteNumber(value, fallback);
  const normalized = wrapHue(number);
  const rounded = roundTo(normalized, HUE_PRECISION);
  return rounded >= 360 ? 0 : rounded;
}

function wrapHue(value) {
  return ((value % 360) + 360) % 360;
}

export function normalizeHex(value, fallback = "#F9FAF7") {
  const normalized = String(value || "").trim().toUpperCase();

  if (/^#[0-9A-F]{6}$/.test(normalized)) {
    return normalized;
  }

  if (/^#[0-9A-F]{3}$/.test(normalized)) {
    return (
      "#" +
      normalized
        .slice(1)
        .split("")
        .map((character) => character + character)
        .join("")
    );
  }

  return fallback;
}

function normalizeCurve(curve, fallback, limits) {
  const source = curve && typeof curve === "object" ? curve : {};

  return {
    start: normalizeDecimal(source.start, limits, fallback.start),
    middle: normalizeDecimal(source.middle, limits, fallback.middle),
    end: normalizeDecimal(source.end, limits, fallback.end),
  };
}

function normalizeLightnessCurve(curve, fallback) {
  const normalized = normalizeCurve(curve, fallback, LIMITS.lightness);
  const values = [normalized.start, normalized.middle, normalized.end].sort(
    (left, right) => left - right,
  );

  return {
    start: values[0],
    middle: values[1],
    end: values[2],
  };
}

function normalizeLightnessCurveMode(value, fallback) {
  return value === LIGHTNESS_CURVE_MODES.S
    ? LIGHTNESS_CURVE_MODES.S
    : fallback;
}

function normalizeLightnessSCurve(curve, fallback) {
  const source = curve && typeof curve === "object" ? curve : {};
  const values = [
    normalizeDecimal(source.start, LIMITS.lightness, fallback.start),
    normalizeDecimal(source.end, LIMITS.lightness, fallback.end),
  ].sort((left, right) => left - right);

  return {
    start: values[0],
    end: values[1],
    amount: normalizeDecimal(
      source.amount,
      LIMITS.lightnessSCurveAmount,
      fallback.amount,
    ),
  };
}

function normalizeChromaRange(minValue, maxValue) {
  const min = normalizeDecimal(minValue, LIMITS.chroma, DEFAULTS.chromaMin);
  const max = normalizeDecimal(maxValue, LIMITS.chroma, DEFAULTS.chromaMax);

  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
  };
}

function normalizeChromaCurve(curve, fallback, min, max) {
  const normalized = normalizeCurve(curve, fallback, LIMITS.chroma);

  return {
    start: clamp(normalized.start, min, max),
    middle: clamp(normalized.middle, min, max),
    end: clamp(normalized.end, min, max),
  };
}

export function createDefaultSettings(paletteBackground = "#F9FAF7") {
  return {
    version: 4,
    baseHue: DEFAULTS.baseHue,
    chromaMin: DEFAULTS.chromaMin,
    chromaMax: DEFAULTS.chromaMax,
    chromaCurve: { ...DEFAULTS.chromaCurve },
    lightnessCurve: { ...DEFAULTS.lightnessCurve },
    lightnessCurveMode: DEFAULTS.lightnessCurveMode,
    lightnessSCurve: { ...DEFAULTS.lightnessSCurve },
    paletteBackground: normalizeHex(paletteBackground),
    hueCount: DEFAULTS.hueCount,
    stepCount: DEFAULTS.stepCount,
    gap: DEFAULTS.gap,
    showGamutWarnings: DEFAULTS.showGamutWarnings,
  };
}

function normalizeGeneralSettings(source, defaults) {
  return {
    paletteBackground: normalizeHex(
      source.paletteBackground,
      defaults.paletteBackground,
    ),
    hueCount: normalizeRangeValue(
      source.hueCount,
      LIMITS.hueCount,
      defaults.hueCount,
    ),
    stepCount: normalizeRangeValue(
      source.stepCount,
      LIMITS.stepCount,
      defaults.stepCount,
    ),
    gap: normalizeRangeValue(source.gap, LIMITS.gap, defaults.gap),
    showGamutWarnings: normalizeBoolean(
      source.showGamutWarnings,
      defaults.showGamutWarnings,
    ),
  };
}

function legacyBaseHue(source) {
  const legacyColor = normalizeHex(source.baseColor, "#3B82F6");
  return normalizeHue(srgbToOklch(legacyColor).H);
}

export function normalizeSettings(rawSettings, paletteBackground = "#F9FAF7") {
  const defaults = createDefaultSettings(paletteBackground);
  const source =
    rawSettings && typeof rawSettings === "object" ? rawSettings : {};
  const isLegacy =
    Number(source.version) < 3 || !Object.prototype.hasOwnProperty.call(source, "baseHue");
  const range = isLegacy
    ? { min: defaults.chromaMin, max: defaults.chromaMax }
    : normalizeChromaRange(source.chromaMin, source.chromaMax);
  const chromaCurve = isLegacy
    ? { ...defaults.chromaCurve }
    : normalizeChromaCurve(
        source.chromaCurve,
        defaults.chromaCurve,
        range.min,
        range.max,
      );
  const lightnessCurve = isLegacy
    ? { ...defaults.lightnessCurve }
    : normalizeLightnessCurve(source.lightnessCurve, defaults.lightnessCurve);
  const lightnessCurveMode = isLegacy
    ? defaults.lightnessCurveMode
    : normalizeLightnessCurveMode(
        source.lightnessCurveMode,
        defaults.lightnessCurveMode,
      );
  const lightnessSCurve = isLegacy
    ? { ...defaults.lightnessSCurve }
    : normalizeLightnessSCurve(source.lightnessSCurve, defaults.lightnessSCurve);

  return {
    version: 4,
    baseHue: isLegacy
      ? legacyBaseHue(source)
      : normalizeHue(source.baseHue, defaults.baseHue),
    chromaMin: range.min,
    chromaMax: range.max,
    chromaCurve,
    lightnessCurve,
    lightnessCurveMode,
    lightnessSCurve,
    ...normalizeGeneralSettings(source, defaults),
  };
}

function srgbToLinear(channel) {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

function linearToSrgb(channel) {
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function srgbToOklch(hex) {
  const rgb = hexToRgb(hex);
  const red = srgbToLinear(rgb.r);
  const green = srgbToLinear(rgb.g);
  const blue = srgbToLinear(rgb.b);

  const lightness =
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const middle =
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const short =
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;

  const lightnessRoot = Math.cbrt(lightness);
  const middleRoot = Math.cbrt(middle);
  const shortRoot = Math.cbrt(short);

  const L =
    0.2104542553 * lightnessRoot +
    0.793617785 * middleRoot -
    0.0040720468 * shortRoot;
  const a =
    1.9779984951 * lightnessRoot -
    2.428592205 * middleRoot +
    0.4505937099 * shortRoot;
  const b =
    0.0259040371 * lightnessRoot +
    0.7827717662 * middleRoot -
    0.808675766 * shortRoot;

  return {
    L: clamp(L, 0, 1),
    C: Math.hypot(a, b),
    H: normalizeHue((Math.atan2(b, a) * 180) / Math.PI),
  };
}

export function oklchToSrgb(L, C, H) {
  const hue = (H * Math.PI) / 180;
  const a = C * Math.cos(hue);
  const b = C * Math.sin(hue);

  const lightnessRoot = L + 0.3963377774 * a + 0.2158037573 * b;
  const middleRoot = L - 0.1055613458 * a - 0.0638541728 * b;
  const shortRoot = L - 0.0894841775 * a - 1.291485548 * b;

  const lightness = lightnessRoot * lightnessRoot * lightnessRoot;
  const middle = middleRoot * middleRoot * middleRoot;
  const short = shortRoot * shortRoot * shortRoot;

  const red =
    4.0767416621 * lightness -
    3.3077115913 * middle +
    0.2309699292 * short;
  const green =
    -1.2684380046 * lightness +
    2.6097574011 * middle -
    0.3413193965 * short;
  const blue =
    -0.0041960863 * lightness -
    0.7034186147 * middle +
    1.707614701 * short;

  return {
    r: linearToSrgb(red),
    g: linearToSrgb(green),
    b: linearToSrgb(blue),
  };
}

function rgbToHex(red, green, blue) {
  return (
    "#" +
    [red, green, blue]
      .map((channel) =>
        Math.round(clamp(channel, 0, 1) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}

export function isSrgbInGamut(rgb) {
  return [rgb.r, rgb.g, rgb.b].every(
    (channel) =>
      channel >= -SRGB_EPSILON && channel <= 1 + SRGB_EPSILON,
  );
}

export function oklchToHex(L, C, H) {
  const rgb = oklchToSrgb(L, C, H);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function sign(value) {
  return value === 0 ? 0 : value > 0 ? 1 : -1;
}

function endpointSlope(delta, adjacentDelta) {
  const slope = (3 * delta - adjacentDelta) / 2;

  if (sign(slope) !== sign(delta)) {
    return 0;
  }

  if (sign(delta) !== sign(adjacentDelta) && Math.abs(slope) > Math.abs(3 * delta)) {
    return 3 * delta;
  }

  return slope;
}

function limitSegmentSlopes(delta, leftSlope, rightSlope) {
  if (delta === 0) {
    return [0, 0];
  }

  let nextLeft = leftSlope;
  let nextRight = rightSlope;

  if (sign(nextLeft) !== sign(delta)) {
    nextLeft = 0;
  }
  if (sign(nextRight) !== sign(delta)) {
    nextRight = 0;
  }

  const alpha = nextLeft / delta;
  const beta = nextRight / delta;
  const magnitude = alpha * alpha + beta * beta;

  if (magnitude > 9) {
    const factor = 3 / Math.sqrt(magnitude);
    nextLeft = factor * alpha * delta;
    nextRight = factor * beta * delta;
  }

  return [nextLeft, nextRight];
}

function getCurveSlopes(values) {
  const firstDelta = (values[1] - values[0]) / 0.5;
  const secondDelta = (values[2] - values[1]) / 0.5;
  let firstSlope = endpointSlope(firstDelta, secondDelta);
  let middleSlope =
    firstDelta === 0 || sign(firstDelta) !== sign(secondDelta)
      ? 0
      : (firstDelta + secondDelta) / 2;
  let lastSlope = endpointSlope(secondDelta, firstDelta);

  [firstSlope, middleSlope] = limitSegmentSlopes(
    firstDelta,
    firstSlope,
    middleSlope,
  );
  [middleSlope, lastSlope] = limitSegmentSlopes(
    secondDelta,
    middleSlope,
    lastSlope,
  );

  return [firstSlope, middleSlope, lastSlope];
}

function interpolateHermite(left, right, leftSlope, rightSlope, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const segmentLength = 0.5;

  return (
    h00 * left +
    h10 * segmentLength * leftSlope +
    h01 * right +
    h11 * segmentLength * rightSlope
  );
}

export function evaluateCurve(curve, progress) {
  const values = CURVE_POINTS.map((point) => Number(curve[point]));
  const t = clamp(finiteNumber(progress, 0), 0, 1);

  if (t === CURVE_X[0]) {
    return values[0];
  }
  if (t === CURVE_X[1]) {
    return values[1];
  }
  if (t === CURVE_X[2]) {
    return values[2];
  }

  const slopes = getCurveSlopes(values);

  if (t < 0.5) {
    return interpolateHermite(
      values[0],
      values[1],
      slopes[0],
      slopes[1],
      t / 0.5,
    );
  }

  return interpolateHermite(
    values[1],
    values[2],
    slopes[1],
    slopes[2],
    (t - 0.5) / 0.5,
  );
}

export function evaluateSCurve(curve = DEFAULTS.lightnessSCurve, progress) {
  const source = curve && typeof curve === "object" ? curve : {};
  const start = clamp(
    finiteNumber(source.start, DEFAULTS.lightnessSCurve.start),
    LIMITS.lightness.min,
    LIMITS.lightness.max,
  );
  const end = clamp(
    finiteNumber(source.end, DEFAULTS.lightnessSCurve.end),
    LIMITS.lightness.min,
    LIMITS.lightness.max,
  );
  const amount = clamp(
    finiteNumber(source.amount, DEFAULTS.lightnessSCurve.amount),
    LIMITS.lightnessSCurveAmount.min,
    LIMITS.lightnessSCurveAmount.max,
  );
  const t = clamp(finiteNumber(progress, 0), 0, 1);
  const smooth = t * t * (3 - 2 * t);
  const curveProgress = t + amount * (smooth - t);
  const lower = Math.min(start, end);
  const upper = Math.max(start, end);

  return clamp(
    lower + (upper - lower) * curveProgress,
    LIMITS.lightness.min,
    LIMITS.lightness.max,
  );
}

export function evaluateLightness(
  curve,
  progress,
  mode = LIGHTNESS_CURVE_MODES.CUSTOM,
  sCurve = DEFAULTS.lightnessSCurve,
) {
  if (mode === LIGHTNESS_CURVE_MODES.S) {
    return evaluateSCurve(sCurve, progress);
  }

  return clamp(evaluateCurve(curve, progress), 0, 1);
}

export function evaluateChroma(curve, min, max, progress) {
  return clamp(evaluateCurve(curve, progress), min, max);
}

export function getSwatchColor(L, C, H) {
  const normalizedHue = wrapHue(finiteNumber(H, 0));
  const rgb = oklchToSrgb(L, C, normalizedHue);

  return {
    L,
    C,
    H: normalizedHue,
    hex: rgbToHex(rgb.r, rgb.g, rgb.b),
    isOutOfSrgbGamut: !isSrgbInGamut(rgb),
  };
}

export function generatePalette(settings) {
  const columns = [];

  for (let stepIndex = 0; stepIndex < settings.stepCount; stepIndex += 1) {
    const progress = stepIndex / Math.max(settings.stepCount - 1, 1);
    const L = evaluateLightness(
      settings.lightnessCurve,
      progress,
      settings.lightnessCurveMode,
      settings.lightnessSCurve,
    );
    const C = evaluateChroma(
      settings.chromaCurve,
      settings.chromaMin,
      settings.chromaMax,
      progress,
    );

    if (!columns[0]) {
      columns.push({
        type: "grayscale",
        label: "GRAYSCALE",
        hue: null,
        swatches: [],
      });
    }

    columns[0].swatches.push({
      ...getSwatchColor(L, 0, 0),
      stepIndex,
      stepNumber: stepIndex + 1,
      progress,
      hueOffset: 0,
      columnType: "grayscale",
    });
  }

  for (let hueIndex = 0; hueIndex < settings.hueCount; hueIndex += 1) {
    const hueOffset = (hueIndex * 360) / settings.hueCount;
    const hue = wrapHue(settings.baseHue + hueOffset);
    const swatches = [];

    for (let stepIndex = 0; stepIndex < settings.stepCount; stepIndex += 1) {
      const progress = stepIndex / Math.max(settings.stepCount - 1, 1);
      const L = evaluateLightness(
        settings.lightnessCurve,
        progress,
        settings.lightnessCurveMode,
        settings.lightnessSCurve,
      );
      const C = evaluateChroma(
        settings.chromaCurve,
        settings.chromaMin,
        settings.chromaMax,
        progress,
      );

      swatches.push({
        ...getSwatchColor(L, C, hue),
        stepIndex,
        stepNumber: stepIndex + 1,
        progress,
        hueOffset,
        columnType: "hue",
      });
    }

    columns.push({
      type: "hue",
      label: "HUE " + hue,
      hue,
      hueOffset,
      swatches,
    });
  }

  return {
    columns,
    totalColors: (settings.hueCount + 1) * settings.stepCount,
  };
}
