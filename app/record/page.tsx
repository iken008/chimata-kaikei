'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useFiscalYear } from '../contexts/FiscalYearContext'
import { useAuth } from '../contexts/AuthContext'
import ProtectedRoute from '../components/ProtectedRoute'
import Header from '../components/Header'
import Image from 'next/image'
import imageCompression from 'browser-image-compression'

type Category = {
  id: number
  name: string
  type: 'income' | 'expense'
  sort_order: number
}

export default function RecordPage() {
  const router = useRouter()
  const { currentFiscalYear, isPastYear } = useFiscalYear()
  const { userProfile } = useAuth()

  const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense')
  const [incomeCategories, setIncomeCategories] = useState<Category[]>([])
  const [expenseCategories, setExpenseCategories] = useState<Category[]>([])
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [accountId, setAccountId] = useState('1')
  const [fromAccountId, setFromAccountId] = useState('1')
  const [toAccountId, setToAccountId] = useState('2')
  const [loading, setLoading] = useState(false)
  const [receiptImage, setReceiptImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // カテゴリーを取得
  useEffect(() => {
    if (currentFiscalYear) {
      fetchCategories()
    }
  }, [currentFiscalYear])

  // 年度が変更されたら日付を自動設定
  useEffect(() => {
    if (currentFiscalYear) {
      const today = new Date().toISOString().split('T')[0]
      const startDate = currentFiscalYear.start_date
      const endDate = currentFiscalYear.end_date

      // 今日が年度の範囲内なら今日を使う、範囲外なら年度の開始日を使う
      if (today >= startDate && today <= endDate) {
        setTransactionDate(today)
      } else {
        setTransactionDate(startDate)
      }
    }
  }, [currentFiscalYear])

  const fetchCategories = async () => {
    if (!currentFiscalYear) return

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('fiscal_year_id', currentFiscalYear.id)
      .order('sort_order')

    if (error) {
      console.error('Error fetching categories:', error)
      return
    }

    const income = data?.filter(c => c.type === 'income') || []
    const expense = data?.filter(c => c.type === 'expense') || []

    setIncomeCategories(income)
    setExpenseCategories(expense)
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('画像サイズは5MB以下にしてください')
        return
      }

      if (!file.type.startsWith('image/')) {
        alert('画像ファイルを選択してください')
        return
      }

      setReceiptImage(file)
      
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeImage = () => {
    setReceiptImage(null)
    setPreviewUrl(null)
  }

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      console.log('元のファイルサイズ:', (file.size / 1024 / 1024).toFixed(2), 'MB')
      
      const options = {
        maxSizeMB: 0.1,
        maxWidthOrHeight: 1200,
        useWebWorker: true,
        fileType: 'image/jpeg',
      }
      
      const compressedFile = await imageCompression(file, options)
      console.log('圧縮後のファイルサイズ:', (compressedFile.size / 1024).toFixed(2), 'KB')

      const fileExt = 'jpg'
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, compressedFile)

      if (uploadError) throw uploadError

      const { data } = supabase.storage
        .from('receipts')
        .getPublicUrl(filePath)

      return data.publicUrl
    } catch (error) {
      console.error('Error uploading image:', error)
      return null
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // ユーザー情報チェック
    if (!userProfile) {
      alert('ユーザー情報が取得できませんでした')
      return
    }

    // 金額チェック
    if (!amount || parseFloat(amount) <= 0) {
      alert('正しい金額を入力してください')
      return
    }

    // 内容チェック
    if (!description.trim()) {
      alert('内容を入力してください')
      return
    }

    // カテゴリーチェック（収入・支出の場合）
    if (type !== 'transfer' && !category) {
      alert('カテゴリーを選択してください')
      return
    }

    // 口座チェック（移動の場合）
    if (type === 'transfer') {
      if (fromAccountId === toAccountId) {
        alert('同じ口座への移動はできません')
        return
      }
    }

    // 年度期間チェック
    if (!currentFiscalYear) {
      alert('年度が選択されていません')
      return
    }

    const txDate = new Date(transactionDate)
    const startDate = new Date(currentFiscalYear.start_date)
    const endDate = new Date(currentFiscalYear.end_date)

    if (txDate < startDate || txDate > endDate) {
      alert(
        `取引日は年度期間内で指定してください\n\n` +
        `${currentFiscalYear.name}: ${currentFiscalYear.start_date} ～ ${currentFiscalYear.end_date}\n\n` +
        `指定された取引日: ${transactionDate}`
      )
      return
    }

    setLoading(true)

    try {
      // 画像をアップロード
      let imageUrl: string | null = null
      if (receiptImage) {
        imageUrl = await uploadImage(receiptImage)
        if (!imageUrl) {
          alert('画像のアップロードに失敗しました')
          setLoading(false)
          return
        }
      }

      const userId = userProfile.id

      // 取引を記録
      const transactionData: any = {
        type,
        amount: parseFloat(amount),
        description,
        category: type === 'transfer' ? null : category,
        recorded_at: transactionDate,
        recorded_by: userId,
        receipt_image_url: imageUrl,
        fiscal_year_id: currentFiscalYear?.id,
      }

      if (type === 'transfer') {
        transactionData.from_account_id = parseInt(fromAccountId)
        transactionData.to_account_id = parseInt(toAccountId)
      } else {
        transactionData.account_id = parseInt(accountId)
      }

      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .insert(transactionData)
        .select()
        .single()

      if (transactionError) throw transactionError

      // 履歴に記録
      await supabase.from('transaction_history').insert({
        transaction_id: transaction.id,
        action: 'created',
        changed_by: userId,
        new_data: transaction,
      })

      // 口座残高を更新
      if (type === 'income') {
        await supabase.rpc('update_balance', {
          account_id: parseInt(accountId),
          change_amount: parseFloat(amount),
        })
      } else if (type === 'expense') {
        await supabase.rpc('update_balance', {
          account_id: parseInt(accountId),
          change_amount: -parseFloat(amount),
        })
      } else if (type === 'transfer') {
        await supabase.rpc('update_balance', {
          account_id: parseInt(fromAccountId),
          change_amount: -parseFloat(amount),
        })
        await supabase.rpc('update_balance', {
          account_id: parseInt(toAccountId),
          change_amount: parseFloat(amount),
        })
      }

      alert('記録しました！')
      router.push('/')
    } catch (error) {
      console.error('Error:', error)
      alert('エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const currentCategories = type === 'income'
    ? incomeCategories.map(c => c.name)
    : expenseCategories.map(c => c.name)

  return (
    <ProtectedRoute>
      <div className={`min-h-screen ${
        isPastYear
          ? 'bg-gradient-to-br from-gray-200 to-gray-300'
          : 'bg-gradient-to-br from-gray-50 to-gray-100'
      }`}>
        <Header
          title="記録する"
          subtitle="収支・移動を記録"
          showBack={true}
          colorFrom="emerald-500"
          colorTo="teal-500"
        />

        <main className="container mx-auto p-4 max-w-4xl">
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6">
            {/* 種類選択 */}
            <div className="mb-6">
              <label className="block text-gray-700 font-bold mb-2">種類</label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="income"
                    checked={type === 'income'}
                    onChange={(e) => {
                      setType(e.target.value as 'income')
                      setCategory('')
                    }}
                    className="mr-2"
                  />
                  <span>収入</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="expense"
                    checked={type === 'expense'}
                    onChange={(e) => {
                      setType(e.target.value as 'expense')
                      setCategory('')
                    }}
                    className="mr-2"
                  />
                  <span>支出</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="transfer"
                    checked={type === 'transfer'}
                    onChange={(e) => setType(e.target.value as 'transfer')}
                    className="mr-2"
                  />
                  <span>移動（口座間）</span>
                </label>
              </div>
            </div>

            {/* 日付 */}
            <div className="mb-6">
              <label className="block text-gray-700 font-bold mb-2">日付</label>
              <input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                min={currentFiscalYear?.start_date}
                max={currentFiscalYear?.end_date}
                className="w-full p-3 border border-gray-300 rounded-lg"
                required
              />
              {currentFiscalYear && (
                <p className="text-xs text-gray-500 mt-1">
                  📅 {currentFiscalYear.name}の期間: {currentFiscalYear.start_date} ～ {currentFiscalYear.end_date}
                </p>
              )}
            </div>

            {/* カテゴリー（収入・支出の場合のみ） */}
            {type !== 'transfer' && (
              <div className="mb-6">
                <label className="block text-gray-700 font-bold mb-2">
                  カテゴリー <span className="text-red-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="">選択してください</option>
                  {currentCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 金額 */}
            <div className="mb-6">
              <label className="block text-gray-700 font-bold mb-2">
                金額 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg"
                placeholder="1000"
                min="1"
                step="1"
                required
              />
            </div>

            {/* 内容 */}
            <div className="mb-6">
              <label className="block text-gray-700 font-bold mb-2">
                内容 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg"
                placeholder="交通費、会費など"
                required
              />
            </div>

            {/* 現金/銀行口座選択（収入・支出の場合） */}
            {type !== 'transfer' && (
              <div className="mb-6">
                <label className="block text-gray-700 font-bold mb-2">現金/銀行口座</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg"
                >
                  <option value="1">現金</option>
                  <option value="2">ゆうちょ銀行</option>
                </select>
              </div>
            )}

            {/* 移動元・移動先（移動の場合） */}
            {type === 'transfer' && (
              <>
                <div className="mb-6">
                  <label className="block text-gray-700 font-bold mb-2">移動元</label>
                  <select
                    value={fromAccountId}
                    onChange={(e) => setFromAccountId(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg"
                  >
                    <option value="1">現金</option>
                    <option value="2">ゆうちょ銀行</option>
                  </select>
                </div>
                <div className="mb-6">
                  <label className="block text-gray-700 font-bold mb-2">移動先</label>
                  <select
                    value={toAccountId}
                    onChange={(e) => setToAccountId(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg"
                  >
                    <option value="1">現金</option>
                    <option value="2">ゆうちょ銀行</option>
                  </select>
                </div>
              </>
            )}

            {/* 領収書画像アップロード（支出の場合のみ） */}
            {type === 'expense' && (
              <div className="mb-6">
                <label className="block text-gray-700 font-bold mb-2">
                  領収書画像（任意）
                </label>
                
                {!previewUrl ? (
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                      id="receipt-upload"
                    />
                    <label
                      htmlFor="receipt-upload"
                      className="flex items-center justify-center w-full p-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50"
                    >
                      <div className="text-center">
                        <p className="text-4xl mb-2">📷</p>
                        <p className="text-gray-600">クリックして画像を選択</p>
                        <p className="text-sm text-gray-500 mt-1">
                          （5MB以下、JPG/PNG）
                        </p>
                      </div>
                    </label>
                  </div>
                ) : (
                  <div className="relative">
                    <Image
                      src={previewUrl}
                      alt="領収書プレビュー"
                      width={400}
                      height={300}
                      className="w-full h-auto rounded-lg border"
                    />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 記入者（自動） */}
            <div className="mb-6">
              <label className="block text-gray-700 font-bold mb-2">
                記入者
              </label>
              <input
                type="text"
                value={userProfile?.name || ''}
                disabled
                className="w-full p-3 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                ログインユーザーの名前が自動的に記録されます
              </p>
            </div>

            {/* 送信ボタン */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold py-4 px-6 rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition transform hover:scale-105"
            >
              {loading ? '記録中...' : '✅ 記録する'}
            </button>
          </form>
        </main>
      </div>
    </ProtectedRoute>
  )
}