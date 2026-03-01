'use client';
import { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    setSuccess(false);
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
    if (!polling || countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [polling, countdown]);

  // Polling for token
  useEffect(() => {
    if (!polling || !deviceCode || countdown <= 0) return;
    const interval = setInterval(async () => {
      try {
        const data = await api.traktDeviceToken(deviceCode);
        if (data.access_token) {
          setSuccess(true);
          setPolling(false);
          onSuccess(data.access_token, data.refresh_token ?? '');
          setTimeout(onClose, 1500);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [polling, deviceCode, countdown, onSuccess, onClose]);

  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>🎬 Connetti Trakt</DialogTitle>
          <DialogDescription>
            Autorizza YACA ad accedere al tuo account Trakt
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-[#8a5aeb]" />
          </div>
        )}

        {success && (
          <div className="flex flex-col items-center py-8 gap-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-400" />
            <p className="text-white font-medium">Trakt connesso con successo!</p>
          </div>
        )}

        {!loading && !success && userCode && (
          <div className="space-y-4">
            <div className="rounded-lg bg-white/5 border border-white/10 p-4 text-center">
              <p className="text-xs text-white/50 mb-2">Il tuo codice di attivazione</p>
              <p className="text-3xl font-mono font-bold tracking-widest text-[#8a5aeb]">{userCode}</p>
              <p className="text-xs text-white/40 mt-2">
                Scade in {mins}:{secs.toString().padStart(2, '0')}
              </p>
            </div>

            <ol className="space-y-2 text-sm text-white/70">
              <li>1. Vai su <strong className="text-white">{verificationUrl}</strong></li>
              <li>2. Inserisci il codice sopra</li>
              <li>3. Autorizza YACA su Trakt</li>
            </ol>

            <a href={verificationUrl} target="_blank" rel="noopener noreferrer">
              <Button className="w-full" variant="outline">
                <ExternalLink className="h-4 w-4 mr-2" />
                Apri Trakt.tv
              </Button>
            </a>

            {polling && (
              <div className="flex items-center justify-center gap-2 text-xs text-white/40">
                <Loader2 className="h-3 w-3 animate-spin" />
                In attesa di autorizzazione...
              </div>
            )}

            {error && <p className="text-xs text-red-400 text-center">{error}</p>}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
