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
    <div className="space-y-4 sm:space-y-5">
      {/* Apple-style Segmented Mode Switcher */}
      <div className="inline-flex p-1 bg-[#EBEBED] rounded-full border border-black/[0.04]">
        <button
          type="button"
          onClick={() => setMode('no_website')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all ${
            mode === 'no_website'
              ? 'bg-white text-[#1D1D1F] shadow-[0_2px_8px_rgba(0,0,0,0.08)]'
              : 'text-[#86868B] hover:text-[#1D1D1F]'
          }`}
        >
          <Globe className="h-3.5 w-3.5" />
          No Website
        </button>
        <button
          type="button"
          onClick={() => setMode('outdated_website')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all ${
            mode === 'outdated_website'
              ? 'bg-white text-[#D97706] shadow-[0_2px_8px_rgba(0,0,0,0.08)]'
              : 'text-[#86868B] hover:text-[#1D1D1F]'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Outdated Site
        </button>
      </div>

      {/* Search Card */}
      <div className="bg-white/90 backdrop-blur-xl border border-black/[0.06] rounded-3xl p-5 sm:p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.04)] space-y-4">
        {/* Location Row */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">Location</label>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Kuala Lumpur, Petaling Jaya..."
              value={city}
              onChange={(e) => { setCity(toTitleCase(e.target.value)); setCoords(null); }}
              list="city-suggestions"
              className="h-11 text-sm bg-[#F5F5F7]/80 hover:bg-[#F5F5F7] focus:bg-white border-black/[0.06] rounded-2xl transition-all"
            />
            <datalist id="city-suggestions">
              {CITIES.map(c => <option key={c} value={c} />)}
            </datalist>
            <Button
              type="button"
              variant="outline"
              onClick={handleNearMe}
              disabled={isLocating}
              className="h-11 px-4 rounded-2xl border-black/[0.06] bg-[#F5F5F7]/80 hover:bg-[#F5F5F7] text-[#1D1D1F] shrink-0"
              title="Use Current Location"
            >
              {isLocating ? <Loader2 className="h-4 w-4 animate-spin text-[#86868B]" /> : <Navigation className="h-4 w-4 text-[#1D1D1F]" />}
            </Button>
          </div>
        </div>

        {/* Category Row */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">Business Type</label>
          <Input
            placeholder="e.g. Florist, Barber, Cafe, Dental Clinic..."
            value={category}
            onChange={(e) => setCategory(toTitleCase(e.target.value))}
            list="category-suggestions"
            className="h-11 text-sm bg-[#F5F5F7]/80 hover:bg-[#F5F5F7] focus:bg-white border-black/[0.06] rounded-2xl transition-all"
          />
          <datalist id="category-suggestions">
            {CATEGORIES.map(c => <option key={c.label} value={c.label} />)}
          </datalist>
        </div>

        {/* Buttons */}
        <div className="flex gap-2.5 pt-1">
          <Button
            onClick={() => doSearch()}
            disabled={isLoading}
            className="flex-1 h-11 rounded-full text-sm font-semibold bg-[#1D1D1F] text-white hover:bg-[#2D2D2F] shadow-[0_4px_14px_rgba(0,0,0,0.12)] transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            {isLoading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scraping Google Maps...</>
            ) : (
              <><Search className="mr-2 h-4 w-4" /> Find Leads</>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleRandomSearch}
            disabled={isLoading}
            className="h-11 px-5 rounded-full border-black/[0.08] hover:bg-[#F5F5F7] text-[#1D1D1F] text-sm font-medium transition-all"
          >
            <Sparkles className="h-4 w-4 sm:mr-1.5 text-amber-500" />
            <span className="hidden sm:inline">Surprise Me</span>
          </Button>
        </div>
      </div>

      {/* Quick Picks — Apple Pill Tags */}
      <div className="space-y-3 pt-1">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">Popular Locations</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap scrollbar-none">
            {CITIES.map((c) => {
              const isSelected = city === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setCity(c); setCoords(null); }}
                  className={`px-3.5 py-1.5 text-xs rounded-full border whitespace-nowrap shrink-0 transition-all active:scale-95 ${
                    isSelected
                      ? 'bg-[#1D1D1F] border-transparent text-white font-medium shadow-[0_2px_8px_rgba(0,0,0,0.12)]'
                      : 'bg-white/90 border-black/[0.06] text-[#48484A] hover:text-[#1D1D1F] hover:bg-white'
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">Popular Categories</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap scrollbar-none">
            {CATEGORIES.map((cat) => {
              const isSelected = category === cat.label;
              return (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => setCategory(cat.label)}
                  className={`px-3.5 py-1.5 text-xs rounded-full border whitespace-nowrap shrink-0 transition-all active:scale-95 ${
                    isSelected
                      ? 'bg-[#1D1D1F] border-transparent text-white font-medium shadow-[0_2px_8px_rgba(0,0,0,0.12)]'
                      : 'bg-white/90 border-black/[0.06] text-[#48484A] hover:text-[#1D1D1F] hover:bg-white'
                  }`}
                >
                  {cat.emoji} {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
