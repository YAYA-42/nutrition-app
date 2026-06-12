import { useState, useEffect, useRef } from 'react'
import { GOALS, EXERCISES, QUICK_MEALS } from './data.js'

// ====== أدوات الحفظ ======
const todayKey = () => new Date().toISOString().slice(0, 10)
const load = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def } catch { return def } }
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v))

// ====== حساب الاحتياج اليومي (BMR + TDEE) ======
function calcTarget({ weight, height, age, gender, activity, goalId }) {
  if (!weight || !height || !age) return 2000
  // معادلة Mifflin-St Jeor
  let bmr = 10 * weight + 6.25 * height - 5 * age + (gender === 'male' ? 5 : -161)
  const tdee = bmr * activity
  const goal = GOALS.find(g => g.id === goalId)
  return Math.round(tdee + (goal?.adjust || 0))
}

export default function App() {
  // ====== الحالة ======
  const [tab, setTab] = useState('home')
  const [profile, setProfile] = useState(() => load('profile', null))
  const [goalId, setGoalId] = useState(() => load('goalId', null))
  const [day, setDay] = useState(() => load('day', todayKey()))

  const [meals, setMeals] = useState(() => load('meals', []))
  const [water, setWater] = useState(() => load('water', 0))
  const [burned, setBurned] = useState(() => load('burned', 0))
  const [weights, setWeights] = useState(() => load('weights', []))
  const [savedRecipes, setSavedRecipes] = useState(() => load('recipes', []))

  const [messages, setMessages] = useState(() => load('messages', []))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const chatRef = useRef(null)

  // ====== تصفير يومي ======
  useEffect(() => {
    const t = todayKey()
    if (day !== t) {
      setDay(t); setMeals([]); setWater(0); setBurned(0)
      save('day', t); save('meals', []); save('water', 0); save('burned', 0)
    }
  }, [])

  // ====== حفظ تلقائي ======
  useEffect(() => save('profile', profile), [profile])
  useEffect(() => save('goalId', goalId), [goalId])
  useEffect(() => save('meals', meals), [meals])
  useEffect(() => save('water', water), [water])
  useEffect(() => save('burned', burned), [burned])
  useEffect(() => save('weights', weights), [weights])
  useEffect(() => save('recipes', savedRecipes), [savedRecipes])
  useEffect(() => save('messages', messages), [messages])
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [messages, loading])

  // ====== مجاميع ======
  const goal = GOALS.find(g => g.id === goalId) || GOALS[1]
  const target = profile ? calcTarget({ ...profile, goalId }) : 2000
  const totals = meals.reduce((a, m) => ({
    cal: a.cal + (m.cal || 0), p: a.p + (m.p || 0), c: a.c + (m.c || 0), f: a.f + (m.f || 0)
  }), { cal: 0, p: 0, c: 0, f: 0 })
  const net = totals.cal - burned
  const remaining = target - net

  // ====== AI ======
  async function sendAI(text) {
    if (!text.trim() || loading) return
    const userMsg = { role: 'user', content: text }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs); setInput(''); setLoading(true)

    const system = `أنت مدرب صحي وغذائي سعودي ودود تتكلم باللهجة الخليجية البسيطة. هدف المستخدم: ${goal.name}. سعراته المستهدفة: ${target} سعرة يومياً.

مهامك:
1. إذا ذكر المستخدم وجبة أكلها، احسب السعرات والبروتين والكارب والدهون وأرجع سطر خاص في النهاية بالشكل: [MEAL]اسم الوجبة|السعرات|البروتين|الكارب|الدهون[/MEAL]
2. تعرف الأكل السعودي والخليجي: الكبسة (~٣٠٠ سعرة/كوب)، الجريش، المندي، المطازيز، المعصوب، القهوة العربية، التمر (~٢٠ سعرة/حبة).
3. إذا طلب وصفة، أعطها بمقادير وخطوات وسعرات، وأرجع سطر: [RECIPE]اسم الوصفة|السعرات للحصة|المقادير مفصولة بفاصلة|الخطوات مفصولة بفاصلة[/RECIPE]
4. راعِ رمضان والولائم والعادات السعودية.
5. كن مختصر ومحفّز وعملي.`

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system, messages: newMsgs })
      })
      if (!res.ok) throw new Error('api')
      const data = await res.json()
      let reply = data.reply || 'ما وصلني رد، حاول مرة ثانية'

      // استخراج الوجبة
      const mealMatch = reply.match(/\[MEAL\](.*?)\[\/MEAL\]/s)
      if (mealMatch) {
        const [name, cal, p, c, f] = mealMatch[1].split('|').map(s => s.trim())
        addMeal({ name, cal: +cal || 0, p: +p || 0, c: +c || 0, f: +f || 0 })
        reply = reply.replace(mealMatch[0], '').trim()
      }
      // استخراج الوصفة
      const recMatch = reply.match(/\[RECIPE\](.*?)\[\/RECIPE\]/s)
      if (recMatch) {
        const [name, cal, ing, steps] = recMatch[1].split('|').map(s => s.trim())
        setSavedRecipes(r => [{ name, cal: +cal || 0, ing: ing.split(','), steps: steps.split(','), id: Date.now() }, ...r])
        reply = reply.replace(recMatch[0], '').trim()
      }

      setMessages([...newMsgs, { role: 'assistant', content: reply }])
    } catch {
      setMessages([...newMsgs, { role: 'assistant', content: '⚠️ المساعد الذكي يحتاج نشر التطبيق على الإنترنت أول (موجود في دليل التشغيل). باقي المميزات كلها تشتغل!' }])
    }
    setLoading(false)
  }

  function addMeal(m) { setMeals(x => [{ ...m, id: Date.now() }, ...x]) }
  function delMeal(id) { setMeals(x => x.filter(m => m.id !== id)) }
  function logWorkout(ex, minutes = 20) {
    const w = profile?.weight || 70
    const cal = Math.round((ex.met * 3.5 * w / 200) * minutes)
    setBurned(b => b + cal)
    return cal
  }

  // ====== شاشة البداية: اختيار الهدف والملف ======
  if (!goalId || !profile) {
    return <Onboarding goalId={goalId} setGoalId={setGoalId} setProfile={setProfile} />
  }

  // ====== التطبيق ======
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', paddingBottom: 76, position: 'relative' }}>
      {/* الهيدر */}
      <div style={{ padding: '18px 16px 12px', background: `linear-gradient(135deg, ${goal.color}22, transparent)` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>هدفك الحالي</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{goal.emoji} {goal.name}</div>
          </div>
          <button onClick={() => { setGoalId(null) }} style={chip}>تغيير</button>
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        {tab === 'home' && <Home {...{ target, totals, net, burned, remaining, water, setWater, goal, meals, delMeal }} />}
        {tab === 'chat' && <Chat {...{ messages, input, setInput, loading, sendAI, chatRef }} />}
        {tab === 'workout' && <Workout {...{ logWorkout, profile }} />}
        {tab === 'recipes' && <Recipes {...{ savedRecipes, setSavedRecipes, sendAI }} />}
        {tab === 'progress' && <Progress {...{ weights, setWeights, profile, setProfile, target, goal }} />}
      </div>

      {/* شريط التبويبات */}
      <div style={nav}>
        {[
          ['home', '🏠', 'الرئيسية'],
          ['chat', '💬', 'المساعد'],
          ['workout', '🏋️', 'تمارين'],
          ['recipes', '🍳', 'وصفات'],
          ['progress', '📈', 'تقدمي'],
        ].map(([id, ic, lb]) => (
          <button key={id} onClick={() => setTab(id)} style={{ ...navBtn, color: tab === id ? goal.color : 'var(--muted)' }}>
            <span style={{ fontSize: 22 }}>{ic}</span>
            <span style={{ fontSize: 10, fontWeight: 700 }}>{lb}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ============ شاشة البداية ============
function Onboarding({ goalId, setGoalId, setProfile }) {
  const [step, setStep] = useState(goalId ? 1 : 0)
  const [g, setG] = useState(goalId)
  const [form, setForm] = useState({ weight: '', height: '', age: '', gender: 'male', activity: 1.375 })

  if (step === 0) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 24, minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', marginTop: 30, marginBottom: 30 }} className="fade">
          <div style={{ fontSize: 56 }}>🥗</div>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>صحّتي</h1>
          <p style={{ color: 'var(--muted)', marginTop: 6 }}>مساعدك الغذائي الذكي — وش هدفك؟</p>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {GOALS.map((goal, i) => (
            <button key={goal.id} onClick={() => { setG(goal.id); setGoalId(goal.id); setStep(1) }}
              className="fade" style={{
                ...card, textAlign: 'right', display: 'flex', alignItems: 'center', gap: 14,
                borderRight: `4px solid ${goal.color}`, animationDelay: `${i * 0.05}s`
              }}>
              <span style={{ fontSize: 34 }}>{goal.emoji}</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{goal.name}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{goal.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const goal = GOALS.find(x => x.id === g)
  const valid = form.weight && form.height && form.age
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24, minHeight: '100vh' }}>
      <div style={{ textAlign: 'center', marginTop: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 44 }}>{goal.emoji}</div>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>معلوماتك</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>عشان نحسب احتياجك اليومي بدقة</p>
      </div>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="الوزن (كجم)" value={form.weight} onChange={v => setForm({ ...form, weight: v })} />
        <Field label="الطول (سم)" value={form.height} onChange={v => setForm({ ...form, height: v })} />
        <Field label="العمر" value={form.age} onChange={v => setForm({ ...form, age: v })} />
        <div>
          <div style={lbl}>الجنس</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['male', 'ذكر 👨'], ['female', 'أنثى 👩']].map(([v, l]) => (
              <button key={v} onClick={() => setForm({ ...form, gender: v })}
                style={{ ...seg, ...(form.gender === v ? { background: goal.color, color: '#fff' } : {}) }}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={lbl}>نشاطك اليومي</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {[[1.2, 'قليل جداً (مكتبي)'], [1.375, 'خفيف (تمرين بسيط)'], [1.55, 'متوسط (3-5 أيام)'], [1.725, 'عالي (يومي)']].map(([v, l]) => (
              <button key={v} onClick={() => setForm({ ...form, activity: v })}
                style={{ ...seg, fontSize: 13, ...(form.activity === v ? { background: goal.color, color: '#fff' } : {}) }}>{l}</button>
            ))}
          </div>
        </div>
        <button disabled={!valid} onClick={() => setProfile({ ...form, weight: +form.weight, height: +form.height, age: +form.age })}
          style={{ ...primaryBtn, background: valid ? goal.color : 'var(--card2)', opacity: valid ? 1 : 0.5, marginTop: 6 }}>
          يلا نبدأ 🚀
        </button>
      </div>
    </div>
  )
}

// ============ الرئيسية ============
function Home({ target, totals, net, burned, remaining, water, setWater, goal, meals, delMeal }) {
  const pct = Math.min(100, (net / target) * 100)
  return (
    <div className="fade">
      {/* حلقة السعرات */}
      <div style={{ ...card, textAlign: 'center', padding: 20 }}>
        <Ring value={net} max={target} color={goal.color} />
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 16 }}>
          <Stat label="مأكول" value={totals.cal} />
          <Stat label="محروق" value={burned} color="#ef4444" />
          <Stat label="متبقي" value={remaining > 0 ? remaining : 0} color={goal.color} />
        </div>
      </div>

      {/* الماكروز */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 12 }}>
        <Macro label="بروتين" value={totals.p} unit="g" color="#22c55e" />
        <Macro label="كارب" value={totals.c} unit="g" color="#f59e0b" />
        <Macro label="دهون" value={totals.f} unit="g" color="#ef4444" />
      </div>

      {/* الماء */}
      <div style={{ ...card, marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontWeight: 700 }}>💧 الماء</span>
          <span style={{ color: 'var(--muted)', fontSize: 14 }}>{water} / 8 أكواب</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <button key={i} onClick={() => setWater(i < water ? i : i + 1)}
              style={{ flex: 1, height: 36, borderRadius: 8, fontSize: 18, background: i < water ? '#3b82f6' : 'var(--card2)', transition: '.2s' }}>
              {i < water ? '💧' : ''}
            </button>
          ))}
        </div>
      </div>

      {/* الوجبات */}
      <div style={{ marginTop: 16, marginBottom: 8, fontWeight: 700, fontSize: 16 }}>وجبات اليوم</div>
      {meals.length === 0 && <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
        ما سجّلت وجبات بعد — روح للمساعد 💬 وقول وش أكلت
      </div>}
      {meals.map(m => (
        <div key={m.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }} className="pop">
          <div>
            <div style={{ fontWeight: 700 }}>{m.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>ب {m.p}g · ك {m.c}g · د {m.f}g</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 800, color: goal.color }}>{m.cal}</span>
            <button onClick={() => delMeal(m.id)} style={{ ...chip, padding: '4px 8px' }}>🗑️</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============ المحادثة ============
function Chat({ messages, input, setInput, loading, sendAI, chatRef }) {
  return (
    <div className="fade" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)' }}>
      <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 30 }}>
            <div style={{ fontSize: 44 }}>💬</div>
            <p style={{ marginTop: 8 }}>قول لي وش أكلت وأحسبها لك!</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>مثال: "أكلت صحن كبسة دجاج"</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className="pop" style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-start' : 'flex-end', marginBottom: 10 }}>
            <div style={{
              maxWidth: '80%', padding: '10px 14px', borderRadius: 16, lineHeight: 1.6, fontSize: 15,
              background: m.role === 'user' ? 'var(--accent2)' : 'var(--card)',
              borderBottomRightRadius: m.role === 'user' ? 16 : 4,
              borderBottomLeftRadius: m.role === 'user' ? 4 : 16,
              whiteSpace: 'pre-wrap'
            }}>{m.content}</div>
          </div>
        ))}
        {loading && <div style={{ textAlign: 'center', color: 'var(--muted)' }}>... يكتب</div>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 0' }}>
        {QUICK_MEALS.slice(0, 5).map(q => (
          <button key={q} onClick={() => sendAI('أكلت ' + q)} style={chip}>{q}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, paddingBottom: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendAI(input)}
          placeholder="اكتب وجبتك أو سؤالك..."
          style={{ flex: 1, padding: '12px 16px', borderRadius: 14, background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 15 }} />
        <button onClick={() => sendAI(input)} disabled={loading}
          style={{ ...primaryBtn, width: 52, padding: 0, background: 'var(--accent)' }}>➤</button>
      </div>
    </div>
  )
}

// ============ التمارين ============
function Workout({ logWorkout, profile }) {
  const [muscle, setMuscle] = useState('chest')
  const [place, setPlace] = useState('all')
  const [open, setOpen] = useState(null)
  const [done, setDone] = useState({})

  const ex = EXERCISES[muscle]
  const items = ex.items.filter(i => place === 'all' || i.place === place)

  return (
    <div className="fade">
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 0', marginBottom: 4 }}>
        {Object.entries(EXERCISES).map(([id, m]) => (
          <button key={id} onClick={() => setMuscle(id)}
            style={{ ...chip, whiteSpace: 'nowrap', ...(muscle === id ? { background: 'var(--accent)', color: '#000' } : {}) }}>
            {m.emoji} {m.name}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[['all', 'الكل'], ['home', '🏠 بيت'], ['gym', '🏋️ نادي']].map(([v, l]) => (
          <button key={v} onClick={() => setPlace(v)}
            style={{ ...seg, ...(place === v ? { background: 'var(--card2)', color: '#fff' } : {}) }}>{l}</button>
        ))}
      </div>

      {items.map((e, i) => (
        <div key={i} style={{ ...card, marginBottom: 8 }}>
          <div onClick={() => setOpen(open === e.name ? null : e.name)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{e.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{e.target} · {e.level} · {e.place === 'home' ? '🏠' : '🏋️'}</div>
            </div>
            <span style={{ color: 'var(--muted)' }}>{open === e.name ? '▲' : '▼'}</span>
          </div>
          {open === e.name && (
            <div className="fade" style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>خطوات الأداء:</div>
              <ol style={{ paddingRight: 18, fontSize: 14, lineHeight: 1.9, color: '#cbd5e1' }}>
                {e.steps.map((s, j) => <li key={j}>{s}</li>)}
              </ol>
              <div style={{ background: '#f59e0b22', padding: 10, borderRadius: 10, fontSize: 13, marginTop: 10 }}>⚠️ {e.tip}</div>
              <button onClick={() => { const c = logWorkout(e); setDone({ ...done, [e.name]: c }) }}
                style={{ ...primaryBtn, background: done[e.name] ? '#16a34a' : 'var(--accent)', marginTop: 12 }}>
                {done[e.name] ? `✅ سجّلت (${done[e.name]} سعرة)` : 'سويته ✓'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ============ الوصفات ============
function Recipes({ savedRecipes, setSavedRecipes, sendAI }) {
  return (
    <div className="fade">
      <div style={{ ...card, background: 'linear-gradient(135deg, #16a34a33, transparent)', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>🍳 اطلب وصفة سعودية</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['كبسة صحية', 'فطور بروتين', 'سلطة خفيفة', 'حلى دايت', 'شوربة'].map(r => (
            <button key={r} onClick={() => sendAI('أعطني وصفة ' + r)} style={chip}>{r}</button>
          ))}
        </div>
      </div>

      {savedRecipes.length === 0 && (
        <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
          ما عندك وصفات محفوظة — اطلب وحدة من فوق أو من المساعد 💬
        </div>
      )}
      {savedRecipes.map(r => (
        <div key={r.id} style={{ ...card, marginBottom: 8 }} className="pop">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{r.name}</div>
            <span style={{ background: 'var(--accent2)', padding: '3px 10px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>{r.cal} سعرة</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 10, color: 'var(--muted)' }}>المقادير:</div>
          <ul style={{ paddingRight: 18, fontSize: 14, lineHeight: 1.8 }}>{r.ing.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 8, color: 'var(--muted)' }}>الطريقة:</div>
          <ol style={{ paddingRight: 18, fontSize: 14, lineHeight: 1.8 }}>{r.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
          <button onClick={() => setSavedRecipes(s => s.filter(x => x.id !== r.id))} style={{ ...chip, marginTop: 8 }}>🗑️ حذف</button>
        </div>
      ))}
    </div>
  )
}

// ============ التقدم ============
function Progress({ weights, setWeights, profile, setProfile, target, goal }) {
  const [w, setW] = useState('')
  function addW() {
    if (!w) return
    const entry = { v: +w, d: todayKey(), id: Date.now() }
    setWeights(x => [entry, ...x.filter(e => e.d !== todayKey())])
    setProfile({ ...profile, weight: +w })
    setW('')
  }
  const max = Math.max(...weights.map(e => e.v), profile.weight, 1)
  const min = Math.min(...weights.map(e => e.v), profile.weight)
  const range = max - min || 1

  return (
    <div className="fade">
      <div style={{ ...card }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>📊 احتياجك اليومي</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: goal.color }}>{target} <span style={{ fontSize: 16, color: 'var(--muted)' }}>سعرة</span></div>
      </div>

      <div style={{ ...card, marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>⚖️ سجّل وزنك</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={w} onChange={e => setW(e.target.value)} placeholder={`الحالي: ${profile.weight} كجم`} type="number"
            style={{ flex: 1, padding: '12px 14px', borderRadius: 12, background: 'var(--card2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
          <button onClick={addW} style={{ ...primaryBtn, width: 'auto', padding: '0 20px', background: goal.color }}>حفظ</button>
        </div>
      </div>

      {weights.length > 0 && (
        <div style={{ ...card, marginTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 14 }}>تطور الوزن</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
            {[...weights].reverse().slice(-10).map(e => (
              <div key={e.id} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ background: goal.color, borderRadius: 6, height: `${20 + ((e.v - min) / range) * 80}%`, minHeight: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 2, fontSize: 10, fontWeight: 700 }}>{e.v}</div>
                <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>{e.d.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============ مكونات صغيرة ============
function Ring({ value, max, color }) {
  const pct = Math.min(100, (value / max) * 100)
  const r = 70, c = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: 180, height: 180, margin: '0 auto' }}>
      <svg width="180" height="180" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="90" cy="90" r={r} stroke="var(--card2)" strokeWidth="14" fill="none" />
        <circle cx="90" cy="90" r={r} stroke={color} strokeWidth="14" fill="none"
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} strokeLinecap="round" style={{ transition: 'stroke-dashoffset .5s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ fontSize: 34, fontWeight: 800 }}>{value}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>من {max} سعرة</div>
      </div>
    </div>
  )
}
function Stat({ label, value, color }) {
  return <div><div style={{ fontSize: 20, fontWeight: 800, color: color || 'var(--text)' }}>{value}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div></div>
}
function Macro({ label, value, unit, color }) {
  return <div style={{ ...card, textAlign: 'center', padding: 12 }}>
    <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}<span style={{ fontSize: 12 }}>{unit}</span></div>
    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
  </div>
}
function Field({ label, value, onChange }) {
  return <div><div style={lbl}>{label}</div>
    <input value={value} onChange={e => onChange(e.target.value)} type="number" placeholder="..."
      style={{ width: '100%', padding: '13px 16px', borderRadius: 12, background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 16 }} />
  </div>
}

// ============ ستايلات ============
const card = { background: 'var(--card)', borderRadius: 18, padding: 16, border: '1px solid var(--border)', boxShadow: '0 8px 24px -16px rgba(0,0,0,.6)' }
const chip = { background: 'var(--card)', color: 'var(--text)', padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, border: '1px solid var(--border)' }
const seg = { flex: 1, padding: '11px', borderRadius: 12, background: 'var(--card)', color: 'var(--muted)', fontWeight: 600, border: '1px solid var(--border)' }
const lbl = { fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }
const primaryBtn = { width: '100%', padding: '14px', borderRadius: 14, color: '#fff', fontSize: 16, fontWeight: 700 }
const nav = { position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, display: 'flex', justifyContent: 'space-around', background: 'rgba(15,23,42,.85)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderTop: '1px solid var(--border)', padding: '8px 0 12px', zIndex: 50 }
const navBtn = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', flex: 1 }
