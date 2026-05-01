'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import Image from 'next/image'

// ─── Types ───────────────────────────────────────────────────────────────────
interface Expense {
  id: string
  user_id: string
  item_name: string
  cost: number
  expense_date: string
  created_at: string
}

interface UserInfo {
  id: string
  name: string
  avatarUrl: string | null
  email: string
}

interface Props {
  user: UserInfo
  initialExpenses: Expense[]
  initialError: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatCurrency(amount: number) {
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getMonthLabel(year: number, month: number) {
  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function getTodayISO() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function DashboardClient({ user, initialExpenses, initialError }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses)
  const [error, setError] = useState<string | null>(initialError)
  const [adding, setAdding] = useState(false)
  const [newItem, setNewItem] = useState('')
  const [newCost, setNewCost] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  // Inline edit state
  const [editId, setEditId] = useState<string | null>(null)
  const [editItem, setEditItem] = useState('')
  const [editCost, setEditCost] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ─── Selected Month State (NEW) ───────────────────────────────────────────
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1) // 1-12

  const todayISO = getTodayISO()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const isCurrentMonth = selectedYear === currentYear && selectedMonth === currentMonth

  // ─── Month Navigation (NEW) ───────────────────────────────────────────────
  const goToPrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12)
      setSelectedYear(y => y - 1)
    } else {
      setSelectedMonth(m => m - 1)
    }
  }

  const goToNextMonth = () => {
    // Don't go beyond current month
    if (isCurrentMonth) return
    if (selectedMonth === 12) {
      setSelectedMonth(1)
      setSelectedYear(y => y + 1)
    } else {
      setSelectedMonth(m => m + 1)
    }
  }

  // ─── Monthly Summary (UPDATED to use selectedMonth) ───────────────────────
  const { monthLabel, monthTotal } = useMemo(() => {
    const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`
    const monthExpenses = expenses.filter(e => e.expense_date.startsWith(monthStr))
    const total = monthExpenses.reduce((sum, e) => sum + Number(e.cost), 0)
    const label = getMonthLabel(selectedYear, selectedMonth)
    return { monthLabel: label, monthTotal: total }
  }, [expenses, selectedYear, selectedMonth])

  // ─── Group expenses by date (UPDATED to filter by selectedMonth) ──────────
  const groupedExpenses = useMemo(() => {
    const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`
    const filtered = expenses.filter(e => e.expense_date.startsWith(monthStr))

    const groups: Record<string, Expense[]> = {}
    for (const exp of filtered) {
      if (!groups[exp.expense_date]) groups[exp.expense_date] = []
      groups[exp.expense_date].push(exp)
    }
    const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a))
    return sortedDates.map(date => ({ date, items: groups[date] }))
  }, [expenses, selectedYear, selectedMonth])

  // ─── Logout ───────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  // ─── Add Expense ──────────────────────────────────────────────────────────
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError(null)

    if (!newItem.trim()) { setAddError('Please enter an item name.'); return }
    const cost = parseFloat(newCost)
    if (isNaN(cost) || cost <= 0) { setAddError('Please enter a valid cost.'); return }

    setAdding(true)
    const { data, error: insertError } = await supabase
      .from('expenses')
      .insert({ user_id: user.id, item_name: newItem.trim(), cost })
      .select()
      .single()

    if (insertError) {
      setAddError(insertError.message)
    } else if (data) {
      setExpenses(prev => [data, ...prev])
      setNewItem('')
      setNewCost('')
    }
    setAdding(false)
  }

  // ─── Delete Expense ───────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setError(null)
    const { error: deleteError } = await supabase.from('expenses').delete().eq('id', id)
    if (deleteError) {
      setError(deleteError.message)
    } else {
      setExpenses(prev => prev.filter(e => e.id !== id))
    }
    setDeletingId(null)
  }

  // ─── Edit Expense ─────────────────────────────────────────────────────────
  const startEdit = (exp: Expense) => {
    setEditId(exp.id)
    setEditItem(exp.item_name)
    setEditCost(String(exp.cost))
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditId(null)
    setEditItem('')
    setEditCost('')
    setEditError(null)
  }

  const handleSaveEdit = async (id: string) => {
    setEditError(null)
    if (!editItem.trim()) { setEditError('Item name cannot be empty.'); return }
    const cost = parseFloat(editCost)
    if (isNaN(cost) || cost <= 0) { setEditError('Please enter a valid cost.'); return }

    setSavingEdit(true)
    const { data, error: updateError } = await supabase
      .from('expenses')
      .update({ item_name: editItem.trim(), cost })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      setEditError(updateError.message)
    } else if (data) {
      setExpenses(prev => prev.map(e => (e.id === id ? data : e)))
      cancelEdit()
    }
    setSavingEdit(false)
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="font-bold text-gray-800 text-base">Expense Tracker</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {user.avatarUrl ? (
                <Image
                  src={user.avatarUrl}
                  alt={user.name}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              ) : (
                <div className="w-8 h-8 bg-green-200 rounded-full flex items-center justify-center text-green-800 font-semibold text-sm">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-sm text-gray-700 font-medium hidden sm:block">{user.name}</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* ── Monthly Summary with Navigation (UPDATED) ──────────────────── */}
        <div className="bg-green-50 border border-green-100 rounded-2xl px-5 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-green-600 font-medium uppercase tracking-wide">
                {isCurrentMonth ? 'This Month' : 'Viewing Month'}
              </p>
              <p className="text-lg font-bold text-green-800 mt-0.5">{monthLabel}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Total Spent</p>
              <p className="text-2xl font-bold text-green-700 mt-0.5">{formatCurrency(monthTotal)}</p>
            </div>
          </div>

          {/* ── Month Navigation Arrows (NEW) ── */}
          <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-green-100">
            <button
              onClick={goToPrevMonth}
              className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 bg-green-100 hover:bg-green-200 px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              ← Prev
            </button>
            {!isCurrentMonth && (
              <button
                onClick={() => { setSelectedMonth(currentMonth); setSelectedYear(currentYear) }}
                className="text-xs text-green-600 hover:text-green-800 underline"
              >
                Back to Current
              </button>
            )}
            <button
              onClick={goToNextMonth}
              disabled={isCurrentMonth}
              className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 bg-green-100 hover:bg-green-200 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              Next →
            </button>
          </div>
        </div>

        {/* ── Global Error ───────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* ── Add Expense Form (only shown for current month) ────────────── */}
        {isCurrentMonth && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Add Expense</h2>
            <form onSubmit={handleAddExpense} className="space-y-3">
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Item name"
                  value={newItem}
                  onChange={e => setNewItem(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                />
                <div className="relative w-36">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input
                    type="number"
                    placeholder="0"
                    min="0"
                    step="0.01"
                    value={newCost}
                    onChange={e => setNewCost(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                  />
                </div>
              </div>
              {addError && <p className="text-red-500 text-xs">{addError}</p>}
              <button
                type="submit"
                disabled={adding}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
              >
                {adding ? 'Adding…' : '+ Add Expense'}
              </button>
            </form>
          </div>
        )}

        {/* ── Expense List ───────────────────────────────────────────────── */}
        {groupedExpenses.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
            <p className="text-gray-400 text-sm">
              {isCurrentMonth ? 'No expenses yet. Add your first one above!' : 'No expenses recorded for this month.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedExpenses.map(({ date, items }) => {
              const isToday = date === todayISO
              const dayTotal = items.reduce((sum, e) => sum + Number(e.cost), 0)

              return (
                <div key={date} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* Date heading */}
                  <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                    <span className="text-sm font-semibold text-gray-700">{formatDate(date)}</span>
                    {isToday && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Today</span>
                    )}
                  </div>

                  {/* Expenses */}
                  <div className="divide-y divide-gray-50">
                    {items.map(exp => (
                      <div key={exp.id} className="px-5 py-3">
                        {editId === exp.id ? (
                          /* ── Inline Edit Row ── */
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={editItem}
                                onChange={e => setEditItem(e.target.value)}
                                className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                              />
                              <div className="relative w-28">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={editCost}
                                  onChange={e => setEditCost(e.target.value)}
                                  className="w-full border border-gray-200 rounded-lg pl-6 pr-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                                />
                              </div>
                            </div>
                            {editError && <p className="text-red-500 text-xs">{editError}</p>}
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveEdit(exp.id)}
                                disabled={savingEdit}
                                className="text-xs bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
                              >
                                {savingEdit ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── Normal Row ── */
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-gray-800 flex-1">{exp.item_name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-800">{formatCurrency(Number(exp.cost))}</span>
                              {isToday && isCurrentMonth && (
                                <>
                                  <button
                                    onClick={() => startEdit(exp)}
                                    className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDelete(exp.id)}
                                    disabled={deletingId === exp.id}
                                    className="text-xs text-white bg-red-500 hover:bg-red-600 disabled:bg-red-300 px-2 py-1 rounded-lg transition-colors"
                                  >
                                    {deletingId === exp.id ? '…' : 'Delete'}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Daily total */}
                  <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-xs text-gray-500 font-medium">Day Total</span>
                    <span className="text-sm font-bold text-gray-700">{formatCurrency(dayTotal)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}