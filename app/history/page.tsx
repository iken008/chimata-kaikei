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
  const { currentFiscalYear, isPastYear } = useFiscalYear()
  const { userProfile } = useAuth()
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [deletedTransactions, setDeletedTransactions] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'transaction' | 'system'>('transaction')
  const [systemHistory, setSystemHistory] = useState<any[]>([])

  useEffect(() => {
    if (currentFiscalYear) {
      fetchData()
    }
  }, [currentFiscalYear, showDeleted, activeTab])

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

      // 取引履歴データを取得（取引がある場合のみ）
      if (ids.length > 0) {
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
      } else {
        // 取引がない場合は空にする
        setHistory([])
        setDeletedTransactions([])
      }

      // システム履歴を取得（取引の有無に関係なく常に取得）
      if (activeTab === 'system') {
        const { data: systemHistoryData, error: systemError } = await supabase
          .from('system_history')
          .select(`
            *,
            users (name)
          `)
          .order('performed_at', { ascending: false })

        if (systemError) {
          console.error('Error fetching system history:', systemError)
        } else {
          setSystemHistory(systemHistoryData || [])
        }
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

    let display = ''
    if (data.type === 'income') {
      display = `収入: ${data.description} - ${formatCurrency(data.amount)} [${getAccountName(data.account_id)}]`
    } else if (data.type === 'expense') {
      display = `支出: ${data.description} - ${formatCurrency(data.amount)} [${getAccountName(data.account_id)}]`
    } else if (data.type === 'transfer') {
      display = `移動: ${data.description} - ${formatCurrency(data.amount)} [${getAccountName(data.from_account_id)}→${getAccountName(data.to_account_id)}]`
    } else {
      display = '（不明）'
    }

    // 領収書の有無を追加
    if (data.receipt_image_url) {
      display += ' 📎'
    }

    return display
  }

  const getReceiptChange = (oldData: any, newData: any) => {
    const hadReceipt = oldData?.receipt_image_url
    const hasReceipt = newData?.receipt_image_url

    if (!hadReceipt && hasReceipt) {
      return '📎 領収書を追加'
    } else if (hadReceipt && !hasReceipt) {
      return '📎 領収書を削除'
    } else if (hadReceipt && hasReceipt && oldData.receipt_image_url !== newData.receipt_image_url) {
      return '📎 領収書を変更'
    }
    return null
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

  return (
    <ProtectedRoute>
    <div className={`min-h-screen ${
      isPastYear
        ? 'bg-gradient-to-br from-gray-200 to-gray-300'
        : 'bg-gradient-to-br from-gray-50 to-gray-100'
    }`}>
      <Header
        title="操作履歴"
        subtitle="全ての操作を透明に記録"
        showBack={true}
        colorFrom="amber-500"
        colorTo="orange-500"
      />

      <main className="container mx-auto p-4 max-w-4xl">
        {/* タブ切り替え */}
        <div className="bg-white rounded-t-xl shadow-md border-b border-gray-200 mb-0">
          <div className="flex">
            <button
              onClick={() => setActiveTab('transaction')}
              className={`flex-1 py-3 sm:py-4 px-2 sm:px-6 font-bold text-xs sm:text-base transition ${
                activeTab === 'transaction'
                  ? 'bg-white text-amber-600 border-b-2 border-amber-600'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="hidden sm:inline">📋 </span>取引履歴
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`flex-1 py-3 sm:py-4 px-2 sm:px-6 font-bold text-xs sm:text-base transition ${
                activeTab === 'system'
                  ? 'bg-white text-amber-600 border-b-2 border-amber-600'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="hidden sm:inline">⚙️ </span>システム履歴
            </button>
          </div>
        </div>

        {activeTab === 'transaction' && (
          <>
            {/* 削除済み表示トグル */}
            <div className="bg-white rounded-b-xl shadow-md p-4 mb-4 border border-gray-100 border-t-0">
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
                          <div className="mb-2">
                            <span className="font-semibold text-green-600">変更後:</span>
                            <p className="ml-4">{getTransactionDisplay(record.new_data)}</p>
                          </div>
                          {getReceiptChange(record.old_data, record.new_data) && (
                            <div className="mt-2 pt-2 border-t border-gray-300">
                              <span className="text-blue-600 font-semibold">
                                {getReceiptChange(record.old_data, record.new_data)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
          </>
        )}

        {/* システム履歴タブ */}
        {activeTab === 'system' && (
          <div className="bg-white rounded-b-xl shadow-md p-6 border border-gray-100 border-t-0">
            <div className="flex items-center mb-4">
              <span className="text-2xl mr-2">⚙️</span>
              <h2 className="text-xl font-bold text-gray-800">システム操作履歴</h2>
            </div>

            {systemHistory.length === 0 ? (
              <p className="text-gray-500 text-center py-8">システム履歴がありません</p>
            ) : (
              <div className="space-y-3">
                {systemHistory.map((record) => {
                  const actionTypeLabel = getSystemActionLabel(record.action_type)
                  const actionColor = getSystemActionColor(record.action_type)

                  return (
                    <div
                      key={record.id}
                      className="border rounded-lg p-4 hover:bg-gray-50 transition"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-xs font-semibold px-2 py-1 rounded ${actionColor}`}>
                              {actionTypeLabel}
                            </span>
                            <span className="text-sm text-gray-500">
                              {formatDateTime(record.performed_at)}
                            </span>
                            <span className="text-sm text-gray-600">
                              by {record.users?.name || '不明'}
                            </span>
                          </div>

                          <p className="text-gray-800 font-medium mb-2">
                            {record.description}
                          </p>

                          {record.details && (
                            <button
                              onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                              className="text-sm text-blue-600 hover:text-blue-800"
                            >
                              {expandedId === record.id ? '▼ 詳細を隠す' : '▶ 詳細を見る'}
                            </button>
                          )}

                          {expandedId === record.id && record.details && (
                            <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200 text-sm">
                              {renderSystemHistoryDetails(record)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
    </ProtectedRoute>
  )
}

function getSystemActionLabel(actionType: string) {
  switch (actionType) {
    case 'archive_created': return 'アーカイブ作成'
    case 'year_deleted': return '年度削除'
    case 'year_edited': return '年度編集'
    case 'year_created': return '年度作成'
    case 'member_deleted': return 'メンバー削除'
    case 'member_added': return 'メンバー追加'
    case 'category_added': return 'カテゴリー追加'
    case 'category_edited': return 'カテゴリー編集'
    case 'category_deleted': return 'カテゴリー削除'
    default: return actionType
  }
}

function getSystemActionColor(actionType: string) {
  switch (actionType) {
    case 'archive_created': return 'bg-blue-100 text-blue-800'
    case 'year_deleted': return 'bg-red-100 text-red-800'
    case 'year_edited': return 'bg-yellow-100 text-yellow-800'
    case 'year_created': return 'bg-green-100 text-green-800'
    case 'member_deleted': return 'bg-red-100 text-red-800'
    case 'member_added': return 'bg-green-100 text-green-800'
    case 'category_added': return 'bg-green-100 text-green-800'
    case 'category_edited': return 'bg-yellow-100 text-yellow-800'
    case 'category_deleted': return 'bg-red-100 text-red-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

function renderSystemHistoryDetails(record: any) {
  const details = record.details

  if (record.action_type === 'archive_created') {
    return (
      <div className="space-y-1">
        <p><span className="font-semibold">年度名:</span> {details.fiscal_year_name}</p>
        <p><span className="font-semibold">取引件数:</span> {details.transaction_count}件</p>
        <p><span className="font-semibold">領収書:</span> {details.receipt_count}枚</p>
        {details.failed_receipts > 0 && (
          <p className="text-red-600"><span className="font-semibold">失敗:</span> {details.failed_receipts}枚</p>
        )}
        <p><span className="font-semibold">収入合計:</span> ¥{details.total_income?.toLocaleString()}</p>
        <p><span className="font-semibold">支出合計:</span> ¥{details.total_expense?.toLocaleString()}</p>
        <p><span className="font-semibold">期首残高:</span> ¥{details.starting_balance?.toLocaleString()}</p>
        <p><span className="font-semibold">期末残高:</span> ¥{details.ending_balance?.toLocaleString()}</p>
      </div>
    )
  }

  if (record.action_type === 'year_deleted') {
    return (
      <div className="space-y-1">
        <p><span className="font-semibold">年度名:</span> {details.fiscal_year_name}</p>
        <p><span className="font-semibold">削除された取引:</span> {details.deleted_transaction_count}件</p>
        <p><span className="font-semibold">削除された履歴:</span> {details.deleted_history_count}件</p>
        <p><span className="font-semibold">削除された領収書:</span> {details.deleted_image_count}枚</p>
      </div>
    )
  }

  if (record.action_type === 'year_edited') {
    return (
      <div className="space-y-2">
        <div>
          <span className="font-semibold text-red-600">変更前:</span>
          <div className="ml-4 text-xs space-y-1 mt-1">
            <p>年度名: {details.old_data?.name}</p>
            <p>期間: {details.old_data?.start_date} 〜 {details.old_data?.end_date}</p>
            <p>現金期首残高: ¥{Number(details.old_data?.starting_balance_cash || 0).toLocaleString()}</p>
            <p>銀行期首残高: ¥{Number(details.old_data?.starting_balance_bank || 0).toLocaleString()}</p>
          </div>
        </div>
        <div>
          <span className="font-semibold text-green-600">変更後:</span>
          <div className="ml-4 text-xs space-y-1 mt-1">
            <p>年度名: {details.new_data?.name}</p>
            <p>期間: {details.new_data?.start_date} 〜 {details.new_data?.end_date}</p>
            <p>現金期首残高: ¥{Number(details.new_data?.starting_balance_cash || 0).toLocaleString()}</p>
            <p>銀行期首残高: ¥{Number(details.new_data?.starting_balance_bank || 0).toLocaleString()}</p>
          </div>
        </div>
      </div>
    )
  }

  if (record.action_type === 'member_deleted') {
    return (
      <div className="space-y-1">
        <p><span className="font-semibold">メンバー名:</span> {details.member_name}</p>
        <p><span className="font-semibold">メールアドレス:</span> {details.member_email}</p>
        {details.auth_deletion_failed && (
          <p className="text-red-600"><span className="font-semibold">警告:</span> 認証ユーザーの削除に失敗</p>
        )}
      </div>
    )
  }

  if (record.action_type === 'year_created') {
    return (
      <div className="space-y-1">
        <p><span className="font-semibold">年度名:</span> {details.fiscal_year_name}</p>
        <p><span className="font-semibold">期間:</span> {details.start_date} 〜 {details.end_date}</p>
        <p><span className="font-semibold">現金期首残高:</span> ¥{Number(details.starting_balance_cash || 0).toLocaleString()}</p>
        <p><span className="font-semibold">銀行期首残高:</span> ¥{Number(details.starting_balance_bank || 0).toLocaleString()}</p>
        {details.used_current_balance && (
          <p className="text-blue-600"><span className="font-semibold">※</span> 現在の残高を繰越金として設定</p>
        )}
      </div>
    )
  }

  if (record.action_type === 'category_added') {
    return (
      <div className="space-y-1">
        {details.fiscal_year_name && (
          <p><span className="font-semibold">年度:</span> {details.fiscal_year_name}</p>
        )}
        <p><span className="font-semibold">カテゴリー名:</span> {details.category_name}</p>
        <p><span className="font-semibold">種類:</span> {details.category_type === 'income' ? '収入' : '支出'}</p>
      </div>
    )
  }

  if (record.action_type === 'category_edited') {
    return (
      <div className="space-y-1">
        {details.fiscal_year_name && (
          <p><span className="font-semibold">年度:</span> {details.fiscal_year_name}</p>
        )}
        <p><span className="font-semibold">種類:</span> {details.category_type === 'income' ? '収入' : '支出'}</p>
        <p><span className="font-semibold text-red-600">変更前:</span> {details.old_name}</p>
        <p><span className="font-semibold text-green-600">変更後:</span> {details.new_name}</p>
      </div>
    )
  }

  if (record.action_type === 'category_deleted') {
    return (
      <div className="space-y-1">
        {details.fiscal_year_name && (
          <p><span className="font-semibold">年度:</span> {details.fiscal_year_name}</p>
        )}
        <p><span className="font-semibold">カテゴリー名:</span> {details.category_name}</p>
        <p><span className="font-semibold">種類:</span> {details.category_type === 'income' ? '収入' : '支出'}</p>
        {details.transaction_count !== undefined && (
          <p className={details.transaction_count > 0 ? 'text-orange-600' : 'text-gray-600'}>
            <span className="font-semibold">使用件数:</span> {details.transaction_count}件の取引
            {details.transaction_count > 0 && ' ⚠️'}
          </p>
        )}
      </div>
    )
  }

  return <pre className="text-xs overflow-auto">{JSON.stringify(details, null, 2)}</pre>
}