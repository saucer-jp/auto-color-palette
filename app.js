const DEFAULTS = Object.freeze({
  baseColor: "#3B82F6",
  darkestLightness: 0.263,
  lightestLightness: 0.983,
  hueCount: 12,
  stepCount: 12,
  gap: 8,
});

const DEFAULT_PALETTE_BACKGROUNDS = Object.freeze({
  light: "#F9FAF7",
  dark: "#202522",
});

const LIMITS = Object.freeze({
  hueCount: { min: 2, max: 24 },
  stepCount: { min: 5, max: 30 },
  gap: { min: 0, max: 40 },
  lightness: { min: 0, max: 1 },
});

const STORAGE_KEY = "auto-color-palette-settings-v1";

function getDefaultPaletteBackground() {
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
    ? DEFAULT_PALETTE_BACKGROUNDS.dark
    : DEFAULT_PALETTE_BACKGROUNDS.light;
}

const state = {
  baseColor: DEFAULTS.baseColor,
  paletteBackground: getDefaultPaletteBackground(),
  darkestLightness: DEFAULTS.darkestLightness,
  lightestLightness: DEFAULTS.lightestLightness,
  hueCount: DEFAULTS.hueCount,
  stepCount: DEFAULTS.stepCount,
  gap: DEFAULTS.gap,
};

const elements = {
  root: document.documentElement,
  baseColor: document.querySelector("#base-color"),
  baseColorValue: document.querySelector("#base-color-value"),
  baseColorCaption: document.querySelector("#base-color-caption"),
  paletteBackground: document.querySelector("#palette-background"),
  paletteBackgroundValue: document.querySelector("#palette-background-value"),
  paletteBackgroundCaption: document.querySelector("#palette-background-caption"),
  darkestLightness: document.querySelector("#darkest-lightness"),
  darkestLightnessValue: document.querySelector("#darkest-lightness-value"),
  lightestLightness: document.querySelector("#lightest-lightness"),
  lightestLightnessValue: document.querySelector("#lightest-lightness-value"),
  hueCount: document.querySelector("#hue-count"),
  hueCountValue: document.querySelector("#hue-count-value"),
  stepCount: document.querySelector("#step-count"),
  stepCountValue: document.querySelector("#step-count-value"),
  gap: document.querySelector("#gap"),
  gapValue: document.querySelector("#gap-value"),
  resetButton: document.querySelector("#reset-button"),
  renderMode: document.querySelector("#render-mode"),
  compatibilityNote: document.querySelector("#compatibility-note"),
  paletteSummary: document.querySelector("#palette-summary"),
  paletteGrid: document.querySelector("#palette-grid"),
  storageStatus: document.querySelector("#storage-status"),
  copyStatus: document.querySelector("#copy-status"),
  copyFallback: document.querySelector("#copy-fallback"),
  copyFallbackValue: document.querySelector("#copy-fallback-value"),
  retryCopy: document.querySelector("#retry-copy"),
};

const supportsRelativeOklch =
  typeof CSS !== "undefined" &&
  CSS.supports("background-color", "oklch(from #3b82f6 l c h)");

const colorCanvas = document.createElement("canvas");
colorCanvas.width = 1;
colorCanvas.height = 1;
const colorContext = colorCanvas.getContext("2d", { willReadFrequently: true });
let copyFeedbackTimer;
let renderFrame;
let lastFallbackTarget = null;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeHex(value, fallback = DEFAULTS.baseColor) {
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

function normalizeRangeValue(value, limits, fallback) {
  const number = Number(value);

  return Number.isFinite(number)
    ? Math.round(clamp(number, limits.min, limits.max))
    : fallback;
}

function normalizeLightness(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number)
    ? Math.round(
        clamp(number, LIMITS.lightness.min, LIMITS.lightness.max) * 1000,
      ) / 1000
    : fallback;
}

function formatLightness(value) {
  return value.toFixed(3);
}

function normalizeLightnessRange(darkestLightness, lightestLightness) {
  const darkest = normalizeLightness(
    darkestLightness,
    DEFAULTS.darkestLightness,
  );
  const lightest = normalizeLightness(
    lightestLightness,
    DEFAULTS.lightestLightness,
  );

  return {
    darkestLightness: Math.min(darkest, lightest),
    lightestLightness: Math.max(darkest, lightest),
  };
}

function loadSettings() {
  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    if (!storedValue) {
      return null;
    }

    const storedSettings = JSON.parse(storedValue);
    if (!storedSettings || typeof storedSettings !== "object") {
      return null;
    }

    const lightnessRange = normalizeLightnessRange(
      storedSettings.darkestLightness,
      storedSettings.lightestLightness,
    );

    return {
      baseColor: normalizeHex(storedSettings.baseColor, DEFAULTS.baseColor),
      paletteBackground: normalizeHex(
        storedSettings.paletteBackground,
        getDefaultPaletteBackground(),
      ),
      ...lightnessRange,
      hueCount: normalizeRangeValue(
        storedSettings.hueCount,
        LIMITS.hueCount,
        DEFAULTS.hueCount,
      ),
      stepCount: normalizeRangeValue(
        storedSettings.stepCount,
        LIMITS.stepCount,
        DEFAULTS.stepCount,
      ),
      gap: normalizeRangeValue(storedSettings.gap, LIMITS.gap, DEFAULTS.gap),
    };
  } catch {
    return null;
  }
}

function setStorageStatus(message, kind) {
  elements.storageStatus.textContent = message;

  if (kind) {
    elements.storageStatus.dataset.kind = kind;
  } else {
    delete elements.storageStatus.dataset.kind;
  }
}

function saveSettings() {
  const settings = {
    version: 2,
    baseColor: state.baseColor,
    paletteBackground: state.paletteBackground,
    darkestLightness: state.darkestLightness,
    lightestLightness: state.lightestLightness,
    hueCount: state.hueCount,
    stepCount: state.stepCount,
    gap: state.gap,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setStorageStatus("設定をこのブラウザに保存しました。", "success");
  } catch {
    setStorageStatus("この環境では設定を保存できません。", "error");
  }
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function srgbToLinear(channel) {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

function linearToSrgb(channel) {
  const value = clamp(channel, 0, 1);
  return value <= 0.0031308
    ? value * 12.92
    : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

function srgbToOklch(hex) {
  const rgb = hexToRgb(hex);
  const red = srgbToLinear(rgb.r);
  const green = srgbToLinear(rgb.g);
  const blue = srgbToLinear(rgb.b);

  const lightness = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const middle = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const short = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;

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
  const H = (Math.atan2(b, a) * 180) / Math.PI;

  return {
    L: clamp(L, 0, 1),
    C: Math.hypot(a, b),
    H: H < 0 ? H + 360 : H,
  };
}

function oklchToHex(L, C, H) {
  const hue = (H * Math.PI) / 180;
  const a = C * Math.cos(hue);
  const b = C * Math.sin(hue);

  const lightnessRoot = L + 0.3963377774 * a + 0.2158037573 * b;
  const middleRoot = L - 0.1055613458 * a - 0.0638541728 * b;
  const shortRoot = L - 0.0894841775 * a - 1.291485548 * b;

  const lightness = lightnessRoot * lightnessRoot * lightnessRoot;
  const middle = middleRoot * middleRoot * middleRoot;
  const short = shortRoot * shortRoot * shortRoot;

  const red = 4.0767416621 * lightness - 3.3077115913 * middle + 0.2309699292 * short;
  const green =
    -1.2684380046 * lightness + 2.6097574011 * middle - 0.3413193965 * short;
  const blue =
    -0.0041960863 * lightness - 0.7034186147 * middle + 1.707614701 * short;

  return rgbToHex(
    Math.round(linearToSrgb(red) * 255),
    Math.round(linearToSrgb(green) * 255),
    Math.round(linearToSrgb(blue) * 255),
  );
}

function rgbToHex(red, green, blue) {
  return (
    "#" +
    [red, green, blue]
      .map((channel) => clamp(channel, 0, 255).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function getRelativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function getReadableTextColor(hex) {
  const luminance = getRelativeLuminance(hex);
  const contrastOnWhite = 1.05 / (luminance + 0.05);
  const contrastOnBlack = (luminance + 0.05) / 0.05;
  return contrastOnWhite >= contrastOnBlack ? "#FFFFFF" : "#101312";
}

function getToneDelta(stepIndex, stepCount, baseLightness) {
  const progress = stepIndex / Math.max(stepCount - 1, 1);
  const darkestDelta = state.darkestLightness - baseLightness;
  const lightestDelta = state.lightestLightness - baseLightness;
  return darkestDelta + (lightestDelta - darkestDelta) * progress;
}

function getSwatchAriaLabel(swatch, hex) {
  const columnLabel =
    swatch.dataset.columnType === "grayscale"
      ? "グレースケール"
      : "色相 " + formatDegree(Number(swatch.dataset.hueOffset)) + "度";

  return (
    columnLabel +
    "、ステップ " +
    swatch.dataset.stepNumber +
    " / " +
    state.stepCount +
    "、" +
    hex +
    "をコピー"
  );
}

function formatDegree(degree) {
  return Math.round(degree * 10) / 10;
}

function updateRangeProgress(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const progress =
    max === min ? 100 : clamp(((value - min) / (max - min)) * 100, 0, 100);
  input.style.setProperty("--range-progress", progress + "%");
}

function syncControls() {
  elements.baseColor.value = state.baseColor.toLowerCase();
  elements.baseColorValue.textContent = state.baseColor;
  elements.baseColorCaption.textContent = state.baseColor;
  elements.paletteBackground.value = state.paletteBackground.toLowerCase();
  elements.paletteBackgroundValue.textContent = state.paletteBackground;
  elements.paletteBackgroundCaption.textContent = state.paletteBackground;
  elements.darkestLightness.max = formatLightness(state.lightestLightness);
  elements.darkestLightness.value = formatLightness(state.darkestLightness);
  elements.darkestLightnessValue.textContent = formatLightness(state.darkestLightness);
  elements.lightestLightness.min = formatLightness(state.darkestLightness);
  elements.lightestLightness.value = formatLightness(state.lightestLightness);
  elements.lightestLightnessValue.textContent = formatLightness(state.lightestLightness);
  elements.hueCount.value = String(state.hueCount);
  elements.hueCountValue.textContent = state.hueCount + " hues";
  elements.stepCount.value = String(state.stepCount);
  elements.stepCountValue.textContent = state.stepCount + " steps";
  elements.gap.value = String(state.gap);
  elements.gapValue.textContent = state.gap + "px";

  updateRangeProgress(elements.darkestLightness);
  updateRangeProgress(elements.lightestLightness);
  updateRangeProgress(elements.hueCount);
  updateRangeProgress(elements.stepCount);
  updateRangeProgress(elements.gap);
}

function createSwatch(
  baseOklch,
  hueOffset,
  stepIndex,
  chroma = baseOklch.C,
  columnType = "hue",
) {
  const toneDelta = getToneDelta(stepIndex, state.stepCount, baseOklch.L);
  const fallbackLightness = clamp(baseOklch.L + toneDelta, 0, 1);
  const fallbackHex = oklchToHex(
    fallbackLightness,
    chroma,
    columnType === "grayscale" ? 0 : baseOklch.H + hueOffset,
  );
  const swatch = document.createElement("button");
  const stepNumber = stepIndex + 1;

  swatch.type = "button";
  swatch.className = "swatch";
  swatch.dataset.role = "swatch";
  swatch.dataset.fallbackHex = fallbackHex;
  swatch.dataset.hueOffset = String(hueOffset);
  swatch.dataset.stepNumber = String(stepNumber);
  swatch.dataset.columnType = columnType;
  swatch.style.setProperty("--hue-offset", String(hueOffset));
  swatch.style.setProperty("--swatch-chroma", String(chroma));
  swatch.style.setProperty("--tone-delta", String(toneDelta));
  swatch.style.setProperty("--fallback-color", fallbackHex);
  swatch.style.setProperty("--swatch-foreground", getReadableTextColor(fallbackHex));
  swatch.setAttribute("aria-label", getSwatchAriaLabel(swatch, fallbackHex));

  const meta = document.createElement("span");
  meta.className = "swatch-meta";

  const hexLabel = document.createElement("span");
  hexLabel.className = "swatch-hex";
  hexLabel.textContent = fallbackHex;

  const actionLabel = document.createElement("span");
  actionLabel.className = "swatch-action";
  actionLabel.setAttribute("aria-hidden", "true");
  actionLabel.textContent = "COPY";

  meta.append(hexLabel, actionLabel);
  swatch.append(meta);

  return swatch;
}

function createHueColumn(baseOklch, hueIndex) {
  const hueOffset = (hueIndex * 360) / state.hueCount;
  const column = document.createElement("section");
  const header = document.createElement("div");
  const label = document.createElement("h3");
  const stack = document.createElement("div");
  const labelId = "hue-label-" + hueIndex;

  column.className = "hue-column";
  column.setAttribute("aria-labelledby", labelId);
  header.className = "hue-header";
  label.className = "hue-label";
  label.id = labelId;
  label.textContent = "HUE " + formatDegree(hueOffset) + "°";
  stack.className = "swatch-stack";

  for (let stepIndex = 0; stepIndex < state.stepCount; stepIndex += 1) {
    stack.append(createSwatch(baseOklch, hueOffset, stepIndex));
  }

  header.append(label);
  column.append(header, stack);
  return column;
}

function createGrayscaleColumn(baseOklch) {
  const column = document.createElement("section");
  const header = document.createElement("div");
  const label = document.createElement("h3");
  const stack = document.createElement("div");
  const labelId = "grayscale-label";

  column.className = "hue-column grayscale-column";
  column.setAttribute("aria-labelledby", labelId);
  header.className = "hue-header";
  label.className = "hue-label";
  label.id = labelId;
  label.textContent = "GRAYSCALE";
  stack.className = "swatch-stack";

  for (let stepIndex = 0; stepIndex < state.stepCount; stepIndex += 1) {
    stack.append(createSwatch(baseOklch, 0, stepIndex, 0, "grayscale"));
  }

  header.append(label);
  column.append(header, stack);
  return column;
}

function cssColorToHex(cssColor) {
  if (!colorContext || !cssColor) {
    return null;
  }

  colorContext.clearRect(0, 0, 1, 1);
  colorContext.fillStyle = "rgba(0, 0, 0, 0)";
  colorContext.fillStyle = cssColor;
  colorContext.fillRect(0, 0, 1, 1);
  const pixel = colorContext.getImageData(0, 0, 1, 1).data;

  if (pixel[3] === 0) {
    return null;
  }

  return rgbToHex(pixel[0], pixel[1], pixel[2]);
}

function updateRenderedHexes() {
  if (!supportsRelativeOklch) {
    return;
  }

  const swatches = elements.paletteGrid.querySelectorAll('[data-role="swatch"]');

  swatches.forEach((swatch) => {
    const renderedColor = getComputedStyle(swatch, "::before").backgroundColor;
    const renderedHex = cssColorToHex(renderedColor);
    const hex = renderedHex || swatch.dataset.fallbackHex;
    const hexLabel = swatch.querySelector(".swatch-hex");

    swatch.dataset.hex = hex;
    swatch.style.setProperty("--swatch-foreground", getReadableTextColor(hex));
    hexLabel.textContent = hex;
    swatch.setAttribute("aria-label", getSwatchAriaLabel(swatch, hex));
  });
}

function updateCompatibilityMessage() {
  if (supportsRelativeOklch) {
    elements.renderMode.textContent = "CSS relative OKLCH";
    elements.compatibilityNote.hidden = true;
    return;
  }

  elements.renderMode.textContent = "JS color fallback";
  elements.compatibilityNote.textContent =
    "このブラウザではCSS Relative Color Syntaxが使えないため、同じトークン計算をJavaScriptで表示しています。";
  elements.compatibilityNote.hidden = false;
}

function showCopyStatus(message, kind) {
  window.clearTimeout(copyFeedbackTimer);
  elements.copyStatus.textContent = message;
  if (kind) {
    elements.copyStatus.dataset.kind = kind;
  } else {
    delete elements.copyStatus.dataset.kind;
  }
  copyFeedbackTimer = window.setTimeout(() => {
    elements.copyStatus.textContent = "";
    delete elements.copyStatus.dataset.kind;
  }, 2800);
}

function showCopyFallback(hex) {
  lastFallbackTarget = hex;
  elements.copyFallbackValue.value = hex;
  elements.copyFallback.hidden = false;
  elements.copyFallbackValue.focus();
  elements.copyFallbackValue.select();
}

function hideCopyFallback() {
  lastFallbackTarget = null;
  elements.copyFallback.hidden = true;
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.insetInlineStart = "-9999px";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  textarea.remove();

  return copied
    ? Promise.resolve()
    : Promise.reject(new Error("Clipboard API is unavailable."));
}

function writeClipboard(text) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  return fallbackCopy(text);
}

async function copySwatch(swatch) {
  const hex = swatch.dataset.hex || swatch.dataset.fallbackHex;

  try {
    await writeClipboard(hex);
    showCopyStatus(hex + " をコピーしました", "success");
    hideCopyFallback();
  } catch {
    showCopyStatus(hex + " をコピーできませんでした。", "error");
    showCopyFallback(hex);
  }

  swatch.classList.add("is-copied");
  window.setTimeout(() => swatch.classList.remove("is-copied"), 900);
}

function renderPalette() {
  const baseOklch = srgbToOklch(state.baseColor);
  const darkestToneDelta = state.darkestLightness - baseOklch.L;
  const lightestToneDelta = state.lightestLightness - baseOklch.L;
  const fragment = document.createDocumentFragment();

  elements.root.style.setProperty("--base-color", state.baseColor);
  elements.root.style.setProperty("--palette-background", state.paletteBackground);
  elements.root.style.setProperty("--darkest-tone-delta", String(darkestToneDelta));
  elements.root.style.setProperty("--lightest-tone-delta", String(lightestToneDelta));
  elements.root.style.setProperty(
    "--darkest-color",
    oklchToHex(state.darkestLightness, baseOklch.C, baseOklch.H),
  );
  elements.root.style.setProperty(
    "--lightest-color",
    oklchToHex(state.lightestLightness, baseOklch.C, baseOklch.H),
  );
  elements.root.style.setProperty("--hue-count", String(state.hueCount));
  elements.root.style.setProperty(
    "--palette-column-count",
    String(state.hueCount + 1),
  );
  elements.root.style.setProperty("--step-count", String(state.stepCount));
  elements.root.style.setProperty("--palette-gap", state.gap + "px");
  elements.paletteGrid.replaceChildren();

  fragment.append(createGrayscaleColumn(baseOklch));
  for (let hueIndex = 0; hueIndex < state.hueCount; hueIndex += 1) {
    fragment.append(createHueColumn(baseOklch, hueIndex));
  }

  elements.paletteGrid.append(fragment);
  elements.paletteSummary.textContent =
    "grayscale + " +
    state.hueCount +
    " hues × " +
    state.stepCount +
    " steps = " +
    (state.hueCount + 1) * state.stepCount +
    " colors";

  if (baseOklch.C < 0.015) {
    elements.compatibilityNote.hidden = false;
    elements.compatibilityNote.textContent =
      "選択色の彩度が低いため、色相を変えても見た目はほぼニュートラルになります。";
  } else {
    updateCompatibilityMessage();
  }

  window.cancelAnimationFrame(renderFrame);
  renderFrame = window.requestAnimationFrame(updateRenderedHexes);
}

function render() {
  state.baseColor = normalizeHex(elements.baseColor.value);
  state.paletteBackground = normalizeHex(
    elements.paletteBackground.value,
    getDefaultPaletteBackground(),
  );
  const lightnessRange = normalizeLightnessRange(
    elements.darkestLightness.value,
    elements.lightestLightness.value,
  );
  state.darkestLightness = lightnessRange.darkestLightness;
  state.lightestLightness = lightnessRange.lightestLightness;
  state.hueCount = normalizeRangeValue(
    elements.hueCount.value,
    LIMITS.hueCount,
    DEFAULTS.hueCount,
  );
  state.stepCount = normalizeRangeValue(
    elements.stepCount.value,
    LIMITS.stepCount,
    DEFAULTS.stepCount,
  );
  state.gap = normalizeRangeValue(
    elements.gap.value,
    LIMITS.gap,
    DEFAULTS.gap,
  );
  syncControls();
  saveSettings();
  renderPalette();
}

function resetSettings() {
  state.baseColor = DEFAULTS.baseColor;
  state.paletteBackground = getDefaultPaletteBackground();
  state.darkestLightness = DEFAULTS.darkestLightness;
  state.lightestLightness = DEFAULTS.lightestLightness;
  state.hueCount = DEFAULTS.hueCount;
  state.stepCount = DEFAULTS.stepCount;
  state.gap = DEFAULTS.gap;
  elements.baseColor.value = DEFAULTS.baseColor.toLowerCase();
  elements.paletteBackground.value = state.paletteBackground.toLowerCase();
  elements.darkestLightness.value = formatLightness(DEFAULTS.darkestLightness);
  elements.lightestLightness.value = formatLightness(DEFAULTS.lightestLightness);
  elements.hueCount.value = String(DEFAULTS.hueCount);
  elements.stepCount.value = String(DEFAULTS.stepCount);
  elements.gap.value = String(DEFAULTS.gap);
  hideCopyFallback();
  showCopyStatus("設定を初期値に戻しました", "success");
  render();
}

function bindEvents() {
  [
    elements.baseColor,
    elements.paletteBackground,
    elements.darkestLightness,
    elements.lightestLightness,
    elements.hueCount,
    elements.stepCount,
    elements.gap,
  ].forEach((input) => input.addEventListener("input", render));

  elements.resetButton.addEventListener("click", resetSettings);

  elements.paletteGrid.addEventListener("click", (event) => {
    const swatch = event.target.closest('[data-role="swatch"]');
    if (swatch) {
      void copySwatch(swatch);
    }
  });

  elements.retryCopy.addEventListener("click", () => {
    if (!lastFallbackTarget) {
      return;
    }
    void writeClipboard(lastFallbackTarget)
      .then(() => {
        showCopyStatus(lastFallbackTarget + " をコピーしました", "success");
        hideCopyFallback();
      })
      .catch(() => {
        showCopyStatus(lastFallbackTarget + " をコピーできませんでした。", "error");
        showCopyFallback(lastFallbackTarget);
      });
  });
}

const storedSettings = loadSettings();
if (storedSettings) {
  Object.assign(state, storedSettings);
}

bindEvents();
updateCompatibilityMessage();
syncControls();
render();
