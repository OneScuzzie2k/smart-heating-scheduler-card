import {escapeHTML as e} from './model.js';

const acknowledgement='WRITE RECEIVER TIMETABLE';
const time=minute=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
const periods=day=>day?.length?day.map(p=>`${time(p.minute)} · ${p.centi===0||p.centi===100?'Native Off':`${p.centi/100}°C`}`).join(' / '):'No transitions returned';

export const receiverUI={
  _receiverKey(z=this._zone()) { return `${this._config.entry_id}:${z.id}:${z.climate_entity}`; },
  _receiverPanel(){
    const z=this._zone();
    if(!z.receiver||!this._data.can_edit||this._config.demo)return '';
    const record=this._receiverRecords?.[this._receiverKey()]||z.receiver,plan=record.plan;
    const disabled=!this._canEdit()||this._saving||Boolean(this._draft||this._featureDraft);
    const hasPlan=plan&&plan.revision===z.revision&&Date.parse(plan.expires_at)>Date.now();
    const table=record.snapshot?`<h3>Last complete receiver read</h3><div class="import-preview">${Object.entries(record.snapshot.schedule).map(([day,items])=>`<p><b>${e(day)}</b> ${e(periods(items))}</p>`).join('')}</div>${record.snapshot.import_warning?`<p class="muted">${e(record.snapshot.import_warning)}</p>`:''}`:'';
    const preview=plan?`<h3>Reviewed copy · ${plan.source==='backup'?'restore backup':'saved HA week'}</h3><p>${plan.changed_days.length} changed days. Preview expires after ten minutes. Copying the timetable does not activate receiver Schedule mode.</p><div class="import-preview">${plan.changed_days.map(day=>`<p><b>${e(day)}</b><br>Receiver: ${e(periods(plan.before[day]))}<br>Proposed: ${e(periods(plan.after[day]))}</p>`).join('')||'<p>The timetables already match.</p>'}</div>${z.enabled?'<p class="muted">Hardware writes are unavailable while this zone’s HA scheduling is enabled.</p>':''}<label>Type ${acknowledgement} to confirm<input data-receiver-ack aria-label="Confirm receiver timetable copy" autocomplete="off" value="${e(this._receiverAcknowledgements?.[this._receiverKey()]||'')}" ${disabled?'disabled':''}></label><button data-action="receiver-write" class="primary" ${disabled||z.enabled||!hasPlan||this._receiverAcknowledgements?.[this._receiverKey()]!==acknowledgement?'disabled':''}>Copy reviewed timetable to receiver</button>`:'';
    const backups=(record.transactions||[]).map(t=>`<div class="fact-row"><span>${e(t.started_at)} · ${e(t.state)}</span><button data-action="receiver-restore" data-backup="${e(t.id)}" ${disabled?'disabled':''}>Preview original timetable</button></div>`).join('');
    return this._disclosure('receiver','Receiver schedule · development',`<p class="muted">HA currently runs this zone’s schedule. Receiver ownership is not available in this development stage. Heating only: known single-channel Hive receivers through ZHA. Other thermostats keep their existing HA scheduling.</p><p role="status">${e(record.error||record.state)} · ${e(record.read_at||record.snapshot?.at||'Not read yet')}</p>${this._draft||this._featureDraft?'<p>Save or discard your settings draft before reviewing a receiver copy.</p>':''}<div class="toolbar"><button data-action="receiver-read" ${disabled?'disabled':''}>Read receiver timetable</button><button data-action="receiver-prepare" ${disabled?'disabled':''}>Preview saved week on receiver</button><button data-action="receiver-export" ${disabled||!record.snapshot?'disabled':''}>Download receiver backup</button></div>${table}${preview}${backups?`<h3>Copy backups</h3>${backups}<p class="muted">The last five operations retain the original timetable. Restore requires a new preview, disabled zone and matching readback.</p>`:''}`,'Read, compare and back up · HA remains in charge');
  },
  _receiverInput(target){
    if(!target.hasAttribute('data-receiver-ack'))return;
    this._receiverAcknowledgements ||= {};this._receiverAcknowledgements[this._receiverKey()]=target.value;
    const plan=this._receiverRecords?.[this._receiverKey()]?.plan,z=this._zone();
    const button=this.shadowRoot.querySelector('[data-action="receiver-write"]');
    if(button)button.disabled=!this._canEdit()||this._saving||Boolean(this._draft||this._featureDraft)||z.enabled||!plan||plan.revision!==z.revision||Date.parse(plan.expires_at)<=Date.now()||target.value!==acknowledgement;
  },
  async _receiverAction(action,data={}){
    if(!this._canEdit()||this._saving||this._config.demo||this._draft||this._featureDraft)return;
    const z=this._zone(),key=this._receiverKey(z),record=this._receiverRecords?.[key],generation=this._generation;
    if(action==='export'){
      if(!record?.snapshot)return;
      const url=URL.createObjectURL(new Blob([JSON.stringify({format:'smart-heating-scheduler/receiver',version:1,...record},null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='heating-receiver-backup.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    }
    const payload=action==='prepare'?{revision:z.revision}:action==='restore'?{revision:z.revision,backup_id:data.backup}:action==='write'?{plan_id:record?.plan?.id,acknowledgement:this._receiverAcknowledgements?.[key]||''}:{};
    if(action==='write'&&(z.enabled||!payload.plan_id||payload.acknowledgement!==acknowledgement)){this._error='Disable this zone and confirm the current reviewed timetable before copying.';this._render();return;}
    this._saving=true;this._error='';this._message='';this._render();
    try{
      const result=await this._hass.callWS({type:'smart_heating_scheduler/receiver',entry_id:this._config.entry_id,zone_id:z.id,action:action==='restore'?'prepare_restore':action,payload});
      if(generation!==this._generation)return;
      this._receiverRecords ||= {};this._receiverRecords[key]=result;
      this._receiverAcknowledgements ||= {};this._receiverAcknowledgements[key]='';
      this._message=action==='write'?'Receiver timetable verified. HA still owns scheduling.':action==='read'?'Complete seven-day receiver timetable read.':'Preview prepared. Receiver timetable is unchanged.';
    }catch(error){
      if(generation===this._generation){
        if(action==='write'){delete this._receiverRecords?.[key];delete this._receiverAcknowledgements?.[key];}
        this._error=`${error.message||'Receiver operation failed.'}${action==='write'?' Copy is unverified. Read the receiver before preparing another copy.':''}`;
      }
    }finally{this._saving=false;this._render();}
  },
};
