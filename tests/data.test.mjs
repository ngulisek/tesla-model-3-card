import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveEntities, readVehicle, readEntity, normalizeColor, resolveColor,
  asNumber, readAttribute, escapeHTML, formatValue,
} from '../src/data.js';

function fixture() {
  const keys = { battery: 'charge_state_usable_battery_level', range: 'charge_state_battery_range', charging: 'charge_state_charging_state', climate: 'primary', lock: 'vehicle_state_locked', online: 'state' };
  const domains = { battery: 'sensor', range: 'sensor', charging: 'sensor', climate: 'climate', lock: 'lock', online: 'binary_sensor' };
  const entries = Object.keys(keys).map((role) => ({ entity_id: `${domains[role]}.renamed_${role}`, platform: 'tessie', device_id: 'car-a', unique_id: `VIN-A-${keys[role]}` }));
  const hass = { devices: { 'car-a': { name: 'My Model 3' } }, states: Object.fromEntries(entries.map((entry) => [entry.entity_id, { state: 'unavailable', attributes: {} }])) };
  const carB = { entity_id: 'sensor.second_battery', platform: 'tessie', device_id: 'car-b', translation_key: keys.battery };
  return { hass, entries, carB };
}

test('discovers renamed Tessie entities by registry keys and returns device names', () => {
  const { hass, entries } = fixture();
  const result = resolveEntities(hass, {}, entries);
  assert.equal(result.status, 'ready');
  assert.equal(result.deviceId, 'car-a');
  assert.equal(result.entities.battery, 'sensor.renamed_battery');
  assert.equal(result.entities.climate, 'climate.renamed_climate');
  assert.equal(result.devices[0].name, 'My Model 3');
  hass.entities = Object.fromEntries(entries.map(({entity_id, ...entry}) => [entity_id, entry]));
  assert.deepEqual(resolveEntities(hass).entities, result.entities);
});

test('selects exactly one vehicle and rejects explicit cross-device combinations', () => {
  const { hass, entries, carB } = fixture();
  const both = [...entries, carB];
  assert.equal(resolveEntities(hass, {}, both).status, 'selection_required');
  const selected = resolveEntities(hass, { device_id: 'car-a' }, both);
  assert.equal(selected.entities.battery, 'sensor.renamed_battery');
  assert.ok(!Object.values(selected.entities).includes(carB.entity_id));
  assert.equal(resolveEntities(hass, { entities: { battery: 'sensor.renamed_battery', range: 'sensor.second_battery' } }, both).status, 'conflicting_entities');
  assert.deepEqual(resolveEntities(hass, { device_id: 'car-b', entities: { battery: 'sensor.renamed_battery' } }, both).entities, {});
  assert.equal(resolveEntities(hass, { entities: { battery: 'sensor.renamed_battery' } }, both).deviceId, 'car-a');
  assert.equal(resolveEntities(hass, { entity_prefix: 'second' }, both).deviceId, 'car-b');
  assert.equal(resolveEntities(hass, { entity_prefix: 'sec' }, both).status, 'no_entities');
});

test('automatic discovery rejects unrelated integrations, disabled entities, and Powerwalls', () => {
  const { hass, entries, carB } = fixture();
  assert.equal(resolveEntities(hass, {}, [{ ...carB, platform: 'mqtt' }]).status, 'no_entities');
  assert.equal(resolveEntities(hass, {}, [{ ...carB, platform: undefined }]).status, 'no_entities');
  assert.equal(resolveEntities(hass, {}, [{ ...carB, disabled_by: 'user' }]).status, 'no_entities');
  assert.equal(resolveEntities(hass, {}, [{ entity_id: 'sensor.powerwall_charge', device_id: 'powerwall', platform: 'tessie', translation_key: 'percentage_charged' }]).status, 'no_entities');
  const powerwall = [
    ['battery', 'percentage_charged'], ['power', 'battery_power'], ['energy', 'energy_left'],
  ].map(([alias, key]) => ({ entity_id: `sensor.powerwall_${alias}`, device_id: 'powerwall', platform: 'tessie', translation_key: key, unique_id: `123456-${key}` }));
  const mixed = resolveEntities(hass, {}, [...entries, ...powerwall]);
  assert.equal(mixed.deviceId, 'car-a');
  assert.equal(mixed.devices.length, 1);
  assert.ok(Object.values(mixed.entities).every((id) => !id.includes('powerwall')));
  assert.equal(resolveEntities(hass).status, 'registry_unavailable');
  assert.equal(resolveEntities(hass, { entities: { battery: 'sensor.manual_battery' } }).status, 'manual');
});

test('honors disabled roles, refuses ambiguous mappings, and excludes lookalike controls', () => {
  const { hass, entries } = fixture();
  assert.equal(resolveEntities(hass, { entities: { battery: false } }, entries).entities.battery, undefined);
  assert.equal(resolveEntities(hass, {}, [...entries, { ...entries[0], entity_id: 'sensor.duplicate_battery' }]).entities.battery, undefined);
  const entry = (entity_id) => [{ entity_id, platform: 'tessie', device_id: 'car-a' }];
  assert.equal(resolveEntities(hass, { device_id: 'car-a' }, entry('lock.car_charge_cable_lock')).entities.lock, undefined);
  assert.equal(resolveEntities(hass, { device_id: 'car-a' }, entry('climate.car_overheat_climate')).entities.climate, undefined);
  assert.equal(resolveEntities(hass, { device_id: 'car-a' }, entry('cover.car_front_trunk')).entities.trunk, undefined);
});

test('preserves zero and units while leaving unknown and transitional states unknown', () => {
  const { hass, entries } = fixture();
  hass.states['sensor.renamed_battery'] = { state: '0', attributes: { unit_of_measurement: '%' } };
  hass.states['sensor.renamed_range'] = { state: 'unknown', attributes: { unit_of_measurement: 'km' } };
  let vehicle = readVehicle(hass, {}, entries);
  assert.equal(vehicle.values.battery.value, 0);
  assert.equal(vehicle.values.battery.available, true);
  assert.equal(vehicle.values.range.value, null);
  assert.equal(vehicle.values.range.available, false);
  assert.equal(vehicle.charging, null);
  assert.equal(vehicle.online, null);
  assert.equal(vehicle.locked, null);
  assert.equal(vehicle.climateOn, null);
  assert.equal(formatValue(vehicle.values.battery), '0%');
  assert.equal(formatValue(vehicle.values.range), '—');
  hass.states['sensor.renamed_charging'].state = 'complete';
  hass.states['lock.renamed_lock'].state = 'locking';
  hass.states['binary_sensor.renamed_online'].state = 'off';
  vehicle = readVehicle(hass, {}, entries);
  assert.equal(vehicle.charging, false);
  assert.equal(vehicle.locked, null);
  assert.equal(vehicle.online, false);
  hass.states['sensor.renamed_battery'].state = '101';
  assert.equal(readVehicle(hass, {}, entries).values.battery.available, false);
  for (const value of ['', false, 'Infinity', '80%']) assert.equal(asNumber(value), null);
  assert.equal(asNumber('0'), 0);
  assert.equal(asNumber('-4.5'), -4.5);
  assert.equal(readEntity(hass, 'sensor.missing').exists, false);
});

test('normalizes valid paint and rejects CSS/HTML injection and invalid numeric colors', () => {
  assert.equal(normalizeColor('#AbC'), '#aabbcc');
  assert.equal(normalizeColor('Deep Blue Metallic'), '#235897');
  assert.equal(normalizeColor('Pearl'), '#edf1f3');
  assert.equal(normalizeColor('PPSW'), '#edf1f3');
  for (const [code, name] of [['PN01', 'Stealth Gray'], ['PMSS', 'Silver'], ['PX02', 'Diamond Black'], ['PB01', 'Glacier Blue'], ['PN00', 'Quicksilver']]) {
    assert.equal(normalizeColor(code), normalizeColor(name));
  }
  assert.equal(normalizeColor('rgb(12, 30, 255)'), 'rgb(12, 30, 255)');
  for (const value of ['constructor', 'rgb(400, 0, 0)', 'red" onload="alert(1)', 'var(--theme)', 'url(https://example.com)', 'red; background: url(x)', 'currentColor']) {
    assert.equal(normalizeColor(value, '#123456'), '#123456');
  }
  assert.equal(readAttribute({}, '__proto__.polluted'), undefined);
  assert.equal(escapeHTML('<img x="1">'), '&lt;img x=&quot;1&quot;&gt;');
});

test('the official Tessie REST example exterior_color Pearl renders as pearl white', () => {
  // Paint excerpt from https://developer.tessie.com/reference/get-vehicle.
  const response = { vehicle_config: { exterior_color: 'Pearl' } };
  // Equivalent output of examples/tessie-color-sensor.yaml's value_template.
  const paint = response.vehicle_config.exterior_color.trim();
  const hass = { states: { 'sensor.model_3_exterior_color': { state: paint, attributes: {} } } };
  const vehicle = readVehicle(hass, { color_entity: 'sensor.model_3_exterior_color', car_color: '#687583' });
  assert.equal(vehicle.color, '#edf1f3');
  assert.equal(vehicle.colorSource, 'sensor.model_3_exterior_color');
  assert.equal(vehicle.colorIsFallback, false);
});

test('explicit color sources and nested own-property attributes update safely', () => {
  const { hass } = fixture();
  hass.states['sensor.paint'] = { state: 'online', attributes: { vehicle_config: { exterior_color: 'DeepBlue' } } };
  const config = { color_entity: 'sensor.paint', color_attribute: 'vehicle_config.exterior_color', car_color: '#112233' };
  const result = resolveColor(hass, config);
  assert.equal(result.color, '#235897');
  assert.equal(result.colorIsFallback, false);
  hass.states['sensor.paint'].attributes.vehicle_config.exterior_color = '#85a';
  assert.equal(resolveColor(hass, config).color, '#8855aa');
  hass.states['sensor.paint'].state = 'unavailable';
  assert.equal(resolveColor(hass, config).color, '#112233');
});

test('automatic paint is limited to the selected Tessie device and enabled available entities', () => {
  const { hass, entries, carB } = fixture();
  const registry = [...entries, carB];
  hass.states[carB.entity_id] = { state: '75', attributes: { vehicle_config: { exterior_color: '#ff0000' } } };
  const config = { device_id: 'car-a', car_color: '#112233' };
  assert.equal(readVehicle(hass, config, registry).color, '#112233');
  assert.equal(readVehicle(hass, { car_color: '#112233' }, registry).color, '#112233');
  hass.states['sensor.renamed_battery'] = { state: '80', attributes: { vehicle_config: { exterior_color: '#0099aa' } } };
  assert.equal(readVehicle(hass, config, registry).color, '#0099aa');
  assert.equal(readVehicle(hass, { device_id: 'car-b' }, registry).color, '#ff0000');
  hass.states['sensor.renamed_battery'].state = 'unavailable';
  assert.equal(readVehicle(hass, config, registry).color, '#112233');
  const disabled = { entity_id: 'sensor.disabled_paint_source', platform: 'tessie', device_id: 'car-a', disabled_by: 'user' };
  hass.states[disabled.entity_id] = { state: 'online', attributes: { exterior_color: '#00ff00' } };
  assert.equal(readVehicle(hass, config, [...registry, disabled]).color, '#112233');
});
