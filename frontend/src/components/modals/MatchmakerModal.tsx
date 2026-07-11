import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { MatchmakerCard, SwipeAction } from '@/hooks/useMatchmaker';
import { useState } from 'react';
import { Sparkles, Heart, X, Bookmark, Info } from 'lucide-react';

interface MatchmakerModalProps {
    matchmaker: {
        isOpen: boolean;
        isLoading: boolean;
        cards: MatchmakerCard[];
        iteration: number;
        maxIterations: number;
        initMatchmaker: (t: 'movie'|'series', v: string) => void;
        handleSwipe: (id: string, action: SwipeAction) => void;
        closeAndSave: () => void;
        setIsOpen: (o: boolean) => void;
    };
}

export function MatchmakerModal({ matchmaker }: MatchmakerModalProps) {
    const { isOpen, isLoading, cards, iteration, maxIterations, handleSwipe, closeAndSave, setIsOpen } = matchmaker;
    const [flipped, setFlipped] = useState(false);

    if (!isOpen) return null;

    const currentCard = cards[0];

    const onSwipe = (action: SwipeAction) => {
        if (!currentCard) return;
        setFlipped(false);
        handleSwipe(currentCard.id, action);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="max-w-md w-full h-[85vh] p-0 overflow-hidden bg-marrow-deep border-marrow-light/10 z-[100]">
                <DialogTitle className="sr-only">Matchmaker</DialogTitle>
                
                {/* Topbar */}
                <div className="flex items-center justify-between p-4 bg-black/40 text-marrow-light">
                    <div className="flex flex-col">
                        <span className="text-xs font-black uppercase tracking-widest text-amber-200 flex items-center gap-1">
                            <Sparkles className="w-3 h-3"/> Matchmaker
                        </span>
                        <span className="text-[10px] uppercase font-bold text-white/70">
                            Fase {iteration + 1} di {maxIterations}
                        </span>
                    </div>
                    <button onClick={closeAndSave} className="px-3 py-1.5 bg-primary text-white rounded-full text-xs font-black uppercase tracking-widest hover:brightness-110 transition-all shadow-md">
                        Salva & Esci
                    </button>
                </div>

                {/* Main Card Area */}
                <div className="flex-1 h-full flex flex-col relative p-4 bg-marrow-deep">
                    {isLoading && !currentCard ? (
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <div className="w-8 h-8 border-4 border-amber-200 border-t-transparent rounded-full animate-spin"></div>
                            <p className="mt-4 text-xs font-black uppercase text-white/70 tracking-widest">Sintonizzazione DNA...</p>
                        </div>
                    ) : currentCard ? (
                        <div className="flex-1 relative w-full h-full flex flex-col">
                            {/* The Card */}
                            <div 
                                className="relative w-full flex-1 rounded-2xl overflow-hidden shadow-2xl cursor-pointer group transition-all duration-500 preserve-3d"
                                style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
                                onClick={() => setFlipped(!flipped)}
                            >
                                {/* Front */}
                                <div className="absolute inset-0 backface-hidden bg-black">
                                    {currentCard.poster ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={currentCard.poster} alt={currentCard.title} className="w-full h-full object-cover opacity-90" />
                                    ) : (
                                        <div className="w-full h-full bg-marrow-deep/50 flex items-center justify-center">No Image</div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none" />
                                    <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col">
                                        <h2 className="text-2xl font-black text-white leading-tight mb-1">{currentCard.title}</h2>
                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-1 bg-white/20 backdrop-blur-sm rounded-md text-[10px] font-bold text-white/90">{currentCard.year}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md rounded-full p-2 text-white/80 flex items-center justify-center hover:bg-white/20 transition-all">
                                        <Info className="w-5 h-5" />
                                    </div>
                                </div>
                                
                                {/* Back (Trama & Info) */}
                                <div className="absolute inset-0 backface-hidden bg-marrow-deep border-2 border-primary/20 p-6 overflow-y-auto" style={{ transform: 'rotateY(180deg)' }}>
                                    <h3 className="text-xl font-black text-white mb-4">{currentCard.title}</h3>
                                    <p className="text-sm text-marrow-light/80 leading-relaxed mb-6">{currentCard.overview || "Trama non disponibile."}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {currentCard.genre_ids?.map(g => (
                                            <span key={g} className="px-2 py-1 bg-primary/20 text-white rounded-md text-[10px] font-bold uppercase">{g}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="h-24 shrink-0 flex items-center justify-center gap-6 pt-6">
                                <button onClick={(e) => { e.stopPropagation(); onSwipe('dislike'); }} className="w-14 h-14 bg-white/5 border-2 border-marrow-light/20 rounded-full flex items-center justify-center text-marrow-light hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/50 transition-all shadow-lg">
                                    <X className="w-6 h-6" />
                                </button>
                                
                                <button onClick={(e) => { e.stopPropagation(); onSwipe('watchlist'); }} className="w-12 h-12 bg-white/5 border border-marrow-light/20 rounded-full flex items-center justify-center text-marrow-light hover:bg-blue-500/20 hover:text-blue-400 hover:border-blue-500/50 transition-all -translate-y-4 shadow-lg">
                                    <Bookmark className="w-5 h-5" />
                                </button>
                                
                                <button onClick={(e) => { e.stopPropagation(); onSwipe('like'); }} className="w-14 h-14 bg-primary rounded-full flex items-center justify-center text-white hover:bg-primary/80 transition-all shadow-lg shadow-primary/40">
                                    <Heart className="w-6 h-6" fill="currentColor" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                            <Sparkles className="w-12 h-12 text-amber-200 mb-4" />
                            <h3 className="text-xl font-black text-white mb-2">Non ci sono altre carte</h3>
                            <p className="text-sm text-white/70 mb-6">Abbiamo esplorato abbastanza per ora. Salva il catalogo per vedere i risultati!</p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
