# 🌅 FreeGlow

> Your days off deserve to shine — find local events & age-matched meetup groups on your free days.

Built with React + Vite. Powered by [Groq](https://groq.com) (Llama 3.3 70B).

## Setup

### 1. Clone & install
```bash
git clone https://github.com/YOUR_USERNAME/freeglow.git
cd freeglow
npm install
```

### 2. Add your Groq API key
```bash
cp .env.example .env
```
Then edit `.env` and paste your key from [console.groq.com](https://console.groq.com):
```
VITE_GROQ_API_KEY=gsk_your_key_here
```

### 3. Run locally
```bash
npm run dev
```

---

## Deploy to Vercel

1. Push your repo to GitHub
2. Import the repo at [vercel.com/new](https://vercel.com/new)
3. Go to **Settings → Environment Variables**
4. Add: `VITE_GROQ_API_KEY` → your key
5. Redeploy — done ✅

> ⚠️ Never commit your `.env` file. It's already in `.gitignore` by default with Vite.

---

## Features
- 📋 Enter your recurring work schedule (days of week)
- 📅 Override individual days on the calendar
- ✨ Find local events on your free days
- 👥 Discover age-matched meetup groups & communities
- 🌅 Powered by Groq (Llama 3.3 70B) — fast & free tier

## Stack
- React + Vite
- Groq API (Llama 3.3 70B)
- Zero dependencies beyond React
