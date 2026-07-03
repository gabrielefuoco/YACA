'use client';
import * as React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Loader2 } from "lucide-react"

interface SyncLibraryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  isProcessing: boolean
  processingCount: number | null
}

export function SyncLibraryModal({
  open,
  onOpenChange,
  onConfirm,
  isProcessing,
  processingCount
}: SyncLibraryModalProps) {
  
  return (
    <Dialog open={open} onOpenChange={isProcessing ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-[425px] glass-panel border-marrow-light/10">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Attenzione
          </DialogTitle>
          <DialogDescription className="text-marrow-deep pt-2">
            Questa operazione sovrascriverà i metadati della tua libreria su Stremio con le versioni arricchite e i badge ERDB. L'azione non è reversibile.
          </DialogDescription>
        </DialogHeader>
        
        {processingCount !== null && (
          <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
            <p className="text-sm font-bold text-primary">
              Conversione in corso per {processingCount} elementi...
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Annulla
          </Button>
          <Button 
            onClick={onConfirm} 
            className="bg-destructive hover:bg-destructive/90 text-white"
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Elaborazione...
              </>
            ) : (
              'Conferma e Converti'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
