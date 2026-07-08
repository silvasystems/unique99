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
