import { FormEvent, useEffect, useState } from 'react'

import { apiFetch, getAdminToken, setAdminToken } from '@/lib/api'


/**
 * AI by zb: 管理员登录页。
 */
export function LoginPage() {
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
    if (!password.trim()) {
      setError('请输入管理员密码')
      return
    }

    setLoading(true)
    setError('')
    try {
      const data = await apiFetch<{ access_token: string }>('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
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
        <h1>管理员登录</h1>
        <p>输入环境变量里配置的后台密码后进入站点。</p>
        <label className="login-field">
          <span>管理员密码</span>
          <div className="login-field__input-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入管理员密码"
            />
            <button
              className="login-field__toggle"
              type="button"
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? '隐藏' : '显示'}
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
