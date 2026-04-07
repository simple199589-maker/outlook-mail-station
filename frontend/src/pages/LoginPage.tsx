import { FormEvent, useEffect, useState } from 'react'

import { getAdminToken, login, setAdminToken } from '@/lib/api'

/**
 * AI by zb: 后台用户登录页。
 */
export function LoginPage() {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (getAdminToken()) {
      window.location.replace('/')
    }
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!username.trim()) {
      setError('请输入用户名')
      return
    }
    if (!password.trim()) {
      setError('请输入密码')
      return
    }

    setLoading(true)
    setError('')
    try {
      const data = await login({ username, password })
      setAdminToken(data.access_token)
      window.location.replace('/')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="brand-mark">Admin</div>
        <h1>后台用户登录</h1>
        <p>使用后台用户名和密码进入站点。</p>
        <label className="login-field">
          <span>用户名</span>
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="请输入用户名"
          />
        </label>
        <label className="login-field">
          <span>密码</span>
          <div className="login-field__input-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
            />
            <button
              className="login-field__toggle"
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
              aria-pressed={showPassword}
              title={showPassword ? '隐藏密码' : '显示密码'}
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 3l18 18" />
                  <path d="M10.7 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a18.7 18.7 0 0 1-3.2 4.2" />
                  <path d="M6.6 6.6A18.7 18.7 0 0 0 2 12s3.6 7 10 7a11 11 0 0 0 4.3-.8" />
                  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </label>
        {error ? <div className="public-error">{error}</div> : null}
        <button className="gradient-button" type="submit" disabled={loading}>
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
    </div>
  )
}
