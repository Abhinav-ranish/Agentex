const STRUCTURING_PROMPT = `You are a resume parser. Given the raw text extracted from a resume document, extract and return a JSON object with this exact structure. Return ONLY valid JSON, no markdown or explanation.

{
  "contact": { "name": "", "email": "", "phone": "", "location": "", "linkedin": "", "website": "" },
  "summary": "",
  "experience": [{ "title": "", "company": "", "location": "", "startDate": "", "endDate": "", "description": "", "highlights": [""] }],
  "education": [{ "institution": "", "degree": "", "field": "", "startDate": "", "endDate": "", "gpa": "", "highlights": [""] }],
  "skills": { "technical": [""], "soft": [""], "languages": [""] },
  "certifications": [{ "name": "", "issuer": "", "date": "" }],
  "projects": [{ "name": "", "description": "", "technologies": [""], "url": "" }]
}

Rules:
- Extract all information present. Leave empty strings for missing fields.
- For highlights, break descriptions into bullet points where appropriate.
- For skills, categorize into technical, soft, and languages.
- Dates should be kept in their original format.
- Return empty arrays [] for sections with no data.`;

async function structureWithAI(rawText, provider, apiKey, modelId) {
  const userMessage = `Here is the raw text extracted from a resume:\n\n${rawText}`;

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: STRUCTURING_PROMPT + '\n\n' + userMessage }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return JSON.parse(text);
  }

  if (provider === 'claude') {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modelId, max_tokens: 4096, system: STRUCTURING_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text;
    return JSON.parse(extractJson(text));
  }

  if (provider === 'groq' || provider === 'openrouter') {
    const baseUrl = provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
    const resp = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'system', content: STRUCTURING_PROMPT }, { role: 'user', content: userMessage }],
        response_format: { type: 'json_object' }
      })
    });
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content;
    return JSON.parse(text);
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

function extractJson(text) {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) return jsonMatch[1].trim();
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return text;
}

module.exports = { structureWithAI };
