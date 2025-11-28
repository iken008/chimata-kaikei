'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useFiscalYear } from '../contexts/FiscalYearContext'

type AddFiscalYearModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  currentBalance: { cash: number; bank: number }
}

export default function AddFiscalYearModal({
  isOpen,
  onClose,
  onSuccess,
  currentBalance,
}: AddFiscalYearModalProps) {
  const { userProfile } = useAuth()
  const { currentFiscalYear } = useFiscalYear()
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [useCurrentBalance, setUseCurrentBalance] = useState(true)
  const [cashBalance, setCashBalance] = useState('0')
  const [bankBalance, setBankBalance] = useState('0')
  const [copyCategories, setCopyCategories] = useState(true)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      // デフォルトで次年度を設定
      generateNextYearDates()
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name || !startDate || !endDate) {
      alert('全ての項目を入力してください')
      return
    }

    setLoading(true)

    try {
      const fiscalYearData = {
        name,
        start_date: startDate,
        end_date: endDate,
        starting_balance_cash: useCurrentBalance
          ? currentBalance.cash
          : parseFloat(cashBalance),
        starting_balance_bank: useCurrentBalance
          ? currentBalance.bank
          : parseFloat(bankBalance),
        is_current: false,
      }

      const { data: newFiscalYear, error } = await supabase
        .from('fiscal_years')
        .insert(fiscalYearData)
        .select()
        .single()

      if (error) throw error

      // カテゴリーをコピーまたはデフォルトを作成
      let copiedCategoriesCount = 0
      if (copyCategories && currentFiscalYear) {
        // 前年度からカテゴリーをコピー
        const { data: existingCategories } = await supabase
          .from('categories')
          .select('*')
          .eq('fiscal_year_id', currentFiscalYear.id)
          .order('sort_order')

        if (existingCategories && existingCategories.length > 0) {
          const newCategories = existingCategories.map(cat => ({
            name: cat.name,
            type: cat.type,
            sort_order: cat.sort_order,
            fiscal_year_id: newFiscalYear.id,
          }))

          const { error: categoriesError } = await supabase
            .from('categories')
            .insert(newCategories)

          if (!categoriesError) {
            copiedCategoriesCount = newCategories.length
          } else {
            console.error('Error copying categories:', categoriesError)
          }
        }
      } else {
        // デフォルトカテゴリーを作成
        const defaultCategories = [
          // 収入カテゴリー
          { name: '会費', type: 'income' as const, sort_order: 1, fiscal_year_id: newFiscalYear.id },
          { name: 'イベント参加費', type: 'income' as const, sort_order: 2, fiscal_year_id: newFiscalYear.id },
          { name: '物販収入', type: 'income' as const, sort_order: 3, fiscal_year_id: newFiscalYear.id },
          { name: '寄付・助成金', type: 'income' as const, sort_order: 4, fiscal_year_id: newFiscalYear.id },
          { name: 'その他収入', type: 'income' as const, sort_order: 5, fiscal_year_id: newFiscalYear.id },
          // 支出カテゴリー
          { name: '交通費', type: 'expense' as const, sort_order: 1, fiscal_year_id: newFiscalYear.id },
          { name: '食費', type: 'expense' as const, sort_order: 2, fiscal_year_id: newFiscalYear.id },
          { name: '備品購入', type: 'expense' as const, sort_order: 3, fiscal_year_id: newFiscalYear.id },
          { name: '消耗品費', type: 'expense' as const, sort_order: 4, fiscal_year_id: newFiscalYear.id },
          { name: '会場費', type: 'expense' as const, sort_order: 5, fiscal_year_id: newFiscalYear.id },
          { name: '印刷費', type: 'expense' as const, sort_order: 6, fiscal_year_id: newFiscalYear.id },
          { name: '通信費', type: 'expense' as const, sort_order: 7, fiscal_year_id: newFiscalYear.id },
          { name: 'その他支出', type: 'expense' as const, sort_order: 8, fiscal_year_id: newFiscalYear.id },
        ]

        const { error: categoriesError } = await supabase
          .from('categories')
          .insert(defaultCategories)

        if (!categoriesError) {
          copiedCategoriesCount = defaultCategories.length
        } else {
          console.error('Error creating default categories:', categoriesError)
        }
      }

      // システム履歴に記録
      if (userProfile && newFiscalYear) {
        const categoryDescription = copyCategories && currentFiscalYear
          ? `、カテゴリー${copiedCategoriesCount}件をコピー`
          : copiedCategoriesCount > 0
          ? `、デフォルトカテゴリー${copiedCategoriesCount}件を作成`
          : ''

        await supabase.from('system_history').insert({
          action_type: 'year_created',
          target_type: 'fiscal_year',
          target_id: String(newFiscalYear.id),
          performed_by: userProfile.id,
          details: {
            fiscal_year_name: name,
            start_date: startDate,
            end_date: endDate,
            starting_balance_cash: fiscalYearData.starting_balance_cash,
            starting_balance_bank: fiscalYearData.starting_balance_bank,
            used_current_balance: useCurrentBalance,
            copied_categories: copyCategories,
            categories_count: copiedCategoriesCount,
            used_default_categories: !copyCategories && copiedCategoriesCount > 0,
          },
          description: `年度「${name}」を作成しました（${startDate} 〜 ${endDate}）${categoryDescription}`,
        })
      }

      const successMessage = copyCategories && copiedCategoriesCount > 0
        ? `新しい年度を作成しました！\n\nカテゴリー${copiedCategoriesCount}件を前年度からコピーしました。`
        : copiedCategoriesCount > 0
        ? `新しい年度を作成しました！\n\nデフォルトカテゴリー${copiedCategoriesCount}件（収入5件・支出8件）を作成しました。`
        : '新しい年度を作成しました！'

      alert(successMessage)
      onSuccess()
      onClose()
    } catch (error) {
      console.error('Error creating fiscal year:', error)
      alert('エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const generateNextYearDates = () => {
    const now = new Date()
    const currentMonth = now.getMonth() + 1 // 1-12
    
    // 現在が4月以降なら次年度、3月以前なら今年度
    const fiscalYear = currentMonth >= 4 ? now.getFullYear() + 1 : now.getFullYear()

    setName(`${fiscalYear}年度`)
    setStartDate(`${fiscalYear}-04-01`)
    setEndDate(`${fiscalYear + 1}-03-31`)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">新しい年度を追加</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* 年度名 */}
            <div className="mb-4">
              <label className="block text-gray-700 font-bold mb-2">
                年度名 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 p-3 border border-gray-300 rounded-lg"
                  placeholder="2025年度"
                  required
                />
                <button
                  type="button"
                  onClick={generateNextYearDates}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm"
                >
                  次年度
                </button>
              </div>
            </div>

            {/* 開始日 */}
            <div className="mb-4">
              <label className="block text-gray-700 font-bold mb-2">
                開始日 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg"
                required
              />
            </div>

            {/* 終了日 */}
            <div className="mb-4">
              <label className="block text-gray-700 font-bold mb-2">
                終了日 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg"
                required
              />
            </div>

            {/* カテゴリーコピー設定 */}
            <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={copyCategories}
                  onChange={(e) => setCopyCategories(e.target.checked)}
                  className="mr-2 w-4 h-4"
                />
                <span className="font-semibold text-gray-800">
                  前年度のカテゴリーをコピーする
                </span>
              </label>
              <p className="text-xs text-gray-600 mt-2 ml-6">
                {copyCategories
                  ? '現在の年度のカテゴリーが新年度にコピーされます。'
                  : 'デフォルトカテゴリー（収入5件・支出8件）が作成されます。'}
              </p>
              {!copyCategories && (
                <div className="text-xs text-gray-700 mt-2 ml-6 bg-white p-2 rounded border border-green-300">
                  <p className="font-semibold mb-1">📋 作成されるカテゴリー:</p>
                  <p>【収入】会費、イベント参加費、物販収入、寄付・助成金、その他収入</p>
                  <p>【支出】交通費、食費、備品購入、消耗品費、会場費、印刷費、通信費、その他支出</p>
                </div>
              )}
            </div>

            {/* 繰越金設定 */}
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <label className="flex items-center mb-3">
                <input
                  type="checkbox"
                  checked={useCurrentBalance}
                  onChange={(e) => setUseCurrentBalance(e.target.checked)}
                  className="mr-2 w-4 h-4"
                />
                <span className="font-semibold text-gray-800">
                  現在の残高を繰越金として設定
                </span>
              </label>

              {useCurrentBalance ? (
                <div className="text-sm text-gray-700 space-y-1">
                  <p>現金: {currentBalance.cash.toLocaleString()}円</p>
                  <p>銀行: {currentBalance.bank.toLocaleString()}円</p>
                </div>
              ) : (
                <div className="space-y-3 mt-3">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      現金の繰越金
                    </label>
                    <input
                      type="number"
                      value={cashBalance}
                      onChange={(e) => setCashBalance(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      銀行の繰越金
                    </label>
                    <input
                      type="number"
                      value={bankBalance}
                      onChange={(e) => setBankBalance(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded"
                      placeholder="0"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ボタン */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-bold transition"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-lg font-bold transition disabled:opacity-50"
              >
                {loading ? '作成中...' : '作成'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}