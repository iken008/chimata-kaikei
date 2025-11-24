'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFiscalYear } from '@/app/contexts/FiscalYearContext'
import { supabase } from '@/lib/supabase'
import AddFiscalYearModal from './AddFiscalYearModal'

type HeaderProps = {
  title: string
  subtitle?: string
  showBack?: boolean
  backPath?: string
  colorFrom?: string
  colorTo?: string
}

export default function Header({
  title,
  subtitle,
  showBack = false,
  backPath = '/',
  colorFrom = 'indigo-500',
  colorTo = 'purple-500',
}: HeaderProps) {
  const router = useRouter()
  const { currentFiscalYear, allFiscalYears, setCurrentFiscalYear, refreshFiscalYears, loading } = useFiscalYear()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentBalance, setCurrentBalance] = useState({ cash: 0, bank: 0 })

  useEffect(() => {
    fetchCurrentBalance()
  }, [])

  const fetchCurrentBalance = async () => {
    const { data } = await supabase
      .from('accounts')
      .select('id, balance')
      .order('id')

    if (data && data.length === 2) {
      setCurrentBalance({
        cash: Number(data[0].balance),
        bank: Number(data[1].balance),
      })
    }
  }

  const handleFiscalYearChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value

    if (value === 'add_new') {
      setIsModalOpen(true)
      // ドロップダウンを元に戻す
      e.target.value = currentFiscalYear?.id.toString() || ''
      return
    }

    const selectedYear = allFiscalYears.find(fy => fy.id === parseInt(value))
    if (selectedYear) {
      await setCurrentFiscalYear(selectedYear)
      window.location.reload()
    }
  }

  const handleModalSuccess = async () => {
    await refreshFiscalYears()
  }

  return (
    <>
      <header className={`bg-gradient-to-r from-${colorFrom} to-${colorTo} text-white shadow-lg`}>
        <div className="container mx-auto max-w-4xl">
          {/* 年度選択バー */}
          <div className="flex justify-between items-center px-4 py-2 border-b border-white/20">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">年度:</span>
              {loading ? (
                <span className="text-sm">読込中...</span>
              ) : (
                <select
                  value={currentFiscalYear?.id || ''}
                  onChange={handleFiscalYearChange}
                  className="bg-white/20 text-white text-sm font-semibold px-3 py-1 rounded border border-white/30 hover:bg-white/30 transition cursor-pointer"
                >
                  {allFiscalYears.map(fy => (
                    <option key={fy.id} value={fy.id} className="text-gray-900">
                      {fy.name}
                    </option>
                  ))}
                  <option value="add_new" className="text-gray-900 font-bold">
                    + 新しい年度を追加
                  </option>
                </select>
              )}
            </div>
            <button
              onClick={() => router.push('/settings')}
              className="text-sm bg-white/20 hover:bg-white/30 px-3 py-1 rounded transition"
            >
              ⚙️ 設定
            </button>
          </div>

          {/* タイトルバー */}
          <div className="flex items-center p-4">
            {showBack && (
              <button
                onClick={() => router.push(backPath)}
                className="mr-4 text-2xl hover:bg-white/20 rounded-lg p-2 transition"
              >
                ←
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold">{title}</h1>
              {subtitle && <p className="text-white/80 text-sm mt-1">{subtitle}</p>}
            </div>
          </div>
        </div>
      </header>

      {/* 年度追加モーダル */}
      <AddFiscalYearModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
        currentBalance={currentBalance}
      />
    </>
  )
}