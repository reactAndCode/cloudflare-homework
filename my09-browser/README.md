# my09-browser

AI Browser Agent application using Cloudflare Workers, Durable Objects, Vercel AI SDK, `@cf/zai-org/glm-4.7-flash`, and CDP-based Browser tools.

## Tech Stack
- **Frontend**: React, TailwindCSS, Vite, Vercel AI SDK, `agents/react`, `agents/ai-react`
- **Backend**: Cloudflare Workers, Durable Objects (SQLite Persistence), `@cloudflare/ai-chat`
- **AI Model**: `@cf/zai-org/glm-4.7-flash` (Workers AI)
- **Tools**: Browser Automation via `agents/browser/ai`

## Project Setup & Commands

```bash
# Install dependencies
npm install

# Run locally in dev mode
npm run dev

# Build project
npm run build
```
