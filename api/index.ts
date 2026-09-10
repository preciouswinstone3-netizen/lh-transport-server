// Vercel serverless entry point.
//
// Vercel treats every file under /api as its own serverless function. Rather
// than re-implementing routing here, we reuse the exact same Express app that
// `src/index.ts` runs locally (see createApp()) and hand it to Vercel's Node
// runtime, which knows how to call an Express app as a (req, res) handler.
//
// vercel.json rewrites every incoming request to this function, so req.url
// still contains the original path (e.g. /api/auth/login) and Express's own
// `/api/...` route mounts in app.ts continue to work unchanged.
import { createApp } from '../src/app';

const app = createApp();

export default app;
