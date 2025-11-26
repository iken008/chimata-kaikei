'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useFiscalYear } from '../contexts/FiscalYearContext'
import Header from '../components/Header'
import JSZip from 'jszip'
import ProtectedRoute from '../components/ProtectedRoute'

type FiscalYear = {
  id: number
  name: string
  start_date: string
  end_date: string
  starting_balance_cash: number
  starting_balance_bank: number
  is_current: boolean
}

type Category = {
  id: number
  name: string
  type: 'income' | 'expense'
  sort_order: number
}

type SettingsTab = 'fiscal' | 'category' | 'data'

type StorageUsage = {
  databaseSize: number
  storageSize: number
  imageCount: number
}

export default function SettingsPage() {
  const router = useRouter()
  const { allFiscalYears, currentFiscalYear, refreshFiscalYears } = useFiscalYear()
  const [activeTab, setActiveTab] = useState<SettingsTab>('fiscal')
  const [categories, setCategories] = useState<Category[]>([])
  const [editingFiscalYear, setEditingFiscalYear] = useState<number | null>(null)
  const [editingCategory, setEditingCategory] = useState<number | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryType, setNewCategoryType] = useState<'income' | 'expense'>('income')
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null)
  const [loadingUsage, setLoadingUsage] = useState(false)

  useEffect(() => {
    fetchCategories()
  }, [])

  useEffect(() => {
    if (activeTab === 'category') {
      fetchCategories()
    }
  }, [activeTab])

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('type')
      .order('sort_order')

    if (error) {
      console.error('Error fetching categories:', error)
    } else {
      setCategories(data || [])
    }
  }

  const fetchStorageUsage = async () => {
    setLoadingUsage(true)
    try {
      const { count: txCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })

      const { count: historyCount } = await supabase
        .from('transaction_history')
        .select('*', { count: 'exact', head: true })

      // 画像を取得
      const { data: images, error: storageError } = await supabase.storage
        .from('receipts')
        .list()

      // デバッグ：何が返されているか確認
      console.log('Storage list result:', images)
      console.log('Storage error:', storageError)
      console.log('Images length:', images?.length)
      
      // 実際のファイルのみをカウント（フォルダや.emptyFoldersを除外）
      const actualFiles = images?.filter(file => 
        file.name && 
        !file.name.startsWith('.') && 
        file.name !== '.emptyFolderPlaceholder'
      ) || []

      console.log('Actual files:', actualFiles)

      const imageCount = actualFiles.length

      const databaseSize = ((txCount || 0) * 1 + (historyCount || 0) * 2) / 1024
      const storageSize = (imageCount * 100) / 1024

      setStorageUsage({
        databaseSize,
        storageSize,
        imageCount,
      })
    } catch (error) {
      console.error('Error fetching storage usage:', error)
    } finally {
      setLoadingUsage(false)
    }
  }

  const handleUpdateFiscalYear = async (
    fiscalYearId: number,
    name: string,
    startDate: string,
    endDate: string,
    cashBalance: number,
    bankBalance: number
  ) => {
    try {
      const { error } = await supabase
        .from('fiscal_years')
        .update({
          name,
          start_date: startDate,
          end_date: endDate,
          starting_balance_cash: cashBalance,
          starting_balance_bank: bankBalance,
        })
        .eq('id', fiscalYearId)

      if (error) throw error

      alert('年度情報を更新しました')
      await refreshFiscalYears()
      setEditingFiscalYear(null)
    } catch (error) {
      console.error('Error updating fiscal year:', error)
      alert('エラーが発生しました')
    }
  }

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      alert('カテゴリー名を入力してください')
      return
    }

    try {
      const { data: maxData } = await supabase
        .from('categories')
        .select('sort_order')
        .eq('type', newCategoryType)
        .order('sort_order', { ascending: false })
        .limit(1)

      const maxOrder = maxData?.[0]?.sort_order || 0

      const { error } = await supabase
        .from('categories')
        .insert({
          name: newCategoryName,
          type: newCategoryType,
          sort_order: maxOrder + 1,
        })

      if (error) throw error

      alert('カテゴリーを追加しました')
      setNewCategoryName('')
      await fetchCategories()
    } catch (error) {
      console.error('Error adding category:', error)
      alert('エラーが発生しました')
    }
  }

  const handleUpdateCategory = async (categoryId: number, newName: string) => {
    if (!newName.trim()) {
      alert('カテゴリー名を入力してください')
      return
    }

    try {
      const { error } = await supabase
        .from('categories')
        .update({ name: newName })
        .eq('id', categoryId)

      if (error) throw error

      alert('カテゴリー名を更新しました')
      setEditingCategory(null)
      await fetchCategories()
    } catch (error) {
      console.error('Error updating category:', error)
      alert('エラーが発生しました')
    }
  }

  const handleDeleteCategory = async (categoryId: number, categoryName: string) => {
    if (!confirm(`「${categoryName}」を削除しますか？`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId)

      if (error) throw error

      alert('カテゴリーを削除しました')
      await fetchCategories()
    } catch (error) {
      console.error('Error deleting category:', error)
      alert('エラーが発生しました')
    }
  }

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('ja-JP') + '円'
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Header
          title="設定"
          subtitle="年度・カテゴリーの管理"
          showBack={true}
          colorFrom="gray-700"
          colorTo="gray-800"
        />

        <main className="container mx-auto p-4 max-w-4xl">
          {/* タブ */}
          <div className="bg-white rounded-t-xl shadow-md border-b border-gray-200">
            <div className="flex">
              <button
                onClick={() => setActiveTab('fiscal')}
                className={`flex-1 py-3 sm:py-4 px-2 sm:px-6 font-bold text-xs sm:text-base transition ${
                  activeTab === 'fiscal'
                    ? 'bg-white text-indigo-600 border-b-2 border-indigo-600'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="hidden sm:inline">📅 </span>年度管理
              </button>
              <button
                onClick={() => setActiveTab('category')}
                className={`flex-1 py-3 sm:py-4 px-2 sm:px-6 font-bold text-xs sm:text-base transition ${
                  activeTab === 'category'
                    ? 'bg-white text-indigo-600 border-b-2 border-indigo-600'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="hidden sm:inline">🏷️ </span>カテゴリー
              </button>
              <button
                onClick={() => {
                  setActiveTab('data')
                  if (!storageUsage) fetchStorageUsage()
                }}
                className={`flex-1 py-3 sm:py-4 px-2 sm:px-6 font-bold text-xs sm:text-base transition ${
                  activeTab === 'data'
                    ? 'bg-white text-indigo-600 border-b-2 border-indigo-600'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="hidden sm:inline">💾 </span>データ
              </button>
            </div>
          </div>

          {/* コンテンツ */}
          <div className="bg-white rounded-b-xl shadow-md p-6">
            {activeTab === 'fiscal' && (
              <div className="space-y-6">
                {/* 年度一覧 */}
                <div>
                  <h2 className="text-xl font-bold text-gray-800 mb-4">年度一覧</h2>

                  {allFiscalYears.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">年度がありません</p>
                  ) : (
                    <div className="space-y-3">
                      {allFiscalYears.map((fy) => (
                        <div
                          key={fy.id}
                          className={`p-4 rounded-lg border transition ${
                            fy.is_current
                              ? 'bg-indigo-50 border-indigo-300'
                              : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-bold text-lg">{fy.name}</h3>
                                {fy.is_current && (
                                  <span className="bg-indigo-500 text-white text-xs px-2 py-1 rounded">
                                    現在
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-600 space-y-1">
                                <p>📅 期間: {fy.start_date} 〜 {fy.end_date}</p>
                                <p>
                                  💰 期首残高: 現金 {formatCurrency(Number(fy.starting_balance_cash))} / 
                                  銀行 {formatCurrency(Number(fy.starting_balance_bank))}
                                </p>
                              </div>

                              {editingFiscalYear === fy.id ? (
                                <div className="mt-3">
                                  <EditFiscalYearForm
                                    fiscalYear={fy}
                                    onSave={handleUpdateFiscalYear}
                                    onCancel={() => setEditingFiscalYear(null)}
                                  />
                                </div>
                              ) : (
                                <button
                                  onClick={() => setEditingFiscalYear(fy.id)}
                                  className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-semibold"
                                >
                                  編集
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded p-3">
                    <p className="font-semibold mb-1">💡 ヒント</p>
                    <p>年度を削除する場合は、「データ管理」タブから削除してください。</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'category' && (
              <div>
                <h2 className="text-xl font-bold mb-4 text-gray-800">カテゴリー管理</h2>

                {/* 新しいカテゴリーを追加 */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h3 className="font-bold mb-3 text-gray-800">新しいカテゴリーを追加</h3>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <select
                      value={newCategoryType}
                      onChange={(e) => setNewCategoryType(e.target.value as 'income' | 'expense')}
                      className="w-full sm:w-auto p-2 border border-gray-300 rounded"
                    >
                      <option value="income">収入</option>
                      <option value="expense">支出</option>
                    </select>
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="カテゴリー名"
                      className="flex-1 p-2 border border-gray-300 rounded"
                    />
                    <button
                      onClick={handleAddCategory}
                      className="w-full sm:w-auto px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded font-bold"
                    >
                      追加
                    </button>
                  </div>
                </div>

                {/* 収入カテゴリー */}
                <div className="mb-6">
                  <h3 className="font-bold mb-3 text-emerald-700">収入カテゴリー</h3>
                  <div className="space-y-2">
                    {categories
                      .filter((c) => c.type === 'income')
                      .map((category) => (
                        <CategoryItem
                          key={category.id}
                          category={category}
                          isEditing={editingCategory === category.id}
                          onEdit={() => setEditingCategory(category.id)}
                          onSave={(newName) => handleUpdateCategory(category.id, newName)}
                          onCancel={() => setEditingCategory(null)}
                          onDelete={() => handleDeleteCategory(category.id, category.name)}
                        />
                      ))}
                  </div>
                </div>

                {/* 支出カテゴリー */}
                <div>
                  <h3 className="font-bold mb-3 text-rose-700">支出カテゴリー</h3>
                  <div className="space-y-2">
                    {categories
                      .filter((c) => c.type === 'expense')
                      .map((category) => (
                        <CategoryItem
                          key={category.id}
                          category={category}
                          isEditing={editingCategory === category.id}
                          onEdit={() => setEditingCategory(category.id)}
                          onSave={(newName) => handleUpdateCategory(category.id, newName)}
                          onCancel={() => setEditingCategory(null)}
                          onDelete={() => handleDeleteCategory(category.id, category.name)}
                        />
                      ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'data' && (
              <DataManagementView
                storageUsage={storageUsage}
                loadingUsage={loadingUsage}
                onRefreshUsage={fetchStorageUsage}
                allFiscalYears={allFiscalYears}
                currentFiscalYear={currentFiscalYear}
                onDeleteSuccess={refreshFiscalYears}
              />
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}

function EditFiscalYearForm({
  fiscalYear,
  onSave,
  onCancel,
}: {
  fiscalYear: FiscalYear
  onSave: (id: number, name: string, startDate: string, endDate: string, cash: number, bank: number) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(fiscalYear.name)
  const [startDate, setStartDate] = useState(fiscalYear.start_date)
  const [endDate, setEndDate] = useState(fiscalYear.end_date)
  const [cash, setCash] = useState(fiscalYear.starting_balance_cash.toString())
  const [bank, setBank] = useState(fiscalYear.starting_balance_bank.toString())

  return (
    <div className="bg-blue-50 p-4 rounded border border-blue-200">
      <div className="space-y-3 mb-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">年度名</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">開始日</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">終了日</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">現金（期首）</label>
            <input
              type="number"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">銀行（期首）</label>
            <input
              type="number"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
            />
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSave(fiscalYear.id, name, startDate, endDate, parseFloat(cash), parseFloat(bank))}
          className="flex-1 px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded font-bold text-sm"
        >
          保存
        </button>
        <button
          onClick={onCancel}
          className="flex-1 px-3 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded font-bold text-sm"
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}

function CategoryItem({
  category,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onDelete,
}: {
  category: Category
  isEditing: boolean
  onEdit: () => void
  onSave: (newName: string) => void
  onCancel: () => void
  onDelete: () => void
}) {
  const [editName, setEditName] = useState(category.name)

  if (isEditing) {
    return (
      <div className="flex gap-2 p-2 bg-blue-50 rounded border border-blue-200">
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="flex-1 p-2 border border-gray-300 rounded"
        />
        <button
          onClick={() => onSave(editName)}
          className="px-3 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded text-sm font-bold"
        >
          保存
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded text-sm font-bold"
        >
          キャンセル
        </button>
      </div>
    )
  }

  return (
    <div className="flex justify-between items-center p-3 bg-gray-50 rounded border border-gray-200">
      <span className="font-medium text-gray-800">{category.name}</span>
      <div className="flex gap-2">
        <button
          onClick={onEdit}
          className="text-indigo-600 hover:text-indigo-800 text-sm font-semibold"
        >
          編集
        </button>
        <button
          onClick={onDelete}
          className="text-red-500 hover:text-red-700 text-sm font-semibold"
        >
          削除
        </button>
      </div>
    </div>
  )
}

function DataManagementView({
  storageUsage,
  loadingUsage,
  onRefreshUsage,
  allFiscalYears,
  currentFiscalYear,
  onDeleteSuccess,
}: {
  storageUsage: StorageUsage | null
  loadingUsage: boolean
  onRefreshUsage: () => void
  allFiscalYears: any[]
  currentFiscalYear: any
  onDeleteSuccess: () => void
}) {
  const [archiving, setArchiving] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)

  const handleArchiveFiscalYear = async (fiscalYearId: number, fiscalYearName: string) => {
    setArchiving(fiscalYearId)

    try {
      // トランザクションデータを取得
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select(`
          *,
          users (name)
        `)
        .eq('fiscal_year_id', fiscalYearId)
        .order('recorded_at', { ascending: true })

      if (txError) throw txError

      if (!transactions || transactions.length === 0) {
        alert('この年度には取引データがありません')
        setArchiving(null)
        return
      }

      // 口座情報を取得
      const { data: accountsData } = await supabase
        .from('accounts')
        .select('*')
        .order('id')

      const accounts = accountsData || []
      const getAccountName = (accountId: number | null) => {
        const account = accounts.find(a => a.id === accountId)
        return account?.name || '不明'
      }

      // 年度情報を取得（繰越金）
      const { data: fiscalYearData } = await supabase
        .from('fiscal_years')
        .select('*')
        .eq('id', fiscalYearId)
        .single()

      const startingBalance = fiscalYearData 
        ? Number(fiscalYearData.starting_balance_cash) + Number(fiscalYearData.starting_balance_bank)
        : 0

      // 領収書番号のマッピングを作成
      let receiptCounter = 1
      const receiptNoMap = new Map<string, number>()
      const imageFileNameMap = new Map<string, string>()

      transactions.forEach((t: any) => {
        if (t.receipt_image_url) {
          const imageFileName = new URL(t.receipt_image_url).pathname.split('/').pop() || ''
          if (!receiptNoMap.has(imageFileName)) {
            const receiptNo = receiptCounter++
            receiptNoMap.set(imageFileName, receiptNo)
            const ext = imageFileName.split('.').pop() || 'jpg'
            imageFileNameMap.set(imageFileName, `領収書${receiptNo}.${ext}`)
          }
        }
      })

      // === 1. 提出用CSV（出納帳形式）を作成 ===
      const submitHeader = 'No,年,月,日,分類,摘要,領収書No,借方金額（収入）,貸方金額（支出）,差引残高\n'
      const carryForwardRow = `,,,,繰越,,,,${startingBalance}\n`
      let balance = startingBalance

      const submitRows = transactions.map((t: any, index: number) => {
        const date = new Date(t.recorded_at)
        const year = String(date.getFullYear()).slice(-2)
        const month = date.getMonth() + 1
        const day = date.getDate()
        
        let category = ''
        if (t.type === 'income') {
          category = `(入)${t.category || '収入'}`
        } else if (t.type === 'expense') {
          category = `(出)${t.category || '支出'}`
        } else {
          category = '(移)移動'
        }

        let description = t.description
        if (t.type === 'transfer') {
          const fromAccount = getAccountName(t.from_account_id)
          const toAccount = getAccountName(t.to_account_id)
          description = `${t.description} (${fromAccount}→${toAccount})`
        } else {
          const accountName = getAccountName(t.account_id)
          description = `${t.description} [${accountName}]`
        }

        let receiptNo = ''
        if (t.receipt_image_url) {
          const imageFileName = new URL(t.receipt_image_url).pathname.split('/').pop() || ''
          receiptNo = String(receiptNoMap.get(imageFileName) || '')
        }

        let debit = ''
        let credit = ''
        
        if (t.type === 'income') {
          debit = String(t.amount)
          balance += Number(t.amount)
        } else if (t.type === 'expense') {
          credit = String(t.amount)
          balance -= Number(t.amount)
        }

        return `${index + 1},${year},${month},${day},${category},${description},${receiptNo},${debit},${credit},${balance}`
      }).join('\n')

      const submitCsvContent = '\uFEFF' + submitHeader + carryForwardRow + submitRows

      // === 2. 完全版CSV（全データ）を作成 ===
      const fullHeader = '取引ID,日付,時刻,種類,カテゴリー,金額,内容,口座,記入者,領収書No,領収書ファイル名,記録日時\n'
      const fullRows = transactions.map((t: any) => {
        const date = new Date(t.recorded_at)
        const dateStr = date.toLocaleDateString('ja-JP')
        const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
        const type = t.type === 'income' ? '収入' : t.type === 'expense' ? '支出' : '移動'
        const category = t.category || ''
        const amount = t.amount
        const description = t.description
        
        let account = ''
        if (t.type === 'transfer') {
          account = `${getAccountName(t.from_account_id)}→${getAccountName(t.to_account_id)}`
        } else {
          account = getAccountName(t.account_id)
        }
        
        const user = t.users?.name || ''
        
        let receiptNo = ''
        let newImageFileName = ''
        if (t.receipt_image_url) {
          const originalFileName = new URL(t.receipt_image_url).pathname.split('/').pop() || ''
          receiptNo = String(receiptNoMap.get(originalFileName) || '')
          newImageFileName = imageFileNameMap.get(originalFileName) || ''
        }
        
        const recordedAt = new Date(t.recorded_at).toLocaleString('ja-JP')

        return `${t.id},${dateStr},${timeStr},${type},${category},${amount},${description},${account},${user},${receiptNo},${newImageFileName},${recordedAt}`
      }).join('\n')

      const fullCsvContent = '\uFEFF' + fullHeader + fullRows

      // === 3. 決算報告書CSV を作成 ===
      const incomeSummary: { [key: string]: number } = {}
      const expenseSummary: { [key: string]: number } = {}
      let totalIncome = 0
      let totalExpense = 0

      transactions.forEach((t: any) => {
        if (t.type === 'income') {
          const category = t.category || 'その他'
          incomeSummary[category] = (incomeSummary[category] || 0) + Number(t.amount)
          totalIncome += Number(t.amount)
        } else if (t.type === 'expense') {
          const category = t.category || 'その他'
          expenseSummary[category] = (expenseSummary[category] || 0) + Number(t.amount)
          totalExpense += Number(t.amount)
        }
      })

      const endingBalance = startingBalance + totalIncome - totalExpense

      let statementCsv = '\uFEFF'
      statementCsv += '1. 収入\n'
      statementCsv += '項目,金額,備考\n'
      
      Object.entries(incomeSummary).forEach(([category, amount]) => {
        statementCsv += `${category},${amount},\n`
      })
      
      statementCsv += `前年度からの繰越金,${startingBalance},\n`
      const totalIncomeWithCarryover = totalIncome + startingBalance
      statementCsv += `合計,${totalIncomeWithCarryover},\n`
      statementCsv += '\n'
      
      statementCsv += '2. 支出\n'
      statementCsv += '項目,金額,備考\n'
      
      Object.entries(expenseSummary).forEach(([category, amount]) => {
        statementCsv += `${category},${amount},\n`
      })
      
      statementCsv += `次年度への繰越金,${endingBalance},\n`
      const totalExpenseWithCarryover = totalExpense + endingBalance
      statementCsv += `合計,${totalExpenseWithCarryover},\n`
      statementCsv += '\n'
      statementCsv += '★収入と支出が同額となるよう作成してください。\n'

      // ZIPファイルを作成
      const zip = new JSZip()
      zip.file('出納帳_提出用.csv', submitCsvContent)
      zip.file('取引データ_完全版.csv', fullCsvContent)
      zip.file('決算報告書.csv', statementCsv)

      const readme = 
        `【アーカイブ内容】\n\n` +
        `1. 出納帳_提出用.csv\n` +
        `   - 会計年末調整用の提出フォーマット\n` +
        `   - そのまま提出可能\n\n` +
        `2. 決算報告書.csv\n` +
        `   - カテゴリー別集計レポート\n` +
        `   - 収支計算書形式\n\n` +
        `3. 取引データ_完全版.csv\n` +
        `   - 全ての情報を含む完全なデータ\n` +
        `   - 内部管理・復元用\n` +
        `   - 記入者、取引ID、領収書Noなどを含む\n\n` +
        `4. 領収書フォルダ\n` +
        `   - 領収書画像ファイル\n` +
        `   - ファイル名: 領収書1.jpg, 領収書2.jpg...\n` +
        `   - 完全版CSVの「領収書No」列と対応\n\n` +
        `${fiscalYearName}\n` +
        `取引件数: ${transactions.length}件\n` +
        `収入合計: ¥${totalIncome.toLocaleString()}\n` +
        `支出合計: ¥${totalExpense.toLocaleString()}\n` +
        `期首残高: ¥${startingBalance.toLocaleString()}\n` +
        `期末残高: ¥${endingBalance.toLocaleString()}\n` +
        `作成日時: ${new Date().toLocaleString('ja-JP')}\n`

      zip.file('README.txt', readme)

      const imagesWithUrls = transactions?.filter((t: any) => t.receipt_image_url) || []

      if (imagesWithUrls.length > 0) {
        alert(
          `アーカイブを作成しています...\n\n` +
          `取引データ: ${transactions.length}件\n` +
          `領収書画像: ${imagesWithUrls.length}枚\n\n` +
          `画像のダウンロード中です。しばらくお待ちください。`
        )

        const receiptsFolder = zip.folder('領収書')
        let successCount = 0
        let failCount = 0
        const processedFiles = new Set<string>()

        for (const transaction of imagesWithUrls) {
          try {
            const imageUrl = transaction.receipt_image_url
            const originalFileName = new URL(imageUrl).pathname.split('/').pop() || ''
            
            if (processedFiles.has(originalFileName)) {
              continue
            }
            processedFiles.add(originalFileName)

            const newFileName = imageFileNameMap.get(originalFileName) || originalFileName

            const response = await fetch(imageUrl)
            if (!response.ok) throw new Error('Image fetch failed')

            const blob = await response.blob()
            receiptsFolder?.file(newFileName, blob)
            successCount++
          } catch (error) {
            console.error('Error downloading image:', error)
            failCount++
          }
        }

        const zipBlob = await zip.generateAsync({ 
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        })
        
        const zipLink = document.createElement('a')
        const zipUrl = URL.createObjectURL(zipBlob)
        zipLink.setAttribute('href', zipUrl)
        zipLink.setAttribute('download', `${fiscalYearName}_アーカイブ.zip`)
        zipLink.style.visibility = 'hidden'
        document.body.appendChild(zipLink)
        zipLink.click()
        document.body.removeChild(zipLink)

        if (failCount > 0) {
          alert(
            `アーカイブが完了しました！\n\n` +
            `📦 ${fiscalYearName}_アーカイブ.zip\n\n` +
            `含まれる内容：\n` +
            `✅ 出納帳_提出用.csv\n` +
            `✅ 決算報告書.csv\n` +
            `✅ 取引データ_完全版.csv\n` +
            `✅ 領収書フォルダ (${successCount}枚)\n` +
            `✅ README.txt\n` +
            `⚠️ ダウンロード失敗: ${failCount}枚`
          )
        } else {
          alert(
            `アーカイブが完了しました！\n\n` +
            `📦 ${fiscalYearName}_アーカイブ.zip\n\n` +
            `含まれる内容：\n` +
            `✅ 出納帳_提出用.csv（年末調整用）\n` +
            `✅ 決算報告書.csv（収支計算書）\n` +
            `✅ 取引データ_完全版.csv（内部管理用）\n` +
            `✅ 領収書フォルダ (${successCount}枚)\n` +
            `   ファイル名: 領収書1.jpg, 領収書2.jpg...\n` +
            `✅ README.txt（説明ファイル）`
          )
        }
      } else {
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        
        const zipLink = document.createElement('a')
        const zipUrl = URL.createObjectURL(zipBlob)
        zipLink.setAttribute('href', zipUrl)
        zipLink.setAttribute('download', `${fiscalYearName}_アーカイブ.zip`)
        zipLink.style.visibility = 'hidden'
        document.body.appendChild(zipLink)
        zipLink.click()
        document.body.removeChild(zipLink)

        alert(
          `アーカイブが完了しました！\n\n` +
          `📦 ${fiscalYearName}_アーカイブ.zip\n\n` +
          `含まれる内容：\n` +
          `✅ 出納帳_提出用.csv（年末調整用）\n` +
          `✅ 決算報告書.csv（収支計算書）\n` +
          `✅ 取引データ_完全版.csv（内部管理用）\n` +
          `✅ README.txt（説明ファイル）\n` +
          `（この年度には領収書画像がありません）`
        )
      }

    } catch (error) {
      console.error('Error archiving:', error)
      alert('エラーが発生しました')
    } finally {
      setArchiving(null)
    }
  }

  const handleDeleteFiscalYearData = async (fiscalYearId: number, fiscalYearName: string) => {
    if (!confirm(
      `${fiscalYearName}のデータを完全に削除しますか？\n\n` +
      `削除されるデータ：\n` +
      `- 全ての取引データ\n` +
      `- 全ての履歴データ\n` +
      `- 全ての領収書画像\n\n` +
      `⚠️ この操作は取り消せません！\n` +
      `事前にアーカイブを作成することを強く推奨します。`
    )) {
      return
    }

    if (!confirm('本当に削除しますか？最終確認です。')) {
      return
    }

    setDeleting(fiscalYearId)

    try {
      const { data: transactions } = await supabase
        .from('transactions')
        .select('receipt_image_url')
        .eq('fiscal_year_id', fiscalYearId)

      const imageUrls = transactions
        ?.filter((t: any) => t.receipt_image_url)
        .map((t: any) => {
          const url = new URL(t.receipt_image_url)
          return url.pathname.split('/').pop()
        })
        .filter(Boolean) || []

      if (imageUrls.length > 0) {
        await supabase.storage
          .from('receipts')
          .remove(imageUrls as string[])
      }

      const { data: txIds } = await supabase
        .from('transactions')
        .select('id')
        .eq('fiscal_year_id', fiscalYearId)

      const ids = txIds?.map(t => t.id) || []

      if (ids.length > 0) {
        await supabase
          .from('transaction_history')
          .delete()
          .in('transaction_id', ids)
      }

      await supabase
        .from('transactions')
        .delete()
        .eq('fiscal_year_id', fiscalYearId)

      await supabase
        .from('fiscal_years')
        .delete()
        .eq('id', fiscalYearId)

      alert('データを削除しました')
      onDeleteSuccess()
      onRefreshUsage()

      if (currentFiscalYear?.id === fiscalYearId) {
        window.location.href = '/'
      }
    } catch (error) {
      console.error('Error deleting:', error)
      alert('エラーが発生しました')
    } finally {
      setDeleting(null)
    }
  }

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('ja-JP') + '円'
  }

  return (
    <div className="space-y-6">
      {/* 警告文を追加 */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-bold mb-2 text-yellow-900 flex items-center gap-2">
          <span className="text-xl">⚠️</span>
          年度の削除について
        </h3>
        <p className="text-sm text-yellow-800">
          年度を削除する場合は、<strong>必ず先にアーカイブを作成</strong>してください。
          削除したデータは復元できません。
        </p>
      </div>

      {/* 容量使用状況 */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">容量使用状況</h2>
          <button
            onClick={onRefreshUsage}
            disabled={loadingUsage}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold"
          >
            🔄 更新
          </button>
        </div>

        {loadingUsage ? (
          <p className="text-gray-500 text-center py-4">読み込み中...</p>
        ) : storageUsage ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <p className="text-sm text-blue-700 font-semibold mb-1">データベース</p>
              <p className="text-2xl font-bold text-blue-600">
                {storageUsage.databaseSize.toFixed(1)} MB
              </p>
              <p className="text-xs text-blue-600 mt-1">上限: 500 MB</p>
              <div className="mt-2 bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${Math.min((storageUsage.databaseSize / 500) * 100, 100)}%` }}
                />
              </div>
            </div>

            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <p className="text-sm text-green-700 font-semibold mb-1">ストレージ（画像）</p>
              <p className="text-2xl font-bold text-green-600">
                {storageUsage.storageSize.toFixed(1)} MB
              </p>
              <p className="text-xs text-green-600 mt-1">上限: 1024 MB</p>
              <div className="mt-2 bg-green-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full"
                  style={{ width: `${Math.min((storageUsage.storageSize / 1024) * 100, 100)}%` }}
                />
              </div>
            </div>

            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <p className="text-sm text-purple-700 font-semibold mb-1">領収書画像</p>
              <p className="text-2xl font-bold text-purple-600">
                {storageUsage.imageCount} 枚
              </p>
              <p className="text-xs text-purple-600 mt-1">
                平均 {storageUsage.imageCount > 0 ? ((storageUsage.storageSize * 1024) / storageUsage.imageCount).toFixed(0) : 0} KB/枚
              </p>
            </div>
          </div>
        ) : (
          <button
            onClick={onRefreshUsage}
            className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-bold"
          >
            容量を確認する
          </button>
        )}
      </div>

      {/* アーカイブと削除 */}
      <div>
        <h2 className="text-xl font-bold mb-4 text-gray-800">年度別データ管理</h2>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-yellow-800">
            💡 <strong>推奨：</strong>前年度と今年度のみ保持し、古い年度はアーカイブ後に削除することで容量を節約できます。
          </p>
        </div>

        <div className="space-y-4">
          {allFiscalYears.map((fy) => (
            <div
              key={fy.id}
              className={`border rounded-lg p-4 ${
                fy.id === currentFiscalYear?.id
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">
                    {fy.name}
                    {fy.id === currentFiscalYear?.id && (
                      <span className="ml-2 text-xs bg-indigo-500 text-white px-2 py-1 rounded">
                        現在
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {fy.start_date} 〜 {fy.end_date}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => handleArchiveFiscalYear(fy.id, fy.name)}
                    disabled={archiving === fy.id}
                    className="w-full sm:w-auto px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded font-bold text-sm disabled:bg-gray-400"
                  >
                    {archiving === fy.id ? '処理中...' : '📦 アーカイブ'}
                  </button>

                  {allFiscalYears.length > 1 && fy.id !== currentFiscalYear?.id && (
                    <button
                      onClick={() => handleDeleteFiscalYearData(fy.id, fy.name)}
                      disabled={deleting === fy.id}
                      className="w-full sm:w-auto px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded font-bold text-sm disabled:bg-gray-400"
                    >
                      {deleting === fy.id ? '削除中...' : '🗑️ 完全削除'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 説明 */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="font-bold mb-2 text-gray-800">📖 使い方</h3>
        <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
          <li><strong>アーカイブ：</strong>年度データをZIPファイルでダウンロード（CSV+画像）</li>
          <li><strong>完全削除：</strong>データベースとストレージから完全に削除（容量を解放）</li>
          <li><strong>推奨運用：</strong>古い年度は「アーカイブ → 削除」の順で実行</li>
        </ol>
      </div>
    </div>
  )
}