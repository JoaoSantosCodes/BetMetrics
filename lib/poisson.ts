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
  goalsScoredHome: number;
  goalsConcededHome: number;
  goalsScoredAway: number;
  goalsConcededAway: number;
  totalGamesHome: number;
  totalGamesAway: number;
  cornersWonHome?: number;
  cornersConcededHome?: number;
  cornersWonAway?: number;
  cornersConcededAway?: number;
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
  // DNB Odds (Draw No Bet)
  dnbOdds: {
    home: number;
    away: number;
  };
  // Asian Handicap Odds
  asianHandicapOdds: {
    homeMinus05: number;  // Victory
    homePlus05: number;   // Victory or Draw (Double Chance)
    homeMinus15: number;  // Win by 2+ goals
    homePlus15: number;   // Lose by 1, draw or win
  };
  // Corners Predictions (Over/Under 9.5 Corners)
  cornersOdds: {
    expectedHome: number;
    expectedAway: number;
    expectedTotal: number;
    over95: number;
    under95: number;
  };
}

const DEFAULT_LEAGUE_AVG_HOME_SCORED = 1.5;
const DEFAULT_LEAGUE_AVG_AWAY_SCORED = 1.1;

export function calculatePoisson(
  homeStats: TeamStats,
  awayStats: TeamStats,
  leagueAvgHomeScored: number = DEFAULT_LEAGUE_AVG_HOME_SCORED,
  leagueAvgAwayScored: number = DEFAULT_LEAGUE_AVG_AWAY_SCORED
): PoissonOutput {
  
  // 1. Calculate Expected Goals
  const homeAttack = homeStats.goalsScoredHome / leagueAvgHomeScored;
  const awayDefense = awayStats.goalsConcededAway / leagueAvgHomeScored;
  const lambda = homeAttack * awayDefense * leagueAvgHomeScored;

  const awayAttack = awayStats.goalsScoredAway / leagueAvgAwayScored;
  const homeDefense = homeStats.goalsConcededHome / leagueAvgAwayScored;
  const mu = awayAttack * homeDefense * leagueAvgAwayScored;

  const finalLambda = Math.max(0.1, Math.min(5.0, lambda));
  const finalMu = Math.max(0.1, Math.min(5.0, mu));

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
  let pHomeWinBy2OrMore = 0;
  let pAwayLoseBy1OrLess = 0;
  
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const prob = homeProb[h] * awayProb[a];
      
      // Match Winner (1X2)
      if (h > a) pHomeWin += prob;
      else if (h === a) pDraw += prob;
      else pAwayWin += prob;

      // Over/Under 2.5
      if (h + a < 2.5) pUnder25 += prob;

      // Asian Handicap -1.5 (Home win by 2 or more)
      if (h - a >= 2) pHomeWinBy2OrMore += prob;

      // Asian Handicap +1.5 (Away loses by 1, draws or wins -> Home does not win by 2+)
      if (h - a < 2) pAwayLoseBy1OrLess += prob;
    }
  }

  const pOver25 = 1 - pUnder25;
  const pHomeScored = 1 - homeProb[0];
  const pAwayScored = 1 - awayProb[0];
  const pBttsYes = pHomeScored * pAwayScored;
  const pBttsNo = 1 - pBttsYes;

  const getOdd = (p: number) => p <= 0.001 ? 1000.0 : parseFloat((1 / p).toFixed(2));

  // 2. Calculate Draw No Bet (DNB)
  // If it's a draw, bet is voided. So DNB_Home = (1 - pDraw) / pHomeWin
  // Actually, conditional probability: P(Home | Not Draw) = P(Home) / P(Not Draw)
  const pNotDraw = 1 - pDraw;
  const pDnbHome = pNotDraw > 0 ? pHomeWin / pNotDraw : 0;
  const pDnbAway = pNotDraw > 0 ? pAwayWin / pNotDraw : 0;

  const dnbHomeOdd = pDnbHome > 0 ? parseFloat((1 / pDnbHome).toFixed(2)) : 1000.0;
  const dnbAwayOdd = pDnbAway > 0 ? parseFloat((1 / pDnbAway).toFixed(2)) : 1000.0;

  // 3. Calculate Asian Handicap Lines
  const ahMinus05Home = getOdd(pHomeWin);                   // Equivalent to Home Win
  const ahPlus05Home = getOdd(pHomeWin + pDraw);            // Equivalent to 1X Double Chance
  const ahMinus15Home = getOdd(pHomeWinBy2OrMore);
  const ahPlus15Home = getOdd(pAwayLoseBy1OrLess);

  // 4. Calculate Corners Predictions (Over/Under 9.5 Corners)
  // We model Corners using historical corners stats, or proxy them from attack metrics if unavailable
  const cornersWonHome = homeStats.cornersWonHome || (homeStats.goalsScoredHome * 3.0);
  const cornersConcededAway = awayStats.cornersConcededAway || (awayStats.goalsConcededHome * 3.0);
  const cornersWonAway = awayStats.cornersWonAway || (awayStats.goalsScoredAway * 2.8);
  const cornersConcededHome = homeStats.cornersConcededHome || (homeStats.goalsConcededHome * 2.8);

  const avgLeagueHomeCorners = 5.2;
  const avgLeagueAwayCorners = 4.3;

  const homeCornerAttack = cornersWonHome / avgLeagueHomeCorners;
  const awayCornerDefense = cornersConcededAway / avgLeagueHomeCorners;
  const lambdaCorners = Math.max(2.0, Math.min(10.0, homeCornerAttack * awayCornerDefense * avgLeagueHomeCorners));

  const awayCornerAttack = cornersWonAway / avgLeagueAwayCorners;
  const homeCornerDefense = cornersConcededHome / avgLeagueAwayCorners;
  const muCorners = Math.max(2.0, Math.min(10.0, awayCornerAttack * homeCornerDefense * avgLeagueAwayCorners));

  // Build Corners Goal Grid (up to 20 corners total)
  const maxCorners = 20;
  const homeCornerProb: number[] = [];
  const awayCornerProb: number[] = [];

  for (let i = 0; i <= maxCorners; i++) {
    homeCornerProb.push(poissonProbability(lambdaCorners, i));
    awayCornerProb.push(poissonProbability(muCorners, i));
  }

  let pUnder95Corners = 0;
  for (let hc = 0; hc <= maxCorners; hc++) {
    for (let ac = 0; ac <= maxCorners; ac++) {
      if (hc + ac < 9.5) {
        pUnder95Corners += (homeCornerProb[hc] * awayCornerProb[ac]);
      }
    }
  }

  const pOver95Corners = 1 - pUnder95Corners;

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
    },
    dnbOdds: {
      home: dnbHomeOdd,
      away: dnbAwayOdd
    },
    asianHandicapOdds: {
      homeMinus05: ahMinus05Home,
      homePlus05: ahPlus05Home,
      homeMinus15: ahMinus15Home,
      homePlus15: ahPlus15Home
    },
    cornersOdds: {
      expectedHome: parseFloat(lambdaCorners.toFixed(1)),
      expectedAway: parseFloat(muCorners.toFixed(1)),
      expectedTotal: parseFloat((lambdaCorners + muCorners).toFixed(1)),
      over95: getOdd(pOver95Corners),
      under95: getOdd(pUnder95Corners)
    }
  };
}
