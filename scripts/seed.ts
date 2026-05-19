import 'dotenv/config';
import { seed } from '../src/db/seed';

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
