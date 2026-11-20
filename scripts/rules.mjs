/**
 * 2024 crafting rules: which tool crafts which item, and the Fast Crafting table.
 * Items are matched by their dnd5e identifier (a slug of the name).
 */

export const MODULE_ID = "dnd5e-crafting";

/** Artisan's Tools keys in CONFIG.DND5E.tools. */
export const ARTISAN_TOOLS = [
  "alchemist", "brewer", "calligrapher", "carpenter", "cartographer", "cobbler", "cook", "glassblower",
  "jeweler", "leatherworker", "mason", "painter", "potter", "smith", "tinker", "weaver", "woodcarver"
];

/**
 * Items each tool can craft, from the "Craft" line of each tool in the 2024 Player's Handbook.
 * Weapons and armor are handled by category in {@link mundaneTools}.
 */
export const TOOL_CRAFTS = {
  alchemist: ["acid", "alchemists-fire", "component-pouch", "oil", "paper", "perfume"],
  brewer: ["antitoxin"],
  calligrapher: ["ink", "spell-scroll"],
  carpenter: ["club", "greatclub", "quarterstaff", "barrel", "chest", "ladder", "pole", "portable-ram", "torch"],
  cartographer: ["map"],
  cobbler: ["climbers-kit"],
  cook: ["rations"],
  glassblower: ["glass-bottle", "magnifying-glass", "spyglass", "vial"],
  jeweler: ["crystal", "orb", "rod", "staff", "wand", "amulet", "emblem", "reliquary"],
  leatherworker: [
    "sling", "whip", "hide-armor", "leather-armor", "studded-leather-armor", "backpack", "crossbow-bolt-case",
    "map-or-scroll-case", "parchment", "pouch", "quiver", "waterskin"
  ],
  mason: ["block-and-tackle"],
  painter: ["sprig-of-mistletoe", "wooden-staff", "yew-wand", "amulet", "emblem", "reliquary"],
  potter: ["jug", "lamp"],
  smith: [
    "ball-bearings", "bucket", "caltrops", "chain", "crowbar", "firearm-bullets", "grappling-hook", "iron-pot",
    "iron-spikes", "sling-bullets"
  ],
  tinker: [
    "musket", "pistol", "bell", "bullseye-lantern", "flask", "hooded-lantern", "hunting-trap", "lock", "manacles",
    "mirror", "shovel", "signal-whistle", "tinderbox"
  ],
  weaver: [
    "padded-armor", "basket", "bedroll", "blanket", "fine-clothes", "net", "robe", "rope", "sack", "string", "tent",
    "travelers-clothes"
  ],
  woodcarver: [
    "club", "greatclub", "quarterstaff", "crystal", "orb", "rod", "staff", "wand", "arrows", "bolts", "sprig-of-mistletoe",
    "wooden-staff", "yew-wand", "ink-pen", "needles"
  ],
  herb: ["antitoxin", "candle", "healers-kit", "potion-of-healing"],
  pois: ["basic-poison"],
  disg: ["costume"]
};

/** Fast Crafting table (Crafter feat, 2024 Player's Handbook). */
export const FAST_CRAFTING = {
  carpenter: ["ladder", "torch"],
  leatherworker: ["crossbow-bolt-case", "map-or-scroll-case", "pouch"],
  mason: ["block-and-tackle"],
  potter: ["jug", "lamp"],
  smith: ["ball-bearings", "bucket", "caltrops", "grappling-hook", "iron-pot"],
  tinker: ["bell", "shovel", "tinderbox"],
  weaver: ["basket", "rope", "net", "tent"],
  woodcarver: ["club", "greatclub", "quarterstaff"]
};

/** Compendium identifiers that differ from the names used in the tables above. */
const ALIASES = {
  "case-crossbow-bolt": "crossbow-bolt-case",
  "case-map-or-scroll": "map-or-scroll-case",
  "bottle-glass": "glass-bottle",
  "clothes-fine": "fine-clothes",
  "clothes-travelers": "travelers-clothes",
  "lantern-bullseye": "bullseye-lantern",
  "lantern-hooded": "hooded-lantern",
  "pot-iron": "iron-pot",
  "ram-portable": "portable-ram",
  "spikes-iron": "iron-spikes",
  "bullets-firearm": "firearm-bullets",
  "bullets-sling": "sling-bullets",
  "poison-basic": "basic-poison"
};

/** Make a name or identifier comparable with the tables above. */
export function normalizeKey(value) {
  let key = String(value ?? "").toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if ( key.startsWith("spell-scroll") ) key = "spell-scroll";
  return ALIASES[key] ?? key;
}

/** Map of item key → tools that craft it, built from TOOL_CRAFTS. */
const CRAFTED_BY = new Map();
for ( const [tool, keys] of Object.entries(TOOL_CRAFTS) ) {
  for ( const key of keys ) {
    if ( !CRAFTED_BY.has(key) ) CRAFTED_BY.set(key, []);
    CRAFTED_BY.get(key).push(tool);
  }
}

/**
 * Plain description of an item used for the tool rules. Works with full items and compendium index entries.
 * @param {Item|object} item
 */
export function describe(item) {
  const system = item.system ?? {};
  const properties = system.properties;
  const hasProp = p => (properties instanceof Set) ? properties.has(p) : Array.isArray(properties) && properties.includes(p);
  // dnd5e 6 keeps rarity in `system.rarities`. Full items have a `rarity` getter for its first entry, but compendium
  // index entries only have the raw `rarities` array (or `rarity` in data that hasn't been migrated).
  const rarity = system.rarity || (Array.from(system.rarities ?? [])[0] ?? "");
  return {
    name: item.name,
    itemType: item.type,
    key: normalizeKey(system.identifier || item.name),
    typeValue: system.type?.value ?? "",
    subtype: system.type?.subtype ?? "",
    baseItem: system.type?.baseItem ?? "",
    rarity,
    // An item is magic if it has the Magical property or any rarity. Many magic items have only one of the two.
    magic: hasProp("mgc") || !!rarity
  };
}

/** Base weapons that are ranged. Every other base weapon is melee. */
const RANGED_WEAPONS = new Set([
  "blowgun", "dart", "handcrossbow", "heavycrossbow", "lightcrossbow", "longbow", "musket", "pistol", "shortbow", "sling"
]);

/** Tool for each base armor, from the tools' "Craft" lines. Shields aren't listed, so Smith's Tools makes them. */
const ARMOR_TOOLS = {
  padded: "weaver",
  leather: "leatherworker",
  studded: "leatherworker",
  hide: "leatherworker",
  chainshirt: "smith",
  scalemail: "smith",
  breastplate: "smith",
  halfplate: "smith",
  ringmail: "smith",
  chainmail: "smith",
  splint: "smith",
  plate: "smith",
  shield: "smith"
};

/** Tools for a weapon from its base item or weapon type, or an empty array if neither is known. */
function weaponTools(d) {
  const base = d.baseItem;
  // Staffs are built on a quarterstaff, but the Dungeon Master's Guide makes them with Woodcarver's Tools.
  if ( (base === "quarterstaff") && /(^|-)staff(-|$)/.test(d.key) ) return ["woodcarver"];
  if ( ["club", "greatclub", "quarterstaff"].includes(base) ) return ["carpenter", "woodcarver"];
  if ( ["whip", "sling"].includes(base) ) return ["leatherworker"];
  if ( ["musket", "pistol"].includes(base) ) return ["tinker"];
  if ( base ) return [RANGED_WEAPONS.has(base) ? "woodcarver" : "smith"];
  if ( ["simpleR", "martialR"].includes(d.typeValue) ) return ["woodcarver"];
  if ( ["simpleM", "martialM"].includes(d.typeValue) ) return ["smith"];
  return [];
}

/** Tools for armor or a shield from its base item or armor type, or an empty array if neither is known. */
function armorTools(d) {
  if ( ARMOR_TOOLS[d.baseItem] ) return [ARMOR_TOOLS[d.baseItem]];
  switch ( d.typeValue ) {
    case "light": return ["leatherworker"];
    case "medium": case "heavy": case "shield": return ["smith"];
  }
  return [];
}

/** Tools for ammunition from its type, or an empty array if it isn't known. */
function ammoTools(d) {
  if ( ["arrow", "crossbowBolt", "blowgunNeedle"].includes(d.subtype) ) return ["woodcarver"];
  if ( ["firearmBullet", "slingBullet"].includes(d.subtype) ) return ["smith"];
  return [];
}

/** Is this equipment armor or a shield? Generic magic armor ("Armor of Resistance") has no armor type set. */
function isArmor(d) {
  return ["light", "medium", "heavy", "shield"].includes(d.typeValue) || (d.baseItem in ARMOR_TOOLS)
    || /(^|-)(armor|mail|plate)(-|$)/.test(d.key);
}

/**
 * Tools that can craft a nonmagical item, or an empty array if the rules don't list one.
 * @param {ReturnType<describe>} d
 * @returns {string[]}
 */
export function mundaneTools(d) {
  const listed = CRAFTED_BY.get(d.key);
  if ( listed ) return [...listed];
  if ( d.itemType === "weapon" ) return weaponTools(d);
  if ( (d.itemType === "equipment") && isArmor(d) ) return armorTools(d);
  if ( (d.itemType === "consumable") && (d.typeValue === "ammo") ) return ammoTools(d);
  return [];
}

/**
 * Tools that can craft a magic item, from the Magic Item Tools table in the 2024 Dungeon Master's Guide.
 * Weapons and armor that could be any kind (like "+1 Weapon") keep every tool the table allows for them.
 * @param {ReturnType<describe>} d
 * @returns {string[]}
 */
export function magicTools(d) {
  const listed = CRAFTED_BY.get(d.key);
  if ( listed ) return [...listed];

  // Weapon (including ammunition): the tool that makes that kind of weapon.
  if ( d.itemType === "weapon" ) {
    const tools = weaponTools(d);
    return tools.length ? tools : ["leatherworker", "smith", "woodcarver"];
  }
  if ( (d.itemType === "consumable") && (d.typeValue === "ammo") ) {
    const tools = ammoTools(d);
    return tools.length ? tools : ["leatherworker", "smith", "woodcarver"];
  }

  // Armor: the tool that makes that kind of armor.
  if ( (d.itemType === "equipment") && isArmor(d) ) {
    const tools = armorTools(d);
    return tools.length ? tools : ["leatherworker", "smith", "weaver"];
  }

  switch ( d.typeValue ) {
    case "potion": return ["alchemist", "herb"];
    case "scroll": return ["calligrapher"];
    case "ring": return ["jeweler"];
    case "rod": case "wand": return ["woodcarver"];
    case "poison": return ["pois"];
  }

  // Wondrous item: Tinker's Tools, or the tool that makes the nonmagical item it's based on.
  const based = CRAFTED_BY.get(normalizeKey(d.baseItem)) ?? [];
  return [...new Set(["tinker", ...based])];
}

/**
 * Work out which tools can craft an item.
 * @param {Item|object} item     Full item or compendium index entry.
 * @param {object} [options]
 * @param {boolean} [options.allowUnlisted]  Let any Artisan's Tools craft nonmagical items the rules don't list.
 * @returns {{ tools: string[], magic: boolean, rarity: string, needsArcana: boolean }}
 */
export function craftingTools(item, { allowUnlisted=false }={}) {
  const override = foundry.utils.getProperty(item, `flags.${MODULE_ID}.tools`);
  const d = describe(item);
  const isMagic = d.magic;
  const explicitlyListed = CRAFTED_BY.has(d.key);
  if ( Array.isArray(override) && override.length ) {
    return { tools: [...override], magic: isMagic, rarity: d.rarity, needsArcana: isMagic && !explicitlyListed };
  }
  let tools = isMagic ? magicTools(d) : mundaneTools(d);
  if ( !tools.length && allowUnlisted ) tools = [...ARTISAN_TOOLS];
  return { tools, magic: isMagic, rarity: d.rarity, needsArcana: isMagic && !explicitlyListed };
}

/** Item types that can be crafted. */
export const CRAFTABLE_TYPES = new Set(["weapon", "equipment", "consumable", "tool", "loot", "container"]);
