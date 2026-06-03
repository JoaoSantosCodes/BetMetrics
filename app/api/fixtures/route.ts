import { NextResponse } from 'next/server';
import { initializeDatabase } from '@/lib/db';
import { getOrInitializeFixtures, advanceSimulation } from '@/lib/simulator';

let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    await initializeDatabase();
    dbInitialized = true;
  }
}

export async function GET(request: Request) {
  try {
    await ensureDb();
    
    const { searchParams } = new URL(request.url);
    const advance = searchParams.get('advance') === 'true';

    let fixtures;
    if (advance) {
      fixtures = await advanceSimulation();
    } else {
      fixtures = await getOrInitializeFixtures();
    }

    return NextResponse.json({ success: true, fixtures });
  } catch (error: any) {
    console.error('Error in /api/fixtures API:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
