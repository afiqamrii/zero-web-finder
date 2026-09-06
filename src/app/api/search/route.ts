import { NextResponse } from 'next/server';
import { scrapeGoogleMaps } from '@/lib/scraper';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { city, category, limit, mode, lat, lng } = await request.json();

    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }
    if (!city && !lat) {
      return NextResponse.json({ error: 'City or location is required' }, { status: 400 });
    }

    const leads = await scrapeGoogleMaps({
      city: city || 'Near Me',
      category,
      limit: limit || 10,
      mode: mode || 'no_website',
      lat,
      lng,
    });
    
    const savedLeads = [];
    for (const lead of leads) {
      const saved = await prisma.lead.upsert({
        where: { placeId: lead.placeId },
        update: {
          name: lead.name,
          phone: lead.phone,
          originalPhone: lead.originalPhone,
          address: lead.address,
          rating: lead.rating,
          reviewCount: lead.reviewCount,
          mapsUrl: lead.mapsUrl,
          category: lead.category,
          leadType: lead.leadType,
          websiteUrl: lead.websiteUrl,
          email: lead.email,
        },
        create: {
          placeId: lead.placeId,
          name: lead.name,
          phone: lead.phone,
          originalPhone: lead.originalPhone,
          address: lead.address,
          rating: lead.rating,
          reviewCount: lead.reviewCount,
          mapsUrl: lead.mapsUrl,
          category: lead.category,
          leadType: lead.leadType,
          websiteUrl: lead.websiteUrl,
          email: lead.email,
        }
      });
      savedLeads.push(saved);
    }

    return NextResponse.json({ success: true, count: savedLeads.length, leads: savedLeads });
  } catch (error: any) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
