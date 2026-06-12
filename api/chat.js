// ====== Backend آمن — ينادي Claude AI بدون كشف المفتاح ======
// يشتغل تلقائياً على Vercel كـ Serverless Function

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'مفتاح الـ AI غير مضبوط. أضف ANTHROPIC_API_KEY في إعدادات Vercel.' })
  }

  try {
    const { system, messages } = req.body

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    })

    const data = await r.json()
    if (data.error) {
      return res.status(500).json({ error: data.error.message })
    }

    const reply = data.content?.[0]?.text || 'ما وصلني رد'
    return res.status(200).json({ reply })
  } catch (e) {
    return res.status(500).json({ error: 'خطأ في الاتصال بالـ AI: ' + e.message })
  }
}
