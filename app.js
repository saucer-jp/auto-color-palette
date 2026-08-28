import {
  LIMITS,
  LIGHTNESS_CURVE_MODES,
  clamp,
  createDefaultSettings,
  evaluateChroma,
  evaluateLightness,
  generatePalette,
  getSwatchColor,
  normalizeHex,
  normalizeSettings,
} from "./palette-model.mjs";
import { getSettingsUrl, parseSettingsFromUrl } from "./settings-url.mjs";

const DEFAULT_PALETTE_BACKGROUNDS = Object.freeze({
  light: "#F9FAF7",
  dark: "#202522",
});

const STORAGE_KEY = "auto-color-palette-settings-v1";

function getDefaultPaletteBackground() {
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
    ? DEFAULT_PALETTE_BACKGROUNDS.dark
    : DEFAULT_PALETTE_BACKGROUNDS.light;
}

const state = createDefaultSettings(getDefaultPaletteBackground());

const elements = {
  root: document.documentElement,
  baseHue: document.querySelector("#base-hue"),
  baseHueValue: document.querySelector("#base-hue-value"),
  paletteBackground: document.querySelector("#palette-background"),
  paletteBackgroundValue: document.querySelector("#palette-background-value"),
  paletteBackgroundCaption: document.querySelector("#palette-background-caption"),
  hueCount: document.querySelector("#hue-count"),
  hueCountValue: document.querySelector("#hue-count-value"),
  stepCount: document.querySelector("#step-count"),
  stepCountValue: document.querySelector("#step-count-value"),
  gap: document.querySelector("#gap"),
  gapValue: document.querySelector("#gap-value"),
  showGamutWarnings: document.querySelector("#show-gamut-warnings"),
  gamutWarningCount: document.querySelector("#gamut-warning-count"),
  lightnessCurveModes: [
    ...document.querySelectorAll('input[name="lightness-curve-mode"]'),
  ],
  lightnessSCurveControls: document.querySelector("#lightness-s-curve-controls"),
  lightnessSCurveAmount: document.querySelector("#lightness-s-amount"),
  lightnessSCurveAmountValue: document.querySelector("#lightness-s-amount-value"),
  lightnessCurveHelp: document.querySelector("#lightness-curve-help"),
  resetButton: document.querySelector("#reset-button"),
  copyShareUrl: document.querySelector("#copy-share-url"),
  compatibilityNote: document.querySelector("#compatibility-note"),
  paletteGrid: document.querySelector("#palette-grid"),
  storageStatus: document.querySelector("#storage-status"),
  toast: document.querySelector("#toast"),
  toastMessage: document.querySelector("#toast-message"),
  toastClose: document.querySelector(".toast-close"),
};

const curveElements = {
  chroma: {
    editor: document.querySelector("#chroma-curve-editor"),
    path: document.querySelector("#chroma-curve-path"),
    handles: [...document.querySelectorAll("#chroma-curve-editor .curve-handle")],
    outputs: {
      start: document.querySelector("#chroma-curve-start-value"),
      middle: document.querySelector("#chroma-curve-middle-value"),
      end: document.querySelector("#chroma-curve-end-value"),
    },
  },
  lightness: {
    editor: document.querySelector("#lightness-curve-editor"),
    path: document.querySelector("#lightness-curve-path"),
    handles: [
      ...document.querySelectorAll("#lightness-curve-editor .curve-handle"),
    ],
    outputs: {
      start: document.querySelector("#lightness-curve-start-value"),
      middle: document.querySelector("#lightness-curve-middle-value"),
      end: document.querySelector("#lightness-curve-end-value"),
    },
  },
};

const supportsOklch =
  typeof CSS !== "undefined" &&
  CSS.supports("background-color", "oklch(0.5 0.1 180)");

const colorCanvas = document.createElement("canvas");
colorCanvas.width = 1;
colorCanvas.height = 1;
const colorContext = colorCanvas.getContext("2d", { willReadFrequently: true });
let toastTimer;
let renderFrame;

function formatDegree(degree) {
  return String(Math.round(Number(degree) * 10) / 10);
}

function formatCurveValue(value) {
  return Number(value).toFixed(3);
}

function formatSCurveAmount(value) {
  const percentage = Math.round(Number(value) * 100);
  return (percentage > 0 ? "+" : "") + percentage + "%";
}

function formatCssNumber(value) {
  return String(Number(Number(value).toFixed(6)));
}

function getCurveKey(curveType) {
  return curveType + "Curve";
}

function setStorageStatus(message, kind) {
  elements.storageStatus.textContent = message;

  if (kind) {
    elements.storageStatus.dataset.kind = kind;
  } else {
    delete elements.storageStatus.dataset.kind;
  }
}

function syncSettingsUrl() {
  const nextUrl = getSettingsUrl(state, window.location.href);

  if (nextUrl === window.location.href) {
    return nextUrl;
  }

  try {
    window.history.replaceState(window.history.state, "", nextUrl);
  } catch {
    // The palette still works when the host does not allow history updates.
  }

  return nextUrl;
}

function loadSettingsFromUrl() {
  return parseSettingsFromUrl(window.location.href, getDefaultPaletteBackground());
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

    return normalizeSettings(storedSettings, getDefaultPaletteBackground());
  } catch {
    return null;
  }
}

function saveSettings() {
  const settings = {
    version: 5,
    baseHue: state.baseHue,
    chromaCurve: { ...state.chromaCurve },
    lightnessCurve: { ...state.lightnessCurve },
    lightnessCurveMode: state.lightnessCurveMode,
    lightnessSCurve: { ...state.lightnessSCurve },
    paletteBackground: state.paletteBackground,
    hueCount: state.hueCount,
    stepCount: state.stepCount,
    gap: state.gap,
    showGamutWarnings: state.showGamutWarnings,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setStorageStatus("設定をこのブラウザに保存しました。", "success");
  } catch {
    setStorageStatus("この環境では設定を保存できません。", "error");
  }
}

function updateRangeProgress(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const progress =
    max === min ? 100 : clamp(((value - min) / (max - min)) * 100, 0, 100);
  input.style.setProperty("--range-progress", progress + "%");
}

function getCurveRange(curveType) {
  return curveType === "chroma"
    ? {
        min: LIMITS.chroma.min,
        max: LIMITS.chroma.max,
        step: 0.001,
      }
    : {
        min: LIMITS.lightness.min,
        max: LIMITS.lightness.max,
        step: 0.001,
      };
}

function curveValueToY(curveType, value) {
  const range = getCurveRange(curveType);
  const span = range.max - range.min;

  if (span === 0) {
    return 0.5;
  }

  return 1 - clamp((value - range.min) / span, 0, 1);
}

function curveYToValue(curveType, y) {
  const range = getCurveRange(curveType);
  return range.max - clamp(y, 0, 1) * (range.max - range.min);
}

function getCurveValue(curveType, point) {
  if (
    curveType === "lightness" &&
    state.lightnessCurveMode === LIGHTNESS_CURVE_MODES.S
  ) {
    return state.lightnessSCurve[point];
  }

  return state[getCurveKey(curveType)][point];
}

function getCurveLabel(curveType, point) {
  const curveLabel = curveType === "chroma" ? "彩度" : "明度";
  if (
    curveType === "lightness" &&
    state.lightnessCurveMode === LIGHTNESS_CURVE_MODES.S
  ) {
    const boundLabel =
      point === "start" ? "最小値" : point === "end" ? "最大値" : "中点";
    return curveLabel + "カーブの" + boundLabel;
  }

  const pointLabel =
    point === "start" ? "始点" : point === "middle" ? "中点" : "終点";
  return curveLabel + "カーブの" + pointLabel;
}

function getCurveSampleValue(curveType, progress) {
  const curve = state[getCurveKey(curveType)];

  return curveType === "chroma"
    ? evaluateChroma(curve, progress)
    : evaluateLightness(
        curve,
        progress,
        state.lightnessCurveMode,
        state.lightnessSCurve,
      );
}

function updateCurveGraph(curveType) {
  const controls = curveElements[curveType];
  const isLightnessSCurve =
    curveType === "lightness" &&
    state.lightnessCurveMode === LIGHTNESS_CURVE_MODES.S;
  const sampleCount = 40;
  const pathData = [];

  controls.editor.dataset.mode = isLightnessSCurve
    ? LIGHTNESS_CURVE_MODES.S
    : LIGHTNESS_CURVE_MODES.CUSTOM;

  for (let index = 0; index <= sampleCount; index += 1) {
    const progress = index / sampleCount;
    const value = getCurveSampleValue(curveType, progress);
    const x = progress * 100;
    const y = curveValueToY(curveType, value) * 100;
    pathData.push((index === 0 ? "M" : "L") + " " + x + " " + y);
  }

  controls.path.setAttribute("d", pathData.join(" "));

  controls.handles.forEach((handle) => {
    const point = handle.dataset.point;
    const value = getCurveValue(curveType, point);
    const x = point === "start" ? 0 : point === "middle" ? 50 : 100;
    const y = curveValueToY(curveType, value) * 100;
    const range = getCurveRange(curveType);

    handle.hidden = false;
    handle.style.left = x + "%";
    handle.style.top = y + "%";
    handle.setAttribute("aria-label", getCurveLabel(curveType, point));
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute(
      "aria-describedby",
      controls.editor.getAttribute("aria-describedby"),
    );
    handle.setAttribute("aria-valuemin", formatCurveValue(range.min));
    handle.setAttribute("aria-valuemax", formatCurveValue(range.max));
    handle.setAttribute("aria-valuenow", formatCurveValue(value));
    handle.setAttribute(
      "aria-valuetext",
      formatCurveValue(value) + (curveType === "chroma" ? " OKLCH C" : " OKLCH L"),
    );
    controls.outputs[point].textContent = formatCurveValue(value);
  });
}

function syncLightnessCurveControls() {
  const mode = state.lightnessCurveMode;

  elements.lightnessCurveModes.forEach((input) => {
    input.checked = input.value === mode;
  });
  elements.lightnessSCurveControls.hidden =
    mode !== LIGHTNESS_CURVE_MODES.S;
  elements.lightnessSCurveAmount.value = String(state.lightnessSCurve.amount);
  elements.lightnessSCurveAmountValue.textContent = formatSCurveAmount(
    state.lightnessSCurve.amount,
  );
  elements.lightnessCurveHelp.textContent =
    mode === LIGHTNESS_CURVE_MODES.S
      ? "ステップ方向のOKLCH L（0〜1）。始点・中点・終点のつまみとS字の強さでカーブを調整できます。"
      : "ステップ方向のOKLCH L（0〜1）。暗い順を保つため、始点から終点まで単調に増加します。";
  updateRangeProgress(elements.lightnessSCurveAmount);
}

function syncControls() {
  elements.baseHue.value = String(state.baseHue);
  elements.baseHueValue.textContent = formatDegree(state.baseHue) + "°";
  elements.paletteBackground.value = state.paletteBackground.toLowerCase();
  elements.paletteBackgroundValue.textContent = state.paletteBackground;
  elements.paletteBackgroundCaption.textContent = state.paletteBackground;
  elements.hueCount.value = String(state.hueCount);
  elements.hueCountValue.textContent = state.hueCount + " hues";
  elements.stepCount.value = String(state.stepCount);
  elements.stepCountValue.textContent = state.stepCount + " steps";
  elements.gap.value = String(state.gap);
  elements.gapValue.textContent = state.gap + "px";
  elements.showGamutWarnings.checked = state.showGamutWarnings;

  updateRangeProgress(elements.baseHue);
  updateRangeProgress(elements.hueCount);
  updateRangeProgress(elements.stepCount);
  updateRangeProgress(elements.gap);
  syncLightnessCurveControls();
  updateCurveGraph("chroma");
  updateCurveGraph("lightness");
}

function readSettingsFromControls() {
  const lightnessCurveMode =
    elements.lightnessCurveModes.find((input) => input.checked)?.value ||
    state.lightnessCurveMode;

  return normalizeSettings(
    {
      ...state,
      version: 5,
      baseHue: Number(elements.baseHue.value),
      lightnessCurveMode,
      lightnessSCurve: {
        ...state.lightnessSCurve,
        amount: Number(elements.lightnessSCurveAmount.value),
      },
      paletteBackground: elements.paletteBackground.value,
      hueCount: Number(elements.hueCount.value),
      stepCount: Number(elements.stepCount.value),
      gap: Number(elements.gap.value),
      showGamutWarnings: elements.showGamutWarnings.checked,
    },
    getDefaultPaletteBackground(),
  );
}

function applySettings(settings, { persist = true } = {}) {
  Object.assign(state, settings);
  syncControls();
  syncSettingsUrl();
  if (persist) {
    saveSettings();
  }
  renderPalette();
}

function renderFromControls() {
  applySettings(readSettingsFromControls());
}

function getSwatchAriaLabel(swatch, hex) {
  const columnLabel =
    swatch.dataset.columnType === "grayscale"
      ? "グレースケール"
      : "色相 " + formatDegree(Number(swatch.dataset.hue)) + "度";
  const gamutLabel =
    swatch.dataset.gamutWarning === "true"
      ? "、sRGB色域外のためクリップ"
      : "";

  return (
    columnLabel +
    "、ステップ " +
    swatch.dataset.stepNumber +
    " / " +
    state.stepCount +
    "、" +
    hex +
    gamutLabel +
    "、クリックでコピー"
  );
}

function createSwatch(swatchData) {
  const swatch = document.createElement("button");
  const meta = document.createElement("span");
  const hexLabel = document.createElement("span");
  const actionLabel = document.createElement("span");

  swatch.type = "button";
  swatch.className = "swatch";
  swatch.dataset.role = "swatch";
  swatch.dataset.fallbackHex = swatchData.hex;
  swatch.dataset.hue =
    swatchData.columnType === "grayscale" ? "0" : String(swatchData.H);
  swatch.dataset.stepNumber = String(swatchData.stepNumber);
  swatch.dataset.columnType = swatchData.columnType;
  swatch.dataset.gamutWarning = String(swatchData.isOutOfSrgbGamut);
  swatch.style.setProperty("--swatch-lightness", formatCssNumber(swatchData.L));
  swatch.style.setProperty("--swatch-chroma", formatCssNumber(swatchData.C));
  swatch.style.setProperty("--swatch-hue", formatCssNumber(swatchData.H));
  swatch.style.setProperty("--fallback-color", swatchData.hex);
  swatch.style.setProperty(
    "--swatch-foreground",
    getReadableTextColor(swatchData.hex),
  );

  if (swatchData.isOutOfSrgbGamut && state.showGamutWarnings) {
    const warning = document.createElement("span");
    warning.className = "swatch-alert";
    warning.setAttribute("aria-hidden", "true");
    swatch.append(warning);
  }

  swatch.setAttribute("aria-label", getSwatchAriaLabel(swatch, swatchData.hex));

  meta.className = "swatch-meta";
  hexLabel.className = "swatch-hex";
  hexLabel.textContent = swatchData.hex;
  actionLabel.className = "swatch-action";
  actionLabel.setAttribute("aria-hidden", "true");
  actionLabel.textContent = "COPY";
  meta.append(hexLabel, actionLabel);
  swatch.append(meta);

  return swatch;
}

function createPaletteColumn(column, columnIndex) {
  const section = document.createElement("section");
  const header = document.createElement("div");
  const label = document.createElement("h3");
  const stack = document.createElement("div");
  const labelId = "palette-column-label-" + columnIndex;

  section.className =
    column.type === "grayscale"
      ? "hue-column grayscale-column"
      : "hue-column";
  section.setAttribute("aria-labelledby", labelId);
  header.className = "hue-header";
  label.className = "hue-label";
  label.id = labelId;
  label.textContent =
    column.type === "grayscale"
      ? "GRAYSCALE"
      : "HUE " + formatDegree(column.hue) + "°";
  stack.className = "swatch-stack";

  column.swatches.forEach((swatchData) => {
    stack.append(createSwatch(swatchData));
  });

  header.append(label);
  section.append(header, stack);
  return section;
}

function getReadableTextColor(hex) {
  const luminance = getRelativeLuminance(hex);
  const contrastOnWhite = 1.05 / (luminance + 0.05);
  const contrastOnBlack = (luminance + 0.05) / 0.05;
  return contrastOnWhite >= contrastOnBlack ? "#FFFFFF" : "#101312";
}

function getRelativeLuminance(hex) {
  const normalized = normalizeHex(hex);
  const channels = [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
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

  return (
    "#" +
    [pixel[0], pixel[1], pixel[2]]
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function updateRenderedHexes() {
  if (!supportsOklch) {
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
  if (supportsOklch) {
    elements.compatibilityNote.hidden = true;
    return;
  }

  elements.compatibilityNote.textContent =
    "このブラウザではCSS OKLCHが使えないため、同じトークン計算をJavaScriptで表示しています。";
  elements.compatibilityNote.hidden = false;
}

function updateGamutWarningCount(gamutCount) {
  elements.gamutWarningCount.textContent = "(" + gamutCount + ")";
}

function getCurvePreviewColors() {
  return [0, 0.5, 1].map((progress) =>
    getSwatchColor(
      getCurveSampleValue("lightness", progress),
      getCurveSampleValue("chroma", progress),
      state.baseHue,
    ),
  );
}

function renderPalette() {
  const palette = generatePalette(state);
  const previewColors = getCurvePreviewColors();
  const fragment = document.createDocumentFragment();
  const gamutCount = palette.columns.reduce(
    (count, column) =>
      count + column.swatches.filter((swatch) => swatch.isOutOfSrgbGamut).length,
    0,
  );

  elements.root.style.setProperty("--palette-background", state.paletteBackground);
  elements.root.style.setProperty("--curve-start-color", previewColors[0].hex);
  elements.root.style.setProperty("--curve-middle-color", previewColors[1].hex);
  elements.root.style.setProperty("--curve-end-color", previewColors[2].hex);
  elements.root.style.setProperty("--hue-count", String(state.hueCount));
  elements.root.style.setProperty(
    "--palette-column-count",
    String(state.hueCount + 1),
  );
  elements.root.style.setProperty("--step-count", String(state.stepCount));
  elements.root.style.setProperty("--palette-gap", state.gap + "px");
  elements.paletteGrid.replaceChildren();

  palette.columns.forEach((column, columnIndex) => {
    fragment.append(createPaletteColumn(column, columnIndex));
  });

  elements.paletteGrid.append(fragment);
  updateGamutWarningCount(gamutCount);

  window.cancelAnimationFrame(renderFrame);
  renderFrame = window.requestAnimationFrame(updateRenderedHexes);
}

function hideToast() {
  window.clearTimeout(toastTimer);

  if (typeof elements.toast.hidePopover === "function") {
    if (elements.toast.matches(":popover-open")) {
      elements.toast.hidePopover();
    }
  }

  elements.toast.classList.remove("is-visible");
  delete elements.toast.dataset.kind;
}

function showToast(message, kind) {
  window.clearTimeout(toastTimer);
  elements.toastMessage.textContent = message;

  if (kind) {
    elements.toast.dataset.kind = kind;
  } else {
    delete elements.toast.dataset.kind;
  }

  elements.toast.setAttribute("role", kind === "error" ? "alert" : "status");
  elements.toast.setAttribute(
    "aria-live",
    kind === "error" ? "assertive" : "polite",
  );

  if (typeof elements.toast.showPopover === "function") {
    if (elements.toast.matches(":popover-open")) {
      elements.toast.hidePopover();
    }
    elements.toast.showPopover();
  } else {
    elements.toast.classList.add("is-visible");
  }

  toastTimer = window.setTimeout(hideToast, 2800);
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
    showToast(hex + " をコピーしました", "success");
  } catch {
    showToast(hex + " をコピーできませんでした。", "error");
  }

  swatch.classList.add("is-copied");
  window.setTimeout(() => swatch.classList.remove("is-copied"), 900);
}

async function copyShareUrl() {
  const shareUrl = syncSettingsUrl();

  try {
    await writeClipboard(shareUrl);
    showToast("共有URLをコピーしました", "success");
  } catch {
    showToast("共有URLをコピーできませんでした。", "error");
  }
}

function setCurvePoint(curveType, point, rawValue, persist = false) {
  const curveKey = getCurveKey(curveType);
  const range = getCurveRange(curveType);
  let value = clamp(Number(rawValue), range.min, range.max);
  const isLightnessSCurve =
    curveType === "lightness" &&
    state.lightnessCurveMode === LIGHTNESS_CURVE_MODES.S;
  const nextSettingsInput = {
    ...state,
    version: 5,
  };

  if (isLightnessSCurve) {
    const nextSCurve = { ...state.lightnessSCurve };
    if (point === "start") {
      value = Math.min(value, nextSCurve.middle);
    } else if (point === "middle") {
      value = clamp(value, nextSCurve.start, nextSCurve.end);
    } else {
      value = Math.max(value, nextSCurve.middle);
    }
    nextSCurve[point] = Math.round(value * 1000) / 1000;
    nextSettingsInput.lightnessSCurve = nextSCurve;
  } else {
    const nextCurve = { ...state[curveKey] };

    if (curveType === "lightness") {
      if (point === "start") {
        value = Math.min(value, nextCurve.middle);
      } else if (point === "middle") {
        value = clamp(value, nextCurve.start, nextCurve.end);
      } else {
        value = Math.max(value, nextCurve.middle);
      }
    }

    nextCurve[point] = Math.round(value * 1000) / 1000;
    nextSettingsInput[curveKey] = nextCurve;
  }

  const nextSettings = normalizeSettings(
    nextSettingsInput,
    getDefaultPaletteBackground(),
  );

  Object.assign(state, nextSettings);
  syncControls();
  syncSettingsUrl();
  renderPalette();
  if (persist) {
    saveSettings();
  }
}

function updateCurvePointFromPointer(editor, handle, clientY) {
  const rect = editor.getBoundingClientRect();
  const y = clamp((clientY - rect.top) / rect.height, 0, 1);
  const curveType = editor.dataset.curve;
  setCurvePoint(curveType, handle.dataset.point, curveYToValue(curveType, y));
}

function handleCurvePointerMove(event) {
  const handle = event.currentTarget;
  const editor = handle.closest(".curve-editor");
  updateCurvePointFromPointer(editor, handle, event.clientY);
}

function handleCurvePointerDown(event) {
  const handle = event.currentTarget;
  const editor = handle.closest(".curve-editor");

  if (event.button !== 0 && event.pointerType !== "touch") {
    return;
  }

  event.preventDefault();
  handle.setPointerCapture(event.pointerId);
  handle.classList.add("is-dragging");
  updateCurvePointFromPointer(editor, handle, event.clientY);
  handle.addEventListener("pointermove", handleCurvePointerMove);

  const finishDrag = (endEvent) => {
    if (handle.hasPointerCapture(endEvent.pointerId)) {
      handle.releasePointerCapture(endEvent.pointerId);
    }
    handle.classList.remove("is-dragging");
    handle.removeEventListener("pointermove", handleCurvePointerMove);
    handle.removeEventListener("pointerup", finishDrag);
    handle.removeEventListener("pointercancel", finishDrag);
    saveSettings();
  };

  handle.addEventListener("pointerup", finishDrag, { once: true });
  handle.addEventListener("pointercancel", finishDrag, { once: true });
}

function handleCurveKeydown(event) {
  const handle = event.currentTarget;
  const editor = handle.closest(".curve-editor");
  const curveType = editor.dataset.curve;
  const point = handle.dataset.point;
  const range = getCurveRange(curveType);
  const currentValue = getCurveValue(curveType, point);
  let nextValue = currentValue;

  if (event.key === "ArrowUp" || event.key === "ArrowRight") {
    nextValue += range.step;
  } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
    nextValue -= range.step;
  } else if (event.key === "Home") {
    nextValue = range.min;
  } else if (event.key === "End") {
    nextValue = range.max;
  } else {
    return;
  }

  event.preventDefault();
  setCurvePoint(curveType, point, nextValue, true);
}

function bindCurveEditor(curveType) {
  const controls = curveElements[curveType];

  controls.handles.forEach((handle) => {
    handle.addEventListener("pointerdown", handleCurvePointerDown);
    handle.addEventListener("keydown", handleCurveKeydown);
  });
}

function resetSettings() {
  Object.assign(state, createDefaultSettings(getDefaultPaletteBackground()));
  syncControls();
  syncSettingsUrl();
  renderPalette();
  saveSettings();
  showToast("設定を初期値に戻しました", "success");
}

function bindEvents() {
  [
    elements.baseHue,
    elements.paletteBackground,
    elements.hueCount,
    elements.stepCount,
    elements.gap,
    elements.lightnessSCurveAmount,
  ].forEach((input) =>
    input.addEventListener("input", () => renderFromControls(input)),
  );

  elements.lightnessCurveModes.forEach((input) =>
    input.addEventListener("change", () => renderFromControls(input)),
  );

  bindCurveEditor("chroma");
  bindCurveEditor("lightness");
  elements.resetButton.addEventListener("click", resetSettings);
  elements.copyShareUrl.addEventListener("click", () => {
    void copyShareUrl();
  });
  elements.showGamutWarnings.addEventListener("change", () => {
    renderFromControls(elements.showGamutWarnings);
  });

  elements.paletteGrid.addEventListener("click", (event) => {
    const swatch = event.target.closest('[data-role="swatch"]');
    if (swatch) {
      void copySwatch(swatch);
    }
  });

  elements.toastClose.addEventListener("click", hideToast);
}

const urlSettings = loadSettingsFromUrl();
const storedSettings = urlSettings ? null : loadSettings();
if (urlSettings) {
  Object.assign(state, urlSettings);
} else if (storedSettings) {
  Object.assign(state, storedSettings);
}

bindEvents();
updateCompatibilityMessage();
syncControls();
renderPalette();
syncSettingsUrl();
saveSettings();
