import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...\n");

  // ===== 1. Ponds =====
  console.log("Creating ponds...");
  const leisurePond = await prisma.pond.upsert({
    where: { id: "pond-leisure" },
    update: {},
    create: {
      id: "pond-leisure",
      type: "LEISURE",
      name_zh: "休闲塘",
      name_en: "Leisure Pond",
      name_th: "บ่อพักผ่อน",
      description_zh: "适合家庭休闲，环境优美，按时间段预订",
      description_en: "Perfect for family leisure, book by time slot",
      description_th: "เหมาะสำหรับครอบครัว จองตามช่วงเวลา",
      price: 100,
      priceUnit: "SLOT",
      maxSpots: 30,
      isActive: true,
    },
  });

  const competitionPond = await prisma.pond.upsert({
    where: { id: "pond-competition" },
    update: {},
    create: {
      id: "pond-competition",
      type: "COMPETITION",
      name_zh: "竞赛塘",
      name_en: "Competition Pond",
      name_th: "บ่อแข่งขัน",
      description_zh: "专业钓友首选，全天竞赛，最少10人起订",
      description_en: "For competitive anglers, full-day events, min 10 participants",
      description_th: "สำหรับนักตกปลามืออาชีพ จองเต็มวัน ขั้นต่ำ 10 คน",
      price: 500,
      priceUnit: "DAY",
      minParticipants: 10,
      maxSpots: 40,
      isActive: true,
    },
  });
  console.log(`  ✅ ${leisurePond.name_zh} (${leisurePond.maxSpots} spots, ${leisurePond.price} THB/${leisurePond.priceUnit})`);
  console.log(`  ✅ ${competitionPond.name_zh} (${competitionPond.maxSpots} spots, ${competitionPond.price} THB/${competitionPond.priceUnit}, min ${competitionPond.minParticipants} participants)`);

  // ===== 2. Spots =====
  console.log("Creating spots...");

  // Leisure spots (1-30)
  for (let i = 1; i <= 30; i++) {
    await prisma.spot.upsert({
      where: { pondId_number: { pondId: "pond-leisure", number: i } },
      update: {},
      create: {
        pondId: "pond-leisure",
        number: i,
        isActive: true,
      },
    });
  }

  // Competition spots (1-40)
  for (let i = 1; i <= 40; i++) {
    await prisma.spot.upsert({
      where: { pondId_number: { pondId: "pond-competition", number: i } },
      update: {},
      create: {
        pondId: "pond-competition",
        number: i,
        isActive: true,
      },
    });
  }
  console.log(`  ✅ 30 Leisure spots + 40 Competition spots = 70 total`);

  // ===== 3. Menu Categories =====
  console.log("Creating menu categories...");
  const catRice = await prisma.menuCategory.upsert({
    where: { id: "cat-rice" },
    update: {},
    create: {
      id: "cat-rice",
      name_zh: "米饭面食",
      name_en: "Rice & Noodles",
      name_th: "ข้าวและก๋วยเตี๋ยว",
      type: "FOOD",
      sortOrder: 1,
    },
  });

  const catGrill = await prisma.menuCategory.upsert({
    where: { id: "cat-grill" },
    update: {},
    create: {
      id: "cat-grill",
      name_zh: "烧烤",
      name_en: "Grill & BBQ",
      name_th: "ปิ้งย่าง",
      type: "FOOD",
      sortOrder: 2,
    },
  });

  const catSnack = await prisma.menuCategory.upsert({
    where: { id: "cat-snack" },
    update: {},
    create: {
      id: "cat-snack",
      name_zh: "小食",
      name_en: "Snacks",
      name_th: "ขนมขบเคี้ยว",
      type: "FOOD",
      sortOrder: 3,
    },
  });

  const catDrink = await prisma.menuCategory.upsert({
    where: { id: "cat-drink" },
    update: {},
    create: {
      id: "cat-drink",
      name_zh: "饮料",
      name_en: "Drinks",
      name_th: "เครื่องดื่ม",
      type: "DRINK",
      sortOrder: 4,
    },
  });

  const catBeer = await prisma.menuCategory.upsert({
    where: { id: "cat-beer" },
    update: {},
    create: {
      id: "cat-beer",
      name_zh: "啤酒",
      name_en: "Beer",
      name_th: "เบียร์",
      type: "DRINK",
      sortOrder: 5,
    },
  });
  console.log(`  ✅ 5 categories`);

  // ===== 4. Menu Items =====
  console.log("Creating menu items...");
  const items = [
    // Rice & Noodles
    { id: "item-pad-thai", cat: "cat-rice", zh: "泰式炒河粉", en: "Pad Thai", th: "ผัดไทย", price: 80, popular: true, veg: true, spice: 1 },
    { id: "item-fried-rice", cat: "cat-rice", zh: "泰式炒饭", en: "Thai Fried Rice", th: "ข้าวผัด", price: 70, popular: true, veg: true, spice: 1 },
    { id: "item-noodle-soup", cat: "cat-rice", zh: "泰式汤面", en: "Noodle Soup", th: "ก๋วยเตี๋ยวน้ำ", price: 60, popular: false, veg: false, spice: 2 },
    { id: "item-curry-rice", cat: "cat-rice", zh: "咖喱饭", en: "Curry Rice", th: "ข้าวแกง", price: 90, popular: false, veg: false, spice: 3 },

    // Grill & BBQ
    { id: "item-grilled-fish", cat: "cat-grill", zh: "烤鱼", en: "Grilled Fish", th: "ปลาย่าง", price: 120, popular: true, veg: false, spice: 1 },
    { id: "item-grilled-shrimp", cat: "cat-grill", zh: "烤虾", en: "Grilled Shrimp", th: "กุ้งย่าง", price: 150, popular: true, veg: false, spice: 0 },
    { id: "item-bbq-squid", cat: "cat-grill", zh: "烤鱿鱼", en: "BBQ Squid", th: "ปลาหมึกย่าง", price: 100, popular: false, veg: false, spice: 1 },
    { id: "item-grilled-chicken", cat: "cat-grill", zh: "烤鸡", en: "Grilled Chicken", th: "ไก่ย่าง", price: 80, popular: true, veg: false, spice: 2 },

    // Snacks
    { id: "item-spring-roll", cat: "cat-snack", zh: "春卷", en: "Spring Rolls", th: "ปอเปี้ย", price: 50, popular: true, veg: true, spice: 0 },
    { id: "item-som-tam", cat: "cat-snack", zh: "青木瓜沙拉", en: "Som Tam (Papaya Salad)", th: "ส้มตำ", price: 60, popular: true, veg: true, spice: 3 },
    { id: "item-fries", cat: "cat-snack", zh: "薯条", en: "French Fries", th: "เฟรนช์ฟรายส์", price: 45, popular: false, veg: true, spice: 0 },

    // Drinks
    { id: "item-thai-tea", cat: "cat-drink", zh: "泰式奶茶", en: "Thai Iced Tea", th: "ชาเย็น", price: 40, popular: true, veg: true, spice: 0 },
    { id: "item-coconut", cat: "cat-drink", zh: "椰子水", en: "Fresh Coconut", th: "น้ำมะพร้าว", price: 50, popular: true, veg: true, spice: 0 },
    { id: "item-cola", cat: "cat-drink", zh: "可乐", en: "Coca Cola", th: "โคคาโคล่า", price: 25, popular: false, veg: true, spice: 0 },
    { id: "item-water", cat: "cat-drink", zh: "矿泉水", en: "Mineral Water", th: "น้ำเปล่า", price: 15, popular: false, veg: true, spice: 0 },
    { id: "item-orange-juice", cat: "cat-drink", zh: "鲜榨橙汁", en: "Fresh Orange Juice", th: "น้ำส้มคั้น", price: 45, popular: false, veg: true, spice: 0 },

    // Beer
    { id: "item-chang", cat: "cat-beer", zh: "象牌啤酒", en: "Chang Beer", th: "เบียร์ช้าง", price: 60, popular: true, veg: true, spice: 0 },
    { id: "item-singha", cat: "cat-beer", zh: "狮牌啤酒", en: "Singha Beer", th: "เบียร์สิงห์", price: 65, popular: true, veg: true, spice: 0 },
    { id: "item-leo", cat: "cat-beer", zh: "豹牌啤酒", en: "Leo Beer", th: "เบียร์ลีโอ", price: 55, popular: false, veg: true, spice: 0 },
  ];

  let itemCount = 0;
  for (const item of items) {
    await prisma.menuItem.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        categoryId: item.cat,
        name_zh: item.zh,
        name_en: item.en,
        name_th: item.th,
        price: item.price,
        isPopular: item.popular,
        isVegetarian: item.veg,
        spiceLevel: item.spice,
        sortOrder: itemCount + 1,
      },
    });
    itemCount++;
  }
  console.log(`  ✅ ${itemCount} menu items`);

  // ===== 5. Admin User =====
  console.log("Creating admin user...");
  const hashedPassword = await bcrypt.hash("Admin@2026", 10);
  await prisma.adminUser.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password: hashedPassword,
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });
  console.log(`  ✅ Admin user (username: admin, role: SUPER_ADMIN)`);

  console.log("\n🎉 Seed completed successfully!");

  // ===== Verify =====
  const pondCount = await prisma.pond.count();
  const spotCount = await prisma.spot.count();
  const catCount = await prisma.menuCategory.count();
  const menuItemCount = await prisma.menuItem.count();
  const adminCount = await prisma.adminUser.count();

  console.log(`\n📊 Database summary:`);
  console.log(`   Ponds: ${pondCount}`);
  console.log(`   Spots: ${spotCount}`);
  console.log(`   Categories: ${catCount}`);
  console.log(`   Menu Items: ${menuItemCount}`);
  console.log(`   Admin Users: ${adminCount}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
