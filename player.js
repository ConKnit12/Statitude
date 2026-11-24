const MLB_API = "https://statsapi.mlb.com/api/v1";
const params = new URLSearchParams(window.location.search);
const playerId = params.get("id");

let person = null;
let isPitcher = false;
let isTwoWay = false;
let yearByYearHitting = [];
let yearByYearPitching = [];
let careerHitting = null;
let careerPitching = null;

function $(id) {
  return document.getElementById(id);
}

function format3(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return v ?? "—";
  return n.toFixed(3).replace(/^0\./, ".");
}

function format2(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return v ?? "—";
  return n.toFixed(2);
}

function cell(v) {
  return v == null || v === "" ? "—" : v;
}

async function loadPlayer() {
  if (!playerId) {
    $("playerHero").innerHTML = "<p>No player selected.</p>";
    return;
  }

  try {
    const [personRes, yHit, yPit, cHit, cPit] = await Promise.all([
      fetch(`${MLB_API}/people/${playerId}?hydrate=currentTeam`),
      fetch(`${MLB_API}/people/${playerId}/stats?stats=yearByYear&group=hitting&sportId=1`),
      fetch(`${MLB_API}/people/${playerId}/stats?stats=yearByYear&group=pitching&sportId=1`),
      fetch(`${MLB_API}/people/${playerId}/stats?stats=career&group=hitting&sportId=1`),
      fetch(`${MLB_API}/people/${playerId}/stats?stats=career&group=pitching&sportId=1`)
    ]);

    const personData = await personRes.json();
    person = personData.people?.[0];
    if (!person) throw new Error("Player not found");

    const pos = (person.primaryPosition?.abbreviation || "").toUpperCase();
    isPitcher = pos === "P";
    isTwoWay = pos === "TWP" || pos === "DH"; // Ohtani-style; also check both groups

    yearByYearHitting = (await yHit.json()).stats?.[0]?.splits || [];
    yearByYearPitching = (await yPit.json()).stats?.[0]?.splits || [];
    careerHitting = (await cHit.json()).stats?.[0]?.splits?.[0]?.stat || null;
    careerPitching = (await cPit.json()).stats?.[0]?.splits?.[0]?.stat || null;

    // Two-way if both have meaningful seasons
    if (yearByYearHitting.length && yearByYearPitching.length) {
      isTwoWay = true;
    }

    document.title = `${person.fullName} | Statitude`;
    renderHero();
    fillSeasonSelect();
    renderAllForSeason();
    setupTabs();
    loadStatcastForSeason();
    loadChartsForSeason();
    loadSituationalSplits();
    loadPitchTypePerformance();
    loadVsTeams();
    loadStatitudeWar();
    loadDefense();
    loadBatSpeed();
  } catch (e) {
    console.error(e);
    $("playerHero").innerHTML = `<p style="color:#e53935;">Error loading player.</p>`;
  }
}

function renderHero() {
  const p = person;
  const team = p.currentTeam?.name || "";
  const pos = p.primaryPosition?.name || p.primaryPosition?.abbreviation || "";
  const bat = p.batSide?.description || p.batSide?.code || "—";
  const thr = p.pitchHand?.description || p.pitchHand?.code || "—";
  const num = p.primaryNumber ? `#${p.primaryNumber}` : "";
  const headshot = `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_100/v1/people/${playerId}/headshot/67/current`;

  $("playerHero").innerHTML = `
    <div class="hero-inner">
      <img class="hero-headshot" src="${headshot}" alt="${p.fullName}"
           onerror="this.style.display='none'">
      <div class="hero-info">
        <div class="hero-num">${num}</div>
        <h1 class="hero-name">${p.fullName}</h1>
        <div class="hero-meta">
          <span>${team}</span>
          <span class="dot">·</span>
          <span>${pos}</span>
          <span class="dot">·</span>
          <span>B/T: ${bat} / ${thr}</span>
        </div>
        <div class="hero-bio">
          ${p.height || ""} ${p.weight ? `· ${p.weight} lb` : ""}
          ${p.birthDate ? `· Born ${p.birthDate}` : ""}
          ${p.birthCity ? `· ${p.birthCity}${p.birthStateProvince ? ", " + p.birthStateProvince : ""}${p.birthCountry ? " " + p.birthCountry : ""}` : ""}
        </div>
      </div>
    </div>
  `;
}

function fillSeasonSelect() {
  const seasons = new Set();
  yearByYearHitting.forEach(s => s.season && seasons.add(String(s.season)));
  yearByYearPitching.forEach(s => s.season && seasons.add(String(s.season)));
  const list = [...seasons].sort((a, b) => Number(b) - Number(a));
  const sel = $("playerPageSeason");
  sel.innerHTML = list.map(y => `<option value="${y}">${y}</option>`).join("");
  if (!list.length) {
    const y = String(new Date().getFullYear());
    sel.innerHTML = `<option value="${y}">${y}</option>`;
  }
  sel.onchange = () => {
    renderAllForSeason();
    loadStatcastForSeason();
    loadChartsForSeason();
    loadSituationalSplits();
    loadPitchTypePerformance();
    loadVsTeams();
    loadStatitudeWar();
    loadDefense();
    loadBatSpeed();
  };
}

function getSeason() {
  return $("playerPageSeason")?.value || String(new Date().getFullYear());
}

function findSeasonSplit(splits, season) {
  return (splits || []).find(s => String(s.season) === String(season));
}

function hittingTable(stat, label) {
  if (!stat) return `<p class="empty-state">No ${label} hitting stats.</p>`;
  return `
    <h3 class="stat-group-title">${label} — Hitting</h3>
    <div class="table-scroll">
      <table class="player-detail-table">
        <thead>
          <tr>
            <th>G</th><th>PA</th><th>AB</th><th>R</th><th>H</th><th>2B</th><th>3B</th><th>HR</th>
            <th>RBI</th><th>BB</th><th>SO</th><th>SB</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${cell(stat.gamesPlayed)}</td>
            <td>${cell(stat.plateAppearances)}</td>
            <td>${cell(stat.atBats)}</td>
            <td>${cell(stat.runs)}</td>
            <td>${cell(stat.hits)}</td>
            <td>${cell(stat.doubles)}</td>
            <td>${cell(stat.triples)}</td>
            <td>${cell(stat.homeRuns)}</td>
            <td>${cell(stat.rbi)}</td>
            <td>${cell(stat.baseOnBalls)}</td>
            <td>${cell(stat.strikeOuts)}</td>
            <td>${cell(stat.stolenBases)}</td>
            <td>${cell(stat.avg)}</td>
            <td>${cell(stat.obp)}</td>
            <td>${cell(stat.slg)}</td>
            <td>${cell(stat.ops)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function pitchingTable(stat, label) {
  if (!stat) return `<p class="empty-state">No ${label} pitching stats.</p>`;
  return `
    <h3 class="stat-group-title">${label} — Pitching</h3>
    <div class="table-scroll">
      <table class="player-detail-table">
        <thead>
          <tr>
            <th>W</th><th>L</th><th>ERA</th><th>G</th><th>GS</th><th>SV</th><th>IP</th>
            <th>H</th><th>R</th><th>ER</th><th>HR</th><th>BB</th><th>SO</th><th>WHIP</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${cell(stat.wins)}</td>
            <td>${cell(stat.losses)}</td>
            <td>${cell(stat.era)}</td>
            <td>${cell(stat.gamesPlayed)}</td>
            <td>${cell(stat.gamesStarted)}</td>
            <td>${cell(stat.saves)}</td>
            <td>${cell(stat.inningsPitched)}</td>
            <td>${cell(stat.hits)}</td>
            <td>${cell(stat.runs)}</td>
            <td>${cell(stat.earnedRuns)}</td>
            <td>${cell(stat.homeRuns)}</td>
            <td>${cell(stat.baseOnBalls)}</td>
            <td>${cell(stat.strikeOuts)}</td>
            <td>${cell(stat.whip)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderAllForSeason() {
  const season = getSeason();
  const hitSplit = findSeasonSplit(yearByYearHitting, season);
  const pitSplit = findSeasonSplit(yearByYearPitching, season);

  let seasonHtml = "";
  if (hitSplit?.stat) seasonHtml += hittingTable(hitSplit.stat, season);
  if (pitSplit?.stat) seasonHtml += pitchingTable(pitSplit.stat, season);
  if (!seasonHtml) seasonHtml = `<p class="empty-state">No MLB stats for ${season}.</p>`;
  $("seasonStatsBlock").innerHTML = seasonHtml;

  let careerHtml = "";
  if (careerHitting) careerHtml += hittingTable(careerHitting, "Career");
  if (careerPitching) careerHtml += pitchingTable(careerPitching, "Career");
  if (!careerHtml) careerHtml = `<p class="empty-state">No career totals.</p>`;
  $("careerStatsBlock").innerHTML = careerHtml;

  renderYearByYear();
}

function renderYearByYear() {
  let html = "";

  if (yearByYearHitting.length) {
    html += `<h3 class="stat-group-title">Hitting</h3><div class="table-scroll"><table class="player-detail-table year-table">
      <thead><tr>
        <th>Year</th><th>Tm</th><th>G</th><th>PA</th><th>AB</th><th>R</th><th>H</th><th>2B</th><th>3B</th><th>HR</th>
        <th>RBI</th><th>BB</th><th>SO</th><th>SB</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th>
      </tr></thead><tbody>`;
    [...yearByYearHitting].reverse().forEach(sp => {
      const s = sp.stat || {};
      const tm = sp.team?.abbreviation || sp.team?.name || "—";
      html += `<tr>
        <td>${sp.season || ""}</td><td>${tm}</td>
        <td>${cell(s.gamesPlayed)}</td><td>${cell(s.plateAppearances)}</td><td>${cell(s.atBats)}</td>
        <td>${cell(s.runs)}</td><td>${cell(s.hits)}</td><td>${cell(s.doubles)}</td><td>${cell(s.triples)}</td>
        <td>${cell(s.homeRuns)}</td><td>${cell(s.rbi)}</td><td>${cell(s.baseOnBalls)}</td>
        <td>${cell(s.strikeOuts)}</td><td>${cell(s.stolenBases)}</td>
        <td>${cell(s.avg)}</td><td>${cell(s.obp)}</td><td>${cell(s.slg)}</td><td>${cell(s.ops)}</td>
      </tr>`;
    });
    if (careerHitting) {
      const s = careerHitting;
      html += `<tr class="career-row">
        <td colspan="2"><strong>Career</strong></td>
        <td>${cell(s.gamesPlayed)}</td><td>${cell(s.plateAppearances)}</td><td>${cell(s.atBats)}</td>
        <td>${cell(s.runs)}</td><td>${cell(s.hits)}</td><td>${cell(s.doubles)}</td><td>${cell(s.triples)}</td>
        <td>${cell(s.homeRuns)}</td><td>${cell(s.rbi)}</td><td>${cell(s.baseOnBalls)}</td>
        <td>${cell(s.strikeOuts)}</td><td>${cell(s.stolenBases)}</td>
        <td>${cell(s.avg)}</td><td>${cell(s.obp)}</td><td>${cell(s.slg)}</td><td>${cell(s.ops)}</td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
  }

  if (yearByYearPitching.length) {
    html += `<h3 class="stat-group-title">Pitching</h3><div class="table-scroll"><table class="player-detail-table year-table">
      <thead><tr>
        <th>Year</th><th>Tm</th><th>W</th><th>L</th><th>ERA</th><th>G</th><th>GS</th><th>SV</th><th>IP</th>
        <th>H</th><th>ER</th><th>BB</th><th>SO</th><th>WHIP</th>
      </tr></thead><tbody>`;
    [...yearByYearPitching].reverse().forEach(sp => {
      const s = sp.stat || {};
      const tm = sp.team?.abbreviation || sp.team?.name || "—";
      html += `<tr>
        <td>${sp.season || ""}</td><td>${tm}</td>
        <td>${cell(s.wins)}</td><td>${cell(s.losses)}</td><td>${cell(s.era)}</td>
        <td>${cell(s.gamesPlayed)}</td><td>${cell(s.gamesStarted)}</td><td>${cell(s.saves)}</td>
        <td>${cell(s.inningsPitched)}</td><td>${cell(s.hits)}</td><td>${cell(s.earnedRuns)}</td>
        <td>${cell(s.baseOnBalls)}</td><td>${cell(s.strikeOuts)}</td><td>${cell(s.whip)}</td>
      </tr>`;
    });
    if (careerPitching) {
      const s = careerPitching;
      html += `<tr class="career-row">
        <td colspan="2"><strong>Career</strong></td>
        <td>${cell(s.wins)}</td><td>${cell(s.losses)}</td><td>${cell(s.era)}</td>
        <td>${cell(s.gamesPlayed)}</td><td>${cell(s.gamesStarted)}</td><td>${cell(s.saves)}</td>
        <td>${cell(s.inningsPitched)}</td><td>${cell(s.hits)}</td><td>${cell(s.earnedRuns)}</td>
        <td>${cell(s.baseOnBalls)}</td><td>${cell(s.strikeOuts)}</td><td>${cell(s.whip)}</td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
  }

  if (!html) html = `<p class="empty-state">No year-by-year data.</p>`;
  $("yearByYearBlock").innerHTML = html;
}

async function loadStatcastForSeason() {
  const block = $("statcastBlock");
  const season = getSeason();
  block.innerHTML = `<p class="empty-state">Loading Statcast for ${season}…</p>`;

  const types = [];
  if (yearByYearHitting.length) types.push("batter");
  if (yearByYearPitching.length) types.push("pitcher");
  if (!types.length) types.push(isPitcher ? "pitcher" : "batter");

  try {
    const results = [];
    for (const type of types) {
      const selections = [
        "pa", "ab", "batting_avg", "woba", "xba", "xslg", "xwoba",
        "exit_velocity_avg", "launch_angle_avg", "barrel_batted_rate",
        "hard_hit_percent", "whiff_percent", "k_percent", "bb_percent"
      ].join(",");
      const url =
        `https://baseballsavant.mlb.com/leaderboard/custom?year=${season}&type=${type}` +
        `&filter=&min=0&selections=${selections}&chart=false&csv=true`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.trim().startsWith("<")) continue;
      const rows = parseCSV(text);
      const mine = rows.find(r => String(r.player_id) === String(playerId));
      if (mine) results.push({ type, row: mine });
    }

    if (!results.length) {
      block.innerHTML = `<p class="empty-state">No Statcast leaderboard row for this player in ${season}.</p>`;
      return;
    }

    let html = "";
    results.forEach(({ type, row }) => {
      html += `
        <h3 class="stat-group-title">${type === "batter" ? "Batter" : "Pitcher"} — ${season}</h3>
        <div class="statcast-grid">
          <div class="sc-item"><span class="sc-label">PA</span><span class="sc-val">${cell(row.pa)}</span></div>
          <div class="sc-item"><span class="sc-label">AVG</span><span class="sc-val">${fmtSc(row.batting_avg)}</span></div>
          <div class="sc-item"><span class="sc-label">wOBA</span><span class="sc-val">${fmtSc(row.woba)}</span></div>
          <div class="sc-item"><span class="sc-label">xBA</span><span class="sc-val">${fmtSc(row.xba)}</span></div>
          <div class="sc-item"><span class="sc-label">xSLG</span><span class="sc-val">${fmtSc(row.xslg)}</span></div>
          <div class="sc-item"><span class="sc-label">xwOBA</span><span class="sc-val">${fmtSc(row.xwoba)}</span></div>
          <div class="sc-item"><span class="sc-label">Avg EV</span><span class="sc-val">${cell(row.exit_velocity_avg)}</span></div>
          <div class="sc-item"><span class="sc-label">LA</span><span class="sc-val">${cell(row.launch_angle_avg)}</span></div>
          <div class="sc-item"><span class="sc-label">Barrel%</span><span class="sc-val">${pct(row.barrel_batted_rate)}</span></div>
          <div class="sc-item"><span class="sc-label">Hard Hit%</span><span class="sc-val">${pct(row.hard_hit_percent)}</span></div>
          <div class="sc-item"><span class="sc-label">Whiff%</span><span class="sc-val">${pct(row.whiff_percent)}</span></div>
          <div class="sc-item"><span class="sc-label">K%</span><span class="sc-val">${pct(row.k_percent)}</span></div>
          <div class="sc-item"><span class="sc-label">BB%</span><span class="sc-val">${pct(row.bb_percent)}</span></div>
        </div>
      `;
    });
    block.innerHTML = html;
  } catch (e) {
    console.error(e);
    block.innerHTML = `<p class="empty-state">Could not load Statcast data.</p>`;
  }
}

function fmtSc(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return cell(v);
  return n.toFixed(3).replace(/^0\./, ".");
}

function pct(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (c === '"' && quote && n === '"') {
      field += '"';
      i++;
    } else if (c === '"') {
      quote = !quote;
    } else if (c === "," && !quote) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quote) {
      if (c === "\r" && n === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map(h =>
    String(h).replace(/^\uFEFF/, "").replace(/^"|"$/g, "").trim()
  );
  return rows.slice(1).map(values => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (values[i] ?? "").replace(/^"|"$/g, "");
    });
    return obj;
  });
}

/* =========================================================
   SPRAY CHART — Statcast hc_x / hc_y
========================================================= */
const HIT_EVENTS = new Set([
  "single", "double", "triple", "home_run",
  "field_out", "force_out", "grounded_into_double_play",
  "double_play", "sac_fly", "sac_bunt", "fielders_choice",
  "fielders_choice_out", "field_error", "sac_fly_double_play"
]);

function sprayColor(event) {
  switch (event) {
    case "home_run": return "#ef4444";
    case "triple": return "#f59e0b";
    case "double": return "#3b82f6";
    case "single": return "#22c55e";
    default: return "#94a3b8";
  }
}

function seasonDateChunks(season) {
  const y = Number(season);
  // ~2-month windows to stay under Savant limits
  return [
    [`${y}-03-20`, `${y}-05-15`],
    [`${y}-05-16`, `${y}-07-15`],
    [`${y}-07-16`, `${y}-09-15`],
    [`${y}-09-16`, `${y}-11-15`]
  ];
}

async function fetchSavantBatterChunk(playerId, start, end) {
  const url =
    "https://baseballsavant.mlb.com/statcast_search/csv?" +
    new URLSearchParams({
      all: "true",
      hfGT: "R|",
      player_type: "batter",
      game_date_gt: start,
      game_date_lt: end,
      "batters_lookup[]": String(playerId),
      min_pitches: "0",
      min_results: "0",
      type: "details"
    }).toString();

  const res = await fetch(url);
  if (!res.ok) return [];
  const text = await res.text();
  if (!text || text.trim().startsWith("<")) return [];
  return parseCSV(text);
}

async function loadSprayChart() {
  const svg = $("spraySvg");
  const note = document.querySelector("#sprayChartBlock .chart-note");
  if (!svg) return;

  // Pure pitchers: no spray chart
  if (!isRealHitter()) {
    drawSprayField(svg, []);
    if (note) note.textContent = "Spray chart is for hitters / two-way players only.";
    return;
  }

  const season = getSeason();
  drawSprayField(svg, []);
  svg.insertAdjacentHTML(
    "beforeend",
    `<text id="sprayLoading" x="250" y="250" text-anchor="middle" fill="#8b9aab" font-size="14">Loading ${season} batted balls…</text>`
  );

  try {
    const chunks = seasonDateChunks(season);
    const results = await Promise.all(
      chunks.map(([a, b]) => fetchSavantBatterChunk(playerId, a, b))
    );
    const rows = results.flat();

    const balls = [];
    rows.forEach(row => {
      const ev = (row.events || "").trim();
      const hx = Number(row.hc_x);
      const hy = Number(row.hc_y);
      if (!ev || !HIT_EVENTS.has(ev)) return;
      if (Number.isNaN(hx) || Number.isNaN(hy)) return;
      const topBot = (row.inning_topbot || "").toLowerCase();
      const home = row.home_team || "";
      const away = row.away_team || "";
      // Batter is away in top of inning, home in bottom
      let opponent = "";
      if (topBot.startsWith("top")) opponent = home;
      else if (topBot.startsWith("bot")) opponent = away;
      else opponent = home && away ? `${away} @ ${home}` : (home || away);

      balls.push({
        event: ev,
        hc_x: hx,
        hc_y: hy,
        launch_speed: row.launch_speed,
        launch_angle: row.launch_angle,
        bb_type: row.bb_type,
        game_date: row.game_date || "",
        home_team: home,
        away_team: away,
        opponent,
        inning: row.inning || "",
        inning_topbot: row.inning_topbot || ""
      });
    });

    drawSprayField(svg, balls);
    if (note) {
      note.textContent = balls.length
        ? `${balls.length} batted balls in play · ${season} (Statcast)`
        : `No batted-ball locations found for ${season}.`;
    }
  } catch (e) {
    console.error("Spray chart error:", e);
    drawSprayField(svg, []);
    if (note) note.textContent = "Could not load spray data (Savant may be slow or blocked).";
  }
}

function formatSprayDate(iso) {
  if (!iso) return "—";
  // Savant is usually YYYY-MM-DD
  const d = new Date(iso + (iso.length <= 10 ? "T12:00:00" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function showSprayDetail(b) {
  const el = $("sprayDetail");
  if (!el) return;
  if (!b) {
    el.className = "spray-detail empty-state";
    el.textContent = "Click a ball to highlight it and see game details.";
    return;
  }
  const result = (b.event || "").replace(/_/g, " ");
  const ev = b.launch_speed
    ? `${Number(b.launch_speed).toFixed(1)} mph`
    : "";
  const la =
    b.launch_angle != null && b.launch_angle !== ""
      ? `${Number(b.launch_angle).toFixed(0)}° LA`
      : "";
  const inn = b.inning
    ? `${b.inning_topbot || ""} ${b.inning}`.trim()
    : "";
  el.className = "spray-detail";
  el.innerHTML = `
    <div class="spray-detail-main">
      <strong>${result}</strong>
      ${ev || la ? `<span class="spray-detail-meta">${[ev, la].filter(Boolean).join(" · ")}</span>` : ""}
    </div>
    <div class="spray-detail-game">
      <span>${formatSprayDate(b.game_date)}</span>
      <span class="dot">·</span>
      <span>vs ${b.opponent || "—"}</span>
      ${inn ? `<span class="dot">·</span><span>${inn}</span>` : ""}
    </div>
  `;
}

function drawSprayField(svg, balls) {
  const W = 500;
  const H = 500;
  const scale = W / 250;

  // Keep list for click lookup
  svg._sprayBalls = balls || [];

  let dots = "";
  (balls || []).forEach((b, i) => {
    const x = b.hc_x * scale;
    const y = b.hc_y * scale;
    if (x < 5 || x > W - 5 || y < 5 || y > H - 5) return;
    const color = sprayColor(b.event);
    dots += `<circle class="spray-dot" data-idx="${i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${color}" opacity="0.85" stroke="#0f1419" stroke-width="0.8" style="cursor:pointer"></circle>`;
  });

  svg.innerHTML = `
    <defs>
      <linearGradient id="sprayGrass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#245c24"/>
        <stop offset="100%" stop-color="#2f6b2f"/>
      </linearGradient>
    </defs>
    <rect class="spray-bg" width="${W}" height="${H}" fill="#152215"/>
    <path d="M40 420 Q250 20 460 420 L250 470 Z" fill="url(#sprayGrass)" opacity="0.95"/>
    <path d="M250 470 L155 370 L250 270 L345 370 Z" fill="#b8956a"/>
    <path d="M250 455 L175 370 L250 290 L325 370 Z" fill="#2f6b2f"/>
    <line x1="250" y1="470" x2="40" y2="200" stroke="#e5e7eb" stroke-width="1.5" opacity="0.7"/>
    <line x1="250" y1="470" x2="460" y2="200" stroke="#e5e7eb" stroke-width="1.5" opacity="0.7"/>
    <circle cx="250" cy="470" r="5" fill="#f8f8f8"/>
    ${dots}
    <g font-size="11" fill="#e8edf2">
      <circle cx="30" cy="485" r="4" fill="#22c55e"/><text x="40" y="489">1B</text>
      <circle cx="80" cy="485" r="4" fill="#3b82f6"/><text x="90" y="489">2B</text>
      <circle cx="130" cy="485" r="4" fill="#f59e0b"/><text x="140" y="489">3B</text>
      <circle cx="180" cy="485" r="4" fill="#ef4444"/><text x="190" y="489">HR</text>
      <circle cx="230" cy="485" r="4" fill="#94a3b8"/><text x="240" y="489">Out</text>
    </g>
  `;

  // Re-attach ball list after innerHTML wipe
  svg._sprayBalls = balls || [];
  let selectedIdx = null;

  function applySelection(idx) {
    selectedIdx = idx;
    svg.querySelectorAll(".spray-dot").forEach(c => {
      const i = Number(c.getAttribute("data-idx"));
      if (idx == null) {
        c.setAttribute("opacity", "0.85");
        c.setAttribute("r", "4.5");
        c.setAttribute("stroke", "#0f1419");
        c.setAttribute("stroke-width", "0.8");
        c.classList.remove("spray-selected");
      } else if (i === idx) {
        c.setAttribute("opacity", "1");
        c.setAttribute("r", "8");
        c.setAttribute("stroke", "#ffffff");
        c.setAttribute("stroke-width", "2.5");
        c.classList.add("spray-selected");
      } else {
        c.setAttribute("opacity", "0.18");
        c.setAttribute("r", "4");
        c.setAttribute("stroke", "#0f1419");
        c.setAttribute("stroke-width", "0.5");
        c.classList.remove("spray-selected");
      }
    });
    showSprayDetail(idx == null ? null : (balls || [])[idx]);
  }

  svg.querySelectorAll(".spray-dot").forEach(c => {
    c.addEventListener("click", ev => {
      ev.stopPropagation();
      const i = Number(c.getAttribute("data-idx"));
      applySelection(selectedIdx === i ? null : i);
    });
  });

  // Click empty field clears selection
  svg.querySelector(".spray-bg")?.addEventListener("click", () => {
    applySelection(null);
  });


  showSprayDetail(null);
}

/* =========================================================
   ZONE PROFILE + PITCH ARSENAL
========================================================= */
async function fetchSavantPitcherChunk(playerId, start, end) {
  const url =
    "https://baseballsavant.mlb.com/statcast_search/csv?" +
    new URLSearchParams({
      all: "true",
      hfGT: "R|",
      player_type: "pitcher",
      game_date_gt: start,
      game_date_lt: end,
      "pitchers_lookup[]": String(playerId),
      min_pitches: "0",
      min_results: "0",
      type: "details"
    }).toString();
  const res = await fetch(url);
  if (!res.ok) return [];
  const text = await res.text();
  if (!text || text.trim().startsWith("<")) return [];
  return parseCSV(text);
}

async function loadChartsForSeason() {
  await Promise.all([loadSprayChart(), loadZoneAndArsenal()]);
}

function isPrimarilyPitcher() {
  // Pure pitchers: primary P and no meaningful year-by-year hitting
  const pos = (person?.primaryPosition?.abbreviation || "").toUpperCase();
  if (pos === "TWP") return false;
  if (yearByYearHitting.length > 0 && yearByYearPitching.length > 0) {
    // two-way data present (e.g. Ohtani)
    return false;
  }
  return pos === "P" || (yearByYearPitching.length > 0 && yearByYearHitting.length === 0);
}

function isRealHitter() {
  // Show spray / hitter zone only for actual hitters / two-way
  return !isPrimarilyPitcher() && yearByYearHitting.length > 0;
}

async function loadZoneAndArsenal() {
  const season = getSeason();
  const zoneSvg = $("zoneSvg");
  const arsenalCard = $("pitchArsenalCard");
  const arsenalBlock = $("pitchArsenalBlock");
  const zoneNote = $("zoneChartNote");
  const sprayCard = $("sprayCard");
  const zoneCard = $("zoneProfileCard");
  const pitchLocCard = $("pitchLocCard");

  const showHitterCharts = isRealHitter();
  const showPitcherCharts = yearByYearPitching.length > 0 || isPrimarilyPitcher();

  if (sprayCard) sprayCard.style.display = showHitterCharts ? "block" : "none";
  if (zoneCard) zoneCard.style.display = showHitterCharts ? "block" : "none";
  if (pitchLocCard) pitchLocCard.style.display = showPitcherCharts ? "block" : "none";
  if (arsenalCard) arsenalCard.style.display = showPitcherCharts ? "block" : "none";

  try {
    const chunks = seasonDateChunks(season);

    if (showHitterCharts) {
      if (zoneSvg) {
        zoneSvg.innerHTML = `<text x="160" y="200" text-anchor="middle" fill="#8b9aab" font-size="13">Loading zone…</text>`;
      }
      const parts = await Promise.all(
        chunks.map(([a, b]) => fetchSavantBatterChunk(playerId, a, b))
      );
      renderZoneChart(parts.flat(), season, {
        titleMode: "hitter",
        svgId: "zoneSvg",
        detailId: "zoneDetail",
        noteId: "zoneChartNote"
      });
    }

    if (showPitcherCharts) {
      const locSvg = $("pitchLocSvg");
      if (locSvg) {
        locSvg.innerHTML = `<text x="160" y="200" text-anchor="middle" fill="#8b9aab" font-size="13">Loading pitch locations…</text>`;
      }
      if (arsenalBlock) arsenalBlock.innerHTML = `<p class="empty-state">Loading arsenal…</p>`;
      const parts = await Promise.all(
        chunks.map(([a, b]) => fetchSavantPitcherChunk(playerId, a, b))
      );
      const pitcherRows = parts.flat();
      renderZoneChart(pitcherRows, season, {
        titleMode: "pitcher",
        svgId: "pitchLocSvg",
        detailId: "pitchLocDetail",
        noteId: "pitchLocNote"
      });
      renderPitchArsenal(pitcherRows, season);
    }
  } catch (e) {
    console.error("Zone/arsenal error:", e);
    if (zoneSvg) {
      zoneSvg.innerHTML = `<text x="160" y="200" text-anchor="middle" fill="#8b9aab" font-size="13">Could not load zone data</text>`;
    }
  }
}

function renderZoneChart(rows, season, opts = {}) {
  const svg = $(opts.svgId || "zoneSvg");
  const note = $(opts.noteId || "zoneChartNote");
  const detail = $(opts.detailId || "zoneDetail");
  const titleMode = opts.titleMode || "hitter";
  if (!svg) return;

  // Typical strike zone in feet (catcher view): plate_x ∈ [-0.83, 0.83], plate_z ≈ 1.5–3.5
  const ZONE_LEFT = -0.83;
  const ZONE_RIGHT = 0.83;
  const ZONE_BOT = 1.5;
  const ZONE_TOP = 3.5;

  const W = 320;
  const H = 400;
  const pad = 40;
  const zoneW = W - pad * 2;
  const zoneH = H - pad * 2 - 30;

  function toSvg(px, pz) {
    const x = pad + ((px - ZONE_LEFT) / (ZONE_RIGHT - ZONE_LEFT)) * zoneW;
    const y = pad + ((ZONE_TOP - pz) / (ZONE_TOP - ZONE_BOT)) * zoneH;
    return { x, y };
  }

  const pitches = [];
  rows.forEach(row => {
    const px = Number(row.plate_x);
    const pz = Number(row.plate_z);
    if (Number.isNaN(px) || Number.isNaN(pz)) return;
    const desc = (row.description || "").toLowerCase();
    const ev = (row.events || "").trim();
    let kind = "other";
    if (desc.includes("swinging_strike") || desc.includes("miss")) kind = "whiff";
    else if (desc.includes("foul")) kind = "foul";
    else if (desc.includes("hit_into_play") || desc.includes("in_play") || HIT_EVENTS.has(ev)) kind = "bip";
    else if (desc.includes("called_strike")) kind = "called";
    else if (desc.includes("ball")) kind = "ball";

    const topBot = (row.inning_topbot || "").toLowerCase();
    const home = row.home_team || "";
    const away = row.away_team || "";
    let opponent = "";
    if (topBot.startsWith("top")) opponent = home;
    else if (topBot.startsWith("bot")) opponent = away;

    pitches.push({
      plate_x: px,
      plate_z: pz,
      kind,
      event: ev,
      description: row.description || "",
      pitch_type: row.pitch_name || row.pitch_type || "",
      release_speed: row.release_speed,
      launch_speed: row.launch_speed,
      game_date: row.game_date || "",
      opponent
    });
  });

  let plot;
  if (titleMode === "pitcher") {
    // Decisive outcomes only — avoids overcrowding
    // K, BB, HR, hits (1B/2B/3B)
    plot = pitches.filter(p => {
      const ev = (p.event || "").toLowerCase();
      const desc = (p.description || "").toLowerCase();
      if (ev === "strikeout" || ev === "strikeout_double_play") return true;
      if (ev === "walk" || ev === "intent_walk" || ev === "hit_by_pitch") return true;
      if (ev === "home_run") return true;
      if (ev === "single" || ev === "double" || ev === "triple") return true;
      // Some rows only set description on the final pitch
      if (desc.includes("strikes out") || desc.includes("strikeout")) return true;
      if (desc.includes("walks") || desc.includes("intentionally walks")) return true;
      return false;
    }).map(p => {
      const ev = (p.event || "").toLowerCase();
      let outcome = "other";
      if (ev === "home_run") outcome = "hr";
      else if (ev === "triple") outcome = "3b";
      else if (ev === "double") outcome = "2b";
      else if (ev === "single") outcome = "1b";
      else if (ev === "walk" || ev === "intent_walk" || ev === "hit_by_pitch") outcome = "bb";
      else if (ev === "strikeout" || ev === "strikeout_double_play") outcome = "k";
      else if ((p.description || "").toLowerCase().includes("strike")) outcome = "k";
      else if ((p.description || "").toLowerCase().includes("walk")) outcome = "bb";
      return { ...p, outcome };
    });
  } else {
    plot = pitches.filter(p => p.kind === "bip" || p.kind === "whiff" || p.kind === "foul");
    if (plot.length < 15) plot = pitches;
  }

  function zoneColor(p) {
    if (titleMode === "pitcher") {
      switch (p.outcome) {
        case "hr": return "#ef4444";
        case "3b": return "#f59e0b";
        case "2b": return "#3b82f6";
        case "1b": return "#22c55e";
        case "bb": return "#a3e635";
        case "k": return "#c084fc";
        default: return "#94a3b8";
      }
    }
    if (p.kind === "bip") return "#3b82f6";
    if (p.kind === "whiff") return "#ef4444";
    if (p.kind === "foul") return "#f59e0b";
    if (p.kind === "called") return "#a78bfa";
    if (p.kind === "ball") return "#22c55e";
    return "#94a3b8";
  }

  let dots = "";
  plot.forEach((p, i) => {
    const { x, y } = toSvg(p.plate_x, p.plate_z);
    // keep slightly outside zone visible
    const cx = Math.max(8, Math.min(W - 8, x));
    const cy = Math.max(8, Math.min(H - 24, y));
    dots += `<circle class="zone-dot" data-idx="${i}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.5" fill="${zoneColor(p)}" opacity="0.75" stroke="#0f1419" stroke-width="0.6" style="cursor:pointer"></circle>`;
  });

  // 3x3 grid lines inside zone
  const gx1 = pad + zoneW / 3;
  const gx2 = pad + (2 * zoneW) / 3;
  const gy1 = pad + zoneH / 3;
  const gy2 = pad + (2 * zoneH) / 3;

  svg.innerHTML = `
    <rect width="${W}" height="${H}" fill="#0b1117"/>
    <rect x="${pad}" y="${pad}" width="${zoneW}" height="${zoneH}" fill="#050505" stroke="#fff" stroke-width="3"/>
    <line x1="${gx1}" y1="${pad}" x2="${gx1}" y2="${pad + zoneH}" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
    <line x1="${gx2}" y1="${pad}" x2="${gx2}" y2="${pad + zoneH}" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
    <line x1="${pad}" y1="${gy1}" x2="${pad + zoneW}" y2="${gy1}" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
    <line x1="${pad}" y1="${gy2}" x2="${pad + zoneW}" y2="${gy2}" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
    <!-- home plate cue -->
    <path d="M${pad + zoneW * 0.35} ${pad + zoneH + 8} L${pad + zoneW * 0.65} ${pad + zoneH + 8} L${pad + zoneW * 0.5} ${pad + zoneH + 22} Z" fill="#e5e7eb"/>
    ${dots}
    <g font-size="10" fill="#cbd5e1">
      ${titleMode === "pitcher"
        ? `<circle cx="18" cy="388" r="3.5" fill="#c084fc"/><text x="26" y="391">K</text>
           <circle cx="55" cy="388" r="3.5" fill="#a3e635"/><text x="63" y="391">BB</text>
           <circle cx="100" cy="388" r="3.5" fill="#22c55e"/><text x="108" y="391">1B</text>
           <circle cx="145" cy="388" r="3.5" fill="#3b82f6"/><text x="153" y="391">2B</text>
           <circle cx="190" cy="388" r="3.5" fill="#f59e0b"/><text x="198" y="391">3B</text>
           <circle cx="235" cy="388" r="3.5" fill="#ef4444"/><text x="243" y="391">HR</text>`
        : `<circle cx="24" cy="388" r="3.5" fill="#3b82f6"/><text x="32" y="391">In play</text>
           <circle cx="100" cy="388" r="3.5" fill="#ef4444"/><text x="108" y="391">Whiff</text>
           <circle cx="170" cy="388" r="3.5" fill="#f59e0b"/><text x="178" y="391">Foul</text>
           <circle cx="230" cy="388" r="3.5" fill="#a78bfa"/><text x="238" y="391">Called</text>`}
    </g>
  `;

  if (note) {
    if (titleMode === "pitcher") {
      note.textContent = plot.length
        ? `${plot.length} results · K / BB / hits / HR · ${season}`
        : `No K/BB/hit/HR locations for ${season}.`;
    } else {
      note.textContent = plot.length
        ? `${plot.length} pitches plotted · ${season} (hitter / catcher view)`
        : `No pitch locations for ${season}.`;
    }
  }

  let selected = null;
  function select(idx) {
    selected = idx;
    svg.querySelectorAll(".zone-dot").forEach(c => {
      const i = Number(c.getAttribute("data-idx"));
      if (idx == null) {
        c.setAttribute("opacity", "0.8");
        c.setAttribute("r", "3.5");
        c.setAttribute("stroke-width", "0.6");
      } else if (i === idx) {
        c.setAttribute("opacity", "1");
        c.setAttribute("r", "7");
        c.setAttribute("stroke", "#fff");
        c.setAttribute("stroke-width", "2");
      } else {
        c.setAttribute("opacity", "0.15");
        c.setAttribute("r", "3");
      }
    });
    if (!detail) return;
    if (idx == null) {
      detail.className = "spray-detail empty-state";
      detail.textContent = "Click a pitch in the zone for details.";
      return;
    }
    const p = plot[idx];
    detail.className = "spray-detail";
    const outcomeLabel = titleMode === "pitcher"
      ? ({ k: "Strikeout", bb: "Walk / HBP", "1b": "Single", "2b": "Double", "3b": "Triple", hr: "Home run" }[p.outcome] || (p.event || p.kind || "").replace(/_/g, " "))
      : (p.kind || "").toUpperCase();
    detail.innerHTML = `
      <div class="spray-detail-main">
        <strong>${outcomeLabel}</strong>
        <span class="spray-detail-meta">${[p.pitch_type, p.release_speed ? Number(p.release_speed).toFixed(1) + " mph" : ""].filter(Boolean).join(" · ")}</span>
      </div>
      <div class="spray-detail-game">
        <span>${formatSprayDate(p.game_date)}</span>
        ${p.opponent ? `<span class="dot">·</span><span>vs ${p.opponent}</span>` : ""}
        ${p.description ? `<span class="dot">·</span><span>${p.description}</span>` : ""}
      </div>
    `;
  }

  svg.querySelectorAll(".zone-dot").forEach(c => {
    c.addEventListener("click", e => {
      e.stopPropagation();
      const i = Number(c.getAttribute("data-idx"));
      select(selected === i ? null : i);
    });
  });
  select(null);
}

function renderPitchArsenal(rows, season) {
  const block = $("pitchArsenalBlock");
  const card = $("pitchArsenalCard");
  const note = $("arsenalNote");
  if (!block) return;

  const byType = new Map();
  rows.forEach(row => {
    const key = (row.pitch_name || row.pitch_type || "").trim() || "Unknown";
    if (!key || key === "null") return;
    const speed = Number(row.release_speed);
    const desc = (row.description || "").toLowerCase();
    const isWhiff = desc.includes("swinging_strike") || desc.includes("missed_bunt");
    const isSwing =
      isWhiff ||
      desc.includes("foul") ||
      desc.includes("hit_into_play") ||
      desc.includes("swinging");

    if (!byType.has(key)) {
      byType.set(key, { name: key, n: 0, veloSum: 0, veloN: 0, whiffs: 0, swings: 0 });
    }
    const o = byType.get(key);
    o.n += 1;
    if (!Number.isNaN(speed) && speed > 0) {
      o.veloSum += speed;
      o.veloN += 1;
    }
    if (isWhiff) o.whiffs += 1;
    if (isSwing) o.swings += 1;
  });

  const total = [...byType.values()].reduce((s, x) => s + x.n, 0);
  if (!total) {
    if (card) card.style.display = "none";
    block.innerHTML = `<p class="empty-state">No pitch arsenal data for ${season}.</p>`;
    return;
  }

  if (card) card.style.display = "block";
  const list = [...byType.values()].sort((a, b) => b.n - a.n);

  let html = `<div class="table-scroll"><table class="player-detail-table">
    <thead><tr>
      <th>Pitch</th><th>#</th><th>Usage</th><th>Avg Velo</th><th>Whiff%</th>
    </tr></thead><tbody>`;
  list.forEach(p => {
    const usage = ((p.n / total) * 100).toFixed(1) + "%";
    const velo = p.veloN ? (p.veloSum / p.veloN).toFixed(1) : "—";
    const whiff = p.swings ? ((p.whiffs / p.swings) * 100).toFixed(1) + "%" : "—";
    html += `<tr>
      <td style="text-align:left;font-weight:600">${p.name}</td>
      <td>${p.n}</td>
      <td>${usage}</td>
      <td>${velo}</td>
      <td>${whiff}</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  block.innerHTML = html;
  if (note) note.textContent = `${total} pitches · ${season}`;
}



/* =========================================================
   SITUATIONAL SPLITS (Advanced tab)
========================================================= */
async function fetchStatSplits(group, season) {
  const sit = "vl,vr,risp,h,a";
  const url =
    `${MLB_API}/people/${playerId}/stats?stats=statSplits` +
    `&group=${group}&season=${season}&sitCodes=${sit}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    return data.stats?.[0]?.splits || [];
  } catch {
    return [];
  }
}

function splitByCode(splits) {
  const map = {};
  (splits || []).forEach(sp => {
    const code = sp.split?.code || sp.split?.description;
    if (code) map[code] = sp;
  });
  return map;
}

function opsOf(stat) {
  if (!stat) return null;
  if (stat.ops != null && stat.ops !== "") return stat.ops;
  const o = Number(stat.obp);
  const s = Number(stat.slg);
  if (Number.isFinite(o) && Number.isFinite(s)) {
    return (o + s).toFixed(3).replace(/^0\./, ".");
  }
  return null;
}

function plainLine(text) {
  return `<p class="sit-plain">${text}</p>`;
}

function buildHitterSummary(map) {
  const vl = map.vl?.stat;
  const vr = map.vr?.stat;
  const lines = [];
  if (vl && vr) {
    const opsL = opsOf(vl);
    const opsR = opsOf(vr);
    const paL = vl.plateAppearances || 0;
    const paR = vr.plateAppearances || 0;
    if (opsL && opsR) {
      const nL = Number(opsL);
      const nR = Number(opsR);
      if (nR - nL >= 0.08) {
        lines.push(
          `Stronger vs right-handers (OPS ${opsR} in ${paR} PA) than vs lefties (OPS ${opsL} in ${paL} PA).`
        );
      } else if (nL - nR >= 0.08) {
        lines.push(
          `Stronger vs left-handers (OPS ${opsL} in ${paL} PA) than vs righties (OPS ${opsR} in ${paR} PA).`
        );
      } else {
        lines.push(
          `Similar production vs LHP (OPS ${opsL}, ${paL} PA) and RHP (OPS ${opsR}, ${paR} PA).`
        );
      }
    }
  }
  const risp = map.risp?.stat;
  if (risp && (risp.plateAppearances || 0) >= 30) {
    lines.push(
      `With RISP: ${risp.avg || "—"} AVG, OPS ${opsOf(risp) || "—"} (${risp.plateAppearances} PA).`
    );
  }
  const home = map.h?.stat;
  const away = map.a?.stat;
  if (home && away) {
    const oH = opsOf(home);
    const oA = opsOf(away);
    if (oH && oA) {
      lines.push(
        `Home OPS ${oH} (${home.plateAppearances || 0} PA) · Road OPS ${oA} (${away.plateAppearances || 0} PA).`
      );
    }
  }
  if (!lines.length) return plainLine("Not enough split data for this season.");
  return lines.map(plainLine).join("");
}

function buildPitcherSummary(map) {
  const vl = map.vl?.stat;
  const vr = map.vr?.stat;
  const lines = [];
  if (vl && vr) {
    const avgL = vl.avg || "—";
    const avgR = vr.avg || "—";
    const ipL = vl.inningsPitched || "—";
    const ipR = vr.inningsPitched || "—";
    const nL = Number(vl.avg);
    const nR = Number(vr.avg);
    if (Number.isFinite(nL) && Number.isFinite(nR)) {
      if (nR + 0.025 < nL) {
        lines.push(
          `Handles right-handed batters better (BA against ${avgR} in ${ipR} IP) than lefties (${avgL} in ${ipL} IP).`
        );
      } else if (nL + 0.025 < nR) {
        lines.push(
          `Handles left-handed batters better (BA against ${avgL} in ${ipL} IP) than righties (${avgR} in ${ipR} IP).`
        );
      } else {
        lines.push(
          `Similar BA against LHB (${avgL}, ${ipL} IP) and RHB (${avgR}, ${ipR} IP).`
        );
      }
    }
  }
  const home = map.h?.stat;
  const away = map.a?.stat;
  if (home?.era && away?.era) {
    lines.push(
      `Home ERA ${home.era} (${home.inningsPitched} IP) · Road ERA ${away.era} (${away.inningsPitched} IP).`
    );
  }
  if (!lines.length) return plainLine("Not enough split data for this season.");
  return lines.map(plainLine).join("");
}

function renderHitterSplitTable(map) {
  const rows = [
    ["vs LHP", map.vl],
    ["vs RHP", map.vr],
    ["RISP", map.risp],
    ["Home", map.h],
    ["Away", map.a]
  ];
  let html = `<div class="table-scroll"><table class="player-detail-table">
    <thead><tr>
      <th>Split</th><th>PA</th><th>AB</th><th>H</th><th>HR</th><th>BB</th><th>SO</th>
      <th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th>
    </tr></thead><tbody>`;
  rows.forEach(([label, sp]) => {
    if (!sp?.stat) {
      html += `<tr><td>${label}</td><td colspan="10" class="empty-state">—</td></tr>`;
      return;
    }
    const s = sp.stat;
    html += `<tr>
      <td style="text-align:left;font-weight:600">${label}</td>
      <td>${s.plateAppearances ?? "—"}</td>
      <td>${s.atBats ?? "—"}</td>
      <td>${s.hits ?? "—"}</td>
      <td>${s.homeRuns ?? "—"}</td>
      <td>${s.baseOnBalls ?? "—"}</td>
      <td>${s.strikeOuts ?? "—"}</td>
      <td>${s.avg ?? "—"}</td>
      <td>${s.obp ?? "—"}</td>
      <td>${s.slg ?? "—"}</td>
      <td>${opsOf(s) ?? "—"}</td>
    </tr>`;
  });
  return html + `</tbody></table></div>`;
}

function renderPitcherSplitTable(map) {
  const rows = [
    ["vs LHB", map.vl],
    ["vs RHB", map.vr],
    ["RISP", map.risp],
    ["Home", map.h],
    ["Away", map.a]
  ];
  let html = `<div class="table-scroll"><table class="player-detail-table">
    <thead><tr>
      <th>Split</th><th>IP</th><th>H</th><th>ER</th><th>BB</th><th>SO</th>
      <th>ERA</th><th>WHIP</th><th>BA against</th>
    </tr></thead><tbody>`;
  rows.forEach(([label, sp]) => {
    if (!sp?.stat) {
      html += `<tr><td>${label}</td><td colspan="8" class="empty-state">—</td></tr>`;
      return;
    }
    const s = sp.stat;
    html += `<tr>
      <td style="text-align:left;font-weight:600">${label}</td>
      <td>${s.inningsPitched ?? "—"}</td>
      <td>${s.hits ?? "—"}</td>
      <td>${s.earnedRuns ?? "—"}</td>
      <td>${s.baseOnBalls ?? "—"}</td>
      <td>${s.strikeOuts ?? "—"}</td>
      <td>${s.era ?? "—"}</td>
      <td>${s.whip ?? "—"}</td>
      <td>${s.avg ?? "—"}</td>
    </tr>`;
  });
  return html + `</tbody></table></div>`;
}

async function loadSituationalSplits() {
  const season = getSeason();
  const summary = $("situationalSummary");
  const hitCard = $("sitHittingCard");
  const pitCard = $("sitPitchingCard");
  const hitBlock = $("sitHittingBlock");
  const pitBlock = $("sitPitchingBlock");
  if (summary) {
    summary.className = "sit-summary empty-state";
    summary.textContent = "Loading splits…";
  }

  // Pure pitchers: no hitting splits (empty / meaningless)
  const purePitcher = isPitcher && !isTwoWay;
  const showHit = !purePitcher && yearByYearHitting.length > 0;
  const showPit = yearByYearPitching.length > 0 || isPitcher;

  if (hitCard) hitCard.style.display = showHit ? "block" : "none";
  if (pitCard) pitCard.style.display = showPit ? "block" : "none";

  try {
    const tasks = [];
    if (showHit) tasks.push(fetchStatSplits("hitting", season));
    else tasks.push(Promise.resolve([]));
    if (showPit) tasks.push(fetchStatSplits("pitching", season));
    else tasks.push(Promise.resolve([]));

    const [hitSplits, pitSplits] = await Promise.all(tasks);
    const hitMap = splitByCode(hitSplits);
    const pitMap = splitByCode(pitSplits);

    let summaryHtml = "";
    if (showHit) summaryHtml += buildHitterSummary(hitMap);
    if (showPit) summaryHtml += buildPitcherSummary(pitMap);
    if (summary) {
      summary.className = "sit-summary";
      summary.innerHTML =
        summaryHtml ||
        `<p class="empty-state">No situational splits for ${season}.</p>`;
    }
    if (hitBlock && showHit) hitBlock.innerHTML = renderHitterSplitTable(hitMap);
    if (pitBlock && showPit) pitBlock.innerHTML = renderPitcherSplitTable(pitMap);
  } catch (e) {
    console.error("situational splits", e);
    if (summary) {
      summary.className = "sit-summary empty-state";
      summary.textContent = "Could not load situational splits.";
    }
  }
}


async function loadPitchTypePerformance() {
  const card = $("pitchTypeCard");
  const block = $("pitchTypeBlock");
  const note = $("pitchTypeNote");
  if (!card || !block) return;

  const purePitcher = isPitcher && !isTwoWay;
  if (purePitcher || !yearByYearHitting.length) {
    card.style.display = "none";
    return;
  }
  card.style.display = "block";
  block.innerHTML = `<p class="empty-state">Loading pitch-type results…</p>`;

  const season = getSeason();
  try {
    const chunks = seasonDateChunks(season);
    const parts = await Promise.all(
      chunks.map(([a, b]) => fetchSavantBatterChunk(playerId, a, b))
    );
    const rows = parts.flat();
    const by = new Map();

    rows.forEach(row => {
      const name = (row.pitch_name || row.pitch_type || "").trim();
      if (!name || name === "null") return;
      const desc = (row.description || "").toLowerCase();
      const ev = (row.events || "").trim();
      if (!by.has(name)) {
        by.set(name, {
          name,
          pitches: 0,
          swings: 0,
          whiffs: 0,
          bip: 0,
          hits: 0,
          hr: 0,
          pa_end: 0
        });
      }
      const o = by.get(name);
      o.pitches += 1;
      const isWhiff =
        desc.includes("swinging_strike") || desc.includes("missed_bunt");
      const isSwing =
        isWhiff ||
        desc.includes("foul") ||
        desc.includes("hit_into_play") ||
        desc.includes("swinging");
      if (isSwing) o.swings += 1;
      if (isWhiff) o.whiffs += 1;
      if (HIT_EVENTS.has(ev) || desc.includes("hit_into_play")) {
        o.bip += 1;
        if (["single", "double", "triple", "home_run"].includes(ev)) {
          o.hits += 1;
        }
        if (ev === "home_run") o.hr += 1;
      }
      if (ev) o.pa_end += 1;
    });

    const list = [...by.values()].filter(x => x.pitches >= 15);
    list.sort((a, b) => b.pitches - a.pitches);

    if (!list.length) {
      block.innerHTML = `<p class="empty-state">No pitch-type data for ${season}.</p>`;
      if (note) note.textContent = "Need Statcast pitch data for this season.";
      return;
    }

    let html = `<div class="table-scroll"><table class="player-detail-table">
      <thead><tr>
        <th>Pitch</th><th>Pitches</th><th>Whiff%</th><th>In play</th><th>H</th><th>HR</th>
      </tr></thead><tbody>`;
    list.forEach(p => {
      const whiff =
        p.swings > 0 ? ((p.whiffs / p.swings) * 100).toFixed(1) + "%" : "—";
      html += `<tr>
        <td style="text-align:left;font-weight:600">${p.name}</td>
        <td>${p.pitches}</td>
        <td>${whiff}</td>
        <td>${p.bip}</td>
        <td>${p.hits}</td>
        <td>${p.hr}</td>
      </tr>`;
    });
    block.innerHTML = html + `</tbody></table></div>`;
    if (note) {
      note.textContent = `${season} · min 15 pitches · higher hits/HR with low whiff% = handled that pitch well`;
    }
  } catch (e) {
    console.error(e);
    block.innerHTML = `<p class="empty-state">Could not load pitch-type data.</p>`;
  }
}



function parseIP(ip) {
  if (ip == null || ip === "") return 0;
  const parts = String(ip).split(".");
  return (Number(parts[0]) || 0) + (Number(parts[1]) || 0) / 3;
}

/* =========================================================
   VS TEAMS / WAR / BAT SPEED
========================================================= */
function parseRateStr(v) {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchGameLog(group, season) {
  const url =
    `${MLB_API}/people/${playerId}/stats?stats=gameLog&group=${group}` +
    `&season=${season}&sportIds=1`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    return data.stats?.[0]?.splits || [];
  } catch {
    return [];
  }
}

function aggregateHitterVsTeams(splits) {
  const map = new Map();
  splits.forEach(sp => {
    const opp = sp.opponent;
    if (!opp?.id) return;
    const key = String(opp.id);
    if (!map.has(key)) {
      map.set(key, {
        id: opp.id,
        name: opp.name,
        abbr: opp.abbreviation || opp.name,
        pa: 0,
        ab: 0,
        h: 0,
        hr: 0,
        bb: 0,
        so: 0,
        hbp: 0,
        tb: 0
      });
    }
    const o = map.get(key);
    const s = sp.stat || {};
    o.pa += Number(s.plateAppearances) || 0;
    o.ab += Number(s.atBats) || 0;
    o.h += Number(s.hits) || 0;
    o.hr += Number(s.homeRuns) || 0;
    o.bb += Number(s.baseOnBalls) || 0;
    o.so += Number(s.strikeOuts) || 0;
    o.hbp += Number(s.hitByPitch) || 0;
    if (s.totalBases != null) o.tb += Number(s.totalBases) || 0;
    else {
      // crude if missing
      o.tb += (Number(s.hits) || 0) + (Number(s.homeRuns) || 0) * 2;
    }
  });
  return [...map.values()].map(o => {
    const avg = o.ab ? o.h / o.ab : 0;
    const obp = o.pa ? (o.h + o.bb + o.hbp) / o.pa : 0;
    const slg = o.ab ? o.tb / o.ab : 0;
    return {
      ...o,
      avg,
      obp,
      slg,
      ops: obp + slg
    };
  });
}

function aggregatePitcherVsTeams(splits) {
  const map = new Map();
  splits.forEach(sp => {
    const opp = sp.opponent;
    if (!opp?.id) return;
    const key = String(opp.id);
    if (!map.has(key)) {
      map.set(key, {
        id: opp.id,
        name: opp.name,
        ip: 0,
        er: 0,
        h: 0,
        bb: 0,
        so: 0,
        hr: 0
      });
    }
    const o = map.get(key);
    const s = sp.stat || {};
    o.ip += parseIP(s.inningsPitched);
    o.er += Number(s.earnedRuns) || 0;
    o.h += Number(s.hits) || 0;
    o.bb += Number(s.baseOnBalls) || 0;
    o.so += Number(s.strikeOuts) || 0;
    o.hr += Number(s.homeRuns) || 0;
  });
  return [...map.values()].map(o => {
    const era = o.ip > 0 ? (o.er * 9) / o.ip : 99;
    const whip = o.ip > 0 ? (o.h + o.bb) / o.ip : 99;
    return { ...o, era, whip };
  });
}

function formatIPLocal(ip) {
  const whole = Math.floor(ip);
  const outs = Math.round((ip - whole) * 3);
  if (outs === 3) return `${whole + 1}.0`;
  return `${whole}.${outs}`;
}

async function loadVsTeams() {
  const block = $("vsTeamsBlock");
  if (!block) return;
  block.className = "empty-state";
  block.textContent = "Loading opponent splits…";
  const season = getSeason();
  const purePitcher = isPitcher && !isTwoWay;
  const showHit = !purePitcher && yearByYearHitting.length > 0;
  const showPit = yearByYearPitching.length > 0 || isPitcher;

  try {
    let html = "";
    if (showHit) {
      const logs = await fetchGameLog("hitting", season);
      let teams = aggregateHitterVsTeams(logs).filter(t => t.pa >= 15);
      teams.sort((a, b) => b.ops - a.ops);
      const best = teams.slice(0, 5);
      const worst = [...teams].sort((a, b) => a.ops - b.ops).slice(0, 5);
      html += `<h3 class="sit-subhead">Hitting — best OPS (min 15 PA)</h3>`;
      html += vsTeamHitTable(best);
      html += `<h3 class="sit-subhead">Hitting — lowest OPS (min 15 PA)</h3>`;
      html += vsTeamHitTable(worst);
      if (!teams.length) {
        html += `<p class="empty-state">Not enough opponent PA in ${season}.</p>`;
      }
    }
    if (showPit) {
      const logs = await fetchGameLog("pitching", season);
      let teams = aggregatePitcherVsTeams(logs).filter(t => t.ip >= 3);
      teams.sort((a, b) => a.era - b.era);
      const best = teams.slice(0, 5);
      const worst = [...teams].sort((a, b) => b.era - a.era).slice(0, 5);
      html += `<h3 class="sit-subhead">Pitching — lowest ERA allowed (min 3 IP)</h3>`;
      html += vsTeamPitTable(best);
      html += `<h3 class="sit-subhead">Pitching — highest ERA allowed (min 3 IP)</h3>`;
      html += vsTeamPitTable(worst);
      if (!teams.length && purePitcher) {
        html += `<p class="empty-state">Not enough opponent IP in ${season}.</p>`;
      }
    }
    block.className = "";
    block.innerHTML = html || `<p class="empty-state">No vs-team data.</p>`;
  } catch (e) {
    console.error(e);
    block.textContent = "Could not load vs-team splits.";
  }
}

function vsTeamHitTable(list) {
  if (!list.length) return `<p class="empty-state">—</p>`;
  let html = `<div class="table-scroll"><table class="player-detail-table"><thead><tr>
    <th>Team</th><th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>HR</th>
  </tr></thead><tbody>`;
  list.forEach(t => {
    html += `<tr>
      <td style="text-align:left;font-weight:600">${t.name}</td>
      <td>${t.pa}</td>
      <td>${format3(t.avg)}</td>
      <td>${format3(t.obp)}</td>
      <td>${format3(t.slg)}</td>
      <td><strong>${format3(t.ops)}</strong></td>
      <td>${t.hr}</td>
    </tr>`;
  });
  return html + `</tbody></table></div>`;
}

function vsTeamPitTable(list) {
  if (!list.length) return `<p class="empty-state">—</p>`;
  let html = `<div class="table-scroll"><table class="player-detail-table"><thead><tr>
    <th>Team</th><th>IP</th><th>ERA</th><th>WHIP</th><th>SO</th><th>BB</th><th>HR</th>
  </tr></thead><tbody>`;
  list.forEach(t => {
    html += `<tr>
      <td style="text-align:left;font-weight:600">${t.name}</td>
      <td>${formatIPLocal(t.ip)}</td>
      <td><strong>${format2(t.era)}</strong></td>
      <td>${format2(t.whip)}</td>
      <td>${t.so}</td>
      <td>${t.bb}</td>
      <td>${t.hr}</td>
    </tr>`;
  });
  return html + `</tbody></table></div>`;
}

/** Statitude WAR v1 — batting runs from OPS vs league + replacement; pitching from ERA vs league */
async function loadStatitudeWar() {
  const block = $("warBlock");
  if (!block) return;
  block.className = "empty-state";
  block.textContent = "Calculating…";
  const season = getSeason();

  try {
    const purePitcher = isPitcher && !isTwoWay;
    const parts = [];

    if (!purePitcher && yearByYearHitting.length) {
      const y = yearByYearHitting.find(s => String(s.season) === String(season));
      const st = y?.stat;
      if (st && (Number(st.plateAppearances) || 0) > 0) {
        const pa = Number(st.plateAppearances) || 0;
        const ops = parseRateStr(st.ops) ??
          ((parseRateStr(st.obp) || 0) + (parseRateStr(st.slg) || 0));
        const lgOps = 0.720;
        const opsDiff = ops - lgOps;
        const battingRuns = opsDiff * pa * 0.28; // calibrated vs ~fWAR/bWAR scale
        const repRuns = (pa / 600) * 18;
        const warB = (battingRuns + repRuns) / 10;
        parts.push({
          label: "Batting",
          war: warB,
          detail: `${pa} PA · OPS ${st.ops || format3(ops)} vs lg ~.720 · k=0.28 · runs ${battingRuns.toFixed(1)} + repl ${repRuns.toFixed(1)}`
        });

        // Baserunning v1: SB/CS only
        const sb = Number(st.stolenBases) || 0;
        const cs = Number(st.caughtStealing) || 0;
        const bsrRuns = 0.2 * sb - 0.4 * cs;
        parts.push({
          label: "Baserunning",
          war: bsrRuns / 10,
          detail: `${sb} SB · ${cs} CS · runs = 0.2×SB − 0.4×CS = ${bsrRuns >= 0 ? "+" : ""}${bsrRuns.toFixed(1)}`
        });
      }
    }

    if (yearByYearPitching.length || isPitcher) {
      const y = yearByYearPitching.find(s => String(s.season) === String(season));
      const st = y?.stat;
      if (st) {
        const ip = parseIP(st.inningsPitched);
        if (ip > 0) {
          const era = parseRateStr(st.era) ?? 4.5;
          const lgEra = 4.2;
          const pitchingRuns = ((lgEra - era) / 9) * ip;
          const repRuns = (ip / 150) * 15;
          const warP = (pitchingRuns + repRuns) / 10;
          parts.push({
            label: "Pitching",
            war: warP,
            detail: `${formatIPLocal(ip)} IP · ERA ${st.era || format2(era)} vs lg ~4.20 · runs ${pitchingRuns.toFixed(1)} + repl ${repRuns.toFixed(1)}`
          });
        }
      }
    }

    // Defense: glove (skill) + position (scarcity) — both in the total
    try {
      const fUrl =
        `${MLB_API}/people/${playerId}/stats?stats=season&group=fielding` +
        `&season=${season}&sportIds=1`;
      const fr = await fetch(fUrl);
      if (fr.ok) {
        const fData = await fr.json();
        const fSplits = fData.stats?.[0]?.splits || [];
        let gloveRuns = 0;
        let posRuns = 0;
        const posBits = [];
        fSplits.forEach(sp => {
          const s = sp.stat || {};
          const pos =
            s.position?.abbreviation ||
            sp.position?.abbreviation ||
            s.position?.name ||
            "?";
          if (pos === "DH") return;
          const d = defRunsForSplit(s, pos);
          const glove = d.errRuns + d.rangeRuns;
          gloveRuns += glove;
          posRuns += d.posRuns;
          if (d.inn > 0) {
            posBits.push(
              `${pos} ${d.inn.toFixed(0)}inn (glove ${glove >= 0 ? "+" : ""}${glove.toFixed(1)}, pos ${d.posRuns >= 0 ? "+" : ""}${d.posRuns.toFixed(1)})`
            );
          }
        });
        if (fSplits.some(sp => {
          const s = sp.stat || {};
          const pos = s.position?.abbreviation || sp.position?.abbreviation || "";
          return pos && pos !== "DH" && parseInn(s.innings) > 0;
        })) {
          parts.push({
            label: "Glove",
            war: gloveRuns / 10,
            detail:
              `Fielding skill only (errors + range). ${posBits.slice(0, 3).join(" · ") || ""}`
          });
          parts.push({
            label: "Position",
            war: posRuns / 10,
            detail:
              "Scarcity adjustment (e.g. 1B lower than SS) — not “bad defense.”"
          });
        }
      }
    } catch (fe) {
      console.warn("WAR defense component", fe);
    }

    if (!parts.length) {
      block.textContent = "Not enough season data for Statitude WAR.";
      return;
    }

    const total = parts.reduce((s, p) => s + p.war, 0);
    let html = `<div class="war-hero">
      <div class="war-total">${total.toFixed(1)}</div>
      <div class="war-total-label">Statitude WAR (${season})</div>
    </div><div class="war-parts">`;
    parts.forEach(p => {
      const sign = p.war >= 0 ? "" : "";
      html += `<div class="war-part">
        <div class="war-part-val">${p.war >= 0 ? "+" : ""}${p.war.toFixed(1)}</div>
        <div class="war-part-label">${p.label}</div>
        <div class="war-part-detail">${p.detail}</div>
      </div>`;
    });
    html += `</div>
      <p class="chart-note" style="margin-top:12px;">
        Method (v1.3): Batting = (OPS − .720) × PA × 0.28 + 18×PA/600;
        Pitching = (4.20 − ERA) / 9 × IP + 15×IP/150;
        Glove = error + range; Position = scarcity; Bsr = 0.2×SB − 0.4×CS.
        Total = sum / 10. Tuned so star bats land nearer public WAR scales — still Statitude, not fWAR/bWAR.
      </p>`;
    block.className = "";
    block.innerHTML = html;
  } catch (e) {
    console.error(e);
    block.textContent = "Could not calculate WAR.";
  }
}

async function loadBatSpeed() {
  const card = $("batSpeedCard");
  const block = $("batSpeedBlock");
  if (!card || !block) return;

  const purePitcher = isPitcher && !isTwoWay;
  if (purePitcher || !yearByYearHitting.length) {
    card.style.display = "none";
    return;
  }
  card.style.display = "block";
  block.className = "empty-state";
  block.textContent = "Loading bat speed…";

  const season = getSeason();
  try {
    const chunks = seasonDateChunks(season);
    const parts = await Promise.all(
      chunks.map(([a, b]) => fetchSavantBatterChunk(playerId, a, b))
    );
    const rows = parts.flat();
    const speeds = [];
    const evs = [];
    const angles = [];
    rows.forEach(row => {
      const bs = Number(row.bat_speed);
      if (Number.isFinite(bs) && bs > 40) speeds.push(bs);
      const desc = (row.description || "").toLowerCase();
      if (desc.includes("hit_into_play") || HIT_EVENTS.has((row.events || "").trim())) {
        const ev = Number(row.launch_speed);
        const la = Number(row.launch_angle);
        if (Number.isFinite(ev) && ev > 0) evs.push(ev);
        if (Number.isFinite(la)) angles.push(la);
      }
    });

    if (!speeds.length && !evs.length) {
      block.textContent = `No bat-tracking / EV data for ${season}.`;
      return;
    }

    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const max = arr => Math.max(...arr);
    const avgBs = speeds.length ? avg(speeds) : null;
    const maxBs = speeds.length ? max(speeds) : null;
    const avgEv = evs.length ? avg(evs) : null;
    const maxEv = evs.length ? max(evs) : null;
    const hard = evs.filter(v => v >= 95).length;
    const hardPct = evs.length ? (hard / evs.length) * 100 : null;

    // Rough percentile anchors (league-ish); not official
    function pctLabel(mph) {
      if (mph == null) return "—";
      if (mph >= 77) return "Elite";
      if (mph >= 74) return "Above avg";
      if (mph >= 71) return "Average";
      return "Below avg";
    }

    block.className = "";
    block.innerHTML = `
      <div class="war-parts">
        <div class="war-part">
          <div class="war-part-val">${avgBs != null ? avgBs.toFixed(1) : "—"}</div>
          <div class="war-part-label">Avg bat speed (mph)</div>
          <div class="war-part-detail">${speeds.length} tracked swings · ${pctLabel(avgBs)}${maxBs != null ? ` · max ${maxBs.toFixed(1)}` : ""}</div>
        </div>
        <div class="war-part">
          <div class="war-part-val">${avgEv != null ? avgEv.toFixed(1) : "—"}</div>
          <div class="war-part-label">Avg exit velo (mph)</div>
          <div class="war-part-detail">${evs.length} batted balls${maxEv != null ? ` · max ${maxEv.toFixed(1)}` : ""}</div>
        </div>
        <div class="war-part">
          <div class="war-part-val">${hardPct != null ? hardPct.toFixed(1) + "%" : "—"}</div>
          <div class="war-part-label">Hard-hit % (≥95 mph)</div>
          <div class="war-part-detail">${hard} of ${evs.length} BIP</div>
        </div>
      </div>
      <p class="chart-note" style="margin-top:12px;">Bat speed labels are rough league anchors, not official Statcast percentiles.</p>`;
  } catch (e) {
    console.error(e);
    block.textContent = "Could not load bat speed.";
  }
}



/* =========================================================
   DEFENSE
========================================================= */
/** Rough position baselines for RF/9 and fielding % (model anchors, not live lg) */
const DEF_BASELINE = {
  // posAdj is scarcity only — shown separately so it does not read as "bad glove"
  C:  { rf9: 8.5,  fld: 0.993, posAdj: 6 },
  "1B":{ rf9: 8.0,  fld: 0.994, posAdj: -5 },
  "2B":{ rf9: 4.3,  fld: 0.985, posAdj: 2 },
  "3B":{ rf9: 2.6,  fld: 0.966, posAdj: 2 },
  SS: { rf9: 3.9,  fld: 0.975, posAdj: 5 },
  LF: { rf9: 1.9,  fld: 0.985, posAdj: -3 },
  CF: { rf9: 2.5,  fld: 0.990, posAdj: 2 },
  RF: { rf9: 2.0,  fld: 0.986, posAdj: -3 },
  P:  { rf9: 1.5,  fld: 0.960, posAdj: 0 },
  OF: { rf9: 2.1,  fld: 0.987, posAdj: -2 },
  DH: { rf9: 0,    fld: 1,     posAdj: -10 }
};

function parseInn(inn) {
  if (inn == null || inn === "") return 0;
  const parts = String(inn).split(".");
  return (Number(parts[0]) || 0) + (Number(parts[1]) || 0) / 3;
}

function defRunsForSplit(stat, posAbbr) {
  const base = DEF_BASELINE[posAbbr] || DEF_BASELINE.OF;
  const chances = Number(stat.chances) || 0;
  const errors = Number(stat.errors) || 0;
  const fld = parseRateStr(stat.fielding) ?? (chances ? (chances - errors) / chances : base.fld);
  const rf9 = parseRateStr(stat.rangeFactorPer9Inn) ?? parseRateStr(stat.rangeFactorPerGame);
  const inn = parseInn(stat.innings);

  // Error component: worse than baseline fielding % costs ~0.75 runs per extra error-equivalent
  const expectedErrors = chances * (1 - base.fld);
  const errDiff = errors - expectedErrors;
  const errRuns = -0.75 * errDiff;

  // Range component: RF/9 vs baseline, scaled by innings (very rough)
  let rangeRuns = 0;
  if (rf9 != null && inn > 0 && base.rf9 > 0) {
    // (RF/9 - baseline) * (inn/9) * small run factor
    rangeRuns = (rf9 - base.rf9) * (inn / 9) * 0.35;
  }

  // Position difficulty adjustment prorated by full-season ~1400 inn
  const posRuns = base.posAdj * (inn / 1400);

  return {
    errRuns,
    rangeRuns,
    posRuns,
    total: errRuns + rangeRuns + posRuns,
    fld,
    rf9,
    inn,
    chances,
    errors
  };
}

async function loadDefense() {
  const block = $("defenseBlock");
  if (!block) return;
  block.className = "empty-state";
  block.textContent = "Loading defense…";
  const season = getSeason();

  try {
    const url =
      `${MLB_API}/people/${playerId}/stats?stats=season&group=fielding` +
      `&season=${season}&sportIds=1`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("fielding " + r.status);
    const data = await r.json();
    const splits = data.stats?.[0]?.splits || [];

    if (!splits.length) {
      block.textContent = `No fielding splits for ${season} (DH-only or no games in field).`;
      return;
    }

    let totalGlove = 0;
    let totalPos = 0;
    let totalInn = 0;
    let html = `<div class="table-scroll"><table class="player-detail-table">
      <thead><tr>
        <th>Pos</th><th>G</th><th>GS</th><th>INN</th><th>PO</th><th>A</th><th>E</th>
        <th>Ch</th><th>FLD%</th><th>RF/9</th><th>Glove*</th>
      </tr></thead><tbody>`;

    const rows = [];
    splits.forEach(sp => {
      const s = sp.stat || {};
      const pos =
        s.position?.abbreviation ||
        sp.position?.abbreviation ||
        s.position?.name ||
        "?";
      const d = defRunsForSplit(s, pos);
      const glove = d.errRuns + d.rangeRuns;
      totalGlove += glove;
      totalPos += d.posRuns;
      totalInn += d.inn;
      rows.push({ pos, s, d, glove });
      html += `<tr>
        <td style="text-align:left;font-weight:600">${pos}</td>
        <td>${s.gamesPlayed ?? s.games ?? "—"}</td>
        <td>${s.gamesStarted ?? "—"}</td>
        <td>${s.innings ?? "—"}</td>
        <td>${s.putOuts ?? "—"}</td>
        <td>${s.assists ?? "—"}</td>
        <td>${s.errors ?? "—"}</td>
        <td>${s.chances ?? "—"}</td>
        <td>${s.fielding ?? "—"}</td>
        <td>${s.rangeFactorPer9Inn ?? s.rangeFactorPerGame ?? "—"}</td>
        <td><strong>${glove >= 0 ? "+" : ""}${glove.toFixed(1)}</strong></td>
      </tr>`;
    });
    html += `</tbody></table></div>`;

    function gloveLabel(g) {
      if (g >= 5) return "Strong glove season";
      if (g >= 1) return "Slightly above average glove";
      if (g >= -1) return "About average glove";
      if (g >= -5) return "Slightly below average glove";
      return "Below average glove (by this model)";
    }

    const totalAll = totalGlove + totalPos;
    html += `
      <div class="war-parts" style="margin-top:14px;">
        <div class="war-part">
          <div class="war-part-val">${totalGlove >= 0 ? "+" : ""}${totalGlove.toFixed(1)}</div>
          <div class="war-part-label">Glove runs (${season})</div>
          <div class="war-part-detail">${gloveLabel(totalGlove)} · errors + range only</div>
        </div>
        <div class="war-part">
          <div class="war-part-val">${totalPos >= 0 ? "+" : ""}${totalPos.toFixed(1)}</div>
          <div class="war-part-label">Position adjustment</div>
          <div class="war-part-detail">Not “bad defense” — scarcity of the position (e.g. 1B lower than SS)</div>
        </div>
        <div class="war-part">
          <div class="war-part-val">${totalAll >= 0 ? "+" : ""}${totalAll.toFixed(1)}</div>
          <div class="war-part-label">Total D (for SV later)</div>
          <div class="war-part-detail">Glove + position · ${totalInn.toFixed(0)} inn</div>
        </div>
      </div>
      <p class="sit-plain" style="margin-top:12px;">
        <strong>How to read this:</strong> <em>Glove runs</em> is the one that means “good or bad defender.”
        A negative <em>position adjustment</em> only means he played a less scarce position (like 1B), not that he fielded poorly.
      </p>
      <p class="chart-note" style="margin-top:8px;">
        *Glove = error runs vs baseline Fld% + range (RF/9 vs baseline). Not Statcast OAA.
      </p>`;

    if (rows.length > 0) {
      const primary = [...rows].sort((a, b) => b.d.inn - a.d.inn)[0];
      html += `<p class="chart-note" style="margin-top:8px;">
        Primary ${primary.pos}: errors ${primary.d.errRuns >= 0 ? "+" : ""}${primary.d.errRuns.toFixed(1)},
        range ${primary.d.rangeRuns >= 0 ? "+" : ""}${primary.d.rangeRuns.toFixed(1)},
        position ${primary.d.posRuns >= 0 ? "+" : ""}${primary.d.posRuns.toFixed(1)}.
      </p>`;
    }

    block.className = "";
    block.innerHTML = html;
  } catch (e) {
    console.error(e);
    block.textContent = "Could not load defense.";
  }
}


function setupTabs() {
  document.querySelectorAll(".player-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".player-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.getAttribute("data-tab");
      document.querySelectorAll(".player-tab-panel").forEach(p => {
        p.style.display = "none";
        p.classList.remove("active");
      });
      const panel = document.getElementById(`tab-${tab}`);
      if (panel) {
        panel.style.display = "block";
        panel.classList.add("active");
      }
    });
  });
}

setupPlayerBackLink();
loadPlayer();

function setupPlayerBackLink() {
  const link = document.getElementById("playerBackLink");
  if (!link) return;
  link.addEventListener("click", e => {
    e.preventDefault();
    const q = new URLSearchParams(window.location.search);
    const from = q.get("from");
    if (from === "playerStats") {
      const u = new URLSearchParams();
      u.set("section", "playerStatsSection");
      if (q.get("team")) u.set("team", q.get("team"));
      if (q.get("season")) u.set("season", q.get("season"));
      if (q.get("statsType")) u.set("statsType", q.get("statsType"));
      window.location.href = `index.html?${u.toString()}`;
      return;
    }
    if (from === "game" && q.get("gamePk")) {
      window.location.href = `game.html?gamePk=${encodeURIComponent(q.get("gamePk"))}`;
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = "index.html";
  });
}

