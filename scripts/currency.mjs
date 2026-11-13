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
 * Work out the coins an actor pays for a cost. Spends the smallest coins first, then breaks a larger coin
 * if needed and takes the change back in gold, silver and copper.
 * @param {Actor5e} actor
 * @param {number} cost  Cost in copper.
 * @returns {{ currency: object, spent: object, change: object }|null}  Null if the actor can't afford it.
 */
export function planPayment(actor, cost) {
  if ( cost <= 0 ) return { currency: { ...actor.system.currency }, spent: {}, change: {} };
  if ( walletValue(actor) < cost ) return null;

  const currency = { ...actor.system.currency };
  const spent = {};
  let remaining = cost;
  for ( const d of denominations() ) {
    if ( remaining <= 0 ) break;
    const value = coinValue(d);
    const have = Number(currency[d]) || 0;
    const use = Math.min(have, Math.ceil(remaining / value));
    if ( !use ) continue;
    currency[d] = have - use;
    spent[d] = use;
    remaining -= use * value;
  }

  // If a larger coin covered more than needed, keep back the smaller coins it made unnecessary.
  let owed = -remaining;
  for ( const d of denominations() ) {
    if ( owed <= 0 ) break;
    const value = coinValue(d);
    const keep = Math.min(spent[d] ?? 0, Math.floor(owed / value));
    if ( !keep ) continue;
    currency[d] += keep;
    spent[d] -= keep;
    if ( !spent[d] ) delete spent[d];
    owed -= keep * value;
  }

  // Give change for any overpayment, largest coins first. Electrum is never given as change.
  const change = {};
  for ( const d of denominations().reverse() ) {
    if ( (owed <= 0) || (d === "ep") ) continue;
    const value = coinValue(d);
    const count = Math.floor(owed / value);
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
