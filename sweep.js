// Barre el saldo de phoenixd (Prospera-Vending-1) hacia una oferta BOLT12.
// Uso:  node sweep.js --probar        (muestra cuánto enviaría, no envía nada)
//       node sweep.js                 (envía todo el saldo, menos margen de comisión)
//       node sweep.js 1000            (envía solo 1000 sats, para probar)
//       node sweep.js 1000 --probar   (muestra la prueba de 1000 sats sin enviar)
// No necesita dependencias: usa el fetch que trae Node 18+.

const fs = require('fs');

const OFFER = 'lno1zrxq8pjw7qjlm68mtp7e3yvxee4y5xrgjhhyf2fxhlphpckrvevh50u0qvaclahpprdtnznsuw6cfvchz8hwu6nj6uzhxey732hpzegf60ka7qszjac4r3feqxxey7kzf35a8y7juqv6xnvrcyn7rqqvvdy9gv2epygqqv63rsydq2uu68tvmq77lqw85xafg5g4rqtpxk9y4vh6kwddwpa6f5rdmkdcguq78uz2s5cpeqr8djtnkh5hqgx0ydpqdqkt2n5kxv3vj90cs7q6ul2eylq2wxndq2gjt5eqslf3jqqsfzltu2p5pusy3zkjkg907pa2py';
const PHOENIXD = 'http://localhost:9740';
const CONF = '/home/matth55/.phoenix/phoenix.conf';
const MIN_SAT = 1000;          // por debajo de esto no barre
const FEE_PCT = 0.01;          // margen para comisión de ruteo (1%)
const FEE_FIX = 10;            // + 10 sats fijos de margen
const DRY = process.argv.includes('--probar');
const NUM_ARG = process.argv.slice(2).find(a => /^\d+$/.test(a));
const FIXED = NUM_ARG ? parseInt(NUM_ARG, 10) : null;   // monto fijo opcional

function die(msg) { console.error('ERROR: ' + msg); process.exit(1); }

const conf = fs.readFileSync(CONF, 'utf8');
const m = conf.match(/^http-password=(.+)$/m);
if (!m) die('No encontré http-password en ' + CONF);
const AUTH = 'Basic ' + Buffer.from(':' + m[1].trim()).toString('base64');

async function api(path, form) {
  const opts = { headers: { Authorization: AUTH } };
  if (form) {
    opts.method = 'POST';
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(form).toString();
  }
  const r = await fetch(PHOENIXD + path, opts);
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { ok: r.ok, status: r.status, body };
}

(async () => {
  // 1. Validar la oferta antes de mandar plata
  const dec = await api('/decodeoffer', { offer: OFFER });
  if (dec.ok) console.log('Oferta válida' + (dec.body.description ? ': ' + dec.body.description : ''));
  else if (dec.status === 404) console.log('Aviso: esta versión de phoenixd no valida ofertas; sigo igual.');
  else die('La oferta no es válida: ' + JSON.stringify(dec.body));

  // 2. Saldo
  const bal = await api('/getbalance');
  if (!bal.ok) die('No pude leer el saldo: ' + JSON.stringify(bal.body));
  const balance = bal.body.balanceSat;
  console.log('Saldo en phoenixd: ' + balance + ' sats');

  const max = Math.floor(balance * (1 - FEE_PCT)) - FEE_FIX;
  let amount;
  if (FIXED !== null) {
    if (FIXED > max) die('Pediste ' + FIXED + ' sats pero el máximo enviable es ' + max);
    amount = FIXED;
    console.log('Monto a enviar (prueba): ' + amount + ' sats');
  } else {
    amount = max;
    if (amount < MIN_SAT) { console.log('Hay menos de ' + MIN_SAT + ' sats para enviar. No hago nada.'); return; }
    console.log('Monto a enviar: ' + amount + ' sats (dejo margen para la comisión)');
  }

  if (DRY) { console.log('Modo prueba: NO se envió nada.'); return; }

  // 3. Pagar la oferta
  const pay = await api('/payoffer', { offer: OFFER, amountSat: String(amount), message: 'Barrido Prospera-Vending-1' });
  if (pay.ok && pay.body && pay.body.paymentPreimage) {
    console.log('ENVIADO: ' + pay.body.recipientAmountSat + ' sats, comisión ' + pay.body.routingFeeSat + ' sats');
  } else {
    die('El pago falló: ' + JSON.stringify(pay.body));
  }
})().catch(e => die(e.message));
