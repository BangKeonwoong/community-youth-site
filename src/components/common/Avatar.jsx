export default function Avatar({ name, size = 38, className = '', style = {} }) {
    const initial = name?.charAt(0) || '👤'

    return (
        <div
            className={`avatar-placeholder ${className}`}
            style={{
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: '50%',
                backgroundColor: 'var(--accent-light)',
                color: 'var(--accent-primary)',
                border: '1px solid var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                fontSize: `${Math.round(size * 0.4)}px`,
                flexShrink: 0,
                ...style
            }}
            title={name || '사용자'}
        >
            {initial}
        </div>
    )
}
