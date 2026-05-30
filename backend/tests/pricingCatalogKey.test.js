const { calculatePricing, calculateTotalVolume } = require('../src/services/pricing');

describe('catalog_key pricing and volume mapping', () => {
  test('uses catalog_key exact volume before fuzzy name fallback', () => {
    const items = [
      { name: 'unrecognized bulky item', catalog_key: 'couch', quantity: 1, size: 'medium' }
    ];

    expect(calculateTotalVolume(items)).toBeCloseTo(1.2, 4);
  });

  test('applies size multiplier after catalog_key volume lookup', () => {
    const items = [
      { name: 'unrecognized bulky item', catalog_key: 'couch', quantity: 1, size: 'large' }
    ];

    expect(calculateTotalVolume(items)).toBeCloseTo(1.8, 4);
  });

  test('uses catalog_key for pricing complexity when display name is vague', () => {
    const items = [
      { name: 'large household item', catalog_key: 'sofa', quantity: 1, volume: 1.2 }
    ];

    const result = calculatePricing(items);

    expect(result.baseFee).toBe(97);
    expect(result.complexityScore).toBeCloseTo(1.0, 4);
  });

  test('falls back to default volume for unknown items without catalog_key', () => {
    const items = [
      { name: 'mystery loose item', quantity: 1, size: 'medium' }
    ];

    expect(calculateTotalVolume(items)).toBeCloseTo(0.3, 4);
  });
});
