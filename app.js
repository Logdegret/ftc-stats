const KEY = 'hiveboard.entries.v1';
const $ = (id) => document.getElementById(id);
let entries = loadEntries();
let selectedDriver = 'all';
let selectedType = 'all';

function loadEntries() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value.filter(validEntry) : [];
  } catch { return []; }
}
function validEntry(entry) {
  return entry && typeof entry.driver === 'string' && typeof entry.match === 'string' &&
    (!entry.type || ['training','match'].includes(entry.type)) &&
    ['attempts','made','tips','retained'].every(k => Number.isInteger(entry[k]) && entry[k] >= 0 && entry[k] <= 999) &&
    entry.made <= entry.attempts;
}
function save() { localStorage.setItem(KEY, JSON.stringify(entries)); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function points(e) { return e.tips * 20 + e.retained * 2; }
function percent(made, attempts) { return attempts ? Math.round(made / attempts * 100) + '%' : '—'; }
function sum(list, key) { return list.reduce((total, e) => total + e[key], 0); }

function render() {
  const drivers = [...new Set(entries.map(e => e.driver))].sort((a,b) => a.localeCompare(b));
  if (selectedDriver !== 'all' && !drivers.includes(selectedDriver)) selectedDriver = 'all';
  $('driverFilter').innerHTML = '<option value="all">All drivers</option>' + drivers.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  $('driverFilter').value = selectedDriver;
  const visible = entries.filter(e => (selectedDriver === 'all' || e.driver === selectedDriver) && (selectedType === 'all' || (e.type || 'match') === selectedType));
  const attempts = sum(visible, 'attempts');
  const made = sum(visible, 'made');
  $('tipsTotal').textContent = sum(visible, 'tips').toLocaleString();
  $('madeTotal').textContent = made.toLocaleString();
  $('attemptFoot').textContent = `${attempts.toLocaleString()} shots attempted`;
  $('accuracyTotal').textContent = percent(made, attempts);
  $('pointsTotal').textContent = visible.reduce((total, e) => total + points(e), 0).toLocaleString();
  renderTrend(visible);
  renderBoard(visible);
  renderHistory(visible);
}

function renderTrend(list) {
  const recent = list.slice(-8);
  if (!recent.length) { $('trend').innerHTML = '<div class="empty-chart">Your trend will appear here after you log a session.</div>'; return; }
  const max = Math.max(1, ...recent.map(e => e.tips));
  $('trend').innerHTML = recent.map(e => `<div class="bar-wrap" title="${escapeHtml(e.match)} · ${e.tips} tips"><span class="bar-value">${e.tips}</span><div class="bar" style="height:${Math.max(3, e.tips / max * 112)}px"></div><span class="bar-label">${escapeHtml(e.match)}</span></div>`).join('');
}
function renderBoard(list) {
  const grouped = new Map();
  list.forEach(e => {
    const x = grouped.get(e.driver) || {tips:0,made:0,attempts:0};
    x.tips += e.tips; x.made += e.made; x.attempts += e.attempts;
    grouped.set(e.driver, x);
  });
  const rows = [...grouped].sort((a,b) => b[1].tips - a[1].tips || b[1].made - a[1].made || a[0].localeCompare(b[0]));
  $('driverBoard').innerHTML = rows.length ? rows.map(([name,x]) => `<div class="board-row"><span class="driver-name"><span class="avatar">${escapeHtml(name.slice(0,1).toUpperCase())}</span>${escapeHtml(name)}</span><span class="tips">${x.tips}</span><span>${percent(x.made,x.attempts)}</span></div>`).join('') : '<div class="empty-board">Add match entries to compare drivers.</div>';
}
function renderHistory(list) {
  $('recordCount').textContent = `${list.length} ${list.length === 1 ? 'ENTRY' : 'ENTRIES'}`;
  $('historyBody').innerHTML = list.length ? [...list].reverse().map(e => `<tr><td class="match-cell">${escapeHtml(e.match)}</td><td><span class="type-pill ${e.type === 'training' ? 'training' : ''}">${e.type === 'training' ? 'Training' : 'Match'}</span></td><td class="driver-cell">${escapeHtml(e.driver)}</td><td>${e.attempts}</td><td>${e.made}</td><td><span class="tip-pill">${e.tips}</span></td><td>${percent(e.made,e.attempts)}</td><td>${points(e)}</td><td><button class="delete-btn" type="button" data-delete="${escapeHtml(e.id)}" aria-label="Delete ${escapeHtml(e.match)} for ${escapeHtml(e.driver)}" title="Delete entry">×</button></td></tr>`).join('') : '<tr><td colspan="9" class="empty-table">No sessions yet. Log your first run above.</td></tr>';
}

$('matchForm').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const entry = { id: crypto.randomUUID(), type: String(data.get('type')), driver: String(data.get('driver') || '').trim(), match: String(data.get('match') || '').trim() };
  for (const key of ['attempts','made','tips','retained']) entry[key] = Number(data.get(key));
  if (!entry.driver || !entry.match || !validEntry(entry)) { $('formError').textContent = 'Enter a driver and session ID. Counts must be whole numbers from 0–999, and landed shots cannot exceed attempts.'; return; }
  $('formError').textContent = '';
  entries.push(entry); save(); render(); form.reset();
  $('history').scrollIntoView({behavior:'smooth',block:'start'});
});
$('driverFilter').addEventListener('change', e => { selectedDriver = e.target.value; render(); });
$('typeFilter').addEventListener('change', e => { selectedType = e.target.value; render(); });
$('entryType').addEventListener('change', e => { const match = e.target.value === 'match'; $('sessionIdLabel').textContent = match ? 'MATCH ID' : 'TRAINING SESSION ID'; $('sessionIdInput').placeholder = match ? 'e.g. Q12' : 'e.g. Practice 1'; });
$('historyBody').addEventListener('click', e => {
  const button = e.target.closest('[data-delete]');
  if (!button) return;
  if (!confirm('Delete this match entry?')) return;
  entries = entries.filter(x => x.id !== button.dataset.delete); save(); render();
});

function csvCell(v) { return '"' + String(v).replace(/"/g,'""') + '"'; }
$('exportBtn').addEventListener('click', () => {
  const headers = ['type','driver','match','attempts','made','tips','retained'];
  const csv = [headers.join(','), ...entries.map(e => headers.map(k => csvCell(e[k])).join(','))].join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  link.download = 'hiveboard-driver-stats.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (quoted) { if (c==='"' && text[i+1]==='"') {field+='"';i++;} else if (c==='"') quoted=false; else field+=c; }
    else if (c==='"') quoted=true;
    else if (c===',') {row.push(field);field='';}
    else if (c==='\n') {row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
    else field+=c;
  }
  if (quoted) throw new Error('Unclosed quoted field');
  if (field || row.length) {row.push(field.replace(/\r$/,''));rows.push(row);}
  return rows;
}
$('importInput').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const rows = parseCsv(await file.text());
    const headers = rows.shift()?.map(x => x.trim().replace(/^\uFEFF/,'')) || [];
    const required = ['driver','match','attempts','made','tips','retained'];
    if (!required.every(x => headers.includes(x))) throw new Error('Missing required columns');
    const imported = rows.filter(r => r.some(x => x.trim())).map(r => {
      const e = {id:crypto.randomUUID(),type:headers.includes('type') ? (r[headers.indexOf('type')]||'match').trim().toLowerCase() : 'match',driver:(r[headers.indexOf('driver')]||'').trim(),match:(r[headers.indexOf('match')]||'').trim()};
      for (const k of required.slice(2)) e[k] = Number(r[headers.indexOf(k)]);
      return e;
    });
    if (!imported.every(validEntry) || imported.some(x => !x.driver || !x.match)) throw new Error('Invalid match values');
    if (!confirm(`Import ${imported.length} entries? They will be added to your current data.`)) return;
    entries.push(...imported); save(); render();
  } catch { alert('Could not import that CSV. Use a Hiveboard export with valid whole-number counts.'); }
  e.target.value='';
});
render();

const SCOUT_KEY = 'hiveboard.scouting.v1';
const TEAM_API = 'https://api.ftcscout.org/rest/v1/teams/';
const onlineProfiles = new Map();
let lookupSequence = 0;
async function lookupTeam(number) {
  const team = String(number || '').trim();
  if (!/^\d{1,6}$/.test(team)) { $('lookupResult').textContent = 'Enter a numeric FTC team number.'; return; }
  $('lookupNumber').value = team;
  const sequence = ++lookupSequence;
  $('lookupBtn').disabled = true;
  $('lookupResult').textContent = `Looking up team #${team}…`;
  try {
    let profile = onlineProfiles.get(team);
    if (!profile) {
      const response = await fetch(TEAM_API + team, {signal:AbortSignal.timeout(10000)});
      if (response.status === 404) throw new Error('not-found');
      if (!response.ok) throw new Error('unavailable');
      profile = await response.json();
      if (Number(profile.number) !== Number(team) || typeof profile.name !== 'string') throw new Error('unavailable');
      onlineProfiles.set(team, profile);
    }
    let stats = null;
    try {
      const response = await fetch(`${TEAM_API}${team}/quick-stats?season=2026`, {signal:AbortSignal.timeout(10000)});
      if (response.ok) stats = await response.json();
    } catch { /* Team profile remains useful when stats are unavailable. */ }
    if (sequence !== lookupSequence) return;
    const location = [profile.city, profile.state, profile.country].filter(Boolean).join(', ');
    const opr = Number(stats?.tot?.value);
    const rank = Number(stats?.tot?.rank);
    $('lookupResult').innerHTML = `<div class="lookup-record"><div><div class="lookup-name">#${escapeHtml(team)} · ${escapeHtml(profile.name)}</div><div class="lookup-meta">${escapeHtml(location || 'Location not listed')}${profile.rookieYear ? ` · Rookie year ${escapeHtml(profile.rookieYear)}` : ''}</div>${profile.schoolName ? `<div class="lookup-meta">${escapeHtml(profile.schoolName)}</div>` : ''}</div><div class="lookup-season"><span>2026–27 SEASON</span><strong>${Number.isFinite(opr) ? `${opr.toFixed(1)} OPR` : 'No results yet'}</strong>${Number.isInteger(rank) && rank > 0 ? `<small>World rank #${rank.toLocaleString()}</small>` : ''}</div></div><div class="lookup-links"><a href="https://ftcscout.org/teams/${team}" target="_blank" rel="noopener noreferrer">Full team record ↗</a><button type="button" id="useLookupTeam">Use in scouting form ↓</button></div>`;
    renderScouting();
  } catch (error) {
    if (sequence !== lookupSequence) return;
    $('lookupResult').textContent = error.message === 'not-found' ? `No online record found for team #${team}. You can still enter scouting notes manually.` : 'Team records are temporarily unavailable. Try again later; manual scouting still works.';
  } finally { if (sequence === lookupSequence) $('lookupBtn').disabled = false; }
}
$('lookupBtn').addEventListener('click', () => lookupTeam($('lookupNumber').value));
$('lookupNumber').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); lookupTeam(event.currentTarget.value); } });
$('lookupResult').addEventListener('click', event => { if (event.target.id !== 'useLookupTeam') return; $('scoutForm').elements.team.value = $('lookupNumber').value; $('scoutForm').scrollIntoView({behavior:'smooth',block:'start'}); });
$('scoutForm').elements.team.addEventListener('blur', event => { if (/^\d{1,6}$/.test(event.target.value.trim())) lookupTeam(event.target.value); });
let observations = (() => { try { const v = JSON.parse(localStorage.getItem(SCOUT_KEY) || '[]'); return Array.isArray(v) ? v.filter(validObservation) : []; } catch { return []; } })();
function validObservation(o) {
  return o && /^\d{1,6}$/.test(o.team) && typeof o.round === 'string' && o.round.trim() &&
    ['attempts','made','tips'].every(k => Number.isInteger(o[k]) && o[k] >= 0 && o[k] <= 999) &&
    o.made <= o.attempts && Number.isInteger(o.reliability) && o.reliability >= 1 && o.reliability <= 5 && typeof o.notes === 'string';
}
function saveScouting() { localStorage.setItem(SCOUT_KEY, JSON.stringify(observations)); }
function renderScouting() {
  const grouped = new Map();
  observations.forEach(o => {
    const x = grouped.get(o.team) || {runs:0,tips:0,made:0,attempts:0};
    x.runs++; x.tips += o.tips; x.made += o.made; x.attempts += o.attempts;
    grouped.set(o.team,x);
  });
  const ranked = [...grouped].sort((a,b) => b[1].tips/b[1].runs - a[1].tips/a[1].runs || (b[1].attempts ? b[1].made/b[1].attempts : 0) - (a[1].attempts ? a[1].made/a[1].attempts : 0));
  $('scoutBoard').innerHTML = ranked.length ? ranked.map(([team,x]) => { const name = onlineProfiles.get(team)?.name || observations.find(o => o.team === team && o.teamName)?.teamName; return `<div class="scout-board-row"><a class="scout-team-link" href="https://ftcscout.org/teams/${escapeHtml(team)}" target="_blank" rel="noopener noreferrer">#${escapeHtml(team)}${name ? `<small>${escapeHtml(name)}</small>` : ''}</a><span>${x.runs}</span><span>${(x.tips/x.runs).toFixed(1)}</span><span>${percent(x.made,x.attempts)}</span></div>`; }).join('') : '<div class="empty-board">Your scouted teams will appear here.</div>';
  $('scoutCount').textContent = `${observations.length} ${observations.length === 1 ? 'OBSERVATION' : 'OBSERVATIONS'}`;
  $('scoutHistory').innerHTML = observations.length ? [...observations].reverse().map(o => `<tr><td class="match-cell"><a href="https://ftcscout.org/teams/${escapeHtml(o.team)}" target="_blank" rel="noopener noreferrer">#${escapeHtml(o.team)}</a></td><td>${escapeHtml(o.round)}</td><td>${o.attempts}</td><td>${o.made}</td><td><span class="tip-pill">${o.tips}</span></td><td>${percent(o.made,o.attempts)}</td><td>${o.reliability}/5</td><td class="notes-cell">${escapeHtml(o.notes || '—')}</td><td><button class="delete-btn" type="button" data-scout-delete="${escapeHtml(o.id)}" aria-label="Delete scouting observation for team ${escapeHtml(o.team)}" title="Delete observation">×</button></td></tr>`).join('') : '<tr><td colspan="9" class="empty-table">No scouting observations yet.</td></tr>';
}
$('scoutForm').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget, data = new FormData(form);
  const team = String(data.get('team')||'').trim();
  const o = {id:crypto.randomUUID(),team,teamName:onlineProfiles.get(team)?.name || '',round:String(data.get('round')||'').trim(),attempts:Number(data.get('attempts')),made:Number(data.get('made')),tips:Number(data.get('tips')),reliability:Number(data.get('reliability')),notes:String(data.get('notes')||'').trim()};
  if (!validObservation(o)) { $('scoutError').textContent = 'Enter a team number and run ID. Counts must be whole numbers from 0–999, and landed shots cannot exceed attempts.'; return; }
  $('scoutError').textContent = ''; observations.push(o); saveScouting(); renderScouting(); form.reset();
});
$('scoutHistory').addEventListener('click', event => {
  const button = event.target.closest('[data-scout-delete]'); if (!button) return;
  if (!confirm('Delete this scouting observation?')) return;
  observations = observations.filter(o => o.id !== button.dataset.scoutDelete); saveScouting(); renderScouting();
});
$('exportScoutBtn').addEventListener('click', () => {
  const headers = ['team','teamName','round','attempts','made','tips','reliability','notes'];
  const csv = [headers.join(','), ...observations.map(o => headers.map(k => csvCell(o[k])).join(','))].join('\r\n');
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  link.download = 'hiveboard-scouting.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href),1000);
});
renderScouting();
