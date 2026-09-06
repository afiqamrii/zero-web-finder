import { chromium } from 'playwright';
import { sanitizePhone } from './phone';

export interface ScrapedLead {
  placeId: string;
  name: string;
  phone: string | null;
  originalPhone: string | null;
  address: string;
  rating: number | null;
  reviewCount: number | null;
  mapsUrl: string;
  category: string;
  leadType: 'NO_WEBSITE' | 'OUTDATED_WEBSITE';
  websiteUrl: string | null;
  email: string | null;
}

interface ScrapeOptions {
  city: string;
  category: string;
  limit?: number;
  mode?: 'no_website' | 'outdated_website';
  lat?: number;
  lng?: number;
}

async function checkIfOutdated(url: string, browser: any): Promise<{ isOutdated: boolean; email: string | null }> {
  const page = await browser.newPage();
  try {
    // Check for HTTP (no HTTPS)
    const isHttp = url.startsWith('http://');
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
    
    const checks = await page.evaluate(() => {
      const viewport = document.querySelector('meta[name="viewport"]');
      const hasViewport = !!viewport;
      
      // Check for old HTML patterns
      const html = document.documentElement.outerHTML.toLowerCase();
      const hasTableLayout = (html.match(/<table/g) || []).length > 3;
      const hasFlash = html.includes('swfobject') || html.includes('.swf') || html.includes('shockwave');
      const hasMarquee = html.includes('<marquee');
      const hasBlink = html.includes('<blink');
      const hasFrames = html.includes('<frame') || html.includes('<frameset');
      const hasFontTags = (html.match(/<font/g) || []).length > 2;
      const hasInlineStyles = (html.match(/style="/g) || []).length > 15;
      
      // Check for modern frameworks
      const hasReact = html.includes('__next') || html.includes('_react');
      const hasWordPress = html.includes('wp-content') || html.includes('wordpress');
      const isModernWP = hasWordPress && hasViewport;
      
      // Check last modified or copyright year
      const yearMatch = html.match(/©\s*(\d{4})|copyright\s*(\d{4})/i);
      const copyrightYear = yearMatch ? parseInt(yearMatch[1] || yearMatch[2]) : null;
      const isOldCopyright = copyrightYear !== null && copyrightYear < 2021;
      
      // Try to extract an email from the website HTML
      const emailMatch = html.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
      const extractedEmail = emailMatch ? emailMatch[1] : null;
      
      let outdatedScore = 0;
      if (!hasViewport) outdatedScore += 3;
      if (hasTableLayout) outdatedScore += 2;
      if (hasFlash) outdatedScore += 4;
      if (hasMarquee || hasBlink) outdatedScore += 3;
      if (hasFrames) outdatedScore += 3;
      if (hasFontTags) outdatedScore += 2;
      if (hasInlineStyles) outdatedScore += 1;
      if (isOldCopyright) outdatedScore += 2;
      if (hasReact || isModernWP) outdatedScore -= 3;
      
      return { outdatedScore, hasViewport, extractedEmail };
    });
    
    if (isHttp) checks.outdatedScore += 2;
    
    return { isOutdated: checks.outdatedScore >= 3, email: checks.extractedEmail };
  } catch {
    // If site doesn't even load, it's definitely outdated
    return { isOutdated: true, email: null };
  } finally {
    await page.close();
  }
}

export async function scrapeGoogleMaps(options: ScrapeOptions): Promise<ScrapedLead[]> {
  const { city, category, limit = 10, mode = 'no_website', lat, lng } = options;
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    ...(lat && lng ? {
      geolocation: { latitude: lat, longitude: lng },
      permissions: ['geolocation'],
    } : {}),
  });
  const page = await context.newPage();
  
  const leads: ScrapedLead[] = [];
  
  try {
    let searchQuery: string;
    if (lat && lng) {
      searchQuery = encodeURIComponent(`${category} near me`);
      await page.goto(`https://www.google.com/maps/search/${searchQuery}/@${lat},${lng},14z?hl=en`, { waitUntil: 'domcontentloaded' });
    } else {
      searchQuery = encodeURIComponent(`${category} in ${city}`);
      await page.goto(`https://www.google.com/maps/search/${searchQuery}?hl=en`, { waitUntil: 'domcontentloaded' });
    }
    
    // Wait for results
    await page.waitForSelector('.hfpxzc', { timeout: 15000 });

    // Scroll for more results
    const scrollContainer = page.locator('[role="feed"]').first();
    for (let i = 0; i < 5; i++) {
      try {
        await scrollContainer.evaluate((el: HTMLElement) => el.scrollBy(0, 1000));
      } catch {
        await page.mouse.wheel(0, 3000);
      }
      await page.waitForTimeout(800);
    }

    // Extract all results
    const results = await page.evaluate(() => {
      const places = Array.from(document.querySelectorAll('.Nv2PK'));
      return places.map(place => {
        const linkEl = place.querySelector('.hfpxzc') as HTMLAnchorElement;
        const name = linkEl?.getAttribute('aria-label') || '';
        const url = linkEl?.href || '';
        
        // Check for website
        const allText = place.innerHTML || '';
        const hasWebsiteButton = !!place.querySelector('[data-value="Website"]');
        
        // Try to find website URL from the listing
        const links = Array.from(place.querySelectorAll('a[href]'));
        let websiteUrl: string | null = null;
        for (const a of links) {
          const href = (a as HTMLAnchorElement).href;
          if (href && !href.includes('google.com') && !href.startsWith('tel:') && !href.includes('facebook.com')) {
            websiteUrl = href;
            break;
          }
        }
        
        const hasWebsite = hasWebsiteButton || !!websiteUrl;

        const textContent = place.textContent || '';
        
        // Phone
        const phoneMatch = textContent.match(/(\+?60|0)[1-9]\d{0,2}[-\s]?\d{3,4}[-\s]?\d{3,4}/);
        const originalPhone = phoneMatch ? phoneMatch[0] : null;

        // Email in Maps text (rare but happens)
        const emailMatch = textContent.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
        const extractedEmail = emailMatch ? emailMatch[1] : null;

        // Rating
        const ratingMatch = textContent.match(/(\d\.\d)\s*\(/);
        let rating = null;
        let reviewCount = null;
        if (ratingMatch) {
          rating = parseFloat(ratingMatch[1]);
          const reviewMatch = textContent.match(/\(([\d,]+)\)/);
          if (reviewMatch) {
            reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);
          }
        }

        // Address - grab text after the rating/reviews area
        const addressEl = place.querySelector('.W4Efsd:last-of-type');
        const address = addressEl?.textContent?.replace(/^[·\s]+/, '').trim() || '';

        return { name, mapsUrl: url, hasWebsite, websiteUrl, originalPhone, extractedEmail, rating, reviewCount, address };
      });
    });

    for (const r of results) {
      if (!r.name) continue;
      
      if (mode === 'no_website' && r.hasWebsite) continue;
      if (mode === 'outdated_website' && !r.hasWebsite) continue;
      
      const placeIdMatch = r.mapsUrl.match(/!1s([^!]+)!/);
      const placeId = placeIdMatch ? placeIdMatch[1] : Buffer.from(r.name + r.mapsUrl).toString('base64').slice(0, 40);
      
      let isOutdated = false;
      let finalEmail = r.extractedEmail;
      
      if (mode === 'outdated_website' && r.websiteUrl) {
        const checkResult = await checkIfOutdated(r.websiteUrl, context);
        isOutdated = checkResult.isOutdated;
        if (!finalEmail && checkResult.email) {
          finalEmail = checkResult.email;
        }
        if (!isOutdated) continue;
      }
      
      leads.push({
        placeId,
        name: r.name,
        phone: sanitizePhone(r.originalPhone),
        originalPhone: r.originalPhone,
        address: r.address || city,
        rating: r.rating,
        reviewCount: r.reviewCount,
        mapsUrl: r.mapsUrl,
        category,
        leadType: mode === 'outdated_website' ? 'OUTDATED_WEBSITE' : 'NO_WEBSITE',
        websiteUrl: r.websiteUrl,
        email: finalEmail,
      });
      
      if (leads.length >= limit) break;
    }

  } catch (error) {
    console.error('Error scraping Google Maps:', error);
  } finally {
    await browser.close();
  }

  return leads;
}
