'use client'

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useFiscalYear } from '../contexts/FiscalYearContext'
import Header from '../components/Header'
import Image from 'next/image'
import imageCompression from 'browser-image-compression'

// カテゴリー定義
const INCOME_CATEGORIES = [
  '会費',
  '寄付',
  '助成金',
  'イベント収入',
  'その他収入',
]

const EXPENSE_CATEGORIES = [
  '交通費',
  '食費',
  '備品購入',
  '会場費',
  '印刷費',
  '通信費',
  'イベント費用',
  'その他支出',
]

export default function RecordPage() {
  const router = useRouter()
  const { currentFiscalYear } = useFiscalYear() 
  const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split('T')[0] // 今日の日付をデフォルト
  )
  const [accountId, setAccountId] = useState('1')
  const [fromAccountId, setFromAccountId] = useState('1')
  const [toAccountId, setToAccountId] = useState('2')
  const [userName, setUserName] = useState('')
  const [loading, setLoading] = useState(false)
  const [receiptImage, setReceiptImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

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
      // 画像を圧縮
      console.log('元のファイルサイズ:', (file.size / 1024 / 1024).toFixed(2), 'MB')
      
      const options = {
        maxSizeMB: 0.1, // 最大100KB
        maxWidthOrHeight: 1200, // 最大幅/高さ
        useWebWorker: true,
        fileType: 'image/jpeg', // JPEGに変換
      }
      
      const compressedFile = await imageCompression(file, options)
      console.log('圧縮後のファイルサイズ:', (compressedFile.size / 1024).toFixed(2), 'KB')

      // ファイル名をユニークにする
      const fileExt = 'jpg' // 常にJPEG
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `${fileName}`

      // Supabase Storageにアップロード
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, compressedFile)

      if (uploadError) throw uploadError

      // 公開URLを取得
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
    
    if (!amount || !description || !userName || !transactionDate) {
      alert('全ての項目を入力してください')
      return
    }

    if (type !== 'transfer' && !category) {
      alert('カテゴリーを選択してください')
      return
    }

    setLoading(true)

    try {
      // 画像をアップロード（あれば）
      let imageUrl: string | null = null
      if (receiptImage) {
        imageUrl = await uploadImage(receiptImage)
        if (!imageUrl) {
          alert('画像のアップロードに失敗しました')
          setLoading(false)
          return
        }
      }

      // ユーザーを作成または取得
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('name', userName)
        .single()

      let userId = existingUser?.id

      if (!userId) {
        const { data: newUser, error: userError } = await supabase
          .from('users')
          .insert({ name: userName, email: `${userName}@temp.com` })
          .select('id')
          .single()

        if (userError) throw userError
        userId = newUser.id
      }

      // 取引を記録
      const transactionData: any = {
        type,
        amount: parseFloat(amount),
        description,
        category: type === 'transfer' ? null : category,
        transaction_date: transactionDate,
        recorded_by: userId,
        receipt_image_url: imageUrl,
        fiscal_year_id: currentFiscalYear?.id,  // ←この行を追加
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

  const currentCategories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
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
                    setType(e.target.value as any)
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
                    setType(e.target.value as any)
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
                  onChange={(e) => setType(e.target.value as any)}
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
              className="w-full p-3 border border-gray-300 rounded-lg"
              required
            />
          </div>

          {/* カテゴリー（収入・支出の場合のみ） */}
          {type !== 'transfer' && (
            <div className="mb-6">
              <label className="block text-gray-700 font-bold mb-2">カテゴリー</label>
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
            <label className="block text-gray-700 font-bold mb-2">金額</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg"
              placeholder="1000"
              required
            />
          </div>

          {/* 内容 */}
          <div className="mb-6">
            <label className="block text-gray-700 font-bold mb-2">内容</label>
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

          {/* 記入者 */}
          <div className="mb-6">
            <label className="block text-gray-700 font-bold mb-2">記入者</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg"
              placeholder="山田太郎"
              required
            />
          </div>

          {/* 送信ボタン */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold py-4 px-6 rounded-xl shadow-md disabled:bg-gray-400 transition transform hover:scale-105"
          >
            {loading ? '記録中...' : '✅ 記録する'}
          </button>
        </form>
      </main>
    </div>
  )
}