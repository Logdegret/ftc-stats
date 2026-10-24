// Accounts and shared team scouting, backed by Neon Auth + the Neon Data API.
// Both URLs are public; access to rows is enforced by row-level security in the database.
(() => {
  const AUTH = 'https://ep-lucky-heart-b5gijonz.neonauth.c-7.us-east-2.aws.neon.tech/neondb/auth';
  const DATA = 'https://ep-lucky-heart-b5gijonz.apirest.c-7.us-east-2.aws.neon.tech/neondb/rest/v1';
  const POLL_MS = 20000;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let user = null, jwt = null, jwtExp = 0, team = null, members = [], pollTimer = null;
  let mode = 'signin';

  async function authFetch(path, body) {
    const res = await fetch(AUTH + path, {
      method: body ? 'POST' : 'GET', credentials: 'include',
      headers: body ? {'Content-Type': 'application/json'} : {},
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || 'Something went wrong. Try again.');
    return data;
  }

  async function token() {
    if (jwt && Date.now() < jwtExp - 60000) return jwt;
    const data = await authFetch('/token');
    jwt = data.token;
    jwtExp = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000;
    return jwt;
  }

  async function api(path, {method = 'GET', body} = {}) {
    const res = await fetch(DATA + path, {
      method,
      headers: {Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json', Prefer: 'return=representation'},
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(data?.message || 'Could not reach the team database.');
    return data;
  }

  // ---------- data ----------
  async function loadTeam() {
    const rows = await api('/team_members?select=role,display_name,user_id,teams(id,name,team_number,join_code)&user_id=eq.' + encodeURIComponent(user.id) + '&order=joined_at.desc&limit=1');
    team = rows[0] ? {...rows[0].teams, role: rows[0].role} : null;
    members = team ? await api('/team_members?select=display_name,role,user_id&team_id=eq.' + team.id + '&order=joined_at') : [];
  }

  async function loadObservations() {
    if (!team) return;
    const rows = await api('/observations?select=*&team_id=eq.' + team.id + '&order=created_at');
    window.scoutData.set(rows.map(r => ({
      id: r.id, team: r.scouted_team, round: r.round, attempts: r.attempts, made: r.made, tips: r.tips,
      reliability: r.reliability, notes: r.notes, by: r.created_by_name, teamName: ''
    })));
  }

  window.cloudScout = {
    active: () => Boolean(user && team),
    async add(o) {
      await api('/observations', {method: 'POST', body: {
        team_id: team.id, scouted_team: o.team, round: o.round, attempts: o.attempts, made: o.made,
        tips: o.tips, reliability: o.reliability, notes: o.notes, created_by_name: user.name || ''
      }});
      await loadObservations();
    },
    async remove(id) {
      const deleted = await api('/observations?id=eq.' + encodeURIComponent(id), {method: 'DELETE'});
      if (!deleted.length) throw new Error('Only the person who added it, or the team leader, can delete this.');
      await loadObservations();
    }
  };

  function startSync() {
    stopSync();
    if (!team) { window.scoutData.restoreLocal(); return; }
    loadObservations().catch(() => {});
    pollTimer = setInterval(() => { if (!document.hidden) loadObservations().catch(() => {}); }, POLL_MS);
  }
  function stopSync() { clearInterval(pollTimer); pollTimer = null; }

  // ---------- UI ----------
  function render() {
    const box = $('accountBody');
    const navLabel = $('accountNavLabel');
    navLabel.textContent = user ? 'Account' : 'Sign in';
    renderScoutBanner();

    if (!user) {
      const up = mode === 'signup';
      box.innerHTML = `
        <form id="authForm" class="entry-form auth-card" novalidate>
          <div class="auth-tabs" role="tablist">
            <button type="button" role="tab" aria-selected="${!up}" data-mode="signin" class="${up ? '' : 'on'}">Sign in</button>
            <button type="button" role="tab" aria-selected="${up}" data-mode="signup" class="${up ? 'on' : ''}">Create account</button>
          </div>
          <div class="scout-form-grid">
            ${up ? '<label class="notes-label">YOUR NAME<input name="name" type="text" maxlength="60" autocomplete="name" placeholder="e.g. Alex" required></label>' : ''}
            <label class="notes-label">EMAIL<input name="email" type="email" autocomplete="email" placeholder="you@example.com" required></label>
            <label class="notes-label">PASSWORD<input name="password" type="password" minlength="8" autocomplete="${up ? 'new-password' : 'current-password'}" placeholder="${up ? 'At least 8 characters' : ''}" required></label>
          </div>
          <div class="form-bottom"><p>${up ? 'After signing up you can create a team or join one with a code.' : 'Sign in to share scouting with your team.'}</p><button type="submit" class="submit-btn">${up ? 'Create account' : 'Sign in'} <span>↗</span></button></div>
          <div class="form-error" id="authError" role="alert"></div>
        </form>`;
      return;
    }

    if (!team) {
      box.innerHTML = `
        <div class="account-head"><div><span class="section-kicker">SIGNED IN</span><strong>${esc(user.name || user.email)}</strong><small>${esc(user.email)}</small></div><button class="text-btn" type="button" data-action="signout">Sign out</button></div>
        <div class="team-choice">
          <form id="createTeamForm" class="entry-form">
            <span class="section-kicker">TEAM LEADER</span><h3>Create a team</h3>
            <p class="muted">You'll get a join code to share with your teammates.</p>
            <div class="scout-form-grid">
              <label class="notes-label">TEAM NAME<input name="name" type="text" maxlength="60" placeholder="e.g. Quantum Quacks" required></label>
              <label class="notes-label">FTC TEAM NUMBER<input name="number" type="text" inputmode="numeric" pattern="[0-9]{1,6}" maxlength="6" placeholder="Optional"></label>
            </div>
            <div class="form-bottom"><p></p><button type="submit" class="submit-btn">Create team <span>↗</span></button></div>
          </form>
          <form id="joinTeamForm" class="entry-form">
            <span class="section-kicker">TEAMMATE</span><h3>Join a team</h3>
            <p class="muted">Ask your team leader for the 6-character join code.</p>
            <div class="scout-form-grid">
              <label class="notes-label">JOIN CODE<input name="code" type="text" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="e.g. 5KLDUZ" required class="code-input"></label>
            </div>
            <div class="form-bottom"><p></p><button type="submit" class="submit-btn">Join team <span>↗</span></button></div>
          </form>
        </div>
        <div class="form-error" id="teamError" role="alert"></div>`;
      return;
    }

    const leader = team.role === 'leader';
    box.innerHTML = `
      <div class="account-head"><div><span class="section-kicker">SIGNED IN</span><strong>${esc(user.name || user.email)}</strong><small>${esc(user.email)}</small></div><button class="text-btn" type="button" data-action="signout">Sign out</button></div>
      <div class="team-card entry-form">
        <div class="team-card-top">
          <div><span class="section-kicker">${leader ? 'YOUR TEAM · LEADER' : 'YOUR TEAM'}</span><h3>${esc(team.name)}${team.team_number ? ` <small>#${esc(team.team_number)}</small>` : ''}</h3></div>
          <div class="join-code"><span>JOIN CODE</span><button type="button" data-action="copy" title="Copy join code">${esc(team.join_code)} <small>copy</small></button></div>
        </div>
        <p class="muted">Share the join code with teammates. Everyone on the team sees and adds to the same scouting board.</p>
        <div class="member-list">${members.map(m => `<div class="member-row"><span>${esc(m.display_name || 'Teammate')}${m.user_id === user.id ? ' <small>(you)</small>' : ''}</span><span class="role-pill ${m.role === 'leader' ? '' : 'both'}">${m.role === 'leader' ? 'Leader' : 'Member'}</span></div>`).join('')}</div>
        <div class="form-bottom"><p><a href="#scouting">Go to team scouting →</a></p><button type="button" class="text-btn danger" data-action="leave">Leave team</button></div>
      </div>
      <div class="form-error" id="teamError" role="alert"></div>`;
  }

  function renderScoutBanner() {
    const el = $('scoutSyncBanner');
    if (user && team) el.innerHTML = `<span class="live-dot"></span> Shared with <strong>${esc(team.name)}</strong> · updates every 20 seconds`;
    else if (user) el.innerHTML = `Saved on this device only. <a href="#account">Create or join a team</a> to share scouting.`;
    else el.innerHTML = `Saved on this device only. <a href="#account">Sign in</a> to share scouting with your team.`;
    el.classList.toggle('shared', Boolean(user && team));
  }

  async function busy(form, fn, errId) {
    const btn = form?.querySelector('[type=submit]');
    if (btn) btn.disabled = true;
    $(errId).textContent = '';
    try { await fn(); } catch (err) { $(errId).textContent = err.message; }
    finally { if (btn) btn.disabled = false; }
  }

  async function afterLogin(u) {
    user = u; jwt = null;
    await loadTeam();
    render(); startSync();
  }

  $('accountBody').addEventListener('click', async (e) => {
    const t = e.target.closest('[data-mode],[data-action]');
    if (!t) return;
    if (t.dataset.mode) { mode = t.dataset.mode; render(); return; }
    const action = t.dataset.action;
    if (action === 'signout') {
      await authFetch('/sign-out', {}).catch(() => {});
      user = team = jwt = null; members = []; mode = 'signin'; stopSync(); window.scoutData.restoreLocal(); render();
    } else if (action === 'copy') {
      navigator.clipboard?.writeText(team.join_code).then(() => { t.querySelector('small').textContent = 'copied'; });
    } else if (action === 'leave') {
      if (!confirm(team.role === 'leader' ? 'Leave this team? As leader, the team stays but you lose access.' : 'Leave this team?')) return;
      busy(null, async () => {
        await api('/team_members?team_id=eq.' + team.id + '&user_id=eq.' + encodeURIComponent(user.id), {method: 'DELETE'});
        await loadTeam(); render(); startSync();
      }, 'teamError');
    }
  });

  $('accountBody').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target, d = new FormData(form);
    if (form.id === 'authForm') {
      busy(form, async () => {
        const email = String(d.get('email') || '').trim(), password = String(d.get('password') || '');
        if (!email || password.length < 8) throw new Error('Enter your email and a password of at least 8 characters.');
        const data = mode === 'signup'
          ? await authFetch('/sign-up/email', {email, password, name: String(d.get('name') || '').trim() || email.split('@')[0]})
          : await authFetch('/sign-in/email', {email, password});
        await afterLogin(data.user);
      }, 'authError');
    } else if (form.id === 'createTeamForm') {
      busy(form, async () => {
        const number = String(d.get('number') || '').trim();
        if (number && !/^\d{1,6}$/.test(number)) throw new Error('Team number must be digits only.');
        await api('/rpc/create_team', {method: 'POST', body: {p_name: String(d.get('name') || '').trim(), p_number: number, p_display_name: user.name || ''}});
        await loadTeam(); render(); startSync();
      }, 'teamError');
    } else if (form.id === 'joinTeamForm') {
      busy(form, async () => {
        await api('/rpc/join_team', {method: 'POST', body: {p_code: String(d.get('code') || '').trim(), p_display_name: user.name || ''}});
        await loadTeam(); render(); startSync();
      }, 'teamError');
    }
  });

  // Restore an existing session on load.
  render();
  authFetch('/get-session').then(s => s?.user ? afterLogin(s.user) : null).catch(() => {});
})();
