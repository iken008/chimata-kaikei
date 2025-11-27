'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useFiscalYear } from '@/app/contexts/FiscalYearContext'
import { useAuth } from '@/app/contexts/AuthContext'
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
  const { userProfile, signOut } = useAuth()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentBalance, setCurrentBalance] = useState({ cash: 0, bank: 0 })
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (currentFiscalYear) {
      fetchCurrentBalance()
    }
  }, [currentFiscalYear])

  // メニュー外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const fetchCurrentBalance = async () => {
    if (!currentFiscalYear) return

    try {
      console.log('🔍 fetchCurrentBalance: currentFiscalYear =', currentFiscalYear)
      console.log('🔍 starting_balance_cash =', currentFiscalYear.starting_balance_cash)
      console.log('🔍 starting_balance_bank =', currentFiscalYear.starting_balance_bank)

      // 口座情報を取得
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
      const cashStart = currentFiscalYear.starting_balance_cash
      const bankStart = currentFiscalYear.starting_balance_bank
      console.log('🔍 cashStart =', cashStart, 'typeof =', typeof cashStart)
      console.log('🔍 bankStart =', bankStart, 'typeof =', typeof bankStart)

      let cashBalance = 0
      let bankBalance = 0

      if (typeof cashStart === 'number') {
        cashBalance = cashStart
      }
      if (typeof bankStart === 'number') {
        bankBalance = bankStart
      }

      (allTransactions || []).forEach(tx => {
        const amount = +tx.amount // 数値に変換

        // 現金（口座ID = 1）
        if (tx.type === 'income' && tx.account_id === 1) {
          cashBalance += amount
        } else if (tx.type === 'expense' && tx.account_id === 1) {
          cashBalance -= amount
        } else if (tx.type === 'transfer') {
          if (tx.from_account_id === 1) {
            cashBalance -= amount
          }
          if (tx.to_account_id === 1) {
            cashBalance += amount
          }
        }

        // 銀行（口座ID = 2）
        if (tx.type === 'income' && tx.account_id === 2) {
          bankBalance += amount
        } else if (tx.type === 'expense' && tx.account_id === 2) {
          bankBalance -= amount
        } else if (tx.type === 'transfer') {
          if (tx.from_account_id === 2) {
            bankBalance -= amount
          }
          if (tx.to_account_id === 2) {
            bankBalance += amount
          }
        }
      })

      setCurrentBalance({
        cash: cashBalance,
        bank: bankBalance,
      })
    } catch (error) {
      console.error('Error fetching current balance:', error)
    }
  }

  const handleFiscalYearChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value

    if (value === 'add_new') {
      setIsModalOpen(true)
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

  const handleMenuItemClick = (action: () => void) => {
    setIsUserMenuOpen(false)
    action()
  }

  // 色のマッピング（Tailwindの動的クラス問題を回避）
  const getGradientClass = (from: string, to: string) => {
    const gradients: { [key: string]: string } = {
      'indigo-500_purple-500': 'bg-gradient-to-r from-indigo-500 to-purple-500',
      'emerald-500_teal-500': 'bg-gradient-to-r from-emerald-500 to-teal-500',
      'violet-500_purple-500': 'bg-gradient-to-r from-violet-500 to-purple-500',
      'amber-500_orange-500': 'bg-gradient-to-r from-amber-500 to-orange-500',
      'indigo-500_indigo-600': 'bg-gradient-to-r from-indigo-500 to-indigo-600',
      'gray-700_gray-800': 'bg-gradient-to-r from-gray-700 to-gray-800',
      'slate-700_slate-800': 'bg-gradient-to-r from-slate-700 to-slate-800',
    }
    
    const key = `${from}_${to}`
    return gradients[key] || 'bg-gradient-to-r from-indigo-500 to-purple-500'
  }

  return (
    <>
      <header className={`${getGradientClass(colorFrom, colorTo)} text-white shadow-lg`}>
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
            
            {/* ユーザーメニュー */}
            {userProfile && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-3 py-1 rounded transition"
                >
                  <span className="text-sm font-semibold hidden sm:inline">
                    {userProfile.name}
                  </span>
                  <span className="text-sm font-semibold sm:hidden">
                    {userProfile.name.charAt(0)}
                  </span>
                  <svg
                    className={`w-4 h-4 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* ドロップダウンメニュー */}
                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl py-2 z-50 border border-gray-200">
                    {/* ユーザー情報 */}
                    <div className="px-4 py-3 border-b border-gray-200">
                      <p className="text-sm font-semibold text-gray-900">{userProfile.name}</p>
                      <p className="text-xs text-gray-500 mt-1">{userProfile.email}</p>
                    </div>

                    {/* メニュー項目 */}
                    <button
                      onClick={() => handleMenuItemClick(() => router.push('/settings'))}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3 transition"
                    >
                      <span className="text-lg">⚙️</span>
                      <span>設定</span>
                    </button>

                    <button
                      onClick={() => handleMenuItemClick(() => router.push('/members'))}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3 transition"
                    >
                      <span className="text-lg">👥</span>
                      <span>メンバー管理</span>
                    </button>

                    <div className="border-t border-gray-200 my-1"></div>

                    <button
                      onClick={() => handleMenuItemClick(signOut)}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition"
                    >
                      <span className="text-lg">🚪</span>
                      <span>ログアウト</span>
                    </button>
                  </div>
                )}
              </div>
            )}
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