/**
 * Currency helpers. All amounts are handled in copper pieces to avoid rounding errors.
 */

/** Value of one coin of a denomination, in copper. */
export function coinValue(denomination) {
  const config = CONFIG.DND5E.currencies[denomination];
  const cpPerGp = CONFIG.DND5E.currencies.cp?.conversion || 100;
  if ( !config?.conversion ) return 0;
  return Math.round(cpPerGp / config.conversion);
}

/** Convert a gold piece amount into copper. */
export function gpToCp(gp) {
  return Math.round((Number(gp) || 0) * coinValue("gp"));
}

/** Denominations sorted from least to most valuable. */
function denominations() {
  return Object.keys(CONFIG.DND5E.currencies).filter(d => coinValue(d) > 0).sort((a, b) => coinValue(a) - coinValue(b));
}

/** Total wealth of an actor in copper. */
export function walletValue(actor) {
  const currency = actor.system.currency ?? {};
  return denominations().reduce((total, d) => total + ((Number(currency[d]) || 0) * coinValue(d)), 0);
}

/**
 * The largest of gold, silver and copper that a copper amount divides into evenly, so the system's
 * currency manager can work with whole coins.
 * @param {number} cp
 * @returns {string}
 */
function paymentDenomination(cp) {
  return ["gp", "sp", "cp"].find(d => coinValue(d) && !(cp % coinValue(d))) ?? "cp";
}

/**
 * Work out the coins an actor pays for a cost, using the dnd5e currency manager. It spends coins of the cost's
 * denomination first, then smaller coins, then larger ones, breaking a larger coin for change if needed.
 * @param {Actor5e} actor
 * @param {number} cost  Cost in copper.
 * @returns {{ currency: object, spent: object, change: object }|null}  Null if the actor can't afford it.
 */
export function planPayment(actor, cost) {
  const before = { ...actor.system.currency };
  if ( cost <= 0 ) return { currency: before, spent: {}, change: {} };
  if ( walletValue(actor) < cost ) return null;

  const denomination = paymentDenomination(cost);
  const amount = cost / coinValue(denomination);
  const { system, remainder } = dnd5e.applications.CurrencyManager.getActorCurrencyUpdates(
    actor, amount, denomination, { makeChange: true }
  );
  if ( remainder > 0.0001 ) return null;

  // The system gives all change in the cost's denomination (e.g. 999 cp back from 1 pp). Take that change back
  // out and hand it over again in gold, silver and copper, largest first.
  const currency = { ...system.currency };
  const spent = {};
  let owed = 0;
  for ( const d of denominations() ) {
    const delta = (Number(currency[d]) || 0) - (Number(before[d]) || 0);
    if ( delta < 0 ) spent[d] = -delta;
    else if ( delta > 0 ) {
      owed += delta * coinValue(d);
      currency[d] -= delta;
    }
  }
  const change = {};
  for ( const d of ["gp", "sp", "cp"] ) {
    const value = coinValue(d);
    const count = value ? Math.floor(owed / value) : 0;
    if ( !count ) continue;
    currency[d] = (Number(currency[d]) || 0) + count;
    change[d] = count;
    owed -= count * value;
  }
  return { currency, spent, change };
}

/**
 * Format a copper amount as coins, e.g. "12 gp, 5 sp".
 * @param {number} cp
 */
export function formatCost(cp) {
  if ( !cp ) return game.i18n.localize("DND5ECRAFT.Free");
  const parts = [];
  let rest = cp;
  for ( const d of ["gp", "sp", "cp"] ) {
    const value = coinValue(d);
    if ( !value ) continue;
    const count = Math.floor(rest / value);
    if ( count ) parts.push(`${count.toLocaleString(game.i18n.lang)} ${d}`);
    rest -= count * value;
  }
  return parts.join(", ");
}

/** Format a coin breakdown object, e.g. { gp: 2, cp: 5 } → "2 gp, 5 cp". */
export function formatCoins(coins) {
  return Object.entries(coins).filter(([, n]) => n).map(([d, n]) => `${n} ${d}`).join(", ");
}
