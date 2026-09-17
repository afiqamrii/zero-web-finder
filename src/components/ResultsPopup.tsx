'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { MapPin, Star, Phone, MessageCircle, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';

interface ResultsPopupProps {
  open: boolean;
  onClose: () => void;
  result: {
    count: number;
    leads: any[];
    city: string;
    category: string;
    mode: string;
  } | null;
}

export function ResultsPopup({ open, onClose, result }: ResultsPopupProps) {
  if (!result) return null;

  const isOutdated = result.mode === 'outdated_website';

  const defaultOutreach = `Hi, I’m Afiq Amri, a freelance web developer.

I came across your business on Google Maps and noticed that you don’t have a website at the moment.

I help local businesses set up professional websites to give customers a better way to learn about their business and services online.

If you’re open to it, I can prepare a quick website concept for your business for you to have a look at. No obligation.`;

  const handleWhatsApp = (phone: string | null) => {
    if (!phone) return;
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '6' + cleanPhone;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(defaultOutreach)}`, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col bg-white/95 backdrop-blur-2xl border border-black/[0.08] shadow-2xl rounded-3xl p-6">
        <DialogHeader className="text-center space-y-2">
          <div className={`mx-auto h-12 w-12 rounded-2xl flex items-center justify-center ${
            result.count > 0
              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/60'
              : 'bg-amber-50 text-amber-600 border border-amber-200/60'
          }`}>
            {result.count > 0 ? (
              <CheckCircle2 className="h-6 w-6" />
            ) : (
              <AlertCircle className="h-6 w-6" />
            )}
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-[#1D1D1F]">
            {result.count > 0
              ? `Found ${result.count} New Lead${result.count > 1 ? 's' : ''}`
              : 'No Leads Found'}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#86868B] leading-relaxed">
            {result.count > 0
              ? `${result.category} in ${result.city} (${isOutdated ? 'outdated websites' : 'no website'})`
              : `Try searching for another category (e.g. Barber, Cafe, Dental Clinic, Florist) or location.`}
          </DialogDescription>
        </DialogHeader>

        {result.count > 0 && (
          <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-2.5 min-h-0 py-2">
            {result.leads.slice(0, 6).map((lead: any, i: number) => (
              <div key={i} className="bg-[#F5F5F7]/80 rounded-2xl p-3.5 space-y-2 border border-black/[0.03]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-[#1D1D1F] truncate">{lead.name}</p>
                    <p className="text-xs text-[#86868B] flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 shrink-0 text-[#86868B]" />
                      <span className="truncate">{lead.address}</span>
                    </p>
                  </div>
                  {lead.leadType === 'OUTDATED_WEBSITE' ? (
                    <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                      Outdated
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-medium">
                      No Site
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs">
                  {lead.rating && (
                    <span className="flex items-center gap-1 text-[#1D1D1F] font-medium">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {lead.rating}
                    </span>
                  )}
                  {lead.phone && (
                    <span className="text-[#86868B] flex items-center gap-1 font-medium">
                      <Phone className="h-3 w-3 text-[#86868B]" />
                      {lead.phone}
                    </span>
                  )}
                </div>

                {/* Quick actions */}
                <div className="flex gap-2 pt-1">
                  {lead.phone && (
                    <Button
                      size="sm"
                      className="h-8 text-xs font-semibold rounded-full bg-[#25D366] hover:bg-[#20bd5a] text-white flex-1"
                      onClick={() => handleWhatsApp(lead.phone)}
                    >
                      <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs rounded-full border-black/[0.08] hover:bg-white text-[#1D1D1F]"
                    onClick={() => window.open(lead.mapsUrl, '_blank')}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1 text-[#86868B]" /> Maps
                  </Button>
                </div>
              </div>
            ))}
            {result.count > 6 && (
              <p className="text-xs text-center text-[#86868B] py-1">
                + {result.count - 6} more loaded into your dashboard
              </p>
            )}
          </div>
        )}

        <DialogFooter showCloseButton={false} className="pt-2">
          <Button
            onClick={onClose}
            className="w-full rounded-full h-11 text-sm font-semibold bg-[#1D1D1F] text-white hover:bg-[#2D2D2F]"
          >
            {result.count > 0 ? 'Explore Cards in Dashboard' : 'Try Another Search'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
