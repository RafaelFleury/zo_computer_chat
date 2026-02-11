/**
 * Load .env before any other modules that depend on process.env.
 * Must be imported first in index.js so env vars are available when
 * llmClient, settingsManager, etc. are instantiated.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
