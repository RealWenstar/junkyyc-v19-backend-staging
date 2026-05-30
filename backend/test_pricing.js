// Test new v1.6 pricing logic
const { calculatePricing } = require('./src/services/pricing');

console.log('🧪 Testing AI JunkYYC v1.6 Dynamic Pricing Logic...\n');

// Test cases from TZ v1.6
const testCases = [
  {
    name: 'Mixed items (Sofa + Chair ×2 + Box ×5)',
    items: [
      { name: 'sofa', quantity: 1, volume: 1.2 },
      { name: 'chair', quantity: 2, volume: 0.3 },
      { name: 'cardboard box', quantity: 5, volume: 0.1 }
    ],
    expectedBase: 90
  },
  {
    name: 'Simple items (Boxes only)',
    items: [
      { name: 'cardboard box', quantity: 10, volume: 0.1 }
    ],
    expectedBase: 82
  },
  {
    name: 'Complex items (Furniture + Appliance)',
    items: [
      { name: 'refrigerator', quantity: 1, volume: 1.0 },
      { name: 'sofa', quantity: 1, volume: 1.2 },
      { name: 'chair', quantity: 1, volume: 0.3 }
    ],
    expectedBase: 97
  }
];

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  try {
    const result = calculatePricing(testCase.items);

    console.log(`  Base Fee: $${result.baseFee} (expected: $${testCase.expectedBase})`);
    console.log(`  Complexity Score: ${result.complexityScore?.toFixed(4)}`);
    console.log(`  Volume Fee: $${result.volumeFee?.toFixed(2)}`);
    console.log(`  Difficulty Fee: $${result.difficultyFee?.toFixed(2)}`);
    console.log(`  Total: $${result.total?.toFixed(2)}`);
    console.log(`  Minimum Applied: ${result.minimumApplied}`);

    // Check expectations
    const baseFeeMatch = result.baseFee === testCase.expectedBase;
    const hasNewFields = result.complexityScore !== undefined && result.baseFee !== undefined;

    console.log(`  ✅ Base fee correct: ${baseFeeMatch}`);
    console.log(`  ✅ New fields present: ${hasNewFields}`);

    if (!baseFeeMatch || !hasNewFields) {
      console.log(`  ❌ TEST FAILED!`);
    } else {
      console.log(`  ✅ PASSED`);
    }

  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}`);
  }
  console.log('');
});

console.log('🎯 Pricing logic test completed!');