'use strict';
// Makes the tour audio with ElevenLabs:
//   public/audio/tour/0.mp3 … 8.mp3  the narrator, voice "Liora – Warm & Elegant Narrator" (soft British accent)
//   public/audio/tour/music.mp3      a soft, quiet music bed that plays under her (it dips while she talks)
// Run once, then commit the files:
//   ELEVENLABS_API_KEY=... npm run tour-voice              (add --force to remake existing files)
//   ELEVENLABS_API_KEY=... npm run tour-voice -- --voice   (narration only)   --music (music only)
// Another voice: TOUR_VOICE_ID=<id>. If ElevenLabs says the voice isn't found, add it to "My Voices" in the
// ElevenLabs Voice Library first. You can also drop any mp3 you like in as public/audio/tour/music.mp3.
// Until the files exist, the tour reads the lines with the device's own voice and plays no music, so nothing breaks.
const fs = require('node:fs');
const path = require('node:path');

const VOICE = process.env.TOUR_VOICE_ID || 'ApuKum9r0H3W3sf1xR2S';
const MODELS = process.env.TOUR_VOICE_MODEL ? [process.env.TOUR_VOICE_MODEL] : ['eleven_v3', 'eleven_multilingual_v2'];
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
const MUSIC_PROMPT = 'Soft, modern, minimal instrumental background music for a premium tech product walkthrough. 80 BPM, warm electric piano and gentle synth pads, light airy plucks, a subtle soft beat with brushed hi-hats, quietly curious and confident with a hint of spy intrigue. No vocals, no big drops, no loud drums. Calm and steady so a narrator can speak over it. Loops smoothly.';

async function el(key, url, body) {
  const r = await fetch('https://api.elevenlabs.io' + url, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify(body) });
  if (!r.ok) { const e = new Error('ElevenLabs answered ' + r.status + ' ' + (await r.text()).slice(0, 240)); e.status = r.status; throw e; }
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) { console.error('Set ELEVENLABS_API_KEY (elevenlabs.io → Profile → API keys).'); process.exit(1); }
  const force = process.argv.includes('--force');
  const onlyVoice = process.argv.includes('--voice'), onlyMusic = process.argv.includes('--music');
  const dir = path.join(__dirname, '..', 'public', 'audio', 'tour');
  fs.mkdirSync(dir, { recursive: true });
  if (!onlyMusic) {
    let model = MODELS[0];
    for (let i = 0; i < LINES.length; i++) {
      const file = path.join(dir, i + '.mp3');
      if (fs.existsSync(file) && !force) { console.log('✓ ' + i + '.mp3 (kept)'); continue; }
      let buf;
      for (;;) {
        try {
          buf = await el(key, '/v1/text-to-speech/' + VOICE + '?output_format=mp3_44100_128', { text: LINES[i], model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true } });
          break;
        } catch (e) {
          const next = MODELS[MODELS.indexOf(model) + 1];
          if (e.status && e.status !== 401 && e.status !== 404 && next) { console.log('  ' + model + ' not available here, using ' + next); model = next; continue; }
          if (e.status === 404 || /voice_not_found/.test(e.message)) e.message += '\n  → Add the voice to "My Voices" in the ElevenLabs Voice Library, or set TOUR_VOICE_ID.';
          throw e;
        }
      }
      fs.writeFileSync(file, buf);
      console.log('✓ ' + i + '.mp3');
    }
  }
  if (!onlyVoice) {
    const file = path.join(dir, 'music.mp3');
    if (fs.existsSync(file) && !force) console.log('✓ music.mp3 (kept)');
    else {
      try {
        fs.writeFileSync(file, await el(key, '/v1/music?output_format=mp3_44100_128', { prompt: MUSIC_PROMPT, music_length_ms: 90000, force_instrumental: true }));
        console.log('✓ music.mp3');
      } catch (e) {
        console.error('✗ music.mp3: ' + e.message + '\n  → Or make a soft track in ElevenLabs Music and save it as public/audio/tour/music.mp3. The tour works without it.');
      }
    }
  }
  console.log('Done. Commit public/audio/tour/*.mp3 and deploy.');
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { LINES, VOICE, MUSIC_PROMPT };
