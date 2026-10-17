import { db } from './index.ts';
import { seedDatabase } from './seed.ts';
import * as dotenv from 'dotenv';

dotenv.config();

async function runDevSeeder() {
  console.log("Starting development database seeding...");
  try {
    await db.transaction(async (tx) => {
      await seedDatabase(tx);
    });
    console.log("Development database seeding completed successfully!");
  } catch (error: any) {
    console.error("Development seeding failed:", error.message);
    process.exit(1);
  }
}

runDevSeeder();
