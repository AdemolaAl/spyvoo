'use strict';
// Makes the tour narration (public/audio/tour/0.mp3 … 8.mp3) with ElevenLabs, voice "Megan – Warm & Trusted Training
// Voice" (American). Run once, then commit the 9 mp3 files:
//   ELEVENLABS_API_KEY=... npm run tour-voice           (add --force to remake existing clips)
// Until the files exist, the tour reads the lines with the device's own voice, so nothing breaks.
const fs = require('node:fs');
const path = require('node:path');

const VOICE = process.env.TOUR_VOICE_ID || '1FmDfZG0Nx2dCk793S1a';
const LINES = [
  'Welcome, agent! This is your HQ. Every time you log in, today\'s best ads are waiting for you right here.',
  'Finding a winner is easy. Just type what you want, the way you\'d say it to a friend.',
  'Spyvoo turns your words into filters: the country, how long the ad has run, the button, and more. Tap any chip to change them.',
  'Look at the days badge. An ad still running after thirty days is almost always making money. The ring is its winner score.',
  'Open any ad to see everything: the creative, how many days it ran, the variations, the countries, and the full text.',
  'Then let the AI explain it: the hook, the offer, who it targets, and in plain words, why it works.',
  'Love it? Save it to a board, follow the advertiser, and Spyvoo alerts you the moment they launch something new.',
  'Last trick: Make it mine. Type your product, and the AI writes fresh scripts in the same style. Never a copy.',
  'You\'re ready, agent. Search like you talk, look for ads running thirty days or more, read the AI breakdown, then make it yours. Happy spying!'
];

async function main() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) { console.error('Set ELEVENLABS_API_KEY (elevenlabs.io → Profile → API keys).'); process.exit(1); }
  const dir = path.join(__dirname, '..', 'public', 'audio', 'tour');
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < LINES.length; i++) {
    const file = path.join(dir, i + '.mp3');
    if (fs.existsSync(file) && !process.argv.includes('--force')) { console.log('✓ ' + i + '.mp3 (kept)'); continue; }
    const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + VOICE + '?output_format=mp3_44100_128', {
      method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: LINES[i], model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } })
    });
    if (!r.ok) { console.error('✗ ' + i + '.mp3: ElevenLabs answered ' + r.status + ' ' + (await r.text()).slice(0, 200)); process.exit(1); }
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    console.log('✓ ' + i + '.mp3');
  }
  console.log('Done. Commit public/audio/tour/*.mp3 and deploy.');
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { LINES, VOICE };
