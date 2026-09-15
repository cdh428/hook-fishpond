# Hook Fishpond V2 — Architecture Outline

## 1. Business Requirements

### Two Ponds Only
| Pond | Type | Price | Booking Rule |
|------|------|-------|-------------|
| 休闲塘 (Leisure) | Individual | 100 THB per spot | Per time slot (Morning/Afternoon/Evening/Full-day) |
| 竞赛塘 (Competition) | Group event | 500 THB per spot per day | Minimum 10 participants, full-day only |

### User Management
- **Simple phone-based registration** — no password, OTP or link-based verification
- **Collect data at each step**: booking → name + phone + language; ordering → food preferences; checkout → payment method
- **Marketing consent toggle** — opt-in for future product promotions
- **Language preference** stored in profile (zh/en/th)

### Admin Interface (Pond Manager)
- **Separate login** — username/password, not visible in user-facing pages
- **Menu management** — CRUD categories + items, image upload
- **Booking management** — view/edit bookings, competition group validation
- **Transaction reports** — revenue, daily/weekly/monthly, payment method breakdown

### Responsive & Performance
- **Mobile-first** — 375px base, scales to desktop
- **PC / Android / iOS** — touch-friendly + keyboard-friendly
- **Multi-user concurrent** — connection pooling (Supabase pgbouncer port 6543), optimistic UI, debounced API calls

---

## 2. Page Structure

### User-Facing Pages (6 pages)
```
/[locale]                    → Home (2 ponds overview, pricing, CTA)
/[locale]/booking            → Booking (pond type selector → booking form)
/[locale]/menu               → Menu (food + drinks combined, categories tabs)
/[locale]/cart               → Cart + Checkout (combined booking + food order)
/[locale]/orders             → Order History (status tracking)
/[locale]/profile            → User Profile (phone + name + language + consent)
```

### Admin Pages (4 pages)
```
/[locale]/admin              → Dashboard (KPI cards + recent activity)
/[locale]/admin/menu         → Menu Management (CRUD + image upload)
/[locale]/admin/bookings     → Booking Management (calendar view + group validation)
/[locale]/admin/transactions → Transaction Reports (date range + charts)
```

### Removed Pages
- `/drinks` → merged into `/menu` with category tabs (FOOD / DRINK)
- `/admin` simplified → split into 4 focused sub-pages

---

## 3. Database Schema Redesign

### New Models

```prisma
// ===== POND (replaces Zone) =====
model Pond {
  id              String     @id @default(cuid())
  type            PondType   @unique  // LEISURE or COMPETITION
  name_zh         String     // 休闲塘
  name_en         String     // Leisure Pond
  name_th         String     // บ่อพักผ่อน
  description_zh  String?
  description_en  String?
  description_th  String?
  price           Float      // 100 or 500 (THB)
  priceUnit       PriceUnit  // SLOT or DAY
  minParticipants Int?       // null for Leisure, 10 for Competition
  maxSpots        Int        // total spot count
  imageUrl        String?
  isActive        Boolean    @default(true)
  spots           Spot[]
  bookings        Booking[]
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
}

enum PondType {
  LEISURE      // 休闲塘 — 100 THB/spot per time slot
  COMPETITION  // 竞赛塘 — 500 THB/spot per day, min 10 people
}

enum PriceUnit {
  SLOT  // per time slot (leisure)
  DAY   // per spot per day (competition)
}

// ===== SPOT =====
model Spot {
  id        String    @id @default(cuid())
  pondId    String
  pond      Pond      @relation(fields: [pondId], references: [id])
  number    Int       // spot number
  isActive  Boolean   @default(true)
  bookings  Booking[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@unique([pondId, number])
}

// ===== USER =====
model User {
  id              String     @id @default(cuid())
  phone           String     @unique  // primary identifier (Thai format: +66...)
  name            String
  language        String     @default("zh")  // zh/en/th
  marketingConsent Boolean   @default(false)
  bookings        Booking[]
  orders          Order[]
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
}

// ===== ADMIN USER =====
model AdminUser {
  id        String    @id @default(cuid())
  username  String    @unique
  password  String    // hashed
  role      AdminRole @default(MANAGER)
  isActive  Boolean   @default(true)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

enum AdminRole {
  SUPER_ADMIN
  MANAGER
}

// ===== BOOKING =====
model Booking {
  id              String        @id @default(cuid())
  userId          String?
  user            User?          @relation(fields: [userId], references: [id])
  pondId          String
  pond            Pond           @relation(fields: [pondId], references: [id])
  spotId          String?        // null for Competition group bookings
  spot            Spot?          @relation(fields: [spotId], references: [id])
  date            DateTime       @db.Date
  timeSlot        TimeSlot?      // null for Competition (always FULL_DAY)
  participantCount Int?          // null for Leisure, min 10 for Competition
  groupName       String?        // null for Leisure, required for Competition
  customerName    String
  customerPhone   String
  totalPrice      Float
  status          BookingStatus  @default(PENDING)
  orderId         String?
  order           Order?         @relation(fields: [orderId], references: [id])
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  @@unique([spotId, date, timeSlot])  // only for Leisure individual spots
}

enum TimeSlot {
  MORNING    // 06:00-12:00 (Leisure only)
  AFTERNOON  // 12:00-18:00 (Leisure only)
  EVENING    // 18:00-22:00 (Leisure only)
  FULL_DAY   // 06:00-22:00 (both)
}

enum BookingStatus {
  PENDING
  CONFIRMED
  CANCELLED
}

// ===== MENU (unchanged structure) =====
model MenuCategory {
  id       String     @id @default(cuid())
  name_zh  String
  name_en  String
  name_th  String
  type     MenuType   // FOOD or DRINK
  imageUrl String?
  sortOrder Int       @default(0)
  isActive Boolean    @default(true)
  items    MenuItem[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model MenuItem {
  id          String       @id @default(cuid())
  categoryId  String
  category    MenuCategory @relation(fields: [categoryId], references: [id])
  name_zh     String
  name_en     String
  name_th     String
  description_zh String?
  description_en String?
  description_th String?
  price       Float        // THB
  imageUrl    String?
  isPopular   Boolean      @default(false)
  isVegetarian Boolean     @default(false)
  spiceLevel  Int          @default(0)
  isActive    Boolean      @default(true)
  sortOrder   Int          @default(0)
  orderItems  OrderItem[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

enum MenuType {
  FOOD
  DRINK
}

// ===== ORDER & PAYMENT (unchanged structure) =====
model Order {
  id            String        @id @default(cuid())
  orderNumber   String        @unique
  userId        String?
  user          User?         @relation(fields: [userId], references: [id])
  customerName  String
  customerPhone String
  items         OrderItem[]
  bookings      Booking[]
  subtotal      Float
  totalPrice    Float
  note          String?
  status        OrderStatus   @default(PENDING)
  payment       Payment?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
}

model OrderItem {
  id         String   @id @default(cuid())
  orderId    String
  order      Order    @relation(fields: [orderId], references: [id])
  menuItemId String
  menuItem   MenuItem @relation(fields: [menuItemId], references: [id])
  quantity   Int
  unitPrice  Float
  totalPrice Float
  note       String?
  createdAt  DateTime @default(now())
}

enum OrderStatus {
  PENDING
  PAID
  PREPARING
  READY
  CANCELLED
}

model Payment {
  id              String        @id @default(cuid())
  orderId         String        @unique
  order           Order         @relation(fields: [orderId], references: [id])
  method          PaymentMethod
  amount          Float
  currency        String        @default("THB")
  omiseChargeId   String?
  omiseSourceId   String?
  status          PaymentStatus @default(PENDING)
  paidAt          DateTime?
  metadata        Json?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
}

enum PaymentMethod {
  PROMPTPAY
  TRUEMONEY
  BANK_TRANSFER
  CREDIT_CARD
  ALIPAY
  WECHAT_PAY
}

enum PaymentStatus {
  PENDING
  PROCESSING
  SUCCESSFUL
  FAILED
  REFUNDED
}
```

### Key Schema Changes vs V1
| Change | V1 (Old) | V2 (New) |
|--------|----------|----------|
| Pond model | `Zone` (3 zones A/B/C) | `Pond` (2 ponds: Leisure/Competition) |
| Pricing | `priceHalf` + `priceFull` per spot | `price` on Pond (100/500), `priceUnit` (SLOT/DAY) |
| User auth | None (just name+phone per booking) | `User` model (phone-based, persistent profile) |
| Admin | No auth | `AdminUser` model (username/password, roles) |
| Booking | Individual spot only | Both individual (Leisure) + group (Competition) |
| Competition rules | None | `minParticipants=10`, `timeSlot=null`, `participantCount` required |
| Drinks page | Separate `/drinks` | Merged into `/menu` with tabs |

---

## 4. API Routes

### Auth API
```
POST /api/auth/register     → { phone, name, language } → creates User, returns userId
POST /api/auth/login        → { phone } → OTP/link verification, returns session
GET  /api/auth/me           → returns current user profile
PUT  /api/auth/me           → update profile (name, language, marketingConsent)
```

### Pond & Booking API
```
GET  /api/ponds             → list 2 ponds with pricing
GET  /api/ponds/[id]/spots  → list spots for a pond (date param for availability)
POST /api/bookings          → create booking
  - Leisure: { pondId, spotId, date, timeSlot, customerName, customerPhone }
  - Competition: { pondId, date, participantCount, groupName, customerName, customerPhone }
      → validates participantCount >= pond.minParticipants
GET  /api/bookings/[id]     → get booking details
PUT  /api/bookings/[id]     → update booking status (CONFIRMED/CANCELLED)
GET  /api/bookings?userId=X → list user's bookings
```

### Menu API
```
GET  /api/menu/categories   → list categories (type=FOOD/DRINK)
GET  /api/menu/items?categoryId=X → list items in category
GET  /api/menu/items/[id]   → get item details
GET  /api/menu/popular      → list popular items
```

### Order API
```
POST /api/orders            → create order (items + optional booking)
GET  /api/orders?userId=X   → list user's orders
GET  /api/orders/[id]       → get order details
PUT  /api/orders/[id]/status → update order status (admin)
```

### Payment API (existing, enhanced)
```
POST /api/payments/create   → create Omise charge for an order
POST /api/webhooks/omise    → Omise webhook handler (unchanged)
```

### Admin API
```
GET  /api/admin/stats       → dashboard KPIs (today bookings, revenue, active spots, pending orders)
GET  /api/admin/bookings    → list all bookings (date range filter)
PUT  /api/admin/bookings/[id] → update booking (confirm/cancel)

POST /api/admin/menu/categories → create category
PUT  /api/admin/menu/categories/[id] → update category
DELETE /api/admin/menu/categories/[id] → delete category
POST /api/admin/menu/items → create item
PUT  /api/admin/menu/items/[id] → update item
DELETE /api/admin/menu/items/[id] → delete item
POST /api/admin/upload      → image upload (menu/pond images)

GET  /api/admin/transactions → revenue report (date range, payment method breakdown)
```

---

## 5. User Data Collection Strategy

### Booking Step
- **Leisure**: phone + name → auto-create User if new → store language preference
- **Competition**: phone + name + group name + participant count → collect group info for future group event marketing

### Menu/Cart Step
- **Food preferences**: track ordered categories/items per user → recommend popular items in same category
- **Spending patterns**: average order value, frequency → segment users for promotions

### Checkout Step
- **Payment method**: preferred method stored → streamline future payments
- **Marketing consent**: explicit checkbox at checkout → opt-in for promotional notifications

### Profile Page
- **Language preference**: zh/en/th → personalize all future communications
- **Marketing toggle**: user can opt in/out anytime

### Admin Data View
- **Customer list**: name, phone, total visits, total spending, last visit date
- **Group booking leads**: group names, participant counts → follow-up for future events

---

## 6. Responsive Design Approach

### Breakpoints
```
Mobile:  375px — 414px (iPhone/Android phone)
Tablet:  768px — 1024px (iPad/Android tablet)
Desktop: 1280px+ (PC/Mac)
```

### Strategy
- **Mobile-first CSS**: Write base styles for mobile, then `@media (min-width: 768px)` for tablet/desktop
- **Bottom navigation**: Fixed bottom nav on mobile (5 tabs: Home/Booking/Menu/Cart/Profile)
- **Top navigation**: Horizontal nav on desktop (same 5 links + language switcher + login)
- **Card layout**: Single-column cards on mobile, 2-column on tablet, 3-column on desktop
- **Touch targets**: Minimum 44px tap targets on mobile
- **Form inputs**: Full-width on mobile, fixed-width on desktop
- **Booking grid**: 4 columns on mobile (spots), 6 on tablet, 8 on desktop

### Competition Pond Booking UI
- Mobile: Large card with group details form
- Desktop: Side-by-side form with preview panel

---

## 7. Performance & Concurrency

### Database
- **Connection pooling**: Use Supabase pgbouncer (port 6543) for runtime queries — handles concurrent connections
- **Direct connection**: Port 5432 only for CLI commands (prisma db push, seed)
- **PrismaClient singleton**: Already implemented in `src/lib/prisma.ts` with globalThis caching

### API Optimization
- **Menu data**: Cache categories + items in Next.js cache (revalidate: 3600) — menu rarely changes
- **Pond + spot availability**: Dynamic, no cache — real-time booking needs accuracy
- **Optimistic UI**: Update cart/booking state locally before API confirmation, revert on error
- **Debounced requests**: 300ms debounce on quantity changes, spot selection clicks

### Frontend
- **Code splitting**: Next.js automatic per-page splitting
- **Dynamic imports**: Heavy components (admin charts, image upload) loaded on demand
- **Image optimization**: Next.js `<Image>` component with responsive srcsets for menu items
- **Skeleton screens**: Show loading placeholders for menu, booking, orders
- **Offline fallback**: Cache static pages (home, menu) for instant repeat visits

### Admin Performance
- **Transaction reports**: Server-side aggregation, not client-side
- **Image upload**: Compress to max 500KB before upload, use WebP format
- **Dashboard stats**: Pre-computed daily, cached for 5 minutes

---

## 8. Implementation Phases

### Phase 1: Database + Auth (Backend)
- Update Prisma schema (Pond, User, AdminUser, Booking changes)
- Run prisma db push (accept data loss — test version)
- Create seed data: 2 ponds (Leisure 30 spots, Competition 40 spots)
- Implement simple phone-based auth (User model)
- Implement Admin auth (AdminUser model)

### Phase 2: API Routes (Backend)
- Pond + Spot availability API
- Booking API (with Competition group validation)
- Menu API (read-only for users, CRUD for admin)
- Order + Payment API
- Admin API (stats, menu CRUD, image upload, transactions)

### Phase 3: Frontend Pages (Frontend)
- Home page redesign (2 ponds, pricing cards, CTA)
- Booking page redesign (2 modes: Leisure individual + Competition group)
- Menu page (combined food + drinks with tabs)
- Cart + Checkout page (booking + food combined)
- Orders page (history + status tracking)
- Profile page (simple phone + name + language + marketing)

### Phase 4: Admin Pages (Frontend)
- Admin dashboard (KPIs + charts)
- Admin menu management (CRUD + image upload)
- Admin booking management (calendar + group validation)
- Admin transaction reports (date range + breakdown)

### Phase 5: Polish + Deploy
- Responsive testing (375px, 768px, 1280px)
- Performance optimization (caching, skeleton screens, debouncing)
- i18n completion (zh/en/th translations for all new content)
- Vercel deployment + verify all pages
