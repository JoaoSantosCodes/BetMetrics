'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Fixture, RobotFilter, BankrollTransaction } from '@/lib/db';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'live' | 'value' | 'robot' | 'bankroll'>('live');
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [filters, setFilters] = useState<RobotFilter[]>([]);
  const [bankroll, setBankroll] = useState<BankrollTransaction[]>([]);
  
  const [isSimulating, setIsSimulating] = useState(false);
  const [alertLogs, setAlertLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Forms state
  const [newFilterName, setNewFilterName] = useState('');
  const [criteriaHomeScored, setCriteriaHomeScored] = useState(3);
  const [criteriaAwayConceded, setCriteriaAwayConceded] = useState(3);
  const [criteriaPoissonProb, setCriteriaPoissonProb] = useState(60);
  const [criteriaMarket, setCriteriaMarket] = useState<'1X2' | 'OVER_25' | 'BTTS'>('BTTS');

  const [customBetFixture, setCustomBetFixture] = useState('');
  const [customBetMarket, setCustomBetMarket] = useState('');
  const [customBetOdds, setCustomBetOdds] = useState('');
  const [customBetStake, setCustomBetStake] = useState('');
  const [customBetResult, setCustomBetResult] = useState<'WON' | 'LOST' | 'PENDING'>('WON');

  const [initialBancaAmount, setInitialBancaAmount] = useState('1000');

  // Synthesize browser chime sound using Web Audio API
  const playNotificationChime = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // First Note
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
      gain1.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + 0.12);
      osc1.start();
      osc1.stop(audioCtx.currentTime + 0.12);
      
      // Second Note
      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.frequency.setValueAtTime(880.00, audioCtx.currentTime); // A5
        gain2.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + 0.22);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.22);
      }, 100);
    } catch (e) {
      console.error('Audio chime error:', e);
    }
  }, []);

  // Fetch all initial data
  const fetchData = useCallback(async (isAdvance = false) => {
    try {
      const fixturesUrl = `/api/fixtures${isAdvance ? '?advance=true' : ''}`;
      const [fixRes, filterRes, bankRes] = await Promise.all([
        fetch(fixturesUrl).then(r => r.json()),
        fetch('/api/robot').then(r => r.json()),
        fetch('/api/bankroll').then(r => r.json())
      ]);

      if (fixRes.success) {
        // Detect updates to trigger alerts / logs
        if (fixtures.length > 0) {
          const oldMap = new Map(fixtures.map(f => [f.id, f]));
          fixRes.fixtures.forEach((newF: Fixture) => {
            const oldF = oldMap.get(newF.id);
            if (oldF) {
              // Goal detection
              if (newF.score_home !== oldF.score_home || newF.score_away !== oldF.score_away) {
                const goalMsg = `⚽ GOL! ${newF.home_team} ${newF.score_home} - ${newF.score_away} ${newF.away_team} (${newF.minute}')`;
                setAlertLogs(prev => [goalMsg, ...prev.slice(0, 19)]);
                playNotificationChime();
              }
              // Alert trigger detection
              newF.active_alerts.forEach(alert => {
                if (!oldF.active_alerts.includes(alert)) {
                  let alertText = '';
                  if (alert === 'VALUE_BET') {
                    alertText = `🔥 VALUE BET: Desvio de odd encontrado em ${newF.home_team} vs ${newF.away_team} (${newF.value_market})`;
                  } else if (alert === 'EXPLORE_LATE_GOALS') {
                    alertText = `⚡ ALERTA LIVE: ${newF.home_team} vs ${newF.away_team} com alta pressão nos minutos finais!`;
                  } else if (alert === 'ROBOT_TIP') {
                    alertText = `🤖 TIP ROBÔ: Filtro semiautomático acionou em ${newF.home_team} vs ${newF.away_team}!`;
                  }
                  if (alertText) {
                    setAlertLogs(prev => [alertText, ...prev.slice(0, 19)]);
                    playNotificationChime();
                  }
                }
              });
            }
          });
        }
        setFixtures(fixRes.fixtures);
      }
      if (filterRes.success) setFilters(filterRes.filters);
      if (bankRes.success) setBankroll(bankRes.ledger);
    } catch (e) {
      console.error('Error fetching data:', e);
    } finally {
      setLoading(false);
    }
  }, [fixtures, playNotificationChime]);

  // Initial load
  useEffect(() => {
    fetchData();
    // Add default initial logs
    setAlertLogs([
      'ℹ️ Sistema carregado. Banco de Dados pronto.',
      'ℹ️ Simulador de Odds & Poisson ativado.',
      'ℹ️ Monitorando ligas: Champions League, Premier League, Brasileirão, Serie A.'
    ]);
  }, []);

  // Periodic polling / advance when simulation is ON
  useEffect(() => {
    let intervalId: any;
    if (isSimulating) {
      intervalId = setInterval(() => {
        fetchData(true);
      }, 4000); // Poll and advance every 4 seconds
    }
    return () => clearInterval(intervalId);
  }, [isSimulating, fetchData]);

  // Toggle filter status
  const handleToggleFilter = async (filter: RobotFilter) => {
    try {
      const res = await fetch('/api/robot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...filter, active: !filter.active })
      }).then(r => r.json());
      if (res.success) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Add new filter
  const handleCreateFilter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFilterName) return;

    try {
      const res = await fetch('/api/robot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFilterName,
          criteria: {
            homeMinScoredConsecutive: criteriaHomeScored,
            awayMinConcededConsecutive: criteriaAwayConceded,
            minPoissonProbability: criteriaPoissonProb,
            market: criteriaMarket
          },
          active: true
        })
      }).then(r => r.json());

      if (res.success) {
        setNewFilterName('');
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Delete filter
  const handleDeleteFilter = async (id: string) => {
    try {
      const res = await fetch(`/api/robot?id=${id}`, {
        method: 'DELETE'
      }).then(r => r.json());
      if (res.success) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Add Bet Transaction (Kelly or Custom)
  const handleAddBet = async (
    fixtureName: string,
    market: string,
    suggestedStakePct: number,
    odds: number,
    amountStaked: number,
    result: 'WON' | 'LOST' | 'PENDING'
  ) => {
    try {
      const res = await fetch('/api/bankroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixture_name: fixtureName,
          market,
          suggested_stake_pct: suggestedStakePct,
          amount_staked: amountStaked,
          odds,
          result
        })
      }).then(r => r.json());

      if (res.success) {
        fetchData();
        // Go to bankroll tab to see ledger
        setActiveTab('bankroll');
        playNotificationChime();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Manual custom bet form submit
  const handleCustomBetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customBetFixture || !customBetMarket || !customBetOdds || !customBetStake) return;

    handleAddBet(
      customBetFixture,
      customBetMarket,
      0, // no custom Kelly preset
      parseFloat(customBetOdds),
      parseFloat(customBetStake),
      customBetResult
    );

    // Clear form
    setCustomBetFixture('');
    setCustomBetMarket('');
    setCustomBetOdds('');
    setCustomBetStake('');
  };

  // Reset Bankroll
  const handleResetBanca = async () => {
    if (!window.confirm('Tem certeza de que deseja zerar o histórico de banca e saldo?')) return;
    try {
      const res = await fetch(`/api/bankroll?initialBalance=${initialBancaAmount}`, {
        method: 'DELETE'
      }).then(r => r.json());

      if (res.success) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Settle Bankroll stats
  const getBancaStats = () => {
    if (bankroll.length === 0) return { balance: 0, profit: 0, winRate: 0, totalBets: 0 };
    const latestTx = bankroll[bankroll.length - 1];
    const initialTx = bankroll[0];
    
    const balance = latestTx.current_balance;
    const initialBalance = initialTx.current_balance;
    const profit = balance - initialBalance;

    const betTransactions = bankroll.filter(t => t.market !== 'Configuração');
    const totalBets = betTransactions.length;
    const wonBets = betTransactions.filter(t => t.result === 'WON').length;
    const winRate = totalBets > 0 ? (wonBets / totalBets) * 100 : 0;

    return {
      balance,
      profit,
      winRate: parseFloat(winRate.toFixed(1)),
      totalBets
    };
  };

  const stats = getBancaStats();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#080C14', color: '#FFF' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="status-dot" style={{ margin: '0 auto 1.5rem', width: '20px', height: '20px' }}></div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Carregando Engine de Odds...</h2>
        </div>
      </div>
    );
  }

  // Filter fixtures that have active value bets
  const valueBets = fixtures.filter(f => f.has_value);

  return (
    <div className="container">
      {/* Upper header / Command bar */}
      <header className="header">
        <div className="logo-section">
          <h1>Odds Analytics</h1>
          <span className="logo-badge">IA Preditiva</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button 
            className={`btn ${isSimulating ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setIsSimulating(!isSimulating)}
          >
            {isSimulating ? (
              <>
                <span className="status-dot"></span>
                Simulador Ativo
              </>
            ) : (
              <>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#6B7280', display: 'inline-block' }}></span>
                Iniciar Simulação Live
              </>
            )}
          </button>
          <div className="server-status">
            <span className="status-dot"></span>
            Database Online
          </div>
        </div>
      </header>

      {/* Tabs navigation */}
      <nav className="tabs-nav">
        <button className={`tab-btn ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>
          📟 Command Center (Live)
        </button>
        <button className={`tab-btn ${activeTab === 'value' ? 'active' : ''}`} onClick={() => setActiveTab('value')}>
          🎯 Oportunidades (Value Bets)
        </button>
        <button className={`tab-btn ${activeTab === 'robot' ? 'active' : ''}`} onClick={() => setActiveTab('robot')}>
          🤖 Robô de Tips Semiauto
        </button>
        <button className={`tab-btn ${activeTab === 'bankroll' ? 'active' : ''}`} onClick={() => setActiveTab('bankroll')}>
          📈 Gestão de Banca Inteligente
        </button>
      </nav>

      {/* Main dashboard content */}
      <main>
        {/* Tab 1: Live Command Center */}
        {activeTab === 'live' && (
          <div className="grid-container">
            {/* Matches list */}
            <div>
              <h2 className="panel-title">📡 Painel de Jogos Live e Agendados</h2>
              {fixtures.map(match => (
                <div key={match.id} className={`match-card glass-card ${match.status === 'LIVE' ? 'live-glow' : ''}`}>
                  <div className="match-header">
                    <span className="league-tag">{match.league}</span>
                    {match.status === 'LIVE' ? (
                      <span className="live-badge">
                        <span></span> LIVE {match.minute}'
                      </span>
                    ) : match.status === 'FINISHED' ? (
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Encerrado</span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-secondary)' }}>Pré-Jogo</span>
                    )}
                  </div>

                  <div className="scoreboard">
                    <div style={{ width: '42%', textAlign: 'right' }}>
                      <span className="team-name">{match.home_team}</span>
                    </div>
                    <div className="score-display">
                      {match.status === 'SCHEDULED' ? 'VS' : `${match.score_home} - ${match.score_away}`}
                    </div>
                    <div style={{ width: '42%', textAlign: 'left' }}>
                      <span className="team-name">{match.away_team}</span>
                    </div>
                  </div>

                  {/* Show live statistics bars if live */}
                  {match.status === 'LIVE' && (
                    <div className="live-stats">
                      <div className="stat-item">
                        <div className="stat-label">
                          <span>Posse de Bola</span>
                          <span>{match.possession_home}% / {match.possession_away}%</span>
                        </div>
                        <div className="stat-bar-container">
                          <div className="stat-bar-home" style={{ width: `${match.possession_home}%` }}></div>
                          <div className="stat-bar-away" style={{ width: `${match.possession_away}%` }}></div>
                        </div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-label">
                          <span>Ataques Perigosos</span>
                          <span>{match.attacks_danger_home} / {match.attacks_danger_away}</span>
                        </div>
                        <div className="stat-bar-container">
                          <div className="stat-bar-home" style={{ width: `${(match.attacks_danger_home / (match.attacks_danger_home + match.attacks_danger_away || 1)) * 100}%` }}></div>
                          <div className="stat-bar-away" style={{ width: `${(match.attacks_danger_away / (match.attacks_danger_home + match.attacks_danger_away || 1)) * 100}%` }}></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Active Alert triggers for the game */}
                  {match.active_alerts.length > 0 && (
                    <div className="match-alerts">
                      {match.active_alerts.map(a => {
                        if (a === 'VALUE_BET') {
                          return <span key={a} className="alert-pill value">💎 Valor Encontrado</span>;
                        }
                        if (a === 'EXPLORE_LATE_GOALS') {
                          return <span key={a} className="alert-pill late-goals">🔥 Pressão de Gol no Fim</span>;
                        }
                        if (a === 'ROBOT_TIP') {
                          return <span key={a} className="alert-pill robot">🤖 Robô Semiauto Acionou</span>;
                        }
                        return null;
                      })}
                    </div>
                  )}

                  {/* Summary of Poisson Odds */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.75rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Fair Odds (Poisson): 
                      <span className="odd-chip" style={{ marginLeft: '0.5rem' }}>Casa {match.fair_odd_home}</span>
                      <span className="odd-chip" style={{ marginLeft: '0.25rem' }}>Empate {match.fair_odd_draw}</span>
                      <span className="odd-chip" style={{ marginLeft: '0.25rem' }}>Fora {match.fair_odd_away}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Bookie: 
                      <span className={`odd-chip ${match.bookie_odd_home > match.fair_odd_home && match.has_value && match.value_market.includes(match.home_team) ? 'value-highlight' : ''}`} style={{ marginLeft: '0.5rem' }}>{match.bookie_odd_home}</span>
                      <span className="odd-chip" style={{ marginLeft: '0.25rem' }}>{match.bookie_odd_draw}</span>
                      <span className={`odd-chip ${match.bookie_odd_away > match.fair_odd_away && match.has_value && match.value_market.includes(match.away_team) ? 'value-highlight' : ''}`} style={{ marginLeft: '0.25rem' }}>{match.bookie_odd_away}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Sidebar real-time alert logs */}
            <div className="glass-card">
              <h2 className="panel-title">🔔 Feed de Alertas em Tempo Real</h2>
              <div className="alert-feed">
                {alertLogs.map((log, index) => (
                  <div key={index} className="feed-card">
                    <p style={{ fontSize: '0.9rem', color: log.includes('GOL') ? 'var(--accent-primary)' : log.includes('VALUE') ? '#60A5FA' : 'var(--text-primary)' }}>
                      {log}
                    </p>
                    <span className="feed-time">agora mesmo</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Value Bets Dashboard */}
        {activeTab === 'value' && (
          <div className="glass-card">
            <h2 className="panel-title">🎯 Oportunidades de Value Bets Encontradas</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Nosso motor estatístico cruza a probabilidade da Distribuição de Poisson (Odd Justa) com a Odd Real oferecida pelas casas. Se a Odd do bookmaker pagar mais do que a probabilidade real aponta, ela entra na lista de apostas de valor (EV+). A stake é sugerida pelo Critério de Kelly Fracionário (25% para controle de risco).
            </p>

            {valueBets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                <h3>Nenhuma aposta de valor de desvio severo no momento.</h3>
                <p style={{ marginTop: '0.5rem' }}>Inicie a simulação ou aguarde novas odds variarem.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Confronto</th>
                      <th>Campeonato / Ligas</th>
                      <th>Mercado de Valor</th>
                      <th>Odd Justa (IA)</th>
                      <th>Odd Real (Casa)</th>
                      <th>Desvio (EV %)</th>
                      <th>Stake Sugerida (Kelly)</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {valueBets.map(bet => {
                      // Calculate Kelly inputs based on active market
                      let prob = 0;
                      let bookieOdd = 0;
                      let fairOdd = 0;
                      let marketName = bet.value_market;

                      if (marketName.includes(bet.home_team)) {
                        // Home
                        // Fair odds is calculated on Pre-match or live Poisson
                        const probHome = 1 / bet.fair_odd_home;
                        prob = probHome;
                        bookieOdd = bet.bookie_odd_home;
                        fairOdd = bet.fair_odd_home;
                      } else if (marketName.includes('Over 2.5')) {
                        const probOver = 1 / bet.fair_odd_over25;
                        prob = probOver;
                        bookieOdd = bet.bookie_odd_over25;
                        fairOdd = bet.fair_odd_over25;
                      } else {
                        // BTTS
                        const probBtts = 1 / bet.fair_odd_btts;
                        prob = probBtts;
                        bookieOdd = bet.bookie_odd_btts;
                        fairOdd = bet.fair_odd_btts;
                      }

                      // Kelly stake
                      const b = bookieOdd - 1;
                      const q = 1 - prob;
                      const fStar = (prob * b - q) / b;
                      const kellyStakePct = Math.max(0, Math.min(5.0, parseFloat((fStar * 0.25 * 100).toFixed(2))));
                      const currentBalance = stats.balance;
                      const amountStaked = parseFloat(((currentBalance * kellyStakePct) / 100).toFixed(2));

                      return (
                        <tr key={bet.id}>
                          <td>
                            <strong>{bet.home_team} vs {bet.away_team}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                              Status: {bet.status === 'LIVE' ? `LIVE (${bet.minute}')` : 'Agendado'}
                            </div>
                          </td>
                          <td>{bet.league}</td>
                          <td>
                            <span style={{ fontWeight: 600, color: 'var(--accent-secondary)' }}>{bet.value_market}</span>
                          </td>
                          <td><span className="odd-chip">{fairOdd}</span></td>
                          <td><span className="odd-chip value-highlight">{bookieOdd}</span></td>
                          <td>
                            <span className="ev-badge">+{bet.value_ev}%</span>
                          </td>
                          <td>
                            <strong>{kellyStakePct}%</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
                              ${amountStaked.toFixed(2)} da banca
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn btn-primary"
                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                              onClick={() => handleAddBet(
                                `${bet.home_team} vs ${bet.away_team}`,
                                bet.value_market,
                                kellyStakePct,
                                bookieOdd,
                                amountStaked,
                                bet.status === 'FINISHED' ? 'WON' : 'PENDING' // Settle immediately if match finished, else pending
                              )}
                            >
                              Registrar Bet
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Robot settings */}
        {activeTab === 'robot' && (
          <div className="grid-container">
            {/* Left side: robot details & listings */}
            <div className="glass-card">
              <h2 className="panel-title">🤖 Filtros do Robô de Tips</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                O Robô de Tips varre todas as partidas buscando padrões sequenciais específicos cruzados com probabilidades matemáticas de Poisson. Se as regras forem atendidas, ele sinaliza a partida no feed em tempo real.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {filters.map(filter => (
                  <div key={filter.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)' }}>
                    <div>
                      <h4 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {filter.name}
                        <span style={{ fontSize: '0.7rem', color: filter.active ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                          {filter.active ? '● Ativo' : '○ Inativo'}
                        </span>
                      </h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Mandante marcou consecutivamente &gt;= {filter.criteria.homeMinScoredConsecutive} jogos • Visitante sofreu &gt;= {filter.criteria.awayMinConcededConsecutive} jogos fora.
                      </p>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                        Mercado: <strong style={{ color: 'var(--accent-secondary)' }}>{filter.criteria.market}</strong> | Probabilidade Poisson &gt;= {filter.criteria.minPoissonProbability}%
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className={`btn ${filter.active ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                        onClick={() => handleToggleFilter(filter)}
                      >
                        {filter.active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', borderColor: 'var(--accent-danger)', color: 'var(--accent-danger)' }}
                        onClick={() => handleDeleteFilter(filter.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right side: form to add filter */}
            <div className="glass-card">
              <h2 className="panel-title">➕ Criar Novo Filtro de Palpites</h2>
              <form onSubmit={handleCreateFilter}>
                <div className="form-group">
                  <label className="form-label">Nome do Robô / Filtro</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ex: Ambas Marcam Ouro"
                    value={newFilterName}
                    onChange={(e) => setNewFilterName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Min Gols Mandante (Gols no Pro)</label>
                    <input
                      type="number"
                      className="form-input"
                      min="0"
                      max="10"
                      value={criteriaHomeScored}
                      onChange={(e) => setCriteriaHomeScored(parseInt(e.target.value))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Min Gols Sofridos Visitante</label>
                    <input
                      type="number"
                      className="form-input"
                      min="0"
                      max="10"
                      value={criteriaAwayConceded}
                      onChange={(e) => setCriteriaAwayConceded(parseInt(e.target.value))}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Mercado Alvo</label>
                  <select
                    className="form-input"
                    value={criteriaMarket}
                    onChange={(e) => setCriteriaMarket(e.target.value as any)}
                  >
                    <option value="BTTS">Ambas Marcam: Sim</option>
                    <option value="OVER_25">Over 2.5 Gols</option>
                    <option value="1X2">Vitória Mandante (1)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Probabilidade Mínima Poisson ({criteriaPoissonProb}%)</label>
                  <input
                    type="range"
                    min="40"
                    max="90"
                    step="5"
                    style={{ width: '100%', accentColor: 'var(--accent-secondary)' }}
                    value={criteriaPoissonProb}
                    onChange={(e) => setCriteriaPoissonProb(parseInt(e.target.value))}
                  />
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem', justifyContent: 'center' }}>
                  Salvar Robô
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Tab 4: Bankroll Manager */}
        {activeTab === 'bankroll' && (
          <div>
            {/* Stats Cards */}
            <div className="banca-summary">
              <div className="banca-card glass-card">
                <span className="banca-card-label">Banca Disponível</span>
                <span className="banca-card-value">${stats.balance.toFixed(2)}</span>
              </div>
              <div className="banca-card glass-card">
                <span className="banca-card-label">Lucro / Prejuízo Líquido</span>
                <span className={`banca-card-value ${stats.profit >= 0 ? 'profit' : 'loss'}`}>
                  {stats.profit >= 0 ? '+' : ''}${stats.profit.toFixed(2)}
                </span>
              </div>
              <div className="banca-card glass-card">
                <span className="banca-card-label">Assertividade (Win Rate)</span>
                <span className="banca-card-value" style={{ color: 'var(--accent-secondary)' }}>{stats.winRate}%</span>
              </div>
              <div className="banca-card glass-card">
                <span className="banca-card-label">Total de Apostas</span>
                <span className="banca-card-value">{stats.totalBets}</span>
              </div>
            </div>

            <div className="grid-container">
              {/* Ledger history */}
              <div className="glass-card">
                <h2 className="panel-title">📊 Histórico de Entradas e Registros</h2>
                {bankroll.length <= 1 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    <p>Nenhuma aposta registrada na banca ainda.</p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="premium-table">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Confronto</th>
                          <th>Mercado</th>
                          <th>Odd</th>
                          <th>Stake</th>
                          <th>Resultado</th>
                          <th>Retorno Neto</th>
                          <th>Saldo Banca</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bankroll.slice(1).reverse().map(tx => (
                          <tr key={tx.id}>
                            <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td>{tx.fixture_name}</td>
                            <td><span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{tx.market}</span></td>
                            <td>{tx.odds.toFixed(2)}</td>
                            <td>
                              ${tx.amount_staked.toFixed(2)}
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>
                                ({tx.suggested_stake_pct}%)
                              </span>
                            </td>
                            <td>
                              <span style={{
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                backgroundColor: tx.result === 'WON' ? 'rgba(0, 245, 155, 0.15)' : tx.result === 'LOST' ? 'rgba(255, 77, 77, 0.15)' : 'rgba(255,255,255,0.05)',
                                color: tx.result === 'WON' ? 'var(--accent-primary)' : tx.result === 'LOST' ? 'var(--accent-danger)' : 'var(--text-secondary)'
                              }}>
                                {tx.result === 'WON' ? 'VENCIDA' : tx.result === 'LOST' ? 'PERDIDA' : 'PENDENTE'}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600, color: tx.profit_loss >= 0 ? 'var(--accent-primary)' : 'var(--accent-danger)' }}>
                              {tx.profit_loss >= 0 ? '+' : ''}${tx.profit_loss.toFixed(2)}
                            </td>
                            <td><strong>${tx.current_balance.toFixed(2)}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Side controls: manual bet and bankroll config */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Manual entry */}
                <div className="glass-card">
                  <h2 className="panel-title">✍️ Registrar Entrada Manual</h2>
                  <form onSubmit={handleCustomBetSubmit}>
                    <div className="form-group">
                      <label className="form-label">Partida / Confronto</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Ex: Vasco vs Flamengo"
                        value={customBetFixture}
                        onChange={(e) => setCustomBetFixture(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Mercado</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Ex: Vitória Vasco, Over 1.5"
                        value={customBetMarket}
                        onChange={(e) => setCustomBetMarket(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Odd</label>
                        <input
                          type="number"
                          className="form-input"
                          step="0.01"
                          placeholder="2.10"
                          value={customBetOdds}
                          onChange={(e) => setCustomBetOdds(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Valor Stake ($)</label>
                        <input
                          type="number"
                          className="form-input"
                          step="0.01"
                          placeholder="25.00"
                          value={customBetStake}
                          onChange={(e) => setCustomBetStake(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Resultado</label>
                      <select
                        className="form-input"
                        value={customBetResult}
                        onChange={(e) => setCustomBetResult(e.target.value as any)}
                      >
                        <option value="WON">Vencida (Green)</option>
                        <option value="LOST">Perdida (Red)</option>
                        <option value="PENDING">Pendente</option>
                      </select>
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem', justifyContent: 'center' }}>
                      Registrar Aposta
                    </button>
                  </form>
                </div>

                {/* Configuration / Reset */}
                <div className="glass-card">
                  <h2 className="panel-title">⚙️ Configurações de Banca</h2>
                  <div className="form-group">
                    <label className="form-label">Redefinir Banca Inicial ($)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={initialBancaAmount}
                      onChange={(e) => setInitialBancaAmount(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%', borderColor: 'var(--accent-danger)', color: 'var(--accent-danger)' }}
                    onClick={handleResetBanca}
                  >
                    Zerar Banca
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
