# CountryCompass

CountryCompass is a dark-mode country travel dashboard built with Vite, React, and TypeScript. It combines live country discovery, side-by-side comparison, and a trip planner with weather, notes, and packing prep in one responsive interface.

Live URL: https://obrera.github.io/nightshift-032-countrycompass/

Challenge metadata:
- Date: 2026-03-17
- Model: `openai-codex/gpt-5.3-codex`
- Reasoning: `off`

## Capabilities

- Country explorer powered by the REST Countries API with search, region filter, country cards, and quick stats.
- Country compare with up to 3 pinned countries and side-by-side population, area, region, currencies, languages, and timezones.
- Trip planner for the focused country with 5-day capital forecast from Open-Meteo, persistent notes, and a packing checklist stored in `localStorage`.
- Planner JSON import/export for moving saved planning data in and out of the app.

## Setup

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```
