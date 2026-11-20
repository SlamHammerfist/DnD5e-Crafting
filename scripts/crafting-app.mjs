import { MODULE_ID } from "./rules.mjs";
import {
  abandonProject, canCraft, clearFinished, finishProject, isComplete, craftCost, fastCraft, fastCraftingOptions, fastCraftingUsed, getProjects,
  hasFastCrafting, helperCandidates, itemLabel, listNames, loadCatalog, logWork, maxHelpers, proficientTools,
  projectHelpers, setHelpers, startProject, toolLabel
} from "./crafting.mjs";
import { formatCost, walletValue } from "./currency.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * Crafting window for one actor: running projects, starting a new one, and Fast Crafting.
 * Built on the dnd5e system's application class so it gets the system's window frame and styles.
 */
export class CraftingApp extends dnd5e.applications.api.Application5e {
  constructor(actor, options={}) {
    super({ ...options, id: `${MODULE_ID}-${actor.uuid.replaceAll(".", "-")}` });
    this.actor = actor;
  }

  /** Open (or bring forward) the crafting window for an actor. */
  static open(actor) {
    const id = `${MODULE_ID}-${actor.uuid.replaceAll(".", "-")}`;
    const existing = foundry.applications.instances.get(id);
    if ( existing ) {
      existing.render({ force: true });
      existing.bringToFront?.();
      return existing;
    }
    return new this(actor).render({ force: true });
  }

  static DEFAULT_OPTIONS = {
    classes: [MODULE_ID],
    tag: "section",
    window: {
      icon: "fa-solid fa-hammer",
      resizable: true
    },
    position: { width: 600, height: 700 },
    actions: {
      switchTab: CraftingApp.#onTab,
      start: CraftingApp.#onStart,
      logWork: CraftingApp.#onLogWork,
      abandon: CraftingApp.#onAbandon,
      clearFinished: CraftingApp.#onClearFinished,
      finish: CraftingApp.#onFinish,
      helpers: CraftingApp.#onHelpers,
      fastCraft: CraftingApp.#onFastCraft,
      toggleAll: CraftingApp.#onToggleAll
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/crafting.hbs`,
      scrollable: [".craft-scroll"]
    }
  };

  /** Current tab. */
  tab = "projects";

  /** Search text on the New Project tab. */
  search = "";

  /** Show items the actor can't craft, with the reason. */
  showAll = false;

  /** The dnd5e window header shows the title large and the subtitle beneath it. */
  get subtitle() {
    return this.actor.name;
  }

  get title() {
    return game.i18n.localize("DND5ECRAFT.WindowTitle");
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const actor = this.actor;
    const helpersAllowed = maxHelpers() > 0;
    const projects = getProjects(actor).map(p => {
      const helpers = projectHelpers(p);
      const crew = 1 + helpers.length;
      return {
        ...p,
        label: itemLabel(p),
        toolLabel: toolLabel(p.tool),
        pct: Math.round((p.progress / Math.max(1, p.days)) * 100),
        costLabel: formatCost(p.cost),
        helperNames: (helpers.length && !p.finished) ? listNames(helpers.map(h => h.name)) : "",
        daysLeft: helpers.length ? game.i18n.format("DND5ECRAFT.Helpers.DaysLeft", {
          days: Math.ceil((p.days - p.progress) / crew)
        }) : "",
        canHelp: helpersAllowed && !isComplete(p),
        complete: isComplete(p),
        needsFinish: isComplete(p) && !p.finished
      };
    }).sort((a, b) => Boolean(a.finished) - Boolean(b.finished));

    const tools = proficientTools(actor);
    const catalog = this.tab === "new" ? await loadCatalog() : [];
    const entries = [];
    for ( const entry of catalog ) {
      const check = canCraft(actor, entry.source);
      if ( !check.ok && !this.showAll ) continue;
      const rarity = entry.magic ? CONFIG.DND5E.itemRarity[entry.rarity] : "";
      entries.push({
        uuid: entry.uuid,
        name: entry.quantity > 1 ? `${entry.name} ×${entry.quantity}` : entry.name,
        img: entry.img,
        rarity,
        ok: check.ok,
        reason: check.reason,
        tools: check.tools.map(toolLabel),
        cost: formatCost(entry.estimate.cp),
        days: entry.estimate.days,
        search: `${entry.name} ${rarity}`.toLowerCase()
      });
    }

    // Coins the actor holds, largest first, with the system's coin icons.
    const coins = Object.entries(CONFIG.DND5E.currencies)
      .sort(([, a], [, b]) => (a.conversion ?? 0) - (b.conversion ?? 0))
      .map(([key, config]) => ({
        key,
        icon: config.icon,
        label: config.label,
        count: Number(actor.system.currency?.[key]) || 0
      }))
      .filter(c => c.count > 0)
      .map(c => ({ ...c, count: c.count.toLocaleString(game.i18n.lang) }));

    const fastEnabled = hasFastCrafting(actor);
    const fastUsed = fastCraftingUsed(actor);
    return {
      ...(await super._prepareContext(options)),
      coins,
      toolNames: tools.map(toolLabel),
      activeProjects: projects.filter(p => !p.finished),
      finishedProjects: projects.filter(p => p.finished),
      tab: this.tab,
      tabs: [
        { id: "projects", label: "DND5ECRAFT.Tab.Projects", icon: "fa-solid fa-list-check", count: projects.filter(p => !p.finished).length },
        { id: "new", label: "DND5ECRAFT.Tab.New", icon: "fa-solid fa-plus" },
        { id: "fast", label: "DND5ECRAFT.Tab.Fast", icon: "fa-solid fa-bolt", hidden: !game.settings.get(MODULE_ID, "fastCrafting") }
      ].filter(t => !t.hidden).map(t => ({ ...t, active: t.id === this.tab })),
      wealth: formatCost(walletValue(actor)),
      toolList: tools.map(toolLabel).join(", "),
      hasTools: tools.length > 0,
      projects,
      hasFinished: projects.some(p => p.finished),
      entries,
      search: this.search,
      showAll: this.showAll,
      fast: {
        enabled: fastEnabled,
        used: fastUsed,
        options: (fastEnabled && !fastUsed && (this.tab === "fast")) ? await fastCraftingOptions(actor) : [],
        held: actor.items.filter(i => i.getFlag(MODULE_ID, "fastCrafted")).map(i => ({ name: i.name, img: i.img, uuid: i.uuid }))
      }
    };
  }

  /* -------------------------------------------- */

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.actor.apps[this.id] = this;
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    delete this.actor.apps[this.id];
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#attachTooltips();
    const search = this.element.querySelector("input[name=search]");
    if ( search ) {
      search.addEventListener("input", event => {
        this.search = event.target.value;
        this.#filter();
      });
      this.#filter();
    }
  }

  /** Show the dnd5e item card when hovering an item, like on the character sheet. */
  #attachTooltips() {
    const loading = uuid => dnd5e.utils?.loadingTooltip?.({ uuid })
      ?? `<section class="loading" data-uuid="${uuid}"><i class="fas fa-spinner fa-spin-pulse" inert></i></section>`;
    for ( const el of this.element.querySelectorAll("[data-item-uuid]") ) {
      const uuid = el.dataset.itemUuid;
      if ( !uuid ) continue;
      Object.assign(el.dataset, {
        tooltipHtml: loading(uuid),
        tooltipClass: "dnd5e2 dnd5e-tooltip item-tooltip document-tooltip",
        tooltipDirection: "LEFT"
      });
    }
  }

  /** Hide catalog rows that don't match the search text. */
  #filter() {
    const terms = this.search.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for ( const row of this.element.querySelectorAll(".craft-catalog [data-search]") ) {
      const match = terms.every(t => row.dataset.search.includes(t));
      row.hidden = !match;
      if ( match ) shown++;
    }
    const empty = this.element.querySelector(".craft-catalog-empty");
    if ( empty ) empty.hidden = shown > 0;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onTab(event, target) {
    this.tab = target.dataset.tab;
    this.render();
  }

  static #onToggleAll() {
    this.showAll = !this.showAll;
    this.render();
  }

  static async #onStart(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    const item = uuid ? await fromUuid(uuid) : null;
    if ( item ) await this.#confirmStart(item);
  }

  static async #onLogWork(event, target) {
    const id = target.closest("[data-project-id]")?.dataset.projectId;
    const project = getProjects(this.actor).find(p => p.id === id);
    if ( !project ) return;
    const remaining = project.days - project.progress;
    const helpers = projectHelpers(project);
    const crew = 1 + helpers.length;
    const daysLeft = Math.ceil(remaining / crew);
    const hint = helpers.length
      ? game.i18n.format("DND5ECRAFT.LogWork.HintHelped", { helpers: listNames(helpers.map(h => h.name)), crew, remaining, days: daysLeft })
      : game.i18n.format("DND5ECRAFT.LogWork.Hint", { remaining });
    const days = await DialogV2.prompt({
      classes: ["dnd5e2"],
      window: { title: game.i18n.format("DND5ECRAFT.LogWork.Title", { item: itemLabel(project) }), icon: "fa-solid fa-hammer" },
      content: `<div class="form-group">
          <label>${game.i18n.localize("DND5ECRAFT.LogWork.Days")}</label>
          <div class="form-fields"><input type="number" name="days" value="1" min="1" max="${daysLeft}" step="1" autofocus></div>
          <p class="hint">${hint}</p>
        </div>`,
      ok: {
        label: "DND5ECRAFT.LogWork.Button",
        icon: "fa-solid fa-hammer",
        callback: (event, button) => button.form.elements.days.valueAsNumber
      },
      rejectClose: false
    });
    if ( days > 0 ) await logWork(this.actor, id, days);
  }

  static async #onHelpers(event, target) {
    const id = target.closest("[data-project-id]")?.dataset.projectId;
    const project = getProjects(this.actor).find(p => p.id === id);
    if ( !project ) return;
    const max = maxHelpers();
    const candidates = helperCandidates(this.actor, project);
    if ( !candidates.length ) {
      ui.notifications.info(game.i18n.format("DND5ECRAFT.Helpers.None", { tool: toolLabel(project.tool) }));
      return;
    }
    const current = new Set(project.helpers ?? []);
    const rows = candidates.map(a => `
      <label class="helper-row">
        <input type="checkbox" name="helper" value="${a.id}" ${current.has(a.id) ? "checked" : ""}>
        <img src="${a.img}" alt=""> ${foundry.utils.escapeHTML(a.name)}
      </label>`).join("");
    const ids = await DialogV2.prompt({
      classes: ["dnd5e2"],
      window: { title: game.i18n.format("DND5ECRAFT.Helpers.Title", { item: itemLabel(project) }), icon: "fa-solid fa-people-carry-box" },
      position: { width: 360 },
      content: `<div class="${MODULE_ID}-helpers">
          <p class="hint">${game.i18n.format("DND5ECRAFT.Helpers.Hint", { tool: toolLabel(project.tool), max })}</p>
          ${rows}
        </div>`,
      ok: {
        label: "DND5ECRAFT.Helpers.Save",
        icon: "fa-solid fa-check",
        callback: (event, button) => [...button.form.querySelectorAll("input[name=helper]:checked")].map(i => i.value)
      },
      render: (event, dialog) => {
        // Stop ticking more boxes than the limit allows.
        const root = dialog.element ?? dialog;
        const boxes = [...root.querySelectorAll("input[name=helper]")];
        const update = () => {
          const full = boxes.filter(b => b.checked).length >= max;
          for ( const b of boxes ) b.disabled = full && !b.checked;
        };
        boxes.forEach(b => b.addEventListener("change", update));
        update();
      },
      rejectClose: false
    });
    if ( ids ) await setHelpers(this.actor, id, ids);
  }

  static async #onAbandon(event, target) {
    const id = target.closest("[data-project-id]")?.dataset.projectId;
    const project = getProjects(this.actor).find(p => p.id === id);
    if ( !project ) return;
    if ( project.finished ) return abandonProject(this.actor, id);
    const ok = await DialogV2.confirm({
      classes: ["dnd5e2"],
      window: { title: "DND5ECRAFT.Abandon.Title", icon: "fa-solid fa-trash" },
      content: `<p>${game.i18n.format("DND5ECRAFT.Abandon.Content", { item: itemLabel(project), cost: formatCost(project.cost) })}</p>`,
      rejectClose: false
    });
    if ( ok ) await abandonProject(this.actor, id);
  }

  static async #onFinish(event, target) {
    const id = target.closest("[data-project-id]")?.dataset.projectId;
    if ( id ) await finishProject(this.actor, id);
  }

  static async #onClearFinished() {
    await clearFinished(this.actor);
  }

  static async #onFastCraft(event, target) {
    const { tool, key } = target.dataset;
    const name = target.closest("[data-name]")?.dataset.name ?? key;
    const ok = await DialogV2.confirm({
      classes: ["dnd5e2"],
      window: { title: "DND5ECRAFT.Fast.Title", icon: "fa-solid fa-bolt" },
      content: `<p>${game.i18n.format("DND5ECRAFT.Fast.Confirm", { item: name, tool: toolLabel(tool) })}</p>`,
      rejectClose: false
    });
    if ( ok ) await fastCraft(this.actor, tool, key);
  }

  /* -------------------------------------------- */

  /**
   * Ask how many to craft and with which tool, then start the project.
   * @param {Item5e} item
   */
  async #confirmStart(item) {
    const actor = this.actor;
    const check = canCraft(actor, item);
    if ( !check.ok ) {
      ui.notifications.warn(check.reason);
      return;
    }
    const wealth = walletValue(actor);
    const perBatch = item.system.quantity || 1;
    const toolOptions = check.tools.map(t => `<option value="${t}">${toolLabel(t)}</option>`).join("");
    const first = await craftCost(item, 1);
    const summary = (cost) => game.i18n.format("DND5ECRAFT.Start.Summary", {
      cost: formatCost(cost.cp), days: cost.days, wealth: formatCost(wealth)
    });

    const result = await DialogV2.prompt({
      classes: ["dnd5e2"],
      window: { title: game.i18n.format("DND5ECRAFT.Start.Title", { item: item.name }), icon: "fa-solid fa-hammer" },
      position: { width: 420 },
      content: `
        <div class="${MODULE_ID}-start">
          <div class="form-group">
            <label>${game.i18n.localize("DND5ECRAFT.Start.Tool")}</label>
            <div class="form-fields"><select name="tool">${toolOptions}</select></div>
          </div>
          <div class="form-group">
            <label>${game.i18n.localize(perBatch > 1 ? "DND5ECRAFT.Start.Batches" : "DND5ECRAFT.Start.Quantity")}</label>
            <div class="form-fields"><input type="number" name="batches" value="1" min="1" step="1"></div>
            ${perBatch > 1 ? `<p class="hint">${game.i18n.format("DND5ECRAFT.Start.BatchHint", { count: perBatch })}</p>` : ""}
          </div>
          <p class="summary" data-summary>${summary(first)}</p>
        </div>`,
      ok: {
        label: "DND5ECRAFT.Start.Button",
        icon: "fa-solid fa-hammer",
        callback: (event, button) => ({
          tool: button.form.elements.tool.value,
          batches: button.form.elements.batches.valueAsNumber || 1
        })
      },
      render: (event, dialog) => {
        const root = dialog.element ?? dialog;
        const input = root.querySelector("input[name=batches]");
        const out = root.querySelector("[data-summary]");
        input?.addEventListener("input", async () => {
          const n = Math.max(1, Math.floor(input.valueAsNumber || 1));
          const cost = await craftCost(item, n);
          out.textContent = summary(cost);
          out.classList.toggle("short", cost.cp > wealth);
        });
        out?.classList.toggle("short", first.cp > wealth);
      },
      rejectClose: false
    });
    if ( !result ) return;
    const project = await startProject(actor, item, result);
    if ( project ) {
      this.tab = "projects";
      this.render();
    }
  }
}
