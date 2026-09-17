import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const starred = searchParams.get('starred');

    const where: any = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (starred === 'true') {
      where.isStarred = true;
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: [
        { isStarred: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({ success: true, leads });
  } catch (error: any) {
    console.error('Fetch leads error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const data = await request.json();
    const { ids } = data;

    if (!Array.isArray(ids)) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    const result = await prisma.lead.deleteMany({
      where: { id: { in: ids } }
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error: any) {
    console.error('Bulk delete leads error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
