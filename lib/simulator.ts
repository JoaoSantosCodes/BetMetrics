import { Fixture, getFixtures, saveFixtures, getFilters, RobotFilter } from './db';
import { calculatePoisson, TeamStats } from './poisson';
import { calculateKelly } from './kelly';
import { sendValueBetAlert, sendLivePressureAlert, sendRobotTipAlert } from './telegram';

// Team historical stats mock data (avg goals scored/conceded)
const TEAM_HISTORICAL_STATS: { [key: string]: TeamStats } = {
  'Manchester City': { goalsScoredHome: 2.6, goalsConcededHome: 0.9, goalsScoredAway: 2.1, goalsConcededAway: 1.1, totalGamesHome: 15, totalGamesAway: 15 },
  'Real Madrid': { goalsScoredHome: 2.4, goalsConcededHome: 0.8, goalsScoredAway: 2.0, goalsConcededAway: 1.0, totalGamesHome: 15, totalGamesAway: 15 },
  'Liverpool': { goalsScoredHome: 2.5, goalsConcededHome: 1.0, goalsScoredAway: 1.8, goalsConcededAway: 1.3, totalGamesHome: 15, totalGamesAway: 15 },
  'Chelsea': { goalsScoredHome: 1.7, goalsConcededHome: 1.4, goalsScoredAway: 1.5, goalsConcededAway: 1.6, totalGamesHome: 15, totalGamesAway: 15 },
  'Arsenal': { goalsScoredHome: 2.3, goalsConcededHome: 0.7, goalsScoredAway: 2.1, goalsConcededAway: 0.9, totalGamesHome: 15, totalGamesAway: 15 },
  'Bayern Munich': { goalsScoredHome: 2.8, goalsConcededHome: 1.2, goalsScoredAway: 2.0, goalsConcededAway: 1.4, totalGamesHome: 15, totalGamesAway: 15 },
  'Flamengo': { goalsScoredHome: 2.0, goalsConcededHome: 0.6, goalsScoredAway: 1.5, goalsConcededAway: 1.0, totalGamesHome: 18, totalGamesAway: 18 },
  'Palmeiras': { goalsScoredHome: 1.9, goalsConcededHome: 0.7, goalsScoredAway: 1.4, goalsConcededAway: 0.9, totalGamesHome: 18, totalGamesAway: 18 },
  'Barcelona': { goalsScoredHome: 2.1, goalsConcededHome: 1.1, goalsScoredAway: 1.7, goalsConcededAway: 1.2, totalGamesHome: 16, totalGamesAway: 16 },
  'PSG': { goalsScoredHome: 2.5, goalsConcededHome: 1.0, goalsScoredAway: 2.2, goalsConcededAway: 1.1, totalGamesHome: 16, totalGamesAway: 16 },
  'AC Milan': { goalsScoredHome: 1.8, goalsConcededHome: 1.1, goalsScoredAway: 1.6, goalsConcededAway: 1.4, totalGamesHome: 15, totalGamesAway: 15 },
  'Juventus': { goalsScoredHome: 1.5, goalsConcededHome: 0.7, goalsScoredAway: 1.2, goalsConcededAway: 1.0, totalGamesHome: 15, totalGamesAway: 15 },
  'Dortmund': { goalsScoredHome: 2.2, goalsConcededHome: 1.3, goalsScoredAway: 1.7, goalsConcededAway: 1.4, totalGamesHome: 15, totalGamesAway: 15 },
  'Atletico Madrid': { goalsScoredHome: 2.0, goalsConcededHome: 0.9, goalsScoredAway: 1.3, goalsConcededAway: 1.3, totalGamesHome: 15, totalGamesAway: 15 },
  'Porto': { goalsScoredHome: 2.1, goalsConcededHome: 0.8, goalsScoredAway: 1.6, goalsConcededAway: 1.0, totalGamesHome: 15, totalGamesAway: 15 },
  'Benfica': { goalsScoredHome: 2.4, goalsConcededHome: 0.7, goalsScoredAway: 1.8, goalsConcededAway: 1.1, totalGamesHome: 15, totalGamesAway: 15 }
};

const DEFAULT_TEAM_STATS: TeamStats = {
  goalsScoredHome: 1.5,
  goalsConcededHome: 1.5,
  goalsScoredAway: 1.1,
  goalsConcededAway: 1.1,
  totalGamesHome: 10,
  totalGamesAway: 10
};

// Simulated matches configuration
const MATCH_TEMPLATES = [
  { id: 'm1', home: 'Manchester City', away: 'Real Madrid', league: 'Champions League', status: 'LIVE', minute: 68, score_home: 1, score_away: 1 },
  { id: 'm2', home: 'Arsenal', away: 'Bayern Munich', league: 'Champions League', status: 'LIVE', minute: 15, score_home: 0, score_away: 0 },
  { id: 'm3', home: 'Liverpool', away: 'Chelsea', league: 'Premier League', status: 'SCHEDULED', minute: 0, score_home: 0, score_away: 0 },
  { id: 'm4', home: 'Flamengo', away: 'Palmeiras', league: 'Brasileirão', status: 'LIVE', minute: 82, score_home: 0, score_away: 0 },
  { id: 'm5', home: 'Barcelona', away: 'PSG', league: 'Champions League', status: 'SCHEDULED', minute: 0, score_home: 0, score_away: 0 },
  { id: 'm6', home: 'AC Milan', away: 'Juventus', league: 'Serie A', status: 'SCHEDULED', minute: 0, score_home: 0, score_away: 0 },
  { id: 'm7', home: 'Dortmund', away: 'Atletico Madrid', league: 'Champions League', status: 'FINISHED', minute: 90, score_home: 3, score_away: 2 },
  { id: 'm8', home: 'Porto', away: 'Benfica', league: 'Liga Portugal', status: 'LIVE', minute: 42, score_home: 2, score_away: 0 }
];

import { fetchRealFixturesToday } from './apiFootball';

export async function getOrInitializeFixtures(): Promise<Fixture[]> {
  let fixtures = await getFixtures();

  if (fixtures.length === 0) {
    const realFixtures = await fetchRealFixturesToday();
    if (realFixtures) {
      fixtures = realFixtures;
    } else {
      fixtures = generateMockFixtures();
    }
    await saveFixtures(fixtures);
  }

  return fixtures;
}

// Generate the mock data using our Poisson calculator
function generateMockFixtures(): Fixture[] {
  const result: Fixture[] = [];
  const now = new Date();

  for (const t of MATCH_TEMPLATES) {
    const homeStats = TEAM_HISTORICAL_STATS[t.home] || DEFAULT_TEAM_STATS;
    const awayStats = TEAM_HISTORICAL_STATS[t.away] || DEFAULT_TEAM_STATS;

    // Run statistical engine
    const poisson = calculatePoisson(homeStats, awayStats);
    
    // Create random but realistic bookmaker odds by adding a juice/margin (e.g. 5-8%)
    // and introducing slight market inefficiency (value opportunities)
    const juice = 1.07; // 7% margin
    let bookie_odd_home = parseFloat((poisson.fairOdds.homeWin * juice).toFixed(2));
    let bookie_odd_draw = parseFloat((poisson.fairOdds.draw * juice).toFixed(2));
    let bookie_odd_away = parseFloat((poisson.fairOdds.awayWin * juice).toFixed(2));
    let bookie_odd_over25 = parseFloat((poisson.fairOdds.over25 * juice).toFixed(2));
    let bookie_odd_btts = parseFloat((poisson.fairOdds.bttsYes * juice).toFixed(2));

    // Forcefully inject Value Bets in some templates for illustration
    if (t.id === 'm1') {
      // Poisson Home Win odd: say 2.10. Let's make bookie offer 2.45
      bookie_odd_home = parseFloat((poisson.fairOdds.homeWin * 1.25).toFixed(2));
    } else if (t.id === 'm3') {
      // Over 2.5 has value
      bookie_odd_over25 = parseFloat((poisson.fairOdds.over25 * 1.22).toFixed(2));
    } else if (t.id === 'm5') {
      // BTTS Yes has value
      bookie_odd_btts = parseFloat((poisson.fairOdds.bttsYes * 1.18).toFixed(2));
    }

    // Evaluate Kelly Criterion for Match Odds, Over 2.5 and BTTS to find EV and Value
    let has_value = false;
    let value_market = '';
    let value_ev = 0;

    const kellyHome = calculateKelly(poisson.probabilities.homeWin, bookie_odd_home);
    const kellyOver = calculateKelly(poisson.probabilities.over25, bookie_odd_over25);
    const kellyBtts = calculateKelly(poisson.probabilities.bttsYes, bookie_odd_btts);

    if (kellyHome.hasValue && kellyHome.evPercent > value_ev) {
      has_value = true;
      value_market = 'Vitória ' + t.home;
      value_ev = kellyHome.evPercent;
    }
    if (kellyOver.hasValue && kellyOver.evPercent > value_ev) {
      has_value = true;
      value_market = 'Over 2.5 Gols';
      value_ev = kellyOver.evPercent;
    }
    if (kellyBtts.hasValue && kellyBtts.evPercent > value_ev) {
      has_value = true;
      value_market = 'Ambas Marcam: Sim';
      value_ev = kellyBtts.evPercent;
    }

    // Game initial live stats
    const possession_home = t.status === 'SCHEDULED' ? 0 : Math.floor(Math.random() * 20) + 40; // 40-60%
    const possession_away = t.status === 'SCHEDULED' ? 0 : 100 - possession_home;
    const attacks_danger_home = t.status === 'SCHEDULED' ? 0 : Math.floor(t.minute * 0.6);
    const attacks_danger_away = t.status === 'SCHEDULED' ? 0 : Math.floor(t.minute * 0.5);

    const active_alerts: string[] = [];
    if (has_value) {
      active_alerts.push('VALUE_BET');
    }

    // Live monitor alert rule (e.g. favorite drawing at 70' with high pressure)
    if (t.status === 'LIVE' && t.minute >= 60 && t.score_home === t.score_away) {
      // Let's assume the favorite is Manchester City (m1) or Flamengo (m4)
      if (t.home === 'Manchester City' && possession_home > 55) {
        active_alerts.push('EXPLORE_LATE_GOALS');
      }
    }

    const fixtureDate = new Date(now);
    if (t.status === 'SCHEDULED') {
      fixtureDate.setHours(now.getHours() + 2); // 2 hours from now
    } else if (t.status === 'FINISHED') {
      fixtureDate.setHours(now.getHours() - 3); // 3 hours ago
    }

    // Dispatch Telegram alert for new pre-match value bets
    if (has_value) {
      sendValueBetAlert(
        t.home,
        t.away,
        t.league,
        value_market,
        value_market.includes(t.home) ? poisson.fairOdds.homeWin : value_market.includes('Over') ? poisson.fairOdds.over25 : poisson.fairOdds.bttsYes,
        value_market.includes(t.home) ? bookie_odd_home : value_market.includes('Over') ? bookie_odd_over25 : bookie_odd_btts,
        value_ev,
        value_market.includes(t.home) ? kellyHome.suggestedStakePercent : value_market.includes('Over') ? kellyOver.suggestedStakePercent : kellyBtts.suggestedStakePercent
      );
    }

    result.push({
      id: t.id,
      home_team: t.home,
      away_team: t.away,
      league: t.league,
      date: fixtureDate.toISOString(),
      status: t.status as 'LIVE' | 'SCHEDULED' | 'FINISHED',
      minute: t.minute,
      score_home: t.score_home,
      score_away: t.score_away,
      possession_home,
      possession_away,
      attacks_danger_home,
      attacks_danger_away,
      fair_odd_home: poisson.fairOdds.homeWin,
      fair_odd_draw: poisson.fairOdds.draw,
      fair_odd_away: poisson.fairOdds.awayWin,
      fair_odd_over25: poisson.fairOdds.over25,
      fair_odd_btts: poisson.fairOdds.bttsYes,
      bookie_odd_home,
      bookie_odd_draw,
      bookie_odd_away,
      bookie_odd_over25,
      bookie_odd_btts,
      has_value,
      value_market,
      value_ev,
      active_alerts
    });
  }

  return result;
}

/**
 * Advances the simulation by 1 step. Called periodically on API hit.
 */
export async function advanceSimulation(): Promise<Fixture[]> {
  const fixtures = await getOrInitializeFixtures();
  const filters = await getFilters();
  const updated: Fixture[] = [];

  for (const f of fixtures) {
    if (f.status !== 'LIVE') {
      updated.push(f);
      continue;
    }

    // Increment clock
    let newMinute = f.minute + 1;
    let newStatus: 'LIVE' | 'SCHEDULED' | 'FINISHED' = f.status;
    let newScoreHome = f.score_home;
    let newScoreAway = f.score_away;

    if (newMinute >= 90) {
      newMinute = 90;
      newStatus = 'FINISHED';
    }

    // Dangerous attacks tick
    let newAttacksHome = f.attacks_danger_home + (Math.random() > 0.4 ? 1 : 0);
    let newAttacksAway = f.attacks_danger_away + (Math.random() > 0.5 ? 1 : 0);

    // Goal scoring chance (very low probability per minute, but scaled by attack metrics)
    const homeStats = TEAM_HISTORICAL_STATS[f.home_team] || DEFAULT_TEAM_STATS;
    const awayStats = TEAM_HISTORICAL_STATS[f.away_team] || DEFAULT_TEAM_STATS;

    // Simulate goal
    const goalProbHome = (homeStats.goalsScoredHome / 90) * 1.2;
    const goalProbAway = (awayStats.goalsScoredAway / 90) * 1.2;

    if (Math.random() < goalProbHome) {
      newScoreHome += 1;
    }
    if (Math.random() < goalProbAway) {
      newScoreAway += 1;
    }

    // Adjust possession slightly
    let newPossessionHome = f.possession_home + (Math.random() > 0.5 ? 1 : -1);
    newPossessionHome = Math.max(30, Math.min(70, newPossessionHome));
    let newPossessionAway = 100 - newPossessionHome;

    // Update alerts
    const active_alerts = [...f.active_alerts].filter(a => a !== 'EXPLORE_LATE_GOALS' && a !== 'ROBOT_TIP');

    // Live Game late goals alerts
    if (newMinute >= 70 && newMinute <= 85 && newScoreHome === newScoreAway) {
      // Home team has high attack pressure
      if (newPossessionHome >= 55 || (newAttacksHome - newAttacksAway) > 10) {
        active_alerts.push('EXPLORE_LATE_GOALS');
      }
    }

    // Semiautomatic Robot Tips check
    // We check the custom active filters on this fixture
    const robotTip = checkRobotFiltersForMatch(f, homeStats, awayStats, filters);
    if (robotTip) {
      active_alerts.push('ROBOT_TIP');
    }

    // Telegram Dispatches for newly triggered alerts (state transitions)
    if (active_alerts.includes('EXPLORE_LATE_GOALS') && !f.active_alerts.includes('EXPLORE_LATE_GOALS')) {
      sendLivePressureAlert(
        f.home_team,
        f.away_team,
        f.league,
        newMinute,
        `${newScoreHome} - ${newScoreAway}`,
        newPossessionHome,
        newAttacksHome,
        newAttacksAway
      );
    }

    if (active_alerts.includes('ROBOT_TIP') && !f.active_alerts.includes('ROBOT_TIP')) {
      const matchedFilter = filters.find(filter => {
        if (!filter.active) return false;
        const crit = filter.criteria;
        const homeConsecutiveScored = Math.round(homeStats.goalsScoredHome * 2.5);
        const awayConsecutiveConceded = Math.round(awayStats.goalsConcededAway * 3.2);
        const matchesHomeScored = homeConsecutiveScored >= crit.homeMinScoredConsecutive;
        const matchesAwayConceded = awayConsecutiveConceded >= crit.awayMinConcededConsecutive;
        return matchesHomeScored && matchesAwayConceded;
      });

      if (matchedFilter) {
        const poisson = calculatePoisson(homeStats, awayStats);
        let prob = 0;
        if (matchedFilter.criteria.market === 'BTTS') prob = poisson.probabilities.bttsYes * 100;
        else if (matchedFilter.criteria.market === 'OVER_25') prob = poisson.probabilities.over25 * 100;
        else if (matchedFilter.criteria.market === '1X2') prob = poisson.probabilities.homeWin * 100;

        sendRobotTipAlert(
          f.home_team,
          f.away_team,
          f.league,
          matchedFilter.name,
          matchedFilter.criteria.market === '1X2' ? `Vitória ${f.home_team}` : matchedFilter.criteria.market === 'OVER_25' ? 'Over 2.5 Gols' : 'Ambas Marcam: Sim',
          Math.round(prob)
        );
      }
    }

    updated.push({
      ...f,
      status: newStatus,
      minute: newMinute,
      score_home: newScoreHome,
      score_away: newScoreAway,
      attacks_danger_home: newAttacksHome,
      attacks_danger_away: newAttacksAway,
      possession_home: newPossessionHome,
      possession_away: newPossessionAway,
      active_alerts
    });
  }

  await saveFixtures(updated);
  return updated;
}

/**
 * Evaluates active filters on a given matchup.
 */
function checkRobotFiltersForMatch(
  f: Fixture,
  homeStats: TeamStats,
  awayStats: TeamStats,
  filters: RobotFilter[]
): boolean {
  for (const filter of filters) {
    if (!filter.active) continue;

    const crit = filter.criteria;

    // A: Home scored in last N matches
    // Since we mock, let's assume home team has scored in last 'goalsScoredHome * 3' matches consecutively
    const homeConsecutiveScored = Math.round(homeStats.goalsScoredHome * 2.5);
    const awayConsecutiveConceded = Math.round(awayStats.goalsConcededAway * 3.2);

    const matchesHomeScored = homeConsecutiveScored >= crit.homeMinScoredConsecutive;
    const matchesAwayConceded = awayConsecutiveConceded >= crit.awayMinConcededConsecutive;

    if (matchesHomeScored && matchesAwayConceded) {
      // Also check Poisson probability criteria
      const poisson = calculatePoisson(homeStats, awayStats);
      let prob = 0;
      if (crit.market === 'BTTS') prob = poisson.probabilities.bttsYes * 100;
      else if (crit.market === 'OVER_25') prob = poisson.probabilities.over25 * 100;
      else if (crit.market === '1X2') prob = poisson.probabilities.homeWin * 100;

      if (prob >= crit.minPoissonProbability) {
        return true;
      }
    }
  }

  return false;
}
