import "server-only";
import { getPrisma } from "@/lib/prisma";

export const DEMO_USER_ID = "demo-user";

export async function ensureDefaultUser() {
  const prisma = getPrisma();

  return prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    update: {
      timezone: "America/Chicago",
      name: "JARVIS Demo",
    },
    create: {
      id: DEMO_USER_ID,
      name: "JARVIS Demo",
      timezone: "America/Chicago",
    },
  });
}
