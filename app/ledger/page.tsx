'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

type Account = {
  id: number
  name: string
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
  receipt_image_url: string | null
  users: {
    name: string
  }
}

export default function LedgerPage() {
  const router = useRouter()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('all')
  const [filterAccount, setFilterAccount] = useState<string>('all')
  const [filterMonth, setFilterMonth] = useState<string>('all')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      // 口座データを取得
      const { data: accountsData } = await supabase
        .from('accounts')
        .select('*')
        .order('id')

      setAccounts(accountsData || [])

      // 取引データを取得（削除されていないもの）
      const { data: transactionsData, error } = await supabase
        .from('transactions')
        .select(`
          *,
          users (name)
        `)
        .eq('is_deleted', false)
        .order('recorded_at', { ascending: false })

      if (error) throw error
      setTransactions(transactionsData || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (transactionId: string, userName: string) => {
    if (!confirm('本当に削除しますか？\n（履歴には残ります）')) return

    try {
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('name', userName)
        .single()

      if (!user) {
        alert('ユーザーが見つかりません')
        return
      }

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
        changed_by: user.id,
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

  // 月のリストを生成（過去12ヶ月）
  const getMonthOptions = () => {
    const options = [{ value: 'all', label: '全期間' }]
    const now = new Date()
    
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const year = date.getFullYear()
      const month = date.getMonth() + 1
      options.push({
        value: `${year}-${String(month).padStart(2, '0')}`,
        label: `${year}年${month}月`
      })
    }
    
    return options
  }

  // フィルター適用
  const filteredTransactions = transactions.filter(t => {
    // 種類フィルター
    if (filterType !== 'all' && t.type !== filterType) return false
    
    // 口座フィルター
    if (filterAccount !== 'all') {
      const accountIdNum = parseInt(filterAccount)
      if (t.type === 'transfer') {
        // 移動の場合は、移動元または移動先が一致
        if (t.from_account_id !== accountIdNum && t.to_account_id !== accountIdNum) {
          return false
        }
      } else {
        // 収入・支出の場合
        if (t.account_id !== accountIdNum) return false
      }
    }
    
    // 月フィルター
    if (filterMonth !== 'all') {
      const transactionDate = new Date(t.recorded_at)
      const year = transactionDate.getFullYear()
      const month = String(transactionDate.getMonth() + 1).padStart(2, '0')
      const transactionMonth = `${year}-${month}`
      
      if (transactionMonth !== filterMonth) return false
    }
    
    return true
  })

  // 合計金額を計算
  const totals = filteredTransactions.reduce(
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <p className="text-xl text-gray-600">読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-gradient-to-r from-violet-500 to-purple-500 text-white p-4 shadow-lg">
        <div className="container mx-auto max-w-4xl flex items-center">
          <button onClick={() => router.push('/')} className="mr-4 text-2xl hover:bg-white/20 rounded-lg p-2 transition">
            ←
          </button>
          <div>
            <h1 className="text-2xl font-bold">帳簿</h1>
            <p className="text-violet-100 text-sm">全取引を確認・編集</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 max-w-4xl">
        {/* フィルター */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <h3 className="font-bold mb-3">絞り込み</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 種類フィルター */}
            <div>
              <label className="block text-sm text-gray-700 font-semibold mb-1">
                種類
              </label>
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

            {/* 口座フィルター */}
            <div>
              <label className="block text-sm text-gray-700 font-semibold mb-1">
                口座
              </label>
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

            {/* 月フィルター */}
            <div>
              <label className="block text-sm text-gray-700 font-semibold mb-1">
                期間
              </label>
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded"
              >
                {getMonthOptions().map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* フィルターリセット */}
          {(filterType !== 'all' || filterAccount !== 'all' || filterMonth !== 'all') && (
            <button
              onClick={() => {
                setFilterType('all')
                setFilterAccount('all')
                setFilterMonth('all')
              }}
              className="mt-3 text-sm text-blue-600 hover:text-blue-800"
            >
              ✕ フィルターをリセット
            </button>
          )}
        </div>

        {/* 合計金額表示 */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
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
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">
            取引一覧（{filteredTransactions.length}件）
          </h2>

          {filteredTransactions.length === 0 ? (
            <p className="text-gray-500 text-center py-4">取引がありません</p>
          ) : (
            <div className="space-y-4">
              {filteredTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="border rounded-lg p-4 hover:bg-gray-50"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded">
                          {getTypeLabel(transaction.type)}
                        </span>
                        <span className="text-sm text-gray-500">
                          {formatDateTime(transaction.recorded_at)}
                        </span>
                      </div>
                      <p className="font-bold text-lg">{transaction.description}</p>
                      
                      {transaction.type === 'transfer' ? (
                        <p className="text-sm text-gray-600">
                          {getAccountName(transaction.from_account_id)} → {getAccountName(transaction.to_account_id)}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-600">
                          口座: {getAccountName(transaction.account_id)}
                        </p>
                      )}
                      
                      <p className="text-sm text-gray-500">
                        記入者: {transaction.users.name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${
                        transaction.type === 'income' ? 'text-green-600' :
                        transaction.type === 'expense' ? 'text-red-600' :
                        'text-blue-600'
                      }`}>
                        {transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '±'}
                        {formatCurrency(transaction.amount)}
                      </p>
                    </div>
                  </div>

                  {/* 領収書画像表示 */}
                  {transaction.receipt_image_url && (
                    <div className="mt-3 mb-3">
                      <p className="text-sm text-gray-600 mb-2">📎 領収書:</p>
                      <Image
                        src={transaction.receipt_image_url}
                        alt="領収書"
                        width={300}
                        height={200}
                        className="rounded border cursor-pointer hover:opacity-80"
                        onClick={() => window.open(transaction.receipt_image_url!, '_blank')}
                      />
                    </div>
                  )}

                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => router.push(`/edit/${transaction.id}`)}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => {
                        const userName = prompt('あなたの名前を入力してください:')
                        if (userName) handleDelete(transaction.id, userName)
                      }}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded"
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}