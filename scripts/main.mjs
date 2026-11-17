import { MODULE_ID } from "./rules.mjs";
import * as crafting from "./crafting.mjs";
import { CraftingApp } from "./crafting-app.mjs";

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

Hooks.once("init", () => {
  const world = (key, type, defaultValue, extra={}) => game.settings.register(MODULE_ID, key, {
    name: `DND5ECRAFT.Setting.${key}.Name`,
    hint: `DND5ECRAFT.Setting.${key}.Hint`,
    scope: "world",
    config: true,
    type,
    default: defaultValue,
    ...extra
  });

  world("allowMagicItems", Boolean, false, { onChange: rerender });
  world("requireArcana", Boolean, true, { onChange: rerender });
  world("allowUnlisted", Boolean, false);
  world("maxHelpers", Number, 1, { range: { min: 0, max: 10, step: 1 }, onChange: rerender });
  world("fastCrafting", Boolean, true, { onChange: rerender });
  world("fastCraftingRequiresFeat", Boolean, false, { onChange: rerender });
  world("postToChat", Boolean, true);
  world("itemCompendiums", String, "", {
    onChange: () => {
      crafting.resetCatalog();
      rerender();
    }
  });

  foundry.applications.handlebars.loadTemplates([`modules/${MODULE_ID}/templates/crafting.hbs`]);
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {
    open: actor => CraftingApp.open(actor),
    startProject: crafting.startProject,
    logWork: crafting.logWork,
    abandonProject: crafting.abandonProject,
    getProjects: crafting.getProjects,
    fastCraft: crafting.fastCraft,
    canCraft: crafting.canCraft,
    craftCost: crafting.craftCost,
    resetCatalog: crafting.resetCatalog
  };
});

/** Re-render open crafting windows. */
function rerender() {
  for ( const app of foundry.applications.instances.values() ) {
    if ( app instanceof CraftingApp ) app.render();
  }
}

/* -------------------------------------------- */
/*  Hammer button on the inventory tab          */
/* -------------------------------------------- */

Hooks.on("renderCharacterActorSheet", (app, element) => {
  const actor = app.actor ?? app.document;
  if ( !actor?.isOwner ) return;
  const root = element instanceof HTMLElement ? element : element?.[0];
  const currency = root?.querySelector('.tab[data-tab="inventory"] section.currency');
  if ( !currency || currency.querySelector(`.${MODULE_ID}-button`) ) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = `${MODULE_ID}-button item-action unbutton always-interactive`;
  button.setAttribute("aria-label", game.i18n.localize("DND5ECRAFT.Button"));
  button.innerHTML = '<i class="fa-solid fa-hammer" inert></i>';
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    CraftingApp.open(actor);
  });

  const coins = currency.querySelector('[data-action="currency"]');
  if ( coins ) coins.after(button);
  else currency.prepend(button);
});

/* -------------------------------------------- */
/*  Long rest                                   */
/* -------------------------------------------- */

Hooks.on("dnd5e.restCompleted", (actor, result, config) => {
  crafting.onRestCompleted(actor, result, config).catch(err => console.error(`${MODULE_ID} |`, err));
});
