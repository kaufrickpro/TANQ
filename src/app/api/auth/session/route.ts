import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(user);
  } catch (error: any) {
    console.error('Error in session route:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
