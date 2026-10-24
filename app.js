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
    hover: $("hoverPreview")
  };

  const state = {
    cards: [],
    commanders: [],
    view: "grid",
    modalCard: null,
    modalFace: 0
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

  function scoreDeck(cards) {
    const average = cards.length ? cards.reduce((sum, card) => sum + card.points, 0) / cards.length : 0;
    const majority = majorityCategory(cards);
    return {
      score: cards.length ? clampScore(Math.round(average) + majority.bonus) : 0,
      average,
      majority
    };
  }

  function labelForScore(score) {
    if (score <= 20) return "Netdeck Energy";
    if (score <= 40) return "Staple Heavy";
    if (score <= 60) return "Balanced Brew";
    if (score <= 80) return "Unique Brew";
    return "Certified Jank Genius";
  }

  function verdictForScore(score) {
    if (score <= 20) return "Efficient, powerful, and very familiar.";
    if (score <= 40) return "Strong shell, but your staples are doing a lot of the talking.";
    if (score <= 60) return "A healthy mix of staples and personal picks.";
    if (score <= 80) return "This brew has real personality.";
    return "Absolute deep-cut energy.";
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
    parsed.entries.forEach(entry => {
      const key = nameKey(entry.name);
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

    try {
      const resolved = await lookupCards([...commanderEntries, ...entries], (fraction, label) => setProgress(fraction, label));

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
        showFormError("None of those cards were found on Scryfall. Check the list and try again.");
        return;
      }

      if (compareMode === "commanderAware") applyCommanderAwareScores(cards, commanders);

      const fallbackCommanderName = commanderEntries.map(e => frontFaceName(e.name)).join(" + ");
      renderResults({ cards, missing, commanders, fallbackCommanderName, ...scoreDeck(cards) });

      setProgress(1, `Done. Scored ${cards.length} cards${missing.length ? `, ${missing.length} not found` : ""}.`);
      els.results.hidden = false;
      requestAnimationFrame(() => els.results.scrollIntoView({ behavior: "smooth", block: "start" }));
      fireConfetti();
    } catch (error) {
      console.error(error);
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

  function renderResults({ cards, missing, commanders, fallbackCommanderName, score, average, majority }) {
    state.cards = cards;
    state.commanders = commanders;

    // Commander hero
    const commander = commanders[0];
    const partner = commanders[1];
    $("commanderName").textContent = commanders.length
      ? commanders.map(c => frontFaceName(c.name)).join(" + ")
      : (fallbackCommanderName || "Not detected");

    const art = commander ? imgFor(commander, "art") : "";
    $("scoreHeroArt").style.backgroundImage = art ? `url("${art}")` : "";
    $("scoreHero").classList.toggle("has-art", Boolean(art));
    document.body.style.setProperty("--backdrop-image", art ? `url("${art}")` : "none");

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

    let colors = [...new Set(commanders.flatMap(c => c.color_identity || []))];
    if (!colors.length) colors = [...new Set(cards.flatMap(c => c.color_identity || []))];
    $("colorPips").querySelectorAll("img").forEach(pip => {
      pip.classList.toggle("off", !colors.includes(pip.dataset.color));
    });

    // Score ring
    $("scoreValue").textContent = score;
    $("scoreLabel").textContent = labelForScore(score);
    const ring = $("ringFg");
    const circumference = 2 * Math.PI * 52;
    ring.style.strokeDasharray = `${circumference}`;
    ring.style.strokeDashoffset = `${circumference}`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ring.style.strokeDashoffset = `${circumference * (1 - score / 100)}`;
    }));
    animateNumber($("scoreValue"), score);
    $("verdictText").innerHTML = `<strong>U99 Verdict:</strong> ${escapeHtml(verdictForScore(score))}`;
    $("summaryText").textContent = summaryForScore(score);

    // Score equation: average + category bonus = score
    const roundedAvg = Math.round(average);
    const bonusText = majority.bonus > 0 ? `+${majority.bonus}` : majority.bonus < 0 ? `−${Math.abs(majority.bonus)}` : "+0";
    const majorityCat = CATEGORY_BY_NAME[majority.category];
    $("scoreEquation").innerHTML = `
      <span class="eq-term"><strong>${roundedAvg}</strong><em>Card avg</em></span>
      <span class="eq-op">${majority.bonus < 0 ? "−" : "+"}</span>
      <span class="eq-term ${majorityCat.cls}"><strong class="eq-bonus">${Math.abs(majority.bonus)}</strong><em>${majority.category}</em></span>
      <span class="eq-op">=</span>
      <span class="eq-term eq-total"><strong>${score}</strong><em>Deck score</em></span>`;

    // Stats
    const total = cards.length;
    const ranked = cards.filter(c => c.edhrec_rank);
    const avgRank = ranked.length ? Math.round(ranked.reduce((s, c) => s + c.edhrec_rank, 0) / ranked.length) : 0;
    const avgRankCat = CATEGORY_BY_NAME[scoreFromRank(avgRank).category];
    const share = name => Math.round((majority.counts[name] / total) * 100);

    const tile = ({ label, value, unit = "", meter, cls = "", sub }) => `
      <div class="stat ${cls}">
        <span class="stat-label">${label}</span>
        <strong>${escapeHtml(value)}${unit ? `<small>${unit}</small>` : ""}</strong>
        <span class="meter"><span style="width:${Math.max(2, Math.min(100, meter))}%"></span></span>
        <span class="stat-sub">${escapeHtml(sub)}</span>
      </div>`;

    $("stats").innerHTML = [
      tile({ label: "Card score average", value: `${roundedAvg}`, unit: "/100", meter: average, cls: "accent", sub: `Bonus ${bonusText} from ${majority.category}` }),
      tile({ label: "Avg EDHREC rank", value: avgRank ? `#${avgRank.toLocaleString()}` : "N/A", meter: avgRank ? scoreFromRank(avgRank).points : 0, cls: avgRankCat.cls, sub: avgRank ? `Typical card is a ${avgRankCat.name.replace(/s$/, "")}` : "No ranked cards" }),
      tile({ label: "Commander Staples", value: `${share("Commander Staples")}`, unit: "%", meter: share("Commander Staples"), cls: "cat-staples", sub: `${majority.counts["Commander Staples"]} of ${total} cards` }),
      tile({ label: "Unique Sleepers", value: `${share("Unique Sleepers")}`, unit: "%", meter: share("Unique Sleepers"), cls: "cat-sleepers", sub: `${majority.counts["Unique Sleepers"]} of ${total} cards` })
    ].join("") + `
      <div class="stat-strip">
        <span><strong>${total}</strong> cards scored</span>
        <span class="${missing.length ? "warn" : "ok"}"><strong>${missing.length}</strong> not found</span>
        <span class="muted">Basic lands excluded</span>
      </div>`;

    // Score bands, with the deck's band highlighted
    const bands = [
      [0, 20, "Netdeck Energy"],
      [21, 40, "Staple Heavy"],
      [41, 60, "Balanced Brew"],
      [61, 80, "Unique Brew"],
      [81, 100, "Certified Jank Genius"]
    ];
    $("bandList").innerHTML = bands.map(([lo, hi, name]) => {
      const here = score >= lo && score <= hi;
      const pos = here ? ((score - lo) / (hi - lo)) * 100 : 0;
      return `
        <li class="${here ? "current" : ""}">
          <span class="band-range">${lo}–${hi}</span>
          <span class="band-name">${name}</span>
          ${here ? `<span class="band-here">You're here</span><span class="band-marker" style="left:${pos}%"></span>` : ""}
        </li>`;
    }).join("");

    // Missing cards
    const missingBox = $("missingBox");
    missingBox.hidden = !missing.length;
    if (missing.length) {
      missingBox.innerHTML = `
        <strong>Couldn't find ${missing.length} card${missing.length === 1 ? "" : "s"}</strong>
        <div class="chips">${missing.map(name => `<span class="chip">${escapeHtml(name)}</span>`).join("")}</div>
        <p>Check the spelling or use the card's English name. Everything else was scored normally.</p>`;
    }

    // Strips
    const common = [...cards].filter(c => c.edhrec_rank).sort((a, b) => a.edhrec_rank - b.edhrec_rank).slice(0, 5);
    const unique = [...cards].sort((a, b) => (b.edhrec_rank || 1e9) - (a.edhrec_rank || 1e9)).slice(0, 5);
    renderStrip($("commonStrip"), common);
    renderStrip($("uniqueStrip"), unique);

    $("resultsSub").textContent = `${total} cards scored · ${labelForScore(score)}`;

    // Deck at a glance: stacked bar + guide table with this deck's counts
    $("glanceSub").textContent = `Most of your deck: ${majority.category}`;
    $("stackBar").innerHTML = [...CATEGORIES].reverse().map(c => {
      const count = majority.counts[c.name];
      if (!count) return "";
      return `<span class="${c.cls}" style="width:${(count / total) * 100}%" title="${c.name}: ${count}"></span>`;
    }).join("");

    const ranges = {
      "Commander Staples": ["1–400", "1–27"],
      "Commander Favorites": ["401–1,000", "28–49"],
      "Playables": ["1,001–2,000", "50–69"],
      "Pet Cards": ["2,001–7,000", "70–85"],
      "Unique Sleepers": ["7,001+", "86–100"]
    };
    const maxCount = Math.max(...CATEGORIES.map(c => majority.counts[c.name]), 1);
    $("guideBody").innerHTML = [...CATEGORIES].reverse().map(c => {
      const count = majority.counts[c.name];
      const isMajority = c.name === majority.category;
      const bonus = c.bonus > 0 ? `+${c.bonus}` : c.bonus < 0 ? `−${Math.abs(c.bonus)}` : "0";
      return `
        <tr class="guide-row ${c.cls} ${isMajority ? "majority" : ""}" data-category="${c.name}" tabindex="0">
          <td><span class="cat-tag"><i class="dot ${c.cls}"></i>${c.name}</span>${isMajority ? `<span class="majority-tag">Most common</span>` : ""}</td>
          <td>${ranges[c.name][0]}</td>
          <td>${ranges[c.name][1]}</td>
          <td class="bonus">${bonus}</td>
          <td class="your-col">
            <span class="your-bar"><span style="width:${(count / maxCount) * 100}%"></span></span>
            <span class="your-num"><strong>${count}</strong><span class="pct"> · ${Math.round((count / total) * 100)}%</span></span>
          </td>
        </tr>`;
    }).join("");

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
          <span class="strip-rank">${formatRank(card.edhrec_rank)}</span>
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
    return `
      <div class="table-wrap">
        <table class="card-table">
          <thead><tr><th>Card</th><th>Type</th><th>EDHREC rank</th><th>Category</th><th>Score</th></tr></thead>
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
    document.body.style.setProperty("--backdrop-image", "none");
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

  function filterToCategory(row) {
    const filter = $("categoryFilter");
    filter.value = filter.value === row.dataset.category ? "All" : row.dataset.category;
    renderReport();
    $("reportPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("guideBody").addEventListener("click", event => {
    const row = event.target.closest(".guide-row");
    if (row) filterToCategory(row);
  });
  $("guideBody").addEventListener("keydown", event => {
    const row = event.target.closest(".guide-row");
    if (row && event.key === "Enter") filterToCategory(row);
  });

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

  updateLineCount();
})();
