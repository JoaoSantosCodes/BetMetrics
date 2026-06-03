import { NextResponse } from 'next/server';
import { initializeDatabase, getBankroll, addBankrollTransaction, resetBankroll } from '@/lib/db';

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    await initializeDatabase();
    dbInitialized = true;
  }
}

export async function GET() {
  try {
    await ensureDb();
    const ledger = await getBankroll();
    return NextResponse.json({ success: true, ledger });
  } catch (error: any) {
    console.error('Error in GET /api/bankroll:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = await request.json();
    const { fixture_name, market, suggested_stake_pct, amount_staked, odds, result } = body;

    if (!fixture_name || !market || odds === undefined || amount_staked === undefined) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const ledger = await getBankroll();
    const latestTx = ledger[ledger.length - 1];
    const previousBalance = latestTx ? latestTx.current_balance : 1000.00;

    let profit_loss = 0;
    if (result === 'WON') {
      profit_loss = amount_staked * (odds - 1);
    } else if (result === 'LOST') {
      profit_loss = -amount_staked;
    }

    const current_balance = previousBalance + profit_loss;

    const newTx = {
      id: 'tx-' + Date.now(),
      date: new Date().toISOString(),
      fixture_name,
      market,
      suggested_stake_pct: Number(suggested_stake_pct),
      amount_staked: Number(amount_staked),
      odds: Number(odds),
      result: result as 'WON' | 'LOST' | 'PENDING',
      profit_loss: Number(profit_loss.toFixed(2)),
      current_balance: Number(current_balance.toFixed(2))
    };

    await addBankrollTransaction(newTx);

    return NextResponse.json({ success: true, transaction: newTx });
  } catch (error: any) {
    console.error('Error in POST /api/bankroll:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Reset bankroll
export async function DELETE(request: Request) {
  try {
    await ensureDb();
    const { searchParams } = new URL(request.url);
    const initialBalanceStr = searchParams.get('initialBalance') || '1000';
    const initialBalance = parseFloat(initialBalanceStr);

    await resetBankroll(initialBalance);

    return NextResponse.json({ success: true, message: `Bankroll reset to $${initialBalance}` });
  } catch (error: any) {
    console.error('Error in DELETE /api/bankroll:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
