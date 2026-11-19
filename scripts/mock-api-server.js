const http = require('http');

const PORT = Number(process.env.MOCK_API_PORT || 3001);
const users = new Map();
const carts = new Map();
const orders = [];
let userSequence = 1000;

const product = {
  _id: '122c6359345678f123456789',
  name: 'oxford shirt',
  description: 'A boxy fit shirt made from tightly woven cotton fabric.',
  sex: 'unisex',
  category: 'shirt',
  costPrice: 20,
  salePrice: 39.99,
  total_stock: { XS: 5, S: 25, M: 25, L: 25, XL: 20 },
  available_stock: { XS: 2, S: 25, M: 24, L: 24, XL: 20 },
  sizes: ['XS', 'S', 'M', 'L', 'XL'],
  colors: ['white', 'blue'],
  imageId: '192c6359345678f123456789',
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error('Request body too large'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    const body = await readJson(req);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, { status: 'ok', service: 'bruno-mock-api' });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
      const { email, password, username } = body;
      if (!email || !password || !username) {
        return sendJson(res, 400, { message: 'email, password, and username are required' });
      }
      if ([...users.values()].some((user) => user.email === email)) {
        return sendJson(res, 409, { message: 'User already exists' });
      }
      const user = {
        _id: `bruno${String(userSequence++)}`,
        email,
        password,
        username,
        role: 'customer',
      };
      users.set(user._id, user);
      return sendJson(res, 201, { message: 'User created successfully', user: { ...user, password: undefined } });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/signin') {
      const { email, password } = body;
      const user = [...users.values()].find((candidate) => candidate.email === email);
      if (!user) return sendJson(res, 404, { message: 'User not found' });
      if (user.password !== password) return sendJson(res, 401, { message: 'Incorrect password' });
      return sendJson(res, 200, {
        token: `mock-token-${user._id}`,
        user: { id: user._id, name: user.username, email: user.email, role: user.role },
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/product') {
      return sendJson(res, 200, [product]);
    }

    if (req.method === 'POST' && url.pathname === '/api/cart/add-to-cart') {
      const { userId, productId, size, color, quantity = 1 } = body;
      if (!userId || !productId || !size || !color) {
        return sendJson(res, 400, { message: 'userId, productId, size, and color are required' });
      }
      if (!users.has(userId)) return sendJson(res, 404, { message: 'User not found' });
      if (productId !== product._id) return sendJson(res, 404, { message: 'Product not found' });
      if (!product.sizes.includes(size) || !product.colors.includes(color)) {
        return sendJson(res, 400, { message: 'Invalid size or color' });
      }

      const cart = carts.get(userId) || [];
      const existing = cart.find((item) => item.productId === productId && item.size === size && item.color === color);
      if (existing) existing.quantity += quantity;
      else {
        cart.push({
          _id: `processed-${productId}-${size}-${color}`,
          productId,
          name: product.name,
          size,
          color,
          quantity,
          salePrice: product.salePrice,
        });
      }
      carts.set(userId, cart);
      return sendJson(res, 200, { message: 'Item added to cart successfully', cart });
    }

    if (req.method === 'POST' && url.pathname === '/api/cart/view-cart') {
      const { userId } = body;
      if (!userId) return sendJson(res, 400, { message: 'userId is required' });
      const cart = carts.get(userId) || [];
      const totalPrice = cart.reduce((sum, item) => sum + item.salePrice * item.quantity, 0);
      return sendJson(res, 200, { cart, totalPrice });
    }

    if (req.method === 'POST' && url.pathname === '/api/invoice/generate') {
      if (!body.items || !Array.isArray(body.items) || typeof body.totalAmount !== 'number') {
        return sendJson(res, 400, { message: 'items and numeric totalAmount are required' });
      }
      if (!body.customerDetails?.email) {
        return sendJson(res, 400, { message: 'customerDetails.email is required' });
      }
      return sendJson(res, 200, {
        invoiceNumber: `INV-BRUNO-${String(orders.length + 1).padStart(4, '0')}`,
        items: body.items,
        totalAmount: body.totalAmount,
        customerDetails: body.customerDetails,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/order') {
      if (!body.user_id || !body.products || !body.address) {
        return sendJson(res, 400, { message: 'user_id, products, and address are required' });
      }
      if (!users.has(body.user_id)) return sendJson(res, 404, { message: 'User not found' });
      const order = {
        _id: `order-${orders.length + 1}`,
        products: body.products,
        user_id: body.user_id,
        address: body.address,
        completed: body.completed ?? false,
        status: body.status || 'processing',
        totalPrice: body.totalPrice,
        date: new Date().toISOString(),
      };
      orders.push(order);
      carts.set(body.user_id, []);
      return sendJson(res, 201, { message: 'Order created successfully', order });
    }

    if (req.method === 'DELETE' && url.pathname === '/api/cart/remove-item') {
      const { userId, processedProductId } = body;
      const cart = carts.get(userId) || [];
      carts.set(userId, cart.filter((item) => item._id !== processedProductId));
      return sendJson(res, 200, { message: 'Item removed successfully' });
    }

    return sendJson(res, 404, { message: 'Not Found' });
  } catch (error) {
    return sendJson(res, 400, { message: error.message });
  }
}

const server = http.createServer((req, res) => {
  handler(req, res).catch((error) => sendJson(res, 500, { message: error.message }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Bruno mock API listening at http://127.0.0.1:${PORT}`);
});
