(() => {
  const MLB_API = "https://statsapi.mlb.com/api/v1";

  let teamsList = [];
  let teamGamesMap = {};
  let selectedTeamId = null;
  let selectedTeamName = "";
  let hitProjections = [];
  let pitProjections = [];
  let loadedSeason = null;
  let rosterCache = {}; // `${season}-${teamId}` -> { hitters, pitchers }

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(msg) {
    const el = $("projectionsStatus");
    if (el) el.textContent = msg || "";
  }

  async function getTeams(season) {
    const r = await fetch(`${MLB_API}/teams?sportId=1&season=${season}`);
    if (!r.ok) throw new Error("teams");
    return ((await r.json()).teams || []).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  async function getRoster(teamId, season) {
    const r = await fetch(
      `${MLB_API}/teams/${teamId}/roster?rosterType=active&season=${season}`
    );
    if (!r.ok) return [];
    return (await r.json()).roster || [];
  }

  async function getTeamSeasonStats(teamId, season, group) {
    const url =
      `${MLB_API}/stats?stats=season&group=${group}&season=${season}` +
      `&sportId=1&teamId=${teamId}&playerPool=All&limit=500`;
    try {
      const r = await fetch(url);
      if (!r.ok) return [];
      const data = await r.json();
      return (data.stats || []).flatMap(x => x.splits || []);
    } catch {
      return [];
    }
  }

  async function getTeamGamesPlayed(season) {
    try {
      const r = await fetch(
        `${MLB_API}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`
      );
      if (!r.ok) return {};
      const data = await r.json();
      const map = {};
      (data.records || []).forEach(rec => {
        (rec.teamRecords || []).forEach(tr => {
          if (tr.team?.id) map[tr.team.id] = tr.gamesPlayed || 0;
        });
      });
      return map;
    } catch {
      return {};
    }
  }

  function isPitcherPos(rosterEntry) {
    const ab =
      rosterEntry.position?.abbreviation ||
      rosterEntry.position?.code ||
      "";
    return String(ab).toUpperCase() === "P";
  }

  function mapStats(splits) {
    const m = new Map();
    splits.forEach(sp => {
      const id = sp.player?.id;
      if (id) m.set(String(id), sp.stat || {});
    });
    return m;
  }

  function playerLink(p) {
    const id = p.player?.id;
    const name = p.player?.fullName || "Unknown";
    if (!id) return name;
    return `<a href="player.html?id=${id}" class="player-name-link">${name}</a>`;
  }

  /** Step 1: show all teams */
  window.loadProjections = async function loadProjections() {
    const season = $("projSeason")?.value || "2026";
    selectedTeamId = null;
    hitProjections = [];
    pitProjections = [];

    $("projTeamPicker") && ($("projTeamPicker").style.display = "block");
    $("projRosterView") && ($("projRosterView").style.display = "none");
    $("projLeagueView") && ($("projLeagueView").style.display = "none");

    const grid = $("projTeamGrid");
    if (grid) grid.innerHTML = `<p class="empty-state">Loading teams…</p>`;
    setStatus(`Loading ${season} teams…`);

    try {
      const [teams, games] = await Promise.all([
        getTeams(season),
        getTeamGamesPlayed(season)
      ]);
      teamsList = teams;
      teamGamesMap = games;
      loadedSeason = season;
      renderTeamPicker();
      setStatus(`${season}: select a team to see roster projections`);
    } catch (e) {
      console.error(e);
      setStatus("Error loading teams.");
      if (grid) {
        grid.innerHTML = `<p style="color:#e53935">Could not load teams.</p>`;
      }
    }
  };

  function renderTeamPicker() {
    const grid = $("projTeamGrid");
    if (!grid) return;
    const season = $("projSeason")?.value || loadedSeason || "2026";

    // Group by league roughly using division id if present, else flat
    let html = `<div class="proj-team-grid">`;
    teamsList.forEach(t => {
      const logo = `https://www.mlbstatic.com/team-logos/${t.id}.svg`;
      const g = teamGamesMap[t.id];
      html += `
        <button type="button" class="proj-team-card" data-team-id="${t.id}" onclick="selectProjTeam(${t.id})">
          <img src="${logo}" alt="" width="36" height="36" onerror="this.style.display='none'">
          <span class="proj-team-card-name">${t.name}</span>
          <span class="proj-team-card-meta">${t.abbreviation || ""}${g != null ? ` · ${g} G` : ""}</span>
        </button>`;
    });
    html += `</div>`;
    grid.innerHTML = html;
  }

  /** Step 2: load one team roster + project */
  window.selectProjTeam = async function selectProjTeam(teamId) {
    const season = $("projSeason")?.value || "2026";
    const priorSeason = String(Number(season) - 1);
    const team = teamsList.find(t => t.id === teamId || String(t.id) === String(teamId));
    if (!team) return;

    selectedTeamId = team.id;
    selectedTeamName = team.name;

    $("projTeamPicker") && ($("projTeamPicker").style.display = "none");
    $("projLeagueView") && ($("projLeagueView").style.display = "none");
    $("projRosterView") && ($("projRosterView").style.display = "block");
    const title = $("projRosterTitle");
    if (title) {
      title.innerHTML = `
        <button type="button" class="proj-back" onclick="backToProjTeams()">← All teams</button>
        <img class="proj-roster-logo" src="https://www.mlbstatic.com/team-logos/${team.id}.svg" alt="" width="32" height="32">
        <span>${team.name}</span>
        <span class="proj-roster-season">${season}</span>`;
    }

    const cacheKey = `${season}-${team.id}`;
    if (rosterCache[cacheKey]) {
      hitProjections = rosterCache[cacheKey].hitters;
      pitProjections = rosterCache[cacheKey].pitchers;
      renderRosterTables(rosterCache[cacheKey].teamProj);
      setStatus(`${team.name} · ${season} · current stats + model projections`);
      return;
    }

    const hitBox = $("projHittersTable");
    const pitBox = $("projPitchersTable");
    if (hitBox) hitBox.innerHTML = `<p class="empty-state">Loading hitters…</p>`;
    if (pitBox) pitBox.innerHTML = `<p class="empty-state">Loading pitchers…</p>`;
    setStatus(`Loading ${team.name} roster & stats…`);

    try {
      const Engine = window.ProjectionEngine;
      if (!Engine) throw new Error("ProjectionEngine missing");

      const [roster, hitYtd, pitYtd, hitPrior, pitPrior] = await Promise.all([
        getRoster(team.id, season),
        getTeamSeasonStats(team.id, season, "hitting"),
        getTeamSeasonStats(team.id, season, "pitching"),
        getTeamSeasonStats(team.id, priorSeason, "hitting"),
        getTeamSeasonStats(team.id, priorSeason, "pitching")
      ]);

      const hitMap = mapStats(hitYtd);
      const pitMap = mapStats(pitYtd);
      const hitPriorMap = mapStats(hitPrior);
      const pitPriorMap = mapStats(pitPrior);

      // League context: use this team's pool + mild defaults via averages of loaded splits
      const lgHit = Engine.leagueHittingAverages([...hitMap.values()]);
      const lgPit = Engine.leaguePitchingAverages([...pitMap.values()]);
      // If tiny samples, engine averages already fall back to sensible defaults

      const teamG =
        teamGamesMap[team.id] ??
        Math.max(...Object.values(teamGamesMap), 1);

      const teamInfo = {
        id: team.id,
        name: team.name,
        abbreviation: team.abbreviation
      };

      const hitters = [];
      const pitchers = [];

      roster.forEach(entry => {
        const id = entry.person?.id;
        if (!id) return;
        const name = entry.person?.fullName || "Unknown";
        const pos = entry.position?.abbreviation || "";

        if (isPitcherPos(entry)) {
          const ytd = pitMap.get(String(id)) || {
            inningsPitched: "0.0",
            gamesPlayed: 0,
            gamesStarted: 0
          };
          const prior = pitPriorMap.get(String(id)) || null;
          const proj = Engine.projectPitcher(ytd, prior, lgPit, teamG, 162);
          pitchers.push({
            player: { id, fullName: name },
            team: teamInfo,
            position: pos,
            ytd,
            teamGames: teamG,
            ...proj
          });
        } else {
          const ytd = hitMap.get(String(id)) || {
            plateAppearances: 0,
            atBats: 0,
            hits: 0,
            gamesPlayed: 0
          };
          const prior = hitPriorMap.get(String(id)) || null;
          const proj = Engine.projectHitter(ytd, prior, lgHit, teamG, 162);
          hitters.push({
            player: { id, fullName: name },
            team: teamInfo,
            position: pos,
            ytd,
            teamGames: teamG,
            ...proj
          });
        }
      });

      hitters.sort((a, b) =>
        (a.player.fullName || "").localeCompare(b.player.fullName || "")
      );
      pitchers.sort((a, b) =>
        (a.player.fullName || "").localeCompare(b.player.fullName || "")
      );

      hitProjections = hitters;
      pitProjections = pitchers;
      const teamProj = Engine.projectTeam(hitters, pitchers, 162);
      rosterCache[cacheKey] = { hitters, pitchers, teamProj };

      renderRosterTables(teamProj);
      const mode =
        hitters[0]?.mode === "ytd_plus_ros"
          ? "YTD + rest-of-season"
          : "talent-based full season";
      setStatus(
        `${team.name} · ${season} · ${hitters.length} H / ${pitchers.length} P · proj ${teamProj.winsRounded}-${teamProj.lossesRounded} · ${mode}`
      );
    } catch (e) {
      console.error(e);
      setStatus("Error loading roster.");
      if (hitBox) {
        hitBox.innerHTML = `<p style="color:#e53935">Error loading team data.</p>`;
      }
    }
  };

  window.backToProjTeams = function backToProjTeams() {
    selectedTeamId = null;
    $("projTeamPicker") && ($("projTeamPicker").style.display = "block");
    $("projRosterView") && ($("projRosterView").style.display = "none");
    $("projLeagueView") && ($("projLeagueView").style.display = "none");
    setStatus(
      `${$("projSeason")?.value || ""}: select a team to see roster projections`
    );
  };

  window.refreshProjections = function refreshProjections() {
    rosterCache = {};
    selectedTeamId = null;
    loadProjections();
  };

  function renderTeamSummary(teamProj) {
    const el = $("projTeamSummary");
    if (!el) return;
    if (!teamProj) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML = `
      <div class="proj-summary-grid">
        <div class="proj-summary-card highlight">
          <div class="proj-summary-label">Projected record</div>
          <div class="proj-summary-value">${teamProj.winsRounded}–${teamProj.lossesRounded}</div>
          <div class="proj-summary-sub">Pythagorean · ${teamProj.winPct}</div>
        </div>
        <div class="proj-summary-card">
          <div class="proj-summary-label">Runs scored</div>
          <div class="proj-summary-value">${teamProj.runsScored}</div>
          <div class="proj-summary-sub">${teamProj.runsPerGame} / game · lineup OPS ${teamProj.teamOps}</div>
        </div>
        <div class="proj-summary-card">
          <div class="proj-summary-label">Runs allowed</div>
          <div class="proj-summary-value">${teamProj.runsAllowed}</div>
          <div class="proj-summary-sub">Staff ERA ${teamProj.staffEra} · ${teamProj.staffIp} IP</div>
        </div>
        <div class="proj-summary-card">
          <div class="proj-summary-label">Lineup (top 9)</div>
          <div class="proj-summary-value small">${teamProj.teamObp} / ${teamProj.teamSlg}</div>
          <div class="proj-summary-sub">OBP / SLG average</div>
        </div>
      </div>`;
  }

  function renderRosterTables(teamProj) {
    renderTeamSummary(teamProj);
    const hitBox = $("projHittersTable");
    const pitBox = $("projPitchersTable");
    if (hitBox) hitBox.innerHTML = renderHittersTable(hitProjections);
    if (pitBox) pitBox.innerHTML = renderPitchersTable(pitProjections);
  }

  /** Load every team (uses cache) and rank by projected wins */
  window.projectLeagueStandings = async function projectLeagueStandings() {
    const season = $("projSeason")?.value || "2026";
    if (!teamsList.length) {
      await loadProjections();
    }

    $("projTeamPicker") && ($("projTeamPicker").style.display = "none");
    $("projRosterView") && ($("projRosterView").style.display = "none");
    $("projLeagueView") && ($("projLeagueView").style.display = "block");
    const label = $("projLeagueSeasonLabel");
    if (label) label.textContent = season;

    const box = $("projLeagueTable");
    if (box) {
      box.innerHTML = `<p class="empty-state">Projecting all 30 teams… this takes a minute.</p>`;
    }
    setStatus(`Projecting all teams for ${season}…`);

    const rows = [];
    let i = 0;
    for (const team of teamsList) {
      i += 1;
      setStatus(`Projecting ${team.name} (${i}/${teamsList.length})…`);
      // Reuse selectProjTeam data path without switching UI
      const cacheKey = `${season}-${team.id}`;
      try {
        if (!rosterCache[cacheKey]) {
          // temporarily call internal load by selecting
          await loadOneTeamSilent(team, season);
        }
        const cached = rosterCache[cacheKey];
        if (cached?.teamProj) {
          rows.push({
            team,
            ...cached.teamProj
          });
        }
      } catch (e) {
        console.warn("skip", team.name, e);
      }
      await new Promise(r => setTimeout(r, 30));
    }

    rows.sort((a, b) => b.wins - a.wins);
    renderLeagueTable(rows);
    setStatus(
      `${season}: league projection complete · ${rows.length} teams`
    );
  };

  async function loadOneTeamSilent(team, season) {
    const Engine = window.ProjectionEngine;
    const priorSeason = String(Number(season) - 1);
    const [roster, hitYtd, pitYtd, hitPrior, pitPrior] = await Promise.all([
      getRoster(team.id, season),
      getTeamSeasonStats(team.id, season, "hitting"),
      getTeamSeasonStats(team.id, season, "pitching"),
      getTeamSeasonStats(team.id, priorSeason, "hitting"),
      getTeamSeasonStats(team.id, priorSeason, "pitching")
    ]);
    const hitMap = mapStats(hitYtd);
    const pitMap = mapStats(pitYtd);
    const hitPriorMap = mapStats(hitPrior);
    const pitPriorMap = mapStats(pitPrior);
    const lgHit = Engine.leagueHittingAverages([...hitMap.values()]);
    const lgPit = Engine.leaguePitchingAverages([...pitMap.values()]);
    const teamG =
      teamGamesMap[team.id] ?? Math.max(...Object.values(teamGamesMap), 1);
    const teamInfo = {
      id: team.id,
      name: team.name,
      abbreviation: team.abbreviation
    };
    const hitters = [];
    const pitchers = [];
    roster.forEach(entry => {
      const id = entry.person?.id;
      if (!id) return;
      const name = entry.person?.fullName || "Unknown";
      const pos = entry.position?.abbreviation || "";
      if (isPitcherPos(entry)) {
        const ytd = pitMap.get(String(id)) || {
          inningsPitched: "0.0",
          gamesPlayed: 0,
          gamesStarted: 0
        };
        const prior = pitPriorMap.get(String(id)) || null;
        const proj = Engine.projectPitcher(ytd, prior, lgPit, teamG, 162);
        pitchers.push({
          player: { id, fullName: name },
          team: teamInfo,
          position: pos,
          ytd,
          teamGames: teamG,
          ...proj
        });
      } else {
        const ytd = hitMap.get(String(id)) || {
          plateAppearances: 0,
          atBats: 0,
          hits: 0,
          gamesPlayed: 0
        };
        const prior = hitPriorMap.get(String(id)) || null;
        const proj = Engine.projectHitter(ytd, prior, lgHit, teamG, 162);
        hitters.push({
          player: { id, fullName: name },
          team: teamInfo,
          position: pos,
          ytd,
          teamGames: teamG,
          ...proj
        });
      }
    });
    const teamProj = Engine.projectTeam(hitters, pitchers, 162);
    rosterCache[`${season}-${team.id}`] = { hitters, pitchers, teamProj };
  }

  function renderLeagueTable(rows) {
    const box = $("projLeagueTable");
    if (!box) return;
    if (!rows.length) {
      box.innerHTML = `<p class="empty-state">No team projections.</p>`;
      return;
    }
    let html = `<div class="table-scroll"><table class="player-stats-table proj-table">
      <thead><tr>
        <th>#</th><th>Team</th><th>W</th><th>L</th><th>PCT</th>
        <th>RS</th><th>RA</th><th>DIFF</th>
        <th>OPS</th><th>ERA</th>
      </tr></thead><tbody>`;
    rows.forEach((r, idx) => {
      const diff = r.runsScored - r.runsAllowed;
      const diffStr = diff > 0 ? `+${diff}` : String(diff);
      html += `<tr style="cursor:pointer" onclick="selectProjTeam(${r.team.id})">
        <td>${idx + 1}</td>
        <td>
          <img src="https://www.mlbstatic.com/team-logos/${r.team.id}.svg" width="18" height="18" alt="" style="vertical-align:middle;margin-right:6px">
          ${r.team.name}
        </td>
        <td><strong>${r.winsRounded}</strong></td>
        <td>${r.lossesRounded}</td>
        <td>${r.winPct}</td>
        <td>${r.runsScored}</td>
        <td>${r.runsAllowed}</td>
        <td>${diffStr}</td>
        <td>${r.teamOps}</td>
        <td>${r.staffEra}</td>
      </tr>`;
    });
    box.innerHTML = html + `</tbody></table></div>
      <p class="proj-footnote">Click a team row to open its roster projections.</p>`;
  }

  function renderHittersTable(list) {
    if (!list.length) {
      return `<p class="empty-state">No position players on active roster.</p>`;
    }
    let html = `<div class="table-scroll"><table class="player-stats-table proj-table">
      <thead>
        <tr>
          <th rowspan="2">Player</th>
          <th rowspan="2">Pos</th>
          <th colspan="5" class="proj-col-group current">Current (YTD)</th>
          <th colspan="5" class="proj-col-group projected">Projected</th>
        </tr>
        <tr>
          <th class="current">PA</th>
          <th class="current">AVG</th>
          <th class="current">OBP</th>
          <th class="current">SLG</th>
          <th class="current">OPS</th>
          <th class="projected">PA</th>
          <th class="projected">AVG</th>
          <th class="projected">OBP</th>
          <th class="projected">SLG</th>
          <th class="projected">OPS</th>
        </tr>
      </thead><tbody>`;
    list.forEach(p => {
      const a = p.actual || {};
      const s = p.projected || {};
      // Prefer engine actual; fall back to raw ytd
      const ytd = p.ytd || {};
      const curPA = a.plateAppearances ?? ytd.plateAppearances ?? 0;
      const curAvg = a.avg ?? ytd.avg ?? "—";
      const curObp = a.obp ?? ytd.obp ?? "—";
      const curSlg = a.slg ?? ytd.slg ?? "—";
      const curOps =
        a.ops ??
        (ytd.obp && ytd.slg
          ? (Number(ytd.obp) + Number(ytd.slg)).toFixed(3).replace(/^0\./, ".")
          : "—");
      html += `<tr>
        <td>${playerLink(p)}</td>
        <td>${p.position || ""}</td>
        <td class="current">${curPA}</td>
        <td class="current">${curAvg}</td>
        <td class="current">${curObp}</td>
        <td class="current">${curSlg}</td>
        <td class="current">${curOps}</td>
        <td class="projected"><strong>${s.plateAppearances ?? ""}</strong></td>
        <td class="projected"><strong>${s.avg ?? ""}</strong></td>
        <td class="projected"><strong>${s.obp ?? ""}</strong></td>
        <td class="projected"><strong>${s.slg ?? ""}</strong></td>
        <td class="projected"><strong>${s.ops ?? ""}</strong></td>
      </tr>`;
    });
    return html + `</tbody></table></div>`;
  }

  function renderPitchersTable(list) {
    if (!list.length) {
      return `<p class="empty-state">No pitchers on active roster.</p>`;
    }
    let html = `<div class="table-scroll"><table class="player-stats-table proj-table">
      <thead>
        <tr>
          <th rowspan="2">Player</th>
          <th colspan="5" class="proj-col-group current">Current (YTD)</th>
          <th colspan="5" class="proj-col-group projected">Projected</th>
        </tr>
        <tr>
          <th class="current">IP</th>
          <th class="current">ERA</th>
          <th class="current">WHIP</th>
          <th class="current">SO</th>
          <th class="current">BB</th>
          <th class="projected">IP</th>
          <th class="projected">ERA</th>
          <th class="projected">WHIP</th>
          <th class="projected">SO</th>
          <th class="projected">BB</th>
        </tr>
      </thead><tbody>`;
    list.forEach(p => {
      const a = p.actual || {};
      const s = p.projected || {};
      const ytd = p.ytd || {};
      html += `<tr>
        <td>${playerLink(p)}</td>
        <td class="current">${a.inningsPitched ?? ytd.inningsPitched ?? "—"}</td>
        <td class="current">${a.era ?? ytd.era ?? "—"}</td>
        <td class="current">${a.whip ?? ytd.whip ?? "—"}</td>
        <td class="current">${a.strikeOuts ?? ytd.strikeOuts ?? "—"}</td>
        <td class="current">${a.baseOnBalls ?? ytd.baseOnBalls ?? "—"}</td>
        <td class="projected"><strong>${s.inningsPitched ?? ""}</strong></td>
        <td class="projected"><strong>${s.era ?? ""}</strong></td>
        <td class="projected"><strong>${s.whip ?? ""}</strong></td>
        <td class="projected"><strong>${s.strikeOuts ?? ""}</strong></td>
        <td class="projected"><strong>${s.baseOnBalls ?? ""}</strong></td>
      </tr>`;
    });
    return html + `</tbody></table></div>`;
  }
})();
