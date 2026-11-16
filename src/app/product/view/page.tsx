"use client";

// Product page for products that were not pre-rendered (e.g. added through the product manager).
import { useSearchParams } from 'next/navigation';
import ProductPage from '../[id]/ProductPage';

export default function ProductViewPage() {
  const id = useSearchParams().get('id') ?? '';
  return <ProductPage params={{ id }} />;
}
