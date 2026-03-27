import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('*')
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })

  return (
    <DashboardClient
      user={{
        id: user.id,
        name: user.user_metadata?.full_name ?? user.email ?? 'User',
        avatarUrl: user.user_metadata?.avatar_url ?? null,
        email: user.email ?? '',
      }}
      initialExpenses={expenses ?? []}
      initialError={error?.message ?? null}
    />
  )
}
