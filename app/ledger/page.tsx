'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useFiscalYear } from '../contexts/FiscalYearContext'
import Header from '../components/Header'
import Image from 'next/image'
import ProtectedRoute from '../components/ProtectedRoute'
import { useAuth } from '../contexts/AuthContext'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

type Account = {
  id: number
  name: string
}

type Transaction = {
  id: string
  type: string
  amount: number
  description: string
  category: string | null
  recorded_at: string
  account_id: number | null
  from_account_id: number | null
  to_account_id: number | null
  receipt_image_url: string | null
  users: {
    name: string
  }
}

type CategorySummary = {
  category: string
  total: number
  count: number
}

type LedgerTab = 'journal' | 'category' | 'statement'

export default function LedgerPage() {
  const router = useRouter()
  const { currentFiscalYear, isPastYear } = useFiscalYear()
  const { userProfile } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<LedgerTab>('journal')
  
  // 出納帳フィルター
  const [filterType, setFilterType] = useState<string>('all')
  const [filterAccount, setFilterAccount] = useState<string>('all')
  const [filterMonth, setFilterMonth] = useState<string>('all')

  useEffect(() => {
    if (currentFiscalYear) {
      fetchData()
    }
  }, [currentFiscalYear])

  const fetchData = async () => {
    if (!currentFiscalYear) return

    try {
      const { data: accountsData } = await supabase
        .from('accounts')
        .select('*')
        .order('id')

      setAccounts(accountsData || [])

      const { data: transactionsData, error } = await supabase
        .from('transactions')
        .select(`
          *,
          users (name)
        `)
        .eq('is_deleted', false)
        .eq('fiscal_year_id', currentFiscalYear.id)
        .order('recorded_at', { ascending: false })

      if (error) throw error
      setTransactions(transactionsData || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (transactionId: string) => {
    if (!userProfile) {
      alert('ユーザー情報が取得できませんでした')
      return
    }

    // 名前確認による削除承認
    const inputName = prompt(
      `削除を実行するには、あなたの名前を入力してください。\n\n` +
      `あなたの名前: ${userProfile.name}\n\n` +
      `※履歴には残ります`
    )

    // キャンセルされた場合
    if (inputName === null) return

    // 名前が一致しない場合
    if (inputName.trim() !== userProfile.name) {
      alert('名前が一致しません。削除できませんでした。')
      return
    }

    try {
      const { data: transaction } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single()

      if (!transaction) {
        alert('取引が見つかりません')
        return
      }

      await supabase
        .from('transactions')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq('id', transactionId)

      await supabase.from('transaction_history').insert({
        transaction_id: transactionId,
        action: 'deleted',
        changed_by: userProfile.id,  // ← 修正
        old_data: transaction,
      })

      if (transaction.type === 'income') {
        await supabase.rpc('update_balance', {
          account_id: transaction.account_id,
          change_amount: -transaction.amount,
        })
      } else if (transaction.type === 'expense') {
        await supabase.rpc('update_balance', {
          account_id: transaction.account_id,
          change_amount: transaction.amount,
        })
      } else if (transaction.type === 'transfer') {
        await supabase.rpc('update_balance', {
          account_id: transaction.from_account_id,
          change_amount: transaction.amount,
        })
        await supabase.rpc('update_balance', {
          account_id: transaction.to_account_id,
          change_amount: -transaction.amount,
        })
      }

      alert('削除しました')
      fetchData()
    } catch (error) {
      console.error('Error deleting:', error)
      alert('削除に失敗しました')
    }
  }

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('ja-JP') + '円'
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'income': return '収入'
      case 'expense': return '支出'
      case 'transfer': return '移動'
      default: return type
    }
  }

  const getAccountName = (accountId: number | null) => {
    const account = accounts.find(a => a.id === accountId)
    return account?.name || '不明'
  }

  const getMonthOptions = () => {
    const options = [{ value: 'all', label: '全期間' }]

    if (!currentFiscalYear) return options

    // 年度の開始日と終了日を取得
    const startDate = new Date(currentFiscalYear.start_date)
    const endDate = new Date(currentFiscalYear.end_date)

    // 年度内の全ての月を生成
    const currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
    const lastDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1)

    while (currentDate <= lastDate) {
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth() + 1
      options.push({
        value: `${year}-${String(month).padStart(2, '0')}`,
        label: `${year}年${month}月`
      })
      currentDate.setMonth(currentDate.getMonth() + 1)
    }

    // 新しい月が先頭に来るように逆順にする
    return [options[0], ...options.slice(1).reverse()]
  }

  // 出納帳用フィルター
  const filteredTransactions = transactions.filter(t => {
    if (filterType !== 'all' && t.type !== filterType) return false
    
    if (filterAccount !== 'all') {
      const accountIdNum = parseInt(filterAccount)
      if (t.type === 'transfer') {
        if (t.from_account_id !== accountIdNum && t.to_account_id !== accountIdNum) {
          return false
        }
      } else {
        if (t.account_id !== accountIdNum) return false
      }
    }
    
    if (filterMonth !== 'all') {
      const transactionDate = new Date(t.recorded_at)
      const year = transactionDate.getFullYear()
      const month = String(transactionDate.getMonth() + 1).padStart(2, '0')
      const transactionMonth = `${year}-${month}`
      
      if (transactionMonth !== filterMonth) return false
    }
    
    return true
  })

  // 出納帳用合計
  const journalTotals = filteredTransactions.reduce(
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

  // 科目別台帳用データ
  const getCategorySummary = (): { income: CategorySummary[], expense: CategorySummary[] } => {
    const income: { [key: string]: { total: number, count: number } } = {}
    const expense: { [key: string]: { total: number, count: number } } = {}

    transactions.forEach(t => {
      if (!t.category) return
      
      if (t.type === 'income') {
        if (!income[t.category]) {
          income[t.category] = { total: 0, count: 0 }
        }
        income[t.category].total += Number(t.amount)
        income[t.category].count += 1
      } else if (t.type === 'expense') {
        if (!expense[t.category]) {
          expense[t.category] = { total: 0, count: 0 }
        }
        expense[t.category].total += Number(t.amount)
        expense[t.category].count += 1
      }
    })

    return {
      income: Object.entries(income).map(([category, data]) => ({
        category,
        total: data.total,
        count: data.count,
      })),
      expense: Object.entries(expense).map(([category, data]) => ({
        category,
        total: data.total,
        count: data.count,
      })),
    }
  }

  // 収支計算書用データ
  const getStatementData = () => {
    const income: { [key: string]: number } = {}
    const expense: { [key: string]: number } = {}

    transactions.forEach(t => {
      if (!t.category) return
      
      if (t.type === 'income') {
        income[t.category] = (income[t.category] || 0) + Number(t.amount)
      } else if (t.type === 'expense') {
        expense[t.category] = (expense[t.category] || 0) + Number(t.amount)
      }
    })

    const totalIncome = Object.values(income).reduce((sum, val) => sum + val, 0)
    const totalExpense = Object.values(expense).reduce((sum, val) => sum + val, 0)

    return {
      income,
      expense,
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
    }
  }

  if (loading) {
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

  const categorySummary = getCategorySummary()
  const statementData = getStatementData()

  return (
    <ProtectedRoute>
    <div className={`min-h-screen ${
      isPastYear
        ? 'bg-gradient-to-br from-gray-200 to-gray-300'
        : 'bg-gradient-to-br from-gray-50 to-gray-100'
    }`}>
      <Header
        title="帳簿"
        subtitle="全取引を確認・編集"
        showBack={true}
        colorFrom="violet-500"
        colorTo="purple-500"
      />

      <main className="container mx-auto p-4 max-w-4xl">
        {/* タブ */}
        <div className="bg-white rounded-t-xl shadow-md border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('journal')}
              className={`flex-1 py-3 sm:py-4 px-2 sm:px-6 font-bold text-xs sm:text-base transition ${
                activeTab === 'journal'
                  ? 'bg-white text-violet-600 border-b-2 border-violet-600'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="hidden sm:inline">📝 </span>出納帳
            </button>
            <button
              onClick={() => setActiveTab('category')}
              className={`flex-1 py-3 sm:py-4 px-2 sm:px-6 font-bold text-xs sm:text-base transition ${
                activeTab === 'category'
                  ? 'bg-white text-violet-600 border-b-2 border-violet-600'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="hidden sm:inline">🏷️ </span>科目別
            </button>
            <button
              onClick={() => setActiveTab('statement')}
              className={`flex-1 py-3 sm:py-4 px-2 sm:px-6 font-bold text-xs sm:text-base transition ${
                activeTab === 'statement'
                  ? 'bg-white text-violet-600 border-b-2 border-violet-600'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="hidden sm:inline">📊 </span>収支
            </button>
          </div>
        </div>

        {/* コンテンツ */}
        <div className="bg-white rounded-b-xl shadow-md p-6">
          {/* 出納帳 */}
          {activeTab === 'journal' && (
            <JournalView
              transactions={filteredTransactions}
              accounts={accounts}
              filterType={filterType}
              setFilterType={setFilterType}
              filterAccount={filterAccount}
              setFilterAccount={setFilterAccount}
              filterMonth={filterMonth}
              setFilterMonth={setFilterMonth}
              monthOptions={getMonthOptions()}
              totals={journalTotals}
              onEdit={(id: any) => router.push(`/edit/${id}`)}
              onDelete={handleDelete}
              formatCurrency={formatCurrency}
              formatDateTime={formatDateTime}
              getTypeLabel={getTypeLabel}
              getAccountName={getAccountName}
            />
          )}

          {/* 科目別台帳 */}
          {activeTab === 'category' && (
            <CategoryLedgerView
              categorySummary={categorySummary}
              formatCurrency={formatCurrency}
            />
          )}

          {/* 収支計算書 */}
          {activeTab === 'statement' && (
            <StatementView
              statementData={statementData}
              fiscalYear={currentFiscalYear}
              formatCurrency={formatCurrency}
            />
          )}
        </div>
      </main>
    </div>
    </ProtectedRoute>
  )
}

// 出納帳ビュー
function JournalView({
  transactions,
  accounts,
  filterType,
  setFilterType,
  filterAccount,
  setFilterAccount,
  filterMonth,
  setFilterMonth,
  monthOptions,
  totals,
  onEdit,
  onDelete,
  formatCurrency,
  formatDateTime,
  getTypeLabel,
  getAccountName,
}: any) {
  const [expandedReceiptIds, setExpandedReceiptIds] = useState<Set<string>>(new Set())
  const [isFilterExpanded, setIsFilterExpanded] = useState(false)

  const toggleReceipt = (id: string) => {
    const newExpanded = new Set(expandedReceiptIds)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedReceiptIds(newExpanded)
  }

  return (
    <>
      {/* フィルター */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">絞り込み</h3>
          {/* スマホのみ表示される折りたたみボタン */}
          <button
            onClick={() => setIsFilterExpanded(!isFilterExpanded)}
            className="md:hidden text-sm text-violet-600 hover:text-violet-800 font-semibold"
          >
            {isFilterExpanded ? '▲ 閉じる' : '▼ 開く'}
          </button>
        </div>

        {/* フィルター内容（スマホでは折りたたみ可能、PCでは常に表示） */}
        <div className={`${isFilterExpanded ? 'block' : 'hidden'} md:block`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-700 font-semibold mb-1">種類</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded"
              >
                <option value="all">全て</option>
                <option value="income">収入</option>
                <option value="expense">支出</option>
                <option value="transfer">移動</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-700 font-semibold mb-1">口座</label>
              <select
                value={filterAccount}
                onChange={(e) => setFilterAccount(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded"
              >
                <option value="all">全て</option>
                <option value="1">現金</option>
                <option value="2">ゆうちょ銀行</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-700 font-semibold mb-1">期間</label>
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded"
              >
                {monthOptions.map((option: any) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(filterType !== 'all' || filterAccount !== 'all' || filterMonth !== 'all') && (
            <button
              onClick={() => {
                setFilterType('all')
                setFilterAccount('all')
                setFilterMonth('all')
              }}
              className="mt-3 text-sm text-violet-600 hover:text-violet-800"
            >
              ✕ フィルターをリセット
            </button>
          )}
        </div>
      </div>

      {/* 合計金額表示 */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-sm text-gray-600">収入合計</p>
            <p className="text-xl font-bold text-green-600">
              +{formatCurrency(totals.income)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">支出合計</p>
            <p className="text-xl font-bold text-red-600">
              -{formatCurrency(totals.expense)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">収支</p>
            <p className={`text-xl font-bold ${
              totals.income - totals.expense >= 0 ? 'text-blue-600' : 'text-red-600'
            }`}>
              {totals.income - totals.expense >= 0 ? '+' : ''}
              {formatCurrency(totals.income - totals.expense)}
            </p>
          </div>
        </div>
      </div>

      {/* 取引一覧 */}
      <div>
        <h2 className="text-xl font-bold mb-4">
          取引一覧（{transactions.length}件）
        </h2>

        {transactions.length === 0 ? (
          <p className="text-gray-500 text-center py-4">取引がありません</p>
        ) : (
          <div className="space-y-4">
            {transactions.map((transaction: any) => (
              <div
                key={transaction.id}
                className="border rounded-lg p-3 sm:p-4 hover:bg-gray-50 relative group"
              >
                {/* 編集・削除ボタン */}
                <div className="absolute top-3 right-3 flex gap-1 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition">
                  <button
                    onClick={() => onEdit(transaction.id)}
                    className="p-1.5 sm:p-1 bg-white sm:bg-transparent shadow-sm sm:shadow-none rounded sm:rounded-none text-gray-600 sm:text-gray-400 hover:text-blue-600 transition"
                    title="編集"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDelete(transaction.id)}
                    className="p-1.5 sm:p-1 bg-white sm:bg-transparent shadow-sm sm:shadow-none rounded sm:rounded-none text-gray-600 sm:text-gray-400 hover:text-red-600 transition"
                    title="削除"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                <div className="pr-12 sm:pr-16">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-2">
                    <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded w-fit">
                      {getTypeLabel(transaction.type)}
                    </span>
                    <span className="text-xs sm:text-sm text-gray-500">
                      {formatDateTime(transaction.recorded_at)}
                    </span>
                  </div>

                  <p className="font-bold text-base sm:text-lg mb-2">{transaction.description}</p>

                  <div className="space-y-1">
                    {transaction.category && (
                      <p className="text-xs sm:text-sm text-gray-600">
                        カテゴリー: {transaction.category}
                      </p>
                    )}

                    {transaction.type === 'transfer' ? (
                      <p className="text-xs sm:text-sm text-gray-600">
                        {getAccountName(transaction.from_account_id)} → {getAccountName(transaction.to_account_id)}
                      </p>
                    ) : (
                      <p className="text-xs sm:text-sm text-gray-600">
                        口座: {getAccountName(transaction.account_id)}
                      </p>
                    )}

                    <p className="text-xs sm:text-sm text-gray-500">
                      記入者: {transaction.users.name}
                    </p>
                  </div>

                  <p className={`text-lg sm:text-2xl font-bold mt-3 ${
                    transaction.type === 'income' ? 'text-green-600' :
                    transaction.type === 'expense' ? 'text-red-600' :
                    'text-blue-600'
                  }`}>
                    {transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '±'}
                    {formatCurrency(transaction.amount)}
                  </p>
                </div>

                {transaction.receipt_image_url && (
                  <div className="mt-3">
                    <button
                      onClick={() => toggleReceipt(transaction.id)}
                      className="text-sm text-gray-600 hover:text-gray-800 mb-2 flex items-center gap-1"
                    >
                      <span>📎 領収書</span>
                      <span className="text-xs">
                        {expandedReceiptIds.has(transaction.id) ? '▲' : '▼'}
                      </span>
                    </button>
                    {expandedReceiptIds.has(transaction.id) && (
                      <Image
                        src={transaction.receipt_image_url}
                        alt="領収書"
                        width={300}
                        height={200}
                        className="rounded border cursor-pointer hover:opacity-80"
                        onClick={() => window.open(transaction.receipt_image_url!, '_blank')}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// 科目別台帳ビュー
function CategoryLedgerView({
  categorySummary,
  formatCurrency,
}: any) {
  // 円グラフ用の色（見やすさを重視した濃い色）
  const INCOME_COLORS = [
    '#059669', // 濃い緑
    '#0891b2', // シアン
    '#2563eb', // 青
    '#7c3aed', // 紫
    '#db2777', // ピンク
    '#ea580c', // オレンジ
    '#65a30d', // ライム
  ]
  const EXPENSE_COLORS = [
    '#dc2626', // 濃い赤
    '#ea580c', // オレンジ
    '#d97706', // アンバー
    '#ca8a04', // イエロー
    '#65a30d', // ライム
    '#0891b2', // シアン
    '#7c3aed', // 紫
  ]

  // 円グラフ用データの準備
  const incomePieData = categorySummary.income.map((item: CategorySummary) => ({
    name: item.category,
    value: item.total,
  }))

  const expensePieData = categorySummary.expense.map((item: CategorySummary) => ({
    name: item.category,
    value: item.total,
  }))

  // 収入・支出の合計金額を計算
  const incomeTotal = incomePieData.reduce((sum: number, item: any) => sum + item.value, 0)
  const expenseTotal = expensePieData.reduce((sum: number, item: any) => sum + item.value, 0)

  // カスタムラベル（2行表示）
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, name, percent }: any) => {
    const RADIAN = Math.PI / 180
    const radius = outerRadius + 10
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    const percentage = percent ? (percent * 100).toFixed(0) : 0

    return (
      <text
        x={x}
        y={y}
        fill="black"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        style={{ fontSize: '10px', fontWeight: 'bold' }}
      >
        <tspan x={x} dy="0">{name}</tspan>
        <tspan x={x} dy="12">{percentage}%</tspan>
      </text>
    )
  }

  // 収入用カスタムツールチップ
  const IncomeTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const value = payload[0].value
      const percentage = incomeTotal > 0 ? ((value / incomeTotal) * 100).toFixed(1) : '0.0'

      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="font-bold text-gray-800">{payload[0].name}</p>
          <p className="text-sm text-gray-600">{formatCurrency(value)}</p>
          <p className="text-xs text-gray-500">{percentage}%</p>
        </div>
      )
    }
    return null
  }

  // 支出用カスタムツールチップ
  const ExpenseTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const value = payload[0].value
      const percentage = expenseTotal > 0 ? ((value / expenseTotal) * 100).toFixed(1) : '0.0'

      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="font-bold text-gray-800">{payload[0].name}</p>
          <p className="text-sm text-gray-600">{formatCurrency(value)}</p>
          <p className="text-xs text-gray-500">{percentage}%</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-8">
      {/* 収入 */}
      <div>
        <h2 className="text-xl font-bold mb-4 text-emerald-700">収入</h2>
        {categorySummary.income.length === 0 ? (
          <p className="text-gray-500 text-center py-4">収入がありません</p>
        ) : (
          <div className="space-y-6">
            {/* 円グラフ */}
            <div className="bg-gradient-to-br from-emerald-50/50 to-green-50/50 rounded-lg p-4 md:p-6 border border-emerald-200">
              <h3 className="text-base md:text-lg font-bold text-emerald-800 mb-4 text-center">収入の内訳</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={incomePieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomLabel}
                    outerRadius={60}
                    fill="#8884d8"
                    dataKey="value"
                    style={{ outline: 'none' }}
                    activeShape={false}
                  >
                    {incomePieData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={INCOME_COLORS[index % INCOME_COLORS.length]} style={{ outline: 'none' }} />
                    ))}
                  </Pie>
                  <Tooltip content={<IncomeTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* リスト表示 */}
            <div className="space-y-3">
              {categorySummary.income.map((item: CategorySummary) => (
                <div key={item.category} className="flex justify-between items-center p-4 bg-emerald-50/60 rounded-lg border border-emerald-200">
                  <div>
                    <p className="font-bold text-gray-800">{item.category}</p>
                    <p className="text-sm text-gray-600">{item.count}件</p>
                  </div>
                  <p className="text-2xl font-bold text-emerald-600">
                    +{formatCurrency(item.total)}
                  </p>
                </div>
              ))}
              <div className="flex justify-between items-center p-4 bg-emerald-100 rounded-lg border border-emerald-300">
                <p className="font-bold text-gray-800">収入合計</p>
                <p className="text-2xl font-bold text-emerald-700">
                  +{formatCurrency(categorySummary.income.reduce((sum: number, item: CategorySummary) => sum + item.total, 0))}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 支出 */}
      <div>
        <h2 className="text-xl font-bold mb-4 text-rose-700">支出</h2>
        {categorySummary.expense.length === 0 ? (
          <p className="text-gray-500 text-center py-4">支出がありません</p>
        ) : (
          <div className="space-y-6">
            {/* 円グラフ */}
            <div className="bg-gradient-to-br from-rose-50/50 to-pink-50/50 rounded-lg p-4 md:p-6 border border-rose-200">
              <h3 className="text-base md:text-lg font-bold text-rose-800 mb-4 text-center">支出の内訳</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={expensePieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomLabel}
                    outerRadius={60}
                    fill="#8884d8"
                    dataKey="value"
                    style={{ outline: 'none' }}
                    activeShape={false}
                  >
                    {expensePieData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={EXPENSE_COLORS[index % EXPENSE_COLORS.length]} style={{ outline: 'none' }} />
                    ))}
                  </Pie>
                  <Tooltip content={<ExpenseTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* リスト表示 */}
            <div className="space-y-3">
              {categorySummary.expense.map((item: CategorySummary) => (
                <div key={item.category} className="flex justify-between items-center p-4 bg-rose-50/60 rounded-lg border border-rose-200">
                  <div>
                    <p className="font-bold text-gray-800">{item.category}</p>
                    <p className="text-sm text-gray-600">{item.count}件</p>
                  </div>
                  <p className="text-2xl font-bold text-rose-600">
                    -{formatCurrency(item.total)}
                  </p>
                </div>
              ))}
              <div className="flex justify-between items-center p-4 bg-rose-100 rounded-lg border border-rose-300">
                <p className="font-bold text-gray-800">支出合計</p>
                <p className="text-2xl font-bold text-rose-700">
                  -{formatCurrency(categorySummary.expense.reduce((sum: number, item: CategorySummary) => sum + item.total, 0))}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// 収支計算書ビュー
function StatementView({
  statementData,
  fiscalYear,
  formatCurrency,
}: any) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">収支計算書</h2>
        <p className="text-gray-600 mt-1">{fiscalYear?.name}</p>
      </div>

      {/* 収入の部 */}
      <div className="border-2 border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4 text-emerald-700 border-b-2 border-emerald-200 pb-2">
          【収入の部】
        </h3>
        <div className="space-y-2">
          {Object.entries(statementData.income).map(([category, amount]: any) => (
            <div key={category} className="flex justify-between py-2">
              <span className="text-gray-700">{category}</span>
              <span className="font-semibold">{formatCurrency(amount)}</span>
            </div>
          ))}
          <div className="border-t-2 border-gray-300 pt-3 mt-3">
            <div className="flex justify-between font-bold text-lg">
              <span>収入合計</span>
              <span className="text-emerald-600">{formatCurrency(statementData.totalIncome)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 支出の部 */}
      <div className="border-2 border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4 text-rose-700 border-b-2 border-rose-200 pb-2">
          【支出の部】
        </h3>
        <div className="space-y-2">
          {Object.entries(statementData.expense).map(([category, amount]: any) => (
            <div key={category} className="flex justify-between py-2">
              <span className="text-gray-700">{category}</span>
              <span className="font-semibold">{formatCurrency(amount)}</span>
            </div>
          ))}
          <div className="border-t-2 border-gray-300 pt-3 mt-3">
            <div className="flex justify-between font-bold text-lg">
              <span>支出合計</span>
              <span className="text-rose-600">{formatCurrency(statementData.totalExpense)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 収支 */}
      <div className="border-2 border-indigo-200 rounded-lg p-6 bg-indigo-50">
        <h3 className="text-lg font-bold mb-4 text-indigo-700 border-b-2 border-indigo-300 pb-2">
          【収支】
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between py-2">
            <span className="text-gray-700">当期収支</span>
            <span className={`font-bold text-xl ${
              statementData.balance >= 0 ? 'text-indigo-600' : 'text-rose-600'
            }`}>
              {statementData.balance >= 0 ? '+' : ''}
              {formatCurrency(statementData.balance)}
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-gray-700">期首残高</span>
            <span className="font-semibold">
              {formatCurrency(
                Number(fiscalYear?.starting_balance_cash || 0) + 
                Number(fiscalYear?.starting_balance_bank || 0)
              )}
            </span>
          </div>
          <div className="border-t-2 border-indigo-300 pt-3">
            <div className="flex justify-between font-bold text-xl">
              <span>期末残高</span>
              <span className="text-indigo-700">
                {formatCurrency(
                  statementData.balance +
                  Number(fiscalYear?.starting_balance_cash || 0) +
                  Number(fiscalYear?.starting_balance_bank || 0)
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}