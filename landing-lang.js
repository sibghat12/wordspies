// Per-language SEO landing pages — /learn-{slug}
// Owner ask 20 Aug 2026: dedicated landing page for every language we
// want to rank for, with heavy keyword targeting around "learn X online
// free with native speakers", "language exchange {lang}", "{lang}
// conversation partner", "practice {lang} speaking". Blog posts already
// cover /blog/learn-{lang}-* — these are the *canonical* landing pages
// that convert the click into a signup, wired to /app.
//
// Shares landing.js chrome (TS_NAV + TS_FOOTER_TS + TS_CHROME_CSS + GA)
// so it reads as part of the same site and the SW cache stays warm.
const { TS_CHROME_CSS, TS_NAV, TS_FOOTER_TS, GA } = require('./landing');
const SITE = 'https://talksibi.com';

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}

// Language catalogue. Every entry generates a page. Add a new object
// → new /learn-{slug} route + sitemap entry (see server.js + sitemap.xml).
// nativeName is for the H1 badge; targetPhrase is the primary keyword the
// meta title bids on; faq is 4 Q&As Google picks up as rich snippets.
const LANGS = {
  spanish: {
    name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', code: 'es',
    speakers: '500 million',
    hero: 'From Madrid to Mexico City — practise real Spanish with the people who speak it every day.',
    good: 'Great for: travel, work in the US or Latin America, DELE prep, or just watching La Casa de Papel without subtitles.',
    faq: [
      { q: 'Is TalkSibi really free for learning Spanish?', a: 'Yes. You can chat with Spanish native speakers, get AI grammar corrections, and play Spanish language games without paying. No trial, no card.' },
      { q: 'Can I learn both Spain Spanish and Latin American Spanish?', a: 'Yes — the community includes native speakers from Spain, Mexico, Argentina, Colombia, Peru, Chile, and beyond. Filter by country in the community tab.' },
      { q: 'How is TalkSibi different from Duolingo for Spanish?', a: 'Duolingo teaches you to translate sentences alone. TalkSibi puts you in real conversation with Spanish speakers, so you actually practise speaking and get corrected by a human — plus AI backup.' },
      { q: 'Do I need to be advanced to use it?', a: 'No. Beginners are welcome — most Spanish speakers on TalkSibi are learning English too, so they\'re patient and will meet you halfway.' }
    ]
  },
  french: {
    name: 'French', nativeName: 'Français', flag: '🇫🇷', code: 'fr',
    speakers: '300 million',
    hero: 'Practise real French with people from Paris, Lyon, Montréal, Dakar, or Brussels — free, on your phone.',
    good: 'Great for: travel, DELF/DALF prep, business French, or finally reading Camus in the original.',
    faq: [
      { q: 'Can I learn French with real French people for free?', a: 'Yes — TalkSibi is a free language-exchange app. Match with French native speakers, chat in text or voice, and get AI corrections when you make a mistake.' },
      { q: 'Do you have Canadian French speakers too?', a: 'Yes. The community includes speakers from France, Québec, Belgium, Switzerland, and French-speaking Africa.' },
      { q: 'How do you correct grammar in my French messages?', a: 'Tap the AI wand under any of your messages — it rewrites your French with proper grammar, gender agreement, and vocabulary, and shows you what changed.' },
      { q: 'What if I only know basic French?', a: 'Perfect starting point. Most French speakers on TalkSibi are learning another language too — many welcome absolute beginners and will switch to English when you\'re stuck.' }
    ]
  },
  german: {
    name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', code: 'de',
    speakers: '135 million',
    hero: 'Practise real German with speakers from Germany, Austria, and Switzerland — Hochdeutsch or Dialekt, your call.',
    good: 'Great for: moving to Berlin, university (TestDaF), engineering jobs, or beating cases + der/die/das forever.',
    faq: [
      { q: 'Is this a free way to learn German?', a: 'Yes. TalkSibi is a free language-exchange community. Practise German with native speakers, get AI grammar corrections, and play word games — no paywall.' },
      { q: 'Can I practise German cases with real speakers?', a: 'Yes — and most native speakers will correct your Akkusativ vs Dativ vs Genitiv patiently, because they\'re usually learning English at the same time.' },
      { q: 'Do Austrian and Swiss speakers count?', a: 'Yes. Filter by country in the community tab if you want specifically Berlin German, Viennese, or Swiss High German.' },
      { q: 'How does AI correction help my German?', a: 'One tap rewrites your message with correct case endings, verb position, and vocabulary — and highlights what changed so you actually learn from it.' }
    ]
  },
  italian: {
    name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', code: 'it',
    speakers: '65 million',
    hero: 'Practise real Italian with speakers from Rome, Milan, Naples, or Palermo — beyond duolingo, into a real conversation.',
    good: 'Great for: travel, learning to cook properly, opera nerds, or moving to Italy for a slower life.',
    faq: [
      { q: 'Where can I learn Italian free with native speakers?', a: 'On TalkSibi. It\'s a free language-exchange app where you match with Italian speakers and practise real conversation, with AI grammar corrections built in.' },
      { q: 'Can I learn regional Italian slang and expressions?', a: 'Yes — because you\'re talking to real people, you pick up the phrases that never make it into textbooks.' },
      { q: 'Do I need to know some Italian first?', a: 'No. Beginners are welcome. Many Italian speakers are learning English too, so they\'ll switch back and forth to help you.' },
      { q: 'Can I practise Italian voice conversation?', a: 'Yes. Send voice notes or start a live voice call once you\'re comfortable. The AI can also transcribe and translate voice notes.' }
    ]
  },
  japanese: {
    name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', code: 'ja',
    speakers: '125 million',
    hero: 'Practise real Japanese with speakers from Tokyo, Osaka, Kyoto, and Fukuoka — hiragana to keigo, at your own pace.',
    good: 'Great for: JLPT prep, anime + manga, working in Japan, or a Golden Week trip that goes beyond konnichiwa.',
    faq: [
      { q: 'Can I learn Japanese free with real native speakers?', a: 'Yes. TalkSibi is a free language-exchange app that matches you with Japanese native speakers for text and voice conversation. AI grammar corrections included.' },
      { q: 'Will AI corrections help with kanji + politeness levels?', a: 'Yes. The AI rewrites your Japanese with correct particles, verb conjugations, and appropriate politeness (keigo / teineigo), and shows you what changed.' },
      { q: 'How do I get Japanese speakers to reply?', a: 'Fill out your profile in both languages, mention what you love about Japan, and message people learning your native language — you\'re trading their time for yours, so both sides win.' },
      { q: 'Is this useful for JLPT prep?', a: 'Real conversation practice is exactly what JLPT-N3 and above rewards. Combine TalkSibi chat with a textbook and you\'ll close the speaking gap that most JLPT prep ignores.' }
    ]
  },
  korean: {
    name: 'Korean', nativeName: '한국어', flag: '🇰🇷', code: 'ko',
    speakers: '80 million',
    hero: 'Practise real Korean with native speakers from Seoul, Busan, and beyond — hangul to honorifics, at your speed.',
    good: 'Great for: TOPIK prep, K-drama fluency, working in Korea, or just having a real conversation with your bias\'s language.',
    faq: [
      { q: 'Can I learn Korean free with real native speakers?', a: 'Yes. TalkSibi matches you with Korean native speakers for chat and voice practice. AI grammar corrections are included at no cost.' },
      { q: 'How do you handle Korean honorifics + polite forms?', a: 'The AI rewrite understands 반말 vs 존댓말 and will nudge you toward the right level for who you\'re talking to.' },
      { q: 'Do I need to know hangul first?', a: 'Learning hangul is the fastest single win in Korean — a weekend of practice. After that, TalkSibi\'s chat, voice notes, and games start clicking.' },
      { q: 'Can I practise Korean with the K-drama vocab I already know?', a: 'Yes — real speakers love when you know current phrases. Bring your K-drama vocab, they\'ll bring their English list, everybody wins.' }
    ]
  },
  english: {
    name: 'English', nativeName: 'English', flag: '🇬🇧', code: 'en',
    speakers: '1.5 billion',
    hero: 'Practise real English with speakers from the UK, US, Canada, Ireland, and Australia — accents, slang, everyday phrases, all in one app.',
    good: 'Great for: IELTS / TOEFL prep, work interviews, moving abroad, or finally understanding what your favourite YouTubers actually said.',
    faq: [
      { q: 'Is this a free way to practise English speaking?', a: 'Yes. TalkSibi is a free language-exchange app. Practise English with native speakers via text, voice notes, or live voice calls — plus AI corrections.' },
      { q: 'Which English accent will I hear?', a: 'All of them. Filter the community by country to focus on British, American, Australian, Irish, or Canadian speakers.' },
      { q: 'Can AI help me sound more natural in English?', a: 'Yes. Tap the wand under any message and the AI rewrites your English to sound more natural — plus explains what changed and why.' },
      { q: 'Is TalkSibi good for IELTS or TOEFL prep?', a: 'Live conversation is exactly what the speaking section rewards. Combine TalkSibi practice with mock tests to close the speaking gap.' }
    ]
  },
  portuguese: {
    name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹', code: 'pt',
    speakers: '260 million',
    hero: 'Practise real Portuguese with speakers from Brazil, Portugal, Angola, and Mozambique — everyday, unfiltered.',
    good: 'Great for: moving to Lisbon, Brazilian samba culture, understanding bossa nova lyrics, or working in Latin America.',
    faq: [
      { q: 'Can I learn Portuguese free with native speakers?', a: 'Yes. TalkSibi is a free language-exchange community. Match with Portuguese native speakers, chat in text or voice, and get AI corrections.' },
      { q: 'European vs Brazilian Portuguese — can I pick?', a: 'Yes. Filter the community by country. Brazilian Portuguese has the biggest speaker community, but Portugal, Angola, and Mozambique are all represented.' },
      { q: 'Do I need to know some Portuguese first?', a: 'No. Beginners welcome. Portuguese speakers on TalkSibi are often learning English, Spanish, or French — so many are patient with beginners.' },
      { q: 'How does AI grammar correction work for Portuguese?', a: 'One tap rewrites your Portuguese with correct verb conjugations, gender agreement, and vocabulary — with a diff showing what changed.' }
    ]
  }
};

const SLUGS = Object.keys(LANGS);

// ── Page renderer ──────────────────────────────────────────────────
function page(slug) {
  const L = LANGS[slug];
  if (!L) return notFound();
  const url = `${SITE}/learn-${slug}`;
  const title = `Learn ${L.name} Online Free with Native Speakers · TalkSibi`;
  const desc = `Practise ${L.name} with real native speakers from around the world. Free language exchange, AI grammar corrections, and word games — all in one app. Join TalkSibi.`;
  // Broad keyword sweep — every phrase people actually search for around
  // "learn X". Google barely uses <meta name=keywords> for ranking any
  // more but the phrase list still helps our internal search + is a
  // useful pointer for the LLM ranking layer that reads llms.txt.
  const kw = [
    `learn ${L.name.toLowerCase()}`,
    `learn ${L.name.toLowerCase()} online`,
    `learn ${L.name.toLowerCase()} free`,
    `learn ${L.name.toLowerCase()} online free`,
    `learn ${L.name.toLowerCase()} with native speakers`,
    `${L.name.toLowerCase()} native speakers`,
    `${L.name.toLowerCase()} conversation partner`,
    `${L.name.toLowerCase()} language exchange`,
    `language exchange ${L.name.toLowerCase()}`,
    `practice ${L.name.toLowerCase()} speaking`,
    `practise ${L.name.toLowerCase()} speaking`,
    `${L.name.toLowerCase()} chat app`,
    `free ${L.name.toLowerCase()} lessons`,
    `${L.name.toLowerCase()} tandem`,
    `${L.name.toLowerCase()} hellotalk`,
    `speak ${L.name.toLowerCase()} online`,
    `talk to ${L.name.toLowerCase()} people online`,
    `AI ${L.name.toLowerCase()} tutor`
  ].join(', ');
  // JSON-LD: Course + FAQPage + WebApplication — three schema types
  // Google actually shows rich snippets for on language landings.
  const schema = `
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Course',
        name: `Learn ${L.name} with Native Speakers`,
        description: desc,
        provider: { '@type': 'Organization', name: 'TalkSibi', url: SITE },
        inLanguage: L.code,
        url,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP', category: 'Free' }
      },
      {
        '@type': 'WebApplication',
        name: 'TalkSibi',
        url: SITE,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Web, iOS, Android',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
        aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', ratingCount: '1240' }
      },
      {
        '@type': 'FAQPage',
        mainEntity: L.faq.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a }
        }))
      }
    ]
  })}</script>`;

  const otherLangs = SLUGS.filter(s => s !== slug).map(s => {
    const O = LANGS[s];
    return `<a href="/learn-${s}"><span class="ll-oflag">${O.flag}</span> ${O.name}</a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en"><head>
${GA}
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="keywords" content="${esc(kw)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#5b6cff">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=23">
<link rel="icon" type="image/png" href="/icon-192.png">
<meta property="og:site_name" content="TalkSibi">
<meta property="og:locale" content="en_GB">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/og-image.png">
${schema}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{font-family:'Hanken Grotesk','Inter',system-ui,sans-serif;background:#fbfbfd;color:#14161f;margin:0;-webkit-font-smoothing:antialiased}
a{color:inherit}
${TS_CHROME_CSS}
.ll-hero{background:linear-gradient(140deg,#f6f4ff 0%,#eef1ff 40%,#e8fbf3 100%);padding:64px 20px 56px;position:relative;overflow:hidden}
@media(min-width:769px){.ll-hero{padding:88px 48px 72px}}
.ll-hero::before{content:'';position:absolute;top:-40%;right:-10%;width:520px;height:520px;background:radial-gradient(circle,rgba(91,108,255,.20),transparent 70%);pointer-events:none}
.ll-hero-inner{position:relative;z-index:1;max-width:1140px;margin:0 auto}
.ll-badge{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid #dce1ff;color:#4353e8;font-size:13px;font-weight:600;padding:7px 14px;border-radius:99px;margin-bottom:18px}
.ll-badge .fl{font-size:16px}
.ll-hero h1{font-weight:700;font-size:44px;line-height:1.1;letter-spacing:-1px;margin:0 0 16px;color:#14161f;max-width:820px}
@media(max-width:600px){.ll-hero h1{font-size:32px}}
.ll-hero .sub{font-size:19px;line-height:1.55;color:#4a4d59;margin:0 0 24px;max-width:680px;font-weight:400}
.ll-hero .good{font-size:15px;color:#5f6675;margin:0 0 28px;max-width:680px;font-weight:500}
.ll-cta{display:inline-flex;align-items:center;gap:10px;background:#5b6cff;color:#fff !important;text-decoration:none;font-weight:700;padding:16px 30px;border-radius:99px;font-size:16px;box-shadow:0 8px 24px rgba(91,108,255,.32);transition:.15s}
.ll-cta:hover{background:#4353e8;transform:translateY(-2px)}
.ll-cta-sub{margin-top:10px;font-size:13px;color:#8a8d99;font-weight:500}
.ll-stats{display:flex;gap:22px;margin-top:38px;flex-wrap:wrap}
.ll-stat b{display:block;font-size:22px;font-weight:700;color:#14161f;line-height:1.1}
.ll-stat span{font-size:13px;color:#5f6675;font-weight:500}
.ll-section{max-width:1140px;margin:0 auto;padding:64px 20px}
@media(min-width:769px){.ll-section{padding:80px 48px}}
.ll-section h2{font-size:32px;font-weight:700;letter-spacing:-.6px;margin:0 0 12px;color:#14161f}
.ll-section .lead{font-size:17px;color:#4a4d59;margin:0 0 32px;max-width:640px;line-height:1.55}
.ll-pillars{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-top:32px}
.ll-pillar{background:#fff;border:1px solid #eceef4;border-radius:20px;padding:26px 22px}
.ll-pillar .ic{font-size:32px;margin-bottom:12px}
.ll-pillar h3{font-size:18px;font-weight:600;margin:0 0 8px;letter-spacing:-.2px;color:#14161f}
.ll-pillar p{margin:0;font-size:14.5px;line-height:1.55;color:#5f6675}
.ll-how{background:#f6f7fb;padding:64px 20px}
@media(min-width:769px){.ll-how{padding:80px 48px}}
.ll-how-inner{max-width:1140px;margin:0 auto}
.ll-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-top:32px;counter-reset:steps}
.ll-step{background:#fff;border-radius:20px;padding:24px;position:relative;padding-left:70px}
.ll-step::before{counter-increment:steps;content:counter(steps);position:absolute;left:22px;top:22px;width:36px;height:36px;background:#5b6cff;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px}
.ll-step h3{font-size:17px;font-weight:600;margin:0 0 6px;letter-spacing:-.2px;color:#14161f}
.ll-step p{margin:0;font-size:14.5px;line-height:1.55;color:#5f6675}
.ll-faq{max-width:820px;margin:0 auto;padding:64px 20px}
@media(min-width:769px){.ll-faq{padding:80px 48px}}
.ll-faq h2{font-size:28px;font-weight:700;letter-spacing:-.5px;margin:0 0 24px;color:#14161f;text-align:center}
.ll-q{background:#fff;border:1px solid #eceef4;border-radius:16px;padding:20px 24px;margin-bottom:12px}
.ll-q summary{font-size:16px;font-weight:600;color:#14161f;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:10px}
.ll-q summary::-webkit-details-marker{display:none}
.ll-q summary::after{content:'+';font-size:22px;color:#5b6cff;font-weight:400;transition:transform .2s}
.ll-q[open] summary::after{transform:rotate(45deg)}
.ll-q p{margin:14px 0 0;color:#4a4d59;font-size:15px;line-height:1.6}
.ll-cta-band{background:linear-gradient(140deg,#5b6cff 0%,#7c5cff 100%);color:#fff;padding:64px 20px;text-align:center}
@media(min-width:769px){.ll-cta-band{padding:80px 48px}}
.ll-cta-band h2{font-size:32px;font-weight:700;letter-spacing:-.6px;margin:0 0 12px;color:#fff}
.ll-cta-band p{margin:0 0 26px;font-size:17px;opacity:.9;max-width:560px;margin-left:auto;margin-right:auto;font-weight:400}
.ll-cta-band a{background:#fff;color:#5b6cff !important;font-weight:700;padding:16px 34px;border-radius:99px;text-decoration:none;display:inline-block;transition:.15s;box-shadow:0 8px 24px rgba(0,0,0,.2)}
.ll-cta-band a:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(0,0,0,.25)}
.ll-other{max-width:1140px;margin:0 auto;padding:36px 20px 72px}
@media(min-width:769px){.ll-other{padding:44px 48px 90px}}
.ll-other h3{font-size:14px;font-weight:600;color:#8a8d99;text-transform:uppercase;letter-spacing:1.2px;margin:0 0 18px;text-align:center}
.ll-other-grid{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.ll-other-grid a{background:#fff;border:1px solid #e4e6ee;color:#14161f;font-weight:600;padding:10px 18px;border-radius:99px;font-size:14px;text-decoration:none;transition:.12s;display:inline-flex;align-items:center;gap:8px}
.ll-other-grid a:hover{border-color:#5b6cff;color:#5b6cff;transform:translateY(-1px)}
.ll-oflag{font-size:16px}
</style></head>
<body>
${TS_NAV}
<section class="ll-hero">
  <div class="ll-hero-inner">
    <span class="ll-badge"><span class="fl">${L.flag}</span> ${L.name} · ${esc(L.nativeName)}</span>
    <h1>Learn ${L.name} online — free, with real native speakers</h1>
    <p class="sub">${esc(L.hero)}</p>
    <p class="good">${esc(L.good)}</p>
    <a class="ll-cta" href="/app">Start practising ${L.name} — it's free →</a>
    <div class="ll-cta-sub">No card required · 18+ · Sign up in 60 seconds</div>
    <div class="ll-stats">
      <div class="ll-stat"><b>${L.speakers}</b><span>${L.name} speakers worldwide</span></div>
      <div class="ll-stat"><b>Free</b><span>Chat, voice, AI corrections</span></div>
      <div class="ll-stat"><b>18+</b><span>Verified community</span></div>
    </div>
  </div>
</section>

<section class="ll-section">
  <h2>Three ways TalkSibi helps you learn ${L.name}</h2>
  <p class="lead">A language app is only as good as the practice it gets you. Here's what you'll actually do on TalkSibi.</p>
  <div class="ll-pillars">
    <div class="ll-pillar">
      <div class="ic">💬</div>
      <h3>Chat with native ${L.name} speakers</h3>
      <p>Match with real people who speak ${L.name} every day. Text, voice notes, or live voice calls — you pick the pace.</p>
    </div>
    <div class="ll-pillar">
      <div class="ic">✨</div>
      <h3>AI ${L.name} grammar corrections</h3>
      <p>Tap the wand under any of your messages. The AI rewrites your ${L.name} with correct grammar and shows what changed — so you actually learn from every mistake.</p>
    </div>
    <div class="ll-pillar">
      <div class="ic">🎮</div>
      <h3>${L.name} word games</h3>
      <p>Word Race, Word Chain, Codenames, Guess Word — six live games designed to sharpen ${L.name} vocab without feeling like homework.</p>
    </div>
  </div>
</section>

<section class="ll-how">
  <div class="ll-how-inner">
    <h2>How to start practising ${L.name} today</h2>
    <p class="lead">Under 60 seconds from tap to first conversation.</p>
    <div class="ll-steps">
      <div class="ll-step">
        <h3>Sign up in seconds</h3>
        <p>Name, date of birth, the languages you speak + the languages you're learning. That's it — no card, no long form.</p>
      </div>
      <div class="ll-step">
        <h3>Meet ${L.name} speakers</h3>
        <p>The community tab shows ${L.name} native speakers online right now. Tap any profile, say hi, start practising.</p>
      </div>
      <div class="ll-step">
        <h3>Use the AI safety net</h3>
        <p>Not sure how to say something in ${L.name}? Type in English and tap translate. Made a mistake? One tap gives you the fix.</p>
      </div>
    </div>
  </div>
</section>

<section class="ll-faq">
  <h2>Learning ${L.name} on TalkSibi — FAQ</h2>
  ${L.faq.map(f => `<details class="ll-q"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}
</section>

<section class="ll-cta-band">
  <h2>Start learning ${L.name} now — free</h2>
  <p>Real ${L.name} speakers. AI corrections. Word games. All in one app, all free.</p>
  <a href="/app">Sign up in 60 seconds →</a>
</section>

<div class="ll-other">
  <h3>Or learn another language</h3>
  <div class="ll-other-grid">${otherLangs}</div>
</div>

${TS_FOOTER_TS}
</body></html>`;
}

function notFound() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Not found · TalkSibi</title></head><body><h1>Not found</h1><p><a href="/">← TalkSibi</a></p></body></html>`;
}

module.exports = { LANGS, SLUGS, page };
