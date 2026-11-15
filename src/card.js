import {DAYS, DAY_NAMES, clone, escapeHTML as e, minutes, validateWeek, editPeriod, addPeriod, deletePeriod, copyDay, localParts, periodIndex, demoSnapshot, remainingText} from './model.js';
import {styles} from './styles.js';
import {occupancyUI} from './occupancy-ui.js';
import {smartUI, defaultSmart, resolveDemo} from './smart-ui.js';

const DOMAIN = 'smart_heating_scheduler';
const VIEWS = {dashboard:['⌂','Dashboard'], schedules:['▦','Schedules'], automation:['◷','Automation'], settings:['⚙','Settings']};
const SOURCES = {boost:'Timed boost', holiday:'Holiday', away:'Away target', occupied_comfort:'Occupancy override', boost_handover:'Boost handover needs review', schedule:'Following schedule', manual:'Manual override', manual_off:'Manual off', off:'Thermostat off', external_boost:'External boost', boost_unknown:'Boost status unknown', unavailable:'Thermostat unavailable', unsupported:'Review thermostat capabilities', disabled:'Scheduler disabled', error:'Review required'};
const button = (label, action, attrs = '', cls = '') => `<button type="button" data-action="${action}" class="${cls}" ${attrs}>${e(label)}</button>`;

export class SmartHeatingSchedulerCard extends HTMLElement {
  constructor() {
    super(); this.attachShadow({mode:'open'});
    this._view = 'dashboard'; this._day = 'mon'; this._zoneId = null; this._data = null;
    this._draft = null; this._history = []; this._revision = null; this._dialog = null;
    this._error = ''; this._message = ''; this._saving = false; this._status = 'waiting';
    this._generation = 0; this._retryDelay = 2000; this._unsub = null;
    this.shadowRoot.addEventListener('click', event => {
      const target = event.target.closest('button[data-action]');
      if (target && !target.disabled) this._action(target.dataset.action, target.dataset);
    });
    this.shadowRoot.addEventListener('change', event => {
      const target = event.target;
      if(target.dataset.smartField || target.dataset.presenceIndex!==undefined)target.dispatchEvent(new Event('input',{bubbles:true}));
      if(target.dataset.comfortDay){
        this._smartInputs ||= {}; const input=this._smartInputs[this._zone().id] ||= {};
        this._smartPolicyRevisions ||= {}; this._smartPolicyRevisions[this._zone().id] ??= this._zone().smart.policy_revision;
        const selected=new Set((input.comfort_days??this._zone().smart.policy.comfort_days.join(',')).split(','));
        target.checked?selected.add(target.dataset.comfortDay):selected.delete(target.dataset.comfortDay);
        input.comfort_days=DAYS.filter(day=>selected.has(day)).join(',');
      }
      if (target.dataset.action === 'zone-select') this._guard(() => this._selectZone(target.value));
      if (target.dataset.action === 'theme-select') { this._config.theme = target.value; this._render(); }
      if (target.dataset.copyDay) {
        target.checked ? this._copyDays.add(target.dataset.copyDay) : this._copyDays.delete(target.dataset.copyDay);
      }
    });
    this.shadowRoot.addEventListener('input', event => {
      const target=event.target;
      if(target.dataset.boost){this._boostInputs ||= {};const zone=target.closest('[data-smart-zone]').dataset.smartZone;this._boostInputs[zone] ||= {};this._boostInputs[zone][target.dataset.boost]=target.value;}
      if(target.dataset.smartField || target.dataset.presenceIndex!==undefined){this._smartPolicyRevisions ||= {};this._smartPolicyRevisions[this._zone().id] ??= this._zone().smart?.policy_revision;}
      if(target.dataset.smartField){this._smartInputs ||= {};this._smartInputs[this._zone().id] ||= {};this._smartInputs[this._zone().id][target.dataset.smartField]=target.type==='checkbox'?String(target.checked):target.value;}
      if(target.dataset.presenceIndex!==undefined){this._smartInputs ||= {};const input=this._smartInputs[this._zone().id] ||= {};input.entities ||= clone(this._zone().smart.policy.entities);input.entities[Number(target.dataset.presenceIndex)][target.dataset.presenceKey]=target.value;}
      if (this._dialog?.kind === 'period' && event.target.dataset.field) this._dialog.edit[event.target.dataset.field] = event.target.value;
    });
    this.shadowRoot.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this._dialog && !this._saving) { event.preventDefault(); this._dialog = null; this._render(); }
      if (event.key === 'Tab' && this._dialog) this._trapFocus(event);
    });
    this.shadowRoot.addEventListener('submit', event => { event.preventDefault(); this._action('apply-period'); });
    this._beforeUnload = event => { if (this._draft) { event.preventDefault(); event.returnValue = ''; } };
  }
  static getConfigElement() { return document.createElement('smart-heating-scheduler-card-editor'); }
  static getStubConfig() { return {type:'custom:smart-heating-scheduler-card', title:'Heating Control', theme:'auto'}; }
  getCardSize() { return this._view === 'schedules' ? 12 : 10; }
  getGridOptions() { return {columns:12, rows:'auto', min_columns:3}; }
  setConfig(config) {
    if (config.theme && !['auto','dark','light'].includes(config.theme)) throw Error('Choose auto, dark or light theme.');
    if (config.view && !VIEWS[config.view]) throw Error('Unknown heating view.');
    const changed = !this._config || config.entry_id !== this._config.entry_id || Boolean(config.demo) !== Boolean(this._config.demo);
    this._config = {...config, title:config.title || 'Heating Control', theme:config.theme || 'auto'};
    if (changed) {
      this._stop(); this._data = null; this._draft = null; this._history = []; this._dialog = null;
      this._view = config.view || 'dashboard';
      if (config.demo === true) { this._data = demoSnapshot(); for(const z of this._data.zones)z.smart=defaultSmart(); resolveDemo(this); this._status = 'demo'; this._day = 'mon'; }
      else this._status = 'waiting';
    }
    this._render(); if (this.isConnected && changed) this._connect();
  }
  set hass(value) {
    const changed = this._hass?.connection !== value?.connection;
    this._hass = value;
    if (changed && this.isConnected) { this._stop(); this._connect(); }
    if (this._config?.theme === 'auto') this._applyTheme();
  }
  connectedCallback() {
    window.addEventListener('beforeunload', this._beforeUnload);
    this._connect(); this._render();
    this._clock = setInterval(() => { if (!this._draft && !this._dialog && !this.shadowRoot.activeElement?.matches('input,select') && !this._config?.demo) this._render(); }, 60000);
  }
  disconnectedCallback() { this._stop(); clearInterval(this._clock); window.removeEventListener('beforeunload', this._beforeUnload); }
  _stop() {
    this._generation++; clearTimeout(this._retry);
    if (this._unsub) { this._unsub(); this._unsub = null; }
    this._connecting = false;
  }
  async _connect() {
    if (this._config?.demo || !this._config?.entry_id || !this._hass?.connection || this._unsub || this._connecting || !this.isConnected) return;
    const generation = this._generation; this._connecting = true; this._status = 'connecting'; this._render();
    try {
      const unsubscribe = await this._hass.connection.subscribeMessage(data => {
        if (generation !== this._generation) return;
        if (!data.available) { this._status = 'reconnecting'; this._stop(); this._scheduleRetry(); this._render(); return; }
        this._receive(data); this._retryDelay = 2000;
      }, {type:`${DOMAIN}/subscribe`, entry_id:this._config.entry_id});
      if (generation !== this._generation || !this.isConnected) unsubscribe();
      else { this._unsub = unsubscribe; this._connecting = false; }
    } catch (error) {
      if (generation !== this._generation) return;
      this._connecting = false; this._status = 'reconnecting'; this._error = 'Cannot connect to the scheduler. Check that the integration is loaded.';
      this._scheduleRetry(); this._render();
    }
  }
  _scheduleRetry() {
    clearTimeout(this._retry); this._retry = setTimeout(() => this._connect(), this._retryDelay);
    this._retryDelay = Math.min(30000, this._retryDelay * 2);
  }
  _receive(data) {
    try {
      if (data.schema_version !== 1 || !Array.isArray(data.zones)) throw Error('Unsupported scheduler API version.');
      for (const zone of data.zones) validateWeek(zone.week, zone.limits);
      if (this._draft && !data.zones.some(z => z.id === this._zoneId)) throw Error('The edited zone is no longer available. Your draft has been kept.');
      this._data = data; this._status = 'connected';
      if (!this._zoneId || !data.zones.some(z => z.id === this._zoneId)) {
        if (this._draft) throw Error('The edited zone is no longer available. Copy any unsaved values before closing.');
        this._zoneId = data.zones[0]?.id;
      }
      if (this._draft && this._zone()?.revision !== this._revision) this._conflict = true;
      if (!this._draft) this._error = '';
    } catch (error) { this._error = error.message; this._status = 'error'; }
    this._render();
  }
  _zone() { return this._data?.zones.find(z => z.id === this._zoneId) || this._data?.zones[0]; }
  _week() { return this._draft || this._zone()?.week; }
  _canEdit() { return Boolean(this._data?.can_edit && ['connected','demo'].includes(this._status) && (this._config.demo || this._hass?.connection?.connected !== false)); }
  _now() { return this._config?.demo ? this._data.generated_at : new Date().toISOString(); }
  _local(iso = this._now()) { return localParts(iso, this._data?.timezone || 'UTC'); }
  _temp(value, unit = this._zone()?.unit || '°C') {
    return typeof value === 'number' && Number.isFinite(value) ? `${new Intl.NumberFormat(this._hass?.locale?.language || 'en-GB', {minimumFractionDigits:1, maximumFractionDigits:1}).format(value)}${unit}` : '—';
  }
  _formatTime(iso) { return iso ? this._local(iso).time : '—'; }
  _applyTheme() {
    const requested = this._config?.theme || 'auto';
    const inherited = this._hass?.themes?.darkMode;
    this.setAttribute('theme', requested === 'auto' && typeof inherited === 'boolean' ? (inherited ? 'dark' : 'light') : requested);
  }
  _guard(action) {
    if (this._saving) return;
    if (!this._draft) { action(); return; }
    this._pending = action; this._dialog = {kind:'discard'}; this._focusDialog = true; this._render();
  }
  _selectZone(id) { this._zoneId = id; this._draft = null; this._history = []; this._error = ''; this._conflict = false; this._render(); }
  _mutate(week) {
    if (!this._canEdit() || this._saving) return;
    validateWeek(week, this._zone().limits);
    if (!this._draft) this._revision = this._zone().revision;
    this._history.push(clone(this._week())); this._history = this._history.slice(-20);
    this._draft = clone(week); this._message = ''; this._error = ''; this._render();
  }
  _openPeriod(day, index) {
    if (!this._canEdit()) return;
    this._view = 'schedules';
    this._day = day; const periods = this._week()[day], period = periods[index];
    this._dialog = {kind:'period', day, index, edit:{...period, temperature:String(period.temperature), end:periods[index + 1]?.start || '24:00'}};
    this._dialogError = ''; this._focusDialog = true; this._render();
  }
  async _save() {
    if (!this._draft || !this._canEdit() || this._saving) return;
    this._saving = true; this._error = ''; this._render();
    try {
      const zone = this._zone(), week = clone(this._draft);
      validateWeek(week, zone.limits);
      if (this._config.demo) {
        zone.week = week; zone.revision++;
        zone.proposed_target = week[this._local().day][periodIndex(week[this._local().day], this._local().minute)].temperature;
      } else {
        const snapshot = await this._hass.callWS({type:`${DOMAIN}/save_schedule`, entry_id:this._config.entry_id, zone_id:zone.id, revision:this._revision, week});
        this._data = snapshot;
      }
      this._draft = null; this._history = []; this._conflict = false; this._message = this._config.demo ? 'Saved to this demo only. Your heating is unchanged.' : this._data.observe_only?'Preview schedule saved. Heating controls are unchanged.':'Schedule saved. Heating rules re-evaluated.';
    } catch (error) {
      this._error = error.code === 'revision_conflict' ? 'This schedule changed elsewhere. Your draft is safe. Load the latest version before trying again.' : `Could not save. Your draft is safe. ${error.message || 'Check the connection and try again.'}`;
    } finally { this._saving = false; this._render(); }
  }
  _action(action, data = {}) {
    if(action==='occupancy-settings'){this._guard(()=>{this._selectZone(data.zone);this._view='settings';this._render();});return;}
    if(action.startsWith('smart-')){void this._smartAction(action.slice(6),data);return;}
    if(action==='close'){this._holidayAcknowledged=false;this._pendingBoost=null;}
    if(action==='holiday-boost-confirm'){this._holidayAcknowledged=true;const zone=this._dialog.zone;this._dialog=null;void this._smartAction('boost-start',{zone});return;}
    if (action === 'nav') this._guard(() => { this._view = data.view; this._draft = null; this._dialog = null; this._render(); });
    if (action === 'day') { this._day = data.day; this._render(); }
    if (action === 'zone') this._guard(() => this._selectZone(data.zone));
    if (action === 'edit') this._openPeriod(data.day || this._day, Number(data.index));
    if (action === 'more' && this._zoneFor(data.zone)?.climate_entity) this.dispatchEvent(new CustomEvent('hass-more-info', {detail:{entityId:this._zoneFor(data.zone).climate_entity}, bubbles:true, composed:true}));
    if (action === 'schedule') this._guard(() => { this._selectZone(data.zone || this._zone()?.id); this._day = this._local().day; this._view = 'schedules'; this._render(); });
    if (action === 'close') { this._dialog = null; this._render(); }
    if (action === 'discard') { const pending = this._pending; this._draft = null; this._history = []; this._conflict = false; this._dialog = null; this._error = ''; this._pending = null; if (pending) pending(); else this._render(); }
    if (action === 'cancel-draft' || action === 'latest') this._guard(() => { this._draft = null; this._history = []; this._conflict = false; this._dialog = null; this._error = ''; this._render(); });
    if (action === 'save') void this._save();
    if (action === 'undo' && this._history.length && !this._saving) { this._draft = this._history.pop(); this._render(); }
    if (action === 'apply-period') {
      try { const dialog = this._dialog; if (dialog?.kind !== 'period') return; const result = editPeriod(this._week(), dialog.day, dialog.index, dialog.edit, this._zone().limits); this._dialog = null; this._mutate(result); }
      catch (error) { this._dialogError = error.message; this._render(); }
    }
    if (action === 'split') { try { const week = addPeriod(this._week(), this._day, Number(data.index || 0), this._zone().limits); this._dialog = null; this._mutate(week); } catch (error) { this._error = error.message; this._render(); } }
    if (action === 'delete') { this._dialog = {kind:'delete', index:Number(data.index)}; this._focusDialog = true; this._render(); }
    if (action === 'confirm-delete') { const index = this._dialog.index; this._dialog = null; this._mutate(deletePeriod(this._week(), this._day, index, this._zone().limits)); }
    if (action === 'copy-day') { this._copyDays = new Set(); this._dialog = {kind:'copy-day'}; this._focusDialog = true; this._render(); }
    if (action === 'apply-copy-day') { this._dialog = null; this._mutate(copyDay(this._week(), this._day, [...this._copyDays], this._zone().limits)); }
    if (action === 'copy-week') { this._dialog = {kind:'copy-week'}; this._focusDialog = true; this._render(); }
    if (action === 'apply-copy-week') {
      try { const sourceId = this.shadowRoot.querySelector('[data-field=copy-zone]').value; const week = clone(this._zoneFor(sourceId).week); validateWeek(week, this._zone().limits); this._dialog = null; this._mutate(week); }
      catch (error) { this._dialogError = error.message; this._render(); }
    }
  }
  _zoneFor(id) { return this._data?.zones.find(z => z.id === id); }
  _selector() {
    const zone = this._zone();
    return `<label class="zone-select">Heating zone<select data-action="zone-select" aria-label="Heating zone">${this._data.zones.map(z => `<option value="${e(z.id)}" ${z.id === zone.id ? 'selected' : ''}>${e(z.name)}</option>`).join('')}</select></label>`;
  }
  _timeline(periods, day, editable = false) {
    const baseline = Math.min(...periods.map(p => p.temperature));
    return `<div class="timeline" aria-label="${e(DAY_NAMES[DAYS.indexOf(day)])} temperature periods">${periods.map((period,index) => {
      const end = periods[index + 1]?.start || '24:00'; const width = (minutes(end,true) - minutes(period.start)) / 1440 * 100;
      return `<button type="button" class="segment ${period.temperature > baseline ? 'comfort' : ''}" style="flex:${width} 1 0" data-action="edit" data-day="${day}" data-index="${index}" ${editable && this._canEdit() ? '' : 'disabled'} aria-label="${e(`${period.label || 'Period'} ${period.start} to ${end}, ${this._temp(period.temperature)}. ${editable && this._canEdit() ? 'Edit period' : 'Scheduled target'}`)}">${e(this._temp(period.temperature))}</button>`;
    }).join('')}</div>`;
  }
  _zoneCard(zone) {
    const current = zone.current_temperature, fill = typeof current === 'number' ? Math.max(0, Math.min(270, (current-zone.limits.minimum)/(zone.limits.maximum-zone.limits.minimum)*270)) : 0;
    const heating = zone.hvac_action === 'heating';
    return `<section class="panel zone-card ${heating ? '' : 'idle'}" aria-label="${e(zone.name)} thermostat">
      <div class="section-head"><h2><span class="zone-icon" aria-hidden="true">${zone.id === this._data.zones[0].id ? '⌂' : '♨︎'}</span>${e(zone.name)}</h2>${zone.climate_entity ? button('↗','more',`data-zone="${e(zone.id)}" aria-label="Open ${e(zone.name)} native thermostat"`,'link-button') : ''}</div>
      <div class="source"><span class="dot" aria-hidden="true" style="color:var(${['error','unavailable','unsupported','boost_unknown'].includes(zone.source)?'--shs-error':zone.source==='disabled'?'--shs-muted':'--shs-good'})"></span>${e(SOURCES[zone.source] || zone.source)}${zone.error ? ' · Check settings' : ''}</div>
      <div class="thermostat"><div class="ring" style="--fill:${fill}"><small>Current temperature</small><div class="reading">${typeof current === 'number' ? e(this._temp(current, '').trim()) : '—'}<sup>${e(zone.unit)}</sup></div><div class="demand">${heating ? '♨︎ Reported heating' : zone.hvac_action === 'idle' ? 'Reported idle' : 'Heating activity unknown'}</div></div>
      <div class="stat-stack"><div><small>Target on thermostat</small><div class="stat-value">${e(this._temp(zone.device_target, zone.unit))}</div></div><div><small>Scheduler proposal</small><div class="next">${e(this._temp(zone.proposed_target, zone.unit))}</div><small>Next evaluation ${e(this._formatTime(zone.next_evaluation))}</small></div></div></div>
      ${this._smartBoostControls(zone)}
      ${button('View schedule →','schedule',`data-zone="${e(zone.id)}"`,'link-button')}
    </section>`;
  }
  _dashboard() {
    const zone = this._zone(), local = this._local();
    return `<div class="summary"><div><span>HEATING ZONES</span><b>${this._data.zones.length} configured</b></div><div><span>HOLIDAY</span><b>${this._data.zones.some(z=>z.smart?.holiday)?'Planned':'Inactive'}</b></div><div><span>SCHEDULER</span><b>${this._data.observe_only?'Observe only':'Controlling'}</b></div></div>
      <div class="zones">${this._data.zones.map(z => this._zoneCard(z)).join('')}</div>
      <section class="panel"><div class="section-head"><div><div class="eyebrow">${e(DAY_NAMES[DAYS.indexOf(local.day)])} · ${e(local.time)}</div><h2>Today’s schedule</h2></div>${this._selector()}</div>
      ${this._occupancySummary(zone)}<div class="timeline-wrap">${this._timeline(zone.week[local.day], local.day,true)}<div class="time-marker" style="left:${local.minute/1440*100}%"><span style="transform:translateX(${local.minute<60?0:local.minute>1380?-100:-50}%)">${e(local.time)}</span></div></div><div class="ticks"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div><div class="legend"><span><i></i>Comfort target</span><span><i class="cool"></i>Setback target</span></div>${button('Edit today’s periods →','schedule',`data-zone="${e(zone.id)}"`,'link-button')}</section>
      <div class="bottom-grid"><section class="panel"><div class="scope">Selected zone</div><h2>Temporary occupancy</h2>${this._smartPresenceButtons()}<div class="fact-row"><span>Control source</span><b>${e(SOURCES[zone.source] || zone.source)}</b></div><div class="fact-row"><span>Schedule target</span><b>${e(this._temp(zone.week[local.day][periodIndex(zone.week[local.day],local.minute)].temperature))}</b></div></section>
      <section class="panel"><h2>Why this temperature?</h2><div class="reason"><b>${e(SOURCES[zone.source] || zone.source)} · ${e(this._temp(zone.proposed_target))}</b><p>${e(zone.reason)}</p></div><small>${this._data.observe_only?'This is the scheduler’s proposed target. Existing controls still manage the heating.':'This scheduler controls the mapped thermostat. Manual Off and higher-priority overrides are respected.'}</small></section></div>`;
  }
  _schedules() {
    const zone = this._zone(), week = this._week(), periods = week[this._day];
    const otherZones = this._data.zones.filter(z => z.id !== zone.id && z.unit === zone.unit);
    return `<div class="zone-picker"><div><div class="eyebrow">Weekly planner</div><h2>${e(zone.name)}</h2><div class="status-caption">${this._canEdit() ? 'Select a period to edit its time and temperature.' : 'Read-only schedule. Ask an administrator to make changes.'}</div></div>${this._selector()}</div>
      <div class="toolbar" style="margin-bottom:16px">${button('Copy day','copy-day',this._canEdit()?'':'disabled')}${button('Copy week from zone','copy-week',otherZones.length && this._canEdit()?'':'disabled')}${button('Undo','undo',this._history.length&&!this._saving?'':'disabled')}</div>
      ${this._conflict ? `<div class="error" role="alert">This week changed elsewhere. Your unsaved draft has been kept. ${button('Load latest','latest')}</div>` : ''}
      <div class="planner-layout"><section class="panel desktop-only"><div class="section-head"><h3>Seven-day overview</h3><small>${e(zone.unit)}</small></div><div class="ticks" style="margin:0 0 10px 53px"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>${DAYS.map((day,index) => `<div class="week-row ${day === this._day ? 'active' : ''}">${button(DAY_NAMES[index].slice(0,3),'day',`data-day="${day}" aria-pressed="${day === this._day}"`)}<div>${this._timeline(week[day],day,true)}${this._occupancyBand(zone,day)}</div></div>`).join('')}<div class="legend"><span><i></i>Comfort</span><span><i class="cool"></i>Setback</span></div></section>
      <section class="panel"><div class="section-head"><h3>${e(DAY_NAMES[DAYS.indexOf(this._day)])} periods</h3><small>${periods.length} periods</small></div><div class="days">${DAYS.map((day,index)=>button(DAY_NAMES[index].slice(0,3),'day',`data-day="${day}" aria-pressed="${day===this._day}"`,day===this._day?'selected':'')).join('')}</div>
      ${this._occupancySummary(zone,this._day)}<div class="period-list">${periods.map((period,index)=>`<div class="period-row"><div><b>${e(period.label || 'Period '+(index+1))}</b><p>${e(period.start)} – ${e(periods[index+1]?.start || '24:00')}</p></div><span class="temp-pill ${period.temperature>Math.min(...periods.map(p=>p.temperature))?'warm':''}">${e(this._temp(period.temperature))}</span>${button('✎','edit',`data-index="${index}" aria-label="Edit ${e(period.label || 'period')} ${e(period.start)}" ${this._canEdit()?'':'disabled'}`,'link-button')}</div>`).join('')}</div>
      <div class="toolbar" style="margin-top:14px">${button('+ Add period','split',this._canEdit()?'':'disabled')}</div><div class="status-caption">New periods split the first block. Use “Split period” when editing another block.</div></section></div>
      <div class="draft-bar"><span class="${this._draft?'dirty':'muted'}">${this._draft?'● Unsaved changes':'All changes saved'}${this._config.demo?' · Demo only':''}</span><div class="toolbar">${button('Cancel','cancel-draft',this._draft&&!this._saving?'':'disabled')}${button(this._saving?'Saving…':'Save changes','save',this._draft&&this._canEdit()&&!this._saving?'':'disabled','primary')}</div></div>`;
  }
  _automation() { return this._smartAutomation(); }
  _settings() {
    const zone = this._zone();
    return `<div class="zone-picker"><div><div class="eyebrow">Zone setup</div><h2>Settings</h2></div>${this._selector()}</div><div class="settings-grid">${this._occupancySettings()}<section class="panel"><div class="scope">Selected zone</div><h2>${e(zone.name)}</h2><div class="fact-row"><span>Thermostat</span><b>${e(zone.climate_entity || 'Sample thermostat')}</b></div><div class="fact-row"><span>Reviewed limits</span><b>${e(this._temp(zone.limits.minimum))} – ${e(this._temp(zone.limits.maximum))}</b></div><div class="fact-row"><span>Temperature step</span><b>${zone.limits.step?e(this._temp(zone.limits.step)):'Not reported'}</b></div><div class="fact-row"><span>Manual target hold</span><b>${e({next_period:'Until next period',duration:`${zone.manual_minutes} minutes`,until_resume:'Until resumed'}[zone.manual_policy])}</b></div><div class="fact-row"><span>Existing boost</span><b>${zone.boost.owner==='external'?'External timer':zone.boost.owner==='builtin'?'Built-in boost':'Disabled'}</b></div>${!this._config.demo && this._data.can_edit ? '<a class="shs-link" href="/config/integrations/integration/smart_heating_scheduler">Manage zones in Home Assistant →</a>' : '<small>Thermostat mappings and limits are managed through the integration setup.</small>'}</section>
      <section class="panel"><div class="scope">This card</div><h2>Appearance</h2><label style="margin-top:16px">Theme<select data-action="theme-select" aria-label="Card theme">${['auto','dark','light'].map(t=>`<option value="${t}" ${this._config.theme===t?'selected':''}>${{auto:'Follow Home Assistant',dark:'Dark',light:'Light'}[t]}</option>`).join('')}</select></label><div class="reason"><b>Responsive by design</b><p>Side-by-side zones on desktop. Stacked cards and a day-by-day period editor on your phone.</p></div><small>Use the Lovelace card editor to save the title, initial view and theme.</small></section></div><div class="settings-grid" style="margin-top:18px">${this._smartSettings()}</div>`;
  }
  _modal() {
    if (!this._dialog) return '';
    const dialog = this._dialog; let content = '', title = '';
    if (dialog.kind === 'holiday-boost') {
      title='Timed holiday exception';content=`<p>Start this timed boost during the holiday? The holiday target resumes when it ends.</p><div class="toolbar">${button('Cancel','close')}${button('Start timed exception','holiday-boost-confirm','','primary')}</div>`;
    } else if(dialog.kind==='reconcile'){
      title='Confirm external boost restoration';content=`<p>Only confirm after checking that the stop script has finished restoring the receiver and the external timer is idle.</p><div class="toolbar">${button('Cancel','close')}${button('Restoration completed','smart-confirm-reconcile','','primary')}</div>`;
    } else if (dialog.kind === 'period') {
      const {edit,index} = dialog, periods = this._week()[dialog.day], zone=this._zone(); title='Edit period';
      content=`<p>${e(DAY_NAMES[DAYS.indexOf(dialog.day)])} · ${e(zone.name)}</p><form><div class="form-grid"><label class="full">Period name<input data-field="label" maxlength="80" value="${e(edit.label)}"></label><label>Start time<input data-field="start" aria-label="Start time" inputmode="numeric" value="${e(edit.start)}" ${index===0?'readonly':''}></label><label>End time<input data-field="end" aria-label="End time" inputmode="numeric" value="${e(edit.end)}" ${index===periods.length-1?'readonly':''}></label><label class="full">Target temperature (${e(zone.unit)})<input type="number" data-field="temperature" aria-label="Target temperature" min="${zone.limits.minimum}" max="${zone.limits.maximum}" step="${zone.limits.step||'any'}" value="${e(edit.temperature)}" required></label></div><div class="status-caption">Changing an end time also moves the next period’s start.</div>${this._dialogError?`<div class="error" role="alert">${e(this._dialogError)}</div>`:''}<div class="toolbar">${button('Split period','split',`data-index="${index}"`)}${button('Delete','delete',`data-index="${index}" ${index?'':'disabled'}`)}${button('Cancel','close')}<button type="submit" class="primary">Apply period</button></div></form>`;
    } else if (dialog.kind === 'discard') {
      title='Unsaved schedule changes'; content=`<p>Keep editing, or discard your unsaved changes before leaving.</p><div class="toolbar">${button('Keep editing','close')}${button('Discard changes','discard','','primary')}</div>`;
    } else if (dialog.kind === 'delete') {
      title='Delete this period?'; content=`<p>The previous period will extend to fill its time. Nothing changes until you save the week.</p><div class="toolbar">${button('Cancel','close')}${button('Delete period','confirm-delete','','primary')}</div>`;
    } else if (dialog.kind === 'copy-day') {
      title=`Copy ${DAY_NAMES[DAYS.indexOf(this._day)]}`;
      content=`<p>Choose the days to replace in this draft.</p><div class="copy-days">${DAYS.map((day,i)=>`<label class="check"><input type="checkbox" data-copy-day="${day}" ${day===this._day?'disabled':this._copyDays.has(day)?'checked':''}>${e(DAY_NAMES[i])}</label>`).join('')}</div><div class="toolbar">${button('Cancel','close')}${button('Copy selected days','apply-copy-day','','primary')}</div>`;
    } else if (dialog.kind === 'copy-week') {
      title='Copy an entire week'; content=`<p>Replace this zone’s draft with another zone’s saved week. Temperatures must fit this zone’s limits.</p><label>Copy from<select data-field="copy-zone">${this._data.zones.filter(z=>z.id!==this._zone().id&&z.unit===this._zone().unit).map(z=>`<option value="${e(z.id)}">${e(z.name)}</option>`).join('')}</select></label>${this._dialogError?`<div class="error" role="alert">${e(this._dialogError)}</div>`:''}<div class="toolbar">${button('Cancel','close')}${button('Copy week','apply-copy-week','','primary')}</div>`;
    }
    return `<div class="modal-shade"><section class="modal" role="dialog" aria-modal="true" aria-label="${e(title)}"><div class="section-head"><h2>${e(title)}</h2>${button('×','close','aria-label="Close dialog"','link-button')}</div>${content}</section></div>`;
  }
  _trapFocus(event) {
    const controls = [...this.shadowRoot.querySelectorAll('.modal button:not(:disabled),.modal input:not(:disabled),.modal select')];
    if (!controls.length) return;
    const active=this.shadowRoot.activeElement, first=controls[0],last=controls.at(-1);
    if (event.shiftKey && active===first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active===last) { event.preventDefault(); first.focus(); }
  }
  _render() {
    if (!this._config) return;
    this._applyTheme();
    const active = this.shadowRoot.activeElement;
    const focus = active ? {action:active.dataset.action, field:active.dataset.field, index:active.dataset.index, day:active.dataset.day, view:active.dataset.view, zone:active.dataset.zone, aria:active.getAttribute('aria-label'), tag:active.tagName} : null;
    if (this._dialog && active && !active.closest('.modal')) this._returnFocus = focus;
    const restoreFocus = !this._dialog && active?.closest('.modal') ? this._returnFocus : focus;
    let content = '';
    if (!this._data?.zones?.length) content=`<div class="empty"><div class="empty-icon" aria-hidden="true">♨︎</div><h2>${this._data?'No heating zones available':'Connect your scheduler'}</h2><p>${this._data?'Add zones in the integration, or check your entity permissions.':'Choose the Smart Heating Scheduler entry in the card editor. Existing heating controls are unchanged.'}</p>${this._status==='connecting'?'<span class="badge">Connecting…</span>':''}</div>`;
    else { this._zoneId=this._zone().id; content=this[`_${this._view}`](); }
    this.shadowRoot.innerHTML=`<style>${styles}</style><div class="wrap"><div class="header"><div class="brand"><span class="brand-icon" aria-hidden="true">♨︎</span><div><h1>${e(this._config.title)}</h1><p>Comfort, on your schedule.</p></div></div><span class="badge"><span class="dot" aria-hidden="true"></span>${this._config.demo?'Design preview':this._data?.observe_only===false?'Heating control':'Observe only'}</span></div><div class="preview-banner"><strong>${this._config.demo?'Sample data':this._data?.observe_only===false?'Heating control enabled':'Heating controls unchanged'}</strong> · ${this._config.demo?'Disconnected from Home Assistant':this._status==='connected'?'Connected to scheduler':this._status==='reconnecting'?'Reconnecting…':'Waiting for scheduler'}</div><nav class="nav" aria-label="Heating views">${Object.entries(VIEWS).map(([key,[icon,name]])=>`<button type="button" data-action="nav" data-view="${key}" aria-current="${key===this._view?'page':'false'}"><span class="nav-icon" aria-hidden="true">${icon}</span>${name}</button>`).join('')}</nav>${this._error?`<div class="error" role="alert">${e(this._error)}</div>`:''}${this._message?`<div class="success" role="status">${e(this._message)}</div>`:''}<main ${this._saving?'aria-busy="true"':''}>${content}</main></div>${this._modal()}`;
    if (this._dialog) { this.shadowRoot.querySelector('.wrap').inert=true; this.shadowRoot.querySelector('.wrap').setAttribute('aria-hidden','true'); }
    if (this._focusDialog) { this._focusDialog=false; queueMicrotask(()=>(this.shadowRoot.querySelector('.modal input:not([readonly])') || this.shadowRoot.querySelector('.modal button'))?.focus()); }
    else if (restoreFocus) { const f=restoreFocus; const element=[...this.shadowRoot.querySelectorAll('button,input,select')].find(el=>el.tagName===f.tag&&el.dataset.action===f.action&&el.dataset.field===f.field&&el.dataset.index===f.index&&el.dataset.day===f.day&&el.dataset.view===f.view&&el.dataset.zone===f.zone&&el.getAttribute('aria-label')===f.aria); element?.focus({preventScroll:true}); }
  }
}

Object.assign(SmartHeatingSchedulerCard.prototype, smartUI, occupancyUI);

export class SmartHeatingSchedulerCardEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({mode:'open'}); this._entries=[]; this.shadowRoot.addEventListener('change',event=>{const key=event.target.dataset.config; if(!key)return; this._config={...this._config,[key]:event.target.value}; this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:this._config},bubbles:true,composed:true}));}); }
  setConfig(config) { this._config={...config}; this._render(); }
  set hass(value) { this._hass=value; if(!this._loading){this._loading=true; value.callWS({type:`${DOMAIN}/list`}).then(entries=>{this._entries=entries;this._render();}).catch(()=>{this._failure=true;this._render();});} }
  _render() {
    this.shadowRoot.innerHTML=`<style>${styles}</style><div class="editor"><label>Scheduler<select data-config="entry_id"><option value="">Choose a scheduler</option>${this._entries.map(item=>`<option value="${e(item.entry_id)}" ${this._config?.entry_id===item.entry_id?'selected':''}>${e(item.name)}</option>`).join('')}</select></label><label>Card title<input data-config="title" value="${e(this._config?.title||'Heating Control')}"></label><label>Initial view<select data-config="view">${Object.entries(VIEWS).map(([key,[,name]])=>`<option value="${key}" ${(this._config?.view||'dashboard')===key?'selected':''}>${name}</option>`).join('')}</select></label><label>Theme<select data-config="theme">${['auto','dark','light'].map(theme=>`<option value="${theme}" ${(this._config?.theme||'auto')===theme?'selected':''}>${{auto:'Follow Home Assistant',dark:'Dark',light:'Light'}[theme]}</option>`).join('')}</select></label>${this._failure?'<p role="alert">Could not load schedulers. Check that the integration is available.</p>':''}</div>`;
  }
}
if (!customElements.get('smart-heating-scheduler-card')) customElements.define('smart-heating-scheduler-card', SmartHeatingSchedulerCard);
if (!customElements.get('smart-heating-scheduler-card-editor')) customElements.define('smart-heating-scheduler-card-editor', SmartHeatingSchedulerCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some(card=>card.type==='smart-heating-scheduler-card')) window.customCards.push({type:'smart-heating-scheduler-card',name:'Smart Heating Scheduler',description:'Responsive heating schedules and observe-only proposals',preview:true});
