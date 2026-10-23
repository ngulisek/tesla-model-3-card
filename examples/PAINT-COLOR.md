# Automatic paint color

The card accepts `color_entity` for automatic color updates and `car_color` for a fixed color or fallback. Color is applied to the built-in vehicle illustration; it does not recolor a custom photograph.

Home Assistant's Tessie integration supplies the vehicle's normal dashboard data, but its documented entities do not include an exterior-color sensor. Use the optional server-side REST sensor in `tessie-color-sensor.yaml` to expose Tessie's documented `vehicle_config.exterior_color` field. The endpoint is `GET https://api.tessie.com/{vin}/state?use_cache=true`. The example requests cached state once an hour and sends no vehicle commands. [Tessie Get Vehicle](https://developer.tessie.com/reference/get-vehicle), [Home Assistant Tessie integration](https://www.home-assistant.io/integrations/tessie/).

## Set up the optional sensor

1. On the Home Assistant server, add the two placeholder entries shown at the top of `tessie-color-sensor.yaml` to `secrets.yaml`. Replace the VIN and access-token placeholders. The authorization secret must contain the entire value `Bearer YOUR_TOKEN`, including `Bearer` and the space.
2. Merge the sensor example into `configuration.yaml`. If a `sensor:` section already exists, append its list item there; do not create a duplicate top-level key. Keep an existing `!include` arrangement if your setup uses one.
3. Check Home Assistant's configuration, then restart. Find the resulting entity under **Settings → Devices & services → Entities**. Its expected ID is `sensor.model_3_exterior_color`; use the actual ID if Home Assistant assigned a suffix.
4. Add the following options to the dashboard card:

```yaml
type: custom:tesla-model-3-card
color_entity: sensor.model_3_exterior_color
car_color: "#687583"
```

The token remains in Home Assistant's server configuration. It is never passed to the card, saved as an entity attribute, or put in a browser URL. Home Assistant supports `!secret` for the Authorization header. [RESTful Sensor documentation](https://www.home-assistant.io/integrations/sensor.rest/).

The sensor contains only the exterior paint code, not the complete vehicle response. A missing or empty paint field makes it unavailable, so the card can use `car_color`. A failed request also cannot provide new paint data. An hourly cadence is intentional because paint changes rarely; increase `scan_interval` to `86400` for daily checks if preferred.

## Custom wraps and Tesla Colorizer

Automatic import of the factory exterior paint code is supported by the documented API. Automatic import of an arbitrary custom color selected in Tesla's Colorizer or the Tessie app is **not verified**: Tessie's published state schema does not document `vehicle_state.vehicle_color`, and its top-level `color` string has no documented custom-color semantics. This example therefore does not guess at either field. [Tessie state schema](https://developer.tessie.com/reference/get-vehicle).

For a custom wrap, set the card color directly:

```yaml
car_color: "#35A7A0"
```

Remove `color_entity` for a fixed override. If `color_entity` remains configured, a usable value from that entity takes precedence over `car_color`.

To change custom paint from Home Assistant and have the card follow it automatically, create a **Text helper** named **Model 3 Paint Color** in **Settings → Devices & services → Helpers**. Set its value to a six-digit hex color, such as `#35A7A0`, then use its actual entity ID:

```yaml
type: custom:tesla-model-3-card
color_entity: input_text.model_3_paint_color
car_color: "#687583"
cards:
  - type: entities
    title: Personalize
    entities:
      - entity: input_text.model_3_paint_color
        name: Wrap color
```

This helper stays in Home Assistant and can be updated there or by your own automation. It does not synchronize changes back to Tesla or Tessie. The `cards` example places the helper inside the vehicle card.

If an existing entity exposes a verified paint value in an attribute, point the card at that attribute instead:

```yaml
color_entity: sensor.your_existing_paint_sensor
color_attribute: hex
car_color: "#687583"
```

`sensor.your_existing_paint_sensor` and `hex` are placeholders for an entity and attribute you already have; they are not supplied by the native Tessie integration.

API and integration documentation reviewed October 23, 2026. No live vehicle or Home Assistant instance was accessed to create this example.
