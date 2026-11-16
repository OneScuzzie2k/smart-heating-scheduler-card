import {clone, escapeHTML as e, validateWeek} from './model.js';

export function scheduleBackup(zone) {
  return {format:'smart-heating-scheduler/schedule',version:1,name:zone.name,unit:zone.unit,week:clone(zone.week)};
}
export function parseBackup(text, zone) {
  if(typeof text!=='string'||text.length>150000)throw Error('Choose a schedule backup smaller than 150 KB.');
  const data=JSON.parse(text);
  if(!data||!['smart-heating-scheduler/schedule','smart-heating-scheduler/zone'].includes(data.format)||data.version!==1)throw Error('Unsupported schedule backup format or version.');
  if(data.unit!==zone.unit)throw Error('Temperature units differ. Automatic conversion is not supported.');
  validateWeek(data.week,zone.limits);
  return clone(data.week);
}
export const transferUI={
  _transferPanel(){
    const disabled=!this._canEdit()||this._saving;
    return this._disclosure('transfer','Schedule backup & copying',`<p class="muted">Download this zone’s saved week, import a backup into a draft, or copy another zone’s week. Import and copy change nothing until you review and save the week. Week backups contain schedules only. Zone settings backups also contain occupancy and boost mappings, profiles, history preferences, preheating and frost options. Restore zone settings only into a disabled zone after reviewing the JSON. Thermostat mappings, limits, control mode, active overrides, history and learned data are never imported. Use Home Assistant backups for full recovery.</p><div class="toolbar"><button data-action="transfer-export" ${disabled?'disabled':''}>Export saved week</button><button data-action="transfer-export-zone" ${disabled?'disabled':''}>Export zone settings</button><button data-action="transfer-import" ${disabled?'disabled':''}>Import week</button><button data-action="copy-week" ${disabled||this._data.zones.filter(z=>z.id!==this._zone().id&&z.unit===this._zone().unit).length===0?'disabled':''}>Copy from another zone</button></div>`, 'Download, preview an import or copy between zones');
  },
  async _transferAction(action){
    if(!this._canEdit()||this._saving)return;
    if(action==='export'||action==='export-zone'){
      const blob=new Blob([JSON.stringify(action==='export-zone'?{...scheduleBackup(this._zone()),format:'smart-heating-scheduler/zone',policy:clone(this._zone().smart.policy),features:clone(this._zone().insights.settings)}:scheduleBackup(this._zone()),null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=action==='export-zone'?'heating-zone-settings.json':'heating-schedule.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    }
    if(action==='import'){
      this._guard(()=>{this._dialog={kind:'import-week',text:'',week:null,zone:this._zone().id,revision:this._zone().revision,featuresRevision:this._zone().insights?.revision,policyRevision:this._zone().smart?.policy_revision};this._dialogError='';this._focusDialog=true;this._render();});return;
    }
    if(action==='preview'){
      try{this._dialog.week=parseBackup(this._dialog.text,this._zone());const data=JSON.parse(this._dialog.text);this._dialog.configuration=data.format==='smart-heating-scheduler/zone'?data:null;this._dialog.ack=false;this._dialogError='';}
      catch(error){this._dialog.week=null;this._dialog.configuration=null;this._dialogError=error.message;}
      this._render();return;
    }
    if(action==='restore'&&this._dialog?.configuration){
      const z=this._zone(),d=this._dialog;
      if(z.enabled||!d.ack){this._dialogError='Disable the destination zone and acknowledge the settings review first.';this._render();return;}
      this._saving=true;this._error='';this._render();
      try{
        if(this._config.demo){if(z.revision!==d.revision||z.insights.revision!==d.featuresRevision||z.smart.policy_revision!==d.policyRevision)throw Error('Zone changed elsewhere; reopen import.');z.week=clone(d.configuration.week);z.smart.policy=clone(d.configuration.policy);z.insights.settings=clone(d.configuration.features);z.revision++;z.insights.revision++;z.smart.policy_revision++;}
        else this._data=await this._hass.callWS({type:'smart_heating_scheduler/control',entry_id:this._config.entry_id,zone_id:z.id,action:'restore_configuration',payload:{backup:d.configuration,revision:d.revision,features_revision:d.featuresRevision,policy_revision:d.policyRevision,acknowledgement:'RESTORE ZONE SETTINGS'}});
        this._dialog=null;this._message='Zone settings restored. The zone remains disabled; review its schedule and settings before enabling it.';
      }catch(error){this._dialogError=error.message||'Restore failed. Keep the zone disabled and inspect the settings before retrying.';}
      finally{this._saving=false;this._render();}return;
    }
    if(action==='apply'&&this._dialog?.week){
      if(this._zone().id!==this._dialog.zone||this._zone().revision!==this._dialog.revision){this._dialogError='The destination schedule changed. Close and reopen import to review the latest version.';this._render();return;}
      const week=this._dialog.week;this._dialog=null;this._view='schedules';this._mutate(week);this._message='Imported into a draft. Review the week, then Save week to apply it.';this._render();
    }
  },
  _importDialog(){
    const d=this._dialog;
    return `<p>Import into <strong>${e(this._zone().name)}</strong>. Choose an exported JSON file or paste its contents. No heating changes occur in this preview.</p><label>Schedule backup file<input type="file" accept=".json,application/json" data-import-file aria-label="Schedule backup file"></label><label>Backup JSON<textarea data-import-text aria-label="Backup JSON" rows="5">${e(d.text)}</textarea></label>${this._dialogError?`<div class="error" role="alert">${e(this._dialogError)}</div>`:''}${d.week?`<div class="success" role="status">Validated for ${e(this._zone().unit)} and this zone’s limits. ${Object.values(d.week).reduce((n,p)=>n+p.length,0)} periods across seven days.</div><div class="import-preview">${Object.entries(d.week).map(([day,periods])=>`<div><b>${e(day)}</b> ${periods.map(p=>`${e(p.start)} · ${e(p.temperature)}${e(this._zone().unit)}`).join(' / ')}</div>`).join('')}</div>`:''}${d.configuration?`<p class="muted">This file also includes zone settings and entity references. Read the JSON above and check every boost script, timer and occupancy input. The thermostat mapping, reviewed limits and control mode stay unchanged.</p><label class="check"><input type="checkbox" data-import-ack ${d.ack?'checked':''}>I reviewed all settings and entity mappings for this destination</label>${this._zone().enabled?'<p class="error">Disable this zone in Manage thermostat and limits before restoring its settings.</p>':''}<button data-action="transfer-restore" class="primary" ${this._zone().enabled||!d.ack||this._saving?'disabled':''}>Restore zone settings</button>`:''}<div class="toolbar"><button data-action="close">Cancel</button><button data-action="transfer-preview">Validate & preview</button><button class="primary" data-action="transfer-apply" ${d.week?'':'disabled'}>Load into draft</button></div>`;
  },
};
