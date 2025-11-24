'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

type Transaction = {
  id: string
  type: string
  amount: number
  description: string
  account_id: number | null
  from_account_id: number | null
  to_account_id: number | null
  receipt_image_url: string | null
  recorded_by: string
}

export default function EditPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [transaction, setTransaction] = useState<Transaction | null>(null)
  
  const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [accountId, setAccountId] = useState('1')
  const [fromAccountId, setFromAccountId] = useState('1')
  const [toAccountId, setToAccountId] = useState('2')
  const [userName, setUserName] = useState('')
  const [receiptImage, setReceiptImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null)

  useEffect(() => {
    fetchTransaction()
  }, [id])

  const fetchTransaction = async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      setTransaction(data)
      setType(data.type)
      setAmount(data.amount.toString())
      setDescription(data.description)
      setAccountId(data.account_id?.toString() || '1')
      setFromAccountId(data.from_account_id?.toString() || '1')
      setToAccountId(data.to_account_id?.toString() || '2')
      setExistingImageUrl(data.receipt_image_url)
    } catch (error) {
      console.error('Error fetching transaction:', error)
      alert('取引の取得に失敗しました')
      router.push('/ledger')
    } finally {
      setLoading(false)
    }
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
    setExistingImageUrl(null)
  }

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, file)

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
    
    if (!amount || !description || !userName) {
      alert('全ての項目を入力してください')
      return
    }

    if (!transaction) return

    setSaving(true)

    try {
      // 画像をアップロード（新しい画像があれば）
      let imageUrl = existingImageUrl
      if (receiptImage) {
        const uploadedUrl = await uploadImage(receiptImage)
        if (!uploadedUrl) {
          alert('画像のアップロードに失敗しました')
          setSaving(false)
          return
        }
        imageUrl = uploadedUrl
      }

      // ユーザーを取得または作成
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

      // 変更前のデータを保存
      const oldData = { ...transaction }

      // 新しいデータ
      const newTransactionData: any = {
        type,
        amount: parseFloat(amount),
        description,
        receipt_image_url: imageUrl,
      }

      if (type === 'transfer') {
        newTransactionData.from_account_id = parseInt(fromAccountId)
        newTransactionData.to_account_id = parseInt(toAccountId)
        newTransactionData.account_id = null
      } else {
        newTransactionData.account_id = parseInt(accountId)
        newTransactionData.from_account_id = null
        newTransactionData.to_account_id = null
      }

      // 残高を元に戻す（古いトランザクション）
      if (oldData.type === 'income') {
        await supabase.rpc('update_balance', {
          account_id: oldData.account_id!,
          change_amount: -oldData.amount,
        })
      } else if (oldData.type === 'expense') {
        await supabase.rpc('update_balance', {
          account_id: oldData.account_id!,
          change_amount: oldData.amount,
        })
      } else if (oldData.type === 'transfer') {
        await supabase.rpc('update_balance', {
          account_id: oldData.from_account_id!,
          change_amount: oldData.amount,
        })
        await supabase.rpc('update_balance', {
          account_id: oldData.to_account_id!,
          change_amount: -oldData.amount,
        })
      }

      // トランザクションを更新
      const { data: updatedTransaction, error: updateError } = await supabase
        .from('transactions')
        .update(newTransactionData)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError

      // 履歴に記録
      await supabase.from('transaction_history').insert({
        transaction_id: id,
        action: 'updated',
        changed_by: userId,
        old_data: oldData,
        new_data: updatedTransaction,
      })

      // 新しい残高を適用
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

      alert('編集しました！')
      router.push('/ledger')
    } catch (error) {
      console.error('Error:', error)
      alert('エラーが発生しました')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <p className="text-xl text-gray-600">読み込み中...</p>
      </div>
    )
  }

  if (!transaction) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <p className="text-xl text-gray-600">取引が見つかりません</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white p-4 shadow-lg">
        <div className="container mx-auto max-w-4xl flex items-center">
          <button onClick={() => router.push('/ledger')} className="mr-4 text-2xl hover:bg-white/20 rounded-lg p-2 transition">
            ←
          </button>
          <div>
            <h1 className="text-2xl font-bold">取引を編集</h1>
            <p className="text-indigo-100 text-sm">変更内容は履歴に記録されます</p>
          </div>
        </div>
      </header>

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
                  onChange={(e) => setType(e.target.value as any)}
                  className="mr-2"
                />
                <span>収入</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="expense"
                  checked={type === 'expense'}
                  onChange={(e) => setType(e.target.value as any)}
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

          {/* 口座選択 */}
          {type !== 'transfer' && (
            <div className="mb-6">
              <label className="block text-gray-700 font-bold mb-2">口座</label>
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

          {/* 移動元・移動先 */}
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

          {/* 領収書画像 */}
          {type === 'expense' && (
            <div className="mb-6">
              <label className="block text-gray-700 font-bold mb-2">
                領収書画像（任意）
              </label>
              
              {!previewUrl && !existingImageUrl ? (
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
                    src={previewUrl || existingImageUrl!}
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

          {/* 編集者名 */}
          <div className="mb-6">
            <label className="block text-gray-700 font-bold mb-2">編集者名</label>
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
            disabled={saving}
            className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold py-4 px-6 rounded-xl shadow-md disabled:bg-gray-400 transition transform hover:scale-105"
          >
            {saving ? '保存中...' : '💾 保存する'}
          </button>
        </form>
      </main>
    </div>
  )
}