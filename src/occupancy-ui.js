import {DAYS, DAY_NAMES, escapeHTML as e, minutes} from './model.js';

// Uses the existing durable comfort policy; a null minimum disables the rule.
export const occupancyUI = {
  _occupancySettings() {
    const z=this._zone(), p=z.smart?.policy;
    if(!p)return '';
    const disabled=!this._canEdit()||this._saving;
    const enabled=String(this._smartValue('comfort_enabled',p.comfort_target!==null))==='true';
    const selected=this._smartValue('entities',p.entities);
    const available=Object.entries(this._hass?.states||{}).filter(([id])=>/^(person|device_tracker|binary_sensor)\./.test(id));
    const days=this._smartValue('comfort_days',p.comfort_days.join(',')).split(',');
    return `<section class="panel occupancy-settings"><div class="scope">${e(z.name)} · zone setting</div><h2>Occupancy override</h2>
      <p class="muted">Keep this zone at a minimum temperature when occupied, during your chosen days and hours.</p>
      <fieldset ${disabled?'disabled':''}>
        <label class="occupancy-toggle"><input type="checkbox" role="switch" aria-label="Enable occupancy override" data-smart-field="comfort_enabled" ${enabled?'checked':''}>Enable occupancy override</label>
        ${this._disclosure('occupancy-rule','Configure occupancy rule',`<div class="form-grid">
          ${this._smartInput('comfort_target',`Occupied minimum (${z.unit})`,p.comfort_target??z.limits.minimum,'number',`min="${z.limits.minimum}" max="${z.limits.maximum}" step="${z.limits.step||'any'}"`)}
          ${this._smartSelect('home_rule','Zone is occupied when',p.home_rule,[['any','Any selected person or sensor is home'],['all','All selected people or sensors are home']])}
          ${this._smartInput('comfort_start','From',p.comfort_start,'time')}
          ${this._smartInput('comfort_end','Until',p.comfort_end,'time')}
        </div>
        <fieldset class="occupancy-days"><legend>Active days</legend>${DAYS.map((day,i)=>`<label><input type="checkbox" data-comfort-day="${day}" ${days.includes(day)?'checked':''}>${DAY_NAMES[i].slice(0,3)}</label>`).join('')}</fieldset>
        <h3>Who or what makes this zone occupied?</h3>
        <div class="presence-rows">${selected.map((item,i)=>`<div class="presence-row"><label>Person or occupancy sensor<select data-presence-index="${i}" data-presence-key="entity_id"><option value="${e(item.entity_id)}">${e(this._hass?.states?.[item.entity_id]?.attributes?.friendly_name||item.entity_id||'Choose a person or sensor')}</option>${available.filter(([id])=>id!==item.entity_id).map(([id,state])=>`<option value="${e(id)}">${e(state.attributes?.friendly_name||id)}</option>`).join('')}</select></label><div class="form-grid"><label>Occupied state<input data-presence-index="${i}" data-presence-key="home_state" value="${e(item.home_state)}"></label><label>Unoccupied state<input data-presence-index="${i}" data-presence-key="away_state" value="${e(item.away_state)}"></label></div><button type="button" data-action="smart-remove-person" ${disabled?'disabled':''} data-index="${i}">Remove</button></div>`).join('')}</div>
        <button type="button" data-action="smart-add-person" ${disabled?'disabled':''}>+ Add person or sensor</button>
        <details class="occupancy-advanced"><summary>Delays and unoccupied behaviour</summary><div class="form-grid">
          ${this._smartInput('away_target',`Optional unoccupied target (${z.unit})`,p.away_target,'number',`step="${z.limits.step||'any'}"`)}
          ${this._smartInput('away_minutes','Unoccupied delay (minutes)',p.away_minutes)}
          ${this._smartInput('return_minutes','Occupied delay (minutes)',p.return_minutes)}
          ${this._smartInput('unknown_minutes','Keep last trusted occupancy (minutes)',p.unknown_minutes)}
          ${this._smartSelect('unknown_fallback','If occupancy stays unknown',p.unknown_fallback,[['schedule','Follow schedule'],['home','Treat as occupied'],['away','Treat as unoccupied']])}
        </div><p class="muted">Leave the unoccupied target empty to follow the schedule. Select a person instead of also selecting their phone trackers. Unknown sensors use the chosen grace period and fallback.</p></details>
        <p class="muted">A higher scheduled target is kept. Manual temperatures, Off, boost and holiday take priority. Disabling keeps your days, hours and occupancy selections.</p>
        `,enabled?`Minimum ${this._temp(p.comfort_target??z.limits.minimum)} · ${p.comfort_start}–${p.comfort_end}`:'People, active hours and unoccupied behaviour')}
        <div class="toolbar" data-occupancy-save ${this._smartPolicyRevisions?.[z.id]!==undefined?'':'hidden'}><button type="button" data-action="smart-save-presence" ${disabled?'disabled':''} class="primary">Save occupancy override</button><button type="button" data-action="smart-reset" ${disabled?'disabled':''}>Reload saved rules</button></div>
      </fieldset></section>`;
  },
  _occupancySummary(z, day=this._local().day) {
    const p=z.smart?.policy;
    if(!p || p.comfort_target===null)return '';
    const now=this._local();
    const names=p.entities.map(item=>this._hass?.states?.[item.entity_id]?.attributes?.friendly_name||item.entity_id);
    const window=p.comfort_days.includes(now.day)&&p.comfort_start<=now.time&&now.time<p.comfort_end;
    let status=!window?'Outside active hours':z.presence==='home'?'Occupied':z.presence==='away'?'Waiting for occupancy':'Occupancy unknown';
    if(z.source==='occupied_comfort')status='Active';
    else if(window&&z.presence==='home')status='Paused by another control';
    return `<aside class="occupancy-summary ${z.source==='occupied_comfort'?'active':''}" aria-label="${e(z.name)} occupancy override"><div class="occupancy-summary-head"><div><div class="scope">Occupancy override</div><b>Minimum ${e(this._temp(p.comfort_target,z.unit))} when occupied</b></div><span class="badge">${e(status)}</span></div><p>${e(p.comfort_days.map(d=>DAY_NAMES[DAYS.indexOf(d)].slice(0,3)).join(' · '))} · ${e(p.comfort_start)}–${e(p.comfort_end)}</p><small>${e(names.join(', ')||'No occupancy inputs selected')} · ${p.home_rule==='all'?'all must be home':'any can be home'}</small>${this._occupancyBand(z,day)}<button type="button" class="link-button" data-action="occupancy-settings" data-zone="${e(z.id)}">Edit zone rule →</button></aside>`;
  },
  _occupancyBand(z,day) {
    const p=z.smart?.policy;
    if(!p || p.comfort_target===null || !p.comfort_days.includes(day))return '';
    const start=minutes(p.comfort_start)/1440*100, width=(minutes(p.comfort_end)-minutes(p.comfort_start))/1440*100;
    return `<div class="occupancy-track" aria-label="${e(DAY_NAMES[DAYS.indexOf(day)])} occupancy override ${e(p.comfort_start)} to ${e(p.comfort_end)}, minimum ${e(this._temp(p.comfort_target,z.unit))} only when occupied"><span style="margin-left:${start}%;width:${width}%" title="Occupancy override · ${e(this._temp(p.comfort_target,z.unit))}"></span></div>`;
  }
};
