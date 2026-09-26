/*
 * Wildfire preparedness guidance, following CAL FIRE's Ready, Set, Go! and Ready.gov.
 * General guidance only: it never states a live order, a zone or an all-clear.
 * public/offline.html mirrors these labels by hand; a test keeps the two in sync.
 */

export type CheckItem = { id: string; label: string; detail: string };
export type Step = { label: string; detail: string };
export type Source = { label: string; url: string };
export type Stage = {
  id: "ready" | "set" | "go";
  tab: string;
  title: string;
  intro: string;
  steps: Step[];
  sources: Source[];
};

// Stored under firepoint.prep.v1. These four ids predate the go-bag list; keep them stable.
export const PLAN_ITEMS = [
  { id: "contacts", label: "Write down important phone numbers", detail: "Keep a paper copy where you can find it." },
  { id: "medication", label: "Set aside medication and essentials", detail: "Include what each person or pet needs." },
  { id: "route", label: "Talk through how you would leave", detail: "Choose a meeting place and a backup plan." },
  { id: "alerts", label: "Sign up for official alerts", detail: "Use the Glendale Alerts link on this page." },
] as const satisfies readonly CheckItem[];

export const PACK_ITEMS = [
  { id: "water", label: "Water", detail: "About one gallon per person per day, for three days." },
  { id: "food", label: "Food that will not spoil", detail: "Three days’ worth, plus a manual can opener." },
  { id: "masks", label: "N95 masks", detail: "Cloth and surgical masks do not filter smoke." },
  { id: "prescriptions", label: "Prescriptions and glasses", detail: "A week of medication, a list of doses, spare glasses." },
  { id: "first-aid", label: "First aid kit", detail: "Include any personal medical supplies." },
  { id: "documents", label: "Copies of important papers", detail: "ID, insurance, deeds, medical records. A photo on your phone helps too." },
  { id: "chargers", label: "Phone chargers and a battery pack", detail: "Keep the battery pack charged." },
  { id: "radio", label: "Battery or hand-crank radio", detail: "With spare batteries, in case phones and power fail." },
  { id: "flashlight", label: "Flashlight", detail: "With spare batteries." },
  { id: "cash", label: "Cash and cards", detail: "ATMs and card readers may be down." },
  { id: "clothes", label: "Change of clothes and sturdy shoes", detail: "Long sleeves and pants in cotton or wool." },
  { id: "keys", label: "Spare car and house keys", detail: "Keep a set in the go bag." },
  { id: "hygiene", label: "Toiletries and sanitation", detail: "Wipes, hand sanitizer, feminine supplies." },
  { id: "pets", label: "Pet supplies", detail: "Food, water, leash or carrier, medication, vet records." },
  { id: "keepsakes", label: "Photos and keepsakes", detail: "Or a drive with digital copies. Decide ahead of time what matters most." },
] as const satisfies readonly CheckItem[];

export const CHECK_ITEMS: readonly CheckItem[] = [...PLAN_ITEMS, ...PACK_ITEMS];

const CAL_FIRE_GO_BAG = { label: "CAL FIRE · Create your go bag", url: "https://www.readyforwildfire.org/prepare-for-wildfire/emergency-supply-kit/" };
const CAL_FIRE_RSG = { label: "CAL FIRE · Ready, Set, Go!", url: "https://www.readyforwildfire.org/prepare-for-wildfire/ready-set-go/" };
const CAL_FIRE_EVAC = { label: "CAL FIRE · Evacuation steps", url: "https://www.readyforwildfire.org/prepare-for-wildfire/go-evacuation-guide/evacuation-steps/" };
const READY_GOV = { label: "Ready.gov · Wildfires", url: "https://www.ready.gov/wildfires" };

export const STAGES: readonly Stage[] = [
  {
    id: "ready",
    tab: "Ready",
    title: "Before fire season",
    intro: "Make a plan and pack a go bag for each person, so you can leave in minutes.",
    steps: [],
    sources: [CAL_FIRE_GO_BAG, CAL_FIRE_RSG],
  },
  {
    id: "set",
    tab: "Set",
    title: "Fire nearby or a Red Flag Warning",
    intro: "Get your household and home ready to leave. Keep checking official sources.",
    steps: [
      { label: "Watch for official alerts", detail: "Check Glendale Alerts, Know Your Zone and local news. Keep your phone charged." },
      { label: "Load the car and park facing out", detail: "Put go bags in, keep the tank full, and keep your keys with you." },
      { label: "Keep pets close", detail: "Bring them inside and have carriers and leashes ready." },
      { label: "Close windows and doors, but leave them unlocked", detail: "Close vents and garage doors too. Firefighters may need to get in." },
      { label: "Move burnable things away from the house", detail: "Bring in patio furniture, doormats and trash bins. Take down flammable curtains." },
      { label: "Leave hoses connected and lights on", detail: "Firefighters can use the hoses. Lights help them see your home in smoke." },
      { label: "Wear protective clothing", detail: "Long sleeves and pants in cotton or wool, sturdy shoes, and an N95 mask for smoke." },
    ],
    sources: [CAL_FIRE_RSG, READY_GOV],
  },
  {
    id: "go",
    tab: "Go",
    title: "Leaving",
    intro: "Leave early. You do not have to wait for an order if you feel unsafe.",
    steps: [
      { label: "Follow official instructions first", detail: "If authorities tell you to leave, go right away, using the routes they give." },
      { label: "Take your go bag, people and pets", detail: "Do not go back for belongings." },
      { label: "Drive with headlights on and windows closed", detail: "Set air to recirculate. Watch for fire crews and people on foot." },
      { label: "Tell someone where you are going", detail: "Texts often get through when calls do not." },
      { label: "If you are trapped, call 911", detail: "Give your location. Help may be delayed, so turn on lights to help rescuers find you." },
      { label: "Do not return until officials say it is safe", detail: "Hot ash, embers and damaged lines can remain after the fire passes." },
    ],
    sources: [CAL_FIRE_EVAC, READY_GOV],
  },
];

export function parseSavedChecks(raw: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return CHECK_ITEMS.map((item) => item.id).filter((id) => parsed.includes(id));
  } catch { return []; }
}
