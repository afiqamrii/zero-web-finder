'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  MapPin,
  MessageCircle,
  ExternalLink,
  Trash2,
  Download,
  Star,
  Phone,
  Search,
  Globe,
  AlertTriangle,
  Mail,
  LayoutGrid,
  List,
  Sparkles,
  Send,
  StickyNote,
  Copy,
  Check
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Papa from 'papaparse';
import { WhatsAppModal, WhatsAppLead } from './WhatsAppModal';

export interface Lead {
  id: string;
  name: string;
  phone: string | null;
  originalPhone?: string | null;
  address: string;
  rating: number | null;
  reviewCount: number | null;
  category: string;
  status: string;
  notes: string | null;
  mapsUrl: string;
  leadType: string;
  websiteUrl: string | null;
  imageUrl?: string | null;
  email: string | null;
}

const STATUSES = ['NEW', 'WHATSAPP_SENT', 'CALL_SCHEDULED', 'PROPOSAL_SENT', 'CLOSED'];

const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string; border: string }> = {
  NEW: { label: 'New', dot: 'bg-sky-500', bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  WHATSAPP_SENT: { label: 'WA Sent', dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  CALL_SCHEDULED: { label: 'Call Set', dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  PROPOSAL_SENT: { label: 'Proposal', dot: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  CLOSED: { label: 'Closed', dot: 'bg-emerald-600', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

export function LeadsTable({ refreshTrigger }: { refreshTrigger: number }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [activeWhatsAppLead, setActiveWhatsAppLead] = useState<WhatsAppLead | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();
      if (res.ok) setLeads(data.leads || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [refreshTrigger]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      const matchStatus = filterStatus === 'ALL' || l.status === filterStatus;
      const matchType = filterType === 'ALL' || l.leadType === filterType;
      const matchSearch =
        searchQuery === '' ||
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.phone && l.phone.includes(searchQuery));
      return matchStatus && matchType && matchSearch;
    });
  }, [leads, filterStatus, filterType, searchQuery]);

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      setLeads(leads.map(l => l.id === id ? { ...l, status } : l));
    } catch {
      toast({ title: 'Error updating status' });
    }
  };

  const updateNotes = async (id: string, notes: string) => {
    try {
      await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      });
      setLeads(leads.map(l => l.id === id ? { ...l, notes } : l));
      setEditingNotesId(null);
    } catch {
      /* silent */
    }
  };

  const deleteLead = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}" from your leads?`)) return;
    try {
      await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      setLeads(leads.filter(l => l.id !== id));
      const next = new Set(selectedIds);
      next.delete(id);
      setSelectedIds(next);
      toast({ title: 'Lead deleted' });
    } catch {
      toast({ title: 'Error deleting lead' });
    }
  };

  const bulkDeleteLeads = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected leads?`)) return;
    try {
      await fetch(`/api/leads`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });
      setLeads(leads.filter(l => !selectedIds.has(l.id)));
      setSelectedIds(new Set());
      toast({ title: `Deleted ${selectedIds.size} leads` });
    } catch {
      toast({ title: 'Error deleting leads' });
    }
  };

  const exportCSV = () => {
    const csv = Papa.unparse(filteredLeads.map(l => ({
      Name: l.name,
      Phone: l.phone || '',
      Address: l.address,
      Rating: l.rating || '',
      ReviewCount: l.reviewCount || '',
      Category: l.category,
      Type: l.leadType,
      Website: l.websiteUrl || '',
      Status: l.status,
      Notes: l.notes || '',
      GoogleMaps: l.mapsUrl,
    })));
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast({ title: `Exported ${filteredLeads.length} leads` });
  };

  const copyPhone = (phone: string, id: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhoneId(id);
    setTimeout(() => setCopiedPhoneId(null), 2000);
    toast({ title: 'Phone copied', description: phone });
  };

  const quickSendWhatsApp = (lead: Lead) => {
    if (!lead.phone) return;
    let cleanPhone = lead.phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '6' + cleanPhone;

    const defaultMsg = `Hi, I’m Afiq Amri, a freelance web developer.

I came across your business on Google Maps and noticed that you don’t have a website at the moment.

I help local businesses set up professional websites to give customers a better way to learn about their business and services online.

If you’re open to it, I can prepare a quick website concept for your business for you to have a look at. No obligation.`;

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(defaultMsg)}`, '_blank');
    updateStatus(lead.id, 'WHATSAPP_SENT');
    toast({ title: 'WhatsApp opened', description: `Opening chat for ${lead.name}` });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: leads.length, NO_WEBSITE: 0, OUTDATED_WEBSITE: 0 };
    STATUSES.forEach(s => c[s] = 0);
    leads.forEach(l => {
      if (c[l.status] !== undefined) c[l.status]++;
      if (c[l.leadType] !== undefined) c[l.leadType]++;
    });
    return c;
  }, [leads]);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* WhatsApp Modal */}
      <WhatsAppModal
        open={!!activeWhatsAppLead}
        onClose={() => setActiveWhatsAppLead(null)}
        lead={activeWhatsAppLead}
        onStatusUpdate={(id, status) => updateStatus(id, status)}
      />

      {/* Filter chips — Apple style rounded pills */}
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
              type="button"
              onClick={() => {
                if (item.isType) { setFilterType(item.key); setFilterStatus('ALL'); }
                else { setFilterStatus(item.key); setFilterType('ALL'); }
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all border active:scale-95 ${
                isActive
                  ? 'bg-[#1D1D1F] border-transparent text-white shadow-[0_2px_8px_rgba(0,0,0,0.12)]'
                  : 'bg-white/80 border-black/[0.06] text-[#48484A] hover:text-[#1D1D1F] hover:bg-white'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="bg-white/90 backdrop-blur-xl border border-black/[0.06] rounded-2xl p-3 sm:p-3.5 flex flex-col sm:flex-row gap-3 items-center shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        {/* Bulk select checkbox */}
        <div className="flex items-center pl-1.5 pr-2.5 border-r border-black/[0.08] h-8 hidden sm:flex">
          <input
            type="checkbox"
            className="rounded border-gray-300 text-[#1D1D1F] focus:ring-[#1D1D1F] h-4 w-4 cursor-pointer"
            checked={filteredLeads.length > 0 && selectedIds.size === filteredLeads.length}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedIds(new Set(filteredLeads.map(l => l.id)));
              } else {
                setSelectedIds(new Set());
              }
            }}
          />
        </div>

        {/* Search input */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86868B]" />
          <Input
            placeholder="Search leads by name, category, location, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 text-sm bg-[#F5F5F7]/80 hover:bg-[#F5F5F7] focus:bg-white border-black/[0.06] rounded-xl transition-all"
          />
        </div>

        {/* Controls */}
        <div className="flex gap-2 w-full sm:w-auto justify-between sm:justify-end items-center">
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={bulkDeleteLeads}
              className="h-10 text-xs rounded-full px-4"
            >
              <Trash2 className="h-3.5 w-3.5 sm:mr-1.5" />
              <span>Delete ({selectedIds.size})</span>
            </Button>
          )}

          {/* View Mode Toggle: Cards vs Table */}
          <div className="inline-flex p-0.5 bg-[#F5F5F7] rounded-xl border border-black/[0.04]">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'cards'
                  ? 'bg-white text-[#1D1D1F] shadow-[0_2px_6px_rgba(0,0,0,0.06)]'
                  : 'text-[#86868B] hover:text-[#1D1D1F]'
              }`}
              title="Cards View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-[#1D1D1F] shadow-[0_2px_6px_rgba(0,0,0,0.06)]'
                  : 'text-[#86868B] hover:text-[#1D1D1F]'
              }`}
              title="Table View"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            className="h-10 text-xs rounded-full px-4 border-black/[0.08] hover:bg-[#F5F5F7] text-[#1D1D1F]"
          >
            <Download className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="bg-white/80 border border-black/[0.06] rounded-3xl p-16 flex flex-col items-center justify-center space-y-3">
          <div className="h-6 w-6 rounded-full border-2 border-[#1D1D1F] border-t-transparent animate-spin" />
          <p className="text-sm font-medium text-[#86868B]">Loading leads...</p>
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="bg-white/80 border border-black/[0.06] rounded-3xl p-12 text-center space-y-3">
          <div className="h-14 w-14 mx-auto rounded-3xl bg-[#F5F5F7] flex items-center justify-center text-2xl">
            🔍
          </div>
          <h3 className="text-base font-semibold text-[#1D1D1F]">No leads found</h3>
          <p className="text-xs text-[#86868B] max-w-sm mx-auto">
            {leads.length === 0
              ? 'Use the search box above to find local businesses from Google Maps.'
              : 'No leads matched your filter criteria. Try clearing filters or search.'}
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        /* APPLE-STYLE CARDS GRID */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredLeads.map((lead) => {
            const isOutdated = lead.leadType === 'OUTDATED_WEBSITE';
            const isSelected = selectedIds.has(lead.id);

            return (
              <div
                key={lead.id}
                className={`bg-white/95 backdrop-blur-md border rounded-3xl p-5 transition-all duration-200 flex flex-col justify-between space-y-4 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 ${
                  isSelected
                    ? 'border-[#1D1D1F] ring-1 ring-[#1D1D1F]'
                    : 'border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.03)]'
                }`}
              >
                {/* Top Section */}
                <div className="space-y-2.5">
                  {/* Photo Header (if scraped) */}
                  {lead.imageUrl && (
                    <div className="relative w-full h-36 rounded-2xl overflow-hidden bg-[#F5F5F7] -mt-1 mb-3 border border-black/[0.04]">
                      <img
                        src={lead.imageUrl}
                        alt={lead.name}
                        className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                        loading="lazy"
                        onError={(e) => {
                          const parent = (e.target as HTMLElement).parentElement;
                          if (parent) parent.style.display = 'none';
                        }}
                      />
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                        {isOutdated ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/90 text-white backdrop-blur-md shadow-sm flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Outdated Site
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/90 text-white backdrop-blur-md shadow-sm flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            No Website
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-[#1D1D1F] focus:ring-[#1D1D1F] h-4 w-4 cursor-pointer shrink-0"
                          checked={isSelected}
                          onChange={(e) => {
                            const next = new Set(selectedIds);
                            if (e.target.checked) next.add(lead.id);
                            else next.delete(lead.id);
                            setSelectedIds(next);
                          }}
                        />
                        <h3 className="font-semibold text-base text-[#1D1D1F] tracking-tight truncate" title={lead.name}>
                          {lead.name}
                        </h3>
                      </div>

                      {/* Badges: Category & Lead Type (show if no image banner) */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-[#F5F5F7] text-[#48484A]">
                          {lead.category || 'Business'}
                        </span>
                        {!lead.imageUrl && (
                          isOutdated ? (
                            <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Outdated Site
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200/60 flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              No Website
                            </span>
                          )
                        )}
                      </div>
                    </div>

                    {/* Status Pill Dropdown */}
                    <div className="shrink-0">
                      <Select value={lead.status} onValueChange={(v) => updateStatus(lead.id, v || 'NEW')}>
                        <SelectTrigger className="h-7 text-[11px] font-medium rounded-full px-2.5 border border-black/[0.08] bg-[#F5F5F7]/80 hover:bg-[#F5F5F7]">
                          <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_CONFIG[lead.status]?.dot}`} />
                            <span>{STATUS_CONFIG[lead.status]?.label}</span>
                          </div>
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                          {STATUSES.map(s => (
                            <SelectItem key={s} value={s} className="text-xs">
                              <div className="flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full ${STATUS_CONFIG[s]?.dot}`} />
                                <span>{STATUS_CONFIG[s]?.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Rating & Address */}
                  <div className="space-y-1 pt-1">
                    {lead.rating && (
                      <div className="flex items-center gap-1.5 text-xs text-[#1D1D1F] font-medium">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        <span>{lead.rating}</span>
                        {lead.reviewCount && (
                          <span className="text-[#86868B] font-normal">({lead.reviewCount} reviews)</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-start gap-1.5 text-xs text-[#86868B] leading-relaxed">
                      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[#86868B]" />
                      <span className="line-clamp-2" title={lead.address}>{lead.address}</span>
                    </div>
                  </div>

                  {/* Contact Info (Phone, Email, Site) */}
                  <div className="pt-2 border-t border-black/[0.04] space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#86868B]">Phone:</span>
                      {lead.phone ? (
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-[#1D1D1F]">{lead.phone}</span>
                          <button
                            type="button"
                            onClick={() => copyPhone(lead.phone!, lead.id)}
                            className="text-[#86868B] hover:text-[#1D1D1F] p-0.5 rounded transition-colors"
                            title="Copy Phone"
                          >
                            {copiedPhoneId === lead.id ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[#86868B] italic">None available</span>
                      )}
                    </div>

                    {lead.email && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#86868B]">Email:</span>
                        <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline truncate max-w-[180px]">
                          {lead.email}
                        </a>
                      </div>
                    )}

                    {lead.websiteUrl && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#86868B]">Current Site:</span>
                        <a
                          href={lead.websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber-700 hover:underline truncate max-w-[180px] flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {lead.websiteUrl.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Notes snippet or inline editor */}
                  <div className="pt-1">
                    {editingNotesId === lead.id ? (
                      <div className="flex gap-1.5">
                        <Input
                          defaultValue={lead.notes || ''}
                          autoFocus
                          onBlur={(e) => updateNotes(lead.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') updateNotes(lead.id, (e.target as HTMLInputElement).value);
                            if (e.key === 'Escape') setEditingNotesId(null);
                          }}
                          placeholder="Type notes and press enter..."
                          className="h-7 text-xs bg-[#F5F5F7] rounded-lg"
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingNotesId(lead.id)}
                        className="text-[11px] text-[#86868B] hover:text-[#1D1D1F] flex items-center gap-1 text-left w-full truncate py-0.5"
                      >
                        <StickyNote className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {lead.notes ? lead.notes : 'Add notes...'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Bottom Actions Bar */}
                <div className="pt-3 border-t border-black/[0.04] flex items-center gap-2">
                  {/* WhatsApp Customizer Button */}
                  <Button
                    type="button"
                    size="sm"
                    disabled={!lead.phone}
                    onClick={() => setActiveWhatsAppLead(lead)}
                    className="flex-1 h-9 rounded-full text-xs font-semibold bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-[0_2px_8px_rgba(37,211,102,0.25)] transition-all hover:scale-[1.01] active:scale-[0.99]"
                  >
                    <MessageCircle className="h-3.5 w-3.5 mr-1" />
                    WhatsApp
                  </Button>

                  {/* Quick 1-click Direct WhatsApp */}
                  {lead.phone && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => quickSendWhatsApp(lead)}
                      title="Quick Direct WhatsApp (Default Template)"
                      className="h-9 w-9 p-0 rounded-full border-black/[0.08] hover:bg-emerald-50 text-emerald-600 shrink-0"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {/* Google Maps Button */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(lead.mapsUrl, '_blank')}
                    title="Open on Google Maps"
                    className="h-9 px-3 rounded-full border-black/[0.08] hover:bg-[#F5F5F7] text-[#1D1D1F] shrink-0 text-xs font-medium"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1 text-[#86868B]" />
                    Maps
                  </Button>

                  {/* Delete Button */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => deleteLead(lead.id, lead.name)}
                    title="Delete lead"
                    className="h-9 w-9 p-0 rounded-full border-black/[0.08] hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-[#86868B] shrink-0 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW OPTION */
        <div className="bg-white/95 border border-black/[0.06] rounded-3xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F5F5F7] text-[11px] uppercase tracking-wider text-[#86868B] border-b border-black/[0.06]">
                <tr>
                  <th className="p-3 w-10"></th>
                  <th className="p-3 font-semibold">Business</th>
                  <th className="p-3 font-semibold">Category</th>
                  <th className="p-3 font-semibold">Phone</th>
                  <th className="p-3 font-semibold">Rating</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-[#F5F5F7]/50 transition-colors">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-[#1D1D1F] focus:ring-[#1D1D1F] h-4 w-4 cursor-pointer"
                        checked={selectedIds.has(lead.id)}
                        onChange={(e) => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(lead.id);
                          else next.delete(lead.id);
                          setSelectedIds(next);
                        }}
                      />
                    </td>
                    <td className="p-3 font-medium text-[#1D1D1F]">
                      <div className="flex items-center gap-2.5">
                        {lead.imageUrl && (
                          <img
                            src={lead.imageUrl}
                            alt=""
                            className="h-8 w-8 rounded-lg object-cover border border-black/[0.06] shrink-0"
                            loading="lazy"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="truncate max-w-[220px] font-semibold">{lead.name}</div>
                          <div className="text-xs text-[#86868B] truncate max-w-[220px]">{lead.address}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-[#48484A]">{lead.category}</td>
                    <td className="p-3 text-xs text-[#1D1D1F]">{lead.phone || '—'}</td>
                    <td className="p-3 text-xs">
                      {lead.rating ? (
                        <span className="flex items-center gap-1 font-medium text-amber-600">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          {lead.rating}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="p-3">
                      <Select value={lead.status} onValueChange={(v) => updateStatus(lead.id, v || 'NEW')}>
                        <SelectTrigger className="h-7 text-xs rounded-full px-2.5 border-black/[0.08]">
                          <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_CONFIG[lead.status]?.dot}`} />
                            <span>{STATUS_CONFIG[lead.status]?.label}</span>
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map(s => (
                            <SelectItem key={s} value={s} className="text-xs">{STATUS_CONFIG[s]?.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          disabled={!lead.phone}
                          onClick={() => setActiveWhatsAppLead(lead)}
                          className="h-8 px-3 rounded-full text-xs font-semibold bg-[#25D366] hover:bg-[#20bd5a] text-white"
                        >
                          <MessageCircle className="h-3 w-3 mr-1" /> WhatsApp
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(lead.mapsUrl, '_blank')}
                          className="h-8 px-2.5 rounded-full border-black/[0.08]"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteLead(lead.id, lead.name)}
                          className="h-8 px-2.5 rounded-full border-black/[0.08] hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
