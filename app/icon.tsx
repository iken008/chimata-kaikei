import { ImageResponse } from 'next/og'

// Image metadata
export const size = {
  width: 512,
  height: 512,
}
export const contentType = 'image/png'

// Image generation
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
          borderRadius: 110,
        }}
      >
        {/* 帳簿アイコン */}
        <div
          style={{
            width: 300,
            height: 340,
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: 16,
            position: 'relative',
            display: 'flex',
          }}
        >
          {/* 背表紙（金色） */}
          <div
            style={{
              width: 24,
              height: 340,
              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
              borderRadius: '16px 0 0 16px',
            }}
          />

          {/* 帳簿の線とコンテンツ */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-around',
              paddingLeft: 36,
              paddingRight: 40,
              paddingTop: 60,
              paddingBottom: 60,
            }}
          >
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                style={{
                  height: 8,
                  background: '#10b981',
                  borderRadius: 4,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
