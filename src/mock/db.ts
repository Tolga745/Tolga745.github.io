// In-browser mock database.
// The site is deployed as a static export (GitHub Pages), so there is no server and no MongoDB.
// All data lives in localStorage and is seeded from the data below on first visit.
// Clear localStorage (or call window.__resetMockDb()) to get back to the seed state.

export type Doc = Record<string, any>;

export interface MockDb {
  user: Doc[];
  product: Doc[];
  category: Doc[];
  review: Doc[];
  order: Doc[];
  processedProduct: Doc[];
  shoppingCart: Doc[];
  wishlist: Doc[];
  invoice: Doc[];
  refund: Doc[];
}

const STORAGE_KEY = 'best308_mock_db_v1';

export const DEMO_PASSWORD = 'Password123!';

export function newId(): string {
  let id = '';
  for (let i = 0; i < 24; i++) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function seed(): MockDb {
  const now = new Date().toISOString();
  const user = (
    _id: string,
    username: string,
    firstName: string,
    lastName: string,
    role: string,
    address: string,
    phoneNumber: string,
  ) => ({
    _id,
    username,
    firstName,
    lastName,
    email: `${username}@example.com`,
    password: DEMO_PASSWORD,
    role,
    address,
    phoneNumber,
    taxId: '1234567890',
    createdAt: now,
    updatedAt: now,
  });

  const users = [
    user('112c6359345678f123456789', 'semih', 'Semih', 'Doğan', 'customer', 'Cumhuriyet Caddesi No: 19, Şişli 34363 İstanbul, Türkiye', '+905551112233'),
    user('212c6359345678f123456789', 'ege', 'Ege', 'Yurtsever', 'product_manager', 'İstasyon Caddesi No: 55, Odunpazari 26030 Eskişehir, Türkiye', '+905551112234'),
    user('312c6359345678f123456789', 'burak', 'Burak', 'Ala', 'product_manager', 'Antalya Caddesi No: 14, Muratpaşa 07100 Antalya, Türkiye', '+905551112235'),
    user('412c6359345678f123456789', 'pome', 'Barış', 'Pome', 'sales_manager', 'Konak Sokak No: 22, Konak 35250 İzmir, Türkiye', '+905551112236'),
    user('512c6359345678f123456789', 'tolga', 'Tolga', 'Tektunalı', 'admin', 'Bağdat Caddesi No: 34, Kadiköy 34740 İstanbul, Türkiye', '+905551112237'),
    user('612c6359345678f123456789', 'eren', 'Eren', 'E.', 'customer', 'Atatürk Bulvarı No: 10, Çankaya 06690 Ankara, Türkiye', '+905551112238'),
  ];

  const product = (
    _id: string,
    name: string,
    description: string,
    sex: string,
    category: string,
    costPrice: number,
    salePrice: number,
    total_stock: Record<string, number>,
    available_stock: Record<string, number>,
    imageId: string,
    colors: string[],
    createdDaysAgo: number,
  ) => ({
    _id,
    name,
    description,
    sex,
    category,
    costPrice,
    salePrice,
    total_stock,
    available_stock,
    inStock: Object.values(available_stock).some((v) => v > 0),
    quantity: Object.values(available_stock).reduce((a, b) => a + b, 0),
    imageId,
    sizes: Object.keys(total_stock),
    colors,
    createdAt: daysAgo(createdDaysAgo),
    updatedAt: daysAgo(createdDaysAgo),
  });

  const products = [
    product('122c6359345678f123456789', 'oxford shirt', 'A boxy fit shirt made from tightly woven cotton fabric. It features long sleeves with buttoned cuffs, a collared neckline, and a patch pocket on the chest. The front is buttoned for closure.', 'unisex', 'shirt', 20, 39.99, { XS: 5, S: 25, M: 25, L: 25, XL: 20 }, { XS: 2, S: 25, M: 24, L: 24, XL: 20 }, '192c6359345678f123456789', ['white', 'blue'], 40),
    product('222c6359345678f123456789', 'straight fit jean', 'A straight fit pant made from a blend of linen and cotton. It features front pockets, back patch pockets, and a front zipper with a button closure.', 'unisex', 'jean', 50, 79.99, { XS: 2, S: 4, M: 3, L: 4, XL: 1 }, { XS: 2, S: 4, M: 3, L: 3, XL: 0 }, '292c6359345678f123456789', ['denim blue'], 38),
    product('322c6359345678f123456789', 'faux suede bomber jacket', 'Regular fit bomber jacket made of faux suede fabric, padded on the inside. Features a ribbed elastic collar, long sleeves, welt pockets at the hip and an inside pocket detail. Ribbed trims. Zip-up front.', 'unisex', 'jacket', 35, 59.99, { S: 15, M: 10, L: 12 }, { S: 14, M: 9, L: 11 }, '392c6359345678f123456789', ['brown'], 36),
    product('322c6359345678f123456790', 'cotton crew neck t-shirt', 'Classic fit t-shirt made from soft, breathable cotton. Features a crew neckline and short sleeves.', 'unisex', 't-shirt', 10, 19.99, { S: 25, M: 30, L: 20 }, { S: 23, M: 29, L: 18 }, '492c6359345678f123456790', ['white', 'black', 'gray'], 30),
    product('322c6359345678f123456791', 'slim fit denim jeans', 'Slim fit jeans crafted from stretchable denim fabric. Features a classic 5-pocket design and zip fly with button closure.', 'male', 'jeans', 30, 49.99, { S: 10, M: 15, L: 12 }, { S: 9, M: 14, L: 11 }, '592c6359345678f123456791', ['denim blue'], 28),
    product('322c6359345678f123456792', 'wool blend overcoat', 'Elegant overcoat made from a wool blend. Features a notched lapel, button closure, and two front pockets.', 'unisex', 'coat', 80, 120, { S: 8, M: 6, L: 10 }, { S: 7, M: 6, L: 9 }, '692c6359345678f123456792', ['black', 'gray'], 25),
    product('322c6359345678f123456793', 'athletic running shorts', 'Breathable and lightweight running shorts with an elastic waistband and inner lining for comfort. Features a zip pocket at the back.', 'unisex', 'shorts', 15, 29.99, { S: 12, M: 18, L: 20 }, { S: 12, M: 16, L: 19 }, '792c6359345678f123456793', ['black', 'blue'], 20),
    product('322c6359345678f123456794', 'leather biker jacket', 'Genuine leather biker jacket featuring a classic asymmetrical zip closure, zippered cuffs, and multiple pockets.', 'male', 'jacket', 150, 199.99, { S: 8, M: 12, L: 6 }, { S: 7, M: 11, L: 6 }, '892c6359345678f123456794', ['black'], 15),
    product('322c6359345678f123456795', 'cotton cargo pants', 'Relaxed fit cargo pants made from durable cotton. Features multiple pockets, a drawstring waist, and elastic cuffs.', 'unisex', 'pants', 30, 45.99, { S: 15, M: 18, L: 14 }, { S: 13, M: 16, L: 13 }, '992c6359345678f123456795', ['khaki', 'olive'], 12),
    product('322c6359345678f123456796', 'linen button-down shirt', 'Lightweight linen shirt with a button-down front. Features a spread collar and long sleeves.', 'female', 'shirt', 20, 39.99, { S: 10, M: 20, L: 18 }, { S: 9, M: 18, L: 16 }, '092c6359345678f123456796', ['white', 'blue'], 9),
    product('322c6359345678f123456797', 'knit sweater', 'Cozy knit sweater featuring a round neckline and ribbed trims. Made from soft acrylic wool blend.', 'female', 'sweater', 20, 34.99, { S: 12, M: 14, L: 10 }, { S: 11, M: 12, L: 9 }, '192c6359345678f123456797', ['gray', 'navy'], 6),
    product('322c6359345678f123456798', 'puffer vest', 'Water-resistant puffer vest with lightweight insulation. Features a zip-up front and two side pockets.', 'unisex', 'vest', 40, 59.99, { S: 5, M: 8, L: 7 }, { S: 4, M: 7, L: 6 }, '292c6359345678f123456798', ['black', 'green'], 3),
    product('322c6359345678f123456799', 'graphic print hoodie', 'Relaxed fit hoodie with a front kangaroo pocket and graphic print on the back. Made from a cotton-poly blend.', 'unisex', 'hoodie', 30, 49.99, { S: 20, M: 25, L: 30 }, { S: 19, M: 24, L: 29 }, '392c6359345678f123456799', ['black', 'white'], 1),
  ];

  const categoryNames = Array.from(new Set(products.map((p) => p.category)));
  const categories = categoryNames.map((name, i) => ({
    _id: `a${(i + 1).toString(16).padStart(23, '0')}`,
    name,
    image: products.find((p) => p.category === name)!.imageId,
    createdAt: now,
    updatedAt: now,
  }));

  const review = (_id: string, comment: string, rating: number, user_id: string, product_id: string, approved = true, d = 5) => ({
    _id, comment, rating, user_id, product_id, approved, createdAt: daysAgo(d), updatedAt: daysAgo(d),
  });
  const reviews = [
    review('223c6359345678f145676794', 'Very good quality, worth the buy!', 4, '512c6359345678f123456789', '322c6359345678f123456794'),
    review('223c6359345678f145676795', 'Absolutely love the fit and feel of this shirt!', 5, '112c6359345678f123456789', '122c6359345678f123456789'),
    review('223c6359345678f145676796', 'Great value for money, highly recommend.', 4, '212c6359345678f123456789', '322c6359345678f123456793'),
    review('223c6359345678f145676797', 'Nice quality but sizing was slightly off.', 3, '312c6359345678f123456789', '322c6359345678f123456790'),
    review('223c6359345678f145676798', 'Very comfortable and stylish, would buy again.', 5, '412c6359345678f123456789', '322c6359345678f123456791'),
    review('223c6359345678f145676799', 'Good quality, but delivery took longer than expected.', 2, '612c6359345678f123456789', '322c6359345678f123456792'),
    review('223c6359345678f145676700', 'Fantastic material and really comfortable!', 5, '112c6359345678f123456789', '322c6359345678f123456790'),
    review('223c6359345678f145676701', 'Nice design, but the fit is a bit loose.', 3, '212c6359345678f123456789', '122c6359345678f123456789'),
    review('223c6359345678f145676702', 'Love the color and style, goes well with anything!', 4, '312c6359345678f123456789', '322c6359345678f123456791'),
    review('223c6359345678f145676703', 'Not as expected, material feels cheap.', 2, '412c6359345678f123456789', '322c6359345678f123456792', false, 2),
    review('223c6359345678f145676704', 'Perfect for casual wear, very comfortable.', 4, '512c6359345678f123456789', '322c6359345678f123456793'),
    review('223c6359345678f145676705', 'Looks amazing but runs a size smaller than expected.', 3, '612c6359345678f123456789', '322c6359345678f123456794', false, 1),
    review('223c6359345678f145676706', 'Good value for the price, would recommend!', 4, '112c6359345678f123456789', '322c6359345678f123456795'),
    review('223c6359345678f145676707', 'Stylish and warm, perfect for the winter season.', 5, '212c6359345678f123456789', '322c6359345678f123456796'),
    review('223c6359345678f145676708', 'Fabric is a bit rough but otherwise good quality.', 3, '312c6359345678f123456789', '322c6359345678f123456797'),
    review('223c6359345678f145676709', 'Excellent fit and finish, very satisfied with this purchase.', 5, '412c6359345678f123456789', '322c6359345678f123456798'),
  ];

  const pp = (_id: string, productId: string, size: string, color: string) => {
    const p = products.find((x) => x._id === productId)!;
    return {
      _id, productId, name: p.name, imageId: p.imageId, salePrice: p.salePrice, size, color,
      quantity: 1, stockAvailable: p.available_stock[size] ?? 0, createdAt: now, updatedAt: now,
    };
  };
  const processedProducts = [
    pp('622c6359345678f123456789', '122c6359345678f123456789', 'M', 'blue'),
    pp('722c6359345678f123456789', '322c6359345678f123456793', 'L', 'black'),
    pp('822c6359345678f123456789', '322c6359345678f123456798', 'M', 'green'),
    pp('922c6359345678f123456781', '322c6359345678f123456789', 'S', 'brown'),
    pp('922c6359345678f123456782', '222c6359345678f123456789', 'L', 'denim blue'),
    pp('922c6359345678f123456783', '322c6359345678f123456790', 'M', 'white'),
  ];
  const priceOf = (items: Record<string, number>) =>
    Object.entries(items)
      .reduce((s, [id, q]) => s + processedProducts.find((x) => x._id === id)!.salePrice * q, 0)
      .toFixed(2);

  const order = (_id: string, products: Record<string, number>, user_id: string, address: string, status: string, d: number) => ({
    _id, products, user_id, address, status, totalPrice: priceOf(products), completed: status === 'delivered',
    date: daysAgo(d), createdAt: daysAgo(d), updatedAt: daysAgo(d),
  });
  const orders = [
    order('322c6359345678f123456700', { '622c6359345678f123456789': 2, '922c6359345678f123456781': 1 }, '112c6359345678f123456789', users[0].address, 'delivered', 10),
    order('322c6359345678f123456701', { '922c6359345678f123456782': 1, '922c6359345678f123456783': 2 }, '112c6359345678f123456789', users[0].address, 'in-transit', 4),
    order('322c6359345678f123456702', { '722c6359345678f123456789': 1 }, '612c6359345678f123456789', users[5].address, 'processing', 1),
  ];

  const invoiceItem = (ppId: string, quantity: number) => {
    const p = processedProducts.find((x) => x._id === ppId)!;
    return { _id: p._id, name: p.name, imageId: p.imageId, salePrice: p.salePrice, size: p.size, color: p.color, quantity };
  };
  const invoice = (_id: string, invoiceNumber: string, u: Doc, items: Doc[], d: number) => ({
    _id,
    invoiceNumber,
    date: daysAgo(d),
    customerDetails: { name: u.username, email: u.email, address: u.address },
    items,
    totalAmount: Math.round(items.reduce((s, i) => s + i.salePrice * i.quantity, 0) * 100) / 100,
    createdAt: daysAgo(d),
    updatedAt: daysAgo(d),
  });
  const invoices = [
    invoice('b22c6359345678f123456701', 'INV-1A2B3C4D', users[0], [invoiceItem('622c6359345678f123456789', 2), invoiceItem('922c6359345678f123456781', 1)], 10),
    invoice('b22c6359345678f123456702', 'INV-5E6F7A8B', users[0], [invoiceItem('922c6359345678f123456782', 1), invoiceItem('922c6359345678f123456783', 2)], 4),
    invoice('b22c6359345678f123456703', 'INV-9C0D1E2F', users[5], [invoiceItem('722c6359345678f123456789', 1)], 1),
  ];

  const refunds = [
    {
      _id: 'c22c6359345678f123456701',
      order_id: '322c6359345678f123456700',
      user_id: '112c6359345678f123456789',
      products: { '922c6359345678f123456781': 1 },
      reason: 'The jacket is too small.',
      status: 'pending',
      requestDate: daysAgo(2),
      refundAmount: 59.99,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
    },
  ];

  const carts = [
    {
      _id: '912c6359345678f123456789',
      userId: '412c6359345678f123456789',
      items: [
        { processedProductId: '622c6359345678f123456789', size: 'M', color: 'blue', quantity: 1 },
        { processedProductId: '722c6359345678f123456789', size: 'L', color: 'black', quantity: 2 },
        { processedProductId: '822c6359345678f123456789', size: 'M', color: 'green', quantity: 1 },
      ],
    },
  ];

  return {
    user: users,
    product: products,
    category: categories,
    review: reviews,
    order: orders,
    processedProduct: processedProducts,
    shoppingCart: carts,
    wishlist: [],
    invoice: invoices,
    refund: refunds,
  };
}

let cache: MockDb | null = null;

export function getDb(): MockDb {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cache = JSON.parse(raw) as MockDb;
      return cache;
    }
  } catch {
    // ignore and reseed
  }
  cache = seed();
  saveDb();
  return cache;
}

export function saveDb(): void {
  if (!cache) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // storage full or unavailable: keep in memory only
  }
}

export function resetDb(): void {
  cache = seed();
  saveDb();
}
