const BASIC_LANDS = new Set([
      "Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes",
      "Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp",
      "Snow-Covered Mountain", "Snow-Covered Forest"
    ]);

    const SECTION_HEADERS = new Set([
      "commander", "commanders", "deck", "mainboard", "maindeck", "sideboard",
      "maybeboard", "companions", "companion", "creatures", "creature",
      "instants", "instant", "sorceries", "sorcery", "artifacts", "artifact",
      "enchantments", "enchantment", "planeswalkers", "planeswalker",
      "lands", "land", "tokens", "token"
    ]);

    const sampleDeck = `1 Abrade (TDC) 203
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

    const deckInput = document.getElementById("deckInput");
    const commanderInput = document.getElementById("commanderInput");
    const analyzeBtn = document.getElementById("analyzeBtn");
    const sampleBtn = document.getElementById("sampleBtn");
    const clearBtn = document.getElementById("clearBtn");
    const statusEl = document.getElementById("status");
    const errorBox = document.getElementById("errorBox");
    let fullReportCards = [];

    sampleBtn.addEventListener("click", () => {
      deckInput.value = sampleDeck;
      commanderInput.value = "Clive, Ifrit's Dominant";
    });

    clearBtn.addEventListener("click", () => {
      deckInput.value = "";
      commanderInput.value = "";
      document.getElementById("results").style.display = "none";
      setLookupProgress(0, parsedCards.length);
      errorBox.style.display = "none";
      statusEl.textContent = "";
    });

    analyzeBtn.addEventListener("click", analyzeDeck);

    document.addEventListener("input", (event) => {
      if (event.target && event.target.id === "reportSearch") {
        renderFullReport();
      }
    });

    document.addEventListener("change", (event) => {
      if (event.target && ["typeFilter", "categoryFilter", "sortReport", "viewMode"].includes(event.target.id)) {
        renderFullReport();
      }
    });

    function cleanDeckLine(rawLine) {
      let line = rawLine.trim();
      line = line.replace(/\s*\/\/.*$/g, "");
      line = line.replace(/\s+#.*$/g, "");
      line = line.replace(/\s+\*.*$/g, "");
      line = line.replace(/\s*\([A-Z0-9]{2,6}\)\s*[\w\-]*\s*$/i, "");
      line = line.replace(/\s*\[[^\]]+\]\s*$/g, "");
      line = line.replace(/^SB:\s*/i, "");
      line = line.replace(/^Sideboard:\s*/i, "");
      line = line.replace(/^\d+x?\s+/i, "");
      line = line.replace(/\s+\/\s+\/\s+/g, " // ");
      return line.trim();
    }

    function parseDecklist(text, manualCommander) {
      const seen = new Set();
      const cards = [];
      let commander = manualCommander.trim() || "";
      let nextCardIsCommander = false;

      const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

      for (let rawLine of lines) {
        const rawLower = rawLine.toLowerCase().trim();

        if (rawLower === "commander" || rawLower === "commanders") {
          nextCardIsCommander = true;
          continue;
        }

        let line = cleanDeckLine(rawLine);
        if (!line) continue;

        const lower = line.toLowerCase();
        if (SECTION_HEADERS.has(lower)) {
          nextCardIsCommander = false;
          continue;
        }

        if (/^[a-z\s]+(\(\d+\)|:\s*\d+)$/i.test(line)) continue;

        if (nextCardIsCommander && !commander) {
          commander = line;
          nextCardIsCommander = false;
          continue;
        }

        if (nextCardIsCommander) nextCardIsCommander = false;
        if (BASIC_LANDS.has(line)) continue;
        if (commander && line.toLowerCase() === commander.toLowerCase()) continue;

        if (!seen.has(line.toLowerCase())) {
          seen.add(line.toLowerCase());
          cards.push(line);
        }
      }

      return { commander, cards };
    }

    function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function fetchCardByName(name) {
      const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`;
      const response = await fetch(url, {
        headers: {
          "Accept": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Card not found: ${name}`);
      }

      return response.json();
    }

    function scoreFromRank(rank) {
      if (!rank) {
        return {
          category: "No Rank",
          points: 96,
          bucket: "No Rank"
        };
      }

      if (rank <= 500) {
        return {
          category: "Commander Staples",
          points: interpolateScore(rank, 1, 500, 1, 20),
          bucket: "Commander Staples"
        };
      }

      if (rank <= 2000) {
        return {
          category: "Commander Favorites",
          points: interpolateScore(rank, 501, 2000, 21, 40),
          bucket: "Commander Favorites"
        };
      }

      if (rank <= 7500) {
        return {
          category: "Playables",
          points: interpolateScore(rank, 2001, 7500, 41, 60),
          bucket: "Playables"
        };
      }

      if (rank <= 15000) {
        return {
          category: "Pet Cards",
          points: interpolateScore(rank, 7501, 15000, 61, 80),
          bucket: "Pet Cards"
        };
      }

      return {
        category: "Unique Sleepers",
        points: interpolateScore(Math.min(rank, 40000), 15001, 40000, 81, 95),
        bucket: "Unique Sleepers"
      };
    }

    function interpolateScore(rank, minRank, maxRank, minScore, maxScore) {
      const progress = (rank - minRank) / (maxRank - minRank);
      const clamped = Math.max(0, Math.min(1, progress));
      return Math.round(minScore + clamped * (maxScore - minScore));
    }

    function labelForScore(score) {
      if (score <= 20) return "Netdeck Energy";
      if (score <= 40) return "Staple Heavy";
      if (score <= 60) return "Balanced Brew";
      if (score <= 80) return "Unique Brew";
      return "Certified Jank Genius";
    }

    function summaryForScore(score, staplePct, deepPct) {
      if (score <= 20) {
        return "Your deck is extremely staple-heavy. It leans hard on the most popular Commander cards, so it may feel powerful but less personal.";
      }

      if (score <= 40) {
        return "Your deck uses a familiar Commander shell with a lot of popular staples. There may still be a unique plan underneath, but the card choices are currently pretty common.";
      }

      if (score <= 60) {
        return "Your deck lands in a balanced spot. It has enough common cards to function smoothly, but there are also several choices that give it some personality.";
      }

      if (score <= 80) {
        return "Your deck is a unique brew. It still has some Commander staples, but a strong portion of the list uses less common cards and personal choices.";
      }

      return "Your deck is wildly unique. This list is packed with pet cards, unique sleepers, and low-play-rate cards. It has serious jank genius energy.";
    }

    function formatRank(rank) {
      return rank ? rank.toLocaleString() : "No Rank";
    }

    
function setLookupProgress(current, total) {
  const bar = document.getElementById("lookupProgress");
  const fill = document.getElementById("lookupProgressFill");
  if (!bar || !fill) return;

  if (!total) {
    bar.classList.remove("active");
    fill.style.width = "0%";
    return;
  }

  bar.classList.add("active");
  const pct = Math.max(0, Math.min(100, Math.round((current / total) * 100)));
  fill.style.width = `${pct}%`;
}

function hideLookupProgressSoon() {
  window.setTimeout(() => setLookupProgress(0, 0), 900);
}

function verdictForScore(score) {
  if (score <= 20) return "U99 Verdict: Efficient, powerful, and very familiar.";
  if (score <= 40) return "U99 Verdict: Strong shell, but your staples are doing a lot of the talking.";
  if (score <= 60) return "U99 Verdict: A healthy mix of staples and personal picks.";
  if (score <= 80) return "U99 Verdict: This brew has real personality.";
  return "U99 Verdict: Absolute deep-cut energy.";
}

function fireConfetti() {
  const layer = document.getElementById("confettiLayer");
  if (!layer) return;

  const colors = ["#60a5fa", "#93c5fd", "#3b82f6", "#dbeafe", "#2563eb"];
  const pieces = 38;

  for (let i = 0; i < pieces; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = `${Math.random() * 220}ms`;
    piece.style.transform = `rotate(${Math.random() * 180}deg)`;
    layer.appendChild(piece);

    window.setTimeout(() => piece.remove(), 1600);
  }
}


async function analyzeDeck() {
      const deckText = deckInput.value.trim();
      const manualCommander = commanderInput.value.trim();

      if (!deckText) {
        statusEl.textContent = "Paste a decklist first.";
        return;
      }

      const parsed = parseDecklist(deckText, manualCommander);
      const parsedCards = parsed.cards;

      if (!parsedCards.length) {
        statusEl.textContent = "I could not find any card names. Try pasting a plain text decklist.";
        return;
      }

      analyzeBtn.disabled = true;
      errorBox.style.display = "none";
      errorBox.textContent = "";
      document.getElementById("results").style.display = "none";

      const found = [];
      const missing = [];
      let commanderCard = null;

      if (parsed.commander) {
        try {
          statusEl.textContent = `Looking up commander art: ${parsed.commander}`;
          commanderCard = await fetchCommanderCard(parsed.commander);
          await sleep(250);
        } catch (error) {
          commanderCard = null;
        }
      }

      for (let i = 0; i < parsedCards.length; i++) {
        const name = parsedCards[i];
        statusEl.textContent = `Looking up ${i + 1} of ${parsedCards.length}: ${name}`;
        setLookupProgress(i + 1, parsedCards.length);

        try {
          const card = await fetchCardByName(name);
          const scoring = scoreFromRank(card.edhrec_rank);

          found.push({
            inputName: name,
            name: card.name,
            edhrec_rank: card.edhrec_rank || null,
            points: scoring.points,
            category: scoring.category,
            bucket: scoring.bucket,
            type_line: card.type_line || "",
            oracle_text: card.oracle_text || "",
            mana_cost: card.mana_cost || "",
            color_identity: card.color_identity || [],
            scryfall_uri: card.scryfall_uri
          });
        } catch (error) {
          missing.push(name);
        }

        // Scryfall named endpoint asks for 2 requests per second, so keep this gentle.
        await sleep(560);
      }

      if (!found.length) {
        statusEl.textContent = "No cards were found. Try a cleaner card list.";
        analyzeBtn.disabled = false;
        return;
      }

      const average = found.reduce((sum, card) => sum + card.points, 0) / found.length;
      const ultraCount = found.filter(card => card.bucket === "Commander Staples").length;
      const deepCount = found.filter(card => card.bucket === "Unique Sleepers" || card.bucket === "No Rank").length;

      let score = Math.round(average);

      // Small deck-level adjustments.
      const ultraPct = ultraCount / found.length;
      const deepPct = deepCount / found.length;

      if (ultraPct > 0.20) score -= 5;
      if (ultraPct > 0.35) score -= 8;
      if (deepPct > 0.20) score += 5;
      if (deepPct > 0.35) score += 7;

      score = Math.max(0, Math.min(100, score));

      renderResults(found, missing, score, average, ultraPct, deepPct, parsed.commander);

      statusEl.textContent = `Done. Scored ${found.length} cards.`;
      hideLookupProgressSoon();
      fireConfetti();
      analyzeBtn.disabled = false;
    }

    function getFallbackDeckColors(cards) {
      const colors = new Set();
      cards.forEach(card => {
        if (Array.isArray(card.color_identity)) {
          card.color_identity.forEach(color => colors.add(color));
        }
      });
      return Array.from(colors);
    }

    function updateColorPips(commanderCard, cards = []) {
      const colorPips = document.getElementById("colorPips");
      if (!colorPips) return;

      let colors = commanderCard && Array.isArray(commanderCard.color_identity)
        ? commanderCard.color_identity
        : [];

      if (!colors.length) {
        colors = getFallbackDeckColors(cards);
      }

      colorPips.querySelectorAll(".mana-pip, .mana-symbol").forEach(symbol => {
        const color = symbol.dataset.color;
        symbol.classList.toggle("inactive", !colors.includes(color));
      });
    }

    function renderResults(cards, missing, score, averagePoints, staplePct, deepPct, commander, commanderCard) {
      const results = document.getElementById("results");
      results.style.display = "grid";

      const commanderTitle = document.getElementById("commanderDetected");
      const commanderHero = document.getElementById("commanderHero");
      commanderTitle.textContent = commander ? commander : "Not detected";
      updateColorPips(commanderCard, cards);
      const artCrop = commanderCard ? getArtCrop(commanderCard) : null;
      commanderHero.classList.remove("has-art", "no-art");
      if (artCrop) {
        commanderHero.classList.add("has-art");
        commanderHero.style.backgroundImage = `linear-gradient(135deg, rgba(3,11,31,0.96) 0%, rgba(3,11,31,0.78) 44%, rgba(3,11,31,0.24) 100%), url("${artCrop}")`;
      } else {
        commanderHero.classList.add("no-art");
        commanderHero.style.backgroundImage = "";
      }

      const scoreShowcase = document.getElementById("scoreShowcase");
      scoreShowcase.classList.remove("has-art", "no-art");
      if (artCrop) {
        scoreShowcase.classList.add("has-art");
        scoreShowcase.style.backgroundImage = `url("${artCrop}")`;
      } else {
        scoreShowcase.classList.add("no-art");
        scoreShowcase.style.backgroundImage = "";
      }

      document.getElementById("scoreValue").textContent = score;
      document.getElementById("scoreCircle").style.setProperty("--score-deg", `${score * 3.6}deg`);
      document.getElementById("scoreFill").style.width = `${score}%`;
      document.getElementById("scoreLabel").textContent = labelForScore(score);
      document.getElementById("summaryText").textContent = summaryForScore(score);
      const verdictEl = document.getElementById("verdictText");
      if (verdictEl) verdictEl.textContent = verdictForScore(score);

      const rankedCards = cards.filter(card => card.edhrec_rank);
      const avgRank = rankedCards.length
        ? Math.round(rankedCards.reduce((sum, card) => sum + card.edhrec_rank, 0) / rankedCards.length)
        : 0;

      document.getElementById("cardsFound").textContent = cards.length;
      document.getElementById("avgRank").textContent = avgRank ? avgRank.toLocaleString() : "N/A";
      document.getElementById("avgUniquePct").textContent = `${Math.round(averagePoints)} / 100`;
      document.getElementById("staplePercent").textContent = `${Math.round(staplePct * 100)}%`;
      document.getElementById("deepPercent").textContent = `${Math.round(deepPct * 100)}%`;
      document.getElementById("cardsMissed").textContent = missing.length;

      const identity = identityForDeck(score, staplePct, deepPct);
      const identityTitle = document.getElementById("deckIdentityTitle");
      const identityText = document.getElementById("deckIdentityText");
      if (identityTitle && identityText) {
        identityTitle.textContent = identity.title;
        identityText.textContent = identity.text;
      }

      const genericCards = [...cards]
        .filter(card => card.edhrec_rank)
        .sort((a, b) => a.edhrec_rank - b.edhrec_rank)
        .slice(0, 5);

      const uniqueCards = [...cards]
        .sort((a, b) => {
          const rankA = a.edhrec_rank || 999999;
          const rankB = b.edhrec_rank || 999999;
          return rankB - rankA;
        })
        .slice(0, 5);

      renderCompactRows("genericCardsTable", genericCards);
      renderCompactRows("uniqueCardsTable", uniqueCards);
const buckets = [
        "No Rank",
        "Unique Sleepers",
        "Pet Cards",
        "Playables",
        "Commander Favorites",
        "Commander Staples"
      ];

      const counts = Object.fromEntries(buckets.map(bucket => [bucket, 0]));
      cards.forEach(card => counts[card.bucket] = (counts[card.bucket] || 0) + 1);

      const bars = document.getElementById("breakdownBars");
      bars.innerHTML = "";

      buckets.forEach(bucket => {
        const count = counts[bucket] || 0;
        const pct = Math.round((count / cards.length) * 100);

        const row = document.createElement("div");
        row.className = "bar-line";
        row.innerHTML = `
          <div>${bucket}</div>
          <div class="bar-track"><div class="bar-fill" style="width: ${pct}%"></div></div>
          <div>${pct}%</div>
        `;
        bars.appendChild(row);
      });

      fullReportCards = [...cards];
      resetReportControls();
      renderFullReport();

      if (missing.length) {
        errorBox.style.display = "block";
        errorBox.innerHTML = `
          <strong>Could not find ${missing.length} card${missing.length === 1 ? "" : "s"}:</strong>
          ${missing.map(escapeHtml).join(", ")}
          <br><br>
          Try checking spelling, removing extra set info, or using the exact English card name.
        `;
      } else {
        errorBox.style.display = "none";
      }

      results.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function identityForDeck(score, staplePct, deepPct) {
      if (score <= 25) {
        return {
          title: "Familiar Foundation",
          text: "This deck leans heavily on popular Commander cards. It should feel consistent, but many of its choices are common across the format."
        };
      }

      if (score <= 45) {
        return {
          title: "Staples With Some Personality",
          text: "This deck still relies on a familiar Commander shell, but there are a few personal choices starting to push it away from a generic list."
        };
      }

      if (score <= 60) {
        return {
          title: "Balanced Brew",
          text: "This deck sits in the middle. It uses enough staples to stay functional, while also mixing in some less common role-players."
        };
      }

      if (score <= 80) {
        return {
          title: "Distinctive Build",
          text: "This deck has a noticeable unique identity. It still plays some staples, but a meaningful chunk of the list comes from more personal choices."
        };
      }

      return {
        title: "Deep-Cut Machine",
        text: "This deck is packed with unusual inclusions and niche cards. It feels much more like a personal brew than a stock Commander list."
      };
    }

    function cardTypeBucket(card) {
      const type = card.type_line || "";

      if (type.includes("Creature")) return "Creatures";
      if (type.includes("Instant")) return "Instants";
      if (type.includes("Sorcery")) return "Sorceries";
      if (type.includes("Artifact")) return "Artifacts";
      if (type.includes("Enchantment")) return "Enchantments";
      if (type.includes("Planeswalker")) return "Planeswalkers";
      if (type.includes("Land")) return "Lands";
      return "Other";
    }

    function renderTypeGrid(cards) {
      const grid = document.getElementById("typeGrid");
      if (!grid) return;

      const order = ["Creatures", "Instants", "Sorceries", "Artifacts", "Enchantments", "Planeswalkers", "Lands", "Other"];
      const groups = Object.fromEntries(order.map(type => [type, []]));

      cards.forEach(card => {
        const bucket = cardTypeBucket(card);
        groups[bucket].push(card);
      });

      grid.innerHTML = "";

      order.forEach(type => {
        const list = groups[type] || [];
        if (!list.length && type === "Other") return;

        const column = document.createElement("div");
        column.className = "type-column";

        const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));

        column.innerHTML = `
          <div class="type-column-header">
            <span>${type}</span>
            <span>${sorted.length}</span>
          </div>
          <div class="type-list">
            ${sorted.length ? sorted.map(card => `
              <div class="type-card-row">
                <a href="${card.scryfall_uri}" target="_blank" rel="noopener noreferrer">${escapeHtml(card.name)}</a>
                <span class="type-score">${card.points}/100</span>
              </div>
            `).join("") : `<div class="type-empty">No cards found</div>`}
          </div>
        `;

        grid.appendChild(column);
      });
    }

    function resetReportControls() {
      const search = document.getElementById("reportSearch");
      const type = document.getElementById("typeFilter");
      const category = document.getElementById("categoryFilter");
      const sort = document.getElementById("sortReport");
      const view = document.getElementById("viewMode");

      if (search) search.value = "";
      if (type) type.value = "All";
      if (category) category.value = "All";
      if (sort) sort.value = "scoreHigh";
      if (view) view.value = "flat";
    }

    function getCardType(card) {
      const type = card.type_line || "";

      if (type.includes("Creature")) return "Creatures";
      if (type.includes("Instant")) return "Instants";
      if (type.includes("Sorcery")) return "Sorceries";
      if (type.includes("Artifact")) return "Artifacts";
      if (type.includes("Enchantment")) return "Enchantments";
      if (type.includes("Planeswalker")) return "Planeswalkers";
      if (type.includes("Land")) return "Lands";
      return "Other";
    }

    function getFilteredReportCards() {
      const searchValue = (document.getElementById("reportSearch")?.value || "").trim().toLowerCase();
      const typeValue = document.getElementById("typeFilter")?.value || "All";
      const categoryValue = document.getElementById("categoryFilter")?.value || "All";
      const sortValue = document.getElementById("sortReport")?.value || "scoreHigh";

      let filtered = [...fullReportCards];

      if (searchValue) {
        filtered = filtered.filter(card => card.name.toLowerCase().includes(searchValue));
      }

      if (typeValue !== "All") {
        filtered = filtered.filter(card => getCardType(card) === typeValue);
      }

      if (categoryValue !== "All") {
        filtered = filtered.filter(card => card.category === categoryValue);
      }

      filtered.sort((a, b) => {
        if (sortValue === "scoreHigh") return b.points - a.points || a.name.localeCompare(b.name);
        if (sortValue === "scoreLow") return a.points - b.points || a.name.localeCompare(b.name);
        if (sortValue === "rankCommon") return (a.edhrec_rank || 999999) - (b.edhrec_rank || 999999);
        if (sortValue === "rankUnique") return (b.edhrec_rank || 999999) - (a.edhrec_rank || 999999);
        if (sortValue === "type") return getCardType(a).localeCompare(getCardType(b)) || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name);
      });

      return filtered;
    }

    function renderFullReport() {
      const table = document.getElementById("cardTable");
      const count = document.getElementById("reportCount");
      if (!table) return;

      const viewMode = document.getElementById("viewMode")?.value || "flat";
      const filtered = getFilteredReportCards();

      if (count) {
        count.textContent = `Showing ${filtered.length} of ${fullReportCards.length} cards`;
      }

      table.innerHTML = "";

      if (!filtered.length) {
        const row = document.createElement("tr");
        row.className = "muted-row";
        row.innerHTML = `<td colspan="4">No cards match these filters.</td>`;
        table.appendChild(row);
        return;
      }

      if (viewMode === "flat") {
        filtered.forEach(card => table.appendChild(createReportRow(card)));
        return;
      }

      const groupOrder = viewMode === "type"
        ? ["Creatures", "Instants", "Sorceries", "Artifacts", "Enchantments", "Planeswalkers", "Lands", "Other"]
        : ["No Rank", "Unique Sleepers", "Pet Cards", "Playables", "Commander Favorites", "Commander Staples"];

      const groups = {};
      filtered.forEach(card => {
        const key = viewMode === "type" ? getCardType(card) : card.category;
        groups[key] = groups[key] || [];
        groups[key].push(card);
      });

      groupOrder.forEach(group => {
        const cards = groups[group] || [];
        if (!cards.length) return;

        const groupRow = document.createElement("tr");
        groupRow.className = "group-row";
        groupRow.innerHTML = `<td colspan="4">${group} (${cards.length})</td>`;
        table.appendChild(groupRow);

        cards.forEach(card => table.appendChild(createReportRow(card)));
      });
    }

    function createReportRow(card) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><a href="${card.scryfall_uri}" target="_blank" rel="noopener noreferrer">${escapeHtml(card.name)}</a></td>
        <td>${formatRank(card.edhrec_rank)}</td>
        <td>${card.category}</td>
        <td><span class="card-score-hot">${card.points}</span> / 100</td>
      `;
      return row;
    }

    function renderCompactRows(containerId, cardList) {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = "";

      if (!cardList.length) {
        const row = document.createElement("tr");
        row.innerHTML = `<td colspan="3">No cards found</td>`;
        container.appendChild(row);
        return;
      }

      cardList.forEach(card => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td><a href="${card.scryfall_uri}" target="_blank" rel="noopener noreferrer">${escapeHtml(card.name)}</a></td>
          <td>${formatRank(card.edhrec_rank)}</td>
          <td><span class="card-score-hot">${card.points}</span> / 100</td>
        `;
        container.appendChild(row);
      });
    }

    function renderRows(containerId, cardList) {
      const container = document.getElementById(containerId);
      container.innerHTML = "";

      if (!cardList.length) {
        const row = document.createElement("tr");
        row.innerHTML = `<td colspan="4">No cards found</td>`;
        container.appendChild(row);
        return;
      }

      cardList.forEach(card => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td><a href="${card.scryfall_uri}" target="_blank" rel="noopener noreferrer" style="color: inherit;">${escapeHtml(card.name)}</a></td>
          <td>${formatRank(card.edhrec_rank)}</td>
          <td>${card.category}</td>
          <td><span class="card-score-hot">${card.points}</span> / 100</td>
        `;
        container.appendChild(row);
      });
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }