import { X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

function MobileMenu({ isOpen, onClose, navItems, handleSignOut, isSigningOut, logoutError }) {
    const location = useLocation()

    if (!isOpen) return null

    return (
        <div className="mobile-menu-overlay" onClick={onClose}>
            <div className="mobile-menu-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="mobile-menu-header">
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>전체 메뉴</h2>
                    <button className="btn-icon" onClick={onClose} aria-label="메뉴 닫기">
                        <X size={24} />
                    </button>
                </div>

                <div className="mobile-menu-content">
                    <nav className="mobile-menu-nav">
                        {navItems.map((item) => {
                            const isActive = location.pathname === item.path
                            const Icon = item.icon
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={`mobile-menu-item ${isActive ? 'active' : ''}`}
                                    onClick={onClose}
                                >
                                    <div className="mobile-menu-item-icon">
                                        <Icon size={22} />
                                    </div>
                                    <span>{item.name}</span>
                                </Link>
                            )
                        })}
                    </nav>
                </div>

                <div className="mobile-menu-footer">
                    {logoutError && (
                        <div style={{ color: 'var(--accent-primary)', marginBottom: '0.75rem', fontSize: '0.85rem', textAlign: 'center' }}>
                            {logoutError}
                        </div>
                    )}
                    <button
                        type="button"
                        className="mobile-menu-logout"
                        onClick={() => {
                            handleSignOut()
                            onClose()
                        }}
                        disabled={isSigningOut}
                    >
                        {isSigningOut ? '로그아웃 중...' : '로그아웃'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default MobileMenu
