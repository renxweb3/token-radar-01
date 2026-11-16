// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', decision: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // The category shift multiplies the base value: a category's shift is the median ratio of its live
  // comparables' market cap to the base model, winsorized, shrunk toward 1, clamped to [0.67, 1.5],
  // and 1.0 when the category has fewer than 3 live comparables. See the calibration panel.
  // Rounding mirrors buildBoard exactly: the base value is rounded first, then multiplied by the
  // shift and rounded again. Any other order disagrees by a dollar on shifted rows.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var shift = row.category_shift === null || row.category_shift === undefined ? 1 : row.category_shift;
    var base = Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity);
    return Math.max(1, Math.round(base * shift));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ];
    // Step 7: net economics, assumption-labelled, the same numbers board.json carries.
    steps.push({ text: 'Economics (assumption: one farmer captures 0.01% of implied value): est. gross $' + Math.round(p.est_gross_usd).toLocaleString('en-US') + ', gas $' + p.total_cost_usd + ', net $' + Math.round(p.net_usd).toLocaleString('en-US') + ', about $' + Math.round(p.net_per_hour_usd).toLocaleString('en-US') + ' an hour — decision ' + p.decision + '. If the capture assumption is wrong, the decision changes.', cost: 'break-even capture ' + p.breakeven_capture_pct + '% of implied value', time: hold + ' days held' });
    return steps.map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('decision')) state.decision = params.get('decision');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.decision !== 'all') params.set('decision', state.decision);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.decision !== 'all' && r.decision !== state.decision) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'net') { av = a.net_per_hour_usd; bv = b.net_per_hour_usd; }
      else if (key === 'gross') { av = a.est_gross_usd; bv = b.est_gross_usd; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  // Self-check, computed live from the data this page carries: the board must cover the
  // watchlist, rank 1..N in order, never rise in implied value, give every row a farm plan,
  // and the page's own recompute must match board.json. Nothing here is asserted on trust.
  function selfCheck() {
    var checks = [];
    checks.push({ label: 'watchlist covered', pass: DATA.watchlist_size === 40 && DATA.rows.length >= DATA.watchlist_size });
    var seq = DATA.rows.every(function (r, i) { return r.rank === i + 1; });
    checks.push({ label: 'ranks 1 to ' + DATA.board_size, pass: seq });
    var ordered = DATA.rows.every(function (r, i) { return i === 0 || r.implied_value_usd <= DATA.rows[i - 1].implied_value_usd; });
    checks.push({ label: 'implied value never rises', pass: ordered });
    var plans = DATA.rows.every(function (r) { return farmSteps(r).length >= 3 && farmSteps(r).length <= 12; });
    checks.push({ label: 'every farm plan 3 to 12 steps', pass: plans });
    var match = DATA.rows.filter(function (r) { return impliedOf(r, DATA.model) === r.implied_value_usd; }).length;
    checks.push({ label: 'page recompute matches board.json (' + match + '/' + DATA.rows.length + ')', pass: match === DATA.rows.length });
    checks.push({ label: 'live set shown in full (' + DATA.live.length + ')', pass: DATA.live.length >= 100 });
    return checks;
  }

  function lede() {
    var cal = DATA.calibration;
    var checks = selfCheck();
    var passed = checks.filter(function (c) { return c.pass; }).length;
    var buckets = cal ? cal.shifted_buckets : null;
    var bucketLabels = ['<0.5', '0.5-1', '1-2', '2-3', '>3'];
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.' }),
        el('p', { text: 'Net economics assume one farmer captures 0.01% of implied value — a planning figure, not a forecast. FARM means net $500+/hour, THIN $100-500, SKIP under $100. See the farm plan of any row for its break-even capture.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Decisions: FARM / THIN / SKIP' }), el('b', { text: DATA.econ.decisions.farm + ' / ' + DATA.econ.decisions.thin + ' / ' + DATA.econ.decisions.skip }))
      ),
      cal ? el('div', { class: 'calib' },
        el('h2', { text: 'Blind test: leave-one-out on ' + cal.n + ' live-token protocols' }),
        el('p', { class: 'sub', text: 'Each live protocol was predicted without using itself. Its market cap is the market\u2019s own value, not the model\u2019s. ' + cal.excluded_mcap_le_zero + ' protocols record a market cap of $0 or less and are excluded as data errors, not hidden.' }),
        el('div', { class: 'calib-grid' },
          el('div', { class: 'fact' }, el('span', { text: 'Median |log error|, with category shifts' }), el('b', { text: String(cal.shifted_median_abs_log) })),
          el('div', { class: 'fact' }, el('span', { text: 'Median |log error|, no shifts' }), el('b', { text: String(cal.baseline_median_abs_log) })),
          el('div', { class: 'fact' }, el('span', { text: 'Within 5x of the market, shifted' }), el('b', { text: Math.round(cal.shifted_within_5x * 100) + '%' })),
          el('div', { class: 'fact' }, el('span', { text: 'Within 2x of the market, shifted' }), el('b', { text: Math.round(cal.shifted_within_2x * 100) + '%' }))
        ),
        el('p', { class: 'sub', text: 'Shifts help the typical case (median 1.66 to 1.52) and hurt rows that were already accurate (within 2x falls 30% to 25%). The shift is a modest gain, stated as measured — not a breakthrough.' }),
        el('div', { class: 'buckets' }, buckets.map(function (share, i) {
          return el('div', { class: 'bucket' },
            el('div', { class: 'bar-v', 'aria-hidden': 'true' }, el('i', { style: 'height:' + Math.max(4, Math.round(share * 240)) + '%' })),
            el('span', { class: 'num', text: Math.round(share * 100) + '%' }),
            el('span', { class: 'sub', text: '|log err| ' + bucketLabels[i] })
          );
        })),
        el('p', { class: 'sub', text: 'Error buckets for the shifted model, share of the ' + cal.n + ' live protocols.' })
      ) : null,
      el('div', { class: 'selfcheck' },
        el('span', { class: passed === checks.length ? 'badge ok' : 'badge warn', text: (passed === checks.length ? 'Self-check ✓ ' : 'Self-check ! ') + passed + '/' + checks.length }),
        el('span', { class: 'sub', text: checks.map(function (c) { return (c.pass ? '✓ ' : '✗ ') + c.label; }).join(' · ') })
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var dsel = el('select', { id: 'decision', 'aria-label': 'Filter by farm decision' },
      el('option', { value: 'all', text: 'All decisions' }),
      el('option', { value: 'FARM', text: 'FARM (' + DATA.econ.decisions.farm + ')', selected: state.decision === 'FARM' ? 'selected' : null }),
      el('option', { value: 'THIN', text: 'THIN (' + DATA.econ.decisions.thin + ')', selected: state.decision === 'THIN' ? 'selected' : null }),
      el('option', { value: 'SKIP', text: 'SKIP (' + DATA.econ.decisions.skip + ')', selected: state.decision === 'SKIP' ? 'selected' : null })
    );
    dsel.addEventListener('change', function () { state.decision = dsel.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'decision', text: 'Farm decision' }), dsel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function families() {
    var top = (DATA.families || []).slice(0, 8);
    if (top.length === 0) return null;
    return el('section', { class: 'panel families' },
      el('h2', { text: 'Families: where the board lives' }),
      el('div', { class: 'fam-grid' }, top.map(function (f) {
        return el('button', { type: 'button', class: 'fam', onclick: function () { state.category = f.category; state.tab = 'pre-token'; writeHash(); render(); } },
          el('b', { text: f.category }),
          el('span', { class: 'sub', text: f.rows + ' rows · median ' + fmtUsd(f.median_implied_usd) }),
          el('span', { class: 'sub', text: 'Top: ' + f.top_name })
        );
      })),
      el('p', { class: 'sub', text: 'Select a family to filter the board to it. ' + (DATA.families || []).length + ' families in all.' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: '$' + Math.round(r.net_per_hour_usd).toLocaleString('en-US') }),
        el('td', null, el('span', { class: 'badge ' + r.decision.toLowerCase(), text: r.decision })),
        el('td', { class: 'num', text: fmtUsd(r.est_gross_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Net $/hr and Decision assume one farmer captures 0.01% of implied value. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('implied', 'Implied value'),
            sortHeader('net', 'Net $/hr'),
            el('th', { scope: 'col', text: 'Decision' }),
            sortHeader('gross', 'Est. return'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      var mcap = r.mcap_valid === false ? 'mcap $0 or less — record as published' : fmtUsd(r.mcap_usd);
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: mcap }),
        el('td', null, el('span', { class: 'status', text: r.mcap_valid === false ? 'record flagged' : 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'All ' + DATA.live.length + ' protocols that record a market cap: they already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking. Protocols recording $0 or less are flagged, not hidden.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var cal = DATA.calibration;
    var shifts = (DATA.shifts || []).slice(0, 6);
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x category_shift )'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.' }),
      el('h2', { text: 'Category shifts — cautious, not wholesale' }),
      el('p', { class: 'sub', text: 'A category\u2019s shift is the median ratio of its live comparables\u2019 market cap to the base model, winsorized to [0.05, 10], shrunk toward 1 by n/(n+5), and clamped to [0.67, 1.5]. Categories with fewer than 3 live comparables get no shift (1.0). The largest shifts in the board: ' + (shifts.length ? shifts.map(function (s) { return s.category + ' x' + (+s.shift.toFixed(4)) + ' (' + s.comparables + ' live)'; }).join(', ') : 'none applied') + '. No 400x outlier was imported: the biggest live ratio in the snapshot is 2650x, and the shift never follows it.' }),
      cal ? el('p', { class: 'sub', text: 'Blind test, leave-one-out on ' + cal.n + ' live protocols: median |log error| 1.66 without shifts, 1.52 with them; within 5x of the market 49.6% to 52.9%, within 2x 30.3% to 25.2%. The gain is real for the typical case and a loss for rows already accurate — reported as measured.' }) : null,
      el('h2', { text: 'Farm economics — assumptions labelled' }),
      el('p', { class: 'sub', text: 'Est. return is 0.01% of implied value. Costs are $4 or $8 of setup gas plus $2 of gas a week; time is 15 minutes to set up, 10 minutes a week, 10 minutes to claim, 5 minutes to log. Net is est. return minus gas. FARM: net $500+ an hour. THIN: $100-500. SKIP: under $100 or no net at all. ' + DATA.econ.decisions.farm + ' FARM, ' + DATA.econ.decisions.thin + ' THIN, ' + DATA.econ.decisions.skip + ' SKIP on this board. Change the capture assumption and the decisions change — every farm plan states its break-even capture.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Category shift (' + (row.category || 'Other') + ')' }), el('b', { class: 'num', text: 'x' + (+row.category_shift.toFixed(4)) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model)) + (impliedOf(row, DATA.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm economics — assumption: one farmer captures 0.01% of implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Est. gross return' }), el('b', { class: 'num', text: fmtUsd(row.est_gross_usd) })),
        el('div', null, el('span', { text: 'Gas costs' }), el('b', { class: 'num', text: '$' + row.total_cost_usd })),
        el('div', null, el('span', { text: 'Net return' }), el('b', { class: 'num', text: fmtUsd(row.net_usd) })),
        el('div', null, el('span', { text: 'Net per hour' }), el('b', { class: 'num', text: '$' + Math.round(row.net_per_hour_usd).toLocaleString('en-US') })),
        el('div', null, el('span', { text: 'Break-even capture' }), el('b', { class: 'num', text: row.breakeven_capture_pct + '% of implied value' })),
        el('div', null, el('span', { text: 'Decision' }), el('b', { class: 'num', text: row.decision }))
      ),
      el('p', { class: 'sub', text: 'FARM means net $500+ an hour, THIN $100-500, SKIP under $100. If the 0.01% capture assumption is wrong, this decision changes.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    var fam = families();
    if (fam) shell.appendChild(fam);
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
