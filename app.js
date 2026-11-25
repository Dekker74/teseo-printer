/* ============================================================
   Teseo Printer — logica applicativa (statico, senza framework)
   Tutti i prezzi sono NETTI: l'IVA si applica solo in visualizzazione.
   ============================================================ */
(async function () {
  'use strict';

  /* ---------- Configurazione Supabase (placeholder = modalità demo) ---------- */
  const CFG = window.TESEO_CONFIG || {};
  const hasPlaceholder = /PLACEHOLDER/i.test(String(CFG.supabaseUrl) + String(CFG.supabaseAnonKey));
  const supabaseConfigured = !hasPlaceholder && /^https:\/\//i.test(String(CFG.supabaseUrl)) && !!CFG.supabaseAnonKey;

  let supabase = null;
  let user = null;
  let profile = null;

  if (supabaseConfigured) {
    try {
      // Unica dipendenza esterna: Supabase JS via CDN ESM.
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      supabase = createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    } catch (err) {
      console.warn('Supabase non disponibile:', err);
    }
  }

  /* ---------- Listino ufficiale dal business plan ---------- */
  const IVA = 0.22;
  const SHIPPING_GROSS = 5;

  const PRICE_BOOK = Object.freeze({
    ivaRate: IVA,
    machine: Object.freeze({
      net: 440,                 // 2_Ipotesi r.46
      gross: 536.80,            // 2_Ipotesi r.48
      triennialDiscount: 0.18,  // 2_Ipotesi r.49
      discountedNet: 360.80,    // 440 × 0,82
      competitorGross: 700,     // 2_Ipotesi r.52
      savingVsCompetitor: 0.233,// (700 - 536,80) / 700
      recurringNetPerYear: 52   // 2_Ipotesi r.82
    }),
    cura: Object.freeze({
      annual: Object.freeze({ net: 59, perYearNet: 59, years: 1, period: '12 mesi' }),     // 6_Contratti_Cura r.209
      tri: Object.freeze({ net: 159, perYearNet: 53, years: 3, period: '36 mesi', saving: 0.102 }) // r.210-211
    }),
    parts: Object.freeze({
      led:       Object.freeze({ newNet: 37.50, regenNet: 24.375 }),
      fuser:     Object.freeze({ newNet: 30.00,  regenNet: 19.50 }),
      psu:       Object.freeze({ newNet: 22.50,  regenNet: 14.625 }),
      ctrl:      Object.freeze({ newNet: 30.00,  regenNet: 19.50 }),
      drum:      Object.freeze({ newNet: 20.00,  regenNet: 13.00 }),
      toner:     Object.freeze({ newNet: 12.50,  regenNet: 8.125 }),
      transport: Object.freeze({ newNet: 15.00,  regenNet: 9.75 }),
      tray:      Object.freeze({ newNet: 10.00,  regenNet: 6.50 }),
      duplex:    Object.freeze({ newNet: 11.25,  regenNet: 7.3125 }),
      scan:      Object.freeze({ newNet: 75.00,  regenNet: 48.75 }),
      panel:     Object.freeze({ newNet: 7.50,   regenNet: 4.875 }),
      case:      Object.freeze({ newNet: 7.75,   regenNet: 5.0375 }),
      rollers:   Object.freeze({ newNet: 5.00,   regenNet: 3.25 })
    })
  });

  const P = PRICE_BOOK.parts;
  const M = PRICE_BOOK.machine;
  const C = PRICE_BOOK.cura;

  /* ---------- I 13 moduli: scheda tecnica, diagnostica e guida ---------- */
  const MODULES = [
    { id:'led', name:'Testina LED sigillata', code:'MD-LD-500', kind:'tech', newNet:P.led.newNet, regenNet:P.led.regenNet,
      color:'#0D2B33', cadSpec:'Barra in alluminio con array di lenti Selfoc e due perni conici Ø4 mm',
      fn:'Disegna l’immagine elettrostatica sul tamburo senza parti rotanti.', reason:'Guasto o aggiornamento',
      diff:'Modulo sigillato, sostituito in blocco', time:'5 min', tools:'Nessuno', life:'Vita della macchina',
      regenNote:'Ottica Selfoc pulita a ultrasuoni, diodi verificati e curva di luminosità ricalibrata.',
      metric:{label:'Pixel attivi', ok:'4.992 / 4.992 pixel', fault:'4.955 / 4.992 pixel'}, health:{ok:97,fault:12},
      fault:{code:'E-LD-02', msg:'Pixel spenti', cause:'Una sezione della barra LED non si accende: il modulo sigillato va sostituito in blocco.'},
      steps:['Spegni la stampante.','Apri il coperchio superiore.','Sgancia il connettore piatto a prova di errore.','Solleva la testina dai perni conici: non aprire mai il modulo.','Appoggia la nuova testina, collega il connettore e chiudi.'],
      test:'Calibrazione automatica e pagina di prova righe sottili' },

    { id:'fuser', name:'Fusore', code:'MD-FU-300', kind:'wear', newNet:P.fuser.newNet, regenNet:P.fuser.regenNet,
      color:'#E35B22', cadSpec:'Due rulli Ø25 mm, leve blu di sblocco e perno di interblocco termico',
      fn:'Fissa il toner sul foglio con il calore.', reason:'Usura termica',
      diff:'Media, con interblocco di sicurezza', time:'8 min', tools:'Nessuno (leve)', life:'50.000 pagine', hot:true,
      regenNote:'Telaio metallico recuperato, rullo riscaldante, rullo di pressione e termistore nuovi.',
      metric:{label:'Temperatura a regime', ok:'190 °C a regime', fault:'141 °C (attesi 190 °C)'}, health:{ok:62,fault:5},
      fault:{code:'E-FU-03', msg:'Temperatura anomala', cause:'Il rullo riscaldato non raggiunge la temperatura di fusione: lampada o termistore degradati.'},
      steps:['Spegni la stampante.','Attendi lo sblocco del perno bimetallico sotto i 40 °C.','Apri lo sportello posteriore e abbassa le due leve blu.','Sfila il fusore tenendolo dalle maniglie isolate.','Inserisci il nuovo fusore e rialza le leve.'],
      test:'Riscaldamento controllato e pagina di prova adesione toner' },

    { id:'psu', name:'Alimentatore 230 V', code:'MD-PS-800', kind:'tech', newNet:P.psu.newNet, regenNet:P.psu.regenNet,
      color:'#FFDD1A', cadSpec:'Box chiuso con presa IEC C14 e slitta di interblocco meccanico',
      fn:'Trasforma la corrente di rete e alimenta la macchina in sicurezza.', reason:'Guasto elettrico',
      diff:'Modulo blindato, solo a cavo scollegato', time:'6 min', tools:'Cacciavite Torx T10 (incluso)', life:'Vita della macchina', mains:true,
      regenNote:'Condensatori 105 °C sostituiti e test Hi-Pot di isolamento a 3 kV superato.',
      metric:{label:'Linea 24 V', ok:'24,0 V stabile', fault:'21,3 V instabile'}, health:{ok:92,fault:6},
      fault:{code:'E-PS-02', msg:'Tensione 24 V instabile', cause:'L’alimentatore non regge il carico durante il riscaldamento del fusore.'},
      steps:['Scollega il cavo dalla presa IEC C14.','Attendi la scarica dei condensatori.','Rimuovi il coperchio posteriore (2 viti Torx T10).','Sfila il modulo blindato: non aprire mai l’involucro.','Inserisci il nuovo modulo e ricollega la rete.'],
      test:'Test delle tensioni sotto carico' },

    { id:'ctrl', name:'Scheda controller e connettività', code:'MD-CT-700', kind:'tech', newNet:P.ctrl.newNet, regenNet:P.ctrl.regenNet,
      color:'#009FD7', cadSpec:'RJ45, USB-B e antenna Wi-Fi su scheda rimovibile a slitta verticale',
      fn:'Cervello della macchina: gestisce stampa, rete e firmware.', reason:'Obsolescenza o guasto di rete',
      diff:'Semplice, con connettore standard', time:'6 min', tools:'Cacciavite Torx T10 (incluso)', life:'Aggiornabile',
      regenNote:'PCB ricondizionato con PHY Ethernet sostituito e firmware aperto 3.5.',
      metric:{label:'Interfacce di rete', ok:'Ethernet + Wi-Fi OK', fault:'Rete non risponde'}, health:{ok:91,fault:10},
      fault:{code:'E-CT-04', msg:'Rete non risponde', cause:'L’interfaccia non si inizializza; la stampante risponde solo via USB.'},
      steps:['Spegni e scollega la stampante.','Rimuovi il pannello tecnico destro (2 viti Torx T10).','Sfila la scheda e scollega il connettore unico.','Inserisci la nuova scheda nella slitta.','Richiudi il pannello e ripristina la configurazione.'],
      test:'Ping Ethernet RJ45, Wi-Fi e USB' },

    { id:'drum', name:'Unità tamburo', code:'MD-DR-200', kind:'consumable', newNet:P.drum.newNet, regenNet:P.drum.regenNet,
      color:'#E91D2D', cadSpec:'Cilindro OPC Ø30 mm, rullo PCR Ø12 mm e leva verde di sgancio rapido',
      fn:'Forma l’immagine elettrostatica da stampare.', reason:'Consumo per cicli di stampa',
      diff:'Semplice, a incastro', time:'2 min', tools:'Nessuno', life:'15.000 pagine',
      regenNote:'Telaio riutilizzato, cilindro OPC nuovo e rullo PCR rettificato. Vuoto a rendere.',
      metric:{label:'Cicli', ok:'8.420 / 15.000 cicli', fault:'14.980 / 15.000 cicli'}, health:{ok:44,fault:1}, warnOnly:true,
      fault:{code:'E-DR-01', msg:'Tamburo a fine vita', cause:'Carica superficiale non uniforme dopo 15.000 cicli.'},
      steps:['Apri lo sportello e estrai la cartuccia toner.','Sgancia la leva verde e sfila il tamburo.','Non toccare la superficie fotosensibile.','Inserisci il tamburo fino allo scatto e reinserisci il toner.','Chiudi lo sportello: il contatore si azzera.'],
      test:'Pagina di prova uniformità grigi' },

    { id:'toner', name:'Cartuccia toner', code:'MD-TN-100', kind:'consumable', newNet:P.toner.newNet, regenNet:P.toner.regenNet,
      color:'#D70B85', cadSpec:'Maniglia frontale, ingranaggio elicoidale e slot EEPROM aperto',
      fn:'Contiene il toner (resa circa 3.000 pagine).', reason:'Esaurimento',
      diff:'Semplice, a incastro', time:'1 min', tools:'Nessuno', life:'≈3.000 pagine', warnOnly:true,
      regenNote:'Guscio recuperato e sanificato, ingranaggi verificati e carica toner certificata. Vuoto a rendere.',
      metric:{label:'Livello toner', ok:'68 %', fault:'2 %'}, health:{ok:68,fault:2},
      fault:{code:'E-TN-01', msg:'Toner in esaurimento', cause:'Il livello della cartuccia è sotto la soglia minima di stampa.'},
      steps:['Apri lo sportello frontale.','Afferra la cartuccia per la maniglia ed estraila.','Agita delicatamente la nuova cartuccia 5 volte.','Inseriscila fino allo scatto.','Chiudi lo sportello.'],
      test:'Stampa pagina di prova densità toner' },

    { id:'transport', name:'Gruppo trasporto carta', code:'MD-FD-310', kind:'wear', newNet:P.transport.newNet, regenNet:P.transport.regenNet,
      color:'#951A21', cadSpec:'Rullo in acciaio rivestito e due linguette gialle di bloccaggio',
      fn:'Muove il foglio lungo il percorso interno e lo trasferisce al fusore.', reason:'Usura del rivestimento',
      diff:'Semplice o media', time:'4 min', tools:'Nessuno', life:'50.000 pagine',
      regenNote:'Albero in acciaio riutilizzato, rivestimento conduttivo nuovo e test di impedenza.',
      metric:{label:'Resistenza rullo', ok:'8,2 MΩ', fault:'31,5 MΩ'}, health:{ok:68,fault:7},
      fault:{code:'E-TR-01', msg:'Resistenza fuori range', cause:'La carica sul foglio è debole e il toner non passa completamente.'},
      steps:['Estrai toner e tamburo.','Sgancia le due linguette gialle del rullo di trasferimento.','Solleva il rullo dalle estremità senza toccare il rivestimento.','Posiziona il nuovo rullo e premi fino allo scatto.','Reinserisci tamburo e toner.'],
      test:'Pagina di prova nero pieno' },

    { id:'tray', name:'Vassoio carta 250 fogli', code:'MD-TY-900', kind:'wear', newNet:P.tray.newNet, regenNet:P.tray.regenNet,
      color:'#DDE2E4', cadSpec:'Piastra elevatrice a molla, guide formato A4 e sensore di presenza',
      fn:'Contiene e guida i fogli da stampare.', reason:'Rottura accidentale',
      diff:'Semplice', time:'2 min', tools:'Nessuno', life:'Vita della macchina',
      regenNote:'Scocca PP ricondizionata, guide A4 e molla di sollevamento sostituite.',
      metric:{label:'Sensore vassoio', ok:'A4, 250 fogli', fault:'Vassoio non rilevato'}, health:{ok:95,fault:15},
      fault:{code:'E-TY-01', msg:'Vassoio non rilevato', cause:'La guida è danneggiata e non aziona il sensore di presenza carta.'},
      steps:['Estrai completamente il vassoio.','Inserisci il nuovo vassoio nelle guide del doppiopiano inferiore.','Spingilo fino allo scatto di chiusura.'],
      test:'Rilevamento formato A4' },

    { id:'duplex', name:'Unità fronte-retro', code:'MD-DX-450', kind:'wear', newNet:P.duplex.newNet, regenNet:P.duplex.regenNet,
      color:'#61676A', cadSpec:'Tre coppie di rulli folli, guide curve di inversione e due leve laterali',
      fn:'Inverte il foglio per la stampa su entrambi i lati.', reason:'Usura meccanica o inceppamenti',
      diff:'Semplice, estrazione posteriore', time:'3 min', tools:'Nessuno', life:'60.000 pagine',
      regenNote:'Scocca recuperata, rulli di inversione nuovi e sensore ottico ricalibrato.',
      metric:{label:'Sensore inversione', ok:'Inversione 310 ms', fault:'Timeout inversione foglio'}, health:{ok:84,fault:9},
      fault:{code:'E-DX-01', msg:'Mancata inversione foglio', cause:'Frizione o rulli di ritorno non trascinano il foglio sul secondo lato.'},
      steps:['Apri lo sportello posteriore.','Premi le due leve laterali del cassetto duplex.','Estrai il modulo lungo le guide.','Inserisci il nuovo modulo fino allo scatto.','Richiudi lo sportello.'],
      test:'Stampa fronte-retro automatica di 4 pagine' },

    { id:'scan', name:'Scanner CIS A4', code:'MD-SC-950', kind:'tech', newNet:P.scan.newNet, regenNet:P.scan.regenNet,
      color:'#7A5CC8', cadSpec:'Piano superiore CIS A4 1200 dpi, coperchio incernierato e flat FFC',
      fn:'Acquisisce documenti per scansione e copia.', reason:'Guasto ottico o meccanico',
      diff:'Semplice, con flat FFC a sgancio', time:'5 min', tools:'Nessuno', life:'≈50.000 scansioni',
      regenNote:'Sensore CIS ricalibrato al banco ottico, vetro antigraffio e cinghia carro verificati.',
      metric:{label:'Calibrazione CIS', ok:'Calibrazione OK', fault:'Sensore CIS non risponde'}, health:{ok:94,fault:10},
      fault:{code:'E-SC-01', msg:'Scanner non risponde', cause:'Il gruppo ottico CIS o il cavo flat non inizializzano l’acquisizione.'},
      steps:['Spegni la stampante.','Solleva il gruppo scanner fino al fermo di servizio.','Sgancia il flat FFC e le clip posteriori delle cerniere.','Posiziona il modulo sostitutivo.','Ricollega il flat e abbassa il piano.'],
      test:'Scansione pagina di calibrazione A4' },

    { id:'panel', name:'Pannello comandi', code:'MD-PN-960', kind:'tech', newNet:P.panel.newNet, regenNet:P.panel.regenNet,
      color:'#2F6F8F', cadSpec:'Display LED, tastierino a membrana e cavo piatto sul coperchio frontale',
      fn:'Permette di avviare stampe, copie e scansioni dal dispositivo.', reason:'Tasti o display non rispondenti',
      diff:'Semplice, a scatto', time:'4 min', tools:'Nessuno', life:'Vita della macchina',
      regenNote:'Scocca sanificata, membrana tasti nuova e display collaudato.',
      metric:{label:'Input pannello', ok:'Tasti e display OK', fault:'Tasti muti / display spento'}, health:{ok:88,fault:11},
      fault:{code:'E-PN-01', msg:'Pannello non risponde', cause:'La membrana o il connettore piatto non trasmettono gli input.'},
      steps:['Spegni la stampante.','Solleva il coperchio frontale.','Sgancia il connettore piatto del pannello.','Rimuovi il pannello dalle clip di fissaggio.','Inserisci il nuovo pannello e ricollega il cavo.'],
      test:'Verifica tasti e menu di configurazione' },

    { id:'case', name:'Scocca e telaio', code:'MD-CS-970', kind:'wear', newNet:P.case.newNet, regenNet:P.case.regenNet,
      color:'#D8D5CE', cadSpec:'Corpo esterno ABS/PP monomateriale con spigoli raggiati e sportelli incernierati',
      fn:'Protegge i moduli interni e garantisce la corretta ventilazione.', reason:'Urto o sportello danneggiato',
      diff:'Media, pannelli a scatto', time:'10 min', tools:'Cacciavite Torx T10 (incluso)', life:'Vita della macchina',
      regenNote:'Pannelli ricondizionati, cerniere e fermi sostituiti; nessun ritardante di fiamma vietato.',
      metric:{label:'Chiusura sportelli', ok:'Sportelli allineati', fault:'Sportello non chiude'}, health:{ok:93,fault:18},
      fault:{code:'E-CS-01', msg:'Sportello non chiude', cause:'Una cerniera o un fermo è rotto: il sensore di chiusura non si attiva.'},
      steps:['Spegni e scollega la stampante.','Rimuovi le viti dei pannelli laterali.','Sgancia le cerniere dello sportello danneggiato.','Posiziona il nuovo pannello e riavvita.','Verifica la chiusura di tutti gli sportelli.'],
      test:'Test sensori di chiusura e ventilazione' },

    { id:'rollers', name:'Kit rulli di prelievo e separazione', code:'MD-PK-400', kind:'wear', newNet:P.rollers.newNet, regenNet:P.rollers.regenNet,
      color:'#A97B50', cadSpec:'Albero Ø8 mm con due rulli gommati EPDM e clip a scatto',
      fn:'Prelevano un foglio alla volta dal vassoio.', reason:'Gomma che si indurisce',
      diff:'Semplice', time:'3 min', tools:'Nessuno', life:'40.000 pagine',
      regenNote:'Mozzi e frizione recuperati, battistrada in gomma EPDM ad alto grip nuovo.',
      metric:{label:'Slittamento in presa', ok:'Slittamento 1,1 %', fault:'Slittamento 18,4 %'}, health:{ok:52,fault:6},
      fault:{code:'E-PK-01', msg:'Mancata presa carta', cause:'La gomma dei rulli si è indurita e slitta sul foglio.'},
      steps:['Estrai il vassoio da 250 fogli.','Premi la clip laterale del gruppo rulli.','Sfila il rullo dall’albero Ø8 mm.','Inserisci il nuovo rullo fino allo scatto.','Reinserisci il vassoio.'],
      test:'Alimentazione di 10 fogli senza stampa' }
  ];

  const BY = Object.fromEntries(MODULES.map(m => [m.id, m]));

  const CURA_PLANS = [
    { id:'none', name:'Standard (a consumo)', code:'ACC-STD', net:0, period:'Pay-per-use', badge:'Base',
      desc:'Nessun canone: acquisti i ricambi che ti servono, quando ti servono.',
      features:['Ricambi nuovi o rigenerati a listino','Spedizione 5,00 € IVA inclusa','Diagnostica e guide incluse'] },
    { id:'annual', name:'Cura annuale', code:'CURA-12M', net:C.annual.net, period:'12 mesi · 59 €/anno', badge:'Studi e aziende',
      desc:'Manutenzione programmata e sostituzione in 48 ore dei moduli di usura, guasto e scanner.',
      features:['Kit di manutenzione programmato','Moduli coperti a 0 € (esclusi consumabili)','Sostituzione in 48 ore','Spedizioni e resi gratuiti'] },
    { id:'tri', name:'Cura triennale', code:'CURA-36M', net:C.tri.net, period:'36 mesi · 53 €/anno', badge:'Scuole e PA', featured:true,
      desc:'Tutto come l’annuale, pagato in anticipo, con sconto del 18% sulla macchina.',
      features:['159 € anticipati = 53 €/anno (risparmio 10,2%)','Macchina a 360,80 € netti invece di 440 €','Una sola fattura per delibere e bandi MEPA'] }
  ];
  const PLAN_BY = Object.fromEntries(CURA_PLANS.map(p => [p.id, p]));

  /* Metodi del checkout dimostrativo: nessuna transazione reale viene inviata. */
  const PAY_METHODS = [
    { id:'carta', icon:'💳', name:'Carta di credito / debito', desc:'Carta demo 4242 4242 4242 4242 · scadenza 12/30 · CVV 123' },
    { id:'bonifico', icon:'🏦', name:'Bonifico bancario', desc:'Coordinate demo IT60 X054 2811 1010 0000 0123 456' },
    { id:'paypal', icon:'🅿️', name:'PayPal', desc:'Pagamento simulato, nessun accesso o addebito reale' }
  ];

  const SYMPTOMS = [
    { id:'faded', t:'Stampa chiara o sbiadita', w:{toner:.5, drum:.35, transport:.15} },
    { id:'smear', t:'Il toner si cancella con il dito', w:{fuser:.85, psu:.15} },
    { id:'spots', t:'Macchie ripetute a distanza regolare', w:{drum:.6, fuser:.25, toner:.15} },
    { id:'streak', t:'Righe scure o fondo grigio', w:{drum:.55, toner:.35, led:.1} },
    { id:'white', t:'Righe bianche verticali sottili', w:{led:.7, drum:.2, toner:.1} },
    { id:'duplex', t:'Inceppamento solo in fronte-retro', w:{duplex:.8, rollers:.15, fuser:.05} },
    { id:'jam', t:'La carta non viene pescata dal vassoio', w:{rollers:.65, tray:.2, transport:.15} },
    { id:'noise', t:'Rumore meccanico o carta bloccata', w:{rollers:.55, duplex:.25, transport:.2} },
    { id:'off', t:'Si spegne o si riavvia da sola', w:{psu:.8, ctrl:.2} },
    { id:'net', t:'Non si collega via LAN o Wi-Fi', w:{ctrl:.9, psu:.1} },
    { id:'tray', t:'Vassoio 250 fogli non riconosciuto', w:{tray:.85, rollers:.15} },
    { id:'scan', t:'Scansione con righe o foglio non rilevato', w:{scan:.9, ctrl:.1} },
    { id:'panel', t:'Tasti o display non rispondono', w:{panel:.85, ctrl:.15} },
    { id:'case', t:'Sportello aperto / scocca danneggiata', w:{case:.85, tray:.15} }
  ];

  const FAQS = [
    { q:'Quanto costa la stampante Teseo M1 Pro?', a:`440 € netti, cioè 536,80 € IVA inclusa. Con il contratto Cura triennale il prezzo scende del 18% a 360,80 € netti (440,18 € IVA inclusa). Il listino dei concorrenti è indicativamente di ~700 €: Teseo costa circa il 23,3% in meno.`, k:'prezzo macchina iva concorrenti 440 536' },
    { q:'Quali sono i canoni del contratto Cura?', a:`Cura annuale: 59 €/anno netti (71,98 € IVA inclusa). Cura triennale: 159 € anticipati, cioè 53 €/anno netti (193,98 € IVA inclusa): il risparmio è del 10,2% annuo.`, k:'cura canone annuale triennale prezzo' },
    { q:'Cosa copre il contratto Cura?', a:`Copre i moduli di usura, guasto e lo scanner, con sostituzione in 48 ore e spedizioni gratuite. Restano a listino i consumabili (cartuccia toner e tamburo, vuoti a rendere).`, k:'cura copertura moduli scanner spedizione' },
    { q:'I ricambi rigenerati sono affidabili?', a:`Sì: ogni modulo è ricondizionato nei laboratori Teseo con componenti di usura nuovi, collaudato al 100% e garantito 24 mesi.Il listino rigenerato è circa il 35% più economico del nuovo.`, k:'ricambi rigenerati garanzia collaudo 35' },
    { q:'Come funziona il reso del modulo usato?', a:`Nella confezione trovi una scatola prepagata: inserisci il modulo usato (per toner e tamburo dentro il sacchetto sigillato), applica l’etichetta e consegnala al corriere. Il ciclo di rigenerazione si chiude quando il pezzo torna in laboratorio.`, k:'reso scatola prepagata logistica inversa' },
    { q:'Posso fare un ordine senza account?', a:`Sì, come ospite puoi simulare il carrello e l’ordine. Per salvare acquisti, piano Cura e ticket di assistenza devi accedere: i dati vengono associati al tuo account e protetti da RLS.`, k:'ospite account ordine salvare login' },
    { q:'Come invio una richiesta di assistenza?', a:`Nella scheda Assistenza compili il form con oggetto, categoria, messaggio e numero di serie opzionale. Devi essere autenticato: il ticket compare poi nella tabella dei ticket dell’Area Account. Puoi anche scrivere a assistenza@teseoprinter.it.`, k:'ticket assistenza form email login' },
    { q:'Quanto tempo serve per sostituire un modulo?', a:`Da 1 a 10 minuti secondo il modulo: toner 1 min, tamburo 2 min, fusore 8 min. Ogni scheda modulo include una guida passo-passo e le indicazioni di sicurezza (interblocco termico e alta tensione).`, k:'sostituzione guida tempi fusore toner' },
    { q:'Il prezzo include l’IVA?', a:`Di default i prezzi sono netti (IVA esclusa 22%). Con il pulsante “Prezzi netti / IVA inclusa” nell’header puoi vedere tutti gli importi con IVA inclusa: macchina 536,80 €, Cura annuale 71,98 €.`, k:'iva prezzi netti lordo toggle' },
    { q:'Che cos’è il Passaporto Digitale di Prodotto?', a:`Ogni modulo ha un QR generato dal suo codice e dal numero di serie della macchina: riporta materiali, istruzioni di sostituzione e tracciabilità di fine vita, in linea con il regolamento ESPR.`, k:'passaporto digitale qr espr materiali' },
    { q:'Come funziona il pagamento sul sito?', a:`È una simulazione didattica: nella sezione Pagamenti scegli carta, bonifico o PayPal e confermi con dati di fantasia. Nessun importo viene addebitato e nessun dato bancario viene inviato. L’ordine demo compare comunque nel tuo account se hai effettuato l’accesso.`, k:'pagamento demo carta bonifico paypal addebito ricevuta' }
  ];

  /* ---------- Stato applicativo ---------- */
  const S = {
    connected:false, via:'', serial:'TP-26-' + (10000 + Math.floor(Math.random()*89999)),
    faulty: MODULES[Math.floor(Math.random()*MODULES.length)].id,
    status:{}, history:{}, diagDone:false,
    pages: 24500 + Math.floor(Math.random()*25000),
    cart:[], orders:[], purchases:[], tickets:[],
    symSel:new Set(), tab:'stato',
    vatIncluded:false, curaPlan:'none', shopFilter:'all', payment:null,
    selectedCond:Object.fromEntries(MODULES.map(m=>[m.id,'regen'])),
    guest:false, faqQuery:''
  };
  MODULES.forEach(m => { S.status[m.id]='unk'; S.history[m.id]=[]; });

  /* ---------- Utility ---------- */
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  // Logo ufficiale fornito come data-URI in config.js (nessun file binario nel repo).
  if(window.TESEO_LOGO){
    $$('img[data-logo]').forEach(img=>{ img.src=window.TESEO_LOGO; });
    const icon=$('link[data-logo-favicon]'); if(icon) icon.href=window.TESEO_LOGO;
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const eur = new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'});
  const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const dateFmt = d => { try { return new Date(d).toLocaleDateString('it-IT'); } catch(e){ return '—'; } };

  function shownAmount(net){ return round2(S.vatIncluded ? Number(net) * (1 + IVA) : Number(net)); }
  function fmt(net){ return net == null ? '—' : eur.format(shownAmount(net)); }
  function fmtFixedGross(gross){ return eur.format(S.vatIncluded ? gross : round2(gross / (1+IVA))); }
  function vatSuffix(){ return S.vatIncluded ? 'IVA inclusa' : '+ IVA'; }
  function toast(t){
    const el=$('#toast'); if(!el) return;
    el.textContent=t; el.classList.add('show');
    clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2800);
  }
  function isFault(id){ return S.faulty===id; }
  function faultStatus(m){ return m.warnOnly ? 'warn' : 'bad'; }
  function hasCura(){ return S.curaPlan!=='none'; }
  function isCovered(m, planOverride){
    const p = planOverride === undefined ? S.curaPlan : planOverride;
    return p !== 'none' && m.kind !== 'consumable';
  }
  function effectivePlan(){
    const inCart = S.cart.find(c=>c.type==='plan');
    return inCart ? inCart.id : S.curaPlan;
  }
  function currentPlan(){ return PLAN_BY[S.curaPlan] || PLAN_BY.none; }
  function pill(st){
    return { ok:'<span class="pill ok">● OK</span>', warn:'<span class="pill warn">● In esaurimento</span>',
      bad:'<span class="pill bad">● Guasto</span>', unk:'<span class="pill na">○ Da verificare</span>' }[st] || '';
  }
  function statusTicket(st){
    const map = {
      aperto:['pill warn','Aperto'], 'in lavorazione':['pill b2b','In lavorazione'],
      chiuso:['pill ok','Chiuso'], confermato:['pill ok','Confermato'],
      preparazione:['pill b2b','In preparazione'], spedito:['pill b2b','Spedito']
    };
    const v = map[String(st||'').toLowerCase()] || ['pill na', st || '—'];
    return `<span class="${v[0]}">${esc(v[1])}</span>`;
  }

  /* ---------- Modale con focus gestito ---------- */
  let lastFocused = null;
  function modal(html){
    const overlay=$('#overlay');
    if(overlay._cleanup){ overlay._cleanup(); overlay._cleanup=null; }
    lastFocused = document.activeElement;
    const body=$('#modalBody');
    body.innerHTML = html.replace('<h2>', '<h2 id="modalTitle">');
    if(!$('#modalTitle')) body.insertAdjacentHTML('afterbegin','<h2 id="modalTitle">Dettagli</h2>');
    overlay.classList.add('open'); overlay.setAttribute('aria-hidden','false');
    $('#closeModal').focus();
  }
  function closeModal(){
    const overlay=$('#overlay');
    if(overlay._cleanup){ overlay._cleanup(); overlay._cleanup=null; }
    overlay.classList.remove('open'); overlay.setAttribute('aria-hidden','true');
    if(lastFocused && document.contains(lastFocused)) lastFocused.focus();
  }
  $('#closeModal').addEventListener('click', closeModal);
  $('#overlay').addEventListener('click', e=>{ if(e.target.id==='overlay') closeModal(); });
  document.addEventListener('keydown', e=>{
    const gate=$('#authGate');
    if(e.key==='Tab' && gate && !gate.classList.contains('hidden')){
      const f=$$('#authGate button, #authGate input, #authGate a[href]').filter(x=>!x.disabled && x.offsetParent!==null);
      if(f.length){
        const first=f[0], last=f[f.length-1];
        if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
        else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
      }
      return;
    }
    if(e.key==='Escape' && $('#overlay').classList.contains('open')){ closeModal(); return; }
    if(e.key==='Tab' && $('#overlay').classList.contains('open')){
      const f=$$('#overlay button, #overlay a[href], #overlay input, #overlay select, #overlay textarea, #overlay [tabindex="0"]').filter(x=>!x.disabled);
      if(!f.length) return;
      const first=f[0], last=f[f.length-1];
      if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- Autenticazione ---------- */
  function showGate(){
    const gate=$('#authGate');
    gate.classList.remove('hidden'); gate.setAttribute('aria-hidden','false');
    setTimeout(()=>{ const el=$('#siEmail'); if(el && gate.classList.contains('hidden')===false) el.focus(); },40);
  }
  function hideGate(){
    const gate=$('#authGate');
    gate.classList.add('hidden'); gate.setAttribute('aria-hidden','true');
  }
  function authMessage(text, ok){
    const el=$('#authMsg'); el.textContent=text || ''; el.classList.toggle('ok',!!ok);
  }
  function translateAuthError(err){
    const m=String(err && err.message || err || 'Errore sconosciuto').toLowerCase();
    if(m.includes('invalid login credentials')) return 'Email o password non corretti.';
    if(m.includes('email not confirmed')) return 'Conferma prima l’email: controlla la tua casella di posta.';
    if(m.includes('already registered') || m.includes('user already')) return 'Esiste già un account con questa email. Prova ad accedere.';
    if(m.includes('password should be at least')) return 'La password deve contenere almeno 6 caratteri.';
    if(m.includes('valid email')) return 'Inserisci un indirizzo email valido.';
    if(m.includes('rate limit') || m.includes('too many')) return 'Troppi tentativi: riprova tra qualche minuto.';
    return String(err && err.message || err);
  }

  $('#guestBtn').addEventListener('click', ()=>{
    S.guest=true; hideGate(); renderHeader();
    toast('Modalità ospite: puoi esplorare, gli acquisti restano locali');
    $('#heroConnect').focus();
  });
  $('#toSignUp').addEventListener('click', ()=>{
    $('#signInForm').classList.add('hidden'); $('#signUpForm').classList.remove('hidden');
    $('#toSignUp').classList.add('hidden'); $('#toSignIn').classList.remove('hidden');
    $('#signInHint').textContent='Hai già un account?'; authMessage(''); $('#suName').focus();
  });
  $('#toSignIn').addEventListener('click', ()=>{
    $('#signUpForm').classList.add('hidden'); $('#signInForm').classList.remove('hidden');
    $('#toSignIn').classList.add('hidden'); $('#toSignUp').classList.remove('hidden');
    $('#signInHint').textContent='Non hai un account?'; authMessage(''); $('#siEmail').focus();
  });

  $('#signInForm').addEventListener('submit', async e=>{
    e.preventDefault();
    if(!supabase){ authMessage('Supabase non è ancora configurato: sostituisci i placeholder in config.js oppure esplora come ospite.'); return; }
    const email=$('#siEmail').value.trim(), password=$('#siPassword').value;
    if(!email || !password){ authMessage('Inserisci email e password.'); return; }
    const btn=e.submitter || e.target.querySelector('button[type="submit"]'); btn.disabled=true;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    btn.disabled=false;
    if(error){ authMessage(translateAuthError(error)); return; }
    authMessage('Accesso effettuato.', true); hideGate();
  });

  $('#signUpForm').addEventListener('submit', async e=>{
    e.preventDefault();
    if(!supabase){ authMessage('Supabase non è ancora configurato: sostituisci i placeholder in config.js oppure esplora come ospite.'); return; }
    const full_name=$('#suName').value.trim(), company=$('#suCompany').value.trim();
    const email=$('#suEmail').value.trim(), password=$('#suPassword').value;
    if(!full_name || !email || !password){ authMessage('Compila nome, email e password.'); return; }
    const btn=e.submitter || e.target.querySelector('button[type="submit"]'); btn.disabled=true;
    const { data, error } = await supabase.auth.signUp({
      email, password, options:{ data:{ full_name, company } }
    });
    btn.disabled=false;
    if(error){ authMessage(translateAuthError(error)); return; }
    if(data && !data.session){
      authMessage('Account creato: controlla la tua email per confermare l’indirizzo, poi accedi.', true);
      $('#toSignIn').click();
    } else {
      authMessage('Account creato. Benvenuto in Teseo Printer!', true); hideGate();
    }
  });

  if(supabase){
    supabase.auth.onAuthStateChange((event, session)=>{
      user = session && session.user ? session.user : null;
      if(user){
        S.guest=false; hideGate(); authMessage(''); loadAccount();
      } else {
        profile=null; S.purchases=[]; S.tickets=[]; S.curaPlan='none'; showGate();
      }
      renderHeader(); renderAll();
    });
  }

  async function loadAccount(){
    if(!supabase || !user) return;
    const sel = await supabase.from('teseo_profiles')
      .select('id, full_name, company, plan_id, created_at').eq('id', user.id).maybeSingle();
    if(sel.error){ toast('Errore lettura profilo: ' + sel.error.message); return; }
    if(!sel.data){
      const newProfile = {
        id:user.id,
        full_name:user.user_metadata && user.user_metadata.full_name || user.email,
        company:user.user_metadata && user.user_metadata.company || '',
        plan_id:'none'
      };
      const ins = await supabase.from('teseo_profiles').upsert(newProfile).select().single();
      profile = ins.error ? newProfile : ins.data;
    } else {
      profile = sel.data;
    }
    // Normalizza eventuali valori diversi da quelli attesi dal database.
    const pid = String(profile.plan_id || 'none');
    S.curaPlan = ['annual','tri'].includes(pid) ? pid : 'none';
    await refreshPurchases();
    await refreshTickets();
    renderAll();
  }

  async function refreshPurchases(){
    if(!supabase || !user) return;
    const { data, error } = await supabase.from('teseo_purchases')
      .select('id, user_id, order_code, item_name, quantity, unit_price_net, total_net, created_at, status')
      .eq('user_id', user.id).order('created_at',{ascending:false});
    if(error){ toast('Errore lettura acquisti: ' + error.message); return; }
    S.purchases = data || [];
  }
  async function refreshTickets(){
    if(!supabase || !user) return;
    const { data, error } = await supabase.from('teseo_support_tickets')
      .select('id, user_id, subject, category, message, status, created_at')
      .eq('user_id', user.id).order('created_at',{ascending:false});
    if(error){ toast('Errore lettura ticket: ' + error.message); return; }
    S.tickets = data || [];
  }

  function openAuthForAction(msg){
    if(msg) authMessage(msg);
    showGate();
    setTimeout(()=>{ const el=$('#siEmail'); if(el) el.focus(); },50);
  }

  /* ---------- Navigazione e header ---------- */
  function go(tab){
    const target=$('#tab-'+tab);
    if(tab==='account' && !user){ openAuthForAction('Accedi per visualizzare la tua Area Account.'); return; }
    S.tab=tab;
    $$('#tabs button').forEach(b=>{
      const active=b.dataset.tab===tab;
      b.setAttribute('aria-selected', active ? 'true':'false');
      b.tabIndex = active ? 0 : -1;
    });
    $$('[data-view]').forEach(v=>v.classList.toggle('hidden', v.dataset.view!==tab));
    renderAll();
    try{ window.scrollTo({top:0,behavior:'smooth'}); }catch(e){}
  }
  $('#tabs').addEventListener('click', e=>{
    const b=e.target.closest('button[data-tab]'); if(b) go(b.dataset.tab);
  });
  $('#tabs').addEventListener('keydown', e=>{
    if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key)) return;
    const tabs=$$('#tabs button').filter(b=>!b.hidden);
    const i=tabs.indexOf(document.activeElement); if(i<0) return;
    e.preventDefault();
    let n = e.key==='ArrowRight' ? (i+1)%tabs.length : e.key==='ArrowLeft' ? (i-1+tabs.length)%tabs.length : e.key==='Home' ? 0 : tabs.length-1;
    tabs[n].focus(); go(tabs[n].dataset.tab);
  });

  function renderHeader(){
    $('#tab-account').hidden = !user;
    const st=$('#headerStatus');
    st.classList.toggle('on',S.connected);
    st.querySelector('span:last-child').textContent = S.connected ? ('Teseo Printer · '+S.via) : 'Stampante non connessa';
    const vat=$('#vatBtn');
    vat.setAttribute('aria-pressed', S.vatIncluded ? 'true':'false');
    $('#vatLabel').textContent = S.vatIncluded ? 'IVA inclusa' : 'Prezzi netti';
    const area=$('#authArea');
    if(user){
      const label = (user.user_metadata && user.user_metadata.full_name) || user.email || 'Account';
      area.innerHTML = `<button type="button" class="tool-btn" id="goAccount" title="Apri Area Account">${esc(label)}</button>
        <button type="button" class="btn btn-sm btn-ghost" id="logoutBtn">Logout</button>`;
      $('#goAccount').onclick=()=>go('account');
      $('#logoutBtn').onclick=async()=>{
        if(supabase) await supabase.auth.signOut();
        S.guest=false; profile=null; S.purchases=[]; S.tickets=[]; S.curaPlan='none';
        renderHeader(); renderAll(); showGate(); toast('Disconnessione effettuata');
      };
    } else if(S.guest){
      area.innerHTML = `<span class="auth-user">Ospite</span><button type="button" class="btn btn-sm btn-outline" id="loginBtn">Accedi</button>`;
      $('#loginBtn').onclick=()=>openAuthForAction('');
    } else {
      area.innerHTML = `<button type="button" class="btn btn-sm btn-primary" id="loginBtn">Accedi</button>`;
      $('#loginBtn').onclick=()=>openAuthForAction('');
    }
  }
  $('#vatBtn').addEventListener('click', ()=>{
    S.vatIncluded=!S.vatIncluded; renderAll();
    toast(S.vatIncluded ? 'Prezzi con IVA inclusa (22%)' : 'Prezzi netti (+ IVA 22%)');
  });
  $('#headerStatus').style.cursor='pointer';
  $('#headerStatus').addEventListener('click', openConnect);

  /* ---------- Connessione simulata ---------- */
  function openConnect(){
    modal(`<p class="eyebrow">Collegamento</p><h2>Connetti la stampante</h2>
      <p class="muted">Scegli un’interfaccia: l’app leggerà i sensori dei 13 moduli (scanner incluso).</p>
      <div class="row" id="connOpts">
        <button type="button" class="btn btn-primary" data-conn="Ethernet (RJ45)">Ethernet LAN</button>
        <button type="button" class="btn btn-outline" data-conn="Wi-Fi">Wi-Fi</button>
        <button type="button" class="btn btn-ghost" data-conn="USB">USB</button>
      </div>
      <div id="connProgress" class="hidden"><div class="spinner"></div><p class="small muted center" id="connStep" aria-live="polite"></p></div>`);
  }
  $('#heroConnect').addEventListener('click', openConnect);

  function connectVia(via){
    if($('#connProgress')) $('#connProgress').classList.remove('hidden');
    let steps = via==='USB'
      ? ['Rilevamento dispositivo USB…','Lettura identificativo Teseo Printer…','Lettura registro errori…']
      : via==='Ethernet (RJ45)'
        ? ['Scansione rete LAN…','Trovata Teseo Printer (192.168.1.44)…','Lettura registro errori…']
        : ['Ricerca stampanti Wi-Fi…','Trovata Teseo Printer · associazione…','Lettura registro errori…'];
    if((via==='Wi-Fi'||via==='Ethernet (RJ45)') && S.faulty==='ctrl'){
      steps.push('Interfaccia di rete non disponibile: commutazione su USB…'); via='USB';
    }
    let i=0;
    const step=$('#connStep'); if(step) step.textContent=steps[0];
    const timer=setInterval(()=>{
      i++;
      const el=$('#connStep');
      if(i<steps.length){ if(el) el.textContent=steps[i]; return; }
      clearInterval(timer);
      S.connected=true; S.via=via; closeModal(); renderHeader();
      toast('Stampante connessa via '+via);
    },620);
  }

  /* ---------- Render principale ---------- */
  function renderAll(){
    renderHeader(); renderAlert(); renderSvg(); renderDev(); renderList();
    renderDiagResult(); renderSym(); renderShop(); renderCura(); renderOrders();
    renderCartBadge(); renderAssist(); renderAccount(); renderPrices(); renderPayments();
  }

  function renderAlert(){
    const box=$('#alertBox'), m=BY[S.faulty];
    if(!S.faulty){
      box.innerHTML = S.diagDone ? '<div class="alert ok"><b>✓</b><div class="grow">Tutti i 13 moduli funzionano correttamente.</div></div>' : '';
      return;
    }
    if(!S.diagDone){
      box.innerHTML=`<div class="alert bad"><b>!</b><div class="grow"><b>La stampante ha registrato un’anomalia.</b><br><span class="small">Esegui la diagnostica per individuare il componente da sostituire.</span></div><button type="button" class="btn btn-sm btn-outline" data-go="diag">Avvia diagnostica</button></div>`;
      return;
    }
    const ordered=S.orders.find(o=>o.items.some(it=>it.id===S.faulty) && !o.installed);
    if(ordered){
      box.innerHTML=`<div class="alert ok"><b>📦</b><div class="grow"><b>${esc(m.name)}</b>: ricambio ordinato (${ordered.id}). Segui la guida quando arriva.</div><button type="button" class="btn btn-sm btn-outline" data-guide="${m.id}">Guida di sostituzione</button></div>`;
      return;
    }
    const cov=isCovered(m);
    box.innerHTML=`<div class="alert bad"><b>!</b><div class="grow"><b>${esc(m.fault.code)} · ${esc(m.fault.msg)}</b><br><span class="small">Modulo: ${esc(m.name)} · ${cov ? '<b>Coperto da Cura: 0,00 €</b>' : `rigenerato ${fmt(m.regenNet)} (${vatSuffix()})`}</span></div>
      <button type="button" class="btn btn-sm ${cov?'btn-blue':'btn-primary'}" data-buy="${m.id}" data-cond="regen">${cov?'Richiedi sostituzione':'Aggiungi rigenerato'}</button></div>`;
  }

  /* ---------- Schema SVG interattivo ---------- */
  function statusColor(st){ return {ok:'#0E9F6E',warn:'#C98A12',bad:'#C2412D'}[st]; }
  function badgeSvg(id,x,y){
    const st=S.status[id]; if(st==='unk') return '';
    const col=statusColor(st), sym={ok:'✓',warn:'!',bad:'✕'}[st];
    return `<g pointer-events="none"><circle cx="${x}" cy="${y}" r="7.5" fill="${col}" stroke="#fff" stroke-width="1.5"/><text x="${x}" y="${y+3.2}" font-size="9.5" font-weight="800" fill="#fff" text-anchor="middle">${sym}</text></g>`;
  }
  function renderSvg(){
    const g=(id,inner,label,lx,ly,fill='#0D2B33',badge=null)=>{
      const st=S.status[id], ring=statusColor(st);
      return `<g class="mod-svg" data-mod="${id}" tabindex="0" role="button" aria-label="${esc(BY[id].name)}">
        <title>${esc(BY[id].name)} · ${esc(BY[id].cadSpec)}</title>${inner}
        ${ring?`<g pointer-events="none" class="${st==='bad'?'ring-bad':''}">${inner.replace(/fill="[^"]*"/g,'fill="none"').replace(/stroke="[^"]*"/g,'').replace(/stroke-width="[^"]*"/g,'').replace(/<(rect|circle)/g,`<$1 stroke="${ring}" stroke-width="2.6"`)}</g>`:''}
        <text x="${lx}" y="${ly}" font-size="10.5" font-weight="700" fill="${fill}" text-anchor="middle">${esc(label)}</text>
        ${badge?badgeSvg(id,badge[0],badge[1]):''}</g>`;
    };
    $('#svgHost').innerHTML=`<svg viewBox="0 0 560 392" role="img" aria-label="Sezione laterale YZ con i 13 moduli della stampante Teseo Printer">
      <rect x="16" y="44" width="528" height="318" rx="18" fill="#F3F1EC" stroke="#CBD9D6" stroke-width="2.5"/>
      <rect x="26" y="54" width="508" height="298" rx="12" fill="none" stroke="#D8D5CE" stroke-width="4"/>
      <line x1="26" y1="290" x2="534" y2="290" stroke="#D8D5CE" stroke-width="3.5"/>
      <text x="36" y="69" font-size="9.5" font-weight="700" fill="#617472">SEZIONE LATERALE (PIANO YZ) · LED A4 CON SCANNER</text>
      <g class="mod-svg" data-mod="case" tabindex="0" role="button" aria-label="Scocca e telaio"><title>Scocca e telaio</title><rect x="18" y="46" width="524" height="314" rx="17" fill="none" stroke="#B9C7C3" stroke-width="1.5" stroke-dasharray="7 5"/></g>
      <path d="M72 314 C52 314,46 276,56 244 C66 212,98 202,152 202 L382 202 C430 202,434 128,384 118 L296 118" fill="none" stroke="#0E9F6E" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M418 202 L456 202 M456 252 L138 252 C102 252,96 231,96 210" fill="none" stroke="#61676A" stroke-width="2.2" stroke-dasharray="5 4"/>
      ${g('scan','<rect x="24" y="10" width="512" height="28" rx="8" fill="#7A5CC8" stroke="#533A99" stroke-width="1.5"/>','13. Scanner CIS A4',280,28,'#fff',[530,14])}
      ${g('tray','<rect x="38" y="300" width="268" height="42" rx="7" fill="#DDE2E4" stroke="#A6AEB2" stroke-width="1.2"/>','12. Vassoio 250 fogli',172,325,'#0D2B33',[300,304])}
      ${g('psu','<rect x="318" y="300" width="204" height="42" rx="7" fill="#FFDD1A" stroke="#C9AC00" stroke-width="1.2"/>','11. Alimentatore',420,325,'#0D2B33',[516,304])}
      ${g('rollers','<circle cx="72" cy="262" r="14" fill="#A97B50"/>','Rulli presa',72,242,'#0D2B33',[85,250])}
      ${g('toner','<rect x="122" y="102" width="114" height="46" rx="8" fill="#D70B85"/>','1. Toner',179,129,'#fff',[232,106])}
      ${g('drum','<circle cx="252" cy="170" r="21" fill="#E91D2D"/>','2. Tamburo',252,205,'#0D2B33',[270,152])}
      ${g('led','<rect x="242" y="126" width="66" height="16" rx="3" fill="#0D2B33"/>','8. Testina LED',350,138,'#0D2B33',[306,128])}
      ${g('transport','<circle cx="252" cy="220" r="9.5" fill="#951A21"/>','Trasporto',252,243,'#0D2B33',[262,212])}
      ${g('fuser','<rect x="366" y="164" width="74" height="52" rx="8" fill="#E35B22"/>','4. Fusore',403,194,'#fff',[436,168])}
      ${g('duplex','<rect x="462" y="140" width="58" height="118" rx="7" fill="#61676A"/>','7. Duplex',491,202,'#fff',[516,144])}
      ${g('panel','<rect x="112" y="260" width="84" height="22" rx="5" fill="#2F6F8F"/>','Pannello',154,274,'#fff',[194,262])}
      ${g('ctrl','<rect x="310" y="260" width="102" height="22" rx="5" fill="#009FD7"/>','10. Wi-Fi / Ctrl',361,274,'#fff',[410,262])}
      <text x="280" y="381" font-size="10.5" font-weight="600" fill="#617472" text-anchor="middle">Fronte a sinistra (vassoio) · Retro a destra (duplex e fusore)</text>
    </svg>`;
    $$('#svgHost [data-mod]').forEach(el=>{
      el.addEventListener('click',()=>openModule(el.dataset.mod));
      el.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openModule(el.dataset.mod); } });
    });
  }

  function renderDev(){
    $('#devInfo').innerHTML=`
      <div><b>Prezzo di listino</b>${fmt(M.net)} <span class="small muted">${vatSuffix()}</span></div>
      <div><b>Con Cura triennale (−18%)</b>${fmt(M.discountedNet)} <span class="small muted">${vatSuffix()}</span></div>
      <div><b>Vassoio</b>250 fogli</div>
      <div><b>Funzioni</b>Stampa, scansione, fronte-retro</div>
      <div><b>Connessioni</b>Wi-Fi, Ethernet, USB</div>
      <div><b>Moduli</b>13 · passaporto digitale</div>
      <div><b>Contratto</b>${esc(currentPlan().name)}</div>
      <div><b>Numero di serie</b>${esc(S.serial)}</div>`;
  }

  function renderList(){
    $('#modList').innerHTML=MODULES.map(m=>{
      const st=S.status[m.id], h=st==='unk'?null:(isFault(m.id)?m.health.fault:m.health.ok);
      const col={ok:'var(--green-600)',warn:'var(--amber-800)',bad:'var(--red-800)',unk:'#B9C7C3'}[st];
      const price=isCovered(m) ? '<span class="pill b2b" style="font-size:.62rem">Cura · 0 €</span>'
        : `<span class="small muted" style="font-weight:700">da ${fmt(m.regenNet)}</span>`;
      const reading=st==='unk'?'Da verificare':esc(m.metric.label)+': '+esc(isFault(m.id)?m.metric.fault:m.metric.ok);
      return `<button type="button" class="module-item" data-mod="${m.id}">
        <span class="name"><i class="swatch" style="background:${m.color}"></i>${esc(m.name)} ${price}</span>${pill(st)}
        <span class="small muted" style="grid-column:1/-1">${reading}</span>
        <span class="meter"><i style="width:${h==null?0:h}%;background:${col}"></i></span></button>`;
    }).join('');
    $$('#modList [data-mod]').forEach(b=>b.addEventListener('click',()=>openModule(b.dataset.mod)));
  }

  /* ---------- Diagnostica ---------- */
  let diagRunning=false;
  $('#runDiag').addEventListener('click',runDiag);
  function runDiag(){
    if(diagRunning) return;
    diagRunning=true; $('#runDiag').disabled=true;
    const con=$('#console'); con.innerHTML='';
    const log=(t,cls)=>{ con.innerHTML += (cls?`<span class="${cls}">${esc(t)}</span>`:esc(t))+'\n'; con.scrollTop=con.scrollHeight; };
    log('Teseo Printer diagnostica · 13 moduli · S/N '+S.serial,'h');
    log('Collegamento: '+(S.via||'non connesso')+' · verifica sensori…');
    MODULES.forEach(m=>S.status[m.id]='unk'); renderSvg(); renderList();
    let i=0;
    const step=()=>{
      if(i>=MODULES.length){
        log('—');
        const f=BY[S.faulty];
        log(f ? `Esito: 1 modulo da sostituire → ${f.name} (${f.fault.code})` : 'Esito: tutti i 13 moduli operativi', f?'e':'o');
        $('#diagBar').style.width='100%'; $('#diagPct').textContent='Completata';
        $('#diagProgress').setAttribute('aria-valuenow','100');
        diagRunning=false; $('#runDiag').disabled=false; $('#runDiag').textContent='Ripeti diagnostica';
        S.diagDone=true; renderAll(); return;
      }
      const m=MODULES[i];
      log(`[${String(i+1).padStart(2,'0')}/${MODULES.length}] ${m.name} (${m.code})`);
      setTimeout(()=>{
        if(isFault(m.id)){
          log('      '+m.metric.fault, m.warnOnly?'w':'e');
          log('      '+m.fault.code+' · '+m.fault.msg, m.warnOnly?'w':'e');
          S.status[m.id]=faultStatus(m);
        } else { log('      '+m.metric.ok+'  ✓','o'); S.status[m.id]='ok'; }
        renderSvg(); renderList();
        i++;
        const pct=Math.round(i/MODULES.length*100);
        $('#diagBar').style.width=pct+'%'; $('#diagPct').textContent=pct+' %';
        $('#diagProgress').setAttribute('aria-valuenow',String(pct));
        setTimeout(step,300);
      },380);
    };
    $('#diagBar').style.width='0'; step();
  }

  function renderDiagResult(){
    const box=$('#diagResult'), f=BY[S.faulty];
    if(!f){ box.innerHTML='<h2>Risultato</h2><div class="alert ok"><b>✓</b><div class="grow">Tutti i 13 moduli funzionano correttamente.</div></div>'; return; }
    const cov=isCovered(f);
    box.innerHTML=`<h2>Risultato</h2>
      <p>${pill(S.status[f.id]==='unk'?'unk':faultStatus(f))} <b><i class="swatch" style="background:${f.color}"></i> ${esc(f.name)}</b>
        ${cov?'<span class="pill b2b">0 € con Cura</span>':`<span class="pill regen">♻ Rigenerato ${fmt(f.regenNet)}</span>`}</p>
      <div class="kv"><div><b>Codice errore</b>${esc(f.fault.code)}</div><div><b>Rilevato</b>${esc(f.metric.fault)}</div></div>
      <p><b>${esc(f.fault.msg)}.</b> ${esc(f.fault.cause)}</p>
      <div class="kv"><div><b>Codice ricambio</b>${esc(f.code)}</div><div><b>Sostituzione</b>${esc(f.diff)}</div><div><b>Tempo</b>${esc(f.time)}</div><div><b>Attrezzi</b>${esc(f.tools)}</div></div>
      <div class="row"><button type="button" class="btn btn-primary" data-buy="${f.id}" data-cond="regen">${cov?'Richiedi sostituzione':'Aggiungi rigenerato'}</button>
        <button type="button" class="btn btn-outline" data-guide="${f.id}">Vedi la guida</button></div>`;
  }

  /* ---------- Sintomi ---------- */
  function renderSym(){
    $('#symChips').innerHTML=SYMPTOMS.map(s=>`<button type="button" class="chip ${S.symSel.has(s.id)?'on':''}" data-sym="${s.id}" aria-pressed="${S.symSel.has(s.id)}">${esc(s.t)}</button>`).join('');
    $$('#symChips [data-sym]').forEach(b=>b.addEventListener('click',()=>{
      S.symSel.has(b.dataset.sym)?S.symSel.delete(b.dataset.sym):S.symSel.add(b.dataset.sym);
      renderSym();
    }));
    const score={};
    S.symSel.forEach(id=>{ const s=SYMPTOMS.find(x=>x.id===id); for(const k in s.w) score[k]=(score[k]||0)+s.w[k]; });
    const list=Object.entries(score).sort((a,b)=>b[1]-a[1]).slice(0,4);
    const box=$('#candBox');
    if(!list.length){ box.innerHTML='<p class="muted">Nessun sintomo selezionato.</p>'; return; }
    const max=list[0][1];
    box.innerHTML=`<div class="cands">${list.map(([id,v])=>{
      const m=BY[id];
      return `<div class="cand"><div class="grow"><b><i class="swatch" style="background:${m.color}"></i> ${esc(m.name)}</b><div class="tiny muted">${esc(m.fn)}</div></div>
        <div class="meter" title="Probabilità relativa"><i style="width:${Math.round(v/max*100)}%"></i></div>${pill(S.status[id])}</div>`;
    }).join('')}</div>
      <div class="row"><button type="button" class="btn btn-primary" id="targetTest">Test mirato</button></div><div id="targetOut" class="mt"></div>`;
    $('#targetTest').addEventListener('click',()=>{
      const btn=$('#targetTest'); btn.disabled=true; btn.textContent='Test in corso…';
      setTimeout(()=>{
        const ids=list.map(x=>x[0]);
        ids.forEach(id=>S.status[id]=isFault(id)?faultStatus(BY[id]):'ok');
        const hit=ids.find(isFault);
        if(hit) S.diagDone=true;
        renderAll();
        const out=$('#targetOut'); if(!out) return;
        out.innerHTML = hit
          ? `<div class="alert bad"><div class="grow"><b>Confermato: ${esc(BY[hit].name)}</b><br><span class="small">${BY[hit].fault.code} · ${esc(BY[hit].fault.msg)}</span></div><button type="button" class="btn btn-sm btn-primary" data-buy="${hit}" data-cond="regen">Aggiungi rigenerato</button></div>`
          : '<div class="alert ok"><div class="grow">I moduli sospetti funzionano. Prova la diagnostica completa.</div><button type="button" class="btn btn-sm btn-outline" data-go="diag">Diagnostica completa</button></div>';
      },1200);
    });
  }

  /* ---------- Negozio ---------- */
  $('#shopFilter').addEventListener('click',e=>{
    const b=e.target.closest('[data-filter]'); if(!b) return;
    S.shopFilter=b.dataset.filter;
    $$('#shopFilter [data-filter]').forEach(x=>{
      const on=x.dataset.filter===S.shopFilter;
      x.classList.toggle('on',on); x.setAttribute('aria-pressed',on?'true':'false');
    });
    renderShop();
  });

  function renderShop(){
    $('#curaShopBanner').innerHTML = hasCura()
      ? `<div class="alert info"><b>🛡️</b><div class="grow"><b>${esc(currentPlan().name)} attivo</b><br><span class="small">Moduli di usura, guasto e scanner a <b>0,00 €</b>, spedizioni gratuite. Toner e tamburo restano a listino (vuoti a rendere).</span></div><button type="button" class="btn btn-sm btn-outline" data-go="cura">Gestisci contratto</button></div>`
      : `<div class="alert info"><b>♻</b><div class="grow"><b>Listino definito dal business plan</b><br><span class="small">Macchina a ${fmt(M.net)} (${vatSuffix()}): circa il 23,3% in meno dei ~700 € della concorrenza. Con Cura i moduli coperti costano 0 €.</span></div><button type="button" class="btn btn-sm btn-blue" data-go="cura">Scopri Cura</button></div>`;

    const rec=S.diagDone?S.faulty:null;
    const order=[...MODULES].sort((a,b)=>(b.id===rec)-(a.id===rec));
    const regenView=S.shopFilter==='regen';
    // Il filtro "Solo rigenerati" forza la condizione su tutte le schede.
    if(regenView) MODULES.forEach(m=>{ S.selectedCond[m.id]='regen'; });

    $('#shopGrid').innerHTML=order.map(m=>{
      const cov=isCovered(m);
      const cond=S.selectedCond[m.id]||'regen';
      const saving=Math.round((1-m.regenNet/m.newNet)*100);
      const qty=(S.cart.find(c=>c.type==='part'&&c.id===m.id&&c.cond===cond)||{}).qty||0;
      const priceHtml = cov
        ? `<div class="price covered"><del>${fmt(m.newNet)}</del>0,00 €<small>Cura · ${vatSuffix()}</small></div>`
        : cond==='regen'
          ? `<div class="price"><del>${fmt(m.newNet)}</del>${fmt(m.regenNet)}<small>${vatSuffix()} · −${saving}%</small></div>`
          : `<div class="price">${fmt(m.newNet)}<small>${vatSuffix()} · nuovo</small></div>`;
      return `<article class="product-card ${m.id===rec?'recommended':''}">
        <div class="badge-line">${m.id===rec?'<span class="tag">★ CONSIGLIATO DALLA DIAGNOSTICA</span>':''}${cov?'<span class="pill b2b">Cura · 0 €</span>':''}${m.kind==='consumable'?'<span class="pill na">Vuoto a rendere</span>':''}</div>
        <div class="prod-top"><div><div class="prod-name"><i class="swatch" style="background:${m.color}"></i>${esc(m.name)}</div><div class="code">${esc(m.code)} · ${esc(m.life)}</div></div></div>
        <div class="desc">${esc(m.fn)}</div>
        <div class="cond-switch" role="group" aria-label="Condizione di ${esc(m.name)}">
          <button type="button" class="${cond==='regen'?'on regen-btn':''}" data-cond-set="${m.id}:regen" aria-pressed="${cond==='regen'}">♻ Rigenerato −${saving}%</button>
          ${regenView?'':`<button type="button" class="${cond==='new'?'on':''}" data-cond-set="${m.id}:new" aria-pressed="${cond==='new'}">Nuovo</button>`}
        </div>
        <div class="note">${esc(m.regenNote)}</div>
        <div class="tiny muted">${esc(m.diff)} · ${esc(m.time)}</div>
        <div class="price-row">${priceHtml}<button type="button" class="btn ${cov?'btn-blue':'btn-primary'} btn-sm" data-add="${m.id}" data-cond="${cond}">${qty?`Nel carrello (${qty}) +1`:'Aggiungi'}</button></div>
        <button type="button" class="btn btn-ghost btn-xs" data-mod="${m.id}">Scheda e Passaporto Digitale</button>
      </article>`;
    }).join('');
    $$('#shopGrid [data-cond-set]').forEach(b=>b.addEventListener('click',()=>{
      const [id,cond]=b.dataset.condSet.split(':'); S.selectedCond[id]=cond; renderShop();
    }));
    $$('#shopGrid [data-add]').forEach(b=>b.addEventListener('click',()=>addPart(b.dataset.add,b.dataset.cond)));
    $$('#shopGrid [data-mod]').forEach(b=>b.addEventListener('click',()=>openModule(b.dataset.mod)));
  }

  function addPart(id,cond,silent){
    const m=BY[id]; const actual=m && m.kind==='consumable' ? (cond||'regen') : (cond||S.selectedCond[id]||'regen');
    const existing=S.cart.find(c=>c.type==='part'&&c.id===id&&c.cond===actual);
    if(existing) existing.qty=(existing.qty||1)+1;
    else S.cart.push({type:'part',id,cond:actual,qty:1});
    if(!silent) toast(m.name+(actual==='regen'?' (rigenerato)':' (nuovo)')+' aggiunto al carrello');
    renderShop(); renderCartBadge();
  }
  function addPlan(id,openAfter){
    if(S.curaPlan===id && !S.cart.some(c=>c.type==='plan')){ toast('Questo piano è già attivo'); return; }
    S.cart=S.cart.filter(c=>c.type!=='plan');
    S.cart.unshift({type:'plan',id});
    renderAll(); toast(PLAN_BY[id].name+' aggiunto al carrello');
    if(openAfter) openCart();
  }
  function renderCartBadge(){
    const n=S.cart.reduce((s,c)=>s+(c.type==='plan'?1:(c.qty||1)),0);
    [['#cartBadge'],['#navCartCount'],['#cartCountShop'],['#cartCountCura']].forEach(([sel])=>{
      const el=$(sel); if(!el) return; el.textContent=n; el.hidden=!n;
    });
  }
  function shippingNet(plan){ return S.cart.some(c=>c.type==='part') && plan==='none' ? round2(SHIPPING_GROSS/(1+IVA)) : 0; }
  function unitNet(c,plan){
    if(c.type==='plan') return round2(PLAN_BY[c.id].net);
    const m=BY[c.id]; if(!m) return 0;
    return isCovered(m,plan) ? 0 : (c.cond==='regen'?m.regenNet:m.newNet);
  }
  function cartTotalNet(){
    const plan=effectivePlan();
    return round2(S.cart.reduce((s,c)=>s+unitNet(c,plan)*(c.qty||1),0)+shippingNet(plan));
  }

  ['#cartBtn','#cartBtnShop','#cartBtnCura'].forEach(sel=>$(sel).addEventListener('click',openCart));

  function openCart(){
    if(!S.cart.length){ modal('<h2>Carrello</h2><div class="empty"><p class="muted">Il carrello è vuoto.</p></div>'); return; }
    const plan=effectivePlan();
    const hasPlan=S.cart.some(c=>c.type==='plan');
    const hasParts=S.cart.some(c=>c.type==='part');
    const warned=S.diagDone && S.faulty && !S.cart.some(c=>c.id===S.faulty);
    const upsell=(!hasCura() && !hasPlan) ? `<div class="alert warn"><b>💡</b><div class="grow">Con Cura annuale (${fmt(C.annual.net)} ${vatSuffix()}) o triennale (${fmt(C.tri.net)} ${vatSuffix()}) i moduli coperti e la spedizione diventano 0 €.</div><button type="button" class="btn btn-sm btn-blue" data-add-plan="annual">Aggiungi Cura annuale</button></div>` : '';
    modal(`<p class="eyebrow">Riepilogo</p><h2>Carrello</h2>
      ${warned?`<div class="alert bad"><div class="grow">La diagnostica indica <b>${esc(BY[S.faulty].name)}</b>, non ancora nel carrello.</div><button type="button" class="btn btn-sm btn-primary" data-add-fix="${S.faulty}">+ Aggiungi rigenerato</button></div>`:''}
      ${upsell}
      <div class="table-wrap"><table>
        <thead><tr><th>Articolo</th><th>Condizione</th><th>Qtà</th><th class="right">Subtotale (${vatSuffix()})</th><th></th></tr></thead>
        <tbody>${S.cart.map((c,idx)=>{
          if(c.type==='plan'){
            const p=PLAN_BY[c.id];
            return `<tr><td><b>🛡️ ${esc(p.name)}</b><div class="tiny muted">${esc(p.code)} · ${esc(p.period)}</div></td><td><span class="pill b2b">Contratto</span></td><td>1</td><td class="right num"><b>${fmt(p.net)}</b></td><td class="right"><button type="button" class="btn btn-xs btn-ghost" data-rm="${idx}">Rimuovi</button></td></tr>`;
          }
          const m=BY[c.id], qty=c.qty||1, cov=isCovered(m,plan);
          return `<tr><td><b><i class="swatch" style="background:${m.color}"></i> ${esc(m.name)}</b><div class="tiny muted">${esc(m.code)}${c.cond==='regen'?'-R':''}</div></td>
            <td>${c.cond==='regen'?'<span class="pill regen">♻ Rigenerato</span>':'<span class="pill na">Nuovo</span>'}${cov?' <span class="pill b2b">Cura 0 €</span>':''}</td>
            <td><span class="qty-box"><button type="button" data-qty="-1" data-idx="${idx}" aria-label="Riduci quantità">−</button><span>${qty}</span><button type="button" data-qty="1" data-idx="${idx}" aria-label="Aumenta quantità">+</button></span></td>
            <td class="right num">${cov?`<del class="muted tiny">${fmt(c.cond==='regen'?m.regenNet:m.newNet)}</del> <b>0,00 €</b>`:fmt(unitNet(c,plan)*qty)}</td>
            <td class="right"><button type="button" class="btn btn-xs btn-ghost" data-rm="${idx}">×</button></td></tr>`;
        }).join('')}
        ${hasParts?`<tr><td colspan="3">Spedizione e scatola di reso</td><td class="right num">${shippingNet(plan)===0?`<del class="tiny muted">${fmtFixedGross(SHIPPING_GROSS)}</del> <b>0,00 €</b>`:fmt(shippingNet(plan))}</td><td></td></tr>`:''}
        <tr><td colspan="3"><b>Totale (${vatSuffix()})</b></td><td class="right num"><b>${fmt(cartTotalNet())}</b></td><td></td></tr>
        </tbody></table></div>
      ${user?'<p class="small muted mt">L’ordine verrà salvato nel tuo account e associato al tuo indirizzo email.</p>':'<div class="alert warn mt"><b>!</b><div class="grow">Modalità ospite: puoi simulare l’ordine, ma <b>accedi per salvare l’acquisto</b>, il piano e i ticket.</div><button type="button" class="btn btn-sm btn-outline" data-login="Accedi per salvare l’acquisto">Accedi</button></div>'}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-close>Continua</button><button type="button" class="btn btn-primary" id="checkout">Conferma ordine</button></div>`);

    $$('#overlay [data-rm]').forEach(b=>b.onclick=()=>{ S.cart.splice(Number(b.dataset.rm),1); renderAll(); openCart(); });
    $$('#overlay [data-qty]').forEach(b=>b.onclick=()=>{
      const i=Number(b.dataset.idx), item=S.cart[i]; if(!item) return;
      const d=Number(b.dataset.qty);
      if(d<0 && (item.qty||1)<=1) S.cart.splice(i,1); else item.qty=(item.qty||1)+d;
      renderAll(); openCart();
    });
    $('#checkout').onclick=openPayment;
  }

  /* Checkout dimostrativo: raccoglie un metodo di pagamento finto, poi finalizza l'ordine. */
  function openPayment(){
    if(!S.cart.length){ toast('Il carrello è vuoto.'); return; }
    const planEntry=S.cart.find(c=>c.type==='plan');
    const total=cartTotalNet();
    const benefits=planEntry && planEntry.id!=='none'
      ? `<div class="pay-benefits"><h3>Vantaggi attivi con ${esc(PLAN_BY[planEntry.id].name)}</h3>${benefitGrid(paidPlanBenefits(planEntry.id))}</div>`
      : '';
    modal(`<p class="eyebrow">Checkout · passaggio 2 di 2</p><h2>Pagamento demo</h2>
      <div class="alert info"><b>🔒</b><div class="grow"><b>Nessun addebito reale.</b> Usa dati di fantasia: carta demo 4242 4242 4242 4242, scadenza 12/30, CVV 123.</div></div>
      ${benefits}
      <h3 class="mt">Metodo di pagamento</h3>
      <div class="pay-layout" id="payMethods">${paymentMethodRadios()}</div>
      <form id="payForm" novalidate>
        <div class="pay-form-grid" id="payCardFields">
          <div class="full"><label for="payName">Intestatario della carta</label><input id="payName" type="text" autocomplete="cc-name" placeholder="Mario Rossi"></div>
          <div class="full"><label for="payNumber">Numero carta</label><input id="payNumber" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" maxlength="23"></div>
          <div><label for="payExp">Scadenza</label><input id="payExp" autocomplete="cc-exp" placeholder="MM/AA" maxlength="5"></div>
          <div><label for="payCvv">CVV</label><input id="payCvv" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4"></div>
        </div>
        <div class="pay-form-grid">
          <div class="full"><label for="payEmail">Email per la ricevuta (facoltativa)</label><input id="payEmail" type="email" autocomplete="email" placeholder="nome@azienda.it" value="${user?esc(user.email||''):''}"></div>
        </div>
        <p id="payMsg" class="form-msg full" role="status" aria-live="polite"></p>
      </form>
      <div class="pay-total"><span>Totale (${vatSuffix()})<br><span class="tiny">IVA ${S.vatIncluded?'inclusa':'esclusa 22%'} · pagamento simulato</span></span><b>${fmt(total)}</b></div>
      <div class="row mt" style="justify-content:flex-end;gap:10px"><button type="button" class="btn btn-ghost" data-close>Annulla</button><button type="button" class="btn btn-primary" id="payConfirm">Paga ${fmt(total)} (demo)</button></div>
      <p class="pay-note">Nessun dato viene inviato a banche o circuiti di pagamento: questa schermata mostra solo il flusso di acquisto.</p>`);

    const cardFields=$('#payCardFields');
    const syncFields=()=>{ if(cardFields) cardFields.hidden=String($('#payMethods input:checked').value)!=='carta'; };
    $$('#payMethods input').forEach(r=>r.addEventListener('change',syncFields));
    syncFields();

    $('#payConfirm').onclick=async ()=>{
      const msg=$('#payMsg'); msg.className='form-msg full';
      const method=$('#payMethods input:checked').value;
      let last4='';
      if(method==='carta'){
        const name=$('#payName').value.trim();
        const num=$('#payNumber').value.replace(/\D/g,'');
        const exp=$('#payExp').value.trim();
        const cvv=$('#payCvv').value.trim();
        if(!name || num.length<12 || !/^\d{2}\/\d{2}$/.test(exp) || !/^\d{3,4}$/.test(cvv)){
          msg.textContent='Controlla i dati della carta demo: numero (almeno 12 cifre), scadenza MM/AA e CVV.';
          msg.classList.add('error'); $('#payNumber').focus(); return;
        }
        last4=num.slice(-4);
      }
      const email=$('#payEmail').value.trim();
      if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        msg.textContent='Inserisci un indirizzo email valido per la ricevuta.';
        msg.classList.add('error'); $('#payEmail').focus(); return;
      }
      S.payment={method,last4,email:email||'ospite'};
      const confirmBtn=$('#payConfirm'); confirmBtn.disabled=true; confirmBtn.textContent='Elaboramento demo…';
      await new Promise(r=>setTimeout(r,450));
      finalizeOrder();
    };
  }

  async function finalizeOrder(){
    const orderCode='ORD-'+Date.now().toString().slice(-7);
    const planEntry=S.cart.find(c=>c.type==='plan');
    const plan=planEntry?planEntry.id:S.curaPlan;
    const rows=S.cart.map(c=>{
      if(c.type==='plan'){
        const p=PLAN_BY[c.id];
        return {user_id:user&&user.id, order_code:orderCode, item_name:`${p.name} (${p.code})`, quantity:1, unit_price_net:round2(p.net), total_net:round2(p.net), status:'confermato'};
      }
      const m=BY[c.id], qty=c.qty||1;
      const unit=isCovered(m,plan)?0:(c.cond==='regen'?m.regenNet:m.newNet);
      return {user_id:user&&user.id, order_code:orderCode, item_name:`${m.name} — ${c.cond==='regen'?'rigenerato':'nuovo'} (${m.code}${c.cond==='regen'?'-R':''})`, quantity:qty, unit_price_net:round2(unit), total_net:round2(unit*qty), status:'confermato'};
    });
    const ship=shippingNet(plan);
    if(ship>0) rows.push({user_id:user&&user.id, order_code:orderCode, item_name:'Spedizione e scatola di reso', quantity:1, unit_price_net:ship, total_net:ship, status:'confermato'});

    let saved=false;
    if(user && supabase){
      const { error } = await supabase.from('teseo_purchases').insert(rows);
      if(error){ toast('Errore durante il salvataggio: '+error.message); if(btn) btn.disabled=false; return; }
      if(planEntry){
        const { error:pe } = await supabase.from('teseo_profiles').update({plan_id:planEntry.id}).eq('id',user.id);
        if(pe) toast('Ordine salvato, ma aggiornamento piano non riuscito: '+pe.message);
        else if(profile) profile.plan_id=planEntry.id;
      }
      S.curaPlan=planEntry?planEntry.id:S.curaPlan;
      rows.forEach(r=>S.purchases.unshift({...r,id:'local-'+Math.random().toString(36).slice(2),created_at:new Date().toISOString()}));
      saved=true;
      await refreshPurchases();
    }

    const hasParts=S.cart.some(c=>c.type==='part');
    const ret=hasParts?'RESO-'+Math.random().toString(36).slice(2,8).toUpperCase():null;
    S.orders.unshift({id:orderCode, items:S.cart.map(c=>({...c})), total:cartTotalNet(), date:new Date(), stage:hasParts?1:6, onlyPlan:!hasParts, installed:!hasParts, ret});
    const total=cartTotalNet();
    S.cart=[]; renderAll();

    const pay=S.payment||{method:'demo',last4:'',email:''};
    const payName={carta:'Carta demo',bonifico:'Bonifico demo',paypal:'PayPal demo'}[pay.method]||'Pagamento demo';
    const paymentLine=`<div class="alert ok"><b>💳</b><div class="grow"><b>${payName} confermato</b> · nessun addebito reale${pay.last4?` · carta •••• ${esc(pay.last4)}`:''}${pay.email && pay.email!=='ospite'?` · ricevuta a ${esc(pay.email)}`:''}</div></div>`;
    S.payment=null;

    modal(`<p class="eyebrow">Conferma</p><h2>Ordine ${orderCode} ✓</h2>
      <p>Totale <b>${fmt(total)}</b> (${vatSuffix()}).</p>
      ${paymentLine}
      ${planEntry && planEntry.id!=='none'?`<div class="pay-benefits"><h3>Vantaggi del piano attivo</h3>${benefitGrid(paidPlanBenefits(planEntry.id))}</div>`:''}
      ${saved?`<div class="alert ok"><b>✓</b><div class="grow">Acquisto salvato nel tuo account${planEntry?`, piano <b>${esc(PLAN_BY[planEntry.id].name)}</b> attivato`:''}.</div></div>`:'<div class="alert warn"><b>!</b><div class="grow">Ordine demo locale: <b>accedi per salvare l’acquisto</b> e vedere lo stato nell’Area Account.</div></div>'}
      ${hasParts?`<div class="kv"><div><b>Consegna stimata</b>${dateFmt(Date.now()+2*864e5)}</div><div><b>Codice reso</b>${esc(ret)}</div></div>`:''}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-outline" data-go="shop">Torna ai ricambi</button>${user?'<button type="button" class="btn btn-primary" data-go="account">Vai all’Area Account</button>':'<button type="button" class="btn btn-primary" data-login="Accedi per salvare l’acquisto e vedere i tuoi ordini">Accedi</button>'}</div>`);
  }

  /* ---------- Contratti Cura ---------- */
  function renderCura(){
    $('#curaHeaderDesc').textContent = `Canoni netti: 59 €/anno (annuale, 71,98 € IVA inclusa) oppure 159 € anticipati per tre anni, cioè 53 €/anno (193,98 € IVA inclusa): risparmio del 10,2%. Chi sceglie il triennale ha il 18% di sconto sulla macchina.`;
    $('#curaStatusBox').innerHTML = hasCura()
      ? `<div class="alert ok"><b>🛡️</b><div class="grow"><b>Piano attivo: ${esc(currentPlan().name)}</b><br><span class="small">${S.curaPlan==='tri'?'53 €/anno netti, pagati in anticipo.':'59 €/anno netti.'} Moduli coperti e spedizioni a 0,00 €.</span></div></div>`
      : `<div class="alert info"><b>ℹ️</b><div class="grow"><b>Piano attuale: Standard (a consumo)</b><br><span class="small">Acquista i ricambi a listino oppure attiva Cura per azzerare moduli di usura, guasto e spedizioni.</span></div></div>`;
    $('#planGrid').innerHTML=CURA_PLANS.map(p=>{
      const active=S.curaPlan===p.id;
      const inCart=S.cart.some(c=>c.type==='plan'&&c.id===p.id);
      const price=p.net===0?'0,00 €':fmt(p.net);
      return `<article class="plan ${p.featured?'featured':''} ${active?'active':''}">
        <div class="row" style="justify-content:space-between"><span class="pill ${active?'ok':'b2b'}">${esc(p.badge)}</span>${active?'<span class="tag">● ATTIVO</span>':''}</div>
        <h3>${esc(p.name)}</h3>
        <div class="plan-price"><span class="price">${price}</span><small>${p.net===0?esc(p.period):vatSuffix()+' · '+esc(p.period)}</small></div>
        <p class="small muted">${esc(p.desc)}</p>
        <ul>${p.features.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>
        ${active?'<button type="button" class="btn btn-ghost" disabled>Piano attivo</button>':inCart?'<button type="button" class="btn btn-primary" data-open-cart>Piano nel carrello · Vai al checkout</button>':`<button type="button" class="btn ${p.featured?'btn-blue':'btn-primary'}" data-add-plan="${p.id}">Attiva ${esc(p.name)}</button>`}
      </article>`;
    }).join('');
    $$('#planGrid [data-add-plan]').forEach(b=>b.addEventListener('click',()=>addPlan(b.dataset.addPlan,true)));
    const oc=$('#planGrid [data-open-cart]'); if(oc) oc.onclick=openCart;
  }

  /* ---------- Assistenza ---------- */
  function renderFaq(){
    const q=$('#faqSearch').value.trim().toLowerCase();
    const found=FAQS.filter(f=>(f.q+' '+f.a+' '+f.k).toLowerCase().includes(q));
    $('#faqCount').textContent=found.length;
    $('#faqList').innerHTML=found.length
      ? found.map((f,i)=>`<details class="faq-item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')
      : '<p class="muted">Nessun risultato. Prova con un’altra parola o scrivici direttamente.</p>';
  }
  $('#faqSearch').addEventListener('input',renderFaq);

  $('#ticketForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const msg=$('#ticketFormMsg'); msg.className='form-msg full';
    const subject=$('#tkSubject').value.trim(), category=$('#tkCategory').value;
    let text=$('#tkMessage').value.trim(); const serial=$('#tkSerial').value.trim();
    if(!subject||!text){ msg.textContent='Compila oggetto e messaggio.'; msg.classList.add('error'); return; }
    if(!user || !supabase){
      msg.textContent='Per inviare un ticket devi accedere al tuo account.';
      openAuthForAction('Accedi per inviare la richiesta: il ticket sarà visibile nella tua Area Account.');
      return;
    }
    if(serial) text += '\n\nNumero di serie: '+serial;
    const btn=$('#tkSubmit'); btn.disabled=true;
    const { data, error } = await supabase.from('teseo_support_tickets').insert({
      user_id:user.id, subject, category, message:text, status:'aperto'
    }).select().single();
    btn.disabled=false;
    if(error){ msg.textContent='Errore durante l’invio: '+error.message; msg.classList.add('error'); return; }
    S.tickets.unshift(data); e.target.reset();
    msg.textContent='Richiesta inviata. Puoi seguirne lo stato nell’Area Account.'; msg.classList.add('ok');
    renderAssist(); renderAccount(); toast('Ticket inviato');
  });

  function renderAssist(){
    renderFaq();
    const box=$('#myTicketsBox');
    if(!user){ box.innerHTML='<h2>I tuoi ticket</h2><p class="muted">Accedi per inviare richieste e vederne lo stato.</p>'; return; }
    box.innerHTML=`<header class="card-head"><div><p class="eyebrow">Supporto</p><h2>I tuoi ticket</h2></div><span class="pill b2b">${S.tickets.length} richieste</span></header>
      ${S.tickets.length?`<div class="table-wrap"><table><thead><tr><th>Oggetto</th><th>Categoria</th><th>Data</th><th>Stato</th></tr></thead><tbody>
      ${S.tickets.map(t=>`<tr><td><b>${esc(t.subject)}</b><div class="tiny muted">${esc(String(t.message).slice(0,90))}${String(t.message).length>90?'…':''}</div></td><td>${esc(t.category)}</td><td class="num">${dateFmt(t.created_at)}</td><td>${statusTicket(t.status)}</td></tr>`).join('')}
      </tbody></table></div>`:'<div class="empty"><p class="muted">Nessun ticket aperto. Usa il form qui sopra per scriverci.</p></div>'}`;
  }

  /* ---------- Area Account ---------- */
  function renderAccount(){
    const box=$('#accountBox');
    if(!user){
      box.innerHTML='<div class="card empty"><h2>Area Account</h2><p class="muted">Questa sezione è disponibile solo per gli utenti autenticati.</p><button type="button" class="btn btn-primary" data-login>Accedi o crea un account</button></div>';
      return;
    }
    const name=(profile&&profile.full_name)||user.user_metadata&&user.user_metadata.full_name||user.email;
    const company=(profile&&profile.company)||'—';
    const plan=PLAN_BY[S.curaPlan]||PLAN_BY.none;
    box.innerHTML=`
      <article class="card intro-card"><p class="eyebrow">Profilo</p><h2>Ciao, ${esc(name)}</h2>
        <div class="kv"><div><b>Email</b>${esc(user.email)}</div><div><b>Azienda / scuola</b>${esc(company)}</div><div><b>Account creato</b>${dateFmt(profile&&profile.created_at||user.created_at)}</div>
          <div><b>Piano attivo</b>${esc(plan.name)}</div><div><b>Numero di serie</b>${esc(S.serial)}</div></div>
        <div class="row"><button type="button" class="btn btn-sm btn-outline" data-go="cura">Gestisci piano</button><button type="button" class="btn btn-sm btn-outline" data-go="assist">Apri un ticket</button></div>
      </article>
      <article class="card"><header class="card-head"><div><p class="eyebrow">Contratto</p><h2>Piano attivo</h2></div>${statusTicket('confermato')}</header>
        <p><b>${esc(plan.name)}</b> · ${esc(plan.period)}</p>
        <p class="small muted">${S.curaPlan==='annual'?'Canone 59 €/anno netti (71,98 € IVA inclusa).':S.curaPlan==='tri'?'159 € anticipati = 53 €/anno netti (193,98 € IVA inclusa).':'Nessun canone: ricambi a listino.'}</p>
      </article>
      <article class="card mt"><header class="card-head"><div><p class="eyebrow">Storico</p><h2>Acquisti</h2></div><span class="pill b2b">${S.purchases.length} ordini</span></header>
        ${S.purchases.length?`<div class="table-wrap"><table><thead><tr><th>Codice ordine</th><th>Data</th><th>Articolo</th><th>Qtà</th><th class="right">Netto</th><th class="right">Lordo</th><th>Stato</th></tr></thead><tbody>
          ${S.purchases.map(p=>`<tr><td class="num"><b>${esc(p.order_code)}</b></td><td class="num">${dateFmt(p.created_at)}</td><td>${esc(p.item_name)}</td><td class="num">${esc(p.quantity)}</td>
            <td class="right num">${eur.format(Number(p.unit_price_net)*Number(p.quantity))}</td><td class="right num">${eur.format(round2(Number(p.total_net)*(1+IVA)))}</td><td>${statusTicket(p.status)}</td></tr>`).join('')}
        </tbody></table></div>`:'<div class="empty"><p class="muted">Non hai ancora acquisti registrati. I nuovi ordini compariranno qui.</p><button type="button" class="btn btn-sm btn-primary" data-go="shop">Vai ai ricambi</button></div>'}
      </article>
      <article class="card mt"><header class="card-head"><div><p class="eyebrow">Assistenza</p><h2>Ticket</h2></div><span class="pill b2b">${S.tickets.length} richieste</span></header>
        ${S.tickets.length?`<div class="table-wrap"><table><thead><tr><th>Oggetto</th><th>Categoria</th><th>Data</th><th>Stato</th></tr></thead><tbody>
          ${S.tickets.map(t=>`<tr><td><b>${esc(t.subject)}</b><div class="tiny muted">${esc(String(t.message).slice(0,100))}${String(t.message).length>100?'…':''}</div></td><td>${esc(t.category)}</td><td class="num">${dateFmt(t.created_at)}</td><td>${statusTicket(t.status)}</td></tr>`).join('')}
        </tbody></table></div>`:'<div class="empty"><p class="muted">Nessun ticket. Scrivici dalla sezione Assistenza clienti.</p><button type="button" class="btn btn-sm btn-outline" data-go="assist">Vai all’assistenza</button></div>'}
      </article>`;
  }

  /* ---------- Pagamenti demo e vantaggi dei piani ---------- */
  function paidPlanBenefits(planId){
    const base=[
      'Ricambi dei moduli coperti (usura, guasto e scanner) a 0 €',
      'Sostituzione guidata in 48 ore, spedizione e reso gratuiti',
      'Assistenza prioritaria e diagnostica inclusa'
    ];
    if(planId==='tri') return base.concat([
      '18% di sconto sulla macchina: 360,80 € netti invece di 440 €',
      'Una sola fattura anticipata per delibere e bandi MEPA'
    ]);
    return base.concat(['Canone 59 €/anno netti (71,98 € IVA inclusa)']);
  }
  function benefitGrid(items){
    return `<ul class="benefit-grid">${items.map(b=>`<li><span>${esc(b)}</span></li>`).join('')}</ul>`;
  }
  function paymentMethodRadios(){
    return PAY_METHODS.map(m=>`<label class="pay-method">
      <input type="radio" name="payMethod" value="${m.id}" ${m.id==='carta'?'checked':''}>
      <span><strong>${m.icon} ${esc(m.name)}</strong><small>${esc(m.desc)}</small></span>
    </label>`).join('');
  }
  function renderPayments(){
    const box=$('#paymentsBox'); if(!box) return;
    const rows=[
      ['Canone', 'Nessuno', `${fmt(C.annual.net)} / anno`, `${fmt(C.tri.net)} anticipati · 53 €/anno`],
      ['Moduli di usura, guasto e scanner', `A listino`, '<b>0 €</b>', '<b>0 €</b>'],
      ['Consumabili (toner e tamburo)', 'A listino', 'A listino', 'A listino'],
      ['Spedizione e scatola di reso', fmtFixedGross(SHIPPING_GROSS), '<b>Gratis</b>', '<b>Gratis</b>'],
      ['Tempi di intervento', 'Standard', 'Entro 48 ore', 'Entro 48 ore · priorità'],
      ['Sconto 18% sulla macchina', '—', '—', '<b>440 € → 360,80 € netti</b>'],
      ['Pagamento (demo)', '—', 'Carta / bonifico / PayPal', 'Carta / bonifico / PayPal']
    ];
    box.innerHTML=`
      <article class="card">
        <span class="demo-badge">Simulazione · nessun addebito</span>
        <h3>Scegli come pagare</h3>
        <p class="muted small">Il checkout è dimostrativo: puoi usare dati di fantasia. La ricevuta e lo stato dell’ordine sono simulati, ma se sei autenticato l’acquisto viene salvato nel tuo account.</p>
        <div class="pay-layout">${paymentMethodRadios()}</div>
        <div class="pay-benefits">
          <h3>Cosa ottieni con un piano Cura a pagamento</h3>
          ${benefitGrid(paidPlanBenefits('annual'))}
        </div>
        <div class="row mt" style="justify-content:flex-end;flex-wrap:wrap;gap:10px">
          <button type="button" class="btn btn-outline" data-go="cura">Vedi i piani</button>
          <button type="button" class="btn btn-primary" data-pay-plan="annual">Attiva Cura annuale · paga (demo)</button>
          <button type="button" class="btn btn-blue" data-pay-plan="tri">Attiva Cura triennale · paga (demo)</button>
        </div>
      </article>
      <article class="card mt">
        <h3>Standard vs Cura: vantaggi inclusi</h3>
        <p class="muted small">Il confronto segue il toggle Netto / IVA inclusa dell’header.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Vantaggio</th><th>Standard</th><th>Cura annuale</th><th>Cura triennale</th></tr></thead>
          <tbody>${rows.map(r=>`<tr><td><b>${esc(r[0])}</b></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</tbody>
        </table></div>
        <p class="pay-note">I consumabili (toner e tamburo) restano a listino e vanno restituiti vuoti: il contratto copre i moduli di usura, guasto e scanner.</p>
      </article>`;
  }

  /* ---------- Prezzi e trasparenza ---------- */
  function renderPrices(){
    const rows=[
      ['Macchina Teseo M1 Pro', M.net, 'Listino · 2_Ipotesi r.46'],
      ['Macchina con Cura triennale (−18%)', M.discountedNet, 'Sconto triennale · r.49'],
      ['Cura annuale (12 mesi)', C.annual.net, '6_Contratti_Cura r.209'],
      ['Cura triennale (159 € anticipati)', C.tri.net, '6_Contratti_Cura r.210'],
      ['Cura triennale · quota annua', C.tri.perYearNet, '53 €/anno netti'],
      ['Ricavo ricorrente base', M.recurringNetPerYear, 'per macchina / anno · r.82']
    ];
    $('#priceTableBox').innerHTML=`<article class="card"><div class="table-wrap"><table>
      <thead><tr><th>Voce</th><th class="right">Netto</th><th class="right">IVA inclusa</th><th>Fonte</th></tr></thead><tbody>
      ${rows.map(r=>`<tr><td><b>${esc(r[0])}</b></td><td class="right num">${eur.format(r[1])}</td><td class="right num">${eur.format(round2(r[1]*(1+IVA)))}</td><td class="tiny muted">${esc(r[2])}</td></tr>`).join('')}
      <tr><td>Confronto concorrenti (IVA inclusa)</td><td class="right num">${fmtFixedGross(M.competitorGross)}</td><td class="right num">${eur.format(M.competitorGross)}</td><td class="tiny muted">~700 € · r.52</td></tr>
      </tbody></table></div>
      <div class="grid-two mt">
        <div class="alert ok"><b>↓</b><div class="grow"><b>Teseo 536,80 € IVA inclusa contro ~700 €</b><br><span class="small">Risparmio del <b>23,3%</b> sul prezzo di acquisto.</span></div></div>
        <div class="alert info"><b>♻</b><div class="grow"><b>Ricavo ricorrente base: 52 €/anno per macchina</b><br><span class="small">Contratti Cura, ricambi e toner rigenerati.</span></div></div>
      </div></article>`;
  }

  /* ---------- Ordini demo ---------- */
  const STAGES=['Ordinato','Spedito','Consegnato','Installato','Pezzo reso','Rigenerato'];
  function renderOrders(){
    const box=$('#ordersBox');
    if(!S.orders.length){ box.innerHTML='<div class="card empty"><p class="muted">Nessun ordine demo. Aggiungi un ricambio al carrello o attiva un piano Cura.</p><button type="button" class="btn btn-sm btn-primary" data-go="shop">Vai ai ricambi</button></div>'; return; }
    box.innerHTML=S.orders.map(o=>{
      const labels=o.items.map(it=>{
        if(it.type==='plan') return `🛡️ ${PLAN_BY[it.id].name}`;
        const m=BY[it.id]; return `${it.qty>1?it.qty+'× ':''}${m?m.name:it.id} [${it.cond==='regen'?'♻ rigenerato':'nuovo'}]`;
      }).join(', ');
      return `<div class="card mt"><header class="card-head"><div><h3>${esc(o.id)}</h3><div class="small muted">${dateFmt(o.date)} · ${fmt(o.total)} · reso ${esc(o.ret||'—')}</div></div><span class="pill ${o.onlyPlan?'b2b':'ok'}">${o.onlyPlan?'Contratto':'Ricambi'}</span></header>
        <p class="small">${esc(labels)}</p>
        ${o.onlyPlan?`<p class="small muted">Attivazione contratto registrata: copertura ricambi operativa.</p>`:`<div class="timeline">${STAGES.map((s,i)=>`<div class="${i<o.stage?'done':''}">${s}</div>`).join('')}</div>`}
        <div class="row">
          ${o.stage<3&&!o.onlyPlan?`<button type="button" class="btn btn-sm btn-outline" data-adv="${esc(o.id)}">Simula avanzamento</button>`:''}
          ${o.stage===3?o.items.filter(it=>it.type==='part').map(it=>`<button type="button" class="btn btn-sm btn-primary" data-guide="${esc(it.id)}" data-order="${esc(o.id)}">Installa ${esc(BY[it.id].name)}</button>`).join(''):''}
          ${o.stage===4?`<button type="button" class="btn btn-sm btn-outline" data-adv="${esc(o.id)}">Ho spedito il pezzo vecchio</button>`:''}
          ${o.stage===5?`<button type="button" class="btn btn-sm btn-outline" data-adv="${esc(o.id)}">Simula rigenerazione</button>`:''}
          ${o.stage>=6&&!o.onlyPlan?'<span class="small" style="color:var(--green-800);font-weight:700">♻ Ciclo chiuso</span>':''}
        </div></div>`;
    }).join('');
    $$('[data-adv]').forEach(b=>b.onclick=()=>{ const o=S.orders.find(x=>x.id===b.dataset.adv); if(o){ o.stage++; renderOrders(); } });
  }

  /* ---------- Scheda modulo, QR e guida ---------- */
  function qr(seed){
    let h=0; for(const ch of seed) h=(h*31+ch.charCodeAt(0))>>>0;
    let out=''; const n=15,s=4;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const fin=(x<4&&y<4)||(x>n-5&&y<4)||(x<4&&y>n-5);
      let on;
      if(fin){ const fx=x>n-5?x-(n-4):x, fy=y>n-5?y-(n-4):y;
        on=(fx===0||fy===0||fx===3||fy===3)||(fx>0&&fx<3&&fy>0&&fy<3&&fx===fy)||(fx===1&&fy===2)||(fx===2&&fy===1);
      } else { h^=h<<13; h^=h>>>17; h<<=5; h>>>=0; on=h%2===0; }
      if(on) out+=`<rect x="${x*s}" y="${y*s}" width="${s}" height="${s}"/>`;
    }
    return `<svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true"><rect width="60" height="60" fill="#fff"/><g fill="#0D2B33">${out}</g></svg>`;
  }
  function openModule(id){
    const m=BY[id], st=S.status[id], cov=isCovered(m);
    const reading=st==='unk'?'Da verificare':(isFault(id)?m.metric.fault:m.metric.ok);
    const priceRegen=cov?`<del class="muted">${fmt(m.regenNet)}</del> <b style="color:var(--blue-900)">0,00 € Cura</b>`:`<b>${fmt(m.regenNet)}</b> <span class="tiny muted">${vatSuffix()}</span>`;
    const priceNew=cov?`<del class="muted">${fmt(m.newNet)}</del> <b style="color:var(--blue-900)">0,00 € Cura</b>`:`<b>${fmt(m.newNet)}</b> <span class="tiny muted">${vatSuffix()}</span>`;
    modal(`<p class="eyebrow">Passaporto digitale</p><h2><i class="swatch" style="background:${m.color}"></i> ${esc(m.name)} ${pill(st)}</h2>
      <p class="muted">${esc(m.fn)}</p><p class="tiny muted"><b>Specifica:</b> ${esc(m.cadSpec)}</p>
      ${isFault(id)&&st!=='unk'?`<div class="alert bad"><div class="grow"><b>${m.fault.code} · ${esc(m.fault.msg)}</b><br><span class="small">${esc(m.fault.cause)}</span></div></div>`:''}
      <div class="kv">
        <div><b>${esc(m.metric.label)}</b>${esc(reading)}</div>
        <div><b>♻ Rigenerato</b>${priceRegen}</div>
        <div><b>Nuovo</b>${priceNew}</div>
        <div><b>Durata</b>${esc(m.life)}</div>
        <div><b>Sostituzione</b>${esc(m.diff)} · ${esc(m.time)}</div>
        <div><b>Attrezzi</b>${esc(m.tools)}</div>
      </div>
      <div class="alert ok"><b>♻</b><div class="grow small"><b>Rigenerazione certificata (${esc(m.code)}-R):</b> ${esc(m.regenNote)} Collaudato al 100%, garanzia 24 mesi.</div></div>
      <div class="passport">${qr(m.code+S.serial)}<div><b>Passaporto Digitale di Prodotto · ESPR</b><div class="tiny">${esc(m.code)}-${esc(S.serial.slice(-5))}<br>Materiali monomateriale ABS/PP e acciaio, senza ritardanti vietati · guida di sostituzione e tracciabilità fine vita.${S.history[id].length?'<br>Storico: '+S.history[id].map(esc).join(' · '):''}</div></div></div>
      <div class="row mt" style="justify-content:flex-end"><button type="button" class="btn btn-outline" data-guide="${id}">Guida di sostituzione</button>
      <button type="button" class="btn btn-primary" data-buy="${id}" data-cond="regen">${cov?'Richiedi gratis (Cura)':'Aggiungi rigenerato'}</button></div>`);
  }

  function openGuide(id,orderId){
    const m=BY[id], cov=isCovered(m);
    const ord=orderId?S.orders.find(o=>o.id===orderId):S.orders.find(o=>o.items.some(it=>it.type==='part'&&it.id===id)&&o.stage>=3&&!o.installed);
    let done=0,temp=176,unplugged=false,timer=null;
    const safety=m.hot?`<div class="safety">🔥 <b>Interblocco termico.</b> Il fusore lavora a 180–200 °C: il perno si sblocca solo sotto i 40 °C.<div class="mt"><b id="tempVal">${temp} °C</b> <span id="lockState">· 🔒 bloccato</span></div></div>`
      :m.mains?`<div class="safety">⚡ <b>Alta tensione.</b> Non aprire mai il box blindato.<div class="mt"><label><input type="checkbox" id="unplug"> Ho scollegato il cavo dalla presa IEC C14</label></div></div>`:'';
    const draw=()=>{
      const lock=m.hot?(temp>40?0:99):m.mains?(unplugged?99:-1):99;
      $('#steps').innerHTML=m.steps.map((s,i)=>{
        const blocked=i>done||i>lock;
        return `<li class="${i<done?'done':''} ${blocked&&i>=done?'locked':''}">${esc(s)}${i===done&&!blocked?`<div class="mt"><button type="button" class="btn btn-sm btn-primary" data-stepok>Fatto</button></div>`:''}${i===done&&i>lock?'<div class="tiny" style="color:var(--amber-800)">Bloccato dall’interblocco di sicurezza</div>':''}</li>`;
      }).join('');
      const b=$('[data-stepok]'); if(b) b.onclick=()=>{ done++; if(m.hot&&done===1&&!timer) cool(); draw(); };
      $('#finalBox').classList.toggle('hidden',done<m.steps.length);
    };
    const cool=()=>{ timer=setInterval(()=>{
      temp=Math.max(26,temp-Math.round(8+Math.random()*10));
      const tv=$('#tempVal'); if(!tv){ clearInterval(timer); return; }
      tv.textContent=temp+' °C';
      $('#lockState').innerHTML=temp>40?'· 🔒 bloccato':'· 🔓 <b>sbloccato</b>';
      if(temp<=40) clearInterval(timer);
      draw();
    },500); };
    modal(`<p class="eyebrow">Guida passo-passo</p><h2>Sostituire ${esc(m.name.toLowerCase())}</h2>
      <div class="kv"><div><b>Difficoltà</b>${esc(m.diff)}</div><div><b>Tempo</b>${esc(m.time)}</div><div><b>Attrezzi</b>${esc(m.tools)}</div></div>
      ${safety}<ol class="steps" id="steps"></ol>
      <div id="finalBox" class="hidden"><h3>Test finale</h3><p class="small muted">${esc(m.test)}</p>
        ${ord?`<button type="button" class="btn btn-primary" id="finalTest">Esegui test finale</button>`:`<p class="small">Anteprima: ordina il ricambio per eseguire il test quando arriva.</p><button type="button" class="btn btn-primary" data-buy="${id}" data-cond="regen">${cov?'Richiedi gratis':'Aggiungi rigenerato'}</button>`}
        <div id="finalOut" class="mt"></div></div>
      <h3 class="mt">Rispedizione del pezzo vecchio</h3><p class="small">Inserisci il modulo usato nella scatola prepagata${['toner','drum'].includes(id)?' dentro il sacchetto sigillato':''}, applica l’etichetta e consegna al corriere.</p>`);
    if(m.mains){ const u=$('#unplug'); if(u) u.onchange=e=>{ unplugged=e.target.checked; draw(); }; }
    draw();
    $('#overlay')._cleanup=()=>{ if(timer) clearInterval(timer); };
    const ft=$('#finalTest');
    if(ft) ft.onclick=()=>{
      ft.disabled=true; ft.textContent='Test in corso…';
      setTimeout(()=>{
        if(isFault(id)) S.faulty=null;
        S.status[id]='ok'; S.history[id].push('sostituito '+new Date().toLocaleDateString('it-IT'));
        if(ord){ ord.installed=true; if(ord.stage<4) ord.stage=4; }
        const out=$('#finalOut');
        if(out) out.innerHTML=`<div class="alert ok"><b>✓</b><div class="grow"><b>Test superato.</b> ${esc(m.metric.label)}: ${esc(m.metric.ok)}. Rispedisci il pezzo vecchio.</div></div>`;
        ft.remove(); renderAll();
      },1300);
    };
  }

  /* ---------- Azioni globali deleghe ---------- */
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-go],[data-buy],[data-guide],[data-close],[data-login],[data-add-plan],[data-add-fix],[data-conn],[data-open-cart],[data-pay-plan]');
    if(!t) return;
    if(t.dataset.close!==undefined){ closeModal(); return; }
    if(t.dataset.payPlan){ addPlan(t.dataset.payPlan,false); go('pagamenti'); openPayment(); return; }
    if(t.dataset.go){ closeModal(); go(t.dataset.go); return; }
    if(t.dataset.login){ closeModal(); openAuthForAction(t.dataset.login==='true'?'':t.dataset.login); return; }
    if(t.dataset.conn){ connectVia(t.dataset.conn); return; }
    if(t.dataset.addPlan){ addPlan(t.dataset.addPlan,true); return; }
    if(t.dataset.addFix){ addPart(t.dataset.addFix,'regen',true); openCart(); return; }
    if(t.dataset.openCart!==undefined){ openCart(); return; }
    if(t.dataset.buy){
      addPart(t.dataset.buy,t.dataset.cond||'regen',true); closeModal(); go('shop');
      toast(BY[t.dataset.buy].name+' aggiunto al carrello'); setTimeout(openCart,120); return;
    }
    if(t.dataset.guide){ openGuide(t.dataset.guide,t.dataset.order); return; }
  });

  /* ---------- Pannello demo ---------- */
  $('#demoSel').innerHTML='<option value="">Nessun guasto</option>'+MODULES.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('');
  $('#demoSel').value=S.faulty;
  $('#demoApply').addEventListener('click',()=>{
    S.faulty=$('#demoSel').value||null; S.diagDone=false; S.symSel.clear();
    MODULES.forEach(m=>S.status[m.id]='unk');
    $('#console').textContent='In attesa…'; $('#diagBar').style.width='0'; $('#diagPct').textContent='';
    $('#diagProgress').setAttribute('aria-valuenow','0'); $('#runDiag').textContent='Avvia diagnostica';
    go('stato'); toast('Nuovo scenario applicato');
  });

  /* ---------- Avvio ---------- */
  renderAll();
  showGate();
})();
