import { ARTISAN_TOOLS, CRAFTABLE_TYPES, FAST_CRAFTING, MODULE_ID, craftingTools, describe, normalizeKey } from "./rules.mjs";
import { coinValue, formatCoins, formatCost, gpToCp, planPayment, walletValue } from "./currency.mjs";

/* -------------------------------------------- */
/*  Settings helpers                            */
/* -------------------------------------------- */

const setting = key => game.settings.get(MODULE_ID, key);

/** Compendiums searched for craftable items, in priority order. */
export function catalogPacks() {
  const configured = String(setting("itemCompendiums") ?? "").split(",").map(s => s.trim()).filter(Boolean);
  let ids = configured;
  if ( !ids.length ) {
    ids = ["dnd-players-handbook.equipment", "dnd-dungeon-masters-guide.equipment"].filter(id => game.packs.has(id));
    if ( !game.packs.has("dnd-players-handbook.equipment") ) ids.push("dnd5e.equipment24");
  }
  return ids.map(id => game.packs.get(id)).filter(p => p?.documentName === "Item");
}

/* -------------------------------------------- */
/*  Proficiency                                 */
/* -------------------------------------------- */

/** Tool keys the actor is proficient with. */
export function proficientTools(actor) {
  const tools = actor.system.tools ?? {};
  return Object.entries(tools)
    .filter(([, t]) => ((t.prof?.multiplier ?? t.value ?? 0) >= 1))
    .map(([key]) => key);
}

/** Does the actor have proficiency in Arcana? */
export function hasArcana(actor) {
  const arc = actor.system.skills?.arc;
  return (arc?.prof?.multiplier ?? arc?.value ?? 0) >= 1;
}

/** Localized tool name. */
export function toolLabel(key) {
  try {
    const label = dnd5e.documents.Trait.keyLabel(key, { trait: "tool" });
    if ( label ) return label;
  } catch(err) { /* Fall through. */ }
  return key.titleCase();
}

/**
 * Check whether an actor can craft an item, and with which of its tools.
 * @param {Actor5e} actor
 * @param {Item|object} item
 * @returns {{ tools: string[], ok: boolean, reason?: string, magic: boolean }}
 */
export function canCraft(actor, item) {
  const rule = craftingTools(item, { allowUnlisted: setting("allowUnlisted") });
  if ( rule.needsArcana && !setting("allowMagicItems") ) {
    return { tools: [], ok: false, magic: rule.magic, reason: game.i18n.localize("DND5ECRAFT.Reason.MagicOff") };
  }
  // The crafting cost of a magic item comes from its rarity, so one without a rarity can't be priced.
  if ( rule.needsArcana && !rule.rarity ) {
    return { tools: [], ok: false, magic: rule.magic, reason: game.i18n.localize("DND5ECRAFT.Reason.NoRarity") };
  }
  const known = proficientTools(actor);
  const tools = rule.tools.filter(t => known.includes(t));
  if ( !rule.tools.length ) {
    return { tools, ok: false, magic: rule.magic, reason: game.i18n.localize("DND5ECRAFT.Reason.Unlisted") };
  }
  if ( !tools.length ) {
    const names = rule.tools.map(toolLabel);
    const list = new Intl.ListFormat(game.i18n.lang, { type: "disjunction" }).format(names);
    return { tools, ok: false, magic: rule.magic, reason: game.i18n.format("DND5ECRAFT.Reason.NoTool", { tools: list }) };
  }
  if ( rule.needsArcana && setting("requireArcana") && !hasArcana(actor) ) {
    return { tools, ok: false, magic: rule.magic, reason: game.i18n.localize("DND5ECRAFT.Reason.Arcana") };
  }
  return { tools, ok: true, magic: rule.magic };
}

/* -------------------------------------------- */
/*  Catalog                                     */
/* -------------------------------------------- */

let catalogCache = null;

/** Forget the cached catalog, e.g. after the compendium setting changes. */
export function resetCatalog() {
  catalogCache = null;
}

/**
 * Load craftable items from the configured compendiums.
 * @returns {Promise<object[]>}
 */
export async function loadCatalog() {
  if ( catalogCache ) return catalogCache;
  const fields = [
    "system.identifier", "system.type", "system.rarity", "system.rarities", "system.properties", "system.price", "system.quantity",
    `flags.${MODULE_ID}.tools`, "flags.dnd5e.spellLevel"
  ];
  const byKey = new Map();
  for ( const pack of catalogPacks() ) {
    let index;
    try {
      index = await pack.getIndex({ fields });
    } catch(err) {
      console.warn(`${MODULE_ID} | Couldn't index ${pack.collection}`, err);
      continue;
    }
    for ( const entry of index ) {
      if ( !CRAFTABLE_TYPES.has(entry.type) ) continue;
      const price = entry.system?.price;
      if ( !price?.value ) continue;
      const d = describe(entry);
      const key = `${d.key}|${d.magic ? d.rarity : ""}`;
      const quantity = entry.system?.quantity || 1;
      const existing = byKey.get(key);
      // Keep the first pack's entry, and the smallest stack of duplicates (packs hold kit contents too).
      if ( existing && ((existing.pack !== pack.collection) || (existing.quantity <= quantity)) ) continue;
      byKey.set(key, {
        uuid: entry.uuid,
        pack: pack.collection,
        name: entry.name,
        img: entry.img,
        type: entry.type,
        key: d.key,
        quantity,
        rarity: d.magic ? d.rarity : "",
        magic: d.magic,
        estimate: await estimateCost(entry),
        source: entry
      });
    }
  }
  catalogCache = Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  return catalogCache;
}

/**
 * Rough cost and time from index data, before the full item is loaded. For magic items it builds a temporary item
 * from the index and asks the system for its crafting cost, leaving out the base item (which isn't loaded yet).
 */
async function estimateCost(entry) {
  if ( isMundane(entry) ) return mundaneCost(entry.system.price);
  try {
    const temp = new Item.implementation({
      name: entry.name, type: entry.type, flags: entry.flags ?? {},
      system: { ...entry.system, properties: magicProperties(entry.system) }
    });
    const { days, gold } = await temp.system.getCraftCost({ baseItem: "none" });
    return { cp: gpToCp(gold), days: Math.max(1, days) };
  } catch(err) {
    return { cp: 0, days: 1 };
  }
}

/** Whether an item (full item or index entry) is nonmagical, so its cost and time follow its price. */
function isMundane(item) {
  return !describe(item).magic;
}

/**
 * Item data with the Magical property added. The system's `getCraftCost` prices an item without it as nonmagical,
 * even when it has a rarity.
 * @param {object} system  Item system data or source.
 * @returns {string[]}
 */
function magicProperties(system) {
  return [...new Set([...Array.from(system.properties ?? []), "mgc"])];
}

/**
 * Nonmagical cost, using the system's `CONFIG.DND5E.crafting.mundane` rates. Worked out in copper here because
 * the system's `getCraftCost` rounds the material cost down to whole gold (a 1 gp item would be free).
 * @param {{ value: number, denomination: string }} price
 * @param {number} [batches=1]
 * @returns {{ cp: number, days: number }}
 */
function mundaneCost(price, batches=1) {
  const { mundane } = CONFIG.DND5E.crafting;
  const priceCp = (price?.value || 0) * coinValue(price?.denomination || "gp") * batches;
  return {
    cp: Math.ceil(priceCp * mundane.gold),
    days: Math.max(1, Math.ceil((priceCp / coinValue("gp")) * mundane.days))
  };
}

/* -------------------------------------------- */
/*  Costs                                       */
/* -------------------------------------------- */

/**
 * Material cost and workdays to craft a number of batches of an item, using the dnd5e crafting rules.
 * A batch is one copy of the item as it appears in the compendium (e.g. Arrows come in 20s).
 * @param {Item5e} item
 * @param {number} batches
 * @returns {Promise<{ cp: number, days: number }>}
 */
export async function craftCost(item, batches=1) {
  // Nonmagical batches are priced together, so workdays follow the total price.
  if ( isMundane(item) ) return mundaneCost(item.system.price, batches);

  // Magic items come from the system rules (rarity, base item, consumables, scrolls, exceptions), one at a time.
  if ( !item.system.getCraftCost ) return { cp: 0, days: 1 };
  const priced = item.system.properties?.has?.("mgc")
    ? item
    : item.clone({ "system.properties": magicProperties(item.system) });
  const { days, gold } = await priced.system.getCraftCost();
  return { cp: gpToCp(gold) * batches, days: Math.max(1, days * batches) };
}

/* -------------------------------------------- */
/*  Projects                                    */
/* -------------------------------------------- */

/** The actor's crafting projects. */
export function getProjects(actor) {
  const projects = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "projects") ?? []);
  // Earlier versions stored the finish time in `finished`, which is 0 (falsy) at the start of a world.
  for ( const p of projects ) {
    if ( typeof p.finished === "number" ) {
      p.finishedAt = p.finished;
      p.finished = true;
    }
  }
  return projects;
}

/**
 * Start a crafting project. Pays for materials up front.
 * @param {Actor5e} actor
 * @param {Item5e} item     Item to craft.
 * @param {object} options
 * @param {string} options.tool     Tool used.
 * @param {number} [options.batches=1]
 * @returns {Promise<object|null>}  The new project, or null if it couldn't start.
 */
export async function startProject(actor, item, { tool, batches=1 }={}) {
  batches = Math.max(1, Math.floor(Number(batches) || 1));
  const check = canCraft(actor, item);
  if ( !check.ok ) {
    ui.notifications.warn(check.reason);
    return null;
  }
  if ( !check.tools.includes(tool) ) tool = check.tools[0];

  const { cp, days } = await craftCost(item, batches);
  const payment = planPayment(actor, cp);
  if ( !payment ) {
    ui.notifications.warn(game.i18n.format("DND5ECRAFT.CantAfford", {
      name: actor.name, cost: formatCost(cp), wealth: formatCost(walletValue(actor))
    }));
    return null;
  }

  const source = item.toObject();
  delete source._id;
  delete source.folder;
  delete source.sort;
  delete source.ownership;
  delete source._stats;
  if ( source.system ) source.system.equipped = false;

  const project = {
    id: foundry.utils.randomID(),
    uuid: item.uuid,
    name: item.name,
    img: item.img,
    tool,
    batches,
    quantity: (item.system.quantity || 1) * batches,
    cost: cp,
    days,
    progress: 0,
    started: game.time.worldTime,
    source
  };
  const projects = getProjects(actor);
  projects.push(project);
  await actor.update({
    "system.currency": payment.currency,
    [`flags.${MODULE_ID}.projects`]: projects
  });

  await postMessage(actor, game.i18n.format("DND5ECRAFT.Chat.Started", {
    actor: actor.name,
    item: itemLabel(project),
    tool: toolLabel(tool),
    days,
    cost: formatCost(cp)
  }), paymentDetail(payment));
  return project;
}

/** "Paid 3 gp, 5 cp. Change: 5 sp." */
function paymentDetail(payment) {
  const spent = formatCoins(payment.spent);
  if ( !spent ) return "";
  const change = formatCoins(payment.change);
  return change ? game.i18n.format("DND5ECRAFT.Chat.PaidChange", { spent, change })
    : game.i18n.format("DND5ECRAFT.Chat.Paid", { spent });
}

/**
 * Add workdays to a project. Finishes it when enough days are logged.
 * @param {Actor5e} actor
 * @param {string} id
 * @param {number} days
 */
export async function logWork(actor, id, days) {
  days = Math.max(0, Math.floor(Number(days) || 0));
  if ( !days ) return;
  await withProjectLock(id, async () => {
    const projects = getProjects(actor);
    const project = projects.find(p => p.id === id);
    if ( !project || project.finished ) return;

    // All workdays are already in (e.g. an earlier finish was interrupted): just finish it.
    if ( isComplete(project) ) return completeProject(actor, project, projects);

    const helpers = projectHelpers(project);
    const crew = 1 + helpers.length;
    project.progress = Math.min(project.days, project.progress + (days * crew));
    if ( isComplete(project) ) return completeProject(actor, project, projects);

    await actor.setFlag(MODULE_ID, "projects", projects);
    const names = listNames(helpers.map(h => h.name));
    await postMessage(actor, game.i18n.format(helpers.length ? "DND5ECRAFT.Chat.ProgressHelped" : "DND5ECRAFT.Chat.Progress", {
      actor: actor.name, item: itemLabel(project), days, helpers: names, progress: project.progress, total: project.days
    }));
  });
}

/**
 * Finish a project whose workdays are all logged but which wasn't marked finished.
 * @param {Actor5e} actor
 * @param {string} id
 */
export async function finishProject(actor, id) {
  await withProjectLock(id, async () => {
    const projects = getProjects(actor);
    const project = projects.find(p => p.id === id);
    if ( project && !project.finished && isComplete(project) ) await completeProject(actor, project, projects);
  });
}

/** Have all the project's workdays been logged? */
export function isComplete(project) {
  return !!project.finished || (project.progress >= project.days);
}

/** Projects being updated on this client, so a second click can't finish one twice. */
const busy = new Set();

async function withProjectLock(id, fn) {
  if ( busy.has(id) ) return;
  busy.add(id);
  try {
    return await fn();
  } finally {
    busy.delete(id);
  }
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/** Most helpers allowed on one project. */
export function maxHelpers() {
  return Math.max(0, Number(setting("maxHelpers")) || 0);
}

/**
 * Characters helping on a project who still exist and are still proficient with its tool.
 * @param {object} project
 * @returns {Actor5e[]}
 */
export function projectHelpers(project) {
  return (project.helpers ?? []).map(id => game.actors.get(id))
    .filter(a => a && proficientTools(a).includes(project.tool))
    .slice(0, maxHelpers());
}

/**
 * Characters who could help on a project: other characters proficient with its tool.
 * @param {Actor5e} actor
 * @param {object} project
 * @returns {Actor5e[]}
 */
export function helperCandidates(actor, project) {
  return game.actors.filter(a => (a.type === "character") && (a.id !== actor.id)
    && proficientTools(a).includes(project.tool))
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

/**
 * Set who is helping on a project. Each helper divides the time: a day of work with one helper counts as two workdays.
 * @param {Actor5e} actor
 * @param {string} id
 * @param {string[]} helperIds  Actor ids.
 */
export async function setHelpers(actor, id, helperIds) {
  const projects = getProjects(actor);
  const project = projects.find(p => p.id === id);
  if ( !project ) return;
  const allowed = new Set(helperCandidates(actor, project).map(a => a.id));
  const ids = [...new Set(helperIds)].filter(h => allowed.has(h));
  if ( ids.length > maxHelpers() ) {
    ui.notifications.warn(game.i18n.format("DND5ECRAFT.Helpers.TooMany", { max: maxHelpers() }));
    return;
  }
  project.helpers = ids;
  await actor.setFlag(MODULE_ID, "projects", projects);
}

/** "Ana, Bo and Cy" */
export function listNames(names) {
  return new Intl.ListFormat(game.i18n.lang, { type: "conjunction" }).format(names);
}

/** Create the finished item and mark the project finished. */
async function completeProject(actor, project, projects) {
  // Mark it finished first, so the Work button goes away and it can't be finished twice.
  project.progress = project.days;
  project.finished = true;
  project.finishedAt = game.time.worldTime;
  await actor.setFlag(MODULE_ID, "projects", projects);

  try {
    await createCraftedItem(actor, project);
  } catch(err) {
    project.finished = false;
    delete project.finishedAt;
    await actor.setFlag(MODULE_ID, "projects", projects);
    ui.notifications.error(game.i18n.format("DND5ECRAFT.FinishFailed", { item: itemLabel(project) }));
    throw err;
  }

  await postMessage(actor, game.i18n.format("DND5ECRAFT.Chat.Finished", {
    actor: actor.name, item: itemLabel(project), days: project.days
  }));
}

/** Put the crafted item into the actor's inventory. */
async function createCraftedItem(actor, project) {
  const data = foundry.utils.deepClone(project.source);
  foundry.utils.setProperty(data, "system.quantity", project.quantity);
  foundry.utils.setProperty(data, `flags.${MODULE_ID}.crafted`, { by: actor.id, time: game.time.worldTime });

  // Stack consumables and loot onto an identical item the actor already has.
  const stackable = ["consumable", "loot"].includes(data.type);
  const identifier = normalizeKey(data.system?.identifier || data.name);
  const existing = stackable ? actor.items.find(i => (i.type === data.type) && (i.name === data.name)
    && (normalizeKey(i.system.identifier || i.name) === identifier)) : null;

  if ( existing ) await existing.update({ "system.quantity": (existing.system.quantity || 0) + project.quantity });
  else await actor.createEmbeddedDocuments("Item", [data]);
}

/** Remove a project. If it isn't finished, the materials already bought are lost. */
export async function abandonProject(actor, id) {
  const projects = getProjects(actor);
  const project = projects.find(p => p.id === id);
  if ( !project ) return;
  await actor.setFlag(MODULE_ID, "projects", projects.filter(p => p.id !== id));
  if ( project.finished ) return;
  await postMessage(actor, game.i18n.format("DND5ECRAFT.Chat.Abandoned", {
    actor: actor.name, item: itemLabel(project)
  }));
}

/** Remove every finished project. */
export async function clearFinished(actor) {
  const projects = getProjects(actor);
  await actor.setFlag(MODULE_ID, "projects", projects.filter(p => !p.finished));
}

/** "Arrows ×20" style label. */
export function itemLabel(project) {
  return project.quantity > 1 ? `${project.name} ×${project.quantity}` : project.name;
}

/* -------------------------------------------- */
/*  Fast Crafting                               */
/* -------------------------------------------- */

/** Does the actor meet the requirement for Fast Crafting? */
export function hasFastCrafting(actor) {
  if ( !setting("fastCrafting") ) return false;
  if ( !setting("fastCraftingRequiresFeat") ) return true;
  return actor.items.some(i => (i.type === "feat") && (normalizeKey(i.system.identifier || i.name) === "crafter"));
}

/** Has the actor used Fast Crafting since their last long rest? */
export function fastCraftingUsed(actor) {
  return !!actor.getFlag(MODULE_ID, "fastCraftUsed");
}

/**
 * Fast Crafting choices for an actor, grouped by tool.
 * @returns {Promise<{ tool: string, label: string, items: { key: string, name: string, img: string, uuid?: string }[] }[]>}
 */
export async function fastCraftingOptions(actor) {
  const catalog = await loadCatalog();
  const known = proficientTools(actor);
  return Object.entries(FAST_CRAFTING).filter(([tool]) => known.includes(tool)).map(([tool, keys]) => ({
    tool,
    label: toolLabel(tool),
    items: keys.map(key => {
      const entry = catalog.find(e => (e.key === key) && !e.magic);
      return {
        key,
        name: entry?.name ?? key.replace(/-/g, " ").titleCase(),
        img: entry?.img ?? "icons/svg/item-bag.svg",
        uuid: entry?.uuid
      };
    })
  }));
}

/**
 * Craft an item with Fast Crafting. It lasts until the actor's next long rest.
 * @param {Actor5e} actor
 * @param {string} tool
 * @param {string} key   Item key from the Fast Crafting table.
 */
export async function fastCraft(actor, tool, key) {
  if ( !hasFastCrafting(actor) ) return;
  if ( fastCraftingUsed(actor) ) {
    ui.notifications.warn(game.i18n.localize("DND5ECRAFT.Fast.Used"));
    return;
  }
  if ( !FAST_CRAFTING[tool]?.includes(key) || !proficientTools(actor).includes(tool) ) {
    ui.notifications.warn(game.i18n.format("DND5ECRAFT.Reason.NoTool", { tools: toolLabel(tool) }));
    return;
  }
  const option = (await fastCraftingOptions(actor)).find(o => o.tool === tool)?.items.find(i => i.key === key);
  let data;
  const item = option?.uuid ? await fromUuid(option.uuid) : null;
  if ( item ) {
    data = item.toObject();
    delete data._id;
    delete data.folder;
    delete data.ownership;
    delete data._stats;
    // One piece of gear, even if the compendium entry is a bundle.
    if ( data.system?.quantity > 1 && (data.system?.type?.value !== "ammo") ) data.system.quantity = 1;
  } else {
    data = { name: option?.name ?? key.titleCase(), type: "loot", img: "icons/svg/item-bag.svg" };
  }
  foundry.utils.setProperty(data, `flags.${MODULE_ID}.fastCrafted`, true);
  await actor.createEmbeddedDocuments("Item", [data]);
  await actor.setFlag(MODULE_ID, "fastCraftUsed", true);
  await postMessage(actor, game.i18n.format("DND5ECRAFT.Chat.FastCrafted", {
    actor: actor.name, item: data.name, tool: toolLabel(tool)
  }));
}

/**
 * After a long rest, remove items made with Fast Crafting and allow it again.
 * @param {Actor5e} actor
 * @param {object} result
 * @param {object} config
 */
export async function onRestCompleted(actor, result, config) {
  const isLong = result?.longRest ?? (config?.type === "long");
  if ( !isLong || !actor?.isOwner || (actor.type !== "character") ) return;
  const expired = actor.items.filter(i => i.getFlag(MODULE_ID, "fastCrafted")).map(i => i.id);
  if ( expired.length ) await actor.deleteEmbeddedDocuments("Item", expired);
  if ( fastCraftingUsed(actor) ) await actor.unsetFlag(MODULE_ID, "fastCraftUsed");
}

/* -------------------------------------------- */
/*  Chat                                        */
/* -------------------------------------------- */

async function postMessage(actor, text, detail="") {
  if ( !setting("postToChat") ) return;
  const content = `<div class="${MODULE_ID}-card"><p><i class="fa-solid fa-hammer" inert></i> ${text}</p>`
    + (detail ? `<p class="detail">${detail}</p>` : "") + "</div>";
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }), content });
}

export { ARTISAN_TOOLS };
