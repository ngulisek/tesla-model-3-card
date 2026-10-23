import {DISPLAY_SECTIONS, SHOW_WHEN_OPTIONS} from './conditions.js';

export class TeslaModel3CardEditor extends HTMLElement {
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
