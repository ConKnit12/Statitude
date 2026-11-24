(() => {
  const url = "https://statsapi.mlb.com";

  const groups = {
    Connor: [147,121,111,116,135,118,133,139,145,115],
    Joe: [119,136,144,110,137,140,114,146,142,138],
    Seba: [141,143,112,158,117,113,134,109,120,108]
  };

  window.showRankingTab = function(id){
    document.querySelectorAll(".rankingContent").forEach(el => el.style.display="none");
    const tab = document.getElementById(id);
    if(tab) tab.style.display = "block";
  };

  async function loadRankings(){
    try {
      const teamsRes = await fetch(`${url}/api/v1/teams?sportId=1`);
      const teamsData = await teamsRes.json();

      let hitting = [];
      let pitching = [];

      for(const team of teamsData.teams){
        const hRes = await fetch(`${url}/api/v1/teams/${team.id}/stats?stats=season&group=hitting&season=2026`);
        const hData = await hRes.json();
        const h = hData.stats?.[0]?.splits?.[0]?.stat;

        const pRes = await fetch(`${url}/api/v1/teams/${team.id}/stats?stats=season&group=pitching&season=2026`);
        const pData = await pRes.json();
        const p = pData.stats?.[0]?.splits?.[0]?.stat;

        if(h){
          hitting.push({
            id: team.id,
            name: team.name,
            R:+h.runs||0,
            HR:+h.homeRuns||0,
            RBI:+h.rbi||0,
            SB:+h.stolenBases||0,
            BB:+h.baseOnBalls||0,
            K:+h.strikeOuts||0
          });
        }

        if(p){
          pitching.push({
            id: team.id,
            name: team.name,
            ERA:+p.era||0,
            WHIP:+p.whip||0,
            SO:+p.strikeOuts||0,
            BB:+p.baseOnBalls||0,
            HR:+p.homeRuns||0
          });
        }
      }

      rank(hitting,["R","HR","RBI","SB","BB"]);
      rank(hitting,["K"],true);

      rank(pitching,["SO"]);
      rank(pitching,["ERA","WHIP","BB","HR"],true);

      render(hitting,pitching);
    } catch(err){
      console.error("Error loading rankings:", err);
    }
  }

  function rank(arr,cats,reverse=false){
    cats.forEach(cat=>{
      arr.sort((a,b)=> reverse ? a[cat]-b[cat] : b[cat]-a[cat]);
      arr.forEach((t,i)=> t[cat+"_rank"]=i+1);
    });
  }

  function formatStat(value, rank){
    const points = 31 - rank;
    let cls = "";
    if(rank <= 10) cls = "rank-good";
    else if(rank <= 20) cls = "rank-mid";
    else cls = "rank-bad";

    return `${value} <span class="${cls}">(#${rank} | +${points})</span>`;
  }

  function build(name, ids, stats, type){
    let total = 0;
    let html = `<h3>${name}</h3><table><tr><th>Team</th>`;
    if(type==="bat"){
      html+=`<th>R</th><th>HR</th><th>RBI</th><th>SB</th><th>BB</th><th>K</th>`;
    } else {
      html+=`<th>ERA</th><th>WHIP</th><th>SO</th><th>BB</th><th>HR</th>`;
    }
    html+=`<th>Score</th></tr>`;

    ids.forEach(id=>{
      const t = stats.find(x=>x.id===id);
      if(!t) return;

      let s=0;
      if(type==="bat"){
        s+=(31-t.R_rank)+(31-t.HR_rank)+(31-t.RBI_rank)+(31-t.SB_rank)+(31-t.BB_rank)+(31-t.K_rank);
      } else {
        s+=(31-t.SO_rank)+(31-t.ERA_rank)+(31-t.WHIP_rank)+(31-t.BB_rank)+(31-t.HR_rank);
      }
      total+=s;

      html+=`<tr><td>${t.name}</td>`;
      if(type==="bat"){
        html+=`<td>${formatStat(t.R, t.R_rank)}</td>
               <td>${formatStat(t.HR, t.HR_rank)}</td>
               <td>${formatStat(t.RBI, t.RBI_rank)}</td>
               <td>${formatStat(t.SB, t.SB_rank)}</td>
               <td>${formatStat(t.BB, t.BB_rank)}</td>
               <td>${formatStat(t.K, t.K_rank)}</td>`;
      } else {
        html+=`<td>${formatStat(t.ERA, t.ERA_rank)}</td>
               <td>${formatStat(t.WHIP, t.WHIP_rank)}</td>
               <td>${formatStat(t.SO, t.SO_rank)}</td>
               <td>${formatStat(t.BB, t.BB_rank)}</td>
               <td>${formatStat(t.HR, t.HR_rank)}</td>`;
      }
      html+=`<td>${s}</td></tr>`;
    });

    html+=`</table>`;
    return {html,total};
  }

  function render(hit,pit){
    const batDiv = document.getElementById("battingTab");
    const pitDiv = document.getElementById("pitchingTab");
    const board = document.getElementById("leaderboard");

    if(!batDiv || !pitDiv || !board){
      console.warn("Ranking divs not found yet");
      return;
    }

    let scores={};
    let batHTML="";
    let pitHTML="";

    for(const name in groups){
      const b = build(name,groups[name],hit,"bat");
      const p = build(name,groups[name],pit,"pit");

      batHTML+=b.html;
      pitHTML+=p.html;
      scores[name]=b.total+p.total;
    }

    batDiv.innerHTML=batHTML;
    pitDiv.innerHTML=pitHTML;

    let html="<h2>Leaderboard</h2><table><tr><th>Name</th><th>Score</th></tr>";
    Object.entries(scores).sort((a,b)=>b[1]-a[1]).forEach(([n,s])=>{
      html+=`<tr><td>${n}</td><td>${s}</td></tr>`;
    });
    html+="</table>";
    board.innerHTML=html;

    // Show batting tab by default
    window.showRankingTab("battingTab");
  }

  // Run rankings after DOM ready
  document.addEventListener("DOMContentLoaded", loadRankings);

})();