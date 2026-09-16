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
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
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
      searchQuery = encodeURIComponent(`${category || 'businesses'} near me`);
      await page.goto(`https://www.google.com/maps/search/${searchQuery}/@${lat},${lng},14z?hl=en`, { waitUntil: 'domcontentloaded' });
    } else {
      const searchParts = [];
      if (category) searchParts.push(category);
      if (city) searchParts.push(`in ${city}`);
      searchQuery = encodeURIComponent(searchParts.length > 0 ? searchParts.join(' ') : 'businesses');
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

    // Get all URLs from the list
    const placeUrls = await page.evaluate(() => {
      const places = Array.from(document.querySelectorAll('.Nv2PK'));
      return places.map(place => {
        const linkEl = place.querySelector('.hfpxzc') as HTMLAnchorElement;
        return linkEl?.href || '';
      }).filter(url => url !== '');
    });

    for (let i = 0; i < placeUrls.length; i++) {
      if (leads.length >= limit) break;
      
      const url = placeUrls[i];
      // Force english to make scraping consistent
      const fullUrl = url.includes('?') ? `${url}&hl=en` : `${url}?hl=en`;
      
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded' });
      // wait a bit for panel to populate
      await page.waitForTimeout(2000);

      const r = await page.evaluate(() => {
        const name = document.querySelector('h1')?.textContent || '';
        
        // Website
        const websiteBtn = document.querySelector('[data-item-id="authority"]') || document.querySelector('[data-tooltip="Open website"]');
        let websiteUrl = null;
        if (websiteBtn) {
            const a = websiteBtn.closest('a') || websiteBtn.querySelector('a') || websiteBtn;
            websiteUrl = (a as any).href || null;
            if (websiteUrl && websiteUrl.includes('google.com/url?q=')) {
                try {
                    const urlObj = new URL(websiteUrl);
                    websiteUrl = urlObj.searchParams.get('q') || websiteUrl;
                } catch { /* ignore */ }
            }
        }

        // Phone
        const phoneBtn = document.querySelector('[data-item-id^="phone:tel:"]') || document.querySelector('[data-tooltip="Copy phone number"]');
        let originalPhone = phoneBtn ? (phoneBtn.textContent || '').trim() : null;
        // Clean phone text if it has extra stuff
        if (originalPhone && originalPhone.includes('·')) {
            originalPhone = originalPhone.split('·')[0].trim();
        }

        // Address
        const addressBtn = document.querySelector('[data-item-id="address"]') || document.querySelector('[data-tooltip="Copy address"]');
        const address = addressBtn ? (addressBtn.textContent || '').trim() : '';
        
        // Rating
        const ratingEl = document.querySelector('.F7nice span[aria-hidden="true"]');
        const rating = ratingEl ? parseFloat(ratingEl.textContent || '0') : null;
        
        // Review Count
        const reviewEl = document.querySelector('.F7nice span[aria-label*="reviews"]');
        const reviewCountStr = reviewEl ? reviewEl.getAttribute('aria-label') : '';
        const reviewCountMatch = reviewCountStr ? reviewCountStr.match(/([\d,]+)/) : null;
        const reviewCount = reviewCountMatch ? parseInt(reviewCountMatch[1].replace(/,/g, ''), 10) : null;

        // Extract email from body text just in case
        const html = document.body.innerHTML;
        const emailMatch = html.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
        const extractedEmail = emailMatch ? emailMatch[1] : null;

        return { name, websiteUrl, originalPhone, address, rating, reviewCount, extractedEmail };
      });

      if (!r.name) continue;
      
      const hasWebsite = !!r.websiteUrl;
      if (mode === 'no_website' && hasWebsite) continue;
      if (mode === 'outdated_website' && !hasWebsite) continue;

      const placeIdMatch = url.match(/!1s([^!]+)!/);
      const placeId = placeIdMatch ? placeIdMatch[1] : Buffer.from(r.name + url).toString('base64').slice(0, 40);
      
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
        mapsUrl: url,
        category,
        leadType: mode === 'outdated_website' ? 'OUTDATED_WEBSITE' : 'NO_WEBSITE',
        websiteUrl: r.websiteUrl,
        email: finalEmail,
      });
    }

  } catch (error) {
    console.error('Error scraping Google Maps:', error);
  } finally {
    await browser.close();
  }

  return leads;
}
