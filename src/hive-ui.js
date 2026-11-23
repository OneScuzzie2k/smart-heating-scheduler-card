import {escapeHTML as e, remainingText} from './model.js';

const radiator='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v10H4zM7 12v6m5-6v6m5-6v6M3 14H1m19 0h3M7 7c3-2-2-3 1-5m4 5c3-2-2-3 1-5m4 5c3-2-2-3 1-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
export const hiveUI={
  _hiveTile(z,compact=false){
    const native=z.receiver?.schedule_owner==='receiver',hardware=z.receiver?.ownership?.hardware;
    const mode=native?hardware?.mode:z.mode==='off'?'off':z.source==='manual'?'manual':'schedule';
    const boosting=z.boost.active||mode==='boost',target=this._miniTargetZone===z.id&&this._miniTarget!==null?this._miniTarget:z.device_target;
    const canSet=this._miniCanSet(z)&&!boosting&&mode!=='off';
    const blocked=!this._canEdit()||this._saving||this._data.observe_only&&!this._config.demo||!z.enabled||['unavailable','unknown'].includes(z.mode)||['unsupported','error','disabled'].includes(z.source)||!!z.error||native&&!hardware?.mode;
    const modeBlocked=blocked||(!this._config.demo&&!this._data.thermostat_mode_control);
    const fill=Number.isFinite(target)?Math.max(0,Math.min(270,(target-z.limits.minimum)/(z.limits.maximum-z.limits.minimum)*270)):0;
    const label=z.source==='occupied_comfort'?'Occupied':z.source==='preheat'?'Preheating':boosting?'Boost':native&&!mode?'Reading':mode==='off'?'Off':mode==='manual'?'Manual':'Schedule';
    const activity=mode==='off'?'Heating off':z.hvac_action==='heating'?'Heating':z.hvac_action==='idle'?'Idle':'Activity unknown';
    const duration=this._boostInputs?.[z.id]?.minutes??z.smart?.policy?.boost_minutes??30;
    const boostTarget=this._boostInputs?.[z.id]?.target??z.smart?.policy?.boost_target;
    const boostDisabled=!this._canBoost(z)||this._saving||!(z.boost.active?z.boost.can_cancel:z.boost.can_start);
    const context=z.source==='occupied_comfort'?'Occupancy override':z.source==='preheat'?'Smart preheating':z.source==='holiday'?'Holiday':this._data.observe_only&&!this._config.demo?'Observe only':z.boost.active?'Timed boost':mode==='off'?'Heating off':mode==='manual'||z.source==='manual'?'Manual temperature':mode==='boost'?'Thermostat boost':native&&!mode?'Checking thermostat':'Following schedule';
    const href=this._config.dashboard_path?.startsWith('/')&&!this._config.dashboard_path.startsWith('//')?this._config.dashboard_path:null;
    return `<section class="hive-thermostat ${mode==='off'?'hive-off':''} ${compact?'hive-compact':''}" aria-label="${e(z.name)} thermostat">
      <header class="hive-head"><div class="hive-title"><span class="hive-icon">${radiator}</span><h2>${e(compact?this._config.title||z.name:z.name)}</h2></div><span class="hive-badge ${boosting?'hive-warm':''}" aria-label="Thermostat mode ${e(label)}">${e(label)}</span></header>
      <div class="ring mini-dial hive-dial" data-mini-dial="${e(z.id)}" role="slider" tabindex="${canSet?'0':'-1'}" aria-label="${e(z.name)} target temperature dial" aria-valuemin="${z.limits.minimum}" aria-valuemax="${z.limits.maximum}" aria-valuenow="${e(target??z.limits.minimum)}" aria-valuetext="${e(this._temp(target,z.unit))}" aria-description="Room temperature ${e(this._temp(z.current_temperature,z.unit))}. ${e(activity)}" aria-disabled="${!canSet}" style="--fill:${fill}">
        <svg class="mini-arc" viewBox="0 0 200 200" aria-hidden="true"><circle class="arc-track" cx="100" cy="100" r="85" stroke-dasharray="400.553 534.071"/><circle class="arc-value" data-mini-arc="${e(z.id)}" cx="100" cy="100" r="85" stroke-dasharray="${fill/360*534.071} 534.071"/></svg><span class="dial-thumb" aria-hidden="true"></span>
        <div class="hive-current">${e(this._temp(z.current_temperature,''))}<sup>${e(z.unit)}</sup></div>
        <div class="hive-activity">${e(activity)}${mode!=='off'?` · target <span data-mini-reading="${e(z.id)}">${e(this._temp(target,z.unit))}</span>`:''}</div><div class="hive-room-label">${boosting?'Boost · locked':'Room temperature'}</div>
      </div>
      <div class="hive-modes" role="group" aria-label="${e(z.name)} heating mode">${[['schedule','Schedule'],['manual','Manual'],['off','Off']].map(([key,name])=>`<button type="button" data-action="${key==='schedule'?'smart-resume':'hive-mode'}" data-mode="${key}" data-zone="${e(z.id)}" aria-pressed="${(mode==='boost'&&z.receiver?.ownership?.lease?'schedule':mode)===key&&!z.boost.active}" ${modeBlocked||z.boost.active&&key!=='off'?'disabled':''}>${name}</button>`).join('')}</div>
      <div class="hive-footer"><button type="button" class="hive-boost" data-action="${z.boost.active?'smart-boost-cancel':'hive-boost'}" data-zone="${e(z.id)}" ${boostDisabled?'disabled':''}>${z.boost.active?(compact?'× Stop · '+e(remainingText(z.boost.until,this._now()).replace(' min remaining','m')):'× Stop boost · '+e(remainingText(z.boost.until,this._now()))):compact?'♨ Boost '+e(duration)+'m · '+e(this._temp(boostTarget,''))+'°':'♨ Boost '+e(duration)+' min · '+e(this._temp(boostTarget,z.unit))}</button>${compact&&href?`<a class="hive-more" href="${e(href)}" aria-label="Open full heating scheduler">More <span aria-hidden="true">›</span></a>`:`<button type="button" class="hive-more" data-action="${compact?'hive-more':'hive-schedule'}" data-zone="${e(z.id)}">${compact?'Details':'Schedule'} <span aria-hidden="true">›</span></button>`}</div>
      <div class="hive-context" role="status">${e(z.error?'Check heating settings':context)}</div></section>`;
  },
  _hiveDialog(){
    const z=this._zoneFor(this._dialog.zone);if(!z)return '';
    if(this._dialog.kind==='hive-boost')return `<p>${e(z.name)}</p>${this._smartBoostControls(z)}`;
    return `<p>${e(z.name)}</p><div class="fact-row"><span>Schedule controller</span><b>${z.receiver?.schedule_owner==='receiver'?'Local receiver':'Home Assistant'}</b></div><div class="fact-row"><span>Occupancy override</span><b>${z.smart?.policy?.comfort_target!=null?'Enabled · minimum '+e(this._temp(z.smart.policy.comfort_target,z.unit)):'Disabled'}</b></div><div class="fact-row"><span>Smart preheating</span><b>${z.insights?.settings?.preheat_enabled?e(z.insights?.preheat?.state||'Enabled'):'Disabled'}</b></div><p class="status-caption">${e(z.reason||'')}</p><div class="toolbar"><button data-action="more" data-zone="${e(z.id)}">Native thermostat</button>${this._config.layout!=='mini'?`<button data-action="hive-schedule" data-zone="${e(z.id)}">View schedule</button>`:this._config.dashboard_path?.startsWith('/')&&!this._config.dashboard_path.startsWith('//')?`<a class="shs-link" href="${e(this._config.dashboard_path)}">Full scheduler →</a>`:''}<button data-action="close">Done</button></div>`;
  },
  async _hiveAction(action,data){
    const z=this._zoneFor(data.zone);if(!z||this._saving)return;
    if(action==='boost'||action==='more'){this._dialog={kind:'hive-'+action,zone:z.id};this._focusDialog=true;this._render();return;}
    if(action==='schedule'){this._dialog=null;this._action('schedule',data);return;}
    if(action!=='mode'||!this._canEdit()||!z.enabled||this._data.observe_only&&!this._config.demo)return;
    if(!['manual','off'].includes(data.mode))return;
    const target=Math.max(z.limits.minimum,Math.min(z.limits.maximum,z.device_target??z.limits.minimum));
    this._saving=true;this._error='';this._render();
    try{
      if(this._config.demo){z.mode=data.mode==='off'?'off':'heat';z.source=data.mode==='off'?'off':'manual';z.device_target=target;if(z.receiver?.ownership)z.receiver.ownership.hardware={mode:data.mode};}
      else this._data=await this._hass.callWS({type:'smart_heating_scheduler/control',entry_id:this._config.entry_id,zone_id:z.id,action:'thermostat_mode',payload:{mode:data.mode,...data.mode==='manual'?{target}:{}}});
      this._message=z.name+': '+(data.mode==='off'?'Off':'Manual');
    }catch(error){this._error=error.message||'Could not change thermostat mode.';}
    finally{this._saving=false;this._render();}
  }
};
