'use strict';
// Signed webhooks from payment providers.
const db = require('../db');
const { HttpError } = require('../lib/http');

module.exports = function (app) {
  // Gatevoo: "X-Gatevoo-Signature: t=<unix>,v1=<hmac>". We never trust the body alone: the invoice is re-read from the API.
  app.post('/webhooks/gatevoo', (req, res) => {
    const gatevoo = require('../services/gatevoo');
    if (!gatevoo.signatureOk(req.rawBody || Buffer.from(''), req.headers['x-gatevoo-signature'])) throw new HttpError(401, 'Bad signature');
    const inv = (req.body || {}).data || {};
    res.json({ ok: true });
    const o = inv.reference ? db.one("SELECT * FROM orders WHERE ref = ? AND provider = 'gatevoo'", String(inv.reference)) : null;
    if (o) gatevoo.verify(o).catch(e => console.error('[gatevoo]', e.message));
  });
};
