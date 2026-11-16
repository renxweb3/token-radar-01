// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value follows only from the snapshot's own figures:
//
//   base       = tvl_usd x BASE_MULTIPLE
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied    = max(1, round(base x growthMult x maturity))
//
// The constants are the house model's, stated in the dashboard and changeable in the model sandbox. No
// protocol name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** Net farming economics (assumption-labelled, see `economics`): one farmer is assumed to
 *  capture CAPTURE_RATE of a protocol's implied value. That rate is a planning figure, not a
 *  forecast and not a fact: the dashboard states it next to every number it feeds. */
export const CAPTURE_RATE = 0.0001; // 0.01% of implied value
/** Decision thresholds on net dollars per hour (stated prioritisation policy, not a wage claim). */
export const FARM_NET_PER_HOUR = 500;
export const THIN_NET_PER_HOUR = 100;

/** Category-shift rule (cautious, hierarchical): a category's shift is the median ratio of
 *  its live comparables' market cap to the base model's implied value, ratios winsorized to
 *  [0.05, SHIFT_WINSOR], shrunk toward 1 by n/(n+SHIFT_K), clamped to [SHIFT_MIN, SHIFT_MAX].
 *  Categories with fewer than SHIFT_MIN_COMPARABLES live comparables get no shift (1.0).
 *  Medians and winsorizing mean one extreme comparable (the snapshot holds a 2650x ratio)
 *  cannot move a shift; it is never imported wholesale. */
export const SHIFT_K = 5;
export const SHIFT_MIN = 0.67;
export const SHIFT_MAX = 1.5;
export const SHIFT_WINSOR = 10;
export const SHIFT_MIN_COMPARABLES = 3;

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** Live-token protocols are shown in full: the dashboard's Live token view carries every
 *  protocol in the snapshot that records a market cap, not just the top 24. */
export const LIVE_ROWS = Number.POSITIVE_INFINITY;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  category_shift: number;
  econ: Econ;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** Net farming economics for one row. Every figure derives from the row's own implied
 *  value and the stated capture assumption; `decision` follows the stated thresholds. */
export interface Econ {
  capital_usd: number;
  setup_gas_usd: number;
  weekly_gas_usd: number;
  hold_days: number;
  weeks: number;
  total_cost_usd: number;
  hours: number;
  gross_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  breakeven_capture_pct: number;
  decision: 'FARM' | 'THIN' | 'SKIP';
}

/** A category's shift, with the evidence behind it. */
export interface CategoryShift {
  category: string;
  shift: number;
  comparables: number;
  median_ratio: number | null;
}

/** Leave-one-out calibration on the snapshot's live-token protocols (market cap > 0,
 *  not CEX). Each live protocol is predicted without using itself. */
export interface Calibration {
  n: number;
  excluded_mcap_le_zero: number;
  baseline_median_abs_log: number;
  shifted_median_abs_log: number;
  baseline_mean_abs_log: number;
  shifted_mean_abs_log: number;
  baseline_within_2x: number;
  shifted_within_2x: number;
  baseline_within_5x: number;
  shifted_within_5x: number;
  /** Share of |log error| in each bucket for the shifted model: <0.5, 0.5-1, 1-2, 2-3, >3. */
  shifted_buckets: number[];
}

/** One category (family) on the board: how many rows, their median implied value, its best row. */
export interface FamilyStat {
  category: string;
  rows: number;
  median_implied_usd: number;
  top_slug: string;
  top_name: string;
  top_implied_usd: number;
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  category_shift: number;
  est_gross_usd: number;
  total_cost_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  breakeven_capture_pct: number;
  decision: 'FARM' | 'THIN' | 'SKIP';
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's.
 *  `mcap_valid` is false when the recorded market cap is <= 0: no usable market value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_valid: boolean;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  calibration: Calibration;
  shifts: CategoryShift[];
  families: FamilyStat[];
  econ: {
    capture_rate: number;
    farm_net_per_hour: number;
    thin_net_per_hour: number;
    weekly_gas_usd: number;
    decisions: { farm: number; thin: number; skip: number };
  };
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age };
}

/** The median of numbers, or null when there are none. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Live-token ground truth: protocols that record a usable market cap, not CEX.
 *  16 snapshot protocols record mcap_usd <= 0 (data errors); they are excluded here
 *  and counted in `calibration.excluded_mcap_le_zero`, never silently dropped. */
export function liveGroundTruth(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.category !== 'CEX');
}

/** One category's shift from its live comparables, or 1.0 when it has too few.
 *  `exclude` is the protocol left out for leave-one-out validation (null for board scoring,
 *  where pre-token rows are never in the live set, so there is nothing to leak). */
export function categoryShiftFor(category: string | null, live: SnapshotProtocol[], snapshot: Snapshot, model: ModelConstants, exclude: SnapshotProtocol | null): CategoryShift {
  if (category === null) return { category: 'Other', shift: 1, comparables: 0, median_ratio: null };
  const sib = live.filter((q) => q.category === category && q !== exclude);
  if (sib.length < SHIFT_MIN_COMPARABLES) return { category, shift: 1, comparables: sib.length, median_ratio: null };
  const ratios = sib.map((q) => {
    const base = impliedValue(q, snapshot.as_of, model).implied;
    return Math.min(SHIFT_WINSOR, Math.max(0.05, q.mcap_usd! / base));
  });
  const med = median(ratios)!;
  const shift = Math.min(SHIFT_MAX, Math.max(SHIFT_MIN, 1 + (med - 1) * (sib.length / (sib.length + SHIFT_K))));
  return { category, shift, comparables: sib.length, median_ratio: Math.round(med * 1000) / 1000 };
}

/** Every category's shift for board scoring, keyed by category name. */
export function categoryShifts(snapshot: Snapshot, model: ModelConstants = MODEL): Map<string, number> {
  const live = liveGroundTruth(snapshot);
  const out = new Map<string, number>();
  for (const p of snapshot.protocols) {
    if (p.category === null || out.has(p.category)) continue;
    out.set(p.category, categoryShiftFor(p.category, live, snapshot, model, null).shift);
  }
  return out;
}

/** Net farming economics for one scored row. Capital is locked, not spent, so it is
 *  never subtracted from the return; only gas is a cost. Hours count setup, one weekly
 *  action per week of the hold, the claim and the log. */
export function economics(implied: number, age: number | null, capital: number): Econ {
  const setupGas = capital >= 150 ? 8 : 4;
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const totalCost = setupGas + 2 * weeks;
  const hours = Math.round((0.25 + weeks * (10 / 60) + 0.17 + 0.08) * 100) / 100;
  const gross = Math.round(implied * CAPTURE_RATE);
  const net = gross - totalCost;
  const netPerHour = Math.round((net / hours) * 100) / 100;
  const breakeven = Math.round((totalCost / implied) * 100 * 10000) / 10000;
  const decision: Econ['decision'] = net <= 0 || netPerHour < THIN_NET_PER_HOUR ? 'SKIP' : netPerHour >= FARM_NET_PER_HOUR ? 'FARM' : 'THIN';
  return { capital_usd: capital, setup_gas_usd: setupGas, weekly_gas_usd: 2, hold_days: hold, weeks, total_cost_usd: totalCost, hours, gross_usd: gross, net_usd: net, net_per_hour_usd: netPerHour, breakeven_capture_pct: breakeven, decision };
}

/** Leave-one-out calibration of the base model and the shifted model, on live ground truth.
 *  Error is log(predicted / actual market cap). Buckets are the shifted model's |log error|
 *  shares in <0.5, 0.5-1, 1-2, 2-3, >3. */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const live = liveGroundTruth(snapshot);
  const excluded = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd <= 0).length;
  const baseErrs: number[] = [];
  const shiftErrs: number[] = [];
  for (const p of live) {
    const base = impliedValue(p, snapshot.as_of, model).implied;
    baseErrs.push(Math.log(base / p.mcap_usd!));
    const s = categoryShiftFor(p.category, live, snapshot, model, p);
    shiftErrs.push(Math.log(Math.max(1, Math.round(base * s.shift)) / p.mcap_usd!));
  }
  const absMed = (e: number[]): number => {
    const m = median(e.map(Math.abs));
    return m === null ? 0 : Math.round(m * 10000) / 10000;
  };
  const absMean = (e: number[]): number => Math.round((e.reduce((n, v) => n + Math.abs(v), 0) / Math.max(1, e.length)) * 10000) / 10000;
  const within = (e: number[], k: number): number => Math.round((e.filter((v) => Math.abs(v) <= Math.log(k)).length / Math.max(1, e.length)) * 1000) / 1000;
  const buckets = [0, 0, 0, 0, 0];
  for (const v of shiftErrs) {
    const a = Math.abs(v);
    buckets[a < 0.5 ? 0 : a < 1 ? 1 : a < 2 ? 2 : a < 3 ? 3 : 4]!++;
  }
  return {
    n: live.length,
    excluded_mcap_le_zero: excluded,
    baseline_median_abs_log: absMed(baseErrs),
    shifted_median_abs_log: absMed(shiftErrs),
    baseline_mean_abs_log: absMean(baseErrs),
    shifted_mean_abs_log: absMean(shiftErrs),
    baseline_within_2x: within(baseErrs, 2),
    shifted_within_2x: within(shiftErrs, 2),
    baseline_within_5x: within(baseErrs, 5),
    shifted_within_5x: within(shiftErrs, 5),
    shifted_buckets: buckets.map((c) => Math.round((c / Math.max(1, live.length)) * 1000) / 1000),
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. Implied value is the
 *  base model times the protocol's category shift (1.0 when its category has too few live
 *  comparables). Ranks follow the shifted value. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const shifts = categoryShifts(snapshot, model);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, maturityMult, age } = impliedValue(p, snapshot.as_of, model);
    const shift = p.category === null ? 1 : (shifts.get(p.category) ?? 1);
    const shifted = Math.max(1, Math.round(implied * shift));
    const econ = economics(shifted, age, capitalFor(p));
    return { p, implied: shifted, shift, econ, growthPct, growthMult, maturityMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    category_shift: s.shift,
    econ: s.econ,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.econ).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * Step 7 states the net economics with its assumption labelled, so the decision can be checked.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, econ: Econ | null = null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
  if (econ !== null) {
    steps.push({
      text: `Economics (assumption: one farmer captures 0.01% of implied value): est. gross $${econ.gross_usd.toLocaleString('en-US')}, gas $${econ.total_cost_usd}, net $${econ.net_usd.toLocaleString('en-US')}, about $${econ.net_per_hour_usd.toLocaleString('en-US')} an hour over ${econ.hours} hours — decision ${econ.decision}. If the capture assumption is wrong, the decision changes.`,
      cost: `break-even capture ${econ.breakeven_capture_pct}% of implied value`,
      time: `${econ.hold_days} days held`,
    });
  }
  return steps;
}

/** The live-token protocols, all of them, by market cap: the dashboard's Live token view
 *  carries the full live set (every protocol that records a market cap), not just the top 24.
 *  Protocols whose recorded market cap is <= 0 sort last and are flagged, never hidden. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? -1) - (a.mcap_usd ?? -1) || b.tvl_usd - a.tvl_usd)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_valid: p.mcap_usd !== null && p.mcap_usd > 0,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    category_shift: row.category_shift,
    est_gross_usd: row.econ.gross_usd,
    total_cost_usd: row.econ.total_cost_usd,
    net_usd: row.econ.net_usd,
    net_per_hour_usd: row.econ.net_per_hour_usd,
    breakeven_capture_pct: row.econ.breakeven_capture_pct,
    decision: row.econ.decision,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const cal = calibrate(snapshot, model);
  const shifts = categoryShifts(snapshot, model);
  const shiftList: CategoryShift[] = [...shifts.entries()]
    .map(([category, shift]) => {
      const liveSet = liveGroundTruth(snapshot);
      return categoryShiftFor(category, liveSet, snapshot, model, null);
    })
    .filter((s) => s.comparables >= SHIFT_MIN_COMPARABLES)
    .sort((a, b) => b.shift - a.shift);
  const byCat = new Map<string, BoardRow[]>();
  for (const r of board) {
    const k = r.category ?? 'Other';
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(r);
  }
  const families: FamilyStat[] = [...byCat.entries()]
    .map(([category, rows]) => {
      const imps = rows.map((r) => r.implied_value_usd).sort((a, b) => a - b);
      const med = imps[Math.floor(imps.length / 2)]!;
      const top = rows[0]!;
      return { category, rows: rows.length, median_implied_usd: med, top_slug: top.slug, top_name: top.name, top_implied_usd: top.implied_value_usd };
    })
    .sort((a, b) => b.rows - a.rows);
  const decisions = { farm: 0, thin: 0, skip: 0 };
  for (const r of board) decisions[r.econ.decision === 'FARM' ? 'farm' : r.econ.decision === 'THIN' ? 'thin' : 'skip']++;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    calibration: cal,
    shifts: shiftList,
    families,
    econ: { capture_rate: CAPTURE_RATE, farm_net_per_hour: FARM_NET_PER_HOUR, thin_net_per_hour: THIN_NET_PER_HOUR, weekly_gas_usd: 2, decisions },
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
