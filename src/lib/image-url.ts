// Product images used to be served from MongoDB GridFS via /api/images/:id.
// On the static site they live in public/images/products; unknown ids get a placeholder.
const IMAGES: Record<string, string> = {
  '192c6359345678f123456789': 'oxford_shirt.webp',
  '292c6359345678f123456789': 'straight_fit_jean.webp',
  '392c6359345678f123456789': 'faux_suede_bomber_jacket.jpg',
};

export function imageUrl(imageId?: string | null): string {
  const file = imageId ? IMAGES[imageId] : undefined;
  return `/images/products/${file ?? 'placeholder.svg'}`;
}
