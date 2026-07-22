import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { MatchmakerCard, SwipeAction, MatchmakerPhase, FunnelResult } from '@/hooks/useMatchmaker';
import { useState, useEffect, useRef } from 'react';
import { Sparkles, Heart, X, Bookmark, Info, Film, Tv, PlaySquare, PlayCircle, ChevronLeft } from 'lucide-react';

interface MatchmakerModalProps {
    matchmaker: {
        isOpen: boolean;
        isLoading: boolean;
        phase: MatchmakerPhase;
        cards: MatchmakerCard[];
        matchedCards: MatchmakerCard[];
        iteration: number;
        maxIterations: number;
        funnelResults: FunnelResult[];
        setPhase: (p: MatchmakerPhase) => void;
        openMatchmaker: () => void;
        startFunnel: (genres: string[], moods: string[], filters?: any) => void;
        initMatchmaker: (type: 'movie'|'series'|'anime', startingL3NodeId: string, filters?: any) => void;
        handleSwipe: (id: string | null, action: SwipeAction, overrideTitle?: string, overrideGenres?: number[], questionText?: string, discardedOptions?: string[]) => void;
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
    10770: 'TV Movie', 53: 'Thriller', 10752: 'Guerra', 37: 'Western',
    9999: 'Anime'
};

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
    { id: 53, name: 'Thriller' },
    { id: 9999, name: 'Anime' }
];

export function MatchmakerModal({ matchmaker }: MatchmakerModalProps) {
    const { 
        isOpen, isLoading, phase, cards, matchedCards, 
        iteration, maxIterations, funnelResults, setPhase,
        startFunnel, initMatchmaker, handleSwipe, 
        fetchTrailer, transitionToResults, closeAndSave, setIsOpen 
    } = matchmaker;
    
    const [flipped, setFlipped] = useState(false);
    const [selectedType, setSelectedType] = useState<'movie' | 'series' | null>(null);
    const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
    const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
    const [freeText, setFreeText] = useState("");
    
    const toggleGenre = (id: number) => {
        if (selectedGenres.includes(id)) {
            setSelectedGenres(prev => prev.filter(x => x !== id));
        } else {
            if (selectedGenres.length < 3) {
                setSelectedGenres(prev => [...prev, id]);
            }
        }
    };
    
    const [trailerUrl, setTrailerUrl] = useState<string | null>(null);
    const [isLoadingTrailer, setIsLoadingTrailer] = useState(false);

    const VIBES = [
        { id: "Intenso & Ricco d'Azione", label: 'Intenso & Azione', icon: '🔥', desc: 'Adrenalina, battaglie, thriller' },
        { id: 'Rilassante & Leggero', label: 'Rilassante & Leggero', icon: '🍃', desc: 'Slice of Life, commedie, feel-good' },
        { id: 'Psicologico & Misterioso', label: 'Psicologico & Mistero', icon: '🧠', desc: 'Mind-bending, gialli, oscuro' },
        { id: 'Drammatico & Emozionante', label: 'Dramma & Emozione', icon: '😭', desc: 'Storie profonde, toccanti' },
        { id: 'Epico & Avventuroso', label: 'Epico & Avventura', icon: '🌍', desc: 'Viaggi, magia, fantascienza' }
    ];

    const currentCard = cards[0];
    const cardsLeft = cards.length;

    const onSwipe = (action: SwipeAction) => {
        if (!currentCard) return;
        setFlipped(false);
        setTrailerUrl(null);
        setFreeText("");
        handleSwipe(currentCard.id, action);
    };

    const handleAnswer = (e: React.MouseEvent, option: { label: string; genre_ids: number[] }) => {
        e.stopPropagation();
        if (!currentCard) return;
        setFlipped(false);
        setTrailerUrl(null);
        setFreeText("");
        
        const discarded = currentCard.question_options
            ?.filter(opt => opt.label !== option.label)
            .map(opt => opt.label) || [];
            
        handleSwipe(currentCard.id, 'answered', option.label, option.genre_ids, currentCard.question_text, discarded);
    };

    const handleFlip = () => {
        if (!flipped) setTrailerUrl(null);
        setFlipped(!flipped);
    };

    const handleFetchTrailer = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!currentCard || !selectedType) return;
        setIsLoadingTrailer(true);
        // Se è Anime usiamo anime, altrimenti selectedType
        const t = selectedGenres.includes(9999) ? 'anime' : selectedType;
        const url = await fetchTrailer(t, currentCard.id);
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
    }, [isOpen, phase, currentCard, isLoading]);

    const handleStartFunnel = () => {
        const isAnime = selectedGenres.includes(9999);
        const genresStr = selectedGenres.filter(id => id !== 9999).map(id => GENRE_MAP[id]).filter(Boolean);
        const moods = selectedVibe ? [selectedVibe] : [];
        startFunnel(genresStr, moods, { isAnime });
    };

    const handleStartTinder = (l3_id: string) => {
        if (!selectedType) return;
        const isAnime = selectedGenres.includes(9999);
        initMatchmaker(selectedType, l3_id, { isAnime });
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && closeAndSave(false)}>
            <DialogContent className="w-screen h-screen max-w-none sm:max-w-4xl sm:h-[90vh] p-0 overflow-hidden bg-marrow-deep border-marrow-light/10 z-[100] flex flex-col rounded-none sm:rounded-3xl">
                <DialogTitle className="sr-only">Matchmaker</DialogTitle>

                {/* --- HEADER NAVBAR (Solo visibile quando necessario) --- */}
                {(phase === 'choosing' && selectedType !== null) || phase === 'funnel' ? (
                    <div className="shrink-0 flex items-center p-4 bg-black/40 border-b border-white/5 relative">
                        <button 
                            onClick={() => {
                                if (phase === 'funnel') setPhase('choosing');
                                else if (phase === 'choosing') setSelectedType(null);
                            }}
                            className="absolute left-4 p-2 bg-white/5 rounded-full hover:bg-white/10 transition-all"
                        >
                            <ChevronLeft className="w-5 h-5 text-white" />
                        </button>
                        <h2 className="text-sm font-black text-white uppercase tracking-widest text-center w-full">YACA Matchmaker</h2>
                    </div>
                ) : null}

                {/* --- CHOOSING PHASE --- */}
                {phase === 'choosing' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                        {!selectedType && (
                            <>
                                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-6 border border-primary/50 shadow-[0_0_30px_rgba(220,38,38,0.3)]">
                                    <Sparkles className="w-8 h-8 text-primary" />
                                </div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-2">YACA Matchmaker</h2>
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
                                </div>
                            </>
                        )}
                        
                        {selectedType && (
                            <div className="flex-1 w-full max-w-[400px] flex flex-col pt-4">
                                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                    <div className="mb-6">
                                        <p className="text-white/80 font-bold text-sm mb-3">1. Qual è il tuo Mood? (richiesto)</p>
                                        <div className="flex flex-col gap-2">
                                            {VIBES.map(v => (
                                                <button 
                                                    key={v.id}
                                                    onClick={() => setSelectedVibe(v.id)}
                                                    className={`flex items-center gap-3 p-3 rounded-xl text-left transition-all border-2 ${
                                                        selectedVibe === v.id 
                                                            ? 'bg-primary/20 border-primary shadow-[0_0_15px_rgba(220,38,38,0.2)]' 
                                                            : 'bg-white/5 border-white/10 hover:border-white/30'
                                                    }`}
                                                >
                                                    <span className="text-2xl">{v.icon}</span>
                                                    <div>
                                                        <div className="text-white font-bold text-sm leading-tight">{v.label}</div>
                                                        <div className="text-white/50 text-[10px] uppercase font-black tracking-wider mt-0.5">{v.desc}</div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="mb-6">
                                        <p className="text-white/80 font-bold text-sm mb-3">2. Scegli fino a 3 generi (opzionale)</p>
                                        <div className="flex flex-wrap gap-2">
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
                                    </div>
                                </div>
                                
                                <div className="shrink-0 pt-4 mt-auto">
                                    <button 
                                        onClick={handleStartFunnel}
                                        disabled={isLoading || !selectedVibe}
                                        className="w-full py-4 bg-primary border-2 border-primary/40 rounded-xl text-white font-black hover:brightness-110 disabled:opacity-50 shadow-[0_0_15px_rgba(220,38,38,0.15)] transition-all flex items-center justify-center gap-2"
                                    >
                                        {isLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Sparkles className="w-5 h-5" />}
                                        {isLoading ? 'Calcolo Vibe...' : 'Esplora'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* --- FUNNEL PHASE --- */}
                {phase === 'funnel' && (
                    <div className="flex-1 flex flex-col bg-marrow-deep overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                            <h3 className="text-lg font-black text-white mb-6 text-center">Scegli una Sotto-Categoria</h3>
                            {funnelResults.map((l4) => (
                                <div key={l4.l4_id} className="mb-8">
                                    <h4 className="text-sm font-black text-white/80 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <span>{l4.emoji}</span> {l4.name}
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {l4.children_l3.map(l3 => (
                                            <button 
                                                key={l3.id}
                                                onClick={() => handleStartTinder(l3.id)}
                                                className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-primary/50 rounded-xl transition-all text-left group"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="text-2xl group-hover:scale-110 transition-transform">{l3.emoji}</span>
                                                    <div>
                                                        <div className="text-white font-bold">{l3.name}</div>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* --- PLAYING PHASE --- */}
                {phase === 'playing' && (
                    <div className="flex-1 flex flex-col h-full bg-marrow-deep">
                        <div className="shrink-0 flex items-center justify-between p-4 bg-black/40 text-marrow-light border-b border-white/5">
                            <div className="flex flex-col">
                                <span className="text-xs font-black uppercase tracking-widest text-amber-200 flex items-center gap-1">
                                    <Sparkles className="w-3 h-3"/> Matchmaker
                                </span>
                                <span className="text-[10px] uppercase font-bold text-white/70">
                                    Ciclo {iteration + 1} • {cardsLeft} carte nel mazzo
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={transitionToResults} className="px-3 py-1.5 bg-white/10 text-white rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-white/20 transition-all">
                                    Salva Catalogo
                                </button>
                            </div>
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

                                    {/* Actions */}
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
                    </div>
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
