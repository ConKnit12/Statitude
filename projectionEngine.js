/**
 * Statitude projection engine (v1)
 * Pure functions — no DOM.
 *
 * Full season = YTD actuals + rest-of-season (ROS)
 * Rates: blend YTD + prior season + league, regressed by sample size
 */

const ProjectionEngine = (() => {
  const PA0_RATE = 200; // AVG / OBP / SLG
  const PA0_PLATE = 100; // K% / BB%
  const IP0 = 40;

  const PA_PER_GAME = {
    everyday: 4.15,
    regular: 3.7,
    platoon: 2.5,
    bench: 1.2,
    pinch: 0.4
  };

  const IP_PER_GAME = {
    sp_ace: 1.05,
    sp_back: 0.85,
    rp_high: 0.4,
    rp_low: 0.3
  };

  const MAX_PA_FULL = 750;
  const MAX_IP_FULL = 220;

  // Mid-season default blend weights
  const LAMBDA = { ytd: 0.45, prior: 0.3, lg: 0.25 };

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function parseRate(v) {
    if (v == null || v === "" || v === "-") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function parseIP(ip) {
    if (ip == null || ip === "") return 0;
    const parts = String(ip).split(".");
    return num(parts[0]) + num(parts[1]) / 3;
  }

  function formatIP(ip) {
    const whole = Math.floor(ip);
    const outs = Math.round((ip - whole) * 3);
    if (outs === 3) return `${whole + 1}.0`;
    return `${whole}.${outs}`;
  }

  function format3(v) {
    if (v == null || Number.isNaN(v)) return ".000";
    return v.toFixed(3).replace(/^0\./, ".");
  }

  function format2(v) {
    if (v == null || Number.isNaN(v)) return "0.00";
    return v.toFixed(2);
  }

  /** Regress observed rate toward league given sample size */
  function regress(obs, lg, sample, sample0) {
    if (obs == null) return lg;
    if (lg == null) return obs;
    const w = sample / (sample + sample0);
    return w * obs + (1 - w) * lg;
  }

  function blendRates(ytd, prior, lg, sampleYtd, samplePrior, sample0) {
    const y = regress(ytd, lg, sampleYtd, sample0);
    const p = prior != null ? regress(prior, lg, samplePrior, sample0) : null;

    let ly = LAMBDA.ytd;
    let lp = LAMBDA.prior;
    let ll = LAMBDA.lg;

    if (ytd == null && sampleYtd <= 0) {
      ly = 0;
    }
    if (p == null) {
      lp = 0;
    }
    const sum = ly + lp + ll || 1;
    ly /= sum;
    lp /= sum;
    ll /= sum;

    const baseY = y != null ? y : lg;
    const baseP = p != null ? p : lg;
    return ly * baseY + lp * baseP + ll * lg;
  }

  function hitterRole(paYtd, teamGames) {
    const g = Math.max(teamGames, 1);
    const per = paYtd / g;
    if (per >= 3.5) return "everyday";
    if (per >= 2.8) return "regular";
    if (per >= 1.5) return "platoon";
    if (per >= 0.5) return "bench";
    if (paYtd > 0) return "pinch";
    return "bench"; // no YTD — depth default
  }

  function pitcherRole(ipYtd, gsYtd, teamGames) {
    const g = Math.max(teamGames, 1);
    const per = ipYtd / g;
    if (gsYtd >= Math.max(3, teamGames * 0.15) || per >= 0.75) {
      return per >= 0.95 ? "sp_ace" : "sp_back";
    }
    if (per >= 0.35) return "rp_high";
    return "rp_low";
  }

  /**
   * @param {object} ytd - season counting + rates from API
   * @param {object|null} prior - prior season
   * @param {object} league - league average rates
   * @param {number} teamGamesPlayed
   * @param {number} seasonLength default 162
   */
  function projectHitter(ytd, prior, league, teamGamesPlayed, seasonLength = 162) {
    const paYtd = num(ytd.plateAppearances);
    const abYtd = num(ytd.atBats);
    const hYtd = num(ytd.hits);
    const hrYtd = num(ytd.homeRuns);
    const bbYtd = num(ytd.baseOnBalls);
    const soYtd = num(ytd.strikeOuts);
    const hbpYtd = num(ytd.hitByPitch);
    const gYtd = num(ytd.gamesPlayed);

    const paPrior = num(prior?.plateAppearances);
    const abPrior = num(prior?.atBats);

    const avgYtd = parseRate(ytd.avg) ?? (abYtd ? hYtd / abYtd : null);
    const obpYtd = parseRate(ytd.obp);
    const slgYtd = parseRate(ytd.slg);
    const kYtd = paYtd ? soYtd / paYtd : null;
    const bbYtdR = paYtd ? bbYtd / paYtd : null;
    const hrPaYtd = paYtd ? hrYtd / paYtd : null;

    const avgPrior = parseRate(prior?.avg);
    const obpPrior = parseRate(prior?.obp);
    const slgPrior = parseRate(prior?.slg);
    const kPrior = paPrior ? num(prior.strikeOuts) / paPrior : null;
    const bbPrior = paPrior ? num(prior.baseOnBalls) / paPrior : null;
    const hrPaPrior = paPrior ? num(prior.homeRuns) / paPrior : null;

    const talent = {
      avg: blendRates(avgYtd, avgPrior, league.avg, abYtd, abPrior, PA0_RATE),
      obp: blendRates(obpYtd, obpPrior, league.obp, paYtd, paPrior, PA0_RATE),
      slg: blendRates(slgYtd, slgPrior, league.slg, abYtd, abPrior, PA0_RATE),
      kPct: blendRates(kYtd, kPrior, league.kPct, paYtd, paPrior, PA0_PLATE),
      bbPct: blendRates(bbYtdR, bbPrior, league.bbPct, paYtd, paPrior, PA0_PLATE),
      hrPa: blendRates(hrPaYtd, hrPaPrior, league.hrPa, paYtd, paPrior, PA0_PLATE)
    };

    const gRem = Math.max(0, seasonLength - teamGamesPlayed);
    const role = hitterRole(paYtd, teamGamesPlayed);
    const paPerG = PA_PER_GAME[role];

    // Pure model season: talent rates x full-year playing time (always a real projection)
    let paModel = seasonLength * paPerG;
    if (paModel > MAX_PA_FULL) paModel = MAX_PA_FULL;
    const bbM = talent.bbPct * paModel;
    const soM = talent.kPct * paModel;
    const hbpM = (paYtd > 0 ? hbpYtd / paYtd : 0.01) * paModel;
    const abM = Math.max(0, paModel - bbM - hbpM);
    const hM = talent.avg * abM;
    const hrM = talent.hrPa * paModel;
    const tbM = talent.slg * abM;

    // Rest-of-season bridge when games remain
    let paRos = gRem * paPerG;
    if (paYtd + paRos > MAX_PA_FULL) paRos = Math.max(0, MAX_PA_FULL - paYtd);
    const bbRos = talent.bbPct * paRos;
    const soRos = talent.kPct * paRos;
    const hbpRos = (paYtd > 0 ? hbpYtd / paYtd : 0.01) * paRos;
    const abRos = Math.max(0, paRos - bbRos - hbpRos);
    const hRos = talent.avg * abRos;
    const hrRos = talent.hrPa * paRos;
    const tbYtd =
      ytd.totalBases != null
        ? num(ytd.totalBases)
        : abYtd && slgYtd != null
          ? slgYtd * abYtd
          : hYtd + hrYtd * 2;
    const tbRos = talent.slg * abRos;

    // Prefer YTD+ROS when meaningful games left; else pure model year
    const useRosBridge = gRem >= 15;
    const paFull = useRosBridge ? paYtd + paRos : paModel;
    const abFull = useRosBridge ? abYtd + abRos : abM;
    const hFull = useRosBridge ? hYtd + hRos : hM;
    const hrFull = useRosBridge ? hrYtd + hrRos : hrM;
    const bbFull = useRosBridge ? bbYtd + bbRos : bbM;
    const soFull = useRosBridge ? soYtd + soRos : soM;
    const hbpFull = useRosBridge ? hbpYtd + hbpRos : hbpM;
    const tbFull = useRosBridge ? tbYtd + tbRos : tbM;

    const avgFull = abFull > 0 ? hFull / abFull : talent.avg;
    const obpFull =
      paFull > 0 ? (hFull + bbFull + hbpFull) / paFull : talent.obp;
    const slgFullAdj = abFull > 0 ? tbFull / abFull : talent.slg;

    return {
      role,
      talent,
      mode: useRosBridge ? "ytd_plus_ros" : "model_season",
      gamesRemaining: gRem,
      paRos: Math.round(paRos),
      actual: {
        plateAppearances: Math.round(paYtd),
        atBats: Math.round(abYtd),
        hits: Math.round(hYtd),
        homeRuns: Math.round(hrYtd),
        baseOnBalls: Math.round(bbYtd),
        strikeOuts: Math.round(soYtd),
        avg: format3(avgYtd ?? (abYtd ? hYtd / abYtd : 0)),
        obp: format3(obpYtd ?? 0),
        slg: format3(slgYtd ?? 0),
        ops: format3((obpYtd || 0) + (slgYtd || 0))
      },
      projected: {
        gamesPlayed: Math.round(
          useRosBridge
            ? gYtd + gRem * (role === "everyday" || role === "regular" ? 0.95 : 0.5)
            : seasonLength * (role === "everyday" || role === "regular" ? 0.95 : 0.55)
        ),
        plateAppearances: Math.round(paFull),
        atBats: Math.round(abFull),
        hits: Math.round(hFull),
        homeRuns: Math.round(hrFull),
        baseOnBalls: Math.round(bbFull),
        strikeOuts: Math.round(soFull),
        avg: format3(avgFull),
        obp: format3(obpFull),
        slg: format3(slgFullAdj),
        ops: format3(obpFull + slgFullAdj)
      },
      _raw: { avgFull, obpFull, slgFull: slgFullAdj, paFull, talentAvg: talent.avg }
    };
  }

  function projectPitcher(ytd, prior, league, teamGamesPlayed, seasonLength = 162) {
    const ipYtd = parseIP(ytd.inningsPitched);
    const ipPrior = parseIP(prior?.inningsPitched);
    const gsYtd = num(ytd.gamesStarted);
    const soYtd = num(ytd.strikeOuts);
    const bbYtd = num(ytd.baseOnBalls);
    const hrYtd = num(ytd.homeRuns);
    const erYtd = num(ytd.earnedRuns);
    const hYtd = num(ytd.hits);
    const wYtd = num(ytd.wins);
    const lYtd = num(ytd.losses);

    const k9Ytd = ipYtd > 0 ? (soYtd * 9) / ipYtd : null;
    const bb9Ytd = ipYtd > 0 ? (bbYtd * 9) / ipYtd : null;
    const hr9Ytd = ipYtd > 0 ? (hrYtd * 9) / ipYtd : null;
    const eraYtd = parseRate(ytd.era) ?? (ipYtd > 0 ? (erYtd * 9) / ipYtd : null);
    const whipYtd =
      parseRate(ytd.whip) ?? (ipYtd > 0 ? (hYtd + bbYtd) / ipYtd : null);

    const k9Prior = ipPrior > 0 ? (num(prior.strikeOuts) * 9) / ipPrior : null;
    const bb9Prior = ipPrior > 0 ? (num(prior.baseOnBalls) * 9) / ipPrior : null;
    const hr9Prior = ipPrior > 0 ? (num(prior.homeRuns) * 9) / ipPrior : null;
    const eraPrior = parseRate(prior?.era);
    const whipPrior = parseRate(prior?.whip);

    const talent = {
      k9: blendRates(k9Ytd, k9Prior, league.k9, ipYtd, ipPrior, IP0),
      bb9: blendRates(bb9Ytd, bb9Prior, league.bb9, ipYtd, ipPrior, IP0),
      hr9: blendRates(hr9Ytd, hr9Prior, league.hr9, ipYtd, ipPrior, IP0),
      era: blendRates(eraYtd, eraPrior, league.era, ipYtd, ipPrior, IP0),
      whip: blendRates(whipYtd, whipPrior, league.whip, ipYtd, ipPrior, IP0)
    };

    const gRem = Math.max(0, seasonLength - teamGamesPlayed);
    const role = pitcherRole(ipYtd, gsYtd, teamGamesPlayed);
    const ipPerG = IP_PER_GAME[role];

    let ipModel = seasonLength * ipPerG;
    if (ipModel > MAX_IP_FULL) ipModel = MAX_IP_FULL;
    const soM = (talent.k9 * ipModel) / 9;
    const bbM = (talent.bb9 * ipModel) / 9;
    const erM = (talent.era * ipModel) / 9;
    const hM = Math.max(0, talent.whip * ipModel - bbM);

    let ipRos = gRem * ipPerG;
    if (ipYtd + ipRos > MAX_IP_FULL) ipRos = Math.max(0, MAX_IP_FULL - ipYtd);
    const soRos = (talent.k9 * ipRos) / 9;
    const bbRos = (talent.bb9 * ipRos) / 9;
    const erRos = (talent.era * ipRos) / 9;
    const hRos = Math.max(0, talent.whip * ipRos - bbRos);

    const useRosBridge = gRem >= 15;
    const ipFull = useRosBridge ? ipYtd + ipRos : ipModel;
    const soFull = useRosBridge ? soYtd + soRos : soM;
    const bbFull = useRosBridge ? bbYtd + bbRos : bbM;
    const erFull = useRosBridge ? erYtd + erRos : erM;
    const hFull = useRosBridge ? hYtd + hRos : hM;
    const eraFull = ipFull > 0 ? (erFull * 9) / ipFull : talent.era;
    const whipFull = ipFull > 0 ? (hFull + bbFull) / ipFull : talent.whip;

    let wFull = wYtd;
    let lFull = lYtd;
    if (useRosBridge && gsYtd > 0 && gRem > 0) {
      const gsRos = (gsYtd / Math.max(teamGamesPlayed, 1)) * gRem;
      wFull = wYtd + (wYtd / Math.max(gsYtd, 1)) * gsRos;
      lFull = lYtd + (lYtd / Math.max(gsYtd, 1)) * gsRos;
    } else if (!useRosBridge && gsYtd > 0) {
      const gsModel = Math.min(34, Math.round(seasonLength * (gsYtd / Math.max(teamGamesPlayed, 1))));
      wFull = (wYtd / Math.max(gsYtd, 1)) * gsModel;
      lFull = (lYtd / Math.max(gsYtd, 1)) * gsModel;
    }

    return {
      role,
      talent,
      mode: useRosBridge ? "ytd_plus_ros" : "model_season",
      gamesRemaining: gRem,
      ipRos: Math.round(ipRos * 10) / 10,
      actual: {
        wins: wYtd,
        losses: lYtd,
        era: format2(eraYtd ?? 0),
        inningsPitched: formatIP(ipYtd),
        hits: Math.round(hYtd),
        earnedRuns: Math.round(erYtd),
        baseOnBalls: Math.round(bbYtd),
        strikeOuts: Math.round(soYtd),
        whip: format2(whipYtd ?? 0)
      },
      projected: {
        wins: Math.round(wFull),
        losses: Math.round(lFull),
        era: format2(eraFull),
        inningsPitched: formatIP(ipFull),
        hits: Math.round(hFull),
        earnedRuns: Math.round(erFull),
        baseOnBalls: Math.round(bbFull),
        strikeOuts: Math.round(soFull),
        whip: format2(whipFull)
      },
      _raw: { eraFull, whipFull, ipFull, soFull, talentEra: talent.era }
    };
  }

  /** Build league averages from a list of season stat objects */
  function leagueHittingAverages(statList) {
    let pa = 0,
      ab = 0,
      h = 0,
      bb = 0,
      so = 0,
      hr = 0,
      tb = 0,
      hbp = 0;
    statList.forEach(s => {
      if (!s) return;
      const p = num(s.plateAppearances);
      if (p < 1) return;
      pa += p;
      ab += num(s.atBats);
      h += num(s.hits);
      bb += num(s.baseOnBalls);
      so += num(s.strikeOuts);
      hr += num(s.homeRuns);
      hbp += num(s.hitByPitch);
      if (s.totalBases != null) tb += num(s.totalBases);
      else {
        const slg = parseRate(s.slg);
        if (slg != null) tb += slg * num(s.atBats);
      }
    });
    return {
      avg: ab ? h / ab : 0.245,
      obp: pa ? (h + bb + hbp) / pa : 0.315,
      slg: ab ? tb / ab : 0.4,
      kPct: pa ? so / pa : 0.22,
      bbPct: pa ? bb / pa : 0.08,
      hrPa: pa ? hr / pa : 0.03
    };
  }

  function leaguePitchingAverages(statList) {
    let ip = 0,
      so = 0,
      bb = 0,
      hr = 0,
      er = 0,
      h = 0;
    statList.forEach(s => {
      if (!s) return;
      const inn = parseIP(s.inningsPitched);
      if (inn < 1) return;
      ip += inn;
      so += num(s.strikeOuts);
      bb += num(s.baseOnBalls);
      hr += num(s.homeRuns);
      er += num(s.earnedRuns);
      h += num(s.hits);
    });
    return {
      k9: ip ? (so * 9) / ip : 8.5,
      bb9: ip ? (bb * 9) / ip : 3.2,
      hr9: ip ? (hr * 9) / ip : 1.2,
      era: ip ? (er * 9) / ip : 4.2,
      whip: ip ? (h + bb) / ip : 1.3
    };
  }

  function isQualifiedHitter(proj, teamGames, seasonLength = 162) {
    const g = teamGames > 20 ? teamGames : seasonLength;
    const need = 3.1 * g;
    return (proj.projected?.plateAppearances || 0) >= need;
  }

  /**
   * Aggregate roster projections → team RS, RA, Pythagorean W-L
   *
   * v2 calibration:
   * - PA-weighted top 9 (stars count more than the 9th man)
   * - RPG formula centered on ~4.5 R/G at league-average OBP/SLG
   * - Staff ERA from pitchers who actually eat innings (not 12 openers)
   * - Mild stretch + soft win compress so ~1–3 teams can reach 100, not a dozen
   */
  function projectTeam(hitters, pitchers, seasonLength = 162) {
    const lineup = [...(hitters || [])]
      .filter(h => (h.projected?.plateAppearances || 0) >= 150)
      .sort(
        (a, b) =>
          (b.projected?.plateAppearances || 0) -
          (a.projected?.plateAppearances || 0)
      )
      .slice(0, 9);

    // If filter too strict (small roster), fall back
    const pool =
      lineup.length >= 5
        ? lineup
        : [...(hitters || [])]
            .filter(h => (h.projected?.plateAppearances || 0) > 0)
            .sort(
              (a, b) =>
                (b.projected?.plateAppearances || 0) -
                (a.projected?.plateAppearances || 0)
            )
            .slice(0, 9);

    let wPa = 0;
    let obpW = 0;
    let slgW = 0;
    pool.forEach(h => {
      const pa = Number(h.projected?.plateAppearances) || 1;
      const obp = Number(h._raw?.obpFull ?? h.projected?.obp) || 0.3;
      const slg = Number(h._raw?.slgFull ?? h.projected?.slg) || 0.4;
      // Mild extra weight for high-PA regulars
      const w = pa;
      wPa += w;
      obpW += obp * w;
      slgW += slg * w;
    });
    const teamObp = wPa > 0 ? obpW / wPa : 0.315;
    const teamSlg = wPa > 0 ? slgW / wPa : 0.4;
    const teamOps = teamObp + teamSlg;

    // Calibrated so ~.320/.410 ≈ 4.5 R/G; strong lineups can reach ~5.5–6.0
    let rpg = -2.3 + 12.0 * teamObp + 8.2 * teamSlg;
    rpg = Math.max(3.4, Math.min(5.9, rpg));
    let runsScored = rpg * seasonLength;

    // Staff: prefer innings-eaters (SP + main RP). Sort by IP, take until ~1450 IP
    const staff = [...(pitchers || [])]
      .map(p => ({
        ip: Number(p._raw?.ipFull) || parseIP(p.projected?.inningsPitched),
        era: Number(p._raw?.eraFull ?? p.projected?.era) || 4.5
      }))
      .filter(p => p.ip >= 20)
      .sort((a, b) => b.ip - a.ip);

    let ipTot = 0;
    let erW = 0;
    const IP_TARGET = 9 * seasonLength; // ~1458
    for (const p of staff) {
      const take = Math.min(p.ip, Math.max(0, IP_TARGET - ipTot));
      if (take <= 0) break;
      ipTot += take;
      erW += p.era * take;
      if (ipTot >= IP_TARGET * 0.92) break;
    }
    // If not enough IP, fill remainder at league-ish 4.40 ERA
    if (ipTot < IP_TARGET * 0.85) {
      const fill = IP_TARGET * 0.85 - ipTot;
      ipTot += fill;
      erW += 4.4 * fill;
    }
    const staffEra = ipTot > 0 ? erW / ipTot : 4.4;
    let runsAllowed = staffEra * seasonLength;

    // Mild stretch only — heavy stretch made too many 100-win teams
    const lgR = 4.5 * seasonLength;
    const stretch = 1.12;
    runsScored = lgR + (runsScored - lgR) * stretch;
    runsAllowed = lgR + (runsAllowed - lgR) * stretch;
    runsScored = Math.max(600, Math.min(920, runsScored));
    runsAllowed = Math.max(600, Math.min(920, runsAllowed));

    const rs = runsScored;
    const ra = runsAllowed;
    const exp = 1.83;
    const wpct =
      rs > 0 || ra > 0
        ? Math.pow(rs, exp) / (Math.pow(rs, exp) + Math.pow(ra, exp))
        : 0.5;
    // Soft-compress toward 81 so the league does not flood with 100-win clubs
    // (ordering preserved; extreme tails pulled in a bit)
    let wins = wpct * seasonLength;
    wins = 81 + (wins - 81) * 0.88;
    wins = Math.max(55, Math.min(105, wins));
    const losses = seasonLength - wins;

    return {
      lineupSize: pool.length,
      teamObp: format3(teamObp),
      teamSlg: format3(teamSlg),
      teamOps: format3(teamOps),
      runsPerGame: Number((rs / seasonLength).toFixed(2)),
      runsScored: Math.round(rs),
      runsAllowed: Math.round(ra),
      staffEra: format2(staffEra),
      staffIp: Math.round(ipTot),
      winPct: format3(wpct).replace(/^0/, "") || wpct.toFixed(3),
      wins: Math.round(wins * 10) / 10,
      losses: Math.round(losses * 10) / 10,
      winsRounded: Math.round(wins),
      lossesRounded: Math.round(losses)
    };
  }

  return {
    projectHitter,
    projectPitcher,
    projectTeam,
    leagueHittingAverages,
    leaguePitchingAverages,
    hitterRole,
    pitcherRole,
    isQualifiedHitter,
    format3,
    format2,
    parseIP,
    PA_PER_GAME,
    IP_PER_GAME
  };
})();

if (typeof window !== "undefined") {
  window.ProjectionEngine = ProjectionEngine;
}
