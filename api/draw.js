// Vercel serverless function — proxies prompt to Anthropic API.
// ANTHROPIC_API_KEY must be set as a Vercel environment variable.

const CATEGORIES = ['influence', 'sonic', 'process', 'wildcard'];


function buildSystem(category, profile) {
  const a = (profile.artists     || []).join(', ') || 'none listed';
  const p = (profile.producers   || []).join(', ') || 'none listed';
  const i = (profile.instruments || []).join(', ') || 'none listed';
  switch (category) {
    case 'influence':
      return `You are a creative prompt generator in the spirit of Brian Eno's Oblique Strategies. The user is a musician/producer.\nTheir influences are: ${a}.\nTheir favorite producers are: ${p}.\nTheir instruments are: ${i}.\n\nThe instruments are provided as context only — do not instruct the user to record any specific instrument. Never name any artist, producer, or collaborator directly in the output. The influence should be felt, not cited. Do not suggest processing, filtering, or manipulating silence, absence, or nothing — the result must produce an audible change. Never use the word "then" — the prompt must be a single idea, not a sequence. Do not begin the prompt with the words "Work", "Start", "Begin", or "Try".`;
    case 'sonic':
      return `You are a creative prompt generator in the spirit of Brian Eno's Oblique Strategies. The user is a musician/producer.\nTheir influences are: ${a}.\nTheir favorite producers are: ${p}.`;
    case 'process':
    case 'wildcard':
    default:
      return `You are a creative prompt generator in the spirit of Brian Eno's Oblique Strategies. The user is a musician/producer.`;
  }
}

function buildUser(category) {
  switch (category) {
    case 'influence':
      return `Generate a single influence-based creative prompt that draws on shared collaborators, recording techniques, era, or sonic characteristics you can infer from their influences. Be specific, lateral, and surprising. Never state the obvious. The prompt should be a single oblique idea or observation — not a multi-step instruction. Return only the prompt itself, no setup, no attribution, no explanation. One or two sentences maximum.`;
    case 'sonic':
      return `Generate a single sonic-based creative prompt about texture, space, dynamics, timbre, or frequency. Do not name any artist, producer, or collaborator directly. Do not instruct the user to record any specific instrument. Do not suggest processing, filtering, or manipulating silence, absence, or nothing — the result must produce an audible change. Never use the word "then" — the prompt must be a single idea, not a sequence. Do not begin the prompt with the words "Work", "Start", "Begin", or "Try". The prompt should be a single oblique idea or observation — not a multi-step instruction. Be specific, lateral, and surprising. Never state the obvious. Return only the prompt itself, no setup, no attribution, no explanation. One or two sentences maximum.`;
    case 'process':
      return `Generate a single process-based creative prompt about workflow, decision-making, or creative constraints. Focus on how the user thinks and works — not physical stunts or literal body movements. Do not name any artist, producer, or collaborator. Never use the word "then" — the prompt must be a single idea, not a sequence. Do not begin the prompt with the words "Work", "Start", "Begin", or "Try". Do not suggest processing, filtering, or manipulating silence, absence, or nothing. The prompt should be a single oblique idea — not a multi-step instruction. Be lateral and surprising. Never state the obvious. Return only the prompt itself, no setup, no attribution, no explanation. One or two sentences maximum.`;
    case 'wildcard':
      return `Generate a single wildcard prompt designed to disrupt habitual thinking entirely. It should have little or nothing to do with recording or instruments. It might be a philosophical provocation, an observation about the world, an absurd constraint, or a complete non-sequitur. Do not start with the word "Record". Do not name any artist, producer, or collaborator. Never use the word "then" — the prompt must be a single idea, not a sequence. Do not begin the prompt with the words "Work", "Start", "Begin", or "Try". The prompt should be a single oblique idea. Return only the prompt itself, no setup, no explanation. One or two sentences maximum.`;
    default:
      return `Generate a single oblique creative prompt. One or two sentences maximum.`;
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

  const requestBody = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    temperature: 1.0,
    system: buildSystem(category, profile),
    messages: [{ role: 'user', content: buildUser(category) }],
  };
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
    res.status(502).json({ error: 'Failed to reach Anthropic API.' });
    return;
  }

  const data = await upstream.json();

  if (!upstream.ok) {
    res.status(upstream.status).json({ error: data?.error?.message || 'Anthropic API error.' });
    return;
  }

  const text = data.content?.[0]?.text?.trim() || '';
  res.status(200).json({ text });
};
