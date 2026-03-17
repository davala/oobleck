// Vercel serverless function — proxies prompt to Anthropic API.
// ANTHROPIC_API_KEY must be set as a Vercel environment variable.

const CATEGORIES = ['influence', 'sonic', 'process', 'wildcard'];

function profileContext(profile) {
  const a = (profile.artists     || []).join(', ') || 'none listed';
  const p = (profile.producers   || []).join(', ') || 'none listed';
  const i = (profile.instruments || []).join(', ') || 'none listed';
  return `The user is a musician/producer.\nTheir influences are: ${a}.\nTheir favorite producers are: ${p}.\nTheir instruments are: ${i}.`;
}

function buildPrompt(category, profile) {
  const ctx  = profileContext(profile);
  const base = `You are a creative prompt generator in the spirit of Brian Eno's Oblique Strategies. ${ctx}\n\n`;
  switch (category) {
    case 'influence':
      return base +
        `Generate a single influence-based creative prompt that references one of their artists or producers, or draws on shared collaborators, recording techniques, or sonic characteristics you can infer from their influences. Be specific, lateral, and surprising. Never state the obvious. Return only the oblique suggestion itself — no setup, no attribution, no explanation of the reference. One or two sentences maximum.`;
    case 'sonic':
      return base +
        `Generate a single sonic-based creative prompt about texture, space, dynamics, timbre, or frequency. Draw on sonic characteristics you can infer from the user's influences but do not name them directly. Be specific, lateral, and surprising. Never state the obvious. Return only the oblique suggestion itself — no setup, no attribution, no explanation. One or two sentences maximum.`;
    case 'process':
      return base +
        `Generate a single process-based creative prompt about workflow, recording technique, constraints, or the physical act of making music. Focus on how the user works, not what it sounds like. Be specific, lateral, and surprising. Never state the obvious. Return only the oblique suggestion itself — no setup, no attribution, no explanation. One or two sentences maximum.`;
    case 'wildcard':
      return `You are a creative prompt generator in the spirit of Brian Eno's Oblique Strategies. The user is a musician/producer.\n\nGenerate a single wildcard creative prompt that has little or nothing to do with music or the user's influences. It should be lateral, surprising, occasionally absurd, and designed to disrupt habitual thinking entirely. It might be an action, an observation, a philosophical provocation, or pure nonsense. Never state the obvious. Return only the oblique suggestion itself — no setup, no attribution, no explanation. One or two sentences maximum.`;
    default:
      return base + `Generate a single oblique creative prompt. One or two sentences maximum.`;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'API key not configured on server.' }); return; }

  let body;
  try {
    body = await readBody(req);
  } catch {
    res.status(400).json({ error: 'Invalid request body.' });
    return;
  }

  const { category, profile } = body;

  if (!CATEGORIES.includes(category)) {
    res.status(400).json({ error: 'Invalid category.' });
    return;
  }
  if (!profile || !Array.isArray(profile.artists)) {
    res.status(400).json({ error: 'Invalid profile.' });
    return;
  }

  const prompt = buildPrompt(category, profile);

  const requestBody = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  };
  console.log('[draw] request body:', JSON.stringify(requestBody));

  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    console.log('[draw] fetch error:', err.message);
    res.status(502).json({ error: 'Failed to reach Anthropic API.' });
    return;
  }

  const data = await upstream.json();
  console.log('[draw] response status:', upstream.status);
  console.log('[draw] response body:', JSON.stringify(data));

  if (!upstream.ok) {
    res.status(upstream.status).json({ error: data?.error?.message || 'Anthropic API error.' });
    return;
  }

  const text = data.content?.[0]?.text?.trim() || '';
  res.status(200).json({ text });
};
