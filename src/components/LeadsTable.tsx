'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, MessageCircle, ExternalLink, Trash2, Download, Star, Phone, Search, Globe, AlertTriangle, ChevronDown, ChevronUp, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Papa from 'papaparse';

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  address: string;
  rating: number | null;
  reviewCount: number | null;
  category: string;
  status: string;
  notes: string | null;
  mapsUrl: string;
  leadType: string;
  websiteUrl: string | null;
  email: string | null;
}

const STATUSES = ['NEW', 'WHATSAPP_SENT', 'CALL_SCHEDULED', 'PROPOSAL_SENT', 'CLOSED'];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  NEW: { label: 'New', bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  WHATSAPP_SENT: { label: 'WA Sent', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  CALL_SCHEDULED: { label: 'Call Set', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  PROPOSAL_SENT: { label: 'Proposal', bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  CLOSED: { label: 'Closed', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

const PITCH_TEMPLATES: Record<string, string> = {
  'Friendly': "Hi! 👋 I noticed your business on Google Maps and saw you don't have a website yet. I help local businesses get found online with professional, affordable websites. Would you be interested in a quick chat?",
  'Madani Grant': "Hi! Did you know local businesses may be eligible for digital transformation grants? We help businesses like yours claim these grants to build professional websites. Interested to know more?",
  'Portfolio': "Hello! I'm a web designer working with local businesses to build modern, mobile-friendly websites. Can I share some examples of my work with you?",
  'Redesign': "Hi! I came across your business website and noticed it could benefit from a modern refresh — better mobile experience, faster loading, and a more professional look. Would you be open to a free quick audit?",
};

const EMAIL_TEMPLATES: Record<string, { subject: string; body: string }> = {
  'Friendly': {
    subject: 'Professional Website for {name}',
    body: `Dear {name} team,\n\nI hope this message finds you well! I recently came across your business on Google Maps while looking for services in your area, and I was impressed by your strong reviews and reputation.\n\nI noticed that you don't currently have a website, and I wanted to reach out because I believe a professional online presence could help bring in even more customers for your business.\n\nI specialise in building clean, mobile-friendly websites for local businesses — affordable and hassle-free. I'd love to offer you a free consultation to discuss how a website could benefit {name}.\n\nWould you be open to a quick 10-minute chat this week?\n\nLooking forward to hearing from you!\n\nWarm regards`,
  },
  'Madani Grant': {
    subject: 'Free Website for {name} — Digital Grant Opportunity',
    body: `Dear {name} team,\n\nI hope you're doing well! I'm reaching out because your business may be eligible for a digital transformation grant that could cover the cost of building a professional website.\n\nUnder recent government initiatives, local businesses like yours can receive funding to establish an online presence — often at little or no cost to you.\n\nI help businesses navigate the application process and build modern, mobile-friendly websites. I'd love to walk you through how {name} can benefit from this.\n\nWould you be available for a brief call this week?\n\nBest regards`,
  },
  'Portfolio': {
    subject: 'Modern Website Design for {name}',
    body: `Dear {name} team,\n\nI'm a professional web designer who works with local businesses to build modern, beautiful websites that attract more customers.\n\nI'd love to share some examples of websites I've built for businesses similar to yours. A well-designed website can help {name} stand out online, appear in more Google searches, and make it easier for customers to find and contact you.\n\nWould you be interested in seeing some of my recent work? I'd also be happy to offer a free mockup of what your website could look like.\n\nLooking forward to connecting!\n\nBest regards`,
  },
  'Redesign': {
    subject: 'Free Website Audit for {name}',
    body: `Dear {name} team,\n\nI came across your current website and wanted to reach out — I think there's a great opportunity to improve your online presence with a modern refresh.\n\nA few things I noticed that could be improved:\n• Mobile responsiveness\n• Loading speed\n• Overall design and user experience\n\nI'd love to offer you a free, no-obligation website audit where I'll provide specific recommendations to help {name} attract more customers online.\n\nWould you be open to receiving this audit? It only takes a few minutes of your time.\n\nWarm regards`,
  },
};

export function LeadsTable({ refreshTrigger }: { refreshTrigger: number }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pitchType, setPitchType] = useState('Friendly');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();
      if (res.ok) setLeads(data.leads);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchLeads(); }, [refreshTrigger]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      const matchStatus = filterStatus === 'ALL' || l.status === filterStatus;
      const matchType = filterType === 'ALL' || l.leadType === filterType;
      const matchSearch = searchQuery === '' ||
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.address.toLowerCase().includes(searchQuery.toLowerCase());
      return matchStatus && matchType && matchSearch;
    });
  }, [leads, filterStatus, filterType, searchQuery]);

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch(`/api/leads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      setLeads(leads.map(l => l.id === id ? { ...l, status } : l));
    } catch { toast({ title: 'Error updating' }); }
  };

  const updateNotes = async (id: string, notes: string) => {
    try {
      await fetch(`/api/leads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) });
      setLeads(leads.map(l => l.id === id ? { ...l, notes } : l));
    } catch { /* silent */ }
  };

  const deleteLead = async (id: string) => {
    if (!confirm('Delete this lead?')) return;
    try {
      await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      setLeads(leads.filter(l => l.id !== id));
    } catch { toast({ title: 'Error deleting' }); }
  };

  const updateEmail = async (id: string, email: string) => {
    try {
      await fetch(`/api/leads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      setLeads(leads.map(l => l.id === id ? { ...l, email } : l));
    } catch { /* silent */ }
  };

  const getEmailLink = (lead: Lead) => {
    if (!lead.email) return '#';
    const template = EMAIL_TEMPLATES[pitchType] || EMAIL_TEMPLATES['Friendly'];
    const subject = encodeURIComponent(template.subject.replace(/{name}/g, lead.name));
    const body = encodeURIComponent(template.body.replace(/{name}/g, lead.name));
    return `mailto:${lead.email}?subject=${subject}&body=${body}`;
  };

  const exportCSV = () => {
    const csv = Papa.unparse(filteredLeads.map(l => ({
      Name: l.name, Phone: l.phone || '', Email: l.email || '', Address: l.address,
      Rating: l.rating || '', Category: l.category, Type: l.leadType,
      Website: l.websiteUrl || '', Status: l.status, Notes: l.notes || '', GoogleMaps: l.mapsUrl,
    })));
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast({ title: `Exported ${filteredLeads.length} leads` });
  };

  const getWhatsAppLink = (phone: string | null) => {
    if (!phone) return '#';
    return `https://wa.me/${phone}?text=${encodeURIComponent(PITCH_TEMPLATES[pitchType])}`;
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: leads.length, NO_WEBSITE: 0, OUTDATED_WEBSITE: 0 };
    STATUSES.forEach(s => c[s] = 0);
    leads.forEach(l => { c[l.status]++; c[l.leadType]++; });
    return c;
  }, [leads]);

  return (
    <div className="space-y-4">
      {/* Filter chips — horizontal scroll on mobile */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap scrollbar-none">
        {[
          { key: 'ALL', label: `All (${counts.ALL})`, isType: true },
          { key: 'NO_WEBSITE', label: `No Site (${counts.NO_WEBSITE})`, isType: true },
          { key: 'OUTDATED_WEBSITE', label: `Outdated (${counts.OUTDATED_WEBSITE})`, isType: true },
          ...STATUSES.map(s => ({ key: s, label: `${STATUS_CONFIG[s].label} (${counts[s] || 0})`, isType: false })),
        ].map((item) => {
          const isActive = item.isType ? filterType === item.key : filterStatus === item.key;
          return (
            <button
              key={item.key}
              onClick={() => {
                if (item.isType) { setFilterType(item.key); setFilterStatus('ALL'); }
                else { setFilterStatus(item.key); setFilterType('ALL'); }
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border transition-all active:scale-95 ${
                isActive
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-card border-border text-muted-foreground'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="bg-card border border-border rounded-xl p-2.5 sm:p-3 flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-sm bg-background border-border"
          />
        </div>
        <div className="flex gap-2">
          <Select value={pitchType} onValueChange={(v) => setPitchType(v || 'Friendly')}>
            <SelectTrigger className="w-[110px] sm:w-[130px] h-9 bg-background border-border text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(PITCH_TEMPLATES).map(k => (
                <SelectItem key={k} value={k}>{k}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCSV} className="h-9 text-xs">
            <Download className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
        </div>
      </div>

      {/* Card-based list (mobile-friendly) */}
      {isLoading ? (
        <div className="bg-card border border-border rounded-xl p-12 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            Loading...
          </div>
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="text-base font-semibold text-foreground mb-1">No leads found</h3>
          <p className="text-xs text-muted-foreground">Search above to find businesses.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLeads.map((lead) => {
            const isExpanded = expandedId === lead.id;
            return (
              <div key={lead.id} className="bg-card border border-border rounded-xl overflow-hidden transition-all">
                {/* Main Row — always visible */}
                <button
                  className="w-full text-left p-3 sm:p-4 flex items-start gap-3 active:bg-accent/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground truncate">{lead.name}</span>
                      {lead.leadType === 'OUTDATED_WEBSITE' ? (
                        <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                          ⚠️ Outdated
                        </span>
                      ) : (
                        <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-medium">
                          No Site
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{lead.address}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {lead.rating && (
                        <span className="text-xs flex items-center gap-0.5 text-amber-600 font-medium">
                          <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> {lead.rating}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">{lead.category}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_CONFIG[lead.status]?.bg} ${STATUS_CONFIG[lead.status]?.text} ${STATUS_CONFIG[lead.status]?.border} border`}>
                        {STATUS_CONFIG[lead.status]?.label}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-muted-foreground pt-1">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-border px-3 sm:px-4 py-3 space-y-3 bg-accent/20">
                    {/* Phone & Website */}
                    {lead.phone && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {lead.phone}
                      </div>
                    )}
                    {lead.websiteUrl && (
                      <a href={lead.websiteUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline inline-block truncate max-w-full">
                        🌐 {lead.websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    )}

                    {/* Status */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
                      <Select value={lead.status} onValueChange={(v) => updateStatus(lead.id, v || 'NEW')}>
                        <SelectTrigger className={`w-full h-8 text-xs border rounded-lg font-medium ${STATUS_CONFIG[lead.status]?.bg} ${STATUS_CONFIG[lead.status]?.text} ${STATUS_CONFIG[lead.status]?.border}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map(s => (
                            <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Email */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Email</label>
                      <Input
                        defaultValue={lead.email || ''}
                        onBlur={(e) => updateEmail(lead.id, e.target.value)}
                        placeholder="Add email address..."
                        type="email"
                        className="h-8 text-xs bg-background border-border"
                      />
                    </div>

                    {/* Notes */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</label>
                      <Input
                        defaultValue={lead.notes || ''}
                        onBlur={(e) => updateNotes(lead.id, e.target.value)}
                        placeholder="Add notes..."
                        className="h-8 text-xs bg-background border-border"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {lead.phone && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs flex-1 min-w-[90px] text-emerald-600 border-emerald-200 hover:bg-emerald-50 active:bg-emerald-100"
                          onClick={() => window.open(getWhatsAppLink(lead.phone), '_blank')}
                        >
                          <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp
                        </Button>
                      )}
                      {lead.email && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs flex-1 min-w-[90px] text-blue-600 border-blue-200 hover:bg-blue-50 active:bg-blue-100"
                          onClick={() => window.open(getEmailLink(lead), '_blank')}
                        >
                          <Mail className="h-3.5 w-3.5 mr-1" /> Email
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs flex-1 min-w-[70px]"
                        onClick={() => window.open(lead.mapsUrl, '_blank')}
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> Maps
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-red-500 border-red-200 hover:bg-red-50 active:bg-red-100"
                        onClick={() => deleteLead(lead.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
