#!/usr/bin/env bash
# Prova che la patch del badge è ATTIVA. È la prova che conta: se questa fallisce,
# il giro da ~2 ore produrrebbe 117k poster senza badge, e ce ne accorgeremmo dopo.
#
#   ./prova-badge.sh http://localhost:3100/Tk-il-tuo-token
#
# Chiede lo stesso poster due volte, con e senza ?badge=ITA, e confronta i BYTE.
# Riferimento della prova originale: 146.266 byte senza badge, 147.958 con (+1.692).

set -u

BASE="${1:-}"
if [ -z "$BASE" ]; then
    echo "Uso: $0 <base-erdb-col-token>   es. $0 http://localhost:3100/Tk-legion"
    exit 2
fi
BASE="${BASE%/}"
ID="${2:-tmdb:603}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Poster di prova: ${ID}"
curl -sS -o "$TMP/senza.jpg" -w '  senza badge: HTTP %{http_code}\n' "${BASE}/poster/${ID}.jpg" || exit 1
curl -sS -o "$TMP/con.jpg"   -w '  con badge:   HTTP %{http_code}\n' "${BASE}/poster/${ID}.jpg?badge=ITA" || exit 1

A=$(wc -c < "$TMP/senza.jpg")
B=$(wc -c < "$TMP/con.jpg")
echo "  byte: ${A} senza, ${B} con (differenza $((B - A)))"

if head -c 2 "$TMP/senza.jpg" | grep -q $'\xff\xd8'; then
    echo "  i file sono JPEG: ok"
else
    echo "  ATTENZIONE: il primo file non è un JPEG — probabile errore del server:"
    head -c 200 "$TMP/senza.jpg"; echo
fi

if cmp -s "$TMP/senza.jpg" "$TMP/con.jpg"; then
    echo
    echo "ESITO: le due immagini sono IDENTICHE → la patch NON è attiva."
    echo "       (immagine sbagliata, o base URL senza token, o container non riavviato)"
    exit 1
fi

echo
echo "ESITO: le due immagini differiscono → la patch è ATTIVA e disegna il badge."
