// Item categories for dynamic base fee calculation
// Complexity levels determine base fee: HIGH/MEDIUM/LOW with weights 1.0/0.7/0.3
const ITEM_CATEGORIES = {
  // HIGH complexity (1.0) - furniture, appliances, construction debris
  sofa: { name: 'Sofa', complexity: 'HIGH', weight: 1.0, baseVolume: 1.2 },
  couch: { name: 'Couch', complexity: 'HIGH', weight: 1.0, baseVolume: 1.2 },
  bed: { name: 'Bed', complexity: 'HIGH', weight: 1.0, baseVolume: 1.5 },
  mattress_with_furniture: { name: 'Mattress (with Furniture)', complexity: 'HIGH', weight: 1.0, baseVolume: 1.0 },
  dresser: { name: 'Dresser', complexity: 'HIGH', weight: 1.0, baseVolume: 0.8 },
  cabinet: { name: 'Cabinet', complexity: 'HIGH', weight: 1.0, baseVolume: 0.8 },
  wardrobe: { name: 'Wardrobe', complexity: 'HIGH', weight: 1.0, baseVolume: 1.2 },
  desk: { name: 'Desk', complexity: 'HIGH', weight: 1.0, baseVolume: 0.9 },
  table: { name: 'Table', complexity: 'HIGH', weight: 1.0, baseVolume: 1.0 },
  refrigerator: { name: 'Refrigerator', complexity: 'HIGH', weight: 1.0, baseVolume: 1.0 },
  fridge: { name: 'Fridge', complexity: 'HIGH', weight: 1.0, baseVolume: 1.0 },
  washing_machine: { name: 'Washing Machine', complexity: 'HIGH', weight: 1.0, baseVolume: 1.0 },
  washer: { name: 'Washer', complexity: 'HIGH', weight: 1.0, baseVolume: 1.0 },
  dryer: { name: 'Dryer', complexity: 'HIGH', weight: 1.0, baseVolume: 0.8 },
  large_tv: { name: 'Large TV', complexity: 'HIGH', weight: 1.0, baseVolume: 0.6 },
  tv: { name: 'TV', complexity: 'HIGH', weight: 1.0, baseVolume: 0.6 },
  construction_debris: { name: 'Construction Debris', complexity: 'HIGH', weight: 1.0, baseVolume: 0.0 },
  concrete: { name: 'Concrete', complexity: 'HIGH', weight: 1.0, baseVolume: 0.0 },
  metal_scraps: { name: 'Metal Scraps', complexity: 'HIGH', weight: 1.0, baseVolume: 0.0 },
  dirt: { name: 'Dirt', complexity: 'HIGH', weight: 1.0, baseVolume: 0.0 },

  // MEDIUM complexity (0.7) - chairs, bookshelves, small appliances, carpets
  chair: { name: 'Chair', complexity: 'MEDIUM', weight: 0.7, baseVolume: 0.3 },
  bookshelf: { name: 'Bookshelf', complexity: 'MEDIUM', weight: 0.7, baseVolume: 0.6 },
  microwave: { name: 'Microwave', complexity: 'MEDIUM', weight: 0.7, baseVolume: 0.2 },
  dishwasher: { name: 'Dishwasher', complexity: 'MEDIUM', weight: 0.7, baseVolume: 0.5 },
  carpet: { name: 'Carpet', complexity: 'MEDIUM', weight: 0.7, baseVolume: 0.5 },
  rug: { name: 'Rug', complexity: 'MEDIUM', weight: 0.7, baseVolume: 0.3 },
  mattress_alone: { name: 'Mattress', complexity: 'MEDIUM', weight: 0.7, baseVolume: 0.8 },
  mattress: { name: 'Mattress', complexity: 'MEDIUM', weight: 0.7, baseVolume: 0.8 },
  door: { name: 'Door', complexity: 'MEDIUM', weight: 0.7, baseVolume: 0.2 },
  window: { name: 'Window', complexity: 'MEDIUM', weight: 0.7, baseVolume: 0.2 },
  computer: { name: 'Computer', complexity: 'MEDIUM', weight: 0.7, baseVolume: 0.2 },
  monitor: { name: 'Monitor', complexity: 'MEDIUM', weight: 0.7, baseVolume: 0.2 },
  electronics: { name: 'Electronics', complexity: 'MEDIUM', weight: 0.7, baseVolume: 0.4 },

  // LOW complexity (0.3) - boxes, bags, books, yard waste
  cardboard_box: { name: 'Cardboard Box', complexity: 'LOW', weight: 0.3, baseVolume: 0.1 },
  box: { name: 'Box', complexity: 'LOW', weight: 0.3, baseVolume: 0.1 },
  paper_bag: { name: 'Paper Bag', complexity: 'LOW', weight: 0.3, baseVolume: 0.05 },
  bag: { name: 'Bag', complexity: 'LOW', weight: 0.3, baseVolume: 0.05 },
  clothing_bag: { name: 'Clothing Bag', complexity: 'LOW', weight: 0.3, baseVolume: 0.08 },
  clothing: { name: 'Clothing', complexity: 'LOW', weight: 0.3, baseVolume: 0.08 },
  book: { name: 'Book', complexity: 'LOW', weight: 0.3, baseVolume: 0.02 },
  magazine: { name: 'Magazine', complexity: 'LOW', weight: 0.3, baseVolume: 0.01 },
  plastic_container: { name: 'Plastic Container', complexity: 'LOW', weight: 0.3, baseVolume: 0.05 },
  wood_plank: { name: 'Wood Plank', complexity: 'LOW', weight: 0.3, baseVolume: 0.1 },
  wood: { name: 'Wood', complexity: 'LOW', weight: 0.3, baseVolume: 0.1 },
  metal: { name: 'Metal', complexity: 'LOW', weight: 0.3, baseVolume: 0.8 },
  yard_waste: { name: 'Yard Waste', complexity: 'LOW', weight: 0.3, baseVolume: 0.2 },
  plant: { name: 'Plant', complexity: 'LOW', weight: 0.3, baseVolume: 0.1 },
  cardboard: { name: 'Cardboard', complexity: 'LOW', weight: 0.3, baseVolume: 0.1 },
  paper: { name: 'Paper', complexity: 'LOW', weight: 0.3, baseVolume: 0.05 },
  glass: { name: 'Glass', complexity: 'LOW', weight: 0.3, baseVolume: 0.2 },
  plastic: { name: 'Plastic', complexity: 'LOW', weight: 0.3, baseVolume: 0.05 },
  paint: { name: 'Paint', complexity: 'LOW', weight: 0.3, baseVolume: 0.05 },
  chemicals: { name: 'Chemicals', complexity: 'LOW', weight: 0.3, baseVolume: 0.1 },
  bike: { name: 'Bike', complexity: 'LOW', weight: 0.3, baseVolume: 0.4 },
  tires: { name: 'Tires', complexity: 'LOW', weight: 0.3, baseVolume: 0.3 },
  toaster: { name: 'Toaster', complexity: 'LOW', weight: 0.3, baseVolume: 0.1 },
  vacuum: { name: 'Vacuum', complexity: 'LOW', weight: 0.3, baseVolume: 0.2 },
  lamp: { name: 'Lamp', complexity: 'LOW', weight: 0.3, baseVolume: 0.1 },
  household: { name: 'Household', complexity: 'LOW', weight: 0.3, baseVolume: 0.3 }
};

const CATALOG_KEYS = [
  'sofa', 'couch', 'bed', 'mattress', 'dresser', 'cabinet', 'wardrobe', 'desk', 'table',
  'refrigerator', 'fridge', 'washer', 'dryer', 'tv', 'microwave', 'dishwasher', 'bookshelf',
  'chair', 'carpet', 'rug', 'door', 'window', 'computer', 'monitor', 'electronics',
  'box', 'bag', 'book', 'clothing', 'wood', 'plastic', 'cardboard', 'paper', 'glass',
  'yard_waste', 'plant', 'bike', 'tires', 'vacuum', 'lamp', 'toaster', 'concrete', 'dirt',
  'construction_debris', 'metal', 'household'
];

function normalizeCatalogKey(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function hasCatalogKey(value) {
  return Object.prototype.hasOwnProperty.call(ITEM_CATEGORIES, normalizeCatalogKey(value));
}

// Helper function to get complexity weight for an item
function getComplexityWeight(itemNameOrKey, fallbackName) {
  return getItemCategory(itemNameOrKey, fallbackName).weight;
}

// Helper function to get item category info
function getItemCategory(itemNameOrKey, fallbackName) {
  const normalizedKey = normalizeCatalogKey(itemNameOrKey);

  // Direct match first
  if (ITEM_CATEGORIES[normalizedKey]) {
    return ITEM_CATEGORIES[normalizedKey];
  }

  const normalizedName = normalizeCatalogKey(fallbackName || itemNameOrKey);

  // Fuzzy match by checking if any key is contained in the item name.
  for (const [key, category] of Object.entries(ITEM_CATEGORIES)) {
    if (normalizedName.includes(key)) {
      return category;
    }
  }

  // Default category for unknown items
  return {
    name: fallbackName || itemNameOrKey,
    complexity: 'LOW',
    weight: 0.3,
    baseVolume: 0.3
  };
}

module.exports = {
  CATALOG_KEYS,
  ITEM_CATEGORIES,
  getComplexityWeight,
  getItemCategory,
  hasCatalogKey,
  normalizeCatalogKey
};
