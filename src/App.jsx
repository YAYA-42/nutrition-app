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
  const [water, setWater] = useState(() => load('water', 0)) // بالمل (ml)
  const [steps, setSteps] = useState(() => load('steps', 0))
  const [workoutsDone, setWorkoutsDone] = useState(() => load('workoutsDone', []))
  const [waterGoal, setWaterGoal] = useState(() => load('waterGoal', 2500)) // الهدف اليومي بالمل
  const [stepsGoal, setStepsGoal] = useState(() => load('stepsGoal', 6000))
  const [burned, setBurned] = useState(() => load('burned', 0))
  const [weights, setWeights] = useState(() => load('weights', []))
  const [savedRecipes, setSavedRecipes] = useState(() => load('recipes', []))

  // شاتات منفصلة لكل خانة: food (الأكل) / workout (المدرب) / recipes (الطبخ)
  const [threads, setThreads] = useState(() => load('threads', { food: [], workout: [], recipes: [] }))
  const [loading, setLoading] = useState('')  // اسم الخانة اللي تحمّل حالياً
  const [addOpen, setAddOpen] = useState(false) // شيت تسجيل الوجبة

  // ====== تصفير يومي ======
  useEffect(() => {
    const t = todayKey()
    if (day !== t) {
      setDay(t); setMeals([]); setWater(0); setBurned(0); setSteps(0); setWorkoutsDone([])
      save('day', t); save('meals', []); save('water', 0); save('burned', 0); save('steps', 0); save('workoutsDone', [])
    }
  }, [])

  // ====== حفظ تلقائي ======
  useEffect(() => save('profile', profile), [profile])
  useEffect(() => save('goalId', goalId), [goalId])
  useEffect(() => save('meals', meals), [meals])
  useEffect(() => save('water', water), [water])
  useEffect(() => save('burned', burned), [burned])
  useEffect(() => save('steps', steps), [steps])
  useEffect(() => save('workoutsDone', workoutsDone), [workoutsDone])
  useEffect(() => save('waterGoal', waterGoal), [waterGoal])
  useEffect(() => save('stepsGoal', stepsGoal), [stepsGoal])
  useEffect(() => save('weights', weights), [weights])
  useEffect(() => save('recipes', savedRecipes), [savedRecipes])
  useEffect(() => save('threads', threads), [threads])

  // ====== مجاميع ======
  const goal = GOALS.find(g => g.id === goalId) || GOALS[1]
  const target = profile ? calcTarget({ ...profile, goalId }) : 2000
  const totals = meals.reduce((a, m) => ({
    cal: a.cal + (m.cal || 0), p: a.p + (m.p || 0), c: a.c + (m.c || 0), f: a.f + (m.f || 0)
  }), { cal: 0, p: 0, c: 0, f: 0 })
  const net = totals.cal - burned
  const remaining = target - net

  // ====== AI — كل خانة لها شات منفصل ======
  const baseSystem = `أنت مدرب صحي وغذائي ورياضي سعودي ودود، تتكلم باللهجة الخليجية البسيطة وكأنك صديق. هدف المستخدم: ${goal.name}. سعراته المستهدفة: ${target} سعرة يومياً. كن مختصر، عملي، ومحفّز، واسأله لو احتجت توضيح.`

  const SYSTEMS = {
    food: baseSystem + `\nتخصصك هنا: حساب الأكل فقط. إذا ذكر أو صوّر وجبة، احسب السعرات والبروتين والكارب والدهون وأرجع في النهاية سطر: [MEAL]اسم الوجبة|السعرات|البروتين|الكارب|الدهون[/MEAL]. تعرف الأكل السعودي: الكبسة (~٣٠٠ سعرة/كوب)، الجريش، المندي، المعصوب، التمر (~٢٠/حبة).`,
    workout: baseSystem + `\nتخصصك هنا: التمارين فقط. اعطه تمرين/خطة واضحة فيها: اسم كل تمرين، عدد المجموعات والتكرارات، ووزن تقريبي مناسب لمستواه وهدفه، وشرح مختصر للأداء الصحيح. لو احتجت تعرف مستواه أو أدواته (بيت/نادي) اسأله. وفي نهاية ردك، لكل تمرين أعطيته، أضف سطر بالشكل: [EX]اسم التمرين|السعرات المحروقة التقريبية[/EX] (عشان يقدر يثبّتها).`,
    recipes: baseSystem + `\nتخصصك هنا: الوصفات فقط. اسأله وش مشتهي أو وش عنده مكوّنات، واقترح وصفة على ذوقه بمقادير وخطوات وسعرات. أرجع في النهاية سطر: [RECIPE]اسم الوصفة|السعرات للحصة|المقادير مفصولة بفاصلة|الخطوات مفصولة بفاصلة[/RECIPE]`,
  }

  async function sendAI(text, display, ctx = 'food') {
    const isArray = Array.isArray(text)
    if (!isArray && (!text || !text.trim())) return
    if (loading) return
    const userMsg = { role: 'user', content: text, ...(display ? { display } : {}) }
    const prev = threads[ctx] || []
    const newMsgs = [...prev, userMsg]
    const apiMsgs = newMsgs.map(m => ({ role: m.role, content: m.content }))
    setThreads(t => ({ ...t, [ctx]: newMsgs }))
    setLoading(ctx)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: SYSTEMS[ctx], messages: apiMsgs })
      })
      if (!res.ok || !res.body) throw new Error('api')

      // بث مباشر — نعرض النص وهو يكتب
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let reply = ''
      // نظّف الوسوم من العرض الحي
      const clean = (s) => s.replace(/\[(MEAL|RECIPE|EX)\][\s\S]*?(\[\/\1\]|$)/g, '').trim()
      setThreads(t => ({ ...t, [ctx]: [...newMsgs, { role: 'assistant', content: '' }] }))
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        reply += decoder.decode(value, { stream: true })
        const shown = clean(reply)
        setThreads(t => ({ ...t, [ctx]: [...newMsgs, { role: 'assistant', content: shown || '...' }] }))
      }

      // بعد الانتهاء: استخراج الوسوم
      let logItems = null
      const mealMatch = reply.match(/\[MEAL\](.*?)\[\/MEAL\]/s)
      if (mealMatch) {
        const [name, cal, p, c, f] = mealMatch[1].split('|').map(s => s.trim())
        addMeal({ name, cal: +cal || 0, p: +p || 0, c: +c || 0, f: +f || 0 })
      }
      const recMatch = reply.match(/\[RECIPE\](.*?)\[\/RECIPE\]/s)
      if (recMatch) {
        const [name, cal, ing, steps] = recMatch[1].split('|').map(s => s.trim())
        setSavedRecipes(r => [{ name, cal: +cal || 0, ing: ing.split(','), steps: steps.split(','), id: Date.now() }, ...r])
      }
      // تمارين قابلة للتثبيت
      const exMatches = [...reply.matchAll(/\[EX\](.*?)\[\/EX\]/gs)]
      if (exMatches.length) {
        logItems = exMatches.map(mm => {
          const [name, cal] = mm[1].split('|').map(s => s.trim())
          return { name, cal: +cal || 50 }
        })
      }

      setThreads(t => ({ ...t, [ctx]: [...newMsgs, { role: 'assistant', content: clean(reply) || 'تم ✅', ...(logItems ? { logItems } : {}) }] }))
    } catch {
      setThreads(t => ({ ...t, [ctx]: [...newMsgs, { role: 'assistant', content: '⚠️ صار خطأ بالاتصال، حاول مرة ثانية.' }] }))
    }
    setLoading('')
  }

  // تثبيت تمرين اقترحه المدرب
  function logAIWorkout(name, cal) {
    setBurned(b => b + cal)
    const time = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
    setWorkoutsDone(x => [{ name, emoji: '🏋️', cal, time, id: Date.now() }, ...x])
  }

  function clearThread(ctx) { setThreads(t => ({ ...t, [ctx]: [] })) }
  function mealType() {
    const h = new Date().getHours()
    if (h < 11) return 'فطور'; if (h < 16) return 'غداء'; if (h < 21) return 'عشاء'; return 'سناك'
  }
  function addMeal(m) {
    const time = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
    setMeals(x => [{ ...m, id: Date.now(), time, type: m.type || mealType() }, ...x])
  }
  function delMeal(id) { setMeals(x => x.filter(m => m.id !== id)) }
  function editMeal(id, patch) { setMeals(x => x.map(m => m.id === id ? { ...m, ...patch } : m)) }
  function logWorkout(ex, minutes = 20) {
    const w = profile?.weight || 70
    const cal = Math.round((ex.met * 3.5 * w / 200) * minutes)
    setBurned(b => b + cal)
    const time = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
    setWorkoutsDone(x => [{ name: ex.name, emoji: ex.emoji, cal, time, id: Date.now() }, ...x])
    return cal
  }
  function delWorkoutDone(id) {
    setWorkoutsDone(x => {
      const found = x.find(w => w.id === id)
      if (found) setBurned(b => Math.max(0, b - found.cal))
      return x.filter(w => w.id !== id)
    })
  }

  // ====== شاشة البداية: اختيار الهدف والملف ======
  if (!goalId || !profile) {
    return <Onboarding goalId={goalId} setGoalId={setGoalId} setProfile={setProfile} />
  }

  // ====== التطبيق ======
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', paddingBottom: 90, position: 'relative', '--glow': goal.color + '40' }}>
      {/* الهيدر */}
      <div style={{ padding: '20px 18px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: '.5px' }}>هدفك الحالي</div>
          <div style={{ fontSize: 21, fontWeight: 800, marginTop: 1 }}>{goal.emoji} {goal.name}</div>
        </div>
        <button onClick={() => setTab('settings')} style={{ width: 42, height: 42, borderRadius: 13, background: 'var(--card)', border: '1px solid var(--border)', fontSize: 20 }}>⚙️</button>
      </div>

      <div style={{ padding: '0 16px' }}>
        {tab === 'home' && <Home {...{ target, totals, net, burned, remaining, water, setWater, waterGoal, steps, setSteps, stepsGoal, goal, meals, delMeal, editMeal, setTab, profile, workoutsDone, delWorkoutDone, openAdd: () => setAddOpen(true) }} />}
        {tab === 'chat' && <ChatPanel ctx="food" thread={threads.food} loading={loading === 'food'} sendAI={sendAI} clearThread={clearThread} goal={goal} config={CHAT_CONFIG.food} />}
        {tab === 'workout' && <Workout {...{ logWorkout, logAIWorkout, profile, goal, thread: threads.workout, loading: loading === 'workout', sendAI, clearThread }} />}
        {tab === 'recipes' && <Recipes {...{ savedRecipes, setSavedRecipes, goal, thread: threads.recipes, loading: loading === 'recipes', sendAI, clearThread }} />}
        {tab === 'progress' && <Progress {...{ weights, setWeights, profile, setProfile, target, goal, net, totals, burned, steps, stepsGoal, water, waterGoal }} />}
        {tab === 'settings' && <Settings {...{ profile, setProfile, goal, setGoalId, waterGoal, setWaterGoal, stepsGoal, setStepsGoal, target }} />}
      </div>

      {/* شيت تسجيل الوجبة */}
      {addOpen && <AddMealSheet onClose={() => setAddOpen(false)} sendAI={sendAI} addMeal={addMeal} setTab={setTab} goal={goal} />}

      {/* شريط التبويبات العائم */}
      <div style={nav}>
        <div style={navPill}>
          {[
            ['home', '🏠', 'الرئيسية'],
            ['chat', '💬', 'المساعد'],
            ['workout', '🏋️', 'تمارين'],
            ['recipes', '🍳', 'وصفات'],
            ['progress', '📈', 'تقدمي'],
          ].map(([id, ic, lb]) => {
            const on = tab === id
            return (
              <button key={id} onClick={() => setTab(id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  background: on ? goal.color : 'transparent', color: on ? '#fff' : 'var(--muted)',
                  borderRadius: 14, padding: on ? '7px 12px' : '7px 8px', transition: '.2s',
                }}>
                <span style={{ fontSize: 19 }}>{ic}</span>
                {on && <span style={{ fontSize: 10, fontWeight: 700 }}>{lb}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============ شاشة البداية ============
function Onboarding({ goalId, setGoalId, setProfile }) {
  const [step, setStep] = useState(goalId ? 1 : 0)
  const [g, setG] = useState(goalId)
  const [form, setForm] = useState({ weight: '', height: '', age: '', gender: 'male', activity: 1.375, targetWeight: '', weeks: '' })

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

        {/* هدف الوزن والمدة (لغير التثبيت) */}
        {g !== 'maintain' && (
          <div style={{ ...card, background: `${goal.color}11`, border: `1px solid ${goal.color}44` }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>🎯 هدفك</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={lbl}>{g === 'lose' ? 'الوزن المطلوب' : 'الوزن الهدف'} (كجم)</div>
                <input value={form.targetWeight} onChange={e => setForm({ ...form, targetWeight: e.target.value })} type="number" placeholder={g === 'lose' ? 'أقل' : 'أكثر'}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: 'var(--card2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 16 }} />
              </div>
              <div>
                <div style={lbl}>خلال كم أسبوع؟</div>
                <input value={form.weeks} onChange={e => setForm({ ...form, weeks: e.target.value })} type="number" placeholder="مثلاً 12"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: 'var(--card2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 16 }} />
              </div>
            </div>
            {form.targetWeight && form.weight && form.weeks && (
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10, textAlign: 'center', lineHeight: 1.7 }}>
                {(() => {
                  const diff = Math.abs(+form.weight - +form.targetWeight)
                  const perWeek = (diff / +form.weeks).toFixed(2)
                  const safe = perWeek <= 1
                  return <span style={{ color: safe ? '#22c55e' : '#f59e0b' }}>
                    {safe ? '✅' : '⚠️'} {g === 'lose' ? 'تنزل' : 'تزيد'} {perWeek} كجم بالأسبوع
                    {!safe && ' — معدّل سريع، يُفضّل تمدّد المدة'}
                  </span>
                })()}
              </div>
            )}
          </div>
        )}

        <button disabled={!valid} onClick={() => setProfile({ ...form, weight: +form.weight, height: +form.height, age: +form.age, targetWeight: +form.targetWeight || 0, weeks: +form.weeks || 0, startWeight: +form.weight })}
          style={{ ...primaryBtn, background: valid ? goal.color : 'var(--card2)', opacity: valid ? 1 : 0.5, marginTop: 6 }}>
          يلا نبدأ 🚀
        </button>
      </div>
    </div>
  )
}

// ============ الرئيسية (تصميم احترافي) ============
function Home({ target, totals, net, burned, remaining, water, setWater, waterGoal, steps, setSteps, stepsGoal, goal, meals, delMeal, editMeal, setTab, profile, workoutsDone, delWorkoutDone, openAdd }) {
  // أهداف الماكروز التقريبية (% من السعرات)
  const pGoal = Math.round(target * 0.30 / 4)
  const cGoal = Math.round(target * 0.40 / 4)
  const fGoal = Math.round(target * 0.30 / 9)

  // أيام الأسبوع
  const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
  const todayIdx = new Date().getDay()
  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    return { num: d.getDate(), name: days[d.getDay()], today: i === 6 }
  })

  // تجميع الوجبات حسب النوع
  const order = ['فطور', 'غداء', 'عشاء', 'سناك']
  const groups = order.map(t => ({ type: t, items: meals.filter(m => m.type === t) })).filter(g => g.items.length)

  const hr = new Date().getHours()
  const greet = hr < 12 ? 'صباح الخير' : hr < 18 ? 'مساء الخير' : 'مساء الخير'

  return (
    <div className="fade">
      {/* ترحيب + ملخص اليوم */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{greet}! 👋</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>هذا ملخص يومك</div>
      </div>
      <div className="stagger" style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[
          ['🍽️', meals.length, 'وجبات'],
          ['🏋️', workoutsDone.length, 'تمارين'],
          ['🔥', burned, 'محروق'],
          ['👟', steps >= 1000 ? (steps / 1000).toFixed(1) + 'ك' : steps, 'خطوة'],
        ].map(([ic, val, lbl], i) => (
          <div key={i} style={{ flex: 1, ...card, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 18 }}>{ic}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: goal.color }}>{val}</div>
            <div style={{ fontSize: 9, color: 'var(--muted)' }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* شريط أيام الأسبوع */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', marginBottom: 14 }}>
        {weekDays.map((d, i) => (
          <div key={i} style={{
            flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 14,
            background: d.today ? goal.color : 'var(--card)',
            border: `1px solid ${d.today ? goal.color : 'var(--border)'}`,
          }}>
            <div style={{ fontSize: 9, color: d.today ? '#fff' : 'var(--muted)', marginBottom: 2 }}>{d.name.slice(0, 3)}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: d.today ? '#fff' : 'var(--text)' }}>{d.num}</div>
          </div>
        ))}
      </div>

      {/* حلقة الطاقة — القطعة المميزة */}
      <EnergyRing net={net} target={target} totals={totals} burned={burned} remaining={remaining}
        goal={goal} pGoal={pGoal} cGoal={cGoal} fGoal={fGoal} />

      {/* الماء + الخطوات */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        {/* الماء */}
        <WaterCard water={water} setWater={setWater} waterGoal={waterGoal} />
        {/* الخطوات */}
        <div style={{ ...card, textAlign: 'center', padding: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>👟 الخطوات</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#a855f7', marginTop: 14 }}>{steps.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>الهدف {stepsGoal.toLocaleString()}</div>
          <div style={{ height: 8, background: 'var(--card2)', borderRadius: 6, overflow: 'hidden', margin: '10px 0 8px' }}>
            <div style={{ height: '100%', width: `${Math.min(100, steps / stepsGoal * 100)}%`, background: '#a855f7', borderRadius: 6 }} />
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {[1000, 3000].map(s => (
              <button key={s} onClick={() => setSteps(x => x + s)} style={{ flex: 1, padding: '7px 2px', borderRadius: 10, background: '#a855f722', color: '#c084fc', fontSize: 12, fontWeight: 700, border: '1px solid #a855f744' }}>+{s / 1000}ألف</button>
            ))}
          </div>
        </div>
      </div>

      {/* الوجبات مجمّعة حسب النوع */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 17 }}>وجبات اليوم ({meals.length})</span>
        <button onClick={openAdd} style={{ ...chip, background: goal.color, color: '#fff', padding: '6px 12px' }}>+ أضف</button>
      </div>

      {meals.length === 0 && <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
        ما سجّلت وجبات بعد 🍽️<br /><span style={{ fontSize: 13 }}>اضغط "+ أضف" واكتب أو صوّر أكلك</span>
      </div>}

      {groups.map(g => {
        const gt = g.items.reduce((a, m) => a + (m.cal || 0), 0)
        return (
          <div key={g.type} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, padding: '0 4px' }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>{mealEmoji(g.type)} {g.type}</span>
              <span style={{ fontSize: 13, color: goal.color, fontWeight: 700 }}>{gt} سعرة</span>
            </div>
            {g.items.map(m => (
              <MealRow key={m.id} m={m} goal={goal} delMeal={delMeal} editMeal={editMeal} />
            ))}
          </div>
        )
      })}

      {/* تمارين اليوم المنجزة */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 17 }}>🏋️ تمارين اليوم ({workoutsDone.length})</span>
        <button onClick={() => setTab('workout')} style={{ ...chip, background: goal.color, color: '#fff', padding: '6px 12px' }}>+ تمرّن</button>
      </div>
      {workoutsDone.length === 0 && <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
        ما سويت تمارين بعد 💪<br /><span style={{ fontSize: 13 }}>اضغط "+ تمرّن" واختر تمرينك</span>
      </div>}
      {workoutsDone.map(w => (
        <div key={w.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, padding: 12 }} className="pop">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: '#ef444422', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{w.emoji || '🏋️'}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{w.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>🕐 {w.time} · 🔥 {w.cal} سعرة محروقة</div>
            </div>
          </div>
          <button onClick={() => delWorkoutDone(w.id)} style={{ ...chip, padding: '4px 8px' }}>🗑️</button>
        </div>
      ))}
    </div>
  )
}

// صف وجبة قابل للتعديل
function MealRow({ m, goal, delMeal, editMeal }) {
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState({ name: m.name, cal: m.cal, p: m.p, c: m.c, fat: m.f })
  function save() {
    editMeal(m.id, { name: f.name, cal: +f.cal || 0, p: +f.p || 0, c: +f.c || 0, f: +f.fat || 0 })
    setEdit(false)
  }
  if (edit) {
    return (
      <div style={{ ...card, marginBottom: 6, padding: 12, border: `1px solid ${goal.color}` }} className="pop">
        <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="اسم الوجبة"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'var(--card2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 14, marginBottom: 8 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
          {[['cal', 'سعرة'], ['p', 'بروتين'], ['c', 'كارب'], ['fat', 'دهون']].map(([k, l]) => (
            <div key={k}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2, textAlign: 'center' }}>{l}</div>
              <input value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} type="number"
                style={{ width: '100%', padding: '8px 4px', borderRadius: 8, background: 'var(--card2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 13, textAlign: 'center' }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={save} style={{ flex: 1, padding: 9, borderRadius: 10, background: goal.color, color: '#fff', fontWeight: 700, fontSize: 14 }}>✅ حفظ</button>
          <button onClick={() => setEdit(false)} style={{ padding: '9px 16px', borderRadius: 10, background: 'var(--card2)', color: 'var(--muted)', fontSize: 14 }}>إلغاء</button>
        </div>
      </div>
    )
  }
  return (
    <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, padding: 12 }} className="pop">
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{m.name}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {m.time && <span>🕐 {m.time}</span>}
          <span style={{ color: '#ef4444' }}>ب {m.p}g</span>
          <span style={{ color: '#3b82f6' }}>ك {m.c}g</span>
          <span style={{ color: '#22c55e' }}>د {m.f}g</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 800, color: goal.color, fontSize: 16 }}>{m.cal}</span>
        <button onClick={() => { setF({ name: m.name, cal: m.cal, p: m.p, c: m.c, fat: m.f }); setEdit(true) }} style={{ ...chip, padding: '4px 8px' }}>✏️</button>
        <button onClick={() => delMeal(m.id)} style={{ ...chip, padding: '4px 8px' }}>🗑️</button>
      </div>
    </div>
  )
}

// ============ شيت تسجيل وجبة (نص/صوت/صورة/باركود/يدوي) ============
function AddMealSheet({ onClose, sendAI, addMeal, setTab, goal }) {
  const [mode, setMode] = useState('home') // home | manual | barcode
  const [listening, setListening] = useState(false)
  const [status, setStatus] = useState('')
  const fileRef = useRef(null)

  function go(fn) { fn(); }
  function finishToChat(text, content, display) {
    onClose(); setTab('chat')
    if (content) sendAI(content, display, 'food')
    else if (text) setTimeout(() => sendAI(text, undefined, 'food'), 80)
  }

  // ✍️ نص — يفتح شات الأكل
  const goText = () => { onClose(); setTab('chat') }

  // 🎤 صوت — تعرّف على الكلام عربي
  const goVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setStatus('جهازك ما يدعم الإدخال الصوتي — استخدم النص'); return }
    const rec = new SR()
    rec.lang = 'ar-SA'; rec.interimResults = false; rec.maxAlternatives = 1
    setListening(true); setStatus('أتكلم الحين... 🎤')
    rec.onresult = (e) => {
      const txt = e.results[0][0].transcript
      setListening(false)
      finishToChat('أكلت ' + txt)
    }
    rec.onerror = () => { setListening(false); setStatus('ما سمعتك، حاول مرة ثانية') }
    rec.onend = () => setListening(false)
    rec.start()
  }

  // 📷 صورة — كاميرا + تصغير
  const onPhoto = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const max = 1024; let { width, height } = img
        if (width > max || height > max) { const r = Math.min(max / width, max / height); width = Math.round(width * r); height = Math.round(height * r) }
        const cv = document.createElement('canvas'); cv.width = width; cv.height = height
        cv.getContext('2d').drawImage(img, 0, 0, width, height)
        const b64 = cv.toDataURL('image/jpeg', 0.8).split(',')[1]
        finishToChat(null, [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
          { type: 'text', text: 'صوّرت هذا الأكل، احسب لي السعرات والماكروز وسجّلها.' }
        ], '📷 صورت وجبة')
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file); e.target.value = ''
  }

  const sheet = (children) => (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.55)', animation: 'backdropIn .2s ease', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--bg)', borderRadius: '24px 24px 0 0', border: '1px solid var(--border)', borderBottom: 'none', padding: '12px 16px 24px', animation: 'sheetUp .3s cubic-bezier(.2,.8,.2,1)', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 5, background: 'var(--card2)', borderRadius: 3, margin: '0 auto 16px' }} />
        {children}
      </div>
    </div>
  )

  if (mode === 'manual') return sheet(<ManualEntry goal={goal} onAdd={(m) => { addMeal(m); onClose() }} back={() => setMode('home')} />)
  if (mode === 'barcode') return sheet(<BarcodeEntry goal={goal} onAdd={(m) => { addMeal(m); onClose() }} back={() => setMode('home')} />)

  const opt = (emoji, title, sub, color, onClick) => (
    <button onClick={onClick} style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
      <div style={{ width: 50, height: 50, borderRadius: 15, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>{emoji}</div>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</div>
    </button>
  )

  return sheet(<>
    <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 4 }}>سجّل وجبة جديدة</div>
    <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>اختر الطريقة اللي تريحك</div>

    <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{ display: 'none' }} />
    <div className="stagger" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
      {opt('💬', 'نص', 'اكتب وجبتك', '#22c55e', goText)}
      {opt('🎤', 'صوت', 'قول وجبتك', '#ec4899', goVoice)}
      {opt('📷', 'صورة', 'صوّر وجبتك', '#f97316', () => fileRef.current?.click())}
    </div>
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setMode('barcode')} style={{ ...card, width: '100%', padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>▦ باركود المنتج</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>سجّل المنتجات المعلّبة بسرعة</div>
        </div>
        <div style={{ width: 46, height: 46, borderRadius: 14, background: '#6366f122', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>📦</div>
      </button>
    </div>
    <button onClick={() => setMode('manual')} style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 12, background: 'transparent', color: goal.color, fontSize: 14, fontWeight: 700, border: `1px dashed ${goal.color}66` }}>
      ✏️ تعرف القيم الغذائية؟ أدخلها يدوياً
    </button>

    {/* حالة الصوت */}
    {(listening || status) && (
      <div style={{ marginTop: 14, textAlign: 'center', padding: 14, borderRadius: 14, background: 'var(--card)' }}>
        {listening && <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#ec4899', margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, animation: 'micPulse 1.2s infinite' }}>🎤</div>}
        <div style={{ fontSize: 14, color: 'var(--muted)' }}>{status}</div>
      </div>
    )}
  </>)
}

// إدخال يدوي
function ManualEntry({ goal, onAdd, back }) {
  const [f, setF] = useState({ name: '', cal: '', p: '', c: '', fat: '' })
  const valid = f.name && f.cal
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={back} style={{ ...chip, padding: '6px 10px' }}>← رجوع</button>
        <span style={{ fontWeight: 800, fontSize: 18 }}>✏️ إدخال يدوي</span>
      </div>
      <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="اسم الوجبة (مثلاً: شاورما)"
        style={{ width: '100%', padding: '13px 16px', borderRadius: 12, background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 16, marginBottom: 10 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[['cal', 'السعرات 🔥'], ['p', 'بروتين (g)'], ['c', 'كارب (g)'], ['fat', 'دهون (g)']].map(([k, l]) => (
          <div key={k}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{l}</div>
            <input value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} type="number" placeholder="0"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 16 }} />
          </div>
        ))}
      </div>
      <button disabled={!valid} onClick={() => onAdd({ name: f.name, cal: +f.cal || 0, p: +f.p || 0, c: +f.c || 0, f: +f.fat || 0 })}
        style={{ ...primaryBtn, background: valid ? goal.color : 'var(--card2)', opacity: valid ? 1 : 0.5, marginTop: 16 }}>✅ أضف الوجبة</button>
    </>
  )
}

// باركود — بحث في قاعدة OpenFoodFacts المجانية
function BarcodeEntry({ goal, onAdd, back }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  async function lookup() {
    if (!code.trim()) return
    setLoading(true); setErr(''); setResult(null)
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code.trim()}.json`)
      const d = await r.json()
      if (d.status !== 1 || !d.product) { setErr('ما لقيت المنتج — جرّب رقم ثاني أو أدخله يدوياً'); setLoading(false); return }
      const p = d.product
      const n = p.nutriments || {}
      setResult({
        name: p.product_name_ar || p.product_name || 'منتج',
        cal: Math.round(n['energy-kcal_100g'] || n['energy-kcal_serving'] || 0),
        p: Math.round(n.proteins_100g || 0),
        c: Math.round(n.carbohydrates_100g || 0),
        f: Math.round(n.fat_100g || 0),
      })
    } catch { setErr('خطأ بالاتصال، حاول مرة ثانية') }
    setLoading(false)
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={back} style={{ ...chip, padding: '6px 10px' }}>← رجوع</button>
        <span style={{ fontWeight: 800, fontSize: 18 }}>▦ باركود المنتج</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>اكتب رقم الباركود من خلف المنتج (القيم لكل 100 جرام)</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={code} onChange={e => setCode(e.target.value)} type="number" placeholder="مثال: 6281006..." onKeyDown={e => e.key === 'Enter' && lookup()}
          style={{ flex: 1, padding: '13px 16px', borderRadius: 12, background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 16, width: '100%' }} />
        <button onClick={lookup} disabled={loading} style={{ ...primaryBtn, width: 'auto', padding: '0 20px', background: goal.color }}>{loading ? '...' : 'بحث'}</button>
      </div>

      {err && <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: '#ef444422', color: '#fca5a5', fontSize: 13, textAlign: 'center' }}>{err}</div>}

      {result && (
        <div style={{ ...card, marginTop: 14 }} className="pop">
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>📦 {result.name}</div>
          <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: 13, marginBottom: 12 }}>
            <span style={{ color: goal.color, fontWeight: 700 }}>{result.cal} سعرة</span>
            <span style={{ color: '#ef4444' }}>ب {result.p}g</span>
            <span style={{ color: '#3b82f6' }}>ك {result.c}g</span>
            <span style={{ color: '#22c55e' }}>د {result.f}g</span>
          </div>
          <button onClick={() => onAdd(result)} style={{ ...primaryBtn, background: goal.color }}>✅ أضف للوجبات</button>
        </div>
      )}
    </>
  )
}

function mealEmoji(t) { return { 'فطور': '🌅', 'غداء': '🍽️', 'عشاء': '🌙', 'سناك': '🍪' }[t] || '🍴' }

// ============ حلقة الطاقة — القطعة المميزة ============
function EnergyRing({ net, target, totals, burned, remaining, goal, pGoal, cGoal, fGoal }) {
  const pct = Math.max(0, Math.min(100, (net / target) * 100))
  const R = 78, C = 2 * Math.PI * R
  const off = C - (pct / 100) * C
  const left = Math.max(0, remaining)
  const over = net > target
  const gid = 'g-' + goal.id

  return (
    <div className="float-in" style={{
      ...card, padding: '22px 18px 20px', textAlign: 'center', position: 'relative', overflow: 'hidden',
      background: `radial-gradient(120% 90% at 50% -10%, ${goal.color}26, var(--card))`,
      border: `1px solid ${goal.color}33`,
    }}>
      {/* توهّج خلفي نابض */}
      <div style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', width: 220, height: 220, borderRadius: '50%', background: `radial-gradient(circle, ${goal.color}33, transparent 65%)`, animation: 'pulseGlow 3.5s ease-in-out infinite', pointerEvents: 'none' }} />

      {/* الحلقة */}
      <div style={{ position: 'relative', width: 188, height: 188, margin: '0 auto' }}>
        <svg width="188" height="188" style={{ transform: 'rotate(-90deg)', display: 'block' }}>
          <defs>
            <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={goal.color} />
              <stop offset="100%" stopColor={over ? '#ef4444' : '#ffffff'} stopOpacity={over ? 1 : .7} />
            </linearGradient>
            <filter id="glow-f" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <circle cx="94" cy="94" r={R} stroke="var(--card2)" strokeWidth="13" fill="none" opacity=".6" />
          <circle cx="94" cy="94" r={R} stroke={`url(#${gid})`} strokeWidth="13" fill="none"
            strokeDasharray={C} strokeDashoffset={off} strokeLinecap="round" filter="url(#glow-f)"
            style={{ '--circ': C, animation: 'ringDraw 1.1s cubic-bezier(.2,.8,.2,1) both', transition: 'stroke-dashoffset .5s' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '1px' }}>{over ? 'تجاوزت بـ' : 'باقي لك'}</div>
          <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1, color: over ? '#ef4444' : goal.color, animation: 'countUp .5s ease both' }}>
            {over ? net - target : left}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>سعرة · من {target}</div>
        </div>
      </div>

      {/* مأكول / محروق */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 22, marginTop: 6, fontSize: 13 }}>
        <span style={{ color: 'var(--muted)' }}>🍽️ مأكول <b style={{ color: 'var(--text)' }}>{totals.cal}</b></span>
        <span style={{ color: 'var(--muted)' }}>🔥 محروق <b style={{ color: '#ef4444' }}>{burned}</b></span>
      </div>

      {/* حلقات الماكرو الصغيرة */}
      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <MacroRing label="بروتين" val={totals.p} goal={pGoal} color="#ef4444" />
        <MacroRing label="كارب" val={totals.c} goal={cGoal} color="#3b82f6" />
        <MacroRing label="دهون" val={totals.f} goal={fGoal} color="#22c55e" />
      </div>
    </div>
  )
}

// حلقة ماكرو صغيرة
function MacroRing({ label, val, goal, color }) {
  const pct = Math.max(0, Math.min(100, (val / goal) * 100))
  const r = 24, c = 2 * Math.PI * r
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 60, height: 60, margin: '0 auto' }}>
        <svg width="60" height="60" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="30" cy="30" r={r} stroke="var(--card2)" strokeWidth="6" fill="none" />
          <circle cx="30" cy="30" r={r} stroke={color} strokeWidth="6" fill="none"
            strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset .5s' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color }}>{val}</div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{label}</div>
      <div style={{ fontSize: 9, color: 'var(--muted)', opacity: .7 }}>/{goal}g</div>
    </div>
  )
}

// كرت الماء — أرقام بسيطة ونظيفة
function WaterCard({ water, setWater, waterGoal }) {
  const [custom, setCustom] = useState('')
  const add = (ml) => setWater(w => Math.max(0, w + ml))
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, textAlign: 'center' }}>💧 الماء</div>

      {/* الرقم الكبير */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: '#3b82f6' }}>{water}</span>
        <span style={{ fontSize: 15, color: 'var(--muted)' }}> / {waterGoal} مل</span>
      </div>

      {/* أزرار +/- بأرقام */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {[150, 250, 500].map(ml => (
          <button key={ml} onClick={() => add(ml)} style={{ padding: '10px 2px', borderRadius: 12, background: '#3b82f622', color: '#60a5fa', fontSize: 14, fontWeight: 800, border: '1px solid #3b82f644' }}>+{ml}</button>
        ))}
      </div>

      {/* كمية يدوية + تحكم */}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input value={custom} onChange={e => setCustom(e.target.value)} type="number" placeholder="رقم بالمل"
          style={{ flex: 1, padding: '10px 12px', borderRadius: 12, background: 'var(--card2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 14, width: '100%' }} />
        <button onClick={() => { if (+custom) add(+custom); setCustom('') }}
          style={{ padding: '0 18px', borderRadius: 12, background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 700 }}>أضف</button>
      </div>

      {water > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button onClick={() => add(-250)} style={{ flex: 1, padding: 9, borderRadius: 12, background: 'var(--card2)', color: 'var(--muted)', fontSize: 13 }}>− 250</button>
          <button onClick={() => setWater(0)} style={{ flex: 1, padding: 9, borderRadius: 12, background: 'var(--card2)', color: '#ef4444', fontSize: 13 }}>🗑️ صفّر</button>
        </div>
      )}
    </div>
  )
}

// ============ إعدادات كل شات ============
const CHAT_CONFIG = {
  food: {
    icon: '🍽️', title: 'مساعد الأكل', placeholder: 'اكتب وجبتك...',
    welcome: ['سولف معي عن أكلك!', '✍️ اكتب: "أكلت صحن كبسة"', '📷 أو صوّر أكلك وأنا أحسبه'],
    photo: true, photoText: 'صوّرت هذا الأكل، احسب لي السعرات والماكروز وسجّلها.',
    quick: QUICK_MEALS.slice(0, 5).map(q => ['أكلت ' + q, q]),
  },
  workout: {
    icon: '🏋️‍♂️', title: 'المدرب الذكي', placeholder: 'اسأل مدربك...',
    welcome: ['سولف مع مدربك الخاص!', 'قول له وش تبي تمرّن وأدواتك ومستواك', 'ويعطيك خطة وأوزان وتكرارات'],
    photo: false,
    quick: [['سوّ لي تمرين صدر في البيت', '💪 تمرين صدر'], ['أبي جدول تمارين أسبوعي', '📅 جدول أسبوعي'], ['تمارين تنحيف الكرش', '🔥 تنحيف الكرش'], ['تمرين كامل للمبتدئين', '🌱 للمبتدئين']],
  },
  recipes: {
    icon: '👨‍🍳', title: 'مطبخك الذكي', placeholder: 'وش مشتهي؟ أو وش عندك مكوّنات...',
    welcome: ['وش مشتهي اليوم؟', 'قول لي وش نفسك فيه أو إيش عندك مكوّنات', 'وأطبخ لك وصفة على ذوقك'],
    photo: false,
    quick: [['أنا مشتهي بروتين عالي، اقترح وصفة', '🍗 بروتين'], ['نفسي حلى صحي قليل سعرات', '🍰 حلى صحي'], ['وجبة سريعة في 10 دقايق', '⚡ سريعة'], ['وصفة أكل سعودي صحي', '🍚 سعودي']],
  },
}

// ============ شات عام (يستخدم لكل خانة بشكل منفصل) ============
function ChatPanel({ ctx, thread, loading, sendAI, clearThread, goal, config, onLog }) {
  const [logged, setLogged] = useState({})
  const [input, setInput] = useState('')
  const fileRef = useRef(null)
  const scrollRef = useRef(null)
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [thread, loading])

  function send(t) { sendAI(t, undefined, ctx); setInput('') }
  function onPhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      // نصغّر الصورة قبل الإرسال (عشان ما تفشل من الحجم الكبير)
      const img = new Image()
      img.onload = () => {
        const maxDim = 1024
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height)
          width = Math.round(width * ratio); height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        const small = canvas.toDataURL('image/jpeg', 0.8)
        const b64 = small.split(',')[1]
        sendAI([
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
          { type: 'text', text: config.photoText }
        ], '📷 صورت وجبة', ctx)
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div className="fade" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)' }}>
      {/* رأس الشات */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6, borderBottom: '1px solid var(--border)', marginBottom: 6 }}>
        <span style={{ fontWeight: 800 }}>{config.icon} {config.title}</span>
        {thread.length > 0 && <button onClick={() => clearThread(ctx)} style={{ ...chip, padding: '5px 10px', fontSize: 12 }}>🗑️ مسح</button>}
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {thread.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 24 }}>
            <div style={{ fontSize: 44 }}>{config.icon}</div>
            <p style={{ marginTop: 8, fontWeight: 700, color: 'var(--text)' }}>{config.welcome[0]}</p>
            {config.welcome.slice(1).map((w, i) => <p key={i} style={{ fontSize: 13, marginTop: 4 }}>{w}</p>)}
          </div>
        )}
        {thread.map((m, i) => (
          <div key={i} className="pop" style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-start' : 'flex-end', marginBottom: 10 }}>
            <div style={{
              maxWidth: '82%', padding: '10px 14px', borderRadius: 16, lineHeight: 1.7, fontSize: 15,
              background: m.role === 'user' ? goal.color : 'var(--card)',
              color: m.role === 'user' ? '#fff' : 'var(--text)',
              borderBottomRightRadius: m.role === 'user' ? 16 : 4,
              borderBottomLeftRadius: m.role === 'user' ? 4 : 16,
              whiteSpace: 'pre-wrap'
            }}>{typeof m.content === 'string' ? m.content : (m.display || '📷 صورة')}</div>
            {/* أزرار تثبيت التمارين */}
            {m.logItems && onLog && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, width: '82%' }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>💪 ثبّت التمارين:</div>
                {m.logItems.map((it, j) => {
                  const key = i + '-' + j
                  return (
                    <button key={j} onClick={() => { if (!logged[key]) { onLog(it.name, it.cal); setLogged(s => ({ ...s, [key]: true })) } }}
                      style={{ ...card, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'right', background: logged[key] ? '#16a34a22' : 'var(--card)', border: `1px solid ${logged[key] ? '#16a34a' : 'var(--border)'}` }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{logged[key] ? '✅ ' : '🏋️ '}{it.name}</span>
                      <span style={{ fontSize: 12, color: goal.color, fontWeight: 700 }}>{it.cal} سعرة</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ))}
        {loading && <div style={{ textAlign: 'right', color: 'var(--muted)', fontSize: 14, paddingRight: 6 }}>{config.title} يكتب...</div>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 0' }}>
        {config.quick.map(([prompt, label]) => (
          <button key={label} onClick={() => send(prompt)} style={chip}>{label}</button>
        ))}
      </div>

      {config.photo && <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{ display: 'none' }} />}
      <div style={{ display: 'flex', gap: 8, paddingBottom: 8 }}>
        {config.photo && (
          <button onClick={() => fileRef.current?.click()} disabled={loading}
            style={{ ...primaryBtn, width: 52, padding: 0, background: 'var(--card2)', fontSize: 22 }}>📷</button>
        )}
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send(input)}
          placeholder={config.placeholder}
          style={{ flex: 1, padding: '12px 16px', borderRadius: 14, background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 15 }} />
        <button onClick={() => send(input)} disabled={loading}
          style={{ ...primaryBtn, width: 52, padding: 0, background: goal.color, fontSize: 20 }}>➤</button>
      </div>
    </div>
  )
}

// ============ التمارين (مكتبة + مدرب ذكي) ============
function Workout({ logWorkout, logAIWorkout, profile, goal, thread, loading, sendAI, clearThread }) {
  const [view, setView] = useState('coach') // coach | library
  const [muscle, setMuscle] = useState('chest')
  const [place, setPlace] = useState('all')
  const [open, setOpen] = useState(null)
  const [done, setDone] = useState({})

  const ex = EXERCISES[muscle]
  const items = ex.items.filter(i => place === 'all' || i.place === place)

  return (
    <div className="fade">
      {/* تبديل: مدرب / مكتبة */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[['coach', '🧠 المدرب الذكي'], ['library', '📚 مكتبة التمارين']].map(([v, l]) => (
          <button key={v} onClick={() => setView(v)}
            style={{ ...seg, fontSize: 14, ...(view === v ? { background: goal.color, color: '#fff' } : {}) }}>{l}</button>
        ))}
      </div>

      {view === 'coach' && <ChatPanel ctx="workout" thread={thread} loading={loading} sendAI={sendAI} clearThread={clearThread} goal={goal} config={CHAT_CONFIG.workout} onLog={logAIWorkout} />}

      {view === 'library' && <>
      {/* كروت العضلات الملوّنة */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        {Object.entries(EXERCISES).map(([id, m]) => {
          const on = muscle === id
          return (
            <button key={id} onClick={() => { setMuscle(id); setOpen(null) }}
              style={{
                borderRadius: 16, padding: '12px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                background: on ? m.color : `${m.color}1a`,
                border: `1.5px solid ${on ? m.color : m.color + '44'}`,
                color: on ? '#fff' : 'var(--text)', transition: '.2s',
              }}>
              <span style={{ fontSize: 26 }}>{m.emoji}</span>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{m.name}</span>
              <span style={{ fontSize: 9, color: on ? '#ffffffcc' : 'var(--muted)' }}>{m.items.length} تمارين</span>
            </button>
          )
        })}
      </div>

      {/* فلتر المكان */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[['all', 'الكل'], ['home', '🏠 بيت'], ['gym', '🏋️ نادي']].map(([v, l]) => (
          <button key={v} onClick={() => setPlace(v)}
            style={{ ...seg, ...(place === v ? { background: ex.color, color: '#fff', borderColor: ex.color } : {}) }}>{l}</button>
        ))}
      </div>

      {/* عنوان القسم */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '0 4px' }}>
        <span style={{ fontSize: 24 }}>{ex.emoji}</span>
        <span style={{ fontWeight: 800, fontSize: 18 }}>تمارين {ex.name}</span>
      </div>

      {items.length === 0 && <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', padding: 20 }}>ما فيه تمارين {place === 'home' ? 'بيت' : 'نادي'} هنا — جرّب "الكل"</div>}

      {items.map((e, i) => {
        const isOpen = open === e.name
        return (
          <div key={i} style={{ ...card, marginBottom: 8, padding: 0, overflow: 'hidden', borderRight: `4px solid ${ex.color}` }}>
            <div onClick={() => setOpen(isOpen ? null : e.name)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: 14 }}>
              {/* أيقونة التمرين */}
              <div style={{ width: 50, height: 50, borderRadius: 14, background: `${ex.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>
                {e.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{e.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span>🎯 {e.target}</span>
                  <span>{e.place === 'home' ? '🏠 بيت' : '🏋️ نادي'}</span>
                </div>
              </div>
              <span style={{ color: ex.color, fontWeight: 800 }}>{isOpen ? '−' : '+'}</span>
            </div>
            {isOpen && (
              <div className="fade" style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'inline-block', background: `${ex.color}22`, color: ex.color, padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, marginTop: 12 }}>
                  المستوى: {e.level}
                </div>
                <div style={{ fontWeight: 700, fontSize: 13, margin: '12px 0 6px' }}>📋 خطوات الأداء:</div>
                <ol style={{ paddingRight: 18, fontSize: 14, lineHeight: 1.9, color: '#cbd5e1' }}>
                  {e.steps.map((s, j) => <li key={j}>{s}</li>)}
                </ol>
                <div style={{ background: '#f59e0b22', padding: 10, borderRadius: 10, fontSize: 13, marginTop: 10 }}>⚠️ {e.tip}</div>
                <button onClick={() => { const c = logWorkout(e); setDone({ ...done, [e.name]: c }) }}
                  style={{ ...primaryBtn, background: done[e.name] ? '#16a34a' : ex.color, marginTop: 12 }}>
                  {done[e.name] ? `✅ سجّلت (${done[e.name]} سعرة محروقة)` : '🔥 سويته — احسب الحرق'}
                </button>
              </div>
            )}
          </div>
        )
      })}
      </>}
    </div>
  )
}

// ============ الوصفات (شات طبخ منفصل + المحفوظة) ============
function Recipes({ savedRecipes, setSavedRecipes, goal, thread, loading, sendAI, clearThread }) {
  const [view, setView] = useState('chat') // chat | saved
  return (
    <div className="fade">
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[['chat', '👨‍🍳 اطبخ معي'], ['saved', `📒 المحفوظة ${savedRecipes.length ? '(' + savedRecipes.length + ')' : ''}`]].map(([v, l]) => (
          <button key={v} onClick={() => setView(v)}
            style={{ ...seg, fontSize: 14, ...(view === v ? { background: goal.color, color: '#fff' } : {}) }}>{l}</button>
        ))}
      </div>

      {view === 'chat' && <ChatPanel ctx="recipes" thread={thread} loading={loading} sendAI={sendAI} clearThread={clearThread} goal={goal} config={CHAT_CONFIG.recipes} />}

      {view === 'saved' && <>
      {savedRecipes.length === 0 && (
        <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
          ما عندك وصفات محفوظة — روح "اطبخ معي" واطلب وصفة، وتنحفظ هنا تلقائياً 👨‍🍳
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
      </>}
    </div>
  )
}

// ============ التقدم ============
function Progress({ weights, setWeights, profile, setProfile, target, goal, net, totals, burned, steps, stepsGoal, water, waterGoal }) {
  const [w, setW] = useState('')
  function addW() {
    if (!w) return
    const entry = { v: +w, d: todayKey(), id: Date.now() }
    setWeights(x => [entry, ...x.filter(e => e.d !== todayKey())])
    setProfile({ ...profile, weight: +w })
    setW('')
  }
  const start = profile.startWeight || profile.weight
  const change = (profile.weight - start).toFixed(1)
  const up = +change > 0

  return (
    <div className="fade stagger">
      {/* ===== المتابعة اليومية ===== */}
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>📅 متابعتك اليوم</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <DailyStat icon="🔥" label="السعرات" val={net} max={target} unit="" color={goal.color} />
        <DailyStat icon="💧" label="الماء" val={water} max={waterGoal} unit="مل" color="#3b82f6" />
        <DailyStat icon="👟" label="الخطوات" val={steps} max={stepsGoal} unit="" color="#a855f7" />
        <DailyStat icon="🍽️" label="مأكول" val={totals.cal} max={target} unit="" color="#f59e0b" sub={`محروق ${burned}`} />
      </div>

      {/* ===== الوزن الحالي ===== */}
      <div style={{ ...card, marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>الوزن الحالي</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: 38, fontWeight: 800 }}>{profile.weight}</span>
              <span style={{ fontSize: 16, color: 'var(--muted)' }}>كجم</span>
            </div>
            {weights.length > 0 && change !== '0.0' && (
              <div style={{ display: 'inline-block', marginTop: 4, fontSize: 12, fontWeight: 700, color: up ? '#f59e0b' : '#22c55e', background: (up ? '#f59e0b' : '#22c55e') + '22', padding: '2px 10px', borderRadius: 20 }}>
                {up ? '↑' : '↓'} {Math.abs(change)} كجم من البداية
              </div>
            )}
          </div>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: `${goal.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>⚖️</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <input value={w} onChange={e => setW(e.target.value)} placeholder="سجّل وزن جديد" type="number"
            style={{ flex: 1, padding: '12px 14px', borderRadius: 12, background: 'var(--card2)', color: 'var(--text)', border: '1px solid var(--border)', width: '100%' }} />
          <button onClick={addW} style={{ ...primaryBtn, width: 'auto', padding: '0 22px', background: goal.color }}>＋ سجّل</button>
        </div>
      </div>

      {/* هدف الوزن */}
      {profile.targetWeight > 0 && <GoalCard profile={profile} goal={goal} />}

      {/* BMI */}
      <BMICard profile={profile} />

      {/* رسم تطور الوزن (خط منحني) */}
      <WeightChart weights={weights} profile={profile} goal={goal} />
    </div>
  )
}

// بطاقة إحصائية يومية
function DailyStat({ icon, label, val, max, unit, color, sub }) {
  const pct = Math.min(100, max ? (val / max) * 100 : 0)
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{icon} {label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{val >= 1000 ? val.toLocaleString() : val}<span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}> / {max >= 1000 ? (max / 1000).toFixed(1) + 'ك' : max}{unit}</span></div>
      <div style={{ height: 6, background: 'var(--card2)', borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: '.4s' }} />
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 5 }}>🔥 {sub}</div>}
    </div>
  )
}

// رسم بياني منحني لتطور الوزن
function WeightChart({ weights, profile, goal }) {
  const data = [...weights].reverse().slice(-12)
  if (data.length < 2) {
    return (
      <div style={{ ...card, marginTop: 12, textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
        📈 سجّل وزنك أكثر من مرة عشان يطلع لك رسم التطور
      </div>
    )
  }
  const W = 320, H = 140, pad = 24
  const vals = data.map(d => d.v)
  const mn = Math.min(...vals), mx = Math.max(...vals)
  const rng = (mx - mn) || 1
  const x = i => pad + (i / (data.length - 1)) * (W - pad * 2)
  const y = v => pad + (1 - (v - mn) / rng) * (H - pad * 2)
  const pts = data.map((d, i) => [x(i), y(d.v)])
  // مسار منحني ناعم
  let path = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i]
    const mx2 = (px + cx) / 2
    path += ` C ${mx2} ${py}, ${mx2} ${cy}, ${cx} ${cy}`
  }
  const area = path + ` L ${pts[pts.length - 1][0]} ${H - pad} L ${pts[0][0]} ${H - pad} Z`
  return (
    <div style={{ ...card, marginTop: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>📈 تطور الوزن</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={goal.color} stopOpacity=".35" />
            <stop offset="100%" stopColor={goal.color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#wg)" />
        <path d={path} fill="none" stroke={goal.color} strokeWidth="2.5" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p[0]} cy={p[1]} r="3.5" fill={goal.color} />
            <text x={p[0]} y={p[1] - 8} textAnchor="middle" fontSize="9" fill="var(--text)" fontWeight="700">{data[i].v}</text>
            <text x={p[0]} y={H - 8} textAnchor="middle" fontSize="8" fill="var(--muted)">{data[i].d.slice(5)}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ============ بطاقة هدف الوزن ============
function GoalCard({ profile, goal }) {
  const start = profile.startWeight || profile.weight
  const cur = profile.weight
  const tgt = profile.targetWeight
  const totalDiff = Math.abs(start - tgt) || 1
  const doneDiff = Math.abs(start - cur)
  const pct = Math.min(100, Math.round((doneDiff / totalDiff) * 100))
  const remain = Math.abs(cur - tgt).toFixed(1)
  return (
    <div style={{ ...card, marginTop: 12, background: `linear-gradient(135deg, ${goal.color}22, var(--card))` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700 }}>🎯 هدفك</span>
        <span style={{ fontSize: 13, color: goal.color, fontWeight: 700 }}>{pct}% ✓</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
        <span style={{ color: 'var(--muted)' }}>البداية <b style={{ color: 'var(--text)' }}>{start}</b></span>
        <span style={{ color: 'var(--muted)' }}>الحالي <b style={{ color: goal.color }}>{cur}</b></span>
        <span style={{ color: 'var(--muted)' }}>الهدف <b style={{ color: 'var(--text)' }}>{tgt}</b></span>
      </div>
      <div style={{ height: 12, background: 'var(--card2)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${goal.color}, ${goal.color}aa)`, borderRadius: 8, transition: '.4s' }} />
      </div>
      <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>
        باقي لك <b style={{ color: goal.color }}>{remain} كجم</b>
        {profile.weeks > 0 && <span> · المدة {profile.weeks} أسبوع</span>}
      </div>
    </div>
  )
}

// ============ مؤشر كتلة الجسم ============
function BMICard({ profile }) {
  const h = profile.height / 100
  const bmi = h > 0 ? (profile.weight / (h * h)) : 0
  const b = bmi.toFixed(1)
  let cat, col
  if (bmi < 18.5) { cat = 'نحافة'; col = '#3b82f6' }
  else if (bmi < 25) { cat = 'طبيعي'; col = '#22c55e' }
  else if (bmi < 30) { cat = 'زيادة'; col = '#f59e0b' }
  else { cat = 'سمنة'; col = '#ef4444' }
  // موضع المؤشر على المقياس 15-40
  const pos = Math.max(0, Math.min(100, ((bmi - 15) / 25) * 100))
  return (
    <div style={{ ...card, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700 }}>مؤشر كتلة الجسم</span>
        <span><b style={{ fontSize: 22 }}>{b}</b> <span style={{ background: col, color: '#fff', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{cat}</span></span>
      </div>
      <div style={{ position: 'relative', height: 10, borderRadius: 6, background: 'linear-gradient(90deg,#3b82f6 0%,#22c55e 30%,#f59e0b 55%,#ef4444 100%)' }}>
        <div style={{ position: 'absolute', top: -4, left: `${pos}%`, transform: 'translateX(-50%)', width: 4, height: 18, background: '#fff', borderRadius: 3, boxShadow: '0 0 4px rgba(0,0,0,.5)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
        <span>15</span><span>18.5</span><span>25</span><span>30</span><span>40</span>
      </div>
    </div>
  )
}

// ============ الإعدادات ============
function Settings({ profile, setProfile, goal, setGoalId, waterGoal, setWaterGoal, stepsGoal, setStepsGoal, target }) {
  const [editProfile, setEditProfile] = useState(false)
  const [editGoals, setEditGoals] = useState(false)
  const [pf, setPf] = useState({ ...profile })
  const [wg, setWg] = useState(waterGoal)
  const [sg, setSg] = useState(stepsGoal)

  function saveProfile() {
    setProfile({ ...profile, weight: +pf.weight || profile.weight, height: +pf.height || profile.height, age: +pf.age || profile.age, gender: pf.gender, activity: +pf.activity })
    setEditProfile(false)
  }
  function saveGoals() { setWaterGoal(+wg || waterGoal); setStepsGoal(+sg || stepsGoal); setEditGoals(false) }
  function resetToday() {
    if (!confirm('تصفير بيانات اليوم (وجبات، ماء، خطوات، تمارين)؟')) return
    ;['meals', 'water', 'steps', 'burned', 'workoutsDone'].forEach(k => localStorage.setItem(k, JSON.stringify(k === 'meals' || k === 'workoutsDone' ? [] : 0)))
    location.reload()
  }
  function resetAll() {
    if (!confirm('⚠️ مسح كل بياناتك نهائياً والبدء من جديد؟')) return
    localStorage.clear(); location.reload()
  }

  const Section = ({ title, children }) => (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700, marginBottom: 8, paddingRight: 4 }}>{title}</div>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>{children}</div>
    </div>
  )
  const Row = ({ icon, color, title, sub, onClick, danger, last }) => (
    <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: 'transparent', borderBottom: last ? 'none' : '1px solid var(--border)', textAlign: 'right' }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: danger ? '#ef4444' : 'var(--text)' }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{sub}</div>}
      </div>
      <span style={{ color: 'var(--muted)', fontSize: 18 }}>‹</span>
    </button>
  )

  return (
    <div className="fade">
      <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>الإعدادات</div>

      {/* بانر مميز */}
      <div style={{ ...card, marginTop: 14, background: `linear-gradient(135deg, ${goal.color}, ${goal.color}99)`, border: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 32 }}>✦</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>صحّتي — نسختك الكاملة</div>
          <div style={{ fontSize: 12, color: '#ffffffcc' }}>كل المميزات مفتوحة ومجانية 🎉</div>
        </div>
      </div>

      {/* الملف الشخصي */}
      <Section title="الملف الشخصي">
        <Row icon="🎯" color={goal.color} title="تغيير الهدف" sub={`${goal.emoji} ${goal.name}`} onClick={() => setGoalId(null)} />
        {!editProfile ? (
          <Row icon="📊" color="#3b82f6" title="تعديل بياناتك" sub={`${profile.weight}كجم · ${profile.height}سم · ${profile.age}سنة · ${target} سعرة`} onClick={() => { setPf({ ...profile }); setEditProfile(true) }} last />
        ) : (
          <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[['weight', 'وزن'], ['height', 'طول'], ['age', 'عمر']].map(([k, l]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>{l}</div>
                  <input value={pf[k]} onChange={e => setPf({ ...pf, [k]: e.target.value })} type="number" style={{ width: '100%', padding: '10px', borderRadius: 10, background: 'var(--card2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 15, textAlign: 'center' }} />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', margin: '10px 0 4px' }}>النشاط</div>
            <div style={{ display: 'grid', gap: 5 }}>
              {[[1.2, 'قليل'], [1.375, 'خفيف'], [1.55, 'متوسط'], [1.725, 'عالي']].map(([v, l]) => (
                <button key={v} onClick={() => setPf({ ...pf, activity: v })} style={{ ...seg, fontSize: 13, padding: 9, ...(+pf.activity === v ? { background: goal.color, color: '#fff' } : {}) }}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={saveProfile} style={{ flex: 1, ...primaryBtn, background: goal.color }}>حفظ</button>
              <button onClick={() => setEditProfile(false)} style={{ padding: '0 18px', borderRadius: 12, background: 'var(--card2)', color: 'var(--muted)' }}>إلغاء</button>
            </div>
          </div>
        )}
      </Section>

      {/* الأهداف */}
      <Section title="الأهداف اليومية">
        {!editGoals ? <>
          <Row icon="💧" color="#3b82f6" title="هدف الماء" sub={`${waterGoal} مل يومياً`} onClick={() => { setWg(waterGoal); setSg(stepsGoal); setEditGoals(true) }} />
          <Row icon="👟" color="#a855f7" title="هدف الخطوات" sub={`${stepsGoal.toLocaleString()} خطوة يومياً`} onClick={() => { setWg(waterGoal); setSg(stepsGoal); setEditGoals(true) }} />
          <Row icon="❤️" color="#ef4444" title="ربط Apple Health" sub="يحتاج تطبيق آيفون (قريباً)" onClick={() => alert('ربط Apple Health يحتاج النسخة الأصلية على آيفون — قريباً 🍏')} last />
        </> : (
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>💧 هدف الماء (مل)</div>
            <input value={wg} onChange={e => setWg(e.target.value)} type="number" style={{ width: '100%', padding: 11, borderRadius: 10, background: 'var(--card2)', color: 'var(--text)', border: '1px solid var(--border)', marginBottom: 10 }} />
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>👟 هدف الخطوات</div>
            <input value={sg} onChange={e => setSg(e.target.value)} type="number" style={{ width: '100%', padding: 11, borderRadius: 10, background: 'var(--card2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={saveGoals} style={{ flex: 1, ...primaryBtn, background: goal.color }}>حفظ</button>
              <button onClick={() => setEditGoals(false)} style={{ padding: '0 18px', borderRadius: 12, background: 'var(--card2)', color: 'var(--muted)' }}>إلغاء</button>
            </div>
          </div>
        )}
      </Section>

      {/* البيانات */}
      <Section title="البيانات">
        <Row icon="🔄" color="#f59e0b" title="تصفير بيانات اليوم" sub="يبدأ يومك من جديد" onClick={resetToday} />
        <Row icon="🗑️" color="#ef4444" title="مسح كل البيانات" sub="إعادة ضبط كاملة" onClick={resetAll} danger last />
      </Section>

      <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, marginTop: 22 }}>
        صحّتي · الإصدار 1.0 🥗<br />صُنع بحب لك 💚
      </div>
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
const nav = { position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 440, display: 'flex', justifyContent: 'center', padding: '0 16px', zIndex: 50, pointerEvents: 'none' }
const navPill = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, background: 'rgba(24,34,58,.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid var(--border)', borderRadius: 22, padding: 6, boxShadow: '0 10px 30px -8px rgba(0,0,0,.5)', pointerEvents: 'auto' }
