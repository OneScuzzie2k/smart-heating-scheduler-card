import {escapeHTML as e} from './model.js';

const acknowledgement='WRITE RECEIVER TIMETABLE';
const timerAcknowledgement='TEST RECEIVER TIMER';
const time=minute=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
const periods=day=>day?.length?day.map(p=>`${time(p.minute)} · ${p.centi===0||p.centi===100?'Native Off':`${p.centi/100}°C`}`).join(' / '):'No transitions returned';

export const receiverUI={
  _receiverKey(z=this._zone()) { return `${this._config.entry_id}:${z.id}:${z.climate_entity}`; },
  _receiverRecord(){
    const z=this._zone(),cached=this._receiverRecords?.[this._receiverKey()],summary=z.receiver;
    if(!cached)return summary;
    if(summary?.qualification&&Date.parse(summary.qualification.updated_at)>Date.parse(cached.qualification?.updated_at||0))return {...cached,qualification:{...cached.qualification,...summary.qualification}};
    return cached;
  },
  _receiverTimerPanel(record,disabled){
    const z=this._zone(),q=record.qualification,active=['switching_schedule','starting_boost','waiting_expiry','restoring'].includes(q?.state),last=q?.latest||q?.observations?.at(-1),hardware=record.hardware?.state;
    const state=q?.state||'Not prepared';
    const result=q?`<div class="fact-row"><span>Test state</span><b>${e(state)}</b></div>${q.result?`<p>${e(q.result.replaceAll('_',' '))}</p>`:''}${last?`<p class="muted">Last native read: ${e(last.hardware.mode)} · target ${e(last.hardware.target/100)}°C · timer ${e(last.hardware.duration===65535?'not bounded':last.hardware.duration+' min')}. ${e(last.at)}</p>`:''}${q.error?`<p class="error" role="alert">${e(q.error)}</p>`:''}${q.state==='restored'?`<p>Hardware expiry observed: ${q.expiry_passed?'yes':'not proven'}. Current scheduled target matched: ${q.schedule_target_verified?'yes':'not proven'}. Original Manual hold restored: ${q.restoration_verified?'verified':'not verified'}.</p>`:''}`:'';
    const prepared=q?.state==='prepared'&&q.id&&q.original;
    const ready=prepared&&Date.parse(q.expires_at)>Date.now();
    const confirm=prepared?`<p>Original Manual target: ${e(q.original.target/100)}°C. Test target: the same ${e(q.original.target/100)}°C for two minutes. Pause competing controllers for the test window; the backend cannot identify every automation.</p>${z.enabled?'<p class="muted">Disable only this zone’s HA scheduling before starting the test.</p>':''}<label>Type ${timerAcknowledgement} to confirm<input data-receiver-test-ack data-field="receiver-test-ack" aria-label="Confirm receiver timer test" autocomplete="off" value="${e(this._receiverTimerAcknowledgements?.[this._receiverKey()]||'')}" ${disabled?'disabled':''}></label><button data-action="receiver-start_test" class="primary" ${disabled||z.enabled||!ready||this._receiverTimerAcknowledgements?.[this._receiverKey()]!==timerAcknowledgement?'disabled':''}>Start two-minute hardware timer test</button>`:'';
    return this._disclosure('receiver-test','Hardware timer qualification',`<p class="muted">Supervised test only. It briefly selects the receiver’s Schedule mode, starts a two-minute native boost at its unchanged Manual target, observes expiry, then restores the original Manual hold. The fresh room reading must be at least 1°C warmer, with no warmer native period due in the next five minutes. This test cannot enable receiver ownership.</p>${hardware?`<p>Inspected native mode: ${e(hardware.mode)} · target ${e(hardware.target/100)}°C.</p>`:''}${result}<div class="toolbar"><button data-action="receiver-inspect" ${disabled?'disabled':''}>Inspect receiver mode</button><button data-action="receiver-prepare_test" ${disabled||active?'disabled':''}>Prepare timer test</button>${active||q?.state==='needs_review'?`<button data-action="receiver-check_test" ${disabled?'disabled':''}>Refresh timer test</button><button data-action="receiver-restore_test" ${disabled||z.enabled?'disabled':''}>Restore original hold</button>`:''}</div>${confirm}`,'Two-minute native expiry and original-state recovery');
  },
  _receiverPanel(){
    const z=this._zone();
    if(!z.receiver||!this._data.can_edit||this._config.demo)return '';
    const record=this._receiverRecord(),plan=record.plan;
    const disabled=!this._canEdit()||this._saving||Boolean(this._draft||this._featureDraft);
    const hasPlan=plan&&plan.revision===z.revision&&Date.parse(plan.expires_at)>Date.now();
    const table=record.snapshot?`<h3>Last complete receiver read</h3><div class="import-preview">${Object.entries(record.snapshot.schedule).map(([day,items])=>`<p><b>${e(day)}</b> ${e(periods(items))}</p>`).join('')}</div>${record.snapshot.import_warning?`<p class="muted">${e(record.snapshot.import_warning)}</p>`:''}`:'';
    const preview=plan?`<h3>Reviewed copy · ${plan.source==='backup'?'restore backup':'saved HA week'}</h3><p>${plan.changed_days.length} changed days. Preview expires after ten minutes. Copying the timetable does not activate receiver Schedule mode.</p><div class="import-preview">${plan.changed_days.map(day=>`<p><b>${e(day)}</b><br>Receiver: ${e(periods(plan.before[day]))}<br>Proposed: ${e(periods(plan.after[day]))}</p>`).join('')||'<p>The timetables already match.</p>'}</div>${z.enabled?'<p class="muted">Hardware writes are unavailable while this zone’s HA scheduling is enabled.</p>':''}<label>Type ${acknowledgement} to confirm<input data-receiver-ack aria-label="Confirm receiver timetable copy" autocomplete="off" value="${e(this._receiverAcknowledgements?.[this._receiverKey()]||'')}" ${disabled?'disabled':''}></label><button data-action="receiver-write" class="primary" ${disabled||z.enabled||!hasPlan||this._receiverAcknowledgements?.[this._receiverKey()]!==acknowledgement?'disabled':''}>Copy reviewed timetable to receiver</button>`:'';
    const backups=(record.transactions||[]).map(t=>`<div class="fact-row"><span>${e(t.started_at)} · ${e(t.state)}</span><button data-action="receiver-restore" data-backup="${e(t.id)}" ${disabled?'disabled':''}>Preview original timetable</button></div>`).join('');
    return this._disclosure('receiver','Receiver schedule · development',`<p class="muted">HA currently runs this zone’s schedule. Receiver ownership is not available in this development stage. Heating only: known single-channel Hive receivers through ZHA. Other thermostats keep their existing HA scheduling.</p><p role="status">${e(record.error||record.state)} · ${e(record.read_at||record.snapshot?.at||'Not read yet')}</p>${this._receiverErrors?.[this._receiverKey()]?`<p class="error" role="alert">${e(this._receiverErrors[this._receiverKey()])}</p>`:''}${this._draft||this._featureDraft?'<p>Save or discard your settings draft before reviewing a receiver copy.</p>':''}<div class="toolbar"><button data-action="receiver-read" ${disabled?'disabled':''}>Read receiver timetable</button><button data-action="receiver-prepare" ${disabled?'disabled':''}>Preview saved week on receiver</button><button data-action="receiver-export" ${disabled||!record.snapshot?'disabled':''}>Download receiver backup</button></div>${table}${preview}${backups?`<h3>Copy backups</h3>${backups}<p class="muted">The last five operations retain the original timetable. Restore requires a new preview, disabled zone and matching readback.</p>`:''}${this._receiverTimerPanel(record,disabled)}`,'Read, compare and back up · HA remains in charge');
  },
  _receiverInput(target){
    if(target.hasAttribute('data-receiver-test-ack')){
      this._receiverTimerAcknowledgements ||= {};this._receiverTimerAcknowledgements[this._receiverKey()]=target.value;
      const q=this._receiverRecord()?.qualification,z=this._zone(),button=this.shadowRoot.querySelector('[data-action="receiver-start_test"]');
      if(button)button.disabled=!this._canEdit()||this._saving||Boolean(this._draft||this._featureDraft)||z.enabled||q?.state!=='prepared'||!q.id||Date.parse(q.expires_at)<=Date.now()||target.value!==timerAcknowledgement;
      return;
    }
    if(!target.hasAttribute('data-receiver-ack'))return;
    this._receiverAcknowledgements ||= {};this._receiverAcknowledgements[this._receiverKey()]=target.value;
    const plan=this._receiverRecords?.[this._receiverKey()]?.plan,z=this._zone();
    const button=this.shadowRoot.querySelector('[data-action="receiver-write"]');
    if(button)button.disabled=!this._canEdit()||this._saving||Boolean(this._draft||this._featureDraft)||z.enabled||!plan||plan.revision!==z.revision||Date.parse(plan.expires_at)<=Date.now()||target.value!==acknowledgement;
  },
  async _receiverAction(action,data={}){
    if(!this._canEdit()||this._saving||this._config.demo||this._draft||this._featureDraft)return;
    const z=this._zone(),key=this._receiverKey(z),record=this._receiverRecord(),generation=this._generation;
    if(action==='export'){
      if(!record?.snapshot)return;
      const url=URL.createObjectURL(new Blob([JSON.stringify({format:'smart-heating-scheduler/receiver',version:1,...record},null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='heating-receiver-backup.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    }
    const payload=action==='prepare'||action==='prepare_test'?{revision:z.revision}:action==='restore'?{revision:z.revision,backup_id:data.backup}:action==='write'?{plan_id:record?.plan?.id,acknowledgement:this._receiverAcknowledgements?.[key]||''}:action==='start_test'?{test_id:record?.qualification?.id,acknowledgement:this._receiverTimerAcknowledgements?.[key]||''}:{};
    if(action==='write'&&(z.enabled||!payload.plan_id||payload.acknowledgement!==acknowledgement)){this._error='Disable this zone and confirm the current reviewed timetable before copying.';this._render();return;}
    if(action==='start_test'&&(z.enabled||!payload.test_id||payload.acknowledgement!==timerAcknowledgement)){this._error='Disable this zone and confirm the reviewed two-minute test before starting.';this._render();return;}
    this._saving=true;this._error='';this._message='';this._render();
    this._receiverErrors ||= {};delete this._receiverErrors[key];
    try{
      const result=await this._hass.callWS({type:'smart_heating_scheduler/receiver',entry_id:this._config.entry_id,zone_id:z.id,action:action==='restore'?'prepare_restore':action,payload});
      if(generation!==this._generation)return;
      this._receiverRecords ||= {};this._receiverRecords[key]=result;
      this._receiverAcknowledgements ||= {};this._receiverAcknowledgements[key]='';
      this._receiverTimerAcknowledgements ||= {};this._receiverTimerAcknowledgements[key]='';
      this._message=z.name+': '+(action==='write'?'Receiver timetable verified. HA still owns scheduling.':action==='read'?'Complete seven-day receiver timetable read.':action==='inspect'?'Fresh native receiver mode read.':action==='start_test'?'Two-minute native timer test started. Original hold will be restored after the expiry check.':action==='check_test'||action==='restore_test'?'Receiver timer test status refreshed.':'Preview prepared. Receiver timetable is unchanged.');
    }catch(error){
      if(generation===this._generation){
        if(action==='write'||action==='start_test'){delete this._receiverRecords?.[key];delete this._receiverAcknowledgements?.[key];delete this._receiverTimerAcknowledgements?.[key];}
        this._error=`${error.message||'Receiver operation failed.'}${action==='write'?' Copy is unverified. Read the receiver before preparing another copy.':action==='start_test'?' Inspect the receiver and check restoration before resuming the zone.':''}`;
        this._receiverErrors[key]=this._error;
      }
    }finally{this._saving=false;this._render();}
  },
};
