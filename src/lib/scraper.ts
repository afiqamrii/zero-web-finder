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
  imageUrl: string | null;
  description: string | null;
  openingHours: string | null;
  services: string | null; // JSON array string
  photos: string | null; // JSON array string of photo URLs
  topReviews: string | null; // JSON array string of review snippets
  socialLinks: string | null; // JSON object string
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
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9'
    },
    ...(lat && lng ? {
      geolocation: { latitude: lat, longitude: lng },
      permissions: ['geolocation'],
    } : {}),
  });

  // Pre-set consent cookies so Google consent dialog never interrupts
  await context.addCookies([
    { name: 'CONSENT', value: 'PENDING+999', domain: '.google.com', path: '/' },
    { name: 'SOCS', value: 'CAESEwgDEgk2ODEwNjM5ODQaAmVuIAEaBgiA_L20Bg', domain: '.google.com', path: '/' }
  ]);

  const page = await context.newPage();

  // Stealth: hide webdriver flag
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    (window as any).chrome = { runtime: {} };
  });
  
  const leads: ScrapedLead[] = [];
  
  try {
    let searchQuery: string;
    if (lat && lng) {
      searchQuery = encodeURIComponent(`${category || 'businesses'} near me`);
      await page.goto(`https://www.google.com/maps/search/${searchQuery}/@${lat},${lng},14z?hl=en`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
    } else {
      const searchParts = [];
      if (category) searchParts.push(category);
      if (city) searchParts.push(`in ${city}`);
      searchQuery = encodeURIComponent(searchParts.length > 0 ? searchParts.join(' ') : 'businesses in Kuala Lumpur');
      await page.goto(`https://www.google.com/maps/search/${searchQuery}?hl=en`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
    }

    // Dismiss any consent modal if it appears
    try {
      const consentBtn = await page.$('button[aria-label*="Accept all"], button:has-text("Accept all"), button:has-text("I agree"), form[action*="consent"] button');
      if (consentBtn) {
        await consentBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch {}
    
    // Wait for results container or cards
    try {
      await page.waitForSelector('.Nv2PK, .hfpxzc, [role="feed"]', { timeout: 12000 });
    } catch {
      console.log('Timeout waiting for initial feed selector');
    }

    // Scroll for more results using mouse wheel over feed
    const feed = await page.$('[role="feed"]');
    if (feed) {
      const box = await feed.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        for (let i = 0; i < 5; i++) {
          await page.mouse.wheel(0, 1600);
          await page.waitForTimeout(600);
        }
      }
    }

    // Extract all place cards from the feed
    const cardData = await page.evaluate(() => {
      const phoneRegex = /(?:\+?60|0)[1-9]\d{0,2}[-\s]?\d{3,4}[-\s]?\d{3,4}/;
      const cards = Array.from(document.querySelectorAll('.Nv2PK'));
      return cards.map(c => {
        const linkEl = c.querySelector('.hfpxzc') as HTMLAnchorElement | null;
        const href = linkEl?.href || '';
        const nameEl = c.querySelector('.qBF1Pd, .fontHeadlineSmall, [role="heading"]');
        const name = nameEl?.textContent?.trim() || '';

        const ratingEl = c.querySelector('.MW4etd, [aria-label*="stars"], [aria-label*="star"]');
        const rating = ratingEl?.textContent ? parseFloat(ratingEl.textContent.trim()) : null;

        const reviewEl = c.querySelector('.UY7F9, [aria-label*="reviews"]');
        const reviewText = reviewEl?.textContent?.replace(/[^\d]/g, '') || null;
        const reviewCount = reviewText ? parseInt(reviewText, 10) : null;

        const fullText = (c as HTMLElement).innerText || '';
        const phoneMatch = fullText.match(phoneRegex);
        const cardPhone = phoneMatch ? phoneMatch[0] : null;

        // Image extraction from card
        const imgEl = c.querySelector('img[src*="googleusercontent.com"], img[src*="ggpht.com"], img[src*="streetviewpixels"], img') as HTMLImageElement | null;
        let imageUrl = imgEl?.src || null;
        if (imageUrl && imageUrl.includes('=w')) {
          imageUrl = imageUrl.replace(/=w\d+-h\d+[^&]*/, '=w600-h400-k-no');
        }

        return { href, name, rating, reviewCount, cardPhone, imageUrl };
      }).filter(c => c.href && c.name && c.name !== 'Results');
    });

    console.log(`Found ${cardData.length} candidate cards in feed for ${category || 'businesses'} in ${city}`);

    for (let i = 0; i < cardData.length; i++) {
      if (leads.length >= limit) break;
      
      const item = cardData[i];
      const fullUrl = item.href.includes('?') ? `${item.href}&hl=en` : `${item.href}?hl=en`;
      
      try {
        await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
        await page.waitForTimeout(1400);

        // Try clicking hours button to expand full week schedule
        try {
          const hoursBtn = await page.$('[data-item-id*="oh"], button[aria-label*="hours" i], button[aria-label*="open" i], button[aria-label*="closed" i]');
          if (hoursBtn) {
            await hoursBtn.click();
            await page.waitForTimeout(500);
          }
        } catch {}

        const r = await page.evaluate(() => {
          const detailTitle = document.querySelector('.DUwDvf, h1.DUwDvf, [role="main"] h1');
          const panelName = detailTitle?.textContent?.trim() || '';
          
          // Website
          const websiteBtn = document.querySelector('[data-item-id="authority"], [data-tooltip="Open website"], a[aria-label*="website" i]');
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

          // Phone button (avoid "Send to phone" button!)
          const phoneBtn = document.querySelector('[data-item-id^="phone:tel:"], a[href^="tel:"], button[data-tooltip="Copy phone number"]');
          let originalPhone: string | null = null;
          if (phoneBtn) {
            const itemId = phoneBtn.getAttribute('data-item-id');
            if (itemId && itemId.startsWith('phone:tel:')) {
              originalPhone = itemId.replace('phone:tel:', '');
            } else {
              originalPhone = (phoneBtn.textContent || '').trim();
            }
          }
          if (originalPhone && originalPhone.includes('·')) {
            originalPhone = originalPhone.split('·')[0].trim();
          }

          // Address
          const addressBtn = document.querySelector('[data-item-id="address"], [data-tooltip="Copy address"]');
          let address = addressBtn ? (addressBtn.textContent || '').trim() : '';
          address = address.replace(/^[\uE000-\uF8FF\s]+/, '').trim();
          
          // Rating
          const ratingEl = document.querySelector('.F7nice span[aria-hidden="true"], .MW4etd');
          const rating = ratingEl ? parseFloat(ratingEl.textContent || '0') : null;
          
          // Review Count
          const reviewEl = document.querySelector('.F7nice span[aria-label*="reviews"], .UY7F9');
          const reviewCountStr = reviewEl ? reviewEl.getAttribute('aria-label') || reviewEl.textContent : '';
          const reviewCountMatch = reviewCountStr ? reviewCountStr.match(/([\d,]+)/) : null;
          const reviewCount = reviewCountMatch ? parseInt(reviewCountMatch[1].replace(/,/g, ''), 10) : null;

          // Hero photo in panel
          const heroImg = document.querySelector('button[jsaction*="pane.heroHeaderImage"] img, [data-photo-index] img') as HTMLImageElement | null;
          let panelImg = heroImg?.src || null;
          if (panelImg && panelImg.includes('=w')) {
            panelImg = panelImg.replace(/=w\d+-h\d+[^&]*/, '=w800-h600-k-no');
          }

          // Gallery photos (up to 6 high-res images)
          const allImgs = Array.from(document.querySelectorAll('button[jsaction*="heroHeaderImage"] img, [data-photo-index] img, img[src*="googleusercontent.com"], img[src*="ggpht.com"]')) as HTMLImageElement[];
          const photos = Array.from(new Set(
            allImgs
              .map(img => img.src)
              .filter(src => src && (src.includes('googleusercontent.com') || src.includes('ggpht.com')))
              .map(src => src.replace(/=w\d+-h\d+[^&]*/, '=w800-h600-k-no'))
          )).slice(0, 6);

          // Description / About editorial
          const descEl = document.querySelector('div.PYvSYb, [data-item-id="desc"], .fontBodyMedium.kR99db, div.WeS02d, div.HlvSq');
          let description = descEl?.textContent?.trim() || null;
          if (description && (description.startsWith('Located in:') || description.length < 10)) {
            description = null;
          }

          // Opening Hours
          let openingHours: string | null = null;
          const hoursTable = document.querySelector('table.eK7r0e, table[class*="hours" i], [data-item-id*="oh"] table, table');
          if (hoursTable) {
            const rows = Array.from(hoursTable.querySelectorAll('tr'));
            const lines = rows.map(r => {
              const cells = Array.from(r.querySelectorAll('td, th')).map(c => c.textContent?.trim() || '');
              return cells.filter(Boolean).join(': ').replace(/[\uE000-\uF8FF]/g, '').trim();
            }).filter(Boolean);
            if (lines.length > 0) {
              openingHours = lines.join('\n');
            }
          }
          if (!openingHours) {
            const ohEl = document.querySelector('[data-item-id*="oh"]');
            const rawOh = ohEl?.getAttribute('aria-label') || ohEl?.textContent?.trim() || null;
            if (rawOh) {
              openingHours = rawOh.replace(/[\uE000-\uF8FF]/g, '').trim();
            }
          }

          // Services / Offerings / Attributes chips
          const serviceEls = Array.from(document.querySelectorAll('.LTs0fc, div.E0dtEd div, div[aria-label*="Services" i] div, div[aria-label*="Offerings" i] div, div[aria-label*="Highlights" i] div'));
          const services = Array.from(new Set(
            serviceEls
              .map(el => el.textContent?.replace(/[\uE000-\uF8FF]/g, '').trim() || '')
              .filter(t => t.length > 2 && t.length < 40 && !t.includes('Reviews') && !t.includes('Directions') && !t.includes('Save') && !t.includes('Share') && !t.includes('Website') && !t.includes('Phone') && !t.includes('Photos') && !/\d+\.\d+\(/.test(t))
          )).slice(0, 10);

          // Top Reviews
          const reviewCards = Array.from(document.querySelectorAll('div.jftiEf, div.MyEned, [data-review-id]'));
          const topReviews = reviewCards.map(c => {
            const author = c.querySelector('.d4r55, .fontTitleSmall')?.textContent?.trim() || 'Customer';
            const ratingEl = c.querySelector('[aria-label*="star" i]');
            const ratingMatch = ratingEl?.getAttribute('aria-label')?.match(/\d+/);
            const rating = ratingMatch ? parseInt(ratingMatch[0], 10) : 5;
            const text = c.querySelector('.wiI7m, .MyEned')?.textContent?.trim() || '';
            return text && text.length > 15 ? { author, rating, text: text.slice(0, 250) } : null;
          }).filter(Boolean).slice(0, 3);

          // Social Links (Instagram, Facebook, TikTok)
          const allLinks = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
          let instagram: string | null = null;
          let facebook: string | null = null;
          let tiktok: string | null = null;
          for (const a of allLinks) {
            const h = a.href || '';
            if (h.includes('instagram.com/')) instagram = h;
            if (h.includes('facebook.com/')) facebook = h;
            if (h.includes('tiktok.com/')) tiktok = h;
          }
          const hasSocials = instagram || facebook || tiktok;
          const socialLinks = hasSocials ? { instagram, facebook, tiktok } : null;

          // Extract email from body text
          const html = document.body.innerHTML;
          const emailMatch = html.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
          const extractedEmail = emailMatch ? emailMatch[1] : null;

          return {
            panelName,
            websiteUrl,
            originalPhone,
            address,
            rating,
            reviewCount,
            panelImg,
            photos,
            description,
            openingHours,
            services,
            topReviews,
            socialLinks,
            extractedEmail
          };
        });

        const businessName = (r.panelName && r.panelName !== 'Results') ? r.panelName : item.name;
        if (!businessName) continue;
        
        const hasWebsite = !!r.websiteUrl;
        if (mode === 'no_website' && hasWebsite) continue;
        if (mode === 'outdated_website' && !hasWebsite) continue;

        const effectivePhone = r.originalPhone || item.cardPhone;
        const cleanPhone = sanitizePhone(effectivePhone);
        const finalImage = r.panelImg || item.imageUrl || (r.photos && r.photos[0]) || null;

        const placeIdMatch = item.href.match(/!1s([^!]+)!/);
        const placeId = placeIdMatch ? placeIdMatch[1] : Buffer.from(businessName + item.href).toString('base64').slice(0, 40);
        
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
          name: businessName,
          phone: cleanPhone,
          originalPhone: effectivePhone ? effectivePhone.replace(/^[\uE000-\uF8FF\s]+/, '').trim() : null,
          address: r.address || city || 'Kuala Lumpur',
          rating: r.rating || item.rating,
          reviewCount: r.reviewCount || item.reviewCount,
          mapsUrl: item.href,
          category: category || 'Business',
          leadType: mode === 'outdated_website' ? 'OUTDATED_WEBSITE' : 'NO_WEBSITE',
          websiteUrl: r.websiteUrl,
          imageUrl: finalImage,
          description: r.description,
          openingHours: r.openingHours,
          services: r.services && r.services.length > 0 ? JSON.stringify(r.services) : null,
          photos: r.photos && r.photos.length > 0 ? JSON.stringify(r.photos) : null,
          topReviews: r.topReviews && r.topReviews.length > 0 ? JSON.stringify(r.topReviews) : null,
          socialLinks: r.socialLinks ? JSON.stringify(r.socialLinks) : null,
          email: finalEmail,
        });

        console.log(`[Scraped ${leads.length}/${limit}] ${businessName} | Phone: ${cleanPhone || 'None'} | Photos: ${r.photos?.length || 0} | Hours: ${r.openingHours ? 'Yes' : 'No'}`);
      } catch (err: any) {
        console.log(`Error checking place ${item.name}:`, err.message);
      }
    }

  } catch (error) {
    console.error('Error scraping Google Maps:', error);
  } finally {
    await browser.close();
  }

  return leads;
}
