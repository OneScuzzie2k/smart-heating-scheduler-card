import {escapeHTML as e, remainingText} from './model.js';

export function dialTemperature(limits,x,y,rect,unit='°C') {
  if(!rect.width||!rect.height||![x,y].every(Number.isFinite))return null;
  const angle=(Math.atan2(x-rect.left-rect.width/2,rect.top+rect.height/2-y)*180/Math.PI+360)%360;
  let sweep=(angle-225+360)%360;
  if(sweep>270)sweep=sweep>315?0:270;
  const step=limits.step||(unit==='°F'?1:0.5);
  const raw=limits.minimum+sweep/270*(limits.maximum-limits.minimum);
  return Number(Math.max(limits.minimum,Math.min(limits.maximum,Math.round(raw/step)*step)).toFixed(6));
}

export const miniUI = {
  _miniZone() {return this._config.zone_id?this._data?.zones.find(z=>z.id===this._config.zone_id):this._zone();},
  _miniCanSet(z) {return !!(z&&this._canEdit()&&!this._saving&&(this._config.demo||!this._data.observe_only)&&z.enabled&&z.mode==='heat'&&!z.boost.active&&!z.smart?.external_operation&&!['holiday','unavailable','unsupported','error','disabled','boost_unknown','boost_handover'].includes(z.source)&&!z.error);},
  _previewMiniTarget(value) {
    const z=this._miniZone();if(!z||value===null)return;
    this._miniTarget=value;
    const ring=this.shadowRoot.querySelector('[data-mini-dial]');
    const fill=Math.max(0,Math.min(270,(value-z.limits.minimum)/(z.limits.maximum-z.limits.minimum)*270));
    if(ring){ring.style.setProperty('--fill',fill);ring.setAttribute('aria-valuenow',value);ring.setAttribute('aria-valuetext',this._temp(value,z.unit));}
    const output=this.shadowRoot.querySelector('[data-mini-reading]');if(output)output.textContent=this._temp(value,z.unit);
    const arc=this.shadowRoot.querySelector('[data-mini-arc]');if(arc)arc.setAttribute('stroke-dasharray',`${fill/360*534.071} 534.071`);
  },
  _miniDialDown(event) {
    const dial=event.target.closest('[data-mini-dial]'), z=this._miniZone();
    if(!dial||!this._miniCanSet(z)||this._dialDrag||event.button!==0||event.isPrimary===false)return;
    const rect=dial.getBoundingClientRect();
    const radius=Math.hypot((event.clientX-rect.left-rect.width/2)/rect.width,(event.clientY-rect.top-rect.height/2)/rect.height);
    if(radius<0.28||radius>0.62)return;
    event.preventDefault();dial.focus({preventScroll:true});
    this._dialDrag={id:event.pointerId,zone:z.id,dial,rect};
    dial.setPointerCapture?.(event.pointerId);
    this._previewMiniTarget(dialTemperature(z.limits,event.clientX,event.clientY,rect,z.unit));
  },
  _miniDialMove(event) {
    const drag=this._dialDrag,z=this._miniZone();
    if(!drag||drag.id!==event.pointerId||z?.id!==drag.zone)return;
    event.preventDefault();
    this._previewMiniTarget(dialTemperature(z.limits,event.clientX,event.clientY,drag.rect,z.unit));
  },
  _miniDialEnd(event,cancel=false) {
    const drag=this._dialDrag;if(!drag||drag.id!==event.pointerId)return;
    const value=this._miniTarget;this._dialDrag=null;
    if(drag.dial.hasPointerCapture?.(event.pointerId))drag.dial.releasePointerCapture(event.pointerId);
    if(cancel||this._miniZone()?.id!==drag.zone||!this._miniCanSet(this._miniZone())){this._miniTarget=null;this._render();return;}
    void this._miniSetTarget(value);
  },
  _miniDialKey(event) {
    if(!event.target.matches('[data-mini-dial]')||!this._miniCanSet(this._miniZone()))return;
    const z=this._miniZone(),step=z.limits.step||(z.unit==='°F'?1:0.5), current=Number(this._miniTarget??z.device_target??z.limits.minimum);
    const offsets={ArrowRight:step,ArrowUp:step,ArrowLeft:-step,ArrowDown:-step,PageUp:step*10,PageDown:-step*10};
    let value=event.key==='Home'?z.limits.minimum:event.key==='End'?z.limits.maximum:current+offsets[event.key];
    if(!Number.isFinite(value))return;
    event.preventDefault();value=Number(Math.max(z.limits.minimum,Math.min(z.limits.maximum,value)).toFixed(6));
    this._previewMiniTarget(value);void this._miniSetTarget(value);
  },
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
    const thermometer='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14.8V5a2 2 0 0 1 4 0v9.8a4 4 0 1 1-4 0Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v9" stroke="currentColor" stroke-width="2"/></svg>';
    const flame='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2c1 5-4 6-2 10 1-1 2-2 2-4 4 3 6 5 6 8a7 7 0 0 1-14 0c0-4 4-7 8-14Z" fill="currentColor"/></svg>';
    return `<section class="mini ${z.hvac_action==='heating'?'':'idle'}" aria-label="${e(z.name)} mini thermostat">
      <div class="mini-thermostat"><header class="mini-head"><h2>${href?`<a href="${e(href)}" aria-label="${e(this._config.title||z.name)} full scheduler">${e(this._config.title||z.name)}</a>`:e(this._config.title||z.name)}</h2><button type="button" class="mini-more" data-action="more" data-zone="${e(z.id)}" aria-label="Open native thermostat" ${z.climate_entity?'':'disabled'}>⋮</button></header>
      <div class="ring mini-dial" data-mini-dial role="slider" tabindex="${canSet?'0':'-1'}" aria-label="Target temperature dial" aria-valuemin="${z.limits.minimum}" aria-valuemax="${z.limits.maximum}" aria-valuenow="${e(target)}" aria-valuetext="${e(this._temp(Number(target),z.unit))}" aria-disabled="${!canSet}" style="--fill:${fill}"><svg class="mini-arc" viewBox="0 0 200 200" aria-hidden="true"><circle class="arc-track" cx="100" cy="100" r="85" stroke-dasharray="400.553 534.071"/><circle class="arc-value" data-mini-arc cx="100" cy="100" r="85" stroke-dasharray="${fill/360*534.071} 534.071"/></svg><span class="dial-thumb" aria-hidden="true"></span><span class="mini-caption">${e(this._data.observe_only&&!this._config.demo?'Observe only':caption)}</span><div class="reading" data-mini-reading>${e(this._temp(Number(target),z.unit))}</div><span class="mini-room" aria-label="Room temperature ${e(this._temp(z.current_temperature,z.unit))}">${thermometer}${e(this._temp(z.current_temperature,z.unit))}</span></div>
      ${z.source==='manual'?`<button type="button" class="mini-resume" data-action="smart-resume" data-zone="${e(z.id)}" ${disabled||!this._config.demo&&this._data.observe_only?'disabled':''}>Manual · Resume schedule</button>`:z.source==='occupied_comfort'?'<span class="mini-state">Occupancy override</span>':z.source==='holiday'?'<span class="mini-state">Holiday</span>':''}</div>
      <div class="mini-boost" data-smart-zone="${e(z.id)}"><input type="hidden" data-boost="target" value="${e(p?.boost_target??'')}"><label class="mini-slider"><span class="mini-boost-label"><span class="mini-timer" aria-hidden="true">◴</span><span>Boost time<output data-mini-minutes>${z.boost.active?e(remainingText(z.boost.until,this._now())):e(duration)+' minutes'}</output></span></span><input type="range" data-boost="minutes" aria-label="Boost duration" min="${min}" max="${max}" step="${durationStep}" value="${e(duration)}" ${disabled||z.boost.active||p?.boost_owner==='external'&&!p.duration_helper?'disabled':''}></label></div>
      <button type="button" class="mini-boost-button" data-action="smart-${z.boost.active?'boost-cancel':'boost-start'}" data-zone="${e(z.id)}" ${boostDisabled?'disabled':''}>${flame}${z.boost.active?'Stop boost':'Boost'}</button>
      ${this._error?`<p class="error" role="alert">${e(this._error)}</p>`:''}<span class="mini-sr" role="status">${e(this._message||'')}</span></section>${this._modal()}`;
  }
};
