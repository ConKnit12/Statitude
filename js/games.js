const url = "https://statsapi.mlb.com";

/** Local calendar date as YYYY-MM-DD (avoids UTC "tomorrow" bug) */
function getLocalDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function loadGamesByDate() {
  const input = document.getElementById("gameDate");
  // Prefer the date picker value; otherwise use local today
  const date = (input && input.value) ? input.value : getLocalDateString();

  // Keep the picker in sync so the UI shows "today"
  if (input && !input.value) {
    input.value = date;
  }

  try {
    const res = await fetch(
      `${url}/api/v1/schedule?sportId=1&date=${date}`
    );
    const data = await res.json();
    const games = data.dates?.[0]?.games || [];
    const gamesBody = document.getElementById("gamesBody");
    if (!gamesBody) return;

    gamesBody.innerHTML = "";

    if (!games.length) {
      gamesBody.innerHTML = `<tr><td colspan="5">No games on ${date}</td></tr>`;
      return;
    }

    games.forEach(game => {
      const away = game.teams.away.team;
      const home = game.teams.home.team;
      const time = new Date(game.gameDate).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });

      let color = "inherit";
      const state = game.status?.detailedState || "";
      if (state === "In Progress") color = "#e53935";
      if (state === "Final") color = "#2e7d32";

      const awayScore = game.teams.away.score;
      const homeScore = game.teams.home.score;
      const scoreText =
        awayScore != null && homeScore != null
          ? ` ${awayScore}–${homeScore}`
          : "";

      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.style.color = color;
      tr.innerHTML = `
        <td>${date}</td>
        <td>
          <img src="https://www.mlbstatic.com/team-logos/${away.id}.svg" width="22" height="22" alt="" style="vertical-align:middle;margin-right:6px;">
          ${away.name}${scoreText && state !== "Scheduled" ? "" : ""}
        </td>
        <td>
          <img src="https://www.mlbstatic.com/team-logos/${home.id}.svg" width="22" height="22" alt="" style="vertical-align:middle;margin-right:6px;">
          ${home.name}
        </td>
        <td>${time}</td>
        <td>${state}${scoreText && (state === "In Progress" || state === "Final" || state.includes("Progress")) ? ` (${awayScore}–${homeScore})` : ""}</td>
      `;
      tr.addEventListener("click", () => openGame(game.gamePk));
      gamesBody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    const gamesBody = document.getElementById("gamesBody");
    if (gamesBody) {
      gamesBody.innerHTML = `<tr><td colspan="5">Error loading games</td></tr>`;
    }
  }
}

function openGame(gamePk) {
  localStorage.setItem("selectedGame", gamePk);
  window.location.href = `game.html?gamePk=${gamePk}`;
}

window.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("gameDate");
  if (input) {
    input.value = getLocalDateString();
  }
  loadGamesByDate();
});
