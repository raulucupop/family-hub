/* The dashboard is rendered by the browser, not by the server, so these read the source the
   browser runs — the same approach test/security.test.js takes for the client-side guards.
   Each one pins a mistake that was actually made and would be silent if it came back. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const app = read('public/app.js');
const css = read('public/styles.css');

test('"show all deadlines" is hidden by default, and the phone rule comes after', () => {
  // Both rules have the same specificity, so the one written last wins. Appended at the end of the
  // file, the desktop default silently overrode the media query and the button was invisible on a
  // phone — which is the one place it exists for.
  const def = css.indexOf('.ribbon-more { display: none; }');
  const shown = css.indexOf('.ribbon-more { display: block');
  assert.ok(def > -1, 'the default rule must exist');
  assert.ok(shown > -1, 'the narrow-screen rule must exist');
  assert.ok(def < shown, 'the default has to be declared before the breakpoint that reveals it');
  assert.ok(css.slice(0, shown).lastIndexOf('@media (max-width: 860px)') > def,
    'the rule that shows it belongs inside the phone breakpoint');
});

test('the phone strip stacks and hides past the third, rather than scrolling sideways', () => {
  assert.match(css, /\.ribbon:not\(\.all\) \.stub:nth-child\(n\+4\) \{ display: none; \}/);
  assert.ok(!/\.ribbon \{ display: flex; overflow-x: auto/.test(css),
    'nine cards at 168px is 1500px of sideways content on a 390px screen');
});

test('charts are drawn only once the folded section is opened', () => {
  const draw = app.indexOf('drawCharts(stats, DASH_VIEW, DASH_MONTHS, trendStats)');
  assert.ok(draw > -1);
  const around = app.slice(Math.max(0, draw - 1200), draw);
  assert.match(around, /addEventListener\('toggle'|const drawReports/,
    'drawing on every dashboard render also fetches the 200 KB chart library for people who never look');
});

test('a hidden tab still draws the charts', () => {
  // requestAnimationFrame never fires while the page is hidden, so on its own it left somebody who
  // opened the section and switched away with three empty boxes when they came back.
  const i = app.indexOf('requestAnimationFrame(() => requestAnimationFrame(draw))');
  assert.ok(i > -1, 'two frames, so the just-opened <details> has been laid out before measuring');
  assert.match(app.slice(i, i + 200), /setTimeout\(draw, \d+\)/, 'and a timeout for when frames never come');
});

test('the month-end card carries the run-rate, instead of a second card repeating it', () => {
  assert.match(app, /function paceLine\(proj\)/);
  assert.equal(app.match(/paceLine\(proj\)/g).length >= 3, true,
    'the sentence belongs to the forecast card in both its states, not to a card of its own');
  // dashInsight used to say "September closes around X" directly under a card that said it could
  // not tell you how the month ends — two different quantities, nearly the same words
  const insight = app.slice(app.indexOf('function dashInsight'), app.indexOf('function dashInsight') + 900);
  assert.ok(!/closes around|se închide pe la/.test(insight), 'the projection moved out of the insight card');
});

test('currencies are listed side by side, never added together', () => {
  const fn = app.slice(app.indexOf('function exposureHtml'), app.indexOf('function gapsHtml'));
  assert.match(fn, /moneyIn\(amt, c\)/, 'an amount in euro has to print as euro');
  assert.ok(!/owed\[.*\] \+ /.test(fn.replace(/owed\[c\] = \(owed\[c\] \|\| 0\) \+ bal;/, '')),
    'totals are per currency; a single sum across them would be a lie about the money');
});
