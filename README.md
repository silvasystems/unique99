# Unique 99

Unique 99 is a Commander deck uniqueness scoring tool.

Paste a Commander decklist, and U99 scores every card by its Scryfall EDHREC rank, then gives the deck a uniqueness score out of 100. Results include the commander's art, card images for the whole deck, and a filterable card-by-card report.

## Project structure

```txt
unique99/
  index.html      page markup
  styles.css      all styling
  app.js          parsing, Scryfall lookups, scoring, rendering
  assets/         logo and mana symbol images
  vercel.json
```

It's a static site with no build step and no backend. Everything runs in the browser.

## How card lookup works

1. The decklist is parsed. Moxfield, Archidekt, MTGO, and plain text formats work, including set codes and collector numbers like `1 Sol Ring (FIC) 358 *F*`. A `Commander` section is detected automatically; `Sideboard` and `Maybeboard` sections are ignored; basic lands are skipped.
2. All cards are sent to Scryfall's [`/cards/collection`](https://scryfall.com/docs/api/cards/collection) endpoint in batches of 75. A 100-card deck takes one or two requests.
   - When a set code and collector number are given, that exact printing is used, so the images match your printings.
   - Any printing Scryfall doesn't recognize is retried by card name.
   - Anything still missing gets a fuzzy-name lookup to catch typos (for example, "Swords to Plowshare").
3. Results are cached in `localStorage` for 7 days, so analyzing the same deck again is instant.

Only cards that still can't be matched are listed as "not found."

## Scoring

| Category            | EDHREC rank | Card score | Deck bonus |
| ------------------- | ----------- | ---------- | ---------- |
| Commander Staples   | 1–400       | 1–27       | −2         |
| Commander Favorites | 401–1,000   | 28–49      | −1         |
| Playables           | 1,001–2,000 | 50–69      | 0          |
| Pet Cards           | 2,001–7,000 | 70–85      | +2         |
| Unique Sleepers     | 7,001+      | 86–100     | +3         |

Deck score = rounded average card score + the bonus for the most common category. Cards with no EDHREC rank score 100.

**Same commander mode** scores each card by how often it appears in decks with your commander, using EDHREC's public commander data (`json.edhrec.com/pages/commanders/<slug>.json`, fetched straight from the browser). Partner pairs use the combined page.

| Category            | In your commander's decks | Card score |
| ------------------- | ------------------------- | ---------- |
| Commander Staples   | 40%+                      | 1–27       |
| Commander Favorites | 20–40%                    | 28–49      |
| Playables           | 10–20%                    | 50–69      |
| Pet Cards           | 5–10%                     | 70–85      |
| Unique Sleepers     | under 5%                  | 86–100     |

EDHREC only lists cards in about 5% or more of a commander's decks, so unlisted cards are Unique Sleepers: 100, or 94 if the card is a global staple. If EDHREC has no page for the commander, scoring falls back to global ranks and says so.

**Commander-aware mode** (experimental) adds up to +10 for cards that match the deck's detected themes, plus +2 for staying in the commander's colors.

## Other features

- **Deck stats:** a mana curve and card type chart, compared with EDHREC's average deck for your commander when that data exists.
- **Score colors and themes:** the score ring changes color by score band, and the page accent follows your commander's colors.
- **Recent decks:** the last analyses are saved in `localStorage`. Re-analyzing an edited version of a deck shows how much the score changed.
- **Share links:** the decklist, commanders, and mode are compressed into the URL hash (`#d=…`), so the link reproduces the results with no server.
- **Share images:** a 4:5 post or 9:16 story image is drawn on a canvas, downloadable as PNG or PDF (jsPDF is loaded from cdnjs only when needed).

## Running locally

Any static file server works, for example:

```bash
npx http-server . -p 5199
```

## Deploying on Vercel

- Framework preset: Other
- Build command: leave empty
- Output directory: leave empty or `.`

## Changelog

### v2.1 — same-commander scoring, sharing, history

- Added "Same commander" compare mode using EDHREC commander data, with per-card "played in X% of decks" info.
- Added share links, post/story share images, and PDF export.
- Added recent decks with score change tracking.
- Added mana curve and card type charts, score band colors, commander color themes, and a card-flip loading animation.

### v2.0 — lookup fix + UI overhaul

- Fixed most cards showing as "not found." The old frontend called backend functions that didn't exist, so it always fell back to one Scryfall request per card and got rate-limited after about 20 cards. Lookups are now batched.
- Removed the unused `api/analyze.js` backend.
- Added card images throughout: commander card and art backdrop, image strips for the most common and most unique cards, a card grid view, hover previews in list view, and a card detail popup with a flip button for double-faced cards.
- Redesigned the layout, added a score ring, a category breakdown bar with clickable legend, and better mobile layout.
- Parser now handles Archidekt categories, `Commander` / `Sideboard` sections, and partner commanders from the decklist.
