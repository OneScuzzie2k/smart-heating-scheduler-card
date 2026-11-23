import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

async function setup(config={demo:true,theme:'dark'}) {
  const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'dangerously',url:'http://localhost/'});
  dom.window.structuredClone=structuredClone;
  dom.window.eval(await readFile(new URL('../dist/smart-heating-scheduler-card.js',import.meta.url),'utf8'));
  const card=dom.window.document.createElement('smart-heating-scheduler-card');card.setConfig(config);dom.window.document.body.append(card);
  return {dom,card,root:card.shadowRoot,close:()=>dom.window.close()};
}
const click=(root,action,extra='')=>{const node=root.querySelector(`[data-action="${action}"]${extra}`);assert.ok(node,action);assert.equal(node.disabled,false,action+' is enabled');node.click();};
test('receiver tools require a live admin and remain absent from existing integrations and mini cards',async()=>{
  const h=await setup();try{
    h.card._view='settings';h.card._render();assert.equal(h.root.querySelector('[data-action="receiver-read"]'),null);
    h.card._config.demo=false;h.card._status='connected';h.card._zone().receiver={state:'not_read'};h.card._render();
    assert.ok(h.root.querySelector('[data-action="receiver-read"]'));
    h.card._data.can_edit=false;h.card._render();assert.equal(h.root.querySelector('[data-action="receiver-read"]'),null);
    h.card._data.can_edit=true;h.card._config.layout='mini';h.card._render();assert.equal(h.root.querySelector('[data-action="receiver-read"]'),null);
  }finally{h.close();}
});
test('receiver preview never writes and a disabled zone plus typed acknowledgement is required',async()=>{
  const h=await setup();try{
    const calls=[],z=h.card._zone();h.card._config.demo=false;h.card._status='connected';h.card._view='settings';z.receiver={state:'not_read'};z.enabled=true;
    const week=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[{minute:0,centi:1600}]]));
    const record={state:'preview',snapshot:{at:'2026-11-23T12:00:00Z',schedule:week},plan:{id:'reviewed',source:'ha_schedule',revision:z.revision,expires_at:new Date(Date.now()+600000).toISOString(),before:week,after:week,changed_days:[]},transactions:[]};
    h.card._hass={connection:{connected:true},callWS:async request=>{calls.push(request);return structuredClone(record);}};
    h.card._render();click(h.root,'receiver-prepare');await settle();
    assert.deepEqual(calls.map(c=>c.action),['prepare']);assert.equal(calls[0].payload.revision,z.revision);
    assert.equal(h.root.querySelector('[data-action="receiver-write"]').disabled,true);
    assert.match(h.root.textContent,/HA currently runs this zone/);
    z.enabled=false;h.card._render();assert.equal(h.root.querySelector('[data-action="receiver-write"]').disabled,true);await h.card._receiverAction('write');assert.equal(calls.length,1);
    const input=h.root.querySelector('[data-receiver-ack]');input.value='WRITE RECEIVER TIMETABLE';input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    click(h.root,'receiver-write');await settle();assert.equal(calls[1].action,'write');assert.equal(calls[1].payload.plan_id,'reviewed');assert.equal(calls[1].payload.acknowledgement,'WRITE RECEIVER TIMETABLE');
    assert.match(h.root.textContent,/HA still owns scheduling/);
    assert.equal(h.root.querySelector('[data-receiver-ack]').value,'');
  }finally{h.close();}
});
test('receiver failures preserve schedule drafts and do not report an unverified copy as successful',async()=>{
  const h=await setup();try{
    const z=h.card._zone();h.card._config.demo=false;h.card._status='connected';h.card._view='settings';z.receiver={state:'not_read'};
    let calls=0;h.card._hass={connection:{connected:true},callWS:async()=>{calls++;throw Error('Receiver read incomplete: 1/7 days');}};
    h.card._draft=structuredClone(z.week);h.card._render();assert.equal(h.root.querySelector('[data-action="receiver-read"]').disabled,true);
    await h.card._receiverAction('read');assert.equal(calls,0);assert.ok(h.card._draft);
    h.card._draft=null;h.card._render();click(h.root,'receiver-read');await settle();assert.equal(calls,1);
    assert.match(h.root.textContent,/read incomplete: 1\/7 days/);assert.doesNotMatch(h.root.textContent,/Complete seven-day receiver timetable read/);
  }finally{h.close();}
});
test('native timer test requires a disabled zone and typed acknowledgement and sends no arbitrary mode parameters',async()=>{
  const h=await setup();try{
    const z=h.card._zone(),calls=[];h.card._config.demo=false;h.card._status='connected';h.card._view='settings';z.enabled=true;z.receiver={state:'read_complete'};
    const q={id:'bounded',state:'prepared',original:{target:1600},expires_at:new Date(Date.now()+600000).toISOString(),updated_at:new Date().toISOString(),observations:[]};
    h.card._hass={connection:{connected:true},callWS:async request=>{calls.push(request);return {state:'read_complete',qualification:structuredClone(q)};}};
    h.card._render();click(h.root,'receiver-prepare_test');await settle();assert.deepEqual(calls.map(c=>c.action),['prepare_test']);
    assert.equal(h.root.querySelector('[data-action="receiver-start_test"]').disabled,true);
    z.enabled=false;h.card._render();assert.equal(h.root.querySelector('[data-action="receiver-start_test"]').disabled,true);
    const input=h.root.querySelector('[data-receiver-test-ack]');input.value='TEST RECEIVER TIMER';input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    click(h.root,'receiver-start_test');await settle();assert.equal(calls[1].action,'start_test');
    assert.deepEqual({...calls[1].payload},{test_id:'bounded',acknowledgement:'TEST RECEIVER TIMER'});
    assert.match(h.card._message,new RegExp(z.name));assert.equal(h.root.querySelector('[data-receiver-test-ack]').value,'');
  }finally{h.close();}
});
test('receiver errors stay visible across status snapshots and clear after a successful inspection',async()=>{
  const h=await setup();try{
    const z=h.card._zone();h.card._config.demo=false;h.card._status='connected';h.card._view='settings';z.receiver={state:'not_read'};
    h.card._hass={connection:{connected:true},callWS:async()=>{throw Error('Receiver not available');}};
    h.card._render();click(h.root,'receiver-inspect');await settle();h.card._receive(structuredClone(h.card._data));
    assert.match(h.root.textContent,/Receiver not available/);
    h.card._hass.callWS=async()=>({state:'not_read',hardware:{state:{mode:'manual',target:1600}}});
    click(h.root,'receiver-inspect');await settle();assert.doesNotMatch(h.root.textContent,/Receiver not available/);
  }finally{h.close();}
});
test('live timer progress supersedes cached preview and restoration never implies natural expiry passed',async()=>{
  const h=await setup();try{
    const z=h.card._zone();h.card._config.demo=false;h.card._status='connected';h.card._view='settings';z.receiver={state:'read_complete',qualification:{state:'restored',updated_at:'2026-11-23T12:03:00Z',expiry_passed:false,restoration_verified:true,schedule_target_verified:false,result:'expiry_failed'}};
    h.card._receiverRecords={[h.card._receiverKey()]:{state:'read_complete',qualification:{id:'old',state:'prepared',updated_at:'2026-11-23T12:00:00Z',original:{target:1600},expires_at:'2099-01-01T00:00:00Z'}}};
    h.card._render();assert.equal(h.root.querySelector('[data-action="receiver-start_test"]'),null);
    assert.match(h.root.textContent,/Hardware expiry observed: not proven/);assert.match(h.root.textContent,/Original Manual hold restored: verified/);
  }finally{h.close();}
});
test('all four views render with sample data explicitly labelled',async()=>{const h=await setup();try{for(const view of ['dashboard','schedules','automation','settings']){click(h.root,'nav',`[data-view="${view}"]`);assert.match(h.root.textContent,/Sample data/);assert.equal(h.root.querySelector('[aria-current="page"]').dataset.view,view);}assert.equal(h.card.getGridOptions().columns,12);}finally{h.close();}});
test('editable period, undo, unsaved guard and demo save are connected',async()=>{const h=await setup();try{click(h.root,'nav','[data-view="schedules"]');click(h.root,'edit','[data-day="mon"][data-index="1"]');const temp=h.root.querySelector('[data-field="temperature"]');temp.value='21';temp.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));h.root.querySelector('form').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));assert.ok(h.card._draft);assert.equal(h.card._draft.mon[1].temperature,21);click(h.root,'nav','[data-view="dashboard"]');assert.match(h.root.querySelector('[role="dialog"]').textContent,/Unsaved/);click(h.root,'close');assert.equal(h.card._view,'schedules');click(h.root,'undo');assert.equal(h.card._draft.mon[1].temperature,20);click(h.root,'save');await new Promise(r=>setTimeout(r,0));assert.equal(h.card._draft,null);assert.match(h.root.textContent,/Saved to this demo only/);}finally{h.close();}});
test('malicious names and labels are text, never executable markup',async()=>{const h=await setup();try{h.card._data.zones[0].name='<img src=x onerror=alert(1)>';h.card._data.zones[0].week.mon[1].label='<script>bad()</script>';h.card._render();assert.equal(h.root.querySelector('img'),null);assert.equal(h.root.querySelector('script'),null);assert.match(h.root.textContent,/<img/);}finally{h.close();}});
test('read-only users cannot open period editors or save',async()=>{const h=await setup();try{h.card._data.can_edit=false;h.card._render();click(h.root,'nav','[data-view="schedules"]');assert.equal(h.root.querySelector('[data-action="edit"]').disabled,true);h.card._openPeriod('mon',0);assert.equal(h.card._dialog,null);}finally{h.close();}});
test('subscription is disposed on removal and unsupported API shows an error',async()=>{const h=await setup({entry_id:'entry',theme:'dark'});let stopped=0;try{h.card.hass={connection:{subscribeMessage:async cb=>{cb({schema_version:2,available:true,zones:[]});return()=>stopped++;}}};await new Promise(r=>setTimeout(r,0));assert.match(h.root.textContent,/Unsupported scheduler API/);h.card.remove();assert.equal(stopped,1);}finally{h.close();}});
test('stale saves retain draft and make the conflict actionable',async()=>{const h=await setup();try{click(h.root,'nav','[data-view="schedules"]');click(h.root,'split');h.card._config.demo=false;h.card._status='connected';h.card._hass={callWS:async()=>{throw {code:'revision_conflict'};}};click(h.root,'save');await new Promise(r=>setTimeout(r,0));assert.ok(h.card._draft);assert.match(h.root.textContent,/draft is safe/);}finally{h.close();}});

const settle=()=>new Promise(r=>setTimeout(r,0));

test('history has real chart paths, owner explanations, range switching and disabled state',async()=>{
  const h=await setup();try{
    click(h.root,'nav','[data-view="heatingHistory"]');
    assert.equal(h.root.querySelectorAll('.history-chart path').length,2);
    assert.match(h.root.textContent,/Why the heating changed/);
    click(h.root,'feature-history-range','[data-hours="1"]');assert.equal(h.card._historyRange,1);
    click(h.root,'feature-history-range','[data-hours="168"]');assert.equal(h.card._historyRange,168);
    h.card._zone().insights.settings.history_enabled=false;h.card._render();assert.match(h.root.textContent,/History is disabled/);
  }finally{h.close();}
});

test('profiles copy selected day independently, validate targets, and preserve unsaved drafts on navigation',async()=>{
  const h=await setup();try{
    click(h.root,'nav','[data-view="schedules"]');h.root.querySelector('[data-new-profile]').value='New profile';click(h.root,'feature-create-profile');
    const input=h.root.querySelector('[data-feature="temperature"][data-profile-row="0"]');input.value='19';input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    assert.equal(h.card._zone().week.mon[0].temperature,16);
    click(h.root,'nav','[data-view="dashboard"]');assert.ok(h.root.querySelector('[role=dialog]'));click(h.root,'close');
    click(h.root,'feature-save');await settle();assert.equal(h.card._zone().insights.settings.profiles['New profile'][0].temperature,19);assert.equal(h.card._featureDraft,null);
  }finally{h.close();}
});

test('new profile name survives a live status update before creation',async()=>{
  const h=await setup();try{
    click(h.root,'nav','[data-view="schedules"]');
    const input=h.root.querySelector('[data-new-profile]');input.value='My working day';input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    h.card._receive(structuredClone(h.card._data));
    assert.equal(h.root.querySelector('[data-new-profile]').value,'My working day');
    click(h.root,'feature-create-profile');
    assert.ok(h.card._featureDraft.settings.profiles['My working day']);
    assert.equal(h.root.querySelector('[data-new-profile]').value,'');
  }finally{h.close();}
});

test('preheat settings survive subscriptions and stale backend rejection retains the feature draft',async()=>{
  const h=await setup();try{
    click(h.root,'nav','[data-view="settings"]');const toggle=h.root.querySelector('[data-feature="preheat_enabled"]');toggle.checked=true;toggle.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    h.card._receive(structuredClone(h.card._data));assert.equal(h.root.querySelector('[data-feature="preheat_enabled"]').checked,true);
    const calls=[];h.card._config.demo=false;h.card._status='connected';h.card._hass={callWS:async request=>{calls.push(request);throw Error('Zone features changed elsewhere');}};
    click(h.root,'feature-save');await settle();assert.ok(h.card._featureDraft);assert.match(h.root.textContent,/changed elsewhere/);assert.equal(calls[0].payload.revision,1);assert.equal(calls[0].action,'insights');
  }finally{h.close();}
});

test('read-only feature forms and all destructive feature actions are disabled',async()=>{
  const h=await setup();try{
    h.card._data.can_edit=false;h.card._render();click(h.root,'nav','[data-view="settings"]');
    assert.equal(h.root.querySelector('[data-action="feature-reset-learning"]').disabled,true);
    assert.equal(h.root.querySelector('[data-feature="preheat_enabled"]').closest('fieldset').disabled,true);
    await h.card._featureAction('reset-learning',{});assert.equal(h.card._zone().insights.preheat.samples,7);
    click(h.root,'nav','[data-view="heatingHistory"]');assert.equal(h.root.querySelector('[data-action="feature-clear-history"]').disabled,true);
  }finally{h.close();}
});

test('profile names and decision reasons are escaped and mini cards stay uncluttered',async()=>{
  const h=await setup();try{
    h.card._zone().insights.active_profile='<img src=x onerror=bad()>';
    h.card._zone().insights.decisions[0].reason='<script>bad()</script>';
    click(h.root,'nav','[data-view="heatingHistory"]');assert.equal(h.root.querySelector('script'),null);assert.match(h.root.textContent,/<script>/);
    h.card.setConfig({demo:true,layout:'mini'});assert.equal(h.root.querySelector('.feature-summary'),null);assert.equal(h.root.querySelector('nav'),null);
  }finally{h.close();}
});
function setSmart(h,key,value){const input=h.root.querySelector(`[data-smart-field="${key}"]`);assert.ok(input,key);input.value=value;input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));}

test('round dial previews drag without sending commands, survives snapshots and commits once on release',async()=>{
  const h=await setup({demo:true,layout:'mini',zone_id:'lounge'});try{
    const calls=[];h.card._config.demo=false;h.card._status='connected';h.card._data.observe_only=false;h.card._miniZone().climate_entity='climate.test_lounge';h.card._hass={callService:async(...args)=>calls.push(args)};
    h.card._render();const dial=h.root.querySelector('[data-mini-dial]');dial.getBoundingClientRect=()=>({left:100,top:100,width:200,height:200});
    const pointer=(type,x,y)=>dial.dispatchEvent(new h.dom.window.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0}));
    pointer('pointerdown',200,100);assert.equal(dial.getAttribute('aria-valuenow'),'22');pointer('pointermove',300,200);assert.equal(calls.length,0);assert.equal(dial.getAttribute('aria-valuenow'),'26');
    h.card._receive(structuredClone(h.card._data));assert.equal(h.root.querySelector('[data-mini-dial]'),dial);
    pointer('pointerup',300,200);await settle();assert.equal(calls.length,1);assert.equal(calls[0][2].temperature,26);assert.equal(calls[0][3].entity_id,'climate.test_lounge');assert.equal(h.card._dialDrag,null);
  }finally{h.close();}
});

test('round dial cancellation, disabled mode and a fault during dragging never command heating',async()=>{
  const h=await setup({demo:true,layout:'mini',zone_id:'lounge'});try{
    const calls=[];h.card._config.demo=false;h.card._status='connected';h.card._data.observe_only=false;h.card._hass={callService:async(...args)=>calls.push(args)};h.card._render();
    function pointer(type){const d=h.root.querySelector('[data-mini-dial]');d.getBoundingClientRect=()=>({left:100,top:100,width:200,height:200});d.dispatchEvent(new h.dom.window.MouseEvent(type,{bubbles:true,cancelable:true,clientX:200,clientY:100,button:0}));}
    pointer('pointerdown');pointer('pointercancel');await settle();assert.equal(calls.length,0);assert.equal(h.card._miniTarget,null);
    h.card._data.observe_only=true;pointer('pointerdown');assert.equal(h.card._dialDrag,null);
    h.card._data.observe_only=false;pointer('pointerdown');h.card._miniZone().mode='unavailable';pointer('pointerup');await settle();assert.equal(calls.length,0);
  }finally{h.close();}
});

test('round dial supports keyboard steps and bounds while keeping keyboard focus',async()=>{
  const h=await setup({demo:true,layout:'mini',zone_id:'lounge'});try{
    const key=async(value)=>{const d=h.root.querySelector('[data-mini-dial]');d.focus();d.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));await settle();};
    await key('ArrowRight');assert.equal(h.card._miniZone().device_target,20.5);assert.equal(h.root.activeElement,h.root.querySelector('[data-mini-dial]'));
    await key('Home');assert.equal(h.card._miniZone().device_target,16);await key('End');assert.equal(h.card._miniZone().device_target,28);
  }finally{h.close();}
});

test('mini card has one temperature dial, isolates the chosen zone and shares boost controls',async()=>{
  const h=await setup({demo:true,layout:'mini',zone_id:'lounge',theme:'light'});try{
    assert.equal(h.root.querySelector('nav'),null);assert.match(h.root.querySelector('h2').textContent,/Lounge/);assert.equal(h.card.getGridOptions().columns,6);
    assert.equal(h.root.querySelector('[data-mini-target]'),null);assert.equal(h.root.querySelectorAll('[role=slider]').length,1);
    const target=h.root.querySelector('[data-mini-dial]');target.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));await settle();assert.equal(h.card._data.zones[1].device_target,20.5);assert.equal(h.card._data.zones[0].device_target,20);
    click(h.root,'smart-boost-start','[data-zone="lounge"]');await settle();assert.ok(h.card._data.zones[1].smart.boost);assert.equal(h.card._data.zones[0].smart.boost,null);click(h.root,'smart-boost-cancel','[data-zone="lounge"]');await settle();assert.equal(h.card._data.zones[1].smart.boost,null);
  }finally{h.close();}
});

test('mini manual target uses only the mapped climate and respects control/availability/limits',async()=>{
  const h=await setup({demo:true,layout:'mini',zone_id:'lounge'});try{
    const calls=[];h.card._config.demo=false;h.card._status='connected';h.card._data.observe_only=false;const z=h.card._miniZone();z.climate_entity='climate.test_lounge';h.card._hass={callService:async(...args)=>calls.push(args)};
    await h.card._miniSetTarget(21);assert.equal(calls.length,1);assert.equal(calls[0][0],'climate');assert.equal(calls[0][1],'set_temperature');assert.equal(calls[0][2].temperature,21);assert.equal(calls[0][3].entity_id,'climate.test_lounge');
    await h.card._miniSetTarget(99);assert.equal(calls.length,1);await h.card._miniSetTarget(21.1);assert.equal(calls.length,1);
    h.card._data.observe_only=true;await h.card._miniSetTarget(22);h.card._data.observe_only=false;z.boost.active=true;await h.card._miniSetTarget(22);z.boost.active=false;z.mode='unavailable';await h.card._miniSetTarget(22);assert.equal(calls.length,1);
    h.card._config.zone_id='missing';h.card._render();assert.match(h.root.textContent,/zone unavailable/);assert.equal(h.root.querySelector('[data-mini-target]'),null);
  }finally{h.close();}
});

test('occupancy override is a zone setting and conditionally appears alongside schedules',async()=>{
  const h=await setup();try{
    const z=h.card._zone();Object.assign(z.smart.policy,{entities:[{entity_id:'person.worker',home_state:'home',away_state:'not_home'}],comfort_target:20,comfort_days:['mon','tue','wed','thu','fri']});
    h.card._hass={states:{'person.worker':{attributes:{friendly_name:'Worker <script>unsafe</script>'}}}};
    h.card._render();assert.match(h.root.querySelector('.occupancy-summary').textContent,/Minimum 20.0°C when occupied/);assert.equal(h.root.querySelector('.occupancy-summary script'),null);
    click(h.root,'nav','[data-view="schedules"]');assert.equal(h.root.querySelectorAll('.week-row .occupancy-track').length,5);assert.ok(h.root.querySelector('.period-list').previousElementSibling.classList.contains('occupancy-summary'));
    click(h.root,'occupancy-settings');assert.equal(h.card._view,'settings');assert.match(h.root.querySelector('.occupancy-settings').textContent,/Keep this zone at a minimum temperature/);assert.equal(h.root.querySelector('[role="switch"]').checked,true);
    const toggle=h.root.querySelector('[role="switch"]');toggle.checked=false;toggle.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));click(h.root,'smart-save-presence');await settle();assert.equal(z.smart.policy.comfort_target,null);assert.equal(h.card._data.zones[1].smart.policy.comfort_target,null);
    click(h.root,'nav','[data-view="schedules"]');assert.equal(h.root.querySelector('.occupancy-summary'),null);
  }finally{h.close();}
});

test('occupancy override needs inputs and days, and saved day selections survive snapshots',async()=>{
  const h=await setup();try{
    click(h.root,'nav','[data-view="settings"]');
    let toggle=h.root.querySelector('[role="switch"]');toggle.checked=true;toggle.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));setSmart(h,'comfort_target','20');
    click(h.root,'smart-save-presence');await settle();assert.match(h.root.textContent,/Choose at least one person/);assert.equal(h.card._zone().smart.policy.comfort_target,null);
    h.card._zone().smart.policy.entities=[{entity_id:'person.worker',home_state:'home',away_state:'not_home'}];h.card._render();
    const day=h.root.querySelector('[data-comfort-day="fri"]');day.checked=false;day.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));
    h.card._receive(structuredClone(h.card._data));assert.equal(h.root.querySelector('[data-comfort-day="fri"]').checked,false);assert.equal(h.root.querySelector('[role="switch"]').checked,true);
    click(h.root,'smart-save-presence');await settle();assert.equal(h.card._zone().smart.policy.comfort_target,20);assert.deepEqual([...h.card._zone().smart.policy.comfort_days],['mon','tue','wed','thu']);
  }finally{h.close();}
});

test('boost start and cancel update only the selected demo zone',async()=>{const h=await setup();try{const box=h.root.querySelector('[data-smart-zone="bedroom"]');box.querySelector('[data-boost="target"]').value='22';click(h.root,'smart-boost-start','[data-zone="bedroom"]');await settle();assert.equal(h.card._data.zones[0].proposed_target,22);assert.equal(h.card._data.zones[0].source,'boost');assert.equal(h.card._data.zones[1].source,'schedule');click(h.root,'smart-boost-cancel','[data-zone="bedroom"]');await settle();assert.equal(h.card._data.zones[0].source,'schedule');assert.equal(h.card._data.zones[0].smart.boost,null);}finally{h.close();}});

test('demo boost expires at its original deadline when clock advances',async()=>{const h=await setup();try{click(h.root,'smart-boost-start','[data-zone="bedroom"]');await settle();const until=h.card._zone().smart.boost.until;assert.ok(until);click(h.root,'nav','[data-view="automation"]');click(h.root,'smart-advance');await settle();assert.equal(h.card._zone().smart.boost,null);assert.equal(h.card._zone().proposed_target,16);}finally{h.close();}});

test('presence override duration and reset are wired',async()=>{const h=await setup();try{click(h.root,'nav','[data-view="automation"]');setSmart(h,'override_minutes','30');click(h.root,'smart-presence-away');await settle();assert.equal(h.card._zone().presence,'away');assert.equal(h.card._zone().proposed_target,16);click(h.root,'smart-advance');await settle();assert.equal(h.card._zone().presence,'schedule');click(h.root,'smart-presence-home');await settle();click(h.root,'smart-presence-auto');await settle();assert.equal(h.card._zone().smart.override,null);}finally{h.close();}});

test('holiday save overrides targets and cancel resumes latest rules',async()=>{const h=await setup();try{click(h.root,'nav','[data-view="automation"]');setSmart(h,'holiday_start','2026-11-16T08:20');setSmart(h,'holiday_end','2026-11-17T18:00');setSmart(h,'holiday_target','17');click(h.root,'smart-holiday-save');await settle();assert.equal(h.card._zone().source,'holiday');assert.equal(h.card._zone().proposed_target,17);click(h.root,'smart-presence-away');await settle();assert.equal(h.card._zone().source,'holiday');click(h.root,'smart-holiday-cancel');await settle();assert.equal(h.card._zone().source,'away');assert.equal(h.card._zone().proposed_target,16);}finally{h.close();}});

test('holiday exception requires acknowledgement and preserves custom boost request',async()=>{const h=await setup();try{click(h.root,'nav','[data-view="automation"]');setSmart(h,'holiday_start','2026-11-16T08:20');setSmart(h,'holiday_end','2026-11-17T18:00');setSmart(h,'holiday_exceptions','true');click(h.root,'smart-holiday-save');await settle();click(h.root,'nav','[data-view="dashboard"]');const box=h.root.querySelector('[data-smart-zone="bedroom"]');box.querySelector('[data-boost="target"]').value='24';box.querySelector('[data-boost="minutes"]').value='45';click(h.root,'smart-boost-start','[data-zone="bedroom"]');await settle();assert.ok(h.root.querySelector('[role="dialog"]'));assert.equal(h.card._zone().smart.boost,null);click(h.root,'holiday-boost-confirm');await settle();assert.equal(h.card._zone().smart.boost.target,24);assert.equal(h.card._zone().smart.boost.until,'2026-11-16T09:10:00.000Z');}finally{h.close();}});

test('holiday wall clock rejects spring gap and repeated autumn hour',async()=>{const h=await setup();try{assert.throws(()=>h.card._parseWall('2026-03-29T01:30'),/does not exist/);assert.throws(()=>h.card._parseWall('2026-10-25T01:30'),/occurs twice/);assert.equal(h.card._parseWall('2026-07-10T09:00'),'2026-07-10T08:00:00.000Z');}finally{h.close();}});

test('policy forms retain draft values across incoming snapshots and reject stale revisions',async()=>{const h=await setup();try{click(h.root,'nav','[data-view="automation"]');setSmart(h,'away_target','18');const snapshot=structuredClone(h.card._data);snapshot.zones[0].smart.policy_revision=2;h.card._receive(snapshot);assert.equal(h.root.querySelector('[data-smart-field="away_target"]').value,'18');h.card._config.demo=false;let request;h.card._hass={callWS:async msg=>{request=msg;throw {message:'Policy changed elsewhere; reload the rules before saving'};}};click(h.root,'smart-save-presence');await settle();assert.equal(request.payload.revision,1);assert.equal(request.payload.policy.away_target,18);assert.match(h.root.textContent,/Policy changed elsewhere/);assert.equal(h.root.querySelector('[data-smart-field="away_target"]').value,'18');click(h.root,'smart-reset');assert.equal(h.root.querySelector('[data-smart-field="away_target"]').value,'16');}finally{h.close();}});

test('read-only users have all smart mutations disabled',async()=>{const h=await setup();try{h.card._data.can_edit=false;h.card._render();assert.equal(h.root.querySelector('[data-action="smart-boost-start"]').disabled,true);click(h.root,'nav','[data-view="automation"]');assert.equal(h.root.querySelector('[data-action="smart-save-presence"]').disabled,true);await h.card._smartAction('presence-away',{});assert.equal(h.card._zone().smart.override,null);}finally{h.close();}});

test('presence entity editor keeps explicit state mappings',async()=>{const h=await setup();try{h.card._hass={states:{'person.example':{attributes:{friendly_name:'Example person'}}}};click(h.root,'nav','[data-view="automation"]');click(h.root,'smart-add-person');const picker=h.root.querySelector('[data-presence-key="entity_id"]');picker.value='person.example';picker.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));click(h.root,'smart-save-presence');await settle();assert.deepEqual(Array.from(h.card._zone().smart.policy.entities,x=>({...x})),[{entity_id:'person.example',home_state:'home',away_state:'not_home'}]);}finally{h.close();}});


test('schedule import validates a preview and never saves until Save week',async()=>{
 const h=await setup();try{
  click(h.root,'nav','[data-view="settings"]');click(h.root,'transfer-import');
  const backup={format:'smart-heating-scheduler/schedule',version:1,unit:'°C',week:structuredClone(h.card._zone().week)};backup.week.mon[0].temperature=18;
  const input=h.root.querySelector('[data-import-text]');input.value=JSON.stringify(backup);input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
  click(h.root,'transfer-preview');assert.equal(h.card._zone().week.mon[0].temperature,16);assert.match(h.root.textContent,/Validated/);
  click(h.root,'transfer-apply');assert.equal(h.card._draft.mon[0].temperature,18);assert.equal(h.card._zone().week.mon[0].temperature,16);
  click(h.root,'save');await settle();assert.equal(h.card._zone().week.mon[0].temperature,18);
 }finally{h.close();}
});
test('schedule import rejects incompatible units, out of bounds and stale destinations',async()=>{
 const h=await setup();try{
  await h.card._transferAction('import');
  const data={format:'smart-heating-scheduler/schedule',version:1,unit:'°F',week:structuredClone(h.card._zone().week)};
  h.card._dialog.text=JSON.stringify(data);await h.card._transferAction('preview');assert.match(h.root.textContent,/units differ/);assert.equal(h.card._dialog.week,null);
  data.unit='°C';data.week.mon[0].temperature=100;h.card._dialog.text=JSON.stringify(data);await h.card._transferAction('preview');assert.equal(h.card._dialog.week,null);
  data.week.mon[0].temperature=18;h.card._dialog.text=JSON.stringify(data);await h.card._transferAction('preview');h.card._zone().revision++;await h.card._transferAction('apply');assert.match(h.root.textContent,/destination schedule changed/);assert.equal(h.card._draft,null);
 }finally{h.close();}
});
test('frost requires opt in and learning feedback is visible without cluttering mini cards',async()=>{
 const h=await setup();try{
  click(h.root,'nav','[data-view="settings"]');let input=h.root.querySelector('[data-feature="frost_enabled"]');assert.equal(input.checked,false);input.click();
  assert.equal(h.card._featureSettings().frost_target,h.card._zone().limits.minimum);
  assert.equal(h.root.querySelector('[data-feature="frost_while_off"]').checked,false);
  click(h.root,'feature-save');await settle();assert.equal(h.card._zone().insights.settings.frost_enabled,true);assert.equal(h.card._zone().insights.frost.state,'waiting');
  input=h.root.querySelector('[data-feature="preheat_enabled"]');input.click();assert.ok(h.root.querySelector('[aria-label="Preheating learning progress"]'));assert.match(h.root.textContent,/not an accuracy score/);
  h.card._data.can_edit=false;h.card._render();assert.equal(h.root.querySelector('[data-feature="frost_enabled"]').closest('fieldset').disabled,true);
 }finally{h.close();}
});

test('zone settings restore requires disabled destination and explicit mapping acknowledgement',async()=>{
 const h=await setup();try{
  const z=h.card._zone();await h.card._transferAction('import');
  h.card._dialog.text=JSON.stringify({format:'smart-heating-scheduler/zone',version:1,unit:z.unit,week:z.week,policy:z.smart.policy,features:{...z.insights.settings,preheat_enabled:true}});
  await h.card._transferAction('preview');assert.ok(h.card._dialog.configuration);
  await h.card._transferAction('restore');assert.match(h.root.textContent,/Disable the destination/);assert.equal(z.insights.settings.preheat_enabled,false);
  z.enabled=false;h.card._dialog.ack=true;await h.card._transferAction('restore');assert.equal(z.insights.settings.preheat_enabled,true);assert.equal(z.enabled,false);assert.equal(h.card._dialog,null);
 }finally{h.close();}
});

test('frost uses hardware minimum independently of schedule and manual limits',async()=>{
 const h=await setup();try{
  const z=h.card._zone();z.frost_limits={minimum:5,maximum:28,step:.5};
  click(h.root,'nav','[data-view="settings"]');h.root.querySelector('[data-feature="frost_enabled"]').click();
  const input=h.root.querySelector('[data-feature="frost_target"]');assert.equal(input.min,'5');input.value='12';input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
  click(h.root,'feature-save');await settle();assert.equal(z.insights.settings.frost_target,12);assert.equal(z.limits.minimum,16);assert.match(h.root.textContent,/Normal schedule and manual limits are unchanged/);
 }finally{h.close();}
});

test('failed settings save remains visible beside Save across live updates and clears after success',async()=>{
 const h=await setup();try{
  click(h.root,'nav','[data-view="settings"]');h.root.querySelector('[data-feature="frost_enabled"]').click();
  const input=h.root.querySelector('[data-feature="frost_target"]');input.value='12';input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
  const server=structuredClone(h.card._data);h.card._error='Cannot connect to the scheduler';h.card._receive(structuredClone(server));assert.equal(h.card._error,'');h.card._config.demo=false;h.card._status='connected';
  h.card._hass={callWS:async()=>{throw Error('Target outside reviewed limits');}};
  click(h.root,'feature-save');await settle();h.card._receive(structuredClone(server));
  assert.ok(h.card._featureDraft);assert.match(h.root.querySelector('[data-feature-save-error]').textContent,/Target outside reviewed limits/);assert.match(h.root.textContent,/Save failed · changes not applied/);
  h.card._hass.callWS=async()=>server;click(h.root,'feature-save');await settle();
  assert.equal(h.card._featureDraft,null);assert.equal(h.root.querySelector('[data-feature-save-error]'),null);assert.match(h.root.textContent,/Zone features updated/);
 }finally{h.close();}
});

test('preheating shows the actual pause reason and explains presence independence',async()=>{
 const h=await setup();try{
  const z=h.card._zone();z.insights.settings.preheat_enabled=true;z.insights.preheat.state='paused';z.insights.preheat.pause_reason='Holiday is active';
  click(h.root,'nav','[data-view="settings"]');assert.match(h.root.textContent,/Holiday is active/);assert.match(h.root.textContent,/Presence alone does not pause/);
 }finally{h.close();}
});


test('household users can boost in full and mini cards without editing settings or manual dial',async()=>{
  for(const mini of [false,true]){
    const h=await setup(mini?{demo:true,layout:'mini',zone_id:'bedroom'}:{demo:true});try{
      h.card._data.can_edit=false;h.card._data.zones[0].can_boost=true;h.card._data.zones[1].can_boost=false;h.card._render();
      assert.equal(h.root.querySelector('[data-boost="minutes"]').disabled,false);
      click(h.root,'smart-boost-start','[data-zone="bedroom"]');await settle();
      assert.ok(h.card._data.zones[0].smart.boost);
      click(h.root,'smart-boost-cancel','[data-zone="bedroom"]');await settle();
      assert.equal(h.card._data.zones[0].smart.boost,null);
      await h.card._smartAction('boost-start',{zone:'lounge'});assert.equal(h.card._data.zones[1].smart.boost,null);
      await h.card._smartAction('presence-away',{zone:'bedroom'});assert.equal(h.card._data.zones[0].smart.override,null);
      if(mini)assert.equal(h.root.querySelector('[data-mini-dial]').getAttribute('aria-disabled'),'true');
      else {click(h.root,'nav','[data-view="schedules"]');assert.equal(h.root.querySelector('[data-action="edit"]').disabled,true);}
      h.card._status='disconnected';assert.equal(h.card._canBoost(h.card._zone()),false);
      h.card._status='demo';h.card._data.zones[0].can_boost=false;h.card._render();
      if(!mini)click(h.root,'nav','[data-view="dashboard"]');
      assert.equal(h.root.querySelector('[data-action="smart-boost-start"]').disabled,true);
    }finally{h.close();}
  }
});


test('running boost locks the full-card target and duration while Stop stays available',async()=>{
  const h=await setup();try{
    const box=h.root.querySelector('[data-smart-zone="bedroom"]');box.querySelector('[data-boost="target"]').value='24';
    click(h.root,'smart-boost-start','[data-zone="bedroom"]');await settle();
    const active=h.root.querySelector('[data-smart-zone="bedroom"]');
    assert.equal(active.querySelector('[data-boost="target"]').disabled,true);
    assert.equal(active.querySelector('[data-boost="target"]').value,'24');
    assert.equal(active.querySelector('[data-boost="minutes"]').disabled,true);
    assert.match(active.textContent,/Temperature locked/);
    click(h.root,'smart-boost-cancel','[data-zone="bedroom"]');await settle();
    assert.equal(h.root.querySelector('[data-smart-zone="bedroom"] [data-boost="target"]').disabled,false);
    assert.equal(h.root.querySelector('[data-smart-zone="bedroom"] [data-boost="minutes"]').disabled,false);
  }finally{h.close();}
});

test('a boost arriving during dial drag immediately locks the mini card without sending a target',async()=>{
  const h=await setup({demo:true,layout:'mini',zone_id:'lounge'});try{
    const calls=[];h.card._config.demo=false;h.card._status='connected';h.card._data.observe_only=false;h.card._hass={callService:async(...args)=>calls.push(args)};
    h.card._render();const dial=h.root.querySelector('[data-mini-dial]');dial.getBoundingClientRect=()=>({left:100,top:100,width:200,height:200});
    dial.dispatchEvent(new h.dom.window.MouseEvent('pointerdown',{bubbles:true,cancelable:true,clientX:200,clientY:100,button:0}));assert.ok(h.card._dialDrag);
    const next=structuredClone(h.card._data),z=next.zones.find(z=>z.id==='lounge');z.boost.active=true;z.boost.can_cancel=true;z.smart.boost={target:25,until:'2026-11-16T09:00:00.000Z'};z.device_target=25;z.source='boost';
    h.card._receive(next);assert.equal(h.card._dialDrag,null);assert.equal(h.card._miniTarget,null);
    const locked=h.root.querySelector('[data-mini-dial]');assert.equal(locked.getAttribute('aria-disabled'),'true');assert.match(locked.textContent,/Boost · locked/);
    assert.equal(h.root.querySelector('[data-boost="minutes"]').disabled,true);assert.equal(h.root.querySelector('[data-action="smart-boost-cancel"]').disabled,false);
    locked.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));await h.card._miniSetTarget(26);assert.equal(calls.length,0);
    z.boost.active=false;z.smart.boost=null;z.source='schedule';h.card._receive(next);assert.equal(h.root.querySelector('[data-mini-dial]').getAttribute('aria-disabled'),'false');
  }finally{h.close();}
});

test('receiver ownership and clock writes require a paused zone and their exact acknowledgement',async()=>{
  const h=await setup();try{
    const z=h.card._zone(),calls=[];h.card._config.demo=false;h.card._status='connected';h.card._view='settings';z.enabled=true;z.receiver={state:'verified',handover_available:true};
    h.card._hass={connection:{connected:true},callWS:async request=>{calls.push(request);return {...z.receiver};}};
    h.card._render();assert.equal(h.root.querySelector('[data-action="receiver-enable_owner"]').disabled,true);
    z.enabled=false;h.card._render();assert.equal(h.root.querySelector('[data-action="receiver-enable_owner"]').disabled,true);
    const input=h.root.querySelector('[data-receiver-extra-ack="enable_owner"]');input.value='USE RECEIVER SCHEDULE';input.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
    click(h.root,'receiver-enable_owner');await settle();assert.deepEqual({...calls[0].payload},{revision:z.revision,acknowledgement:'USE RECEIVER SCHEDULE'});
    const sync=h.root.querySelector('[data-receiver-extra-ack="synchronize_clock"]');sync.value='SYNCHRONIZE RECEIVER CLOCK';sync.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));click(h.root,'receiver-synchronize_clock');await settle();assert.equal(calls[1].action,'synchronize_clock');assert.deepEqual({...calls[1].payload},{acknowledgement:'SYNCHRONIZE RECEIVER CLOCK'});
  }finally{h.close();}
});
test('receiver transition summaries replace stale preparations without implying qualification passed',async()=>{
  const h=await setup();try{
    const z=h.card._zone();h.card._config.demo=false;h.card._status='connected';h.card._view='settings';z.receiver={state:'verified',transition:{state:'restored',updated_at:'2026-11-23T12:20:00Z',first_observed:false,second_observed:true,restoration_verified:true,error:'First boundary missed'}};
    h.card._receiverRecords={[h.card._receiverKey()]:{state:'verified',transition:{state:'prepared',updated_at:'2026-11-23T12:10:00Z'}}};
    h.card._render();assert.equal(h.root.querySelector('[data-action="receiver-start_transition"]'),null);assert.match(h.root.textContent,/Lower target observed: not yet/);assert.match(h.root.textContent,/First boundary missed/);assert.equal(h.root.querySelector('[data-action="receiver-enable_owner"]').disabled,true);
  }finally{h.close();}
});


test('Hive tiles keep target controls in the dialog and isolate mode changes by zone',async()=>{
  const h=await setup({demo:true,thermostat_style:'hive'});try{
    assert.equal(h.root.querySelectorAll('.hive-thermostat').length,2);
    assert.equal(h.root.querySelectorAll('[data-boost="target"]').length,0);
    const z=h.card._data.zones[1],first=h.card._data.zones[0],before=first.mode;
    click(h.root,'hive-mode',`[data-zone="${z.id}"][data-mode="off"]`);await settle();
    assert.equal(z.mode,'off');assert.equal(first.mode,before);
    click(h.root,'hive-mode',`[data-zone="${z.id}"][data-mode="manual"]`);await settle();
    assert.equal(z.mode,'heat');assert.equal(z.source,'manual');
    click(h.root,'hive-boost',`[data-zone="${z.id}"]`);
    assert.ok(h.root.querySelector('[role="dialog"][aria-label="Boost heating"]'));
    assert.equal(h.root.querySelectorAll('[data-boost="target"]').length,1);
    assert.equal(h.root.querySelector('[data-smart-zone]').dataset.smartZone,z.id);
  }finally{h.close();}
});

test('Hive full dashboard keyboard dial changes the addressed zone only',async()=>{
  const h=await setup({demo:true,thermostat_style:'hive'});try{
    const [first,second]=h.card._data.zones,original=first.device_target;
    const dial=h.root.querySelector(`[data-mini-dial="${second.id}"]`),target=second.device_target;
    dial.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));await settle();
    assert.equal(second.device_target,target+(second.limits.step||0.5));
    assert.equal(first.device_target,original);
  }finally{h.close();}
});

test('Hive mini boost dialog works for household users while modes and dial stay disabled',async()=>{
  const h=await setup({demo:true,layout:'mini',thermostat_style:'hive'});try{
    const z=h.card._miniZone();h.card._data.can_edit=false;z.can_boost=true;h.card._render();
    assert.equal(h.root.querySelector('[data-action="hive-mode"]').disabled,true);
    assert.equal(h.root.querySelector('[data-mini-dial]').getAttribute('aria-disabled'),'true');
    click(h.root,'hive-boost');assert.ok(h.root.querySelector('[role="dialog"]'));
    assert.equal(h.root.querySelector('[data-action="smart-boost-start"]').disabled,false);
    click(h.root,'close');assert.equal(h.root.querySelector('[role="dialog"]'),null);
  }finally{h.close();}
});

test('Hive native overlay locks the dial and preserves readable occupancy status',async()=>{
  const h=await setup({demo:true,layout:'mini',thermostat_style:'hive'});try{
    const z=h.card._miniZone();z.receiver={schedule_owner:'receiver',ownership:{hardware:{mode:'boost'},lease:{target:2000}}};z.source='occupied_comfort';h.card._render();
    assert.match(h.root.querySelector('.hive-badge').textContent,/Occupied/);
    assert.equal(h.root.querySelector('[data-mini-dial]').getAttribute('aria-disabled'),'true');
    const value=z.device_target;h.root.querySelector('[data-mini-dial]').dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));await settle();assert.equal(z.device_target,value);
    assert.match(h.root.querySelector('.hive-context').textContent,/Occupancy override/);
  }finally{h.close();}
});

test('Hive live mode actions require backend support and send explicit selected-zone commands',async()=>{
  const h=await setup({demo:true,thermostat_style:'hive'});try{
    const calls=[],z=h.card._data.zones[1];h.card._config.demo=false;h.card._status='connected';h.card._data.observe_only=false;
    h.card._hass={connection:{connected:true},callWS:async request=>{calls.push(request);return structuredClone(h.card._data);}};
    h.card._render();assert.equal(h.root.querySelector('[data-action="hive-mode"]').disabled,true);
    h.card._data.thermostat_mode_control=true;h.card._render();
    click(h.root,'hive-mode',`[data-zone="${z.id}"][data-mode="manual"]`);await settle();
    assert.equal(calls.length,1);assert.equal(calls[0].zone_id,z.id);assert.equal(calls[0].action,'thermostat_mode');assert.equal(calls[0].payload.mode,'manual');
  }finally{h.close();}
});


test('fresh receiver Off disables Hive and classic dials despite a stale HA Heat state',async()=>{
  for(const style of ['hive','classic']){
    const h=await setup({demo:true,layout:'mini',thermostat_style:style});try{
      const z=h.card._miniZone(),target=z.device_target;z.mode='heat';z.source='off';z.receiver={schedule_owner:'receiver',ownership:{hardware:{mode:'off'}}};h.card._render();
      const dial=h.root.querySelector('[data-mini-dial]');assert.equal(dial.getAttribute('aria-disabled'),'true');
      dial.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));await settle();assert.equal(z.device_target,target);
      assert.equal(h.card._miniCanSet(z),false);
    }finally{h.close();}
  }
});


test('Hive mini More opens its configured scheduler directly and status describes the current mode',async()=>{
  const h=await setup({demo:true,layout:'mini',thermostat_style:'hive',dashboard_path:'/heating-scheduler-preview/heating'});try{
    const z=h.card._miniZone();z.receiver={schedule_owner:'receiver',ownership:{hardware:{mode:'schedule'}}};z.source='schedule';h.card._render();
    const link=h.root.querySelector('a.hive-more');assert.ok(link);assert.equal(link.getAttribute('href'),'/heating-scheduler-preview/heating');assert.equal(h.root.querySelector('[data-action="hive-more"]'),null);
    assert.equal(h.root.querySelector('.hive-context').textContent,'Following schedule');assert.doesNotMatch(h.root.textContent,/Schedule stored on receiver/);
    for(const [mode,text] of [['manual','Manual temperature'],['off','Heating off']]){z.receiver.ownership.hardware.mode=mode;h.card._render();assert.equal(h.root.querySelector('.hive-context').textContent,text);}
    h.card._config.dashboard_path='//example.com';h.card._render();assert.equal(h.root.querySelector('a.hive-more'),null);assert.ok(h.root.querySelector('[data-action="hive-more"]'));
  }finally{h.close();}
});
