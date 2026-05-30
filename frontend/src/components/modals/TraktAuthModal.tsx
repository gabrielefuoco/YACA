'use client';
import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { ExternalLink, Loader2, CheckCircle2 } from 'lucide-react';

interface TraktAuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (token: string, refreshToken: string) => void;
}

export function TraktAuthModal({ open, onClose, onSuccess }: TraktAuthModalProps) {
  const [userCode, setUserCode] = useState('');
  const [verificationUrl, setVerificationUrl] = useState('');
  const [deviceCode, setDeviceCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const countdownRef = useRef(countdown);
  const onSuccessRef = useRef(onSuccess);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    countdownRef.current = countdown;
    onSuccessRef.current = onSuccess;
    onCloseRef.current = onClose;
  }, [countdown, onSuccess, onClose]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError('');
    setSuccess(false);
    setPolling(false);
    api
      .traktDeviceCode()
      .then((data) => {
        setUserCode(data.user_code ?? '');
        setVerificationUrl(data.verification_url ?? 'https://trakt.tv/activate');
        setDeviceCode(data.device_code ?? '');
        setCountdown(data.expires_in ?? 600);
        setPolling(true);
      })
      .catch(() => setError('Errore nella connessione a Trakt'))
      .finally(() => setLoading(false));
  }, [open]);

  // Countdown timer
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [polling]);

  // Polling for token — uses refs so it doesn't restart on countdown/callback changes
  useEffect(() => {
    if (!polling || !deviceCode) return;
    const interval = setInterval(async () => {
      if (countdownRef.current <= 0) {
        clearInterval(interval);
        return;
      }
      try {
        const data = await api.traktDeviceToken(deviceCode);
        if (data.access_token) {
          setSuccess(true);
          setPolling(false);
          onSuccessRef.current(data.access_token, data.refresh_token ?? '');
          setTimeout(() => onCloseRef.current(), 1500);
        }
      } catch { }
    }, 5000);
    return () => clearInterval(interval);
  }, [polling, deviceCode]);

  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;
  const progress = countdown > 0 ? (countdown / 600) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md bg-white text-slate-900 border-slate-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/20 text-red-400">🎬</span>
            <span className="text-xl font-semibold">Connetti Trakt</span>
          </DialogTitle>
          <DialogDescription>
            Autorizza YACA ad accedere al tuo account Trakt
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-slate-500">Connessione a Trakt...</p>
          </div>
        )}

        {success && (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="text-slate-900 font-semibold text-lg">Trakt connesso!</p>
            <p className="text-sm text-slate-500">Reindirizzamento in corso...</p>
          </div>
        )}

        {!loading && !success && userCode && (
          <div className="space-y-5">
            <div className="relative rounded-xl bg-gradient-to-br from-primary/10 to-red-900/10 border border-slate-200 p-6 text-center overflow-hidden">
              <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider font-medium">Il tuo codice di attivazione</p>
              <p className="text-4xl font-mono font-bold tracking-[0.3em] text-primary">{userCode}</p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <div className="h-1.5 flex-1 max-w-[200px] rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-red-600 transition-all duration-1000"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {mins}:{secs.toString().padStart(2, '0')}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
              <ol className="space-y-3 text-sm text-slate-600">
                <li className="flex gap-3 items-start">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</span>
                  <span>Vai su <strong className="text-slate-900">{verificationUrl}</strong></span>
                </li>
                <li className="flex gap-3 items-start">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</span>
                  <span>Inserisci il codice sopra</span>
                </li>
                <li className="flex gap-3 items-start">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">3</span>
                  <span>Autorizza YACA su Trakt</span>
                </li>
              </ol>
            </div>

            <a href={verificationUrl} target="_blank" rel="noopener noreferrer">
              <Button className="w-full bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30" variant="outline">
                <ExternalLink className="h-4 w-4 mr-2" />
                Apri Trakt.tv
              </Button>
            </a>

            {polling && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-1">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                In attesa di autorizzazione...
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 mt-4">
            <p className="text-xs text-red-600 text-center">{error}</p>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <Button variant="ghost" onClick={onClose} className="text-slate-500 hover:text-slate-900">Annulla</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
