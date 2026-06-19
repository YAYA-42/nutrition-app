import { createClient } from '@supabase/supabase-js'

const URL = 'https://jqqnlvrmfooxxjmlccsg.supabase.co'
const KEY = 'sb_publishable_fRwE83TEq6O8xKtnVNNSHQ_7pCIb0Hr'

export const supabase = createClient(URL, KEY)

// المفاتيح اللي تنحفظ بالسحابة
const SYNC_KEYS = [
  'profile', 'goalId', 'meals', 'water', 'steps', 'burned', 'weights',
  'recipes', 'threads', 'workoutsDone', 'waterGoal', 'stepsGoal', 'aiMemory', 'lang', 'day',
]

// يجمع بيانات التطبيق من localStorage في كائن واحد
export function collectLocalData() {
  const data = {}
  SYNC_KEYS.forEach(k => {
    const v = localStorage.getItem(k)
    if (v !== null) data[k] = v
  })
  return data
}

// يكتب بيانات السحابة في localStorage
export function applyData(data) {
  if (!data) return
  Object.entries(data).forEach(([k, v]) => {
    if (SYNC_KEYS.includes(k) && v != null) localStorage.setItem(k, v)
  })
}

// يرفع البيانات للسحابة
export async function pushData(userId) {
  const payload = collectLocalData()
  const { error } = await supabase
    .from('user_data')
    .upsert({ user_id: userId, payload, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  return error
}

// يجيب البيانات من السحابة
export async function pullData(userId) {
  const { data, error } = await supabase
    .from('user_data')
    .select('payload')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return { error }
  return { payload: data?.payload || null }
}
