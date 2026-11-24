(() => {
  const MLB_API = "https://statsapi.mlb.com/api/v1";

  const DIVISION_NAMES = {
    200: "AL West",
    201: "AL East",
    202: "AL Central",
    203: "NL West",
    204: "NL East",
    205: "NL Central"
  };

  const DIVISION_ORDER = [201, 202, 200, 204, 205, 203]; // East, Central, West per league

  function getSeason() {
    // Prefer player season selector if present, else current year
    const sel = document.getElementById("playerSeason");
    if (sel?.value) return sel.value;
    return String(new Date().getFullYear());
  }

  function teamLogo(id) {
    return `https://www.mlbstatic.com/team-logos/${id}.svg`;
  }

  function fmtGB(gb) {
    if (gb == null || gb === "-" || gb === "") return "—";
    return gb;
  }

  function streakClass(code) {
    if (!code) return "";
    if (String(code).startsWith("W")) return "streak-w";
    if (String(code).startsWith("L")) return "streak-l";
    return "";
  }

  function renderDivisionTable(title, teamRecords) {
    if (!teamRecords?.length) {
      return `<div class="standings-division"><h3>${title}</h3><p class="empty-state">No data</p></div>`;
    }

    let rows = "";
    teamRecords.forEach((tr, i) => {
      const team = tr.team || {};
      const w = tr.wins ?? tr.leagueRecord?.wins ?? 0;
      const l = tr.losses ?? tr.leagueRecord?.losses ?? 0;
      const pct = tr.winningPercentage || tr.leagueRecord?.pct || ".000";
      const gb = tr.divisionGamesBack ?? tr.gamesBack ?? "—";
      const streak = tr.streak?.streakCode || "";
      const rs = tr.runsScored ?? "—";
      const ra = tr.runsAllowed ?? "—";
      const diff = tr.runDifferential;
      const diffStr =
        diff == null ? "—" : diff > 0 ? `+${diff}` : String(diff);
      const clinch = tr.clinchIndicator
        ? `<span class="clinch" title="Clinched">${tr.clinchIndicator}</span>`
        : "";

      rows += `
        <tr>
          <td class="rank-col">${tr.divisionRank || i + 1}</td>
          <td class="team-col">
            <img class="st-logo" src="${teamLogo(team.id)}" alt="" width="20" height="20">
            <span class="st-name">${team.name || ""}${clinch}</span>
          </td>
          <td>${w}</td>
          <td>${l}</td>
          <td>${pct}</td>
          <td>${fmtGB(gb)}</td>
          <td class="${streakClass(streak)}">${streak}</td>
          <td>${rs}</td>
          <td>${ra}</td>
          <td>${diffStr}</td>
        </tr>
      `;
    });

    return `
      <div class="standings-division">
        <h3 class="standings-div-title">${title}</h3>
        <div class="standings-table-wrap">
          <table class="standings-table">
            <thead>
              <tr>
                <th></th>
                <th>Team</th>
                <th>W</th>
                <th>L</th>
                <th>PCT</th>
                <th>GB</th>
                <th>STRK</th>
                <th>RS</th>
                <th>RA</th>
                <th>DIFF</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderWildCardTable(leagueName, teamRecords) {
    if (!teamRecords?.length) {
      return `<div class="standings-division"><h3>${leagueName} Wild Card</h3><p class="empty-state">No data</p></div>`;
    }

    // Sort by wild card rank / league rank
    const sorted = [...teamRecords].sort((a, b) => {
      const ar = Number(a.wildCardRank || a.leagueRank || 99);
      const br = Number(b.wildCardRank || b.leagueRank || 99);
      return ar - br;
    });

    let rows = "";
    sorted.forEach((tr, i) => {
      const team = tr.team || {};
      const w = tr.wins ?? tr.leagueRecord?.wins ?? 0;
      const l = tr.losses ?? tr.leagueRecord?.losses ?? 0;
      const pct = tr.winningPercentage || tr.leagueRecord?.pct || ".000";
      const wcg = tr.wildCardGamesBack ?? "—";
      const rank = tr.wildCardRank || i + 1;
      const streak = tr.streak?.streakCode || "";
      const clinch = tr.clinchIndicator
        ? `<span class="clinch">${tr.clinchIndicator}</span>`
        : "";

      // Highlight top WC spots (typically 3 in current format)
      const rowClass = Number(rank) <= 3 ? "wc-in" : "";

      rows += `
        <tr class="${rowClass}">
          <td class="rank-col">${rank}</td>
          <td class="team-col">
            <img class="st-logo" src="${teamLogo(team.id)}" alt="" width="20" height="20">
            <span class="st-name">${team.name || ""}${clinch}</span>
          </td>
          <td>${w}</td>
          <td>${l}</td>
          <td>${pct}</td>
          <td>${fmtGB(wcg)}</td>
          <td class="${streakClass(streak)}">${streak}</td>
        </tr>
      `;
    });

    return `
      <div class="standings-division">
        <h3 class="standings-div-title">${leagueName} Wild Card</h3>
        <div class="standings-table-wrap">
          <table class="standings-table">
            <thead>
              <tr>
                <th></th>
                <th>Team</th>
                <th>W</th>
                <th>L</th>
                <th>PCT</th>
                <th>WCGB</th>
                <th>STRK</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function loadDivisionStandings(season) {
    const res = await fetch(
      `${MLB_API}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`
    );
    if (!res.ok) throw new Error(`Standings ${res.status}`);
    return (await res.json()).records || [];
  }

  async function loadWildCardStandings(season) {
    const res = await fetch(
      `${MLB_API}/standings?leagueId=103,104&season=${season}&standingsTypes=wildCard`
    );
    if (!res.ok) return [];
    return (await res.json()).records || [];
  }

  async function loadPostseason(season) {
    try {
      const res = await fetch(
        `${MLB_API}/schedule/postseason?season=${season}&hydrate=team,linescore`
      );
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function renderPostseason(data) {
    if (!data?.dates?.length) {
      return `<p class="empty-state">Postseason not started or no games scheduled for this season.</p>`;
    }

    // Group games by series description if available
    const games = [];
    data.dates.forEach(d => {
      (d.games || []).forEach(g => games.push(g));
    });

    if (!games.length) {
      return `<p class="empty-state">No postseason games yet.</p>`;
    }

    let html = `<div class="postseason-list">`;
    games.slice(0, 40).forEach(g => {
      const away = g.teams?.away;
      const home = g.teams?.home;
      const status = g.status?.detailedState || "";
      const desc = g.description || g.seriesDescription || "Postseason";
      const score =
        away?.score != null && home?.score != null
          ? `${away.score}–${home.score}`
          : "";
      html += `
        <div class="postseason-game">
          <div class="ps-desc">${desc}</div>
          <div class="ps-matchup">
            ${away?.team?.name || "TBD"} @ ${home?.team?.name || "TBD"}
            ${score ? `<strong>${score}</strong>` : ""}
          </div>
          <div class="ps-status">${status}</div>
        </div>
      `;
    });
    html += `</div>`;
    return html;
  }

  async function loadStandings() {
    const container = document.getElementById("standingsContent");
    if (!container) return;

    const season = getSeason();
    container.innerHTML = `<p class="empty-state">Loading ${season} standings…</p>`;

    try {
      const [divRecords, wcRecords, post] = await Promise.all([
        loadDivisionStandings(season),
        loadWildCardStandings(season),
        loadPostseason(season)
      ]);

      // Map division id -> teamRecords
      const byDiv = new Map();
      divRecords.forEach(rec => {
        const divId = rec.division?.id;
        if (divId) byDiv.set(divId, rec.teamRecords || []);
      });

      let alHtml = `<h2 class="standings-league">American League</h2><div class="standings-grid">`;
      let nlHtml = `<h2 class="standings-league">National League</h2><div class="standings-grid">`;

      DIVISION_ORDER.forEach(divId => {
        const title = DIVISION_NAMES[divId] || `Division ${divId}`;
        const table = renderDivisionTable(title, byDiv.get(divId) || []);
        if (divId <= 202) alHtml += table;
        else nlHtml += table;
      });

      alHtml += `</div>`;
      nlHtml += `</div>`;

      // Wild card — API returns 2 records (AL / NL)
      let wcHtml = `<h2 class="standings-league">Wild Card</h2><div class="standings-grid">`;
      wcRecords.forEach(rec => {
        const leagueId = rec.league?.id;
        const name = leagueId === 103 ? "American League" : leagueId === 104 ? "National League" : "League";
        wcHtml += renderWildCardTable(name, rec.teamRecords || []);
      });
      if (!wcRecords.length) {
        wcHtml += `<p class="empty-state">Wild card standings unavailable.</p>`;
      }
      wcHtml += `</div>`;

      const postHtml = `
        <h2 class="standings-league">Postseason</h2>
        <div class="standings-postseason">
          ${renderPostseason(post)}
        </div>
      `;

      const updated = divRecords[0]?.lastUpdated
        ? new Date(divRecords[0].lastUpdated).toLocaleString()
        : "";

      container.innerHTML = `
        <div class="standings-toolbar">
          <span class="standings-season">Season ${season}</span>
          ${updated ? `<span class="standings-updated">Updated ${updated}</span>` : ""}
          <button type="button" class="standings-refresh" id="standingsRefreshBtn">Refresh</button>
        </div>
        <div class="standings-subtabs">
          <button type="button" class="st-subtab active" data-panel="divisional">Divisional</button>
          <button type="button" class="st-subtab" data-panel="wildcard">Wild Card</button>
          <button type="button" class="st-subtab" data-panel="postseason">Postseason</button>
        </div>
        <div id="standingsPanel-divisional" class="standings-panel active">
          ${alHtml}
          ${nlHtml}
        </div>
        <div id="standingsPanel-wildcard" class="standings-panel" style="display:none;">
          ${wcHtml}
        </div>
        <div id="standingsPanel-postseason" class="standings-panel" style="display:none;">
          ${postHtml}
        </div>
      `;

      container.querySelectorAll(".st-subtab").forEach(btn => {
        btn.addEventListener("click", () => {
          container.querySelectorAll(".st-subtab").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          const panel = btn.getAttribute("data-panel");
          container.querySelectorAll(".standings-panel").forEach(p => {
            p.style.display = "none";
            p.classList.remove("active");
          });
          const el = document.getElementById(`standingsPanel-${panel}`);
          if (el) {
            el.style.display = "block";
            el.classList.add("active");
          }
        });
      });

      document.getElementById("standingsRefreshBtn")?.addEventListener("click", loadStandings);
    } catch (err) {
      console.error("Standings error:", err);
      container.innerHTML = `<p style="color:#e53935;">Error loading standings. Try Refresh.</p>`;
    }
  }

  // Expose for section navigation
  window.loadStandings = loadStandings;

  document.addEventListener("DOMContentLoaded", () => {
    // If standings section is already visible, load
    const section = document.getElementById("standingsSection");
    if (section && section.style.display !== "none") {
      loadStandings();
    }
  });
})();
