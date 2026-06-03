import { NextResponse } from 'next/server';
import { initializeDatabase, saveFixtures } from '@/lib/db';
import { fetchRealFixturesToday } from '@/lib/apiFootball';

/**
 * Scheduled Cron Endpoint to update daily fixtures in the background.
 * Secures requests using the Vercel CRON_SECRET bearer token.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // If a CRON_SECRET is defined, block unauthorized requests
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized cron request.' },
      { status: 401 }
    );
  }

  try {
    console.log('Running scheduled daily fixtures fetch cron job...');
    await initializeDatabase();

    const realFixtures = await fetchRealFixturesToday();
    if (realFixtures) {
      await saveFixtures(realFixtures);
      console.log(`Cron completed: Successfully imported ${realFixtures.length} real fixtures.`);
      return NextResponse.json({
        success: true,
        count: realFixtures.length,
        source: 'API-Football'
      });
    }

    console.log('Cron completed: No real data fetched. Maintained simulator data.');
    return NextResponse.json({
      success: true,
      message: 'No real data fetched (API key missing or request failed). Maintained fallback data.',
      source: 'Simulator'
    });
  } catch (error: any) {
    console.error('Cron job failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
