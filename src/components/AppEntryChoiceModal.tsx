import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Download,
  Globe,
  CheckCircle2,
  ExternalLink,
  ArrowRight,
  Loader2,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { AppLogo } from './AppLogo';

interface AppEntryChoiceModalProps {
  isOpen: boolean;
  onContinueInChrome: () => void;
  onClose?: () => void;
  autoPromptInstall?: boolean;
}

export const AppEntryChoiceModal: React.FC<AppEntryChoiceModalProps> = ({
  isOpen,
  onContinueInChrome,
  onClose,
  autoPromptInstall = false,
}) => {
  const {
    isInstallable,
    isInstalled,
    isAlreadyOnDevice,
    isInIframe,
    isInstalling,
    installWithOutcome,
  } = usePWAInstall();

  const [installSuccess, setInstallSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const hasAutoPromptedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setInstallSuccess(false);
      setStatusMessage(null);
      hasAutoPromptedRef.current = false;
    }
  }, [isOpen]);

  // Jika aplikasi tiba-tiba terpasang saat modal terbuka, langsung tandai sukses dan masuk
  useEffect(() => {
    if (isOpen && isInstalled && !installSuccess) {
      setInstallSuccess(true);
      const timer = setTimeout(() => {
        onContinueInChrome();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isInstalled, installSuccess, onContinueInChrome]);

  // Jika dibuka melalui tautan instalasi langsung (?action=install) di tab penuh Chrome,
  // langsung picu dialog instalasi native begitu prompt browser siap
  useEffect(() => {
    if (isOpen && autoPromptInstall && isInstallable && !hasAutoPromptedRef.current && !isInIframe) {
      hasAutoPromptedRef.current = true;
      installWithOutcome().then((outcome) => {
        if (outcome === 'accepted') {
          setInstallSuccess(true);
          setTimeout(() => {
            onContinueInChrome();
          }, 1100);
        }
      });
    }
  }, [isOpen, autoPromptInstall, isInstallable, isInIframe, installWithOutcome, onContinueInChrome]);

  if (!isOpen) return null;

  const topLevelInstallUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/?action=install` : '/?action=install';

  const handleDownloadAppClick = async () => {
    setStatusMessage(null);

    if (isAlreadyOnDevice) {
      setInstallSuccess(true);
      setTimeout(() => {
        onContinueInChrome();
      }, 1000);
      return;
    }

    const outcome = await installWithOutcome();
    if (outcome === 'accepted') {
      setInstallSuccess(true);
      setTimeout(() => {
        onContinueInChrome();
      }, 1100);
      return;
    }

    if (outcome === 'dismissed') {
      setStatusMessage('Instalasi dibatalkan. Klik "Download Aplikasi" lagi atau pilih "Lanjutkan di Chrome".');
      return;
    }

    setStatusMessage(
      'Browser belum menampilkan dialog instalasi otomatis pada sesi ini. Pastikan tidak dalam mode Samaran/Incognito dan klik ikon Instal di bilah alamat Chrome, atau lanjutkan di Chrome.'
    );
  };

  return (
    <AnimatePresence>
      <div
        id="modal-entry-choice"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-choice-title"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="w-full max-w-md rounded-[28px] bg-white dark:bg-[#0F172A] text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-[0_24px_64px_rgba(0,0,0,0.38)] overflow-hidden relative"
        >
          {/* Close button */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup pilihan masuk"
              className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center gap-3.5">
            <AppLogo size="md" />
            <div className="pr-6">
              <h2
                id="entry-choice-title"
                className="text-lg font-bold tracking-tight text-slate-900 dark:text-white"
              >
                Masuk ke Ascend Journal
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pilih cara Anda ingin menggunakan aplikasi sekarang
              </p>
            </div>
          </div>

          {/* Body: 2 Main Options */}
          <div className="p-6 space-y-3.5">
            {installSuccess ? (
              <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center space-y-2.5">
                <div className="w-11 h-11 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                  Aplikasi Berhasil Diunduh &amp; Dipasang!
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-300/90">
                  Ascend Journal kini terinstal di perangkat Anda. Membuka dashboard...
                </p>
                <button
                  type="button"
                  onClick={onContinueInChrome}
                  className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>Masuk Sekarang</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                {/* Opsi 1: Download Aplikasi (Langsung memicu instalasi aplikasi, tanpa tips manual) */}
                {isInIframe && !isInstallable ? (
                  <a
                    id="btn-entry-download-app"
                    href={topLevelInstallUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block w-full text-left p-4 rounded-2xl bg-gradient-to-br from-[#003B2F] via-[#035241] to-[#056A54] text-white shadow-[0_12px_28px_rgba(0,59,47,0.28)] hover:brightness-110 active:scale-[0.99] transition-all border border-emerald-400/30 cursor-pointer"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Download className="w-5 h-5 text-emerald-200" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold tracking-tight">Download Aplikasi</span>
                          <ExternalLink className="w-4 h-4 text-emerald-200 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                        <p className="text-xs text-emerald-100/85 mt-1 leading-relaxed">
                          Langsung unduh dan pasang Ascend Journal ke perangkat Anda.
                        </p>
                      </div>
                    </div>
                  </a>
                ) : (
                  <button
                    id="btn-entry-download-app"
                    type="button"
                    disabled={isInstalling}
                    onClick={handleDownloadAppClick}
                    className="group w-full text-left p-4 rounded-2xl bg-gradient-to-br from-[#003B2F] via-[#035241] to-[#056A54] text-white shadow-[0_12px_28px_rgba(0,59,47,0.28)] hover:brightness-110 active:scale-[0.99] transition-all border border-emerald-400/30 disabled:opacity-70 cursor-pointer"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0 mt-0.5">
                        {isInstalling ? (
                          <Loader2 className="w-5 h-5 text-emerald-200 animate-spin" />
                        ) : (
                          <Download className="w-5 h-5 text-emerald-200" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold tracking-tight">
                            {isInstalling ? 'Mengunduh & Memasang...' : 'Download Aplikasi'}
                          </span>
                          <ArrowRight className="w-4 h-4 text-emerald-200 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                        <p className="text-xs text-emerald-100/85 mt-1 leading-relaxed">
                          Langsung unduh dan pasang Ascend Journal ke perangkat Anda.
                        </p>
                      </div>
                    </div>
                  </button>
                )}

                {statusMessage && (
                  <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400 px-1 leading-relaxed">
                    {statusMessage}
                  </p>
                )}

                {/* Opsi 2: Lanjutkan di Chrome */}
                <button
                  id="btn-entry-continue-chrome"
                  type="button"
                  onClick={onContinueInChrome}
                  className="group w-full text-left p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 mt-0.5 text-slate-700 dark:text-slate-200">
                      <Globe className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                          Lanjutkan di Chrome
                        </span>
                        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        Langsung buka dan gunakan Ascend Journal di browser Google Chrome tanpa mengunduh aplikasi.
                      </p>
                    </div>
                  </div>
                </button>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
