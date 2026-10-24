// Prints a standalone fixture review from the actual React Native component.
const { render, styles } = require('./runtime.cjs');
const fixtures = require('./fixtures.cjs');
const sections = fixtures.map(fixture => `<section aria-label="${fixture.status} fixture"><p class="fixture-label">${fixture.status} · test data</p><div class="phone-content">${render(fixture)}<p class="samples">SAMPLES</p></div></section>`).join('');
process.stdout.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Session title — U1 fixture review</title><style>${styles()}
body{margin:0;padding:24px 16px;background:#f4f5f6;color:#3f4852;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:440px;margin:auto}h1{font-size:20px;margin:0 0 10px}p{line-height:1.5}.review-note{font-size:14px;color:#667078}.fixture-label{margin:24px 0 8px;font-size:13px;color:#667078}.phone-content{box-sizing:border-box;max-width:375px;background:#fff;padding:20px 18px}.samples{margin:20px 0 0;color:#667078;font-size:13px;letter-spacing:2px}*{box-sizing:border-box}
</style></head><body><main><h1>Compact Session Details title</h1><p class="review-note">U1 visual review · Test data only. No live sessions or behaviour connected. DRAFT and the running app are unchanged.</p>${sections}</main></body></html>`);
