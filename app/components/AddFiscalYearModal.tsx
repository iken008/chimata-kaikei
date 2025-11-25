'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [useCurrentBalance, setUseCurrentBalance] = useState(true)
  const [cashBalance, setCashBalance] = useState('0')
  const [bankBalance, setBankBalance] = useState('0')
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

      const { error } = await supabase
        .from('fiscal_years')
        .insert(fiscalYearData)

      if (error) throw error

      alert('新しい年度を作成しました！')
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