import {clone, escapeHTML as e, DAYS, validateWeek, localParts} from './model.js';

export const featureDefaults=()=>({profiles:{},workday_entity:'',workday_profile:'',non_workday_profile:'',calendar_rules:[],preheat_enabled:false,preheat_max_minutes:90,preheat_margin_minutes:5,history_enabled:true});
const btn=(label,action,disabled=false,attrs='')=>`<button type="button" data-action="feature-${action}" ${disabled?'disabled':''} ${attrs}>${e(label)}</button>`;

export function demoInsights(zone, now) {
  const settings=featureDefaults();
  settings.profiles={'Workday':clone(zone.week.mon),'Day off':clone(zone.week.sun)};
  const end=Date.parse(now), samples=[];
  for(let i=288;i>=0;i--){const at=new Date(end-i*300000),hour=at.getUTCHours()+at.getUTCMinutes()/60;const target=hour>=6.5&&hour<8.5||hour>=16.5&&hour<22?20:16; samples.push({at:at.toISOString(),room:18.7+Math.sin((hour-8)*Math.PI/12)*1.1,target,action:target===20?'heating':'idle'});}
  return {revision:1,settings,active_profile:'Weekly schedule',days:[],effective_week:clone(zone.week),warnings:[],preheat:{state:'learning',rate:null,samples:7,minutes:35},samples,decisions:[{at:new Date(end-6*3600000).toISOString(),source:'schedule',target:20,reason:'Morning comfort period'},{at:new Date(end-4*3600000).toISOString(),source:'schedule',target:16,reason:'Day setback'},{at:new Date(end-2*3600000).toISOString(),source:'occupied_comfort',target:20,reason:'Occupied comfort minimum during the configured window'}]};
}

export const insightsUI={
  _featureSettings(){return this._featureDraft?.zone===this._zone().id?this._featureDraft.settings:this._zone().insights?.settings;},
  _featureEdit(){
    const z=this._zone();if(!this._canEdit()||!z.insights||this._saving)return null;
    if(!this._featureDraft)this._featureDraft={zone:z.id,revision:z.insights.revision,settings:clone(z.insights.settings)};
    return this._featureDraft.settings;
  },
  _featureInput(target){
    if(!target.dataset.feature)return;
    const s=this._featureEdit();if(!s)return;
    const key=target.dataset.feature;
    const value=target.type==='checkbox'?target.checked:target.type==='number'?Number(target.value):target.value;
    if(target.dataset.profileRow!==undefined){s.profiles[this._profileName][Number(target.dataset.profileRow)][key]=value;}
    else if(target.dataset.ruleRow!==undefined)s.calendar_rules[Number(target.dataset.ruleRow)][key]=value;
    else s[key]=value;
    const caption=this.shadowRoot.querySelector('[data-feature-dirty]');if(caption)caption.textContent='● Unsaved settings';
    const save=this.shadowRoot.querySelector('[data-action="feature-save"]');if(save)save.disabled=false;
    this.shadowRoot.querySelector('[data-feature-savebar]')?.removeAttribute('hidden');
  },
  _featureField(key,label,value,type='text',attrs=''){
    return `<label>${e(label)}<input data-feature="${key}" aria-label="${e(label)}" type="${type}" value="${e(value)}" ${attrs}></label>`;
  },
  _profileOptions(value,empty='Weekly schedule'){
    return `<option value="">${e(empty)}</option>${Object.keys(this._featureSettings()?.profiles||{}).map(name=>`<option value="${e(name)}" ${name===value?'selected':''}>${e(name)}</option>`).join('')}`;
  },
  _featureSummary(zone){
    const f=zone.insights;if(!f)return '';
    const state=f.preheat?.state;
    const text=state==='preheating'?`Preheating · ready by ${this._formatTime(f.preheat.ready_at)}`:state==='learning'&&f.settings.preheat_enabled?'Smart preheating · Learning':null;
    return `<div class="feature-summary"><span class="profile-tag">▦ ${e(f.active_profile||'Weekly schedule')}</span>${text?`<span class="preheat-tag">☀ ${e(text)}</span>`:''}</div>${f.warnings?.length?`<div class="error" role="status">${f.warnings.map(e).join('<br>')}</div>`:''}`;
  },
  _profilesPanel(){
    const z=this._zone(),s=this._featureSettings();if(!s)return `<section class="panel"><p>Update the integration to use calendar profiles and preheating.</p></section>`;
    const disabled=!this._canEdit()||this._saving;
    const names=Object.keys(s.profiles);if(!names.includes(this._profileName))this._profileName=names[0]||'';
    const periods=s.profiles[this._profileName]||[];
    const choices=Object.entries(this._hass?.states||{}).filter(([id])=>id.startsWith('calendar.')||id.startsWith('binary_sensor.')).map(([id,state])=>`<option value="${e(id)}">${e(state.attributes.friendly_name||id)}</option>`).join('');
    return `<section class="panel feature-panel"><div class="section-head"><div><div class="eyebrow">Optional day profiles</div><h2>Calendar & workdays</h2></div><span class="profile-tag">${e(z.insights.active_profile||'Weekly schedule')}</span></div><p class="muted">Keep your normal week, and use a different day profile for bank holidays, days off or working at home. Calendar rules apply to the whole local day. First matching rule wins, then Workday, then your weekly schedule.</p>
    <fieldset ${disabled?'disabled':''}><datalist id="feature-entities">${choices}</datalist><div class="feature-columns"><div><h3>Day profiles</h3><label>Edit profile<select data-action="feature-profile-select" aria-label="Edit profile">${names.length?names.map(name=>`<option ${name===this._profileName?'selected':''}>${e(name)}</option>`).join(''):'<option>No profiles yet</option>'}</select></label>
    ${periods.length?this._timeline(periods,this._day,false):''}<div class="profile-periods">${periods.map((p,i)=>`<div class="profile-period"><label>Start<input aria-label="Profile period ${i+1} start" data-feature="start" data-profile-row="${i}" type="time" value="${e(p.start)}" ${i===0?'readonly':''}></label><label>Target (${e(z.unit)})<input aria-label="Profile period ${i+1} target" data-feature="temperature" data-profile-row="${i}" type="number" min="${z.limits.minimum}" max="${z.limits.maximum}" step="${z.limits.step||'any'}" value="${p.temperature}"></label><label>Name<input aria-label="Profile period ${i+1} name" data-feature="label" data-profile-row="${i}" maxlength="80" value="${e(p.label||'')}"></label>${i?btn('Remove','remove-period',disabled,`data-index="${i}" aria-label="Remove profile period ${i+1}"`):''}</div>`).join('')}</div><div class="toolbar">${names.length?btn('Add period','add-period',disabled):''}${names.length?btn('Delete profile','delete-profile',disabled):''}</div><label>New profile name<input data-new-profile value="${e(this._newProfileNames?.[z.id]||'')}" maxlength="40" placeholder="e.g. Day off" aria-label="New profile name"></label>${btn('Create from selected day','create-profile',disabled)}<p class="muted">Copies ${e(this._day.toUpperCase())} from this zone’s saved week. Edit the copy here; your weekly schedule stays separate.</p></div>
    <div><h3>Workday rules</h3>${this._featureField('workday_entity','Workday sensor (optional)',s.workday_entity,'text','list="feature-entities" placeholder="binary_sensor.workday"')}<label>On a workday<select data-feature="workday_profile">${this._profileOptions(s.workday_profile)}</select></label><label>On a non-workday<select data-feature="non_workday_profile">${this._profileOptions(s.non_workday_profile)}</select></label><p class="muted">Uses your Home Assistant Workday integration, including its configured public holidays. Leave the sensor empty to use only calendar rules.</p><h3>Calendar rules</h3>${s.calendar_rules.map((r,i)=>`<div class="calendar-rule"><label>Calendar<input data-feature="entity_id" data-rule-row="${i}" value="${e(r.entity_id)}" list="feature-entities" placeholder="calendar.example"></label><label>Event title contains<input data-feature="match" data-rule-row="${i}" value="${e(r.match)}" placeholder="Blank matches any event" maxlength="80"></label><label>Use profile<select data-feature="profile" data-rule-row="${i}">${this._profileOptions(r.profile,'Choose a profile')}</select></label>${btn('Remove rule','remove-rule',disabled,`data-index="${i}"`)}</div>`).join('')}${btn('Add calendar rule','add-rule',disabled||!names.length)}<p class="muted">Rules run from top to bottom. Missing inputs show a warning and fall back to the remaining rules. Event titles are used for matching and excluded from history.</p></div></div></fieldset>${this._featureSaveBar()}</section>`;
  },
  _featureSaveBar(){
    const dirty=Boolean(this._featureDraft);return `<div class="draft-bar" data-feature-savebar ${dirty?'':'hidden'}><span data-feature-dirty class="${dirty?'dirty':'muted'}">${dirty?'● Unsaved settings':'Settings saved'}</span><div class="toolbar">${btn('Reload saved','reload',!this._canEdit()||this._saving)}${btn(this._saving?'Saving…':'Save settings','save',!dirty||!this._canEdit()||this._saving,'class="primary"')}</div></div>`;
  },
  _preheatSettings(){
    const z=this._zone(),s=this._featureSettings();if(!s)return '';
    const p=z.insights.preheat||{}, disabled=!this._canEdit()||this._saving;
    const status=!s.preheat_enabled?'Disabled':({learning:'Learning your zone',paused:'Paused by another rule',ready:'Ready for the next warm-up',preheating:'Preheating',no_temperature:'Waiting for room temperature'}[p.state]||'Learning your zone');
    const advanced=`<div class="form-grid">${this._featureField('preheat_margin_minutes','Extra warm-up margin (minutes)',s.preheat_margin_minutes,'number','min="0" max="30" step="1"')}</div><div class="fact-row"><span>Accepted observations</span><b>${e(p.samples||0)} · ${Math.round(p.minutes||0)} min</b></div><div class="fact-row"><span>Measured warm-up rate</span><b>${p.rate?`${Number(p.rate).toFixed(2)} ${e(z.unit)}/hour`:'Learning'}</b></div><p class="muted">Learning needs at least 12 measured increases covering an hour of heating. Old learning expires after 14 days without useful readings.</p>${btn('Reset learning','reset-learning',disabled)}`;
    return `<section class="panel smart-feature"><div class="scope">${e(z.name)} · zone setting</div><h2>Smart preheating</h2><p class="muted">Learn how this zone warms up, and start early enough to aim for its scheduled temperature.</p><fieldset ${disabled?'disabled':''}><label class="occupancy-toggle"><input type="checkbox" aria-label="Enable smart preheating for this zone" data-feature="preheat_enabled" ${s.preheat_enabled?'checked':''}>Enable smart preheating</label><div class="feature-status"><span class="dot" aria-hidden="true"></span>${e(status)}${s.preheat_enabled&&p.state==='preheating'?` · ready by ${e(this._formatTime(p.ready_at))}`:''}</div><div class="preheat-options" ${s.preheat_enabled?'':'hidden'}>${this._featureField('preheat_max_minutes','Maximum early start (minutes)',s.preheat_max_minutes,'number','min="5" max="180" step="1"')}<p class="muted">Off, manual temperatures, boosts, holidays and Away still take priority.</p>${this._disclosure('preheat-options','Advanced options',advanced,'Warm-up margin, measurements and reset')}</div></fieldset>${this._featureSaveBar()}</section>`;
  },
  _heatingHistory(){
    const z=this._zone(),f=z.insights;const range=this._historyRange||24;
    if(!f)return `<section class="panel"><h2>History</h2><p>Update the integration to use heating history.</p></section>`;
    const samples=(f.samples||[]).filter(p=>Date.parse(p.at)>=Date.parse(this._now())-range*3600000);
    const valid=samples.flatMap(p=>[p.room,p.target]).filter(Number.isFinite),low=valid.length?Math.min(...valid)-.5:15,high=valid.length?Math.max(...valid)+.5:22;
    const end=Date.parse(this._now()),start=end-range*3600000;
    const chartWidth=Math.max(280,(this.clientWidth||850)-80), plotWidth=chartWidth-70;
    const chartHeight=chartWidth>650?190:175, plotBottom=chartHeight-35;
    const x=at=>48+(Date.parse(at)-start)/(end-start)*plotWidth,y=v=>plotBottom-(v-low)/(high-low)*(plotBottom-20);
    const path=key=>{let result='',prev=null;for(const p of samples){const val=p[key];if(!Number.isFinite(val)){prev=null;continue;}const gap=prev&&Date.parse(p.at)-Date.parse(prev.at)>15*60000;result+=`${prev&&!gap?'L':'M'}${x(p.at).toFixed(1)},${y(val).toFixed(1)} `;prev=p;}return result;};
    const ticks=Array.from({length:5},(_,i)=>{const value=low+(high-low)*i/4;return `<line x1="48" x2="${chartWidth-22}" y1="${y(value)}" y2="${y(value)}" class="chart-grid"/><text x="40" y="${y(value)+4}" text-anchor="end">${value.toFixed(1)}</text>`;}).join('');
    const labels=Array.from({length:5},(_,i)=>{const at=new Date(start+(end-start)*i/4).toISOString(),part=localParts(at,this._data.timezone);return `<text x="${48+i*plotWidth/4}" y="${chartHeight-10}" text-anchor="${i===0?'start':i===4?'end':'middle'}">${e(range>24?new Intl.DateTimeFormat('en-GB',{timeZone:this._data.timezone,month:'short',day:'2-digit'}).format(new Date(at)):part.time)}</text>`;}).join('');
    const decisions=[...(f.decisions||[])].filter(p=>Date.parse(p.at)>=start).reverse();
    return `<div class="zone-picker"><div><div class="eyebrow">Measured, not predicted</div><h2>Heating history</h2></div>${this._selector()}</div><section class="panel"><div class="section-head"><h3>${e(z.name)}</h3><div class="toolbar">${btn('1 hour','history-range',false,'data-hours="1" aria-pressed="'+(range===1)+'"')}${btn('24 hours','history-range',false,'data-hours="24" aria-pressed="'+(range===24)+'"')}${btn('7 days','history-range',false,'data-hours="168" aria-pressed="'+(range===168)+'"')}</div></div>${!f.settings.history_enabled?'<p class="muted">History is disabled for this zone. Enable it in History settings below.</p>':!samples.length?'<p class="muted">No measurements yet. Readings appear every five minutes while Home Assistant is running.</p>':`<svg class="history-chart" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="${e(z.name)} room and thermostat target temperatures in ${e(z.unit)} for the last ${range} hours">${ticks}${labels}<path d="${path('target')}" class="chart-target"/><path d="${path('room')}" class="chart-room"/></svg><div class="chart-legend"><span><i class="room"></i>Room temperature</span><span><i class="target"></i>Thermostat target · ${e(z.unit)}</span></div><p class="muted">Five-minute samples in ${e(this._data.timezone)}. Gaps show downtime or missing readings. Target is the device’s reported target.</p>`}</section><section class="panel" style="margin-top:18px"><div class="section-head"><h3>Why the heating changed</h3></div><div class="decision-list">${decisions.length?decisions.map(d=>`<article class="decision-row"><time datetime="${e(d.at)}">${e(this._dateTime(d.at))}</time><div><b>${e(({preheat:'Smart preheating',schedule:'Schedule',boost:'Timed boost',occupied_comfort:'Occupancy override',manual:'Manual temperature',holiday:'Holiday',away:'Away target'})[d.source]||d.source)} · ${e(this._temp(d.target))}</b><p>${e(d.reason)}</p></div></article>`).join(''):'<p class="muted">Changes will appear here as the scheduler runs. Up to 500 decisions are kept for seven days.</p>'}</div></section>${this._historySettings()}`;
  },
  _historySettings(){
    const s=this._featureSettings(), disabled=!this._canEdit()||this._saving;
    return `<section class="panel" style="margin-top:18px">${this._disclosure('history-options','History settings',`<fieldset ${disabled?'disabled':''}><label class="check"><input type="checkbox" data-feature="history_enabled" ${s.history_enabled?'checked':''}>Keep seven days of temperature and decision history</label><p class="muted">Stored locally in Home Assistant. Clearing history keeps your learned warm-up rate.</p>${btn('Clear history','clear-history',disabled)}</fieldset>${this._featureSaveBar()}`,'Retention and clearing history')}</section>`;
  },
  async _featureAction(action,data){
    if(action==='history-range'){this._historyRange=Number(data.hours);this._render();return;}
    if(action==='profile-select'){this._profileName=data.name;this._render();return;}
    if(!this._canEdit()||this._saving)return;
    const z=this._zone();if(!z.insights){this._error='Update the integration first.';this._render();return;}
    try{
      if(action==='reload'){this._featureDraft=null;this._error='';this._render();return;}
      let command='insights';
      if(action==='reset-learning'||action==='clear-history'){
        if(this._featureDraft)throw Error('Save or reload zone features before resetting history or learning.');
        // Clearing is explicit and scoped to this zone; learned model survives Clear history.
        command=action==='reset-learning'?'reset_learning':'clear_history';
      } else {
        if(action==='save'&&!this._featureDraft)return;
        const s=this._featureEdit();
        if(action==='create-profile'){
          const name=this.shadowRoot.querySelector('[data-new-profile]').value.trim();
          if(!name||name.length>40||Object.hasOwn(s.profiles,name))throw Error('Choose a unique profile name of 1 to 40 characters.');
          if(Object.keys(s.profiles).length>=12)throw Error('Use at most 12 profiles.');
          // Null prototype prevents special names from changing object prototypes.
          Object.defineProperty(s.profiles,name,{value:clone(z.week[this._day]),enumerable:true,writable:true,configurable:true});this._profileName=name;if(this._newProfileNames)delete this._newProfileNames[z.id];
        }
        if(action==='add-period'){
          const periods=s.profiles[this._profileName],last=periods.at(-1);if(periods.length>=96||last.start==='23:59')throw Error('No space for another period.');
          const minutes=Number(last.start.slice(0,2))*60+Number(last.start.slice(3));const next=Math.min(1439,minutes+60);periods.push({start:`${String(Math.floor(next/60)).padStart(2,'0')}:${String(next%60).padStart(2,'0')}`,temperature:last.temperature,label:''});
        }
        if(action==='remove-period')s.profiles[this._profileName].splice(Number(data.index),1);
        if(action==='delete-profile'){
          if(s.workday_profile===this._profileName||s.non_workday_profile===this._profileName||s.calendar_rules.some(r=>r.profile===this._profileName))throw Error('Remove rules using this profile before deleting it.');
          delete s.profiles[this._profileName];
        }
        if(action==='add-rule'){if(s.calendar_rules.length>=12)throw Error('Use at most 12 rules.');s.calendar_rules.push({entity_id:'',match:'',profile:Object.keys(s.profiles)[0]});}
        if(action==='remove-rule')s.calendar_rules.splice(Number(data.index),1);
        if(action!=='save'){this._render();return;}
        for(const periods of Object.values(s.profiles))validateWeek(Object.fromEntries(DAYS.map(day=>[day,periods])),z.limits);
      }
      const payload={revision:this._featureDraft?.revision??z.insights.revision};
      if(command==='insights')payload.settings=clone(this._featureDraft.settings);
      this._saving=true;this._error='';this._render();
      if(this._config.demo){
        if(command==='insights'){z.insights.settings=payload.settings;z.insights.preheat.state=payload.settings.preheat_enabled?'learning':'disabled';}
        if(command==='clear_history'){z.insights.samples=[];z.insights.decisions=[];}
        if(command==='reset_learning')z.insights.preheat={state:'learning',rate:null,samples:0,minutes:0};
        z.insights.revision++;
      } else this._data=await this._hass.callWS({type:'smart_heating_scheduler/control',entry_id:this._config.entry_id,zone_id:z.id,action:command,payload});
      this._featureDraft=null;this._message=this._config.demo?'Saved to this demo only. Your heating is unchanged.':'Zone features updated.';
    }catch(error){this._error=error.message||'Could not save zone features. Your draft has been kept.';}
    finally{this._saving=false;this._render();}
  },
};
