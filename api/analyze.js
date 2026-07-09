// Unique 99 backend analyze route for Vercel.
// This route batches Scryfall lookups using /cards/collection to reduce browser requests.
// It is intentionally dependency-free so it works in a simple static Vercel project.

const SCRYFALL_COLLECTION_URL = "https://api.scryfall.com/cards/collection";
const SCRYFALL_NAMED_URL = "https://api.scryfall.com/cards/named";
const SCRYFALL_SEARCH_URL = "https://api.scryfall.com/cards/search";

const MAX_COLLECTION_BATCH = 75;

const memoryCache = globalThis.__u99Cache || new Map();
globalThis.__u99Cache = memoryCache;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cacheGet(key) {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expires) {
    memoryCache.delete(key);
    return null;
  }
  return item.value;
}

function cacheSet(key, value, ttlMs = 1000 * 60 * 60 * 12) {
  memoryCache.set(key, {
    value,
    expires: Date.now() + ttlMs
  });
}

function normalizeName(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .replace(/\s\/\/\s.*/, "")
    .trim();
}

function parseDecklist(input) {
  const lines = String(input || "").split(/\r?\n/);
  const cards = [];
  let commander = "";

  for (const raw of lines) {
    let line = raw.trim();
    if (!line) continue;

    if (/^(commander|general)\s*:/i.test(line)) {
      commander = line.replace(/^(commander|general)\s*:/i, "").trim();
      continue;
    }

    line = line.replace(/\s+#.*$/, "").trim();
    line = line.replace(/\s+\*.*?\*$/g, "").trim();

    if (/^(deck|sideboard|maybeboard|commander)$/i.test(line)) continue;

    const match = line.match(/^(\d+)\s+(.+?)(?:\s+\([A-Z0-9]+\).*)?$/i);
    if (!match) continue;

    const quantity = Math.max(1, parseInt(match[1], 10));
    let name = normalizeName(match[2]);
    name = name.replace(/\s+\d+[a-z]?$/i, "").trim();

    if (!name) continue;
    cards.push({ quantity, name });
  }

  return { commander, cards };
}

function getCardText(card) {
  const parts = [card.oracle_text || "", card.type_line || ""];
  if (Array.isArray(card.card_faces)) {
    card.card_faces.forEach(face => {
      parts.push(face.oracle_text || "");
      parts.push(face.type_line || "");
    });
  }
  return parts.join(" ");
}

function interpolateScore(rank, minRank, maxRank, minScore, maxScore) {
  if (maxRank === minRank) return minScore;
  const ratio = (rank - minRank) / (maxRank - minRank);
  return Math.round(minScore + ratio * (maxScore - minScore));
}

function scoreFromRank(rank) {
  if (!rank) {
    return {
      category: "Unique Sleepers",
      points: 95,
      bucket: "Unique Sleepers"
    };
  }

  if (rank <= 500) {
    return {
      category: "Commander Staples",
      points: interpolateScore(rank, 1, 500, 1, 15),
      bucket: "Commander Staples"
    };
  }

  if (rank <= 2500) {
    return {
      category: "Commander Favorites",
      points: interpolateScore(rank, 501, 2500, 16, 35),
      bucket: "Commander Favorites"
    };
  }

  if (rank <= 8000) {
    return {
      category: "Playables",
      points: interpolateScore(rank, 2501, 8000, 36, 55),
      bucket: "Playables"
    };
  }

  if (rank <= 16000) {
    return {
      category: "Pet Cards",
      points: interpolateScore(rank, 8001, 16000, 56, 75),
      bucket: "Pet Cards"
    };
  }

  return {
    category: "Unique Sleepers",
    points: interpolateScore(Math.min(rank, 31000), 16001, 31000, 76, 95),
    bucket: "Unique Sleepers"
  };
}

function isBasicLand(card) {
  return Boolean(card.type_line && card.type_line.includes("Basic Land"));
}

function getPrimaryName(card) {
  return normalizeName(card.name || "");
}

async function fetchNamedCard(name) {
  const key = `named:${name.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const url = `${SCRYFALL_NAMED_URL}?fuzzy=${encodeURIComponent(name)}`;
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Unique99/1.0"
    }
  });

  if (!response.ok) return null;
  const card = await response.json();
  cacheSet(key, card);
  await sleep(80);
  return card;
}

async function fetchCollectionByNames(names) {
  const results = new Map();
  const missing = [];

  const uncached = [];

  for (const name of names) {
    const key = `card:${name.toLowerCase()}`;
    const cached = cacheGet(key);
    if (cached) {
      results.set(name.toLowerCase(), cached);
    } else {
      uncached.push(name);
    }
  }

  for (let i = 0; i < uncached.length; i += MAX_COLLECTION_BATCH) {
    const batch = uncached.slice(i, i + MAX_COLLECTION_BATCH);

    const response = await fetch(SCRYFALL_COLLECTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Unique99/1.0"
      },
      body: JSON.stringify({
        identifiers: batch.map(name => ({ name }))
      })
    });

    if (!response.ok) {
      batch.forEach(name => missing.push(name));
      continue;
    }

    const data = await response.json();

    (data.data || []).forEach(card => {
      const foundName = normalizeName(card.name).toLowerCase();
      const searchMatch = batch.find(name => {
        const n = name.toLowerCase();
        return foundName === n || foundName.startsWith(`${n} //`) || n.startsWith(foundName);
      });

      if (searchMatch) {
        results.set(searchMatch.toLowerCase(), card);
        cacheSet(`card:${searchMatch.toLowerCase()}`, card);
      }
    });

    (data.not_found || []).forEach(item => {
      if (item && item.name) missing.push(item.name);
    });

    await sleep(90);
  }

  return { results, missing };
}

function getFallbackDeckColors(cards) {
  const colors = new Set();
  cards.forEach(card => {
    (card.color_identity || []).forEach(color => colors.add(color));
  });
  return [...colors];
}

const THEME_KEYWORDS = [
  { key: "damage", terms: ["damage", "deals damage", "noncombat damage", "double"], query: "damage" },
  { key: "discard", terms: ["discard", "draw then discard"], query: "discard" },
  { key: "draw", terms: ["draw a card", "draw cards", "card draw"], query: "draw" },
  { key: "treasure", terms: ["treasure"], query: "treasure" },
  { key: "attack", terms: ["attack", "attacks", "combat"], query: "attack" },
  { key: "copy", terms: ["copy", "copies", "token that's a copy"], query: "copy" },
  { key: "sacrifice", terms: ["sacrifice", "dies", "death"], query: "sacrifice" },
  { key: "graveyard", terms: ["graveyard", "return from your graveyard"], query: "graveyard" },
  { key: "tokens", terms: ["token", "tokens"], query: "token" },
  { key: "artifacts", terms: ["artifact", "artifacts"], query: "artifact" },
  { key: "spells", terms: ["instant", "sorcery", "cast"], query: "instant" },
  { key: "counters", terms: ["counter", "counters", "+1/+1"], query: "counter" },
  { key: "lifegain", terms: ["gain life", "lifelink"], query: "life" }
];

function getDeckText(cards, commanderCard) {
  const pieces = [];
  if (commanderCard) pieces.push(getCardText(commanderCard));
  cards.forEach(card => pieces.push(getCardText(card)));
  return pieces.join(" ").toLowerCase();
}

function getDeckThemes(cards, commanderCard) {
  const text = getDeckText(cards, commanderCard);
  const scored = THEME_KEYWORDS.map(theme => {
    const count = theme.terms.reduce((sum, term) => {
      return sum + (text.split(term.toLowerCase()).length - 1);
    }, 0);
    return { ...theme, count };
  }).filter(theme => theme.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  return scored.length ? scored : [{ key: "value", terms: ["draw", "damage", "token"], query: "draw" }];
}

function countThemeMatches(card, themes) {
  const text = getCardText(card).toLowerCase();
  let matches = 0;
  themes.forEach(theme => {
    if (theme.terms.some(term => text.includes(term.toLowerCase()))) {
      matches += 1;
    }
  });
  return matches;
}

function clampScore(value) {
  return Math.max(1, Math.min(100, Math.round(value)));
}

function applyCommanderAwareScores(cards, commanderCard) {
  const themes = getDeckThemes(cards, commanderCard);
  const colors = commanderCard && Array.isArray(commanderCard.color_identity) && commanderCard.color_identity.length
    ? commanderCard.color_identity
    : getFallbackDeckColors(cards);

  cards.forEach(card => {
    const base = card.base_points || card.points;
    const themeMatches = countThemeMatches(card, themes);
    const colorMatches = !colors.length || (Array.isArray(card.color_identity) && card.color_identity.every(color => colors.includes(color)));
    let adjustment = Math.min(10, themeMatches * 4);

    if (colorMatches) adjustment += 2;
    if (!themeMatches && card.category === "Commander Staples") adjustment -= 2;

    card.points = clampScore(base + adjustment);
    card.mode_note = themeMatches
      ? `Matches ${themeMatches} detected deck theme${themeMatches === 1 ? "" : "s"}.`
      : "No major theme match detected.";
  });
}

function colorQueryForSuggestions(cards, commanderCard) {
  const colors = commanderCard && Array.isArray(commanderCard.color_identity) && commanderCard.color_identity.length
    ? commanderCard.color_identity
    : getFallbackDeckColors(cards);

  return colors.length ? `id<=${colors.join("")}` : "";
}

async function searchSuggestionCards(query) {
  const key = `search:${query}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const url = `${SCRYFALL_SEARCH_URL}?order=edhrec&unique=cards&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Unique99/1.0"
    }
  });

  if (!response.ok) return [];
  const data = await response.json();
  const results = (data.data || []).slice(0, 18);
  cacheSet(key, results, 1000 * 60 * 60 * 6);
  await sleep(90);
  return results;
}

function suggestionReason(card, themes) {
  const text = getCardText(card).toLowerCase();
  const matches = themes
    .filter(theme => theme.terms.some(term => text.includes(term.toLowerCase())))
    .map(theme => theme.key);

  if (matches.length) {
    return `Matches your deck's ${matches.slice(0, 2).join(" + ")} theme${matches.length > 1 ? "s" : ""}.`;
  }

  return "Fits your color identity and may be worth testing.";
}

async function buildSuggestions(cards, commanderCard) {
  const existing = new Set(cards.map(card => card.name.toLowerCase()));
  const themes = getDeckThemes(cards, commanderCard);
  const colorQuery = colorQueryForSuggestions(cards, commanderCard);
  const candidates = new Map();

  const synergyQueries = themes.slice(0, 4).map(theme => {
    return `legal:commander ${colorQuery} -t:basic -is:funny o:"${theme.query}"`.trim();
  });

  const uniqueQueries = themes.slice(0, 4).map(theme => {
    return `legal:commander ${colorQuery} -t:basic -is:funny o:"${theme.query}" edhrec>=8000`.trim();
  });

  const fallbackUniqueQueries = themes.slice(0, 4).map(theme => {
    return `legal:commander ${colorQuery} -t:basic -is:funny o:"${theme.query}"`.trim();
  });

  const addCandidate = (card, sourceType) => {
    if (!card || !card.name) return;
    if (existing.has(card.name.toLowerCase())) return;
    if (card.type_line && card.type_line.includes("Basic Land")) return;

    const rankScore = scoreFromRank(card.edhrec_rank);
    const tempCard = {
      name: card.name,
      edhrec_rank: card.edhrec_rank || null,
      type_line: card.type_line || "",
      oracle_text: card.oracle_text || "",
      color_identity: card.color_identity || [],
      scryfall_uri: card.scryfall_uri || "#"
    };

    const matches = countThemeMatches(tempCard, themes);
    if (matches < 1) return;

    const isStaple = rankScore.category === "Commander Staples";
    const isFavorite = rankScore.category === "Commander Favorites";

    const synergyScore = matches * 30
      + Math.min(18, rankScore.points / 4)
      + (sourceType === "unique" ? 12 : 0)
      - (isStaple ? 28 : 0)
      - (isFavorite ? 12 : 0);

    const current = candidates.get(card.name);
    const prepared = {
      ...tempCard,
      points: rankScore.points,
      category: rankScore.category,
      synergyScore,
      themeMatches: matches,
      reason: suggestionReason(tempCard, themes),
      sourceType
    };

    if (!current || prepared.synergyScore > current.synergyScore) {
      candidates.set(card.name, prepared);
    }
  };

  for (const query of synergyQueries) {
    const results = await searchSuggestionCards(query);
    results.forEach(card => addCandidate(card, "synergy"));
  }

  for (const query of uniqueQueries) {
    const results = await searchSuggestionCards(query);
    results.forEach(card => addCandidate(card, "unique"));
  }

  const scored = [...candidates.values()];

  // If the deep-rank searches return too little, use the normal search pool but still enforce unique thresholds.
  if (scored.filter(card => card.points >= 55).length < 3) {
    for (const query of fallbackUniqueQueries) {
      const results = await searchSuggestionCards(query);
      results.forEach(card => addCandidate(card, "fallback"));
    }
  }

  const allScored = [...candidates.values()];

  const synergy = [...allScored]
    .filter(card => {
      if (card.category === "Commander Staples") return card.themeMatches >= 3 && card.points >= 12;
      if (card.category === "Commander Favorites") return card.themeMatches >= 2 && card.points >= 24;
      return card.themeMatches >= 1 && card.points >= 36;
    })
    .sort((a, b) => b.synergyScore - a.synergyScore || b.points - a.points)
    .slice(0, 5);

  const unique = [...allScored]
    .filter(card => card.points >= 55)
    .filter(card => card.category !== "Commander Staples" && card.category !== "Commander Favorites")
    .sort((a, b) => b.points - a.points || b.themeMatches - a.themeMatches || b.synergyScore - a.synergyScore)
    .slice(0, 5);

  const commonCards = [...cards]
    .filter(card => card.edhrec_rank && card.points <= 35)
    .sort((a, b) => a.points - b.points || a.edhrec_rank - b.edhrec_rank);

  const swapPool = [...unique]
    .filter(card => card.points >= 70)
    .sort((a, b) => b.points - a.points || b.synergyScore - a.synergyScore);

  const swaps = [];
  const usedAdds = new Set();

  for (const cut of commonCards) {
    const add = swapPool.find(candidate => {
      if (usedAdds.has(candidate.name)) return false;
      if ((candidate.points - cut.points) < 35) return false;
      return true;
    });

    if (!add) continue;

    usedAdds.add(add.name);
    swaps.push({
      cut,
      add,
      note: `${add.reason} This is shown because it is much more unique than ${cut.name}, not because it is automatically stronger.`
    });

    if (swaps.length >= 5) break;
  }

  return { synergy, unique, swaps };
}

function buildDeckStats(cards, missing) {
  const nonBasic = cards.filter(card => !isBasicLand(card));
  const average = nonBasic.length
    ? nonBasic.reduce((sum, card) => sum + card.points, 0) / nonBasic.length
    : 0;

  const stapleCount = nonBasic.filter(card => card.points <= 20).length;
  const deepCount = nonBasic.filter(card => card.points >= 76).length;
  const noRankCount = nonBasic.filter(card => card.category === "Unique Sleepers").length;

  const staplePct = nonBasic.length ? stapleCount / nonBasic.length : 0;
  const deepPct = nonBasic.length ? deepCount / nonBasic.length : 0;

  let score = Math.round(average);
  if (staplePct > 0.35) score -= 4;
  if (deepPct > 0.25) score += 3;
  if (noRankCount >= 3) score += 2;

  score = clampScore(score);

  return {
    score,
    average,
    staplePct,
    deepPct,
    totalCards: cards.reduce((sum, card) => sum + (card.quantity || 1), 0),
    uniqueCards: cards.length,
    nonBasicCount: nonBasic.length,
    missedCount: missing.length
  };
}

function slimCard(card, quantity) {
  const scoring = scoreFromRank(card.edhrec_rank);
  return {
    quantity,
    name: card.name,
    type_line: card.type_line || "",
    oracle_text: card.oracle_text || "",
    color_identity: card.color_identity || [],
    edhrec_rank: card.edhrec_rank || null,
    scryfall_uri: card.scryfall_uri || "#",
    image_uris: card.image_uris || null,
    card_faces: card.card_faces || null,
    points: scoring.points,
    base_points: scoring.points,
    category: scoring.category,
    bucket: scoring.bucket
  };
}

function uniqueNames(cards) {
  const seen = new Set();
  const output = [];

  cards.forEach(card => {
    const clean = normalizeName(card.name);
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      output.push(clean);
    }
  });

  return output;
}


function mergeCommanderCards(cards) {
  const valid = (cards || []).filter(Boolean);
  if (!valid.length) return null;

  const colorSet = new Set();
  const textParts = [];
  const typeParts = [];

  valid.forEach(card => {
    (card.color_identity || []).forEach(color => colorSet.add(color));
    textParts.push(getCardText(card));
    if (card.type_line) typeParts.push(card.type_line);
  });

  return {
    name: valid.map(card => card.name).join(" + "),
    color_identity: [...colorSet],
    oracle_text: textParts.join("\n"),
    type_line: typeParts.join(" / ")
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { decklist = "", commander = "", compareMode = "global", partnerCommanders = [] } = req.body || {};
    const parsed = parseDecklist(decklist);

    const commanderName = normalizeName(commander || parsed.commander);
    let commanderCard = null;

    if (commanderName) {
      commanderCard = await fetchNamedCard(commanderName);
    }

    const partnerNames = Array.isArray(partnerCommanders)
      ? partnerCommanders.map(normalizeName).filter(Boolean).slice(0, 2)
      : [];

    const partnerCards = [];
    for (const partnerName of partnerNames) {
      const partnerCard = await fetchNamedCard(partnerName);
      if (partnerCard) partnerCards.push(partnerCard);
    }

    const commanderContext = mergeCommanderCards([commanderCard, ...partnerCards]);

    const names = uniqueNames(parsed.cards);
    const quantityByName = new Map();

    parsed.cards.forEach(card => {
      const key = normalizeName(card.name).toLowerCase();
      quantityByName.set(key, (quantityByName.get(key) || 0) + card.quantity);
    });

    const { results, missing } = await fetchCollectionByNames(names);

    const cards = names.map(name => {
      const card = results.get(name.toLowerCase());
      if (!card) return null;
      const quantity = quantityByName.get(name.toLowerCase()) || 1;
      return slimCard(card, quantity);
    }).filter(Boolean);

    const missingSet = new Set(missing.map(name => name.toLowerCase()));
    names.forEach(name => {
      if (!results.has(name.toLowerCase())) missingSet.add(name.toLowerCase());
    });

    const missingList = [...missingSet].map(name => ({ name }));

    if (compareMode === "commanderAware") {
      applyCommanderAwareScores(cards, commanderContext);
    }

    const suggestions = await buildSuggestions(cards, commanderContext);
    const stats = buildDeckStats(cards, missingList);

    return res.status(200).json({
      ok: true,
      parsedCommander: commanderName || parsed.commander || "",
      commanderCard,
      partnerCards,
      partnerCommanders: partnerNames,
      cards,
      missing: missingList,
      stats,
      suggestions,
      compareMode,
      source: "backend"
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Analysis failed"
    });
  }
}
