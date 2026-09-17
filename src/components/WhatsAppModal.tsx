'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MessageCircle, Copy, Check, Sparkles, Building2, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface WhatsAppLead {
  id: string;
  name: string;
  phone: string | null;
  category: string;
  leadType?: string;
  websiteUrl?: string | null;
  demoUrl?: string | null;
}

interface WhatsAppModalProps {
  open: boolean;
  onClose: () => void;
  lead: WhatsAppLead | null;
  onStatusUpdate?: (id: string, newStatus: string) => void;
}

export function WhatsAppModal({ open, onClose, lead, onStatusUpdate }: WhatsAppModalProps) {
  const { toast } = useToast();
  const [templateKey, setTemplateKey] = useState<'teaser' | 'send_demo' | 'refine' | 'opener' | 'redesign'>('teaser');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  // Generate templates
  const getTeaserTemplate = (bizName: string) => {
    return `Hi, I’m Afiq Amri, a freelance web developer.

I came across ${bizName} on Google Maps and noticed you don't currently have a website. I actually put together a quick website concept based on your business.

Would you like me to share the link for you to have a look? ☺️`;
  };

  const getSendDemoTemplate = (bizName: string, demoUrl?: string | null) => {
    const link = demoUrl || '[paste your demo link here]';
    return `Here it is! 👉 ${link}

I set up a clean mobile layout with your services, hours, and direct WhatsApp booking for ${bizName}.

Have a look whenever you're free, and let me know what you think!`;
  };

  const getRefineTemplate = () => {
    return `If you like the direction, we can easily connect it to your official domain and add any real pricing or extra photos you want so you can start getting direct bookings online.`;
  };

  const getOpenerTemplate = (bizName: string) => {
    return `Hi, I’m Afiq Amri, a freelance web developer.

I came across ${bizName} on Google Maps and noticed that you don’t have a website at the moment, is that right? ☺️`;
  };

  const getRedesignTemplate = (bizName: string) => {
    return `Hi, I’m Afiq Amri, a freelance web developer.

I came across ${bizName} on Google Maps and took a look at your website.

I specialise in modernising websites to make them fast and look great on mobile. I had a few ideas for a quick refresh — if you'd like, I’d be happy to put together a concept for you to see.`;
  };

  useEffect(() => {
    if (!lead) return;
    const isOutdated = lead.leadType === 'OUTDATED_WEBSITE';
    if (isOutdated) {
      setTemplateKey('redesign');
      setMessage(getRedesignTemplate(lead.name));
    } else {
      setTemplateKey('teaser');
      setMessage(getTeaserTemplate(lead.name));
    }
  }, [lead]);

  const handleSelectTemplate = (key: 'teaser' | 'send_demo' | 'refine' | 'opener' | 'redesign') => {
    if (!lead) return;
    setTemplateKey(key);
    if (key === 'teaser') {
      setMessage(getTeaserTemplate(lead.name));
    } else if (key === 'send_demo') {
      setMessage(getSendDemoTemplate(lead.name, lead.demoUrl));
    } else if (key === 'refine') {
      setMessage(getRefineTemplate());
    } else if (key === 'opener') {
      setMessage(getOpenerTemplate(lead.name));
    } else if (key === 'redesign') {
      setMessage(getRedesignTemplate(lead.name));
    }
  };

  const cleanPhone = (rawPhone: string | null) => {
    if (!rawPhone) return '';
    let digits = rawPhone.replace(/\D/g, '');
    if (digits.startsWith('0')) {
      digits = '6' + digits;
    }
    return digits;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Message copied', description: 'Copied outreach text to clipboard.' });
  };

  const handleSendWhatsApp = () => {
    if (!lead || !lead.phone) {
      toast({ title: 'No phone number', description: 'This lead does not have a phone number.' });
      return;
    }

    const phone = cleanPhone(lead.phone);
    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${phone}?text=${encoded}`;

    window.open(url, '_blank');

    if (onStatusUpdate) {
      onStatusUpdate(lead.id, 'WHATSAPP_SENT');
    }

    toast({
      title: 'WhatsApp opened',
      description: `Outreach sent to ${lead.name}. Status marked as WA Sent.`,
    });
    onClose();
  };

  if (!lead) return null;

  const phoneNum = cleanPhone(lead.phone);

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="sm:max-w-lg w-full bg-white/95 backdrop-blur-xl border border-black/[0.08] shadow-2xl rounded-3xl p-6 overflow-hidden">
        <DialogHeader className="space-y-2 min-w-0 max-w-full pr-8">
          <div className="flex items-center gap-3 min-w-0 max-w-full">
            <div className="h-10 w-10 shrink-0 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <DialogTitle className="text-lg font-semibold tracking-tight text-[#1D1D1F] truncate block">
                {lead.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-[#86868B] flex items-center gap-2 mt-0.5 truncate">
                <span className="flex items-center gap-1 shrink-0">
                  <Building2 className="h-3 w-3" />
                  {lead.category || 'Business'}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 truncate">
                  <Phone className="h-3 w-3 shrink-0" />
                  <span className="truncate">{lead.phone ? lead.phone : 'No phone'}</span>
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Template Selector - Apple Segmented Control */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B]">
              Message Template
            </span>
            <button
              onClick={handleCopy}
              className="text-xs text-[#86868B] hover:text-[#1D1D1F] flex items-center gap-1 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1 p-1 bg-[#F5F5F7] rounded-2xl border border-black/[0.04]">
            {lead.leadType === 'OUTDATED_WEBSITE' ? (
              <>
                <button
                  type="button"
                  onClick={() => handleSelectTemplate('redesign')}
                  className={`text-xs py-2 px-1 rounded-xl font-medium transition-all text-center ${
                    templateKey === 'redesign'
                      ? 'bg-white text-[#1D1D1F] shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                      : 'text-[#86868B] hover:text-[#1D1D1F]'
                  }`}
                >
                  Redesign
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectTemplate('teaser')}
                  className={`text-xs py-2 px-1 rounded-xl font-medium transition-all text-center ${
                    templateKey === 'teaser'
                      ? 'bg-white text-[#1D1D1F] shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                      : 'text-[#86868B] hover:text-[#1D1D1F]'
                  }`}
                >
                  1. Teaser
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectTemplate('send_demo')}
                  className={`text-xs py-2 px-1 rounded-xl font-medium transition-all text-center ${
                    templateKey === 'send_demo'
                      ? 'bg-white text-[#1D1D1F] shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                      : 'text-[#86868B] hover:text-[#1D1D1F]'
                  }`}
                >
                  2. Demo Link
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectTemplate('refine')}
                  className={`text-xs py-2 px-1 rounded-xl font-medium transition-all text-center ${
                    templateKey === 'refine'
                      ? 'bg-white text-[#1D1D1F] shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                      : 'text-[#86868B] hover:text-[#1D1D1F]'
                  }`}
                >
                  3. Refine
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleSelectTemplate('teaser')}
                  className={`text-xs py-2 px-1 rounded-xl font-medium transition-all text-center ${
                    templateKey === 'teaser'
                      ? 'bg-white text-[#1D1D1F] shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                      : 'text-[#86868B] hover:text-[#1D1D1F]'
                  }`}
                >
                  1. Teaser
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectTemplate('send_demo')}
                  className={`text-xs py-2 px-1 rounded-xl font-medium transition-all text-center ${
                    templateKey === 'send_demo'
                      ? 'bg-white text-[#1D1D1F] shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                      : 'text-[#86868B] hover:text-[#1D1D1F]'
                  }`}
                >
                  2. Demo Link
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectTemplate('refine')}
                  className={`text-xs py-2 px-1 rounded-xl font-medium transition-all text-center ${
                    templateKey === 'refine'
                      ? 'bg-white text-[#1D1D1F] shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                      : 'text-[#86868B] hover:text-[#1D1D1F]'
                  }`}
                >
                  3. Refine
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectTemplate('opener')}
                  className={`text-xs py-2 px-1 rounded-xl font-medium transition-all text-center ${
                    templateKey === 'opener'
                      ? 'bg-white text-[#1D1D1F] shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                      : 'text-[#86868B] hover:text-[#1D1D1F]'
                  }`}
                >
                  Question
                </button>
              </>
            )}
          </div>

          {/* Editable Textarea */}
          <div className="relative">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              className="w-full text-sm rounded-2xl border border-black/[0.08] bg-[#F5F5F7]/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 p-3.5 text-[#1D1D1F] leading-relaxed transition-all resize-none"
              placeholder="Write your message here..."
            />
            <p className="text-[11px] text-[#86868B] mt-1 text-right">
              You can freely edit this message before launching WhatsApp.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-full h-10 px-5 text-xs font-medium border-black/[0.08] text-[#1D1D1F] hover:bg-[#F5F5F7]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSendWhatsApp}
            disabled={!phoneNum}
            className="rounded-full h-10 px-6 text-xs font-semibold bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-[0_4px_14px_rgba(37,211,102,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <MessageCircle className="h-4 w-4 mr-1.5" />
            Send via WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
