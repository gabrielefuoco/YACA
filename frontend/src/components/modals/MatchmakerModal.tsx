import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { MatchmakerCard, SwipeAction, MatchmakerPhase } from '@/hooks/useMatchmaker';
import { useState, useEffect, useRef } from 'react';
import { Sparkles, Heart, X, Bookmark, Info, Film, Tv, PlaySquare, PlayCircle } from 'lucide-react';

interface MatchmakerModalProps {
    matchmaker: {
        isOpen: boolean;
        isLoading: boolean;
        phase: MatchmakerPhase;
        cards: MatchmakerCard[];
        matchedCards: MatchmakerCard[];
        iteration: number;
        maxIterations: number;
        initMatchmaker: (t: 'movie'|'series'|'anime', v: string, initialGenres?: number[]) => void;
        handleSwipe: (id: string, action: SwipeAction, overrideTitle?: string, overrideGenres?: number[]) => void;
        fetchTrailer: (type: 'movie'|'series'|'anime', id: string) => Promise<string | null>;
        transitionToResults: () => void;
        closeAndSave: (save: boolean) => void;
        setIsOpen: (o: boolean) => void;
    };
}

const GENRE_MAP: Record<number, string> = {
    28: 'Azione', 12: 'Avventura', 16: 'Animazione', 35: 'Commedia',
    80: 'Crime', 99: 'Documentario', 18: 'Dramma', 10751: 'Famiglia',
    14: 'Fantasy', 36: 'Storico', 27: 'Horror', 10402: 'Musica',
    9648: 'Mistero', 10749: 'Romantico', 878: 'Fantascienza',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'Guerra', 37: 'Western'
};

export function MatchmakerModal({ matchmaker }: MatchmakerModalProps) {
    const { 
        isOpen, isLoading, phase, cards, matchedCards, 
        iteration, maxIterations, initMatchmaker, handleSwipe, 
        fetchTrailer, transitionToResults, closeAndSave, setIsOpen 
    } = matchmaker;
    
    const [flipped, setFlipped] = useState(false);
    const [selectedType, setSelectedType] = useState<'movie' | 'series' | 'anime' | null>(null);
    const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
    
    const [trailerUrl, setTrailerUrl] = useState<string | null>(null);
    const [isLoadingTrailer, setIsLoadingTrailer] = useState(false);

    const POPULAR_GENRES = [
        { id: 28, name: 'Azione' },
        { id: 12, name: 'Avventura' },
        { id: 16, name: 'Animazione' },
        { id: 35, name: 'Commedia' },
        { id: 80, name: 'Crime' },
        { id: 18, name: 'Dramma' },
        { id: 14, name: 'Fantasy' },
        { id: 27, name: 'Horror' },
        { id: 9648, name: 'Mistero' },
        { id: 10749, name: 'Romance' },
        { id: 878, name: 'Fantascienza' },
        { id: 53, name: 'Thriller' }
    ];

    const toggleGenre = (id: number) => {
        setSelectedGenres(prev => {
            if (prev.includes(id)) return prev.filter(g => g !== id);
            if (prev.length >= 3) return prev;
            return [...prev, id];
        });
    };

    // Early return rimosso per rispettare le Rules of Hooks

    const currentCard = cards[0];
    const cardsLeft = cards.length;

    const onSwipe = (action: SwipeAction) => {
        if (!currentCard) return;
        setFlipped(false);
        setTrailerUrl(null);
        handleSwipe(currentCard.id, action);
    };

    const handleAnswer = (e: React.MouseEvent, option: { label: string; genre_ids: number[] }) => {
        e.stopPropagation();
        if (!currentCard) return;
        setFlipped(false);
        setTrailerUrl(null);
        handleSwipe(currentCard.id, 'answered', option.label, option.genre_ids);
    };

    const handleFlip = () => {
        if (!flipped) setTrailerUrl(null);
        setFlipped(!flipped);
    };

    const handleFetchTrailer = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!currentCard || !selectedType) return;
        setIsLoadingTrailer(true);
        const url = await fetchTrailer(selectedType, currentCard.id);
        if (url) setTrailerUrl(url);
        setIsLoadingTrailer(false);
    };

    const [dragX, setDragX] = useState(0);
    const dragStartRef = useRef<number | null>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        dragStartRef.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (dragStartRef.current === null) return;
        const currentX = e.touches[0].clientX;
        setDragX(currentX - dragStartRef.current);
    };

    const handleTouchEnd = () => {
        if (currentCard?.is_question) {
            setDragX(0);
            dragStartRef.current = null;
            return;
        }
        if (dragX > 100) {
            onSwipe('like');
        } else if (dragX < -100) {
            onSwipe('dislike');
        }
        setDragX(0);
        dragStartRef.current = null;
    };

    useEffect(() => {
        if (!isOpen || phase !== 'playing' || !currentCard || isLoading || currentCard.is_question) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') onSwipe('like');
            else if (e.key === 'ArrowLeft') onSwipe('dislike');
            else if (e.key === 'ArrowUp') onSwipe('watchlist');
            else if (e.key === ' ') {
                e.preventDefault();
                handleFlip();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, phase, currentCard, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && closeAndSave(false)}>
            <DialogContent className="max-w-md w-full h-[85vh] p-0 overflow-hidden bg-marrow-deep border-marrow-light/10 z-[100] flex flex-col">
                <DialogTitle className="sr-only">Matchmaker</DialogTitle>

                {/* --- CHOOSING PHASE --- */}
                {phase === 'choosing' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-6 border border-primary/50 shadow-[0_0_30px_rgba(220,38,38,0.3)]">
                            <Sparkles className="w-8 h-8 text-primary" />
                        </div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-2">YACA Matchmaker</h2>
                        
                        {!selectedType ? (
                            <>
                                <p className="text-white/80 font-bold text-sm mb-10">Cosa vuoi esplorare oggi?</p>
                                <div className="flex flex-col gap-4 w-full max-w-[240px]">
                                    <button 
                                        onClick={() => setSelectedType('movie')}
                                        disabled={isLoading}
                                        className="flex items-center justify-center gap-3 w-full py-4 bg-marrow-deep border-2 border-primary/40 rounded-xl text-white font-black shadow-[0_0_15px_rgba(220,38,38,0.15)] hover:bg-primary/20 hover:border-primary transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                                    >
                                        <Film className="w-5 h-5 text-primary" />
                                        Film
                                    </button>
                                    <button 
                                        onClick={() => setSelectedType('series')}
                                        disabled={isLoading}
                                        className="flex items-center justify-center gap-3 w-full py-4 bg-marrow-deep border-2 border-primary/40 rounded-xl text-white font-black shadow-[0_0_15px_rgba(220,38,38,0.15)] hover:bg-primary/20 hover:border-primary transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                                    >
                                        <Tv className="w-5 h-5 text-primary" />
                                        Serie TV
                                    </button>
                                    <button 
                                        onClick={() => setSelectedType('anime')}
                                        disabled={isLoading}
                                        className="flex items-center justify-center gap-3 w-full py-4 bg-marrow-deep border-2 border-primary/40 rounded-xl text-white font-black shadow-[0_0_15px_rgba(220,38,38,0.15)] hover:bg-primary/20 hover:border-primary transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                                    >
                                        <PlaySquare className="w-5 h-5 text-primary" />
                                        Anime
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="text-white/80 font-bold text-sm mb-6">Scegli fino a 3 generi (opzionale)</p>
                                <div className="flex flex-wrap justify-center gap-2 max-w-[300px] mb-8">
                                    {POPULAR_GENRES.map(g => (
                                        <button 
                                            key={g.id}
                                            onClick={() => toggleGenre(g.id)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                                                selectedGenres.includes(g.id) 
                                                    ? 'bg-primary text-white border-primary shadow-[0_0_10px_rgba(220,38,38,0.3)]' 
                                                    : 'bg-white/5 text-white/60 border-white/10 hover:border-white/30'
                                            }`}
                                        >
                                            {g.name}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-3 w-full max-w-[280px]">
                                    <button 
                                        onClick={() => { setSelectedType(null); setSelectedGenres([]); }}
                                        className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-white/70 font-bold hover:bg-white/10"
                                    >
                                        Indietro
                                    </button>
                                    <button 
                                        onClick={() => initMatchmaker(selectedType, 'random', selectedGenres.length > 0 ? selectedGenres : undefined)}
                                        disabled={isLoading}
                                        className="flex-[2] py-3 bg-primary border-2 border-primary/40 rounded-xl text-white font-black hover:brightness-110 disabled:opacity-50 shadow-[0_0_15px_rgba(220,38,38,0.15)]"
                                    >
                                        {isLoading ? 'Avvio...' : 'Esplora'}
                                    </button>
                                </div>
                            </>
                        )}
                        
                        {isLoading && !selectedType && (
                            <div className="mt-8 flex flex-col items-center gap-2">
                                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-[10px] uppercase font-bold text-white/80 tracking-widest">Inizializzazione DNA...</span>
                            </div>
                        )}
                    </div>
                )}

                {/* --- PLAYING PHASE --- */}
                {phase === 'playing' && (
                    <>
                        <div className="shrink-0 flex items-center justify-between p-4 bg-black/40 text-marrow-light border-b border-white/5">
                            <div className="flex flex-col">
                                <span className="text-xs font-black uppercase tracking-widest text-amber-200 flex items-center gap-1">
                                    <Sparkles className="w-3 h-3"/> Matchmaker
                                </span>
                                <span className="text-[10px] uppercase font-bold text-white/70">
                                    Fase {iteration + 1} di {maxIterations} • {cardsLeft} carte
                                </span>
                            </div>
                            <button onClick={transitionToResults} className="px-3 py-1.5 bg-white/10 text-white rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-white/20 transition-all">
                                Termina
                            </button>
                        </div>

                        <div className="flex-1 relative p-4 flex flex-col items-center justify-center overflow-hidden">
                            {isLoading && !currentCard ? (
                                <div className="w-full max-w-[280px] sm:max-w-[320px] aspect-[2/3] rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center justify-center overflow-hidden relative">
                                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent animate-[shimmer_2s_infinite] -translate-x-full" style={{ backgroundSize: '200% 100%' }}></div>
                                    <div className="w-10 h-10 border-4 border-amber-200 border-t-transparent rounded-full animate-spin mb-4"></div>
                                    <p className="text-xs font-black uppercase text-white/70 tracking-widest text-center px-4">
                                        Il Matchmaker sta analizzando i tuoi gusti...
                                    </p>
                                </div>
                            ) : currentCard ? (
                                <div className="flex flex-col items-center w-full max-w-[280px] sm:max-w-[320px]">
                                    {currentCard.is_question ? (
                                        <div className="w-full aspect-[2/3] max-h-[65vh] bg-gradient-to-br from-indigo-900 to-purple-900 rounded-3xl flex flex-col justify-center items-center p-8 text-center border-2 border-indigo-400/50 shadow-2xl">
                                            <Sparkles className="w-12 h-12 text-indigo-300 mb-6 animate-pulse" />
                                            <h2 className="text-2xl font-black text-white mb-10 leading-tight">
                                                {currentCard.question_text}
                                            </h2>
                                            <div className="w-full flex flex-col gap-4">
                                                {currentCard.question_options?.map((opt, i) => (
                                                    <button 
                                                        key={i} 
                                                        onClick={(e) => handleAnswer(e, opt)}
                                                        className="w-full bg-indigo-600/30 hover:bg-indigo-500/50 border border-indigo-300/30 text-white font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95 text-lg"
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div 
                                            className="relative w-full aspect-[2/3] max-h-[65vh] rounded-3xl overflow-hidden shadow-2xl cursor-pointer group transition-all duration-300 preserve-3d"
                                            style={{ 
                                                transform: `rotateY(${flipped ? 180 : 0}deg) translateX(${dragX}px) rotate(${dragX * 0.05}deg)`,
                                                opacity: 1 - Math.abs(dragX) / 400
                                            }}
                                            onClick={handleFlip}
                                            onTouchStart={handleTouchStart}
                                            onTouchMove={handleTouchMove}
                                            onTouchEnd={handleTouchEnd}
                                        >
                                        {/* Front */}
                                        <div className="absolute inset-0 backface-hidden bg-[#111]">
                                            {currentCard.poster ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={currentCard.poster} alt={currentCard.title} className="w-full h-full object-cover opacity-90" />
                                            ) : (
                                                <div className="w-full h-full bg-marrow-deep/50 flex items-center justify-center text-white/30 text-xs">No Poster</div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent pointer-events-none" />
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
                                        
                                        {/* Back */}
                                        <div className="absolute inset-0 backface-hidden bg-marrow-deep border border-primary/30 p-6 overflow-y-auto flex flex-col" style={{ transform: 'rotateY(180deg)' }}>
                                            <h3 className="text-xl font-black text-white mb-4">{currentCard.title}</h3>
                                            
                                            {trailerUrl ? (
                                                <div className="w-full aspect-video rounded-lg overflow-hidden bg-black mb-6 shrink-0 relative shadow-2xl">
                                                    <iframe src={trailerUrl} className="w-full h-full" allow="autoplay; encrypted-media" allowFullScreen></iframe>
                                                </div>
                                            ) : (
                                                <>
                                                    <button onClick={handleFetchTrailer} disabled={isLoadingTrailer} className="w-full flex items-center justify-center gap-2 mb-6 px-4 py-3 bg-red-600 hover:bg-red-500 rounded-lg text-white font-black text-sm uppercase tracking-wide transition-all shadow-lg active:scale-95 shrink-0">
                                                        {isLoadingTrailer ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <PlayCircle className="w-5 h-5" />}
                                                        {isLoadingTrailer ? 'Ricerca...' : 'Guarda Trailer'}
                                                    </button>
                                                    <p className="text-sm text-marrow-light/80 leading-relaxed mb-6 flex-1 overflow-y-auto">{currentCard.overview || "Trama non disponibile."}</p>
                                                </>
                                            )}

                                            <div className="flex flex-wrap gap-2 mt-auto shrink-0 pt-4">
                                                {currentCard.genre_ids?.map(g => (
                                                    <span key={g} className="px-2 py-1 bg-primary/20 text-primary border border-primary/30 rounded-md text-[10px] font-bold uppercase">
                                                        {GENRE_MAP[g] || g}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    {!currentCard.is_question && (
                                        <div className="flex items-center justify-center gap-6 mt-6 shrink-0 w-full">
                                            <div className="flex flex-col items-center gap-2">
                                                <button onClick={(e) => { e.stopPropagation(); onSwipe('dislike'); }} className="w-14 h-14 bg-white/5 border-2 border-red-500/30 rounded-full flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all shadow-lg active:scale-95">
                                                    <X className="w-6 h-6" />
                                                </button>
                                                <span className="text-[10px] font-bold text-white/50 uppercase">Scarta</span>
                                            </div>
                                            
                                            <div className="flex flex-col items-center gap-2">
                                                <button onClick={(e) => { e.stopPropagation(); onSwipe('watchlist'); }} className="w-12 h-12 bg-white/5 border-2 border-blue-400/30 rounded-full flex items-center justify-center text-blue-400 hover:bg-blue-500 hover:text-white hover:border-blue-500 transition-all -translate-y-2 shadow-lg active:scale-95">
                                                    <Bookmark className="w-5 h-5" />
                                                </button>
                                                <span className="text-[10px] font-bold text-white/50 uppercase -translate-y-2">Libreria</span>
                                            </div>
                                            
                                            <div className="flex flex-col items-center gap-2">
                                                <button onClick={(e) => { e.stopPropagation(); onSwipe('like'); }} className="w-14 h-14 bg-primary rounded-full flex items-center justify-center text-white hover:bg-primary/80 transition-all shadow-[0_0_20px_rgba(220,38,38,0.4)] active:scale-95">
                                                    <Heart className="w-6 h-6" fill="currentColor" />
                                                </button>
                                                <span className="text-[10px] font-bold text-white/50 uppercase">Mi piace</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center text-center p-6">
                                    <Sparkles className="w-12 h-12 text-amber-200 mb-4" />
                                    <h3 className="text-xl font-black text-white mb-2">Carte esaurite</h3>
                                    <p className="text-sm text-white/70 mb-6">Abbiamo esplorato abbastanza per ora.</p>
                                    <button onClick={transitionToResults} className="px-6 py-3 bg-primary text-white rounded-full font-bold uppercase tracking-widest hover:brightness-110 shadow-lg">
                                        Vai ai risultati
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* --- RESULTS PHASE --- */}
                {phase === 'results' && (
                    <div className="flex-1 flex flex-col h-full bg-marrow-deep">
                        <div className="shrink-0 flex items-center justify-center p-6 border-b border-white/5">
                            <div className="flex flex-col items-center">
                                <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-1 flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-primary" /> Il tuo Catalogo
                                </h2>
                                <p className="text-xs text-white/50 font-bold uppercase">{matchedCards.length} titoli selezionati</p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            {matchedCards.length > 0 ? (
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                    {matchedCards.map(c => (
                                        <div key={c.id} className="flex flex-col gap-1">
                                            <div className="aspect-[2/3] rounded-lg overflow-hidden bg-white/5 border border-white/10 relative">
                                                {c.poster ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={c.poster} alt={c.title} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-[10px] text-white/30">No Img</div>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-white/80 font-bold leading-tight line-clamp-2">{c.title}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/50">
                                    <X className="w-10 h-10 mb-2 opacity-50" />
                                    <p className="text-sm">Nessun titolo selezionato.</p>
                                </div>
                            )}
                        </div>

                        <div className="shrink-0 p-4 border-t border-white/5 bg-black/20 flex items-center justify-between gap-4">
                            <button 
                                onClick={() => closeAndSave(false)} 
                                disabled={isLoading}
                                className="flex-1 py-3 bg-white/5 text-white/70 rounded-xl font-bold uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all text-xs"
                            >
                                Esci senza salvare
                            </button>
                            <button 
                                onClick={() => closeAndSave(true)} 
                                disabled={isLoading || matchedCards.length === 0}
                                className="flex-1 py-3 bg-primary text-white rounded-xl font-bold uppercase tracking-widest hover:brightness-110 transition-all text-xs disabled:opacity-50 shadow-[0_0_20px_rgba(220,38,38,0.3)]"
                            >
                                {isLoading ? 'Salvataggio...' : 'Salva Catalogo'}
                            </button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
