import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// Define structures for our database
export interface Fixture {
  id: string;
  home_team: string;
  away_team: string;
  league: string;
  date: string;
  status: 'LIVE' | 'SCHEDULED' | 'FINISHED';
  minute: number;
  score_home: number;
  score_away: number;
  possession_home: number;
  possession_away: number;
  attacks_danger_home: number;
  attacks_danger_away: number;
  // Fair Odds (Poisson calculated)
  fair_odd_home: number;
  fair_odd_draw: number;
  fair_odd_away: number;
  fair_odd_over25: number;
  fair_odd_btts: number;
  // Real Bookmaker Odds
  bookie_odd_home: number;
  bookie_odd_draw: number;
  bookie_odd_away: number;
  bookie_odd_over25: number;
  bookie_odd_btts: number;
  // Value Bet Flag & EV
  has_value: boolean;
  value_market: string;
  value_ev: number; // expected value percentage e.g. 15.5 for 15.5%
  // Alerts
  active_alerts: string[]; // e.g. ["EXPLORE_LATE_GOALS", "VALUE_BET"]
}

export interface RobotFilter {
  id: string;
  name: string;
  criteria: {
    homeMinScoredConsecutive: number;
    awayMinConcededConsecutive: number;
    minPoissonProbability: number;
    market: '1X2' | 'OVER_25' | 'BTTS';
  };
  active: boolean;
}

export interface BankrollTransaction {
  id: string;
  date: string;
  fixture_name: string;
  market: string;
  suggested_stake_pct: number;
  amount_staked: number;
  odds: number;
  result: 'WON' | 'LOST' | 'PENDING';
  profit_loss: number;
  current_balance: number;
}

const isProduction = process.env.NODE_ENV === 'production';
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let pool: Pool | null = null;
const FALLBACK_DIR = path.join(process.cwd(), 'data');
const FALLBACK_FILE = path.join(FALLBACK_DIR, 'db_fallback.json');

// Initialize Fallback JSON Database
function initFallbackDB() {
  if (!fs.existsSync(FALLBACK_DIR)) {
    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
  }
  if (!fs.existsSync(FALLBACK_FILE)) {
    const defaultDB = {
      fixtures: [] as Fixture[],
      robot_filters: [
        {
          id: 'filter-btts',
          name: 'Ambas Marcam (Padrão)',
          criteria: {
            homeMinScoredConsecutive: 4,
            awayMinConcededConsecutive: 4,
            minPoissonProbability: 65,
            market: 'BTTS'
          },
          active: true
        },
        {
          id: 'filter-over25',
          name: 'Over 2.5 Gols de Valor',
          criteria: {
            homeMinScoredConsecutive: 3,
            awayMinConcededConsecutive: 3,
            minPoissonProbability: 60,
            market: 'OVER_25'
          },
          active: true
        }
      ] as RobotFilter[],
      bankroll: [
        {
          id: 'initial',
          date: new Date().toISOString(),
          fixture_name: 'Banca Inicializada',
          market: 'Configuração',
          suggested_stake_pct: 0,
          amount_staked: 0,
          odds: 0,
          result: 'WON',
          profit_loss: 0,
          current_balance: 1000.00
        }
      ] as BankrollTransaction[]
    };
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(defaultDB, null, 2), 'utf8');
  }
}

// Read Fallback
function readFallback(): { fixtures: Fixture[]; robot_filters: RobotFilter[]; bankroll: BankrollTransaction[] } {
  initFallbackDB();
  const data = fs.readFileSync(FALLBACK_FILE, 'utf8');
  return JSON.parse(data);
}

// Write Fallback
function writeFallback(data: any) {
  initFallbackDB();
  fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Initialize Postgres Database
export async function initializeDatabase() {
  if (connectionString) {
    try {
      pool = new Pool({
        connectionString,
        ssl: isProduction ? { rejectUnauthorized: false } : undefined,
      });

      // Create tables if they do not exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS fixtures (
          id VARCHAR(255) PRIMARY KEY,
          home_team VARCHAR(255) NOT NULL,
          away_team VARCHAR(255) NOT NULL,
          league VARCHAR(255) NOT NULL,
          date VARCHAR(255) NOT NULL,
          status VARCHAR(50) NOT NULL,
          minute INT NOT NULL,
          score_home INT NOT NULL,
          score_away INT NOT NULL,
          possession_home INT NOT NULL,
          possession_away INT NOT NULL,
          attacks_danger_home INT NOT NULL,
          attacks_danger_away INT NOT NULL,
          fair_odd_home NUMERIC NOT NULL,
          fair_odd_draw NUMERIC NOT NULL,
          fair_odd_away NUMERIC NOT NULL,
          fair_odd_over25 NUMERIC NOT NULL,
          fair_odd_btts NUMERIC NOT NULL,
          bookie_odd_home NUMERIC NOT NULL,
          bookie_odd_draw NUMERIC NOT NULL,
          bookie_odd_away NUMERIC NOT NULL,
          bookie_odd_over25 NUMERIC NOT NULL,
          bookie_odd_btts NUMERIC NOT NULL,
          has_value BOOLEAN NOT NULL,
          value_market VARCHAR(255),
          value_ev NUMERIC NOT NULL,
          active_alerts TEXT[] NOT NULL
        );

        CREATE TABLE IF NOT EXISTS robot_filters (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          criteria JSONB NOT NULL,
          active BOOLEAN NOT NULL
        );

        CREATE TABLE IF NOT EXISTS bankroll (
          id VARCHAR(255) PRIMARY KEY,
          date VARCHAR(255) NOT NULL,
          fixture_name VARCHAR(255) NOT NULL,
          market VARCHAR(255) NOT NULL,
          suggested_stake_pct NUMERIC NOT NULL,
          amount_staked NUMERIC NOT NULL,
          odds NUMERIC NOT NULL,
          result VARCHAR(50) NOT NULL,
          profit_loss NUMERIC NOT NULL,
          current_balance NUMERIC NOT NULL
        );
      `);

      // Seed default filters if empty
      const filterRes = await pool.query('SELECT COUNT(*) FROM robot_filters');
      if (parseInt(filterRes.rows[0].count) === 0) {
        await pool.query(`
          INSERT INTO robot_filters (id, name, criteria, active) VALUES
          ('filter-btts', 'Ambas Marcam (Padrão)', '{"homeMinScoredConsecutive": 4, "awayMinConcededConsecutive": 4, "minPoissonProbability": 65, "market": "BTTS"}', true),
          ('filter-over25', 'Over 2.5 Gols de Valor', '{"homeMinScoredConsecutive": 3, "awayMinConcededConsecutive": 3, "minPoissonProbability": 60, "market": "OVER_25"}', true)
        `);
      }

      // Seed initial bankroll if empty
      const bankRes = await pool.query('SELECT COUNT(*) FROM bankroll');
      if (parseInt(bankRes.rows[0].count) === 0) {
        await pool.query(`
          INSERT INTO bankroll (id, date, fixture_name, market, suggested_stake_pct, amount_staked, odds, result, profit_loss, current_balance)
          VALUES ('initial', $1, 'Banca Inicializada', 'Configuração', 0, 0, 0, 'WON', 0, 1000.00)
        `, [new Date().toISOString()]);
      }

      console.log('PostgreSQL database successfully initialized.');
      return;
    } catch (err) {
      console.error('Failed to initialize PostgreSQL. Falling back to JSON database.', err);
      pool = null;
    }
  }

  // Fallback setup
  initFallbackDB();
  console.log('Using JSON File database fallback.');
}

// Database Actions Interface
export async function getFixtures(): Promise<Fixture[]> {
  if (pool) {
    const res = await pool.query('SELECT * FROM fixtures');
    return res.rows.map(row => ({
      ...row,
      fair_odd_home: parseFloat(row.fair_odd_home),
      fair_odd_draw: parseFloat(row.fair_odd_draw),
      fair_odd_away: parseFloat(row.fair_odd_away),
      fair_odd_over25: parseFloat(row.fair_odd_over25),
      fair_odd_btts: parseFloat(row.fair_odd_btts),
      bookie_odd_home: parseFloat(row.bookie_odd_home),
      bookie_odd_draw: parseFloat(row.bookie_odd_draw),
      bookie_odd_away: parseFloat(row.bookie_odd_away),
      bookie_odd_over25: parseFloat(row.bookie_odd_over25),
      bookie_odd_btts: parseFloat(row.bookie_odd_btts),
      value_ev: parseFloat(row.value_ev),
    }));
  }
  return readFallback().fixtures;
}

export async function saveFixtures(fixtures: Fixture[]): Promise<void> {
  if (pool) {
    // Delete existing fixtures and insert updated ones
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM fixtures');
      for (const f of fixtures) {
        await client.query(`
          INSERT INTO fixtures (
            id, home_team, away_team, league, date, status, minute, score_home, score_away,
            possession_home, possession_away, attacks_danger_home, attacks_danger_away,
            fair_odd_home, fair_odd_draw, fair_odd_away, fair_odd_over25, fair_odd_btts,
            bookie_odd_home, bookie_odd_draw, bookie_odd_away, bookie_odd_over25, bookie_odd_btts,
            has_value, value_market, value_ev, active_alerts
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
        `, [
          f.id, f.home_team, f.away_team, f.league, f.date, f.status, f.minute, f.score_home, f.score_away,
          f.possession_home, f.possession_away, f.attacks_danger_home, f.attacks_danger_away,
          f.fair_odd_home, f.fair_odd_draw, f.fair_odd_away, f.fair_odd_over25, f.fair_odd_btts,
          f.bookie_odd_home, f.bookie_odd_draw, f.bookie_odd_away, f.bookie_odd_over25, f.bookie_odd_btts,
          f.has_value, f.value_market, f.value_ev, f.active_alerts
        ]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return;
  }

  const db = readFallback();
  db.fixtures = fixtures;
  writeFallback(db);
}

export async function getFilters(): Promise<RobotFilter[]> {
  if (pool) {
    const res = await pool.query('SELECT * FROM robot_filters');
    return res.rows;
  }
  return readFallback().robot_filters;
}

export async function saveFilter(filter: RobotFilter): Promise<void> {
  if (pool) {
    await pool.query(`
      INSERT INTO robot_filters (id, name, criteria, active)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        criteria = EXCLUDED.criteria,
        active = EXCLUDED.active
    `, [filter.id, filter.name, JSON.stringify(filter.criteria), filter.active]);
    return;
  }

  const db = readFallback();
  const index = db.robot_filters.findIndex(f => f.id === filter.id);
  if (index >= 0) {
    db.robot_filters[index] = filter;
  } else {
    db.robot_filters.push(filter);
  }
  writeFallback(db);
}

export async function deleteFilter(id: string): Promise<void> {
  if (pool) {
    await pool.query('DELETE FROM robot_filters WHERE id = $1', [id]);
    return;
  }

  const db = readFallback();
  db.robot_filters = db.robot_filters.filter(f => f.id !== id);
  writeFallback(db);
}

export async function getBankroll(): Promise<BankrollTransaction[]> {
  if (pool) {
    const res = await pool.query('SELECT * FROM bankroll ORDER BY date ASC');
    return res.rows.map(row => ({
      ...row,
      suggested_stake_pct: parseFloat(row.suggested_stake_pct),
      amount_staked: parseFloat(row.amount_staked),
      odds: parseFloat(row.odds),
      profit_loss: parseFloat(row.profit_loss),
      current_balance: parseFloat(row.current_balance),
    }));
  }
  return readFallback().bankroll;
}

export async function addBankrollTransaction(tx: BankrollTransaction): Promise<void> {
  if (pool) {
    await pool.query(`
      INSERT INTO bankroll (id, date, fixture_name, market, suggested_stake_pct, amount_staked, odds, result, profit_loss, current_balance)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      tx.id, tx.date, tx.fixture_name, tx.market, tx.suggested_stake_pct, tx.amount_staked, tx.odds, tx.result, tx.profit_loss, tx.current_balance
    ]);
    return;
  }

  const db = readFallback();
  db.bankroll.push(tx);
  writeFallback(db);
}

export async function resetBankroll(initialBalance: number): Promise<void> {
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM bankroll');
      await client.query(`
        INSERT INTO bankroll (id, date, fixture_name, market, suggested_stake_pct, amount_staked, odds, result, profit_loss, current_balance)
        VALUES ('initial', $1, 'Banca Resetada', 'Configuração', 0, 0, 0, 'WON', 0, $2)
      `, [new Date().toISOString(), initialBalance]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return;
  }

  const db = readFallback();
  db.bankroll = [
    {
      id: 'initial',
      date: new Date().toISOString(),
      fixture_name: 'Banca Resetada',
      market: 'Configuração',
      suggested_stake_pct: 0,
      amount_staked: 0,
      odds: 0,
      result: 'WON',
      profit_loss: 0,
      current_balance: initialBalance
    }
  ];
  writeFallback(db);
}
