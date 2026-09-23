import {
  createDefaultSettings,
  normalizeSettings,
  normalizeToneBalance,
} from "./palette-model.mjs";

export const SETTINGS_URL_VERSION = "1";
const DEV_CHROMA_RECOVERY_DEFAULT = 0.5;

const DEV_CHROMA_RECOVERY_PARAMETER = "devChromaRecovery";

const SETTINGS_MARKER = "settings";
const URL_PARAMETER_NAMES = Object.freeze([
  "toneBalance",
  "baseHue",
  "tintedGrayHue",
  "tintedGrayInfluence",
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
]);
const DEV_URL_PARAMETER_NAMES = Object.freeze(["showGamutWarnings"]);

function toUrl(input) {
  return input instanceof URL
    ? new URL(input.href)
    : new URL(String(input), "https://auto-color-palette.invalid/");
}

function normalizeDevChromaRecovery(value) {
  const number =
    value === null || String(value).trim() === "" ? NaN : Number(value);
  return Number.isFinite(number)
    ? Math.round(Math.min(1, Math.max(0, number)) * 100) / 100
    : DEV_CHROMA_RECOVERY_DEFAULT;
}

function parseDevChromaRecovery(input) {
  const url = toUrl(input);
  return url.hostname === "localhost"
    ? normalizeDevChromaRecovery(
        url.searchParams.get(DEV_CHROMA_RECOVERY_PARAMETER),
      )
    : 0;
}

function setNumberParameter(parameters, name, value) {
  parameters.set(name, String(value));
}

function readNumberParameter(parameters, name, fallback) {
  if (!parameters.has(name)) {
    return fallback;
  }

  const value = Number(parameters.get(name));
  return Number.isFinite(value) ? value : fallback;
}

function readOptionalNumberParameter(parameters, name, fallback) {
  const rawValue = parameters.get(name);
  if (rawValue === null || rawValue.trim() === "") {
    return fallback;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) ? value : fallback;
}

function readBooleanParameter(parameters, name, fallback) {
  const value = parameters.get(name);

  if (value === "1" || value === "true") {
    return true;
  }
  if (value === "0" || value === "false") {
    return false;
  }

  return fallback;
}

function getDefaultPaletteBackground(paletteBackground) {
  return createDefaultSettings(paletteBackground).paletteBackground;
}

export function hasSettingsInUrl(input) {
  const url = toUrl(input);
  const parameters = url.searchParams;

  return (
    parameters.get(SETTINGS_MARKER) === SETTINGS_URL_VERSION ||
    URL_PARAMETER_NAMES.some((name) => parameters.has(name)) ||
    (url.hostname === "localhost" &&
      (parameters.has(DEV_CHROMA_RECOVERY_PARAMETER) ||
        DEV_URL_PARAMETER_NAMES.some((name) => parameters.has(name))))
  );
}

export function getSettingsUrl(settings, currentUrl) {
  const source = settings && typeof settings === "object" ? settings : {};
  const defaultPaletteBackground = getDefaultPaletteBackground(
    source.paletteBackground,
  );
  const normalized = normalizeSettings(
    {
      ...source,
      version: source.version ?? 7,
      baseHue: source.baseHue ?? createDefaultSettings().baseHue,
    },
    defaultPaletteBackground,
  );
  const url = toUrl(currentUrl ?? "https://auto-color-palette.invalid/");
  const parameters = url.searchParams;

  parameters.delete(SETTINGS_MARKER);
  parameters.delete(DEV_CHROMA_RECOVERY_PARAMETER);
  [...URL_PARAMETER_NAMES, ...DEV_URL_PARAMETER_NAMES].forEach((name) =>
    parameters.delete(name),
  );
  parameters.set(SETTINGS_MARKER, SETTINGS_URL_VERSION);
  setNumberParameter(parameters, "toneBalance", normalized.toneBalance);
  setNumberParameter(parameters, "baseHue", normalized.baseHue);
  setNumberParameter(parameters, "tintedGrayHue", normalized.tintedGrayHue);
  setNumberParameter(
    parameters,
    "tintedGrayInfluence",
    normalized.tintedGrayInfluence,
  );
  setNumberParameter(parameters, "chromaStart", normalized.chromaCurve.start);
  setNumberParameter(parameters, "chromaMiddle", normalized.chromaCurve.middle);
  setNumberParameter(parameters, "chromaEnd", normalized.chromaCurve.end);
  setNumberParameter(parameters, "lightnessStart", normalized.lightnessCurve.start);
  setNumberParameter(
    parameters,
    "lightnessMiddle",
    normalized.lightnessCurve.middle,
  );
  setNumberParameter(parameters, "lightnessEnd", normalized.lightnessCurve.end);
  parameters.set("lightnessCurveMode", normalized.lightnessCurveMode);
  setNumberParameter(
    parameters,
    "lightnessSStart",
    normalized.lightnessSCurve.start,
  );
  setNumberParameter(
    parameters,
    "lightnessSMiddle",
    normalized.lightnessSCurve.middle,
  );
  setNumberParameter(
    parameters,
    "lightnessSEnd",
    normalized.lightnessSCurve.end,
  );
  setNumberParameter(
    parameters,
    "lightnessSAmount",
    normalized.lightnessSCurve.amount,
  );
  parameters.set("paletteBackground", normalized.paletteBackground);
  setNumberParameter(parameters, "hueCount", normalized.hueCount);
  setNumberParameter(parameters, "stepCount", normalized.stepCount);
  setNumberParameter(parameters, "gap", normalized.gap);
  if (url.hostname === "localhost") {
    parameters.set(
      "showGamutWarnings",
      normalized.showGamutWarnings ? "1" : "0",
    );
  }
  url.search = parameters.toString();

  return url.toString();
}

export function parseSettingsFromUrl(
  input,
  paletteBackground = "#F9FAF7",
) {
  const url = toUrl(input);

  if (!hasSettingsInUrl(url)) {
    return null;
  }

  const defaults = createDefaultSettings(paletteBackground);
  const parameters = url.searchParams;
  const isLocalhost = url.hostname === "localhost";
  const baseHue = readNumberParameter(parameters, "baseHue", defaults.baseHue);

  return normalizeSettings(
    {
      version: 7,
      toneBalance: parameters.has("toneBalance")
        ? normalizeToneBalance(parameters.get("toneBalance"))
        : url.hostname === "localhost" && parameters.has(DEV_CHROMA_RECOVERY_PARAMETER)
          ? parseDevChromaRecovery(url) * 100
          : 0,
      baseHue,
      tintedGrayHue: readOptionalNumberParameter(
        parameters,
        "tintedGrayHue",
        baseHue,
      ),
      tintedGrayInfluence: readOptionalNumberParameter(
        parameters,
        "tintedGrayInfluence",
        defaults.tintedGrayInfluence,
      ),
      chromaCurve: {
        start: readNumberParameter(
          parameters,
          "chromaStart",
          defaults.chromaCurve.start,
        ),
        middle: readNumberParameter(
          parameters,
          "chromaMiddle",
          defaults.chromaCurve.middle,
        ),
        end: readNumberParameter(
          parameters,
          "chromaEnd",
          defaults.chromaCurve.end,
        ),
      },
      lightnessCurve: {
        start: readNumberParameter(
          parameters,
          "lightnessStart",
          defaults.lightnessCurve.start,
        ),
        middle: readNumberParameter(
          parameters,
          "lightnessMiddle",
          defaults.lightnessCurve.middle,
        ),
        end: readNumberParameter(
          parameters,
          "lightnessEnd",
          defaults.lightnessCurve.end,
        ),
      },
      lightnessCurveMode:
        parameters.get("lightnessCurveMode") || defaults.lightnessCurveMode,
      lightnessSCurve: {
        start: readNumberParameter(
          parameters,
          "lightnessSStart",
          defaults.lightnessSCurve.start,
        ),
        middle: readNumberParameter(
          parameters,
          "lightnessSMiddle",
          defaults.lightnessSCurve.middle,
        ),
        end: readNumberParameter(
          parameters,
          "lightnessSEnd",
          defaults.lightnessSCurve.end,
        ),
        amount: readNumberParameter(
          parameters,
          "lightnessSAmount",
          defaults.lightnessSCurve.amount,
        ),
      },
      paletteBackground:
        parameters.get("paletteBackground") || defaults.paletteBackground,
      hueCount: readNumberParameter(parameters, "hueCount", defaults.hueCount),
      stepCount: readNumberParameter(
        parameters,
        "stepCount",
        defaults.stepCount,
      ),
      gap: readNumberParameter(parameters, "gap", defaults.gap),
      showGamutWarnings: isLocalhost
        ? readBooleanParameter(
            parameters,
            "showGamutWarnings",
            defaults.showGamutWarnings,
          )
        : false,
    },
    paletteBackground,
  );
}
