// Single shared PrismaClient instance for the whole server process.
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Close the pool cleanly on shutdown so migrations / restarts don't hang.
const shutdown = async () => {
  await prisma.$disconnect();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
