import {clone, escapeHTML as e, DAYS, periodIndex, remainingText} from './model.js';

export function defaultSmart() {
  return {policy:{entities:[],home_rule:'any',away_minutes:10,return_minutes:0,unknown_minutes:10,unknown_fallback:'schedule',away_target:16,comfort_target:null,comfort_days:DAYS.slice(0,5),comfort_start:'08:30',comfort_end:'16:30',boost_owner:'builtin',boost_target:21,boost_minutes:30,boost_max_minutes:120,start_script:'',cancel_script:'',duration_helper:'',timer:'',completion_event:'',completion_field:'zone',completion_value:''},presence:{trusted:null,candidate:null,since:null,unknown_since:null},override:null,boost:null,holiday:null,external_operation:null,external_was_active:false,policy_revision:1};
}

export function resolveDemo(card) {
  const now=Date.parse(card._now()), local=card._local();
  for(const z of card._data.zones) {
    const s=z.smart ||= defaultSmart(), p=s.policy;
    if(s.boost && Date.parse(s.boost.until)<=now) {if(s.boost.return_off)z.mode='off';s.boost=null;}
    if(s.override?.until && Date.parse(s.override.until)<=now)s.override=null;
    if(s.holiday && Date.parse(s.holiday.end)<=now)s.holiday=null;
    const holiday=s.holiday && Date.parse(s.holiday.start)<=now;
    if(holiday && !s.holiday.applied){s.holiday.applied=true;if(s.boost && !s.boost.holiday_exception)s.boost=null;}
    z.presence=s.override?.mode || 'schedule';z.presence_raw='schedule';
    z.source='schedule';z.proposed_target=z.week[local.day][periodIndex(z.week[local.day],local.minute)].temperature;
    z.reason='Following the current weekly period';
    if(z.presence==='away' && p.away_target!==null){z.source='away';z.proposed_target=p.away_target;z.reason='Forced Away presence override';}
    if(z.presence==='home' && p.comfort_target!==null && p.comfort_days.includes(local.day) && p.comfort_start<=local.time && local.time<p.comfort_end){z.source='occupied_comfort';z.proposed_target=Math.max(z.proposed_target,p.comfort_target);z.reason='Occupied comfort minimum during configured hours';}
    if(holiday){z.source='holiday';z.proposed_target=s.holiday.target;z.reason='Holiday target; current rules resume on return';}
    if(z.mode==='off'){z.source='off';z.proposed_target=null;}
    if(s.boost && (!holiday || (s.holiday.exceptions && s.boost.holiday_exception))){z.source='boost';z.proposed_target=s.boost.target;z.reason='Timed boost; current rules resume at its deadline';}
    z.boost={owner:p.boost_owner,active:!!s.boost,until:s.boost?.until,can_start:!s.boost && p.boost_owner==='builtin' && p.boost_target!==null,can_cancel:!!s.boost};
    const wall=card._wallTime(card._now());
    const next=z.week[local.day].find(period=>period.start>local.time);
    const nextDay=new Date(Date.parse(wall.slice(0,10)+'T12:00Z')+86400000).toISOString().slice(0,10);
    const weekly=card._parseWall(next?wall.slice(0,10)+'T'+next.start:nextDay+'T00:00');
    const deadlines=[weekly,s.boost?.until,s.override?.until,s.holiday?.start,s.holiday?.end].filter(iso=>iso&&Date.parse(iso)>now);
    z.next_evaluation=new Date(Math.min(...deadlines.map(Date.parse))).toISOString();
  }
}

const btn=(label,action,disabled=false,attrs='',cls='')=>`<button type="button" data-action="smart-${action}" ${attrs} ${disabled?'disabled':''} class="${cls}">${e(label)}</button>`;

export const smartUI = {
  _smartValue(key,fallback) {return this._smartInputs?.[this._zone().id]?.[key] ?? fallback;},
  _smartInput(key,label,value,type='number',attrs='') {return `<label>${e(label)}<input data-smart-field="${key}" type="${type}" value="${e(String(this._smartValue(key,value)??''))}" ${attrs}></label>`;},
  _smartSelect(key,label,value,options) {const selected=this._smartValue(key,value);return `<label>${e(label)}<select data-smart-field="${key}">${options.map(([v,t])=>`<option value="${e(v)}" ${String(selected)===String(v)?'selected':''}>${e(t)}</option>`).join('')}</select></label>`;},
  _smartBoostControls(z) {
    const s=z.smart, p=s?.policy;
    if(!p)return '<small>Update the integration to configure smart controls.</small>';
    const disabled=!this._canBoost(z) || this._saving;
    const locked=!!z.boost.active;
    const boostDraft=locked?{target:s.boost?.target??p.boost_target}:this._boostInputs?.[z.id]||{};
    return `<div data-smart-zone="${e(z.id)}"><fieldset ${disabled?'disabled':''}><div class="form-grid"><label>Boost target (${e(z.unit)})<input data-boost="target" type="number" min="${z.limits.minimum}" max="${z.limits.maximum}" step="${z.limits.step||'any'}" value="${e(boostDraft.target??p.boost_target??'')}" ${locked||p.boost_owner!=='builtin'?'disabled':''}></label><label>Minutes<input data-boost="minutes" type="number" min="1" max="${p.boost_max_minutes}" step="1" value="${e(boostDraft.minutes??p.boost_minutes)}" ${locked||p.boost_owner==='external'&&!p.duration_helper?'disabled':''}></label></div><div class="boost-controls"><small>${z.boost.active?e(remainingText(z.boost.until,this._now()))+' · ':''}${locked?'Temperature locked · stop boost to adjust':p.boost_owner==='external'?'External scripts · fixed declared target':this._data.observe_only?'Observe-only boost · heating unchanged':'Timed heating boost'}</small>${btn(z.boost.active?'Stop boost':'Start boost',z.boost.active?'boost-cancel':'boost-start',disabled || !(z.boost.active?z.boost.can_cancel:z.boost.can_start),`data-zone="${e(z.id)}"`,'primary')}</div></fieldset></div>`;
  },
  _smartPresenceButtons() {
    const z=this._zone(), disabled=!this._canEdit()||this._saving;
    return `<div class="fact-row"><span>Presence</span><b>${e(z.presence||'schedule')}</b></div>${z.smart?.override?`<small>Override ${z.smart.override.until?'until '+e(this._formatTime(z.smart.override.until)):'until cleared'}</small>`:''}<div class="toolbar" style="margin-top:12px">${['auto','home','away'].map(m=>btn({auto:'Auto',home:'Home',away:'Away'}[m],'presence-'+m,disabled,`aria-pressed="${(z.smart?.override?.mode||'auto')===m}"`)).join('')}</div>${btn(this._data.observe_only?'Clear manual hold':'Resume schedule','resume',disabled)}${this._smartSelect('override_minutes','Override duration','120',[['30','30 minutes'],['120','2 hours'],['480','8 hours'],['boundary','Until next period'],['forever','Until cleared']])}`;
  },
  _smartAutomation() {
    const z=this._zone(), s=z.smart;
    if(!s)return '<section class="panel">Update the integration to enable smart modes.</section>';
    const p=s.policy, disabled=!this._canEdit()||this._saving;
    const selected=this._smartValue('entities',p.entities), available=Object.entries(this._hass?.states||{}).filter(([id])=>/^(person|device_tracker|binary_sensor)\./.test(id));
    const holiday=s.holiday;
    const now=new Date(this._now());
    return `<div class="zone-picker"><div><div class="eyebrow">Smart modes · per zone</div><h2>Automation</h2></div>${this._selector()}</div><div class="automation-grid">${this._occupancySettings()}<section class="panel"><h2>Holiday mode</h2><div class="reason"><b>${holiday?'Holiday scheduled':'No holiday planned'}</b><p>${holiday?`${e(this._dateTime(holiday.start))} → ${e(this._dateTime(holiday.end))}`:'Set a start, return and temperature for this zone. Other zones keep their own rules.'}</p></div><fieldset ${disabled?'disabled':''}><div class="form-grid">${this._smartInput('holiday_start','Start (Home Assistant time)',this._wallTime(holiday?.start||now.toISOString()),'datetime-local')}${this._smartInput('holiday_end','Return (Home Assistant time)',this._wallTime(holiday?.end||new Date(now.getTime()+86400000).toISOString()),'datetime-local')}${this._smartInput('holiday_target',`Holiday target (${z.unit})`,holiday?.target??p.away_target,'number',`step="${z.limits.step||'any'}"`)}${this._smartSelect('holiday_exceptions','Timed boost during holiday',String(holiday?.exceptions||false),[['false','Block boost'],['true','Allow an acknowledged exception']])}</div><p class="muted">Times use ${e(this._data.timezone)}. Holiday replaces existing temporary targets and respects manual Off. Current rules resume on return.</p><div class="toolbar">${btn('Save holiday','holiday-save',disabled,'','primary')}${holiday?btn('Cancel holiday','holiday-cancel',disabled):''}</div></fieldset></section><section class="panel"><h2>Temporary occupancy</h2><fieldset ${disabled?'disabled':''}>${this._smartPresenceButtons()}</fieldset><p class="muted">Home removes the Away target. It does not override the weekly target unless an occupied minimum is configured.</p></section><section class="panel"><h2>Control ownership</h2><div class="reason"><b>${this._data.observe_only?'Observe only':'Heating control enabled'}</b><p>${this._data.observe_only?'Smart controls change scheduler proposals only. Existing heating controls remain in charge.':'This scheduler can command the mapped thermostats. Keep previous schedule writers disabled.'}</p></div>${s.external_operation?`<div class="error">External boost handover needs review. Check that restoration finished and the timer is idle.</div>${btn('Confirm restoration completed','reconcile',disabled)}`:''}${this._config.demo?btn('Advance demo clock 30 minutes','advance',false):''}</section></div>`;
  },
  _smartSettings() {
    const z=this._zone(), p=z.smart?.policy;
    if(!p)return '';
    const disabled=!this._canEdit()||this._saving;
    return `<section class="panel"><h2>Boost adapter</h2><fieldset ${disabled?'disabled':''}><div class="form-grid">${this._smartSelect('boost_owner','One boost owner',p.boost_owner,[['builtin','Built-in timed boost'],['external','Existing scripts and timer'],['none','No boost']])}${this._smartInput('boost_target',`Default / fixed external target (${z.unit})`,p.boost_target,'number',`step="${z.limits.step||'any'}"`)}${this._smartInput('boost_minutes','Default duration (minutes)',p.boost_minutes)}${this._smartInput('boost_max_minutes','Maximum duration (minutes)',p.boost_max_minutes)}${this._smartInput('timer','External ownership timer',p.timer,'text','placeholder="timer.example"')}${this._smartInput('start_script','External start script',p.start_script,'text','placeholder="script.example_start"')}${this._smartInput('cancel_script','External cancel script',p.cancel_script,'text','placeholder="script.example_stop"')}${this._smartInput('duration_helper','Optional duration helper',p.duration_helper,'text','placeholder="input_number.example_minutes"')}${this._smartInput('completion_event','Optional completion event',p.completion_event,'text')}${this._smartInput('completion_field','Completion event field',p.completion_field,'text')}${this._smartInput('completion_value','Completion field value',p.completion_value,'text')}</div><p class="muted">Built-in boost needs the external timer removed. External scripts retain their fixed target and helper limits. Observe-only mode never calls them. Map a custom completion event emitted after restoration, with an exact field/value filter. Without it, automatic timer release pauses control until you confirm restoration.</p>${btn('Save boost adapter','save-boost',disabled,'','primary')}${btn('Reload saved rules','reset',disabled)}</fieldset></section><section class="panel"><h2>Heating control mode</h2><p class="muted">Defaults to observe only. Before enabling control, back up the setup and disable competing schedule writers. Enable only after reviewing the zone settings and control handover.</p>${this._smartInput('acknowledgement','To enable, type ENABLE HEATING CONTROL','','text')}<div class="toolbar">${btn(this._data.observe_only?'Enable heating control':'Switch to observe only','mode',disabled||this._config.demo)}${btn('Retry controls','retry',disabled)}</div></section>`;
  },
  _wallTime(iso) {const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:this._data.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso));return parts.replace(' ','T');},
  _dateTime(iso){return new Intl.DateTimeFormat('en-GB',{timeZone:this._data.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(iso));},
  _parseWall(value) {
    // Enumerate possible offsets; require exactly one round-tripping instant.
    const naive=Date.parse(value+'Z');if(!Number.isFinite(naive))throw Error('Choose a valid start and return.');
    const matches=[];for(let offset=-14*60;offset<=14*60;offset+=15){const iso=new Date(naive+offset*60000).toISOString();if(this._wallTime(iso)===value)matches.push(iso);}
    if(matches.length!==1)throw Error(matches.length?'This time occurs twice when clocks change. Choose a time outside the repeated hour.':'This local time does not exist when clocks change. Choose another time.');
    return matches[0];
  },
  async _smartAction(action, data) {
    const z=this._zoneFor(data.zone)||this._zone(), s=z?.smart;
    const boost=action==='boost-start'||action==='boost-cancel';
    if(this._saving || !(boost?this._canBoost(z):this._canEdit()))return;
    if(!s){this._error='Update the integration first.';this._render();return;}
    this._smartInputs ||= {};this._smartInputs[z.id] ||= {};
    const input=this._smartInputs[z.id], p=clone(s.policy);
    const value=(key,fallback)=>input[key]??fallback;
    const numeric=(key,fallback)=>{const raw=value(key,fallback);return raw===''||raw===null?null:Number(raw);};
    const validTarget=target=>{if(!Number.isFinite(target)||target<z.limits.minimum||target>z.limits.maximum||z.limits.step&&Math.abs(target/z.limits.step-Math.round(target/z.limits.step))>1e-6)throw Error('Choose a temperature within reviewed limits and increments.');return target;};
    const until=minutes=>new Date(Date.parse(this._now())+minutes*60000).toISOString();
    try {
      if(action==='reset'){this._smartInputs[z.id]={};if(this._smartPolicyRevisions)delete this._smartPolicyRevisions[z.id];this._error='';this._render();return;}
      if(action==='add-person'){input.entities=clone(value('entities',p.entities));input.entities.push({entity_id:'',home_state:'home',away_state:'not_home'});this._render();return;}
      if(action==='remove-person'){input.entities=clone(value('entities',p.entities));input.entities.splice(Number(data.index),1);this._render();return;}
      if(action==='advance'){this._data.generated_at=until(30);resolveDemo(this);this._render();return;}
      let command, payload={};
      if(action.startsWith('presence-')){
        command='presence';const minutes=value('override_minutes','120');
        payload={mode:action.slice(9),until_next_period:minutes==='boundary',minutes:minutes==='forever'?null:minutes==='boundary'?Math.max(1,Math.ceil((Date.parse(z.next_evaluation)-Date.parse(this._now()))/60000)):Number(minutes)};
      } else if(action==='save-presence'||action==='save-boost') {
        command='policy';
        const fields=action==='save-presence'?['entities','home_rule','away_minutes','return_minutes','unknown_minutes','unknown_fallback','away_target','comfort_target','comfort_days','comfort_start','comfort_end']:['boost_owner','boost_target','boost_minutes','boost_max_minutes','start_script','cancel_script','duration_helper','timer','completion_event','completion_field','completion_value'];
        for(const key of fields)if(key in input)p[key]=['away_minutes','return_minutes','unknown_minutes','away_target','comfort_target','boost_target','boost_minutes','boost_max_minutes'].includes(key)?numeric(key,p[key]):key==='comfort_days'?input[key].split(',').map(x=>x.trim()).filter(Boolean):input[key];
        if(action==='save-presence' && 'comfort_enabled' in input) {
          p.comfort_target=String(input.comfort_enabled)==='true'?validTarget(numeric('comfort_target',p.comfort_target??z.limits.minimum)):null;
        }
        if(action==='save-presence' && p.comfort_target!==null && (!p.entities.length || !p.comfort_days.length))throw Error('Choose at least one person or occupancy sensor and one active day.');
        for(const k of ['away_target','comfort_target','boost_target'])if(p[k]!==null)validTarget(p[k]);
        payload={policy:p,revision:this._smartPolicyRevisions?.[z.id]??s.policy_revision};
      } else if(action==='holiday-save') {
        command='holiday';payload={start:this._parseWall(value('holiday_start',this._wallTime(this._now()))),end:this._parseWall(value('holiday_end',this._wallTime(until(1440)))),target:validTarget(numeric('holiday_target',p.away_target)),exceptions:String(value('holiday_exceptions',s.holiday?.exceptions||false))==='true'};
        if(Date.parse(payload.end)<=Math.max(Date.parse(payload.start),Date.parse(this._now())))throw Error('Return must follow the start and be in the future.');
      } else if(action==='holiday-cancel'){command='holiday';payload={cancel:true};}
      else if(action==='boost-start') {
        command='boost_start';const box=[...this.shadowRoot.querySelectorAll('[data-smart-zone]')].find(el=>el.dataset.smartZone===z.id);
        payload=this._holidayAcknowledged && this._pendingBoost ? {...this._pendingBoost,holiday_exception:true} : {target:validTarget(Number(box.querySelector('[data-boost="target"]').value)),minutes:Number(box.querySelector('[data-boost="minutes"]').value),holiday_exception:!!this._holidayAcknowledged};
        if(!Number.isInteger(payload.minutes)||payload.minutes<1||payload.minutes>p.boost_max_minutes)throw Error('Choose a duration within the configured limit.');
        if(s.holiday && Date.parse(s.holiday.start)<=Date.parse(this._now())&&Date.parse(s.holiday.end)>Date.parse(this._now())&&!payload.holiday_exception){
          if(!s.holiday.exceptions)throw Error('Holiday blocks boost. Change its conflict policy first.');
          this._pendingBoost=payload;this._dialog={kind:'holiday-boost',zone:z.id};this._focusDialog=true;this._render();return;
        }
      } else if(action==='boost-cancel')command='boost_cancel';
      else if(action==='mode'){command='mode';payload={enabled:this._data.observe_only,acknowledgement:value('acknowledgement','')};}
      else if(action==='reconcile'){this._dialog={kind:'reconcile'};this._focusDialog=true;this._render();return;}
      else if(action==='confirm-reconcile'){command='reconcile';payload={confirmed:true};}
      else if(action==='retry')command='retry';
      else if(action==='resume')command='resume';
      if(!command)return;
      this._saving=true;this._error='';this._render();
      if(this._config.demo){
        if(command==='policy'){s.policy=payload.policy;s.policy_revision++;}
        if(command==='presence')s.override=payload.mode==='auto'?null:{mode:payload.mode,until:payload.minutes===null?null:until(payload.minutes)};
        if(command==='holiday')s.holiday=payload.cancel?null:{...payload,applied:false};
        if(command==='boost_start')s.boost={target:payload.target,until:until(payload.minutes),return_off:z.mode==='off',holiday_exception:payload.holiday_exception};
        if(command==='boost_cancel'){if(s.boost?.return_off)z.mode='off';s.boost=null;}
        resolveDemo(this);
      } else {this._data=await this._hass.callWS({type:'smart_heating_scheduler/control',entry_id:this._config.entry_id,zone_id:z.id,action:command,payload});}
      this._holidayAcknowledged=false;this._dialog=null;this._smartInputs[z.id]={};if(this._boostInputs)delete this._boostInputs[z.id];if(this._smartPolicyRevisions)delete this._smartPolicyRevisions[z.id];this._message=this._config.demo?'Saved to this demo only. Your heating is unchanged.':this._data.observe_only?'Scheduler updated in observe-only mode. Heating controls are unchanged.':'Heating controls updated.';
    } catch(error){this._error=error.message||'Control failed. Check current state before trying again.';}
    finally {this._saving=false;this._render();}
  },
};
