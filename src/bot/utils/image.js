const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const sharp = require('sharp');

const CACHE_DIR = path.join(__dirname, '..', '..', '..', 'data', 'generated');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function hashObj(obj) {
  return crypto.createHash('sha1').update(JSON.stringify(obj)).digest('hex');
}

async function fetchImageBase64(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
  const b = Buffer.from(res.data);
  return `data:image/png;base64,${b.toString('base64')}`;
}

// Generate a level card as PNG using SVG -> Sharp rasterization
// opts: { username, discriminator, avatarUrl, level, xp, required, rank, color, bannerUrl }
async function generateLevelCard(opts) {
  const { username = 'User', discriminator = '0000', avatarUrl, level = 1, xp = 0, required = 100, rank = 1, color = '#8b5cf6', bannerUrl, save = true } = opts; // default purple, save=true to persist file
  const key = hashObj({ username, discriminator, avatarUrl, level, xp, required, rank, color, bannerUrl });
  const outPath = path.join(CACHE_DIR, `${key}.png`);
  // if saving is requested, reuse cached file when available
  if (save && fs.existsSync(outPath)) return outPath;

  // fetch avatar and optional banner
  let avatarData = null; let bannerData = null;
  try { if (avatarUrl) avatarData = await fetchImageBase64(avatarUrl); } catch (e) { avatarData = null; }
  try { if (bannerUrl) bannerData = await fetchImageBase64(bannerUrl); } catch (e) { bannerData = null; }

  // compute progress
  const progress = Math.max(0, Math.min(1, required > 0 ? xp / required : 0));
  const barWidth = Math.round(600 * progress);

  const svg = `
  <svg width="900" height="250" viewBox="0 0 900 250" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g1" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="${color}" />
        <stop offset="100%" stop-color="${color}" stop-opacity="0.55" />
      </linearGradient>
      <clipPath id="avatarClip"><circle cx="120" cy="125" r="64"/></clipPath>
      <clipPath id="barClip"><rect x="220" y="158" width="600" height="40" rx="20"/></clipPath>
      <filter id="avatarGlow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="${color}" flood-opacity="0.25"/></filter>
    </defs>

    <!-- Card background -->
    <rect width="900" height="250" rx="12" fill="#0f1113" />

    <!-- Left: Avatar -->
    <g filter="url(#avatarGlow)">
      <circle cx="120" cy="125" r="82" fill="#0b0c0d" />
    </g>
    <circle cx="120" cy="125" r="78" fill="#0b0c0d" />
    ${avatarData ? `<image href="${avatarData}" x="56" y="61" width="128" height="128" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice" />` : `<circle cx="120" cy="125" r="64" fill="#6b7280" />`}
    <circle cx="120" cy="125" r="64" fill="none" stroke="#00000066" stroke-width="6" />
    <!-- small status dot -->
    <circle cx="168" cy="173" r="14" fill="#f59e0b" stroke="#0b0b0b" stroke-width="4" />

    <!-- Top-right: Rank and Level (larger, higher contrast) -->
    <text x="640" y="44" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="22" fill="#E6E9F2" font-weight="800" text-anchor="end" stroke="#00000066" stroke-width="0.8" paint-order="stroke fill">RANK</text>
    <text x="640" y="98" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="60" font-weight="800" fill="#FFFFFF" text-anchor="end" stroke="#00000088" stroke-width="1" paint-order="stroke fill">#${rank}</text>
    <text x="840" y="44" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="22" fill="${color}" font-weight="800" text-anchor="end" stroke="#00000044" stroke-width="0.8" paint-order="stroke fill">LEVEL</text>
    <text x="840" y="98" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="48" font-weight="800" fill="${color}" text-anchor="end" stroke="#00000044" stroke-width="0.6" paint-order="stroke fill">${level}</text>

    <!-- XP text (right) -->
    <text x="840" y="135" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="16" fill="#ffffff" text-anchor="end">${formatNumber(xp)} / ${formatNumber(required)} XP</text>

    <!-- Username (left area) -->
    <text x="220" y="100" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="18" fill="#e6e6fa" font-weight="600">${escapeXml(username)}</text>

    <!-- Progress bar -->
    <rect x="220" y="158" width="600" height="40" rx="20" fill="#1b1d20" />
    ${barWidth > 0 ? `<g clip-path="url(#barClip)"><rect x="220" y="158" width="${barWidth}" height="40" rx="0" fill="url(#g1)" /></g>` : ''}
    <rect x="220" y="158" width="600" height="40" rx="20" fill="none" stroke="#00000044" />

    <!-- subtle outer stroke -->
    <rect x="0" y="0" width="900" height="250" rx="12" fill="none" stroke="#00000066" />
  </svg>
  `;

  // render svg to png
  try {
    // if caller requested a buffer result, return the buffer and do not save to disk
    if (!save) {
      const buf = await sharp(Buffer.from(svg)).png().toBuffer();
      return buf; // callers must send this as a file buffer
    }

    // ensure cache directory exists (handles case where data/ was deleted while the bot was running)
    if (!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const r = sharp(Buffer.from(svg)).png().toFile(outPath);
    await r;
    return outPath;
  } catch (e) {
    // fallback: write a simple placeholder
    const placeholder = path.join(CACHE_DIR, `${key}-err.txt`);
    try {
      const phDir = path.dirname(placeholder);
      if (!fs.existsSync(phDir)) fs.mkdirSync(phDir, { recursive: true });
      fs.writeFileSync(placeholder, String(e));
    } catch (err) {
      console.error('Failed to write placeholder error file', err);
    }
    throw e;
  }
}

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&"']/g, function (c) { switch (c) { case '<': return '&lt;'; case '>': return '&gt;'; case '&': return '&amp;'; case '"': return '&quot;'; case "'": return '&apos;'; } });
}
function formatNumber(n) { return (typeof n === 'number') ? n.toLocaleString() : n; }



// Generate a celebratory level-up card (returns PNG buffer)
async function generateLevelUpCard(opts) {
  const { username = 'User', discriminator = '0000', avatarUrl, level = 1, color = '#8b5cf6', bannerUrl, message = null } = opts;
  // fetch images
  let avatarData = null; let bannerData = null;
  try { if (avatarUrl) avatarData = await fetchImageBase64(avatarUrl); } catch (e) { avatarData = null; }
  try { if (bannerUrl) bannerData = await fetchImageBase64(bannerUrl); } catch (e) { bannerData = null; }

  const svg = `
  <svg width="900" height="250" viewBox="0 0 900 250" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g1" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="${color}" />
        <stop offset="100%" stop-color="${color}" stop-opacity="0.6" />
      </linearGradient>
      <!-- darker pill gradient for level-up badge -->
      <linearGradient id="pillGrad" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="#0b0c0e" />
        <stop offset="100%" stop-color="#2d163a" />
      </linearGradient>
      <clipPath id="aClip"><circle cx="120" cy="125" r="70"/></clipPath>
    </defs>

    <rect width="900" height="250" rx="12" fill="#0f1113" />
    ${bannerData ? `<image href="${bannerData}" x="560" y="0" width="340" height="250" preserveAspectRatio="xMidYMid slice" opacity="0.85" />` : ''}

    <!-- Avatar -->
    <g>
      <circle cx="120" cy="125" r="76" fill="#0b0c0d" />
      ${avatarData ? `<image href="${avatarData}" x="50" y="55" width="140" height="140" clip-path="url(#aClip)" preserveAspectRatio="xMidYMid slice" />` : `<circle cx="120" cy="125" r="64" fill="#6b7280" />`}
      <circle cx="120" cy="125" r="70" fill="none" stroke="#00000066" stroke-width="6" />
    </g>

    <!-- Congratulation text (improved layout) -->
    <text x="260" y="64" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="18" fill="#9CA3AF" font-weight="700">CONGRATULATIONS</text>
    <text x="260" y="108" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="30" fill="#FFFFFF" font-weight="800">${escapeXml(username)}#${escapeXml(discriminator)}</text>
    ${message ? `<text x="260" y="138" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="14" fill="#9CA3AF">${escapeXml(message)}</text>` : `<text x="260" y="138" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="14" fill="#9CA3AF">is now</text>`}

    <!-- Level pill (single centered label with level number) -->
    <g>
      <rect x="520" y="116" width="360" height="80" rx="40" fill="url(#pillGrad)" opacity="0.98" />
      <text x="700" y="170" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="44" fill="#FFFFFF" font-weight="800" text-anchor="middle" dominant-baseline="middle">LEVEL ${level}</text>
    </g>

    <!-- confetti / accent dots -->
    <circle cx="480" cy="60" r="6" fill="${color}" opacity="0.9" />
    <circle cx="500" cy="46" r="4" fill="#a78bfa" opacity="0.85" />
    <circle cx="540" cy="74" r="5" fill="#ffffff22" opacity="0.6" />

  </svg>
  `;

  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return buf;
}

// Reopen generateLeaderboardImage implementation (keeps previous behavior)
async function generateLeaderboardImage(entries, opts = {}) {
  // entries: [{ id, rank, username, discriminator, avatarUrl, level, xp, totalXp }]
  const { color = '#8b5cf6', bannerUrl = null, width = 900, rowHeight = 72, maxRows = 20 } = opts;
  const rows = entries.slice(0, maxRows);
  const headerHeight = 64;
  const height = headerHeight + rowHeight * rows.length + 40;

  // fetch avatar images
  const avatarData = await Promise.all(rows.map(async (r) => {
    try { if (r.avatarUrl) return await fetchImageBase64(r.avatarUrl); } catch (e) { return null; }
    return null;
  }));

  // Build SVG rows with simple 3-column layout: Name | Level | Rank
  let rowsSvg = '';

  // header with grid lines and improved titles
  rowsSvg += `
    <g>
      <rect x="20" y="12" width="${width - 40}" height="${headerHeight - 12}" rx="8" fill="#0b0c0d" />
      <!-- Center title -->
      <text x="${Math.floor(width / 2)}" y="44" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="24" fill="#E6E9F2" font-weight="800" text-anchor="middle" stroke="#00000066" stroke-width="0.8" paint-order="stroke fill">Server Leaderboard</text>

      <!-- vertical separators (start below header so they don't overlap title) -->
      <line x1="${width - 240}" y1="${headerHeight}" x2="${width - 240}" y2="${headerHeight + rowHeight * rows.length + 28}" stroke="#131316" stroke-width="1" />
      <line x1="${width - 100}" y1="${headerHeight}" x2="${width - 100}" y2="${headerHeight + rowHeight * rows.length + 28}" stroke="#131316" stroke-width="1" />

      <!-- Column headers (larger to match title) -->
      <text x="80" y="44" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="22" fill="#E6E9F2" font-weight="800">Name</text>
      <text x="${width - 160}" y="44" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="22" fill="#E6E9F2" font-weight="800" text-anchor="end">Level</text>
      <text x="${width - 60}" y="44" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="22" fill="#E6E9F2" font-weight="800" text-anchor="end">Rank</text>

      <!-- horizontal separator under header -->
      <line x1="20" y1="${headerHeight}" x2="${width - 20}" y2="${headerHeight}" stroke="#131316" stroke-width="1" />
    </g>
  `;

  rows.forEach((r, i) => {
    const y = headerHeight + i * rowHeight;

    rowsSvg += `
      <g>
        <!-- row background (subtle) -->
        <rect x="20" y="${y + 6}" width="${width - 40}" height="${rowHeight - 8}" rx="8" fill="${i % 2 === 0 ? '#0e0f11' : 'transparent'}" />

        <!-- avatar -->
        <circle cx="70" cy="${y + 36}" r="30" fill="#0b0c0d" />
        ${avatarData[i] ? `<image href="${avatarData[i]}" x="40" y="${y + 6}" width="60" height="60" clip-path="url(#avatarClip-${i})" preserveAspectRatio="xMidYMid slice" />` : ''}
        <clipPath id="avatarClip-${i}"><circle cx="70" cy="${y + 36}" r="30"/></clipPath>

        <!-- Name -->
        <text x="120" y="${y + 36}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="16" fill="#e6e6fa" font-weight="600">${escapeXml(r.username)}</text>
        <text x="120" y="${y + 56}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="12" fill="#9CA3AF">#${r.discriminator}</text>

        <!-- vertical separators (align with header) -->
        <line x1="${width - 240}" y1="${y + 6}" x2="${width - 240}" y2="${y + rowHeight - 2}" stroke="#131316" stroke-width="1" />
        <line x1="${width - 100}" y1="${y + 6}" x2="${width - 100}" y2="${y + rowHeight - 2}" stroke="#131316" stroke-width="1" />

        <!-- Level -->
        <text x="${width - 160}" y="${y + 40}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="16" fill="${color}" font-weight="700" text-anchor="end">${r.level}</text>

        <!-- Rank -->
        <text x="${width - 60}" y="${y + 40}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="16" fill="#e6e6fa" font-weight="700" text-anchor="end">#${r.rank}</text>

        <!-- horizontal separator -->
        <line x1="20" y1="${y + rowHeight}" x2="${width - 20}" y2="${y + rowHeight}" stroke="#0b0c0d" stroke-width="1" />
      </g>
    `;
  });

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g1" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="${color}" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0.55" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" rx="12" fill="#0f1113" />
      ${rowsSvg}
    </svg>
  `;

  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return buf;
}

// Generate a generic info card (returns PNG buffer) — minimal, well-spaced layout with larger typography and centered-left avatar
async function generateInfoCard(opts) {
  const { title = 'Info', subtitle = '', avatarUrl = null, bannerUrl = null, color = '#8b5cf6', rows = [], width = 900, status = null } = opts;
  const rowHeight = 56;
  const perCol = Math.ceil(rows.length / 2);
  const headerHeight = 120;
  const height = Math.max(260, headerHeight + perCol * rowHeight + 20);

  // fetch images
  let avatarData = null; let bannerData = null;
  try { if (avatarUrl) avatarData = await fetchImageBase64(avatarUrl); } catch (e) { avatarData = null; }
  try { if (bannerUrl) bannerData = await fetchImageBase64(bannerUrl); } catch (e) { bannerData = null; }

  function statusColor(s) {
    if (!s) return null;
    const m = String(s).toLowerCase();
    if (m === 'online') return '#22c55e';
    if (m === 'idle') return '#f59e0b';
    if (m === 'dnd') return '#ef4444';
    return '#6b7280';
  }
  const stColor = statusColor(status);

  // avatar centered vertically on the left
  const avatarCenterY = Math.floor(height / 2);

  // grid layout: two columns with improved spacing
  const startX = 220;
  const colWidth = 320;
  const leftColX = startX;
  const rightColX = startX + colWidth + 20;
  // anchor rows below a fixed header area to avoid overlap with title/avatar
  const rowsStartY = headerHeight + 8;

  let rowsSvg = '';
  const perColCount = Math.ceil(rows.length / 2);
  for (let i = 0; i < perColCount; i++) {
    const left = rows[i] || null;
    const right = rows[i + perColCount] || null;
    const y = rowsStartY + i * rowHeight;
    if (left) {
      rowsSvg += `
        <g>
          <text x="${leftColX}" y="${y + 16}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="13" fill="#9CA3AF">${escapeXml(left.label)}</text>
          <text x="${leftColX}" y="${y + 40}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="18" fill="#E6E9F2" font-weight="800">${escapeXml(left.value)}</text>
        </g>
      `;
    }
    if (right) {
      rowsSvg += `
        <g>
          <text x="${rightColX}" y="${y + 16}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="13" fill="#9CA3AF">${escapeXml(right.label)}</text>
          <text x="${rightColX}" y="${y + 40}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="18" fill="#E6E9F2" font-weight="800">${escapeXml(right.value)}</text>
        </g>
      `;
    }
    // thin separator under each row pair
    rowsSvg += `
      <line x1="${startX - 12}" y1="${y + rowHeight}" x2="${width - 40}" y2="${y + rowHeight}" stroke="#0b0c0d" stroke-width="1" />
    `;
  }

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g1" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="${color}" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0.5" />
        </linearGradient>
        <!-- accent gradient (purple) -->
        <linearGradient id="accent" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.18" />
          <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0" />
        </linearGradient>
        <filter id="accentBlur"><feGaussianBlur stdDeviation="14"/></filter>
        <filter id="avatarGlow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="${color}" flood-opacity="0.10"/></filter>
        <clipPath id="avatarClip"><circle cx="120" cy="${avatarCenterY}" r="64"/></clipPath>
      </defs>

      <rect width="${width}" height="${height}" rx="12" fill="#0f1113" />
      <!-- purple accent ribbon -->
      <g transform="rotate(-7 ${Math.floor(width / 2)} ${Math.floor(height / 2)})"><rect x="${Math.floor(startX)}" y="-40" width="${Math.floor(width * 0.85)}" height="120" fill="url(#accent)" filter="url(#accentBlur)" opacity="0.95" /></g>
      ${bannerData ? `<image href="${bannerData}" x="${width - 360}" y="0" width="360" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="0.9" />` : ''}

      <!-- Avatar with glow (left centered vertically) -->
      <g filter="url(#avatarGlow)">
        <circle cx="120" cy="${avatarCenterY}" r="84" fill="#0b0c0d" />
      </g>
      <circle cx="120" cy="${avatarCenterY}" r="76" fill="#0b0c0d" />
      ${avatarData ? `<image href="${avatarData}" x="56" y="${avatarCenterY - 64}" width="128" height="128" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice" />` : `<circle cx="120" cy="${avatarCenterY}" r="64" fill="#6b7280" />`}
      <circle cx="120" cy="${avatarCenterY}" r="64" fill="none" stroke="#00000066" stroke-width="6" />

      ${stColor ? `<circle cx="170" cy="${avatarCenterY + 56}" r="12" fill="${stColor}" stroke="#0b0b0b" stroke-width="3" />` : ''}

      <!-- Title and subtitle (moved to top to avoid overlapping) -->
      <text x="220" y="48" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="26" fill="#E6E9F2" font-weight="900">${escapeXml(title)}</text>
      ${subtitle ? `<text x="220" y="78" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="15" fill="#9CA3AF">${escapeXml(subtitle)}</text>` : ''}

      <!-- Info grid -->
      ${rowsSvg}

      <rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="none" stroke="#00000066" />
    </svg>
  `;

  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return buf;
}

// Generate a welcome card (PNG buffer)
async function generateWelcomeCard(opts) {
  const { username = 'User', discriminator = '0000', avatarUrl = null, serverName = '', color = '#60a5fa', message = '' } = opts;
  const width = 900; const height = 250;
  let avatarData = null;
  try { if (avatarUrl) avatarData = await fetchImageBase64(avatarUrl); } catch (e) { avatarData = null; }

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g1" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="${color}" />
        <stop offset="100%" stop-color="${color}" stop-opacity="0.55" />
      </linearGradient>
      <linearGradient id="accentWelcome" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.18" />
        <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0" />
      </linearGradient>
      <filter id="accentBlurWelcome"><feGaussianBlur stdDeviation="14"/></filter>
      <filter id="avatarGlow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="${color}" flood-opacity="0.12"/></filter>
      <clipPath id="aClip"><circle cx="120" cy="125" r="76"/></clipPath>
    </defs>

    <rect width="${width}" height="${height}" rx="12" fill="#0f1113" />
    <!-- welcome purple accent ribbon -->
    <g transform="rotate(-6 ${Math.floor(width / 2)} ${Math.floor(height / 2)})"><rect x="160" y="-40" width="${Math.floor(width * 0.78)}" height="110" fill="url(#accentWelcome)" filter="url(#accentBlurWelcome)" opacity="0.95" /></g>

    <g filter="url(#avatarGlow)">
      <circle cx="120" cy="125" r="94" fill="#0b0c0d" />
    </g>
    <circle cx="120" cy="125" r="86" fill="#0b0c0d" />
    ${avatarData ? `<image href="${avatarData}" x="34" y="49" width="172" height="172" clip-path="url(#aClip)" preserveAspectRatio="xMidYMid slice" />` : `<circle cx="120" cy="125" r="76" fill="#6b7280" />`}
    <circle cx="120" cy="125" r="76" fill="none" stroke="#00000066" stroke-width="6" />

    <text x="240" y="64" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="28" fill="#E6E9F2" font-weight="900">Welcome, ${escapeXml(username)}!</text>
    <text x="240" y="98" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="16" fill="#9CA3AF">to ${escapeXml(serverName)}</text>

    ${message ? `<text x="240" y="140" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="14" fill="#E6E9F2">${escapeXml(message)}</text>` : ''}

    <rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="none" stroke="#00000066" />
  </svg>
  `;

  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return buf;
}

// Generate a goodbye card (PNG buffer)
async function generateByeCard(opts) {
  const { username = 'User', discriminator = '0000', avatarUrl = null, serverName = '', color = '#ef4444', message = 'Goodbye and good luck!' } = opts;
  const width = 900; const height = 250;
  let avatarData = null;
  try { if (avatarUrl) avatarData = await fetchImageBase64(avatarUrl); } catch (e) { avatarData = null; }

  // slightly darker / warmer palette for bye
  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g1b" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="${color}" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0.3" />
      </linearGradient>
      <linearGradient id="accentBye" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.16" />
        <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0" />
      </linearGradient>
      <filter id="accentBlurBye"><feGaussianBlur stdDeviation="14"/></filter>
      <filter id="avatarGlowBye" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="${color}" flood-opacity="0.12"/></filter>
      <clipPath id="aClipBye"><circle cx="120" cy="125" r="76"/></clipPath>
    </defs>

    <rect width="${width}" height="${height}" rx="12" fill="#0f1113" />
    <!-- bye purple accent ribbon -->
    <g transform="rotate(-6 ${Math.floor(width / 2)} ${Math.floor(height / 2)})"><rect x="160" y="-36" width="${Math.floor(width * 0.78)}" height="110" fill="url(#accentBye)" filter="url(#accentBlurBye)" opacity="0.95" /></g>

    <g filter="url(#avatarGlowBye)">
      <circle cx="120" cy="125" r="94" fill="#0b0c0d" />
    </g>
    <circle cx="120" cy="125" r="86" fill="#0b0c0d" />
    ${avatarData ? `<image href="${avatarData}" x="34" y="49" width="172" height="172" clip-path="url(#aClipBye)" preserveAspectRatio="xMidYMid slice" />` : `<circle cx="120" cy="125" r="76" fill="#6b7280" />`}
    <circle cx="120" cy="125" r="76" fill="none" stroke="#00000066" stroke-width="6" />

    <text x="240" y="64" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="28" fill="#E6E9F2" font-weight="900">Goodbye, ${escapeXml(username)}.</text>
    <text x="240" y="98" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="16" fill="#9CA3AF">Left ${escapeXml(serverName)}</text>

    ${message ? `<text x="240" y="140" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="14" fill="#E6E9F2">${escapeXml(message)}</text>` : ''}

    <rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="none" stroke="#00000066" />
  </svg>
  `;

  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return buf;
}

module.exports = { generateLevelCard, generateLeaderboardImage, generateLevelUpCard, generateInfoCard, generateWelcomeCard, generateByeCard };
