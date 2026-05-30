const {
  applySelectedExtras,
  calculateBookingExtras,
  normalizeBookingItems,
  normalizeBookingPricing
} = require('../src/services/booking');

describe('booking payload normalization', () => {
  test('normalizes frontend pricing shape to backend pricing fields', () => {
    const pricing = normalizeBookingPricing({
      base: 90,
      volumePrice: 29,
      difficulty: 2,
      extras: 75,
      subtotal: 200,
      gst: 10,
      total: 210,
      totalVolume: 1
    });

    expect(pricing).toMatchObject({
      base_price: 90,
      volume_price: 29,
      difficulty_price: 2,
      extras_price: 75,
      subtotal: 200,
      gst: 10,
      total: 210,
      volume_cy: 1
    });
  });

  test('does not double-count services already included by the frontend', () => {
    const pricing = applySelectedExtras(
      {
        base: 82,
        volumePrice: 10,
        difficulty: 0,
        extras: 75,
        subtotal: 200,
        gst: 10,
        total: 210,
        totalVolume: 0.4
      },
      { sameDay: true },
      0
    );

    expect(pricing.extras_price).toBe(75);
    expect(pricing.total).toBe(210);
  });

  test('adds selected services to original backend analysis pricing once', () => {
    const pricing = applySelectedExtras(
      {
        base_price: 97,
        volume_price: 34.8,
        difficulty_price: 5,
        extras_price: 0,
        subtotal: 136.8,
        gst: 6.84,
        total: 200,
        minimumApplied: true
      },
      { sameDay: true, eco: true },
      1
    );

    expect(calculateBookingExtras({ sameDay: true, eco: true }, 1)).toBe(165);
    expect(pricing.extras_price).toBe(165);
    expect(pricing.subtotal).toBeCloseTo(301.8, 4);
    expect(pricing.gst).toBeCloseTo(15.09, 4);
    expect(pricing.total).toBeCloseTo(316.89, 4);
  });

  test('flattens grouped UI items and flat API items consistently', () => {
    const items = normalizeBookingItems([
      {
        photoId: 1,
        items: [
          { id: '1-1', name: 'Sofa', category: 'furniture', qty: 1, volume: 1.2 }
        ]
      },
      { id: '2-1', name: 'Boxes', category: 'packaging', quantity: 5, volume: 0.1 }
    ]);

    expect(items).toEqual([
      {
        id: '1-1',
        name: 'Sofa',
        category: 'furniture',
        quantity: 1,
        volume: 1.2,
        photoId: 1
      },
      {
        id: '2-1',
        name: 'Boxes',
        category: 'packaging',
        quantity: 5,
        volume: 0.1,
        photoId: undefined
      }
    ]);
  });
});
