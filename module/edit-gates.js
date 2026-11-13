/**
 * Who may change a character's abilities, level, XP and the Game Master's notes.
 *
 *   GM                    always.
 *   Player, abilities     only with Char Gen Mode on (and the GM allowing
 *                         players into Char Gen Mode at all).
 *   Player, level and XP  as abilities, AND the GM's "Players may change level
 *                         & XP" switch on.
 *   Player, GM notes      never.
 *
 * The sheet disables the inputs; KnaveryActor._preUpdate drops the same
 * changes from any other path in the player's browser. The Level Up window
 * (`knLevelUp`) and character generation (`knCreation`) write through.
 * NPC sheets are not gated.
 */
import { SETTINGS_NS } from "./config.js";

const charGenOn = (actor, changed = {}) =>
  (foundry.utils.getProperty(changed, "system.generationEnabled") ?? actor.system.generationEnabled) === true;

/** May this user use Char Gen Mode on this actor at all (the GM's switch)? */
export const mayUseCharGen = (actor, user = game.user) =>
  user.isGM || (actor.type === "character" && game.settings.get(SETTINGS_NS, "allow-player-randomization"));

export const mayEditAbilities = (actor, user = game.user, changed = {}) =>
  user.isGM || actor.type !== "character" || (mayUseCharGen(actor, user) && charGenOn(actor, changed));

export const mayEditLevelXp = (actor, user = game.user, changed = {}) =>
  user.isGM || actor.type !== "character"
  || (mayEditAbilities(actor, user, changed) && game.settings.get(SETTINGS_NS, "allow-player-level-xp"));

/** Remove `path` from an update, whether it arrived flat or expanded. */
const drop = (changed, path) => {
  let hit = false;
  if (path in changed) { delete changed[path]; hit = true; }
  const parts = path.split(".");
  const last = parts.pop();
  const parent = foundry.utils.getProperty(changed, parts.join("."));
  if (parent && typeof parent === "object" && last in parent) { delete parent[last]; hit = true; }
  return hit;
};

/**
 * Strip what `user` may not change from an actor update. Returns true if
 * anything was removed.
 */
export const stripLockedChanges = (actor, changed, options, user) => {
  if (user.isGM || actor.type !== "character" || options.knLevelUp || options.knCreation) return false;
  let hit = drop(changed, "system.gmNotes");
  if (!mayEditAbilities(actor, user, changed)) {
    for (const k of Object.keys(actor.system.abilities ?? {})) hit = drop(changed, `system.abilities.${k}.value`) || hit;
  }
  if (!mayEditLevelXp(actor, user, changed)) {
    hit = drop(changed, "system.level") || hit;
    hit = drop(changed, "system.xp") || hit;
  }
  return hit;
};
