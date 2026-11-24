# Teseo Printer — sito statico

Sito	statico B2B (HTML + CSS + JavaScript, nessun build e nessuna dipendenza npm) per Teseo Printer: stampante multifunzione LED A4 con 13 moduli riparabili, diagnostica simulata, listino ricambi nuovi/rigenerati, contratti Cura, area assistenza e area account.

## File

- `index.html` — struttura, hero, navigazione a schede, modali e form.
- `styles.css` — design system verde/blu, layout responsive, accessibilità e animazioni discrete.
- `app.js` — listino `PRICE_BOOK`, logica applicativa, Supabase Auth e operazioni CRUD.
- `config.js` — URL e chiave anonima del progetto Supabase collegato.
- `README.md` — queste istruzioni.
- `supabase/schema.sql` — schemaSQL delle tre tabelle dedicate, già applicato al progetto Supabase.

Il sito è distribuito su `https://teseo-printer.vercel.app` dal repository `Dekker74/teseo-printer`.

## Avvio

Non serve compilare. È sufficiente servire la cartella con un server statico, ad esempio:

```bash
cd /root/teseo-printer
python3 -m http.server 8000
```

Poi aprire `http://localhost:8000`.

All'apertura compare la schermata di accesso: **Accedi**, **Crea account** oppure **Esplora come ospite**. L'ospite può usare diagnostica, sintomi, carrello demo e assistenza (con invito a fare login per inviare ticket); non può vedere l'area Account.

## Configurazione Supabase

1. Il progetto Supabase è già configurato in `config.js` con URL e chiave anonima.
2. Il provider **Email** è abilitato e la conferma email è disattivata: la registrazione crea subito la sessione.
3. Le tabelle `teseo_profiles`, `teseo_purchases` e `teseo_support_tickets` sono già state create con RLS attiva (vedi `supabase/schema.sql`).
4. Il trigger `on_teseo_user_created` crea automaticamente il profilo Teseo quando un utente si registra.

Se la configurazione Supabase non è raggiungibile, l'app continua a funzionare in modalità demo locale e i form di autenticazione mostrano un messaggio esplicativo.

### Campi attesi

- `teseo_profiles`: `id` (uuid, chiave primaria collegata ad `auth.users`), `full_name`, `company`, `plan_id` (`none` | `annual` | `tri`), `created_at`.
- `teseo_purchases`: `id`, `user_id`, `order_code`, `item_name`, `quantity`, `unit_price_net`, `total_net`, `created_at`, `status`.
- `teseo_support_tickets`: `id`, `user_id`, `subject`, `category`, `message`, `status`, `created_at`.

Il numero di serie inserito nel form assistenza viene aggiunto al testo del messaggio, così non serve una colonna extra.

### RLS (politiche attese)

Ogni politica deve limitare righe e scritture al proprietario:

- `teseo_profiles`: `auth.uid() = id` per SELECT/INSERT/UPDATE.
- `teseo_purchases`: `auth.uid() = user_id` per SELECT/INSERT.
- `teseo_support_tickets`: `auth.uid() = user_id` per SELECT/INSERT.

Il checkout inserisce una riga per ogni articolo del carrello con lo stesso `order_code`; se l'ordine contiene un piano Cura, aggiorna `teseo_profiles.plan_id`. Se non esiste ancora una riga profilo, l'app la crea automaticamente al primo accesso usando i dati del signup. Il trigger lato DB previsto si chiama `on_teseo_user_created`.

## Prezzi applicati

Tutti i prezzi sono memorizzati **netti** in `PRICE_BOOK` in `app.js`; l'IVA 22% è calcolata solo in visualizzazione. Il toggle **Netto / Lordo** dell'header aggiorna l'intero sito (ricambi, macchina, piani, carrello, tabella "Prezzi & trasparenza").

| Voce | Netto | IVA inclusa |
|---|---:|---:|
| Macchina Teseo M1 Pro | 440,00 € | 536,80 € |
| Macchina con Cura triennale (-18%) | 360,80 € | 440,18 € |
| Concorrenti (indicativo) | — | ~700 € |
| Cura annuale | 59,00 €/anno | 71,98 €/anno |
| Cura triennale (159 € anticipati) | 53,00 €/anno | 193,98 € totali |
| Ricavo ricorrente base | 52,00 €/anno/macchina | — |

Listino ricambi (netto / rigenerato netto): Testina LED 37,50 / 24,375 €; Fusore 30 / 19,50 €; Alimentatore 22,50 / 14,625 €; Controller 30 / 19,50 €; Tamburo 20 / 13 €; Toner 12,50 / 8,125 €; Trasporto carta 15 / 9,75 €; Vassoio 10 / 6,50 €; Duplex 11,25 / 7,3125 €; Scanner 75 / 48,75 €; Pannello comandi 7,50 / 4,875 €; Scocca 7,75 / 5,0375 €; Kit rulli 5 / 3,25 €.

Fonti: business plan, fogli `2_Ipotesi` (righe 46-53), `6_Contratti_Cura` (righe 209-210) e `3_Componenti` (righe 99-115). Il risparmio della macchina rispetto ai ~700 € della concorrenza è del 23,3%; il triennale fa risparmiare il 10,2% annuo rispetto al canone annuale.

## Funzionalità

- Diagnostica simulata dei 13 moduli con console, barra di avanzamento, esito e guida passo-passo.
- Ricerca per sintomi con stima dei moduli sospetti e test mirato.
- 13 moduli cliccabili con scheda tecnica, passaporto digitale (QR generato lato client), note di rigenerazione e guide iFixit-like.
- Carrello con condizione nuovo/rigenerato, quantità, Cura che azzera i moduli coperti e spedizione, checkout persistente per gli utenti autenticati.
- Assistenza clienti: FAQ ricercabile, canali di contatto, form ticket salvato in `teseo_support_tickets` per gli utenti autenticati.
- Area Account: profilo, piano attivo, tutti gli acquisti da `teseo_purchases`, ticket da `teseo_support_tickets` e ordini demo locali.
- Accessibilità: etichette associate, focus visibile, navigazione da tastiera, `aria-pressed`/`aria-selected`, live region per messaggi ed errori, `prefers-reduced-motion`.

## Nota

La diagnostica e gli ordini demo sono simulazioni didattiche: non interrogano hardware reale e non effettuano pagamenti.
