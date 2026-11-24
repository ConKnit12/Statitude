const url = "https://statsapi.mlb.com";
const params = new URLSearchParams(window.location.search);
const gamePk = params.get("gamePk") || localStorage.getItem("selectedGame");
let selectedAtBatId = null;
let currentAtBatPitches = [];
let lastLiveData = null;

/* =========================================================
   LOAD GAME
========================================================= */
async function loadGame() {
  if (!gamePk) {
    console.error("No gamePk found.");
    const title = document.getElementById("gameTitle");
    if (title) title.textContent = "No game selected";
    return;
  }

  try {
    const response = await fetch(
      `${url}/api/v1.1/game/${gamePk}/feed/live`
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const live = await response.json();
    const gameData = live.gameData;
    const liveData = live.liveData;
    const linescore = liveData?.linescore;
    const plays = liveData?.plays;

    if (!gameData || !liveData) {
      console.error("Incomplete game data.");
      return;
    }

    lastLiveData = liveData;

    /* -----------------------------------------------------
       GAME TITLE
    ----------------------------------------------------- */
    const awayTeam = gameData.teams?.away?.name || "Away";
    const homeTeam = gameData.teams?.home?.name || "Home";
    const gameTitle = document.getElementById("gameTitle");
    if (gameTitle) {
      gameTitle.textContent = `${awayTeam} vs ${homeTeam}`;
    }

    /* -----------------------------------------------------
       SCOREBOARD
    ----------------------------------------------------- */
    buildScoreboard(gameData, linescore);

    /* -----------------------------------------------------
       COUNT / SITUATION
    ----------------------------------------------------- */
    updateCount(linescore);

    /* -----------------------------------------------------
       CURRENT PLAY
    ----------------------------------------------------- */
    const currentPlay = plays?.currentPlay || null;
    updateMatchup(currentPlay);
    updateLastPitch(currentPlay);

    /* -----------------------------------------------------
       TABLES
    ----------------------------------------------------- */
    buildAtBats(liveData);

    /* -----------------------------------------------------
       FIELD / BASES
    ----------------------------------------------------- */
    updateBases(liveData);
    updateDefense(liveData);
    updateSpray(currentPlay);

    /* -----------------------------------------------------
       STRIKE ZONE
    ----------------------------------------------------- */
    if (selectedAtBatId === null && currentPlay) {
      updateStrikeZone(currentPlay);
    }

    /* -----------------------------------------------------
       TEAM BUTTONS
    ----------------------------------------------------- */
    const awayButton = document.getElementById("awayBtn");
    const homeButton = document.getElementById("homeBtn");
    if (awayButton) {
      awayButton.textContent =
        gameData.teams?.away?.teamName ||
        gameData.teams?.away?.name ||
        "Away";
    }
    if (homeButton) {
      homeButton.textContent =
        gameData.teams?.home?.teamName ||
        gameData.teams?.home?.name ||
        "Home";
    }

    /* -----------------------------------------------------
       TEAM BOXES + FULL BOX SCORE
    ----------------------------------------------------- */
    buildFullBoxScore(liveData, gameData);

    /* -----------------------------------------------------
       GAME INFO
    ----------------------------------------------------- */
    updateGameInfo(gameData, linescore);

  } catch (error) {
    console.error("Error loading game:", error);
  }
}

/* =========================================================
   SCOREBOARD
========================================================= */
function buildScoreboard(gameData, linescore) {
  const container = document.getElementById("scoreboard");
  if (!container || !linescore) return;

  const away = gameData.teams?.away;
  const home = gameData.teams?.home;
  const awayLs = linescore.teams?.away || {};
  const homeLs = linescore.teams?.home || {};
  const innings = linescore.innings || [];
  const inning = linescore.currentInningOrdinal || "";
  const inningHalf = linescore.inningHalf || "";
  const status =
    gameData.status?.detailedState ||
    gameData.status?.abstractGameState ||
    "";

  const awayAbbr = away?.abbreviation || away?.teamName || "AWAY";
  const homeAbbr = home?.abbreviation || home?.teamName || "HOME";
  const awayId = away?.id;
  const homeId = home?.id;

  // Ensure at least 9 inning columns for a traditional look
  const numInnings = Math.max(9, innings.length);
  let inningHeaders = "";
  for (let i = 1; i <= numInnings; i++) {
    inningHeaders += `<th class="inn-col">${i}</th>`;
  }

  function inningRuns(side, idx) {
    const inn = innings[idx];
    if (!inn) return "";
    const val = inn[side]?.runs;
    return val == null ? "" : val;
  }

  let awayCells = "";
  let homeCells = "";
  for (let i = 0; i < numInnings; i++) {
    awayCells += `<td class="inn-col">${inningRuns("away", i)}</td>`;
    homeCells += `<td class="inn-col">${inningRuns("home", i)}</td>`;
  }

  container.innerHTML = `
    <div class="broadcast-scoreboard">
      <div class="broadcast-meta">
        <span class="inning-badge">${inningHalf} ${inning}</span>
        <span class="status-text">${status}</span>
      </div>
      <div class="linescore-wrap">
        <table class="linescore-table">
          <thead>
            <tr>
              <th class="team-col"></th>
              ${inningHeaders}
              <th class="rhe">R</th>
              <th class="rhe">H</th>
              <th class="rhe">E</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="team-col">
                ${awayId ? `<img class="ls-logo" src="https://www.mlbstatic.com/team-logos/${awayId}.svg" alt="">` : ""}
                <span class="ls-abbr">${awayAbbr}</span>
              </td>
              ${awayCells}
              <td class="rhe rhe-runs">${awayLs.runs ?? 0}</td>
              <td class="rhe">${awayLs.hits ?? 0}</td>
              <td class="rhe">${awayLs.errors ?? 0}</td>
            </tr>
            <tr>
              <td class="team-col">
                ${homeId ? `<img class="ls-logo" src="https://www.mlbstatic.com/team-logos/${homeId}.svg" alt="">` : ""}
                <span class="ls-abbr">${homeAbbr}</span>
              </td>
              ${homeCells}
              <td class="rhe rhe-runs">${homeLs.runs ?? 0}</td>
              <td class="rhe">${homeLs.hits ?? 0}</td>
              <td class="rhe">${homeLs.errors ?? 0}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* =========================================================
   COUNT
========================================================= */
function updateCount(linescore) {
  const count = document.getElementById("count");
  if (!count || !linescore) return;

  const outs = linescore.outs ?? 0;
  const balls = linescore.balls ?? 0;
  const strikes = linescore.strikes ?? 0;

  count.innerHTML = `
    <div class="count-pills">
      <div class="count-pill">
        <span class="pill-label">Balls</span>
        <span class="pill-value">${balls}</span>
      </div>
      <div class="count-pill">
        <span class="pill-label">Strikes</span>
        <span class="pill-value">${strikes}</span>
      </div>
      <div class="count-pill">
        <span class="pill-label">Outs</span>
        <span class="pill-value">${outs}</span>
      </div>
    </div>
  `;
}

/* =========================================================
   CURRENT MATCHUP
========================================================= */
function updateMatchup(play) {
  const container = document.getElementById("matchup");
  if (!container) return;

  if (!play) {
    container.innerHTML = `<div class="empty-state">No current matchup</div>`;
    return;
  }

  const batterObj = play.matchup?.batter;
  const pitcherObj = play.matchup?.pitcher;
  const batterName = batterObj?.fullName || "Unknown Batter";
  const pitcherName = pitcherObj?.fullName || "Unknown Pitcher";
  const batterId = batterObj?.id;
  const pitcherId = pitcherObj?.id;

  const batterHtml = batterId
    ? `<a href="player.html?id=${batterId}&from=game&gamePk=${encodeURIComponent(new URLSearchParams(location.search).get("gamePk")||"")}" class="player-name-link">${batterName}</a>`
    : batterName;
  const pitcherHtml = pitcherId
    ? `<a href="player.html?id=${pitcherId}&from=game&gamePk=${encodeURIComponent(new URLSearchParams(location.search).get("gamePk")||"")}" class="player-name-link">${pitcherName}</a>`
    : pitcherName;

  container.innerHTML = `
    <div class="matchup-grid">
      <div class="matchup-side batter">
        <div class="matchup-label">Batter</div>
        <div class="matchup-name">${batterHtml}</div>
      </div>
      <div class="matchup-vs">VS</div>
      <div class="matchup-side pitcher">
        <div class="matchup-label">Pitcher</div>
        <div class="matchup-name">${pitcherHtml}</div>
      </div>
    </div>
  `;
}

/* =========================================================
   LAST PITCH
========================================================= */
function updateLastPitch(play) {
  const container = document.getElementById("pitch");
  if (!container) return;

  if (!play || !Array.isArray(play.playEvents)) {
    container.innerHTML = `<div class="empty-state">No pitch data</div>`;
    return;
  }

  const pitches = play.playEvents.filter(
    event => event && event.pitchData && event.pitchData.coordinates
  );

  if (!pitches.length) {
    container.innerHTML = `<div class="empty-state">No pitch data</div>`;
    return;
  }

  const pitch = pitches[pitches.length - 1];
  const pitchType = pitch.details?.type?.description || "Unknown";
  const speed =
    pitch.pitchData?.startSpeed != null
      ? `${Number(pitch.pitchData.startSpeed).toFixed(1)} MPH`
      : "";
  const description = pitch.details?.description || "";

  container.innerHTML = `
    <div class="last-pitch">
      <div class="pitch-type">${pitchType}</div>
      <div class="pitch-speed">${speed}</div>
      <div class="pitch-desc">${description}</div>
    </div>
  `;
}

/* =========================================================
   INNINGS
========================================================= */
function buildInnings(liveData) {
  const tbody = document.querySelector("#inningsTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";
  const innings = liveData.linescore?.innings || [];

  if (!innings.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="3">No inning data available.</td>`;
    tbody.appendChild(row);
    return;
  }

  innings.forEach((inning, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${inning.away?.runs ?? 0}</td>
      <td>${inning.home?.runs ?? 0}</td>
    `;
    tbody.appendChild(row);
  });
}

/* =========================================================
   LINEUPS
========================================================= */
function buildLineups(liveData) {
  const container = document.getElementById("lineupsContainer");
  const boxscore = liveData.boxscore;

  if (!boxscore?.teams) {
    if (container) container.innerHTML = "Lineup data unavailable.";
    return;
  }

  const teams = {
    away: boxscore.teams.away,
    home: boxscore.teams.home
  };

  if (container) {
    let html = "";
    ["away", "home"].forEach(side => {
      const team = teams[side];
      if (!team) return;
      html += `
        <h3>${team.team?.name || ""}</h3>
        ${createLineupTable(team)}
      `;
    });
    container.innerHTML = html || "Lineup data unavailable.";
  }

  ["away", "home"].forEach(side => {
    const div = document.getElementById(`${side}Lineup`);
    if (!div) return;
    const team = teams[side];
    if (!team) {
      div.innerHTML = "Lineup data unavailable.";
      return;
    }
    div.innerHTML = createLineupTable(team);
  });
}

function playerNameLink(player) {
  const id = player?.person?.id || player?.id || player?.player?.id;
  const name =
    player?.person?.fullName ||
    player?.fullName ||
    player?.player?.fullName ||
    "Unknown";
  if (!id) return name;
  const gpk = new URLSearchParams(location.search).get("gamePk") || "";
  const q = new URLSearchParams({ id: String(id), from: "game" });
  if (gpk) q.set("gamePk", gpk);
  return `<a href="player.html?${q}" class="player-name-link">${name}</a>`;
}

function createLineupTable(team) {
  const players = team.players ? Object.values(team.players) : [];

  /*
    Only show true batting-order players (starters + pinch hitters).
    Pitchers almost never have a battingOrder unless they bat,
    so requiring battingOrder keeps the lineup clean.
  */
  const lineupPlayers = players
    .filter(player => player.battingOrder != null)
    .sort((a, b) => {
      const aOrder = Number(a.battingOrder) || 9999;
      const bOrder = Number(b.battingOrder) || 9999;
      return aOrder - bOrder;
    });

  if (!lineupPlayers.length) {
    return `<p class="empty-state">No lineup data available.</p>`;
  }

  let html = `
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th>Pos</th>
        </tr>
      </thead>
      <tbody>
  `;

  lineupPlayers.forEach(player => {
    const order = player.battingOrder
      ? Math.floor(Number(player.battingOrder) / 100)
      : "";
    const position =
      player.position?.abbreviation || player.position?.name || "";

    html += `
      <tr>
        <td>${order}</td>
        <td>${playerNameLink(player)}</td>
        <td>${position}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  return html;
}

/* =========================================================
   PITCHERS
========================================================= */
function buildPitchers(liveData) {
  const combined = document.getElementById("pitchersContainer");
  const boxscore = liveData.boxscore;

  if (!boxscore?.teams) {
    if (combined) combined.innerHTML = "Pitcher data unavailable.";
    return;
  }

  const teams = {
    away: boxscore.teams.away,
    home: boxscore.teams.home
  };

  if (combined) {
    let html = "";
    ["away", "home"].forEach(side => {
      const team = teams[side];
      if (!team) return;
      html += `
        <h3>${team.team?.name || ""}</h3>
        ${createPitcherTable(team)}
      `;
    });
    combined.innerHTML = html || "Pitcher data unavailable.";
  }

  ["away", "home"].forEach(side => {
    const div = document.getElementById(`${side}Pitchers`);
    if (!div) return;
    const team = teams[side];
    div.innerHTML = team
      ? createPitcherTable(team)
      : "Pitcher data unavailable.";
  });
}

function createPitcherTable(team) {
  const pitcherIds = Array.isArray(team.pitchers) ? team.pitchers : [];

  if (!pitcherIds.length) {
    return `<p class="empty-state">No pitcher data available.</p>`;
  }

  let html = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Pitcher</th>
          <th>IP</th>
          <th>H</th>
          <th>R</th>
          <th>ER</th>
          <th>BB</th>
          <th>K</th>
        </tr>
      </thead>
      <tbody>
  `;

  pitcherIds.forEach(id => {
    const player = team.players?.[`ID${id}`];
    if (!player) return;
    const stats = player.stats?.pitching || {};

    html += `
      <tr>
        <td>${playerNameLink(player)}</td>
        <td>${stats.inningsPitched || "0.0"}</td>
        <td>${stats.hits ?? 0}</td>
        <td>${stats.runs ?? 0}</td>
        <td>${stats.earnedRuns ?? 0}</td>
        <td>${stats.baseOnBalls ?? 0}</td>
        <td>${stats.strikeOuts ?? 0}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  return html;
}

/* =========================================================
   AT BATS
========================================================= */
function buildAtBats(liveData) {
  const container = document.getElementById("atBatsContainer");
  const select = document.getElementById("inningSelect");
  if (!container) return;

  const allPlays = liveData.plays?.allPlays || [];

  if (!allPlays.length) {
    container.innerHTML = `<div class="empty-state">No at-bats available.</div>`;
    if (select) select.innerHTML = "";
    return;
  }

  const innings = {};
  allPlays.forEach((play, index) => {
    const inning = play.about?.inning ?? "Unknown";
    if (!innings[inning]) innings[inning] = [];
    innings[inning].push({ play, index });
  });

  const inningNumbers = Object.keys(innings).sort(
    (a, b) => Number(a) - Number(b)
  );

  if (select) {
    select.innerHTML = "";
    inningNumbers.forEach(inning => {
      const option = document.createElement("option");
      option.value = inning;
      option.textContent = `Inning ${inning}`;
      select.appendChild(option);
    });
  }

  function renderInning(inning) {
    container.innerHTML = "";
    const playsInInning = innings[inning] || [];

    if (!playsInInning.length) {
      container.innerHTML = `<div class="empty-state">No at-bats in this inning.</div>`;
      return;
    }

    playsInInning.forEach(({ play, index }) => {
      const batterObj = play.matchup?.batter;
      const pitcherObj = play.matchup?.pitcher;
      const batterName = batterObj?.fullName || "Unknown Batter";
      const pitcherName = pitcherObj?.fullName || "Unknown Pitcher";
      const batterLink = batterObj?.id
        ? `<a href="player.html?id=${batterObj.id}&from=game&gamePk=${encodeURIComponent(new URLSearchParams(location.search).get("gamePk")||"")}" class="player-name-link" onclick="event.stopPropagation()">${batterName}</a>`
        : batterName;
      const pitcherLink = pitcherObj?.id
        ? `<a href="player.html?id=${pitcherObj.id}&from=game&gamePk=${encodeURIComponent(new URLSearchParams(location.search).get("gamePk")||"")}" class="player-name-link" onclick="event.stopPropagation()">${pitcherName}</a>`
        : pitcherName;
      const result =
        play.result?.description || play.result?.event || "At-bat";

      const div = document.createElement("div");
      div.className = "atBat";
      div.id = `atbat-${index}`;
      div.dataset.playIndex = index;
      div.innerHTML = `
        <div class="atbat-batter">${batterLink}</div>
        <div class="atbat-vs">vs ${pitcherLink}</div>
        <div class="atbat-result">${result}</div>
      `;

      div.addEventListener("click", () => {
        const selectedPlay = allPlays[index];
        if (!selectedPlay) return;

        selectedAtBatId = index;
        container.querySelectorAll(".atBat").forEach(item => {
          item.classList.remove("selected");
        });
        div.classList.add("selected");

        updateStrikeZone(selectedPlay);
        updateMatchup(selectedPlay);
        updateLastPitch(selectedPlay);
      });

      container.appendChild(div);
    });

    if (selectedAtBatId !== null) {
      const selected = container.querySelector(
        `[data-play-index="${selectedAtBatId}"]`
      );
      if (selected) selected.classList.add("selected");
    }
  }

  let defaultInning = inningNumbers[inningNumbers.length - 1];
  if (selectedAtBatId !== null) {
    const selectedPlay = allPlays[selectedAtBatId];
    if (selectedPlay?.about?.inning != null) {
      defaultInning = String(selectedPlay.about.inning);
    }
  }

  if (select) {
    select.value = defaultInning;
    select.onchange = () => {
      selectedAtBatId = null;
      renderInning(select.value);
      const playsInInning = innings[select.value] || [];
      const lastPlay = playsInInning[playsInInning.length - 1]?.play;
      if (lastPlay) {
        updateStrikeZone(lastPlay);
        updateMatchup(lastPlay);
        updateLastPitch(lastPlay);
      }
    };
  }

  renderInning(defaultInning);
}

/* =========================================================
   STRIKE ZONE
========================================================= */
function updateStrikeZone(atBat) {
  const svg = document.getElementById("strikeZone");
  if (!svg) return;

  svg.innerHTML = "";
  currentAtBatPitches = [];

  if (!atBat || !Array.isArray(atBat.playEvents)) return;

  currentAtBatPitches = atBat.playEvents.filter(
    pitch => pitch && pitch.pitchData && pitch.pitchData.coordinates
  );

  const width = 500;
  const height = 600;

  const firstPitch = currentAtBatPitches[0];
  const strikeZoneTop =
    Number(firstPitch?.pitchData?.strikeZoneTop) || 3.5;
  const strikeZoneBottom =
    Number(firstPitch?.pitchData?.strikeZoneBottom) || 1.5;

  /*
    Zone box is drawn by CSS (.strikeZoneBox).
    Do NOT draw a second SVG rect — that caused the double outline.
  */
  const zoneLeft = 125;
  const zoneRight = 375;
  const zoneTop = 100;
  const zoneBottom = 500;

  currentAtBatPitches.forEach((pitch, index) => {
    const coordinates = pitch.pitchData.coordinates;
    const pX = Number(coordinates.pX);
    const pZ = Number(coordinates.pZ);

    if (Number.isNaN(pX) || Number.isNaN(pZ)) return;

    let x = 250 + (pX / 0.83) * 175;

    const pitchTop =
      Number(pitch.pitchData.strikeZoneTop) || strikeZoneTop;
    const pitchBottom =
      Number(pitch.pitchData.strikeZoneBottom) || strikeZoneBottom;
    const zoneHeight = pitchTop - pitchBottom || 2;

    let y =
      zoneTop +
      ((pitchTop - pZ) / zoneHeight) * (zoneBottom - zoneTop);

    x = Math.max(20, Math.min(480, x));
    y = Math.max(20, Math.min(570, y));

    const description = (pitch.details?.description || "").toLowerCase();
    let color = "#21a44a";

    if (
      description.includes("in play") ||
      description.includes("hit into play")
    ) {
      color = "#1687ff";
    } else if (
      description.includes("strike") ||
      description.includes("foul") ||
      description.includes("swinging")
    ) {
      color = "#e53935";
    } else if (
      description.includes("ball") ||
      description.includes("intent ball")
    ) {
      color = "#21a44a";
    }

    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", "15");
    circle.setAttribute("fill", color);
    circle.setAttribute("stroke", "white");
    circle.setAttribute("stroke-width", "3");

    const pitchType =
      pitch.details?.type?.description || "Unknown pitch";
    const speed =
      pitch.pitchData?.startSpeed != null
        ? `${Number(pitch.pitchData.startSpeed).toFixed(1)} MPH`
        : "";

    const tooltip = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "title"
    );
    tooltip.textContent = `Pitch ${index + 1}: ${pitchType} ${speed}`;
    circle.appendChild(tooltip);
    svg.appendChild(circle);

    const number = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    number.setAttribute("x", x);
    number.setAttribute("y", y + 5);
    number.setAttribute("text-anchor", "middle");
    number.setAttribute("font-size", "13");
    number.setAttribute("font-weight", "bold");
    number.setAttribute("fill", "white");
    number.textContent = index + 1;
    svg.appendChild(number);

    const label = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    label.setAttribute("x", x + 21);
    label.setAttribute("y", y - 12);
    label.setAttribute("font-size", "12");
    label.setAttribute("font-weight", "bold");
    label.setAttribute("fill", "white");
    label.setAttribute("paint-order", "stroke");
    label.setAttribute("stroke", "#111820");
    label.setAttribute("stroke-width", "4");
    label.textContent = `${speed} ${pitchType}`.trim();
    svg.appendChild(label);
  });
}

/* =========================================================
   BASES
========================================================= */
function updateBases(liveData) {
  ["first", "second", "third"].forEach(base => {
    const element = document.getElementById(base);
    if (!element) return;
    element.classList.remove("runner");
  });

  const offense = liveData.linescore?.offense;
  if (!offense) return;

  if (offense.first) {
    document.getElementById("first")?.classList.add("runner");
  }
  if (offense.second) {
    document.getElementById("second")?.classList.add("runner");
  }
  if (offense.third) {
    document.getElementById("third")?.classList.add("runner");
  }
}

/* =========================================================
   DEFENSIVE PLAYERS – FIXED POSITIONS + NAME LABELS
   Coordinates calibrated to the 700×700 field SVG
   (home plate at bottom ~350,620)
   Name format: "B. Harper"
========================================================= */
function formatPlayerName(fullName) {
  if (!fullName || typeof fullName !== "string") return "";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const last = parts[parts.length - 1];
  const initial = first.charAt(0).toUpperCase();
  return `${initial}. ${last}`;
}

function updateDefense(liveData) {
  const defense = liveData.linescore?.defense;
  if (!defense) return;

  const fieldSvg = document.getElementById("field");
  if (!fieldSvg) return;

  // Map API keys → SVG element IDs
  const map = {
    pitcher: "pitcher",
    catcher: "c",
    first: "1b",
    second: "2b",
    shortstop: "ss",
    third: "3b",
    left: "lf",
    center: "cf",
    right: "rf"
  };

  /*
    Field geometry (viewBox 0 0 700 700):
      Home plate:   ~350, 620
      Pitcher's mound: 350, 480
      1st base:     ~505, 465
      2nd base:     ~350, 310
      3rd base:     ~195, 465
  */
  const coords = {
    pitcher: { x: 350, y: 480 },
    c:       { x: 350, y: 595 },
    "1b":    { x: 470, y: 440 },
    "2b":    { x: 400, y: 310 },
    ss:      { x: 300, y: 310 },
    "3b":    { x: 230, y: 440 },
    lf:      { x: 165, y: 210 },
    cf:      { x: 350, y: 130 },
    rf:      { x: 535, y: 210 }
  };

  // Label offset relative to the circle (below the player)
  const labelOffsetY = 18;

  Object.keys(map).forEach(position => {
    const player = defense[position];
    const elementId = map[position];
    const element = document.getElementById(elementId);
    if (!element) return;

    const coordinate = coords[elementId];
    if (coordinate) {
      element.setAttribute("cx", coordinate.x);
      element.setAttribute("cy", coordinate.y);
    }

    const shortName = player?.fullName
      ? formatPlayerName(player.fullName)
      : "";

    if (player?.fullName) {
      element.setAttribute("data-name", player.fullName);

      // Tooltip with full name
      let title = element.querySelector("title");
      if (!title) {
        title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        element.appendChild(title);
      }
      title.textContent = player.fullName;
    }

    // Create or update the name label text element
    const labelId = `label-${elementId}`;
    let label = document.getElementById(labelId);

    if (!label) {
      label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("id", labelId);
      label.setAttribute("class", "player-label");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size", "11");
      label.setAttribute("font-weight", "600");
      label.setAttribute("fill", "#ffffff");
      label.setAttribute("stroke", "#111111");
      label.setAttribute("stroke-width", "3");
      label.setAttribute("paint-order", "stroke");
      label.setAttribute("pointer-events", "none");
      fieldSvg.appendChild(label);
    }

    if (coordinate) {
      label.setAttribute("x", coordinate.x);
      label.setAttribute("y", coordinate.y + labelOffsetY);
    }

    label.textContent = shortName;
  });
}

/* =========================================================
   SPRAY
========================================================= */
function updateSpray(play) {
  const spray = document.getElementById("spray");
  if (!spray) return;
  spray.innerHTML = "";
}

/* =========================================================
   TEAM BOX SCORE (per-team tab) + FULL BOX SCORE
========================================================= */
function getBattersFromTeam(team) {
  const players = team.players ? Object.values(team.players) : [];
  return players
    .filter(player => {
      const batting = player.stats?.batting;
      return (
        player.battingOrder != null ||
        (batting &&
          (Number(batting.atBats) > 0 ||
            Number(batting.plateAppearances) > 0))
      );
    })
    .sort((a, b) => {
      const aOrder = Number(a.battingOrder) || 9999;
      const bOrder = Number(b.battingOrder) || 9999;
      return aOrder - bOrder;
    });
}

function renderBattingTable(team) {
  const batters = getBattersFromTeam(team);
  if (!batters.length) {
    return `<p class="empty-state">No batting stats yet.</p>`;
  }

  let html = `
    <table class="data-table box-batting">
      <thead>
        <tr>
          <th>Player</th>
          <th>Pos</th>
          <th>AB</th>
          <th>R</th>
          <th>H</th>
          <th>RBI</th>
          <th>BB</th>
          <th>SO</th>
          <th>AVG</th>
        </tr>
      </thead>
      <tbody>
  `;

  batters.forEach(player => {
    const s = player.stats?.batting || {};
    const note = player.gameStatus?.isSubstitute ? " (PH)" : "";
    html += `
      <tr>
        <td>${playerNameLink(player)}${note}</td>
        <td>${player.position?.abbreviation || ""}</td>
        <td>${s.atBats ?? 0}</td>
        <td>${s.runs ?? 0}</td>
        <td>${s.hits ?? 0}</td>
        <td>${s.rbi ?? 0}</td>
        <td>${s.baseOnBalls ?? 0}</td>
        <td>${s.strikeOuts ?? 0}</td>
        <td>${s.avg ?? ".000"}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  return html;
}

function renderPitchingTable(team) {
  const pitcherIds = Array.isArray(team.pitchers) ? team.pitchers : [];
  if (!pitcherIds.length) {
    return `<p class="empty-state">No pitching stats yet.</p>`;
  }

  let html = `
    <table class="data-table box-pitching">
      <thead>
        <tr>
          <th>Pitcher</th>
          <th>IP</th>
          <th>H</th>
          <th>R</th>
          <th>ER</th>
          <th>BB</th>
          <th>SO</th>
          <th>HR</th>
          <th>ERA</th>
        </tr>
      </thead>
      <tbody>
  `;

  pitcherIds.forEach(id => {
    const player = team.players?.[`ID${id}`];
    if (!player) return;
    const s = player.stats?.pitching || {};
    html += `
      <tr>
        <td>${playerNameLink(player)}</td>
        <td>${s.inningsPitched || "0.0"}</td>
        <td>${s.hits ?? 0}</td>
        <td>${s.runs ?? 0}</td>
        <td>${s.earnedRuns ?? 0}</td>
        <td>${s.baseOnBalls ?? 0}</td>
        <td>${s.strikeOuts ?? 0}</td>
        <td>${s.homeRuns ?? 0}</td>
        <td>${s.era ?? "-"}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  return html;
}

function buildTeamBox(elementId, team) {
  const container = document.getElementById(elementId);
  if (!container || !team) return;

  container.innerHTML = `
    <h3>${team.team?.name || ""}</h3>
    <h4 class="box-subhead">Batting</h4>
    ${renderBattingTable(team)}
    <h4 class="box-subhead">Pitching</h4>
    ${renderPitchingTable(team)}
  `;
}

function buildFullBoxScore(liveData, gameData) {
  const container = document.getElementById("boxScoreContainer");
  if (!container) return;

  const away = liveData.boxscore?.teams?.away;
  const home = liveData.boxscore?.teams?.home;
  if (!away && !home) {
    container.innerHTML = `<p class="empty-state">Box score not available yet.</p>`;
    return;
  }

  const awayName = gameData?.teams?.away?.name || away?.team?.name || "Away";
  const homeName = gameData?.teams?.home?.name || home?.team?.name || "Home";

  container.innerHTML = `
    <div class="boxscore-grid">
      <div class="boxscore-side">
        <h3 class="card-heading">${awayName}</h3>
        <h4 class="box-subhead">Batting</h4>
        ${away ? renderBattingTable(away) : ""}
        <h4 class="box-subhead">Pitching</h4>
        ${away ? renderPitchingTable(away) : ""}
      </div>
      <div class="boxscore-side">
        <h3 class="card-heading">${homeName}</h3>
        <h4 class="box-subhead">Batting</h4>
        ${home ? renderBattingTable(home) : ""}
        <h4 class="box-subhead">Pitching</h4>
        ${home ? renderPitchingTable(home) : ""}
      </div>
    </div>
  `;
}

/* =========================================================
   GAME INFO
========================================================= */
function updateGameInfo(gameData, linescore) {
  const container = document.getElementById("gameInfo");
  if (!container) return;

  const inning = linescore?.currentInningOrdinal || "Pre-Game";
  const inningHalf = linescore?.inningHalf || "";
  const outs = linescore?.outs ?? 0;
  const balls = linescore?.balls ?? 0;
  const strikes = linescore?.strikes ?? 0;
  const status = gameData.status?.detailedState || "";

  container.innerHTML = `
    <h3>Game Situation</h3>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">Inning</span>
        <span class="info-value">${inningHalf} ${inning}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Status</span>
        <span class="info-value">${status}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Outs</span>
        <span class="info-value">${outs}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Count</span>
        <span class="info-value">${balls}-${strikes}</span>
      </div>
    </div>
  `;
}

/* =========================================================
   GAME TAB SWITCHING
========================================================= */
function showGameTab(tabId) {
  document.querySelectorAll(".gameTab").forEach(tab => {
    tab.classList.remove("active");
    tab.style.display = "none";
  });

  document.querySelectorAll(".gameTabButton").forEach(button => {
    button.classList.remove("active");
  });

  const selected = document.getElementById(tabId);
  if (selected) {
    selected.classList.add("active");
    selected.style.display = "block";
  }

  // Highlight the clicked button
  const buttons = document.querySelectorAll(".gameTabButton");
  buttons.forEach(btn => {
    if (btn.getAttribute("onclick")?.includes(tabId)) {
      btn.classList.add("active");
    }
  });
}

/* =========================================================
   TEAM SUB-TAB SWITCHING
========================================================= */
function showTab(id) {
  document.querySelectorAll(".tabContent").forEach(tab => {
    tab.style.display = "none";
  });

  const selected = document.getElementById(id);
  if (selected) {
    selected.style.display = "block";
  }

  document.querySelectorAll(".teamTabButton").forEach(button => {
    button.classList.remove("active");
  });
}

/* =========================================================
   DEFAULT TAB INITIALIZATION
========================================================= */
function initializeGameTabs() {
  const box = document.getElementById("boxScoreTab");
  if (box) {
    showGameTab("boxScoreTab");
  }
}

/* =========================================================
   AUTO LOAD
========================================================= */
loadGame();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeGameTabs);
} else {
  initializeGameTabs();
}

/* =========================================================
   LIVE UPDATE
   Keep selected at-bat when user has chosen one.
========================================================= */
setInterval(() => {
  // Only clear selection if user has NOT manually selected an at-bat
  // (selectedAtBatId stays until they click another or change inning)
  loadGame();
}, 8000);


document.addEventListener("DOMContentLoaded", () => {
  const link = document.getElementById("gameBackLink");
  if (!link) return;
  link.addEventListener("click", e => {
    e.preventDefault();
    if (window.history.length > 1) window.history.back();
    else window.location.href = "index.html";
  });
});
