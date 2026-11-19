// In-browser replacement for the old `src/app/api/*` route handlers.
// Each handler mirrors the request/response shape of the original Next.js API route,
// but reads and writes the localStorage-backed mock database instead of MongoDB.
// Emails (password reset, invoices, refund and discount notifications) are not sent; they are logged to the console.

import { Doc, getDb, newId, saveDb } from './db';
import { readSession } from './auth';
import { generateInvoicePdf } from './invoice-pdf';
import { isValidPhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js';

export interface MockResponse {
  status: number;
  body?: unknown; // serialised as JSON
  blob?: Blob; // binary responses (PDFs)
  headers?: Record<string, string>;
}

interface Ctx {
  method: string;
  url: URL;
  query: URLSearchParams;
  body: any;
  params: Record<string, string>;
}

type Handler = (ctx: Ctx) => MockResponse | Promise<MockResponse>;

const json = (body: unknown, status = 200): MockResponse => ({ status, body });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const nowIso = () => new Date().toISOString();
const isObjectId = (id: string | null) => !!id && /^[0-9a-f]{24}$/i.test(id);
const fakeEmail = (to: string | string[], subject: string) => console.info('[mock] email not sent (static demo):', { to, subject });

function findById(collection: Doc[], id: string | null | undefined) {
  return id ? collection.find((d) => d._id === id) : undefined;
}

function inRange(dateIso: string, start: string | null, end: string | null, endOfDay = true) {
  const t = new Date(dateIso).getTime();
  if (start && t < new Date(start.length === 10 ? `${start}T00:00:00.000Z` : start).getTime()) return false;
  if (end) {
    const e = end.length === 10 && endOfDay ? `${end}T23:59:59.999Z` : end;
    if (t > new Date(e).getTime()) return false;
  }
  return true;
}

function validateRange(start: string | null, end: string | null): MockResponse | null {
  if (start && isNaN(Date.parse(start))) return json({ message: 'Invalid startDate format. Use ISO 8601 format.' }, 400);
  if (end && isNaN(Date.parse(end))) return json({ message: 'Invalid endDate format. Use ISO 8601 format.' }, 400);
  if (start && end && new Date(start) > new Date(end)) return json({ message: 'startDate cannot be after endDate.' }, 400);
  return null;
}

function refreshStockFlags(p: Doc) {
  const values = Object.values(p.available_stock || {}) as number[];
  p.quantity = values.reduce((a, b) => a + b, 0);
  p.inStock = values.some((v) => v > 0);
}

/** Puts `quantity` units of a processed product (product + size) back into available stock. */
function restock(processedProductId: string, quantity: number) {
  const db = getDb();
  const pp = findById(db.processedProduct, processedProductId);
  const product = pp && findById(db.product, pp.productId);
  if (!pp || !product || product.available_stock?.[pp.size] === undefined) return;
  product.available_stock[pp.size] += quantity;
  refreshStockFlags(product);
}

// ---------------------------------------------------------------- products

const getProducts: Handler = ({ query }) => {
  const db = getDb();
  const id = query.get('id');
  if (id) {
    const product = findById(db.product, id);
    return product ? json(product) : json({ message: 'Product not found' }, 404);
  }

  const q = query.get('query');
  const category = query.get('category');
  const order = query.get('order');
  const sex = query.get('sex');

  let products = db.product.filter((p) => {
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (!re.test(p.name || '') && !re.test(p.description || '')) return false;
    }
    if (category && p.category !== category) return false;
    if (sex === 'male' && !['male', 'unisex'].includes(p.sex)) return false;
    if (sex === 'female' && !['female', 'unisex'].includes(p.sex)) return false;
    return true;
  });

  if (order === 'popularity') {
    const counts: Record<string, number> = {};
    db.review.filter((r) => r.approved).forEach((r) => { counts[r.product_id] = (counts[r.product_id] || 0) + 1; });
    products = products
      .map((p) => ({ ...p, reviewCount: counts[p._id] || 0 }))
      .sort((a, b) => b.reviewCount - a.reviewCount);
  } else if (order === 'asc') {
    products = [...products].sort((a, b) => (a.salePrice ?? 0) - (b.salePrice ?? 0));
  } else if (order === 'desc') {
    products = [...products].sort((a, b) => (b.salePrice ?? 0) - (a.salePrice ?? 0));
  }
  return json(products);
};

const getCategories: Handler = () => json(getDb().category);

const getProductComments: Handler = ({ query }) => {
  const productId = query.get('product_id');
  if (!productId) return json({ error: 'Product ID is required' }, 400);
  const comments = getDb().review
    .filter((r) => r.product_id === productId)
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  return json(comments);
};

const postProductComment: Handler = ({ body }) => {
  if (!readSession()) return json({ error: 'Authentication required' }, 401);
  const { comment, rating, product_id, user_id } = body || {};
  if (!rating || !product_id || !user_id) return json({ error: 'Missing required fields' }, 400);
  const review = {
    _id: newId(), comment, rating, product_id, user_id, approved: !comment, createdAt: nowIso(), updatedAt: nowIso(),
  };
  getDb().review.push(review);
  saveDb();
  return json(review);
};

const getProcessedProduct: Handler = ({ query }) => {
  const id = query.get('id');
  if (!id) return json({ message: 'ID query parameter is required' }, 400);
  if (!isObjectId(id)) return json({ message: 'Invalid ID format' }, 400);
  const pp = findById(getDb().processedProduct, id);
  return pp ? json({ productId: pp.productId }) : json({ message: 'Processed product not found' }, 404);
};

const getProductFromProcessed: Handler = ({ query }) => {
  const id = query.get('id');
  if (!id) return json({ message: 'ProcessedProduct ID is required' }, 400);
  const db = getDb();
  const pp = findById(db.processedProduct, id);
  if (!pp) return json({ message: 'ProcessedProduct not found' }, 404);
  return json({ ...pp, productId: findById(db.product, pp.productId) ?? null });
};

// ---------------------------------------------------------------- cart

const postAddToCart: Handler = ({ body }) => {
  const { userId, productId, size, color, quantity = 1 } = body || {};
  if (!userId) return json({ error: 'User not logged in. Use local cart for non-authenticated users.' }, 401);
  if (!productId || !size || !color) return json({ error: 'Missing required fields' }, 400);

  const db = getDb();
  const product = findById(db.product, productId);
  if (!product) return json({ error: 'Product not found' }, 404);
  if (!product.sizes?.includes(size) || !product.colors?.includes(color)) {
    return json({ error: 'Invalid size or color' }, 400);
  }

  let pp = db.processedProduct.find((x) => x.productId === productId && x.size === size && x.color === color);
  if (!pp) {
    pp = {
      _id: newId(), productId, name: product.name, imageId: product.imageId, salePrice: product.salePrice,
      size, color, quantity: 1, stockAvailable: 0, createdAt: nowIso(), updatedAt: nowIso(),
    };
    db.processedProduct.push(pp);
  }

  let cart = db.shoppingCart.find((c) => c.userId === userId);
  if (!cart) {
    cart = { _id: newId(), userId, items: [] };
    db.shoppingCart.push(cart);
  }
  const existing = cart.items.find((i: Doc) => i.processedProductId === pp!._id && i.size === size && i.color === color);
  if (existing) existing.quantity += quantity;
  else cart.items.push({ processedProductId: pp._id, size, color, quantity });

  saveDb();
  return json({ message: 'Item added to cart successfully.' });
};

const postMergeCart: Handler = ({ body }) => {
  const { userId, items } = body || {};
  if (!userId || !Array.isArray(items)) return json({ error: 'Missing required fields' }, 400);
  const db = getDb();
  let cart = db.shoppingCart.find((c) => c.userId === userId);
  if (!cart) {
    cart = { _id: newId(), userId, items: [] };
    db.shoppingCart.push(cart);
  }
  for (const local of items) {
    if (!findById(db.processedProduct, local.productId)) continue;
    const existing = cart.items.find((i: Doc) => i.processedProductId === local.productId && i.size === local.size && i.color === local.color);
    if (existing) existing.quantity += local.quantity;
    else cart.items.push({ processedProductId: local.productId, size: local.size, color: local.color, quantity: local.quantity });
  }
  saveDb();
  return json({ message: 'Cart merged successfully.', cartId: cart._id, itemCount: cart.items.length });
};

const deleteCartItem: Handler = ({ body }) => {
  const { userId, processedProductId } = body || {};
  if (!userId) return json({ message: 'User not logged in. Manage local cart on the client-side.' });
  if (!processedProductId) return json({ error: 'Missing required fields' }, 400);
  const cart = getDb().shoppingCart.find((c) => c.userId === userId);
  if (!cart) return json({ error: 'Cart not found' }, 404);
  if (!cart.items.some((i: Doc) => i.processedProductId === processedProductId)) {
    return json({ error: 'Item not found in cart' }, 404);
  }
  cart.items = cart.items.filter((i: Doc) => i.processedProductId !== processedProductId);
  saveDb();
  return json({ message: 'Item removed successfully.' });
};

const postUpdateQuantity: Handler = ({ body }) => {
  const { userId, processedProductId, quantity } = body || {};
  if (!userId || !processedProductId || quantity === undefined) return json({ error: 'Missing required fields' }, 400);
  const cart = getDb().shoppingCart.find((c) => c.userId === userId);
  if (!cart) return json({ error: 'Cart not found' }, 404);
  const item = cart.items.find((i: Doc) => i.processedProductId === processedProductId);
  if (!item) return json({ error: 'Item not found in cart' }, 404);
  if (quantity <= 0) cart.items = cart.items.filter((i: Doc) => i.processedProductId !== processedProductId);
  else item.quantity = quantity;
  saveDb();
  return json({ message: 'Cart updated successfully.' });
};

const postViewCart: Handler = ({ body }) => {
  const { userId, localCart } = body || {};
  if (!Array.isArray(localCart)) return json({ error: 'Invalid local cart format' }, 400);
  const total = (items: Doc[]) => items.reduce((s, i) => s + i.salePrice * i.quantity, 0);
  if (!userId) return json({ cart: localCart, totalPrice: total(localCart) });

  const db = getDb();
  let cart = db.shoppingCart.find((c) => c.userId === userId);
  if (!cart) {
    cart = { _id: newId(), userId, items: [] };
    db.shoppingCart.push(cart);
  }

  for (const local of localCart || []) {
    const product = findById(db.product, local.productId);
    if (!product) continue;

    let pp = db.processedProduct.find((x) =>
      x.productId === local.productId && x.size === local.size && x.color === local.color,
    );
    if (!pp) {
      pp = {
        _id: newId(),
        productId: local.productId,
        name: product.name,
        imageId: product.imageId,
        salePrice: product.salePrice,
        size: local.size,
        color: local.color,
        quantity: 1,
        stockAvailable: product.available_stock?.[local.size] ?? 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.processedProduct.push(pp);
    }

    const existing = cart.items.find((i: Doc) =>
      i.processedProductId === pp!._id && i.size === local.size && i.color === local.color,
    );
    if (existing) existing.quantity += Number(local.quantity || 1);
    else cart.items.push({
      processedProductId: pp._id,
      size: local.size,
      color: local.color,
      quantity: Number(local.quantity || 1),
    });
  }
  saveDb();

  const items = cart.items
    .map((i: Doc) => {
      const pp = findById(db.processedProduct, i.processedProductId);
      if (!pp) return null;
      return { _id: pp._id, name: pp.name, imageId: pp.imageId, salePrice: pp.salePrice, size: pp.size, color: pp.color, quantity: i.quantity };
    })
    .filter(Boolean) as Doc[];
  return json({ cart: items, totalPrice: total(items) });
};

// ---------------------------------------------------------------- wishlist

const postAddToWishlist: Handler = ({ body }) => {
  const session = readSession();
  if (!session?.user?.id) return json({ error: 'Unauthorized' }, 401);
  const { productId, color, size } = body || {};
  if (!productId) return json({ error: 'Product ID is required', received: { productId, color, size } }, 400);
  const db = getDb();
  if (!findById(db.product, productId)) return json({ error: 'Product not found' }, 404);

  const item: Doc = { productId };
  if (color) item.color = color;
  if (size) item.size = size;

  const wishlist = db.wishlist.find((w) => w.userId === session.user.id);
  if (wishlist) {
    const dup = wishlist.items.find((i: Doc) => i.productId === productId && (!color || i.color === color) && (!size || i.size === size));
    if (dup) return json({ error: 'This item is already in your wishlist' }, 400);
    wishlist.items.push(item);
    saveDb();
    return json({ message: 'Product added to wishlist', wishlist }, 200);
  }
  const created = { _id: newId(), userId: session.user.id, items: [item], createdAt: nowIso(), updatedAt: nowIso() };
  db.wishlist.push(created);
  saveDb();
  return json({ message: 'Wishlist created with product', wishlist: created }, 201);
};

const deleteFromWishlist: Handler = ({ body }) => {
  const session = readSession();
  if (!session?.user?.id) return json({ error: 'Unauthorized' }, 401);
  const { productId } = body || {};
  if (!productId) return json({ error: 'Product ID is required' }, 400);
  const wishlist = getDb().wishlist.find((w) => w.userId === session.user.id);
  if (!wishlist) return json({ error: 'Wishlist not found' }, 404);
  wishlist.items = wishlist.items.filter((i: Doc) => i.productId !== productId);
  saveDb();
  return json({ message: 'Item removed from wishlist successfully', wishlist }, 200);
};

const getWishlist: Handler = () => {
  const session = readSession();
  if (!session?.user?.id) return json({ error: 'Unauthorized' }, 401);
  const db = getDb();
  const wishlist = db.wishlist.find((w) => w.userId === session.user.id);
  if (!wishlist) return json({ message: 'No wishlist found', items: [] });
  const items = wishlist.items
    .map((i: Doc) => {
      const p = findById(db.product, i.productId);
      if (!p) return null;
      const out: Doc = {
        productId: i.productId,
        product: {
          name: p.name, description: p.description, salePrice: p.salePrice, imageId: p.imageId,
          category: p.category, available_stock: p.available_stock, colors: p.colors, sizes: p.sizes,
        },
      };
      if (i.size !== undefined) out.size = i.size;
      if (i.color !== undefined) out.color = i.color;
      return out;
    })
    .filter(Boolean);
  return json({ message: 'Wishlist retrieved successfully', items });
};

function wishlistEmails(productId: string): string[] {
  const db = getDb();
  const userIds = new Set(db.wishlist.filter((w) => w.items.some((i: Doc) => i.productId === productId)).map((w) => w.userId));
  return db.user.filter((u) => userIds.has(u._id)).map((u) => u.email).filter(Boolean);
}

const getWishlistUsers: Handler = ({ query }) => {
  const productId = query.get('productId');
  if (!productId) return json({ error: 'Product ID is required' }, 400);
  const emails = wishlistEmails(productId);
  if (!emails.length) return json({ message: 'No users found for the provided product ID.' }, 404);
  return json({ emails });
};

function notifyWishlist(productId: string): MockResponse {
  const product = findById(getDb().product, productId);
  if (!product) return json({ error: 'Product not found' }, 404);
  const emails = wishlistEmails(productId);
  if (!emails.length) return json({ message: 'No users found with this product in wishlist' }, 404);
  fakeEmail(emails, `Product Discount Alert! ${product.name}`);
  return json({ message: 'Discount notification emails sent successfully.' });
}

const postNotifyUsers: Handler = ({ body }) => {
  if (!body?.productId) return json({ error: 'Product ID is required' }, 400);
  return notifyWishlist(body.productId);
};

// ---------------------------------------------------------------- auth & users

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

const postSignup: Handler = ({ body }) => {
  const { email, password, username } = body || {};
  if (!email || !password || !username) return json({ message: 'All fields are required.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ message: 'Invalid email format.' }, 400);
  if (!PASSWORD_RE.test(password)) {
    return json({
      message: 'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.',
    }, 400);
  }
  const db = getDb();
  if (db.user.some((u) => u.email === email)) return json({ message: 'User already exists.' }, 400);
  db.user.push({ _id: newId(), email, password, username, role: 'customer', createdAt: nowIso(), updatedAt: nowIso() });
  saveDb();
  return json({ message: 'User created successfully.' }, 201);
};

const postForgotPassword: Handler = ({ body }) => {
  const { email } = body || {};
  if (!email) return json({ message: 'Email is required.' }, 400);
  const user = getDb().user.find((u) => u.email === email);
  if (!user) return json({ message: 'No user found with this email address.' }, 404);
  user.resetToken = newId() + newId();
  user.tokenExpiration = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  saveDb();
  // No email in the static demo; log the reset link so the flow can still be completed.
  const link = `${window.location.origin}/auth/reset-password?token=${user.resetToken}&email=${encodeURIComponent(email)}`;
  console.info('[mock] Password reset link:', link);
  return json({ message: 'Password reset email sent.' });
};

const postResetPassword: Handler = ({ body }) => {
  const { token, email, password } = body || {};
  if (!token || !email || !password) return json({ message: 'Invalid input.' }, 400);
  const user = getDb().user.find((u) => u.email === email && u.resetToken === token);
  if (!user || new Date(user.tokenExpiration) < new Date()) return json({ message: 'Invalid or expired token.' }, 400);
  user.password = password;
  delete user.resetToken;
  delete user.tokenExpiration;
  saveDb();
  return json({ message: 'Password reset successfully.' });
};

const publicUser = (u: Doc) => {
  const { password: _pw, ...rest } = u;
  return rest;
};

const getUsers: Handler = ({ query }) => {
  const db = getDb();
  const id = query.get('_id');
  if (id) {
    const user = findById(db.user, id);
    return user ? json({ user: publicUser(user) }) : json({ error: 'User not found' }, 404);
  }
  return json({ users: db.user.map(publicUser) });
};

const patchUser: Handler = ({ query, body }) => {
  const id = query.get('_id');
  if (!isObjectId(id)) return json({ message: 'Invalid or missing user ID' }, 400);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ message: 'Invalid updates provided' }, 400);
  const updates = { ...body };
  delete updates._id;
  delete updates.id;
  delete updates.password;
  delete updates.role;
  if (updates.phoneNumber) {
    const parsed = parsePhoneNumberFromString(updates.phoneNumber, 'TR');
    if (!parsed || !isValidPhoneNumber(updates.phoneNumber, 'TR')) {
      return json({ message: 'Invalid phone number format.' }, 400);
    }
    updates.phoneNumber = parsed.number;
  }
  const user = findById(getDb().user, id);
  if (!user) return json({ updatedUser: null });
  Object.assign(user, updates, { updatedAt: nowIso() });
  saveDb();
  return json({ updatedUser: publicUser(user) });
};

const getUserOrders: Handler = ({ query }) => {
  const userId = query.get('user_id');
  const orders = getDb().order
    .filter((o) => o.user_id === userId)
    .sort((a, b) => (b.date > a.date ? 1 : -1));
  return json({ userOrders: orders });
};

// ---------------------------------------------------------------- orders, invoices, refunds

const postOrder: Handler = ({ body }) => {
  const order = {
    _id: newId(),
    products: body?.products,
    user_id: body?.user_id,
    address: body?.address,
    completed: body?.completed,
    date: nowIso(),
    status: body?.status,
    totalPrice: body?.totalPrice,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  getDb().order.push(order);
  saveDb();
  return json({ order }, 201);
};

const postCancelOrder: Handler = ({ body }) => {
  if (!body?.order) return json({ message: 'Invalid request body. Order is required.' }, 400);
  const order = findById(getDb().order, body.order._id);
  if (!order) return json({ message: 'Order not found.' }, 404);
  if (order.status === 'cancelled') return json({ message: 'Order is already cancelled.' }, 400);
  order.status = 'cancelled';
  order.updatedAt = nowIso();
  for (const [ppId, qty] of Object.entries(order.products || {})) restock(ppId, qty as number);
  saveDb();
  return json({ message: 'Order cancelled successfully', order });
};

const postGenerateInvoice: Handler = ({ body }) => {
  const { items, totalAmount, customerDetails } = body || {};
  if (!items || !Array.isArray(items)) return json({ error: 'Invalid items data' }, 400);
  if (typeof totalAmount !== 'number') return json({ error: 'Invalid total amount' }, 400);
  if (!customerDetails?.email) return json({ error: 'Customer email is required' }, 400);

  const invoiceNumber = `INV-${newId().slice(0, 8).toUpperCase()}`;
  const invoice = {
    _id: newId(), invoiceNumber, date: nowIso(), customerDetails, items, totalAmount, createdAt: nowIso(), updatedAt: nowIso(),
  };
  getDb().invoice.push(invoice);
  saveDb();
  fakeEmail(customerDetails.email, `Invoice #${invoiceNumber} for your order`);
  return {
    status: 200,
    blob: generateInvoicePdf(invoice),
    headers: { 'Content-Disposition': `attachment; filename=invoice-${invoiceNumber}.pdf` },
  };
};

const getInvoices: Handler = ({ query }) => {
  const start = query.get('startDate');
  const end = query.get('endDate');
  const bad = validateRange(start, end);
  if (bad) return bad;
  const invoices = getDb().invoice
    .filter((i) => inRange(i.date, start, end, false))
    .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
  return json(invoices);
};

const downloadInvoice: Handler = ({ params }) => {
  const invoice = findById(getDb().invoice, params.id);
  if (!invoice) return json({ message: 'Invoice not found' }, 404);
  return {
    status: 200,
    blob: generateInvoicePdf(invoice),
    headers: { 'Content-Disposition': `attachment; filename=invoice-${invoice.invoiceNumber}.pdf` },
  };
};

const postRefundRequest: Handler = ({ body }) => {
  if (!body?.user_email) return json({ message: 'User email is required' }, 400);
  const db = getDb();
  const productIds = Object.keys(body.products || {});
  const invoice = db.invoice.find(
    (inv) => inv.customerDetails?.email === body.user_email && inv.items.some((i: Doc) => productIds.includes(i._id)),
  );
  if (!invoice) {
    return json({ message: 'Invoice not found for these items', details: 'Please ensure the order and products are correct' }, 404);
  }
  let refundAmount = 0;
  for (const [pid, qty] of Object.entries(body.products)) {
    const item = invoice.items.find((i: Doc) => i._id === pid);
    if (item) refundAmount += item.salePrice * (qty as number);
  }
  const refund = {
    _id: newId(), order_id: body.order_id, user_id: body.user_id, products: body.products, reason: body.reason,
    status: 'pending', requestDate: nowIso(), refundAmount, createdAt: nowIso(), updatedAt: nowIso(),
  };
  db.refund.push(refund);
  saveDb();
  return json({ message: 'Test refund request created successfully', refund }, 201);
};

// ---------------------------------------------------------------- admin: product manager

const postAddProduct: Handler = ({ body }) => {
  const d = body || {};
  const product: Doc = {
    _id: newId(),
    name: d.name,
    description: d.description,
    sex: d.sex || 'unisex',
    category: d.category,
    costPrice: d.costPrice ?? 0,
    salePrice: d.salePrice ?? d.salePprice ?? 0,
    total_stock: d.total_stock,
    available_stock: d.available_stock,
    sizes: d.sizes,
    colors: d.colors,
    imageId: d.imageId || '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  refreshStockFlags(product);
  getDb().product.push(product);
  saveDb();
  return json({ product }, 201);
};

const deleteProduct: Handler = ({ query }) => {
  const id = query.get('id');
  if (!id) return json({ message: 'Product ID is required' }, 400);
  const db = getDb();
  const before = db.product.length;
  db.product = db.product.filter((p) => p._id !== id);
  if (db.product.length === before) return json({ message: 'Product not found or already deleted' }, 404);
  saveDb();
  return json({ message: 'Product deleted successfully' });
};

const postCategory: Handler = ({ body }) => {
  const { name, image } = body || {};
  if (!name) return json({ message: 'Name is required' }, 400);
  const category = { _id: newId(), name, image: image || '', createdAt: nowIso(), updatedAt: nowIso() };
  getDb().category.push(category);
  saveDb();
  return json({ message: 'Category added successfully', categoryId: category._id }, 201);
};

const deleteCategory: Handler = ({ params }) => {
  if (!isObjectId(params.id)) return json({ message: 'Invalid ID format' }, 400);
  const db = getDb();
  const before = db.category.length;
  db.category = db.category.filter((c) => c._id !== params.id);
  if (db.category.length === before) return json({ message: 'Category not found' }, 404);
  saveDb();
  return json({ message: 'Category deleted successfully' });
};

const getAdminComments: Handler = ({ query }) => {
  const productId = query.get('product_id');
  return json(getDb().review.filter((r) => !productId || r.product_id === productId));
};

const deleteComment: Handler = ({ query }) => {
  const id = query.get('id');
  if (!id) return json({ message: 'Comment ID is required' }, 400);
  const db = getDb();
  const before = db.review.length;
  db.review = db.review.filter((r) => r._id !== id);
  if (db.review.length === before) return json({ message: 'Comment not found or already deleted' }, 404);
  saveDb();
  return json({ message: 'Comment deleted successfully' });
};

const approveComment: Handler = ({ body }) => {
  const id = body?.id;
  if (!id) return json({ message: 'Comment ID is required' }, 400);
  const review = findById(getDb().review, id);
  if (!review || review.approved) return json({ message: 'Comment not found or already approved' }, 404);
  review.approved = true;
  saveDb();
  return json({ message: 'Comment approved successfully' });
};

const getAllOrders: Handler = () => json(getDb().order);

const postOrderStatus: Handler = ({ body }) => {
  if (!body?._id) return json({ message: 'Order ID is required' }, 400);
  if (!body.status) return json({ message: 'Status is required' }, 400);
  if (!['processing', 'in-transit', 'delivered'].includes(body.status)) return json({ message: 'Invalid status value' }, 400);
  const order = findById(getDb().order, body._id);
  if (!order) return json({ message: 'Order not found' }, 404);
  order.status = body.status;
  order.completed = body.status === 'delivered';
  order.updatedAt = nowIso();
  saveDb();
  return json({ message: 'Order status updated successfully', order });
};

const getProductStats: Handler = () => {
  const db = getDb();
  return json({ products: db.product.length, users: db.user.length, orders: db.order.length });
};

const postUpdateStock: Handler = ({ body }) => {
  if (!body?._id) return json({ message: 'Product ID is required' }, 400);
  if (!body.total_stock || !body.available_stock) return json({ message: 'Stock data is required' }, 400);
  const valid = (s: Record<string, number>) => Object.values(s).every((v) => Number.isInteger(v) && v >= 0);
  if (!valid(body.total_stock) || !valid(body.available_stock)) {
    return json({ message: 'Stock numbers must be non-negative integers' }, 400);
  }
  const product = findById(getDb().product, body._id);
  if (!product) return json({ message: 'Product not found' }, 404);
  product.total_stock = body.total_stock;
  product.available_stock = body.available_stock;
  refreshStockFlags(product);
  product.updatedAt = nowIso();
  saveDb();
  return json({ message: 'Stock updated successfully', product });
};

// ---------------------------------------------------------------- admin: sales manager

const patchDiscount: Handler = ({ body }) => {
  const { productId, discountRate } = body || {};
  if (!productId || typeof discountRate !== 'number') return json({ message: 'Invalid product ID or discount rate' }, 400);
  const product = findById(getDb().product, productId);
  if (!product) return json({ message: 'Product not found' }, 404);
  const newPrice = parseFloat((product.salePrice * (1 - discountRate / 100)).toFixed(2));
  product.salePrice = newPrice;
  saveDb();
  notifyWishlist(productId);
  return json({ message: 'Product price updated', newPrice });
};

const patchPrice: Handler = ({ body }) => {
  const { productId, newPrice } = body || {};
  if (!productId || typeof newPrice !== 'number') return json({ message: 'Invalid product ID or new price' }, 400);
  const product = findById(getDb().product, productId);
  if (!product) return json({ message: 'Product not found' }, 404);
  product.salePrice = newPrice;
  saveDb();
  notifyWishlist(productId);
  return json({ message: 'Product price updated and notifications sent', newPrice });
};

const getSalesGraph: Handler = ({ query }) => {
  const start = query.get('startDate');
  const end = query.get('endDate');
  const bad = validateRange(start, end);
  if (bad) return bad;
  const db = getDb();
  const invoices = db.invoice.filter((i) => inRange(i.date, start, end)).sort((a, b) => (a.date > b.date ? 1 : -1));
  const refunds = db.refund.filter((r) => inRange(r.requestDate, start, end)).sort((a, b) => (a.requestDate > b.requestDate ? 1 : -1));

  const round = (n: number) => parseFloat(n.toFixed(2));
  const totalRevenue = invoices.reduce((s, i) => s + round(i.totalAmount), 0);
  const totalRefunds = refunds.reduce((s, r) => s + round(r.refundAmount), 0);

  const combined: Record<string, { revenue: number; refunds: number }> = {};
  invoices.forEach((i) => {
    const d = i.date.split('T')[0];
    combined[d] = { revenue: (combined[d]?.revenue || 0) + round(i.totalAmount), refunds: combined[d]?.refunds || 0 };
  });
  refunds.forEach((r) => {
    const d = r.requestDate.split('T')[0];
    combined[d] = { revenue: combined[d]?.revenue || 0, refunds: (combined[d]?.refunds || 0) + round(r.refundAmount) };
  });
  const chartData = Object.entries(combined)
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .map(([date, v]) => ({ date, netRevenue: v.revenue - v.refunds }));

  return json({
    chartData,
    summary: {
      totalRevenue: totalRevenue.toFixed(2),
      totalRefunds: totalRefunds.toFixed(2),
      netRevenue: (totalRevenue - totalRefunds).toFixed(2),
    },
  });
};

const getRefunds: Handler = ({ query }) => {
  const start = query.get('startDate');
  const end = query.get('endDate');
  const bad = validateRange(start, end);
  if (bad) return bad;
  const refunds = getDb().refund
    .filter((r) => inRange(r.requestDate, start, end))
    .sort((a, b) => (a.requestDate > b.requestDate ? 1 : -1));
  return json(refunds);
};

const postRefundStatus: Handler = ({ body }) => {
  if (!body || !body._id || !body.status) return json({ message: 'Invalid request body' }, 400);
  if (!['pending', 'approved', 'rejected'].includes(body.status)) return json({ message: 'Invalid status value' }, 400);
  if (!isObjectId(body._id)) return json({ message: 'Invalid refund ID' }, 400);
  const db = getDb();
  const refund = findById(db.refund, body._id);
  if (!refund) return json({ message: 'Refund request not found' }, 404);
  const user = findById(db.user, refund.user_id);
  if (!user?.email) return json({ message: 'User email not found' }, 404);

  const wasApproved = refund.status === 'approved';
  refund.status = body.status;
  refund.processedDate = nowIso();
  refund.updatedAt = nowIso();
  if (body.status !== 'pending') fakeEmail(user.email, `Refund Request ${body.status}`);
  if (body.status === 'approved' && !wasApproved) {
    for (const [ppId, qty] of Object.entries(refund.products || {})) restock(ppId, qty as number);
  }
  saveDb();
  return json({ message: 'Refund status updated successfully', refund });
};

const getSalesStats: Handler = () => {
  const db = getDb();
  return json({
    sales: db.invoice.length,
    users: db.user.length,
    money: db.invoice.reduce((s, i) => s + i.totalAmount, 0).toFixed(2),
  });
};

// ---------------------------------------------------------------- routing

const routes: Array<[string, string, Handler]> = [
  ['GET', '/api/product', getProducts],
  ['GET', '/api/product/category', getCategories],
  ['GET', '/api/product/comments', getProductComments],
  ['POST', '/api/product/comments', postProductComment],
  ['GET', '/api/processed-product', getProcessedProduct],
  ['GET', '/api/product-from-processed', getProductFromProcessed],

  ['POST', '/api/cart/add-to-cart', postAddToCart],
  ['POST', '/api/cart/merge-cart', postMergeCart],
  ['DELETE', '/api/cart/remove-item', deleteCartItem],
  ['POST', '/api/cart/update-quantity', postUpdateQuantity],
  ['POST', '/api/cart/view-cart', postViewCart],

  ['POST', '/api/wishlist/add-to-wishlist', postAddToWishlist],
  ['DELETE', '/api/wishlist/remove-from-wishlist', deleteFromWishlist],
  ['GET', '/api/wishlist/view-wishlist', getWishlist],
  ['GET', '/api/wishlist/get-users', getWishlistUsers],
  ['POST', '/api/wishlist/notify-users', postNotifyUsers],

  ['POST', '/api/auth/signup', postSignup],
  ['POST', '/api/auth/forgot-password', postForgotPassword],
  ['POST', '/api/auth/reset-password', postResetPassword],
  ['GET', '/api/users', getUsers],
  ['PATCH', '/api/users', patchUser],
  ['GET', '/api/users/orders', getUserOrders],

  ['POST', '/api/order', postOrder],
  ['POST', '/api/order/cancel', postCancelOrder],
  ['POST', '/api/invoice/generate', postGenerateInvoice],
  ['GET', '/api/invoice/view', getInvoices],
  ['GET', '/api/invoice/:id/download', downloadInvoice],
  ['POST', '/api/refundtest', postRefundRequest],

  ['POST', '/api/admin/product/adddel', postAddProduct],
  ['DELETE', '/api/admin/product/adddel', deleteProduct],
  ['POST', '/api/admin/product/categories', postCategory],
  ['DELETE', '/api/admin/product/categories/:id', deleteCategory],
  ['GET', '/api/admin/product/comments', getAdminComments],
  ['DELETE', '/api/admin/product/comments', deleteComment],
  ['POST', '/api/admin/product/comments', approveComment],
  ['GET', '/api/admin/product/orders', getAllOrders],
  ['POST', '/api/admin/product/orders', postOrderStatus],
  ['GET', '/api/admin/product/stats', getProductStats],
  ['POST', '/api/admin/product/updatestock', postUpdateStock],

  ['PATCH', '/api/admin/sales/discount', patchDiscount],
  ['PATCH', '/api/admin/sales/price', patchPrice],
  ['GET', '/api/admin/sales/graph', getSalesGraph],
  ['GET', '/api/admin/sales/refund', getRefunds],
  ['POST', '/api/admin/sales/refund', postRefundStatus],
  ['GET', '/api/admin/sales/stats', getSalesStats],
];

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/');
  const a = path.replace(/\/+$/, '').split('/');
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

export function isMockApiUrl(url: URL): boolean {
  return url.origin === window.location.origin && url.pathname.startsWith('/api/');
}

export async function handleMockRequest(method: string, url: URL, body: unknown): Promise<MockResponse> {
  const m = method.toUpperCase();
  let pathMatched = false;
  for (const [routeMethod, pattern, handler] of routes) {
    const params = matchPath(pattern, url.pathname);
    if (!params) continue;
    pathMatched = true;
    if (routeMethod !== m) continue;
    try {
      const res = await handler({ method: m, url, query: url.searchParams, body: clone(body ?? null), params });
      if (res.body !== undefined) res.body = clone(res.body);
      return res;
    } catch (error) {
      console.error('[mock api] handler error', error);
      return json({ message: 'Internal Server Error', error: String(error) }, 500);
    }
  }
  return pathMatched ? json({ message: 'Method Not Allowed' }, 405) : json({ message: 'Not Found' }, 404);
}
