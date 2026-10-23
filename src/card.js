import { readVehicle } from './data.js';
import { carSVG } from './car.js';
import { DISPLAY_SECTIONS, evaluateShowWhen, validateShowWhen } from './conditions.js';
import './editor.js';

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

export class TeslaModel3Card extends HTMLElement {
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
