'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

type FiscalYear = {
  id: number
  name: string
  start_date: string
  end_date: string
  starting_balance_cash: number
  starting_balance_bank: number
  is_current: boolean
}

type FiscalYearContextType = {
  currentFiscalYear: FiscalYear | null
  allFiscalYears: FiscalYear[]
  setCurrentFiscalYear: (fiscalYear: FiscalYear) => void
  refreshFiscalYears: () => Promise<void>
  loading: boolean
}

const FiscalYearContext = createContext<FiscalYearContextType | undefined>(undefined)

export function FiscalYearProvider({ children }: { children: ReactNode }) {
  const [currentFiscalYear, setCurrentFiscalYearState] = useState<FiscalYear | null>(null)
  const [allFiscalYears, setAllFiscalYears] = useState<FiscalYear[]>([])
  const [loading, setLoading] = useState(true)

  const fetchFiscalYears = async () => {
    try {
      const { data, error } = await supabase
        .from('fiscal_years')
        .select('*')
        .order('start_date', { ascending: false })

      if (error) throw error

      setAllFiscalYears(data || [])

      // 現在選択中の年度を取得
      const current = data?.find(fy => fy.is_current) || data?.[0] || null
      setCurrentFiscalYearState(current)
    } catch (error) {
      console.error('Error fetching fiscal years:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFiscalYears()
  }, [])

  const setCurrentFiscalYear = async (fiscalYear: FiscalYear) => {
    try {
      // 全ての年度のis_currentをfalseに
      await supabase
        .from('fiscal_years')
        .update({ is_current: false })
        .neq('id', 0) // 全てのレコード

      // 選択した年度のis_currentをtrueに
      await supabase
        .from('fiscal_years')
        .update({ is_current: true })
        .eq('id', fiscalYear.id)

      setCurrentFiscalYearState(fiscalYear)
      await fetchFiscalYears()
    } catch (error) {
      console.error('Error setting current fiscal year:', error)
    }
  }

  const refreshFiscalYears = async () => {
    await fetchFiscalYears()
  }

  return (
    <FiscalYearContext.Provider
      value={{
        currentFiscalYear,
        allFiscalYears,
        setCurrentFiscalYear,
        refreshFiscalYears,
        loading,
      }}
    >
      {children}
    </FiscalYearContext.Provider>
  )
}

export function useFiscalYear() {
  const context = useContext(FiscalYearContext)
  if (context === undefined) {
    throw new Error('useFiscalYear must be used within a FiscalYearProvider')
  }
  return context
}