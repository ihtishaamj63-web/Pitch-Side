import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'pitch_test';
