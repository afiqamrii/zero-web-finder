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
    <main className="min-h-screen pb-20 sm:pb-8">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-12 sm:h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Crosshair className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
            </div>
            <h1 className="text-sm sm:text-base font-bold tracking-tight text-foreground">
              Zero Web Finder
            </h1>
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Lead Gen Tool</p>
        </div>
      </header>
      
      {/* Content */}
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Find your next client
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Discover businesses without websites — or with outdated ones.
          </p>
        </div>
        
        <SearchForm onSearchComplete={handleSearchComplete} />
        <LeadsTable refreshTrigger={refreshTrigger} />
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
