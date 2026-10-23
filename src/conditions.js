import { ROLES, asNumber } from './data.js';

/** Display rules are data only. They never evaluate templates or JavaScript. */
export const DISPLAY_SECTIONS = Object.freeze([
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

export const SHOW_WHEN_OPTIONS = Object.freeze([
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
export function validateShowWhen(rule, path = 'show_when') {
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
export function evaluateShowWhen(rule, hass, vehicle) {
  try {
    validateShowWhen(rule);
    return conditionEvaluate(rule, hass, vehicle) === true;
  } catch {
    return false;
  }
}
