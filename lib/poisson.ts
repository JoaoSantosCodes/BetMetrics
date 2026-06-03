// Factorial helper function with cache
const factorialCache: { [key: number]: number } = { 0: 1, 1: 1 };
function factorial(n: number): number {
  if (n < 0) return 0;
  if (factorialCache[n] !== undefined) return factorialCache[n];
  let res = 1;
  for (let i = 2; i <= n; i++) {
    res *= i;
  }
  factorialCache[n] = res;
  return res;
}

// Calculate Poisson probability: (lambda^k * e^-lambda) / k!
export function poissonProbability(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

export interface TeamStats {
  goalsScoredHome: number; // Average goals scored at home
  goalsConcededHome: number; // Average goals conceded at home
  goalsScoredAway: number; // Average goals scored away
  goalsConcededAway: number; // Average goals conceded away
  totalGamesHome: number;
  totalGamesAway: number;
}

export interface PoissonOutput {
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
    over25: number;
    under25: number;
    bttsYes: number;
    bttsNo: number;
  };
  fairOdds: {
    homeWin: number;
    draw: number;
    awayWin: number;
    over25: number;
    under25: number;
    bttsYes: number;
    bttsNo: number;
  };
  expectedGoals: {
    home: number;
    away: number;
  };
}

// Defaults for League Averages (e.g. general league stats)
const DEFAULT_LEAGUE_AVG_HOME_SCORED = 1.5;
const DEFAULT_LEAGUE_AVG_AWAY_SCORED = 1.1;

/**
 * Calculates Poisson probabilities and Fair Odds for a matchup.
 */
export function calculatePoisson(
  homeStats: TeamStats,
  awayStats: TeamStats,
  leagueAvgHomeScored: number = DEFAULT_LEAGUE_AVG_HOME_SCORED,
  leagueAvgAwayScored: number = DEFAULT_LEAGUE_AVG_AWAY_SCORED
): PoissonOutput {
  
  // 1. Calculate Attack and Defense Strengths
  // Home team attack strength = Home goals scored avg / League home goals scored avg
  const homeAttack = homeStats.goalsScoredHome / leagueAvgHomeScored;
  // Away team defense strength = Away goals conceded avg / League home goals scored avg (since away defense concedes home goals)
  const awayDefense = awayStats.goalsConcededAway / leagueAvgHomeScored;
  
  // Expected goals for Home (lambda)
  const lambda = homeAttack * awayDefense * leagueAvgHomeScored;

  // Away team attack strength = Away goals scored avg / League away goals scored avg
  const awayAttack = awayStats.goalsScoredAway / leagueAvgAwayScored;
  // Home team defense strength = Home goals conceded avg / League away goals scored avg
  const homeDefense = homeStats.goalsConcededHome / leagueAvgAwayScored;

  // Expected goals for Away (mu)
  const mu = awayAttack * homeDefense * leagueAvgAwayScored;

  // Cap expected goals to reasonable limits
  const finalLambda = Math.max(0.1, Math.min(5.0, lambda));
  const finalMu = Math.max(0.1, Math.min(5.0, mu));

  // 2. Build Goal Grid (up to 10 goals per team)
  const maxGoals = 10;
  const homeProb: number[] = [];
  const awayProb: number[] = [];

  for (let i = 0; i <= maxGoals; i++) {
    homeProb.push(poissonProbability(finalLambda, i));
    awayProb.push(poissonProbability(finalMu, i));
  }

  let pHomeWin = 0;
  let pDraw = 0;
  let pAwayWin = 0;
  let pUnder25 = 0;
  
  // Calculate combined matrix
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const prob = homeProb[h] * awayProb[a];
      
      // 1X2 Markets
      if (h > a) pHomeWin += prob;
      else if (h === a) pDraw += prob;
      else pAwayWin += prob;

      // Over/Under 2.5 Market
      if (h + a < 2.5) pUnder25 += prob;
    }
  }

  const pOver25 = 1 - pUnder25;

  // BTTS Market (Both Teams To Score)
  // P(BTTS Yes) = P(Home Scored >= 1) * P(Away Scored >= 1)
  // P(Home Scored >= 1) = 1 - P(Home Scored 0)
  const pHomeScored = 1 - homeProb[0];
  const pAwayScored = 1 - awayProb[0];
  const pBttsYes = pHomeScored * pAwayScored;
  const pBttsNo = 1 - pBttsYes;

  // Helper to cap/format odd (avoid division by zero, max odd 1000)
  const getOdd = (p: number) => {
    if (p <= 0.001) return 1000.0;
    return parseFloat((1 / p).toFixed(2));
  };

  return {
    probabilities: {
      homeWin: parseFloat(pHomeWin.toFixed(4)),
      draw: parseFloat(pDraw.toFixed(4)),
      awayWin: parseFloat(pAwayWin.toFixed(4)),
      over25: parseFloat(pOver25.toFixed(4)),
      under25: parseFloat(pUnder25.toFixed(4)),
      bttsYes: parseFloat(pBttsYes.toFixed(4)),
      bttsNo: parseFloat(pBttsNo.toFixed(4)),
    },
    fairOdds: {
      homeWin: getOdd(pHomeWin),
      draw: getOdd(pDraw),
      awayWin: getOdd(pAwayWin),
      over25: getOdd(pOver25),
      under25: getOdd(pUnder25),
      bttsYes: getOdd(pBttsYes),
      bttsNo: getOdd(pBttsNo),
    },
    expectedGoals: {
      home: parseFloat(finalLambda.toFixed(2)),
      away: parseFloat(finalMu.toFixed(2)),
    }
  };
}
