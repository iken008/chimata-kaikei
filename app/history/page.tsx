'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useFiscalYear } from '../contexts/FiscalYearContext'
import Header from '../components/Header'

type Account = {
  id: number
  name: string
}

type HistoryRecord = {
  id: string
  action: string
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
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (currentFiscalYear) {
      fetchData()
    }
  }, [currentFiscalYear])

  const fetchData = async () => {
    if (!currentFiscalYear) return

    try {
      // 口座データを取得
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
        setLoading(false)
        return
      }

      // 履歴データを取得（現在の年度の取引に関連するもののみ）
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
    } catch (error) {
      console.error('Error fetching history:', error)
    } finally {
      setLoading(false)
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
      default: return action
    }
  }

  const getActionColor = (action: string) => {
    switch (action) {
      case 'created': return 'bg-green-100 text-green-800'
      case 'updated': return 'bg-yellow-100 text-yellow-800'
      case 'deleted': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
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

  const renderTransactionData = (data: any) => {
    if (!data) return null

    return (
      <div className="mt-2 p-3 bg-gray-50 rounded text-sm">
        <p><strong>種類:</strong> {getTypeLabel(data.type)}</p>
        <p><strong>金額:</strong> {formatCurrency(data.amount)}</p>
        <p><strong>内容:</strong> {data.description}</p>
        {data.type === 'transfer' ? (
          <p>
            <strong>移動:</strong> {getAccountName(data.from_account_id)} → {getAccountName(data.to_account_id)}
          </p>
        ) : (
          <p><strong>口座:</strong> {getAccountName(data.account_id)}</p>
        )}
      </div>
    )
  }

  const renderChanges = (record: HistoryRecord) => {
    if (record.action === 'created') {
      return (
        <div>
          <p className="font-semibold text-green-700 mb-2">✅ 新規作成</p>
          {renderTransactionData(record.new_data)}
        </div>
      )
    }

    if (record.action === 'deleted') {
      return (
        <div>
          <p className="font-semibold text-red-700 mb-2">❌ 削除された取引</p>
          {renderTransactionData(record.old_data)}
        </div>
      )
    }

    if (record.action === 'updated') {
      return (
        <div>
          <p className="font-semibold text-yellow-700 mb-2">✏️ 変更内容</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="font-semibold text-gray-600 mb-1">変更前:</p>
              {renderTransactionData(record.old_data)}
            </div>
            <div>
              <p className="font-semibold text-gray-600 mb-1">変更後:</p>
              {renderTransactionData(record.new_data)}
            </div>
          </div>
        </div>
      )
    }

    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <p className="text-xl text-gray-600">読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header
        title="操作履歴"
        subtitle="全ての操作を透明に記録"
        showBack={true}
        colorFrom="amber-500"
        colorTo="orange-500"
      />

      <main className="container mx-auto p-4 max-w-4xl">
        {/* 説明 */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded">
          <p className="text-blue-900 font-semibold">🔍 透明性の確保</p>
          <p className="text-blue-800 text-sm mt-1">
            全ての操作（作成・編集・削除）が記録されています。誰が何をしたか、全員が確認できます。
          </p>
        </div>

        {/* 履歴一覧 */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">
            全操作履歴（{history.length}件）
          </h2>

          {history.length === 0 ? (
            <p className="text-gray-500 text-center py-4">履歴がありません</p>
          ) : (
            <div className="space-y-4">
              {history.map((record) => (
                <div
                  key={record.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-semibold px-3 py-1 rounded ${getActionColor(record.action)}`}>
                          {getActionLabel(record.action)}
                        </span>
                        <span className="text-sm text-gray-500">
                          {formatDateTime(record.changed_at)}
                        </span>
                      </div>
                      
                      <p className="font-bold text-lg mb-1">
                        {record.users.name} が{getActionLabel(record.action)}
                      </p>
                      
                      <p className="text-sm text-gray-600">
                        {record.new_data?.description || record.old_data?.description || '取引'}
                        {' - '}
                        {formatCurrency(record.new_data?.amount || record.old_data?.amount || 0)}
                      </p>
                    </div>
                    
                    <button className="text-blue-600 text-sm font-semibold">
                      {expandedId === record.id ? '▼ 閉じる' : '▶ 詳細'}
                    </button>
                  </div>

                  {/* 展開された詳細 */}
                  {expandedId === record.id && (
                    <div className="mt-4 pt-4 border-t">
                      {renderChanges(record)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}