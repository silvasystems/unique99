// Unique 99: Commander deck uniqueness scoring.
// Everything runs in the browser. Cards are looked up in batches of 75 with
// Scryfall's /cards/collection endpoint, so a full 100-card deck needs only
// one or two requests instead of one request per card.

(() => {
  "use strict";

  const SCRYFALL = "https://api.scryfall.com";
  const BATCH_SIZE = 75;
  const REQUEST_GAP_MS = 110;
  const CACHE_KEY = "u99-card-cache-v2";
  const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
  const EDHREC = "https://json.edhrec.com/pages/commanders";
  const EDH_CACHE_PREFIX = "u99-edh-v1:";
  const EDH_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
  const HISTORY_KEY = "u99-history-v1";
  const HISTORY_MAX = 24;
  const SCORE_VERSION = 2;
  const SITE_URL = "unique99-github-io.vercel.app";

  // Score bands: label, ring colors.
  const BANDS = [
    { lo: 0, hi: 20, name: "Netdeck Energy", color: "#94a3b8", color2: "#e2e8f0" },
    { lo: 21, hi: 40, name: "Staple Heavy", color: "#38bdf8", color2: "#bae6fd" },
    { lo: 41, hi: 60, name: "Balanced Brew", color: "#6d8cff", color2: "#93c5fd" },
    { lo: 61, hi: 80, name: "Unique Brew", color: "#b57bff", color2: "#e9d5ff" },
    { lo: 81, hi: 100, name: "Certified Jank Genius", color: "#fbbf24", color2: "#fef3c7" }
  ];

  // Page accent per commander color (WUBRG order, colorless last).
  const COLOR_THEME = {
    W: "#f3dc9b",
    U: "#60a5fa",
    B: "#b39dfa",
    R: "#fb7c6a",
    G: "#4ade80",
    C: "#cbd5e1"
  };

  // Chart series colors, validated for CVD separation on the dark panel.
  const CHART_YOU = "#4f8ff0";
  const CHART_AVG = "#b98516";

  const CATEGORIES = [
    { name: "Commander Staples", cls: "cat-staples", bonus: -2 },
    { name: "Commander Favorites", cls: "cat-favorites", bonus: -1 },
    { name: "Playables", cls: "cat-playables", bonus: 0 },
    { name: "Pet Cards", cls: "cat-pets", bonus: 2 },
    { name: "Unique Sleepers", cls: "cat-sleepers", bonus: 3 }
  ];
  const CATEGORY_BY_NAME = Object.fromEntries(CATEGORIES.map(c => [c.name, c]));

  const TYPE_ORDER = ["Creatures", "Planeswalkers", "Battles", "Instants", "Sorceries", "Artifacts", "Enchantments", "Lands", "Other"];

  const BASIC_LANDS = new Set([
    "plains", "island", "swamp", "mountain", "forest", "wastes",
    "snow-covered plains", "snow-covered island", "snow-covered swamp",
    "snow-covered mountain", "snow-covered forest", "snow-covered wastes"
  ]);

  const MAIN_HEADERS = new Set([
    "deck", "main", "mainboard", "maindeck", "main deck", "the 99", "library",
    "creatures", "creature", "instants", "instant", "sorceries", "sorcery",
    "artifacts", "artifact", "enchantments", "enchantment", "planeswalkers",
    "planeswalker", "battles", "battle", "lands", "land", "ramp", "draw",
    "removal", "other"
  ]);
  const COMMANDER_HEADERS = new Set(["commander", "commanders", "command zone", "general"]);
  const SKIP_HEADERS = new Set([
    "sideboard", "maybeboard", "maybe", "considering", "tokens", "token",
    "companion", "companions", "attractions", "stickers", "acquireboard"
  ]);

  const THEME_KEYWORDS = [
    { key: "damage", terms: ["damage", "deals damage", "noncombat damage", "double"] },
    { key: "discard", terms: ["discard", "draw then discard"] },
    { key: "draw", terms: ["draw a card", "draw cards", "card draw"] },
    { key: "treasure", terms: ["treasure"] },
    { key: "attack", terms: ["attack", "attacks", "combat"] },
    { key: "copy", terms: ["copy", "copies", "token that's a copy"] },
    { key: "sacrifice", terms: ["sacrifice", "dies", "death"] },
    { key: "graveyard", terms: ["graveyard", "return from your graveyard"] },
    { key: "tokens", terms: ["token", "tokens"] },
    { key: "artifacts", terms: ["artifact", "artifacts"] },
    { key: "spells", terms: ["instant", "sorcery", "cast"] },
    { key: "counters", terms: ["counter", "counters", "+1/+1"] },
    { key: "lifegain", terms: ["gain life", "lifelink"] }
  ];

  const SAMPLE_DECK = `Commander
1 Clive, Ifrit's Dominant // Ifrit, Warden of Inferno (FIN) 318

Deck
1 Abrade (TDC) 203
1 Anger (FIC) 289
1 Bitter Reunion (BRO) 127
1 Brash Taunter (MKC) 148
1 Brass's Tunnel-Grinder / Tecutlan, the Searing Rift (LCI) 135
1 Breeches, Eager Pillager (LCI) 294
1 Burning Sun's Avatar (PXLN) 135 *F*
1 Cathartic Reunion (ACR) 94
1 Chain Lightning (DMR) 113
1 Chandra, Heart of Fire (M21) 301
1 Command Tower (MKC) 256
1 Cragganwick Cremator (2XM) 122
1 Crimson Fleet Commodore (CMM) 211
1 Cursed Mirror (WHO) 226
1 Defiler of Instinct (DMU) 119
1 Dragon Mage (SCD) 132
1 Enduring Courage (DSK) 133
1 Etali, Primal Storm (FDN) 194
1 Faithless Looting (UMA) 128
1 Fiery Emancipation (M21) 143
1 Fire Diamond (CMR) 309
1 Firebolt (DDS) 37
1 Forgotten Cave (BLC) 305
1 Frenzied Saddlebrute (PLST) CMR-180
1 Furnace of Rath (TMP) 177
1 Generator Servant (M15) 143
1 Glint-Horn Buccaneer (M20) 141
1 Goblin War Drums (FEM) 58d
1 Imposing Grandeur (VOC) 24
1 Inti, Seneschal of the Sun (LCI) 295
1 Jaxis, the Troublemaker (PSNC) 112p
1 Jaya Ballard (DOM) 132
1 Jaya Ballard, Task Mage (TSR) 172
1 Karlach, Fury of Avernus (CLB) 186
1 Light Up the Stage (DSC) 166
1 Liquimetal Torque (MH2) 428
1 Mana Geyser (TDC) 223
1 Mind Stone (DSC) 248
1 Mishra, Excavation Prodigy (BRO) 140
1 Mizzium Mortars (C15) 163
1 Molten Monstrosity (DMU) 139
1 Monument to Endurance (PDFT) 237p
33 Mountain (J25) 90
1 Myriad Landscape (EOC) 169
1 Neheb, the Eternal (MKC) 158
1 Orthion, Hero of Lavabrink (MOM) 334
1 Overwhelming Surge (TDM) 115
1 Pirate's Pillage (2X2) 120
1 Rage Reflection (DPA) 52
1 Reliquary Tower (WHO) 296
1 Rionya, Fire Dancer (C21) 55
1 Rising of the Day (LTR) 145
1 Rousing Refrain (OTC) 178
1 Ruin Grinder (FIC) 297
1 Scorching Dragonfire (M21) 158
1 Screamer-Killer (40K) 84
1 Scytheclaw Raptor (LCI) 323
1 Seething Song (MRD) 104
1 Self-Destruct (FIN) 157
1 Sol Ring (FIC) 358
1 Suplex (FIN) 164
1 The Fire Crystal (FIN) 135
1 Thrum of the Vestige (FCA) 40
1 Torbran, Thane of Red Fell (PELD) 147s *F*
1 Twinflame (JOU) 115
1 Vandalblast (FIC) 298
1 Visions of Phyrexia (PBRO) 156s *F*`;

  // ---------- DOM ----------

  const $ = id => document.getElementById(id);
  const els = {
    form: $("deckForm"),
    deck: $("deckInput"),
    commander: $("commanderInput"),
    partner: $("partnerCommanderInput"),
    analyze: $("analyzeBtn"),
    sample: $("sampleBtn"),
    clear: $("clearBtn"),
    lineCount: $("lineCount"),
    progress: $("progress"),
    progressFill: $("progressFill"),
    status: $("statusText"),
    formError: $("formError"),
    results: $("results"),
    report: $("report"),
    modal: $("cardModal"),
    hover: $("hoverPreview"),
    loader: $("loader"),
    shareModal: $("shareModal")
  };

  const state = {
    cards: [],
    commanders: [],
    view: "grid",
    modalCard: null,
    modalFace: 0,
    mode: "global",     // scoring mode actually used for the current results
    edh: null,          // EDHREC data for the current commander, if found
    result: null,       // last rendered result, used by share images
    shareBlobs: {}
  };

  // ---------- Small helpers ----------

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatRank(rank) {
    return rank ? `#${rank.toLocaleString()}` : "Unranked";
  }

  function clampScore(value) {
    return Math.max(1, Math.min(100, Math.round(value)));
  }

  function frontFaceName(name) {
    return String(name || "").split(/\s+\/\/?\s+/)[0].trim();
  }

  function nameKey(name) {
    return frontFaceName(name)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[’‘`]/g, "'")
      .toLowerCase();
  }

  function isBasicLand(card) {
    if (!card) return false;
    if (typeof card === "string") return BASIC_LANDS.has(nameKey(card));
    return BASIC_LANDS.has(nameKey(card.name)) || (card.type_line || "").includes("Basic Land");
  }

  // ---------- Decklist parsing ----------

  function headerOf(line) {
    // Matches "Commander", "// Commander", "Commander:", "Creatures (23)", "Sideboard: 15", "## Lands"
    const cleaned = line
      .replace(/^(\/\/|#+|\*+)\s*/, "")
      .replace(/\s*[:\-]?\s*(\(\d+\)|\d+)?\s*:?\s*$/, "")
      .trim()
      .toLowerCase();
    if (COMMANDER_HEADERS.has(cleaned)) return "commander";
    if (SKIP_HEADERS.has(cleaned)) return "skip";
    if (MAIN_HEADERS.has(cleaned)) return "main";
    return null;
  }

  function parseCardLine(raw) {
    let line = raw.trim();
    if (!line) return null;

    line = line.replace(/^SB:\s*/i, "");
    line = line.replace(/\s+#.*$/, "");                 // trailing #tags (Moxfield)
    line = line.replace(/\s*\^[^^]*\^\s*$/, "");        // ^Tag^ (Archidekt)
    line = line.replace(/\s*\[[^\]]*\]\s*$/g, "");      // [Category] (Archidekt)
    line = line.replace(/\s+\*[A-Z]+\*\s*$/i, "");      // *F*, *E* foil markers
    line = line.replace(/\s+\*[A-Z]+\*\s*$/i, "");

    let quantity = 1;
    const qty = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    if (qty) {
      quantity = Math.max(1, parseInt(qty[1], 10));
      line = qty[2];
    }

    let set = null;
    let collectorNumber = null;
    const printing = line.match(/^(.+?)\s+\(([A-Za-z0-9]{2,6})\)(?:\s+([A-Za-z0-9\-★†]+))?\s*$/);
    if (printing) {
      line = printing[1];
      set = printing[2].toLowerCase();
      collectorNumber = printing[3] || null;
    }

    const name = line.replace(/\s+\/\/?\s+/, " // ").trim();
    if (!name || /^\d+$/.test(name)) return null;

    return { name, quantity, set, collectorNumber };
  }

  function parseDecklist(text) {
    const entries = [];
    const commanders = [];
    let section = "main";

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      const header = headerOf(line);
      if (header) {
        section = header;
        continue;
      }
      if (line.startsWith("//") || line.startsWith("#")) continue;
      if (section === "skip") continue;

      const entry = parseCardLine(line);
      if (!entry) continue;

      if (section === "commander") {
        commanders.push(entry);
      } else {
        entries.push(entry);
      }
    }

    return { entries, commanders };
  }

  // ---------- Local cache ----------

  let cacheStore = null;

  function loadCache() {
    if (cacheStore) return cacheStore;
    cacheStore = {};
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) cacheStore = JSON.parse(raw) || {};
      const now = Date.now();
      for (const key of Object.keys(cacheStore)) {
        if (!cacheStore[key] || cacheStore[key].t + CACHE_TTL_MS < now) delete cacheStore[key];
      }
    } catch (error) {
      cacheStore = {};
    }
    return cacheStore;
  }

  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheStore || {}));
    } catch (error) {
      // Storage full or blocked: cache is only a speed-up, so ignore.
    }
  }

  function cacheKeyFor(entry) {
    return entry.set && entry.collectorNumber
      ? `p:${entry.set}:${entry.collectorNumber.toLowerCase()}`
      : `n:${nameKey(entry.name)}`;
  }

  function cacheGet(entry) {
    const hit = loadCache()[cacheKeyFor(entry)];
    return hit ? hit.c : null;
  }

  function cachePut(entry, card) {
    loadCache()[cacheKeyFor(entry)] = { t: Date.now(), c: card };
  }

  // ---------- Scryfall ----------

  async function scryfallFetch(url, options = {}, attempt = 0) {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: "application/json", ...(options.headers || {}) }
    });

    if (response.status === 429 && attempt < 4) {
      const retryAfter = Number(response.headers.get("Retry-After")) || 0;
      await sleep(Math.max(retryAfter * 1000, 600 * (attempt + 1)));
      return scryfallFetch(url, options, attempt + 1);
    }

    return response;
  }

  function imageSet(card) {
    const faces = Array.isArray(card.card_faces) ? card.card_faces : [];
    const fromUris = uris => uris ? {
      small: uris.small,
      normal: uris.normal,
      large: uris.large,
      art: uris.art_crop
    } : null;

    if (card.image_uris) return [fromUris(card.image_uris)];
    const faceImages = faces.map(face => fromUris(face.image_uris)).filter(Boolean);
    return faceImages.length ? faceImages : [];
  }

  function slimCard(card) {
    const faces = Array.isArray(card.card_faces) ? card.card_faces : [];
    const oracle = card.oracle_text || faces.map(f => f.oracle_text || "").join("\n//\n");
    const typeLine = card.type_line || faces.map(f => f.type_line || "").join(" // ");
    const manaCost = card.mana_cost || (faces[0] && faces[0].mana_cost) || "";

    return {
      name: card.name,
      type_line: typeLine,
      oracle_text: oracle,
      mana_cost: manaCost,
      cmc: card.cmc || 0,
      color_identity: card.color_identity || [],
      edhrec_rank: card.edhrec_rank || null,
      scryfall_uri: card.scryfall_uri || `https://scryfall.com/search?q=${encodeURIComponent(card.name)}`,
      set_name: card.set_name || "",
      rarity: card.rarity || "",
      images: imageSet(card),
      faces: faces.map(f => ({ name: f.name, type_line: f.type_line || "", oracle_text: f.oracle_text || "", mana_cost: f.mana_cost || "" }))
    };
  }

  function toIdentifier(entry) {
    if (entry.set && entry.collectorNumber) {
      return { set: entry.set, collector_number: entry.collectorNumber };
    }
    return { name: frontFaceName(entry.name) };
  }

  function identifierMatches(identifier, notFound) {
    return notFound.some(item => {
      if (identifier.name) return item.name && item.name.toLowerCase() === identifier.name.toLowerCase();
      return item.set && item.collector_number
        && item.set.toLowerCase() === identifier.set
        && String(item.collector_number).toLowerCase() === identifier.collector_number.toLowerCase();
    });
  }

  // Looks up entries with /cards/collection. Returns Map(entry -> card) and the entries not found.
  async function fetchCollection(entries, useName, onProgress) {
    const found = new Map();
    const missing = [];

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const identifiers = batch.map(entry => useName ? { name: frontFaceName(entry.name) } : toIdentifier(entry));

      let data = null;
      try {
        const response = await scryfallFetch(`${SCRYFALL}/cards/collection`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifiers })
        });
        if (response.ok) data = await response.json();
      } catch (error) {
        data = null;
      }

      if (!data) {
        missing.push(...batch);
      } else {
        // Scryfall returns found cards in request order, skipping the not-found ones.
        const notFound = data.not_found || [];
        const cards = data.data || [];
        let cursor = 0;
        batch.forEach((entry, index) => {
          if (identifierMatches(identifiers[index], notFound)) {
            missing.push(entry);
          } else if (cursor < cards.length) {
            found.set(entry, cards[cursor++]);
          } else {
            missing.push(entry);
          }
        });
      }

      if (onProgress) onProgress(Math.min(i + BATCH_SIZE, entries.length), entries.length);
      if (i + BATCH_SIZE < entries.length) await sleep(REQUEST_GAP_MS);
    }

    return { found, missing };
  }

  async function fetchFuzzy(entry) {
    try {
      const response = await scryfallFetch(`${SCRYFALL}/cards/named?fuzzy=${encodeURIComponent(frontFaceName(entry.name))}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  // Resolves every entry to a slim card. Tries exact printing, then name, then fuzzy name.
  async function lookupCards(entries, onProgress) {
    const resolved = new Map();
    const pending = [];

    entries.forEach(entry => {
      const cached = cacheGet(entry);
      if (cached) resolved.set(entry, cached);
      else pending.push(entry);
    });

    const total = pending.length || 1;
    const report = (done, label) => onProgress && onProgress(done / total, label);
    report(0, `Looking up ${pending.length} card${pending.length === 1 ? "" : "s"}…`);

    if (pending.length) {
      const first = await fetchCollection(pending, false, (done) => report(done * 0.85, `Looking up cards… ${done}/${pending.length}`));
      first.found.forEach((card, entry) => resolved.set(entry, slimCard(card)));

      // Bad set/collector numbers: retry those by name.
      let missing = first.missing;
      const withPrinting = missing.filter(entry => entry.set && entry.collectorNumber);
      if (withPrinting.length) {
        await sleep(REQUEST_GAP_MS);
        const second = await fetchCollection(withPrinting, true);
        second.found.forEach((card, entry) => resolved.set(entry, slimCard(card)));
        missing = missing.filter(entry => !second.found.has(entry));
      }

      // Typos and odd spellings: fuzzy match one at a time (capped to stay polite).
      const fuzzyTargets = missing.slice(0, 25);
      for (let i = 0; i < fuzzyTargets.length; i++) {
        report(pending.length * 0.85 + (i / fuzzyTargets.length) * pending.length * 0.15, `Checking spelling: ${fuzzyTargets[i].name}`);
        await sleep(REQUEST_GAP_MS);
        const card = await fetchFuzzy(fuzzyTargets[i]);
        if (card) resolved.set(fuzzyTargets[i], slimCard(card));
      }

      resolved.forEach((card, entry) => cachePut(entry, card));
      saveCache();
    }

    report(total, "Scoring deck…");
    return resolved;
  }

  // ---------- Scoring ----------

  function interpolateScore(rank, minRank, maxRank, minScore, maxScore) {
    const progress = (rank - minRank) / (maxRank - minRank);
    const clamped = Math.max(0, Math.min(1, progress));
    return Math.round(minScore + clamped * (maxScore - minScore));
  }

  function scoreFromRank(rank) {
    if (!rank) return { category: "Unique Sleepers", points: 100 };
    if (rank <= 400) return { category: "Commander Staples", points: interpolateScore(rank, 1, 400, 1, 27) };
    if (rank <= 1000) return { category: "Commander Favorites", points: interpolateScore(rank, 401, 1000, 28, 49) };
    if (rank <= 2000) return { category: "Playables", points: interpolateScore(rank, 1001, 2000, 50, 69) };
    if (rank <= 7000) return { category: "Pet Cards", points: interpolateScore(rank, 2001, 7000, 70, 85) };
    return { category: "Unique Sleepers", points: interpolateScore(Math.min(rank, 31000), 7001, 31000, 86, 100) };
  }

  function majorityCategory(cards) {
    const counts = Object.fromEntries(CATEGORIES.map(c => [c.name, 0]));
    cards.forEach(card => { counts[card.category] += 1; });

    // Ties go to the more unique category.
    let winner = "Playables";
    let best = -1;
    [...CATEGORIES].reverse().forEach(c => {
      if (counts[c.name] > best) {
        winner = c.name;
        best = counts[c.name];
      }
    });
    return { category: winner, bonus: CATEGORY_BY_NAME[winner].bonus, counts };
  }

  function cardText(card) {
    return `${card.oracle_text || ""} ${card.type_line || ""}`.toLowerCase();
  }

  function deckThemes(cards, commanders) {
    const text = [...commanders, ...cards].map(cardText).join(" ");
    const themes = THEME_KEYWORDS
      .map(theme => ({ ...theme, count: theme.terms.reduce((sum, term) => sum + (text.split(term).length - 1), 0) }))
      .filter(theme => theme.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
    return themes.length ? themes : [{ key: "value", terms: ["draw", "damage", "token"] }];
  }

  function applyCommanderAwareScores(cards, commanders) {
    const themes = deckThemes(cards, commanders);
    let colors = [...new Set(commanders.flatMap(c => c.color_identity || []))];
    if (!colors.length) colors = [...new Set(cards.flatMap(c => c.color_identity || []))];

    cards.forEach(card => {
      const text = cardText(card);
      const matches = themes.filter(theme => theme.terms.some(term => text.includes(term))).length;
      const colorMatch = !colors.length || card.color_identity.every(color => colors.includes(color));
      let adjustment = Math.min(10, matches * 4);
      if (colorMatch) adjustment += 2;
      if (!matches && card.category === "Commander Staples") adjustment -= 2;
      card.points = clampScore(card.base_points + adjustment);
      card.mode_note = matches
        ? `Matches ${matches} detected deck theme${matches === 1 ? "" : "s"}.`
        : "No major theme match detected.";
    });
  }

  // Second half of the bonus, from the deck's rounded average card score.
  const AVERAGE_BONUS = [
    { max: 10, bonus: -2 },
    { max: 20, bonus: -1 },
    { max: 30, bonus: 0 },
    { max: 40, bonus: 2 },
    { max: 60, bonus: 3 },
    { max: 80, bonus: 5 },
    { max: 100, bonus: 2 }
  ];

  function averageBonus(roundedAverage) {
    return (AVERAGE_BONUS.find(step => roundedAverage <= step.max) || AVERAGE_BONUS[AVERAGE_BONUS.length - 1]).bonus;
  }

  // Deck score = rounded card average + (average bonus + category bonus).
  function scoreDeck(cards) {
    const average = cards.length ? cards.reduce((sum, card) => sum + card.points, 0) / cards.length : 0;
    const majority = majorityCategory(cards);
    const avgBonus = averageBonus(Math.round(average));
    const bonus = avgBonus + majority.bonus;
    return {
      score: cards.length ? clampScore(Math.round(average) + bonus) : 0,
      average,
      majority,
      avgBonus,
      bonus
    };
  }

  function signed(value) {
    return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
  }

  // ---------- Same-commander comparison (EDHREC) ----------

  function edhrecSlug(name) {
    return frontFaceName(name)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function slimEdhrec(slug, data) {
    const jsonDict = (data.container && data.container.json_dict) || {};
    const views = (jsonDict.cardlists || []).flatMap(list => list.cardviews || []);
    const cards = {};
    let maxPotential = 0;
    views.forEach(view => {
      if (!view.name || !view.potential_decks) return;
      maxPotential = Math.max(maxPotential, view.potential_decks);
      cards[nameKey(view.name)] = [view.num_decks, view.potential_decks];
    });

    const types = {};
    const pie = data.panels && data.panels.piechart && data.panels.piechart.content;
    (pie || []).forEach(slice => { types[slice.label] = slice.value; });

    return {
      slug,
      name: String(data.header || "").replace(/\s*\(Commander\)\s*$/i, ""),
      numDecks: (jsonDict.card && jsonDict.card.num_decks) || maxPotential,
      cards,
      curve: (data.panels && data.panels.mana_curve) || null,
      types
    };
  }

  async function fetchCommanderStats(commanders) {
    if (!commanders.length) return null;
    const slugs = commanders.map(c => edhrecSlug(c.name)).filter(Boolean);
    // Partner pages are named with both slugs, alphabetically.
    const candidates = slugs.length > 1
      ? [[...slugs].sort().join("-"), slugs.join("-")]
      : slugs;

    for (const slug of candidates) {
      try {
        const raw = localStorage.getItem(EDH_CACHE_PREFIX + slug);
        if (raw) {
          const hit = JSON.parse(raw);
          if (hit && hit.t + EDH_CACHE_TTL_MS > Date.now()) return hit.d;
        }
      } catch (error) { /* ignore */ }

      try {
        const response = await fetch(`${EDHREC}/${slug}.json`);
        if (!response.ok) continue;
        const stats = slimEdhrec(slug, await response.json());
        if (!Object.keys(stats.cards).length) continue;
        try {
          localStorage.setItem(EDH_CACHE_PREFIX + slug, JSON.stringify({ t: Date.now(), d: stats }));
        } catch (error) { /* storage full: fine */ }
        return stats;
      } catch (error) {
        // Network or parse error: try the next candidate.
      }
    }
    return null;
  }

  // EDHREC only lists cards in roughly 5%+ of a commander's decks.
  function inclusionFor(card, edh) {
    if (!edh) return null;
    const hit = edh.cards[nameKey(card.name)];
    return hit ? { rate: hit[0] / hit[1], decks: hit[0] } : null;
  }

  function scoreFromInclusion(inclusion, rank) {
    if (!inclusion) {
      // Not on the commander's page. Still a touch less spicy if it's a global staple.
      const global = scoreFromRank(rank);
      return { category: "Unique Sleepers", points: global.category === "Unique Sleepers" ? 100 : 94 };
    }
    const rate = inclusion.rate;
    if (rate >= 0.4) return { category: "Commander Staples", points: interpolateScore(-rate, -1, -0.4, 1, 27) };
    if (rate >= 0.2) return { category: "Commander Favorites", points: interpolateScore(-rate, -0.4, -0.2, 28, 49) };
    if (rate >= 0.1) return { category: "Playables", points: interpolateScore(-rate, -0.2, -0.1, 50, 69) };
    if (rate >= 0.05) return { category: "Pet Cards", points: interpolateScore(-rate, -0.1, -0.05, 70, 85) };
    return { category: "Unique Sleepers", points: interpolateScore(-rate, -0.05, 0, 86, 93) };
  }

  function formatInclusion(inclusion) {
    if (!inclusion) return "Under 5%";
    const pct = inclusion.rate * 100;
    return `${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%`;
  }

  function commanderShortName(edh, commanders) {
    const name = (edh && edh.name) || commanders.map(c => frontFaceName(c.name)).join(" + ");
    // "Clive, Ifrit's Dominant" -> "Clive"
    return name.split(" // ").map(part => part.split(",")[0].trim()).join(" + ");
  }

  function bandFor(score) {
    return BANDS.find(band => score >= band.lo && score <= band.hi) || BANDS[0];
  }

  function labelForScore(score) {
    return bandFor(score).name;
  }

  function summaryForScore(score) {
    if (score <= 20) return "Your deck leans hard on the most popular Commander cards. It may feel powerful, but less personal.";
    if (score <= 40) return "A familiar Commander shell with a lot of popular staples. There may be a unique plan underneath, but the card choices are pretty common.";
    if (score <= 60) return "Enough common cards to run smoothly, plus several choices that give it personality.";
    if (score <= 80) return "Some staples, but a strong share of the list is less common cards and personal choices.";
    return "Packed with pet cards, sleepers, and low-play-rate picks. Serious jank genius energy.";
  }

  function cardType(card) {
    const type = (card.type_line || "").split(" // ")[0];
    if (type.includes("Creature")) return "Creatures";
    if (type.includes("Planeswalker")) return "Planeswalkers";
    if (type.includes("Battle")) return "Battles";
    if (type.includes("Instant")) return "Instants";
    if (type.includes("Sorcery")) return "Sorceries";
    if (type.includes("Land")) return "Lands";
    if (type.includes("Artifact")) return "Artifacts";
    if (type.includes("Enchantment")) return "Enchantments";
    return "Other";
  }

  // ---------- Analyze ----------

  function setProgress(fraction, text) {
    els.progress.hidden = false;
    els.progressFill.style.width = `${Math.round(Math.max(0.04, Math.min(1, fraction)) * 100)}%`;
    if (text) els.status.textContent = text;
  }

  function showFormError(message) {
    els.formError.textContent = message;
    els.formError.hidden = !message;
  }

  async function analyzeDeck(event) {
    if (event) event.preventDefault();
    showFormError("");

    const text = els.deck.value.trim();
    if (!text) {
      showFormError("Paste a decklist first.");
      els.deck.focus();
      return;
    }

    const parsed = parseDecklist(text);
    const manualCommanders = [els.commander.value, els.partner.value]
      .map(value => value.trim())
      .filter(Boolean)
      .map(name => ({ name, quantity: 1, set: null, collectorNumber: null }));
    const commanderEntries = manualCommanders.length ? manualCommanders : parsed.commanders.slice(0, 2);
    const commanderKeys = new Set(commanderEntries.map(entry => nameKey(entry.name)));

    // One entry per card name; basics and the commander itself aren't scored.
    const seen = new Map();
    let basicsCount = 0;
    parsed.entries.forEach(entry => {
      const key = nameKey(entry.name);
      if (BASIC_LANDS.has(key)) basicsCount += entry.quantity;
      if (BASIC_LANDS.has(key) || commanderKeys.has(key)) return;
      if (seen.has(key)) seen.get(key).quantity += entry.quantity;
      else seen.set(key, { ...entry });
    });
    const entries = [...seen.values()];

    if (!entries.length) {
      showFormError("No card names found. Try a plain text list like \"1 Sol Ring\".");
      return;
    }

    const compareMode = document.querySelector('input[name="compareMode"]:checked')?.value || "global";

    els.analyze.disabled = true;
    els.analyze.classList.add("loading");
    setProgress(0.04, "Starting…");
    startLoader();

    try {
      const resolved = await lookupCards([...commanderEntries, ...entries], (fraction, label) => {
        setProgress(fraction * 0.9, label);
        setLoaderText(label);
      });

      const commanders = commanderEntries.map(entry => resolved.get(entry)).filter(Boolean);
      const cards = [];
      const missing = [];
      const foundNames = new Set();

      entries.forEach(entry => {
        const card = resolved.get(entry);
        if (!card) {
          missing.push(entry.name);
          return;
        }
        // Two inputs can resolve to the same card (e.g. a typo plus the right name).
        if (foundNames.has(card.name) || isBasicLand(card) || commanders.some(c => c.name === card.name)) return;
        foundNames.add(card.name);
        const scoring = scoreFromRank(card.edhrec_rank);
        cards.push({
          ...card,
          quantity: entry.quantity,
          points: scoring.points,
          base_points: scoring.points,
          category: scoring.category
        });
      });

      if (!cards.length) {
        stopLoader();
        showFormError("None of those cards were found on Scryfall. Check the list and try again.");
        return;
      }

      // EDHREC data powers same-commander scoring, inclusion rates and the "average deck" in the charts.
      let edh = null;
      if (commanders.length) {
        setProgress(0.93, "Checking decks with your commander on EDHREC…");
        setLoaderText("Checking decks with your commander on EDHREC…");
        edh = await fetchCommanderStats(commanders);
      }
      cards.forEach(card => { card.inclusion = inclusionFor(card, edh); });

      let mode = compareMode;
      let modeNotice = "";
      if (compareMode === "sameCommander") {
        if (edh) {
          cards.forEach(card => {
            const scoring = scoreFromInclusion(card.inclusion, card.edhrec_rank);
            card.points = scoring.points;
            card.base_points = scoring.points;
            card.category = scoring.category;
          });
        } else {
          mode = "global";
          modeNotice = commanders.length
            ? `EDHREC doesn't have deck data for ${commanderShortName(null, commanders)} yet, so this uses global ranks instead.`
            : "Add your commander (or a \"Commander\" section) to compare against decks that use it. This uses global ranks for now.";
        }
      } else if (compareMode === "commanderAware") {
        applyCommanderAwareScores(cards, commanders);
      }

      const fallbackCommanderName = commanderEntries.map(e => frontFaceName(e.name)).join(" + ");
      const scored = scoreDeck(cards);
      const historyInfo = recordHistory({
        commanders, fallbackCommanderName, score: scored.score, mode, cardCount: cards.length,
        deck: text, commanderInput: els.commander.value.trim(), partnerInput: els.partner.value.trim(), compareMode
      });

      await revealLoader(cards);

      renderResults({
        cards, missing, commanders, fallbackCommanderName, basicsCount, edh, mode, modeNotice,
        delta: historyInfo.delta, ...scored
      });

      setProgress(1, `Done. Scored ${cards.length} cards${missing.length ? `, ${missing.length} not found` : ""}.`);
      stopLoader();
      els.results.hidden = false;
      requestAnimationFrame(() => els.results.scrollIntoView({ behavior: "smooth", block: "start" }));
      fireConfetti();
      updateShareHash();
    } catch (error) {
      console.error(error);
      stopLoader();
      showFormError("Something went wrong talking to Scryfall. Check your connection and try again.");
    } finally {
      els.analyze.disabled = false;
      els.analyze.classList.remove("loading");
    }
  }

  // ---------- Rendering ----------

  function imgFor(card, size = "normal", face = 0) {
    const set = card && card.images && (card.images[face] || card.images[0]);
    return set ? set[size] || set.normal || "" : "";
  }

  function scoreBadge(card) {
    const cat = CATEGORY_BY_NAME[card.category];
    return `<span class="score-badge ${cat.cls}" title="${escapeHtml(card.category)}">${card.points}</span>`;
  }

  function renderResults(result) {
    const { cards, missing, commanders, fallbackCommanderName, basicsCount, edh, mode, modeNotice, delta, score, average, majority, avgBonus, bonus } = result;
    state.cards = cards;
    state.commanders = commanders;
    state.mode = mode;
    state.edh = edh;
    state.result = result;
    state.shareBlobs = {};

    const sameCommander = mode === "sameCommander";
    const shortName = commanderShortName(edh, commanders) || fallbackCommanderName;

    // Commander hero
    const commander = commanders[0];
    const partner = commanders[1];
    $("commanderName").textContent = commanders.length
      ? commanders.map(c => frontFaceName(c.name)).join(" + ")
      : (fallbackCommanderName || "Not detected");

    const art = commander ? imgFor(commander, "art") : "";
    $("scoreHeroArt").style.backgroundImage = art ? `url("${art}")` : "";
    $("scoreHero").classList.toggle("has-art", Boolean(art));
    setBackdrop(art);

    const commanderBtn = $("commanderCardBtn");
    commanderBtn.hidden = !commander;
    if (commander) {
      $("commanderImg").src = imgFor(commander, "normal");
      $("commanderImg").alt = commander.name;
      commanderBtn.onclick = () => openModal(commander);
    }
    $("partnerImg").hidden = !partner;
    if (partner) {
      $("partnerImg").src = imgFor(partner, "normal");
      $("partnerImg").alt = partner.name;
    }

    const colors = deckColors(commanders, cards);
    $("colorPips").querySelectorAll("img").forEach(pip => {
      pip.classList.toggle("off", !colors.includes(pip.dataset.color));
    });
    applyColorTheme(colors);

    // Score ring, colored by score band
    const band = bandFor(score);
    const scoreCard = $("scoreHero");
    scoreCard.style.setProperty("--band", band.color);
    scoreCard.style.setProperty("--band-2", band.color2);
    $("scoreValue").textContent = score;
    $("scoreLabel").textContent = band.name;
    const ring = $("ringFg");
    const circumference = 2 * Math.PI * 52;
    ring.style.strokeDasharray = `${circumference}`;
    ring.style.strokeDashoffset = `${circumference}`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ring.style.strokeDashoffset = `${circumference * (1 - score / 100)}`;
    }));
    animateNumber($("scoreValue"), score);
    $("summaryText").textContent = summaryForScore(score);

    const deltaEl = $("scoreDelta");
    deltaEl.hidden = !delta;
    if (delta) {
      const sign = delta.diff > 0 ? "up" : delta.diff < 0 ? "down" : "same";
      deltaEl.className = `score-delta ${sign}`;
      deltaEl.textContent = delta.diff === 0
        ? `Same as ${delta.when}`
        : `${delta.diff > 0 ? "▲" : "▼"} ${Math.abs(delta.diff)} since ${delta.when}`;
      deltaEl.title = `Previous score: ${delta.prev}`;
    }

    // Score equation: card average + bonus = score
    const roundedAvg = Math.round(average);
    const bonusDetail = `${signed(avgBonus)} from the card average, ${signed(majority.bonus)} from ${majority.category}`;
    $("scoreEquation").innerHTML = `
      <span class="eq-term"><strong>${roundedAvg}</strong><em>Card avg</em></span>
      <span class="eq-op">${bonus < 0 ? "−" : "+"}</span>
      <span class="eq-term eq-bonus-term" title="${escapeHtml(bonusDetail)}"><strong>${Math.abs(bonus)}</strong><em>Bonus</em></span>
      <span class="eq-op">=</span>
      <span class="eq-term eq-total"><strong>${score}</strong><em>Deck score</em></span>`;

    // Stats
    const total = cards.length;
    const share = name => Math.round((majority.counts[name] / total) * 100);

    const tile = ({ label, value, unit = "", meter, cls = "", sub }) => `
      <div class="stat ${cls}">
        <span class="stat-label">${label}</span>
        <strong>${escapeHtml(value)}${unit ? `<small>${unit}</small>` : ""}</strong>
        <span class="meter"><span style="width:${Math.max(2, Math.min(100, meter))}%"></span></span>
        <span class="stat-sub">${escapeHtml(sub)}</span>
      </div>`;

    let popularityTile;
    if (sameCommander) {
      const avgRate = cards.reduce((sum, c) => sum + (c.inclusion ? c.inclusion.rate : 0), 0) / total;
      const avgCat = CATEGORY_BY_NAME[scoreFromInclusion(avgRate > 0 ? { rate: avgRate } : null, 0).category];
      popularityTile = tile({
        label: `Avg card in ${shortName} decks`,
        value: `${Math.round(avgRate * 100)}`,
        unit: "%",
        meter: avgRate * 100,
        cls: avgCat.cls,
        sub: `Across ${edh.numDecks.toLocaleString()} decks on EDHREC`
      });
    } else {
      const ranked = cards.filter(c => c.edhrec_rank);
      const avgRank = ranked.length ? Math.round(ranked.reduce((s, c) => s + c.edhrec_rank, 0) / ranked.length) : 0;
      const avgRankCat = CATEGORY_BY_NAME[scoreFromRank(avgRank).category];
      popularityTile = tile({
        label: "Avg EDHREC rank",
        value: avgRank ? `#${avgRank.toLocaleString()}` : "N/A",
        meter: avgRank ? scoreFromRank(avgRank).points : 0,
        cls: avgRankCat.cls,
        sub: avgRank ? `Typical card is a ${avgRankCat.name.replace(/s$/, "")}` : "No ranked cards"
      });
    }

    $("stats").innerHTML = [
      tile({ label: "Card score average", value: `${roundedAvg}`, unit: "/100", meter: average, cls: "accent", sub: `Bonus ${signed(bonus)}: ${signed(avgBonus)} avg, ${signed(majority.bonus)} ${majority.category}` }),
      popularityTile,
      tile({ label: "Commander Staples", value: `${share("Commander Staples")}`, unit: "%", meter: share("Commander Staples"), cls: "cat-staples", sub: `${majority.counts["Commander Staples"]} of ${total} cards` }),
      tile({ label: "Unique Sleepers", value: `${share("Unique Sleepers")}`, unit: "%", meter: share("Unique Sleepers"), cls: "cat-sleepers", sub: `${majority.counts["Unique Sleepers"]} of ${total} cards` })
    ].join("") + `
      <div class="stat-strip">
        <span><strong>${total}</strong> cards scored</span>
        <span class="${missing.length ? "warn" : "ok"}"><strong>${missing.length}</strong> not found</span>
        <span class="muted">Basic lands excluded</span>
      </div>`;

    // Score bands, with the deck's band highlighted
    $("bandList").innerHTML = BANDS.map(b => {
      const here = b === band;
      const pos = here ? ((score - b.lo) / (b.hi - b.lo)) * 100 : 0;
      return `
        <li class="${here ? "current" : ""}" style="--band:${b.color}">
          <span class="band-range">${b.lo}–${b.hi}</span>
          <span class="band-name">${b.name}</span>
          ${here ? `<span class="band-here">You're here</span><span class="band-marker" style="left:${pos}%"></span>` : ""}
        </li>`;
    }).join("");

    // Notices
    const modeBox = $("modeNotice");
    modeBox.hidden = !modeNotice;
    modeBox.textContent = modeNotice;

    const missingBox = $("missingBox");
    missingBox.hidden = !missing.length;
    if (missing.length) {
      missingBox.innerHTML = `
        <strong>Couldn't find ${missing.length} card${missing.length === 1 ? "" : "s"}</strong>
        <div class="chips">${missing.map(name => `<span class="chip">${escapeHtml(name)}</span>`).join("")}</div>
        <p>Check the spelling or use the card's English name. Everything else was scored normally.</p>`;
    }

    // Strips
    const inclusionRate = card => (card.inclusion ? card.inclusion.rate : 0);
    const common = sameCommander
      ? [...cards].filter(c => c.inclusion).sort((a, b) => inclusionRate(b) - inclusionRate(a)).slice(0, 5)
      : [...cards].filter(c => c.edhrec_rank).sort((a, b) => a.edhrec_rank - b.edhrec_rank).slice(0, 5);
    const unique = sameCommander
      ? [...cards].sort((a, b) => inclusionRate(a) - inclusionRate(b) || (b.edhrec_rank || 1e9) - (a.edhrec_rank || 1e9)).slice(0, 5)
      : [...cards].sort((a, b) => (b.edhrec_rank || 1e9) - (a.edhrec_rank || 1e9)).slice(0, 5);
    renderStrip($("commonStrip"), common);
    renderStrip($("uniqueStrip"), unique);

    $("resultsSub").textContent = sameCommander
      ? `vs ${edh.numDecks.toLocaleString()} ${shortName} decks · ${band.name}`
      : `${total} cards scored · ${band.name}`;

    // Deck at a glance: stacked bar + guide table with this deck's counts
    $("glanceSub").textContent = `Most of your deck: ${majority.category}`;
    $("stackBar").innerHTML = [...CATEGORIES].reverse().map(c => {
      const count = majority.counts[c.name];
      if (!count) return "";
      return `<span class="${c.cls}" style="width:${(count / total) * 100}%" title="${c.name}: ${count}"></span>`;
    }).join("");

    const ranges = sameCommander
      ? {
        "Commander Staples": ["40%+", "1–27"],
        "Commander Favorites": ["20–40%", "28–49"],
        "Playables": ["10–20%", "50–69"],
        "Pet Cards": ["5–10%", "70–85"],
        "Unique Sleepers": ["Under 5%", "86–100"]
      }
      : {
        "Commander Staples": ["1–400", "1–27"],
        "Commander Favorites": ["401–1,000", "28–49"],
        "Playables": ["1,001–2,000", "50–69"],
        "Pet Cards": ["2,001–7,000", "70–85"],
        "Unique Sleepers": ["7,001+", "86–100"]
      };
    $("guideRankHead").textContent = sameCommander ? `In ${shortName} decks` : "EDHREC rank";
    const maxCount = Math.max(...CATEGORIES.map(c => majority.counts[c.name]), 1);
    $("guideBody").innerHTML = [...CATEGORIES].reverse().map(c => {
      const count = majority.counts[c.name];
      const isMajority = c.name === majority.category;
      return `
        <tr class="guide-row ${c.cls} ${isMajority ? "majority" : ""}">
          <td><span class="cat-tag"><i class="dot ${c.cls}"></i>${c.name}</span>${isMajority ? `<span class="majority-tag">Most common</span>` : ""}</td>
          <td>${ranges[c.name][0]}</td>
          <td>${ranges[c.name][1]}</td>
          <td class="your-col">
            <span class="your-bar"><span style="width:${(count / maxCount) * 100}%"></span></span>
            <span class="your-num"><strong>${count}</strong><span class="pct"> · ${Math.round((count / total) * 100)}%</span></span>
          </td>
        </tr>`;
    }).join("");

    renderCharts(cards, basicsCount, edh, shortName);

    resetReportControls();
    renderReport();
  }

  function renderStrip(container, cards) {
    if (!cards.length) {
      container.innerHTML = `<p class="empty">No cards here.</p>`;
      return;
    }
    container.innerHTML = cards.map((card, i) => `
      <button type="button" class="strip-card" data-name="${escapeHtml(card.name)}" style="--i:${i}">
        <span class="card-img">${cardImageTag(card, "normal")}</span>
        <span class="strip-name">${escapeHtml(frontFaceName(card.name))}</span>
        <span class="strip-meta">
          ${scoreBadge(card)}
          <span class="strip-rank">${state.mode === "sameCommander" ? `in ${formatInclusion(card.inclusion)}` : formatRank(card.edhrec_rank)}</span>
        </span>
      </button>`).join("");
  }

  function cardImageTag(card, size) {
    const src = imgFor(card, size);
    if (!src) {
      return `<span class="img-fallback"><strong>${escapeHtml(card.name)}</strong><em>${escapeHtml(card.type_line)}</em></span>`;
    }
    return `<img src="${src}" alt="${escapeHtml(card.name)}" loading="lazy" decoding="async" />`;
  }

  function resetReportControls() {
    $("reportSearch").value = "";
    $("typeFilter").value = "All";
    $("categoryFilter").value = "All";
    $("sortReport").value = "scoreHigh";
    $("groupMode").value = "none";
  }

  function filteredCards() {
    const search = $("reportSearch").value.trim().toLowerCase();
    const type = $("typeFilter").value;
    const category = $("categoryFilter").value;
    const sort = $("sortReport").value;

    const list = state.cards.filter(card =>
      (!search || card.name.toLowerCase().includes(search) || card.type_line.toLowerCase().includes(search))
      && (type === "All" || cardType(card) === type)
      && (category === "All" || card.category === category));

    const byName = (a, b) => a.name.localeCompare(b.name);
    list.sort((a, b) => {
      if (sort === "scoreHigh") return b.points - a.points || byName(a, b);
      if (sort === "scoreLow") return a.points - b.points || byName(a, b);
      if (sort === "cmc") return a.cmc - b.cmc || byName(a, b);
      return byName(a, b);
    });
    return list;
  }

  function renderReport() {
    els.hover.classList.remove("show");
    const list = filteredCards();
    const group = $("groupMode").value;
    $("reportCount").textContent = `Showing ${list.length} of ${state.cards.length} cards`;

    if (!list.length) {
      els.report.innerHTML = `<p class="empty">No cards match these filters.</p>`;
      return;
    }

    const render = state.view === "grid" ? renderGrid : renderList;

    if (group === "none") {
      els.report.innerHTML = render(list);
      return;
    }

    const order = group === "type" ? TYPE_ORDER : [...CATEGORIES].reverse().map(c => c.name);
    const keyOf = group === "type" ? cardType : card => card.category;
    els.report.innerHTML = order.map(key => {
      const items = list.filter(card => keyOf(card) === key);
      if (!items.length) return "";
      const cat = CATEGORY_BY_NAME[key];
      return `
        <div class="group">
          <h4 class="group-title">${cat ? `<i class="dot ${cat.cls}"></i>` : ""}${key}<span>${items.length}</span></h4>
          ${render(items)}
        </div>`;
    }).join("");
  }

  function renderGrid(cards) {
    return `<div class="card-grid">${cards.map(card => `
      <button type="button" class="grid-card" data-name="${escapeHtml(card.name)}">
        <span class="card-img">${cardImageTag(card, "normal")}</span>
        ${scoreBadge(card)}
        ${card.quantity > 1 ? `<span class="qty">×${card.quantity}</span>` : ""}
      </button>`).join("")}</div>`;
  }

  function renderList(cards) {
    const showInclusion = Boolean(state.edh);
    const inclusionHead = showInclusion ? `<th>In ${escapeHtml(commanderShortName(state.edh, state.commanders))} decks</th>` : "";
    return `
      <div class="table-wrap">
        <table class="card-table">
          <thead><tr><th>Card</th><th>Type</th><th>EDHREC rank</th>${inclusionHead}<th>Category</th><th>Score</th></tr></thead>
          <tbody>${cards.map(card => {
            const cat = CATEGORY_BY_NAME[card.category];
            return `
              <tr data-name="${escapeHtml(card.name)}" tabindex="0">
                <td class="name-cell">
                  <img class="thumb" src="${imgFor(card, "art")}" alt="" loading="lazy" />
                  <span>${escapeHtml(card.name)}</span>
                </td>
                <td class="muted">${escapeHtml(cardType(card))}</td>
                <td>${formatRank(card.edhrec_rank)}</td>
                ${showInclusion ? `<td>${formatInclusion(card.inclusion)}</td>` : ""}
                <td><span class="cat-tag"><i class="dot ${cat.cls}"></i>${card.category}</span></td>
                <td>${scoreBadge(card)}</td>
              </tr>`;
          }).join("")}</tbody>
        </table>
      </div>`;
  }

  // ---------- Card modal & hover preview ----------

  function findCard(name) {
    return state.cards.find(card => card.name === name) || state.commanders.find(card => card.name === name);
  }

  function openModal(card) {
    state.modalCard = card;
    state.modalFace = 0;
    els.hover.classList.remove("show");
    renderModal();
    if (typeof els.modal.showModal === "function") els.modal.showModal();
    else els.modal.setAttribute("open", "");
  }

  function renderModal() {
    const card = state.modalCard;
    if (!card) return;
    const img = $("modalImg");
    img.src = imgFor(card, "large", state.modalFace) || imgFor(card, "normal", state.modalFace);
    img.alt = card.name;
    $("modalFlip").hidden = !(card.images && card.images.length > 1);

    const isCommander = state.commanders.includes(card);
    const cat = card.category ? CATEGORY_BY_NAME[card.category] : null;
    const faces = card.faces && card.faces.length ? card.faces : [card];
    const face = faces[state.modalFace] || faces[0];

    $("modalInfo").innerHTML = `
      <h3>${escapeHtml(face.name || card.name)}</h3>
      <p class="modal-type">${escapeHtml(face.type_line || card.type_line)}</p>
      ${isCommander ? `<span class="cat-tag">Commander</span>` : `
        <div class="modal-score">
          ${scoreBadge(card)}
          <div>
            <strong>${card.points} / 100</strong>
            <span class="cat-tag"><i class="dot ${cat.cls}"></i>${card.category}</span>
          </div>
        </div>`}
      <dl class="modal-facts">
        <div><dt>EDHREC rank</dt><dd>${formatRank(card.edhrec_rank)}</dd></div>
        ${state.edh && !isCommander ? `<div><dt>With ${escapeHtml(commanderShortName(state.edh, state.commanders))}</dt><dd>${card.inclusion
          ? `In ${formatInclusion(card.inclusion)} of decks (${card.inclusion.decks.toLocaleString()} of ${state.edh.numDecks.toLocaleString()})`
          : `In under 5% of ${state.edh.numDecks.toLocaleString()} decks`}</dd></div>` : ""}
        ${card.set_name ? `<div><dt>Printing</dt><dd>${escapeHtml(card.set_name)}</dd></div>` : ""}
        ${card.mode_note ? `<div><dt>Commander-aware</dt><dd>${escapeHtml(card.mode_note)}</dd></div>` : ""}
      </dl>
      <p class="oracle">${escapeHtml(face.oracle_text || card.oracle_text).replace(/\n/g, "<br>")}</p>
      <a class="btn btn-small" href="${escapeHtml(card.scryfall_uri)}" target="_blank" rel="noopener noreferrer">View on Scryfall ↗</a>`;
  }

  function closeModal() {
    if (typeof els.modal.close === "function") els.modal.close();
    else els.modal.removeAttribute("open");
  }

  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function moveHover(event) {
    const pad = 18;
    const w = 244;
    const h = 340;
    let x = event.clientX + pad;
    let y = event.clientY - h / 2;
    if (x + w > window.innerWidth - 8) x = event.clientX - w - pad;
    y = Math.max(8, Math.min(window.innerHeight - h - 8, y));
    els.hover.style.transform = `translate(${x}px, ${y}px)`;
  }

  // ---------- Commander color theme ----------

  function deckColors(commanders, cards) {
    let colors = [...new Set(commanders.flatMap(c => c.color_identity || []))];
    if (!colors.length && !commanders.length) colors = [...new Set(cards.flatMap(c => c.color_identity || []))];
    return ["W", "U", "B", "R", "G"].filter(c => colors.includes(c));
  }

  function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  function applyColorTheme(colors) {
    const root = document.documentElement.style;
    const list = colors.length ? colors : ["C"];
    const a = COLOR_THEME[list[0]];
    const b = COLOR_THEME[list[list.length > 1 ? 1 : 0]];
    root.setProperty("--accent", a);
    root.setProperty("--accent-2", b);
    root.setProperty("--accent-glow", hexToRgba(a, 0.35));
    root.setProperty("--accent-soft", hexToRgba(a, 0.14));
    root.setProperty("--accent-line", hexToRgba(a, 0.45));
    root.setProperty("--accent-2-soft", hexToRgba(b, 0.12));
  }

  // Shrinks the commander art to a few dozen pixels; stretching that back up full-screen
  // looks like a heavy blur but costs nothing per frame.
  let backdropToken = 0;
  async function setBackdrop(artUrl) {
    const token = ++backdropToken;
    if (!artUrl) {
      document.body.style.setProperty("--backdrop-image", "none");
      return;
    }
    const img = await loadCanvasImage(artUrl);
    if (token !== backdropToken) return;
    if (!img) {
      document.body.style.setProperty("--backdrop-image", "none");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = Math.max(1, Math.round(40 * img.height / img.width));
    const ctx = canvas.getContext("2d");
    ctx.filter = "saturate(1.3)";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    try {
      document.body.style.setProperty("--backdrop-image", `url("${canvas.toDataURL("image/jpeg", 0.8)}")`);
    } catch (error) {
      document.body.style.setProperty("--backdrop-image", "none");
    }
  }

  function resetColorTheme() {
    ["--accent", "--accent-2", "--accent-glow", "--accent-soft", "--accent-line", "--accent-2-soft"]
      .forEach(prop => document.documentElement.style.removeProperty(prop));
  }

  // ---------- Loading animation: card backs that flip to your cards ----------

  const LOADER_SLOTS = 7;
  const LOADER_DEAL_MS = 650; // let every card finish dealing in before any flip
  let loaderStartedAt = 0;

  function startLoader() {
    loaderStartedAt = performance.now();
    els.results.hidden = true;
    els.loader.hidden = false;
    $("loaderCards").innerHTML = Array.from({ length: LOADER_SLOTS }, (_, i) => `
      <div class="flip-card" style="--i:${i}">
        <div class="flip-inner">
          <div class="flip-back"><img src="assets/u99-logo-256.webp" alt="" /></div>
          <div class="flip-front"></div>
        </div>
      </div>`).join("");
    setLoaderText("Looking up your cards…");
    requestAnimationFrame(() => els.loader.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function setLoaderText(text) {
    if (text) $("loaderText").textContent = text;
  }

  function preload(src, timeout = 1200) {
    return new Promise(resolve => {
      const img = new Image();
      const done = () => resolve(img);
      img.onload = done;
      img.onerror = done;
      setTimeout(done, timeout);
      img.src = src;
    });
  }

  async function revealLoader(cards) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const withImages = cards.filter(card => imgFor(card, "normal"));
    // Lead with the deepest cuts so the reveal shows off the spiciest cards.
    const picks = [...withImages].sort((a, b) => b.points - a.points).slice(0, LOADER_SLOTS * 2);
    for (let i = picks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [picks[i], picks[j]] = [picks[j], picks[i]];
    }
    const chosen = picks.slice(0, LOADER_SLOTS);
    if (!chosen.length || reduced) return;

    setLoaderText("Revealing your deck…");
    await Promise.all(chosen.map(card => preload(imgFor(card, "normal"))));
    await sleep(Math.max(0, loaderStartedAt + LOADER_DEAL_MS - performance.now()));
    const slots = [...$("loaderCards").querySelectorAll(".flip-card")];
    slots.forEach((slot, i) => {
      const card = chosen[i % chosen.length];
      slot.querySelector(".flip-front").innerHTML = `<img src="${imgFor(card, "normal")}" alt="" />`;
      setTimeout(() => slot.classList.add("flipped"), i * 80);
    });
    await sleep(LOADER_SLOTS * 80 + 550);
  }

  function stopLoader() {
    els.loader.hidden = true;
    $("loaderCards").innerHTML = "";
  }

  // ---------- Deck stats charts ----------

  const CURVE_BUCKETS = ["0", "1", "2", "3", "4", "5", "6", "7+"];
  const TYPE_ROWS = [
    ["Creatures", "Creature"],
    ["Instants", "Instant"],
    ["Sorceries", "Sorcery"],
    ["Artifacts", "Artifact"],
    ["Enchantments", "Enchantment"],
    ["Planeswalkers", "Planeswalker"],
    ["Battles", "Battle"],
    ["Lands", "Land"]
  ];

  function curveBucket(cmc) {
    const value = Math.floor(cmc || 0);
    return value >= 7 ? "7+" : String(value);
  }

  function renderCharts(cards, basicsCount, edh, shortName) {
    const hasAvg = Boolean(edh && edh.curve);
    $("chartLegend").innerHTML = hasAvg
      ? `<span><i class="key key-you"></i>Your deck</span><span><i class="key key-avg"></i>Avg ${escapeHtml(shortName)} deck</span>`
      : "";

    // Mana curve (nonland cards, by quantity)
    const you = Object.fromEntries(CURVE_BUCKETS.map(b => [b, 0]));
    cards.forEach(card => {
      if (cardType(card) === "Lands") return;
      you[curveBucket(card.cmc)] += card.quantity || 1;
    });
    const avg = Object.fromEntries(CURVE_BUCKETS.map(b => [b, 0]));
    if (hasAvg) {
      Object.entries(edh.curve).forEach(([mv, count]) => { avg[curveBucket(Number(mv))] += count; });
    }
    $("curveChart").innerHTML = curveSvg(you, hasAvg ? avg : null, shortName);

    // Card types (by quantity, basics counted as lands)
    const typeYou = Object.fromEntries(TYPE_ROWS.map(([plural]) => [plural, 0]));
    cards.forEach(card => {
      const type = cardType(card);
      if (type in typeYou) typeYou[type] += card.quantity || 1;
    });
    typeYou.Lands += basicsCount || 0;
    const typeAvg = edh && edh.types && Object.keys(edh.types).length ? edh.types : null;
    const rows = TYPE_ROWS.filter(([plural, singular]) => typeYou[plural] || (typeAvg && typeAvg[singular]));
    const max = Math.max(1, ...rows.map(([plural, singular]) => Math.max(typeYou[plural], typeAvg ? (typeAvg[singular] || 0) : 0)));
    $("typeChart").innerHTML = `<div class="hbars">${rows.map(([plural, singular]) => {
      const mine = typeYou[plural];
      const theirs = typeAvg ? (typeAvg[singular] || 0) : null;
      const tip = theirs === null ? `${plural}: ${mine}` : `${plural}: ${mine} in your deck · ${theirs} in the avg ${shortName} deck`;
      return `
        <div class="hbar-row" data-tip="${escapeHtml(tip)}">
          <span class="hbar-label">${plural}</span>
          <span class="hbar-track">
            <span class="hbar-fill" style="width:${(mine / max) * 100}%"></span>
            ${theirs !== null ? `<span class="hbar-avg" style="left:${(theirs / max) * 100}%"></span>` : ""}
          </span>
          <span class="hbar-value">${mine}</span>
        </div>`;
    }).join("")}</div>`;
  }

  function curveSvg(you, avg, shortName) {
    const W = 320;
    const H = 170;
    const top = 18;
    const bottom = 24;
    const plotH = H - top - bottom;
    const slot = W / CURVE_BUCKETS.length;
    const barW = Math.min(24, slot - 12);
    const max = Math.max(1, ...CURVE_BUCKETS.map(b => Math.max(you[b], avg ? avg[b] : 0)));
    const y = v => top + plotH - (v / max) * plotH;
    const r = 4;

    const parts = CURVE_BUCKETS.map((b, i) => {
      const cx = slot * i + slot / 2;
      const x = cx - barW / 2;
      const h = (you[b] / max) * plotH;
      const yTop = top + plotH - h;
      const rr = Math.min(r, h);
      const bar = h > 0
        ? `<path class="curve-bar" d="M${x},${top + plotH} V${yTop + rr} Q${x},${yTop} ${x + rr},${yTop} H${x + barW - rr} Q${x + barW},${yTop} ${x + barW},${yTop + rr} V${top + plotH} Z" />`
        : "";
      // Keep the count clear of the average marker when that sits above the bar.
      const labelY = Math.min(yTop, avg && avg[b] ? y(avg[b]) : yTop) - 6;
      const capLabel = you[b] ? `<text class="curve-cap" x="${cx}" y="${labelY}">${you[b]}</text>` : "";
      const avgMark = avg && avg[b]
        ? `<line class="curve-avg" x1="${cx - barW / 2 - 5}" x2="${cx + barW / 2 + 5}" y1="${y(avg[b])}" y2="${y(avg[b])}" />`
        : "";
      const tip = avg
        ? `Mana value ${b}: ${you[b]} in your deck · ${avg[b]} in the avg ${shortName} deck`
        : `Mana value ${b}: ${you[b]} card${you[b] === 1 ? "" : "s"}`;
      return `
        <g class="curve-slot" data-tip="${escapeHtml(tip)}">
          <rect class="hit" x="${slot * i}" y="0" width="${slot}" height="${H}" />
          ${bar}${avgMark}${capLabel}
          <text class="curve-x" x="${cx}" y="${H - 6}">${b}</text>
        </g>`;
    }).join("");

    return `<svg class="curve-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mana curve">
      <line class="baseline" x1="0" x2="${W}" y1="${top + plotH}" y2="${top + plotH}" />
      ${parts}
    </svg>`;
  }

  function showChartTip(event) {
    const target = event.target.closest("[data-tip]");
    const tip = $("chartTip");
    if (!target || !canHover) {
      tip.hidden = true;
      return;
    }
    tip.textContent = target.dataset.tip;
    tip.hidden = false;
    const pad = 14;
    let x = event.clientX + pad;
    const width = tip.offsetWidth;
    if (x + width > window.innerWidth - 8) x = event.clientX - width - pad;
    tip.style.transform = `translate(${x}px, ${event.clientY + pad}px)`;
  }

  // ---------- Deck history (this browser only) ----------

  function hashString(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function loadHistory() {
    try {
      const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (error) {
      return [];
    }
  }

  function saveHistory(list) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
    } catch (error) { /* ignore */ }
  }

  function timeAgo(ts) {
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // Saves this analysis and returns the change since the last different version of the same deck.
  function recordHistory({ commanders, fallbackCommanderName, score, mode, cardCount, deck, commanderInput, partnerInput, compareMode }) {
    const commanderName = commanders.length ? commanders.map(c => frontFaceName(c.name)).join(" + ") : (fallbackCommanderName || "Unknown commander");
    const id = hashString(`${deck}|${commanderInput}|${partnerInput}|${compareMode}`);
    const list = loadHistory();

    // Only compare against scores made with the current formula (v2 added the average bonus).
    const previous = list.find(item => item.id !== id && item.commander === commanderName && item.mode === mode && item.v === SCORE_VERSION);
    const delta = previous
      ? { diff: score - previous.score, prev: previous.score, when: timeAgo(previous.at) }
      : null;

    const entry = {
      v: SCORE_VERSION,
      id,
      at: Date.now(),
      commander: commanderName,
      art: commanders[0] ? imgFor(commanders[0], "art") : "",
      score,
      mode,
      compareMode,
      cardCount,
      deck,
      commanderInput,
      partnerInput
    };
    saveHistory([entry, ...list.filter(item => item.id !== id)]);
    renderHistory();
    return { delta };
  }

  const MODE_LABELS = { global: "All decks", sameCommander: "Same commander", commanderAware: "Commander-aware" };

  function renderHistory() {
    const list = loadHistory();
    $("history").hidden = !list.length;
    $("historyList").innerHTML = list.slice(0, 6).map(item => {
      const band = bandFor(item.score);
      return `
        <div class="history-item" style="--band:${band.color}">
          <button type="button" class="history-load" data-id="${item.id}" title="Analyze this deck again">
            <span class="history-art" style="${item.art ? `background-image:url('${escapeHtml(item.art)}')` : ""}"></span>
            <span class="history-text">
              <strong>${escapeHtml(item.commander)}</strong>
              <em>${escapeHtml(MODE_LABELS[item.mode] || "All decks")} · ${item.cardCount} cards · ${timeAgo(item.at)}</em>
            </span>
            <span class="history-score">${item.score}</span>
          </button>
          <button type="button" class="history-remove" data-remove="${item.id}" aria-label="Remove from recent decks">×</button>
        </div>`;
    }).join("");
  }

  function loadDeckIntoForm({ deck, commanderInput = "", partnerInput = "", compareMode = "global" }) {
    els.deck.value = deck || "";
    els.commander.value = commanderInput;
    els.partner.value = partnerInput;
    const radio = document.querySelector(`input[name="compareMode"][value="${compareMode}"]`);
    if (radio) radio.checked = true;
    updateLineCount();
  }

  // ---------- Share links ----------

  function toBase64Url(bytes) {
    let binary = "";
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function fromBase64Url(text) {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, ch => ch.charCodeAt(0));
  }

  async function encodeShare(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    if ("CompressionStream" in window) {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      return `z${toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()))}`;
    }
    return `j${toBase64Url(bytes)}`;
  }

  async function decodeShare(code) {
    const kind = code[0];
    let bytes = fromBase64Url(code.slice(1));
    if (kind === "z") {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  async function currentShareUrl() {
    const compareMode = document.querySelector('input[name="compareMode"]:checked')?.value || "global";
    const code = await encodeShare({
      d: els.deck.value.trim(),
      c: els.commander.value.trim(),
      p: els.partner.value.trim(),
      m: compareMode
    });
    return `${location.origin}${location.pathname}#d=${code}`;
  }

  async function updateShareHash() {
    try {
      const url = await currentShareUrl();
      history.replaceState(null, "", url);
    } catch (error) { /* sharing is optional */ }
  }

  async function copyShareLink() {
    try {
      const url = await currentShareUrl();
      await navigator.clipboard.writeText(url);
      toast("Link copied. Anyone who opens it sees these results.");
    } catch (error) {
      toast("Couldn't copy automatically. Copy the address bar instead.");
    }
  }

  async function loadFromHash() {
    const match = location.hash.match(/^#d=([\w-]+)/);
    if (!match) return;
    try {
      const data = await decodeShare(match[1]);
      if (!data || !data.d) return;
      loadDeckIntoForm({ deck: data.d, commanderInput: data.c || "", partnerInput: data.p || "", compareMode: data.m || "global" });
      analyzeDeck();
    } catch (error) {
      showFormError("That share link looks broken or incomplete.");
    }
  }

  let toastTimer = null;
  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.hidden = false;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => { el.hidden = true; }, 250);
    }, 2600);
  }

  // ---------- Share images (post 4:5, story 9:16) and PDF ----------

  const TEMPLATES = {
    post: { w: 1080, h: 1350 },
    story: { w: 1080, h: 1920 }
  };

  function loadCanvasImage(src) {
    return new Promise(resolve => {
      if (!src) return resolve(null);
      const img = new Image();
      img.crossOrigin = "anonymous";
      const timer = setTimeout(() => resolve(null), 6000);
      img.onload = () => { clearTimeout(timer); resolve(img); };
      img.onerror = () => { clearTimeout(timer); resolve(null); };
      // Separate cache entry so the browser makes a CORS request for this copy.
      img.src = src.startsWith("http") ? `${src}${src.includes("?") ? "&" : "?"}u99canvas=1` : src;
    });
  }

  function drawCover(ctx, img, x, y, w, h, focusY = 0.3) {
    const scale = Math.max(w / img.width, h / img.height);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (img.width - sw) / 2;
    const sy = Math.max(0, Math.min(img.height - sh, (img.height - sh) * focusY));
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  function fitText(ctx, text, maxWidth, size, weight, family) {
    let s = size;
    ctx.font = `${weight} ${s}px ${family}`;
    while (ctx.measureText(text).width > maxWidth && s > 20) {
      s -= 2;
      ctx.font = `${weight} ${s}px ${family}`;
    }
    return s;
  }

  async function renderShareCanvas(template) {
    const result = state.result;
    const { w: W, h: H } = TEMPLATES[template];
    const story = template === "story";
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    const display = '"Space Grotesk", "Segoe UI", sans-serif';
    const body = 'Inter, "Segoe UI", sans-serif';
    try {
      await Promise.all([
        document.fonts.load(`700 120px "Space Grotesk"`),
        document.fonts.load(`600 40px Inter`),
        document.fonts.load(`500 40px Inter`)
      ]);
    } catch (error) { /* fall back to system fonts */ }

    const band = bandFor(result.score);
    const colors = deckColors(result.commanders, result.cards);
    const accent = COLOR_THEME[(colors[0] || "C")];
    const commander = result.commanders[0];
    const uniqueCards = [...result.cards]
      .filter(card => imgFor(card, "normal"))
      .sort((a, b) => b.points - a.points)
      .slice(0, 4);

    const [art, logo, cmdImg, ...cardImgs] = await Promise.all([
      loadCanvasImage(commander ? imgFor(commander, "art") : ""),
      loadCanvasImage("assets/u99-logo-256.webp"),
      loadCanvasImage(commander ? imgFor(commander, "normal") : ""),
      ...uniqueCards.map(card => loadCanvasImage(imgFor(card, "normal")))
    ]);
    const pipImgs = await Promise.all(colors.map(c => loadCanvasImage(`assets/mana-${c.toLowerCase()}.png`)));

    // Background: commander art fading into the page color
    ctx.fillStyle = "#060912";
    ctx.fillRect(0, 0, W, H);
    const artH = story ? 1100 : 820;
    if (art) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      drawCover(ctx, art, 0, 0, W, artH, 0.25);
      ctx.restore();
    }
    const fade = ctx.createLinearGradient(0, 0, 0, artH);
    fade.addColorStop(0, "rgba(6,9,18,0.55)");
    fade.addColorStop(0.55, "rgba(6,9,18,0.8)");
    fade.addColorStop(1, "rgba(6,9,18,1)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, artH);
    const glow = ctx.createRadialGradient(W / 2, story ? 700 : 500, 40, W / 2, story ? 700 : 500, 620);
    glow.addColorStop(0, hexToRgba(band.color, 0.28));
    glow.addColorStop(1, "rgba(6,9,18,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Header: logo + wordmark
    const pad = 64;
    if (logo) {
      ctx.save();
      roundRectPath(ctx, pad, pad, 76, 76, 20);
      ctx.clip();
      ctx.drawImage(logo, pad, pad, 76, 76);
      ctx.restore();
    }
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#eef2f8";
    ctx.font = `700 40px ${display}`;
    ctx.fillText("Unique 99", pad + 96, pad + 38);
    ctx.fillStyle = "#94a3b8";
    ctx.font = `500 24px ${body}`;
    ctx.fillText("Commander Deck Uniqueness Score", pad + 96, pad + 70);

    // Commander card, top right
    if (cmdImg) {
      const cw = story ? 210 : 170;
      const ch = cw * 680 / 488;
      ctx.save();
      ctx.translate(W - pad - cw / 2, pad + ch / 2 - 10);
      ctx.rotate(0.06);
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 30;
      roundRectPath(ctx, -cw / 2, -ch / 2, cw, ch, cw * 0.045);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.clip();
      ctx.drawImage(cmdImg, -cw / 2, -ch / 2, cw, ch);
      ctx.restore();
    }

    // Score ring
    const cx = W / 2;
    const cy = story ? 680 : 420;
    const radius = story ? 230 : 170;
    const lineW = story ? 30 : 26;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(2,6,14,0.75)";
    ctx.fill();
    ctx.lineWidth = lineW;
    ctx.strokeStyle = "rgba(148,163,184,0.18)";
    ctx.stroke();
    const ringGrad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    ringGrad.addColorStop(0, band.color2);
    ringGrad.addColorStop(1, band.color);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (result.score / 100));
    ctx.strokeStyle = ringGrad;
    ctx.lineCap = "round";
    ctx.shadowColor = hexToRgba(band.color, 0.6);
    ctx.shadowBlur = 24;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${story ? 190 : 146}px ${display}`;
    ctx.fillText(String(result.score), cx, cy + (story ? 62 : 46));
    ctx.fillStyle = "#94a3b8";
    ctx.font = `500 ${story ? 32 : 28}px ${body}`;
    ctx.fillText("out of 100", cx, cy + (story ? 118 : 92));

    // Band label pill
    let y = cy + radius + (story ? 90 : 70);
    ctx.font = `700 ${story ? 46 : 40}px ${display}`;
    const labelW = ctx.measureText(band.name).width + 64;
    const pillH = story ? 76 : 66;
    roundRectPath(ctx, cx - labelW / 2, y - pillH / 2 - 14, labelW, pillH, pillH / 2);
    ctx.fillStyle = hexToRgba(band.color, 0.2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hexToRgba(band.color, 0.7);
    ctx.stroke();
    ctx.fillStyle = band.color2;
    ctx.fillText(band.name, cx, y + 2);

    // Commander name + pips + comparison line
    y += story ? 116 : 84;
    const name = result.commanders.length
      ? result.commanders.map(c => frontFaceName(c.name)).join(" + ")
      : (result.fallbackCommanderName || "My Commander deck");
    const nameSize = fitText(ctx, name, W - pad * 2, story ? 60 : 52, 700, display);
    ctx.fillStyle = "#eef2f8";
    ctx.font = `700 ${nameSize}px ${display}`;
    ctx.fillText(name, cx, y);

    y += story ? 58 : 46;
    const pip = story ? 40 : 34;
    const pipGap = 10;
    const loadedPips = pipImgs.filter(Boolean);
    const compareText = result.mode === "sameCommander" && result.edh
      ? `vs ${result.edh.numDecks.toLocaleString()} ${commanderShortName(result.edh, result.commanders)} decks on EDHREC`
      : "vs all Commander decks";
    ctx.font = `500 ${story ? 30 : 26}px ${body}`;
    const compareW = ctx.measureText(compareText).width;
    const pipsW = loadedPips.length ? loadedPips.length * (pip + pipGap) + 8 : 0;
    let x = cx - (pipsW + compareW) / 2;
    loadedPips.forEach(img => {
      ctx.drawImage(img, x, y - pip + 8, pip, pip);
      x += pip + pipGap;
    });
    ctx.textAlign = "left";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(compareText, x + (loadedPips.length ? 8 : 0), y);
    ctx.textAlign = "center";

    // Stat boxes
    y += story ? 64 : 40;
    const counts = result.majority.counts;
    const total = result.cards.length;
    const stats = [
      [String(Math.round(result.average)), "Card score avg"],
      [`${Math.round((counts["Commander Staples"] / total) * 100)}%`, "Commander Staples"],
      [`${Math.round((counts["Unique Sleepers"] / total) * 100)}%`, "Unique Sleepers"]
    ];
    const gap = 20;
    const boxW = (W - pad * 2 - gap * 2) / 3;
    const boxH = story ? 150 : 120;
    stats.forEach(([value, label], i) => {
      const bx = pad + i * (boxW + gap);
      roundRectPath(ctx, bx, y, boxW, boxH, 22);
      ctx.fillStyle = "rgba(15,22,38,0.85)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(148,163,184,0.2)";
      ctx.stroke();
      ctx.fillStyle = "#eef2f8";
      ctx.font = `700 ${story ? 60 : 52}px ${display}`;
      ctx.fillText(value, bx + boxW / 2, y + boxH / 2 + (story ? 10 : 8));
      ctx.fillStyle = "#94a3b8";
      ctx.font = `500 ${story ? 26 : 22}px ${body}`;
      ctx.fillText(label, bx + boxW / 2, y + boxH - (story ? 26 : 20));
    });

    // Deepest cuts
    y += boxH + (story ? 76 : 50);
    const cardsLoaded = cardImgs.map((img, i) => [img, uniqueCards[i]]).filter(([img]) => img);
    if (cardsLoaded.length) {
      ctx.fillStyle = accent;
      ctx.font = `700 ${story ? 28 : 24}px ${body}`;
      ctx.fillText("DEEPEST CUTS", cx, y);
      y += story ? 30 : 24;
      const cardGap = 18;
      const cw = story ? 200 : 170;
      const ch = cw * 680 / 488;
      const startX = cx - (cardsLoaded.length * cw + (cardsLoaded.length - 1) * cardGap) / 2;
      cardsLoaded.forEach(([img, card], i) => {
        const bx = startX + i * (cw + cardGap);
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = 24;
        roundRectPath(ctx, bx, y, cw, ch, cw * 0.045);
        ctx.fillStyle = "#000";
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.clip();
        ctx.drawImage(img, bx, y, cw, ch);
        ctx.restore();
        // Score badge
        const cat = CATEGORY_BY_NAME[card.category];
        const badgeColor = getComputedStyle(document.documentElement).getPropertyValue(`--${cat.cls}`).trim() || "#fbbf24";
        roundRectPath(ctx, bx + cw - 70, y - 14, 80, 46, 12);
        ctx.fillStyle = badgeColor;
        ctx.fill();
        ctx.fillStyle = "#06101f";
        ctx.font = `700 28px ${display}`;
        ctx.fillText(String(card.points), bx + cw - 30, y + 19);
      });
    }

    // Footer
    ctx.fillStyle = "#64748b";
    ctx.font = `500 ${story ? 28 : 24}px ${body}`;
    ctx.fillText(`Score your deck at ${SITE_URL}`, cx, H - (story ? 60 : 40));

    return canvas;
  }

  function selectedTemplate() {
    return document.querySelector('input[name="shareTemplate"]:checked')?.value || "post";
  }

  async function refreshSharePreview() {
    const template = selectedTemplate();
    const preview = $("sharePreview");
    preview.classList.toggle("story", template === "story");
    if (!state.shareBlobs[template]) {
      $("shareRendering").hidden = false;
      const canvas = await renderShareCanvas(template);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      state.shareBlobs[template] = { blob, url: URL.createObjectURL(blob), canvas };
    }
    $("shareRendering").hidden = true;
    preview.src = state.shareBlobs[template].url;

    const file = new File([state.shareBlobs[template].blob], shareFileName("png"), { type: "image/png" });
    $("nativeShare").hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
  }

  function shareFileName(ext) {
    const slug = edhrecSlug(state.commanders[0] ? state.commanders[0].name : "deck") || "deck";
    return `unique99-${slug}-${state.result.score}-${selectedTemplate()}.${ext}`;
  }

  async function openShareModal() {
    if (!state.result) return;
    if (typeof els.shareModal.showModal === "function") els.shareModal.showModal();
    else els.shareModal.setAttribute("open", "");
    await refreshSharePreview();
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  let jsPdfPromise = null;
  function loadJsPdf() {
    if (window.jspdf) return Promise.resolve(window.jspdf);
    if (!jsPdfPromise) {
      jsPdfPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.onload = () => resolve(window.jspdf);
        script.onerror = () => { jsPdfPromise = null; reject(new Error("jsPDF failed to load")); };
        document.head.appendChild(script);
      });
    }
    return jsPdfPromise;
  }

  async function downloadPdf() {
    const button = $("downloadPdf");
    button.disabled = true;
    try {
      await refreshSharePreview();
      const { jsPDF } = await loadJsPdf();
      const { canvas } = state.shareBlobs[selectedTemplate()];
      const { w, h } = TEMPLATES[selectedTemplate()];
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [w, h], hotfixes: ["px_scaling"] });
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);
      pdf.save(shareFileName("pdf"));
    } catch (error) {
      toast("Couldn't build the PDF. Try downloading the image instead.");
    } finally {
      button.disabled = false;
    }
  }

  // ---------- Confetti & small effects ----------

  function animateNumber(el, target) {
    const start = performance.now();
    const duration = 900;
    const step = now => {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function fireConfetti() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layer = $("confettiLayer");
    const colors = ["#60a5fa", "#93c5fd", "#a78bfa", "#fbbf24", "#34d399"];
    for (let i = 0; i < 42; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random() * 240}ms`;
      piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 160}px`);
      layer.appendChild(piece);
      setTimeout(() => piece.remove(), 1800);
    }
  }

  function updateLineCount() {
    const { entries, commanders } = parseDecklist(els.deck.value);
    const count = entries.reduce((sum, e) => sum + e.quantity, 0) + commanders.length;
    els.lineCount.textContent = count ? `${count} card${count === 1 ? "" : "s"}` : "";
  }

  // ---------- Events ----------

  els.form.addEventListener("submit", analyzeDeck);

  els.sample.addEventListener("click", () => {
    els.deck.value = SAMPLE_DECK;
    els.commander.value = "";
    els.partner.value = "";
    updateLineCount();
  });

  els.clear.addEventListener("click", () => {
    els.deck.value = "";
    els.commander.value = "";
    els.partner.value = "";
    els.results.hidden = true;
    els.progress.hidden = true;
    showFormError("");
    setBackdrop("");
    resetColorTheme();
    history.replaceState(null, "", location.pathname);
    updateLineCount();
    els.deck.focus();
  });

  els.deck.addEventListener("input", updateLineCount);
  els.deck.addEventListener("keydown", event => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) analyzeDeck(event);
  });

  ["reportSearch"].forEach(id => $(id).addEventListener("input", renderReport));
  ["typeFilter", "categoryFilter", "sortReport", "groupMode"].forEach(id => $(id).addEventListener("change", renderReport));

  document.querySelectorAll(".view-toggle button").forEach(button => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      document.querySelectorAll(".view-toggle button").forEach(b => b.classList.toggle("active", b === button));
      try { localStorage.setItem("u99-view", state.view); } catch (error) { /* ignore */ }
      renderReport();
    });
  });

  try {
    const savedView = localStorage.getItem("u99-view");
    if (savedView === "grid" || savedView === "list") {
      state.view = savedView;
      document.querySelectorAll(".view-toggle button").forEach(b => b.classList.toggle("active", b.dataset.view === savedView));
    }
  } catch (error) { /* ignore */ }


  // Open the modal from any card in the results.
  els.results.addEventListener("click", event => {
    const target = event.target.closest("[data-name]");
    if (!target) return;
    const card = findCard(target.dataset.name);
    if (card) openModal(card);
  });

  els.results.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    const row = event.target.closest("tr[data-name]");
    if (!row) return;
    const card = findCard(row.dataset.name);
    if (card) openModal(card);
  });

  // Hover preview for list rows (desktop only).
  if (canHover) {
    els.report.addEventListener("mouseover", event => {
      const row = event.target.closest("tr[data-name]");
      if (!row) return;
      const card = findCard(row.dataset.name);
      const src = card && imgFor(card, "normal");
      if (!src) return;
      els.hover.src = src;
      els.hover.classList.add("show");
      moveHover(event);
    });
    els.report.addEventListener("mousemove", event => {
      if (els.hover.classList.contains("show")) moveHover(event);
    });
    els.report.addEventListener("mouseout", event => {
      const row = event.target.closest("tr[data-name]");
      if (row && !row.contains(event.relatedTarget)) els.hover.classList.remove("show");
    });
    window.addEventListener("scroll", () => els.hover.classList.remove("show"), { passive: true });
  }

  $("modalClose").addEventListener("click", closeModal);
  $("modalFlip").addEventListener("click", () => {
    const faces = (state.modalCard && state.modalCard.images) || [];
    state.modalFace = (state.modalFace + 1) % Math.max(1, faces.length);
    renderModal();
  });
  els.modal.addEventListener("click", event => {
    if (event.target === els.modal) closeModal();
  });

  // Chart tooltips
  document.querySelector(".charts").addEventListener("mousemove", showChartTip);
  document.querySelector(".charts").addEventListener("mouseleave", () => { $("chartTip").hidden = true; });

  // Recent decks
  $("historyList").addEventListener("click", event => {
    const remove = event.target.closest("[data-remove]");
    if (remove) {
      saveHistory(loadHistory().filter(item => item.id !== remove.dataset.remove));
      renderHistory();
      return;
    }
    const load = event.target.closest("[data-id]");
    if (!load) return;
    const item = loadHistory().find(entry => entry.id === load.dataset.id);
    if (!item) return;
    loadDeckIntoForm(item);
    analyzeDeck();
  });
  $("historyClear").addEventListener("click", () => {
    saveHistory([]);
    renderHistory();
  });

  // Sharing
  $("shareBtn").addEventListener("click", openShareModal);
  $("copyLinkBtn").addEventListener("click", copyShareLink);
  $("shareCopyLink").addEventListener("click", copyShareLink);
  $("shareClose").addEventListener("click", () => els.shareModal.close());
  els.shareModal.addEventListener("click", event => {
    if (event.target === els.shareModal) els.shareModal.close();
  });
  document.querySelectorAll('input[name="shareTemplate"]').forEach(radio => {
    radio.addEventListener("change", refreshSharePreview);
  });
  $("downloadPng").addEventListener("click", async () => {
    await refreshSharePreview();
    downloadBlob(state.shareBlobs[selectedTemplate()].blob, shareFileName("png"));
  });
  $("downloadPdf").addEventListener("click", downloadPdf);
  $("nativeShare").addEventListener("click", async () => {
    const { blob } = state.shareBlobs[selectedTemplate()];
    const file = new File([blob], shareFileName("png"), { type: "image/png" });
    try {
      await navigator.share({ files: [file], title: "My Unique 99 score", url: await currentShareUrl() });
    } catch (error) { /* user cancelled */ }
  });

  updateLineCount();
  renderHistory();
  loadFromHash();
})();
