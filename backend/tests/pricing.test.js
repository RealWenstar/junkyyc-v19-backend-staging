const { calculatePricing } = require('../src/services/pricing');

// Mock the itemCategories module
jest.mock('../src/config/itemCategories', () => ({
  getComplexityWeight: jest.fn(),
  getItemCategory: jest.fn(),
}));

const { getComplexityWeight, getItemCategory } = require('../src/config/itemCategories');

describe('Dynamic Base Fee Pricing v1.6', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Complexity Score Calculation', () => {
    test('should calculate complexity score for mixed items (sofa + chair + box)', () => {
      // Mock complexity weights
      getComplexityWeight.mockImplementation((itemName) => {
        const weights = {
          'sofa': 1.0,    // HIGH
          'chair': 0.7,   // MEDIUM
          'cardboard box': 0.3  // LOW
        };
        return weights[itemName.toLowerCase()] || 0.3;
      });

      const items = [
        { name: 'sofa', quantity: 1, volume: 1.2 },
        { name: 'chair', quantity: 2, volume: 0.3 },
        { name: 'cardboard box', quantity: 1, volume: 0.1 }
      ];

      const result = calculatePricing(items);

      // Expected: (1×1.0 + 2×0.7 + 1×0.3) / (1+2+1) = 2.7 / 4 = 0.675
      expect(result.complexityScore).toBeCloseTo(0.675, 4);
      expect(result.baseFee).toBe(90); // >= 0.5 and < 0.8
    });

    test('should calculate complexity score for simple items (boxes only)', () => {
      getComplexityWeight.mockReturnValue(0.3); // LOW

      const items = [
        { name: 'cardboard box', quantity: 10, volume: 0.1 }
      ];

      const result = calculatePricing(items);

      // Expected: (10×0.3) / 10 = 3.0 / 10 = 0.3
      expect(result.complexityScore).toBeCloseTo(0.3, 1);
      expect(result.baseFee).toBe(82); // < 0.5
    });

    test('should calculate complexity score for complex items (furniture)', () => {
      getComplexityWeight.mockReturnValue(1.0); // HIGH

      const items = [
        { name: 'refrigerator', quantity: 1, volume: 1.0 },
        { name: 'sofa', quantity: 1, volume: 1.2 },
        { name: 'chair', quantity: 1, volume: 0.3 }
      ];

      const result = calculatePricing(items);

      // Expected: (1×1.0 + 1×1.0 + 1×1.0) / 3 = 3.0 / 3 = 1.0
      expect(result.complexityScore).toBeCloseTo(1.0, 1);
      expect(result.baseFee).toBe(97); // >= 0.8
    });
  });

  describe('Base Fee Determination', () => {
    test('should set base fee to $97 for high complexity (>= 0.8)', () => {
      getComplexityWeight.mockReturnValue(1.0);

      const items = [
        { name: 'refrigerator', quantity: 1, volume: 1.0 }
      ];

      const result = calculatePricing(items);
      expect(result.baseFee).toBe(97);
    });

    test('should set base fee to $90 for medium complexity (>= 0.5 and < 0.8)', () => {
      getComplexityWeight.mockImplementation((itemName) => {
        return itemName.includes('sofa') ? 1.0 : 0.3;
      });

      const items = [
        { name: 'sofa', quantity: 1, volume: 1.2 },
        { name: 'box', quantity: 1, volume: 0.1 }
      ];

      const result = calculatePricing(items);
      expect(result.baseFee).toBe(90);
    });

    test('should set base fee to $82 for low complexity (< 0.5)', () => {
      getComplexityWeight.mockReturnValue(0.3);

      const items = [
        { name: 'cardboard box', quantity: 10, volume: 0.1 }
      ];

      const result = calculatePricing(items);
      expect(result.baseFee).toBe(82);
    });
  });

  describe('Minimum Price Enforcement', () => {
    test('should apply minimum $200 when calculated total is less', () => {
      getComplexityWeight.mockReturnValue(0.3);
      getItemCategory.mockReturnValue({ complexity: 'LOW', weight: 0.3 });

      const items = [
        { name: 'small box', quantity: 5, volume: 0.05 }
      ];

      const result = calculatePricing(items);

      // Base: $82, Volume: 5×0.05×29 = $7.25, Difficulty: 0
      // Subtotal: $89.25, GST: $4.46, Total: $93.71 → Minimum $200
      expect(result.total).toBe(200);
      expect(result.minimumApplied).toBe(true);
    });

    test('should not apply minimum when calculated total exceeds $200', () => {
      getComplexityWeight.mockReturnValue(1.0); // HIGH complexity

      const items = [
        { name: 'sofa', quantity: 1, volume: 5.0 }, // Large volume to exceed minimum
        { name: 'chair', quantity: 2, volume: 2.0 }
      ];

      const result = calculatePricing(items);
      expect(result.total).toBeGreaterThan(200);
      expect(result.minimumApplied).toBe(false);
    });
  });

  describe('Volume and Difficulty Fees', () => {
    test('should calculate volume fee at $29 per cubic yard', () => {
      getComplexityWeight.mockReturnValue(1.0);
      getItemCategory.mockReturnValue({ complexity: 'HIGH', weight: 1.0 });

      const items = [
        { name: 'sofa', quantity: 1, volume: 2.0 } // 2.0 cu.yd
      ];

      const result = calculatePricing(items);
      expect(result.volumeFee).toBe(2.0 * 29); // $58
    });

    test('should calculate difficulty fee correctly', () => {
      getComplexityWeight.mockImplementation((itemName) => {
        if (itemName.includes('sofa')) return 1.0;
        if (itemName.includes('chair')) return 0.7;
        return 0.3;
      });

      const items = [
        { name: 'sofa', quantity: 2, volume: 1.2 },    // HIGH: 2×$5 = $10
        { name: 'chair', quantity: 3, volume: 0.3 },   // MEDIUM: 3×$2 = $6
        { name: 'box', quantity: 5, volume: 0.1 }      // LOW: 0
      ];

      const result = calculatePricing(items);
      expect(result.difficultyFee).toBe(10 + 6); // $16 total difficulty
    });
  });

  describe('GST Calculation', () => {
    test('should apply 5% GST to subtotal', () => {
      getComplexityWeight.mockReturnValue(1.0); // HIGH complexity

      const items = [
        { name: 'furniture', quantity: 1, volume: 4.0 } // Large enough to exceed minimum
      ];

      const result = calculatePricing(items);

      const expectedSubtotal = result.baseFee + result.volumeFee + result.difficultyFee;
      const expectedGST = expectedSubtotal * 0.05;
      const expectedTotal = expectedSubtotal + expectedGST;

      expect(result.gst).toBeCloseTo(expectedGST, 2);
      expect(result.total).toBeCloseTo(expectedTotal, 2);
      // Should not apply minimum since total should be > 200
      expect(result.minimumApplied).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty items array', () => {
      expect(() => calculatePricing([])).toThrow('Items array is required and cannot be empty');
    });

    test('should handle invalid item structure', () => {
      expect(() => calculatePricing([{ name: '', quantity: 1, volume: 1 }])).toThrow('Invalid item');
      expect(() => calculatePricing([{ name: 'test', quantity: 0, volume: 1 }])).toThrow('Invalid item');
      expect(() => calculatePricing([{ name: 'test', quantity: 1, volume: 'invalid' }])).toThrow('Invalid item');
    });

    test('should handle single item edge cases', () => {
      // Single expensive item
      getComplexityWeight.mockReturnValue(1.0);
      getItemCategory.mockReturnValue({ complexity: 'HIGH', weight: 1.0 });

      const singleItem = [{ name: 'refrigerator', quantity: 1, volume: 1.0 }];
      const result = calculatePricing(singleItem);

      expect(result.complexityScore).toBe(1.0);
      expect(result.baseFee).toBe(97);
      expect(result.itemCount).toBe(1);
    });
  });

  describe('API Response Structure', () => {
    test('should return correct response structure', () => {
      getComplexityWeight.mockReturnValue(0.7);
      getItemCategory.mockReturnValue({ complexity: 'MEDIUM', weight: 0.7 });

      const items = [
        { name: 'chair', quantity: 2, volume: 0.3 }
      ];

      const result = calculatePricing(items);

      // Check all required fields are present
      expect(result).toHaveProperty('baseFee');
      expect(result).toHaveProperty('volumeFee');
      expect(result).toHaveProperty('difficultyFee');
      expect(result).toHaveProperty('subtotal');
      expect(result).toHaveProperty('gst');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('complexityScore');
      expect(result).toHaveProperty('itemCount');
      expect(result).toHaveProperty('minimumApplied');
      expect(result).toHaveProperty('breakdown');

      // Check breakdown structure
      expect(result.breakdown).toHaveProperty('highComplexityCount');
      expect(result.breakdown).toHaveProperty('mediumComplexityCount');
      expect(result.breakdown).toHaveProperty('lowComplexityCount');
    });
  });

  describe('Backward Compatibility', () => {
    test('should maintain legacy response fields', () => {
      getComplexityWeight.mockReturnValue(1.0);

      const items = [
        { name: 'furniture', quantity: 1, volume: 1.0 }
      ];

      const result = calculatePricing(items);

      // Legacy fields should still be present
      expect(result).toHaveProperty('volume_cy');
      expect(result).toHaveProperty('base_price');
      expect(result).toHaveProperty('volume_price');
      expect(result).toHaveProperty('difficulty_price');
      expect(result).toHaveProperty('extras_price');
      expect(result).toHaveProperty('subtotal');
      expect(result).toHaveProperty('gst');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('total_items');
    });
  });
});
