'use client';

import { useState } from 'react';
import { SearchForm } from '@/components/SearchForm';
import { LeadsTable } from '@/components/LeadsTable';
import { ResultsPopup } from '@/components/ResultsPopup';
import { Crosshair } from 'lucide-react';

interface SearchResult {
  count: number;
  leads: any[];
  city: string;
  category: string;
  mode: string;
}

export default function Home() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [showPopup, setShowPopup] = useState(false);

  const handleSearchComplete = (result: SearchResult) => {
    setRefreshTrigger(t => t + 1);
    setSearchResult(result);
    setShowPopup(true);
  };

  return (
    <main className="min-h-screen bg-[#F5F5F7] pb-24 sm:pb-16 text-[#1D1D1F]">
      {/* Apple-style Translucent Header */}
      <header className="border-b border-black/[0.06] bg-white/75 backdrop-blur-2xl sticky top-0 z-40 transition-all">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-[#1D1D1F] text-white flex items-center justify-center shadow-sm">
              <Crosshair className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-[#1D1D1F]">
                Zero Web Finder
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-[#EBEBED] text-[#6E6E73]">
              Freelancer Client Radar
            </span>
          </div>
        </div>
      </header>
      
      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <div className="space-y-1">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1D1D1F]">
            Find your next client.
          </h2>
          <p className="text-sm sm:text-base text-[#86868B]">
            Discover businesses without websites — and pitch them professional web design with one click.
          </p>
        </div>
        
        <SearchForm onSearchComplete={handleSearchComplete} />
        
        <div className="pt-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold tracking-tight text-[#1D1D1F]">
              Discovered Leads
            </h3>
          </div>
          <LeadsTable refreshTrigger={refreshTrigger} />
        </div>
      </div>

      {/* Results Popup */}
      <ResultsPopup
        open={showPopup}
        onClose={() => setShowPopup(false)}
        result={searchResult}
      />
    </main>
  );
}
