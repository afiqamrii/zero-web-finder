'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Sparkles, Navigation, Globe, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const CATEGORIES = [
  { label: 'Car Repair', emoji: '🔧' },
  { label: 'Barber', emoji: '💇' },
  { label: 'Restaurant', emoji: '🍜' },
  { label: 'Dental Clinic', emoji: '🦷' },
  { label: 'Cleaning Service', emoji: '🧹' },
  { label: 'Gym', emoji: '🏋️' },
  { label: 'Photography Studio', emoji: '📸' },
  { label: 'Tailor', emoji: '👗' },
  { label: 'Pet Shop', emoji: '🐾' },
  { label: 'Spa', emoji: '💆' },
  { label: 'Plumber', emoji: '🛠️' },
  { label: 'Florist', emoji: '🌺' },
  { label: 'Bakery', emoji: '🍰' },
  { label: 'Laundry', emoji: '👕' },
];

const CITIES = ['Kuala Lumpur', 'Petaling Jaya', 'Shah Alam', 'Johor Bahru', 'Penang', 'Ipoh', 'Malacca', 'Kota Kinabalu'];

type SearchMode = 'no_website' | 'outdated_website';

interface SearchResult {
  count: number;
  leads: any[];
  city: string;
  category: string;
  mode: string;
}

export function SearchForm({ onSearchComplete }: { onSearchComplete: (result: SearchResult) => void }) {
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<SearchMode>('no_website');
  const [isLocating, setIsLocating] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const { toast } = useToast();

  const doSearch = async (overrides?: { city?: string; category?: string; lat?: number; lng?: number }) => {
    const finalCity = overrides?.city !== undefined ? overrides.city : city;
    const finalCategory = overrides?.category !== undefined ? overrides.category : category;
    const finalLat = overrides?.lat || coords?.lat;
    const finalLng = overrides?.lng || coords?.lng;
    
    if (!finalCategory && !finalCity && !finalLat) {
      toast({ title: 'Input required', description: 'Enter either a location or a business type.' });
      return;
    }
    
    setIsLoading(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: finalCity,
          category: finalCategory,
          limit: 10,
          mode,
          lat: finalLat,
          lng: finalLng,
        }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      onSearchComplete({
        count: data.count,
        leads: data.leads,
        city: finalCity || 'your area',
        category: finalCategory || 'businesses',
        mode,
      });
    } catch (error: any) {
      toast({ title: 'Search failed', description: error.message || 'Something went wrong.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      toast({ title: 'Not supported', description: 'Geolocation is not available in your browser.' });
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setCity('📍 Near Me');
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
        toast({ title: 'Location denied', description: 'Allow location access and try again.' });
      },
      { enableHighAccuracy: true }
    );
  };

  const handleRandomSearch = () => {
    const randomCity = CITIES[Math.floor(Math.random() * CITIES.length)];
    const randomCat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    setCity(randomCity);
    setCategory(randomCat.label);
    doSearch({ city: randomCity, category: randomCat.label });
  };

  const toTitleCase = (str: string) => {
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  };

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('no_website')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
            mode === 'no_website'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-card text-muted-foreground border border-border active:bg-accent'
          }`}
        >
          <Globe className="h-3.5 w-3.5" />
          No Website
        </button>
        <button
          onClick={() => setMode('outdated_website')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
            mode === 'outdated_website'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-card text-muted-foreground border border-border active:bg-accent'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Outdated Site
        </button>
      </div>

      {/* Search Card */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3">
        {/* Location Row */}
        <div className="space-y-1">
          <label className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</label>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Kuala Lumpur (Optional)"
              value={city}
              onChange={(e) => { setCity(toTitleCase(e.target.value)); setCoords(null); }}
              list="city-suggestions"
              className="h-10 sm:h-11 text-sm bg-background border-border"
            />
            <datalist id="city-suggestions">
              {CITIES.map(c => <option key={c} value={c} />)}
            </datalist>
            <Button
              type="button"
              variant="outline"
              onClick={handleNearMe}
              disabled={isLocating}
              className="h-10 sm:h-11 px-3 shrink-0"
            >
              {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {/* Category Row */}
        <div className="space-y-1">
          <label className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Business Type</label>
          <Input
            placeholder="e.g. Barber, Dental Clinic (Optional)"
            value={category}
            onChange={(e) => setCategory(toTitleCase(e.target.value))}
            list="category-suggestions"
            className="h-10 sm:h-11 text-sm bg-background border-border"
          />
          <datalist id="category-suggestions">
            {CATEGORIES.map(c => <option key={c.label} value={c.label} />)}
          </datalist>
        </div>
        {/* Buttons */}
        <div className="flex gap-2 pt-1">
          <Button
            onClick={() => doSearch()}
            disabled={isLoading}
            className="flex-1 h-10 sm:h-11 text-sm font-semibold"
          >
            {isLoading ? (
              <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Scraping...</>
            ) : (
              <><Search className="mr-1.5 h-4 w-4" /> Find Leads</>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleRandomSearch}
            disabled={isLoading}
            className="h-10 sm:h-11 px-4"
          >
            <Sparkles className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Random</span>
          </Button>
        </div>
      </div>

      {/* Quick Picks — horizontal scroll on mobile */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">📍 Quick locations</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap scrollbar-none">
            {CITIES.map((c) => (
              <button
                key={c}
                onClick={() => { setCity(c); setCoords(null); }}
                className={`px-2.5 py-1.5 text-xs rounded-lg border whitespace-nowrap shrink-0 transition-all active:scale-95 ${
                  city === c
                    ? 'bg-primary/10 border-primary/40 text-primary font-medium'
                    : 'bg-card border-border text-muted-foreground'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">🏷️ Quick categories</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.label}
                onClick={() => setCategory(cat.label)}
                className={`px-2.5 py-1.5 text-xs rounded-lg border whitespace-nowrap shrink-0 transition-all active:scale-95 ${
                  category === cat.label
                    ? 'bg-primary/10 border-primary/40 text-primary font-medium'
                    : 'bg-card border-border text-muted-foreground'
                }`}
              >
                {cat.emoji} {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
