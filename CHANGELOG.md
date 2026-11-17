# Changelog

## 1.0.2 (2026-11-17)
### Changed
- The buttons beside the coins on the inventory tab are now in alphabetical order by name (Crafting, Manage Currency, and any other modules' buttons), whichever module adds its button last.

## 1.0.1 (2026-11-17)
### Changed
- The hammer button on the inventory tab no longer shows a tooltip.

## 1.0.0 (2026-11-13)
### Added
- Rebuilt for Foundry VTT v14 and dnd5e 6.
- Hammer button next to the coins on the character inventory tab opens the crafting window.
- Crafting projects with the 2024 rules: material cost and workdays from the dnd5e crafting configuration, tracked on the character until finished.
- Materials are paid from whatever coins the character has, with change given back.
- Tool proficiency required, using each tool's craft list from the 2024 Player's Handbook. Magic items need Arcana too.
- Ammunition and other bundles are crafted in batches. Finished consumables stack onto matching items.
- Finished projects stay on the Projects tab until cleared.
- Helpers: other characters proficient with the tool can help on a project and divide the crafting time.
- Fast Crafting: one free piece of gear per long rest from the Crafter feat's table. It falls apart after the next long rest.
- Settings: Allow Magic Items, Magic Items Need Arcana, Helpers per Project, Allow Unlisted Items, Fast Crafting, Fast Crafting Needs Crafter Feat, Post to Chat, Item Compendiums.
- Macro API on `game.modules.get("dnd5e-crafting").api`.
