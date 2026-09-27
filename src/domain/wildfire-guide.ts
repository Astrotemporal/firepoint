/*
 * Wildfire guide content for /prepare. Adapted from the County of Los Angeles Fire Department's
 * "Ready! Set! Go! Your Personal Wildfire Action Plan" (revised May 20, 2026), plus California's
 * standard evacuation terms (Cal OES). General guidance only: never a live order, zone or all-clear.
 * public/offline.html mirrors the GO, TRAPPED and KIT content by hand; a test keeps them in sync.
 */

export type Source = { label: string; url: string };
export type Group = { title: string; items: readonly string[] };

export const SOURCES = {
  rsg: { label: "LA County Fire · Ready! Set! Go!", url: "https://fire.lacounty.gov/rsg/" },
  brochure: { label: "Ready! Set! Go! Wildfire Action Plan (PDF, May 2026)", url: "https://fire.lacounty.gov/wp-content/uploads/2026/05/Ready-Set-Go_5.20.26.pdf" },
  terms: { label: "Cal OES · Standard evacuation terms", url: "https://calalerts.org/evacuations.html" },
  zone: { label: "Glendale Fire · Know Your Zone", url: "https://www.glendaleca.gov/government/departments/fire-department/other-links/emergency-preparedness-response/know-your-zone" },
  genasys: { label: "Genasys Protect · external zone map", url: "https://protect.genasys.com/en?lat=34.2147&lng=-118.2629&z=11.3" },
  alerts: { label: "Glendale Alerts", url: "https://www.glendaleca.gov/government/departments/fire-department/other/emergency-preparedness-response/city-wide-emergency-communications" },
  nws: { label: "National Weather Service · Los Angeles/Oxnard", url: "https://www.weather.gov/lox/" },
  county: { label: "LA County emergency information", url: "https://lacounty.gov/emergency/" },
} as const satisfies Record<string, Source>;

/** Chapter I: defensible space, measured out from the house. */
export const ZONES = [
  {
    name: "Zone 1", reach: "0–30 ft", feet: 30,
    items: [
      "Remove dead leaves, needles, weeds and debris from the yard, roof, gutters, decks and stairs.",
      "Cut branches back 10 feet from any chimney or stovepipe.",
      "Keep plants low, watered and widely spaced. No hedges within 5 feet of the house.",
      "Move firewood and lumber out to Zone 2.",
    ],
  },
  {
    name: "Zone 2", reach: "30–100 ft", feet: 100,
    items: [
      "Mow annual grass to 3 inches or less.",
      "Space trees and shrubs apart, about three times their height.",
      "Clear fallen leaves, twigs, bark and small branches.",
    ],
  },
  {
    name: "Zone 3", reach: "100–200 ft", feet: 200,
    items: [
      "Thin native brush by 30 to 50 percent.",
      "Remove the lower third of large shrubs and all dead wood.",
      "Limb trees up at least 6 feet.",
    ],
  },
] as const;

/** Chapter I: harden the house against embers. */
export const HOME = [
  { part: "Roof", tip: "The most vulnerable part of a home. Use composition, metal or tile, keep it clear of needles and leaves, and cut branches back 10 feet." },
  { part: "Vents", tip: "Cover with 1/8-inch metal mesh. Fiberglass and plastic mesh melt." },
  { part: "Windows", tip: "Heat can break windows before a house ignites. Dual-pane with tempered outer glass resists breaking." },
  { part: "Eaves & gutters", tip: "Box in eaves with non-combustible material. Screen or enclose gutters." },
  { part: "Deck", tip: "Keep it clear of furniture and anything that burns. Enclose the underside." },
  { part: "Chimney", tip: "Cover outlets with 1/8-inch non-flammable mesh." },
  { part: "Garage", tip: "Keep a fire extinguisher, shovel, rake and bucket. Keep the door closed." },
  { part: "Address", tip: "Numbers at least 4 inches tall, in a contrasting color, visible from the road." },
  { part: "Water", tip: "Hoses long enough to reach every side of the house." },
  { part: "Utilities", tip: "Everyone in the household should know how to shut off gas, electricity and water." },
] as const;

/** Chapter II: the action plan's five questions. */
export const PLAN = [
  { q: "Who to call", a: "Pick one out-of-area friend or relative everyone checks in with. Post emergency numbers by the phone and in your kit." },
  { q: "Where to meet", a: "Choose a meeting place outside the fire area, so you know who got out." },
  { q: "How to get there", a: "Know several routes out of your neighborhood and practice them." },
  { q: "What to take", a: "An emergency supply kit for each person, and a spare kit in the car." },
  { q: "Your animals", a: "Pack pet supplies. Plan transport for large animals and move them early." },
] as const;

export const KIT = [
  "Three days of non-perishable food and three gallons of water per person",
  "Map marked with at least two evacuation routes",
  "Prescriptions or special medications",
  "Change of clothing and closed-toe shoes",
  "Extra eyeglasses or contact lenses",
  "Extra car keys, credit cards and cash",
  "First aid kit",
  "Flashlight",
  "Battery-powered radio and extra batteries",
  "Sanitation supplies",
  "Copies of important documents",
  "Food and water for your pets",
] as const;

export const SIX_PS = [
  { p: "People", detail: "and pets" },
  { p: "Papers", detail: "phone numbers and important documents" },
  { p: "Prescriptions", detail: "vitamins and eyeglasses" },
  { p: "Pictures", detail: "and irreplaceable memorabilia" },
  { p: "Personal computer", detail: "hard drives and flash drives" },
  { p: "Plastic", detail: "credit cards, ATM cards and cash" },
] as const;

/** Chapter II: if an evacuation is expected and there is time. */
export const BEFORE_LEAVING: readonly Group[] = [
  { title: "Animals", items: ["Find your pets and keep them close.", "Get large animals ready to move, and move them early."] },
  {
    title: "Inside",
    items: [
      "Shut all windows and doors.",
      "Take down flammable curtains and shades. Close metal shutters.",
      "Move furniture to the center of rooms, away from windows.",
      "Leave lights on so firefighters can see the house in smoke.",
      "Turn off the air conditioning.",
    ],
  },
  {
    title: "Outside",
    items: [
      "Bring in patio furniture, toys and doormats.",
      "Turn off propane tanks. Move grills away from the house.",
      "Connect garden hoses for firefighters, but leave sprinklers off. They drain water pressure.",
      "Put your kit in the car. Back it into the driveway, windows closed, keys with you.",
      "Check on your neighbors.",
    ],
  },
];

/** Chapter III: California's standard evacuation terms, quoted from Cal OES. */
export const TERMS = [
  { term: "Evacuation Warning", meaning: "Potential threat to life and/or property. Those who require additional time to evacuate, and those with pets and livestock, should leave now." },
  { term: "Evacuation Order", meaning: "Immediate threat to life. This is a lawful order to leave now. The area is lawfully closed to public access." },
  { term: "Shelter in Place", meaning: "Go indoors. Shut and lock doors and windows. Prepare to self-sustain until further notice and/or contacted by emergency personnel for additional direction." },
] as const;

/** Chapter III: when a wildfire starts. */
export const GO = [
  "Leave early. Don’t wait to be told if you feel threatened. In a fast fire there may be no time to warn everyone.",
  "Follow instructions from officials immediately.",
  "Go to a place you chose ahead of time, outside the fire area: an evacuation center, a shelter or a motel.",
  "Take a route away from the fire, and have a backup in case roads are blocked.",
  "Wear long sleeves, long pants, heavy shoes, a cap, goggles and a dry bandanna. Cotton is best.",
  "Take your pets. Make sure your kit is in the car.",
  "Tell family and friends where you are going.",
] as const;

export const TRAPPED: readonly Group[] = [
  {
    title: "At home",
    items: [
      "Call 911 and give your location.",
      "Shut off the gas meter. Fill sinks and tubs with water.",
      "Keep doors and windows closed but unlocked. Take down curtains.",
      "Turn lights on inside and out.",
      "Stay inside, away from outside walls.",
    ],
  },
  {
    title: "In a car",
    items: [
      "Park away from vegetation.",
      "Close all windows and vents.",
      "Cover yourself with a wool or cotton blanket or jacket.",
      "Lie on the floor.",
      "Call 911 and give your location.",
    ],
  },
  {
    title: "On foot",
    items: [
      "Go to an area clear of vegetation, or a ditch or low spot on level ground.",
      "Lie face down and cover your body.",
      "Call 911 and give your location.",
    ],
  },
];

export const RETURNING = [
  "Don’t return until officials say it is safe.",
  "Watch for downed power lines.",
  "Check propane tanks, regulators and lines before turning gas on.",
  "Check the house carefully for hidden embers.",
] as const;

/** Chapter photos: US government works (public domain), served from public/guide. */
export const PHOTOS = {
  cover: {
    src: "/guide/cover-eaton-fire.jpg", width: 1600, height: 1200,
    alt: "Smoke from the Eaton Fire rising over the ridges of the San Gabriel Mountains.",
    credit: "Eaton Fire, January 8, 2025. Matt Muller, USDA Forest Service",
    url: "https://commons.wikimedia.org/wiki/File:Eaton_Fire_on_2025-1-8_(cropped).jpg",
  },
  ready: {
    src: "/guide/ready-brush-clearance.jpg", width: 1400, height: 1050,
    alt: "Firefighters cutting and clearing dry brush on a slope below a house.",
    credit: "Crews clear brush behind homes near Altadena. USDA Forest Service",
    url: "https://commons.wikimedia.org/wiki/File:2025_Southern_California_fires_and_the_United_States_Forest_Service_(USFS)_-_Cleveland_National_Forest_Engine_Crews_clear_brush_at_the_Eaton_Fire_(54265150391).jpg",
  },
  set: {
    src: "/guide/set-supply-kit.jpg", width: 1200, height: 797,
    alt: "An emergency supply bag with water bottles, a flashlight, batteries, gloves, goggles, a whistle and a poncho.",
    credit: "A ready-to-go supply kit. FEMA / American Red Cross",
    url: "https://commons.wikimedia.org/wiki/File:FEMA_-_37174_-_Emergency_Preparedness_%22ready_to_go%22_kit..jpg",
  },
  go: {
    src: "/guide/go-eaton-fire-night.jpg", width: 1400, height: 1050,
    alt: "Fire engines on a residential street at night while a house burns.",
    credit: "Initial attack on the Eaton Fire. USDA Forest Service",
    url: "https://commons.wikimedia.org/wiki/File:Angeles_National_Forest_firefighters_during_initial_attack_of_the_Eaton_Firepng.png",
  },
} as const;

/*
 * Everything a reader sees on /prepare, per language. English is assembled from the constants above
 * (which offline.html and tests also use); Spanish and Eastern Armenian live beside this file and must
 * match this shape item for item. Links, photo files, zone distances and official English terms are shared.
 */
type Strings<T> = T extends string ? string : T extends readonly (infer U)[] ? readonly Strings<U>[] : { readonly [K in keyof T]: Strings<T[K]> };

export const GUIDE_UI_EN = {
  metaTitle: "Firepoint | Ready, Set, Go",
  metaDescription: "A wildfire guide for Glendale, adapted from the LA County Fire Department's Ready! Set! Go! plan.",
  back: "Map",
  title: "Wildfire guide",
  brandLabel: "Firepoint map",
  chaptersLabel: "Chapters",
  languageLabel: "Language",
  chapter: "Chapter",
  opensNewTab: "(opens in a new tab)",
  publicDomain: "public domain",
  translationNotice: "",
  readInEnglish: "",
  officialTerm: "",
  coverKicker: "A wildfire guide for Glendale",
  coverTitle: ["Ready.", "Set.", "Go."],
  coverDek: "Wildfires here are fed by dry brush and driven by strong, dry winds, and very few residents prepare to evacuate until it is too late. This is what firefighters ask you to do: before fire season, when a fire is near, and when it’s time to leave. Based on the LA County Fire Department’s Ready! Set! Go! plan.",
  emergencyLabel: "Emergency",
  urgentCall: "In danger? Call 911.",
  urgentNote: "Firepoint is not an alert system and does not check evacuation orders or your zone.",
  checkZone: "Check your zone",
  signUpAlerts: "Sign up for Glendale Alerts",
  inside: "Inside",
  defensibleTitle: "Defensible space",
  defensibleLede: "Defensible space is the buffer between your house and the landscape around it. It slows a fire down and gives firefighters room to stand between your home and the flames. It runs 200 feet out, in three zones.",
  ringsLabel: "Defensible space: Zone 1 is 0 to 30 feet from the house, Zone 2 is 30 to 100 feet, Zone 3 is 100 to 200 feet.",
  ringsCaption: "Three zones, 200 feet in all. Your house sits at the center.",
  feet: "ft",
  quoteEmbers: "Windblown embers from a wildfire will find the weak link in your home’s fire protection scheme.",
  quoteLeaveEarly: "By leaving early, you will give your family the best chance of surviving a wildfire.",
  quoteSource: "Ready! Set! Go! Wildfire Action Plan",
  hardenTitle: "Harden your home",
  planTitle: "Your wildfire action plan",
  planLede: "Make it with everyone in your household, well before fire season. Practice it, and post it where you can find it fast.",
  kitKicker: "One per person",
  kitTitle: "Emergency supply kit",
  kitLede: "A backpack works well. Keep food and water in a tub you can lift into the car.",
  sixPsTitle: "Remember the six P’s",
  sixPsLede: "If you have minutes, not hours, grab these.",
  beforeLeavingTitle: "If an evacuation is coming and there’s time",
  termsTitle: "Know the official terms",
  termsLedeBefore: "Officials use these words in alerts. Follow them immediately. Check",
  termsLedeAfter: "for your area.",
  termsQuoted: "Terms quoted from",
  goTitle: "When a wildfire starts",
  trappedTitle: "If you become trapped",
  trappedLede: "Stay calm. Call 911 and tell them where you are.",
  returningTitle: "Coming home",
  sourcesTitle: "Keep these open",
  sourcesLede: "Firepoint only explains the guidance. For orders, zones and conditions, go to the source.",
  footerAdapted: "Adapted from the County of Los Angeles Fire Department’s Ready! Set! Go! Wildfire Action Plan (revised May 20, 2026). Photos are US government works in the public domain.",
  footerDisclaimer: "Independent community tool, not a government service. General guidance only: no live alerts, zone lookup, or all-clear information. In an emergency, follow local officials. Call 911 for immediate help.",
} as const;

const GUIDE_EN_SHAPE = {
  ui: GUIDE_UI_EN,
  chapters: [
    { word: "Ready", topic: "Your home", line: "Clear the space around your house and seal it against embers." },
    { word: "Set", topic: "Your family", line: "Make a plan, pack a kit, and know what to do before you leave." },
    { word: "Go", topic: "Leaving", line: "Leave early, know the official terms, and what to do if trapped." },
  ],
  // Shared translation contract; Genasys gets its English-only caution/link in the component.
  sources: {
    rsg: SOURCES.rsg.label, brochure: SOURCES.brochure.label, terms: SOURCES.terms.label,
    zone: SOURCES.zone.label, alerts: SOURCES.alerts.label, nws: SOURCES.nws.label,
    county: SOURCES.county.label,
  },
  zones: ZONES.map(({ name, reach, items }) => ({ name, reach, items })),
  home: HOME,
  plan: PLAN,
  kit: KIT,
  sixPs: SIX_PS,
  beforeLeaving: BEFORE_LEAVING,
  terms: TERMS,
  go: GO,
  trapped: TRAPPED,
  returning: RETURNING,
  photoAlts: Object.fromEntries(Object.entries(PHOTOS).map(([key, photo]) => [key, photo.alt])) as { [K in keyof typeof PHOTOS]: string },
};

/** The shape every translation of the guide must fill in. */
export type GuideContent = Strings<typeof GUIDE_EN_SHAPE>;
export const GUIDE_EN: GuideContent = GUIDE_EN_SHAPE;
