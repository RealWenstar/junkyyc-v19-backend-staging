// Import item categories for dynamic pricing
const { getComplexityWeight, getItemCategory, hasCatalogKey, normalizeCatalogKey } = require('../config/itemCategories');

// Volume estimates for common items (cubic yards) - keeping for backward compatibility
const ITEM_VOLUMES = {
  'sofa': 1.2,
  'couch': 1.2,
  'chair': 0.3,
  'bed': 0.8,
  'table': 0.6,
  'cabinet': 0.5,
  'box': 0.1,
  'bag': 0.05,
  'mattress': 0.9,
  'desk': 0.7,
  'bookshelf': 0.8,
  'fridge': 1.5,
  'refrigerator': 1.5,
  'washing_machine': 1.2,
  'washer': 1.2,
  'dryer': 1.0,
  'tv': 0.3,
  'computer': 0.2,
  'monitor': 0.2,
  'microwave': 0.3,
  'toaster': 0.1,
  'vacuum': 0.2,
  'lamp': 0.1,
  'rug': 0.5,
  'bike': 0.4,
  'tires': 0.3,
  'paint': 0.05,
  'chemicals': 0.1,
  'construction_debris': 2.0,
  'concrete': 3.0,
  'dirt': 2.5,
  'wood': 1.0,
  'wood_plank': 0.1,
  'metal': 0.8,
  'metal_scraps': 0.8,
  'plastic': 0.3,
  'plastic_container': 0.05,
  'cardboard': 0.1,
  'cardboard_box': 0.1,
  'paper': 0.05,
  'paper_bag': 0.05,
  'glass': 0.2,
  'electronics': 0.4,
  'clothing': 0.08,
  'clothing_bag': 0.08,
  'furniture': 1.0,
  'appliance': 1.2,
  'yard_waste': 0.8,
  'household': 0.3
};

function getCatalogVolume(catalogKey) {
  const normalizedKey = normalizeCatalogKey(catalogKey);
  if (!normalizedKey) return null;

  if (Object.prototype.hasOwnProperty.call(ITEM_VOLUMES, normalizedKey)) {
    return ITEM_VOLUMES[normalizedKey];
  }

  if (hasCatalogKey(normalizedKey)) {
    const category = getItemCategory(normalizedKey);
    if (typeof category.baseVolume === 'number' && category.baseVolume > 0) {
      return category.baseVolume;
    }
  }

  return null;
}

function getFuzzyVolume(itemName) {
  const normalizedName = normalizeCatalogKey(itemName);

  for (const [key, vol] of Object.entries(ITEM_VOLUMES)) {
    if (normalizedName.includes(normalizeCatalogKey(key))) {
      return vol;
    }
  }

  const category = getItemCategory(itemName);
  if (typeof category.baseVolume === 'number' && category.baseVolume > 0) {
    return category.baseVolume;
  }

  return 0.3;
}

function resolveItemVolume(item) {
  let volume = getCatalogVolume(item.catalog_key);

  if (volume === null) {
    volume = getFuzzyVolume(item.name);
  }

  if (item.size === 'large') volume *= 1.5;
  else if (item.size === 'small') volume *= 0.5;

  return volume;
}

// Calculate pricing with dynamic base fee (v1.6)
function calculatePricing(items, useNewLogic = true) {
  // Use new v1.6 dynamic pricing logic by default
  if (!useNewLogic) {
    return calculatePricingOld(items);
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('Items array is required and cannot be empty');
  }

  // Validate items structure
  items.forEach((item, index) => {
    if (!item.name || typeof item.quantity !== 'number' || item.quantity < 1) {
      throw new Error(`Invalid item at index ${index}: name and quantity are required`);
    }
    if (!item.volume || typeof item.volume !== 'number') {
      throw new Error(`Invalid item at index ${index}: volume is required and must be a number`);
    }
  });

  let totalItems = 0;
  let totalVolume = 0;
  let weightedSum = 0;

  // Counters for breakdown
  let highComplexityCount = 0;
  let mediumComplexityCount = 0;
  let lowComplexityCount = 0;

  // Calculate complexity score and volume
  items.forEach(item => {
    const itemName = item.name;
    const quantity = item.quantity;
    const volume = item.volume;

    // Get complexity weight for this item
    const complexityWeight = getComplexityWeight(item.catalog_key || itemName, itemName);

    // Determine complexity level based on weight
    let complexityLevel = 'LOW';
    if (complexityWeight >= 0.8) complexityLevel = 'HIGH';
    else if (complexityWeight >= 0.5) complexityLevel = 'MEDIUM';

    // Track complexity distribution
    if (complexityLevel === 'HIGH') highComplexityCount += quantity;
    else if (complexityLevel === 'MEDIUM') mediumComplexityCount += quantity;
    else lowComplexityCount += quantity;

    // Calculate weighted sum for complexity score
    weightedSum += quantity * complexityWeight;

    // Calculate total volume and items
    totalVolume += volume * quantity;
    totalItems += quantity;
  });

  // Calculate complexity score
  const complexityScore = totalItems > 0 ? weightedSum / totalItems : 0;

  // Determine dynamic base fee based on complexity score
  let baseFee;
  if (complexityScore >= 0.8) {
    baseFee = 97; // Complex items
  } else if (complexityScore >= 0.5) {
    baseFee = 90; // Mixed items
  } else {
    baseFee = 82; // Simple items
  }

  // Volume fee: $29 per cubic yard (updated rate)
  const volumeFee = totalVolume * 29;

  // Difficulty fee: HIGH=$5/unit, MEDIUM=$2/unit, LOW=$0
  let difficultyFee = 0;
  items.forEach(item => {
    const complexityWeight = getComplexityWeight(item.catalog_key || item.name, item.name);
    if (complexityWeight >= 0.8) {
      difficultyFee += item.quantity * 5; // HIGH
    } else if (complexityWeight >= 0.5) {
      difficultyFee += item.quantity * 2; // MEDIUM
    }
    // LOW items don't add difficulty fee
  });

  // Calculate subtotal
  const subtotal = baseFee + volumeFee + difficultyFee;

  // Apply GST (5%)
  const gst = subtotal * 0.05;

  // Calculate total before minimum check
  let calculatedTotal = subtotal + gst;

  // Apply minimum price floor ($200)
  let minimumApplied = false;
  if (calculatedTotal < 200) {
    calculatedTotal = 200;
    minimumApplied = true;
  }

  // Return enriched pricing object (v1.6)
  return {
    // Legacy fields for backward compatibility
    volume_cy: totalVolume,
    base_price: baseFee, // Updated to dynamic value
    volume_price: volumeFee,
    difficulty_price: difficultyFee,
    extras_price: 0, // Always 0 for analysis phase
    subtotal: subtotal,
    gst: gst,
    total: calculatedTotal,
    total_items: totalItems,

    // New v1.6 fields
    baseFee: baseFee,
    volumeFee: volumeFee,
    difficultyFee: difficultyFee,
    complexityScore: complexityScore,
    itemCount: totalItems,
    minimumApplied: minimumApplied,
    breakdown: {
      highComplexityCount: highComplexityCount,
      mediumComplexityCount: mediumComplexityCount,
      lowComplexityCount: lowComplexityCount
    }
  };
}

// Calculate total volume from items
function calculateTotalVolume(items) {
  let totalVolume = 0;

  for (const item of items) {
    totalVolume += resolveItemVolume(item) * item.quantity;
  }

  return totalVolume;
}

// Determine difficulty based on items
function determineDifficulty(items) {
  let hasHeavy = false;
  let hasMedium = false;
  let hasConstruction = false;

  for (const item of items) {
    const name = `${item.catalog_key || ''} ${item.name || ''}`.toLowerCase();
    if (name.includes('construction') || name.includes('concrete') || name.includes('dirt') ||
      name.includes('brick') || name.includes('shingle')) {
      hasConstruction = true;
    }
    if (name.includes('fridge') || name.includes('washer') || name.includes('dryer') ||
      name.includes('concrete') || name.includes('dirt')) {
      hasHeavy = true;
    }
    if (name.includes('furniture') || name.includes('mattress') || name.includes('bookshelf') ||
      name.includes('desk') || name.includes('cabinet')) {
      hasMedium = true;
    }
  }

  if (hasConstruction) return 'very_heavy';
  if (hasHeavy) return 'heavy';
  if (hasMedium) return 'medium';
  return 'easy';
}

function determineCategory(itemName, catalogKey) {
  const key = normalizeCatalogKey(catalogKey);
  const name = `${key} ${itemName || ''}`.toLowerCase();

  if (name.includes('sofa') || name.includes('couch') || name.includes('chair') || name.includes('table') ||
    name.includes('bed') || name.includes('mattress') || name.includes('desk') || name.includes('cabinet') ||
    name.includes('dresser') || name.includes('wardrobe') || name.includes('bookshelf')) {
    return 'furniture';
  }
  if (name.includes('fridge') || name.includes('refrigerator') || name.includes('washer') ||
    name.includes('washing_machine') || name.includes('dryer') || name.includes('dishwasher') ||
    name.includes('microwave')) {
    return 'appliances';
  }
  if (name.includes('tv') || name.includes('computer') || name.includes('monitor') ||
    name.includes('electronics')) {
    return 'electronics';
  }
  if (name.includes('box') || name.includes('bag') || name.includes('cardboard')) {
    return 'packaging';
  }
  if (name.includes('construction') || name.includes('concrete') || name.includes('dirt')) {
    return 'construction';
  }
  if (name.includes('plant') || name.includes('yard') || name.includes('grass')) {
    return 'yard_waste';
  }

  return 'household';
}

// OLD LOGIC FOR TESTING (v1.5)
function calculatePricingOld(items) {
  // Use the same logic as frontend calculateTotal() for consistency

  // Minimum call-out fee - not worth going for less
  let base = 150;

  // Calculate volume and check for construction debris
  let totalVolume = 0;
  let totalItems = 0;
  let hasConstructionDebris = false;
  let constructionVolume = 0;

  items.forEach(item => {
    const itemVolume = item.volume * item.quantity;
    totalVolume += itemVolume;
    totalItems += item.quantity;

    // Check if it's construction debris (harder to handle)
    const category = item.category.toLowerCase();
    if (category.includes('construction') || category.includes('metal') || category.includes('wood')) {
      hasConstructionDebris = true;
      constructionVolume += itemVolume;
    }
  });

  // Price per cubic yard - construction debris costs more
  let volumePrice = totalVolume * 45; // Base rate $45/cy

  // Construction debris multiplier (1.5x harder to handle)
  if (hasConstructionDebris) {
    const constructionSurcharge = constructionVolume * 45 * 0.5; // Extra 50% for construction
    volumePrice += constructionSurcharge;
  }

  // Difficulty scales with number of items (more items = more labor)
  let difficulty = totalItems * 5;

  // For backend, we don't have additional services selected yet
  // So extras = 0 for analysis phase
  let extras = 0;

  let subtotal = base + volumePrice + difficulty + extras;

  // Ensure minimum $200 total (before tax)
  if (subtotal < 200) {
    subtotal = 200;
  }

  let gst = subtotal * 0.05;
  let total = subtotal + gst;

  return {
    volume_cy: totalVolume,
    base_price: base,
    volume_price: volumePrice,
    difficulty_price: difficulty,
    extras_price: extras,
    subtotal: subtotal,
    gst: gst,
    total: total,
    total_items: totalItems,
    has_construction_debris: hasConstructionDebris
  };
}

module.exports = {
  calculatePricing,
  calculatePricingOld,
  calculateTotalVolume,
  determineDifficulty,
  determineCategory,
  resolveItemVolume,
  ITEM_VOLUMES
};
