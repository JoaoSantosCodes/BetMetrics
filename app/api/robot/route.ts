import { NextResponse } from 'next/server';
import { initializeDatabase, getFilters, saveFilter, deleteFilter, RobotFilter } from '@/lib/db';

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
    const filters = await getFilters();
    return NextResponse.json({ success: true, filters });
  } catch (error: any) {
    console.error('Error in GET /api/robot:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = await request.json();
    const { id, name, criteria, active } = body;

    if (!name || !criteria) {
      return NextResponse.json({ success: false, error: 'Missing name or criteria' }, { status: 400 });
    }

    const newFilter: RobotFilter = {
      id: id || 'filter-' + Date.now(),
      name,
      criteria: {
        homeMinScoredConsecutive: Number(criteria.homeMinScoredConsecutive || 0),
        awayMinConcededConsecutive: Number(criteria.awayMinConcededConsecutive || 0),
        minPoissonProbability: Number(criteria.minPoissonProbability || 50),
        market: criteria.market || 'BTTS'
      },
      active: active !== undefined ? active : true
    };

    await saveFilter(newFilter);

    return NextResponse.json({ success: true, filter: newFilter });
  } catch (error: any) {
    console.error('Error in POST /api/robot:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing filter ID' }, { status: 400 });
    }

    await deleteFilter(id);

    return NextResponse.json({ success: true, message: `Filter ${id} deleted` });
  } catch (error: any) {
    console.error('Error in DELETE /api/robot:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
