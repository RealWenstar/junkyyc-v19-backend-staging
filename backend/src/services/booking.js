function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function calculateBookingExtras(services = {}, helpers = 0) {
  let extras = 0;
  if (services?.disassembly) extras += 50;
  if (services?.eco) extras += 40;
  if (services?.sameDay) extras += 75;
  extras += Math.max(0, toNumber(helpers, 0)) * 50;
  return extras;
}

function normalizeBookingPricing(pricing = {}) {
  const basePrice = toNumber(pricing.base_price ?? pricing.base ?? pricing.baseFee, 0);
  const volumePrice = toNumber(pricing.volume_price ?? pricing.volumePrice ?? pricing.volumeFee, 0);
  const difficultyPrice = toNumber(pricing.difficulty_price ?? pricing.difficulty ?? pricing.difficultyFee, 0);
  const extrasPrice = toNumber(pricing.extras_price ?? pricing.extras, 0);
  const subtotal = toNumber(
    pricing.subtotal,
    basePrice + volumePrice + difficultyPrice + extrasPrice
  );
  const gst = toNumber(pricing.gst, subtotal * 0.05);
  const total = toNumber(pricing.total ?? pricing.finalTotal, subtotal + gst);

  return {
    ...pricing,
    volume_cy: toNumber(pricing.volume_cy ?? pricing.totalVolume ?? pricing.volume, 0),
    base_price: basePrice,
    volume_price: volumePrice,
    difficulty_price: difficultyPrice,
    extras_price: extrasPrice,
    subtotal,
    gst,
    total
  };
}

function applySelectedExtras(pricing = {}, services = {}, helpers = 0) {
  const normalized = normalizeBookingPricing(pricing);
  const selectedExtras = calculateBookingExtras(services, helpers);
  const alreadyIncludedExtras = normalized.extras_price;
  const additionalExtras = Math.max(0, selectedExtras - alreadyIncludedExtras);

  if (additionalExtras === 0) {
    return {
      ...normalized,
      extras_price: Math.max(alreadyIncludedExtras, selectedExtras)
    };
  }

  const subtotal = normalized.subtotal + additionalExtras;
  const gst = subtotal * 0.05;
  const rawTotal = subtotal + gst;
  const total = normalized.minimumApplied && rawTotal < 80
    ? 80
    : Math.max(rawTotal, normalized.total);

  return {
    ...normalized,
    extras_price: selectedExtras,
    subtotal,
    gst,
    total
  };
}

function normalizeBookingItems(items = []) {
  if (!Array.isArray(items)) return [];

  const flatItems = items.flatMap(group => {
    if (Array.isArray(group?.items)) {
      return group.items.map(item => ({
        ...item,
        photoId: item.photoId ?? group.photoId
      }));
    }
    return [group];
  });

  return flatItems
    .filter(Boolean)
    .map((item, index) => ({
      id: item.id ?? `item-${index + 1}`,
      name: item.name || item.item || 'Unknown item',
      category: item.category || 'other',
      quantity: Math.max(1, Math.round(toNumber(item.quantity ?? item.qty, 1))),
      volume: toNumber(item.volume, 0),
      photoId: item.photoId
    }));
}

module.exports = {
  applySelectedExtras,
  calculateBookingExtras,
  normalizeBookingItems,
  normalizeBookingPricing
};
