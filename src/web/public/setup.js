(function(){
  const API_BASE = window.location.origin;
  const guildId = window.GUILD_ID;
  if (!guildId) return console.warn('setup.js: no guild id');

  async function load(){
    try{
      const res = await fetch(API_BASE + '/api/guilds/' + guildId + '/settings', { credentials: 'include' });
      if (!res.ok){ alert('Failed to load settings'); return; }
      const json = await res.json();
      const settings = json.settings || {};
      document.getElementById('opt-moderation').checked = settings.commands?.moderation ?? true;
      document.getElementById('opt-utility').checked = settings.commands?.utility ?? true;

      // build plugins list (site shows only these plugins)
      const commands = [
        { key: 'moderation', name: 'Moderation', cat: 'moderation' },
        { key: 'level', name: 'Levels', cat: 'utility' },
        { key: 'giveaway', name: 'Giveaways', cat: 'utility' },
      ];

      const container = document.getElementById('commands-list'); container.innerHTML = '';
      commands.forEach(c => {
        const el = document.createElement('div'); el.className = 'section-card';
        const isDisabled = (settings.disabledCommands || []).includes(c.key);
        const title = document.createElement('h4'); title.style.margin = '0 0 8px'; title.textContent = c.name;
        const desc = document.createElement('p'); desc.style.margin = '4px 0 8px'; desc.style.color = 'var(--muted)'; desc.style.fontSize='0.9rem'; desc.textContent = isDisabled ? 'Disabled' : 'Enabled';
        const btn = document.createElement('button'); btn.type='button'; btn.className = isDisabled ? 'btn ghost' : 'btn primary'; btn.textContent = isDisabled ? 'Enable' : 'Disable';
        btn.addEventListener('click', async ()=>{ const disabled = settings.disabledCommands || []; if (isDisabled) settings.disabledCommands = disabled.filter(x=>x!==c.key); else settings.disabledCommands = [...disabled, c.key]; const r = await fetch(API_BASE + '/api/guilds/' + guildId + '/settings', { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ settings }) }); if(!r.ok) return alert('Save failed'); const jr = await r.json(); if (jr.commandsUpdated && jr.commandsUpdated.ok === false) { const err = jr.commandsUpdated.error || 'unknown error'; const queued = jr.commandsUpdated.queued ? ' It has been queued and the bot will retry automatically.' : ''; alert('Saved, but failed to update guild slash commands: ' + err + '.' + queued); } await load(); });
        el.appendChild(title); el.appendChild(desc); el.appendChild(btn); container.appendChild(el);
      });
    }catch(e){ console.error('Failed to load settings', e); }
  }

  async function loadGiveaways(){ try{ const res = await fetch('/api/guilds/' + guildId + '/giveaways'); if (!res.ok) return; const json = await res.json(); const list = json.giveaways || []; const container = document.getElementById('gw-list'); container.innerHTML=''; list.forEach(g=>{ const el=document.createElement('div'); el.className='section-card'; const title = document.createElement('h4'); title.style.margin='0 0 8px'; title.textContent=g.prize; const pid = document.createElement('p'); pid.style.color='var(--muted)'; pid.style.margin='0'; pid.textContent='id: ' + g.id; const status = document.createElement('p'); status.style.color='var(--muted)'; status.style.margin='6px 0 0'; status.textContent = (g.ended ? 'Ended' : 'Active') + ' • Ends ' + (g.endTimestamp ? new Date(g.endTimestamp).toLocaleString() : 'N/A'); el.appendChild(title); el.appendChild(pid); el.appendChild(status); const btns=document.createElement('div'); btns.style.marginTop='8px'; btns.style.display='flex'; btns.style.gap='8px'; const end=document.createElement('button'); end.type='button'; end.className='btn ghost'; end.textContent='End'; end.onclick=async ()=>{ await fetch(API_BASE + '/api/guilds/'+guildId+'/giveaways/'+g.id+'/end',{method:'POST', credentials: 'include'}); loadGiveaways(); }; const reroll=document.createElement('button'); reroll.type='button'; reroll.className='btn ghost'; reroll.textContent='Reroll'; reroll.onclick=async ()=>{ const r = await fetch(API_BASE + '/api/guilds/'+guildId+'/giveaways/'+g.id+'/reroll',{method:'POST', credentials: 'include'}); if (r.ok){ const j = await r.json(); alert('Winners: ' + (j.winners||[]).map(id=>'<@'+id+'>').join(', ')); } }; btns.appendChild(end); btns.appendChild(reroll); el.appendChild(btns); container.appendChild(el); }); }catch(e){ console.error('loadGiveaways failed', e); } }

  async function handleCreateGiveaway(){
    const btn = document.getElementById('btn-create-gw');
    if (!btn) return;
    if (btn.disabled || btn.dataset.processing === '1') return;
    try {
      btn.disabled = true; btn.dataset.processing = '1';
      const prize = document.getElementById('gw-prize').value.trim();
      const duration = document.getElementById('gw-duration').value.trim();
      const winners = parseInt(document.getElementById('gw-winners').value,10)||1;
      const channelId = document.getElementById('gw-channel').value.trim();
      const role = document.getElementById('gw-role').value.trim() || undefined;
      if(!prize||!duration) return alert('Enter prize and duration');
      const res = await fetch(API_BASE + '/api/guilds/' + guildId + '/giveaways', {method:'POST', credentials: 'include', headers:{'Content-Type': 'application/json'}, body: JSON.stringify({prize,duration,winners,channelId,requireRole:role})});
      if(!res.ok) return alert('Create failed');
      document.getElementById('gw-prize').value='';
      document.getElementById('gw-duration').value=''; document.getElementById('gw-winners').value='1';
      document.getElementById('gw-channel').value=''; document.getElementById('gw-role').value='';
      await loadGiveaways();
    } finally {
      btn.disabled = false; delete btn.dataset.processing;
    }
  }

  async function handleSetLvl(){ const rate = Number(document.getElementById('lvl-rate').value); const dur = parseInt(document.getElementById('lvl-duration').value,10); if(!rate || rate<=0) return alert('Please enter a positive rate like 2'); const body={rate}; if(dur && dur>0) body.durationMinutes = dur; const r = await fetch(API_BASE + '/api/guilds/'+guildId+'/xprate',{method:'POST', credentials: 'include', headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); if(r.ok){ alert('XP rate updated'); loadLeveling(); } else alert('Failed'); }
  async function handleResetLvl(){ if(!confirm('Reset XP rate to 1x for this server?')) return; const r = await fetch(API_BASE + '/api/guilds/'+guildId+'/xprate',{method:'POST', credentials: 'include', headers:{'Content-Type':'application/json'},body:JSON.stringify({reset:true})}); if(r.ok){ alert('XP rate reset'); loadLeveling(); } else alert('Failed'); }
  async function loadLeveling(){ const r = await fetch(API_BASE + '/api/guilds/'+guildId+'/xprate', { credentials: 'include' }); if(!r.ok) return; const j = await r.json(); document.getElementById('lvl-current').textContent = (j.xpRate||1)+'x'; if(j.xpRateExpires) document.getElementById('lvl-current').textContent += ' (expires: '+new Date(j.xpRateExpires).toLocaleString()+')'; }

  async function handleSetLog(){ const btn = document.getElementById('btn-set-log'); if (!btn || btn.dataset.processing === '1') return; try { btn.dataset.processing = '1'; btn.disabled = true; const ch = document.getElementById('log-channel-input').value.trim(); if(!ch) return alert('Enter a channel ID'); const r = await fetch(API_BASE + '/api/guilds/' + guildId + '/logchannel',{method:'POST', credentials: 'include', headers:{'Content-Type':'application/json'},body:JSON.stringify({channelId:ch})}); if(r.ok){ alert('Log channel updated'); loadLogChannel(); } else alert('Failed'); } finally { const btn = document.getElementById('btn-set-log'); if (btn) { btn.disabled = false; delete btn.dataset.processing; } } }
  async function handleClearLog(){ const btn = document.getElementById('btn-clear-log'); if (!btn || btn.dataset.processing === '1') return; try { btn.dataset.processing = '1'; btn.disabled = true; if(!confirm('Clear the log channel?')) return; const r = await fetch(API_BASE + '/api/guilds/' + guildId + '/logchannel',{method:'POST', credentials: 'include', headers:{'Content-Type':'application/json'},body:JSON.stringify({clear:true})}); if(r.ok){ alert('Cleared'); loadLogChannel(); } else alert('Failed'); } finally { const btn = document.getElementById('btn-clear-log'); if (btn) { btn.disabled = false; delete btn.dataset.processing; } } }
  async function loadLogChannel(){ const r = await fetch(API_BASE + '/api/guilds/'+guildId+'/logchannel', { credentials: 'include' }); if(!r.ok) return; const j = await r.json(); document.getElementById('log-channel-input').value = j.channelId || ''; }
  async function loadCases(){ const res = await fetch(API_BASE + '/api/guilds/'+guildId+'/cases', { credentials: 'include' }); if(!res.ok) return; const json = await res.json(); const list = json.cases || []; const container = document.getElementById('cases-list'); container.innerHTML=''; list.forEach(c=>{ const el=document.createElement('div'); el.className='section-card'; const title=document.createElement('h4'); title.style.margin='0 0 8px'; title.textContent = '#'+c.id+' • '+c.type; const pid=document.createElement('p'); pid.style.color='var(--muted)'; pid.style.margin='0'; pid.textContent = 'Target: <@'+c.targetId+'>'; const status=document.createElement('p'); status.style.color='var(--muted)'; status.style.margin='6px 0 0'; status.textContent = (new Date(c.timestamp)).toLocaleString()+' • Reason: '+c.reason; el.appendChild(title); el.appendChild(pid); el.appendChild(status); container.appendChild(el); });
    try{
      if (typeof io === 'undefined') {
        // Socket.io client isn't loaded; skip real-time cases silently
        return;
      }
      const socket = io(API_BASE);
      socket.on('moderation-case', c=>{ if(c.guildId!==guildId) return; const container=document.getElementById('cases-list'); const el=document.createElement('div'); el.className='section-card'; const title=document.createElement('h4'); title.style.margin='0 0 8px'; title.textContent='#'+c.id+' • '+c.type; const pid=document.createElement('p'); pid.style.color='var(--muted)'; pid.style.margin='0'; pid.textContent='Target: <@'+c.targetId+'>'; const status=document.createElement('p'); status.style.color='var(--muted)'; status.style.margin='6px 0 0'; status.textContent=(new Date(c.timestamp)).toLocaleString()+' • Reason: '+c.reason; el.appendChild(title); el.appendChild(pid); el.appendChild(status); container.prepend(el); });
    }catch(e){ console.warn('socket failed', e); } }

  // Save settings (checkboxes)
  async function handleSaveSettings(){
    const btn = document.getElementById('btn-save');
    if (!btn || btn.dataset.processing === '1') return;
    try{
     btn.dataset.processing = '1'; btn.disabled = true;
      const r = await fetch(API_BASE + '/api/guilds/' + guildId + '/settings', { credentials: 'include' });
      if(!r.ok) return alert('Failed to load settings');
      const j = await r.json();
      const settings = j.settings || {};
      settings.commands = settings.commands || {};
      settings.commands.moderation = document.getElementById('opt-moderation').checked;
      settings.commands.utility = document.getElementById('opt-utility').checked;

      const save = await fetch(API_BASE + '/api/guilds/' + guildId + '/settings', { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ settings }) });
      if(!save.ok) return alert('Save failed');
      const sj = await save.json();
      if (sj.commandsUpdated && sj.commandsUpdated.ok === false) {
        const queued = sj.commandsUpdated.queued ? ' It has been queued and the bot will retry automatically.' : '';
        alert('Saved, but failed to update guild slash commands: ' + (sj.commandsUpdated.error || 'unknown error') + '.' + queued);
      } else if (sj.commandsUpdated && sj.commandsUpdated.ok === true) {
        alert('Settings saved and commands updated');
      } else {
        alert('Settings saved');
      }
      await load();
    }catch(e){ console.error('Save failed', e); alert('Save failed'); }
    finally{ const btn = document.getElementById('btn-save'); if (btn) { btn.disabled = false; delete btn.dataset.processing; } }
  }

  // attach handlers
  document.getElementById('btn-create-gw')?.addEventListener('click', handleCreateGiveaway);
  document.getElementById('btn-set-lvl')?.addEventListener('click', handleSetLvl);
  document.getElementById('btn-reset-lvl')?.addEventListener('click', handleResetLvl);
  document.getElementById('btn-set-log')?.addEventListener('click', handleSetLog);
  document.getElementById('btn-clear-log')?.addEventListener('click', handleClearLog);
  document.getElementById('btn-save')?.addEventListener('click', handleSaveSettings);

  // delegated click fallback
  document.addEventListener('click', ev=>{
    try{
      const b = ev.target.closest && ev.target.closest('button');
      if(!b) return;
      // prevent delegated duplicate while a handler is processing
      if (b.dataset && b.dataset.processing === '1') return;
      if(b.id==='btn-create-gw') return handleCreateGiveaway();
      if(b.id==='btn-set-lvl') return handleSetLvl();
      if(b.id==='btn-reset-lvl') return handleResetLvl();
      if(b.id==='btn-set-log') return handleSetLog();
      if(b.id==='btn-clear-log') return handleClearLog();
      if(b.id==='btn-save') return document.getElementById('btn-save').click();
      if(b.id==='btn-reset') return document.getElementById('btn-reset').click();
    }catch(e){ }
  });

  // init
  load();
  loadGiveaways(); loadLeveling(); loadLogChannel(); loadCases();
})();