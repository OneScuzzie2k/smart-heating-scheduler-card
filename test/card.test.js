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
