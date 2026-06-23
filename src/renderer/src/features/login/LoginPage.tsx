import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app-store'

function formatLoginError(err: unknown): string {
  const message = err instanceof Error ? err.message : '登录失败，请重试'
  if (message.includes('412') || message.includes('request was banned') || message.includes('风控')) {
    return '请求被 B 站安全策略拦截，请稍后重试或更换网络'
  }
  if (message.startsWith('Error invoking remote method')) {
    return '登录服务异常，请重新生成二维码'
  }
  return message
}

export function LoginPage() {
  const navigate = useNavigate()
  const { user, setUser, loadUser } = useAppStore()
  const [checking, setChecking] = useState(true)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [status, setStatus] = useState('正在生成二维码...')
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startLogin = useCallback(async () => {
    stopPoll()
    setError('')
    setQrDataUrl('')
    setStatus('正在生成二维码...')

    try {
      const { url, qrcodeKey } = await window.biliDesk.auth.getQrCode()
      const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1 })
      setQrDataUrl(dataUrl)
      setStatus('请使用 B 站 App 扫码')

      pollRef.current = setInterval(async () => {
        try {
          const result = await window.biliDesk.auth.pollLogin(qrcodeKey)
          if (result.status === 'waiting') setStatus('请使用 B 站 App 扫码')
          if (result.status === 'scanned') setStatus('已扫码，请在手机上确认')
          if (result.status === 'expired') {
            stopPoll()
            setStatus('二维码已过期，正在刷新...')
            void startLogin()
          }
          if (result.status === 'confirmed' && result.user) {
            setStatus('登录成功')
            setUser(result.user)
            stopPoll()
            setTimeout(() => navigate('/'), 800)
          }
          if (result.status === 'failed') {
            stopPoll()
            setError(result.message ?? '登录失败，请重试')
          }
        } catch (pollErr) {
          const message = formatLoginError(pollErr)
          if (message.includes('过期') || message.includes('86038')) {
            stopPoll()
            setStatus('二维码已过期，正在刷新...')
            void startLogin()
            return
          }
          stopPoll()
          setError(message)
        }
      }, 2000)
    } catch (err) {
      setError(formatLoginError(err))
      setStatus('请重试')
    }
  }, [navigate, setUser, stopPoll])

  useEffect(() => {
    void (async () => {
      await loadUser()
      const current = await window.biliDesk.auth.getStatus()
      if (current.isLogin) {
        setUser(current)
        navigate('/', { replace: true })
        return
      }
      setChecking(false)
      void startLogin()
    })()

    return stopPoll
  }, [loadUser, navigate, setUser, startLogin, stopPoll])

  if (checking || user?.isLogin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        检查登录状态...
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
        <div>
          <h1 className="text-2xl font-semibold">
            登录 <span className="text-primary">BiliDesk</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">扫码登录你的 B 站账号</p>
        </div>

        <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-xl bg-white p-3">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="登录二维码" className="h-full w-full" />
          ) : (
            <div className="text-sm text-gray-400">{error ? '生成失败' : '加载中...'}</div>
          )}
        </div>

        <p className="text-sm text-muted-foreground">{status}</p>
        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => navigate('/')}>
            返回首页
          </Button>
          {error && (
            <Button variant="secondary" onClick={() => void startLogin()}>
              重新生成
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
