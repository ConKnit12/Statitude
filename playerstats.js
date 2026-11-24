const MLB_API = "https://statsapi.mlb.com/api/v1";
const SAVANT_API = "https://baseballsavant.mlb.com/statcast_search/csv";
let hittingPlayerStats = [];
let pitchingPlayerStats = [];
let hittingStatcastStats = [];
let pitchingStatcastStats = [];
let currentPlayerStatsType = "hitting";
let currentPlayerStatsTable = "standard";
let currentSortColumn = null;
let currentSortDirection = "desc";
let statcastSeason = null;
let statcastCache = {};
const CONCURRENT_REQUESTS = 5;

/* Qualification: MLB rule of thumb
   Hitters: 3.1 PA × team games
   Pitchers: 1.0 IP × team games
   Only applied when Team filter = "All Teams"
*/
const QUALIFY_PA_PER_GAME = 3.1;
const QUALIFY_IP_PER_GAME = 1.0;

/* =========================================================
   MLB API
========================================================= */
async function getMLBTeams(season) {
    const r = await fetch(
        `${MLB_API}/teams?sportId=1&season=${season}`
    );
    if (!r.ok) throw new Error(`Teams API error: ${r.status}`);
    return (await r.json()).teams || [];
}
async function getTeamRoster(teamId, season) {
    const r = await fetch(
        `${MLB_API}/teams/${teamId}/roster?rosterType=fullSeason&season=${season}`
    );
    if (!r.ok) throw new Error(`Roster API error: ${r.status}`);
    return (await r.json()).roster || [];
}
async function getTeamPlayerStats(teamId, season, group) {
    const url =
        `${MLB_API}/stats?stats=season` +
        `&group=${group}` +
        `&season=${season}` +
        `&sportId=1` +
        `&teamId=${teamId}` +
        `&playerPool=All` +
        `&limit=1000`;
    try {
        const r = await fetch(url);
        if (!r.ok) return [];
        const data = await r.json();
        return (data.stats || []).flatMap(
            x => x.splits || []
        );
    } catch (e) {
        console.error(`Failed ${group} stats for team ${teamId}:`, e);
        return [];
    }
}
/* =========================================================
   PLAYER HELPERS
========================================================= */
function getPlayerPosition(player) {
    return (
        player.position?.abbreviation ||
        player.position?.code ||
        player.position?.name ||
        ""
    ).toUpperCase();
}
function isPitcher(player) {
    const p = getPlayerPosition(player);
    return p === "P" || p === "PITCHER";
}
function hasStats(stat, group) {
    const hitting = [
        "plateAppearances",
        "atBats",
        "hits",
        "runs",
        "rbi"
    ];
    const pitching = [
        "inningsPitched",
        "strikeOuts",
        "earnedRuns",
        "battersFaced",
        "gamesPlayed"
    ];
    return (group === "hitting" ? hitting : pitching)
        .some(x => Number(stat[x] || 0) > 0);
}

function parseInningsPitched(ip) {
    const parts = String(ip || "0").split(".");
    return Number(parts[0] || 0) + Number(parts[1] || 0) / 3;
}

/** Season progress proxy: max gamesPlayed in the loaded set */
function getSeasonGamesProxy(players) {
    let max = 0;
    (players || []).forEach(p => {
        const g = Number(p.stat?.gamesPlayed || 0);
        if (g > max) max = g;
    });
    return max > 0 ? max : 1;
}

function isQualifiedHitter(player, teamGames) {
    const pa = Number(player.stat?.plateAppearances || 0);
    return pa >= QUALIFY_PA_PER_GAME * teamGames;
}

function isQualifiedPitcher(player, teamGames) {
    const ip = parseInningsPitched(player.stat?.inningsPitched);
    return ip >= QUALIFY_IP_PER_GAME * teamGames;
}

function isQualifiedStatcastHitter(player, teamGames) {
    const pa = Number(player.statcast?.PA || 0);
    return pa >= QUALIFY_PA_PER_GAME * teamGames;
}

function isQualifiedStatcastPitcher(player, teamGames) {
    // Statcast rows are PA-based for both; use PA threshold as proxy for pitchers too
    const pa = Number(player.statcast?.PA || 0);
    return pa >= QUALIFY_PA_PER_GAME * teamGames * 0.5;
}

/* =========================================================
   LOAD MLB PLAYER STATS
========================================================= */
async function loadTeamPlayers(team, season, group) {
    try {
        const [roster, splits] = await Promise.all([
            getTeamRoster(team.id, season),
            getTeamPlayerStats(team.id, season, group)
        ]);
        const statsMap = new Map();
        splits.forEach(split => {
            const id = split.player?.id;
            if (
                id &&
                String(split.team?.id) === String(team.id)
            ) {
                statsMap.set(String(id), split);
            }
        });
        return roster
            .filter(player =>
                group === "hitting"
                    ? !isPitcher(player)
                    : isPitcher(player)
            )
            .map(player => {
                const id = player.person?.id;
                const split = statsMap.get(String(id));
                if (!split || !hasStats(split.stat || {}, group))
                    return null;
                return {
                    player: {
                        id,
                        fullName:
                            player.person?.fullName ||
                            split.player?.fullName ||
                            "Unknown Player"
                    },
                    team: {
                        id: team.id,
                        name: team.name,
                        abbreviation: team.abbreviation
                    },
                    position: getPlayerPosition(player),
                    stat: {
                        ...split.stat
                    }
                };
            })
            .filter(Boolean);
    } catch (e) {
        console.error(
            `Failed loading ${group} for ${team.name}:`,
            e
        );
        return [];
    }
}
async function processInBatches(items, processor, size = CONCURRENT_REQUESTS) {
    const results = [];
    for (let i = 0; i < items.length; i += size) {
        const batch = items.slice(i, i + size);
        results.push(
            ...(await Promise.all(batch.map(processor)))
        );
        await new Promise(r => setTimeout(r, 50));
    }
    return results;
}
async function loadAllPlayerStats(season, group) {
    const teams = await getMLBTeams(season);
    const results = await processInBatches(
        teams,
        team => loadTeamPlayers(team, season, group)
    );
    return results.flat();
}
/* =========================================================
   MAIN LOAD
========================================================= */
async function loadPlayerStats() {
    const season =
        document.getElementById("playerSeason")?.value;
    if (!season) return;
    const hittingTable =
        document.getElementById("hittingStatsTable");
    const pitchingTable =
        document.getElementById("pitchingStatsTable");
    if (hittingTable)
        hittingTable.innerHTML =
            "<p>Loading hitting stats...</p>";
    if (pitchingTable)
        pitchingTable.innerHTML =
            "<p>Loading pitching stats...</p>";
    try {
        const [hitting, pitching] =
            await Promise.all([
                loadAllPlayerStats(season, "hitting"),
                loadAllPlayerStats(season, "pitching")
            ]);
        hittingPlayerStats = hitting;
        pitchingPlayerStats = pitching;
        hittingStatcastStats = [];
        pitchingStatcastStats = [];
        statcastSeason = null;
        statcastCache = {};
        buildTeamFilters();
        currentPlayerStatsType = "hitting";
        currentPlayerStatsTable = "standard";
        currentSortColumn = null;
        currentSortDirection = "desc";
        updatePlayerStatsSections();
        renderCurrentPlayerTable();
        console.log("Hitting players:", hitting.length);
        console.log("Pitching players:", pitching.length);
    } catch (e) {
        console.error("PLAYER STATS ERROR:", e);
        if (hittingTable)
            hittingTable.innerHTML =
                `<p style="color:red;">Error loading hitting stats.</p>`;
        if (pitchingTable)
            pitchingTable.innerHTML =
                `<p style="color:red;">Error loading pitching stats.</p>`;
    }
}
/* =========================================================
   TEAM FILTERS
========================================================= */
function buildTeamFilters() {
    const filters = [
        document.getElementById("hittingTeamFilter"),
        document.getElementById("pitchingTeamFilter")
    ];
    const teams = new Map();
    [
        ...hittingPlayerStats,
        ...pitchingPlayerStats
    ].forEach(p => {
        if (p.team)
            teams.set(String(p.team.id), p.team);
    });
    const sorted = [...teams.values()]
        .sort((a, b) => a.name.localeCompare(b.name));
    filters.forEach(select => {
        if (!select) return;
        const old = select.value || "all";
        select.innerHTML =
            `<option value="all">All Teams</option>`;
        sorted.forEach(team => {
            const option = document.createElement("option");
            option.value = team.id;
            option.textContent = team.name;
            select.appendChild(option);
        });
        select.value =
            [...select.options].some(x => x.value === old)
                ? old
                : "all";
    });
}
/* =========================================================
   FILTERING (+ qualification when All Teams)
========================================================= */
function getCurrentFilter() {
    const searchId =
        currentPlayerStatsType === "hitting"
            ? "hittingPlayerSearch"
            : "pitchingPlayerSearch";
    const teamId =
        currentPlayerStatsType === "hitting"
            ? "hittingTeamFilter"
            : "pitchingTeamFilter";
    return {
        search:
            document.getElementById(searchId)
                ?.value
                ?.trim()
                .toLowerCase() || "",
        team:
            document.getElementById(teamId)
                ?.value || "all"
    };
}

function filterPlayers(source, options = {}) {
    const { search, team } = getCurrentFilter();
    const applyQualify = options.qualify !== false && team === "all";
    const isHitting = currentPlayerStatsType === "hitting";
    const teamGames = applyQualify
        ? getSeasonGamesProxy(
              isHitting ? hittingPlayerStats : pitchingPlayerStats
          )
        : 0;

    return source.filter(p => {
        const name =
            p.player?.fullName?.toLowerCase() || "";
        const teamName =
            p.team?.name?.toLowerCase() || "";
        const matchesSearch =
            !search ||
            name.includes(search) ||
            teamName.includes(search);
        const matchesTeam =
            team === "all" ||
            String(p.team?.id) === team;

        if (!matchesSearch || !matchesTeam) return false;

        if (!applyQualify) return true;

        if (options.statcast) {
            return isHitting
                ? isQualifiedStatcastHitter(p, teamGames)
                : isQualifiedStatcastPitcher(p, teamGames);
        }

        return isHitting
            ? isQualifiedHitter(p, teamGames)
            : isQualifiedPitcher(p, teamGames);
    });
}

function getFilteredPlayerStats() {
    return filterPlayers(
        currentPlayerStatsType === "hitting"
            ? hittingPlayerStats
            : pitchingPlayerStats
    );
}
/* =========================================================
   SORTING
========================================================= */
function sortPlayerStats(column) {
    if (currentSortColumn === column) {
        currentSortDirection =
            currentSortDirection === "desc"
                ? "asc"
                : "desc";
    } else {
        currentSortColumn = column;
        currentSortDirection = "desc";
    }
    renderCurrentPlayerTable();
}
function sortPlayers(players, getter) {
    const sorted = [...players];
    if (!currentSortColumn) {
        return sorted.sort((a, b) =>
            (a.player?.fullName || "")
                .localeCompare(b.player?.fullName || "")
        );
    }
    return sorted.sort((a, b) => {
        const A = getter(a, currentSortColumn);
        const B = getter(b, currentSortColumn);
        let result;
        if (
            typeof A === "string" &&
            typeof B === "string"
        ) {
            result = A.localeCompare(B);
        } else {
            result = (Number(A) || 0) - (Number(B) || 0);
        }
        return currentSortDirection === "asc"
            ? result
            : -result;
    });
}
function getNormalSortValue(player, column) {
    if (column === "player")
        return player.player?.fullName?.toLowerCase() || "";
    if (column === "team")
        return player.team?.name?.toLowerCase() || "";
    const s = player.stat || {};
    if ([
        "BBPercent",
        "KPercent",
        "ISO",
        "BABIP",
        "XBH",
        "TB"
    ].includes(column)) {
        return getHittingAdvanced(s)[column];
    }
    if ([
        "K9",
        "BB9",
        "H9",
        "HR9",
        "KBB"
    ].includes(column)) {
        return getPitchingAdvanced(s)[column];
    }
    if (column === "inningsPitched") {
        return parseInningsPitched(s.inningsPitched);
    }
    return s[column] || 0;
}
function getStatcastSortValue(player, column) {
    if (column === "player")
        return player.player?.fullName?.toLowerCase() || "";
    if (column === "team")
        return player.team?.name?.toLowerCase() || "";
    return player.statcast?.[column] ?? 0;
}
function getSortArrow(column) {
    if (currentSortColumn !== column)
        return "";
    return currentSortDirection === "desc"
        ? " ▼"
        : " ▲";
}
/* =========================================================
   FORMATTING
========================================================= */
function format3(value) {
    const n = Number(value);
    return Number.isNaN(n)
        ? ".000"
        : n.toFixed(3).replace("0.", ".");
}
function format2(value) {
    const n = Number(value);
    return Number.isNaN(n)
        ? "0.00"
        : n.toFixed(2);
}
function format1(value) {
    const n = Number(value);
    return (
        value === "" ||
        value === null ||
        value === undefined ||
        Number.isNaN(n)
    )
        ? "-"
        : n.toFixed(1);
}
function format3Statcast(value) {
    const n = Number(value);
    return (
        value === "" ||
        value === null ||
        value === undefined ||
        Number.isNaN(n)
    )
        ? "-"
        : n.toFixed(3).replace("0.", ".");
}
function pct(value) {
    const n = Number(value);
    return Number.isNaN(n)
        ? "-"
        : `${n.toFixed(1)}%`;
}
/* =========================================================
   ADVANCED STATS
========================================================= */
function getHittingAdvanced(s) {
    const AB = Number(s.atBats || 0);
    const H = Number(s.hits || 0);
    const BB = Number(s.baseOnBalls || 0);
    const SF = Number(s.sacFlies || 0);
    const SO = Number(s.strikeOuts || 0);
    const PA = Number(s.plateAppearances || 0);
    const doubles = Number(s.doubles || 0);
    const triples = Number(s.triples || 0);
    const HR = Number(s.homeRuns || 0);
    const TB =
        H +
        doubles +
        triples * 2 +
        HR * 3;
    return {
        BBPercent: PA ? BB / PA : 0,
        KPercent: PA ? SO / PA : 0,
        ISO: AB ? (TB - H) / AB : 0,
        BABIP:
            AB - SO + SF > 0
                ? (H - HR) / (AB - SO + SF)
                : 0,
        XBH: doubles + triples + HR,
        TB
    };
}
function getPitchingAdvanced(s) {
    const IP = Number(s.inningsPitched || 0);
    const SO = Number(s.strikeOuts || 0);
    const BB = Number(s.baseOnBalls || 0);
    const H = Number(s.hits || 0);
    const HR = Number(s.homeRuns || 0);
    return {
        K9: IP ? SO * 9 / IP : 0,
        BB9: IP ? BB * 9 / IP : 0,
        H9: IP ? H * 9 / IP : 0,
        HR9: IP ? HR * 9 / IP : 0,
        KBB: BB ? SO / BB : SO
    };
}
/* =========================================================
   TABLE HELPERS
========================================================= */
function header(column, label) {
    return `
        <th onclick="sortPlayerStats('${column}')">
            ${label}${getSortArrow(column)}
        </th>
    `;
}
function cell(value) {
    return `<td>${value}</td>`;
}
function playerLink(player) {
    const id = player.player?.id;
    if (!id) {
        return player.player?.fullName || "Unknown Player";
    }
    const q = new URLSearchParams();
    q.set("id", String(id));
    q.set("from", "playerStats");
    const season = document.getElementById("playerSeason")?.value;
    if (season) q.set("season", season);
    const teamHit = document.getElementById("hittingTeamFilter")?.value;
    const teamPit = document.getElementById("pitchingTeamFilter")?.value;
    const team =
        currentPlayerStatsType === "pitching"
            ? teamPit || teamHit
            : teamHit || teamPit;
    if (team && team !== "all") q.set("team", team);
    q.set("statsType", currentPlayerStatsType || "hitting");
    return `
        <a
            href="player.html?${q.toString()}"
            class="player-name-link"
        >
            ${player.player?.fullName || "Unknown Player"}
        </a>
    `;
}
/* =========================================================
   STANDARD TABLES
========================================================= */
function renderHittingStandard() {
    const players =
        sortPlayers(
            getFilteredPlayerStats(),
            getNormalSortValue
        );
    if (!players.length)
        return "<p>No hitting stats found.</p>";
    let html = `
        <table class="player-stats-table">
        <thead><tr>
            ${header("player", "Player")}
            ${header("team", "Team")}
            ${header("gamesPlayed", "G")}
            ${header("plateAppearances", "PA")}
            ${header("atBats", "AB")}
            ${header("runs", "R")}
            ${header("hits", "H")}
            ${header("doubles", "2B")}
            ${header("triples", "3B")}
            ${header("homeRuns", "HR")}
            ${header("rbi", "RBI")}
            ${header("baseOnBalls", "BB")}
            ${header("strikeOuts", "SO")}
            ${header("avg", "AVG")}
            ${header("obp", "OBP")}
            ${header("slg", "SLG")}
            ${header("ops", "OPS")}
        </tr></thead><tbody>
    `;
    players.forEach(p => {
        const s = p.stat || {};
        html += `
            <tr>
                ${cell(playerLink(p))}
                ${cell(p.team.abbreviation)}
                ${cell(s.gamesPlayed || 0)}
                ${cell(s.plateAppearances || 0)}
                ${cell(s.atBats || 0)}
                ${cell(s.runs || 0)}
                ${cell(s.hits || 0)}
                ${cell(s.doubles || 0)}
                ${cell(s.triples || 0)}
                ${cell(s.homeRuns || 0)}
                ${cell(s.rbi || 0)}
                ${cell(s.baseOnBalls || 0)}
                ${cell(s.strikeOuts || 0)}
                ${cell(format3(s.avg))}
                ${cell(format3(s.obp))}
                ${cell(format3(s.slg))}
                ${cell(format3(s.ops))}
            </tr>
        `;
    });
    return html + "</tbody></table>";
}
function renderHittingAdvanced() {
    const players =
        sortPlayers(
            getFilteredPlayerStats(),
            getNormalSortValue
        );
    if (!players.length)
        return "<p>No hitting stats found.</p>";
    let html = `
        <table class="player-stats-table">
        <thead><tr>
            ${header("player", "Player")}
            ${header("team", "Team")}
            ${header("gamesPlayed", "G")}
            ${header("plateAppearances", "PA")}
            ${header("BBPercent", "BB%")}
            ${header("KPercent", "K%")}
            ${header("ISO", "ISO")}
            ${header("BABIP", "BABIP")}
            ${header("XBH", "XBH")}
            ${header("TB", "TB")}
            ${header("ops", "OPS")}
        </tr></thead><tbody>
    `;
    players.forEach(p => {
        const s = p.stat || {};
        const a = getHittingAdvanced(s);
        html += `
            <tr>
                ${cell(playerLink(p))}
                ${cell(p.team.abbreviation)}
                ${cell(s.gamesPlayed || 0)}
                ${cell(s.plateAppearances || 0)}
                ${cell(pct(a.BBPercent * 100))}
                ${cell(pct(a.KPercent * 100))}
                ${cell(format3(a.ISO))}
                ${cell(format3(a.BABIP))}
                ${cell(a.XBH)}
                ${cell(a.TB)}
                ${cell(format3(s.ops))}
            </tr>
        `;
    });
    return html + "</tbody></table>";
}
function renderPitchingStandard() {
    const players =
        sortPlayers(
            getFilteredPlayerStats(),
            getNormalSortValue
        );
    if (!players.length)
        return "<p>No pitching stats found.</p>";
    let html = `
        <table class="player-stats-table">
        <thead><tr>
            ${header("player", "Player")}
            ${header("team", "Team")}
            ${header("gamesPlayed", "G")}
            ${header("gamesStarted", "GS")}
            ${header("inningsPitched", "IP")}
            ${header("wins", "W")}
            ${header("losses", "L")}
            ${header("saves", "SV")}
            ${header("hits", "H")}
            ${header("earnedRuns", "ER")}
            ${header("baseOnBalls", "BB")}
            ${header("strikeOuts", "SO")}
            ${header("era", "ERA")}
            ${header("whip", "WHIP")}
        </tr></thead><tbody>
    `;
    players.forEach(p => {
        const s = p.stat || {};
        html += `
            <tr>
                ${cell(playerLink(p))}
                ${cell(p.team.abbreviation)}
                ${cell(s.gamesPlayed || 0)}
                ${cell(s.gamesStarted || 0)}
                ${cell(s.inningsPitched || "0.0")}
                ${cell(s.wins || 0)}
                ${cell(s.losses || 0)}
                ${cell(s.saves || 0)}
                ${cell(s.hits || 0)}
                ${cell(s.earnedRuns || 0)}
                ${cell(s.baseOnBalls || 0)}
                ${cell(s.strikeOuts || 0)}
                ${cell(format2(s.era))}
                ${cell(format2(s.whip))}
            </tr>
        `;
    });
    return html + "</tbody></table>";
}
function renderPitchingAdvanced() {
    const players =
        sortPlayers(
            getFilteredPlayerStats(),
            getNormalSortValue
        );
    if (!players.length)
        return "<p>No pitching stats found.</p>";
    let html = `
        <table class="player-stats-table">
        <thead><tr>
            ${header("player", "Player")}
            ${header("team", "Team")}
            ${header("gamesPlayed", "G")}
            ${header("inningsPitched", "IP")}
            ${header("K9", "K/9")}
            ${header("BB9", "BB/9")}
            ${header("H9", "H/9")}
            ${header("HR9", "HR/9")}
            ${header("KBB", "K/BB")}
            ${header("era", "ERA")}
            ${header("whip", "WHIP")}
        </tr></thead><tbody>
    `;
    players.forEach(p => {
        const s = p.stat || {};
        const a = getPitchingAdvanced(s);
        html += `
            <tr>
                ${cell(playerLink(p))}
                ${cell(p.team.abbreviation)}
                ${cell(s.gamesPlayed || 0)}
                ${cell(s.inningsPitched || "0.0")}
                ${cell(format2(a.K9))}
                ${cell(format2(a.BB9))}
                ${cell(format2(a.H9))}
                ${cell(format2(a.HR9))}
                ${cell(format2(a.KBB))}
                ${cell(format2(s.era))}
                ${cell(format2(s.whip))}
            </tr>
        `;
    });
    return html + "</tbody></table>";
}
/* =========================================================
   SAVANT
========================================================= */
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
        }
        else if (c === '"') {
            quote = !quote;
        }
        else if (c === "," && !quote) {
            row.push(field);
            field = "";
        }
        else if ((c === "\n" || c === "\r") && !quote) {
            if (c === "\r" && n === "\n")
                i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        }
        else {
            field += c;
        }
    }
    if (field || row.length) {
        row.push(field);
        rows.push(row);
    }
    if (rows.length < 2)
        return [];
    const headers = rows[0];
    return rows.slice(1).map(values => {
        const obj = {};
        headers.forEach((h, i) => {
            obj[h] = values[i] ?? "";
        });
        return obj;
    });
}
function number(value) {
    const n = Number(value);
    return Number.isNaN(n)
        ? null
        : n;
}
async function getSavantStats(season, teamId, type) {
    const selections = [
        "pa",
        "ab",
        "hit",
        "batting_avg",
        "on_base_percent",
        "slg_percent",
        "woba",
        "k_percent",
        "bb_percent",
        "xba",
        "xslg",
        "xwoba",
        "barrels",
        "barrel_batted_rate",
        "hard_hit_percent",
        "exit_velocity_avg",
        "launch_angle_avg",
        "whiff_percent"
    ].join(",");
    const params = new URLSearchParams({
        year: season,
        type: type,
        filter: "",
        min: "0",
        selections: selections,
        chart: "false",
        x: "pa",
        y: "pa",
        r: "no",
        chartType: "beeswarm",
        sort: "pa",
        sortDir: "desc",
        csv: "true"
    });
    const url =
        `https://baseballsavant.mlb.com/leaderboard/custom?${params.toString()}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error("Savant leaderboard error:", response.status);
            return [];
        }
        const text = await response.text();
        if (!text || text.trim().startsWith("<")) {
            console.error("Savant returned HTML instead of CSV");
            return [];
        }
        const rows = parseCSV(text);
        if (!teamId || teamId === "all") {
            return rows;
        }
        const group = type === "batter" ? "hitting" : "pitching";
        const mlbPlayers =
            group === "hitting"
                ? hittingPlayerStats
                : pitchingPlayerStats;
        const teamPlayerIds = new Set();
        mlbPlayers.forEach(player => {
            if (!player || !player.player) return;
            if (String(player.team?.id) === String(teamId)) {
                teamPlayerIds.add(String(player.player.id));
            }
        });
        try {
            const rosterResponse = await fetch(
                `${MLB_API}/teams/${teamId}/roster?season=${season}&rosterType=active`
            );
            if (rosterResponse.ok) {
                const rosterData = await rosterResponse.json();
                (rosterData.roster || []).forEach(player => {
                    const id = player.person?.id;
                    if (id) teamPlayerIds.add(String(id));
                });
            }
        } catch (e) {
            console.warn("Could not load active roster:", e);
        }
        return rows.filter(row => {
            if (!row.player_id) return false;
            return teamPlayerIds.has(String(row.player_id));
        });
    } catch (error) {
        console.error("Savant leaderboard request failed:", error);
        return [];
    }
}
function makeStatcastPlayer(row, type) {
    const firstName = row.first_name || "";
    const lastName = row.last_name || "";
    const fullName =
        `${firstName} ${lastName}`.trim() ||
        row.player_name ||
        "Unknown Player";
    return {
        player: {
            id: row.player_id ? String(row.player_id) : "",
            fullName: fullName
        },
        team: null,
        statcast: {
            PA: Number(row.pa) || 0,
            AB: Number(row.ab) || 0,
            AVG: Number(row.batting_avg) || 0,
            wOBA: Number(row.woba) || 0,
            xBA: Number(row.xba) || 0,
            xSLG: Number(row.xslg) || 0,
            xwOBA: Number(row.xwoba) || 0,
            EV: Number(row.exit_velocity_avg) || 0,
            launchAngle: Number(row.launch_angle_avg) || 0,
            hardHitPercent: Number(row.hard_hit_percent) || 0,
            barrelPercent: Number(row.barrel_batted_rate) || 0,
            whiffPercent: Number(row.whiff_percent) || 0
        }
    };
}
function matchSavantPlayers(savantPlayers, mlbPlayers) {
    return savantPlayers.map(player => {
        if (!player || !player.player) return player;
        const savantId = String(player.player.id || "");
        const match = mlbPlayers.find(mlbPlayer => {
            if (!mlbPlayer || !mlbPlayer.player) return false;
            return String(mlbPlayer.player.id) === savantId;
        });
        if (match) {
            if (match.player?.fullName) {
                player.player.fullName = match.player.fullName;
            }
            if (match.team) {
                player.team = {
                    id: match.team.id,
                    name: match.team.name,
                    abbreviation: match.team.abbreviation
                };
            }
        }
        return player;
    });
}
async function loadStatcastStats() {
    const season = document.getElementById("playerSeason")?.value;
    if (!season) return;
    if (statcastSeason !== season) {
        statcastSeason = season;
        statcastCache = {};
        hittingStatcastStats = [];
        pitchingStatcastStats = [];
    }
    const type =
        currentPlayerStatsType === "hitting" ? "batter" : "pitcher";
    const mlbPlayers =
        currentPlayerStatsType === "hitting"
            ? hittingPlayerStats
            : pitchingPlayerStats;
    const teamFilterId =
        currentPlayerStatsType === "hitting"
            ? "hittingTeamFilter"
            : "pitchingTeamFilter";
    const selectedTeam =
        document.getElementById(teamFilterId)?.value || "all";
    const cacheKey = `${season}-${selectedTeam}-${type}`;
    if (statcastCache[cacheKey]) {
        if (currentPlayerStatsType === "hitting") {
            hittingStatcastStats = statcastCache[cacheKey];
        } else {
            pitchingStatcastStats = statcastCache[cacheKey];
        }
        renderCurrentPlayerTable();
        return;
    }
    const container = document.getElementById(
        currentPlayerStatsType === "hitting"
            ? "hittingStatsTable"
            : "pitchingStatsTable"
    );
    if (container) {
        container.innerHTML = "<p>Loading Statcast data...</p>";
    }
    const rows = await getSavantStats(season, selectedTeam, type);
    let players = matchSavantPlayers(
        rows.map(row => makeStatcastPlayer(row, type)),
        mlbPlayers
    );
    statcastCache[cacheKey] = players;
    if (currentPlayerStatsType === "hitting") {
        hittingStatcastStats = players;
    } else {
        pitchingStatcastStats = players;
    }
    renderCurrentPlayerTable();
}
function getFilteredStatcastStats() {
    return filterPlayers(
        currentPlayerStatsType === "hitting"
            ? hittingStatcastStats
            : pitchingStatcastStats,
        { statcast: true }
    );
}
function renderHittingStatcast() {
    const players = sortPlayers(
        getFilteredStatcastStats(),
        getStatcastSortValue
    );
    if (!players.length) {
        return `<p>No Statcast hitting data found.</p>`;
    }
    let html = `
        <table class="player-stats-table">
        <thead>
        <tr>
            ${header("player", "Player")}
            ${header("team", "Team")}
            ${header("PA", "PA")}
            ${header("AB", "AB")}
            ${header("AVG", "AVG")}
            ${header("wOBA", "wOBA")}
            ${header("xBA", "xBA")}
            ${header("xSLG", "xSLG")}
            ${header("xwOBA", "xwOBA")}
            ${header("EV", "EV")}
            ${header("launchAngle", "LA")}
            ${header("hardHitPercent", "Hard Hit%")}
            ${header("barrelPercent", "Barrel/BBE%")}
            ${header("whiffPercent", "Whiff%")}
        </tr>
        </thead>
        <tbody>
    `;
    players.forEach(player => {
        const s = player.statcast || {};
        html += `
            <tr>
                ${cell(playerLink(player))}
                ${cell(player.team?.abbreviation || "-")}
                ${cell(s.PA ?? "-")}
                ${cell(s.AB ?? "-")}
                ${cell(format3Statcast(s.AVG))}
                ${cell(format3Statcast(s.wOBA))}
                ${cell(format3Statcast(s.xBA))}
                ${cell(format3Statcast(s.xSLG))}
                ${cell(format3Statcast(s.xwOBA))}
                ${cell(format1(s.EV))}
                ${cell(format1(s.launchAngle))}
                ${cell(pct(s.hardHitPercent))}
                ${cell(pct(s.barrelPercent))}
                ${cell(pct(s.whiffPercent))}
            </tr>
        `;
    });
    return html + "</tbody></table>";
}
function renderPitchingStatcast() {
    const players = sortPlayers(
        getFilteredStatcastStats(),
        getStatcastSortValue
    );
    if (!players.length) {
        return `<p>No Statcast pitching data found.</p>`;
    }
    let html = `
        <table class="player-stats-table">
        <thead>
        <tr>
            ${header("player", "Player")}
            ${header("team", "Team")}
            ${header("PA", "PA")}
            ${header("AB", "AB")}
            ${header("xBA", "xBA Allowed")}
            ${header("xSLG", "xSLG Allowed")}
            ${header("xwOBA", "xwOBA Allowed")}
            ${header("EV", "EV Allowed")}
            ${header("launchAngle", "LA")}
            ${header("hardHitPercent", "Hard Hit%")}
            ${header("barrelPercent", "Barrel/BBE%")}
            ${header("whiffPercent", "Whiff%")}
        </tr>
        </thead>
        <tbody>
    `;
    players.forEach(player => {
        const s = player.statcast || {};
        html += `
            <tr>
                ${cell(playerLink(player))}
                ${cell(player.team?.abbreviation || "-")}
                ${cell(s.PA ?? "-")}
                ${cell(s.AB ?? "-")}
                ${cell(format3Statcast(s.xBA))}
                ${cell(format3Statcast(s.xSLG))}
                ${cell(format3Statcast(s.xwOBA))}
                ${cell(format1(s.EV))}
                ${cell(format1(s.launchAngle))}
                ${cell(pct(s.hardHitPercent))}
                ${cell(pct(s.barrelPercent))}
                ${cell(pct(s.whiffPercent))}
            </tr>
        `;
    });
    return html + "</tbody></table>";
}
function renderCurrentPlayerTable() {
    const container = document.getElementById(
        currentPlayerStatsType === "hitting"
            ? "hittingStatsTable"
            : "pitchingStatsTable"
    );
    if (!container) return;
    if (currentPlayerStatsTable === "statcast") {
        const source =
            currentPlayerStatsType === "hitting"
                ? hittingStatcastStats
                : pitchingStatcastStats;
        if (!source.length) {
            container.innerHTML = "<p>Loading Statcast data...</p>";
            loadStatcastStats();
            return;
        }
        container.innerHTML =
            currentPlayerStatsType === "hitting"
                ? renderHittingStatcast()
                : renderPitchingStatcast();
        return;
    }
    if (currentPlayerStatsTable === "advanced") {
        container.innerHTML =
            currentPlayerStatsType === "hitting"
                ? renderHittingAdvanced()
                : renderPitchingAdvanced();
        return;
    }
    if (currentPlayerStatsTable === "custom") {
        container.innerHTML = "<p>Custom stats coming soon.</p>";
        return;
    }
    container.innerHTML =
        currentPlayerStatsType === "hitting"
            ? renderHittingStandard()
            : renderPitchingStandard();
}
function showPlayerStatsType(type) {
    if (type !== "hitting" && type !== "pitching") return;
    // Keep the same team selected when switching hitters <-> pitchers
    const fromId =
        currentPlayerStatsType === "pitching"
            ? "pitchingTeamFilter"
            : "hittingTeamFilter";
    const toId =
        type === "pitching" ? "pitchingTeamFilter" : "hittingTeamFilter";
    const fromEl = document.getElementById(fromId);
    const toEl = document.getElementById(toId);
    const teamVal = fromEl?.value || toEl?.value || "all";

    currentPlayerStatsType = type;
    currentPlayerStatsTable = "standard";
    currentSortColumn = null;
    currentSortDirection = "desc";
    updatePlayerStatsSections();

    if (toEl && teamVal) {
        // Ensure option exists (team lists may differ slightly)
        if (![...toEl.options].some(o => o.value === teamVal)) {
            // leave as-is if missing
        } else {
            toEl.value = teamVal;
        }
    }
    // Sync the other dropdown too so both stay aligned
    if (fromEl && toEl && teamVal && [...fromEl.options].some(o => o.value === teamVal)) {
        fromEl.value = teamVal;
    }
    renderCurrentPlayerTable();
}
function filterPlayerStats() {
    renderCurrentPlayerTable();
}
function showPlayerStatsTable(type) {
    currentPlayerStatsType = type.startsWith("hitting")
        ? "hitting"
        : "pitching";
    const lower = type.toLowerCase();
    currentPlayerStatsTable = lower.includes("advanced")
        ? "advanced"
        : lower.includes("statcast")
            ? "statcast"
            : lower.includes("custom")
                ? "custom"
                : "standard";
    currentSortColumn = null;
    currentSortDirection = "desc";
    updatePlayerStatsSections();
    renderCurrentPlayerTable();
}
function updatePlayerStatsSections() {
    const hitting = document.getElementById("hittingStatsSection");
    const pitching = document.getElementById("pitchingStatsSection");
    if (hitting)
        hitting.style.display =
            currentPlayerStatsType === "hitting" ? "block" : "none";
    if (pitching)
        pitching.style.display =
            currentPlayerStatsType === "pitching" ? "block" : "none";
}
