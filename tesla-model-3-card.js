/* Tesla Model 3 Card v1.1.0 • Local assets; Home Assistant entities only. */
/**
 * Pure Home Assistant / Tessie adapter. No requests, commands, credentials, or DOM writes.
 * Keys follow Home Assistant's Tessie entity descriptions (2026-10); user overrides
 * always take precedence. Registry data can come from hass.entities or from
 * hass.callWS({type: "config/entity_registry/list"}), performed by the card itself.
 */

const DEFAULT_CAR_COLOR = "#bdc4ce";
const ROLES = Object.freeze([
  "battery", "range", "charging", "charger_power", "charge_limit", "charge_rate",
  "energy_added", "inside_temperature", "outside_temperature", "lock", "climate",
  "sentry", "location", "odometer", "online", "color", "charge_port", "trunk",
]);

// Domain and key order are deliberate: charging sensor before binary sensor;
// rated range before estimates; the primary cabin climate before overheat protection.
const ROLE_DEFINITIONS = Object.freeze({
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
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

/** Strict numeric conversion; empty, booleans, nonfinite values and units are not numbers. */
function asNumber(value) {
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
function registryEntries(hass, registry = []) {
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
function resolveEntities(hass, config = {}, registry = []) {
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
function readEntity(hass, entityId) {
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
function normalizeColor(value, fallback = DEFAULT_CAR_COLOR) {
  return validColor(value) ?? validColor(fallback) ?? DEFAULT_CAR_COLOR;
}

/** Read a dotted own-property attribute path without evaluating templates or JavaScript. */
function readAttribute(attributes, path) {
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
function resolveColor(hass, config = {}, mapping = resolveEntities(hass, config), registry = []) {
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
function stateBoolean(reading, positive = ["on", "true"], negative = ["off", "false"]) {
  if (!reading?.available) return null;
  const state = String(reading.state).toLowerCase();
  return positive.includes(state) ? true : negative.includes(state) ? false : null;
}

/** Read the full presentation model while preserving availability and units per metric. */
function readVehicle(hass, config = {}, registry = []) {
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
function formatValue(reading, options = {}) {
  if (!reading?.available || reading.value == null) return options.fallback ?? "—";
  const precision = Math.min(6, Math.max(0, Number.isFinite(options.precision) ? options.precision : 0));
  let text;
  if (typeof reading.value === "number") {
    try { text = new Intl.NumberFormat(options.locale, { maximumFractionDigits: precision }).format(reading.value); }
    catch { text = reading.value.toFixed(precision); }
  } else text = String(reading.value).replace(/_/g, " ");
  return options.includeUnit !== false && reading.unit ? `${text}${reading.unit === "%" ? "" : " "}${reading.unit}` : text;
}



/** Display rules are data only. They never evaluate templates or JavaScript. */
const DISPLAY_SECTIONS = Object.freeze([
  { key: 'car', label: 'Car illustration' },
  { key: 'location', label: 'Location' },
  { key: 'lock', label: 'Lock status' },
  { key: 'sentry', label: 'Sentry status' },
  { key: 'climate', label: 'Climate status' },
  { key: 'battery', label: 'Battery' },
  { key: 'range', label: 'Range' },
  { key: 'charging', label: 'Charging' },
  { key: 'inside_temperature', label: 'Inside temperature' },
  { key: 'outside_temperature', label: 'Outside temperature' },
  { key: 'charger_power', label: 'Charger power' },
  { key: 'footer', label: 'Update footer' },
  { key: 'nested', label: 'Nested cards' },
]);

const SHOW_WHEN_OPTIONS = Object.freeze([
  { value: 'always', label: 'Always' },
  { value: 'never', label: 'Never' },
  { value: 'charging', label: 'While charging' },
  { value: 'not_charging', label: 'While not charging' },
  { value: 'home', label: 'While at home' },
  { value: 'away', label: 'While away' },
  { value: 'climate_on', label: 'While climate is on' },
  { value: 'climate_off', label: 'While climate is off' },
  { value: 'locked', label: 'While locked' },
  { value: 'unlocked', label: 'While unlocked' },
  { value: 'sentry_on', label: 'While Sentry is on' },
  { value: 'low_battery', label: 'When battery is below 20%' },
]);

const CONDITION_PRESETS = new Set(SHOW_WHEN_OPTIONS.map(({ value }) => value));
const CONDITION_ROLES = new Set(ROLES);
const CONDITION_ENTITY_ID = /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/;
const CONDITION_UNAVAILABLE = new Set(['', 'unknown', 'unavailable', 'none', 'null', 'undefined']);
const CONDITION_MAX_DEPTH = 16;
const conditionOwn = (value, key) => value != null && Object.prototype.hasOwnProperty.call(value, key);
const conditionGet = (value, key) => conditionOwn(value, key) ? value[key] : undefined;

function conditionError(path, message) {
  throw new Error(`${path}: ${message}`);
}

function conditionAllowedKeys(rule, allowed, path) {
  for (const key of Object.keys(rule)) {
    if (!allowed.includes(key)) conditionError(path, `unsupported option "${key}".`);
  }
}

function conditionValidateStates(value, path) {
  const values = Array.isArray(value) ? value : [value];
  if (!values.length) conditionError(path, 'use a nonempty state string or an array of nonempty state strings.');
  for (let index = 0; index < values.length; index++) {
    if (!conditionOwn(values, index) || typeof values[index] !== 'string' || !values[index].length) {
      conditionError(path, 'use a nonempty state string or an array of nonempty state strings.');
    }
  }
}

function conditionValidateSource(rule, path) {
  const keys = ['entity', 'entity_id', 'role'].filter((key) => conditionOwn(rule, key));
  if (keys.length !== 1) conditionError(path, 'provide exactly one entity, entity_id, or Tessie role.');
  const key = keys[0];
  const value = rule[key];
  if (key === 'role') {
    if (!CONDITION_ROLES.has(value)) conditionError(`${path}.role`, 'use a supported Tessie role.');
  } else if (typeof value !== 'string' || !CONDITION_ENTITY_ID.test(value)) {
    conditionError(`${path}.${key}`, 'use a Home Assistant entity ID such as sensor.model_3_battery.');
  }
}

function conditionValidate(rule, path, depth) {
  if (depth > CONDITION_MAX_DEPTH) conditionError(path, `conditions may be nested at most ${CONDITION_MAX_DEPTH} levels.`);
  if (rule === undefined && depth === 0) return;
  if (typeof rule === 'string') {
    if (!CONDITION_PRESETS.has(rule)) conditionError(path, `unknown display preset "${rule}".`);
    return;
  }
  if (Array.isArray(rule)) {
    if (!rule.length) conditionError(path, 'provide at least one condition.');
    for (let index = 0; index < rule.length; index++) {
      if (!conditionOwn(rule, index)) conditionError(`${path}[${index}]`, 'missing condition.');
      conditionValidate(rule[index], `${path}[${index}]`, depth + 1);
    }
    return;
  }
  if (!rule || typeof rule !== 'object') conditionError(path, 'use a display preset, condition object, or array of conditions.');
  const kind = conditionGet(rule, 'condition');
  if (['and', 'or', 'not'].includes(kind)) {
    conditionAllowedKeys(rule, ['condition', 'conditions'], path);
    const children = conditionGet(rule, 'conditions');
    if (!Array.isArray(children) || !children.length) conditionError(`${path}.conditions`, 'provide a nonempty array of conditions.');
    for (let index = 0; index < children.length; index++) {
      if (!conditionOwn(children, index)) conditionError(`${path}.conditions[${index}]`, 'missing condition.');
      conditionValidate(children[index], `${path}.conditions[${index}]`, depth + 1);
    }
    return;
  }
  if (kind === 'state') {
    conditionAllowedKeys(rule, ['condition', 'entity', 'entity_id', 'role', 'state', 'state_not'], path);
    conditionValidateSource(rule, path);
    if (!conditionOwn(rule, 'state') && !conditionOwn(rule, 'state_not')) conditionError(path, 'provide state or state_not.');
    for (const key of ['state', 'state_not']) {
      if (conditionOwn(rule, key)) conditionValidateStates(rule[key], `${path}.${key}`);
    }
    return;
  }
  if (kind === 'numeric_state') {
    conditionAllowedKeys(rule, ['condition', 'entity', 'entity_id', 'role', 'above', 'below'], path);
    conditionValidateSource(rule, path);
    if (!conditionOwn(rule, 'above') && !conditionOwn(rule, 'below')) conditionError(path, 'provide above or below.');
    for (const key of ['above', 'below']) {
      if (conditionOwn(rule, key) && asNumber(rule[key]) === null) conditionError(`${path}.${key}`, 'use a finite numeric threshold.');
    }
    return;
  }
  conditionError(path, 'supported condition types: state, numeric_state, and, or, not. Templates, screen, and user conditions are not supported.');
}

/** Reject configuration mistakes early, with a path suitable for the HA editor. */
function validateShowWhen(rule, path = 'show_when') {
  conditionValidate(rule, path, 0);
}

function conditionReading(rule, hass, vehicle) {
  if (conditionOwn(rule, 'role')) {
    const reading = conditionGet(conditionGet(vehicle, 'values'), rule.role);
    if (!reading || conditionGet(reading, 'exists') !== true) return null;
    const state = conditionGet(reading, 'state');
    if (state == null) return null;
    return { state: String(state), available: conditionGet(reading, 'available') === true };
  }
  const entityId = conditionGet(rule, 'entity') ?? conditionGet(rule, 'entity_id');
  const entity = conditionGet(conditionGet(hass, 'states'), entityId);
  const state = conditionGet(entity, 'state');
  if (state == null) return null;
  const text = String(state);
  return { state: text, available: !CONDITION_UNAVAILABLE.has(text.trim().toLowerCase()) };
}

function conditionStateMatches(expected, state) {
  return (Array.isArray(expected) ? expected : [expected]).includes(state);
}

// Preserve unknown through negation: missing telemetry never becomes "not off".
function conditionEvery(results) {
  if (results.includes(false)) return false;
  return results.includes(null) ? null : true;
}

function conditionSome(results) {
  if (results.includes(true)) return true;
  return results.includes(null) ? null : false;
}

function conditionPreset(rule, vehicle) {
  if (rule === undefined || rule === 'always') return true;
  if (rule === 'never') return false;
  const booleanPreset = {
    charging: ['charging', true], not_charging: ['charging', false],
    climate_on: ['climateOn', true], climate_off: ['climateOn', false],
    locked: ['locked', true], unlocked: ['locked', false], sentry_on: ['sentry', true],
  };
  if (conditionOwn(booleanPreset, rule)) {
    const [key, expected] = booleanPreset[rule];
    const value = conditionGet(vehicle, key);
    return typeof value === 'boolean' ? value === expected : null;
  }
  const values = conditionGet(vehicle, 'values');
  if (rule === 'home' || rule === 'away') {
    const location = conditionGet(values, 'location');
    if (conditionGet(location, 'available') !== true) return null;
    const state = conditionGet(location, 'state');
    if (typeof state !== 'string' || CONDITION_UNAVAILABLE.has(state.trim().toLowerCase())) return null;
    return rule === 'home' ? state === 'home' : state !== 'home';
  }
  if (rule === 'low_battery') {
    const battery = conditionGet(values, 'battery');
    const value = asNumber(conditionGet(battery, 'value'));
    if (conditionGet(battery, 'available') !== true || value === null || value < 0 || value > 100) return null;
    return value < 20;
  }
  return null;
}

function conditionEvaluate(rule, hass, vehicle) {
  if (rule === undefined || typeof rule === 'string') return conditionPreset(rule, vehicle);
  if (Array.isArray(rule)) return conditionEvery(rule.map((child) => conditionEvaluate(child, hass, vehicle)));
  if (['and', 'or', 'not'].includes(rule.condition)) {
    const results = rule.conditions.map((child) => conditionEvaluate(child, hass, vehicle));
    if (rule.condition === 'or') return conditionSome(results);
    const result = conditionEvery(results);
    return rule.condition === 'not' && result !== null ? !result : result;
  }
  const reading = conditionReading(rule, hass, vehicle);
  if (!reading) return null;
  if (rule.condition === 'state') {
    if (!reading.available && !(conditionOwn(rule, 'state') &&
      ['unknown', 'unavailable'].includes(reading.state) && conditionStateMatches(rule.state, reading.state))) return null;
    return (!conditionOwn(rule, 'state') || conditionStateMatches(rule.state, reading.state)) &&
      (!conditionOwn(rule, 'state_not') || !conditionStateMatches(rule.state_not, reading.state));
  }
  if (!reading.available) return null;
  const value = asNumber(reading.state);
  if (value === null) return null;
  return (!conditionOwn(rule, 'above') || value > asNumber(rule.above)) &&
    (!conditionOwn(rule, 'below') || value < asNumber(rule.below));
}

/** Evaluate fresh HA state each time. Invalid rules and unresolved data stay hidden. */
function evaluateShowWhen(rule, hass, vehicle) {
  try {
    validateShowWhen(rule);
    return conditionEvaluate(rule, hass, vehicle) === true;
  } catch {
    return false;
  }
}


/** Original, recolorable Model 3 illustration. No external image requests. */
function carSVG() {
  return `<svg class="car-art" viewBox="0 0 700 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="model3-art-title">
    <title id="model3-art-title">Model 3 illustration</title>
    <defs>
      <linearGradient id="m3-body-light" x1="0" y1="0" x2="0.18" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".62"/>
        <stop offset=".28" stop-color="#fff" stop-opacity=".17"/>
        <stop offset=".54" stop-color="#fff" stop-opacity="0"/>
        <stop offset=".8" stop-color="#000" stop-opacity=".2"/>
        <stop offset="1" stop-color="#000" stop-opacity=".58"/>
      </linearGradient>
      <linearGradient id="m3-side-light" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".24"/>
        <stop offset=".15" stop-color="#fff" stop-opacity=".02"/>
        <stop offset=".52" stop-color="#000" stop-opacity=".12"/>
        <stop offset=".76" stop-color="#fff" stop-opacity=".15"/>
        <stop offset="1" stop-color="#000" stop-opacity=".24"/>
      </linearGradient>
      <linearGradient id="m3-glass" x1=".1" y1="0" x2=".8" y2="1">
        <stop offset="0" stop-color="#607780"/>
        <stop offset=".37" stop-color="#25343d"/>
        <stop offset=".68" stop-color="#142129"/>
        <stop offset="1" stop-color="#080e13"/>
      </linearGradient>
      <linearGradient id="m3-glass-reflection" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#d3e8ed" stop-opacity=".45"/>
        <stop offset=".52" stop-color="#b2d5dd" stop-opacity=".03"/>
        <stop offset="1" stop-color="#b2d5dd" stop-opacity=".1"/>
      </linearGradient>
      <linearGradient id="m3-hood" x1=".2" y1="0" x2=".5" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".28"/>
        <stop offset=".66" stop-color="#fff" stop-opacity=".04"/>
        <stop offset="1" stop-color="#000" stop-opacity=".15"/>
      </linearGradient>
      <linearGradient id="m3-dark-trim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#263238"/>
        <stop offset=".45" stop-color="#11171c"/>
        <stop offset="1" stop-color="#060a0d"/>
      </linearGradient>
      <linearGradient id="m3-rim-metal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#b1bdc4"/>
        <stop offset=".3" stop-color="#64737e"/>
        <stop offset=".55" stop-color="#d6dce1"/>
        <stop offset="1" stop-color="#3c4852"/>
      </linearGradient>
      <radialGradient id="m3-tire">
        <stop offset=".6" stop-color="#11161a"/>
        <stop offset=".81" stop-color="#20262c"/>
        <stop offset=".95" stop-color="#080c10"/>
        <stop offset="1" stop-color="#030608"/>
      </radialGradient>
      <radialGradient id="m3-rim">
        <stop offset="0" stop-color="#555f68"/>
        <stop offset=".35" stop-color="#222c35"/>
        <stop offset=".81" stop-color="#121b22"/>
        <stop offset="1" stop-color="#4a5761"/>
      </radialGradient>
      <radialGradient id="m3-ground">
        <stop offset="0" stop-color="#000" stop-opacity=".7"/>
        <stop offset=".65" stop-color="#000" stop-opacity=".27"/>
        <stop offset="1" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="m3-headlight" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#c8efff"/>
        <stop offset=".34" stop-color="#fff"/>
        <stop offset="1" stop-color="#a8c0ce"/>
      </linearGradient>
      <filter id="m3-light-bloom" x="-40%" y="-100%" width="180%" height="300%">
        <feGaussianBlur stdDeviation="2.5"/>
      </filter>
      <path id="m3-body-shape" d="M93 186c7-12 20-20 42-25l86-17 41-36c22-19 59-27 104-25 49 2 89 12 115 33l45 31c37 4 58 15 67 31 7 13 10 26 6 40l-23 11-6-1c1-31-17-54-43-54-28 0-47 24-46 56l-242 1c1-32-17-55-45-55-28 0-47 24-47 53l-28-3c-18-2-29-10-31-20-1-7 0-14 5-20Z"/>
      <g id="m3-wheel">
        <ellipse cx="0" cy="0" rx="38" ry="40" fill="url(#m3-tire)"/>
        <ellipse cx="0" cy="0" rx="35" ry="37" fill="none" stroke="#81909b" stroke-opacity=".12" stroke-width="1"/>
        <ellipse cx="0" cy="0" rx="28.5" ry="30" fill="url(#m3-rim)" stroke="#7c8b95" stroke-width="1.3"/>
        <ellipse cx="0" cy="0" rx="23" ry="24" fill="#121a20"/>
        <ellipse cx="0" cy="0" rx="19" ry="20" fill="none" stroke="#76808a" stroke-opacity=".3" stroke-width="5"/>
        <path d="M15-17c4 3 7 7 8 13l-6 1c-1-4-2-7-5-10Z" fill="#69757e"/>
        <g fill="url(#m3-rim-metal)">
          <path d="M-4-6-12-25l7-3L3-9 2-3Z"/>
          <path d="M-4-6-12-25l7-3L3-9 2-3Z" transform="rotate(72)"/>
          <path d="M-4-6-12-25l7-3L3-9 2-3Z" transform="rotate(144)"/>
          <path d="M-4-6-12-25l7-3L3-9 2-3Z" transform="rotate(216)"/>
          <path d="M-4-6-12-25l7-3L3-9 2-3Z" transform="rotate(288)"/>
          <path d="M2-7 7-28l5 2L8-5 3 1Z"/>
          <path d="M2-7 7-28l5 2L8-5 3 1Z" transform="rotate(72)"/>
          <path d="M2-7 7-28l5 2L8-5 3 1Z" transform="rotate(144)"/>
          <path d="M2-7 7-28l5 2L8-5 3 1Z" transform="rotate(216)"/>
          <path d="M2-7 7-28l5 2L8-5 3 1Z" transform="rotate(288)"/>
        </g>
        <circle r="7.4" fill="#77848e"/>
        <circle r="5.8" fill="#26333d"/>
        <circle cy="-3.7" r=".7" fill="#c8d0d4"/>
        <circle cx="3.5" cy="-1.2" r=".7" fill="#c8d0d4"/>
        <circle cx="2.2" cy="3" r=".7" fill="#c8d0d4"/>
        <circle cx="-2.2" cy="3" r=".7" fill="#c8d0d4"/>
        <circle cx="-3.5" cy="-1.2" r=".7" fill="#c8d0d4"/>
        <circle r="1.8" fill="#b0bac1"/>
        <path d="M-24-18a30 30 0 0 1 46 0" fill="none" stroke="#e9f0f4" stroke-opacity=".28" stroke-width=".8"/>
      </g>
    </defs>

    <ellipse cx="347" cy="251" rx="285" ry="24" fill="url(#m3-ground)"/>
    <path d="m122 219 57 18 361-1 45-15-7-21-446-1Z" fill="#05090c"/>

    <use href="#m3-wheel" transform="translate(194 217)"/>
    <use href="#m3-wheel" transform="translate(527 214) scale(.97)"/>

    <use href="#m3-body-shape" fill="var(--car-paint, #d5dbe1)"/>
    <use href="#m3-body-shape" fill="url(#m3-body-light)"/>

    <!-- The continuous glass roof and slim window surrounds. -->
    <path d="m227 144 39-33c23-20 56-26 98-25 47 2 87 11 112 31l43 29c-102 1-198 1-292-2Z" fill="#080e13"/>
    <path d="m236 141 36-31c23-16 54-22 91-20 43 2 79 9 104 28l37 25-268-2Z" fill="url(#m3-glass)"/>
    <path d="m238 139 35-29c20-14 47-20 78-20l-25 51Z" fill="url(#m3-glass-reflection)"/>
    <path d="m335 140 21-50 14 1-11 50Z" fill="#0b1218"/>
    <path d="m361 141 11-50c40 3 72 10 94 27l32 24Z" fill="url(#m3-glass-reflection)" opacity=".45"/>
    <path d="m446 106 12 37 9 .1-12-32Z" fill="#0b1218"/>
    <path d="m267 108 69-14c40-4 82 2 116 14" fill="none" stroke="#e8f4f7" stroke-opacity=".3" stroke-width="1.2"/>
    <path d="m231 144 289 2" fill="none" stroke="#02070b" stroke-width="3.2"/>
    <path d="m230 147 289 2" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".8"/>

    <!-- Hood, fender, doors, and the subtle lower reflected horizon. -->
    <path d="m100 181 37-17 86-18 66 8-47 16-96 11Z" fill="url(#m3-hood)"/>
    <path d="M111 179c58-2 102-9 135-18l256-4c40 0 67 3 84 11-39-7-79-8-115-6l-232 7c-49 10-95 13-128 10Z" fill="#fff" opacity=".27"/>
    <path d="M242 169c79-7 174-8 259-7-17 15-24 34-24 58l-231 3c0-21-3-39-4-54Z" fill="url(#m3-side-light)"/>
    <path d="M247 215c71-7 149-10 227-8l-2 11-224 6Z" fill="#fff" opacity=".09"/>
    <path d="M243 225c74 0 152-2 235-4l1 7-237 2Z" fill="#080f14" opacity=".69"/>
    <path d="m252 226 218-3" fill="none" stroke="#d6e1e8" stroke-opacity=".28" stroke-width="1"/>
    <path d="M289 149c-6 19-11 42-9 65 0 5 4 8 10 8m69-73-3 71m110-70c12 21 14 39 11 63" fill="none" stroke="#051018" stroke-opacity=".43" stroke-width="1.1"/>
    <path d="m292 151-7 34m75-34-2 64m111-61 5 15" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width=".7"/>
    <path d="m318 162 21-.6" stroke="#111e27" stroke-width="3.2" stroke-linecap="round"/>
    <path d="m319 161.5 18-.5" stroke="#e5edf1" stroke-opacity=".46" stroke-width=".8" stroke-linecap="round"/>
    <path d="m433 160 20 .1" stroke="#111e27" stroke-width="3.1" stroke-linecap="round"/>
    <path d="m434 159.6 17 .1" stroke="#e5edf1" stroke-opacity=".46" stroke-width=".8" stroke-linecap="round"/>

    <!-- Body-color mirror with a black base. -->
    <path d="m275 147 10 11-17 4-9-10Z" fill="#050c11"/>
    <path d="M255 144c2-4 8-5 13-3l15 6c2 2 1 5-2 6l-21 1c-5 0-8-6-5-10Z" fill="var(--car-paint, #d5dbe1)"/>
    <path d="M255 144c2-4 8-5 13-3l15 6-25 2Z" fill="#fff" opacity=".3"/>
    <path d="m257 152 23-1" stroke="#0b171f" stroke-width="2.3" stroke-linecap="round"/>

    <!-- Sculpted wheel arches sit just above the tire shoulders. -->
    <path d="M147 226c0-31 19-52 47-52s46 21 46 54M481 227c-1-31 18-54 46-54 27 0 44 22 44 51" fill="none" stroke="#071016" stroke-opacity=".48" stroke-width="2.5"/>
    <path d="M151 196c8-17 24-26 43-26 21 0 37 10 44 29m247-5c9-16 23-24 42-24 17 0 31 8 39 22" fill="none" stroke="#fff" stroke-opacity=".24" stroke-width="1.1"/>

    <!-- Front fascia: slender lamps and a low, understated intake. -->
    <path d="m104 180 14-10 42-4-12 12-31 7Z" fill="#101e28"/>
    <path d="m111 177 12-4 30-3-7 5-28 5Z" fill="url(#m3-headlight)"/>
    <path d="m112 177 37-5" stroke="#c9f1ff" stroke-opacity=".6" stroke-width="3" filter="url(#m3-light-bloom)"/>
    <path d="m111 177 37-5" stroke="#f3fbff" stroke-width="1.3" stroke-linecap="round"/>
    <path d="m99 189 28 1 12-4" fill="none" stroke="#fff" stroke-opacity=".26" stroke-width="1"/>
    <path d="M91 204c13 6 29 7 48 6l-2 10c-16-1-29-3-39-7Z" fill="url(#m3-dark-trim)"/>
    <path d="m98 205 38 7" stroke="#475b68" stroke-opacity=".5" stroke-width=".8"/>
    <path d="m126 191 7 0-1 12-6-1Z" fill="#12202a" opacity=".78"/>
    <path d="M92 215c14 10 34 11 52 12" fill="none" stroke="#02070b" stroke-width="2"/>
    <path d="m164 164 47-10 28 2" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".9"/>

    <!-- Rear quarter, lamp, charging door, and bumper trim. -->
    <path d="m530 149 44 10 13 9-49-11Z" fill="#fff" opacity=".16"/>
    <path d="m572 165 16 5 6 10-19-6Z" fill="#320b14"/>
    <path d="m575 168 13 4 3 4-15-5Z" fill="#ed4d5a"/>
    <path d="m577 168 11 4" stroke="#ffb0b2" stroke-opacity=".6" stroke-width="1"/>
    <path d="m552 157 13 3 4 11-14-2Z" fill="none" stroke="#07121a" stroke-opacity=".42" stroke-width=".8"/>
    <path d="m580 214 18-7-1 9-20 9Z" fill="url(#m3-dark-trim)"/>
    <path d="m582 202 12-4" stroke="#c6424a" stroke-width="2" stroke-linecap="round"/>
    <path d="m531 148 47 13" fill="none" stroke="#06121b" stroke-opacity=".42" stroke-width=".8"/>
  </svg>`;
}



class TeslaModel3CardEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({mode: 'open'}); }
  setConfig(config) { this._config = {...config}; this._render(); }
  set hass(hass) { this._hass = hass; if (this._form) this._form.hass = hass; }

  _notifyConfig() {
    this.dispatchEvent(new CustomEvent('config-changed', {detail:{config:this._config},bubbles:true,composed:true}));
  }

  _createChoice(labelText, id, onChange) {
    const row = document.createElement('div');
    row.className = 'visibility-row';
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = labelText;
    const select = document.createElement('select');
    select.id = id;
    for (const preset of SHOW_WHEN_OPTIONS) {
      const option = document.createElement('option');
      option.value = preset.value;
      option.textContent = preset.label;
      select.append(option);
    }
    const custom = document.createElement('option');
    custom.value = '__custom__';
    custom.textContent = 'Custom conditions (YAML)';
    custom.disabled = true;
    custom.hidden = true;
    select.append(custom);
    select.addEventListener('change', () => {
      if (select.value !== '__custom__') onChange(select.value);
    });
    row.append(label, select);
    return {row, label, select, custom};
  }

  _syncChoice(choice, rule) {
    const value = rule == null ? 'always' : rule;
    const known = typeof value === 'string' && SHOW_WHEN_OPTIONS.some(option => option.value === value);
    choice.custom.hidden = known;
    const selected = known ? value : '__custom__';
    if (choice.select.value !== selected) choice.select.value = selected;
  }

  _setDisplayRule(key, rule) {
    const display = {...this._config.display};
    if (rule === 'always') delete display[key];
    else display[key] = rule;
    const next = {...this._config};
    if (Object.keys(display).length) next.display = display;
    else delete next.display;
    this._config = next;
    this._notifyConfig();
  }

  _setNestedRule(index, rule) {
    const cards = [...(this._config.cards || [])];
    const current = cards[index];
    if (!current || typeof current !== 'object' || Array.isArray(current)) return;
    const card = {...current};
    if (rule === 'always') delete card.show_when;
    else card.show_when = rule;
    cards[index] = card;
    this._config = {...this._config, cards};
    this._notifyConfig();
  }

  _syncVisibility() {
    for (const [key, choice] of this._displayChoices) {
      this._syncChoice(choice, this._config.display?.[key]);
    }
    const cards = Array.isArray(this._config.cards) ? this._config.cards : [];
    while (this._nestedChoices.length > cards.length) this._nestedChoices.pop().row.remove();
    cards.forEach((card, index) => {
      let choice = this._nestedChoices[index];
      if (!choice) {
        choice = this._createChoice('', `nested-visibility-${index}`, value => this._setNestedRule(index, value));
        choice.select.dataset.nestedIndex = String(index);
        this._nestedChoices.push(choice);
        this._nestedList.append(choice.row);
      }
      const name = card?.title || card?.name || card?.type || 'Untitled card';
      const label = `${index + 1}. ${name}`;
      if (choice.label.textContent !== label) choice.label.textContent = label;
      choice.select.disabled = !card || typeof card !== 'object' || Array.isArray(card);
      this._syncChoice(choice, card?.show_when);
    });
    this._nestedEmpty.hidden = cards.length > 0;
  }

  _render() {
    if (!this._config) return;
    if (!this._form) {
      this.shadowRoot.innerHTML = `<style>
        :host{display:block}p{color:var(--secondary-text-color);line-height:1.5;margin:16px 0}code{font-size:13px}
        details{margin:16px 0;border:1px solid var(--divider-color,#d8d8d8);border-radius:12px;padding:0 16px}
        summary{font-weight:600;cursor:pointer;padding:16px 0;color:var(--primary-text-color)}
        summary:focus-visible,select:focus-visible{outline:2px solid var(--primary-color,#03a9f4);outline-offset:3px}
        .visibility-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,1fr);gap:12px;align-items:center;margin:0 0 16px}
        label{color:var(--primary-text-color);line-height:1.4;overflow-wrap:anywhere}
        select{box-sizing:border-box;width:100%;min-height:44px;border:1px solid var(--divider-color,#999);border-radius:8px;padding:10px;color:var(--primary-text-color);background:var(--card-background-color,#fff);font:inherit}
        [hidden]{display:none!important}
        @media(max-width:400px){.visibility-row{grid-template-columns:1fr;gap:6px}}
      </style>
      <ha-form></ha-form>
      <p>Leave the vehicle empty to discover a single Tessie vehicle automatically. Use a device when you have more than one.</p>
      <details id="built-in-visibility"><summary>Built-in visibility</summary><p>Choose when each section appears. Rules follow the discovered vehicle automatically. The detail stats switch above still controls cabin, outside and charger stats.</p><div class="built-in-list"></div></details>
      <details id="nested-card-visibility"><summary>Nested card visibility</summary><p>Choose when each nested card appears. The nested section must also be visible and expanded. Advanced conditions are preserved and can be edited in YAML.</p><div class="nested-list"></div><p class="nested-empty">Add cards under <code>cards:</code> in the YAML editor to choose their visibility here.</p></details>
      <p>Add any Home Assistant cards in the YAML editor under <code>cards:</code>. For custom rules, use <code>display:</code> for built-in sections or <code>show_when:</code> on a nested card. Map renamed or unusual entities under <code>entities:</code>. Color follows the selected color entity; the paint color above is its fallback.</p>`;
      this._form = this.shadowRoot.querySelector('ha-form');
      this._form.computeLabel = field => ({name:'Card title',subtitle:'Subtitle',device_id:'Tessie vehicle (optional)',entity_prefix:'Entity prefix (optional)',car_color:'Fallback paint color (hex or Tesla color name)',color_entity:'Automatic paint color entity (optional)',color_attribute:'Color attribute path (optional)',theme:'Appearance',image:'Custom car image URL (optional)',show_details:'Show cabin, outside and charging stats',show_nested:'Show nested cards by default',nested_title:'Nested cards section title'}[field.name] || field.name);
      this._form.schema = [
        {name:'name',selector:{text:{}}},
        {name:'device_id',selector:{device:{integration:'tessie'}}},
        {name:'entity_prefix',selector:{text:{}}},
        {name:'car_color',selector:{text:{}}},
        {name:'color_entity',selector:{entity:{}}},
        {name:'color_attribute',selector:{text:{}}},
        {name:'theme',selector:{select:{options:[{value:'dark',label:'Midnight'},{value:'light',label:'Pearl'},{value:'auto',label:'Follow Home Assistant'}]}}},
        {name:'show_details',selector:{boolean:{}}},
        {name:'show_nested',selector:{boolean:{}}},
        {name:'nested_title',selector:{text:{}}},
        {name:'image',selector:{text:{}}},
        {name:'subtitle',selector:{text:{}}}
      ];
      this._form.addEventListener('value-changed', event => {
        event.stopPropagation();
        this._config = {...this._config,...event.detail.value};
        this._notifyConfig();
      });
      this._displayChoices = new Map();
      const builtInList = this.shadowRoot.querySelector('.built-in-list');
      for (const section of DISPLAY_SECTIONS) {
        const choice = this._createChoice(section.label, `display-visibility-${section.key}`, value => this._setDisplayRule(section.key, value));
        choice.select.dataset.displayKey = section.key;
        this._displayChoices.set(section.key, choice);
        builtInList.append(choice.row);
      }
      this._nestedChoices = [];
      this._nestedList = this.shadowRoot.querySelector('.nested-list');
      this._nestedEmpty = this.shadowRoot.querySelector('.nested-empty');
    }
    this._form.hass = this._hass;
    const data = {car_color:'#d6d9dc',theme:'dark',show_details:true,show_nested:true};
    for (const {name} of this._form.schema) {
      if (Object.prototype.hasOwnProperty.call(this._config, name)) data[name] = this._config[name];
    }
    const signature = JSON.stringify(data);
    if (signature !== this._formDataSignature) {
      this._form.data = data;
      this._formDataSignature = signature;
    }
    this._syncVisibility();
  }
}
if (!customElements.get('tesla-model-3-card-editor')) customElements.define('tesla-model-3-card-editor',TeslaModel3CardEditor);






const TM3_ICONS = {
  pin:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  climate:'<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4m10 14-1-4 4-1M4 14l4 1-1 4M17 5l-1 4 4 1"/>',
  bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/>',
  thermometer:'<path d="M9 14.5V5a3 3 0 0 1 6 0v9.5a5 5 0 1 1-6 0Z"/><path d="M12 8v10"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  chevron:'<path d="m8 10 4 4 4-4"/>',
  arrow:'<path d="M6 18 18 6M6 6h12v12"/>',
  battery:'<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 10v4M5 10v4m3-4v4m3-4v4"/>'
};
function tm3Icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TM3_ICONS[name] || ''}</svg>`; }
const tm3Registries = new WeakMap();
const tm3Styles = `
:host{display:block;min-width:0;--tm3-accent:#b4ef8a;--tm3-ink:#f1f2f1;--tm3-muted:#a0a6a8;--tm3-dim:#777f83;--tm3-line:#ffffff14;--tm3-panel:#ffffff06;--tm3-bg:#181b1d;--tm3-inset:#111517;--tm3-radius:28px;font-family:var(--paper-font-body1_-_font-family,Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif)}
*{box-sizing:border-box}button,select{font:inherit}button{color:inherit;cursor:pointer}button:disabled{cursor:default}button:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--tm3-accent);outline-offset:4px}svg{width:20px;height:20px;flex-shrink:0}button{border:0;background:none}ha-card{display:block;position:relative;background:var(--tm3-bg);color:var(--tm3-ink);border:1px solid var(--tm3-line);border-radius:var(--tm3-radius);overflow:hidden;box-shadow:0 12px 44px #00000018;container-type:inline-size}.body{padding:28px 28px 24px}.header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.brand{font-size:10px;font-weight:650;letter-spacing:.34em;color:var(--tm3-muted);line-height:1.5}.brand span{letter-spacing:.12em;opacity:.6;margin-left:10px;padding-left:12px;border-left:1px solid var(--tm3-line)}h2{font-size:28px;font-weight:500;letter-spacing:-1px;margin:7px 0 5px;line-height:1.2;overflow-wrap:anywhere}.subtitle{font-size:12px;color:var(--tm3-muted);line-height:1.5;margin:0}.location{display:flex;align-items:center;gap:6px;padding:9px 11px;border:1px solid var(--tm3-line);background:var(--tm3-panel);border-radius:20px;font-size:11px;margin-top:3px;max-width:45%;min-width:0}.location svg{width:13px;height:13px}.location span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.visual{position:relative;margin:8px -20px -7px;isolation:isolate}.visual:before{content:'';position:absolute;inset:12% 18% 2%;z-index:-1;background:radial-gradient(ellipse,#ffffff09,transparent 68%)}.car-art{display:block;width:100%;height:auto}.custom-image{display:block;width:100%;height:auto;max-height:250px;object-fit:contain}.paint-caption{display:flex;justify-content:center;align-items:center;gap:6px;font-size:10px;letter-spacing:.045em;color:var(--tm3-dim);margin-top:-9px;position:relative}.paint-dot{height:6px;width:6px;border:1px solid #ffffff50;border-radius:50%;background:var(--car-paint)}.security{display:flex;align-items:center;justify-content:center;gap:20px;margin:19px 0 24px}.security button{display:flex;align-items:center;gap:6px;padding:5px 0;font-size:11px;color:var(--tm3-muted);min-height:32px}.security svg{height:15px;width:15px}.security button[data-active=true]{color:var(--tm3-accent)}.security button:disabled{opacity:.48}.energy{padding-top:22px;border-top:1px solid var(--tm3-line)}.readings{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.reading{padding:0;text-align:left;min-width:0}.reading:last-child{text-align:right}.label{display:block;font-size:10px;font-weight:500;letter-spacing:.09em;text-transform:uppercase;color:var(--tm3-muted);margin-bottom:6px}.number{font-size:43px;font-weight:400;letter-spacing:-2px;line-height:1.08;font-variant-numeric:tabular-nums}.unit{font-size:18px;color:var(--tm3-muted);font-weight:400;letter-spacing:-.3px;margin-left:4px}.range-number{font-size:30px;letter-spacing:-1px;padding-top:10px;display:inline-block}.range-unit{font-size:14px}.battery-track{height:5px;background:var(--tm3-line);position:relative;border-radius:3px;margin:20px 0 12px}.battery-fill{height:100%;background:var(--tm3-accent);border-radius:3px;transition:width .5s ease}.battery-fill.low{background:#f0ac73}.limit-marker{position:absolute;top:-3px;height:11px;width:2px;background:var(--tm3-muted);opacity:.7}.charge-row{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:11px;color:var(--tm3-muted)}.charge-status{display:flex;gap:6px;align-items:center}.charge-status svg{width:14px;height:14px}.charge-status[data-active=true]{color:var(--tm3-accent)}.target{padding:0;font-size:11px;color:var(--tm3-muted)}.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:24px}.stat{padding:14px 10px;background:var(--tm3-panel);border:1px solid var(--tm3-line);border-radius:14px;text-align:left;min-width:0}.stat>svg{color:var(--tm3-muted);width:17px;height:17px;margin-bottom:11px}.stat-label{display:block;color:var(--tm3-muted);font-size:10px;margin-bottom:5px}.stat-value{display:block;font-size:17px;font-weight:500;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.stat-unit{font-size:12px;color:var(--tm3-muted);margin-left:3px}.footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:20px;font-size:10px;color:var(--tm3-dim)}.connection{display:flex;align-items:center;gap:6px}.connection-dot{width:5px;height:5px;border-radius:50%;background:var(--tm3-dim)}.connection[data-active=true] .connection-dot{background:var(--tm3-accent)}.notice{font-size:12px;color:var(--tm3-muted);line-height:1.6;padding:13px 15px;background:var(--tm3-panel);border:1px solid var(--tm3-line);border-radius:12px;margin:18px 0 6px;overflow-wrap:anywhere}.vehicle-picker{display:flex;align-items:center;gap:10px;font-size:12px;margin-top:18px}.vehicle-picker select{background:var(--tm3-inset);color:var(--tm3-ink);border:1px solid var(--tm3-line);padding:9px;border-radius:8px;max-width:100%;min-width:0;flex:1}.nested{border-top:1px solid var(--tm3-line);background:var(--tm3-inset)}summary{list-style:none;display:flex;align-items:center;justify-content:space-between;padding:18px 28px;cursor:pointer;font-size:12px;color:var(--tm3-muted)}summary::-webkit-details-marker{display:none}summary svg{width:16px;height:16px;transition:transform .2s}details[open] summary svg{transform:rotate(180deg)}.nested-content{display:grid;gap:12px;padding:0 16px 16px}.nested-content>*{min-width:0;--ha-card-border-radius:16px}.nested-content.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.nested-error{padding:16px;font-size:12px;color:var(--tm3-muted)}[hidden]{display:none!important}
:host([appearance=light]){--tm3-accent:#376c32;--tm3-ink:#20282c;--tm3-muted:#626d74;--tm3-dim:#747e83;--tm3-line:#23313c15;--tm3-panel:#ffffff88;--tm3-bg:#f2f4f3;--tm3-inset:#e8eeeb}:host([appearance=light]) .visual:before{background:radial-gradient(ellipse,#ffffffdd,transparent 68%)}:host([appearance=light]) .paint-dot{border-color:#0003}
@container(max-width:380px){.body{padding:22px 20px 20px}h2{font-size:26px}.brand span{display:none}.security{gap:14px;margin:15px 0 19px}.security button{font-size:10px}.stat{padding:12px 9px}.number{font-size:39px}.range-number{font-size:28px}.stats{gap:6px}.footer{font-size:9px}.nested-content.grid{grid-template-columns:1fr}summary{padding:18px 20px}}
@media(pointer:coarse){.security button{min-height:44px}.location,.target{min-height:44px}summary{min-height:48px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
`;

class TeslaModel3Card extends HTMLElement {
  static getConfigElement() { return document.createElement('tesla-model-3-card-editor'); }
  static getStubConfig() { return {type:'custom:tesla-model-3-card',name:'Model 3',theme:'dark',car_color:'#d6d9dc'}; }
  constructor() {
    super(); this.attachShadow({mode:'open'}); this._children = []; this._revision = 0; this._registry = [];
  }
  setConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('A card configuration is required.');
    if (config.cards !== undefined && (!Array.isArray(config.cards) || config.cards.some(c => !c || typeof c.type !== 'string'))) throw new Error('cards must be a list of Home Assistant card configurations with a type.');
    if (config.entities && (typeof config.entities !== 'object' || Array.isArray(config.entities))) throw new Error('entities must map a role to an entity ID.');
    if(config.display!==undefined){
      if(!config.display||typeof config.display!=='object'||Array.isArray(config.display))throw new Error('display must map a built-in section to a visibility rule.');
      const keys=new Set(DISPLAY_SECTIONS.map(section=>section.key));
      for(const [key,rule]of Object.entries(config.display)){if(!keys.has(key))throw new Error(`Unknown display section: ${key}`);validateShowWhen(rule,`display.${key}`);}
    }
    (config.cards||[]).forEach((card,index)=>validateShowWhen(Object.prototype.hasOwnProperty.call(card,'show_when')?card.show_when:undefined,`cards[${index}].show_when`));
    this._config = {theme:'dark',show_details:true,show_nested:true,nested_title:'Your garage',...config,...(config.display?{display:{...config.display}}:{}),...(config.cards?{cards:config.cards.map(card=>({...card}))}:{})};
    this._selectedDevice = null; this._revision++; this._signature = ''; this._mount(); this._configureImage(); this._createChildren(); this._update();
  }
  set hass(hass) {
    this._hass = hass;
    this._loadRegistry(); this._update();
    for (const card of this._children) card.hass = hass;
  }
  connectedCallback() { this._update(); if (!this._timer) this._timer = setInterval(()=>this._update(),60000); }
  disconnectedCallback() { clearInterval(this._timer); this._timer = null; }
  getCardSize() { return Math.ceil(this.getBoundingClientRect().height / 50) || 12 + (this._config?.cards?.length || 0) * 3; }
  getGridOptions() { return {columns:12,rows:'auto',min_columns:6}; }
  _mount() {
    if (this._mounted) return;
    this.shadowRoot.innerHTML = `<style>${tm3Styles}</style><ha-card><div class="body">
      <div class="header"><div><div class="brand">TESLA<span>TESSIE</span></div><h2 id="name">Model 3</h2><p class="subtitle" id="subtitle">Electric, every day.</p></div><button type="button" class="location" data-role="location" aria-label="View vehicle location">${tm3Icon('pin')}<span id="location">—</span></button></div>
      <label class="vehicle-picker" hidden>Vehicle<select aria-label="Choose Tessie vehicle"></select></label><div class="notice" role="status" hidden></div>
      <div class="visual"><div class="art">${carSVG()}</div><img class="custom-image" alt="Your Model 3" hidden></div><div class="paint-caption"><span class="paint-dot"></span><span id="paint-label">CUSTOM PAINT</span></div>
      <div class="security"><button type="button" data-role="lock">${tm3Icon('lock')}<span id="locked">Lock unknown</span></button><button type="button" data-role="sentry">${tm3Icon('shield')}<span id="sentry">Sentry unknown</span></button><button type="button" data-role="climate">${tm3Icon('climate')}<span id="climate">Climate unknown</span></button></div>
      <div class="energy"><div class="readings"><button type="button" class="reading" data-role="battery"><span class="label">Battery</span><span class="number" id="battery">—</span><span class="unit">%</span></button><button type="button" class="reading" data-role="range"><span class="label">Estimated range</span><span class="number range-number" id="range">—</span><span class="unit range-unit" id="range-unit"></span></button></div>
      <div class="battery-track" role="progressbar" aria-label="Battery charge" aria-valuemin="0" aria-valuemax="100"><div class="battery-fill"></div><div class="limit-marker" hidden></div></div>
      <div class="charge-row"><span class="charge-status">${tm3Icon('bolt')}<span id="charging">Charging state unknown</span></span><button type="button" class="target" data-role="charge_limit" id="limit">Target —</button></div></div>
      <div class="stats"><button type="button" class="stat" data-role="inside_temperature">${tm3Icon('thermometer')}<span class="stat-label">Cabin</span><span class="stat-value"><span id="inside">—</span><span class="stat-unit" id="inside-unit"></span></span></button><button type="button" class="stat" data-role="outside_temperature">${tm3Icon('sun')}<span class="stat-label">Outside</span><span class="stat-value"><span id="outside">—</span><span class="stat-unit" id="outside-unit"></span></span></button><button type="button" class="stat" data-role="charger_power">${tm3Icon('bolt')}<span class="stat-label">Charge power</span><span class="stat-value"><span id="power">—</span><span class="stat-unit" id="power-unit"></span></span></button></div>
      <div class="footer"><span class="connection"><span class="connection-dot"></span><span id="connection">Waiting for Tessie</span></span><span id="updated"></span></div>
    </div><details class="nested" hidden><summary><span id="nested-title">Your garage</span>${tm3Icon('chevron')}</summary><div class="nested-content"></div></details></ha-card>`;
    this._mounted = true;
    this.shadowRoot.addEventListener('click',event => {
      const button = event.target.closest?.('button[data-role]');
      if (!button || button.disabled) return;
      const entityId = this._vehicle?.mapping.entities[button.dataset.role];
      if (entityId) this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId},bubbles:true,composed:true}));
    });
    this.shadowRoot.querySelector('select').addEventListener('change',event => {this._selectedDevice = event.target.value || null;this._signature='';this._update();});
  }
  _text(id,text) { const el = this.shadowRoot.getElementById(id); if (el) el.textContent = text; }
  _loadRegistry() {
    if (!this._hass || !this._hass.callWS) return;
    const key = this._hass.connection || this._hass;
    if(this._registryKey!==key){this._registryKey=key;this._registry=[];this._registryLoaded=false;this._registryLoading=false;this._registryRetryAt=0;}
    if(this._registryLoading||this._registryLoaded||Date.now()<(this._registryRetryAt||0))return;
    this._registryLoading = true;
    const hass=this._hass;
    let request = tm3Registries.get(key);
    if (!request) { request = Promise.resolve().then(()=>hass.callWS({type:'config/entity_registry/list'})); tm3Registries.set(key,request); }
    request.then(registry=>{
      if(this._registryKey!==key)return;
      this._registry=Array.isArray(registry)?registry:[];this._registryLoaded=true;
    },()=>{
      if(tm3Registries.get(key)===request)tm3Registries.delete(key);
      if(this._registryKey!==key)return;
      this._registryLoaded=false;this._registryRetryAt=Date.now()+30000;
    }).finally(()=>{if(this._registryKey===key){this._registryLoading=false;this._signature='';this._update();}});
  }
  _configureImage() {
    const img = this.shadowRoot.querySelector('.custom-image'),art = this.shadowRoot.querySelector('.art');
    const path = this._config.image;
    const valid = typeof path === 'string' && (/^https:\/\//i.test(path) || /^\/(?!\/)/.test(path));
    img.hidden = !valid; art.hidden = valid;
    if (valid) {img.onerror=()=>{img.hidden=true;art.hidden=false;}; img.src=path;} else img.removeAttribute('src');
  }
  _update() {
    if (!this._config || !this._mounted || !this._hass) return;
    const config = this._selectedDevice ? {...this._config,device_id:this._selectedDevice} : this._config;
    const vehicle = readVehicle(this._hass,config,this._registry); this._vehicle = vehicle;
    this._updateVisibility(vehicle);
    const dark = config.theme === 'auto' ? this._hass.themes?.darkMode !== false : config.theme !== 'light';
    this.setAttribute('appearance',dark?'dark':'light');
    const signature = JSON.stringify([vehicle,config,Math.floor(Date.now()/60000),dark]);
    if (signature === this._signature) return;
    this._signature = signature;
    const v = vehicle.values;
    const numeric = (role,digits=0) => {const n=v[role]?.value;return typeof n==='number'&&Number.isFinite(n)?new Intl.NumberFormat(this._hass.locale?.language||'en',{maximumFractionDigits:digits}).format(n):'—';};
    const readable = (role,fallback='—') => {
      const reading=v[role]; if (!reading?.available) return fallback;
      try {return this._hass.formatEntityState?.(this._hass.states[reading.entityId]) || reading.state.replaceAll('_',' ');} catch {return reading.state.replaceAll('_',' ');}
    };
    this.style.setProperty('--car-paint',vehicle.color);
    this._text('name',config.name || 'Model 3');
    this._text('subtitle',config.subtitle || 'Electric, every day.');
    this._text('location',readable('location','Location unknown'));
    this._text('paint-label',vehicle.colorIsFallback ? 'CUSTOM PAINT' : 'VEHICLE PAINT');
    this._text('locked',vehicle.locked === null ? 'Lock unknown' : vehicle.locked?'Locked':'Unlocked');
    this._text('sentry',vehicle.sentry === null ? 'Sentry unknown' : vehicle.sentry?'Sentry on':'Sentry off');
    this._text('climate',vehicle.climateOn === null ? 'Climate unknown' : vehicle.climateOn?'Climate on':'Climate off');
    this._text('battery',numeric('battery'));this._text('range',numeric('range'));this._text('range-unit',v.range?.unit || '');
    for (const [role,id] of [['inside_temperature','inside'],['outside_temperature','outside'],['charger_power','power']]) {this._text(id,numeric(role,1));this._text(`${id}-unit`,v[role]?.unit || '');}
    const battery=typeof v.battery?.value==='number'?Math.min(100,Math.max(0,v.battery.value)):null;
    const track=this.shadowRoot.querySelector('.battery-track'),fill=this.shadowRoot.querySelector('.battery-fill');
    fill.style.width=`${battery??0}%`;fill.classList.toggle('low',battery!==null&&battery<20);
    if (battery===null) {track.removeAttribute('aria-valuenow');track.setAttribute('aria-valuetext','Battery unavailable');} else {track.setAttribute('aria-valuenow',battery);track.setAttribute('aria-valuetext',`${battery}%`);}
    const limit=v.charge_limit?.value,marker=this.shadowRoot.querySelector('.limit-marker');
    marker.hidden=typeof limit!=='number'; if (!marker.hidden) marker.style.left=`${Math.min(100,Math.max(0,limit))}%`;
    this._text('limit',typeof limit==='number'?`Target ${numeric('charge_limit')}%`:'Target —');
    this._text('charging',vehicle.charging===true?'Charging':readable('charging','Charging state unknown'));
    this.shadowRoot.querySelector('.charge-status').dataset.active=vehicle.charging===true;
    for (const button of this.shadowRoot.querySelectorAll('button[data-role]')) {button.disabled=!v[button.dataset.role]?.available;button.title=button.disabled?'Entity unavailable':'Open entity details';}
    for (const [role,value] of [['lock',vehicle.locked],['sentry',vehicle.sentry],['climate',vehicle.climateOn]]) this.shadowRoot.querySelector(`[data-role=${role}]`).dataset.active=value===true;
    const hasData=Object.entries(v).some(([role,r])=>role!=='color'&&r?.available);
    const state=vehicle.online;
    this._text('connection',hasData?(state===true?'Tessie · vehicle online':state===false?'Tessie · asleep / offline':'Entity data · status unknown'):'Waiting for Tessie');
    this.shadowRoot.querySelector('.connection').dataset.active=hasData&&state!==false;
    const timestamp=vehicle.lastUpdated?new Date(vehicle.lastUpdated):null;
    this._text('updated',timestamp&&!Number.isNaN(timestamp.getTime())?`Entity updated ${timestamp.toLocaleTimeString(this._hass.locale?.language||'en',{hour:'numeric',minute:'2-digit'})}`:'');
    const notice=this.shadowRoot.querySelector('.notice');
    const messages={selection_required:'Choose your Tessie vehicle. Save a permanent selection in the card editor.',registry_unavailable:'Discovering Tessie entities. If registry access is restricted, map entities explicitly in YAML under entities.',no_entities:'No Tessie vehicle entities found. Add the Tessie integration in Settings → Devices & services.',device_not_found:'This vehicle was not found. Choose a Tessie device in the card editor.',conflicting_entities:'The selected entities belong to different vehicles. Map entities from a single vehicle.'};
    const warnings=vehicle.mapping.warnings||[];
    notice.textContent=messages[vehicle.mapping.status] || warnings.join(' ');notice.hidden=!notice.textContent;
    const devices=vehicle.mapping.devices||[],picker=this.shadowRoot.querySelector('.vehicle-picker'),select=picker.querySelector('select');
    picker.hidden=devices.length<2||Boolean(this._config.device_id)||Boolean(this._config.entity_prefix);
    const deviceSignature=JSON.stringify(devices);
    if (select.dataset.devices!==deviceSignature) {select.replaceChildren(new Option('Choose your vehicle',''),...devices.map(d=>new Option(d.name||d.id,d.id)));select.dataset.devices=deviceSignature;}
    select.value=config.device_id||vehicle.mapping.deviceId||'';
    this._text('nested-title',config.nested_title);
  }
  _updateVisibility(vehicle=this._vehicle) {
    if(!this._mounted||!this._config)return;
    const display=this._config.display||{};
    const visible=Object.fromEntries(DISPLAY_SECTIONS.map(({key})=>[key,evaluateShowWhen(display[key],this._hass,vehicle)]));
    const setHidden=(selector,show)=>{this.shadowRoot.querySelector(selector).hidden=!show;};
    setHidden('.visual',visible.car);setHidden('.paint-caption',visible.car);
    setHidden('[data-role=location]',visible.location);
    for(const role of ['lock','sentry','climate','battery','range','inside_temperature','outside_temperature','charger_power'])setHidden(`[data-role=${role}]`,visible[role]);
    setHidden('.security',['lock','sentry','climate'].some(role=>visible[role]));
    setHidden('.readings',visible.battery||visible.range);setHidden('.battery-track',visible.battery);
    setHidden('.charge-row',visible.charging);setHidden('.energy',visible.battery||visible.range||visible.charging);
    const count=['inside_temperature','outside_temperature','charger_power'].filter(role=>visible[role]).length;
    setHidden('.stats',this._config.show_details&&count>0);
    this.shadowRoot.querySelector('.stats').style.gridTemplateColumns=`repeat(${Math.max(1,count)},minmax(0,1fr))`;
    setHidden('.footer',visible.footer);
    const childVisibility=(this._config.cards||[]).map(config=>evaluateShowWhen(config.show_when,this._hass,vehicle));
    this._children.forEach((card,index)=>{card.hidden=!childVisibility[index];});
    setHidden('.nested',visible.nested&&childVisibility.some(Boolean));
    const signature=JSON.stringify([visible,childVisibility,this._config.show_details]);
    if(signature!==this._visibilitySignature){this._visibilitySignature=signature;this.dispatchEvent(new CustomEvent('card-updated',{bubbles:true,composed:true}));}
  }
  async _createChildren() {
    const revision=this._revision;
    const section=this.shadowRoot.querySelector('.nested'),content=this.shadowRoot.querySelector('.nested-content');
    this._children=[];content.replaceChildren();section.hidden=!this._config.cards?.length;section.open=this._config.show_nested;
    content.classList.toggle('grid',this._config.cards_layout==='grid');
    if (section.hidden) return;
    try {
      if (typeof window.loadCardHelpers !== 'function') throw new Error('Home Assistant card helpers are unavailable.');
      const helpers=await window.loadCardHelpers();
      if (revision!==this._revision) return;
      this._config.cards.forEach((config,index)=>{const card=this._makeChild(config,helpers,index,revision);this._children[index]=card;content.append(card);});
      this._updateVisibility();
    } catch (error) {if(revision!==this._revision)return;const message=document.createElement('div');message.className='nested-error';message.textContent=error.message;content.append(message);}
  }
  _makeChild(config,helpers,index,revision,rebuilds=0) {
    try {
      if(rebuilds>3) throw new Error('This child repeatedly requested a rebuild. Check its configuration or resource.');
      const {show_when,...childConfig}=config;
      const card=helpers.createCardElement(childConfig);
      const current=()=>revision===this._revision&&this._children[index]===card;
      card.addEventListener('ll-rebuild',event=>{
        event.stopPropagation();
        queueMicrotask(()=>{
          if(!current())return;
          const replacement=this._makeChild(config,helpers,index,revision,rebuilds+1);
          this._children[index]=replacement;card.replaceWith(replacement);
          this._updateVisibility();
          this.dispatchEvent(new CustomEvent('card-updated',{bubbles:true,composed:true}));
        });
      },{once:true});
      card.addEventListener('ll-upgrade',event=>{
        event.stopPropagation();
        // Home Assistant fires this before finishing the lazy element's setConfig.
        queueMicrotask(()=>{if(current()){if(this._hass)card.hass=this._hass;this.dispatchEvent(new CustomEvent('card-updated',{bubbles:true,composed:true}));}});
      },{once:true});
      if(this._hass)card.hass=this._hass;
      return card;
    } catch(error) {
      const message=document.createElement('div');message.className='nested-error';message.textContent=`Could not load nested card: ${error.message}`;return message;
    }
  }
}
if (!customElements.get('tesla-model-3-card')) customElements.define('tesla-model-3-card',TeslaModel3Card);
window.customCards=window.customCards||[];
if (!window.customCards.some(card=>card.type==='tesla-model-3-card')) window.customCards.push({type:'tesla-model-3-card',name:'Tesla Model 3',description:'A live Tessie vehicle card with custom paint and nested Home Assistant cards.',preview:true});
