import 'dotenv/config';
import { openStore } from '../store.mjs';
const store=openStore(process.env.DATA_DIR || './data');
console.log(store.cleanup()); store.db.close();
