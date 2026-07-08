# Unique 99

Unique 99 is a Commander deck uniqueness scoring tool.

Paste a Commander decklist, analyze card popularity using Scryfall EDHREC rank data, and get a uniqueness score out of 100.

## Project Structure

```txt
unique99/
  index.html
  styles.css
  app.js
  assets/
    mana-w.png
    mana-u.png
    mana-b.png
    mana-r.png
    mana-g.png
```

## Local Testing

Open `index.html` in your browser.

## Deploying on Vercel

This is still a static site.

Recommended Vercel settings:

- Framework Preset: Other
- Build Command: leave empty
- Output Directory: leave empty or `.`
- Install Command: leave empty

## Notes

Scryfall lookups are still handled in the browser through `app.js`.

Future upgrade path:
- Add a backend/API route for Scryfall lookup
- Cache card data
- Improve commander art loading
- Move to Next.js if needed


## Quick Polish Update

Added:
- lookup progress bar
- small confetti burst after analysis
- U99 verdict line
- readable score emphasis in reports
- favicon


## Logo + Mobile Fix Update

Added:
- `assets/u99-logo.svg`
- CSS-only mana pips for reliable mobile display
- consistent mobile background glow
