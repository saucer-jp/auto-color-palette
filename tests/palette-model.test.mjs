import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULTS,
  LIGHTNESS_CURVE_MODES,
  createDefaultSettings,
  evaluateChroma,
  evaluateCurve,
  evaluateLightness,
  evaluateSCurve,
  generatePalette,
  getSwatchColor,
  normalizeSettings,
} from "../palette-model.mjs";

test("three-point curves pass through their control points", () => {
  const curve = { start: 0.1, middle: 0.35, end: 0.8 };

  assert.equal(evaluateCurve(curve, 0), curve.start);
  assert.equal(evaluateCurve(curve, 0.5), curve.middle);
  assert.equal(evaluateCurve(curve, 1), curve.end);
});

test("lightness interpolation remains monotonic", () => {
  const curve = { start: 0.12, middle: 0.74, end: 0.96 };
  let previous = evaluateLightness(curve, 0);

  for (let index = 1; index <= 100; index += 1) {
    const value = evaluateLightness(curve, index / 100);
    assert.ok(value >= previous, `${value} should be >= ${previous}`);
    previous = value;
  }
});

test("S-curve lightness keeps its range and remains monotonic", () => {
  const curve = { start: 0.2, middle: 0.5, end: 0.8, amount: 1 };
  const straightValue = evaluateSCurve({ ...curve, amount: 0 }, 0.25);
  const sCurveValue = evaluateSCurve(curve, 0.25);

  assert.equal(evaluateSCurve(curve, 0), 0.2);
  assert.equal(evaluateSCurve(curve, 0.5), 0.5);
  assert.equal(evaluateSCurve(curve, 1), 0.8);
  assert.ok(sCurveValue < straightValue);

  let previous = evaluateLightness(
    { start: 0.2, middle: 0.5, end: 0.8 },
    0,
    LIGHTNESS_CURVE_MODES.S,
    curve,
  );

  for (let index = 1; index <= 100; index += 1) {
    const value = evaluateLightness(
      { start: 0.2, middle: 0.5, end: 0.8 },
      index / 100,
      LIGHTNESS_CURVE_MODES.S,
      curve,
    );
    assert.ok(value >= previous, `${value} should be >= ${previous}`);
    previous = value;
  }
});

test("S-curve lightness uses its middle control point", () => {
  const curve = { start: 0.2, middle: 0.35, end: 0.8, amount: 0.7 };

  assert.equal(evaluateSCurve(curve, 0), 0.2);
  assert.equal(evaluateSCurve(curve, 0.5), 0.35);
  assert.equal(evaluateSCurve(curve, 1), 0.8);

  let previous = evaluateSCurve(curve, 0);
  for (let index = 1; index <= 100; index += 1) {
    const value = evaluateSCurve(curve, index / 100);
    assert.ok(value >= previous, `${value} should be >= ${previous}`);
    previous = value;
  }
});

test("chroma interpolation supports a peak and stays within its range", () => {
  const curve = { start: 0.05, middle: 0.3, end: 0.08 };
  let maximum = 0;

  for (let index = 0; index <= 100; index += 1) {
    const value = evaluateChroma(curve, index / 100);
    maximum = Math.max(maximum, value);
    assert.ok(value >= 0 && value <= 0.4);
  }

  assert.equal(evaluateChroma(curve, 0.5), 0.3);
  assert.ok(maximum >= 0.3);
});

test("palette generation uses absolute hues and grayscale chroma zero", () => {
  const settings = {
    ...createDefaultSettings(),
    baseHue: 350,
    hueCount: 4,
    stepCount: 5,
  };
  const palette = generatePalette(settings);

  assert.equal(palette.columns.length, 5);
  assert.equal(palette.totalColors, 25);
  assert.equal(palette.columns[1].hue, 350);
  assert.equal(palette.columns[2].hue, 80);
  assert.equal(palette.columns[4].hue, 260);
  assert.ok(palette.columns[0].swatches.every((swatch) => swatch.C === 0));
});

test("gamut warning visibility defaults to enabled and accepts explicit booleans", () => {
  assert.equal(createDefaultSettings().showGamutWarnings, true);
  assert.equal(
    normalizeSettings({ version: 3, baseHue: 180 }).showGamutWarnings,
    true,
  );
  assert.equal(
    normalizeSettings({ version: 3, baseHue: 180, showGamutWarnings: false })
      .showGamutWarnings,
    false,
  );
});

test("hue columns keep precise equal spacing internally", () => {
  const settings = {
    ...createDefaultSettings(),
    baseHue: 12.3,
    hueCount: 7,
    stepCount: 5,
  };
  const palette = generatePalette(settings);
  const hues = palette.columns.slice(1).map((column) => column.hue);

  hues.forEach((hue, index) => {
    assert.ok(Math.abs(hue - ((12.3 + (index * 360) / 7) % 360)) < 0.000001);
  });
});

test("sRGB gamut detection is separate from clipped HEX output", () => {
  const color = getSwatchColor(0.9, 0.4, 50);

  assert.equal(color.hex.length, 7);
  assert.match(color.hex, /^#[0-9A-F]{6}$/);
  assert.equal(color.isOutOfSrgbGamut, true);
});

test("legacy settings migrate only the old hue and preserve unrelated settings", () => {
  const settings = normalizeSettings(
    {
      version: 2,
      baseColor: "#3B82F6",
      darkestLightness: 0.1,
      lightestLightness: 0.9,
      paletteBackground: "#101010",
      hueCount: 6,
      stepCount: 8,
      gap: 3,
    },
    "#F9FAF7",
  );

  assert.equal(settings.version, 5);
  assert.equal(settings.baseHue, 259.8);
  assert.equal(settings.paletteBackground, "#101010");
  assert.equal(settings.hueCount, 6);
  assert.equal(settings.stepCount, 8);
  assert.equal(settings.gap, 3);
  assert.deepEqual(settings.chromaCurve, DEFAULTS.chromaCurve);
  assert.deepEqual(settings.lightnessCurve, DEFAULTS.lightnessCurve);
  assert.equal(settings.lightnessCurveMode, DEFAULTS.lightnessCurveMode);
  assert.deepEqual(settings.lightnessSCurve, DEFAULTS.lightnessSCurve);
  assert.equal(Object.hasOwn(settings, "baseColor"), false);
  assert.equal(Object.hasOwn(settings, "darkestLightness"), false);
  assert.equal(Object.hasOwn(settings, "lightestLightness"), false);
});

test("S-curve settings are normalized independently from the custom curve", () => {
  const settings = normalizeSettings({
    version: 3,
    baseHue: 180,
    lightnessCurve: { start: 0.9, middle: 0.4, end: 0.6 },
    lightnessCurveMode: LIGHTNESS_CURVE_MODES.S,
    lightnessSCurve: { start: 0.85, middle: 0.65, end: 0.15, amount: 2 },
  });

  assert.equal(settings.lightnessCurveMode, LIGHTNESS_CURVE_MODES.S);
  assert.deepEqual(settings.lightnessCurve, {
    start: 0.4,
    middle: 0.6,
    end: 0.9,
  });
  assert.deepEqual(settings.lightnessSCurve, {
    start: 0.15,
    middle: 0.65,
    end: 0.85,
    amount: 1,
  });
});

test("S-curve settings without a middle point retain the midpoint of their bounds", () => {
  const settings = normalizeSettings({
    version: 5,
    baseHue: 180,
    lightnessCurveMode: LIGHTNESS_CURVE_MODES.S,
    lightnessSCurve: { start: 0.2, end: 0.8, amount: 0.7 },
  });

  assert.deepEqual(settings.lightnessSCurve, {
    start: 0.2,
    middle: 0.5,
    end: 0.8,
    amount: 0.7,
  });
});

test("invalid lightness control points are normalized into dark-to-light order", () => {
  const settings = normalizeSettings({
    version: 3,
    baseHue: 360,
    chromaMin: 0.3,
    chromaMax: 0.1,
    chromaCurve: { start: 0.5, middle: 0.2, end: 0.4 },
    lightnessCurve: { start: 0.9, middle: 0.1, end: 0.5 },
  });

  assert.equal(settings.baseHue, 0);
  assert.deepEqual(settings.lightnessCurve, {
    start: 0.1,
    middle: 0.5,
    end: 0.9,
  });
  assert.deepEqual(settings.chromaCurve, {
    start: 0.4,
    middle: 0.2,
    end: 0.4,
  });
  assert.equal(Object.hasOwn(settings, "chromaMin"), false);
  assert.equal(Object.hasOwn(settings, "chromaMax"), false);
});

test("chroma curve always uses the fixed 0 to 0.4 range", () => {
  const settings = normalizeSettings({
    version: 4,
    baseHue: 180,
    chromaMin: 0.2,
    chromaMax: 0.25,
    chromaCurve: { start: 0, middle: 0.4, end: 0.1 },
  });

  assert.deepEqual(settings.chromaCurve, {
    start: 0,
    middle: 0.4,
    end: 0.1,
  });
  assert.deepEqual(createDefaultSettings().chromaCurve, DEFAULTS.chromaCurve);
  assert.equal(Object.hasOwn(createDefaultSettings(), "chromaMin"), false);
  assert.equal(Object.hasOwn(createDefaultSettings(), "chromaMax"), false);
});
