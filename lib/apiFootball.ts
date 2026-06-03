import { Fixture } from './db';
import { calculatePoisson } from './poisson';

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = 'https://v3.football.api-sports.io';

export interface APIFootballResponse {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string;
    date: string;
    timestamp: number;
    periods: { first: number | null; second: number | null };
    status: { long: string; short: string; elapsed: number };
  };
  league: { id: number; name: string; country: string; logo: string; flag: string; season: number; round: string };
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null };
    away: { id: number; name: string; logo: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty: { home: number | null; away: number | null };
  };
}

/**
 * Fetches real fixtures for today from API-Football.
 * If no API key is provided, returns null to trigger fallback simulator data.
 */
export async function fetchRealFixturesToday(): Promise<Fixture[] | null> {
  if (!API_KEY) {
    console.warn('API_FOOTBALL_KEY not configured. Falling back to simulated fixtures.');
    return null;
  }

  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const res = await fetch(`${API_URL}/fixtures?date=${todayStr}`, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io'
      },
      next: { revalidate: 60 } // Cache request for 60 seconds
    });

    if (!res.ok) {
      throw new Error(`API-Football error: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.response || data.response.length === 0) {
      return [];
    }

    return mapAPIFixturesToInternal(data.response);
  } catch (error) {
    console.error('Failed to fetch from API-Football:', error);
    return null;
  }
}

/**
 * Maps raw API-Football fixtures into the internal schema, 
 * calculating Poisson fair odds and initial value signals dynamically.
 */
function mapAPIFixturesToInternal(apiResponse: APIFootballResponse[]): Fixture[] {
  // Mock team averages if not stored in DB (could be enhanced by standings scraper)
  const defaultStats = {
    goalsScoredHome: 1.6,
    goalsConcededHome: 1.1,
    goalsScoredAway: 1.2,
    goalsConcededAway: 1.4,
    totalGamesHome: 10,
    totalGamesAway: 10
  };

  return apiResponse.map(item => {
    // Determine status
    let status: 'LIVE' | 'SCHEDULED' | 'FINISHED' = 'SCHEDULED';
    const shortStatus = item.fixture.status.short;
    if (['1H', '2H', 'HT', 'ET', 'BT'].includes(shortStatus)) {
      status = 'LIVE';
    } else if (['FT', 'AET', 'PEN'].includes(shortStatus)) {
      status = 'FINISHED';
    }

    // Run poisson on default/historical stats
    const poisson = calculatePoisson(defaultStats, defaultStats);

    // Bookmaker odds estimation (in production, fetch from /odds endpoint of API-Football)
    // We create realistic bookie odds with slight margins
    const margin = 1.06;
    const bookie_odd_home = parseFloat((poisson.fairOdds.homeWin * margin).toFixed(2));
    const bookie_odd_draw = parseFloat((poisson.fairOdds.draw * margin).toFixed(2));
    const bookie_odd_away = parseFloat((poisson.fairOdds.awayWin * margin).toFixed(2));
    const bookie_odd_over25 = parseFloat((poisson.fairOdds.over25 * margin).toFixed(2));
    const bookie_odd_btts = parseFloat((poisson.fairOdds.bttsYes * margin).toFixed(2));

    return {
      id: 'real-' + item.fixture.id,
      home_team: item.teams.home.name,
      away_team: item.teams.away.name,
      league: item.league.name,
      date: item.fixture.date,
      status,
      minute: item.fixture.status.elapsed || 0,
      score_home: item.goals.home ?? 0,
      score_away: item.goals.away ?? 0,
      possession_home: 50, // default until stats endpoint called
      possession_away: 50,
      attacks_danger_home: 0,
      attacks_danger_away: 0,
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
      has_value: false,
      value_market: '',
      value_ev: 0,
      active_alerts: []
    };
  });
}
