'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { MapPin, Star, Phone, MessageCircle, ExternalLink, CheckCircle, AlertTriangle, Globe } from 'lucide-react';

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

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className={`mx-auto h-14 w-14 rounded-full flex items-center justify-center mb-2 ${
            result.count > 0
              ? 'bg-emerald-50 text-emerald-600'
              : 'bg-amber-50 text-amber-600'
          }`}>
            {result.count > 0 ? (
              <CheckCircle className="h-7 w-7" />
            ) : (
              <AlertTriangle className="h-7 w-7" />
            )}
          </div>
          <DialogTitle className="text-center text-lg">
            {result.count > 0
              ? `Found ${result.count} lead${result.count > 1 ? 's' : ''}!`
              : 'No leads found'
            }
          </DialogTitle>
          <DialogDescription className="text-center">
            {result.count > 0
              ? `${result.category} in ${result.city} — ${isOutdated ? 'outdated websites' : 'without websites'}`
              : `Try a different location or category.`
            }
          </DialogDescription>
        </DialogHeader>

        {result.count > 0 && (
          <div className="flex-1 overflow-y-auto -mx-4 px-4 space-y-2 min-h-0">
            {result.leads.slice(0, 8).map((lead: any, i: number) => (
              <div key={i} className="bg-accent/40 rounded-xl p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-foreground truncate">{lead.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{lead.address}</span>
                    </p>
                  </div>
                  {lead.leadType === 'OUTDATED_WEBSITE' ? (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                      Outdated
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-medium">
                      No Site
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {lead.rating && (
                    <span className="text-xs flex items-center gap-0.5 text-amber-600 font-medium">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> {lead.rating}
                    </span>
                  )}
                  {lead.phone && (
                    <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                      <Phone className="h-3 w-3" /> {lead.phone}
                    </span>
                  )}
                </div>
                {/* Quick actions */}
                <div className="flex gap-1.5 pt-1">
                  {lead.phone && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                      onClick={() => window.open(`https://wa.me/${lead.phone}`, '_blank')}
                    >
                      <MessageCircle className="h-3 w-3 mr-1" /> WhatsApp
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => window.open(lead.mapsUrl, '_blank')}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" /> Maps
                  </Button>
                </div>
              </div>
            ))}
            {result.count > 8 && (
              <p className="text-xs text-center text-muted-foreground py-2">
                + {result.count - 8} more in your dashboard below
              </p>
            )}
          </div>
        )}

        <DialogFooter showCloseButton={false}>
          <Button onClick={onClose} className="w-full sm:w-auto">
            {result.count > 0 ? 'View All in Dashboard' : 'Try Again'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
