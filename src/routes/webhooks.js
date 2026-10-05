'use strict';
// Signed webhooks from payment providers.
const db = require('../db');
const { HttpError } = require('../lib/http');

module.exports = function (app) {
  // Gatevoo: "X-Gatevoo-Signature: t=<unix>,v1=<hmac>" or plain hex HMAC of the body (Voo family contract).
  // We never trust the body alone: the invoice is re-read from the API.
  app.post('/webhooks/gatevoo', (req, res) => {
    const gatevoo = require('../services/gatevoo');
    if (!gatevoo.signatureOk(req.rawBody || Buffer.from(''), req.headers['x-gatevoo-signature'])) throw new HttpError(401, 'Bad signature');
    const inv = (req.body || {}).data || (req.body || {}).invoice || {};
    res.json({ ok: true });
    const ref = inv.reference || inv.order_id;
    const o = ref ? db.one("SELECT * FROM orders WHERE ref = ? AND provider = 'gatevoo'", String(ref)) : null;
    if (o) gatevoo.verify(o).catch(e => console.error('[gatevoo]', e.message));
  });
};
