import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  Star,
  Sparkles,
  SlidersHorizontal,
  Play,
  Loader2,
  LayoutGrid,
  List,
  RotateCcw,
  Tv,
  Film,
  Calendar,
  Layers,
  ChevronRight,
  ChevronDown,
  Flame,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Ban,
  Plus,
  Minus,
  Check,
  X,
  EyeOff,
  UserCheck,
  HelpCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { anidbService, deduplicateAnime, AnimeSearchFilters } from '../services/anidbService';
import { AnimeItem } from '../types/anime';

const ALL_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Hentai',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller'
];

const DEMOGRAPHICS = [
  { id: 'All', label: 'All Demographics (全年龄段)' },
  { id: 'Shounen', label: '少年 (Shounen - Teen / Action)' },
  { id: 'Seinen', label: '青年 (Seinen - Young Adult / Mature)' },
  { id: 'Shoujo', label: '少女 (Shoujo - Romance / Drama)' },
  { id: 'Josei', label: '女性 (Josei - Adult Drama)' },
  { id: 'Kids', label: '儿童 (Kids - Family Friendly)' }
];

const EPISODE_RANGES = [
  { id: 'all', label: 'All Episode Counts' },
  { id: 'movie', label: 'Feature Film (1 Ep)' },
  { id: 'short', label: 'Short Series (1–13 Eps / 1 Cour)' },
  { id: 'standard', label: 'Standard (14–26 Eps / 2 Cours)' },
  { id: 'long', label: 'Long Running (27–50 Eps)' },
  { id: 'epic', label: 'Epic Franchise (50+ Eps)' }
];

export const AniDBBrowseView: React.FC = () => {
  const { setSelectedAnime, openPlayer, searchQuery, setSearchQuery } = useApp();
  
  // Search state
  const [searchTerm, setSearchTerm] = useState(searchQuery || '');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [seasonFilter, setSeasonFilter] = useState<string>('All');
  const [yearFilter, setYearFilter] = useState<string>('All');
  const [minScoreFilter, setMinScoreFilter] = useState<number>(0);
  const [sortBy, setSortBy] = useState<string>('POPULARITY_DESC');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Advanced omission & age filters
  const [includedGenres, setIncludedGenres] = useState<string[]>([]);
  const [excludedGenres, setExcludedGenres] = useState<string[]>([]);
  const [contentRating, setContentRating] = useState<'safe' | 'all' | 'adult_only'>('safe');
  const [demographic, setDemographic] = useState<string>('All');
  const [episodeRange, setEpisodeRange] = useState<'all' | 'movie' | 'short' | 'standard' | 'long' | 'epic'>('all');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(false);
  const [genreSearchInput, setGenreSearchInput] = useState<string>('');

  // Results state
  const [animeList, setAnimeList] = useState<AnimeItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hasNextPage, setHasNextPage] = useState<boolean>(true);

  // Sync with global search query if set
  useEffect(() => {
    if (searchQuery && searchQuery !== searchTerm) {
      setSearchTerm(searchQuery);
    }
  }, [searchQuery]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (typeFilter !== 'All') count++;
    if (statusFilter !== 'All') count++;
    if (seasonFilter !== 'All') count++;
    if (yearFilter !== 'All') count++;
    if (includedGenres.length > 0) count += includedGenres.length;
    if (excludedGenres.length > 0) count += excludedGenres.length;
    if (contentRating !== 'all') count++;
    if (demographic !== 'All') count++;
    if (episodeRange !== 'all') count++;
    if (minScoreFilter > 0) count++;
    if (searchTerm.trim()) count++;
    return count;
  }, [typeFilter, statusFilter, seasonFilter, yearFilter, includedGenres, excludedGenres, contentRating, demographic, episodeRange, minScoreFilter, searchTerm]);

  // Cycle 3-state genre: Neutral -> Included (+) -> Excluded (-) -> Neutral
  const toggleGenreState = (genre: string) => {
    if (includedGenres.includes(genre)) {
      // Switch from Included to Excluded (Omitted)
      setIncludedGenres(prev => prev.filter(g => g !== genre));
      setExcludedGenres(prev => [...prev, genre]);
    } else if (excludedGenres.includes(genre)) {
      // Switch from Excluded to Neutral
      setExcludedGenres(prev => prev.filter(g => g !== genre));
    } else {
      // Switch from Neutral to Included
      setIncludedGenres(prev => [...prev, genre]);
    }
  };

  const excludeGenreDirectly = (genre: string) => {
    setIncludedGenres(prev => prev.filter(g => g !== genre));
    if (!excludedGenres.includes(genre)) {
      setExcludedGenres(prev => [...prev, genre]);
    }
  };

  const includeGenreDirectly = (genre: string) => {
    setExcludedGenres(prev => prev.filter(g => g !== genre));
    if (!includedGenres.includes(genre)) {
      setIncludedGenres(prev => [...prev, genre]);
    }
  };

  const clearGenre = (genre: string) => {
    setIncludedGenres(prev => prev.filter(g => g !== genre));
    setExcludedGenres(prev => prev.filter(g => g !== genre));
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSearchQuery('');
    setTypeFilter('All');
    setStatusFilter('All');
    setSeasonFilter('All');
    setYearFilter('All');
    setIncludedGenres([]);
    setExcludedGenres([]);
    setContentRating('safe');
    setDemographic('All');
    setEpisodeRange('all');
    setMinScoreFilter(0);
    setSortBy('POPULARITY_DESC');
  };

  // Preset Filters
  const applyPreset = (preset: 'family' | 'action_no_romance' | 'romance_no_action' | 'mystery_thriller') => {
    if (preset === 'family') {
      setContentRating('safe');
      setDemographic('All');
      setExcludedGenres(['Ecchi', 'Hentai', 'Horror', 'Psychological']);
      setIncludedGenres([]);
    } else if (preset === 'action_no_romance') {
      setIncludedGenres(['Action']);
      setExcludedGenres(['Romance']);
    } else if (preset === 'romance_no_action') {
      setIncludedGenres(['Romance']);
      setExcludedGenres(['Action', 'Mecha', 'Horror']);
    } else if (preset === 'mystery_thriller') {
      setIncludedGenres(['Mystery', 'Psychological']);
      setExcludedGenres(['Ecchi']);
    }
  };

  // Perform search & filter through anidbService with deduplication
  useEffect(() => {
    let isMounted = true;
    setCurrentPage(1);

    const fetchResults = async () => {
      setIsLoading(true);
      try {
        const filters: AnimeSearchFilters = {
          type: typeFilter,
          status: statusFilter,
          season: seasonFilter,
          year: yearFilter,
          includedGenres: includedGenres.length > 0 ? includedGenres : undefined,
          excludedGenres: excludedGenres.length > 0 ? excludedGenres : undefined,
          contentRating,
          demographic: demographic !== 'All' ? demographic : undefined,
          episodeRange: episodeRange !== 'all' ? episodeRange : undefined,
          minScore: minScoreFilter,
          sortBy: sortBy as any
        };

        const results = await anidbService.searchAnime(searchTerm, filters, 1, 36);
        if (isMounted) {
          setAnimeList(deduplicateAnime(results.items));
          setHasNextPage(results.hasNextPage);
        }
      } catch (e) {
        console.error('Failed to search anime:', e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    const timer = setTimeout(fetchResults, 250);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [
    searchTerm,
    typeFilter,
    statusFilter,
    seasonFilter,
    yearFilter,
    includedGenres,
    excludedGenres,
    contentRating,
    demographic,
    episodeRange,
    minScoreFilter,
    sortBy
  ]);

  // Load next page
  const handleLoadMore = async () => {
    if (isLoadingMore || !hasNextPage) return;
    setIsLoadingMore(true);
    const nextPage = currentPage + 1;
    try {
      const filters: AnimeSearchFilters = {
        type: typeFilter,
        status: statusFilter,
        season: seasonFilter,
        year: yearFilter,
        includedGenres: includedGenres.length > 0 ? includedGenres : undefined,
        excludedGenres: excludedGenres.length > 0 ? excludedGenres : undefined,
        contentRating,
        demographic: demographic !== 'All' ? demographic : undefined,
        episodeRange: episodeRange !== 'all' ? episodeRange : undefined,
        minScore: minScoreFilter,
        sortBy: sortBy as any
      };
      const results = await anidbService.searchAnime(searchTerm, filters, nextPage, 36);
      setAnimeList(prev => deduplicateAnime([...prev, ...results.items]));
      setHasNextPage(results.hasNextPage);
      setCurrentPage(nextPage);
    } catch (e) {
      console.warn('Failed to load more anime:', e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const visibleGenres = genreSearchInput.trim()
    ? ALL_GENRES.filter(g => g.toLowerCase().includes(genreSearchInput.toLowerCase().trim()))
    : ALL_GENRES;

  return (
    <div className="browse-container" style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.4px', color: 'var(--md-sys-color-on-surface)' }}>
            Anime Catalog & Search (番组索引与高级过滤)
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)', marginTop: '4px' }}>
            {animeList.length.toLocaleString()} titles retrieved • Real-time AniList GraphQL with Omission & Safe Search Filters
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Safe Search Mode Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: contentRating === 'safe' ? 'rgba(76, 175, 80, 0.15)' : contentRating === 'adult_only' ? 'rgba(255, 82, 82, 0.15)' : 'rgba(2, 169, 255, 0.15)',
              border: `1px solid ${contentRating === 'safe' ? 'rgba(76, 175, 80, 0.4)' : contentRating === 'adult_only' ? 'rgba(255, 82, 82, 0.4)' : 'rgba(2, 169, 255, 0.4)'}`,
              borderRadius: '999px',
              padding: '5px 14px'
            }}
          >
            {contentRating === 'safe' ? (
              <>
                <ShieldCheck size={14} color="#4caf50" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#4caf50' }}>Safe Search (No Adult / 18+)</span>
              </>
            ) : contentRating === 'adult_only' ? (
              <>
                <ShieldAlert size={14} color="#ff5252" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#ff5252' }}>18+ Mature Only</span>
              </>
            ) : (
              <>
                <Shield size={14} color="#02a9ff" />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#02a9ff' }}>All Ratings Included</span>
              </>
            )}
          </div>

          {/* View Mode Toggle */}
          <div style={{ display: 'flex', background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: '12px', padding: '3px' }}>
            <button
              onClick={() => setViewMode('grid')}
              style={{
                background: viewMode === 'grid' ? 'var(--md-sys-color-primary)' : 'transparent',
                color: viewMode === 'grid' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)',
                border: 'none',
                borderRadius: '9px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Grid View"
            >
              <LayoutGrid size={14} />
              <span>Grid</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{
                background: viewMode === 'list' ? 'var(--md-sys-color-primary)' : 'transparent',
                color: viewMode === 'list' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)',
                border: 'none',
                borderRadius: '9px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="List View"
            >
              <List size={14} />
              <span>List</span>
            </button>
          </div>
        </div>
      </div>

      {/* Multi-Filter Bar */}
      <div className="anidb-filter-container" style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: '20px', padding: '18px', marginBottom: '20px' }}>
        
        {/* Row 1: Search, Primary Selects & Advanced Filter Toggle */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', alignItems: 'center' }}>
          {/* Search input with Clear Icon */}
          <div className="search-input-wrap" style={{ gridColumn: 'span 2', minWidth: '220px', position: 'relative' }}>
            <Search size={16} className="search-input-icon" />
            <input
              type="text"
              placeholder="Search title, romaji, studio, characters..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSearchQuery(e.target.value);
              }}
              style={{ paddingRight: searchTerm ? '32px' : '12px' }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSearchQuery('');
                }}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--md-sys-color-on-surface-variant)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Clear search text"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Type format select */}
          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="All">All Formats</option>
            <option value="TV">TV Series</option>
            <option value="Movie">Movie</option>
            <option value="OVA">OVA</option>
            <option value="ONA">ONA</option>
            <option value="Special">Special</option>
          </select>

          {/* Status select */}
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Status</option>
            <option value="Airing">Currently Airing</option>
            <option value="Finished">Finished</option>
            <option value="Upcoming">Upcoming</option>
          </select>

          {/* Seasons select */}
          <select
            className="filter-select"
            value={seasonFilter}
            onChange={(e) => setSeasonFilter(e.target.value)}
          >
            <option value="All">All Seasons</option>
            <option value="Spring">Spring</option>
            <option value="Summer">Summer</option>
            <option value="Fall">Fall</option>
            <option value="Winter">Winter</option>
          </select>

          {/* Years select */}
          <select
            className="filter-select"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value="All">All Years</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
            <option value="2023">2023</option>
            <option value="2022">2022</option>
            <option value="2021">2021</option>
            <option value="2020">2020</option>
            <option value="2019">2019</option>
            <option value="2018">2018</option>
            <option value="2010s">2010s Decade</option>
            <option value="2000s">2000s Decade</option>
            <option value="1990s">1990s Classic</option>
          </select>

          {/* Sort select */}
          <select
            className="filter-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="POPULARITY_DESC">Most Popular (人气)</option>
            <option value="TRENDING_DESC">Trending Now (热度)</option>
            <option value="SCORE_DESC">Top Rated (最高评分)</option>
            <option value="START_DATE_DESC">Release Date (最新)</option>
            <option value="FAVOURITES_DESC">Most Favorited (收藏)</option>
            <option value="EPISODES_DESC">Most Episodes (集数)</option>
            <option value="TITLE_ROMAJI">Title (A–Z)</option>
          </select>

          {/* Min Score filter */}
          <select
            className="filter-select"
            value={minScoreFilter}
            onChange={(e) => setMinScoreFilter(parseFloat(e.target.value))}
          >
            <option value="0">Any Rating</option>
            <option value="7.0">★ 7.0+ Score</option>
            <option value="7.5">★ 7.5+ Score</option>
            <option value="8.0">★ 8.0+ Great</option>
            <option value="8.5">★ 8.5+ Masterpiece</option>
            <option value="9.0">★ 9.0+ Legendary</option>
          </select>

          {/* Advanced Filters Button */}
          <button
            type="button"
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            style={{
              background: isAdvancedOpen ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-surface-container-high)',
              color: isAdvancedOpen ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface)',
              border: '1px solid var(--md-sys-color-outline-variant)',
              borderRadius: '12px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            <SlidersHorizontal size={14} />
            <span>Filters & Omit</span>
            {(includedGenres.length > 0 || excludedGenres.length > 0 || demographic !== 'All' || episodeRange !== 'all') && (
              <span
                style={{
                  background: isAdvancedOpen ? '#fff' : 'var(--md-sys-color-primary)',
                  color: isAdvancedOpen ? '#000' : 'var(--md-sys-color-on-primary)',
                  borderRadius: '999px',
                  padding: '1px 6px',
                  fontSize: '10px',
                  fontWeight: 800
                }}
              >
                {includedGenres.length + excludedGenres.length + (demographic !== 'All' ? 1 : 0) + (episodeRange !== 'all' ? 1 : 0)}
              </span>
            )}
            <ChevronDown size={14} style={{ transform: isAdvancedOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {/* Reset Filters button */}
          {activeFiltersCount > 0 && (
            <button
              onClick={resetFilters}
              style={{
                background: 'rgba(255, 82, 82, 0.15)',
                color: '#ff5252',
                border: '1px solid rgba(255, 82, 82, 0.3)',
                borderRadius: '12px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
              title="Reset all search filters"
            >
              <RotateCcw size={12} />
              <span>Reset ({activeFiltersCount})</span>
            </button>
          )}
        </div>

        {/* Row 2: Content Safety & Age Range Control */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', paddingTop: '4px', borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--md-sys-color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Content Rating & Safety:
            </span>

            {/* Safe search toggle pills */}
            <button
              type="button"
              onClick={() => setContentRating('safe')}
              style={{
                background: contentRating === 'safe' ? 'rgba(76, 175, 80, 0.25)' : 'var(--md-sys-color-surface-container-high)',
                color: contentRating === 'safe' ? '#4caf50' : 'var(--md-sys-color-on-surface-variant)',
                border: `1px solid ${contentRating === 'safe' ? '#4caf50' : 'var(--md-sys-color-outline-variant)'}`,
                borderRadius: '999px',
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer'
              }}
            >
              <ShieldCheck size={13} />
              <span>Safe Search (Omit 18+ Adult)</span>
            </button>

            <button
              type="button"
              onClick={() => setContentRating('all')}
              style={{
                background: contentRating === 'all' ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-surface-container-high)',
                color: contentRating === 'all' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)',
                border: `1px solid ${contentRating === 'all' ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline-variant)'}`,
                borderRadius: '999px',
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer'
              }}
            >
              <Shield size={13} />
              <span>All Ages Catalog</span>
            </button>

            <button
              type="button"
              onClick={() => setContentRating('adult_only')}
              style={{
                background: contentRating === 'adult_only' ? 'rgba(255, 82, 82, 0.25)' : 'var(--md-sys-color-surface-container-high)',
                color: contentRating === 'adult_only' ? '#ff5252' : 'var(--md-sys-color-on-surface-variant)',
                border: `1px solid ${contentRating === 'adult_only' ? '#ff5252' : 'var(--md-sys-color-outline-variant)'}`,
                borderRadius: '999px',
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer'
              }}
            >
              <ShieldAlert size={13} />
              <span>18+ Mature Only</span>
            </button>
          </div>

          {/* Demographic Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--md-sys-color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Demographic:
            </span>
            <select
              className="filter-select"
              value={demographic}
              onChange={(e) => setDemographic(e.target.value)}
              style={{ padding: '4px 10px', fontSize: '11px', height: 'auto' }}
            >
              {DEMOGRAPHICS.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 3: Interactive 3-State Genre Matrix (Include / Omit / Neutral) */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--md-sys-color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Genres (Click to Include +, Click again to Omit −):
              </span>
              <span style={{ fontSize: '10px', color: 'var(--md-sys-color-on-surface-variant)', opacity: 0.8 }}>
                🟢 Green = Must Include | 🔴 Red = Omit / Exclude
              </span>
            </div>

            {(includedGenres.length > 0 || excludedGenres.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setIncludedGenres([]);
                  setExcludedGenres([]);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--md-sys-color-primary)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '2px 6px'
                }}
              >
                Clear Genre Selections
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none', flexWrap: 'wrap' }}>
            {ALL_GENRES.map(genre => {
              const isInc = includedGenres.includes(genre);
              const isExc = excludedGenres.includes(genre);

              let bg = 'var(--md-sys-color-surface-container-high)';
              let color = 'var(--md-sys-color-on-surface-variant)';
              let border = '1px solid var(--md-sys-color-outline-variant)';

              if (isInc) {
                bg = 'rgba(76, 175, 80, 0.25)';
                color = '#4caf50';
                border = '1px solid #4caf50';
              } else if (isExc) {
                bg = 'rgba(255, 82, 82, 0.25)';
                color = '#ff5252';
                border = '1px solid #ff5252';
              }

              return (
                <button
                  key={genre}
                  type="button"
                  onClick={() => toggleGenreState(genre)}
                  title={`Click to cycle state: ${isInc ? 'Set to OMIT / EXCLUDE' : isExc ? 'Clear filter' : 'Set to MUST INCLUDE'}`}
                  style={{
                    background: bg,
                    color: color,
                    border: border,
                    borderRadius: '999px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: isInc || isExc ? 700 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {isInc && <Plus size={12} strokeWidth={3} />}
                  {isExc && <Minus size={12} strokeWidth={3} />}
                  <span style={{ textDecoration: isExc ? 'line-through' : 'none' }}>{genre}</span>
                  {isExc && <span style={{ fontSize: '9px', fontWeight: 800, opacity: 0.8 }}>(Omit)</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Collapsible Advanced Filters Drawer */}
        {isAdvancedOpen && (
          <div
            style={{
              marginTop: '4px',
              padding: '16px',
              background: 'var(--md-sys-color-surface-container-high)',
              borderRadius: '16px',
              border: '1px solid var(--md-sys-color-outline-variant)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SlidersHorizontal size={16} color="var(--md-sys-color-primary)" />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                  Advanced Filters & Quick Presets
                </span>
              </div>

              {/* Quick Presets */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: 'var(--md-sys-color-on-surface-variant)', fontWeight: 600 }}>Quick Presets:</span>
                <button
                  type="button"
                  className="section-btn"
                  onClick={() => applyPreset('family')}
                  style={{ padding: '3px 8px', fontSize: '11px' }}
                >
                  🌱 Family Safe (No Adult/Horror)
                </button>
                <button
                  type="button"
                  className="section-btn"
                  onClick={() => applyPreset('action_no_romance')}
                  style={{ padding: '3px 8px', fontSize: '11px' }}
                >
                  ⚔️ Action Only (No Romance)
                </button>
                <button
                  type="button"
                  className="section-btn"
                  onClick={() => applyPreset('romance_no_action')}
                  style={{ padding: '3px 8px', fontSize: '11px' }}
                >
                  💖 Pure Romance (No Mecha/Horror)
                </button>
                <button
                  type="button"
                  className="section-btn"
                  onClick={() => applyPreset('mystery_thriller')}
                  style={{ padding: '3px 8px', fontSize: '11px' }}
                >
                  🧠 Mystery & Thriller
                </button>
              </div>
            </div>

            {/* Episode Length Range Selector */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '6px' }}>
                  EPISODE COUNT / LENGTH:
                </label>
                <select
                  className="filter-select"
                  value={episodeRange}
                  onChange={(e) => setEpisodeRange(e.target.value as any)}
                  style={{ width: '100%' }}
                >
                  {EPISODE_RANGES.map(r => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>

              {/* Genre Search inside Drawer */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '6px' }}>
                  SEARCH & OMIT SPECIFIC GENRES:
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    placeholder="Type genre name (e.g. Ecchi, Mecha)..."
                    value={genreSearchInput}
                    onChange={(e) => setGenreSearchInput(e.target.value)}
                    style={{
                      background: 'var(--md-sys-color-surface-container)',
                      border: '1px solid var(--md-sys-color-outline-variant)',
                      borderRadius: '10px',
                      padding: '6px 10px',
                      color: '#fff',
                      fontSize: '12px',
                      flex: 1
                    }}
                  />
                  {genreSearchInput && (
                    <button
                      type="button"
                      onClick={() => setGenreSearchInput('')}
                      className="section-btn"
                      style={{ padding: '4px 8px' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Exclude / Omit Manager */}
            {visibleGenres.length > 0 && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '8px' }}>
                  Quick Actions (Click Green to Require, Red to Omit):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                  {visibleGenres.map(g => {
                    const isInc = includedGenres.includes(g);
                    const isExc = excludedGenres.includes(g);
                    return (
                      <div
                        key={g}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'var(--md-sys-color-surface-container)',
                          border: `1px solid ${isInc ? '#4caf50' : isExc ? '#ff5252' : 'var(--md-sys-color-outline-variant)'}`,
                          borderRadius: '10px',
                          padding: '6px 10px'
                        }}
                      >
                        <span style={{ fontSize: '12px', fontWeight: 600, color: isInc ? '#4caf50' : isExc ? '#ff5252' : '#fff', textDecoration: isExc ? 'line-through' : 'none' }}>
                          {g}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => isInc ? clearGenre(g) : includeGenreDirectly(g)}
                            style={{
                              background: isInc ? '#4caf50' : 'rgba(76, 175, 80, 0.15)',
                              color: isInc ? '#fff' : '#4caf50',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '3px 6px',
                              fontSize: '10px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                            title="Require genre (+)"
                          >
                            + Inc
                          </button>
                          <button
                            type="button"
                            onClick={() => isExc ? clearGenre(g) : excludeGenreDirectly(g)}
                            style={{
                              background: isExc ? '#ff5252' : 'rgba(255, 82, 82, 0.15)',
                              color: isExc ? '#fff' : '#ff5252',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '3px 6px',
                              fontSize: '10px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                            title="Omit / Exclude genre (-)"
                          >
                            − Omit
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Active Filters Summary Chips Bar */}
        {activeFiltersCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--md-sys-color-on-surface-variant)', marginRight: '4px' }}>
              Active Filters:
            </span>

            {/* Search Query Chip */}
            {searchTerm.trim() && (
              <span
                style={{
                  background: 'var(--md-sys-color-surface-container-high)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  borderRadius: '999px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>Query: "{searchTerm}"</span>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSearchQuery('');
                  }}
                  style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <X size={11} />
                </button>
              </span>
            )}

            {/* Safe Search Chip */}
            {contentRating !== 'all' && (
              <span
                style={{
                  background: contentRating === 'safe' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 82, 82, 0.2)',
                  border: `1px solid ${contentRating === 'safe' ? '#4caf50' : '#ff5252'}`,
                  borderRadius: '999px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  color: contentRating === 'safe' ? '#4caf50' : '#ff5252',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>{contentRating === 'safe' ? '🛡️ Safe Search (No 18+)' : '🔞 18+ Mature Only'}</span>
                <button
                  type="button"
                  onClick={() => setContentRating('all')}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <X size={11} />
                </button>
              </span>
            )}

            {/* Included Genres Chips */}
            {includedGenres.map(g => (
              <span
                key={`inc_${g}`}
                style={{
                  background: 'rgba(76, 175, 80, 0.2)',
                  border: '1px solid #4caf50',
                  borderRadius: '999px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  color: '#4caf50',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>+ {g}</span>
                <button
                  type="button"
                  onClick={() => clearGenre(g)}
                  style={{ background: 'none', border: 'none', color: '#4caf50', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <X size={11} />
                </button>
              </span>
            ))}

            {/* Excluded / Omitted Genres Chips */}
            {excludedGenres.map(g => (
              <span
                key={`exc_${g}`}
                style={{
                  background: 'rgba(255, 82, 82, 0.2)',
                  border: '1px solid #ff5252',
                  borderRadius: '999px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  color: '#ff5252',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span style={{ textDecoration: 'line-through' }}>− {g} (Omitted)</span>
                <button
                  type="button"
                  onClick={() => clearGenre(g)}
                  style={{ background: 'none', border: 'none', color: '#ff5252', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <X size={11} />
                </button>
              </span>
            ))}

            {/* Demographic Chip */}
            {demographic !== 'All' && (
              <span
                style={{
                  background: 'var(--md-sys-color-surface-container-high)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  borderRadius: '999px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  color: 'var(--md-sys-color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>Demographic: {demographic}</span>
                <button
                  type="button"
                  onClick={() => setDemographic('All')}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <X size={11} />
                </button>
              </span>
            )}

            {/* Episode Range Chip */}
            {episodeRange !== 'all' && (
              <span
                style={{
                  background: 'var(--md-sys-color-surface-container-high)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  borderRadius: '999px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  color: 'var(--md-sys-color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>Length: {EPISODE_RANGES.find(e => e.id === episodeRange)?.label}</span>
                <button
                  type="button"
                  onClick={() => setEpisodeRange('all')}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <X size={11} />
                </button>
              </span>
            )}

            {/* Format Chip */}
            {typeFilter !== 'All' && (
              <span
                style={{
                  background: 'var(--md-sys-color-surface-container-high)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  borderRadius: '999px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>Format: {typeFilter}</span>
                <button
                  type="button"
                  onClick={() => setTypeFilter('All')}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <X size={11} />
                </button>
              </span>
            )}

            {/* Score Chip */}
            {minScoreFilter > 0 && (
              <span
                style={{
                  background: 'var(--md-sys-color-surface-container-high)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  borderRadius: '999px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  color: '#ffeb3b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>Score: ★ {minScoreFilter.toFixed(1)}+</span>
                <button
                  type="button"
                  onClick={() => setMinScoreFilter(0)}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <X size={11} />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main Results View */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: '12px', color: 'var(--md-sys-color-primary)' }}>
          <Loader2 size={32} className="spin-animation" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--md-sys-color-on-surface-variant)' }}>
            Retrieving anime catalog from AniList GraphQL with omission filters...
          </span>
        </div>
      ) : animeList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', background: 'var(--md-sys-color-surface-container)', borderRadius: '24px', border: '1px solid var(--md-sys-color-outline-variant)' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
            No anime matched your search & omission criteria
          </div>
          <p style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '20px', maxWidth: '480px', margin: '0 auto 20px auto' }}>
            Try removing omitted genres, selecting a different demographic or release season, or broadening your search terms.
          </p>
          <button
            onClick={resetFilters}
            className="section-btn"
            style={{ margin: '0 auto' }}
          >
            <RotateCcw size={14} />
            <span>Reset All Search & Omission Filters</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <>
          <div className="posters-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: '16px' }}>
            {animeList.map(anime => (
              <div
                key={anime.id}
                className="poster-card"
                onClick={() => setSelectedAnime(anime)}
                style={{ cursor: 'pointer' }}
              >
                <div className="poster-img-wrap">
                  <img src={anime.poster} alt={anime.title} className="poster-img" loading="lazy" />
                  
                  {/* Top Badges */}
                  <span className="poster-badge-type" style={{ fontSize: '10px', padding: '2px 6px', fontWeight: 700 }}>
                    {anime.type}
                  </span>
                  <span className="poster-badge-rating">
                    <Star size={10} fill="#ffeb3b" color="#ffeb3b" />
                    {anime.rating.toFixed(1)}
                  </span>

                  {/* Play Overlay */}
                  <button
                    className="poster-overlay-play"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPlayer(anime);
                    }}
                    title="Stream Episode 01"
                  >
                    <Play size={16} fill="currentColor" />
                  </button>
                </div>

                <div className="poster-info">
                  <div className="poster-title" title={anime.title}>{anime.title}</div>
                  <div className="poster-meta">
                    <span style={{ color: 'var(--md-sys-color-primary)', fontWeight: 600 }}>
                      {anime.season || anime.year}
                    </span>
                    <span>
                      {anime.type === 'Movie' ? 'Movie' : anime.episodesCount ? `${anime.episodesCount} eps` : 'TBA'}
                    </span>
                  </div>

                  {/* Mini genre tags */}
                  {anime.genres && anime.genres.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {anime.genres.slice(0, 2).map(g => (
                        <span
                          key={g}
                          style={{
                            fontSize: '9px',
                            fontWeight: 600,
                            color: 'var(--md-sys-color-on-surface-variant)',
                            background: 'var(--md-sys-color-surface-container-high)',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {g}
                        </span>
                      ))}
                      {anime.genres.length > 2 && (
                        <span style={{ fontSize: '9px', color: 'var(--md-sys-color-on-surface-variant)', opacity: 0.6 }}>
                          +{anime.genres.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Load More Button */}
          {hasNextPage && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '32px' }}>
              <button
                className="section-btn"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                style={{ padding: '10px 32px', fontSize: '13px', background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', borderColor: 'var(--md-sys-color-primary)' }}
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 size={14} className="spin-animation" />
                    <span>Loading more titles...</span>
                  </>
                ) : (
                  <span>Load More Titles</span>
                )}
              </button>
            </div>
          )}
        </>
      ) : (
        /* DETAILED LIST VIEW */
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {animeList.map(anime => (
              <div
                key={anime.id}
                onClick={() => setSelectedAnime(anime)}
                style={{
                  display: 'flex',
                  gap: '18px',
                  background: 'var(--md-sys-color-surface-container)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  borderRadius: '20px',
                  padding: '16px',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, border-color 0.15s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--md-sys-color-primary)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--md-sys-color-outline-variant)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* Poster Thumbnail */}
                <div style={{ width: '100px', height: '145px', flexShrink: 0, borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>
                  <img src={anime.poster} alt={anime.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  <span
                    style={{
                      position: 'absolute',
                      top: '6px',
                      left: '6px',
                      background: 'rgba(0, 0, 0, 0.75)',
                      backdropFilter: 'blur(4px)',
                      color: '#fff',
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '6px'
                    }}
                  >
                    {anime.type}
                  </span>
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    {/* Title & Rating */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                      <div>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>
                          {anime.title}
                        </h3>
                        {anime.romajiTitle && anime.romajiTitle !== anime.title && (
                          <div style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '8px' }}>
                            {anime.romajiTitle}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 235, 59, 0.15)', border: '1px solid rgba(255, 235, 59, 0.3)', borderRadius: '8px', padding: '3px 8px', flexShrink: 0 }}>
                        <Star size={12} fill="#ffeb3b" color="#ffeb3b" />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffeb3b' }}>
                          {anime.rating.toFixed(1)}
                        </span>
                      </div>
                    </div>

                    {/* Meta Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--md-sys-color-primary)', background: 'var(--md-sys-color-surface-container-high)', padding: '2px 8px', borderRadius: '6px' }}>
                        {anime.season || anime.year}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--md-sys-color-on-surface-variant)', background: 'var(--md-sys-color-surface-container-high)', padding: '2px 8px', borderRadius: '6px' }}>
                        {anime.type === 'Movie' ? 'Full Movie' : `${anime.episodesCount} Episodes`}
                      </span>
                      <span style={{ fontSize: '11px', color: anime.status === 'Airing' ? '#4caf50' : '#aaa', background: 'var(--md-sys-color-surface-container-high)', padding: '2px 8px', borderRadius: '6px' }}>
                        {anime.status}
                      </span>
                      {anime.studio && (
                        <span style={{ fontSize: '11px', color: 'var(--md-sys-color-on-surface-variant)' }}>
                          Studio: <strong>{anime.studio}</strong>
                        </span>
                      )}
                    </div>

                    {/* Synopsis */}
                    <p style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '10px' }}>
                      {anime.synopsis || 'No synopsis available.'}
                    </p>
                  </div>

                  {/* Genres & Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {anime.genres.slice(0, 5).map(g => (
                        <span
                          key={g}
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            color: includedGenres.includes(g) ? '#4caf50' : 'var(--md-sys-color-on-surface-variant)',
                            background: includedGenres.includes(g) ? 'rgba(76, 175, 80, 0.15)' : 'var(--md-sys-color-surface-container-high)',
                            border: `1px solid ${includedGenres.includes(g) ? '#4caf50' : 'var(--md-sys-color-outline-variant)'}`,
                            borderRadius: '999px',
                            padding: '2px 8px'
                          }}
                        >
                          {g}
                        </span>
                      ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openPlayer(anime);
                        }}
                        style={{
                          background: 'var(--md-sys-color-primary)',
                          color: 'var(--md-sys-color-on-primary)',
                          border: 'none',
                          borderRadius: '10px',
                          padding: '6px 14px',
                          fontSize: '12px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        <Play size={12} fill="currentColor" />
                        <span>Stream Now</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Load More Button */}
          {hasNextPage && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '32px' }}>
              <button
                className="section-btn"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                style={{ padding: '10px 32px', fontSize: '13px', background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', borderColor: 'var(--md-sys-color-primary)' }}
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 size={14} className="spin-animation" />
                    <span>Loading more titles...</span>
                  </>
                ) : (
                  <span>Load More Titles</span>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
