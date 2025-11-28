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
  const { currentFiscalYear, loading: fiscalYearLoading, isPastYear } = useFiscalYear()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [monthlyStats, setMonthlyStats] = useState({ income: 0, expense: 0 })
  const [yearlyStats, setYearlyStats] = useState({ income: 0, expense: 0 })
  const [loading, setLoading] = useState(true)
  const [storageUsage, setStorageUsage] = useState<{ used: number; limit: number; percentage: number } | null>(null)

  useEffect(() => {
    if (fiscalYearLoading) {
      // FiscalYearContextの読み込み中は何もしない
      return
    }

    if (currentFiscalYear) {
      fetchData()
      checkStorageUsage()
    } else {
      // currentFiscalYearがない場合（ログインしていない場合）もloadingをfalseに
      setLoading(false)
    }
  }, [currentFiscalYear, fiscalYearLoading])

  const checkStorageUsage = async () => {
    try {
      // receiptsバケットのファイル一覧を取得
      const { data: files, error } = await supabase.storage
        .from('receipts')
        .list()

      if (error) {
        console.error('Error fetching storage files:', error)
        return
      }

      // 総ファイルサイズを計算（バイト）
      const totalSize = files?.reduce((sum, file) => sum + (file.metadata?.size || 0), 0) || 0

      // Supabase無料プランのストレージ制限: 1GB = 1,073,741,824バイト
      const storageLimit = 1073741824
      const usagePercentage = (totalSize / storageLimit) * 100

      setStorageUsage({
        used: totalSize,
        limit: storageLimit,
        percentage: usagePercentage
      })
    } catch (error) {
      console.error('Error checking storage:', error)
    }
  }

  const fetchData = async () => {
    if (!currentFiscalYear) return

    try {
      // 口座情報（名前のみ）を取得
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounts')
        .select('id, name')
        .order('id')

      if (accountsError) throw accountsError

      // 当年度の全取引を取得して残高を計算
      const { data: allTransactions, error: txError } = await supabase
        .from('transactions')
        .select('type, amount, account_id, from_account_id, to_account_id')
        .eq('is_deleted', false)
        .eq('fiscal_year_id', currentFiscalYear.id)

      if (txError) throw txError

      // 各口座の残高を計算（期首残高 + 取引合計）
      const accountBalances = (accountsData || []).map(account => {
        let balance = 0

        // 期首残高を設定
        if (account.id === 1) { // 現金
          balance = typeof currentFiscalYear.starting_balance_cash === 'number'
            ? currentFiscalYear.starting_balance_cash
            : 0
        } else if (account.id === 2) { // 銀行
          balance = typeof currentFiscalYear.starting_balance_bank === 'number'
            ? currentFiscalYear.starting_balance_bank
            : 0
        }

        // 当年度の取引を集計
        (allTransactions || []).forEach(tx => {
          const amount = +tx.amount // 数値に変換

          if (tx.type === 'income' && tx.account_id === account.id) {
            balance += amount
          } else if (tx.type === 'expense' && tx.account_id === account.id) {
            balance -= amount
          } else if (tx.type === 'transfer') {
            if (tx.from_account_id === account.id) {
              balance -= amount
            }
            if (tx.to_account_id === account.id) {
              balance += amount
            }
          }
        })

        return {
          id: account.id,
          name: account.name,
          balance: balance
        }
      })

      setAccounts(accountBalances)

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

      // 年度全体の収支を計算（allTransactionsから）
      const yearlyStatsCalc = (allTransactions || []).reduce(
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

      setYearlyStats(yearlyStatsCalc)
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
  const yearlyBalance = yearlyStats.income - yearlyStats.expense

  // 過去年度か現在年度かで表示するデータを切り替え
  const displayStats = isPastYear ? yearlyStats : monthlyStats
  const displayBalance = isPastYear ? yearlyBalance : monthlyBalance

  if (loading || fiscalYearLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        isPastYear
          ? 'bg-gradient-to-br from-gray-200 to-gray-300'
          : 'bg-gradient-to-br from-gray-50 to-gray-100'
      }`}>
        <p className="text-xl text-gray-600">読み込み中...</p>
      </div>
    )
  }

  return (
    <ProtectedRoute>
    <div className={`min-h-screen ${
      isPastYear
        ? 'bg-gradient-to-br from-gray-200 to-gray-300'
        : 'bg-gradient-to-br from-gray-50 to-gray-100'
    }`}>
      {/* ヘッダー */}
      <Header
        title="ちまたの会計 mini"
        subtitle="みんなで見張る、透明な会計"
      />

      {/* メインコンテンツ */}
      <main className="container mx-auto p-4 max-w-4xl">
        {/* ストレージ容量警告 */}
        {storageUsage && storageUsage.percentage >= 80 && (
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6 rounded-r-lg">
            <div className="flex items-start">
              <span className="text-2xl mr-3">⚠️</span>
              <div className="flex-1">
                <h3 className="font-bold text-amber-800 mb-1">ストレージ容量が不足しています</h3>
                <p className="text-sm text-amber-700 mb-2">
                  現在の使用量: {(storageUsage.used / 1024 / 1024).toFixed(2)} MB / {(storageUsage.limit / 1024 / 1024).toFixed(0)} MB
                  （{storageUsage.percentage.toFixed(1)}%）
                </p>
                <div className="text-sm text-amber-700 bg-amber-100 p-3 rounded">
                  <p className="font-semibold mb-1">💡 データ整理の手順：</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>古い年度のデータを<strong>アーカイブ（エクスポート）</strong></li>
                    <li>アーカイブ後、不要な年度を削除</li>
                  </ol>
                  <p className="mt-2 text-xs">※ 年度管理ページからエクスポート・削除が可能です</p>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* 残高表示 */}
        <div className={`rounded-xl shadow-md p-6 mb-6 border ${
          isPastYear
            ? 'bg-gray-100 border-gray-200'
            : 'bg-white border-gray-100'
        }`}>
          <div className="flex items-center mb-4">
            <span className="text-2xl mr-2">💰</span>
            <h2 className="text-xl font-bold text-gray-800">
              {isPastYear ? `${currentFiscalYear?.name}の残高` : '現在の残高'}
            </h2>
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
              <div key={account.id} className="flex justify-between items-center p-2 md:p-3 bg-gray-50 rounded-lg">
                <span className="text-sm md:text-base text-gray-600 font-medium">{account.name}:</span>
                <span className="text-lg md:text-2xl font-bold text-gray-900">{formatCurrency(Number(account.balance))}</span>
              </div>
            ))}
            <div className="border-t pt-2 md:pt-3 mt-2 md:mt-3">
              <div className="flex justify-between items-center p-2 md:p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg">
                <span className="text-gray-800 font-bold text-base md:text-lg">合計:</span>
                <span className="text-xl md:text-3xl font-bold text-indigo-600">
                  {formatCurrency(totalBalance)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 今月の収支 */}
        <div className={`rounded-xl shadow-md p-4 sm:p-6 mb-6 border ${
          isPastYear
            ? 'bg-gray-100 border-gray-200'
            : 'bg-white border-gray-100'
        }`}>
          <div className="flex items-center mb-4">
            <span className="text-xl sm:text-2xl mr-2">📊</span>
            <h2 className="text-lg sm:text-xl font-bold text-gray-800">
              {isPastYear ? `${currentFiscalYear?.name}の収支` : '今月の収支'}
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className="text-center p-2 sm:p-4 bg-emerald-50 rounded-lg">
              <p className="text-xs sm:text-sm text-emerald-600 font-semibold mb-1 sm:mb-2">収入</p>
              <p className="text-sm sm:text-2xl font-bold text-emerald-600">
                +{formatCurrency(displayStats.income)}
              </p>
            </div>
            <div className="text-center p-2 sm:p-4 bg-rose-50 rounded-lg">
              <p className="text-xs sm:text-sm text-rose-600 font-semibold mb-1 sm:mb-2">支出</p>
              <p className="text-sm sm:text-2xl font-bold text-rose-600">
                -{formatCurrency(displayStats.expense)}
              </p>
            </div>
            <div className="text-center p-2 sm:p-4 bg-indigo-50 rounded-lg">
              <p className="text-xs sm:text-sm text-indigo-600 font-semibold mb-1 sm:mb-2">収支</p>
              <p className={`text-sm sm:text-2xl font-bold ${
                displayBalance >= 0 ? 'text-indigo-600' : 'text-rose-600'
              }`}>
                {displayBalance >= 0 ? '+' : ''}
                {formatCurrency(displayBalance)}
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
        <div className={`rounded-xl shadow-md p-6 border ${
          isPastYear
            ? 'bg-gray-100 border-gray-200'
            : 'bg-white border-gray-100'
        }`}>
          <div className="flex items-center mb-4">
            <span className="text-2xl mr-2">🕐</span>
            <h2 className="text-xl font-bold text-gray-800">
              {isPastYear ? '過去の取引' : '最近の取引'}
            </h2>
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