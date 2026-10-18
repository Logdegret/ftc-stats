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
    (!entry.role || ['driver','shooter','both'].includes(entry.role)) &&
    ['attempts','made','tips','retained'].every(k => Number.isInteger(entry[k]) && entry[k] >= 0 && entry[k] <= 999) &&
    entry.made <= entry.attempts;
}
function save() { localStorage.setItem(KEY, JSON.stringify(entries)); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function points(e) { return e.tips * 20 + e.retained * 2; }
function percent(made, attempts) { return attempts ? Math.round(made / attempts * 100) + '%' : '—'; }
function sum(list, key) { return list.reduce((total, e) => total + e[key], 0); }
function groupSessions(list) {
  const groups = new Map();
  list.forEach(e => {
    const key = e.groupId || e.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });
  return [...groups.values()];
}

function render() {
  const drivers = [...new Set(entries.map(e => e.driver))].sort((a,b) => a.localeCompare(b));
  if (selectedDriver !== 'all' && !drivers.includes(selectedDriver)) selectedDriver = 'all';
  $('driverFilter').innerHTML = '<option value="all">All drivers</option>' + drivers.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  $('driverFilter').value = selectedDriver;
  $('driverNames').innerHTML = drivers.map(d => `<option value="${escapeHtml(d)}"></option>`).join('');
  const visible = entries.filter(e => (selectedDriver === 'all' || e.driver === selectedDriver) && (selectedType === 'all' || (e.type || 'match') === selectedType));
  const attempts = sum(visible, 'attempts');
  const made = sum(visible, 'made');
  $('tipsTotal').textContent = sum(visible, 'tips').toLocaleString();
  $('madeTotal').textContent = made.toLocaleString();
  $('attemptFoot').textContent = `${attempts.toLocaleString()} shots attempted`;
  $('accuracyTotal').textContent = percent(made, attempts);
  $('pointsTotal').textContent = visible.reduce((total, e) => total + points(e), 0).toLocaleString();
  renderTrend(visible);
  renderDriverPairs(entries.filter(e => selectedType === 'all' || (e.type || 'match') === selectedType));
  renderHistory(visible);
}

function renderTrend(list) {
  const recent = groupSessions(list).slice(-8).map(group => ({match:group[0].match,tips:sum(group,'tips')}));
  if (!recent.length) { $('trend').innerHTML = '<div class="empty-chart">Your trend will appear here after you log a session.</div>'; return; }
  const max = Math.max(1, ...recent.map(e => e.tips));
  $('trend').innerHTML = recent.map(e => `<div class="bar-wrap" title="${escapeHtml(e.match)} · ${e.tips} tips"><span class="bar-value">${e.tips}</span><div class="bar" style="height:${Math.max(3, e.tips / max * 112)}px"></div><span class="bar-label">${escapeHtml(e.match)}</span></div>`).join('');
}
function renderDriverPairs(list) {
  const byDriver = new Map();
  list.forEach(e => {
    const record = byDriver.get(e.driver) || {name:e.driver,runs:0,points:0,attempts:0,made:0};
    record.runs++;
    record.points += points(e);
    record.attempts += e.attempts;
    record.made += e.made;
    byDriver.set(e.driver,record);
  });
  const drivers = [...byDriver.values()].sort((a,b) => a.name.localeCompare(b.name));
  const pairs = [];
  for (let i = 0; i < drivers.length; i++) for (let j = i + 1; j < drivers.length; j++) {
    const a = drivers[i], b = drivers[j];
    const expectedPoints = a.points/a.runs + b.points/b.runs;
    const expectedAttempts = a.attempts/a.runs + b.attempts/b.runs;
    const expectedMade = a.made/a.runs + b.made/b.runs;
    pairs.push({a,b,expectedPoints,efficiency:expectedAttempts ? expectedPoints/expectedAttempts : null,accuracy:expectedAttempts ? expectedMade/expectedAttempts : null});
  }
  const pairName = pair => `${pair.a.name} + ${pair.b.name}`;
  const pointsOrder = [...pairs].sort((a,b) => b.expectedPoints-a.expectedPoints || pairName(a).localeCompare(pairName(b)));
  const efficiencyOrder = [...pairs].filter(p => p.efficiency !== null).sort((a,b) => b.efficiency-a.efficiency || b.expectedPoints-a.expectedPoints || pairName(a).localeCompare(pairName(b)));
  const bestPoints = pointsOrder[0];
  const bestEfficiency = efficiencyOrder[0];
  $('pairCount').textContent = `${pairs.length} ${pairs.length === 1 ? 'PAIR' : 'PAIRS'}`;
  const metric = (label,value) => `<div class="pair-metric"><span>${label}</span><strong>${value}</strong></div>`;
  if (!bestPoints) $('pairSummary').innerHTML = '<div class="empty-board">Log two drivers to compare them.</div>';
  else if (pairs.length === 1) $('pairSummary').innerHTML = `<div class="pair-title"><span>YOUR DRIVER PAIR</span><strong>${escapeHtml(pairName(bestPoints))}</strong></div><div class="pair-metrics">${metric('POINTS / RUN',bestPoints.expectedPoints.toFixed(1))}${metric('POINTS / SHOT',bestPoints.efficiency === null ? '—' : bestPoints.efficiency.toFixed(2))}${metric('ACCURACY',bestPoints.accuracy === null ? '—' : `${Math.round(bestPoints.accuracy*100)}%`)}</div>`;
  else $('pairSummary').innerHTML = `<div class="pair-winner"><span>MAX POINTS</span><strong>${escapeHtml(pairName(bestPoints))}</strong><small>${bestPoints.expectedPoints.toFixed(1)} points / run</small></div><div class="pair-winner"><span>MAX EFFICIENCY</span><strong>${bestEfficiency ? escapeHtml(pairName(bestEfficiency)) : '—'}</strong><small>${bestEfficiency ? `${bestEfficiency.efficiency.toFixed(2)} points / shot` : 'No shots logged'}</small></div>`;
  $('pairTable').hidden = pairs.length < 2;
  $('pairBoard').innerHTML = pairs.length > 1 ? pointsOrder.map(pair => `<div class="pair-row"><span><strong>${escapeHtml(pairName(pair))}</strong></span><span>${pair.expectedPoints.toFixed(1)}</span><span>${pair.efficiency === null ? '—' : pair.efficiency.toFixed(2)}</span><span>${pair.accuracy === null ? '—' : `${Math.round(pair.accuracy*100)}%`}</span></div>`).join('') : '';
}
function renderHistory(list) {
  const sessions = groupSessions(list);
  $('recordCount').textContent = `${sessions.length} ${sessions.length === 1 ? 'SESSION' : 'SESSIONS'}`;
  $('historyBody').innerHTML = sessions.length ? sessions.reverse().map(group => {
    const e = group[0], attempts = sum(group,'attempts'), made = sum(group,'made');
    const names = group.map(x => `${escapeHtml(x.driver)}${x.role ? `<span class="role-pill ${escapeHtml(x.role)}">${escapeHtml(x.role[0].toUpperCase() + x.role.slice(1))}</span>` : ''}`).join('<br>');
    const totalPoints = group.reduce((total,x) => total + points(x),0);
    const key = e.groupId || e.id;
    return `<tr><td class="match-cell">${escapeHtml(e.match)}</td><td><span class="type-pill ${e.type === 'training' ? 'training' : ''}">${e.type === 'training' ? 'Training' : 'Match'}</span></td><td class="driver-cell">${names}</td><td>${attempts}</td><td>${made}</td><td><span class="tip-pill">${sum(group,'tips')}</span></td><td>${percent(made,attempts)}</td><td>${totalPoints}</td><td><button class="delete-btn" type="button" data-delete="${escapeHtml(key)}" aria-label="Delete session ${escapeHtml(e.match)}" title="Delete session">×</button></td></tr>`;
  }).join('') : '<tr><td colspan="9" class="empty-table">No sessions yet. Log your first run above.</td></tr>';
}

$('matchForm').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const groupId = crypto.randomUUID();
  const type = String(data.get('type'));
  const match = String(data.get('match') || '').trim();
  const newEntries = [1,2].map(number => {
    const entry = {id:crypto.randomUUID(),groupId,type,match,driver:String(data.get(`driver${number}`) || '').trim(),role:String(data.get(`role${number}`) || '')};
    for (const key of ['attempts','made','tips','retained']) entry[key] = Number(data.get(`${key}${number}`));
    return entry;
  });
  if (!match || newEntries.some(e => !e.driver || !validEntry(e))) { $('formError').textContent = 'Enter both driver names and a session ID. Counts must be whole numbers from 0–999, and landed shots cannot exceed attempts.'; return; }
  if (newEntries[0].driver.toLowerCase() === newEntries[1].driver.toLowerCase()) { $('formError').textContent = 'Choose two different drivers.'; return; }
  $('formError').textContent = '';
  entries.push(...newEntries); save(); render(); form.reset();
  $('history').scrollIntoView({behavior:'smooth',block:'start'});
});
$('driverFilter').addEventListener('change', e => { selectedDriver = e.target.value; render(); });
$('typeFilter').addEventListener('change', e => { selectedType = e.target.value; render(); });
$('entryType').addEventListener('change', e => { const match = e.target.value === 'match'; $('sessionIdLabel').textContent = match ? 'MATCH ID' : 'TRAINING SESSION ID'; $('sessionIdInput').placeholder = match ? 'e.g. Q12' : 'e.g. Practice 1'; });
$('historyBody').addEventListener('click', e => {
  const button = e.target.closest('[data-delete]');
  if (!button) return;
  if (!confirm('Delete this session and its driver records?')) return;
  entries = entries.filter(x => (x.groupId || x.id) !== button.dataset.delete); save(); render();
});

function csvCell(v) { return '"' + String(v).replace(/"/g,'""') + '"'; }
$('exportBtn').addEventListener('click', () => {
  const headers = ['type','driver','role','match','attempts','made','tips','retained','groupId'];
  const csv = [headers.join(','), ...entries.map(e => headers.map(k => csvCell(e[k] ?? '')).join(','))].join('\r\n');
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
    const importedGroups = new Map();
    const imported = rows.filter(r => r.some(x => x.trim())).map(r => {
      const e = {id:crypto.randomUUID(),type:headers.includes('type') ? (r[headers.indexOf('type')]||'match').trim().toLowerCase() : 'match',driver:(r[headers.indexOf('driver')]||'').trim(),role:headers.includes('role') ? (r[headers.indexOf('role')]||'').trim().toLowerCase() : '',match:(r[headers.indexOf('match')]||'').trim()};
      for (const k of required.slice(2)) e[k] = Number(r[headers.indexOf(k)]);
      const oldGroup = headers.includes('groupId') ? (r[headers.indexOf('groupId')]||'').trim() : '';
      if (oldGroup) { const groupKey = `${oldGroup}:${e.type}:${e.match}`; if (!importedGroups.has(groupKey)) importedGroups.set(groupKey,crypto.randomUUID()); e.groupId = importedGroups.get(groupKey); }
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
const GRAPHQL_API = 'https://api.ftcscout.org/graphql';
const CURRENT_SEASON = 2026;
const SEASON_GAMES = {2019:'Skystone',2020:'Ultimate Goal',2021:'Freight Frenzy',2022:'Power Play',2023:'Centerstage',2024:'Into the Deep',2025:'DECODE',2026:'BIOBUZZ'};
const onlineProfiles = new Map();
const onlineHistories = new Map();
let lookupSequence = 0;
function seasonLabel(year) { return `${year}–${String(year + 1).slice(-2)}${SEASON_GAMES[year] ? ` · ${SEASON_GAMES[year]}` : ''}`; }
function rankPercentile(stat, count) {
  const rank = Number(stat?.rank);
  return Number.isInteger(rank) && Number.isInteger(count) && count > 1 && rank > 0 ? Math.max(0,Math.min(100,Math.round((count-rank)/(count-1)*100))) : null;
}
function percentileLabel(value) {
  if (value === null) return '—';
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? 'th' : ({1:'st',2:'nd',3:'rd'}[value % 10] || 'th');
  return `${value}${suffix} %ile`;
}
async function graphQuery(query) {
  const url = `${GRAPHQL_API}?${new URLSearchParams({query})}`;
  const response = await fetch(url, {headers:{'apollo-require-preflight':'true'},signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error('history-unavailable');
  const json = await response.json();
  if (json.errors?.length) throw new Error('history-unavailable');
  return json.data?.teamByNumber;
}
async function fetchTeamHistory(team) {
  const info = await graphQuery(`query { teamByNumber(number:${Number(team)}) { activeSeasons } }`);
  const active = [...new Set((info?.activeSeasons || []).filter(y => Number.isInteger(y) && y <= CURRENT_SEASON))].sort((a,b) => b-a);
  if (!active.length) return {rows:[],active};
  const fields = active.map(year => `s${year}:quickStats(season:${year}){season count tot{value rank} auto{value rank} dc{value rank}}`).join(' ');
  const data = await graphQuery(`query { teamByNumber(number:${Number(team)}) { ${fields} } }`);
  if (!data) throw new Error('history-unavailable');
  const rows = active.map(year => data[`s${year}`]).filter(Boolean).sort((a,b) => b.season-a.season);
  return {rows,active};
}
function partnerOutlook(team, history) {
  const rows = history?.rows || [];
  const local = observations.filter(o => o.team === team);
  const graded = rows.map(row => ({season:row.season,percentile:rankPercentile(row.tot,row.count)})).filter(row => row.percentile !== null);
  const weight = year => Math.pow(0.72,Math.max(0,CURRENT_SEASON-year));
  const denominator = graded.reduce((n,row) => n+weight(row.season),0);
  const historical = denominator ? Math.round(graded.reduce((n,row) => n+row.percentile*weight(row.season),0)/denominator) : null;
  const reliability = local.length ? local.reduce((n,o) => n+o.reliability,0)/local.length : null;
  const latest = graded[0];
  let title, tone, reason;
  if (history?.unavailable) { title='History unavailable'; tone='neutral'; reason='The online season history could not load. Retry before making a partner decision.'; }
  else if (historical === null && local.length < 2) { title='Need more evidence'; tone='neutral'; reason='There are no ranked seasons to compare. Scout this season’s robot before choosing an alliance partner.'; }
  else if (local.length >= 2 && reliability < 2.5) { title='Hold for reliability'; tone='caution'; reason='Your scouting notes show repeated reliability issues, even if past scoring was strong.'; }
  else if (historical !== null && historical >= 75 && (latest.season >= CURRENT_SEASON-1 || (local.length >= 2 && reliability >= 4))) { title='Strong candidate'; tone='positive'; reason='Recent season rankings are strong. Check this season’s robot and role fit before committing.'; }
  else if (historical !== null && historical >= 65) { title='Promising history'; tone='positive'; reason='Past rankings look competitive. Current-season scouting should confirm the fit.'; }
  else if (historical !== null && historical >= 50) { title='Consider after scouting'; tone='neutral'; reason='Historical results are mixed. Compare their current robot with your alliance needs.'; }
  else if (historical !== null) { title='Lower priority from history'; tone='caution'; reason='Historical rankings are below the field midpoint. Look for clear current-season improvement.'; }
  else if (reliability >= 4) { title='Promising locally'; tone='positive'; reason='Your scouting notes are favorable, but online ranked history is unavailable.'; }
  else { title='Need more scouting'; tone='neutral'; reason='Local observations alone do not yet support a confident partner call.'; }
  const chips = [`${graded.length} ranked ${graded.length === 1 ? 'season' : 'seasons'}`];
  if (historical !== null) chips.push(`${percentileLabel(historical)} weighted`);
  if (latest) chips.push(`${latest.season} season: ${percentileLabel(latest.percentile)}`);
  if (reliability !== null) chips.push(`${local.length} local reports · ${reliability.toFixed(1)}/5 reliability`);
  if (local.length) chips.push(`${(local.reduce((n,o) => n+o.tips,0)/local.length).toFixed(1)} avg tips · ${percent(local.reduce((n,o) => n+o.made,0),local.reduce((n,o) => n+o.attempts,0))} shots`);
  return `<div class="partner-outlook ${tone}"><div class="partner-kicker">PARTNER OUTLOOK · PRELIMINARY</div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(reason)}</p><div class="partner-chips">${chips.map(chip => `<span>${escapeHtml(chip)}</span>`).join('')}</div></div>`;
}
function renderLookup(team) {
  const profile = onlineProfiles.get(team);
  if (!profile) return;
  const history = onlineHistories.get(team);
  const current = history?.rows.find(row => row.season === CURRENT_SEASON);
  const opr = Number(current?.tot?.value);
  const rank = Number(current?.tot?.rank);
  const location = [profile.city,profile.state,profile.country].filter(Boolean).join(', ');
  const rows = history?.rows || [];
  const historyHtml = history?.unavailable ? '<p class="history-message">Online season history is temporarily unavailable.</p>' : rows.length ? `<div class="history-scroll"><table class="season-table"><thead><tr><th>PAST GAME</th><th>WORLD RANK</th><th>OVERALL</th><th>AUTO</th><th>TELEOP</th></tr></thead><tbody>${rows.map(row => `<tr><td><strong>${escapeHtml(seasonLabel(row.season))}</strong></td><td>#${Number(row.tot.rank).toLocaleString()} of ${Number(row.count).toLocaleString()}</td><td>${percentileLabel(rankPercentile(row.tot,row.count))}</td><td>${percentileLabel(rankPercentile(row.auto,row.count))}</td><td>${percentileLabel(rankPercentile(row.dc,row.count))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="history-message">No ranked past-season data is available for this team yet.</p>';
  $('lookupResult').innerHTML = `<div class="lookup-record"><div><div class="lookup-name">#${escapeHtml(team)} · ${escapeHtml(profile.name)}</div><div class="lookup-meta">${escapeHtml(location || 'Location not listed')}${profile.rookieYear ? ` · Rookie year ${escapeHtml(profile.rookieYear)}` : ''}</div>${profile.schoolName ? `<div class="lookup-meta">${escapeHtml(profile.schoolName)}</div>` : ''}</div><div class="lookup-season"><span>2026–27 SEASON</span><strong>${Number.isFinite(opr) ? `${opr.toFixed(1)} OPR` : 'No results yet'}</strong>${Number.isInteger(rank) && rank > 0 ? `<small>World rank #${rank.toLocaleString()}</small>` : ''}</div></div>${partnerOutlook(team,history)}<div class="season-history-heading"><strong>Season history</strong><span>Rank percentiles compare within each game</span></div>${historyHtml}<div class="lookup-links"><a href="https://ftcscout.org/teams/${team}" target="_blank" rel="noopener noreferrer">Full team record ↗</a><button type="button" id="useLookupTeam">Use in scouting form ↓</button></div>`;
}
async function lookupTeam(number) {
  const team = String(number || '').trim();
  if (!/^\d{1,6}$/.test(team)) { $('lookupResult').textContent = 'Enter a numeric FTC team number.'; return; }
  $('lookupNumber').value = team;
  const sequence = ++lookupSequence;
  $('lookupBtn').disabled = true;
  $('lookupResult').textContent = `Looking up team #${team} and its past seasons…`;
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
    let history = onlineHistories.get(team);
    if (!history || Date.now()-history.fetchedAt > 300000) {
      try { history = {...await fetchTeamHistory(team),fetchedAt:Date.now()}; }
      catch { history = {rows:[],active:[],unavailable:true,fetchedAt:0}; }
      onlineHistories.set(team,history);
    }
    if (sequence !== lookupSequence) return;
    renderLookup(team);
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
  if (onlineProfiles.has($('lookupNumber').value.trim())) renderLookup($('lookupNumber').value.trim());
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
