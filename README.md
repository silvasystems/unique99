# Unique 99

Unique 99 is a Commander deck uniqueness scoring tool.

Paste a Commander decklist, analyze card popularity using Scryfall EDHREC rank data, and get a uniqueness score out of 100.

## Project Structure

```txt
unique99/
  index.html
  styles.css
  app.js
  README.md
  .gitignore
```

## Current Notes

This cleanup build restores the simple U99 text logo and removes the need for mana image assets. Mana colors are now CSS pips, so there is no `assets` folder required for the current version.

## Deploying on Vercel

This is a static site.

Recommended Vercel settings:

- Framework Preset: Other
- Build Command: leave empty
- Output Directory: leave empty or `.`
- Install Command: leave empty


## Mana Symbol Assets

This build expects these files inside the `assets` folder:

```txt
assets/mana-w.png
assets/mana-u.png
assets/mana-b.png
assets/mana-r.png
assets/mana-g.png
```

Do not upload these mana files to the root of the repository. They must be inside `assets/`.


## Feedback Round Update

Layout changes:
- Left side now prioritizes commander identity, score, verdict, stats, and score explanation.
- Right side starts with Deck at a Glance.
- Removed Deck Identity section.
- Renamed quick tables to Most Common Cards and Most Unique Cards.
- Moved report filter explanation under Full Card Report.
- Tried brighter neon blue theme.


## Compare Mode and Suggestions Update

Added:
- Compare Mode UI
- All Commander Decks mode
- Commander-Aware experimental scoring mode
- This Commander disabled/coming soon mode
- Updated EDHREC rank scale through 31,000
- Suggested Adds
- Synergy Picks
- Unique Picks
- Swap Ideas

Backend/API caching is still a future upgrade.


## Swap Logic Hotfix

Updated Swap Ideas so they only show optional uniqueness upgrades:
- cut card must be common/staple leaning
- add card must score much higher
- add card cannot be a Commander Staple or Commander Favorite
- copy clarifies these are not strict power-level recommendations


## Backend Analyze Update

Added:

```txt
api/analyze.js
package.json
vercel.json
```

The frontend now tries `/api/analyze` first. If the backend is unavailable, it falls back to the original browser-based analysis.

Backend benefits:
- batched Scryfall card lookups using `/cards/collection`
- fewer browser requests
- simple in-memory cache while the function instance is warm
- backend-ready path for better suggestions and future commander-specific comparison

Deploy notes:
- This is still a simple Vercel project.
- Keep the static files in the repo root.
- Keep mana assets inside `assets/`.
- Vercel should automatically detect and deploy the `api/analyze.js` function.


## Suggestion Logic Cleanup

Updated suggestion logic:
- Synergy Picks now avoid obvious staples when possible.
- Unique Picks intentionally prioritize deeper EDHREC ranks.
- Unique Picks filter out Commander Staples and Commander Favorites.
- Swap Ideas only use Unique Picks that are meaningful uniqueness upgrades.


## Feedback Cleanup + Partner Commander Update

Updated:
- Moved Compare Mode above commander entry.
- Added two optional partner/background commander fields.
- Removed visible compare mode note from results.
- Moved score calculation and score improvement notes to the bottom of the results page.
- Moved the score band guide and EDHREC rank table to the correct sections.
- Removed the No Rank bucket from UI and reporting.
- Reordered stat cards.
- Fixed backend decklist send variable.
- Combined partner commander color identities for mana symbols when the backend is used.


## Compact Compare + Partner Cleanup

Updated:
- Compare Mode is now three compact cards in one row on desktop.
- Partner commander input was simplified to one optional box.
- Unique Sleepers now scale from 76 to 100 instead of stopping at 95.


## Compare Mode Cleanup

Updated:
- Removed the disabled "This Commander" card from Compare Mode.
- Added a small coming soon note for same-commander comparison.
- Cleaned up Compare Mode text.
- Updated commander field helper copy.


## Score Label Update

Renamed:
- Deck Uniqueness Score -> Adjusted Deck Score
- Average card score -> Card Score Average
