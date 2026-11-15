export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const clone = value => structuredClone(value);
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const timeText = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
export function remainingText(until, now) {
  const end=Date.parse(until), start=Date.parse(now);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return 'Remaining time unavailable';
  if (end <= start) return 'Waiting for boost controller';
  return `${Math.ceil((end-start)/60000)} min remaining`;
}
export function minutes(text, allowEnd = false) {
  if (allowEnd && text === '24:00') return 1440;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)) throw Error('Enter a 24-hour time, such as 06:30.');
  return Number(text.slice(0, 2)) * 60 + Number(text.slice(3));
}
export function validateWeek(week, limits) {
  if (!limits || !Number.isFinite(limits.minimum) || !Number.isFinite(limits.maximum) || limits.minimum >= limits.maximum || (limits.step != null && (!Number.isFinite(limits.step) || limits.step <= 0))) throw Error('Review this zone’s temperature limits.');
  if (!week || typeof week !== 'object' || Object.keys(week).sort().join() !== [...DAYS].sort().join()) throw Error('A schedule needs all seven days.');
  for (const day of DAYS) {
    const periods = week[day];
    if (!Array.isArray(periods) || periods.length < 1 || periods.length > 96) throw Error('Use 1–96 periods per day.');
    let previous = -1;
    for (const period of periods) {
      if (!period || Object.keys(period).some(k => !['start', 'temperature', 'label'].includes(k))) throw Error('Invalid period fields.');
      const start = minutes(period.start);
      if (start <= previous || (previous === -1 && start !== 0)) throw Error('Start at 00:00 and keep period times in order.');
      previous = start;
      const target = period.temperature;
      if (typeof target !== 'number' || !Number.isFinite(target) || target < limits.minimum || target > limits.maximum) throw Error(`Temperature must be between ${limits.minimum} and ${limits.maximum}.`);
      if (limits.step && Math.abs(target / limits.step - Math.round(target / limits.step)) > 0.000001) throw Error(`Use temperature increments of ${limits.step}.`);
      if (period.label !== undefined && (typeof period.label !== 'string' || period.label.length > 80)) throw Error('Labels can contain up to 80 characters.');
    }
  }
  return week;
}
export function editPeriod(week, day, index, edit, limits) {
  if (String(edit.temperature).trim() === '') throw Error('Enter a target temperature.');
  const result = clone(week), periods = result[day];
  const start = minutes(edit.start), end = minutes(edit.end, true);
  const previous = index ? minutes(periods[index - 1].start) : -1;
  const followingEnd = index + 2 < periods.length ? minutes(periods[index + 2].start) : 1440;
  if ((index === 0 && start !== 0) || start <= previous || end <= start || end > followingEnd || (index + 2 < periods.length && end === followingEnd)) throw Error('Keep this period within its neighbours and start the day at 00:00.');
  if (index === periods.length - 1 && end !== 1440) throw Error('The final period must end at 24:00.');
  if (index < periods.length - 1 && end === 1440) throw Error('Leave time for the following period.');
  periods[index] = {start: edit.start, temperature: Number(edit.temperature), label: edit.label};
  if (index < periods.length - 1) periods[index + 1].start = edit.end;
  return validateWeek(result, limits);
}
export function addPeriod(week, day, index, limits) {
  const result = clone(week), periods = result[day];
  if (periods.length >= 96) throw Error('This day already has 96 periods.');
  const start = minutes(periods[index].start), end = index + 1 < periods.length ? minutes(periods[index + 1].start) : 1440;
  if (end - start < 2) throw Error('This period is too short to split.');
  const middle = Math.floor((start + end) / 2);
  periods.splice(index + 1, 0, {start: timeText(middle), temperature: periods[index].temperature, label: 'New period'});
  return validateWeek(result, limits);
}
export function deletePeriod(week, day, index, limits) {
  if (!index) throw Error('The 00:00 baseline is required. Edit it instead.');
  const result = clone(week); result[day].splice(index, 1);
  return validateWeek(result, limits);
}
export function copyDay(week, from, targets, limits) {
  const result = clone(week);
  for (const day of targets) {
    if (!DAYS.includes(day)) throw Error('Choose a valid day.');
    result[day] = clone(week[from]);
  }
  return validateWeek(result, limits);
}
export function localParts(iso, timezone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone: timezone, weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).formatToParts(new Date(iso));
  const get = type => parts.find(p => p.type === type)?.value;
  return {day: get('weekday').slice(0, 3).toLowerCase(), minute: Number(get('hour')) * 60 + Number(get('minute')), time: `${get('hour')}:${get('minute')}`};
}
export function periodIndex(periods, minute) {
  return periods.findLastIndex(period => minutes(period.start) <= minute);
}
export function demoSnapshot() {
  const week = Object.fromEntries(DAYS.map(day => [day, [
    {start:'00:00', temperature:16, label:'Night'}, {start:'06:30', temperature:20, label:'Morning'},
    {start:'08:30', temperature:16, label:'Daytime'}, {start:'16:30', temperature:20, label:'Evening'},
    {start:'22:00', temperature:16, label:'Night'}]]));
  return {schema_version:1, entry_id:'demo', available:true, observe_only:true, can_edit:true,
    generated_at:'2026-11-16T08:25:00Z', timezone:'Europe/London', demo:true,
    zones:[['bedroom','Bedroom Heating',19.2,'heating'], ['lounge','Lounge Heating',18.6,'idle']].map(([id,name,current,hvac]) => ({
      id, name, unit:'°C', climate_entity:null, current_temperature:current, device_target:20,
      hvac_action:hvac, mode:'heat', limits:{minimum:16, maximum:28, step:0.5}, enabled:true,
      proposed_target:20, source:'schedule', reason:'Following the morning schedule',
      next_evaluation:'2026-11-16T08:30:00Z', revision:1, week:clone(week),
      manual_policy:'next_period', manual_minutes:120,
      boost:{owner:'none', active:false, until:null, can_start:false, can_cancel:false}}))};
}
