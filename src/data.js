/**
 * Pure Home Assistant / Tessie adapter. No requests, commands, credentials, or DOM writes.
 * Keys follow Home Assistant's Tessie entity descriptions (2026-10); user overrides
 * always take precedence. Registry data can come from hass.entities or from
 * hass.callWS({type: "config/entity_registry/list"}), performed by the card itself.
 */

export const DEFAULT_CAR_COLOR = "#bdc4ce";
export const ROLES = Object.freeze([
  "battery", "range", "charging", "charger_power", "charge_limit", "charge_rate",
  "energy_added", "inside_temperature", "outside_temperature", "lock", "climate",
  "sentry", "location", "odometer", "online", "color", "charge_port", "trunk",
]);

// Domain and key order are deliberate: charging sensor before binary sensor;
// rated range before estimates; the primary cabin climate before overheat protection.
export const ROLE_DEFINITIONS = Object.freeze({
  battery: { domains: ["sensor"], keys: ["charge_state_usable_battery_level", "charge_state_battery_level"], aliases: ["battery_level", "usable_battery_level", "battery"] },
  range: { domains: ["sensor"], keys: ["charge_state_battery_range", "charge_state_est_battery_range", "charge_state_ideal_battery_range"], aliases: ["battery_range", "range", "battery_range_estimate", "battery_range_ideal"] },
  charging: { domains: ["sensor", "binary_sensor", "switch"], keys: ["charge_state_charging_state", "charge_state_charge_enable_request"], aliases: ["charging", "battery_charging", "charging_state", "charge"] },
  charger_power: { domains: ["sensor"], keys: ["charge_state_charger_power"], aliases: ["charger_power", "charging_power"] },
  charge_limit: { domains: ["number", "sensor"], keys: ["charge_state_charge_limit_soc"], aliases: ["charge_limit", "charge_limit_soc"] },
  charge_rate: { domains: ["sensor"], keys: ["charge_state_charge_rate"], aliases: ["charge_rate", "charging_rate"] },
  energy_added: { domains: ["sensor"], keys: ["charge_state_charge_energy_added"], aliases: ["charge_energy_added", "energy_added"] },
  inside_temperature: { domains: ["sensor"], keys: ["climate_state_inside_temp"], aliases: ["inside_temperature", "inside_temp", "interior_temperature", "cabin_temperature"] },
  outside_temperature: { domains: ["sensor"], keys: ["climate_state_outside_temp"], aliases: ["outside_temperature", "outside_temp", "exterior_temperature"] },
  lock: { domains: ["lock"], keys: ["vehicle_state_locked"], aliases: ["lock", "door_lock", "doors"] },
  climate: { domains: ["climate"], keys: ["primary"], aliases: ["climate", "hvac"] },
  sentry: { domains: ["switch", "binary_sensor"], keys: ["vehicle_state_sentry_mode"], aliases: ["sentry_mode", "sentry"] },
  location: { domains: ["device_tracker"], keys: ["location"], aliases: ["location"] },
  odometer: { domains: ["sensor"], keys: ["vehicle_state_odometer"], aliases: ["odometer"] },
  online: { domains: ["binary_sensor", "sensor"], keys: ["state"], aliases: ["online", "status", "connectivity"] },
  color: { domains: ["sensor", "text", "input_text"], keys: ["vehicle_config_exterior_color", "vehicle_config_custom_exterior_color"], aliases: ["custom_exterior_color", "exterior_color", "car_color", "paint_color"] },
  charge_port: { domains: ["cover", "binary_sensor"], keys: ["charge_state_charge_port_door_open"], aliases: ["charge_port_door", "charge_port"] },
  trunk: { domains: ["cover", "binary_sensor"], keys: ["vehicle_state_rt"], aliases: ["trunk", "rear_trunk"] },
});

const NUMERIC_ROLES = new Set(["battery", "range", "charger_power", "charge_limit", "charge_rate", "energy_added", "inside_temperature", "outside_temperature", "odometer"]);
const UNAVAILABLE = new Set(["", "unknown", "unavailable", "none", "null", "undefined"]);
const ENTITY_ID = /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/;
const own = (value, key) => value != null && Object.prototype.hasOwnProperty.call(value, key);
const slug = (value) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const tailMatches = (value, tail) => value === tail || value.endsWith(`_${tail}`);

/** Escape text at HTML interpolation boundaries; do not use this to construct URLs or CSS. */
export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

/** Strict numeric conversion; empty, booleans, nonfinite values and units are not numbers. */
export function asNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function registryArray(source) {
  if (Array.isArray(source)) return source;
  if (!source || typeof source !== "object") return [];
  return Object.entries(source).map(([entity_id, entry]) => entry && typeof entry === "object" ? { entity_id, ...entry } : null).filter(Boolean);
}

/** Merge display registry with full entries; the explicit registry wins by entity ID. */
export function registryEntries(hass, registry = []) {
  const entries = new Map();
  for (const entry of [...registryArray(hass?.entities), ...registryArray(registry)]) {
    if (ENTITY_ID.test(entry.entity_id ?? "")) entries.set(entry.entity_id, { ...entries.get(entry.entity_id), ...entry });
  }
  return [...entries.values()];
}

function roleScore(entry, role, hass) {
  const definition = ROLE_DEFINITIONS[role];
  const domain = entry.entity_id.split(".")[0];
  const domainIndex = definition.domains.indexOf(domain);
  if (domainIndex < 0) return 0;
  const translation = entry.translation_key;
  const unique = typeof entry.unique_id === "string" ? entry.unique_id : "";
  const keyIndex = definition.keys.findIndex((key) => translation === key || unique === key || unique.endsWith(`-${key}`));
  if (keyIndex >= 0) return 1000 - domainIndex * 30 - keyIndex * 5;
  // A known translation key identifying a different function must never be rescued
  // by a misleading entity ID, e.g. a charge cable lock renamed "car_lock".
  if (translation) return 0;
  const candidates = [entry.entity_id.split(".")[1], entry.original_name, entry.name, hass?.states?.[entry.entity_id]?.attributes?.friendly_name].filter(Boolean).map(slug);
  // Short aliases must not turn another control into this role when a compact
  // display registry omits translation_key and unique_id.
  if (role === "lock" && candidates.some((value) => /(?:charge|cable|speed_limit)/.test(value))) return 0;
  if (role === "climate" && candidates.some((value) => /overheat/.test(value))) return 0;
  if (role === "trunk" && candidates.some((value) => /(?:front_trunk|frunk)/.test(value))) return 0;
  const aliasIndex = definition.aliases.findIndex((alias) => candidates.some((value) => tailMatches(value, alias)));
  return aliasIndex < 0 ? 0 : 500 - domainIndex * 30 - aliasIndex * 5;
}

function deviceLabel(hass, id, entries) {
  const device = hass?.devices?.[id];
  if (device?.name_by_user || device?.name) return String(device.name_by_user || device.name);
  const battery = entries.find((entry) => roleScore(entry, "battery", hass));
  const friendly = battery && hass?.states?.[battery.entity_id]?.attributes?.friendly_name;
  return friendly ? String(friendly).replace(/\s+(?:usable\s+)?battery(?:\s+level)?$/i, "") : `Tessie vehicle · ${id.slice(0, 8)}`;
}

/**
 * Resolve a single vehicle. Automatic discovery only accepts platform === "tessie".
 * config.entities maps roles to entity IDs (null/false disables a role).
 * A known explicit vehicle entity can identify the vehicle; device_id takes priority.
 * entity_prefix is an object-ID prefix, e.g. "my_model_3" (domain optional).
 * Returns {entities, deviceId, devices:[{id,name}], status, warnings}.
 */
export function resolveEntities(hass, config = {}, registry = []) {
  const entries = registryEntries(hass, registry);
  const byId = new Map(entries.map((entry) => [entry.entity_id, entry]));
  const tessie = entries.filter((entry) => entry.platform === "tessie" && entry.device_id && !entry.disabled_by);
  const groups = new Map();
  for (const entry of tessie) {
    if (!groups.has(entry.device_id)) groups.set(entry.device_id, []);
    groups.get(entry.device_id).push(entry);
  }
  // Tessie also supports Powerwalls: never mistake their battery sensor for a car.
  const vehicles = [...groups].filter(([, group]) => group.some((entry) => ROLES.some((role) => role !== "color" && roleScore(entry, role, hass))));
  const devices = vehicles.map(([id, group]) => ({ id, name: deviceLabel(hass, id, group) })).sort((a, b) => a.name.localeCompare(b.name));
  const warnings = [];
  const entities = {};
  const explicit = config.entities && typeof config.entities === "object" && !Array.isArray(config.entities) ? config.entities : {};
  const explicitDevices = new Set();
  for (const role of ROLES) {
    if (!own(explicit, role) || explicit[role] == null || explicit[role] === false || explicit[role] === "") continue;
    if (!ENTITY_ID.test(explicit[role])) {
      warnings.push(`Invalid entity ID for ${role}.`);
      continue;
    }
    entities[role] = explicit[role];
    const device = byId.get(explicit[role])?.device_id;
    if (device && role !== "color") explicitDevices.add(device);
  }
  const result = (status, deviceId = null) => ({ entities, deviceId, devices, status, warnings });
  if (explicitDevices.size > 1) {
    for (const role of Object.keys(entities)) delete entities[role];
    warnings.push("The configured entities belong to different devices. Select entities from one vehicle.");
    return result("conflicting_entities");
  }
  let selected = typeof config.device_id === "string" && config.device_id ? config.device_id : [...explicitDevices][0] ?? null;
  if (selected && explicitDevices.size && !explicitDevices.has(selected)) {
    for (const role of Object.keys(entities)) delete entities[role];
    warnings.push("device_id and the configured vehicle entities refer to different devices.");
    return result("conflicting_entities", selected);
  }
  const prefix = typeof config.entity_prefix === "string" ? config.entity_prefix.trim().replace(/^[a-z_]+\./, "").replace(/_+$/, "") : "";
  if (!selected && prefix) {
    const matching = vehicles.filter(([, group]) => group.some((entry) => {
      const objectId = entry.entity_id.split(".")[1];
      return objectId === prefix || objectId.startsWith(`${prefix}_`);
    }));
    if (matching.length === 1) selected = matching[0][0];
    else if (matching.length > 1) {
      warnings.push("That entity_prefix matches multiple Tessie vehicles. Set device_id.");
      return result("selection_required");
    } else {
      warnings.push("No Tessie vehicle matches entity_prefix. Check the prefix or map entities explicitly.");
      return result(Object.keys(entities).length ? "manual" : "no_entities");
    }
  }
  if (!selected && vehicles.length === 1) selected = vehicles[0][0];
  if (!selected && vehicles.length > 1) {
    // Explicit helpers with no device ID do not identify which car to auto-fill.
    warnings.push("Multiple Tessie vehicles found. Set device_id or entity_prefix to select your Model 3.");
    return result("selection_required");
  }
  if (!selected) {
    if (Object.keys(entities).length) return result("manual");
    warnings.push(entries.length ? "No enabled Tessie vehicle entities were found. Add Tessie or map entities explicitly." : "Entity registry is not available. Map entities explicitly if registry access is restricted.");
    return result(entries.length ? "no_entities" : "registry_unavailable");
  }
  const scoped = groups.get(selected) ?? [];
  if (!scoped.length && !Object.keys(entities).length) {
    warnings.push("The selected Tessie device was not found in the entity registry.");
    return result("device_not_found", selected);
  }
  for (const role of ROLES) {
    if (own(explicit, role)) continue;
    const ranked = scoped.map((entry) => ({ entry, score: roleScore(entry, role, hass) })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
    if (!ranked.length) continue;
    if (ranked.length > 1 && ranked[0].score === ranked[1].score) {
      warnings.push(`More than one ${role} entity matches. Set entities.${role} explicitly.`);
      continue;
    }
    entities[role] = ranked[0].entry.entity_id;
  }
  return result(scoped.length ? "ready" : "manual", selected);
}

/** Return an immutable-by-convention reading. Unknown/unavailable are never zero. */
export function readEntity(hass, entityId) {
  const entity = typeof entityId === "string" ? hass?.states?.[entityId] : null;
  const state = entity?.state == null ? null : String(entity.state);
  const available = !!entity && state != null && !UNAVAILABLE.has(state.trim().toLowerCase());
  const numeric = available ? asNumber(state) : null;
  return {
    entityId: entityId ?? null,
    exists: !!entity,
    available,
    state,
    value: available ? numeric ?? state : null,
    numeric,
    unit: typeof entity?.attributes?.unit_of_measurement === "string" ? entity.attributes.unit_of_measurement : "",
    attributes: entity?.attributes ?? {},
    lastUpdated: entity?.last_updated ?? null,
    lastReported: entity?.last_reported ?? null,
  };
}

const COLOR_NAMES = Object.freeze({
  // Tessie's documented response uses "Pearl". OEM code/name aliases follow
  // Tesla's Vehicle and Wheel Paint Codes; RGB values remain visual approximations.
  pearl: "#edf1f3", pearlwhite: "#edf1f3", pearlwhitemulticoat: "#edf1f3", white: "#edf1f3", ppsw: "#edf1f3",
  solidblack: "#1b1d21", black: "#1b1d21", pbsb: "#1b1d21", obsidianblack: "#25272c", pmbl: "#25272c",
  midnight: "#4b525e", midnightsilver: "#4b525e", midnightsilvermetallic: "#4b525e", steelgrey: "#4b525e", steelgray: "#4b525e", pmng: "#4b525e",
  stealthgrey: "#626870", stealthgray: "#626870", pn01: "#626870",
  deepblue: "#235897", deepbluemetallic: "#235897", blue: "#235897", ppsb: "#235897",
  red: "#b92332", redmulticoat: "#b92332", ppmr: "#b92332", ultrared: "#b71e2c", pr01: "#b71e2c",
  quicksilver: "#b7bec5", pn00: "#b7bec5", silver: "#b7bec5", silvermetallic: "#b7bec5", pmss: "#b7bec5",
  midnightcherryred: "#671b2b", pr00: "#671b2b", diamondblack: "#202228", px02: "#202228",
  glacierblue: "#afc2d1", pb01: "#afc2d1", basewhite: "#f5f5f5", pbcw: "#f5f5f5",
});
const BASIC_CSS_COLORS = new Set(["aliceblue", "aqua", "aquamarine", "beige", "brown", "coral", "crimson", "cyan", "darkblue", "darkgreen", "darkred", "fuchsia", "gold", "goldenrod", "gray", "green", "grey", "indigo", "ivory", "khaki", "lavender", "lime", "magenta", "maroon", "navy", "olive", "orange", "orchid", "pink", "plum", "purple", "rebeccapurple", "salmon", "seagreen", "silver", "skyblue", "slateblue", "slategray", "slategrey", "tan", "teal", "tomato", "turquoise", "violet", "wheat", "yellow"]);

function validColor(value) {
  if (typeof value !== "string" || value.length > 120) return null;
  const input = value.trim();
  const paintKey = input.toLowerCase().replace(/[\s_-]+/g, "");
  if (own(COLOR_NAMES, paintKey)) return COLOR_NAMES[paintKey];
  if (/^#[0-9a-f]{3}$/i.test(input)) return `#${[...input.slice(1)].map((char) => char + char).join("").toLowerCase()}`;
  if (/^#[0-9a-f]{6}$/i.test(input)) return input.toLowerCase();
  // Color values may be interpolated into SVG attributes. Forbid markup, CSS
  // declarations, variables, URLs, and context-dependent CSS keywords entirely.
  if (!/^[a-zA-Z0-9#().,% /+-]+$/.test(input) || /\b(?:var|url|env|attr|currentcolor|inherit|initial|unset|revert|transparent)\b/i.test(input)) return null;
  if (typeof globalThis.CSS?.supports === "function" && globalThis.CSS.supports("color", input)) return input;
  if (BASIC_CSS_COLORS.has(input.toLowerCase())) return input.toLowerCase();
  // Non-browser tests and rendering still support conventional RGB(A)/HSL(A).
  const rgb = input.match(/^rgba?\(\s*(\d+(?:\.\d+)?)(%?)\s*,\s*(\d+(?:\.\d+)?)(%?)\s*,\s*(\d+(?:\.\d+)?)(%?)(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i);
  if (rgb && [1, 3, 5].every((index) => Number(rgb[index]) <= (rgb[index + 1] ? 100 : 255))) return input;
  const hsl = input.match(/^hsla?\(\s*[+-]?\d+(?:\.\d+)?\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i);
  if (hsl && Number(hsl[1]) <= 100 && Number(hsl[2]) <= 100) return input;
  return null;
}

/** Safe paint color. Tesla paint codes are visual approximations, not calibrated paint. */
export function normalizeColor(value, fallback = DEFAULT_CAR_COLOR) {
  return validColor(value) ?? validColor(fallback) ?? DEFAULT_CAR_COLOR;
}

/** Read a dotted own-property attribute path without evaluating templates or JavaScript. */
export function readAttribute(attributes, path) {
  if (typeof path !== "string" || !path || path.length > 200) return undefined;
  if (own(attributes, path)) return attributes[path];
  let value = attributes;
  for (const part of path.split(".")) {
    if (["__proto__", "prototype", "constructor"].includes(part) || !own(value, part)) return undefined;
    value = value[part];
  }
  return value;
}

const COLOR_PATHS = ["vehicle_config.custom_exterior_color", "vehicle_config_custom_exterior_color", "custom_exterior_color", "vehicle_config.exterior_color", "vehicle_config_exterior_color", "exterior_color", "car_color", "paint_color"];

/** Color priority: explicit source -> discovered color entity -> same-device attributes -> config fallback. */
export function resolveColor(hass, config = {}, mapping = resolveEntities(hass, config), registry = []) {
  const fallback = normalizeColor(config.car_color);
  const explicitId = typeof config.color_entity === "string" && ENTITY_ID.test(config.color_entity) ? config.color_entity : null;
  const sourceId = explicitId ?? mapping.entities.color ?? null;
  const source = readEntity(hass, sourceId);
  if (source.available) {
    const candidates = config.color_attribute ? [readAttribute(source.attributes, config.color_attribute)] : [source.state, ...COLOR_PATHS.map((path) => readAttribute(source.attributes, path))];
    for (const value of candidates) {
      const color = validColor(value);
      if (color) return { color, colorSource: sourceId, colorIsFallback: false };
    }
  }
  if (!explicitId && !config.color_attribute && mapping.deviceId) {
    for (const entry of registryEntries(hass, registry)) {
      if (entry.platform !== "tessie" || entry.device_id !== mapping.deviceId || entry.disabled_by) continue;
      const reading = readEntity(hass, entry.entity_id);
      if (!reading.available) continue;
      for (const path of COLOR_PATHS) {
        const color = validColor(readAttribute(reading.attributes, path));
        if (color) return { color, colorSource: `${entry.entity_id}:${path}`, colorIsFallback: false };
      }
    }
  }
  return { color: fallback, colorSource: config.car_color ? "car_color" : "default", colorIsFallback: true };
}

/** Tri-state normalization: unknown, transitional, or unsupported values stay null. */
export function stateBoolean(reading, positive = ["on", "true"], negative = ["off", "false"]) {
  if (!reading?.available) return null;
  const state = String(reading.state).toLowerCase();
  return positive.includes(state) ? true : negative.includes(state) ? false : null;
}

/** Read the full presentation model while preserving availability and units per metric. */
export function readVehicle(hass, config = {}, registry = []) {
  const mapping = resolveEntities(hass, config, registry);
  const values = Object.fromEntries(ROLES.map((role) => [role, readEntity(hass, mapping.entities[role])]));
  for (const role of NUMERIC_ROLES) {
    const reading = values[role];
    const number = reading.numeric;
    const invalid = number == null || ((role === "battery" || role === "charge_limit") && (number < 0 || number > 100)) || (!["inside_temperature", "outside_temperature"].includes(role) && number < 0);
    if (invalid) { reading.available = false; reading.value = null; reading.numeric = null; }
  }
  const timestamps = Object.values(values).map((reading) => reading.lastUpdated).filter((timestamp) => timestamp && Number.isFinite(Date.parse(timestamp)));
  const lastUpdated = timestamps.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  return {
    mapping, values, ...resolveColor(hass, config, mapping, registry), lastUpdated,
    charging: stateBoolean(values.charging, ["on", "true", "charging", "starting"], ["off", "false", "complete", "disconnected", "no_power", "stopped", "not_charging"]),
    online: stateBoolean(values.online, ["on", "true", "online"], ["off", "false", "offline", "asleep"]),
    locked: stateBoolean(values.lock, ["locked", "on", "true"], ["unlocked", "off", "false"]),
    sentry: stateBoolean(values.sentry),
    climateOn: stateBoolean(values.climate, ["heat", "cool", "heat_cool", "auto", "dry", "fan_only", "on"], ["off"]),
  };
}

/** Human-readable value retaining HA's chosen units; output is text, never HTML. */
export function formatValue(reading, options = {}) {
  if (!reading?.available || reading.value == null) return options.fallback ?? "—";
  const precision = Math.min(6, Math.max(0, Number.isFinite(options.precision) ? options.precision : 0));
  let text;
  if (typeof reading.value === "number") {
    try { text = new Intl.NumberFormat(options.locale, { maximumFractionDigits: precision }).format(reading.value); }
    catch { text = reading.value.toFixed(precision); }
  } else text = String(reading.value).replace(/_/g, " ");
  return options.includeUnit !== false && reading.unit ? `${text}${reading.unit === "%" ? "" : " "}${reading.unit}` : text;
}
