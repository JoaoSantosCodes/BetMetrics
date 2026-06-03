const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Sends a raw message to a Telegram Channel or Chat.
 * Utilizes HTML parse mode for premium rich-text layout.
 */
export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('[Telegram Bot Mock]: Environment vars missing. Message not sent:\n', text);
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
        parse_mode: 'HTML'
      })
    });

    if (!res.ok) {
      const errData = await res.json();
      console.error('Telegram API response error:', errData);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    return false;
  }
}

/**
 * Formats and dispatches a Value Bet alert.
 */
export async function sendValueBetAlert(
  home: string,
  away: string,
  league: string,
  market: string,
  fairOdd: number,
  bookieOdd: number,
  ev: number,
  kellyStake: number
): Promise<boolean> {
  const message = `
🚨 <b>OPORTUNIDADE DE VALOR (EV+)</b> 🚨
🏆 <i>${league}</i>

⚽ <b>${home} vs ${away}</b>
🎯 Mercado: <b>${market}</b>

📈 Odd Justa (IA): <code>${fairOdd.toFixed(2)}</code>
🔥 Odd Bookmaker: <b><code>${bookieOdd.toFixed(2)}</code></b>
💎 Desvio Encontrado: <b>+${ev}% EV</b>

💰 Sugestão de Entrada: <b>Apostar ${kellyStake}% da Banca</b> (Critério de Kelly 0.25)
  `.trim();

  return await sendTelegramMessage(message);
}

/**
 * Formats and dispatches a Live late goals pressure alert.
 */
export async function sendLivePressureAlert(
  home: string,
  away: string,
  league: string,
  minute: number,
  score: string,
  possession: number,
  attacksHome: number,
  attacksAway: number
): Promise<boolean> {
  const message = `
⚡ <b>ALERTA LIVE: PRESSÃO DE GOL FIM DE JOGO</b> ⚡
🏆 <i>${league}</i>

⚽ <b>${home} ${score} ${away}</b>
⏱️ Minuto: <b>${minute}'</b>

📊 <b>Estatísticas de Pressão:</b>
• Posse de Bola: <b>${possession}% vs ${100 - possession}%</b>
• Ataques Perigosos: <b>${attacksHome} vs ${attacksAway}</b>

🔥 <i>Histórico sugere gols nos minutos finais. Explorar mercado de Gols no Final!</i>
  `.trim();

  return await sendTelegramMessage(message);
}

/**
 * Formats and dispatches a Semiautomatic Robot Tips alert.
 */
export async function sendRobotTipAlert(
  home: string,
  away: string,
  league: string,
  filterName: string,
  market: string,
  probability: number
): Promise<boolean> {
  const message = `
🤖 <b>TIP DISPARADA PELO ROBÔ SEMIAUTO</b> 🤖
📌 Filtro: <b>${filterName}</b>

⚽ <b>${home} vs ${away}</b>
🏆 Liga: <i>${league}</i>
🎯 Entrada Recomendada: <b>${market}</b>

🧮 Probabilidade Matemática (Poisson): <b>${probability}%</b>
  `.trim();

  return await sendTelegramMessage(message);
}
