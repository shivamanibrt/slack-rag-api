import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import type { Request, Response } from 'express';
import { dbConnection } from './lib/config/db-client.js';
import knowledgeRoute from './routes/knowledge-routes.js';
import { requestLogger } from './lib/utils/request-Logger.js';

const app = express();
const PORT = process.env.PORT || '3000';

app.use(express.json());
app.use(cors());

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

//database
await dbConnection();

// Default endpoint
app.get('/api', (req: Request, res: Response) => {
  res.send('Slack knowledge Backend API is running!');
});

app.use(requestLogger);

//Routes
app.use('/api', knowledgeRoute);

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server is running on port http://localhost:${PORT}`);
});
