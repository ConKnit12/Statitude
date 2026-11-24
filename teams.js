// =====================================
// LOAD MLB TEAMS
// =====================================

function loadTeams(){

fetch("https://statsapi.mlb.com/api/v1/teams?sportId=1")

.then(res => res.json())

.then(data => {

const grid = document.getElementById("teamGrid");

if(!grid) return;

grid.innerHTML = "";

data.teams.forEach(team => {

const card = document.createElement("div");

card.className = "teamCard";

card.innerHTML = `
<img src="https://www.mlbstatic.com/team-logos/${team.id}.svg">
<div>${team.name}</div>
`;

card.onclick = () => loadRoster(team.id);

grid.appendChild(card);

});

})

.catch(err => console.error("Error loading teams:", err));

}


// =====================================
// LOAD TEAM ROSTER
// =====================================

function loadRoster(teamId){

fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active`)

.then(res => res.json())

.then(data => {

const rosterDiv = document.getElementById("teamRoster");

const pitchers = data.roster.filter(p => p.position.type === "Pitcher");

const hitters = data.roster.filter(p => p.position.type !== "Pitcher");

let html = "<h3>Position Players</h3>";

html += `
<table>
<tr>
<th>#</th>
<th>Name</th>
<th>Pos</th>
</tr>
`;

hitters.forEach(player => {

html += `
<tr onclick="loadPlayerStats(${player.person.id})" style="cursor:pointer">

<td>${player.jerseyNumber || ""}</td>
<td>${player.person.fullName}</td>
<td>${player.position.abbreviation}</td>

</tr>
`;

});

html += "</table>";

html += "<h3>Pitchers</h3>";

html += `
<table>
<tr>
<th>#</th>
<th>Name</th>
<th>Pos</th>
</tr>
`;

pitchers.forEach(player => {

html += `
<tr onclick="loadPlayerStats(${player.person.id})" style="cursor:pointer">

<td>${player.jerseyNumber || ""}</td>
<td>${player.person.fullName}</td>
<td>${player.position.abbreviation}</td>

</tr>
`;

});

html += "</table>";

rosterDiv.innerHTML = html;

});

}


// =====================================
// LOAD PLAYER SEASON STATS
// =====================================

function loadPlayerStats(playerId){

fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=hitting,pitching`)

.then(res => res.json())

.then(data => {

const hitting = data.stats.find(s => s.group.displayName==="hitting");
const pitching = data.stats.find(s => s.group.displayName==="pitching");

let message = "";

if(hitting?.splits?.length){

const s = hitting.splits[0].stat;

message += `HITTING
AVG: ${s.avg}
HR: ${s.homeRuns}
RBI: ${s.rbi}
OPS: ${s.ops}

`;

}

if(pitching?.splits?.length){

const p = pitching.splits[0].stat;

message += `PITCHING
ERA: ${p.era}
IP: ${p.inningsPitched}
SO: ${p.strikeOuts}
WHIP: ${p.whip}
`;

}

alert(message || "No stats available");

})

.catch(err => console.error("Error loading player stats:", err));

}


// =====================================
// AUTO LOAD TEAMS
// =====================================

loadTeams();