'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useFiscalYear } from '../contexts/FiscalYearContext'
import Header from '../components/Header'
import ProtectedRoute from '../components/ProtectedRoute'
import { useAuth } from '../contexts/AuthContext'

type Account = {
  id: number
  name: string
}

type HistoryRecord = {
  id: string
  transaction_id: string
  action: string
  changed_by: string
  changed_at: string
  old_data: any
  new_data: any
  users: {
    name: string
  }
}

export default function HistoryPage() {
  const router = useRouter()
  const { currentFiscalYear } = useFiscalYear()
  const { userProfile } = useAuth()
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [deletedTransactions, setDeletedTransactions] = useState<any[]>([])

  useEffect(() => {
    if (currentFiscalYear) {
      fetchData()
    }
  }, [currentFiscalYear, showDeleted])

  const fetchData = async () => {
    if (!currentFiscalYear) return

    try {
      const { data: accountsData } = await supabase
        .from('accounts')
        .select('*')
        .order('id')

      setAccounts(accountsData || [])

      // 現在の年度のトランザクションIDを取得
      const { data: transactionIds } = await supabase
        .from('transactions')
        .select('id')
        .eq('fiscal_year_id', currentFiscalYear.id)

      const ids = transactionIds?.map(t => t.id) || []

      if (ids.length === 0) {
        setHistory([])
        setDeletedTransactions([])
        setLoading(false)
        return
      }

      // 履歴データを取得
      const { data: historyData, error } = await supabase
        .from('transaction_history')
        .select(`
          *,
          users (name)
        `)
        .in('transaction_id', ids)
        .order('changed_at', { ascending: false })

      if (error) throw error
      setHistory(historyData || [])

      // 削除済み取引を取得（showDeletedがtrueの場合）
      if (showDeleted) {
        const { data: deletedData } = await supabase
          .from('transactions')
          .select(`
            *,
            users (name)
          `)
          .eq('fiscal_year_id', currentFiscalYear.id)
          .eq('is_deleted', true)
          .order('deleted_at', { ascending: false })

        setDeletedTransactions(deletedData || [])
      } else {
        setDeletedTransactions([])
      }
    } catch (error) {
      console.error('Error fetching history:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (transaction: any) => {
    if (!userProfile) {
      alert('ユーザー情報が取得できませんでした')
      return
    }

    if (!confirm(`「${transaction.description}」を復元しますか？\n\n残高も元に戻ります。`)) {
      return
    }

    try {
      const userId = userProfile.id

      // 取引を復元（is_deleted = false に戻す）
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          is_deleted: false,
          deleted_at: null,
        })
        .eq('id', transaction.id)

      if (updateError) throw updateError

      // 履歴に復元操作を記録
      const { error: historyError } = await supabase
        .from('transaction_history')
        .insert({
          transaction_id: transaction.id,
          action: 'restored',
          changed_by: userId,
          changed_at: new Date().toISOString(),
          old_data: { ...transaction, is_deleted: true, deleted_at: transaction.deleted_at },
          new_data: { ...transaction, is_deleted: false, deleted_at: null },
        })

      if (historyError) {
        console.error('History insert error:', historyError)
        alert(`履歴の記録に失敗しました: ${JSON.stringify(historyError)}`)  // ← エラー内容を表示
        // 履歴の記録に失敗しても復元は成功させる
      }

      // 残高を元に戻す
      if (transaction.type === 'income') {
        await supabase.rpc('update_balance', {
          account_id: transaction.account_id,
          change_amount: transaction.amount,
        })
      } else if (transaction.type === 'expense') {
        await supabase.rpc('update_balance', {
          account_id: transaction.account_id,
          change_amount: -transaction.amount,
        })
      } else if (transaction.type === 'transfer') {
        await supabase.rpc('update_balance', {
          account_id: transaction.from_account_id,
          change_amount: -transaction.amount,
        })
        await supabase.rpc('update_balance', {
          account_id: transaction.to_account_id,
          change_amount: transaction.amount,
        })
      }

      alert('復元しました')
      fetchData()
    } catch (error) {
      console.error('Error restoring:', error)
      alert('復元に失敗しました')
    }
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('ja-JP') + '円'
  }

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'created': return '作成'
      case 'updated': return '編集'
      case 'deleted': return '削除'
      case 'restored': return '復元'
      default: return action
    }
  }

  const getActionColor = (action: string) => {
    switch (action) {
      case 'created': return 'bg-green-100 text-green-800'
      case 'updated': return 'bg-blue-100 text-blue-800'
      case 'deleted': return 'bg-red-100 text-red-800'
      case 'restored': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getAccountName = (accountId: number | null) => {
    const account = accounts.find(a => a.id === accountId)
    return account?.name || '不明'
  }

  const getTransactionDisplay = (data: any) => {
    if (!data) return '（データなし）'

    if (data.type === 'income') {
      return `収入: ${data.description} - ${formatCurrency(data.amount)} [${getAccountName(data.account_id)}]`
    } else if (data.type === 'expense') {
      return `支出: ${data.description} - ${formatCurrency(data.amount)} [${getAccountName(data.account_id)}]`
    } else if (data.type === 'transfer') {
      return `移動: ${data.description} - ${formatCurrency(data.amount)} [${getAccountName(data.from_account_id)}→${getAccountName(data.to_account_id)}]`
    }
    return '（不明）'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <p className="text-xl text-gray-600">読み込み中...</p>
      </div>
    )
  }

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header
        title="操作履歴"
        subtitle="全ての操作を透明に記録"
        showBack={true}
        colorFrom="amber-500"
        colorTo="orange-500"
      />

      <main className="container mx-auto p-4 max-w-4xl">
        {/* 削除済み表示トグル */}
        <div className="bg-white rounded-xl shadow-md p-4 mb-4 border border-gray-100">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              className="w-5 h-5 mr-3 cursor-pointer"
            />
            <span className="font-semibold text-gray-800">削除済みの取引を表示</span>
          </label>
        </div>

        {/* 削除済み取引（復元可能） */}
        {showDeleted && deletedTransactions.length > 0 && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-100">
            <div className="flex items-center mb-4">
              <span className="text-2xl mr-2">🗑️</span>
              <h2 className="text-xl font-bold text-gray-800">削除済みの取引</h2>
            </div>

            <div className="space-y-3">
              {deletedTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="border border-red-200 rounded-lg p-4 bg-red-50"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-red-200 text-red-800 text-xs font-semibold px-2 py-1 rounded">
                          削除済み
                        </span>
                        <span className="text-sm text-gray-500">
                          {formatDateTime(transaction.deleted_at || transaction.recorded_at)}
                        </span>
                      </div>
                      <p className="font-bold text-lg">{getTransactionDisplay(transaction)}</p>
                      <p className="text-sm text-gray-600">
                        記入者: {transaction.users?.name || '不明'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRestore(transaction)}
                      className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded font-bold text-sm transition"
                    >
                      復元
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 操作履歴 */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
          <div className="flex items-center mb-4">
            <span className="text-2xl mr-2">📋</span>
            <h2 className="text-xl font-bold text-gray-800">操作履歴</h2>
          </div>

          {history.length === 0 ? (
            <p className="text-gray-500 text-center py-8">履歴がありません</p>
          ) : (
            <div className="space-y-3">
              {history.map((record) => (
                <div
                  key={record.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${getActionColor(record.action)}`}>
                          {getActionLabel(record.action)}
                        </span>
                        <span className="text-sm text-gray-500">
                          {formatDateTime(record.changed_at)}
                        </span>
                        <span className="text-sm text-gray-600">
                          by {record.users.name}
                        </span>
                      </div>

                      <p className="text-gray-800">
                        {getTransactionDisplay(record.new_data || record.old_data)}
                      </p>

                      {record.action === 'updated' && (
                        <button
                          onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                          className="text-sm text-blue-600 hover:text-blue-800 mt-2"
                        >
                          {expandedId === record.id ? '▼ 詳細を隠す' : '▶ 詳細を見る'}
                        </button>
                      )}

                      {expandedId === record.id && record.action === 'updated' && (
                        <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200 text-sm">
                          <div className="mb-2">
                            <span className="font-semibold text-red-600">変更前:</span>
                            <p className="ml-4">{getTransactionDisplay(record.old_data)}</p>
                          </div>
                          <div>
                            <span className="font-semibold text-green-600">変更後:</span>
                            <p className="ml-4">{getTransactionDisplay(record.new_data)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
    </ProtectedRoute>
  )
}