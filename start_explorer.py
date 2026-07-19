import http.server
import socketserver
import webbrowser
import threading
import os

PORT = 8080
# Assicuriamoci di essere nella root directory (YACA) per poter servire /src/data
os.chdir(os.path.dirname(os.path.abspath(__file__)))

Handler = http.server.SimpleHTTPRequestHandler

def start_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Server Web avviato sulla porta {PORT}")
        print("Servendo la root directory di YACA per permettere l'accesso a /src/data/")
        httpd.serve_forever()

# Avvia il server in un thread separato
server_thread = threading.Thread(target=start_server, daemon=True)
server_thread.start()

# Apri il browser automaticamente sul visualizzatore
url = f'http://localhost:{PORT}/offline_graph_builder/visualizer.html'
print(f"Apertura del browser all'indirizzo: {url}")
webbrowser.open(url)

try:
    print("\n[+] Explorer in esecuzione! Usa CTRL+C per chiudere il server.")
    # Mantiene vivo il main thread
    while True:
        pass
except KeyboardInterrupt:
    print("\n[-] Chiusura del server.")
