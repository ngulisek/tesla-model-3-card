# Tesla Model 3 card

A standalone Home Assistant dashboard card with Tessie entity discovery, a recolorable vehicle illustration, battery and range readings, vehicle status, and a collapsible area for other cards. Includes a visual configuration editor, conditional display options, and dark/light appearances.

This package has not been installed on your Home Assistant instance. `demo.html` uses simulated data; its charge planner is an illustrative nested card, not a supplied charging automation.

## Install through HACS

1. Set up Home Assistant's **Tessie** integration and confirm your vehicle entities have data.
2. Open **HACS → ⋮ → Custom repositories**. Paste this GitHub repository's URL and choose **Dashboard** (called **Lovelace** in some versions).
3. Add the repository, find **Tesla Model 3 Card**, and download it.
4. Reload the browser. If HACS has not registered the resource automatically, add `/hacsfiles/tesla-model-3-card/tesla-model-3-card.js` under **Settings → Dashboards → Resources**, with type **JavaScript module**.
5. Add a Manual dashboard card with:

```yaml
type: custom:tesla-model-3-card
```

This is a custom HACS repository; it is not listed in the default HACS catalog. The repository must be public for HACS. [HACS custom-repository instructions](https://www.hacs.dev/docs/faq/custom_repositories/).

Use only one resource entry for this card. If switching from manual installation, remove the old `/local/tesla-model-3-card.js` resource entry after HACS installs the new one.

## Manual installation

1. Set up the **Tessie** integration in Home Assistant under **Settings → Devices & services → Add integration**. Confirm your vehicle entities have data. The integration handles the Tessie connection; this card reads Home Assistant entities and needs no token. [Official Tessie integration guide](https://www.home-assistant.io/integrations/tessie/).
2. Copy the included **`tesla-model-3-card.js`** to **`/config/www/tesla-model-3-card.js`** on the Home Assistant server. If your configuration directory is elsewhere, use its `www` directory. If you just created `www`, restart Home Assistant once.
3. Open **Settings → Dashboards → top-right menu → Resources → Add resource**. Enter **`/local/tesla-model-3-card.js?v=1.1.0`** and select **JavaScript module**. Reload the browser after adding it. [Official resource setup](https://contributors.home-assistant.io/frontend/custom-ui/resources/).
4. Edit your dashboard, add a **Manual** card, and paste:

```yaml
type: custom:tesla-model-3-card
```

The card also appears as **Tesla Model 3** in the card picker once its resource has loaded. Only the bundled JavaScript file is required on the Home Assistant server; there are no separate frontend dependencies.

## Automatic data import

With one Tessie vehicle, discovery fills in supported entities automatically. Their state and units update as Home Assistant updates them. Unknown or unavailable readings appear as a dash or an explicit unknown state.

With multiple vehicles, choose the Model 3 using **Tessie vehicle** in the card's visual editor and save. The temporary selector displayed inside the card is useful for previewing a vehicle, but its choice is not saved across reloads. A saved `device_id` is the permanent selection; `entity_prefix` is an alternative.

The main display includes battery, range, charge state and target, lock, Sentry, climate, location, cabin temperature, outside temperature, and charging power. Tap a reading to open Home Assistant's entity details. **The main card does not directly send vehicle commands.** Controls you add inside it retain their own normal behavior.

The footer reports the latest Home Assistant entity update among mapped readings, not a guaranteed vehicle telemetry measurement time. A sleeping vehicle can show cached values.

## Paint and custom images

Use a fixed color:

```yaml
type: custom:tesla-model-3-card
car_color: "#35A7A0"
```

Or follow an existing sensor/helper automatically:

```yaml
type: custom:tesla-model-3-card
color_entity: input_text.model_3_paint_color
car_color: "#687583"
```

Use the actual entity ID in your installation. `color_entity` takes precedence when it provides a supported value; `car_color` is the fallback. `color_attribute` optionally reads an attribute or dotted attribute path instead of the entity state. Hex colors are recommended; supported Tesla paint names/codes and conventional CSS colors also work. Paint-code colors are visual approximations.

The native Tessie integration does not document a paint entity. [The optional paint sensor](examples/tessie-color-sensor.yaml) imports the documented exterior paint code through a cached, hourly request on the Home Assistant server. **Automatic import of an arbitrary Tesla Colorizer/custom-wrap color is not verified by Tessie's published schema.** Use a Text helper or fixed hex color for that case. See [paint setup and limitations](examples/PAINT-COLOR.md) and [Tessie's vehicle schema](https://developer.tessie.com/reference/get-vehicle). Keep access tokens in server-side `secrets.yaml`, never dashboard YAML or files in `www`.

Set `image: /local/my-model-3.png` to use your own image, or use an HTTPS image URL. Custom images are displayed as supplied and are not tinted by the paint setting. A failed image load falls back to the built-in illustration.

## Cards inside the card

Add normal Home Assistant card configurations under `cards`. They receive the live Home Assistant state, just as they do elsewhere on your dashboard. Custom child cards must already be installed and registered as resources.

Give any child a `show_when` rule to control when it appears. The parent evaluates this rule and removes it before passing the configuration to the child. A native `type: conditional` child also works for conditions supported by Home Assistant. Dashboard-level `visibility` and `disabled` wrapper settings are not evaluated by this container.

```yaml
type: custom:tesla-model-3-card
nested_title: Charging & history
cards_layout: stack
show_nested: true
cards:
  - type: entities
    title: Charging
    entities:
      - number.model_3_charge_limit
      - sensor.model_3_charge_energy_added
  - type: history-graph
    title: Battery today
    hours_to_show: 24
    entities:
      - sensor.model_3_battery_level
```

**Replace the nested entity IDs with your actual IDs.** Automatic discovery applies to the main vehicle card only. Child cards do not inherit entity placeholders or templates. `cards_layout: grid` uses two columns, collapsing to one on narrow cards. `show_nested: false` starts this area collapsed; it does not remove it. Omit `cards` to remove the area.

## Conditional display

Use **Built-in visibility** and **Nested card visibility** in the visual editor to choose when each part of the card appears. Existing configurations show everything by default. The settings update automatically as Home Assistant readings change.

```yaml
type: custom:tesla-model-3-card
display:
  charger_power: charging
  outside_temperature: never
cards:
  - type: entities
    title: Charging
    show_when: charging
    entities:
      - number.model_3_charge_limit # Replace with your actual entity ID.
```

`display` accepts these keys: `car`, `location`, `lock`, `sentry`, `climate`, `battery`, `range`, `charging`, `inside_temperature`, `outside_temperature`, `charger_power`, `footer`, and `nested`. Each takes one of these presets, or a YAML rule:

| Preset | Show when |
| --- | --- |
| `always` / `never` | Always visible / always hidden |
| `charging` / `not_charging` | Vehicle is charging / is known to be not charging |
| `home` / `away` | Vehicle location is home / a known location away from home |
| `climate_on` / `climate_off` | Climate is on / is known to be off |
| `locked` / `unlocked` | Vehicle is locked / unlocked |
| `sentry_on` | Sentry is on |
| `low_battery` | Battery is below 20% |

Presets use the selected vehicle's automatically discovered or manually mapped entities. Missing, unknown, or unavailable readings do not satisfy a state-dependent preset, including `not_charging`, `away`, and `climate_off`.

For more precise rules, use `state`, `numeric_state`, `and`, `or`, or `not`. An outer list means AND. Specify exactly one state source: a mapped `role`, an explicit `entity`, or `entity_id`. State comparisons support `state` and `state_not` as strings or lists; numeric comparisons use strict `above` and `below` bounds.

```yaml
# Show charging power only at home and above 2 kW.
# Numeric thresholds use the source entity's unit.
display:
  charger_power:
    - condition: state
      role: location
      state: home
    - condition: numeric_state
      role: charger_power
      above: 2
```

Logical objects use `conditions` for their child rules, for example `{condition: or, conditions: [charging, low_battery]}`. A `not` rule negates the combined AND of its children; missing readings stay unknown through negation. See [the complete conditional display example](examples/conditional-display.yaml) for per-card rules and explicit entities. Custom YAML rules are retained when changing unrelated settings in the visual editor.

`show_details: false` still hides all three small detail tiles. `show_nested: false` starts the child area collapsed; use `display: {nested: never}` to hide it entirely. The area also disappears when none of its children pass their `show_when` rules.

These rules control display, not access to entities or vehicle commands. JavaScript/Jinja templates and Home Assistant screen, user, or time conditions are not interpreted by this custom rule engine. For other Home Assistant conditions, use a native conditional card with its supported configuration.

## Configuration reference

| Key | Default | Meaning |
| --- | --- | --- |
| `type` | Required | `custom:tesla-model-3-card` |
| `name` | `Model 3` | Card heading |
| `subtitle` | `Electric, every day.` | Text below the heading |
| `device_id` | Automatic | Saved Tessie vehicle selection |
| `entity_prefix` | None | Vehicle entity prefix, such as `my_model_3` |
| `entities` | Automatic | Map roles to specific entity IDs |
| `car_color` | Neutral silver | Fixed paint color or fallback |
| `color_entity` | Automatic if available | Explicit color sensor/helper |
| `color_attribute` | Entity state | Attribute or dotted attribute path |
| `image` | Built-in illustration | Local `/local/…` path or HTTPS URL |
| `theme` | `dark` | `dark`, `light`, or `auto` to follow Home Assistant |
| `show_details` | `true` | Show cabin, outside, and charging-power tiles |
| `display` | All visible | Conditions for individual sections and readings |
| `cards` | None | Native/custom child card configurations; each may set `show_when` |
| `cards_layout` | `stack` | `stack` or `grid` |
| `show_nested` | `true` | Start the child-card area expanded |
| `nested_title` | `Your garage` | Child-card area heading |

The visual editor covers the common settings and display presets. Use the YAML editor for `entities`, `cards`, `cards_layout`, and custom condition rules. No JavaScript or Jinja templates are evaluated by this card.

For an unusual entity name or restricted registry access, override individual roles while leaving other roles automatic:

```yaml
type: custom:tesla-model-3-card
entities:
  battery: sensor.my_tesla_battery
  range: sensor.my_tesla_range
  lock: lock.my_tesla_doors
```

All IDs above are examples. Supported role keys are `battery`, `range`, `charging`, `charger_power`, `charge_limit`, `charge_rate`, `energy_added`, `inside_temperature`, `outside_temperature`, `lock`, `climate`, `sentry`, `location`, `odometer`, `online`, `color`, `charge_port`, and `trunk`. Setting a role to `null` or `false` prevents its automatic mapping. Mapping extra roles does not add new tiles to the fixed main layout; put additional metrics or controls in child cards.

Vehicle entities must belong to the same device. The card reports conflicting mappings rather than combining readings from different cars. Explicit color helpers can be separate entities.

## Preview, build, and check

Open **`preview.html`** directly in a browser for a self-contained interactive preview. It works without Home Assistant or a local server. The PNG previews are also included.

Run these from the extracted package directory with Node.js and npm available:

```sh
npm run build
npm test
python3 -m http.server 8124 --bind 127.0.0.1
```

Open [the local interactive preview](http://127.0.0.1:8124/demo.html). It lets you try paint colors, battery levels, appearances, unavailable data, multiple vehicles, and nested-card expansion. The preview sends no vehicle commands and has no connection to your account. Its card-helper mock is for appearance testing; actual native/custom child cards need verification in Home Assistant.

After installation, verify your selected vehicle, compare displayed values and units against its Home Assistant entities, open an entity detail dialog, test your chosen paint source, and check child cards at desktop and phone widths. When upgrading to this release, replace the bundle, change the resource URL to `/local/tesla-model-3-card.js?v=1.1.0`, and reload. If you edit the source, rebuild, copy the new bundle, and change the resource URL's version suffix again before reloading.

If Home Assistant reports **Custom element doesn't exist**, verify that the resource URL opens, its type is **JavaScript module**, and the browser was reloaded. If discovery finds no entities, confirm Tessie is configured and its sensors enabled, then select a device or supply explicit mappings. For a missing nested custom card, check that child's installation and resource separately.

Package version: **1.1.0**. Documentation reviewed **October 23, 2026**.
