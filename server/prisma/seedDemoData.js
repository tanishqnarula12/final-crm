// Optional demo-data seed. Populates the same illustrative clients/goals that
// used to live in the frontend's localStorage fallback (services/db.js
// `seedData`), so a freshly migrated database isn't empty. This is NOT a
// production data migration — there was no real client data to preserve (the
// old Supabase tables were never actually reachable; the app was always
// falling back to this same mock data). Safe to skip in a real deployment.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const CURRENT_MONTH = now.getMonth() + 1;

const demoClients = [
  {
    id: 'c1', name: 'Aarav Sharma', pan: 'ABCPS1234A', age: 34,
    clientDetails: { mobile: '+91 98765 43210', email: 'aarav@example.com', clientType: 'HNI', dob: '1992-05-15', profession: 'Salaried – Private Sector', status: 'Active', familyDetails: [{ name: 'Nisha Sharma', relation: 'Spouse', pan: 'XYZPN5678B', dob: '1994-08-22' }] },
    goals: [
      { id: 'g1', name: 'Financial Freedom', amount: 50000000, targetMonth: 4, targetYear: CURRENT_YEAR + 25, createdMonth: CURRENT_MONTH, createdYear: CURRENT_YEAR, inflation: 6, expectedReturn: 12, sipIncRate: 10, currentInv: 500000, currentSip: 25000 },
      { id: 'g2', name: 'Kids Education', amount: 4000000, targetMonth: 6, targetYear: CURRENT_YEAR + 12, createdMonth: CURRENT_MONTH, createdYear: CURRENT_YEAR, inflation: 8, expectedReturn: 11, sipIncRate: 8, currentInv: 200000, currentSip: 15000, kidName: 'Aanya' },
    ],
  },
  {
    id: 'c2', name: 'Priya Patel', pan: 'BXYPP5678B', age: 41,
    clientDetails: { mobile: '+91 91234 56789', email: 'priya@example.com', clientType: 'Ultra HNI', dob: '1985-03-10', profession: 'Business', status: 'Active', familyDetails: [] },
    goals: [
      { id: 'g3', name: 'Financial Freedom', amount: 80000000, targetMonth: 3, targetYear: CURRENT_YEAR + 19, createdMonth: CURRENT_MONTH, createdYear: CURRENT_YEAR, inflation: 6, expectedReturn: 11, sipIncRate: 10, currentInv: 1500000, currentSip: 40000 },
      { id: 'g4', name: 'Dream Home', amount: 15000000, targetMonth: 10, targetYear: CURRENT_YEAR + 5, createdMonth: CURRENT_MONTH, createdYear: CURRENT_YEAR, inflation: 7, expectedReturn: 9, sipIncRate: 5, currentInv: 3000000, currentSip: 50000 },
    ],
  },
  {
    id: 'c3', name: 'Rohan Mehta', pan: 'CQRPM9012C', age: 28,
    clientDetails: { mobile: '+91 99887 76655', email: 'rohan@example.com', clientType: 'Retail', dob: '1998-11-05', profession: 'Self-Employed', status: 'Active', familyDetails: [] },
    goals: [
      { id: 'g5', name: 'Financial Freedom', amount: 30000000, targetMonth: 4, targetYear: CURRENT_YEAR + 32, createdMonth: CURRENT_MONTH, createdYear: CURRENT_YEAR, inflation: 6, expectedReturn: 13, sipIncRate: 12, currentInv: 100000, currentSip: 10000 },
    ],
  },
  {
    id: 'c4', name: 'Sneha Iyer', pan: 'DLMPI3456D', age: 38,
    clientDetails: { mobile: '+91 95432 10987', email: 'sneha@example.com', clientType: 'HNI', dob: '1988-07-20', profession: 'Professional', status: 'Active', familyDetails: [] },
    goals: [],
  },
  {
    id: 'c5', name: 'Vikram Singh', pan: 'EFGPS7890E', age: 45,
    clientDetails: { mobile: '+91 90123 45678', email: 'vikram@example.com', clientType: 'Ultra HNI', dob: '1981-12-01', profession: 'Business', status: 'Active', familyDetails: [] },
    goals: [
      { id: 'g6', name: 'Kids Education', amount: 6000000, targetMonth: 7, targetYear: CURRENT_YEAR + 8, createdMonth: CURRENT_MONTH, createdYear: CURRENT_YEAR, inflation: 8, expectedReturn: 11, sipIncRate: 8, currentInv: 800000, currentSip: 30000, kidName: 'Reyansh' },
      { id: 'g7', name: 'Vacation', amount: 2000000, targetMonth: 12, targetYear: CURRENT_YEAR + 3, createdMonth: CURRENT_MONTH, createdYear: CURRENT_YEAR, inflation: 5, expectedReturn: 8, sipIncRate: 0, currentInv: 500000, currentSip: 25000 },
    ],
  },
];

async function main() {
  for (const { goals, ...client } of demoClients) {
    const existing = await prisma.client.findUnique({ where: { id: client.id } });
    if (existing) {
      console.log(`[seed-demo] ${client.name} already exists — skipping.`);
      continue;
    }
    await prisma.client.create({
      data: { ...client, goals: { create: goals } },
    });
    console.log(`[seed-demo] Created ${client.name} with ${goals.length} goal(s).`);
  }
}

main()
  .catch((e) => {
    console.error('[seed-demo] Failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
