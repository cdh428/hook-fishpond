import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...\n");

  // ===== 1. Zones (鱼塘区域) =====
  console.log("Creating zones...");
  const zoneA = await prisma.zone.upsert({
    where: { id: "zone-a" },
    update: {},
    create: {
      id: "zone-a",
      name_zh: "A区 休闲塘",
      name_en: "Zone A - Leisure Pond",
      name_th: "โซน A - บ่อพักผ่อน",
      description: "适合家庭休闲，环境优美",
      sortOrder: 1,
    },
  });

  const zoneB = await prisma.zone.upsert({
    where: { id: "zone-b" },
    update: {},
    create: {
      id: "zone-b",
      name_zh: "B区 竞技塘",
      name_en: "Zone B - Competition Pond",
      name_th: "โซน B - บ่อแข่งขัน",
      description: "专业钓友首选，鱼种丰富",
      sortOrder: 2,
    },
  });

  const zoneC = await prisma.zone.upsert({
    where: { id: "zone-c" },
    update: {},
    create: {
      id: "zone-c",
      name_zh: "C区 VIP塘",
      name_en: "Zone C - VIP Pond",
      name_th: "โซน C - บ่อ VIP",
      description: "私密空间，高端体验",
      sortOrder: 3,
    },
  });
  console.log(`  ✅ ${zoneA.name_zh}, ${zoneB.name_zh}, ${zoneC.name_zh}`);

  // ===== 2. Spots (钓位) =====
  console.log("Creating spots...");
  const spotData = [
    { zone: "zone-a", number: 1, priceHalf: 150, priceFull: 250 },
    { zone: "zone-a", number: 2, priceHalf: 150, priceFull: 250 },
    { zone: "zone-a", number: 3, priceHalf: 150, priceFull: 250 },
    { zone: "zone-a", number: 4, priceHalf: 150, priceFull: 250 },
    { zone: "zone-a", number: 5, priceHalf: 150, priceFull: 250 },
    { zone: "zone-a", number: 6, priceHalf: 150, priceFull: 250 },
    { zone: "zone-b", number: 1, priceHalf: 200, priceFull: 350 },
    { zone: "zone-b", number: 2, priceHalf: 200, priceFull: 350 },
    { zone: "zone-b", number: 3, priceHalf: 200, priceFull: 350 },
    { zone: "zone-b", number: 4, priceHalf: 200, priceFull: 350 },
    { zone: "zone-c", number: 1, priceHalf: 300, priceFull: 500 },
    { zone: "zone-c", number: 2, priceHalf: 300, priceFull: 500 },
  ];

  for (const s of spotData) {
    await prisma.spot.upsert({
      where: { zoneId_number: { zoneId: s.zone, number: s.number } },
      update: {},
      create: {
        zoneId: s.zone,
        number: s.number,
        priceHalf: s.priceHalf,
        priceFull: s.priceFull,
      },
    });
  }
  console.log(`  ✅ ${spotData.length} spots created`);

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
  console.log(`  ✅ ${[catRice, catGrill, catSnack, catDrink, catBeer].length} categories`);

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

  console.log("\n🎉 Seed completed successfully!");
  
  // Verify
  const zoneCount = await prisma.zone.count();
  const spotCount = await prisma.spot.count();
  const catCount = await prisma.menuCategory.count();
  const menuItemCount = await prisma.menuItem.count();
  console.log(`\n📊 Database summary:`);
  console.log(`   Zones: ${zoneCount}`);
  console.log(`   Spots: ${spotCount}`);
  console.log(`   Categories: ${catCount}`);
  console.log(`   Menu Items: ${menuItemCount}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
