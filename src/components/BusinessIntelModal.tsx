'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  Clock,
  MapPin,
  Phone,
  Star,
  Globe,
  Copy,
  Check,
  ExternalLink,
  MessageCircle,
  Images,
  Tag,
  Quote,
  Link as LinkIcon,
  Save,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface BusinessIntelLead {
  id: string;
  name: string;
  phone: string | null;
  address: string;
  rating: number | null;
  reviewCount: number | null;
  category: string;
  leadType?: string;
  mapsUrl: string;
  websiteUrl?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  openingHours?: string | null;
  services?: string | null;
  photos?: string | null;
  topReviews?: string | null;
  socialLinks?: string | null;
  demoUrl?: string | null;
  isStarred?: boolean;
}

interface BusinessIntelModalProps {
  open: boolean;
  onClose: () => void;
  lead: BusinessIntelLead | null;
  onUpdateDemoUrl?: (id: string, demoUrl: string) => void;
  onOpenWhatsApp?: (lead: BusinessIntelLead) => void;
}

export function BusinessIntelModal({
  open,
  onClose,
  lead,
  onUpdateDemoUrl,
  onOpenWhatsApp,
}: BusinessIntelModalProps) {
  const { toast } = useToast();
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [demoInput, setDemoInput] = useState('');
  const [isSavingDemo, setIsSavingDemo] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);

  // Sync demoInput when lead changes
  useEffect(() => {
    if (lead) {
      setDemoInput(lead.demoUrl || '');
    }
  }, [lead]);

  if (!lead) return null;

  // Parse JSON data safely
  const servicesList: string[] = lead.services
    ? (() => {
        try {
          return JSON.parse(lead.services);
        } catch {
          return [];
        }
      })()
    : [];

  const photosList: string[] = lead.photos
    ? (() => {
        try {
          return JSON.parse(lead.photos);
        } catch {
          return [];
        }
      })()
    : lead.imageUrl
    ? [lead.imageUrl]
    : [];

  const reviewsList: { author: string; rating: number; text: string }[] = lead.topReviews
    ? (() => {
        try {
          return JSON.parse(lead.topReviews);
        } catch {
          return [];
        }
      })()
    : [];

  const handleCopyPhone = () => {
    if (!lead.phone) return;
    navigator.clipboard.writeText(lead.phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
    toast({ title: 'Phone number copied' });
  };

  const handleSaveDemoUrl = async () => {
    setIsSavingDemo(true);
    try {
      const trimmed = demoInput.trim();
      await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demoUrl: trimmed || null }),
      });
      if (onUpdateDemoUrl) {
        onUpdateDemoUrl(lead.id, trimmed);
      }
      toast({
        title: 'Demo Link Saved',
        description: 'This demo link will now be included in your WhatsApp outreach messages.',
      });
    } catch {
      toast({ title: 'Failed to save demo link' });
    } finally {
      setIsSavingDemo(false);
    }
  };

  const generateMasterPrompt = () => {
    const cleanPhone = lead.phone ? lead.phone.replace(/\D/g, '') : '';
    const formattedPhone = cleanPhone.startsWith('0') ? '6' + cleanPhone : cleanPhone;

    const formattedServices = servicesList.length > 0 
      ? servicesList.join('\n') 
      : `Signature services for ${lead.category || 'this business'}`;

    const formattedWhatsApp = lead.phone 
      ? `https://wa.me/${formattedPhone} (${lead.phone})`
      : 'Not listed';

    const mapsInfoLines = [
      `Google Maps URL: ${lead.mapsUrl}`,
      lead.rating ? `Rating: ⭐ ${lead.rating.toFixed(1)} (${lead.reviewCount || 0} reviews)` : null,
      reviewsList.length > 0 ? `Real Customer Review Excerpts:\n${reviewsList.map(r => `- "${r.text}" — ${r.author} (${r.rating}★)`).join('\n')}` : null,
    ].filter(Boolean).join('\n');

    let formattedSocials = 'Not listed';
    if (lead.socialLinks) {
      try {
        const s = JSON.parse(lead.socialLinks);
        const parts = [];
        if (s.instagram) parts.push(`Instagram: ${s.instagram}`);
        if (s.facebook) parts.push(`Facebook: ${s.facebook}`);
        if (s.tiktok) parts.push(`TikTok: ${s.tiktok}`);
        if (parts.length > 0) formattedSocials = parts.join('\n');
      } catch {}
    }

    const additionalLines: string[] = [];
    if (photosList.length > 0) {
      additionalLines.push(`Google Maps Photo References (for style, layout, and color reference):\n${photosList.map((url, i) => `- Photo ${i + 1}: ${url}`).join('\n')}`);
    }
    if (lead.leadType === 'OUTDATED_WEBSITE' && lead.websiteUrl) {
      additionalLines.push(`Current Outdated Website: ${lead.websiteUrl}`);
    }
    const formattedAdditional = additionalLines.length > 0 ? additionalLines.join('\n\n') : 'None provided';

    return `You are a senior web designer, UX designer and conversion-focused website developer.

I am creating a DEMO website for a real local business that I may approach as a potential client.

Your job is to create a professional website concept specifically tailored to this business.

IMPORTANT:

* This is a DEMO/prototype, not the final website.
* Use the business information I provide below as the primary source.
* Do not invent important business facts, services, prices, awards, certifications, guarantees, or claims.
* If information is missing, use a sensible placeholder rather than making up facts.
* The design should feel like a real website that this business could actually use.
* Do not make it look like a generic AI-generated template.
* Make design decisions based on the type of business, its customers, services and brand personality.
* Prioritise clarity, trust and conversion over unnecessary animations or visual effects.
* The website must be responsive and look professional on both desktop and mobile.

BUSINESS INFORMATION

Business Name:
${lead.name}

Business Category:
${lead.category || 'Local Business'}

Business Description:
${lead.description || 'Not provided on Google Maps'}

Services / Products:
${formattedServices}

Address:
${lead.address || 'Not listed'}

Phone:
${lead.phone || 'Not listed'}

WhatsApp:
${formattedWhatsApp}

Opening Hours:
${lead.openingHours || 'Schedule not listed on Google Maps'}

Google Maps Information:
${mapsInfoLines}

Social Media:
${formattedSocials}

Additional Information:
${formattedAdditional}

WEBSITE OBJECTIVE

Create a website that helps potential customers:

1. Understand what the business offers
2. See why they should consider the business
3. Find important information quickly
4. Contact the business easily
5. Visit the physical location if relevant
6. Make an enquiry or booking where appropriate

WEBSITE STRUCTURE

Choose the most appropriate structure based on the business.

At minimum, consider:

* Header / navigation
* Hero section
* Business introduction
* Main services/products
* Why choose this business
* Customer Feedback & Testimonials / Reviews section
* Interactive Customer Feedback Form / Review Submission area (where customers can rate and share feedback)
* Gallery / visual section
* Location / opening hours
* Contact / WhatsApp CTA
* Footer

Add additional sections only when they make sense for this specific business.

CUSTOMER FEEDBACK & TESTIMONIALS SECTION

* Include a dedicated, beautifully styled customer feedback & testimonials section on the website:
  - Source:
    * If real Google customer reviews are provided in the Google Maps information above, fetch and display those real reviews with their star rating and customer names!
    * If real Google reviews are not available or sparse, generate 2–3 realistic sample/dummy customer feedbacks tailored directly to this business category (clearly framed as demo placeholder feedback).
* Customer Feedback Form:
  - Include an interactive feedback form on the page (e.g., Star rating selector, Name, Email/Phone, Service experienced, Feedback Comments, and a Submit button) allowing visitors/customers to easily leave feedback or submit a review.

PREDESIGNED UI LIBRARIES & COMPONENT KITS

* You are encouraged to use any modern predesigned UI component library or kit if needed, such as:
  - shadcn/ui
  - Radix UI
  - Lucide Icons (or modern SVG icons)
  - Tailwind CSS
* Leverage pre-styled components (e.g. styled review cards, star ratings, feedback form controls, interactive dialogs, testimonial carousels, accordions) to ensure a polished, modern, and rapid prototype.

DESIGN DIRECTION

First analyse the business and determine:

* Target customer
* Appropriate visual style
* Appropriate typography
* Appropriate layout
* Appropriate CTA
* Appropriate tone of copy

Then create the design accordingly.

The website should feel:

* Professional
* Modern
* Trustworthy
* Clean
* Premium but appropriate to the business
* Easy to navigate

Do NOT automatically use the same design style for every business.

For example:

* A barber may use a bold masculine visual style.
* A beauty studio may use a refined and elegant style.
* A restaurant may prioritise food photography and menu discovery.
* A contractor may prioritise trust, projects and enquiries.
* A car workshop may prioritise services, location and WhatsApp contact.

IMAGES

For the DEMO ONLY, use suitable publicly available image references where appropriate.

However:

* Do not claim that stock images are photos of the actual business.
* Do not use another business's photos and present them as this business's work.
* Prefer generic stock imagery that represents the type of service/product.
* Clearly treat imagery as temporary demo content.
* For the final client website, we will request the business owner's actual photos and obtain permission to use them.

COPY

Write concise, professional website copy based on the information provided.

Do not exaggerate.

For customer testimonials: Use the real Google reviews provided above if present. If none are provided, generate 2–3 realistic sample/dummy customer reviews clearly positioned as concept placeholders for this demo.

Do not invent fake:

* Awards
* Certifications
* Statistics
* Years of experience
* Customer numbers
* Official guarantees or false pricing

CTA

Use a clear primary CTA appropriate to the business, such as:

"WhatsApp Us"
"Book an Appointment"
"Make an Enquiry"
"Get Directions"
"View Our Services"

FINAL OUTPUT

Create a polished, functional website DEMO that I can show to the business owner.

The result should look sufficiently complete that the business owner can immediately understand what their own website could look like.

Remember: this is a sales DEMO. It should demonstrate the value of having a professional website without pretending that information or imagery has been officially provided by the business.`;
  };

  const handleCopyAIPrompt = () => {
    const prompt = generateMasterPrompt();
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2500);
    toast({
      title: 'Master AI Prompt Copied!',
      description: 'Ready to paste into Claude, v0.dev, Cursor, or ChatGPT to generate their demo.',
    });
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="sm:max-w-2xl w-full max-h-[88vh] overflow-y-auto bg-white/95 backdrop-blur-2xl border border-black/[0.08] shadow-2xl rounded-3xl p-6 scrollbar-thin">
        <DialogHeader className="space-y-3 min-w-0 max-w-full pr-8 border-b border-black/[0.06] pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#0071E3]/10 text-[#0071E3] tracking-wide uppercase">
                  {lead.category || 'Business'}
                </span>
                {lead.rating && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700">
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                    {lead.rating.toFixed(1)}
                    <span className="text-amber-900/60 font-normal">({lead.reviewCount || 0})</span>
                  </span>
                )}
              </div>
              <DialogTitle className="text-xl font-bold tracking-tight text-[#1D1D1F]">
                {lead.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-[#86868B] flex items-center gap-1.5 mt-1">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[#86868B]" />
                <span className="truncate">{lead.address}</span>
              </DialogDescription>
            </div>
          </div>

          {/* Quick Actions Row */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {lead.phone && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyPhone}
                className="rounded-full h-8 text-xs font-medium border-black/[0.08] hover:bg-[#F5F5F7] text-[#1D1D1F]"
              >
                {copiedPhone ? <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-600" /> : <Phone className="h-3.5 w-3.5 mr-1.5 text-[#86868B]" />}
                <span>{lead.phone}</span>
              </Button>
            )}
            <a
              href={lead.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium border border-black/[0.08] text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors"
            >
              <Globe className="h-3.5 w-3.5 text-[#86868B]" />
              <span>Google Maps</span>
              <ExternalLink className="h-3 w-3 text-[#86868B]" />
            </a>
            {onOpenWhatsApp && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenWhatsApp(lead);
                }}
                className="rounded-full h-8 px-3.5 text-xs font-semibold bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-[0_2px_8px_rgba(37,211,102,0.3)] ml-auto"
              >
                <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
                <span>WhatsApp Pitch</span>
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="space-y-5 pt-3">
          {/* Demo Website URL Card */}
          <div className="p-4 rounded-2xl bg-[#0071E3]/[0.03] border border-[#0071E3]/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-[#0071E3]" />
                <span className="text-xs font-semibold text-[#1D1D1F]">
                  Live Demo Website Link
                </span>
              </div>
              <span className="text-[11px] text-[#86868B]">
                Automatically included in your WhatsApp pitch
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={demoInput}
                onChange={(e) => setDemoInput(e.target.value)}
                placeholder="e.g. https://maymorii-demo.vercel.app"
                className="flex-1 text-xs rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-[#1D1D1F] placeholder:text-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20"
              />
              <Button
                type="button"
                size="sm"
                disabled={isSavingDemo}
                onClick={handleSaveDemoUrl}
                className="rounded-xl h-9 text-xs font-semibold bg-[#0071E3] hover:bg-[#0077ED] text-white shrink-0 shadow-sm"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                <span>Save Link</span>
              </Button>
            </div>
          </div>

          {/* 1-Click AI Prompt Generator */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-500/5 via-indigo-500/5 to-blue-500/5 border border-purple-500/20 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  <h4 className="text-xs font-semibold text-[#1D1D1F]">
                    Generate Demo Website with AI
                  </h4>
                </div>
                <p className="text-[11px] text-[#86868B] mt-0.5">
                  Includes customer reviews, feedback form, predesigned UI libraries (shadcn/ui), photos, services, hours, and contact details.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPromptPreview(!showPromptPreview)}
                  className="rounded-full h-9 px-3 text-xs font-medium border-black/[0.08] hover:bg-white text-[#1D1D1F]"
                >
                  {showPromptPreview ? 'Hide Prompt' : 'Preview Prompt'}
                </Button>
                <Button
                  type="button"
                  onClick={handleCopyAIPrompt}
                  className="rounded-full h-9 px-4 text-xs font-semibold bg-[#1D1D1F] hover:bg-[#333336] text-white shadow-sm active:scale-95 transition-transform"
                >
                  {copiedPrompt ? (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
                      <span>Prompt Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      <span>Copy AI Prompt</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {showPromptPreview && (
              <div className="relative mt-2 pt-2 border-t border-purple-500/15">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold tracking-wider uppercase text-purple-700">
                    Master AI Prompt Preview (v0.dev / Cursor / ChatGPT)
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyAIPrompt}
                    className="text-[11px] font-medium text-purple-600 hover:text-purple-800 flex items-center gap-1"
                  >
                    <Copy className="h-3 w-3" /> Copy Full Prompt
                  </button>
                </div>
                <pre className="text-[11px] font-mono leading-relaxed bg-[#1D1D1F] text-[#F5F5F7] p-3.5 rounded-xl max-h-60 overflow-y-auto whitespace-pre-wrap border border-black/10 select-all">
                  {generateMasterPrompt()}
                </pre>
              </div>
            )}
          </div>

          {/* Scraped Photos Gallery */}
          {photosList.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] flex items-center gap-1.5">
                  <Images className="h-3.5 w-3.5" />
                  Real Business Photos ({photosList.length})
                </span>
                <span className="text-[11px] text-[#86868B]">High-resolution</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {photosList.map((url, idx) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-[4/3] rounded-xl overflow-hidden bg-black/[0.04] border border-black/[0.06] hover:opacity-95 transition-opacity"
                  >
                    <img
                      src={url}
                      alt={`${lead.name} photo ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-medium gap-1">
                      <span>View Full</span>
                      <ExternalLink className="h-3 w-3" />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Operating Hours & Description Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Opening Hours */}
            <div className="p-3.5 rounded-2xl bg-[#F5F5F7] border border-black/[0.04] space-y-2">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[#1D1D1F]" />
                Operating Schedule
              </span>
              {lead.openingHours ? (
                <div className="text-xs text-[#1D1D1F] space-y-1 font-mono whitespace-pre-line leading-relaxed">
                  {lead.openingHours}
                </div>
              ) : (
                <p className="text-xs text-[#86868B] italic">Schedule not listed on Google Maps</p>
              )}
            </div>

            {/* Services / Tags */}
            <div className="p-3.5 rounded-2xl bg-[#F5F5F7] border border-black/[0.04] space-y-2">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-[#1D1D1F]" />
                Services & Attributes
              </span>
              {servicesList.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {servicesList.map((svc, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-lg bg-white border border-black/[0.06] text-[11px] font-medium text-[#1D1D1F] shadow-xs"
                    >
                      {svc}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#86868B] italic">No specific service tags listed</p>
              )}
            </div>
          </div>

          {/* Top Reviews / Testimonials */}
          {reviewsList.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] flex items-center gap-1.5">
                <Quote className="h-3.5 w-3.5" />
                Customer Testimonials ({reviewsList.length})
              </span>
              <div className="space-y-2">
                {reviewsList.map((rev, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-[#F5F5F7]/80 border border-black/[0.04] space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#1D1D1F]">{rev.author}</span>
                      <div className="flex items-center text-amber-500">
                        {Array.from({ length: rev.rating || 5 }).map((_, s) => (
                          <Star key={s} className="h-3 w-3 fill-amber-500" />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-[#48484A] leading-relaxed italic">
                      "{rev.text}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
