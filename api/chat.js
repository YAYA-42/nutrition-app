// ====== Backend آمن — بث مباشر (streaming) من Claude AI ======
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'مفتاح الـ AI غير مضبوط في Vercel.' })
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
        stream: true,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    })

    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      return res.status(500).json({ error: err.error?.message || 'فشل الاتصال بالـ AI' })
    }

    // نبثّ النص للعميل قطعة قطعة
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    if (res.flushHeaders) res.flushHeaders()

    const reader = r.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        const t = line.trim()
        if (t.startsWith('data:')) {
          const payload = t.slice(5).trim()
          if (payload === '[DONE]') continue
          try {
            const data = JSON.parse(payload)
            if (data.type === 'content_block_delta' && data.delta?.text) {
              res.write(data.delta.text)
            }
          } catch { /* تجاهل أسطر غير مكتملة */ }
        }
      }
    }
    res.end()
  } catch (e) {
    if (!res.headersSent) return res.status(500).json({ error: 'خطأ: ' + e.message })
    res.end()
  }
}
