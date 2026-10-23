/* Optional: run against a local preview server with Playwright + Chrome available.
   PREVIEW_URL=http://127.0.0.1:8765/demo.html node tests/browser-smoke.cjs */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1120,height:1040},deviceScaleFactor:2});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:8765/demo.html');
    await page.waitForFunction(()=>window.demoCard?._vehicle?.values.battery.value===78);
    const card=page.locator('tesla-model-3-card');
    assert.equal(await card.locator('#battery').innerText(),'78');
    assert.equal(await card.locator('#range-unit').innerText(),'mi');
    assert.equal(await card.locator('#power').innerText(),'7.4');
    await card.locator('[data-role="battery"]').click();
    assert.match(await page.locator('#interaction').innerText(),/sensor.model_3_battery_level/);
    await page.getByRole('button',{name:'Ultra red',exact:true}).click();
    assert.equal(await card.evaluate(el=>getComputedStyle(el).getPropertyValue('--car-paint')),'#b71e2c');
    await page.locator('#theme-control').selectOption('light');
    assert.equal(await card.getAttribute('appearance'),'light');
    await page.locator('#theme-control').selectOption('dark');
    await page.getByRole('button',{name:'Pearl white',exact:true}).click();
    await page.evaluate(()=>window.originalNested=window.demoCard._children[0]);
    await page.locator('#battery-control').fill('0');
    assert.equal(await card.locator('#battery').innerText(),'0');
    assert(await page.evaluate(()=>window.originalNested===window.demoCard._children[0]),'nested card must survive state updates');
    await page.locator('#battery-control').fill('78');
    await page.locator('#state-control').selectOption('unavailable');
    assert.equal(await card.locator('#battery').innerText(),'—');
    assert(await card.locator('[data-role="lock"]').isDisabled());
    assert.match(await card.locator('#locked').innerText(),/unknown/);
    await page.locator('#state-control').selectOption('multiple');
    assert(await card.locator('.vehicle-picker').isVisible());
    assert.equal(await card.locator('#battery').innerText(),'—');
    await card.locator('select').selectOption('demo-model-3');
    assert.equal(await card.locator('#battery').innerText(),'78');
    await page.locator('#state-control').selectOption('charging');
    await page.locator('#nested-control').uncheck();
    assert(await card.locator('details').isHidden());
    await page.locator('#nested-control').check();
    await page.waitForFunction(()=>window.demoCard._children.length===2);
    assert.equal(await card.locator('.demo-extra').count(),2);
    // Preset visibility changes live, preserves child instances, and leaves no empty rows.
    assert.deepEqual(await page.evaluate(()=>window.demoCard._children.map(x=>x.hidden)),[false,true]);
    await page.evaluate(()=>window.visibilityChildren=[...window.demoCard._children]);
    await page.locator('#state-control').selectOption('parked');
    assert(await card.locator('.nested').isHidden());
    assert(await card.locator('[data-role="charger_power"]').isHidden());
    assert.equal(await card.locator('.stats').evaluate(el=>el.style.gridTemplateColumns),'repeat(2, minmax(0px, 1fr))');
    await page.locator('#battery-control').fill('19');
    assert(await card.locator('.nested').isVisible());
    assert.deepEqual(await page.evaluate(()=>window.demoCard._children.map(x=>x.hidden)),[true,false]);
    await page.locator('#state-control').selectOption('charging');
    assert.deepEqual(await page.evaluate(()=>window.demoCard._children.map(x=>x.hidden)),[false,false]);
    assert(await page.evaluate(()=>window.visibilityChildren.every((x,i)=>x===window.demoCard._children[i])),'visibility changes must retain children');
    await page.locator('#battery-control').fill('20');
    assert.deepEqual(await page.evaluate(()=>window.demoCard._children.map(x=>x.hidden)),[false,true]);
    for(const selector of ['#cabin-visibility','#outside-visibility','#power-visibility'])await page.locator(selector).selectOption('never');
    assert(await card.locator('.stats').isHidden());
    await page.locator('#cabin-visibility').selectOption('always');
    await page.locator('#outside-visibility').selectOption('home');
    await page.locator('#state-control').selectOption('away');
    assert(await card.locator('[data-role="outside_temperature"]').isHidden());
    await page.locator('#state-control').selectOption('charging');
    assert(await card.locator('[data-role="outside_temperature"]').isVisible());
    await page.locator('#outside-visibility').selectOption('always');
    await page.locator('#power-visibility').selectOption('charging');
    await page.locator('#battery-control').fill('78');
    await page.locator('#planner-visibility').selectOption('never');
    assert(await card.locator('.nested').isHidden());
    await page.locator('#planner-visibility').selectOption('charging');
    assert(await card.locator('.nested').isVisible());
    // Conditions on unrelated entities must update even when all vehicle data is unchanged.
    const unrelated=await page.evaluate(async()=>{
      const rule={condition:'state',entity_id:'input_boolean.show_car_details',state:'on'};
      const config={...window.demoConfig,display:{...window.demoConfig.display,inside_temperature:rule},cards:[{...window.demoCards[0],show_when:rule}]};
      window.demoHass.states={...window.demoHass.states,'input_boolean.show_car_details':{state:'off',attributes:{}}};
      window.demoCard.setConfig(config);window.demoCard.hass={...window.demoHass};await new Promise(r=>setTimeout(r,0));
      const before={tile:window.demoCard.shadowRoot.querySelector('[data-role=inside_temperature]').hidden,child:window.demoCard._children[0].hidden};
      const child=window.demoCard._children[0];
      window.demoHass.states={...window.demoHass.states,'input_boolean.show_car_details':{state:'on',attributes:{}}};window.demoCard.hass={...window.demoHass};
      const after={tile:window.demoCard.shadowRoot.querySelector('[data-role=inside_temperature]').hidden,child:child.hidden,same:child===window.demoCard._children[0]};
      window.demoCard.setConfig(window.demoConfig);window.demoCard.hass=window.demoHass;return {before,after};
    });assert.deepEqual(unrelated,{before:{tile:true,child:true},after:{tile:false,child:false,same:true}});
    // Dynamic strings must remain text, not executable HTML.
    await page.evaluate(()=>{window.demoCard.setConfig({...window.demoConfig,name:'<img src=x onerror="window.injected=true">'});window.demoCard.hass=window.demoHass;});
    assert.equal(await card.locator('h2 img').count(),0);
    assert.equal(await page.evaluate(()=>window.injected),undefined);
    await page.evaluate(()=>{window.demoCard.setConfig(window.demoConfig);window.demoCard.hass=window.demoHass;});
    // A rejected registry request may not prevent explicit entity mappings.
    const fallback=await page.evaluate(async()=>{
      const el=document.createElement('tesla-model-3-card');document.body.append(el);
      el.setConfig({entities:{battery:'sensor.model_3_battery_level'},car_color:'#123456'});
      el.hass={...window.demoHass,connection:{},entities:{},callWS:async()=>{throw new Error('not authorized');}};
      await new Promise(r=>setTimeout(r,50));
      const result={battery:el.shadowRoot.getElementById('battery').textContent,color:el.style.getPropertyValue('--car-paint')};el.remove();return result;
    });assert.deepEqual(fallback,{battery:'78',color:'#123456'});
    const recovery=await page.evaluate(async()=>{
      const el=document.createElement('tesla-model-3-card');document.body.append(el);el.setConfig({});let calls=0;
      const hass={...window.demoHass,connection:{},entities:{},callWS:async()=>{calls++;if(calls===1)throw new Error('transient disconnect');return window.demoRegistry;}};
      el.hass=hass;await new Promise(r=>setTimeout(r,0));el.hass={...hass};await new Promise(r=>setTimeout(r,0));const throttled=calls===1;
      el._registryRetryAt=0;el.hass={...hass};await new Promise(r=>setTimeout(r,0));
      const result={throttled,calls,battery:el.shadowRoot.getElementById('battery').textContent};el.remove();return result;
    });assert.deepEqual(recovery,{throttled:true,calls:2,battery:'78'});
    // Out-of-order helper loading must not restore obsolete nested cards.
    const race=await page.evaluate(async()=>{
      const original=window.loadCardHelpers;const pending=[];
      window.loadCardHelpers=()=>new Promise(resolve=>pending.push(resolve));
      const el=document.createElement('tesla-model-3-card');document.body.append(el);
      el.setConfig({cards:[{type:'tile',entity:'old'}]});el.hass=window.demoHass;
      el.setConfig({cards:[{type:'tile',entity:'new'}]});
      const helpers={createCardElement:c=>{const x=document.createElement('div');x.dataset.entity=c.entity;return x;}};
      pending[1](helpers);await new Promise(r=>setTimeout(r,0));pending[0](helpers);await new Promise(r=>setTimeout(r,0));
      const result=el._children.map(x=>x.dataset.entity);el.remove();window.loadCardHelpers=original;return result;
    });assert.deepEqual(race,['new']);
    // Lazy built-ins upgrade in place; late custom cards rebuild only their slot.
    const lazy=await page.evaluate(async()=>{
      const original=window.loadCardHelpers;let created=0,bubbled=0;
      window.loadCardHelpers=async()=>({createCardElement:()=>{const x=document.createElement('div');x.dataset.generation=String(++created);return x;}});
      const el=document.createElement('tesla-model-3-card');document.body.append(el);el.setConfig({cards:[{type:'custom:late-card'}]});el.hass=window.demoHass;
      el.addEventListener('ll-rebuild',()=>bubbled++);el.addEventListener('ll-upgrade',()=>bubbled++);
      await new Promise(r=>setTimeout(r,0));const first=el._children[0];first.hass=undefined;
      first.dispatchEvent(new CustomEvent('ll-upgrade',{bubbles:true,composed:true}));await new Promise(r=>setTimeout(r,0));
      const restored=first.hass===window.demoHass;
      first.dispatchEvent(new CustomEvent('ll-rebuild',{bubbles:true,composed:true}));await new Promise(r=>setTimeout(r,0));
      const result={restored,created,bubbled,replaced:el._children[0]!==first,count:el.shadowRoot.querySelector('.nested-content').children.length};
      el.remove();window.loadCardHelpers=original;return result;
    });assert.deepEqual(lazy,{restored:true,created:2,bubbled:0,replaced:true,count:1});
    // Editor changes retain YAML-only options, particularly nested cards.
    const editor=await page.evaluate(()=>{
      const el=document.createElement('tesla-model-3-card-editor');el.setConfig({...window.demoConfig,entities:{battery:'sensor.example'}});el.hass=window.demoHass;
      let result;el.addEventListener('config-changed',e=>result=e.detail.config);
      el.shadowRoot.querySelector('ha-form').dispatchEvent(new CustomEvent('value-changed',{detail:{value:{name:'Updated'}}}));return result;
    });assert.equal(editor.name,'Updated');assert.equal(editor.cards.length,2);assert.equal(editor.entities.battery,'sensor.example');
    const visibilityEditor=await page.evaluate(()=>{
      const advanced={condition:'numeric_state',role:'battery',below:30};
      const el=document.createElement('tesla-model-3-card-editor');document.body.append(el);
      el.setConfig({...window.demoConfig,display:{battery:advanced},cards:[{type:'markdown',title:'<img src=x>',show_when:advanced,content:'Keep this'}]});el.hass=window.demoHass;
      el.shadowRoot.querySelector('#built-in-visibility').open=true;el.shadowRoot.querySelector('#nested-card-visibility').open=true;
      const select=el.shadowRoot.querySelector('[data-display-key=battery]');select.focus();const wasCustom=select.value==='__custom__';
      el.hass={...window.demoHass};el.setConfig({...el._config,name:'Renamed'});
      const retainedFocus=el.shadowRoot.activeElement===select;
      const nested=el.shadowRoot.querySelector('[data-nested-index="0"]');nested.value='charging';nested.dispatchEvent(new Event('change'));
      const preserved=JSON.stringify(el._config.display.battery)===JSON.stringify(advanced)&&el._config.cards[0].content==='Keep this';
      select.value='never';select.dispatchEvent(new Event('change'));
      const result={wasCustom,retainedFocus,preserved,battery:el._config.display.battery,child:el._config.cards[0].show_when,images:el.shadowRoot.querySelectorAll('img').length};el.remove();return result;
    });assert.deepEqual(visibilityEditor,{wasCustom:true,retainedFocus:true,preserved:true,battery:'never',child:'charging',images:0});
    const output=path.resolve(__dirname,'..');
    await card.screenshot({path:path.join(output,'preview-card.png')});
    await page.screenshot({path:path.join(output,'preview-desktop.png'),fullPage:true});
    for(const width of [390,320]){
      await page.setViewportSize({width,height:1100});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`page overflow at ${width}`);
      const overflow=await card.evaluate(el=>{const r=el.getBoundingClientRect();return [...el.shadowRoot.querySelectorAll('button,.stat,.footer')].filter(x=>!x.hidden&&x.getBoundingClientRect().width).filter(x=>{const b=x.getBoundingClientRect();return b.left<r.left-1||b.right>r.right+1;}).map(x=>x.className);});
      assert.deepEqual(overflow,[],`card controls overflow at ${width}`);
      await card.screenshot({path:path.join(output,`preview-mobile-${width}.png`)});
    }
    await page.setViewportSize({width:760,height:1100});
    await page.locator('#theme-control').selectOption('light');
    await page.getByRole('button',{name:'Deep blue',exact:true}).click();
    await card.screenshot({path:path.join(output,'preview-light.png')});
    await page.goto('file://'+path.join(output,'preview.html'));
    await page.waitForFunction(()=>window.demoCard?._vehicle?.values.battery.value===78);
    assert.equal(await page.locator('tesla-model-3-card').locator('#battery').innerText(),'78','standalone preview opens directly');
    assert.deepEqual(errors,[],'browser must not log uncaught errors');
    fs.writeFileSync(path.join(output,'tests','browser-results.json'),JSON.stringify({passed:true,checks:['discovery','units','entity details','live paint','theme','zero and unavailable readings','multi-vehicle isolation','persistent nested cards','HTML injection','registry failure fallback','async nested race','lazy card upgrade and rebuild','editor config preservation','conditional presets and gap removal','unrelated entity conditional updates','visibility editor focus and YAML preservation','390px and 320px layout'],uncaughtErrors:errors},null,2));
    console.log('Browser smoke checks passed; preview screenshots saved.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
