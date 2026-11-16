// Static export needs every product URL at build time, so pre-render a page per seeded product.
// Products added later through the product manager are reachable via /product/view?id=<id>.
import ProductPage from './ProductPage';
import { SEED_PRODUCT_IDS } from '@/mock/seed-ids';

export function generateStaticParams() {
  return SEED_PRODUCT_IDS.map((id) => ({ id }));
}

export default function Page({ params }: { params: { id: string } }) {
  return <ProductPage params={params} />;
}
