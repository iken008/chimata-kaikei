'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useFiscalYear } from './contexts/FiscalYearContext'
import Header from './components/Header'
import ProtectedRoute from './components/ProtectedRoute'

type Account = {
  id: number
  name: string
  balance: number
}

type Transaction = {
  id: string
  type: string
  amount: number
  description: string
  recorded_at: string
  account_id: number | null
  from_account_id: number | null
  to_account_id: number | null
  users: {
    name: string
  }
}

export default function Home() {
  const { currentFiscalYear, loading: fiscalYearLoading } = useFiscalYear()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [monthlyStats, setMonthlyStats] = useState({ income: 0, expense: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (currentFiscalYear) {
      fetchData()
    }
  }, [currentFiscalYear])

  const fetchData = async () => {
    if (!currentFiscalYear) return

    try {
      // 口座残高を取得
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounts')
        .select('*')
        .order('id')

      if (accountsError) throw accountsError
      setAccounts(accountsData || [])

      // 最近の取引を取得（削除されていない、現在の年度のもの）
      const { data: transactionsData, error: transactionsError } = await supabase
        .from('transactions')
        .select(`
          *,
          users (name)
        `)
        .eq('is_deleted', false)
        .eq('fiscal_year_id', currentFiscalYear.id)
        .order('recorded_at', { ascending: false })
        .limit(5)

      if (transactionsError) throw transactionsError
      setRecentTransactions(transactionsData || [])

      // 今月の収支を計算（現在の年度内で）
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

      const { data: monthlyData, error: monthlyError } = await supabase
        .from('transactions')
        .select('type, amount')
        .eq('is_deleted', false)
        .eq('fiscal_year_id', currentFiscalYear.id)
        .gte('recorded_at', startOfMonth.toISOString())
        .lte('recorded_at', endOfMonth.toISOString())

      if (monthlyError) throw monthlyError

      const stats = (monthlyData || []).reduce(
        (acc, t) => {
          if (t.type === 'income') {
            acc.income += Number(t.amount)
          } else if (t.type === 'expense') {
            acc.expense += Number(t.amount)
          }
          return acc
        },
        { income: 0, expense: 0 }
      )

      setMonthlyStats(stats)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('ja-JP') + '円'
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  const getTransactionDisplay = (transaction: Transaction) => {
    if (transaction.type === 'income') {
      return {
        text: transaction.description,
        amount: `+${formatCurrency(transaction.amount)}`,
        color: 'text-green-600'
      }
    } else if (transaction.type === 'expense') {
      return {
        text: transaction.description,
        amount: `-${formatCurrency(transaction.amount)}`,
        color: 'text-red-600'
      }
    } else {
      const fromAccount = accounts.find(a => a.id === transaction.from_account_id)
      const toAccount = accounts.find(a => a.id === transaction.to_account_id)
      return {
        text: `${transaction.description} (${fromAccount?.name}→${toAccount?.name})`,
        amount: `±${formatCurrency(transaction.amount)}`,
        color: 'text-blue-600'
      }
    }
  }

  const totalBalance = accounts.reduce((sum, account) => sum + Number(account.balance), 0)
  const monthlyBalance = monthlyStats.income - monthlyStats.expense

  if (loading || fiscalYearLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <p className="text-xl text-gray-600">読み込み中...</p>
      </div>
    )
  }

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* ヘッダー */}
      <Header
        title="ちまたの会計 mini"
        subtitle="みんなで見張る、透明な会計"
      />

      {/* メインコンテンツ */}
      <main className="container mx-auto p-4 max-w-4xl">
        {/* 残高表示 */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-100">
          <div className="flex items-center mb-4">
            <span className="text-2xl mr-2">💰</span>
            <h2 className="text-xl font-bold text-gray-800">現在の残高</h2>
          </div>
          <div className="space-y-3">
            {currentFiscalYear && (
              <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-sm text-blue-700 font-semibold mb-1">期首繰越金</p>
                <div className="flex justify-between text-sm">
                  <span>現金: {formatCurrency(Number(currentFiscalYear.starting_balance_cash))}</span>
                  <span>銀行: {formatCurrency(Number(currentFiscalYear.starting_balance_bank))}</span>
                </div>
              </div>
            )}
            {accounts.map((account) => (
              <div key={account.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600 font-medium">{account.name}:</span>
                <span className="text-2xl font-bold text-gray-900">{formatCurrency(Number(account.balance))}</span>
              </div>
            ))}
            <div className="border-t pt-3 mt-3">
              <div className="flex justify-between items-center p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg">
                <span className="text-gray-800 font-bold text-lg">合計:</span>
                <span className="text-3xl font-bold text-indigo-600">
                  {formatCurrency(totalBalance)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 今月の収支 */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-100">
          <div className="flex items-center mb-4">
            <span className="text-2xl mr-2">📊</span>
            <h2 className="text-xl font-bold text-gray-800">今月の収支</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-emerald-50 rounded-lg">
              <p className="text-sm text-emerald-600 font-semibold mb-2">収入</p>
              <p className="text-2xl font-bold text-emerald-600">
                +{formatCurrency(monthlyStats.income)}
              </p>
            </div>
            <div className="text-center p-4 bg-rose-50 rounded-lg">
              <p className="text-sm text-rose-600 font-semibold mb-2">支出</p>
              <p className="text-2xl font-bold text-rose-600">
                -{formatCurrency(monthlyStats.expense)}
              </p>
            </div>
            <div className="text-center p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-indigo-600 font-semibold mb-2">収支</p>
              <p className={`text-2xl font-bold ${
                monthlyBalance >= 0 ? 'text-indigo-600' : 'text-rose-600'
              }`}>
                {monthlyBalance >= 0 ? '+' : ''}
                {formatCurrency(monthlyBalance)}
              </p>
            </div>
          </div>
        </div>

        {/* ナビゲーションボタン */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Link href="/record">
            <button className="bg-gradient-to-br from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white font-bold py-5 px-6 rounded-xl shadow-md hover:shadow-lg transition transform hover:scale-105 w-full">
              <span className="text-3xl block mb-1">📝</span>
              <span className="text-sm">記録</span>
            </button>
          </Link>
          <Link href="/ledger">
            <button className="bg-gradient-to-br from-violet-400 to-purple-500 hover:from-violet-500 hover:to-purple-600 text-white font-bold py-5 px-6 rounded-xl shadow-md hover:shadow-lg transition transform hover:scale-105 w-full">
              <span className="text-3xl block mb-1">📊</span>
              <span className="text-sm">帳簿</span>
            </button>
          </Link>
          <Link href="/history">
            <button className="bg-gradient-to-br from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white font-bold py-5 px-6 rounded-xl shadow-md hover:shadow-lg transition transform hover:scale-105 w-full">
              <span className="text-3xl block mb-1">🔍</span>
              <span className="text-sm">履歴</span>
            </button>
          </Link>
        </div>

        {/* 最近の取引 */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center mb-4">
            <span className="text-2xl mr-2">🕐</span>
            <h2 className="text-xl font-bold text-gray-800">最近の取引</h2>
          </div>
          {recentTransactions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">まだ取引がありません</p>
          ) : (
            <div className="space-y-3">
              {recentTransactions.map((transaction) => {
                const display = getTransactionDisplay(transaction)
                return (
                  <div
                    key={transaction.id}
                    className="flex justify-between items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                  >
                    <div>
                      <p className="font-semibold text-gray-800">{display.text}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {formatDate(transaction.recorded_at)} - {transaction.users.name}
                      </p>
                    </div>
                    <span className={`font-bold text-lg ${display.color}`}>
                      {display.amount}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
    </ProtectedRoute>
  )
}