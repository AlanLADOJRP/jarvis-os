import { PrismaClient, DayOfWeek, NutritionSource } from "@prisma/client";
import { nutritionCatalog } from "../src/data/nutrition-catalog";

const prisma = new PrismaClient();
const demoUserId = "demo-user";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  await prisma.user.upsert({
    where: { id: demoUserId },
    update: {
      timezone: "America/Chicago",
      name: "JARVIS Demo",
    },
    create: {
      id: demoUserId,
      name: "JARVIS Demo",
      timezone: "America/Chicago",
    },
  });

  await prisma.userSettings.upsert({
    where: { userId: demoUserId },
    update: {
      dailyCalorieGoal: 1200,
      timezone: "America/Chicago",
    },
    create: {
      userId: demoUserId,
      dailyCalorieGoal: 1200,
      timezone: "America/Chicago",
    },
  });

  await prisma.nutritionGoal.upsert({
    where: { id: "default-goal" },
    update: {
      dailyCalories: 1200,
    },
    create: {
      id: "default-goal",
      userId: demoUserId,
      dailyCalories: 1200,
    },
  });

  for (const item of nutritionCatalog) {
    const slug = slugify(`${item.restaurant ?? "food"}-${item.name}`);
    await prisma.foodCatalogItem.upsert({
      where: { slug },
      update: {
        name: item.name,
        aliases: item.aliases,
        restaurant: item.restaurant,
        servingSize: item.servingSize,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        fiber: null,
        source: NutritionSource.BUILT_IN_CATALOG,
        isBuiltIn: true,
      },
      create: {
        slug,
        name: item.name,
        aliases: item.aliases,
        restaurant: item.restaurant,
        servingSize: item.servingSize,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        fiber: null,
        source: NutritionSource.BUILT_IN_CATALOG,
        isBuiltIn: true,
      },
    });
  }

  const scheduleDefaults: Array<{ dayOfWeek: DayOfWeek; scheduled: boolean; label: string }> = [
    { dayOfWeek: DayOfWeek.MONDAY, scheduled: true, label: "Upper Body" },
    { dayOfWeek: DayOfWeek.TUESDAY, scheduled: true, label: "Cardio" },
    { dayOfWeek: DayOfWeek.WEDNESDAY, scheduled: false, label: "Recovery" },
    { dayOfWeek: DayOfWeek.THURSDAY, scheduled: true, label: "Lower Body" },
    { dayOfWeek: DayOfWeek.FRIDAY, scheduled: true, label: "Conditioning" },
    { dayOfWeek: DayOfWeek.SATURDAY, scheduled: false, label: "Flex Day" },
    { dayOfWeek: DayOfWeek.SUNDAY, scheduled: false, label: "Rest" },
  ];

  for (const schedule of scheduleDefaults) {
    await prisma.gymSchedule.upsert({
      where: {
        userId_dayOfWeek: {
          userId: demoUserId,
          dayOfWeek: schedule.dayOfWeek,
        },
      },
      update: schedule,
      create: {
        userId: demoUserId,
        ...schedule,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
