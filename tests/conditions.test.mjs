import assert from 'node:assert/strict';
import test from 'node:test';
import { readVehicle } from '../src/data.js';
import { DISPLAY_SECTIONS, SHOW_WHEN_OPTIONS, evaluateShowWhen, validateShowWhen } from '../src/conditions.js';

function fixture() {
  const entities = { battery: 'sensor.car_battery', charging: 'sensor.car_charging', location: 'device_tracker.car', climate: 'climate.car', lock: 'lock.car', sentry: 'switch.car_sentry' };
  const initial = { battery: '17', charging: 'charging', location: 'home', climate: 'cool', lock: 'locked', sentry: 'on' };
  const hass = { states: Object.fromEntries(Object.entries(entities).map(([role, id]) => [id, { state: initial[role], attributes: {} }])) };
  return { hass, entities, vehicle: () => readVehicle(hass, { entities }) };
}

test('exports each configurable display section and accepts the unchanged default', () => {
  assert.equal(new Set(DISPLAY_SECTIONS.map(({ key }) => key)).size, 13);
  assert.equal(new Set(SHOW_WHEN_OPTIONS.map(({ value }) => value)).size, 12);
  assert.equal(evaluateShowWhen(undefined, {}, {}), true);
  assert.equal(evaluateShowWhen('always', {}, {}), true);
  assert.equal(evaluateShowWhen('never', {}, {}), false);
  assert.doesNotThrow(() => validateShowWhen(undefined));
});

test('presets update with live Tessie telemetry and preserve unknown states', () => {
  const { hass, entities, vehicle } = fixture();
  for (const rule of ['charging', 'home', 'climate_on', 'locked', 'sentry_on', 'low_battery']) assert.equal(evaluateShowWhen(rule, hass, vehicle()), true, rule);
  for (const rule of ['not_charging', 'away', 'climate_off', 'unlocked']) assert.equal(evaluateShowWhen(rule, hass, vehicle()), false, rule);
  hass.states[entities.battery].state = '20';
  hass.states[entities.charging].state = 'stopped';
  hass.states[entities.location].state = 'work';
  hass.states[entities.climate].state = 'off';
  hass.states[entities.lock].state = 'unlocked';
  for (const rule of ['not_charging', 'away', 'climate_off', 'unlocked']) assert.equal(evaluateShowWhen(rule, hass, vehicle()), true, rule);
  assert.equal(evaluateShowWhen('low_battery', hass, vehicle()), false);
  for (const entity of Object.values(hass.states)) entity.state = 'unavailable';
  for (const { value } of SHOW_WHEN_OPTIONS.filter(({ value }) => !['always', 'never'].includes(value))) assert.equal(evaluateShowWhen(value, hass, vehicle()), false, value);
  hass.states[entities.lock].state = 'locking';
  assert.equal(evaluateShowWhen('unlocked', hass, vehicle()), false);
  assert.equal(evaluateShowWhen('locked', hass, vehicle()), false);
});

test('state conditions support entity aliases, discovered roles, arrays, and exclusion', () => {
  const { hass, entities, vehicle } = fixture();
  assert.equal(evaluateShowWhen({ condition: 'state', role: 'charging', state: ['charging', 'starting'], state_not: 'complete' }, hass, vehicle()), true);
  assert.equal(evaluateShowWhen({ condition: 'state', entity: entities.location, state: 'home', state_not: ['home', 'work'] }, hass, vehicle()), false);
  const rule = { condition: 'state', entity_id: entities.location, state_not: ['not_home', 'work'] };
  assert.equal(evaluateShowWhen(rule, hass, vehicle()), true);
  hass.states[entities.location].state = 'work';
  assert.equal(evaluateShowWhen(rule, hass, vehicle()), false);
  rule.state_not = ['not_home'];
  assert.equal(evaluateShowWhen(rule, hass, vehicle()), true);
});

test('unavailable may match explicitly only for an existing entity or role', () => {
  const { hass, entities, vehicle } = fixture();
  for (const state of ['unknown', 'unavailable']) {
    hass.states[entities.battery].state = state;
    assert.equal(evaluateShowWhen({ condition: 'state', role: 'battery', state }, hass, vehicle()), true);
    assert.equal(evaluateShowWhen({ condition: 'state', entity: entities.battery, state: [state, '10'] }, hass, vehicle()), true);
    assert.equal(evaluateShowWhen({ condition: 'state', entity: entities.battery, state_not: 'off' }, hass, vehicle()), false);
    assert.equal(evaluateShowWhen({ condition: 'state', entity: 'sensor.missing', state }, hass, vehicle()), false);
    assert.equal(evaluateShowWhen({ condition: 'state', role: 'odometer', state }, hass, vehicle()), false);
  }
  delete hass.states[entities.battery];
  assert.equal(evaluateShowWhen({ condition: 'state', role: 'battery', state: 'unavailable' }, hass, vehicle()), false);
});

test('numeric thresholds are strict, preserve zero, and reject nonnumeric telemetry', () => {
  const { hass, entities, vehicle } = fixture();
  const rule = { condition: 'numeric_state', role: 'battery', above: '0', below: 20 };
  assert.equal(evaluateShowWhen(rule, hass, vehicle()), true);
  for (const state of ['0', '20', '80%', 'unavailable', 'Infinity', '', 'NaN']) {
    hass.states[entities.battery].state = state;
    assert.equal(evaluateShowWhen(rule, hass, vehicle()), false, state);
  }
  hass.states[entities.battery].state = '0';
  assert.equal(evaluateShowWhen({ condition: 'numeric_state', entity: entities.battery, above: -1, below: '1' }, hass, vehicle()), true);
  hass.states[entities.battery].state = '-1';
  assert.equal(evaluateShowWhen('low_battery', hass, vehicle()), false);
});

test('condition lists AND together; logical NOT negates the whole conjunction', () => {
  const { hass, vehicle } = fixture();
  assert.equal(evaluateShowWhen(['home', 'charging'], hass, vehicle()), true);
  assert.equal(evaluateShowWhen(['home', 'not_charging'], hass, vehicle()), false);
  assert.equal(evaluateShowWhen({ condition: 'or', conditions: ['away', 'charging'] }, hass, vehicle()), true);
  assert.equal(evaluateShowWhen({ condition: 'and', conditions: ['home', { condition: 'not', conditions: ['away'] }] }, hass, vehicle()), true);
  assert.equal(evaluateShowWhen({ condition: 'not', conditions: ['home', 'not_charging'] }, hass, vehicle()), true);
  assert.equal(evaluateShowWhen({ condition: 'not', conditions: ['home', 'charging'] }, hass, vehicle()), false);
});

test('missing data cannot become visible through negation, but OR accepts a known match', () => {
  const { hass, entities, vehicle } = fixture();
  const missing = { condition: 'state', entity: 'binary_sensor.missing', state: 'on' };
  assert.equal(evaluateShowWhen({ condition: 'not', conditions: [missing] }, hass, vehicle()), false);
  assert.equal(evaluateShowWhen({ condition: 'or', conditions: [missing, 'home'] }, hass, vehicle()), true);
  assert.equal(evaluateShowWhen({ condition: 'and', conditions: [missing, 'home'] }, hass, vehicle()), false);
  hass.states[entities.charging].state = 'unknown';
  assert.equal(evaluateShowWhen({ condition: 'not', conditions: ['charging'] }, hass, vehicle()), false);
});

test('invalid schemas fail closed with helpful validation errors', () => {
  const { hass, entities, vehicle } = fixture();
  const bad = [null, false, true, 1, '', 'constructor', 'template', [], [{}],
    { condition: 'state', entity: entities.battery },
    { condition: 'state', entity: entities.battery, state: [] },
    { condition: 'state', entity: entities.battery, state: [80] },
    { condition: 'state', entity: entities.battery, state: '' },
    { condition: 'state', entity: 'bad id', state: 'on' },
    { condition: 'state', role: '__proto__', state: 'on' },
    { condition: 'state', role: 'battery', entity: entities.battery, state: 'on' },
    { condition: 'state', entity: entities.battery, state: '17', attribute: 'test' },
    { condition: 'numeric_state', entity: entities.battery },
    ...[true, false, '', ' ', Infinity, NaN, 'sensor.threshold'].map((below) => ({ condition: 'numeric_state', role: 'battery', below })),
    { condition: 'screen', media_query: '(max-width: 600px)' },
    { condition: 'user', users: ['me'] },
    { condition: 'template', value_template: '{{ true }}' },
    { condition: 'not', conditions: [] },
    { condition: 'or', conditions: ['always', { condition: 'bad' }] },
  ];
  for (const rule of bad) {
    assert.throws(() => validateShowWhen(rule, 'cards[0].show_when'), /cards\[0\]\.show_when/);
    assert.equal(evaluateShowWhen(rule, hass, vehicle()), false, JSON.stringify(rule));
  }
});

test('inherited keys and sparse arrays cannot supply conditions or readings', () => {
  const { hass, entities, vehicle } = fixture();
  const inheritedRule = Object.create({ condition: 'state', entity: entities.battery, state: '17' });
  assert.throws(() => validateShowWhen(inheritedRule));
  assert.equal(evaluateShowWhen(inheritedRule, hass, vehicle()), false);
  const inheritedStates = { states: Object.create(hass.states) };
  assert.equal(evaluateShowWhen({ condition: 'state', entity: entities.battery, state: '17' }, inheritedStates, {}), false);
  assert.equal(evaluateShowWhen('charging', hass, Object.create(vehicle())), false);
  assert.throws(() => validateShowWhen(new Array(1)));
  assert.throws(() => validateShowWhen({ condition: 'state', entity: entities.battery, state: new Array(1) }));
  assert.throws(() => validateShowWhen({ condition: 'not', conditions: new Array(1) }));
});

test('deep or cyclic conditions are bounded and do not overflow evaluation', () => {
  let valid = 'always';
  for (let i = 0; i < 16; i++) valid = [valid];
  assert.doesNotThrow(() => validateShowWhen(valid));
  assert.equal(evaluateShowWhen(valid, {}, {}), true);
  assert.throws(() => validateShowWhen([valid]), /at most 16/);
  const cyclic = { condition: 'not', conditions: [] };
  cyclic.conditions.push(cyclic);
  assert.throws(() => validateShowWhen(cyclic), /at most 16/);
  assert.equal(evaluateShowWhen(cyclic, {}, {}), false);
});
