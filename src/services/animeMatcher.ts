/**
 * Anime Title, Season & Media Disambiguation Engine
 * Accurately pairs AniList/AniDB metadata with streaming CDN & RSS release titles
 */

export interface SeasonInfo {
  seasonNum: number;
  partNum?: number;
  courNum?: number;
  isMovie: boolean;
  isOva: boolean;
  isSpecial: boolean;
  arcName?: string;
}

export class AnimeMatcher {
  /**
   * Normalize roman numerals to arabic numbers in anime titles
   */
  public static normalizeNumerals(text: string): string {
    return text
      .replace(/\bIV\b/g, '4')
      .replace(/\bIII\b/g, '3')
      .replace(/\bII\b/g, '2')
      .replace(/\bI\b/g, '1')
      .replace(/\bVI\b/g, '6')
      .replace(/\bV\b/g, '5');
  }

  /**
   * Extract season, part, and media format characteristics from any anime title
   */
  public static extractSeasonInfo(title: string): SeasonInfo {
    const clean = this.normalizeNumerals(title || '');
    let seasonNum = 1;
    let partNum: number | undefined = undefined;
    let courNum: number | undefined = undefined;
    const isMovie = /\b(movie|film|gekijouban|the movie)\b/i.test(clean);
    const isOva = /\b(ova|oad|special|specials)\b/i.test(clean);
    const isSpecial = /\b(special|sp|side story|preview)\b/i.test(clean);

    // 1. Explicit Season pattern: "Season 2", "2nd Season", "S2", "S02", "2nd Cour"
    const sMatch = clean.match(/\b(?:season\s*|s)(\d+)\b/i) ||
                   clean.match(/\b(\d+)(?:nd|rd|th|st)\s*season\b/i) ||
                   clean.match(/\bseason\s*([a-z]+)\b/i);

    if (sMatch) {
      const parsed = parseInt(sMatch[1], 10);
      if (!isNaN(parsed) && parsed > 0) {
        seasonNum = parsed;
      }
    } else if (/\bfinal\s+season\b/i.test(clean)) {
      seasonNum = 4; // Final seasons usually map to 4 (e.g. AoT)
    }

    // 2. Part / Cour pattern: "Part 2", "Part 3", "2nd Cour"
    const pMatch = clean.match(/\bpart\s*(\d+)\b/i) || clean.match(/\b(\d+)(?:nd|rd|th|st)\s*part\b/i);
    if (pMatch) {
      const parsed = parseInt(pMatch[1], 10);
      if (!isNaN(parsed) && parsed > 0) partNum = parsed;
    }

    const cMatch = clean.match(/\b(?:cour\s*(\d+)|(\d+)(?:nd|rd|th|st)\s*cour)\b/i);
    if (cMatch) {
      const parsed = parseInt(cMatch[1] || cMatch[2], 10);
      if (!isNaN(parsed) && parsed > 0) courNum = parsed;
    }

    // 3. Known major sub-series / Arc tags
    let arcName: string | undefined = undefined;
    const arcPatterns = [
      /entertainment district/i,
      /swordsmith village/i,
      /hashira training/i,
      /mugen train/i,
      /thousand-year blood war|tybw/i,
      /shibuya incident/i,
      /alicization/i,
      /war of underworld/i,
      /arise from the shadow/i,
      /re:zero.*season/i
    ];

    for (const pat of arcPatterns) {
      if (pat.test(clean)) {
        arcName = pat.source;
        break;
      }
    }

    return { seasonNum, partNum, courNum, isMovie, isOva, isSpecial, arcName };
  }

  /**
   * Clean string for fuzzy token comparison
   */
  public static cleanForComparison(text: string): string {
    return this.normalizeNumerals(text || '')
      .toLowerCase()
      .replace(/[\(\)\[\]\{\}\:\-\_\!\?\.\,\'\"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Tokenize string into meaningful keywords
   */
  public static getKeywords(text: string): string[] {
    const cleaned = this.cleanForComparison(text);
    return cleaned
      .split(' ')
      .filter(w => w.length >= 2 && !['the', 'of', 'in', 'and', 'no', 'to', 'a', 'an', 'tv', 'hd'].includes(w));
  }

  /**
   * Calculate exact matching score between target AnimeItem and candidate search result
   */
  public static calculateMatchScore(
    target: {
      title: string;
      englishTitle?: string;
      romajiTitle?: string;
      type?: string;
      season?: string;
      year?: number;
    },
    candidateTitle: string,
    candidateSubOrDub?: string,
    requestedAudioMode: 'sub' | 'dub' | 'dual' | 'all' = 'all'
  ): number {
    if (!candidateTitle) return -1000;

    const targetTitles = [
      target.title,
      target.englishTitle,
      target.romajiTitle
    ].filter(Boolean) as string[];

    const candidateNorm = this.cleanForComparison(candidateTitle);
    const candidateKeywords = new Set(this.getKeywords(candidateTitle));
    const targetSeasonInfo = this.extractSeasonInfo(target.title || target.romajiTitle || '');
    const candidateSeasonInfo = this.extractSeasonInfo(candidateTitle);

    let highestTitleScore = 0;

    for (const rawTarget of targetTitles) {
      const targetNorm = this.cleanForComparison(rawTarget);
      const targetKeywords = this.getKeywords(rawTarget);

      // Exact match
      if (targetNorm === candidateNorm) {
        highestTitleScore = Math.max(highestTitleScore, 1000);
        continue;
      }

      // Exact substring match
      if (candidateNorm.includes(targetNorm) || targetNorm.includes(candidateNorm)) {
        const ratio = Math.min(targetNorm.length, candidateNorm.length) / Math.max(targetNorm.length, candidateNorm.length);
        highestTitleScore = Math.max(highestTitleScore, 500 + ratio * 300);
      }

      // Keyword overlap (Jaccard / Overlap coefficient)
      let matches = 0;
      for (const kw of targetKeywords) {
        if (candidateKeywords.has(kw) || candidateNorm.includes(kw)) {
          matches++;
        }
      }

      if (targetKeywords.length > 0) {
        const keywordRatio = matches / targetKeywords.length;
        highestTitleScore = Math.max(highestTitleScore, keywordRatio * 450);
      }
    }

    let finalScore = highestTitleScore;

    // --- Season consistency evaluation (Crucial to prevent Season 1 vs Season 2 mismatches) ---
    if (targetSeasonInfo.seasonNum > 1 || candidateSeasonInfo.seasonNum > 1) {
      if (targetSeasonInfo.seasonNum === candidateSeasonInfo.seasonNum) {
        finalScore += 250; // Correct season bonus
      } else {
        // Target wants e.g. Season 2, but candidate is Season 1 or Season 3
        finalScore -= 500; // Strong penalty for wrong season
      }
    }

    // Part number consistency
    if (targetSeasonInfo.partNum && candidateSeasonInfo.partNum) {
      if (targetSeasonInfo.partNum === candidateSeasonInfo.partNum) {
        finalScore += 150;
      } else {
        finalScore -= 300;
      }
    }

    // Movie vs TV format consistency
    const targetIsMovie = target.type === 'Movie' || targetSeasonInfo.isMovie;
    if (targetIsMovie) {
      if (candidateSeasonInfo.isMovie) finalScore += 200;
      else finalScore -= 150;
    } else {
      if (candidateSeasonInfo.isMovie) finalScore -= 350; // Target is TV series, candidate is Movie
    }

    // Sub vs Dub affinity
    if (requestedAudioMode === 'dub') {
      const isDub = candidateSubOrDub === 'dub' || /\bdub\b|\bdubbed\b/i.test(candidateTitle);
      if (isDub) finalScore += 100;
    } else if (requestedAudioMode === 'sub') {
      const isDub = candidateSubOrDub === 'dub' || /\b\(dub\)\b/i.test(candidateTitle);
      if (!isDub) finalScore += 50;
    }

    return finalScore;
  }

  /**
   * Select the best candidate from a search result list with safety threshold
   */
  public static pickBestMatch<T extends { title: string; subOrDub?: 'sub' | 'dub'; [key: string]: any }>(
    target: {
      title: string;
      englishTitle?: string;
      romajiTitle?: string;
      type?: string;
      season?: string;
      year?: number;
    },
    candidates: T[],
    requestedAudioMode: 'sub' | 'dub' | 'dual' | 'all' = 'all'
  ): { match: T | null; score: number } {
    if (!candidates || candidates.length === 0) {
      return { match: null, score: 0 };
    }

    let bestScore = -Infinity;
    let bestCandidate: T | null = null;

    for (const cand of candidates) {
      const score = this.calculateMatchScore(target, cand.title, cand.subOrDub, requestedAudioMode);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = cand;
      }
    }

    // Only accept matches that meet the minimum confidence threshold
    if (bestScore >= 180 && bestCandidate) {
      return { match: bestCandidate, score: bestScore };
    }

    return { match: candidates[0] || null, score: bestScore };
  }
}
