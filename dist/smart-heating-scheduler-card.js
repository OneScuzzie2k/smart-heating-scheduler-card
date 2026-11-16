(() => {
  // src/model.js
  var DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  var DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  var clone = (value) => structuredClone(value);
  var escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  var timeText = (minute) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  function remainingText(until, now) {
    const end = Date.parse(until), start = Date.parse(now);
    if (!Number.isFinite(end) || !Number.isFinite(start)) return "Remaining time unavailable";
    if (end <= start) return "Waiting for boost controller";
    return `${Math.ceil((end - start) / 6e4)} min remaining`;
  }
  function minutes(text, allowEnd = false) {
    if (allowEnd && text === "24:00") return 1440;
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)) throw Error("Enter a 24-hour time, such as 06:30.");
    return Number(text.slice(0, 2)) * 60 + Number(text.slice(3));
  }
  function validateWeek(week, limits) {
    if (!limits || !Number.isFinite(limits.minimum) || !Number.isFinite(limits.maximum) || limits.minimum >= limits.maximum || limits.step != null && (!Number.isFinite(limits.step) || limits.step <= 0)) throw Error("Review this zone\u2019s temperature limits.");
    if (!week || typeof week !== "object" || Object.keys(week).sort().join() !== [...DAYS].sort().join()) throw Error("A schedule needs all seven days.");
    for (const day of DAYS) {
      const periods = week[day];
      if (!Array.isArray(periods) || periods.length < 1 || periods.length > 96) throw Error("Use 1\u201396 periods per day.");
      let previous = -1;
      for (const period of periods) {
        if (!period || Object.keys(period).some((k) => !["start", "temperature", "label"].includes(k))) throw Error("Invalid period fields.");
        const start = minutes(period.start);
        if (start <= previous || previous === -1 && start !== 0) throw Error("Start at 00:00 and keep period times in order.");
        previous = start;
        const target = period.temperature;
        if (typeof target !== "number" || !Number.isFinite(target) || target < limits.minimum || target > limits.maximum) throw Error(`Temperature must be between ${limits.minimum} and ${limits.maximum}.`);
        if (limits.step && Math.abs(target / limits.step - Math.round(target / limits.step)) > 1e-6) throw Error(`Use temperature increments of ${limits.step}.`);
        if (period.label !== void 0 && (typeof period.label !== "string" || period.label.length > 80)) throw Error("Labels can contain up to 80 characters.");
      }
    }
    return week;
  }
  function editPeriod(week, day, index, edit, limits) {
    if (String(edit.temperature).trim() === "") throw Error("Enter a target temperature.");
    const result = clone(week), periods = result[day];
    const start = minutes(edit.start), end = minutes(edit.end, true);
    const previous = index ? minutes(periods[index - 1].start) : -1;
    const followingEnd = index + 2 < periods.length ? minutes(periods[index + 2].start) : 1440;
    if (index === 0 && start !== 0 || start <= previous || end <= start || end > followingEnd || index + 2 < periods.length && end === followingEnd) throw Error("Keep this period within its neighbours and start the day at 00:00.");
    if (index === periods.length - 1 && end !== 1440) throw Error("The final period must end at 24:00.");
    if (index < periods.length - 1 && end === 1440) throw Error("Leave time for the following period.");
    periods[index] = { start: edit.start, temperature: Number(edit.temperature), label: edit.label };
    if (index < periods.length - 1) periods[index + 1].start = edit.end;
    return validateWeek(result, limits);
  }
  function addPeriod(week, day, index, limits) {
    const result = clone(week), periods = result[day];
    if (periods.length >= 96) throw Error("This day already has 96 periods.");
    const start = minutes(periods[index].start), end = index + 1 < periods.length ? minutes(periods[index + 1].start) : 1440;
    if (end - start < 2) throw Error("This period is too short to split.");
    const middle = Math.floor((start + end) / 2);
    periods.splice(index + 1, 0, { start: timeText(middle), temperature: periods[index].temperature, label: "New period" });
    return validateWeek(result, limits);
  }
  function deletePeriod(week, day, index, limits) {
    if (!index) throw Error("The 00:00 baseline is required. Edit it instead.");
    const result = clone(week);
    result[day].splice(index, 1);
    return validateWeek(result, limits);
  }
  function copyDay(week, from, targets, limits) {
    const result = clone(week);
    for (const day of targets) {
      if (!DAYS.includes(day)) throw Error("Choose a valid day.");
      result[day] = clone(week[from]);
    }
    return validateWeek(result, limits);
  }
  function localParts(iso, timezone = "UTC") {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
    const get = (type) => parts.find((p) => p.type === type)?.value;
    return { day: get("weekday").slice(0, 3).toLowerCase(), minute: Number(get("hour")) * 60 + Number(get("minute")), time: `${get("hour")}:${get("minute")}` };
  }
  function periodIndex(periods, minute) {
    return periods.findLastIndex((period) => minutes(period.start) <= minute);
  }
  function demoSnapshot() {
    const week = Object.fromEntries(DAYS.map((day) => [day, [
      { start: "00:00", temperature: 16, label: "Night" },
      { start: "06:30", temperature: 20, label: "Morning" },
      { start: "08:30", temperature: 16, label: "Daytime" },
      { start: "16:30", temperature: 20, label: "Evening" },
      { start: "22:00", temperature: 16, label: "Night" }
    ]]));
    return {
      schema_version: 1,
      entry_id: "demo",
      available: true,
      observe_only: true,
      can_edit: true,
      generated_at: "2026-11-16T08:25:00Z",
      timezone: "Europe/London",
      demo: true,
      zones: [["bedroom", "Bedroom Heating", 19.2, "heating"], ["lounge", "Lounge Heating", 18.6, "idle"]].map(([id, name, current, hvac]) => ({
        id,
        name,
        unit: "\xB0C",
        climate_entity: null,
        current_temperature: current,
        device_target: 20,
        hvac_action: hvac,
        mode: "heat",
        limits: { minimum: 16, maximum: 28, step: 0.5 },
        enabled: true,
        proposed_target: 20,
        source: "schedule",
        reason: "Following the morning schedule",
        next_evaluation: "2026-11-16T08:30:00Z",
        revision: 1,
        week: clone(week),
        manual_policy: "next_period",
        manual_minutes: 120,
        boost: { owner: "none", active: false, until: null, can_start: false, can_cancel: false }
      }))
    };
  }

  // src/insights-ui.js
  var featureDefaults = () => ({ profiles: {}, workday_entity: "", workday_profile: "", non_workday_profile: "", calendar_rules: [], preheat_enabled: false, preheat_max_minutes: 90, preheat_margin_minutes: 5, history_enabled: true });
  var btn = (label, action, disabled = false, attrs = "") => `<button type="button" data-action="feature-${action}" ${disabled ? "disabled" : ""} ${attrs}>${escapeHTML(label)}</button>`;
  function demoInsights(zone, now) {
    const settings = featureDefaults();
    settings.profiles = { "Workday": clone(zone.week.mon), "Day off": clone(zone.week.sun) };
    const end = Date.parse(now), samples = [];
    for (let i = 288; i >= 0; i--) {
      const at = new Date(end - i * 3e5), hour = at.getUTCHours() + at.getUTCMinutes() / 60;
      const target = hour >= 6.5 && hour < 8.5 || hour >= 16.5 && hour < 22 ? 20 : 16;
      samples.push({ at: at.toISOString(), room: 18.7 + Math.sin((hour - 8) * Math.PI / 12) * 1.1, target, action: target === 20 ? "heating" : "idle" });
    }
    return { revision: 1, settings, active_profile: "Weekly schedule", days: [], effective_week: clone(zone.week), warnings: [], preheat: { state: "learning", rate: null, samples: 7, minutes: 35 }, samples, decisions: [{ at: new Date(end - 6 * 36e5).toISOString(), source: "schedule", target: 20, reason: "Morning comfort period" }, { at: new Date(end - 4 * 36e5).toISOString(), source: "schedule", target: 16, reason: "Day setback" }, { at: new Date(end - 2 * 36e5).toISOString(), source: "occupied_comfort", target: 20, reason: "Occupied comfort minimum during the configured window" }] };
  }
  var insightsUI = {
    _featureSettings() {
      return this._featureDraft?.zone === this._zone().id ? this._featureDraft.settings : this._zone().insights?.settings;
    },
    _featureEdit() {
      const z = this._zone();
      if (!this._canEdit() || !z.insights || this._saving) return null;
      if (!this._featureDraft) this._featureDraft = { zone: z.id, revision: z.insights.revision, settings: clone(z.insights.settings) };
      return this._featureDraft.settings;
    },
    _featureInput(target) {
      if (!target.dataset.feature) return;
      const s = this._featureEdit();
      if (!s) return;
      const key = target.dataset.feature;
      const value = target.type === "checkbox" ? target.checked : target.type === "number" ? Number(target.value) : target.value;
      if (target.dataset.profileRow !== void 0) {
        s.profiles[this._profileName][Number(target.dataset.profileRow)][key] = value;
      } else if (target.dataset.ruleRow !== void 0) s.calendar_rules[Number(target.dataset.ruleRow)][key] = value;
      else s[key] = value;
      const caption = this.shadowRoot.querySelector("[data-feature-dirty]");
      if (caption) caption.textContent = "\u25CF Unsaved settings";
      const save = this.shadowRoot.querySelector('[data-action="feature-save"]');
      if (save) save.disabled = false;
      this.shadowRoot.querySelector("[data-feature-savebar]")?.removeAttribute("hidden");
    },
    _featureField(key, label, value, type = "text", attrs = "") {
      return `<label>${escapeHTML(label)}<input data-feature="${key}" aria-label="${escapeHTML(label)}" type="${type}" value="${escapeHTML(value)}" ${attrs}></label>`;
    },
    _profileOptions(value, empty = "Weekly schedule") {
      return `<option value="">${escapeHTML(empty)}</option>${Object.keys(this._featureSettings()?.profiles || {}).map((name) => `<option value="${escapeHTML(name)}" ${name === value ? "selected" : ""}>${escapeHTML(name)}</option>`).join("")}`;
    },
    _featureSummary(zone) {
      const f = zone.insights;
      if (!f) return "";
      const state = f.preheat?.state;
      const text = state === "preheating" ? `Preheating \xB7 ready by ${this._formatTime(f.preheat.ready_at)}` : state === "learning" && f.settings.preheat_enabled ? "Smart preheating \xB7 Learning" : null;
      return `<div class="feature-summary"><span class="profile-tag">\u25A6 ${escapeHTML(f.active_profile || "Weekly schedule")}</span>${text ? `<span class="preheat-tag">\u2600 ${escapeHTML(text)}</span>` : ""}</div>${f.warnings?.length ? `<div class="error" role="status">${f.warnings.map(escapeHTML).join("<br>")}</div>` : ""}`;
    },
    _profilesPanel() {
      const z = this._zone(), s = this._featureSettings();
      if (!s) return `<section class="panel"><p>Update the integration to use calendar profiles and preheating.</p></section>`;
      const disabled = !this._canEdit() || this._saving;
      const names = Object.keys(s.profiles);
      if (!names.includes(this._profileName)) this._profileName = names[0] || "";
      const periods = s.profiles[this._profileName] || [];
      const choices = Object.entries(this._hass?.states || {}).filter(([id]) => id.startsWith("calendar.") || id.startsWith("binary_sensor.")).map(([id, state]) => `<option value="${escapeHTML(id)}">${escapeHTML(state.attributes.friendly_name || id)}</option>`).join("");
      return `<section class="panel feature-panel"><div class="section-head"><div><div class="eyebrow">Optional day profiles</div><h2>Calendar & workdays</h2></div><span class="profile-tag">${escapeHTML(z.insights.active_profile || "Weekly schedule")}</span></div><p class="muted">Keep your normal week, and use a different day profile for bank holidays, days off or working at home. Calendar rules apply to the whole local day. First matching rule wins, then Workday, then your weekly schedule.</p>
    <fieldset ${disabled ? "disabled" : ""}><datalist id="feature-entities">${choices}</datalist><div class="feature-columns"><div><h3>Day profiles</h3><label>Edit profile<select data-action="feature-profile-select" aria-label="Edit profile">${names.length ? names.map((name) => `<option ${name === this._profileName ? "selected" : ""}>${escapeHTML(name)}</option>`).join("") : "<option>No profiles yet</option>"}</select></label>
    ${periods.length ? this._timeline(periods, this._day, false) : ""}<div class="profile-periods">${periods.map((p, i) => `<div class="profile-period"><label>Start<input aria-label="Profile period ${i + 1} start" data-feature="start" data-profile-row="${i}" type="time" value="${escapeHTML(p.start)}" ${i === 0 ? "readonly" : ""}></label><label>Target (${escapeHTML(z.unit)})<input aria-label="Profile period ${i + 1} target" data-feature="temperature" data-profile-row="${i}" type="number" min="${z.limits.minimum}" max="${z.limits.maximum}" step="${z.limits.step || "any"}" value="${p.temperature}"></label><label>Name<input aria-label="Profile period ${i + 1} name" data-feature="label" data-profile-row="${i}" maxlength="80" value="${escapeHTML(p.label || "")}"></label>${i ? btn("Remove", "remove-period", disabled, `data-index="${i}" aria-label="Remove profile period ${i + 1}"`) : ""}</div>`).join("")}</div><div class="toolbar">${names.length ? btn("Add period", "add-period", disabled) : ""}${names.length ? btn("Delete profile", "delete-profile", disabled) : ""}</div><label>New profile name<input data-new-profile value="${escapeHTML(this._newProfileNames?.[z.id] || "")}" maxlength="40" placeholder="e.g. Day off" aria-label="New profile name"></label>${btn("Create from selected day", "create-profile", disabled)}<p class="muted">Copies ${escapeHTML(this._day.toUpperCase())} from this zone\u2019s saved week. Edit the copy here; your weekly schedule stays separate.</p></div>
    <div><h3>Workday rules</h3>${this._featureField("workday_entity", "Workday sensor (optional)", s.workday_entity, "text", 'list="feature-entities" placeholder="binary_sensor.workday"')}<label>On a workday<select data-feature="workday_profile">${this._profileOptions(s.workday_profile)}</select></label><label>On a non-workday<select data-feature="non_workday_profile">${this._profileOptions(s.non_workday_profile)}</select></label><p class="muted">Uses your Home Assistant Workday integration, including its configured public holidays. Leave the sensor empty to use only calendar rules.</p><h3>Calendar rules</h3>${s.calendar_rules.map((r, i) => `<div class="calendar-rule"><label>Calendar<input data-feature="entity_id" data-rule-row="${i}" value="${escapeHTML(r.entity_id)}" list="feature-entities" placeholder="calendar.example"></label><label>Event title contains<input data-feature="match" data-rule-row="${i}" value="${escapeHTML(r.match)}" placeholder="Blank matches any event" maxlength="80"></label><label>Use profile<select data-feature="profile" data-rule-row="${i}">${this._profileOptions(r.profile, "Choose a profile")}</select></label>${btn("Remove rule", "remove-rule", disabled, `data-index="${i}"`)}</div>`).join("")}${btn("Add calendar rule", "add-rule", disabled || !names.length)}<p class="muted">Rules run from top to bottom. Missing inputs show a warning and fall back to the remaining rules. Event titles are used for matching and excluded from history.</p></div></div></fieldset>${this._featureSaveBar()}</section>`;
    },
    _featureSaveBar() {
      const dirty = Boolean(this._featureDraft);
      return `<div class="draft-bar" data-feature-savebar ${dirty ? "" : "hidden"}><span data-feature-dirty class="${dirty ? "dirty" : "muted"}">${dirty ? "\u25CF Unsaved settings" : "Settings saved"}</span><div class="toolbar">${btn("Reload saved", "reload", !this._canEdit() || this._saving)}${btn(this._saving ? "Saving\u2026" : "Save settings", "save", !dirty || !this._canEdit() || this._saving, 'class="primary"')}</div></div>`;
    },
    _preheatSettings() {
      const z = this._zone(), s = this._featureSettings();
      if (!s) return "";
      const p = z.insights.preheat || {}, disabled = !this._canEdit() || this._saving;
      const status = !s.preheat_enabled ? "Disabled" : { learning: "Learning your zone", paused: "Paused by another rule", ready: "Ready for the next warm-up", preheating: "Preheating", no_temperature: "Waiting for room temperature" }[p.state] || "Learning your zone";
      const advanced = `<div class="form-grid">${this._featureField("preheat_margin_minutes", "Extra warm-up margin (minutes)", s.preheat_margin_minutes, "number", 'min="0" max="30" step="1"')}</div><div class="fact-row"><span>Accepted observations</span><b>${escapeHTML(p.samples || 0)} \xB7 ${Math.round(p.minutes || 0)} min</b></div><div class="fact-row"><span>Measured warm-up rate</span><b>${p.rate ? `${Number(p.rate).toFixed(2)} ${escapeHTML(z.unit)}/hour` : "Learning"}</b></div><p class="muted">Learning needs at least 12 measured increases covering an hour of heating. Old learning expires after 14 days without useful readings.</p>${btn("Reset learning", "reset-learning", disabled)}`;
      return `<section class="panel smart-feature"><div class="scope">${escapeHTML(z.name)} \xB7 zone setting</div><h2>Smart preheating</h2><p class="muted">Learn how this zone warms up, and start early enough to aim for its scheduled temperature.</p><fieldset ${disabled ? "disabled" : ""}><label class="occupancy-toggle"><input type="checkbox" aria-label="Enable smart preheating for this zone" data-feature="preheat_enabled" ${s.preheat_enabled ? "checked" : ""}>Enable smart preheating</label><div class="feature-status"><span class="dot" aria-hidden="true"></span>${escapeHTML(status)}${s.preheat_enabled && p.state === "preheating" ? ` \xB7 ready by ${escapeHTML(this._formatTime(p.ready_at))}` : ""}</div><div class="preheat-options" ${s.preheat_enabled ? "" : "hidden"}>${this._featureField("preheat_max_minutes", "Maximum early start (minutes)", s.preheat_max_minutes, "number", 'min="5" max="180" step="1"')}<p class="muted">Off, manual temperatures, boosts, holidays and Away still take priority.</p>${this._disclosure("preheat-options", "Advanced options", advanced, "Warm-up margin, measurements and reset")}</div></fieldset>${this._featureSaveBar()}</section>`;
    },
    _heatingHistory() {
      const z = this._zone(), f = z.insights;
      const range = this._historyRange || 24;
      if (!f) return `<section class="panel"><h2>History</h2><p>Update the integration to use heating history.</p></section>`;
      const samples = (f.samples || []).filter((p) => Date.parse(p.at) >= Date.parse(this._now()) - range * 36e5);
      const valid = samples.flatMap((p) => [p.room, p.target]).filter(Number.isFinite), low = valid.length ? Math.min(...valid) - 0.5 : 15, high = valid.length ? Math.max(...valid) + 0.5 : 22;
      const end = Date.parse(this._now()), start = end - range * 36e5;
      const chartWidth = Math.max(280, (this.clientWidth || 850) - 80), plotWidth = chartWidth - 70;
      const chartHeight = chartWidth > 650 ? 190 : 175, plotBottom = chartHeight - 35;
      const x = (at) => 48 + (Date.parse(at) - start) / (end - start) * plotWidth, y = (v) => plotBottom - (v - low) / (high - low) * (plotBottom - 20);
      const path = (key) => {
        let result = "", prev = null;
        for (const p of samples) {
          const val = p[key];
          if (!Number.isFinite(val)) {
            prev = null;
            continue;
          }
          const gap = prev && Date.parse(p.at) - Date.parse(prev.at) > 15 * 6e4;
          result += `${prev && !gap ? "L" : "M"}${x(p.at).toFixed(1)},${y(val).toFixed(1)} `;
          prev = p;
        }
        return result;
      };
      const ticks = Array.from({ length: 5 }, (_, i) => {
        const value = low + (high - low) * i / 4;
        return `<line x1="48" x2="${chartWidth - 22}" y1="${y(value)}" y2="${y(value)}" class="chart-grid"/><text x="40" y="${y(value) + 4}" text-anchor="end">${value.toFixed(1)}</text>`;
      }).join("");
      const labels = Array.from({ length: 5 }, (_, i) => {
        const at = new Date(start + (end - start) * i / 4).toISOString(), part = localParts(at, this._data.timezone);
        return `<text x="${48 + i * plotWidth / 4}" y="${chartHeight - 10}" text-anchor="${i === 0 ? "start" : i === 4 ? "end" : "middle"}">${escapeHTML(range > 24 ? new Intl.DateTimeFormat("en-GB", { timeZone: this._data.timezone, month: "short", day: "2-digit" }).format(new Date(at)) : part.time)}</text>`;
      }).join("");
      const decisions = [...f.decisions || []].filter((p) => Date.parse(p.at) >= start).reverse();
      return `<div class="zone-picker"><div><div class="eyebrow">Measured, not predicted</div><h2>Heating history</h2></div>${this._selector()}</div><section class="panel"><div class="section-head"><h3>${escapeHTML(z.name)}</h3><div class="toolbar">${btn("1 hour", "history-range", false, 'data-hours="1" aria-pressed="' + (range === 1) + '"')}${btn("24 hours", "history-range", false, 'data-hours="24" aria-pressed="' + (range === 24) + '"')}${btn("7 days", "history-range", false, 'data-hours="168" aria-pressed="' + (range === 168) + '"')}</div></div>${!f.settings.history_enabled ? '<p class="muted">History is disabled for this zone. Enable it in History settings below.</p>' : !samples.length ? '<p class="muted">No measurements yet. Readings appear every five minutes while Home Assistant is running.</p>' : `<svg class="history-chart" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="${escapeHTML(z.name)} room and thermostat target temperatures in ${escapeHTML(z.unit)} for the last ${range} hours">${ticks}${labels}<path d="${path("target")}" class="chart-target"/><path d="${path("room")}" class="chart-room"/></svg><div class="chart-legend"><span><i class="room"></i>Room temperature</span><span><i class="target"></i>Thermostat target \xB7 ${escapeHTML(z.unit)}</span></div><p class="muted">Five-minute samples in ${escapeHTML(this._data.timezone)}. Gaps show downtime or missing readings. Target is the device\u2019s reported target.</p>`}</section><section class="panel" style="margin-top:18px"><div class="section-head"><h3>Why the heating changed</h3></div><div class="decision-list">${decisions.length ? decisions.map((d) => `<article class="decision-row"><time datetime="${escapeHTML(d.at)}">${escapeHTML(this._dateTime(d.at))}</time><div><b>${escapeHTML({ preheat: "Smart preheating", schedule: "Schedule", boost: "Timed boost", occupied_comfort: "Occupancy override", manual: "Manual temperature", holiday: "Holiday", away: "Away target" }[d.source] || d.source)} \xB7 ${escapeHTML(this._temp(d.target))}</b><p>${escapeHTML(d.reason)}</p></div></article>`).join("") : '<p class="muted">Changes will appear here as the scheduler runs. Up to 500 decisions are kept for seven days.</p>'}</div></section>${this._historySettings()}`;
    },
    _historySettings() {
      const s = this._featureSettings(), disabled = !this._canEdit() || this._saving;
      return `<section class="panel" style="margin-top:18px">${this._disclosure("history-options", "History settings", `<fieldset ${disabled ? "disabled" : ""}><label class="check"><input type="checkbox" data-feature="history_enabled" ${s.history_enabled ? "checked" : ""}>Keep seven days of temperature and decision history</label><p class="muted">Stored locally in Home Assistant. Clearing history keeps your learned warm-up rate.</p>${btn("Clear history", "clear-history", disabled)}</fieldset>${this._featureSaveBar()}`, "Retention and clearing history")}</section>`;
    },
    async _featureAction(action, data) {
      if (action === "history-range") {
        this._historyRange = Number(data.hours);
        this._render();
        return;
      }
      if (action === "profile-select") {
        this._profileName = data.name;
        this._render();
        return;
      }
      if (!this._canEdit() || this._saving) return;
      const z = this._zone();
      if (!z.insights) {
        this._error = "Update the integration first.";
        this._render();
        return;
      }
      try {
        if (action === "reload") {
          this._featureDraft = null;
          this._error = "";
          this._render();
          return;
        }
        let command = "insights";
        if (action === "reset-learning" || action === "clear-history") {
          if (this._featureDraft) throw Error("Save or reload zone features before resetting history or learning.");
          command = action === "reset-learning" ? "reset_learning" : "clear_history";
        } else {
          if (action === "save" && !this._featureDraft) return;
          const s = this._featureEdit();
          if (action === "create-profile") {
            const name = this.shadowRoot.querySelector("[data-new-profile]").value.trim();
            if (!name || name.length > 40 || Object.hasOwn(s.profiles, name)) throw Error("Choose a unique profile name of 1 to 40 characters.");
            if (Object.keys(s.profiles).length >= 12) throw Error("Use at most 12 profiles.");
            Object.defineProperty(s.profiles, name, { value: clone(z.week[this._day]), enumerable: true, writable: true, configurable: true });
            this._profileName = name;
            if (this._newProfileNames) delete this._newProfileNames[z.id];
          }
          if (action === "add-period") {
            const periods = s.profiles[this._profileName], last = periods.at(-1);
            if (periods.length >= 96 || last.start === "23:59") throw Error("No space for another period.");
            const minutes2 = Number(last.start.slice(0, 2)) * 60 + Number(last.start.slice(3));
            const next = Math.min(1439, minutes2 + 60);
            periods.push({ start: `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`, temperature: last.temperature, label: "" });
          }
          if (action === "remove-period") s.profiles[this._profileName].splice(Number(data.index), 1);
          if (action === "delete-profile") {
            if (s.workday_profile === this._profileName || s.non_workday_profile === this._profileName || s.calendar_rules.some((r) => r.profile === this._profileName)) throw Error("Remove rules using this profile before deleting it.");
            delete s.profiles[this._profileName];
          }
          if (action === "add-rule") {
            if (s.calendar_rules.length >= 12) throw Error("Use at most 12 rules.");
            s.calendar_rules.push({ entity_id: "", match: "", profile: Object.keys(s.profiles)[0] });
          }
          if (action === "remove-rule") s.calendar_rules.splice(Number(data.index), 1);
          if (action !== "save") {
            this._render();
            return;
          }
          for (const periods of Object.values(s.profiles)) validateWeek(Object.fromEntries(DAYS.map((day) => [day, periods])), z.limits);
        }
        const payload = { revision: this._featureDraft?.revision ?? z.insights.revision };
        if (command === "insights") payload.settings = clone(this._featureDraft.settings);
        this._saving = true;
        this._error = "";
        this._render();
        if (this._config.demo) {
          if (command === "insights") {
            z.insights.settings = payload.settings;
            z.insights.preheat.state = payload.settings.preheat_enabled ? "learning" : "disabled";
          }
          if (command === "clear_history") {
            z.insights.samples = [];
            z.insights.decisions = [];
          }
          if (command === "reset_learning") z.insights.preheat = { state: "learning", rate: null, samples: 0, minutes: 0 };
          z.insights.revision++;
        } else this._data = await this._hass.callWS({ type: "smart_heating_scheduler/control", entry_id: this._config.entry_id, zone_id: z.id, action: command, payload });
        this._featureDraft = null;
        this._message = this._config.demo ? "Saved to this demo only. Your heating is unchanged." : "Zone features updated.";
      } catch (error) {
        this._error = error.message || "Could not save zone features. Your draft has been kept.";
      } finally {
        this._saving = false;
        this._render();
      }
    }
  };

  // src/styles.js
  var styles = `
:host{display:block;container-type:inline-size;color-scheme:light dark;--shs-bg:var(--ha-card-background,var(--card-background-color,light-dark(#edf2f6,#0e171f)));--shs-panel:light-dark(#ffffff,#17232d);--shs-panel2:light-dark(#edf3f6,#1c2b36);--shs-ink:var(--primary-text-color,light-dark(#172c3a,#eff5fa));--shs-muted:var(--secondary-text-color,light-dark(#526675,#aabcc9));--shs-line:var(--divider-color,light-dark(#c7d4de,#344854));--shs-orange:light-dark(#a64b00,#ffab35);--shs-teal:light-dark(#007480,#68dce3);--shs-orange-fill:#ff9d20;--shs-button-ink:#281800;--shs-track:light-dark(#d5dfe6,#334650);--shs-good:light-dark(#247340,#8bd2a2);--shs-error:light-dark(#ac2735,#ffadb4);font-family:var(--paper-font-body1_-_font-family,Roboto,'Segoe UI',sans-serif);font-size:14px;line-height:1.5;min-width:0}
:host([theme=dark]){color-scheme:dark;--shs-bg:#0e171f;--shs-panel:#17232d;--shs-panel2:#1c2b36;--shs-ink:#eff5fa;--shs-muted:#aabcc9;--shs-line:#344854;--shs-orange:#ffab35;--shs-teal:#68dce3;--shs-track:#334650;--shs-good:#8bd2a2;--shs-error:#ffadb4}
:host([theme=light]){color-scheme:light;--shs-bg:#edf2f6;--shs-panel:#fff;--shs-panel2:#edf3f6;--shs-ink:#172c3a;--shs-muted:#526675;--shs-line:#c7d4de;--shs-orange:#a64b00;--shs-teal:#007480;--shs-track:#d5dfe6;--shs-good:#247340;--shs-error:#ac2735}
*{box-sizing:border-box}button,input,select{font:inherit}button,a,input,select{touch-action:manipulation}button,a{ -webkit-tap-highlight-color:transparent}button{cursor:pointer}button:disabled{cursor:not-allowed;opacity:.55}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid var(--shs-teal);outline-offset:3px}button,input,select{min-height:44px;color:var(--shs-ink)}button{border:1px solid var(--shs-line);background:var(--shs-panel2);border-radius:12px;padding:9px 15px;font-weight:600}button:hover:not(:disabled){filter:brightness(1.08)}input,select{width:100%;min-width:0;background:var(--shs-panel2);border:1px solid var(--shs-line);border-radius:10px;padding:10px 12px}input[type=checkbox]{width:20px;min-height:20px;accent-color:var(--shs-orange-fill)}label{display:grid;gap:6px;color:var(--shs-muted)}label.check{display:flex;align-items:center;gap:10px;min-height:44px;color:var(--shs-ink)}a{color:var(--shs-teal)}h1,h2,h3,p{margin:0}h1{font-size:25px;line-height:1.2;letter-spacing:-.5px}h2{font-size:19px;line-height:1.3;letter-spacing:-.25px}h3{font-size:16px}small,.muted{color:var(--shs-muted)}small{font-size:12px}.wrap{padding:22px;border-radius:24px;background:var(--shs-bg);color:var(--shs-ink);overflow-wrap:anywhere;min-width:0}.header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.brand{display:flex;align-items:center;gap:12px}.brand-icon{font-size:34px;color:var(--shs-orange);width:38px}.eyebrow{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--shs-muted);font-weight:600}.header p{color:var(--shs-muted);margin-top:4px}.badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;border-radius:8px;padding:5px 8px;color:var(--shs-teal);background:color-mix(in srgb,var(--shs-teal) 9%,transparent);white-space:normal}.dot{width:7px;height:7px;background:currentColor;border-radius:50%;display:inline-block;flex:none}.nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;background:var(--shs-panel);border:1px solid var(--shs-line);border-radius:15px;padding:5px;margin-bottom:18px}.nav button{background:transparent;border-color:transparent;border-radius:10px;padding:10px 5px}.nav button[aria-current=page],.selected,.primary{background:var(--shs-orange-fill)!important;color:var(--shs-button-ink)!important;border-color:transparent!important}.nav-icon{margin-right:7px;font-size:17px}.notice{display:flex;align-items:center;gap:8px;padding:10px 0;color:var(--shs-muted);font-size:12px}.notice strong{color:var(--shs-teal)}.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--shs-line);border-radius:16px;background:var(--shs-panel);margin:0 0 18px}.summary>div{padding:13px 17px;min-width:0}.summary>div+div{border-left:1px solid var(--shs-line)}.summary span{color:var(--shs-muted);font-size:12px;display:block}.summary b{font-size:14px;font-weight:600}.zones{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:18px}.panel{background:var(--shs-panel);border:1px solid var(--shs-line);border-radius:19px;padding:18px;min-width:0}.zone-card{background:radial-gradient(ellipse at 0 0,color-mix(in srgb,var(--shs-orange-fill) 12%,transparent),transparent 70%),var(--shs-panel)}.zone-card.idle{background:radial-gradient(ellipse at 0 0,color-mix(in srgb,var(--shs-teal) 8%,transparent),transparent 70%),var(--shs-panel)}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.zone-icon{color:var(--shs-orange);margin-right:9px}.link-button{background:transparent;border:none;min-width:44px;padding:6px;color:var(--shs-teal)}.thermostat{display:grid;grid-template-columns:minmax(130px,1.2fr) minmax(100px,1fr);gap:14px;align-items:center;margin-bottom:16px}.ring{position:relative;width:100%;max-width:185px;aspect-ratio:1;display:grid;place-content:center;text-align:center;margin:auto}.ring:before{content:'';position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 225deg,var(--shs-orange-fill) 0deg calc(var(--fill)*1deg),var(--shs-track) calc(var(--fill)*1deg) 270deg,transparent 270deg);mask:radial-gradient(farthest-side,transparent calc(100% - 11px),#000 calc(100% - 10px))}.idle .ring:before{background:conic-gradient(from 225deg,var(--shs-teal) 0deg calc(var(--fill)*1deg),var(--shs-track) calc(var(--fill)*1deg) 270deg,transparent 270deg)}.reading{font-size:38px;letter-spacing:-1.5px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.3}.reading sup{font-size:17px;letter-spacing:0}.demand{color:var(--shs-orange);font-size:12px;margin-top:7px}.idle .demand{color:var(--shs-teal)}.stat-stack{display:grid;gap:12px}.stat-stack>div+div{padding-top:12px;border-top:1px solid var(--shs-line)}.stat-stack small{display:block}.stat-value{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums}.next{color:var(--shs-teal);font-weight:600}.boost-controls{border-top:1px solid var(--shs-line);padding-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px}.boost-controls button{padding:9px 12px}.source{font-size:12px;display:flex;gap:6px;align-items:center;color:var(--shs-muted);margin-bottom:14px}.source .dot{color:var(--shs-good)}.bottom-grid{display:grid;grid-template-columns:1fr 1.2fr;gap:16px;margin-top:16px}.reason{border-left:3px solid var(--shs-orange-fill);padding:4px 0 4px 14px;margin:12px 0}.reason b{display:block}.reason p{color:var(--shs-muted);margin-top:4px}.fact-row{display:flex;gap:14px;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--shs-line)}.fact-row:last-child{border-bottom:0}.fact-row span{color:var(--shs-muted)}.fact-row b{text-align:right;font-weight:500}.timeline{display:flex;height:48px;border-radius:9px;overflow:hidden;gap:2px;min-width:0}.segment{border:0;border-radius:0;min-width:0;padding:4px 2px;background:color-mix(in srgb,var(--shs-teal) 24%,var(--shs-panel));font-size:12px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--shs-ink)}.segment.comfort{background:var(--shs-orange-fill);color:var(--shs-button-ink)}.segment[aria-pressed=true]{box-shadow:inset 0 0 0 3px var(--shs-ink)}.timeline-wrap{position:relative;padding-top:28px}.time-marker{position:absolute;top:0;bottom:0;border-left:2px solid var(--shs-ink);pointer-events:none}.time-marker span{display:block;position:absolute;font-size:11px;background:var(--shs-panel);padding:1px 4px;border-radius:5px;white-space:nowrap}.ticks{display:flex;justify-content:space-between;color:var(--shs-muted);font-size:11px;margin-top:6px;font-variant-numeric:tabular-nums}.legend{display:flex;gap:18px;flex-wrap:wrap;color:var(--shs-muted);font-size:12px;margin-top:12px}.legend i{width:8px;height:8px;display:inline-block;border-radius:3px;background:var(--shs-orange-fill);margin-right:5px}.legend i.cool{background:var(--shs-teal)}.zone-select{max-width:230px}.zone-picker{display:flex;justify-content:space-between;align-items:end;gap:14px;margin-bottom:17px}.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.toolbar button{font-size:12px;padding:8px 12px}.planner-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.7fr);gap:16px}.week-row{display:grid;grid-template-columns:44px minmax(0,1fr);gap:9px;align-items:center;margin-bottom:9px}.week-row>button{padding:6px 0;background:transparent;border-color:transparent;border-radius:10px;min-width:0}.week-row .timeline{height:39px}.week-row .segment{font-size:11px;min-height:39px}.week-row.active>button{color:var(--shs-orange);background:color-mix(in srgb,var(--shs-orange-fill) 9%,transparent)}.week-row.active .timeline{outline:1px solid var(--shs-orange);outline-offset:3px}.days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;margin-bottom:16px}.days button{padding:8px 2px;border-color:transparent;font-size:12px}.period-list{display:grid;gap:8px}.period-row{display:grid;grid-template-columns:minmax(0,1fr) auto 44px;align-items:center;gap:8px;background:var(--shs-panel2);border-radius:12px;padding:9px 5px 9px 12px}.period-row p{color:var(--shs-muted);font-size:12px;font-variant-numeric:tabular-nums}.period-row b{font-weight:500}.temp-pill{color:var(--shs-teal);font-weight:600;font-variant-numeric:tabular-nums}.temp-pill.warm{color:var(--shs-orange)}.draft-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:16px;margin-top:16px;border-top:1px solid var(--shs-line)}.draft-bar .toolbar{justify-content:flex-end}.dirty{color:var(--shs-orange);font-size:12px}.error{color:var(--shs-error);background:color-mix(in srgb,var(--shs-error) 8%,transparent);padding:12px;border-radius:10px;margin:12px 0}.success{color:var(--shs-good);margin:10px 0;font-size:13px}.empty{text-align:center;padding:36px 12px}.empty p{color:var(--shs-muted);margin:8px auto 18px;max-width:440px}.automation-grid,.settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.empty-icon{font-size:28px;color:var(--shs-teal);margin-bottom:12px}.scope{color:var(--shs-teal);font-size:11px;text-transform:uppercase;letter-spacing:1px}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.full{grid-column:1/-1}.mobile-only{display:none}.modal-shade{position:fixed;inset:0;background:#0009;z-index:99;display:grid;place-items:center;padding:16px}.modal{color:var(--shs-ink);background:var(--shs-panel);border:1px solid var(--shs-line);border-radius:20px;padding:22px;max-width:min(480px,calc(100cqw - 32px));width:100%;max-height:90dvh;overflow:auto;box-shadow:0 24px 70px #0005}.modal .section-head{margin-bottom:18px}.modal .toolbar{justify-content:flex-end;margin-top:20px}.modal p{color:var(--shs-muted);margin-bottom:12px}.modal select{min-width:0}.copy-days{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.subtle{background:transparent}.status-caption{font-size:12px;color:var(--shs-muted);margin-top:6px}.editor{padding:16px;background:var(--shs-bg);color:var(--shs-ink);border-radius:16px;display:grid;gap:12px}.editor label{color:var(--shs-ink)}.preview-banner{border-bottom:1px solid var(--shs-line);padding-bottom:9px;margin-bottom:13px;font-size:12px;color:var(--shs-muted)}.preview-banner strong{color:var(--shs-teal)}.shs-link{display:inline-flex;align-items:center;min-height:44px}
@container(max-width:760px){.planner-layout{grid-template-columns:1fr}.week-row .segment{font-size:12px}.header p{max-width:240px}.automation-grid,.settings-grid{grid-template-columns:1fr}}
@container(max-width:650px){.zones,.bottom-grid{grid-template-columns:1fr}.wrap{padding:16px;border-radius:18px}.header{align-items:flex-start}.header h1{font-size:22px}.header p{font-size:12px}.badge{max-width:110px;text-align:left}.summary>div{padding:11px 10px}.summary span{font-size:11px}.summary b{font-size:12px}.panel{padding:16px}.nav-icon{display:block;margin:0 0 2px}.nav button{font-size:12px;padding:6px 1px}.desktop-only{display:none}.mobile-only{display:block}.section-head{flex-wrap:wrap}.zone-picker{align-items:stretch;flex-direction:column;gap:10px}.zone-select{max-width:none}.planner-layout{grid-template-columns:1fr}.draft-bar{align-items:stretch;flex-direction:column}.draft-bar .toolbar{justify-content:stretch}.draft-bar .toolbar button{flex:1}.ring{max-width:190px}.thermostat{grid-template-columns:minmax(125px,1.2fr) minmax(100px,1fr)}.period-row{grid-template-columns:minmax(0,1fr) auto 44px}.modal-shade{align-items:center}.form-grid{gap:12px}input,select{font-size:16px}}
@container(max-width:380px){.days{grid-template-columns:repeat(4,minmax(0,1fr))}.wrap{padding:12px}.header h1{font-size:20px}.brand{gap:7px}.brand-icon{font-size:27px;width:28px}.header .badge{max-width:85px;font-size:11px}.header p{max-width:185px}.summary>div{padding:9px 7px}.panel{padding:14px}.reading{font-size:34px}.stat-value{font-size:20px}.boost-controls{align-items:flex-start}.form-grid{grid-template-columns:1fr}.full{grid-column:auto}.modal{padding:17px}.toolbar button{padding:8px 9px}}
fieldset{border:0;padding:0;margin:0;min-width:0}fieldset:disabled{opacity:.65}.presence-row{padding:14px 0;border-bottom:1px solid var(--shs-border);display:grid;gap:10px}.panel>fieldset{margin-top:16px}.panel>p{margin:12px 0}.presence-rows{margin-bottom:12px}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}

.occupancy-settings{grid-column:1/-1}.occupancy-toggle{display:flex;align-items:center;gap:12px;margin-bottom:18px;font-weight:600;color:var(--shs-ink)}.occupancy-toggle input{width:22px;height:22px;accent-color:var(--shs-teal)}.occupancy-days{display:flex;flex-wrap:wrap;gap:6px;margin:18px 0}.occupancy-days legend{margin-bottom:9px;font-size:12px;color:var(--shs-muted)}.occupancy-days label{display:flex;align-items:center;gap:6px;border:1px solid var(--shs-line);border-radius:10px;padding:9px;min-height:44px}.occupancy-days input{width:18px;height:18px;accent-color:var(--shs-teal)}.occupancy-advanced{margin:18px 0}.occupancy-advanced summary{cursor:pointer;min-height:44px;padding:12px 0;color:var(--shs-teal)}.occupancy-summary{background:color-mix(in srgb,var(--shs-teal) 7%,var(--shs-panel));border:1px solid color-mix(in srgb,var(--shs-teal) 35%,var(--shs-line));border-radius:14px;padding:14px;margin:14px 0}.occupancy-summary-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.occupancy-summary.active{border-color:var(--shs-teal)}.occupancy-summary p{margin:8px 0;font-size:12px;color:var(--shs-muted)}.occupancy-summary .badge{flex:none}.occupancy-track{height:9px;background:var(--shs-panel2);border-radius:6px;margin-top:7px;overflow:hidden}.occupancy-track span{display:block;height:100%;border-radius:6px;border:1px dashed var(--shs-teal);background:color-mix(in srgb,var(--shs-teal) 35%,transparent)}
@container(max-width:650px){.occupancy-summary-head{align-items:flex-start;flex-direction:column}.occupancy-days label{flex:1 0 20%;justify-content:center}}

/* Compact thermostat matches the native HA card; the dial is the only target control. */
.mini{position:relative;color:var(--shs-ink);min-width:0;--mini-accent:#ff8a45;--mini-ring:#ffba94;--mini-track:light-dark(#ebebeb,#35424b)}
.mini-thermostat,.mini-boost{background:var(--ha-card-background,var(--shs-panel));border:1px solid var(--divider-color,var(--shs-line));border-radius:var(--ha-card-border-radius,12px)}
.mini-thermostat{padding:4px 8px 8px;text-align:center;position:relative}
.mini-head{height:44px;display:flex;align-items:center;position:relative;justify-content:center;padding:0 24px}
.mini h2{font-size:16px;line-height:1.25;font-weight:400;letter-spacing:0;text-align:center}
.mini h2 a{color:inherit;text-decoration:none}
.mini-more{position:absolute;right:-8px;top:0;border:0;background:transparent;padding:0;width:36px;min-height:44px;color:var(--shs-muted);font-size:25px;font-weight:400}
.mini .ring{max-width:240px;width:100%;margin:4px auto -14px;aspect-ratio:1;gap:5px}
.mini .ring:before{display:none}
.mini-arc{position:absolute;width:100%;height:100%;inset:0;pointer-events:none;overflow:visible}
.mini-arc circle{fill:none;stroke-width:14;stroke-linecap:round;transform:rotate(135deg);transform-origin:100px 100px}
.mini-arc .arc-track{stroke:var(--mini-track)}.mini-arc .arc-value{stroke:var(--mini-ring)}
.mini .reading{font-size:40px;line-height:1.15;font-weight:400;letter-spacing:-1px}
.mini-caption{font-size:15px;font-weight:500;line-height:1.3}
.mini-room{display:flex;align-items:center;justify-content:center;gap:3px;font-size:15px;line-height:1.4}
.mini-room svg{width:14px;height:16px;flex:none}
.mini-dial{overflow:clip;touch-action:none;user-select:none;cursor:grab;border-radius:50%}
.mini-dial:active{cursor:grabbing}.mini-dial[aria-disabled=true]{cursor:default}
.mini-dial:focus-visible{outline:2px solid var(--mini-accent);outline-offset:0}
.mini-dial .dial-thumb{position:absolute;inset:0;transform:rotate(calc(225deg + var(--fill)*1deg));pointer-events:none}
.mini-dial .dial-thumb:after{content:'';position:absolute;left:calc(50% - 7px);top:calc(7.5% - 7px);width:14px;height:14px;border:2px solid var(--mini-accent);border-radius:50%;background:var(--shs-panel)}
.mini:not(.idle){--mini-ring:#ff9c5c}
.mini-state,.mini-resume{position:absolute;bottom:5px;left:50%;transform:translateX(-50%);margin:0;font-size:11px;line-height:1.2;white-space:nowrap}
.mini-state{display:flex;align-items:center;gap:4px;padding:3px 7px;border-radius:12px;color:var(--shs-teal);background:color-mix(in srgb,var(--shs-teal) 8%,var(--shs-panel));pointer-events:none}
.mini-state svg{width:11px;height:11px;flex:none}
.mini-resume{color:var(--shs-muted);border:0;background:transparent;padding:5px 6px;min-height:32px;text-decoration:underline}
.mini-boost{margin-top:8px;padding:8px 10px 2px}
.mini-slider{display:block;margin:0;color:var(--shs-ink);font-size:14px;line-height:1.3}
.mini-boost-label{display:flex;align-items:center;gap:9px}
.mini-timer{width:34px;height:34px;display:grid;place-items:center;flex:none;border-radius:50%;background:light-dark(#d4e9fa,#29445c);color:var(--shs-muted);font-size:25px}
.mini-slider output{display:block;font-size:11px;margin-top:2px}
.mini-slider input[type=range]{appearance:none;-webkit-appearance:none;cursor:pointer;display:block;width:100%;min-height:40px;padding:0;border:0;accent-color:var(--mini-accent);background:transparent;margin:3px 0 0}
.mini-slider input[type=range]::-webkit-slider-runnable-track{height:10px;background:var(--mini-track);border-radius:8px}
.mini-slider input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border:2px solid var(--shs-panel);border-radius:50%;background:var(--mini-accent);margin-top:-4px;box-shadow:0 1px 2px #0002}
.mini-slider input[type=range]::-moz-range-track{height:10px;background:var(--mini-track);border-radius:8px}
.mini-slider input[type=range]::-moz-range-thumb{width:14px;height:14px;border:2px solid var(--shs-panel);border-radius:50%;background:var(--mini-accent)}
.mini-boost-button{display:flex;align-items:center;justify-content:center;gap:6px;margin:8px auto 0;background:var(--ha-card-background,var(--shs-panel));border:1px solid var(--divider-color,var(--shs-line));border-radius:24px;padding:7px 15px;min-height:40px;font-size:12px;font-weight:500;color:var(--shs-ink)}
.mini-boost-button svg{width:15px;height:15px;color:#f34c38;flex:none}
.mini-sr{position:absolute;left:0;top:0;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@container(max-width:220px){.mini h2{font-size:14px}.mini .reading{font-size:32px}.mini-caption,.mini-room{font-size:13px}.mini .ring{gap:4px}.mini-head{padding:0 17px}.mini-thermostat{padding:4px 4px 8px}.mini-slider{font-size:13px}.mini-boost{padding:8px 8px 2px}.mini-boost-label{gap:7px}.mini-timer{width:30px;height:30px}}

.nav-mobile-label{display:none}.feature-panel{margin-top:18px}.feature-columns{display:grid;grid-template-columns:1fr 1fr;gap:28px}.feature-columns>div{min-width:0}.feature-columns label{margin:12px 0}.profile-period{display:grid;grid-template-columns:1fr 1fr;gap:8px;border-bottom:1px solid var(--shs-line);padding:10px 0}.profile-period label{min-width:0;margin:0}.profile-period input{width:100%;min-width:0}.calendar-rule{padding:12px;border:1px solid var(--shs-line);border-radius:16px;margin:12px 0}.feature-summary{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.profile-tag,.preheat-tag{display:inline-flex;align-items:center;border-radius:16px;padding:6px 10px;font-size:12px;background:color-mix(in srgb,var(--shs-good) 12%,transparent);color:var(--shs-ink);overflow-wrap:anywhere}.preheat-tag{background:color-mix(in srgb,#ff8a47 15%,transparent)}.history-chart{width:100%;height:auto;margin-top:18px;overflow:visible}.history-chart text{font-size:12px;fill:var(--shs-muted)}.chart-grid{stroke:var(--shs-line);stroke-width:1}.chart-room,.chart-target{fill:none;stroke-width:2.5;stroke-linejoin:round}.chart-room{stroke:#20b8ae}.chart-target{stroke:#ff8a47;stroke-dasharray:7 4}.chart-legend{display:flex;gap:18px;flex-wrap:wrap;font-size:13px}.chart-legend span{display:flex;align-items:center;gap:6px}.chart-legend i{width:20px;height:3px;background:#20b8ae}.chart-legend .target{background:#ff8a47}.decision-list{max-height:500px;overflow:auto}.decision-row{display:grid;grid-template-columns:155px 1fr;gap:16px;padding:16px 0;border-bottom:1px solid var(--shs-line)}.decision-row time{font-size:12px;color:var(--shs-muted)}.decision-row p{margin:6px 0 0;font-size:13px;color:var(--shs-muted)}
@container(max-width:680px){.nav-label{display:none}.nav-mobile-label{display:inline}.feature-columns{grid-template-columns:1fr}.decision-row{grid-template-columns:1fr;gap:6px}.feature-panel .draft-bar{flex-wrap:wrap}.feature-panel .toolbar{flex-wrap:wrap}}

[hidden]{display:none!important}.settings-stack{display:grid;gap:18px}.settings-section-title h3{margin-bottom:5px}.settings-section-title p{font-size:13px}.settings-grid{align-items:start}.settings-disclosure{border:1px solid var(--shs-line);border-radius:16px;background:var(--shs-panel);min-width:0}.settings-disclosure>summary{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px;cursor:pointer;min-height:64px;list-style:none}.settings-disclosure>summary::-webkit-details-marker{display:none}.settings-disclosure>summary b{display:block;font-size:15px}.settings-disclosure>summary small{display:block;margin-top:5px;line-height:1.4}.settings-disclosure>summary:focus-visible{outline:3px solid var(--shs-teal);outline-offset:3px;border-radius:16px}.disclosure-chevron{font-size:21px;color:var(--shs-muted);transition:transform .15s}.settings-disclosure[open]>summary .disclosure-chevron{transform:rotate(180deg)}.disclosure-body{padding:0 16px 16px}.disclosure-body>.form-grid{margin-top:10px}.occupancy-settings .settings-disclosure,.smart-feature .settings-disclosure{margin:14px 0;background:var(--shs-panel2)}.occupancy-settings>p,.smart-feature>p{font-size:13px;line-height:1.6;margin:10px 0 16px}.feature-status{display:flex;gap:7px;align-items:center;color:var(--shs-muted);font-size:13px;margin:12px 0}.preheat-options>label{margin:16px 0 8px}.preheat-options>p{font-size:12px;line-height:1.6;margin:10px 0}.settings-stack .fact-row b{max-width:65%;overflow-wrap:anywhere}.settings-stack .panel>label{margin-top:14px}
.settings-stack>.settings-grid>.occupancy-settings{grid-column:auto}.settings-stack>.settings-grid{align-items:stretch}

.zone-management{display:flex;align-items:end;gap:12px;flex-wrap:wrap}.add-zone-link{border:1px solid var(--shs-line);border-radius:12px;padding:9px 14px;min-height:44px;text-decoration:none;font-size:13px;font-weight:600;background:var(--shs-panel)}.zone-help{font-size:12px;margin:-2px 0 16px}@container(max-width:650px){.zone-management{display:grid;grid-template-columns:1fr}.zone-management .add-zone-link{justify-content:center}.zone-help{margin:0 0 16px}}
`;

  // src/occupancy-ui.js
  var occupancyUI = {
    _occupancySettings() {
      const z = this._zone(), p = z.smart?.policy;
      if (!p) return "";
      const disabled = !this._canEdit() || this._saving;
      const enabled = String(this._smartValue("comfort_enabled", p.comfort_target !== null)) === "true";
      const selected = this._smartValue("entities", p.entities);
      const available = Object.entries(this._hass?.states || {}).filter(([id]) => /^(person|device_tracker|binary_sensor)\./.test(id));
      const days = this._smartValue("comfort_days", p.comfort_days.join(",")).split(",");
      return `<section class="panel occupancy-settings"><div class="scope">${escapeHTML(z.name)} \xB7 zone setting</div><h2>Occupancy override</h2>
      <p class="muted">Keep this zone at a minimum temperature when occupied, during your chosen days and hours.</p>
      <fieldset ${disabled ? "disabled" : ""}>
        <label class="occupancy-toggle"><input type="checkbox" role="switch" aria-label="Enable occupancy override" data-smart-field="comfort_enabled" ${enabled ? "checked" : ""}>Enable occupancy override</label>
        ${this._disclosure("occupancy-rule", "Configure occupancy rule", `<div class="form-grid">
          ${this._smartInput("comfort_target", `Occupied minimum (${z.unit})`, p.comfort_target ?? z.limits.minimum, "number", `min="${z.limits.minimum}" max="${z.limits.maximum}" step="${z.limits.step || "any"}"`)}
          ${this._smartSelect("home_rule", "Zone is occupied when", p.home_rule, [["any", "Any selected person or sensor is home"], ["all", "All selected people or sensors are home"]])}
          ${this._smartInput("comfort_start", "From", p.comfort_start, "time")}
          ${this._smartInput("comfort_end", "Until", p.comfort_end, "time")}
        </div>
        <fieldset class="occupancy-days"><legend>Active days</legend>${DAYS.map((day, i) => `<label><input type="checkbox" data-comfort-day="${day}" ${days.includes(day) ? "checked" : ""}>${DAY_NAMES[i].slice(0, 3)}</label>`).join("")}</fieldset>
        <h3>Who or what makes this zone occupied?</h3>
        <div class="presence-rows">${selected.map((item, i) => `<div class="presence-row"><label>Person or occupancy sensor<select data-presence-index="${i}" data-presence-key="entity_id"><option value="${escapeHTML(item.entity_id)}">${escapeHTML(this._hass?.states?.[item.entity_id]?.attributes?.friendly_name || item.entity_id || "Choose a person or sensor")}</option>${available.filter(([id]) => id !== item.entity_id).map(([id, state]) => `<option value="${escapeHTML(id)}">${escapeHTML(state.attributes?.friendly_name || id)}</option>`).join("")}</select></label><div class="form-grid"><label>Occupied state<input data-presence-index="${i}" data-presence-key="home_state" value="${escapeHTML(item.home_state)}"></label><label>Unoccupied state<input data-presence-index="${i}" data-presence-key="away_state" value="${escapeHTML(item.away_state)}"></label></div><button type="button" data-action="smart-remove-person" ${disabled ? "disabled" : ""} data-index="${i}">Remove</button></div>`).join("")}</div>
        <button type="button" data-action="smart-add-person" ${disabled ? "disabled" : ""}>+ Add person or sensor</button>
        <details class="occupancy-advanced"><summary>Delays and unoccupied behaviour</summary><div class="form-grid">
          ${this._smartInput("away_target", `Optional unoccupied target (${z.unit})`, p.away_target, "number", `step="${z.limits.step || "any"}"`)}
          ${this._smartInput("away_minutes", "Unoccupied delay (minutes)", p.away_minutes)}
          ${this._smartInput("return_minutes", "Occupied delay (minutes)", p.return_minutes)}
          ${this._smartInput("unknown_minutes", "Keep last trusted occupancy (minutes)", p.unknown_minutes)}
          ${this._smartSelect("unknown_fallback", "If occupancy stays unknown", p.unknown_fallback, [["schedule", "Follow schedule"], ["home", "Treat as occupied"], ["away", "Treat as unoccupied"]])}
        </div><p class="muted">Leave the unoccupied target empty to follow the schedule. Select a person instead of also selecting their phone trackers. Unknown sensors use the chosen grace period and fallback.</p></details>
        <p class="muted">A higher scheduled target is kept. Manual temperatures, Off, boost and holiday take priority. Disabling keeps your days, hours and occupancy selections.</p>
        `, enabled ? `Minimum ${this._temp(p.comfort_target ?? z.limits.minimum)} \xB7 ${p.comfort_start}\u2013${p.comfort_end}` : "People, active hours and unoccupied behaviour")}
        <div class="toolbar" data-occupancy-save ${this._smartPolicyRevisions?.[z.id] !== void 0 ? "" : "hidden"}><button type="button" data-action="smart-save-presence" ${disabled ? "disabled" : ""} class="primary">Save occupancy override</button><button type="button" data-action="smart-reset" ${disabled ? "disabled" : ""}>Reload saved rules</button></div>
      </fieldset></section>`;
    },
    _occupancySummary(z, day = this._local().day) {
      const p = z.smart?.policy;
      if (!p || p.comfort_target === null) return "";
      const now = this._local();
      const names = p.entities.map((item) => this._hass?.states?.[item.entity_id]?.attributes?.friendly_name || item.entity_id);
      const window2 = p.comfort_days.includes(now.day) && p.comfort_start <= now.time && now.time < p.comfort_end;
      let status = !window2 ? "Outside active hours" : z.presence === "home" ? "Occupied" : z.presence === "away" ? "Waiting for occupancy" : "Occupancy unknown";
      if (z.source === "occupied_comfort") status = "Active";
      else if (window2 && z.presence === "home") status = "Paused by another control";
      return `<aside class="occupancy-summary ${z.source === "occupied_comfort" ? "active" : ""}" aria-label="${escapeHTML(z.name)} occupancy override"><div class="occupancy-summary-head"><div><div class="scope">Occupancy override</div><b>Minimum ${escapeHTML(this._temp(p.comfort_target, z.unit))} when occupied</b></div><span class="badge">${escapeHTML(status)}</span></div><p>${escapeHTML(p.comfort_days.map((d) => DAY_NAMES[DAYS.indexOf(d)].slice(0, 3)).join(" \xB7 "))} \xB7 ${escapeHTML(p.comfort_start)}\u2013${escapeHTML(p.comfort_end)}</p><small>${escapeHTML(names.join(", ") || "No occupancy inputs selected")} \xB7 ${p.home_rule === "all" ? "all must be home" : "any can be home"}</small>${this._occupancyBand(z, day)}<button type="button" class="link-button" data-action="occupancy-settings" data-zone="${escapeHTML(z.id)}">Edit zone rule \u2192</button></aside>`;
    },
    _occupancyBand(z, day) {
      const p = z.smart?.policy;
      if (!p || p.comfort_target === null || !p.comfort_days.includes(day)) return "";
      const start = minutes(p.comfort_start) / 1440 * 100, width = (minutes(p.comfort_end) - minutes(p.comfort_start)) / 1440 * 100;
      return `<div class="occupancy-track" aria-label="${escapeHTML(DAY_NAMES[DAYS.indexOf(day)])} occupancy override ${escapeHTML(p.comfort_start)} to ${escapeHTML(p.comfort_end)}, minimum ${escapeHTML(this._temp(p.comfort_target, z.unit))} only when occupied"><span style="margin-left:${start}%;width:${width}%" title="Occupancy override \xB7 ${escapeHTML(this._temp(p.comfort_target, z.unit))}"></span></div>`;
    }
  };

  // src/mini-ui.js
  function dialTemperature(limits, x, y, rect, unit = "\xB0C") {
    if (!rect.width || !rect.height || ![x, y].every(Number.isFinite)) return null;
    const angle = (Math.atan2(x - rect.left - rect.width / 2, rect.top + rect.height / 2 - y) * 180 / Math.PI + 360) % 360;
    let sweep = (angle - 225 + 360) % 360;
    if (sweep > 270) sweep = sweep > 315 ? 0 : 270;
    const step = limits.step || (unit === "\xB0F" ? 1 : 0.5);
    const raw = limits.minimum + sweep / 270 * (limits.maximum - limits.minimum);
    return Number(Math.max(limits.minimum, Math.min(limits.maximum, Math.round(raw / step) * step)).toFixed(6));
  }
  var miniUI = {
    _miniZone() {
      return this._config.zone_id ? this._data?.zones.find((z) => z.id === this._config.zone_id) : this._zone();
    },
    _miniCanSet(z) {
      return !!(z && this._canEdit() && !this._saving && (this._config.demo || !this._data.observe_only) && z.enabled && z.mode === "heat" && !z.boost.active && !z.smart?.external_operation && !["holiday", "unavailable", "unsupported", "error", "disabled", "boost_unknown", "boost_handover"].includes(z.source) && !z.error);
    },
    _previewMiniTarget(value) {
      const z = this._miniZone();
      if (!z || value === null) return;
      this._miniTarget = value;
      const ring = this.shadowRoot.querySelector("[data-mini-dial]");
      const fill = Math.max(0, Math.min(270, (value - z.limits.minimum) / (z.limits.maximum - z.limits.minimum) * 270));
      if (ring) {
        ring.style.setProperty("--fill", fill);
        ring.setAttribute("aria-valuenow", value);
        ring.setAttribute("aria-valuetext", this._temp(value, z.unit));
      }
      const output = this.shadowRoot.querySelector("[data-mini-reading]");
      if (output) output.textContent = this._temp(value, z.unit);
      const arc = this.shadowRoot.querySelector("[data-mini-arc]");
      if (arc) arc.setAttribute("stroke-dasharray", `${fill / 360 * 534.071} 534.071`);
    },
    _miniDialDown(event) {
      const dial = event.target.closest("[data-mini-dial]"), z = this._miniZone();
      if (!dial || !this._miniCanSet(z) || this._dialDrag || event.button !== 0 || event.isPrimary === false) return;
      const rect = dial.getBoundingClientRect();
      const radius = Math.hypot((event.clientX - rect.left - rect.width / 2) / rect.width, (event.clientY - rect.top - rect.height / 2) / rect.height);
      if (radius < 0.28 || radius > 0.62) return;
      event.preventDefault();
      dial.focus({ preventScroll: true });
      this._dialDrag = { id: event.pointerId, zone: z.id, dial, rect };
      dial.setPointerCapture?.(event.pointerId);
      this._previewMiniTarget(dialTemperature(z.limits, event.clientX, event.clientY, rect, z.unit));
    },
    _miniDialMove(event) {
      const drag = this._dialDrag, z = this._miniZone();
      if (!drag || drag.id !== event.pointerId || z?.id !== drag.zone) return;
      event.preventDefault();
      this._previewMiniTarget(dialTemperature(z.limits, event.clientX, event.clientY, drag.rect, z.unit));
    },
    _miniDialEnd(event, cancel = false) {
      const drag = this._dialDrag;
      if (!drag || drag.id !== event.pointerId) return;
      const value = this._miniTarget;
      this._dialDrag = null;
      if (drag.dial.hasPointerCapture?.(event.pointerId)) drag.dial.releasePointerCapture(event.pointerId);
      if (cancel || this._miniZone()?.id !== drag.zone || !this._miniCanSet(this._miniZone())) {
        this._miniTarget = null;
        this._render();
        return;
      }
      void this._miniSetTarget(value);
    },
    _miniDialKey(event) {
      if (!event.target.matches("[data-mini-dial]") || !this._miniCanSet(this._miniZone())) return;
      const z = this._miniZone(), step = z.limits.step || (z.unit === "\xB0F" ? 1 : 0.5), current = Number(this._miniTarget ?? z.device_target ?? z.limits.minimum);
      const offsets = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: step * 10, PageDown: -step * 10 };
      let value = event.key === "Home" ? z.limits.minimum : event.key === "End" ? z.limits.maximum : current + offsets[event.key];
      if (!Number.isFinite(value)) return;
      event.preventDefault();
      value = Number(Math.max(z.limits.minimum, Math.min(z.limits.maximum, value)).toFixed(6));
      this._previewMiniTarget(value);
      void this._miniSetTarget(value);
    },
    async _miniSetTarget(raw) {
      const z = this._miniZone();
      if (!this._miniCanSet(z)) return;
      const value = Number(raw), step = z.limits.step;
      if (!Number.isFinite(value) || value < z.limits.minimum || value > z.limits.maximum || step && Math.abs(value / step - Math.round(value / step)) > 1e-6) {
        this._error = "Choose a target within this zone\u2019s reviewed limits.";
        this._render();
        return;
      }
      this._saving = true;
      this._error = "";
      this._render();
      try {
        if (this._config.demo) {
          z.device_target = value;
          z.proposed_target = value;
          z.source = "manual";
        } else await this._hass.callService("climate", "set_temperature", { temperature: value }, { entity_id: z.climate_entity });
        this._message = "Manual target sent";
      } catch (error) {
        this._error = error.message || "Could not set the thermostat target.";
      } finally {
        this._saving = false;
        this._miniTarget = null;
        this._render();
      }
    },
    _mini() {
      const z = this._miniZone();
      if (!z) return `<div class="wrap mini"><h2>Heating zone unavailable</h2><p>Choose a valid zone in the card editor.</p></div>`;
      const p = z.smart?.policy, helper = this._hass?.states?.[p?.duration_helper]?.attributes;
      const max = Math.min(p?.boost_max_minutes || 120, helper?.max || 1440), min = Math.max(1, helper?.min || 1), durationStep = helper?.step || 1;
      const duration = this._boostInputs?.[z.id]?.minutes ?? p?.boost_minutes ?? 30;
      const target = this._miniTarget ?? z.device_target ?? z.limits.minimum;
      const fill = Math.max(0, Math.min(270, (Number(target) - z.limits.minimum) / (z.limits.maximum - z.limits.minimum) * 270));
      const canSet = this._miniCanSet(z), disabled = !this._canEdit() || this._saving;
      const boostDisabled = disabled || !(z.boost.active ? z.boost.can_cancel : z.boost.can_start);
      const caption = z.mode === "off" ? "Off" : z.hvac_action === "heating" ? "Heating" : z.hvac_action === "idle" ? "Idle" : "Activity unknown";
      const href = this._config.dashboard_path?.startsWith("/") && !this._config.dashboard_path.startsWith("//") ? this._config.dashboard_path : null;
      const thermometer = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14.8V5a2 2 0 0 1 4 0v9.8a4 4 0 1 1-4 0Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v9" stroke="currentColor" stroke-width="2"/></svg>';
      const flame = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2c1 5-4 6-2 10 1-1 2-2 2-4 4 3 6 5 6 8a7 7 0 0 1-14 0c0-4 4-7 8-14Z" fill="currentColor"/></svg>';
      return `<section class="mini ${z.hvac_action === "heating" ? "" : "idle"}" aria-label="${escapeHTML(z.name)} mini thermostat">
      <div class="mini-thermostat"><header class="mini-head"><h2>${href ? `<a href="${escapeHTML(href)}" aria-label="${escapeHTML(this._config.title || z.name)} full scheduler">${escapeHTML(this._config.title || z.name)}</a>` : escapeHTML(this._config.title || z.name)}</h2><button type="button" class="mini-more" data-action="more" data-zone="${escapeHTML(z.id)}" aria-label="Open native thermostat" ${z.climate_entity ? "" : "disabled"}>\u22EE</button></header>
      <div class="ring mini-dial" data-mini-dial role="slider" tabindex="${canSet ? "0" : "-1"}" aria-label="Target temperature dial" aria-valuemin="${z.limits.minimum}" aria-valuemax="${z.limits.maximum}" aria-valuenow="${escapeHTML(target)}" aria-valuetext="${escapeHTML(this._temp(Number(target), z.unit))}" aria-disabled="${!canSet}" style="--fill:${fill}"><svg class="mini-arc" viewBox="0 0 200 200" aria-hidden="true"><circle class="arc-track" cx="100" cy="100" r="85" stroke-dasharray="400.553 534.071"/><circle class="arc-value" data-mini-arc cx="100" cy="100" r="85" stroke-dasharray="${fill / 360 * 534.071} 534.071"/></svg><span class="dial-thumb" aria-hidden="true"></span><span class="mini-caption">${escapeHTML(this._data.observe_only && !this._config.demo ? "Observe only" : caption)}</span><div class="reading" data-mini-reading>${escapeHTML(this._temp(Number(target), z.unit))}</div><span class="mini-room" aria-label="Room temperature ${escapeHTML(this._temp(z.current_temperature, z.unit))}">${thermometer}${escapeHTML(this._temp(z.current_temperature, z.unit))}</span></div>
      ${z.source === "manual" ? `<button type="button" class="mini-resume" data-action="smart-resume" data-zone="${escapeHTML(z.id)}" ${disabled || !this._config.demo && this._data.observe_only ? "disabled" : ""}>Manual \xB7 Resume schedule</button>` : z.source === "occupied_comfort" ? '<span class="mini-state" role="img" aria-label="Occupancy override active" title="Occupancy override active"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4" fill="currentColor"/><path d="M4 21v-3a8 8 0 0 1 16 0v3Z" fill="currentColor"/></svg>Occupied</span>' : z.source === "holiday" ? '<span class="mini-state">Holiday</span>' : ""}</div>
      <div class="mini-boost" data-smart-zone="${escapeHTML(z.id)}"><input type="hidden" data-boost="target" value="${escapeHTML(p?.boost_target ?? "")}"><label class="mini-slider"><span class="mini-boost-label"><span class="mini-timer" aria-hidden="true">\u25F4</span><span>Boost time<output data-mini-minutes>${z.boost.active ? escapeHTML(remainingText(z.boost.until, this._now())) : escapeHTML(duration) + " minutes"}</output></span></span><input type="range" data-boost="minutes" aria-label="Boost duration" min="${min}" max="${max}" step="${durationStep}" value="${escapeHTML(duration)}" ${disabled || z.boost.active || p?.boost_owner === "external" && !p.duration_helper ? "disabled" : ""}></label></div>
      <button type="button" class="mini-boost-button" data-action="smart-${z.boost.active ? "boost-cancel" : "boost-start"}" data-zone="${escapeHTML(z.id)}" ${boostDisabled ? "disabled" : ""}>${flame}${z.boost.active ? "Stop boost" : "Boost"}</button>
      ${this._error ? `<p class="error" role="alert">${escapeHTML(this._error)}</p>` : ""}<span class="mini-sr" role="status">${escapeHTML(this._message || "")}</span></section>${this._modal()}`;
    }
  };

  // src/smart-ui.js
  function defaultSmart() {
    return { policy: { entities: [], home_rule: "any", away_minutes: 10, return_minutes: 0, unknown_minutes: 10, unknown_fallback: "schedule", away_target: 16, comfort_target: null, comfort_days: DAYS.slice(0, 5), comfort_start: "08:30", comfort_end: "16:30", boost_owner: "builtin", boost_target: 21, boost_minutes: 30, boost_max_minutes: 120, start_script: "", cancel_script: "", duration_helper: "", timer: "", completion_event: "", completion_field: "zone", completion_value: "" }, presence: { trusted: null, candidate: null, since: null, unknown_since: null }, override: null, boost: null, holiday: null, external_operation: null, external_was_active: false, policy_revision: 1 };
  }
  function resolveDemo(card) {
    const now = Date.parse(card._now()), local = card._local();
    for (const z of card._data.zones) {
      const s = z.smart ||= defaultSmart(), p = s.policy;
      if (s.boost && Date.parse(s.boost.until) <= now) {
        if (s.boost.return_off) z.mode = "off";
        s.boost = null;
      }
      if (s.override?.until && Date.parse(s.override.until) <= now) s.override = null;
      if (s.holiday && Date.parse(s.holiday.end) <= now) s.holiday = null;
      const holiday = s.holiday && Date.parse(s.holiday.start) <= now;
      if (holiday && !s.holiday.applied) {
        s.holiday.applied = true;
        if (s.boost && !s.boost.holiday_exception) s.boost = null;
      }
      z.presence = s.override?.mode || "schedule";
      z.presence_raw = "schedule";
      z.source = "schedule";
      z.proposed_target = z.week[local.day][periodIndex(z.week[local.day], local.minute)].temperature;
      z.reason = "Following the current weekly period";
      if (z.presence === "away" && p.away_target !== null) {
        z.source = "away";
        z.proposed_target = p.away_target;
        z.reason = "Forced Away presence override";
      }
      if (z.presence === "home" && p.comfort_target !== null && p.comfort_days.includes(local.day) && p.comfort_start <= local.time && local.time < p.comfort_end) {
        z.source = "occupied_comfort";
        z.proposed_target = Math.max(z.proposed_target, p.comfort_target);
        z.reason = "Occupied comfort minimum during configured hours";
      }
      if (holiday) {
        z.source = "holiday";
        z.proposed_target = s.holiday.target;
        z.reason = "Holiday target; current rules resume on return";
      }
      if (z.mode === "off") {
        z.source = "off";
        z.proposed_target = null;
      }
      if (s.boost && (!holiday || s.holiday.exceptions && s.boost.holiday_exception)) {
        z.source = "boost";
        z.proposed_target = s.boost.target;
        z.reason = "Timed boost; current rules resume at its deadline";
      }
      z.boost = { owner: p.boost_owner, active: !!s.boost, until: s.boost?.until, can_start: !s.boost && p.boost_owner === "builtin" && p.boost_target !== null, can_cancel: !!s.boost };
      const wall = card._wallTime(card._now());
      const next = z.week[local.day].find((period) => period.start > local.time);
      const nextDay = new Date(Date.parse(wall.slice(0, 10) + "T12:00Z") + 864e5).toISOString().slice(0, 10);
      const weekly = card._parseWall(next ? wall.slice(0, 10) + "T" + next.start : nextDay + "T00:00");
      const deadlines = [weekly, s.boost?.until, s.override?.until, s.holiday?.start, s.holiday?.end].filter((iso) => iso && Date.parse(iso) > now);
      z.next_evaluation = new Date(Math.min(...deadlines.map(Date.parse))).toISOString();
    }
  }
  var btn2 = (label, action, disabled = false, attrs = "", cls = "") => `<button type="button" data-action="smart-${action}" ${attrs} ${disabled ? "disabled" : ""} class="${cls}">${escapeHTML(label)}</button>`;
  var smartUI = {
    _smartValue(key, fallback) {
      return this._smartInputs?.[this._zone().id]?.[key] ?? fallback;
    },
    _smartInput(key, label, value, type = "number", attrs = "") {
      return `<label>${escapeHTML(label)}<input data-smart-field="${key}" type="${type}" value="${escapeHTML(String(this._smartValue(key, value) ?? ""))}" ${attrs}></label>`;
    },
    _smartSelect(key, label, value, options) {
      const selected = this._smartValue(key, value);
      return `<label>${escapeHTML(label)}<select data-smart-field="${key}">${options.map(([v, t]) => `<option value="${escapeHTML(v)}" ${String(selected) === String(v) ? "selected" : ""}>${escapeHTML(t)}</option>`).join("")}</select></label>`;
    },
    _smartBoostControls(z) {
      const s = z.smart, p = s?.policy;
      if (!p) return "<small>Update the integration to configure smart controls.</small>";
      const disabled = !this._canEdit() || this._saving;
      const boostDraft = this._boostInputs?.[z.id] || {};
      return `<div data-smart-zone="${escapeHTML(z.id)}"><fieldset ${disabled ? "disabled" : ""}><div class="form-grid"><label>Boost target (${escapeHTML(z.unit)})<input data-boost="target" type="number" min="${z.limits.minimum}" max="${z.limits.maximum}" step="${z.limits.step || "any"}" value="${escapeHTML(boostDraft.target ?? p.boost_target ?? "")}" ${p.boost_owner !== "builtin" ? "disabled" : ""}></label><label>Minutes<input data-boost="minutes" type="number" min="1" max="${p.boost_max_minutes}" step="1" value="${escapeHTML(boostDraft.minutes ?? p.boost_minutes)}" ${p.boost_owner === "external" && !p.duration_helper ? "disabled" : ""}></label></div><div class="boost-controls"><small>${z.boost.active ? escapeHTML(remainingText(z.boost.until, this._now())) + " \xB7 " : ""}${p.boost_owner === "external" ? "External scripts \xB7 fixed declared target" : this._data.observe_only ? "Observe-only boost \xB7 heating unchanged" : "Timed heating boost"}</small>${btn2(z.boost.active ? "Stop boost" : "Start boost", z.boost.active ? "boost-cancel" : "boost-start", disabled || !(z.boost.active ? z.boost.can_cancel : z.boost.can_start), `data-zone="${escapeHTML(z.id)}"`, "primary")}</div></fieldset></div>`;
    },
    _smartPresenceButtons() {
      const z = this._zone(), disabled = !this._canEdit() || this._saving;
      return `<div class="fact-row"><span>Presence</span><b>${escapeHTML(z.presence || "schedule")}</b></div>${z.smart?.override ? `<small>Override ${z.smart.override.until ? "until " + escapeHTML(this._formatTime(z.smart.override.until)) : "until cleared"}</small>` : ""}<div class="toolbar" style="margin-top:12px">${["auto", "home", "away"].map((m) => btn2({ auto: "Auto", home: "Home", away: "Away" }[m], "presence-" + m, disabled, `aria-pressed="${(z.smart?.override?.mode || "auto") === m}"`)).join("")}</div>${btn2(this._data.observe_only ? "Clear manual hold" : "Resume schedule", "resume", disabled)}${this._smartSelect("override_minutes", "Override duration", "120", [["30", "30 minutes"], ["120", "2 hours"], ["480", "8 hours"], ["boundary", "Until next period"], ["forever", "Until cleared"]])}`;
    },
    _smartAutomation() {
      const z = this._zone(), s = z.smart;
      if (!s) return '<section class="panel">Update the integration to enable smart modes.</section>';
      const p = s.policy, disabled = !this._canEdit() || this._saving;
      const selected = this._smartValue("entities", p.entities), available = Object.entries(this._hass?.states || {}).filter(([id]) => /^(person|device_tracker|binary_sensor)\./.test(id));
      const holiday = s.holiday;
      const now = new Date(this._now());
      return `<div class="zone-picker"><div><div class="eyebrow">Smart modes \xB7 per zone</div><h2>Automation</h2></div>${this._selector()}</div><div class="automation-grid">${this._occupancySettings()}<section class="panel"><h2>Holiday mode</h2><div class="reason"><b>${holiday ? "Holiday scheduled" : "No holiday planned"}</b><p>${holiday ? `${escapeHTML(this._dateTime(holiday.start))} \u2192 ${escapeHTML(this._dateTime(holiday.end))}` : "Set a start, return and temperature for this zone. Other zones keep their own rules."}</p></div><fieldset ${disabled ? "disabled" : ""}><div class="form-grid">${this._smartInput("holiday_start", "Start (Home Assistant time)", this._wallTime(holiday?.start || now.toISOString()), "datetime-local")}${this._smartInput("holiday_end", "Return (Home Assistant time)", this._wallTime(holiday?.end || new Date(now.getTime() + 864e5).toISOString()), "datetime-local")}${this._smartInput("holiday_target", `Holiday target (${z.unit})`, holiday?.target ?? p.away_target, "number", `step="${z.limits.step || "any"}"`)}${this._smartSelect("holiday_exceptions", "Timed boost during holiday", String(holiday?.exceptions || false), [["false", "Block boost"], ["true", "Allow an acknowledged exception"]])}</div><p class="muted">Times use ${escapeHTML(this._data.timezone)}. Holiday replaces existing temporary targets and respects manual Off. Current rules resume on return.</p><div class="toolbar">${btn2("Save holiday", "holiday-save", disabled, "", "primary")}${holiday ? btn2("Cancel holiday", "holiday-cancel", disabled) : ""}</div></fieldset></section><section class="panel"><h2>Temporary occupancy</h2><fieldset ${disabled ? "disabled" : ""}>${this._smartPresenceButtons()}</fieldset><p class="muted">Home removes the Away target. It does not override the weekly target unless an occupied minimum is configured.</p></section><section class="panel"><h2>Control ownership</h2><div class="reason"><b>${this._data.observe_only ? "Observe only" : "Heating control enabled"}</b><p>${this._data.observe_only ? "Smart controls change scheduler proposals only. Existing heating controls remain in charge." : "This scheduler can command the mapped thermostats. Keep previous schedule writers disabled."}</p></div>${s.external_operation ? `<div class="error">External boost handover needs review. Check that restoration finished and the timer is idle.</div>${btn2("Confirm restoration completed", "reconcile", disabled)}` : ""}${this._config.demo ? btn2("Advance demo clock 30 minutes", "advance", false) : ""}</section></div>`;
    },
    _smartSettings() {
      const z = this._zone(), p = z.smart?.policy;
      if (!p) return "";
      const disabled = !this._canEdit() || this._saving;
      return `<section class="panel"><h2>Boost adapter</h2><fieldset ${disabled ? "disabled" : ""}><div class="form-grid">${this._smartSelect("boost_owner", "One boost owner", p.boost_owner, [["builtin", "Built-in timed boost"], ["external", "Existing scripts and timer"], ["none", "No boost"]])}${this._smartInput("boost_target", `Default / fixed external target (${z.unit})`, p.boost_target, "number", `step="${z.limits.step || "any"}"`)}${this._smartInput("boost_minutes", "Default duration (minutes)", p.boost_minutes)}${this._smartInput("boost_max_minutes", "Maximum duration (minutes)", p.boost_max_minutes)}${this._smartInput("timer", "External ownership timer", p.timer, "text", 'placeholder="timer.example"')}${this._smartInput("start_script", "External start script", p.start_script, "text", 'placeholder="script.example_start"')}${this._smartInput("cancel_script", "External cancel script", p.cancel_script, "text", 'placeholder="script.example_stop"')}${this._smartInput("duration_helper", "Optional duration helper", p.duration_helper, "text", 'placeholder="input_number.example_minutes"')}${this._smartInput("completion_event", "Optional completion event", p.completion_event, "text")}${this._smartInput("completion_field", "Completion event field", p.completion_field, "text")}${this._smartInput("completion_value", "Completion field value", p.completion_value, "text")}</div><p class="muted">Built-in boost needs the external timer removed. External scripts retain their fixed target and helper limits. Observe-only mode never calls them. Map a custom completion event emitted after restoration, with an exact field/value filter. Without it, automatic timer release pauses control until you confirm restoration.</p>${btn2("Save boost adapter", "save-boost", disabled, "", "primary")}${btn2("Reload saved rules", "reset", disabled)}</fieldset></section><section class="panel"><h2>Heating control mode</h2><p class="muted">Defaults to observe only. Before enabling control, back up the setup and disable competing schedule writers. Enable only after reviewing the zone settings and control handover.</p>${this._smartInput("acknowledgement", "To enable, type ENABLE HEATING CONTROL", "", "text")}<div class="toolbar">${btn2(this._data.observe_only ? "Enable heating control" : "Switch to observe only", "mode", disabled || this._config.demo)}${btn2("Retry controls", "retry", disabled)}</div></section>`;
    },
    _wallTime(iso) {
      const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: this._data.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
      return parts.replace(" ", "T");
    },
    _dateTime(iso) {
      return new Intl.DateTimeFormat("en-GB", { timeZone: this._data.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
    },
    _parseWall(value) {
      const naive = Date.parse(value + "Z");
      if (!Number.isFinite(naive)) throw Error("Choose a valid start and return.");
      const matches = [];
      for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
        const iso = new Date(naive + offset * 6e4).toISOString();
        if (this._wallTime(iso) === value) matches.push(iso);
      }
      if (matches.length !== 1) throw Error(matches.length ? "This time occurs twice when clocks change. Choose a time outside the repeated hour." : "This local time does not exist when clocks change. Choose another time.");
      return matches[0];
    },
    async _smartAction(action, data) {
      if (!this._canEdit() || this._saving) return;
      const z = this._zoneFor(data.zone) || this._zone(), s = z.smart;
      if (!s) {
        this._error = "Update the integration first.";
        this._render();
        return;
      }
      this._smartInputs ||= {};
      this._smartInputs[z.id] ||= {};
      const input = this._smartInputs[z.id], p = clone(s.policy);
      const value = (key, fallback) => input[key] ?? fallback;
      const numeric = (key, fallback) => {
        const raw = value(key, fallback);
        return raw === "" || raw === null ? null : Number(raw);
      };
      const validTarget = (target) => {
        if (!Number.isFinite(target) || target < z.limits.minimum || target > z.limits.maximum || z.limits.step && Math.abs(target / z.limits.step - Math.round(target / z.limits.step)) > 1e-6) throw Error("Choose a temperature within reviewed limits and increments.");
        return target;
      };
      const until = (minutes2) => new Date(Date.parse(this._now()) + minutes2 * 6e4).toISOString();
      try {
        if (action === "reset") {
          this._smartInputs[z.id] = {};
          if (this._smartPolicyRevisions) delete this._smartPolicyRevisions[z.id];
          this._error = "";
          this._render();
          return;
        }
        if (action === "add-person") {
          input.entities = clone(value("entities", p.entities));
          input.entities.push({ entity_id: "", home_state: "home", away_state: "not_home" });
          this._render();
          return;
        }
        if (action === "remove-person") {
          input.entities = clone(value("entities", p.entities));
          input.entities.splice(Number(data.index), 1);
          this._render();
          return;
        }
        if (action === "advance") {
          this._data.generated_at = until(30);
          resolveDemo(this);
          this._render();
          return;
        }
        let command, payload = {};
        if (action.startsWith("presence-")) {
          command = "presence";
          const minutes2 = value("override_minutes", "120");
          payload = { mode: action.slice(9), until_next_period: minutes2 === "boundary", minutes: minutes2 === "forever" ? null : minutes2 === "boundary" ? Math.max(1, Math.ceil((Date.parse(z.next_evaluation) - Date.parse(this._now())) / 6e4)) : Number(minutes2) };
        } else if (action === "save-presence" || action === "save-boost") {
          command = "policy";
          const fields = action === "save-presence" ? ["entities", "home_rule", "away_minutes", "return_minutes", "unknown_minutes", "unknown_fallback", "away_target", "comfort_target", "comfort_days", "comfort_start", "comfort_end"] : ["boost_owner", "boost_target", "boost_minutes", "boost_max_minutes", "start_script", "cancel_script", "duration_helper", "timer", "completion_event", "completion_field", "completion_value"];
          for (const key of fields) if (key in input) p[key] = ["away_minutes", "return_minutes", "unknown_minutes", "away_target", "comfort_target", "boost_target", "boost_minutes", "boost_max_minutes"].includes(key) ? numeric(key, p[key]) : key === "comfort_days" ? input[key].split(",").map((x) => x.trim()).filter(Boolean) : input[key];
          if (action === "save-presence" && "comfort_enabled" in input) {
            p.comfort_target = String(input.comfort_enabled) === "true" ? validTarget(numeric("comfort_target", p.comfort_target ?? z.limits.minimum)) : null;
          }
          if (action === "save-presence" && p.comfort_target !== null && (!p.entities.length || !p.comfort_days.length)) throw Error("Choose at least one person or occupancy sensor and one active day.");
          for (const k of ["away_target", "comfort_target", "boost_target"]) if (p[k] !== null) validTarget(p[k]);
          payload = { policy: p, revision: this._smartPolicyRevisions?.[z.id] ?? s.policy_revision };
        } else if (action === "holiday-save") {
          command = "holiday";
          payload = { start: this._parseWall(value("holiday_start", this._wallTime(this._now()))), end: this._parseWall(value("holiday_end", this._wallTime(until(1440)))), target: validTarget(numeric("holiday_target", p.away_target)), exceptions: String(value("holiday_exceptions", s.holiday?.exceptions || false)) === "true" };
          if (Date.parse(payload.end) <= Math.max(Date.parse(payload.start), Date.parse(this._now()))) throw Error("Return must follow the start and be in the future.");
        } else if (action === "holiday-cancel") {
          command = "holiday";
          payload = { cancel: true };
        } else if (action === "boost-start") {
          command = "boost_start";
          const box = [...this.shadowRoot.querySelectorAll("[data-smart-zone]")].find((el) => el.dataset.smartZone === z.id);
          payload = this._holidayAcknowledged && this._pendingBoost ? { ...this._pendingBoost, holiday_exception: true } : { target: validTarget(Number(box.querySelector('[data-boost="target"]').value)), minutes: Number(box.querySelector('[data-boost="minutes"]').value), holiday_exception: !!this._holidayAcknowledged };
          if (!Number.isInteger(payload.minutes) || payload.minutes < 1 || payload.minutes > p.boost_max_minutes) throw Error("Choose a duration within the configured limit.");
          if (s.holiday && Date.parse(s.holiday.start) <= Date.parse(this._now()) && Date.parse(s.holiday.end) > Date.parse(this._now()) && !payload.holiday_exception) {
            if (!s.holiday.exceptions) throw Error("Holiday blocks boost. Change its conflict policy first.");
            this._pendingBoost = payload;
            this._dialog = { kind: "holiday-boost", zone: z.id };
            this._focusDialog = true;
            this._render();
            return;
          }
        } else if (action === "boost-cancel") command = "boost_cancel";
        else if (action === "mode") {
          command = "mode";
          payload = { enabled: this._data.observe_only, acknowledgement: value("acknowledgement", "") };
        } else if (action === "reconcile") {
          this._dialog = { kind: "reconcile" };
          this._focusDialog = true;
          this._render();
          return;
        } else if (action === "confirm-reconcile") {
          command = "reconcile";
          payload = { confirmed: true };
        } else if (action === "retry") command = "retry";
        else if (action === "resume") command = "resume";
        if (!command) return;
        this._saving = true;
        this._error = "";
        this._render();
        if (this._config.demo) {
          if (command === "policy") {
            s.policy = payload.policy;
            s.policy_revision++;
          }
          if (command === "presence") s.override = payload.mode === "auto" ? null : { mode: payload.mode, until: payload.minutes === null ? null : until(payload.minutes) };
          if (command === "holiday") s.holiday = payload.cancel ? null : { ...payload, applied: false };
          if (command === "boost_start") s.boost = { target: payload.target, until: until(payload.minutes), return_off: z.mode === "off", holiday_exception: payload.holiday_exception };
          if (command === "boost_cancel") {
            if (s.boost?.return_off) z.mode = "off";
            s.boost = null;
          }
          resolveDemo(this);
        } else {
          this._data = await this._hass.callWS({ type: "smart_heating_scheduler/control", entry_id: this._config.entry_id, zone_id: z.id, action: command, payload });
        }
        this._holidayAcknowledged = false;
        this._dialog = null;
        this._smartInputs[z.id] = {};
        if (this._boostInputs) delete this._boostInputs[z.id];
        if (this._smartPolicyRevisions) delete this._smartPolicyRevisions[z.id];
        this._message = this._config.demo ? "Saved to this demo only. Your heating is unchanged." : this._data.observe_only ? "Scheduler updated in observe-only mode. Heating controls are unchanged." : "Heating controls updated.";
      } catch (error) {
        this._error = error.message || "Control failed. Check current state before trying again.";
      } finally {
        this._saving = false;
        this._render();
      }
    }
  };

  // src/card.js
  var DOMAIN = "smart_heating_scheduler";
  var VIEWS = { dashboard: ["\u2302", "Dashboard"], schedules: ["\u25A6", "Schedules"], automation: ["\u25F7", "Automation"], heatingHistory: ["\u2197", "History"], settings: ["\u2699", "Settings"] };
  var SOURCES = { preheat: "Smart preheating", boost: "Timed boost", holiday: "Holiday", away: "Away target", occupied_comfort: "Occupancy override", boost_handover: "Boost handover needs review", schedule: "Following schedule", manual: "Manual override", manual_off: "Manual off", off: "Thermostat off", external_boost: "External boost", boost_unknown: "Boost status unknown", unavailable: "Thermostat unavailable", unsupported: "Review thermostat capabilities", disabled: "Scheduler disabled", error: "Review required" };
  var button = (label, action, attrs = "", cls = "") => `<button type="button" data-action="${action}" class="${cls}" ${attrs}>${escapeHTML(label)}</button>`;
  var SmartHeatingSchedulerCard = class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._view = "dashboard";
      this._day = "mon";
      this._zoneId = null;
      this._data = null;
      this._draft = null;
      this._history = [];
      this._revision = null;
      this._dialog = null;
      this._error = "";
      this._message = "";
      this._saving = false;
      this._status = "waiting";
      this._generation = 0;
      this._retryDelay = 2e3;
      this._unsub = null;
      this.shadowRoot.addEventListener("pointerdown", (event) => this._miniDialDown(event));
      this.shadowRoot.addEventListener("pointermove", (event) => this._miniDialMove(event));
      this.shadowRoot.addEventListener("pointerup", (event) => this._miniDialEnd(event));
      this.shadowRoot.addEventListener("pointercancel", (event) => this._miniDialEnd(event, true));
      this.shadowRoot.addEventListener("lostpointercapture", (event) => this._miniDialEnd(event, true));
      this.shadowRoot.addEventListener("click", (event) => {
        const target = event.target.closest("button[data-action]");
        if (target && !target.disabled) this._action(target.dataset.action, target.dataset);
      });
      this.shadowRoot.addEventListener("change", (event) => {
        const target = event.target;
        if (target.dataset.smartField || target.dataset.presenceIndex !== void 0) target.dispatchEvent(new Event("input", { bubbles: true }));
        if (target.dataset.comfortDay) {
          this.shadowRoot.querySelector("[data-occupancy-save]")?.removeAttribute("hidden");
          this._smartInputs ||= {};
          const input = this._smartInputs[this._zone().id] ||= {};
          this._smartPolicyRevisions ||= {};
          this._smartPolicyRevisions[this._zone().id] ??= this._zone().smart.policy_revision;
          const selected = new Set((input.comfort_days ?? this._zone().smart.policy.comfort_days.join(",")).split(","));
          target.checked ? selected.add(target.dataset.comfortDay) : selected.delete(target.dataset.comfortDay);
          input.comfort_days = DAYS.filter((day) => selected.has(day)).join(",");
        }
        if (target.dataset.smartField === "comfort_enabled") {
          const rule = [...this.shadowRoot.querySelectorAll("details[data-disclosure]")].find((el) => el.dataset.disclosure.endsWith(":occupancy-rule"));
          if (rule) rule.open = target.checked;
        }
        if (target.dataset.smartField === "comfort_enabled" || target.dataset.feature === "preheat_enabled") this._render();
        if (target.dataset.action === "feature-profile-select") {
          this._profileName = target.value;
          this._render();
        }
        if (target.dataset.action === "zone-select") this._guard(() => this._selectZone(target.value));
        if (target.dataset.action === "theme-select") {
          this._config.theme = target.value;
          this._render();
        }
        if (target.dataset.copyDay) {
          target.checked ? this._copyDays.add(target.dataset.copyDay) : this._copyDays.delete(target.dataset.copyDay);
        }
      });
      this.shadowRoot.addEventListener("input", (event) => {
        const target = event.target;
        this._featureInput(target);
        if (target.hasAttribute("data-new-profile")) {
          this._newProfileNames ||= {};
          this._newProfileNames[this._zone().id] = target.value;
        }
        if (target.dataset.boost === "minutes") {
          const out = this.shadowRoot.querySelector("[data-mini-minutes]");
          if (out) out.textContent = target.value + " minutes";
        }
        if (target.dataset.boost) {
          this._boostInputs ||= {};
          const zone = target.closest("[data-smart-zone]").dataset.smartZone;
          this._boostInputs[zone] ||= {};
          this._boostInputs[zone][target.dataset.boost] = target.value;
        }
        if (target.dataset.smartField || target.dataset.presenceIndex !== void 0) {
          this.shadowRoot.querySelector("[data-occupancy-save]")?.removeAttribute("hidden");
          this._smartPolicyRevisions ||= {};
          this._smartPolicyRevisions[this._zone().id] ??= this._zone().smart?.policy_revision;
        }
        if (target.dataset.smartField) {
          this._smartInputs ||= {};
          this._smartInputs[this._zone().id] ||= {};
          this._smartInputs[this._zone().id][target.dataset.smartField] = target.type === "checkbox" ? String(target.checked) : target.value;
        }
        if (target.dataset.presenceIndex !== void 0) {
          this._smartInputs ||= {};
          const input = this._smartInputs[this._zone().id] ||= {};
          input.entities ||= clone(this._zone().smart.policy.entities);
          input.entities[Number(target.dataset.presenceIndex)][target.dataset.presenceKey] = target.value;
        }
        if (this._dialog?.kind === "period" && event.target.dataset.field) this._dialog.edit[event.target.dataset.field] = event.target.value;
      });
      this.shadowRoot.addEventListener("keydown", (event) => {
        this._miniDialKey(event);
        if (event.key === "Escape" && this._dialog && !this._saving) {
          event.preventDefault();
          this._dialog = null;
          this._render();
        }
        if (event.key === "Tab" && this._dialog) this._trapFocus(event);
      });
      this.shadowRoot.addEventListener("submit", (event) => {
        event.preventDefault();
        this._action("apply-period");
      });
      this._beforeUnload = (event) => {
        if (this._draft || this._featureDraft) {
          event.preventDefault();
          event.returnValue = "";
        }
      };
    }
    static getConfigElement() {
      return document.createElement("smart-heating-scheduler-card-editor");
    }
    static getStubConfig() {
      return { type: "custom:smart-heating-scheduler-card", title: "Heating Control", theme: "auto" };
    }
    getCardSize() {
      if (this._config?.layout === "mini") return 6;
      return this._view === "schedules" ? 12 : 10;
    }
    getGridOptions() {
      if (this._config?.layout === "mini") return { columns: 6, rows: "auto", min_columns: 3 };
      return { columns: 12, rows: "auto", min_columns: 3 };
    }
    setConfig(config) {
      if (this._dialDrag) {
        this._dialDrag = null;
        this._miniTarget = null;
      }
      if (config.layout && !["full", "mini"].includes(config.layout)) throw Error("Choose full or mini layout.");
      if (config.theme && !["auto", "dark", "light"].includes(config.theme)) throw Error("Choose auto, dark or light theme.");
      if (config.view && !VIEWS[config.view]) throw Error("Unknown heating view.");
      const changed = !this._config || config.entry_id !== this._config.entry_id || Boolean(config.demo) !== Boolean(this._config.demo);
      this._config = { ...config, title: config.title || (config.layout === "mini" ? "" : "Heating Control"), theme: config.theme || "auto" };
      if (changed) {
        this._stop();
        this._data = null;
        this._draft = null;
        this._featureDraft = null;
        this._profileName = null;
        this._history = [];
        this._dialog = null;
        this._view = config.view || "dashboard";
        if (config.demo === true) {
          this._data = demoSnapshot();
          for (const z of this._data.zones) {
            z.smart = defaultSmart();
            z.insights = demoInsights(z, this._data.generated_at);
          }
          resolveDemo(this);
          this._status = "demo";
          this._day = "mon";
        } else this._status = "waiting";
      }
      this._render();
      if (this.isConnected && changed) this._connect();
    }
    set hass(value) {
      const changed = this._hass?.connection !== value?.connection;
      this._hass = value;
      if (changed && this.isConnected) {
        this._stop();
        this._connect();
      }
      if (this._config?.theme === "auto") this._applyTheme();
    }
    connectedCallback() {
      window.addEventListener("beforeunload", this._beforeUnload);
      this._connect();
      this._render();
      if (typeof ResizeObserver !== "undefined") {
        this._resizeObserver = new ResizeObserver((entries) => {
          const width = Math.round(entries[0].contentRect.width);
          if (width !== this._chartContainerWidth) {
            this._chartContainerWidth = width;
            if (this._view === "heatingHistory") this._render();
          }
        });
        this._resizeObserver.observe(this);
      }
      this._clock = setInterval(() => {
        if (!this._draft && !this._dialog && !this.shadowRoot.activeElement?.matches("input,select") && !this._config?.demo) this._render();
      }, 6e4);
    }
    disconnectedCallback() {
      this._resizeObserver?.disconnect();
      this._dialDrag = null;
      this._miniTarget = null;
      this._stop();
      clearInterval(this._clock);
      window.removeEventListener("beforeunload", this._beforeUnload);
    }
    _stop() {
      this._generation++;
      clearTimeout(this._retry);
      if (this._unsub) {
        this._unsub();
        this._unsub = null;
      }
      this._connecting = false;
    }
    async _connect() {
      if (this._config?.demo || !this._config?.entry_id || !this._hass?.connection || this._unsub || this._connecting || !this.isConnected) return;
      const generation = this._generation;
      this._connecting = true;
      this._status = "connecting";
      this._render();
      try {
        const unsubscribe = await this._hass.connection.subscribeMessage((data) => {
          if (generation !== this._generation) return;
          if (!data.available) {
            this._status = "reconnecting";
            this._stop();
            this._scheduleRetry();
            this._render();
            return;
          }
          this._receive(data);
          this._retryDelay = 2e3;
        }, { type: `${DOMAIN}/subscribe`, entry_id: this._config.entry_id });
        if (generation !== this._generation || !this.isConnected) unsubscribe();
        else {
          this._unsub = unsubscribe;
          this._connecting = false;
        }
      } catch (error) {
        if (generation !== this._generation) return;
        this._connecting = false;
        this._status = "reconnecting";
        this._error = "Cannot connect to the scheduler. Check that the integration is loaded.";
        this._scheduleRetry();
        this._render();
      }
    }
    _scheduleRetry() {
      clearTimeout(this._retry);
      this._retry = setTimeout(() => this._connect(), this._retryDelay);
      this._retryDelay = Math.min(3e4, this._retryDelay * 2);
    }
    _receive(data) {
      try {
        if (data.schema_version !== 1 || !Array.isArray(data.zones)) throw Error("Unsupported scheduler API version.");
        for (const zone of data.zones) validateWeek(zone.week, zone.limits);
        if (this._draft && !data.zones.some((z) => z.id === this._zoneId)) throw Error("The edited zone is no longer available. Your draft has been kept.");
        this._data = data;
        this._status = "connected";
        if (!this._zoneId || !data.zones.some((z) => z.id === this._zoneId)) {
          if (this._draft) throw Error("The edited zone is no longer available. Copy any unsaved values before closing.");
          this._zoneId = data.zones[0]?.id;
        }
        if (this._draft && this._zone()?.revision !== this._revision) this._conflict = true;
        if (!this._draft) this._error = "";
      } catch (error) {
        this._error = error.message;
        this._status = "error";
      }
      this._render();
    }
    _zone() {
      return this._data?.zones.find((z) => z.id === this._zoneId) || this._data?.zones[0];
    }
    _week() {
      return this._draft || this._zone()?.week;
    }
    _canEdit() {
      return Boolean(this._data?.can_edit && ["connected", "demo"].includes(this._status) && (this._config.demo || this._hass?.connection?.connected !== false));
    }
    _now() {
      return this._config?.demo ? this._data.generated_at : (/* @__PURE__ */ new Date()).toISOString();
    }
    _local(iso = this._now()) {
      return localParts(iso, this._data?.timezone || "UTC");
    }
    _temp(value, unit = this._zone()?.unit || "\xB0C") {
      return typeof value === "number" && Number.isFinite(value) ? `${new Intl.NumberFormat(this._hass?.locale?.language || "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}${unit}` : "\u2014";
    }
    _formatTime(iso) {
      return iso ? this._local(iso).time : "\u2014";
    }
    _applyTheme() {
      const requested = this._config?.theme || "auto";
      const inherited = this._hass?.themes?.darkMode;
      this.setAttribute("theme", requested === "auto" && typeof inherited === "boolean" ? inherited ? "dark" : "light" : requested);
    }
    _guard(action) {
      if (this._saving) return;
      if (!this._draft && !this._featureDraft) {
        action();
        return;
      }
      this._pending = action;
      this._dialog = { kind: "discard" };
      this._focusDialog = true;
      this._render();
    }
    _selectZone(id) {
      this._featureDraft = null;
      this._zoneId = id;
      this._draft = null;
      this._history = [];
      this._error = "";
      this._conflict = false;
      this._render();
    }
    _mutate(week) {
      if (!this._canEdit() || this._saving) return;
      validateWeek(week, this._zone().limits);
      if (!this._draft) this._revision = this._zone().revision;
      this._history.push(clone(this._week()));
      this._history = this._history.slice(-20);
      this._draft = clone(week);
      this._message = "";
      this._error = "";
      this._render();
    }
    _openPeriod(day, index) {
      if (!this._canEdit()) return;
      this._view = "schedules";
      this._day = day;
      const periods = this._week()[day], period = periods[index];
      this._dialog = { kind: "period", day, index, edit: { ...period, temperature: String(period.temperature), end: periods[index + 1]?.start || "24:00" } };
      this._dialogError = "";
      this._focusDialog = true;
      this._render();
    }
    async _save() {
      if (!this._draft || !this._canEdit() || this._saving) return;
      this._saving = true;
      this._error = "";
      this._render();
      try {
        const zone = this._zone(), week = clone(this._draft);
        validateWeek(week, zone.limits);
        if (this._config.demo) {
          zone.week = week;
          zone.revision++;
          zone.proposed_target = week[this._local().day][periodIndex(week[this._local().day], this._local().minute)].temperature;
        } else {
          const snapshot = await this._hass.callWS({ type: `${DOMAIN}/save_schedule`, entry_id: this._config.entry_id, zone_id: zone.id, revision: this._revision, week });
          this._data = snapshot;
        }
        this._draft = null;
        this._history = [];
        this._conflict = false;
        this._message = this._config.demo ? "Saved to this demo only. Your heating is unchanged." : this._data.observe_only ? "Schedule saved in observe-only mode. Heating controls are unchanged." : "Schedule saved. Heating rules re-evaluated.";
      } catch (error) {
        this._error = error.code === "revision_conflict" ? "This schedule changed elsewhere. Your draft is safe. Load the latest version before trying again." : `Could not save. Your draft is safe. ${error.message || "Check the connection and try again."}`;
      } finally {
        this._saving = false;
        this._render();
      }
    }
    _action(action, data = {}) {
      if (action.startsWith("feature-")) {
        void this._featureAction(action.slice(8), data);
        return;
      }
      if (action === "occupancy-settings") {
        this._guard(() => {
          this._selectZone(data.zone);
          this._view = "settings";
          this._render();
        });
        return;
      }
      if (action.startsWith("smart-")) {
        void this._smartAction(action.slice(6), data);
        return;
      }
      if (action === "close") {
        this._holidayAcknowledged = false;
        this._pendingBoost = null;
      }
      if (action === "holiday-boost-confirm") {
        this._holidayAcknowledged = true;
        const zone = this._dialog.zone;
        this._dialog = null;
        void this._smartAction("boost-start", { zone });
        return;
      }
      if (action === "nav") this._guard(() => {
        this._view = data.view;
        this._draft = null;
        this._dialog = null;
        this._render();
      });
      if (action === "day") {
        this._day = data.day;
        this._render();
      }
      if (action === "zone") this._guard(() => this._selectZone(data.zone));
      if (action === "edit") this._openPeriod(data.day || this._day, Number(data.index));
      if (action === "more" && this._zoneFor(data.zone)?.climate_entity) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: this._zoneFor(data.zone).climate_entity }, bubbles: true, composed: true }));
      if (action === "schedule") this._guard(() => {
        this._selectZone(data.zone || this._zone()?.id);
        this._day = this._local().day;
        this._view = "schedules";
        this._render();
      });
      if (action === "close") {
        this._dialog = null;
        this._render();
      }
      if (action === "discard") {
        this._featureDraft = null;
        const pending = this._pending;
        this._draft = null;
        this._history = [];
        this._conflict = false;
        this._dialog = null;
        this._error = "";
        this._pending = null;
        if (pending) pending();
        else this._render();
      }
      if (action === "cancel-draft" || action === "latest") this._guard(() => {
        this._draft = null;
        this._history = [];
        this._conflict = false;
        this._dialog = null;
        this._error = "";
        this._render();
      });
      if (action === "save") void this._save();
      if (action === "undo" && this._history.length && !this._saving) {
        this._draft = this._history.pop();
        this._render();
      }
      if (action === "apply-period") {
        try {
          const dialog = this._dialog;
          if (dialog?.kind !== "period") return;
          const result = editPeriod(this._week(), dialog.day, dialog.index, dialog.edit, this._zone().limits);
          this._dialog = null;
          this._mutate(result);
        } catch (error) {
          this._dialogError = error.message;
          this._render();
        }
      }
      if (action === "split") {
        try {
          const week = addPeriod(this._week(), this._day, Number(data.index || 0), this._zone().limits);
          this._dialog = null;
          this._mutate(week);
        } catch (error) {
          this._error = error.message;
          this._render();
        }
      }
      if (action === "delete") {
        this._dialog = { kind: "delete", index: Number(data.index) };
        this._focusDialog = true;
        this._render();
      }
      if (action === "confirm-delete") {
        const index = this._dialog.index;
        this._dialog = null;
        this._mutate(deletePeriod(this._week(), this._day, index, this._zone().limits));
      }
      if (action === "copy-day") {
        this._copyDays = /* @__PURE__ */ new Set();
        this._dialog = { kind: "copy-day" };
        this._focusDialog = true;
        this._render();
      }
      if (action === "apply-copy-day") {
        this._dialog = null;
        this._mutate(copyDay(this._week(), this._day, [...this._copyDays], this._zone().limits));
      }
      if (action === "copy-week") {
        this._dialog = { kind: "copy-week" };
        this._focusDialog = true;
        this._render();
      }
      if (action === "apply-copy-week") {
        try {
          const sourceId = this.shadowRoot.querySelector("[data-field=copy-zone]").value;
          const week = clone(this._zoneFor(sourceId).week);
          validateWeek(week, this._zone().limits);
          this._dialog = null;
          this._mutate(week);
        } catch (error) {
          this._dialogError = error.message;
          this._render();
        }
      }
    }
    _zoneFor(id) {
      return this._data?.zones.find((z) => z.id === id);
    }
    _selector() {
      const zone = this._zone();
      return `<label class="zone-select">Heating zone<select data-action="zone-select" aria-label="Heating zone">${this._data.zones.map((z) => `<option value="${escapeHTML(z.id)}" ${z.id === zone.id ? "selected" : ""}>${escapeHTML(z.name)}</option>`).join("")}</select></label>`;
    }
    _timeline(periods, day, editable = false) {
      const baseline = Math.min(...periods.map((p) => p.temperature));
      return `<div class="timeline" aria-label="${escapeHTML(DAY_NAMES[DAYS.indexOf(day)])} temperature periods">${periods.map((period, index) => {
        const end = periods[index + 1]?.start || "24:00";
        const width = (minutes(end, true) - minutes(period.start)) / 1440 * 100;
        return `<button type="button" class="segment ${period.temperature > baseline ? "comfort" : ""}" style="flex:${width} 1 0" data-action="edit" data-day="${day}" data-index="${index}" ${editable && this._canEdit() ? "" : "disabled"} aria-label="${escapeHTML(`${period.label || "Period"} ${period.start} to ${end}, ${this._temp(period.temperature)}. ${editable && this._canEdit() ? "Edit period" : "Scheduled target"}`)}">${escapeHTML(this._temp(period.temperature))}</button>`;
      }).join("")}</div>`;
    }
    _zoneCard(zone) {
      const current = zone.current_temperature, fill = typeof current === "number" ? Math.max(0, Math.min(270, (current - zone.limits.minimum) / (zone.limits.maximum - zone.limits.minimum) * 270)) : 0;
      const heating = zone.hvac_action === "heating";
      return `<section class="panel zone-card ${heating ? "" : "idle"}" aria-label="${escapeHTML(zone.name)} thermostat">
      <div class="section-head"><h2><span class="zone-icon" aria-hidden="true">${zone.id === this._data.zones[0].id ? "\u2302" : "\u2668\uFE0E"}</span>${escapeHTML(zone.name)}</h2>${zone.climate_entity ? button("\u2197", "more", `data-zone="${escapeHTML(zone.id)}" aria-label="Open ${escapeHTML(zone.name)} native thermostat"`, "link-button") : ""}</div>
      <div class="source"><span class="dot" aria-hidden="true" style="color:var(${["error", "unavailable", "unsupported", "boost_unknown"].includes(zone.source) ? "--shs-error" : zone.source === "disabled" ? "--shs-muted" : "--shs-good"})"></span>${escapeHTML(SOURCES[zone.source] || zone.source)}${zone.error ? " \xB7 Check settings" : ""}</div>
      <div class="thermostat"><div class="ring" style="--fill:${fill}"><small>Current temperature</small><div class="reading">${typeof current === "number" ? escapeHTML(this._temp(current, "").trim()) : "\u2014"}<sup>${escapeHTML(zone.unit)}</sup></div><div class="demand">${heating ? "\u2668\uFE0E Reported heating" : zone.hvac_action === "idle" ? "Reported idle" : "Heating activity unknown"}</div></div>
      <div class="stat-stack"><div><small>Target on thermostat</small><div class="stat-value">${escapeHTML(this._temp(zone.device_target, zone.unit))}</div></div><div><small>Scheduler proposal</small><div class="next">${escapeHTML(this._temp(zone.proposed_target, zone.unit))}</div><small>Next evaluation ${escapeHTML(this._formatTime(zone.next_evaluation))}</small></div></div></div>
      ${this._featureSummary(zone)}${this._smartBoostControls(zone)}
      ${button("View schedule \u2192", "schedule", `data-zone="${escapeHTML(zone.id)}"`, "link-button")}
    </section>`;
    }
    _dashboard() {
      const zone = this._zone(), local = this._local();
      return `<div class="summary"><div><span>HEATING ZONES</span><b>${this._data.zones.length} configured</b></div><div><span>HOLIDAY</span><b>${this._data.zones.some((z) => z.smart?.holiday) ? "Planned" : "Inactive"}</b></div><div><span>SCHEDULER</span><b>${this._data.observe_only ? "Observe only" : "Controlling"}</b></div></div>
      <div class="zones">${this._data.zones.map((z) => this._zoneCard(z)).join("")}</div>
      <section class="panel"><div class="section-head"><div><div class="eyebrow">${escapeHTML(DAY_NAMES[DAYS.indexOf(local.day)])} \xB7 ${escapeHTML(local.time)}</div><h2>Today\u2019s schedule</h2></div>${this._selector()}</div>
      ${this._featureSummary(zone)}${this._occupancySummary(zone)}<div class="timeline-wrap">${this._timeline((zone.insights?.effective_week || zone.week)[local.day], local.day, false)}<div class="time-marker" style="left:${local.minute / 1440 * 100}%"><span style="transform:translateX(${local.minute < 60 ? 0 : local.minute > 1380 ? -100 : -50}%)">${escapeHTML(local.time)}</span></div></div><div class="ticks"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div><div class="legend"><span><i></i>Comfort target</span><span><i class="cool"></i>Setback target</span></div>${button("Edit today\u2019s periods \u2192", "schedule", `data-zone="${escapeHTML(zone.id)}"`, "link-button")}</section>
      <div class="bottom-grid"><section class="panel"><div class="scope">Selected zone</div><h2>Temporary occupancy</h2>${this._smartPresenceButtons()}<div class="fact-row"><span>Control source</span><b>${escapeHTML(SOURCES[zone.source] || zone.source)}</b></div><div class="fact-row"><span>Schedule target</span><b>${escapeHTML(this._temp((zone.insights?.effective_week || zone.week)[local.day][periodIndex((zone.insights?.effective_week || zone.week)[local.day], local.minute)].temperature))}</b></div></section>
      <section class="panel"><h2>Why this temperature?</h2><div class="reason"><b>${escapeHTML(SOURCES[zone.source] || zone.source)} \xB7 ${escapeHTML(this._temp(zone.proposed_target))}</b><p>${escapeHTML(zone.reason)}</p></div><small>${this._data.observe_only ? "This is the scheduler\u2019s proposed target. Existing controls still manage the heating." : "This scheduler controls the mapped thermostat. Manual Off and higher-priority overrides are respected."}</small></section></div>`;
    }
    _schedules() {
      const zone = this._zone(), week = this._week(), periods = week[this._day];
      const otherZones = this._data.zones.filter((z) => z.id !== zone.id && z.unit === zone.unit);
      return `<div class="zone-picker"><div><div class="eyebrow">Normal weekly schedule</div><h2>${escapeHTML(zone.name)}</h2><div class="status-caption">${this._canEdit() ? "Select a period to edit its time and temperature." : "Read-only schedule. Ask an administrator to make changes."}</div></div>${this._selector()}</div>
      <div class="toolbar" style="margin-bottom:16px">${button("Copy day", "copy-day", this._canEdit() ? "" : "disabled")}${button("Copy week from zone", "copy-week", otherZones.length && this._canEdit() ? "" : "disabled")}${button("Undo", "undo", this._history.length && !this._saving ? "" : "disabled")}</div>
      ${this._conflict ? `<div class="error" role="alert">This week changed elsewhere. Your unsaved draft has been kept. ${button("Load latest", "latest")}</div>` : ""}
      <div class="planner-layout"><section class="panel desktop-only"><div class="section-head"><h3>Seven-day overview</h3><small>${escapeHTML(zone.unit)}</small></div><div class="ticks" style="margin:0 0 10px 53px"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>${DAYS.map((day, index) => `<div class="week-row ${day === this._day ? "active" : ""}">${button(DAY_NAMES[index].slice(0, 3), "day", `data-day="${day}" aria-pressed="${day === this._day}"`)}<div>${this._timeline(week[day], day, true)}${this._occupancyBand(zone, day)}</div></div>`).join("")}<div class="legend"><span><i></i>Comfort</span><span><i class="cool"></i>Setback</span></div></section>
      <section class="panel"><div class="section-head"><h3>${escapeHTML(DAY_NAMES[DAYS.indexOf(this._day)])} periods</h3><small>${periods.length} periods</small></div><div class="days">${DAYS.map((day, index) => button(DAY_NAMES[index].slice(0, 3), "day", `data-day="${day}" aria-pressed="${day === this._day}"`, day === this._day ? "selected" : "")).join("")}</div>
      ${this._occupancySummary(zone, this._day)}<div class="period-list">${periods.map((period, index) => `<div class="period-row"><div><b>${escapeHTML(period.label || "Period " + (index + 1))}</b><p>${escapeHTML(period.start)} \u2013 ${escapeHTML(periods[index + 1]?.start || "24:00")}</p></div><span class="temp-pill ${period.temperature > Math.min(...periods.map((p) => p.temperature)) ? "warm" : ""}">${escapeHTML(this._temp(period.temperature))}</span>${button("\u270E", "edit", `data-index="${index}" aria-label="Edit ${escapeHTML(period.label || "period")} ${escapeHTML(period.start)}" ${this._canEdit() ? "" : "disabled"}`, "link-button")}</div>`).join("")}</div>
      <div class="toolbar" style="margin-top:14px">${button("+ Add period", "split", this._canEdit() ? "" : "disabled")}</div><div class="status-caption">New periods split the first block. Use \u201CSplit period\u201D when editing another block.</div></section></div>
      <div class="draft-bar"><span class="${this._draft ? "dirty" : "muted"}">${this._draft ? "\u25CF Unsaved changes" : "All changes saved"}${this._config.demo ? " \xB7 Demo only" : ""}</span><div class="toolbar">${button("Cancel", "cancel-draft", this._draft && !this._saving ? "" : "disabled")}${button(this._saving ? "Saving\u2026" : "Save changes", "save", this._draft && this._canEdit() && !this._saving ? "" : "disabled", "primary")}</div></div>${this._profilesPanel()}`;
    }
    _automation() {
      return this._smartAutomation();
    }
    _disclosure(key, title, body, caption = "") {
      const id = `${this._zone().id}:${key}`;
      return `<details class="settings-disclosure" data-disclosure="${escapeHTML(id)}" ${this._disclosures?.[id] ? "open" : ""}><summary><span><b>${escapeHTML(title)}</b>${caption ? `<small>${escapeHTML(caption)}</small>` : ""}</span><span class="disclosure-chevron" aria-hidden="true">\u2304</span></summary><div class="disclosure-body">${body}</div></details>`;
    }
    _addZoneShortcut() {
      if (!this._data?.can_edit) return "";
      return this._config.demo ? '<button type="button" disabled title="Available when connected to Home Assistant">+ Add heating zone</button>' : '<a class="shs-link add-zone-link" href="/config/integrations/integration/smart_heating_scheduler" target="_blank" rel="noopener">+ Add heating zone \u2197</a>';
    }
    _settings() {
      const z = this._zone();
      const zoneDetails = `<div class="fact-row"><span>Thermostat</span><b>${escapeHTML(z.climate_entity || "Sample thermostat")}</b></div><div class="fact-row"><span>Reviewed limits</span><b>${escapeHTML(this._temp(z.limits.minimum))} \u2013 ${escapeHTML(this._temp(z.limits.maximum))}</b></div><div class="fact-row"><span>Temperature step</span><b>${z.limits.step ? escapeHTML(this._temp(z.limits.step)) : "Not reported"}</b></div><div class="fact-row"><span>Manual temperature</span><b>${escapeHTML({ next_period: "Until next period", duration: `${z.manual_minutes} minutes`, until_resume: "Until resumed" }[z.manual_policy])}</b></div>${!this._config.demo && this._data.can_edit ? '<a class="shs-link" href="/config/integrations/integration/smart_heating_scheduler">Manage thermostat and limits \u2192</a>' : ""}`;
      const appearance = `<section class="panel"><h3>Card appearance</h3><label>Theme<select data-action="theme-select" aria-label="Card theme">${["auto", "dark", "light"].map((t) => `<option value="${t}" ${this._config.theme === t ? "selected" : ""}>${{ auto: "Follow Home Assistant", dark: "Dark", light: "Light" }[t]}</option>`).join("")}</select></label></section>`;
      return `<div class="zone-picker"><div><div class="eyebrow">Make this zone work for you</div><h2>Settings</h2></div><div class="zone-management">${this._selector()}${this._addZoneShortcut()}</div></div><p class="zone-help muted">Add a zone for each thermostat in Home Assistant, then choose it here.</p><div class="settings-stack">${this._disclosure("zone", "Zone settings", zoneDetails, `${z.name} \xB7 thermostat, limits and manual override`)}<div class="settings-section-title"><h3>Smart features</h3><p class="muted">Optional features for this zone. Open a feature to adjust its options.</p></div><div class="settings-grid">${this._occupancySettings()}${this._preheatSettings()}</div>${this._disclosure("advanced", "Advanced settings", `<div class="settings-grid">${this._smartSettings()}${appearance}</div>`, "Boost adapters, heating control mode and appearance")}</div>`;
    }
    _modal() {
      if (!this._dialog) return "";
      const dialog = this._dialog;
      let content = "", title = "";
      if (dialog.kind === "holiday-boost") {
        title = "Timed holiday exception";
        content = `<p>Start this timed boost during the holiday? The holiday target resumes when it ends.</p><div class="toolbar">${button("Cancel", "close")}${button("Start timed exception", "holiday-boost-confirm", "", "primary")}</div>`;
      } else if (dialog.kind === "reconcile") {
        title = "Confirm external boost restoration";
        content = `<p>Only confirm after checking that the stop script has finished restoring the receiver and the external timer is idle.</p><div class="toolbar">${button("Cancel", "close")}${button("Restoration completed", "smart-confirm-reconcile", "", "primary")}</div>`;
      } else if (dialog.kind === "period") {
        const { edit, index } = dialog, periods = this._week()[dialog.day], zone = this._zone();
        title = "Edit period";
        content = `<p>${escapeHTML(DAY_NAMES[DAYS.indexOf(dialog.day)])} \xB7 ${escapeHTML(zone.name)}</p><form><div class="form-grid"><label class="full">Period name<input data-field="label" maxlength="80" value="${escapeHTML(edit.label)}"></label><label>Start time<input data-field="start" aria-label="Start time" inputmode="numeric" value="${escapeHTML(edit.start)}" ${index === 0 ? "readonly" : ""}></label><label>End time<input data-field="end" aria-label="End time" inputmode="numeric" value="${escapeHTML(edit.end)}" ${index === periods.length - 1 ? "readonly" : ""}></label><label class="full">Target temperature (${escapeHTML(zone.unit)})<input type="number" data-field="temperature" aria-label="Target temperature" min="${zone.limits.minimum}" max="${zone.limits.maximum}" step="${zone.limits.step || "any"}" value="${escapeHTML(edit.temperature)}" required></label></div><div class="status-caption">Changing an end time also moves the next period\u2019s start.</div>${this._dialogError ? `<div class="error" role="alert">${escapeHTML(this._dialogError)}</div>` : ""}<div class="toolbar">${button("Split period", "split", `data-index="${index}"`)}${button("Delete", "delete", `data-index="${index}" ${index ? "" : "disabled"}`)}${button("Cancel", "close")}<button type="submit" class="primary">Apply period</button></div></form>`;
      } else if (dialog.kind === "discard") {
        title = "Unsaved changes";
        content = `<p>Keep editing, or discard your unsaved changes before leaving.</p><div class="toolbar">${button("Keep editing", "close")}${button("Discard changes", "discard", "", "primary")}</div>`;
      } else if (dialog.kind === "delete") {
        title = "Delete this period?";
        content = `<p>The previous period will extend to fill its time. Nothing changes until you save the week.</p><div class="toolbar">${button("Cancel", "close")}${button("Delete period", "confirm-delete", "", "primary")}</div>`;
      } else if (dialog.kind === "copy-day") {
        title = `Copy ${DAY_NAMES[DAYS.indexOf(this._day)]}`;
        content = `<p>Choose the days to replace in this draft.</p><div class="copy-days">${DAYS.map((day, i) => `<label class="check"><input type="checkbox" data-copy-day="${day}" ${day === this._day ? "disabled" : this._copyDays.has(day) ? "checked" : ""}>${escapeHTML(DAY_NAMES[i])}</label>`).join("")}</div><div class="toolbar">${button("Cancel", "close")}${button("Copy selected days", "apply-copy-day", "", "primary")}</div>`;
      } else if (dialog.kind === "copy-week") {
        title = "Copy an entire week";
        content = `<p>Replace this zone\u2019s draft with another zone\u2019s saved week. Temperatures must fit this zone\u2019s limits.</p><label>Copy from<select data-field="copy-zone">${this._data.zones.filter((z) => z.id !== this._zone().id && z.unit === this._zone().unit).map((z) => `<option value="${escapeHTML(z.id)}">${escapeHTML(z.name)}</option>`).join("")}</select></label>${this._dialogError ? `<div class="error" role="alert">${escapeHTML(this._dialogError)}</div>` : ""}<div class="toolbar">${button("Cancel", "close")}${button("Copy week", "apply-copy-week", "", "primary")}</div>`;
      }
      return `<div class="modal-shade"><section class="modal" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}"><div class="section-head"><h2>${escapeHTML(title)}</h2>${button("\xD7", "close", 'aria-label="Close dialog"', "link-button")}</div>${content}</section></div>`;
    }
    _trapFocus(event) {
      const controls = [...this.shadowRoot.querySelectorAll(".modal button:not(:disabled),.modal input:not(:disabled),.modal select")];
      if (!controls.length) return;
      const active = this.shadowRoot.activeElement, first = controls[0], last = controls.at(-1);
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    _render() {
      if (!this._config) return;
      if (this._dialDrag) return;
      this._applyTheme();
      this._disclosures ||= {};
      for (const details of this.shadowRoot.querySelectorAll("details[data-disclosure]")) this._disclosures[details.dataset.disclosure] = details.open;
      const active = this.shadowRoot.activeElement;
      const focus = active ? { action: active.dataset.action, field: active.dataset.field, index: active.dataset.index, day: active.dataset.day, view: active.dataset.view, zone: active.dataset.zone, aria: active.getAttribute("aria-label"), disclosure: active.closest("details[data-disclosure]")?.dataset.disclosure, tag: active.tagName } : null;
      if (this._dialog && active && !active.closest(".modal")) this._returnFocus = focus;
      const restoreFocus = !this._dialog && active?.closest(".modal") ? this._returnFocus : focus;
      let content = "";
      if (!this._data?.zones?.length) content = `<div class="empty"><div class="empty-icon" aria-hidden="true">\u2668\uFE0E</div><h2>${this._data ? "No heating zones available" : "Connect your scheduler"}</h2><p>${this._data ? "Add a heating zone below, or check your entity permissions." : "Choose the Smart Heating Scheduler entry in the card editor. Existing heating controls are unchanged."}</p>${this._status === "connecting" ? '<span class="badge">Connecting\u2026</span>' : ""}${this._data ? this._addZoneShortcut() : ""}</div>`;
      else {
        this._zoneId = this._zone().id;
        content = this[`_${this._view}`]();
      }
      this.shadowRoot.innerHTML = this._config.layout === "mini" && this._data?.zones?.length ? `<style>${styles}</style>${this._mini()}` : `<style>${styles}</style><div class="wrap"><div class="header"><div class="brand"><span class="brand-icon" aria-hidden="true">\u2668\uFE0E</span><div><h1>${escapeHTML(this._config.title)}</h1><p>Comfort, on your schedule.</p></div></div><span class="badge"><span class="dot" aria-hidden="true"></span>${this._config.demo ? "Design preview" : this._data?.observe_only === false ? "Heating control" : "Observe only"}</span></div><div class="preview-banner"><strong>${this._config.demo ? "Sample data" : this._data?.observe_only === false ? "Heating control enabled" : "Heating controls unchanged"}</strong> \xB7 ${this._config.demo ? "Disconnected from Home Assistant" : this._status === "connected" ? "Connected to scheduler" : this._status === "reconnecting" ? "Reconnecting\u2026" : "Waiting for scheduler"}</div><nav class="nav" aria-label="Heating views">${Object.entries(VIEWS).map(([key, [icon, name]]) => `<button type="button" data-action="nav" data-view="${key}" aria-current="${key === this._view ? "page" : "false"}"><span class="nav-icon" aria-hidden="true">${icon}</span><span class="nav-label">${name}</span><span class="nav-mobile-label">${{ dashboard: "Home", schedules: "Planner", automation: "Rules" }[key] || name}</span></button>`).join("")}</nav>${this._error ? `<div class="error" role="alert">${escapeHTML(this._error)}</div>` : ""}${this._message ? `<div class="success" role="status">${escapeHTML(this._message)}</div>` : ""}<main ${this._saving ? 'aria-busy="true"' : ""}>${content}</main></div>${this._modal()}`;
      if (this._dialog) {
        this.shadowRoot.querySelector(".wrap").inert = true;
        this.shadowRoot.querySelector(".wrap").setAttribute("aria-hidden", "true");
      }
      if (this._focusDialog) {
        this._focusDialog = false;
        queueMicrotask(() => (this.shadowRoot.querySelector(".modal input:not([readonly])") || this.shadowRoot.querySelector(".modal button"))?.focus());
      } else if (restoreFocus) {
        const f = restoreFocus;
        const element = [...this.shadowRoot.querySelectorAll("button,input,select,summary,[data-mini-dial]")].find((el) => el.tagName === f.tag && (f.tag !== "SUMMARY" || el.parentElement.dataset.disclosure === f.disclosure) && el.dataset.action === f.action && el.dataset.field === f.field && el.dataset.index === f.index && el.dataset.day === f.day && el.dataset.view === f.view && el.dataset.zone === f.zone && el.getAttribute("aria-label") === f.aria);
        element?.focus({ preventScroll: true });
      }
    }
  };
  Object.assign(SmartHeatingSchedulerCard.prototype, smartUI, occupancyUI, miniUI, insightsUI);
  var SmartHeatingSchedulerCardEditor = class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._entries = [];
      this.shadowRoot.addEventListener("change", (event) => {
        const key = event.target.dataset.config;
        if (!key) return;
        this._config = { ...this._config, [key]: event.target.value };
        if (key === "entry_id") {
          delete this._config.zone_id;
          this._zoneEntry = null;
        }
        this._loadZones();
        this._render();
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
      });
    }
    setConfig(config) {
      this._config = { ...config };
      this._loadZones();
      this._render();
    }
    _loadZones() {
      const id = this._config?.entry_id;
      if (!id || !this._hass || this._zoneEntry === id) return;
      this._zoneEntry = id;
      this._zones = [];
      this._hass.callWS({ type: `${DOMAIN}/dashboard`, entry_id: id }).then((data) => {
        if (this._zoneEntry === id) {
          this._zones = data.zones;
          this._render();
        }
      }).catch(() => {
        this._failure = true;
        this._render();
      });
    }
    set hass(value) {
      this._hass = value;
      this._loadZones();
      if (!this._loading) {
        this._loading = true;
        value.callWS({ type: `${DOMAIN}/list` }).then((entries) => {
          this._entries = entries;
          this._render();
        }).catch(() => {
          this._failure = true;
          this._render();
        });
      }
    }
    _render() {
      this.shadowRoot.innerHTML = `<style>${styles}</style><div class="editor"><label>Layout<select data-config="layout"><option value="full" ${this._config?.layout !== "mini" ? "selected" : ""}>Full scheduler</option><option value="mini" ${this._config?.layout === "mini" ? "selected" : ""}>Mini thermostat & boost</option></select></label><label>Scheduler<select data-config="entry_id"><option value="">Choose a scheduler</option>${this._entries.map((item) => `<option value="${escapeHTML(item.entry_id)}" ${this._config?.entry_id === item.entry_id ? "selected" : ""}>${escapeHTML(item.name)}</option>`).join("")}</select></label>${this._config?.layout === "mini" ? `<label>Heating zone<select data-config="zone_id"><option value="">First available zone</option>${(this._zones || []).map((z) => `<option value="${escapeHTML(z.id)}" ${this._config.zone_id === z.id ? "selected" : ""}>${escapeHTML(z.name)}</option>`).join("")}</select></label><label>Full scheduler dashboard path<input data-config="dashboard_path" value="${escapeHTML(this._config.dashboard_path || "")}" placeholder="/your-heating-dashboard"></label>` : ""}<label>Card title<input data-config="title" value="${escapeHTML(this._config?.title || "Heating Control")}"></label><label>Initial view<select data-config="view">${Object.entries(VIEWS).map(([key, [, name]]) => `<option value="${key}" ${(this._config?.view || "dashboard") === key ? "selected" : ""}>${name}</option>`).join("")}</select></label><label>Theme<select data-config="theme">${["auto", "dark", "light"].map((theme) => `<option value="${theme}" ${(this._config?.theme || "auto") === theme ? "selected" : ""}>${{ auto: "Follow Home Assistant", dark: "Dark", light: "Light" }[theme]}</option>`).join("")}</select></label>${this._failure ? '<p role="alert">Could not load schedulers. Check that the integration is available.</p>' : ""}</div>`;
    }
  };
  if (!customElements.get("smart-heating-scheduler-card")) customElements.define("smart-heating-scheduler-card", SmartHeatingSchedulerCard);
  if (!customElements.get("smart-heating-scheduler-card-editor")) customElements.define("smart-heating-scheduler-card-editor", SmartHeatingSchedulerCardEditor);
  window.customCards = window.customCards || [];
  if (!window.customCards.some((card) => card.type === "smart-heating-scheduler-card")) window.customCards.push({ type: "smart-heating-scheduler-card", name: "Smart Heating Scheduler", description: "Heating schedules, boost, occupancy, history and optional preheating", preview: true });
})();
