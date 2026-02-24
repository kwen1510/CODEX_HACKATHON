# ResearchInsight App

This project runs as a Vite + React app with Tailwind compiled locally (no Tailwind CDN).

## Local usage

Prerequisite: Node.js 18+

1. Install dependencies:
   `npm install`
2. Set API key in `.env` or `.env.local`:
   `GEMINI_API_KEY=your_key_here`
   (also supports `API_KEY=your_key_here`)
3. Start dev server:
   `npm run dev`
4. Open:
   `http://localhost:3000`

## Production build

1. Build:
   `npm run build`
2. Preview build:
   `npm run preview`

## Deploy to Vercel

1. Push this project to GitHub.
2. Import the repo in Vercel.
3. In Vercel Project Settings -> Environment Variables, add:
   `GEMINI_API_KEY` (or `API_KEY`)
4. Deploy.

`vercel.json` is included and configured for Vite:
- Build command: `npm run build`
- Output directory: `dist`
