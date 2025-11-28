import { ImageResponse } from 'next/og'

// Image metadata
export const size = {
  width: 180,
  height: 180,
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
        }}
      >
        {/* 帳簿アイコン */}
        <div
          style={{
            width: 106,
            height: 120,
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: 6,
            position: 'relative',
            display: 'flex',
          }}
        >
          {/* 背表紙（金色） */}
          <div
            style={{
              width: 8,
              height: 120,
              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
              borderRadius: '6px 0 0 6px',
            }}
          />

          {/* 帳簿の線 */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-around',
              paddingLeft: 13,
              paddingRight: 14,
              paddingTop: 21,
              paddingBottom: 21,
            }}
          >
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                style={{
                  height: 3,
                  background: '#10b981',
                  borderRadius: 2,
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
