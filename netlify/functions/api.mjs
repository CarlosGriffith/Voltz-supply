import 'dotenv/config';
import serverless from 'serverless-http';
import { createApp } from '../../server/app.mjs';

const app = createApp({ storage: 'blobs' });
export const handler = serverless(app);
