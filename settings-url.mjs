import {
  createDefaultSettings,
  normalizeSettings,
} from "./palette-model.mjs";

export const SETTINGS_URL_VERSION = "1";
export const DEV_CHROMA_RECOVERY_DEFAULT = 0.5;

const DEV_CHROMA_RECOVERY_PARAMETER = "devChromaRecovery";

const SETTINGS_MARKER = "settings";
const URL_PARAMETER_NAMES = Object.freeze([
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
]);

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

export function parseDevChromaRecovery(input) {
  const url = toUrl(input);
  return url.hostname === "localhost"
    ? normalizeDevChromaRecovery(
        url.searchParams.get(DEV_CHROMA_RECOVERY_PARAMETER),
      )
    : 0;
}

// Keep experimental rendering options out of the public settings schema and
// localStorage, but include them in localhost URLs so previews reproduce.
export function getPreviewSettingsUrl(settings, currentUrl, chromaRecovery) {
  const url = toUrl(getSettingsUrl(settings, currentUrl));
  if (url.hostname === "localhost") {
    url.searchParams.set(
      DEV_CHROMA_RECOVERY_PARAMETER,
      String(normalizeDevChromaRecovery(chromaRecovery)),
    );
  } else {
    url.searchParams.delete(DEV_CHROMA_RECOVERY_PARAMETER);
  }
  return url.toString();
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
  const parameters = toUrl(input).searchParams;

  return (
    parameters.get(SETTINGS_MARKER) === SETTINGS_URL_VERSION ||
    URL_PARAMETER_NAMES.some((name) => parameters.has(name))
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
      version: 5,
      baseHue: source.baseHue ?? createDefaultSettings().baseHue,
    },
    defaultPaletteBackground,
  );
  const url = toUrl(currentUrl ?? "https://auto-color-palette.invalid/");
  const parameters = url.searchParams;

  parameters.delete(SETTINGS_MARKER);
  URL_PARAMETER_NAMES.forEach((name) => parameters.delete(name));
  parameters.set(SETTINGS_MARKER, SETTINGS_URL_VERSION);
  setNumberParameter(parameters, "baseHue", normalized.baseHue);
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
  parameters.set("showGamutWarnings", normalized.showGamutWarnings ? "1" : "0");
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

  return normalizeSettings(
    {
      version: 5,
      baseHue: readNumberParameter(parameters, "baseHue", defaults.baseHue),
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
      showGamutWarnings: readBooleanParameter(
        parameters,
        "showGamutWarnings",
        defaults.showGamutWarnings,
      ),
    },
    paletteBackground,
  );
}
