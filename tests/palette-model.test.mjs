import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULTS,
  LIGHTNESS_CURVE_MODES,
  createChromaEvaluator,
  createDefaultSettings,
  createLightnessEvaluator,
  evaluateChroma,
  evaluateCurve,
  evaluateLightness,
  evaluateSCurve,
  generatePalette,
  getPerceptualTone,
  getSwatchColor,
  groupPaletteByHue,
  getSrgbGrayscaleTone,
  isSrgbInGamut,
  normalizeSettings,
  oklchToSrgb,
  serializePaletteExport,
} from "../palette-model.mjs";
import {
  SETTINGS_URL_VERSION,
  getSettingsUrl,
  hasSettingsInUrl,
  parseSettingsFromUrl,
} from "../settings-url.mjs";

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

test("prepared curve evaluators match scalar curve evaluation", () => {
  const chromaCurve = { start: 0.04, middle: 0.28, end: 0.09 };
  const lightnessCurve = { start: 0.21, middle: 0.58, end: 0.91 };
  const evaluateChromaPrepared = createChromaEvaluator(chromaCurve);
  const evaluateLightnessPrepared = createLightnessEvaluator(lightnessCurve);

  for (let index = 0; index <= 20; index += 1) {
    const progress = index / 20;
    assert.equal(
      evaluateChromaPrepared(progress),
      evaluateChroma(chromaCurve, progress),
    );
    assert.equal(
      evaluateLightnessPrepared(progress),
      evaluateLightness(lightnessCurve, progress),
    );
  }
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

test("palette generation keeps each row's colored perceptual tone uniform", () => {
  const settings = {
    ...createDefaultSettings(),
    baseHue: 170,
    hueCount: 10,
    stepCount: 16,
  };
  const palette = generatePalette(settings);
  const evaluateLightnessForRow = createLightnessEvaluator(
    settings.lightnessCurve,
    settings.lightnessCurveMode,
    settings.lightnessSCurve,
  );
  const evaluateChromaForRow = createChromaEvaluator(settings.chromaCurve);
  const stepDenominator = settings.stepCount - 1;
  const baselineRanges = [];
  const matchedRanges = [];

  for (let stepIndex = 0; stepIndex < settings.stepCount; stepIndex += 1) {
    const progress = stepIndex / stepDenominator;
    const lightness = evaluateLightnessForRow(progress);
    const chroma = evaluateChromaForRow(progress);
    const targetTone = getPerceptualTone(
      palette.columns[0].swatches[stepIndex].hex,
    );
    const baselineTones = palette.columns.slice(1).map((column) =>
      getPerceptualTone(
        getSwatchColor(
          lightness,
          chroma,
          settings.baseHue + column.hueOffset,
        ).hex,
      ),
    );
    const matchedTones = palette.columns.slice(1).map((column) =>
      getPerceptualTone(column.swatches[stepIndex].hex),
    );

    baselineRanges.push(
      Math.max(...baselineTones) - Math.min(...baselineTones),
    );
    matchedRanges.push(
      Math.max(...matchedTones) - Math.min(...matchedTones),
    );

    matchedTones.forEach((tone) => {
      assert.ok(
        Math.abs(tone - targetTone) <= 0.002,
        `${tone} should be close to the row target ${targetTone}`,
      );
    });
  }

  const baselineMaximum = Math.max(...baselineRanges);
  const matchedMaximum = Math.max(...matchedRanges);
  const baselineMean =
    baselineRanges.reduce((sum, value) => sum + value, 0) /
    baselineRanges.length;
  const matchedMean =
    matchedRanges.reduce((sum, value) => sum + value, 0) /
    matchedRanges.length;

  assert.ok(baselineMaximum > 0.05);
  assert.ok(matchedMaximum <= 0.004);
  assert.ok(matchedMean < baselineMean / 10);
});

test("grayscale tone remains a diagnostic sRGB channel-weighted metric", () => {
  assert.ok(Math.abs(getSrgbGrayscaleTone("#FF0000") - 0.2126) < 1e-9);
  assert.ok(Math.abs(getSrgbGrayscaleTone("#00FF00") - 0.7152) < 1e-9);
  assert.ok(Math.abs(getSrgbGrayscaleTone("#0000FF") - 0.0722) < 1e-9);
});

test("colored tone uses perceptual OKLab lightness", () => {
  assert.ok(Math.abs(getPerceptualTone("#FF0000") - 0.6279553606) < 1e-9);
  assert.ok(Math.abs(getPerceptualTone("#00FF00") - 0.8664396115) < 1e-9);
  assert.ok(Math.abs(getPerceptualTone("#0000FF") - 0.4520137184) < 1e-9);
});

test("tone-matched hue colors stay in sRGB for consistent rendering", () => {
  const settings = {
    ...createDefaultSettings(),
    baseHue: 170,
    hueCount: 10,
    stepCount: 16,
  };
  const palette = generatePalette(settings);
  const hueSwatches = palette.columns
    .slice(1)
    .flatMap((column) => column.swatches);

  hueSwatches.forEach((swatch) => {
    const rgb = oklchToSrgb(
      Number(swatch.L.toFixed(6)),
      Number(swatch.C.toFixed(6)),
      Number(swatch.H.toFixed(6)),
    );

    assert.ok(isSrgbInGamut(rgb));
    assert.ok(
      Object.values(rgb).every((channel) => channel >= 0 && channel <= 1),
    );
  });
});

test("reference high-chroma settings keep each rendered row aligned", () => {
  const settings = normalizeSettings({
    version: 5,
    baseHue: 170,
    chromaCurve: { start: 0.124, middle: 0.31, end: 0.082 },
    lightnessCurve: { start: 0.196, middle: 0.474, end: 0.983 },
    lightnessCurveMode: LIGHTNESS_CURVE_MODES.CUSTOM,
    lightnessSCurve: {
      start: 0.263,
      middle: 0.623,
      end: 0.983,
      amount: 0.7,
    },
    paletteBackground: "#000000",
    hueCount: 10,
    stepCount: 16,
    gap: 6,
    showGamutWarnings: false,
  });
  const palette = generatePalette(settings);
  const hueColumns = palette.columns.slice(1);
  const rowRanges = palette.columns[0].swatches.map((grayscaleSwatch, index) => {
    const targetTone = getPerceptualTone(grayscaleSwatch.hex);
    const tones = hueColumns.map((column) =>
      getPerceptualTone(column.swatches[index].hex),
    );

    tones.forEach((tone) => {
      assert.ok(
        Math.abs(tone - targetTone) <= 0.002,
        `${tone} should be close to the row target ${targetTone}`,
      );
    });

    return Math.max(...tones) - Math.min(...tones);
  });

  assert.ok(Math.max(...rowRanges) <= 0.004);
});

test("user reference settings keep rendered sRGB rows aligned", () => {
  const settings = parseSettingsFromUrl(
    "?settings=1&baseHue=182.6&chromaStart=0.124&chromaMiddle=0.257&chromaEnd=0.082" +
      "&lightnessStart=0.196&lightnessMiddle=0.485&lightnessEnd=0.983" +
      "&lightnessCurveMode=custom&lightnessSStart=0.263&lightnessSMiddle=0.623" +
      "&lightnessSEnd=0.983&lightnessSAmount=0.7&paletteBackground=%23000000" +
      "&hueCount=24&stepCount=30&gap=0&showGamutWarnings=0",
  );
  const palette = generatePalette(settings);
  const hueColumns = palette.columns.slice(1);
  const rowRanges = palette.columns[0].swatches.map((grayscaleSwatch, index) => {
    const targetTone = getPerceptualTone(grayscaleSwatch.hex);
    const tones = hueColumns.map((column) =>
      getPerceptualTone(column.swatches[index].hex),
    );

    tones.forEach((tone) => {
      assert.ok(
        Math.abs(tone - targetTone) <= 0.002,
        `${tone} should be close to the row target ${targetTone}`,
      );
    });

    return Math.max(...tones) - Math.min(...tones);
  });

  assert.ok(Math.max(...rowRanges) <= 0.004);
});

test("user reference settings align colored tone and reduce grayscale steps as a consequence", () => {
  const settings = parseSettingsFromUrl(
    "?settings=1&baseHue=182.6&chromaStart=0.124&chromaMiddle=0.257&chromaEnd=0.082" +
      "&lightnessStart=0.196&lightnessMiddle=0.485&lightnessEnd=0.983" +
      "&lightnessCurveMode=custom&lightnessSStart=0.263&lightnessSMiddle=0.623" +
      "&lightnessSEnd=0.983&lightnessSAmount=0.7&paletteBackground=%23000000" +
      "&hueCount=24&stepCount=30&gap=0&showGamutWarnings=0",
  );
  const palette = generatePalette(settings);
  const hueColumns = palette.columns.slice(1);
  const evaluateLightnessForRow = createLightnessEvaluator(
    settings.lightnessCurve,
    settings.lightnessCurveMode,
    settings.lightnessSCurve,
  );
  const evaluateChromaForRow = createChromaEvaluator(settings.chromaCurve);
  const stepDenominator = settings.stepCount - 1;
  const baselineGrayscaleRanges = [];
  const matchedGrayscaleRanges = [];
  const matchedPerceptualRanges = [];

  palette.columns[0].swatches.forEach((grayscaleSwatch, rowIndex) => {
    const progress = rowIndex / stepDenominator;
    const lightness = evaluateLightnessForRow(progress);
    const chroma = evaluateChromaForRow(progress);
    const baselineGrayscaleTones = hueColumns.map((column) =>
      getSrgbGrayscaleTone(
        getSwatchColor(
          lightness,
          chroma,
          settings.baseHue + column.hueOffset,
        ).hex,
      ),
    );
    const matchedGrayscaleTones = hueColumns.map((column) =>
      getSrgbGrayscaleTone(column.swatches[rowIndex].hex),
    );
    const targetPerceptualTone = getPerceptualTone(grayscaleSwatch.hex);
    const matchedPerceptualTones = hueColumns.map((column) =>
      getPerceptualTone(column.swatches[rowIndex].hex),
    );

    baselineGrayscaleRanges.push(
      Math.max(...baselineGrayscaleTones) -
        Math.min(...baselineGrayscaleTones),
    );
    matchedGrayscaleRanges.push(
      Math.max(...matchedGrayscaleTones) -
        Math.min(...matchedGrayscaleTones),
    );
    matchedPerceptualRanges.push(
      Math.max(...matchedPerceptualTones) -
        Math.min(...matchedPerceptualTones),
    );

    matchedPerceptualTones.forEach((tone) => {
      assert.ok(
        Math.abs(tone - targetPerceptualTone) <= 0.002,
        `${tone} should be close to the row target ${targetPerceptualTone}`,
      );
    });
  });

  assert.ok(Math.max(...matchedPerceptualRanges) <= 0.004);
  assert.ok(
    Math.max(...matchedGrayscaleRanges) <
      Math.max(...baselineGrayscaleRanges),
  );
});

test("palette generation handles the maximum supported palette size", () => {
  const settings = {
    ...createDefaultSettings(),
    hueCount: 24,
    stepCount: 30,
  };
  const palette = generatePalette(settings);

  assert.equal(palette.totalColors, 750);
  assert.equal(palette.columns.length, 25);
  assert.ok(palette.columns.every((column) => column.swatches.length === 30));
  const gamutWarningCount = palette.columns.reduce(
    (total, column) =>
      total +
      column.swatches.filter((swatch) => swatch.isOutOfSrgbGamut).length,
    0,
  );
  assert.equal(palette.gamutWarningCount, gamutWarningCount);
});

test("palette export groups colors by hue and preserves column order", () => {
  const settings = {
    ...createDefaultSettings(),
    baseHue: 350,
    hueCount: 4,
    stepCount: 3,
  };
  const palette = generatePalette(settings);
  const exportData = groupPaletteByHue(palette);

  assert.deepEqual(Object.keys(exportData), ["grayscale", "hues"]);
  assert.equal(exportData.grayscale.length, 3);
  assert.deepEqual(
    exportData.hues.map((group) => group.hue),
    [350, 80, 170, 260],
  );
  assert.deepEqual(
    exportData.grayscale,
    palette.columns[0].swatches.map((swatch) => swatch.hex),
  );
  assert.deepEqual(
    exportData.hues[0].colors,
    palette.columns[1].swatches.map((swatch) => swatch.hex),
  );

  assert.deepEqual(JSON.parse(serializePaletteExport(palette)), exportData);
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

test("settings URL round-trips every shareable setting", () => {
  const settings = normalizeSettings({
    version: 5,
    baseHue: 123.4,
    chromaCurve: { start: 0.04, middle: 0.28, end: 0.09 },
    lightnessCurve: { start: 0.21, middle: 0.58, end: 0.91 },
    lightnessCurveMode: LIGHTNESS_CURVE_MODES.S,
    lightnessSCurve: { start: 0.12, middle: 0.52, end: 0.88, amount: -0.45 },
    paletteBackground: "#1a2b3c",
    hueCount: 7,
    stepCount: 19,
    gap: 27,
    showGamutWarnings: false,
  });
  const url = getSettingsUrl(
    settings,
    "https://example.test/palette?utm_source=share&baseHue=10#preview",
  );
  const parsedUrl = new URL(url);
  const expectedParameters = [
    "settings",
    "baseHue",
    "chromaStart",
    "chromaMiddle",
    "chromaEnd",
    "lightnessStart",
    "lightnessMiddle",
    "lightnessEnd",
    "lightnessCurveMode",
    "lightnessSStart",
    "lightnessSMiddle",
    "lightnessSEnd",
    "lightnessSAmount",
    "paletteBackground",
    "hueCount",
    "stepCount",
    "gap",
    "showGamutWarnings",
  ];

  assert.equal(parsedUrl.searchParams.get("settings"), SETTINGS_URL_VERSION);
  assert.equal(parsedUrl.searchParams.get("paletteBackground"), "#1A2B3C");
  assert.equal(parsedUrl.searchParams.get("showGamutWarnings"), "0");
  assert.equal(parsedUrl.searchParams.get("utm_source"), "share");
  assert.match(url, /paletteBackground=%231A2B3C/);
  expectedParameters.forEach((name) => {
    assert.equal(parsedUrl.searchParams.has(name), true, name + " should be in URL");
  });
  assert.deepEqual(parseSettingsFromUrl(url), settings);
});

test("settings URL parsing falls back safely for missing or invalid values", () => {
  const url =
    "https://example.test/palette?settings=1&baseHue=not-a-number&showGamutWarnings=unknown";
  const parsed = parseSettingsFromUrl(url, "#ABCDEF");
  const defaults = createDefaultSettings("#ABCDEF");

  assert.equal(hasSettingsInUrl(url), true);
  assert.equal(parsed.baseHue, defaults.baseHue);
  assert.equal(parsed.paletteBackground, defaults.paletteBackground);
  assert.equal(parsed.showGamutWarnings, defaults.showGamutWarnings);
  assert.equal(parseSettingsFromUrl("https://example.test/palette"), null);
  assert.equal(hasSettingsInUrl("https://example.test/palette"), false);
});
