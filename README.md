# D&D 5e Crafting

Downtime crafting with the 2024 D&D rules for Foundry VTT v14 and the dnd5e system (6.0 or later).

Click the **hammer** button next to the coins on a character's inventory tab to open the crafting window.

## Crafting projects

1. On the **New Project** tab, pick an item from the list. Only items from the crafting compendiums can be crafted.
   The list shows only items your tool proficiencies can make. Tick **Show items I can't craft** to see the rest and why.
2. Choose the tool and how many to make. The dialog shows the material cost, the workdays and your coins.
3. **Buy Materials and Start** pays for the materials and adds the project to the **Projects** tab.
4. Click **Work** to log workdays. When the days add up, the item goes into your inventory. The project stays on the list marked **Finished** until you clear it with its × button or **Clear Finished Projects**.

Costs and times come from the dnd5e system's crafting rules (`CONFIG.DND5E.crafting`).
Magic items use the system's own `getCraftCost()`. Nonmagical items use the same rates worked out to the copper,
since the system rounds their cost down to whole gold:

| Item | Materials | Time |
| --- | --- | --- |
| Nonmagical | Half the item's price | 1 workday per 10 gp of price (at least 1) |
| Magic | Cost by rarity, plus the base item's crafting cost | Workdays by rarity |
| Magic consumable | Half the rarity cost | Half the rarity time |
| Spell scroll | Cost by spell level | Workdays by spell level |

Ammunition and other bundles are crafted in batches. One batch of Arrows makes 20.
Finished consumables and loot stack onto a matching item you already have.

### Helpers

Click the **Helpers** button on a project to pick other characters who help. Each helper must be proficient with the project's tool.
Helpers divide the crafting time: with one helper, each day you log counts as two workdays.
The rules allow one helper; the **Helpers per Project** setting changes that.

Abandoning a project loses the materials.

### Paying with your coins

Materials are paid from whatever coins the character has, using the dnd5e system's currency manager:
coins of the cost's own denomination first, then smaller coins, then larger ones.
If a larger coin has to be broken, the change comes back in gold, silver and copper.
The chat message lists the coins paid and the change.

### Which tools craft what

Each tool crafts the items on its "Craft" line in the 2024 Player's Handbook.
Weapons and armor follow the categories there:

| Tool | Weapons and armor |
| --- | --- |
| Smith's Tools | Melee weapons (except Club, Greatclub, Quarterstaff and Whip), medium armor (except Hide), heavy armor, Shield (no tool lists it, so Smith's Tools makes it) |
| Leatherworker's Tools | Sling, Whip, Hide, Leather and Studded Leather Armor |
| Woodcarver's Tools | Club, Greatclub, Quarterstaff, ranged weapons (except Musket, Pistol and Sling) |
| Carpenter's Tools | Club, Greatclub, Quarterstaff |
| Tinker's Tools | Musket, Pistol |
| Weaver's Tools | Padded Armor |

When **Allow Magic Items** is on, magic items use the tools in the 2024 Dungeon Master's Guide:
Alchemist's Supplies or Herbalism Kit for potions, Calligrapher's Supplies for scrolls, Jeweler's Tools for rings, Woodcarver's Tools for rods, staffs and wands, and the base item's tools for weapons, armor and ammunition.
Wondrous items use Tinker's Tools, or the tool that makes the nonmagical item they're based on.
Magic weapons and armor that could be any kind (like +1 Weapon or Armor of Resistance) can use any tool the table allows for them.
Magic items need proficiency in Arcana too, unless the tool names the item (Potion of Healing, Spell Scroll).

To set the tools for an item yourself, give it a `flags.dnd5e-crafting.tools` array of tool keys, for example `["smith", "jeweler"]`.

## Fast Crafting

The **Fast Crafting** tab lets a character craft one piece of gear for free, once per long rest, using the Crafter feat's table:

| Tool | Items |
| --- | --- |
| Carpenter's Tools | Ladder, Torch |
| Leatherworker's Tools | Crossbow Bolt Case, Map or Scroll Case, Pouch |
| Mason's Tools | Block and Tackle |
| Potter's Tools | Jug, Lamp |
| Smith's Tools | Ball Bearings, Bucket, Caltrops, Grappling Hook, Iron Pot |
| Tinker's Tools | Bell, Shovel, Tinderbox |
| Weaver's Tools | Basket, Rope, Net, Tent |
| Woodcarver's Tools | Club, Greatclub, Quarterstaff |

The item is removed when the character finishes their next long rest, and Fast Crafting is ready again.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Allow Magic Items | Off | Characters can craft magic items. Potion of Healing and Spell Scrolls can always be crafted, since the Player's Handbook lists them under a tool. |
| Magic Items Need Arcana | On | Magic items need Arcana proficiency as well as the tool. |
| Helpers per Project | 1 | How many other characters can help on one project. 0 turns helpers off. |
| Allow Unlisted Items | Off | Items the tool rules don't name can be crafted with any Artisan's Tools. |
| Fast Crafting | On | Shows the Fast Crafting tab. |
| Fast Crafting Needs Crafter Feat | Off | Only characters with the Crafter feat can use Fast Crafting. |
| Post to Chat | On | Posts a message when a project starts, makes progress, finishes or is abandoned. |
| Item Compendiums | Blank | Compendium ids to list items from, separated by commas. Blank uses the Player's Handbook and Dungeon Master's Guide equipment, or `dnd5e.equipment24` if the Player's Handbook isn't installed. |

## Notes

- Projects are saved on the character, so they survive reloads and can be continued by any owner.
- The rules for scribing spell scrolls (having the spell prepared) aren't checked.
- Time isn't advanced automatically. Log workdays as your downtime passes.

## Macro API

```js
const api = game.modules.get("dnd5e-crafting").api;
api.open(actor);                                  // Open the crafting window
await api.startProject(actor, item, { tool: "smith", batches: 1 });
await api.logWork(actor, projectId, 3);           // Log 3 workdays
api.getProjects(actor);                           // List projects
await api.fastCraft(actor, "weaver", "rope");
```

## Requirements

- Foundry VTT v14
- D&D 5e system 6.0 or later
