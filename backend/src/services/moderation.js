/**
 * Moderation / image-gating decision layer (MVP — Layer C only).
 *
 * Consumes the per-photo `safety` verdicts that gpt-4o already returns in the
 * same vision call (is_junk_removal / image_quality / content_flags) — $0 extra.
 * Produces ONE decision for the whole upload:
 *   { status, category, message, links?, surchargeNote? }
 *
 * Bogdan's §7 decisions (2026-05-31):
 *  1. surcharge items → ALLOW with a note (auto-quote, not flag-human)
 *  2. dead animal / hazmat → warm redirect "we can help, contact 311 / Fish & Wildlife" + links
 *  3. thresholds SOFTER — recognize & respond gracefully, no hard wall; illegal still blocked but neutral
 *  4. mod-chat / FLAG-human routing → deferred to v2.0 (not here)
 *
 * status values the frontend understands:
 *   allow            → normal quote (may carry surchargeNote)
 *   retake           → photo unusable (dark/blurry/etc) — ask to retake
 *   not_recognized   → no junk found / wrong photo (selfie, food, screenshot…)
 *   out_of_scope     → legit request, wrong service (dead animal, hazmat) — redirect + links
 *   unsupported      → illegal/abusive — neutral block, never reveal detector
 */

// Order matters: earliest match wins (most serious first).
const ILLEGAL_FLAGS = ['weapon', 'ammunition', 'explosive', 'drugs', 'nsfw', 'gore', 'hate'];
const OUT_OF_SCOPE_FLAGS = [
  'dead_animal', 'biohazard', 'feces', 'blood', 'sharps', 'medical_waste',
  'asbestos', 'chemical', 'fuel', 'propane', 'automotive_fluid', 'fluorescent_mercury', 'hazmat_symbol'
];
const SURCHARGE_FLAGS = ['tires', 'refrigerant_appliance', 'e_waste', 'construction_debris', 'heavy_specialty'];

const CALGARY_311 = 'https://www.calgary.ca/roads/report-dead-animals.html';
const AB_WILDLIFE = 'https://www.alberta.ca/found-dead-wildlife';

// Out-of-scope copy per flag (verified Calgary/Alberta contacts).
const OUT_OF_SCOPE_COPY = {
  dead_animal: {
    message: "We don't haul animal remains ourselves, but we can point you the right way. On a Calgary street, park or alley, report it to the City (dial 311, or 403-268-2489 from outside Calgary). For wildlife or highway roadkill, contact Alberta Fish & Wildlife (toll-free 310-0000). They'll arrange safe removal.",
    links: [
      { label: 'City of Calgary — report a dead animal', url: CALGARY_311 },
      { label: 'Alberta — found dead wildlife', url: AB_WILDLIFE }
    ]
  },
  biohazard: { message: "We're not able to handle biological or hazardous waste. For this, please contact a specialized biohazard cleanup service." },
  feces: { message: "We're not able to handle biological or human waste. Please contact a specialized biohazard cleanup service." },
  blood: { message: "This needs specialized handling we don't provide. Please contact a professional biohazard or trauma cleanup service." },
  sharps: { message: "We can't accept needles or sharps. Many Calgary pharmacies and the City's household hazardous waste program accept sharps containers for free." },
  medical_waste: { message: "We don't handle medical or laboratory waste. Please contact a licensed medical waste disposal provider." },
  asbestos: { message: "Materials that may contain asbestos require certified abatement, which we don't provide. Please contact a licensed asbestos abatement company in Calgary." },
  chemical: { message: "We can't take paint, solvents, or chemicals. The City of Calgary offers free Household Hazardous Waste drop-off — please use that." },
  fuel: { message: "We can't transport fuel or flammable liquids. The City's Household Hazardous Waste program accepts these safely." },
  propane: { message: "For safety, we can't transport propane tanks or pressurized cylinders. Please use a propane exchange or an eco-station that accepts cylinders." },
  automotive_fluid: { message: "We don't haul automotive fluids or batteries. Auto-parts retailers and City eco-stations accept used oil, antifreeze, and car batteries for free recycling." },
  fluorescent_mercury: { message: "Fluorescent tubes and mercury-containing items need special handling. Calgary eco-stations and many retailers accept these for free." },
  hazmat_symbol: { message: "This appears to contain hazardous materials we're not equipped to handle. Please contact a specialized hazmat service or the City of Calgary's hazardous waste program." }
};

// Surcharge note per flag (ALLOW + transparency).
const SURCHARGE_COPY = {
  tires: 'Heads-up: tires carry a separate recycling fee — we\'ll confirm it before pickup.',
  refrigerant_appliance: 'Heads-up: fridges, freezers and AC units contain refrigerant that must be safely recovered, so a small fee applies.',
  e_waste: 'Heads-up: older tube TVs and monitors need special recycling, so a small handling fee may apply.',
  construction_debris: 'Heads-up: construction debris and concrete are priced by weight due to landfill fees — final price confirmed on site.',
  heavy_specialty: 'Heads-up: heavy specialty items (pianos, hot tubs, safes) may need extra crew — final price confirmed before pickup.'
};

const QUALITY_COPY = {
  too_dark: "It's a bit too dark to make out what's here. Turn on a light, open a door, or use your flash, then retake.",
  backlit: "The light behind your items is turning them into a shadow. Stand so the window or sun is behind you, then retake.",
  overexposed: "This shot's washed out by bright light. Step into some shade or turn off the flash and retake.",
  blurry: "This came out a little blurry. Hold steady, tap the screen on the items to focus, and try again.",
  obstructed: "Something's blocking part of the photo — a finger or smudge on the lens, maybe. Clear it and retake.",
  too_close: "We're too zoomed in to judge size. Step back so the whole item (and what's around it) is in frame, then retake.",
  too_far: "The items are pretty far off, so we can't see the details. Move a bit closer and retake.",
  partially_cropped: "Part of your item runs off the edge of the photo. Back up so the whole thing fits in frame, then retake.",
  no_subject: "We couldn't spot any items to remove. Make sure the things you want hauled away are in frame and well-lit, then retake."
};

const GENERIC = {
  retake: "This photo was a little hard to read. For the best quote, retake it in good light, hold steady, and frame the whole pile — then we'll take a look.",
  not_recognized: "This doesn't look like items for junk removal — it may be the wrong photo. Snap a picture of the stuff you'd like hauled away (furniture, appliances, boxes, yard waste — anything you want gone) and we'll quote it.",
  out_of_scope: "Thanks for reaching out! This isn't something we can haul as part of our junk-removal service, but it can usually be handled by a specialized service. For regular household junk, furniture and yard waste, send us a photo and we'll quote it.",
  unsupported: "We couldn't process this image. Please upload a clear photo of the items you'd like removed."
};

/**
 * Aggregate per-photo safety verdicts into one upload-level view.
 */
function aggregateSafety(analyses) {
  const flags = new Set();
  let anyJunk = false;
  const qualities = [];
  (analyses || []).forEach(a => {
    const s = a && a.safety;
    if (!s) { anyJunk = true; return; } // missing safety → don't over-block
    if (s.is_junk_removal) anyJunk = true;
    (s.content_flags || []).forEach(f => flags.add(f));
    if (s.image_quality) qualities.push(s.image_quality);
  });
  return { flags, anyJunk, qualities };
}

function firstMatch(list, flagSet) {
  for (const f of list) if (flagSet.has(f)) return f;
  return null;
}

/**
 * @param analyses  array of per-image analysis objects (each may carry .safety)
 * @param itemCount number of recognized items in the final response
 * @returns moderation decision object
 */
function decideModeration(analyses, itemCount) {
  const { flags, anyJunk, qualities } = aggregateSafety(analyses);

  // 1. Illegal / abusive → neutral block (don't reveal which detector fired).
  const illegal = firstMatch(ILLEGAL_FLAGS, flags);
  if (illegal) {
    return { status: 'unsupported', category: illegal, message: GENERIC.unsupported };
  }

  // If we DID recognize sellable items, allow — but surface a surcharge note if relevant.
  if (itemCount > 0) {
    const surcharge = firstMatch(SURCHARGE_FLAGS, flags);
    if (surcharge) {
      return { status: 'allow', category: surcharge, message: null, surchargeNote: SURCHARGE_COPY[surcharge] };
    }
    return { status: 'allow', category: 'ok', message: null };
  }

  // No items recognized. Figure out the most helpful reason.

  // 2. Out-of-scope (dead animal / hazmat) → warm redirect + links.
  const oos = firstMatch(OUT_OF_SCOPE_FLAGS, flags);
  if (oos) {
    const copy = OUT_OF_SCOPE_COPY[oos] || { message: GENERIC.out_of_scope };
    return { status: 'out_of_scope', category: oos, message: copy.message, links: copy.links };
  }

  // 3. Bad image quality → ask to retake (only if a real quality problem, not just "no_subject").
  const badQuality = qualities.find(q => q && q !== 'ok' && q !== 'no_subject');
  if (badQuality) {
    return { status: 'retake', category: badQuality, message: QUALITY_COPY[badQuality] || GENERIC.retake };
  }

  // 4. Not junk / wrong photo (selfie, food, screenshot, injection text, empty room…).
  return { status: 'not_recognized', category: anyJunk ? 'no_subject' : 'not_junk', message: GENERIC.not_recognized };
}

module.exports = {
  decideModeration,
  aggregateSafety,
  // exported for tests / reuse
  ILLEGAL_FLAGS,
  OUT_OF_SCOPE_FLAGS,
  SURCHARGE_FLAGS
};
