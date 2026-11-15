import {escapeHTML as e, remainingText} from './model.js';

export const miniUI = {
  _miniZone() {return this._config.zone_id?this._data?.zones.find(z=>z.id===this._config.zone_id):this._zone();},
  _miniCanSet(z) {return !!(z&&this._canEdit()&&!this._saving&&(this._config.demo||!this._data.observe_only)&&z.enabled&&z.mode==='heat'&&!z.boost.active&&!z.smart?.external_operation&&!['holiday','unavailable','unsupported','error','disabled','boost_unknown','boost_handover'].includes(z.source)&&!z.error);},
  async _miniSetTarget(raw) {
    const z=this._miniZone();if(!this._miniCanSet(z))return;
    const value=Number(raw), step=z.limits.step;
    if(!Number.isFinite(value)||value<z.limits.minimum||value>z.limits.maximum||step&&Math.abs(value/step-Math.round(value/step))>1e-6){this._error='Choose a target within this zone’s reviewed limits.';this._render();return;}
    this._saving=true;this._error='';this._render();
    try{
      // Same native thermostat action as HA's thermostat card. The integration
      // observes this as a manual change and applies the zone's hold policy.
      if(this._config.demo){z.device_target=value;z.proposed_target=value;z.source='manual';}
      else await this._hass.callService('climate','set_temperature',{temperature:value},{entity_id:z.climate_entity});
      this._message='Manual target sent';
    }catch(error){this._error=error.message||'Could not set the thermostat target.';}
    finally{this._saving=false;this._miniTarget=null;this._render();}
  },
  _mini() {
    const z=this._miniZone();
    if(!z)return `<div class="wrap mini"><h2>Heating zone unavailable</h2><p>Choose a valid zone in the card editor.</p></div>`;
    const p=z.smart?.policy, helper=this._hass?.states?.[p?.duration_helper]?.attributes;
    const max=Math.min(p?.boost_max_minutes||120,helper?.max||1440), min=Math.max(1,helper?.min||1), durationStep=helper?.step||1;
    const duration=this._boostInputs?.[z.id]?.minutes??p?.boost_minutes??30;
    const target=this._miniTarget??z.device_target??z.limits.minimum;
    const fill=Math.max(0,Math.min(270,(Number(target)-z.limits.minimum)/(z.limits.maximum-z.limits.minimum)*270));
    const canSet=this._miniCanSet(z), disabled=!this._canEdit()||this._saving;
    const boostDisabled=disabled||!(z.boost.active?z.boost.can_cancel:z.boost.can_start);
    const caption=z.mode==='off'?'Off':z.hvac_action==='heating'?'Heating':z.hvac_action==='idle'?'Idle':'Activity unknown';
    const href=this._config.dashboard_path?.startsWith('/')&&!this._config.dashboard_path.startsWith('//')?this._config.dashboard_path:null;
    return `<section class="wrap mini ${z.hvac_action==='heating'?'':'idle'}" aria-label="${e(z.name)} mini thermostat"><div class="section-head"><h2>${e(this._config.title||z.name)}</h2><button type="button" class="link-button" data-action="more" data-zone="${e(z.id)}" aria-label="Open native thermostat" ${z.climate_entity?'':'disabled'}>↗</button></div>
      <div class="mini-mode">${this._config.demo?'Sample data':this._data.observe_only?'Observe only':'Heating control'} · ${e(caption)}</div>
      <div class="ring" style="--fill:${fill}"><small>Target temperature</small><div class="reading" data-mini-reading>${e(this._temp(Number(target),z.unit))}</div><small>Room ${e(this._temp(z.current_temperature,z.unit))}</small></div>
      <label class="mini-slider">Target temperature<input type="range" data-mini-target aria-label="Target temperature" min="${z.limits.minimum}" max="${z.limits.maximum}" step="${z.limits.step||(z.unit==='°F'?1:0.5)}" value="${e(target)}" ${canSet?'':'disabled'}></label>
      <small>${z.source==='manual'?'Manual override':z.mode==='off'?'Resume schedule to turn heating on':this._config.demo?'Preview manual target · no heating commands':this._data.observe_only?'Thermostat changes disabled in observe-only mode':'Changes use this zone’s manual hold policy'}</small>
      <div class="mini-boost" data-smart-zone="${e(z.id)}"><input type="hidden" data-boost="target" value="${e(p?.boost_target??'')}"><label class="mini-slider">Boost time <output data-mini-minutes>${e(duration)} minutes</output><input type="range" data-boost="minutes" aria-label="Boost duration" min="${min}" max="${max}" step="${durationStep}" value="${e(duration)}" ${disabled||p?.boost_owner==='external'&&!p.duration_helper?'disabled':''}></label><div class="boost-controls"><small>${z.boost.active?e(remainingText(z.boost.until,this._now())):p?.boost_target!==null?'Boost to '+e(this._temp(p?.boost_target,z.unit)):'Boost not configured'}</small><button type="button" class="primary" data-action="smart-${z.boost.active?'boost-cancel':'boost-start'}" data-zone="${e(z.id)}" ${boostDisabled?'disabled':''}>${z.boost.active?'Stop boost':'Start boost'}</button></div></div>
      ${p?.comfort_target!==null&&p?.comfort_target!==undefined?`<p class="mini-occupancy">Occupancy override · ${e(this._temp(p.comfort_target,z.unit))} minimum${z.source==='occupied_comfort'?' · Active':''}</p>`:''}
      <div class="toolbar"><button type="button" class="link-button" data-action="smart-resume" data-zone="${e(z.id)}" ${disabled||!this._config.demo&&this._data.observe_only?'disabled':''}>Resume schedule</button>${href?`<a class="shs-link" href="${e(href)}">Full scheduler →</a>`:''}</div>
      ${this._error?`<p class="error" role="alert">${e(this._error)}</p>`:''}${this._message?`<small role="status">${e(this._message)}</small>`:''}</section>${this._modal()}`;
  }
};
