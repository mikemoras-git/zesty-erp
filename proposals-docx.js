function buildLaundryAnnexRows(p, isEl, para, teal, grey, allBorders, ShadingType, WidthType, AlignmentType, Paragraph, TextRun, Table, TableRow, TableCell) {
  var plId = p.laundryPricelistId;
  if (!plId) return [para(isEl ? 'Δεν έχει επιλεγεί τιμοκατάλογος.' : 'No pricelist selected for this proposal.', { italics: true, color: grey })];
  var pls = getLaundryPricelists();
  var pl = pls.find(function(x){ return x.id === plId; });
  if (!pl || !pl.prices) return [para('Pricelist not found.', { italics: true, color: grey })];
  var priceItems = LAUNDRY_ITEMS.filter(function(i){ return pl.prices[i.code] !== undefined; });
  if (!priceItems.length) return [];
  var plLabel = pl.nameEn ? (pl.id + ' — ' + pl.nameEn + ' (' + pl.name + ')') : (pl.id + ' — ' + pl.name);
  var headerRow = new TableRow({ tableHeader: true, children: [
    new TableCell({ width:{size:7200,type:WidthType.DXA}, shading:{fill:teal,type:ShadingType.CLEAR}, borders:allBorders(teal), margins:{top:70,bottom:70,left:120,right:120}, children:[new Paragraph({children:[new TextRun({text:isEl?'Είδος':'Item',font:'Arial',size:20,bold:true,color:'FFFFFF'})]})] }),
    new TableCell({ width:{size:2160,type:WidthType.DXA}, shading:{fill:teal,type:ShadingType.CLEAR}, borders:allBorders(teal), margins:{top:70,bottom:70,left:120,right:120}, children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[new TextRun({text:isEl?'Τιμή (€)':'Price (€)',font:'Arial',size:20,bold:true,color:'FFFFFF'})]})] })
  ]});
  var dataRows = priceItems.map(function(item, ri) {
    var shade = ri % 2 === 1 ? {fill:'EAF4F2',type:ShadingType.CLEAR} : undefined;
    return new TableRow({ children: [
      new TableCell({ width:{size:7200,type:WidthType.DXA}, shading:shade, borders:allBorders('D0E8E4'), margins:{top:55,bottom:55,left:120,right:120}, children:[new Paragraph({children:[new TextRun({text:item.en,font:'Arial',size:20})]})] }),
      new TableCell({ width:{size:2160,type:WidthType.DXA}, shading:shade, borders:allBorders('D0E8E4'), margins:{top:55,bottom:55,left:120,right:120}, children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[new TextRun({text:'€'+parseFloat(pl.prices[item.code]).toFixed(2),font:'Arial',size:20})]})] })
    ]});
  });
  return [
    new Paragraph({ children: [new TextRun({ text: plLabel, font: 'Arial', size: 22, bold: true, color: teal })], spacing: { before: 160, after: 160 } }),
    new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [7200, 2160], rows: [headerRow].concat(dataRows) })
  ];
}

function buildDocxDocument(p) {
  var Document = docx.Document, Packer = docx.Packer, Paragraph = docx.Paragraph, TextRun = docx.TextRun;
  var Table = docx.Table, TableRow = docx.TableRow, TableCell = docx.TableCell;
  var AlignmentType = docx.AlignmentType, HeadingLevel = docx.HeadingLevel, BorderStyle = docx.BorderStyle;
  var WidthType = docx.WidthType, ShadingType = docx.ShadingType, PageNumber = docx.PageNumber;
  var Header = docx.Header, Footer = docx.Footer, PageBreak = docx.PageBreak, LevelFormat = docx.LevelFormat;

  var isEl = (p.language || 'en') === 'el';
  var tbn = p.tbn || {};
  var today = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });

  var TEAL = '1A7A7A';
  var GOLD = 'C9A84C';
  var GREY = '888888';
  var LTEAL = 'EAF4F2';
  var DARK = '1A2E2B';

  // Raw field value (no TBN check)
  var raw = function(key) {
    var v = p[key];
    return (v !== undefined && v !== '') ? String(v) : '';
  };

  // Field value with TBN → returns 'TBN' or value+suffix or '—'
  var fv = function(key, suffix) {
    if (tbn[key]) return 'TBN';
    var v = raw(key);
    return v ? (v + (suffix ? suffix : '')) : '—';
  };

  // Single TextRun for a TBN-able value
  var tvr = function(key, display) {
    var isTbn = !!tbn[key];
    return new TextRun({ text: isTbn ? 'TBN' : (display !== undefined ? display : fv(key)), font: 'Arial', size: 22, color: isTbn ? GOLD : DARK, italics: isTbn, bold: isTbn });
  };

  // Array of TextRuns for AT A GLANCE cell: [dynamicPart, fixedSuffix]
  var glRuns = function(key, suffix, fixedSuffix) {
    var isTbn = !!tbn[key];
    var runs = [];
    if (isTbn) {
      runs.push(new TextRun({ text: 'TBN', font: 'Arial', size: 22, color: GOLD, italics: true, bold: true }));
      if (fixedSuffix) runs.push(new TextRun({ text: fixedSuffix, font: 'Arial', size: 22, color: DARK }));
    } else {
      var v = raw(key);
      runs.push(new TextRun({ text: (v ? v + suffix : '—') + (fixedSuffix || ''), font: 'Arial', size: 22, color: DARK }));
    }
    return runs;
  };

  // Plain TextRun
  var pr = function(text, opts) {
    return new TextRun(Object.assign({ text: text, font: 'Arial', size: 22, color: DARK }, opts || {}));
  };

  var border = function(color) { return { style: BorderStyle.SINGLE, size: 1, color: color || 'D0E8E4' }; };
  var noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  var allBorders = function(c) { return { top: border(c), bottom: border(c), left: border(c), right: border(c) }; };

  var para = function(text, opts) {
    var ro = Object.assign({ text: text, font: 'Arial', size: 22, color: '2A2A2A' }, opts || {});
    return new Paragraph({ children: [new TextRun(ro)], spacing: { after: 140 } });
  };

  var bullet = function(text) {
    return new Paragraph({ numbering: { reference: 'main-bullets', level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: text, font: 'Arial', size: 22, color: DARK })] });
  };

  var h1 = function(text) {
    return new Paragraph({
      children: [new TextRun({ text: text, font: 'Arial', size: 28, bold: true, color: TEAL })],
      spacing: { before: 400, after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: TEAL, space: 2 } }
    });
  };

  var h2 = function(text) {
    return new Paragraph({
      children: [new TextRun({ text: text, font: 'Arial', size: 24, bold: true, color: TEAL })],
      spacing: { before: 280, after: 120 }
    });
  };

  var h3 = function(text) {
    return new Paragraph({
      children: [new TextRun({ text: text, font: 'Arial', size: 22, bold: true, color: TEAL })],
      spacing: { before: 160, after: 80 }
    });
  };

  var sp = function() { return new Paragraph({ children: [], spacing: { after: 120 } }); };
  var pgBrk = function() { return new Paragraph({ children: [new PageBreak()] }); };

  // Table helpers
  var hdrRow2 = function(c1, c2, w1, w2) {
    return new TableRow({ tableHeader: true, children: [
      new TableCell({ width:{size:w1,type:WidthType.DXA}, shading:{fill:TEAL,type:ShadingType.CLEAR}, borders:allBorders(TEAL), margins:{top:80,bottom:80,left:120,right:120}, children:[new Paragraph({children:[new TextRun({text:c1,font:'Arial',size:20,bold:true,color:'FFFFFF'})]})] }),
      new TableCell({ width:{size:w2,type:WidthType.DXA}, shading:{fill:TEAL,type:ShadingType.CLEAR}, borders:allBorders(TEAL), margins:{top:80,bottom:80,left:120,right:120}, children:[new Paragraph({children:[new TextRun({text:c2,font:'Arial',size:20,bold:true,color:'FFFFFF'})]})] })
    ]});
  };

  var dataRow2 = function(label, valRuns, ri, w1, w2) {
    var shade = (ri % 2 === 1) ? { fill: LTEAL, type: ShadingType.CLEAR } : undefined;
    return new TableRow({ children: [
      new TableCell({ width:{size:w1,type:WidthType.DXA}, shading:{fill:'F0F7F6',type:ShadingType.CLEAR}, borders:allBorders('D0E8E4'), margins:{top:75,bottom:75,left:120,right:80}, children:[new Paragraph({children:[new TextRun({text:label,font:'Arial',size:20,bold:true,color:TEAL})]})] }),
      new TableCell({ width:{size:w2,type:WidthType.DXA}, shading:shade, borders:allBorders('D0E8E4'), margins:{top:75,bottom:75,left:120,right:80}, children:[new Paragraph({children:valRuns})] })
    ]});
  };

  var noteRow = function(text, w) {
    return new TableRow({ children: [
      new TableCell({ columnSpan:2, width:{size:w||9360,type:WidthType.DXA}, shading:{fill:'FFF8E8',type:ShadingType.CLEAR}, borders:allBorders('D0E8E4'), margins:{top:70,bottom:70,left:120,right:120},
        children:[new Paragraph({children:[new TextRun({text:text,font:'Arial',size:20,italics:true,color:GREY})]})] })
    ]});
  };

  var sections = [];

  // ── COVER ──
  var covInfoRows = [
    new TableRow({ children: [
      new TableCell({ width:{size:2880,type:WidthType.DXA}, shading:{fill:'F0F7F6',type:ShadingType.CLEAR}, borders:allBorders('D0E8E4'), margins:{top:80,bottom:80,left:160,right:80}, children:[new Paragraph({children:[pr(isEl?'Από:':'From:', {bold:true,color:TEAL})]})] }),
      new TableCell({ width:{size:6480,type:WidthType.DXA}, borders:allBorders('D0E8E4'), margins:{top:80,bottom:80,left:160,right:80}, children:[new Paragraph({children:[pr('Zesty Rentals and Investments IKE (“Manager”)', {bold:true})]})] })
    ]}),
    new TableRow({ children: [
      new TableCell({ width:{size:2880,type:WidthType.DXA}, shading:{fill:'F0F7F6',type:ShadingType.CLEAR}, borders:allBorders('D0E8E4'), margins:{top:80,bottom:80,left:160,right:80}, children:[new Paragraph({children:[pr(isEl?'Προς:':'To:', {bold:true,color:TEAL})]})] }),
      new TableCell({ width:{size:6480,type:WidthType.DXA}, borders:allBorders('D0E8E4'), margins:{top:80,bottom:80,left:160,right:80}, children:[new Paragraph({children:[tvr('ownerName', fv('ownerName') + (tbn.ownerName ? '' : ' (“Owner”)'))})] })
    ]}),
    new TableRow({ children: [
      new TableCell({ width:{size:2880,type:WidthType.DXA}, shading:{fill:'F0F7F6',type:ShadingType.CLEAR}, borders:allBorders('D0E8E4'), margins:{top:80,bottom:80,left:160,right:80}, children:[new Paragraph({children:[pr(isEl?'Ακίνητο:':'Property:', {bold:true,color:TEAL})]})] }),
      new TableCell({ width:{size:6480,type:WidthType.DXA}, borders:allBorders('D0E8E4'), margins:{top:80,bottom:80,left:160,right:80}, children:[new Paragraph({children:[tvr('propertyName', fv('propertyName'))]})] })
    ]}),
    new TableRow({ children: [
      new TableCell({ width:{size:2880,type:WidthType.DXA}, shading:{fill:'F0F7F6',type:ShadingType.CLEAR}, borders:allBorders('D0E8E4'), margins:{top:80,bottom:80,left:160,right:80}, children:[new Paragraph({children:[pr(isEl?'Ημ/νία Έναρξης:':'Start Date:', {bold:true,color:TEAL})]})] }),
      new TableCell({ width:{size:6480,type:WidthType.DXA}, borders:allBorders('D0E8E4'), margins:{top:80,bottom:80,left:160,right:80}, children:[new Paragraph({children:[pr(isEl?'Ημερομηνία υπογραφής σύμβασης':'Date of contract signature')]})] })
    ]}),
    new TableRow({ children: [
      new TableCell({ width:{size:2880,type:WidthType.DXA}, shading:{fill:'F0F7F6',type:ShadingType.CLEAR}, borders:allBorders('D0E8E4'), margins:{top:80,bottom:80,left:160,right:80}, children:[new Paragraph({children:[pr(isEl?'Διάρκεια:':'Term:', {bold:true,color:TEAL})]})] }),
      new TableCell({ width:{size:6480,type:WidthType.DXA}, borders:allBorders('D0E8E4'), margins:{top:80,bottom:80,left:160,right:80}, children:[new Paragraph({children:[pr(isEl?'Ισχύει έως 31 Δεκεμβρίου του έτους υπογραφής · ανανεώνεται αυτόματα εκτός αν κάποιο μέρος δώσει γραπτή ειδοποίηση 30 ημερών.':"Valid until 31 December of the signing year; auto-renews annually unless either party gives 30 days' written notice.", {size:20})]})] })
    ]})
  ];

  // AT A GLANCE rows — dynamic values
  var mgmtRuns = glRuns('managementFee', '%', isEl?' των καθαρών εσόδων διαμονής μετά την προμήθεια OTA (εκτός ΦΠΑ)':' of net accommodation revenue after OTA commission (excl. VAT)');
  var directRuns = glRuns('directBookingFee', '%', isEl?' ανά κράτηση (επιπλέον αμοιβής διαχείρισης)':' per booking (on top of management fee)');
  var checkinRuns = glRuns('checkinFee', '€', isEl?' ανά συμβάν (δεν χρεώνεται αν υπάρχει key-safe)':' per event (waived if lock-box installed)');

  var cleaningRuns = [];
  if (tbn.cleaningRate) cleaningRuns.push(new TextRun({text:'TBN',font:'Arial',size:22,color:GOLD,italics:true,bold:true}));
  else { var cr = raw('cleaningRate'); cleaningRuns.push(pr((cr||'—') + '€/hr')); }
  cleaningRuns.push(pr(isEl?' ανά καθαριστή + ':' per cleaner + '));
  if (tbn.transport) cleaningRuns.push(new TextRun({text:'TBN',font:'Arial',size:22,color:GOLD,italics:true,bold:true}));
  else { var tr = raw('transport'); cleaningRuns.push(pr((tr||'—') + '€ ' + (isEl?'μεταφορά':'transport'))); }

  var maintRuns = [];
  if (tbn.maintenanceVisit) maintRuns.push(new TextRun({text:'TBN',font:'Arial',size:22,color:GOLD,italics:true,bold:true}));
  else { var mv = raw('maintenanceVisit'); maintRuns.push(pr((mv||'—') + '€' + (isEl?' (έως 1,5 ώρες) + ':' (up to 1.5 hrs) + '))); }
  if (tbn.maintenanceExtraHr) maintRuns.push(new TextRun({text:'TBN',font:'Arial',size:22,color:GOLD,italics:true,bold:true}));
  else { var mh = raw('maintenanceExtraHr'); maintRuns.push(pr((mh||'—') + '€/' + (isEl?'επιπλέον ώρα':'extra hr'))); }

  var glanceRows = [
    new TableRow({ tableHeader:true, children:[
      new TableCell({ width:{size:3600,type:WidthType.DXA}, shading:{fill:TEAL,type:ShadingType.CLEAR}, borders:allBorders(TEAL), margins:{top:90,bottom:90,left:160,right:80}, children:[new Paragraph({children:[pr(isEl?'Υπηρεσία / Χρέωση':'Service / Charge',{bold:true,color:'FFFFFF',size:20})]})] }),
      new TableCell({ width:{size:5760,type:WidthType.DXA}, shading:{fill:TEAL,type:ShadingType.CLEAR}, borders:allBorders(TEAL), margins:{top:90,bottom:90,left:160,right:80}, children:[new Paragraph({children:[pr(isEl?'Τιμή':'Value',{bold:true,color:'FFFFFF',size:20})]})] })
    ]}),
    dataRow2(isEl?'Αμοιβή Διαχείρισης':'Management Fee', mgmtRuns, 0, 3600, 5760),
    dataRow2(isEl?'Άμεσες Κρατήσεις (Zesty.gr)':'Direct Bookings via Zesty.gr', directRuns, 1, 3600, 5760),
    dataRow2(isEl?'Διαμονή Ιδιοκτήτη':'Owner Stays / Date Blocks', [pr('0% — ' + (isEl?'χωρίς αμοιβή (υπηρεσίες χρεώνονται μόνο αν ζητηθούν)':'no fee (services charged if requested)'))], 0, 3600, 5760),
    dataRow2('Check-In / Check-Out', checkinRuns, 1, 3600, 5760),
    dataRow2(isEl?'Καθαρισμός':'Cleaning', cleaningRuns, 0, 3600, 5760),
    dataRow2(isEl?'Επίσκεψη Συντήρησης':'Maintenance Visit', maintRuns, 1, 3600, 5760),
    dataRow2(isEl?'Αναλώσιμα Επισκεπτών':'Guest Consumables', [pr(isEl?'Προμήθεια και ανεφοδιασμός στο κόστος — χωρίς αμοιβή διακανονισμού':'Arranged and restocked at cost — no handling fee')], 0, 3600, 5760),
    dataRow2(isEl?'Διαχείριση Αξιώσεων':'Claims Management', [pr(isEl?'Συμπεριλαμβάνεται στην αμοιβή διαχείρισης':'Included in management fee')], 1, 3600, 5760),
    dataRow2(isEl?'Πλατφόρμες':'Platforms', [pr('Airbnb, Booking.com, Vrbo, Zesty.com')], 0, 3600, 5760),
    dataRow2(isEl?'Καταγγελία':'Termination Notice', [pr(isEl?'Γραπτή ειδοποίηση 30 ημερών':'30 days\' written notice by either party')], 1, 3600, 5760),
    dataRow2(isEl?'ΦΠΑ':'VAT', [pr(isEl?'Όλες οι αμοιβές εκτός 24% ΦΠΑ':'All fees exclude 24% VAT unless otherwise stated')], 0, 3600, 5760)
  ];

  sections.push(
    new Paragraph({ alignment:AlignmentType.CENTER, spacing:{before:1000,after:120}, children:[pr(isEl?'ΠΛΗΡΗΣ ΔΙΑΧΕΙΡΙΣΗ ΑΚΙΝΗΤΟΥ':'FULL PROPERTY MANAGEMENT',{size:52,bold:true,color:TEAL})] }),
    new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:120}, children:[pr(isEl?'ΠΡΟΤΑΣΗ':'PROPOSAL',{size:40,color:GOLD})] }),
    new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:640}, children:[pr(isEl?'Υπηρεσίες Τουριστικής Μίσθωσης':'Vacation Rental Business Services',{size:24,color:GREY})] }),
    new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[2880,6480], rows:covInfoRows }),
    sp(),
    new Paragraph({ spacing:{before:480,after:160}, border:{bottom:{style:BorderStyle.SINGLE,size:3,color:TEAL,space:2}}, children:[pr(isEl?'ΜΕ ΜΙΑ ΜΑΤΙΑ':'AT A GLANCE',{size:24,bold:true,color:TEAL})] }),
    new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[3600,5760], rows:glanceRows }),
    new Paragraph({ alignment:AlignmentType.RIGHT, spacing:{before:80,after:0}, children:[pr('Zesty Rentals and Investments IKE · zesty.gr',{size:18,italics:true,color:GREY})] }),
    pgBrk()
  );

  // ── SECTION 1: What We Do For You ──
  sections.push(
    h1(isEl?'1. Τι Κάνουμε για Εσάς':'1. What We Do For You'),
    para(isEl
      ? 'Ως πλήρης διαχειριστής του ακινήτου σας, η Zesty αναλαμβάνει κάθε πτυχή της λειτουργίας της ενοικίασης ώστε να απολαμβάνετε τα έσοδα χωρίς τον φόρτο εργασίας. Οι υποχρεώσεις μας περιλαμβάνουν:'
      : 'As your full-service property manager, Zesty handles every aspect of your rental operation so you can enjoy the returns without the workload. Our obligations include:')
  );
  var sect1Bullets = isEl ? [
    '24/7 γραμμή υποστήριξης επισκεπτών.',
    'Διαχείριση αγγελιών σε όλες τις πλατφόρμες (Airbnb, Booking.com, Vrbo, Zesty.com).',
    'Επικοινωνία με επισκέπτες πριν και κατά τη διάρκεια της παραμονής.',
    'Συντονισμός με καθαρίστριες, τεχνίτες πισίνας, τεχνικούς και κηπουρό.',
    'Αναφορά στον Ιδιοκτήτη και τον λογιστή του.',
    'Συντονισμός με τον δικηγόρο του Ιδιοκτήτη αν απαιτείται.',
    'Μηνιαίες αναφορές απόδοσης και οικονομικές εκθέσεις.',
    'Ετήσια αναφορά απόδοσης.',
    'Πρόσβαση στο Lodgify Owner Portal — ζωντανές ενημερώσεις για κρατήσεις, οικονομικά και επικοινωνίες.',
    'Παρακολούθηση κανονισμών και συμβουλευτικές ενημερώσεις.',
    'Συλλογή αξιολογήσεων και διαχείριση φήμης.',
    'Guest app / ψηφιακός οδηγός για κάθε ακίνητο.'
  ] : [
    '24/7 guest support line.',
    'Listing management across all platforms (Airbnb, Booking.com, Vrbo, Zesty.com).',
    'Guest communication before booking and throughout the stay.',
    'Scheduling and coordination with cleaners, pool technician, technicians and gardener.',
    'Reporting to Owner and Owner\'s accountant.',
    'Coordination with Owner\'s lawyer if required.',
    'Monthly performance and financial reports.',
    'Annual performance report.',
    'Access to the Lodgify Owner Portal — live updates on reservations, financials, and guest communications.',
    'Regulations monitoring and advisory updates.',
    'Review collection and reputation management.',
    'Guest app / digital guidebook for each property.'
  ];
  sect1Bullets.forEach(function(b){ sections.push(bullet(b)); });
  sections.push(sp());

  // ── SECTION 2: Services & Fees ──
  sections.push(h1(isEl?'2. Υπηρεσίες & Αμοιβές':'2. Services & Fees'));

  sections.push(
    h2(isEl?'2.1 Διαχείριση Κρατήσεων & Σχέσεις με Επισκέπτες':'2.1 Reservations Management & Guest Relations'),
    para(isEl
      ? 'Αυτή είναι η βασική μας υπηρεσία διαχείρισης, που καλύπτει όλες τις καθημερινές λειτουργίες:'
      : 'This is our core management service, covering all day-to-day operations:')
  );
  var sect21Bullets = isEl ? [
    'Δημιουργία και διαρκής διαχείριση αγγελιών.',
    'Επικοινωνία πριν και κατά τη διάρκεια της παραμονής.',
    'Συντονισμός υπηρεσιών καθαρισμού, πισίνας και κήπου.',
    'Αναφορά στον ιδιοκτήτη και τον λογιστή.',
    'Παρακολούθηση κανονισμών και ενημερώσεις.',
    'Συλλογή αξιολογήσεων και διαχείριση φήμης.',
    'Guest app / ψηφιακός οδηγός.',
    'Owner portal με ζωντανή παρακολούθηση κρατήσεων, μηνυμάτων και οικονομικών.'
  ] : [
    'Listing creation and ongoing management.',
    'Pre-booking and in-stay guest communication.',
    'Coordination of cleaning, pool, and garden services.',
    'Reporting to Owner and accountant.',
    'Regulations monitoring and updates.',
    'Review collection and reputation management.',
    'Guest app / digital guidebook.',
    'Owner portal with live monitoring of bookings, messages, and financials.'
  ];
  sect21Bullets.forEach(function(b){ sections.push(bullet(b)); });
  sections.push(
    sp(),
    new Paragraph({ spacing:{after:120}, children:[
      pr(isEl?'Αμοιβή: ':'Fee: ', {bold:true}),
      tvr('managementFee', fv('managementFee', '%')),
      pr(isEl?' των καθαρών εσόδων διαμονής μετά την προμήθεια OTA (εκτός ΦΠΑ)':' of net accommodation revenue after OTA commission (excl. VAT)')
    ]})
  );

  sections.push(
    sp(),
    h2(isEl?'2.2 Άμεσες Κρατήσεις μέσω Zesty.gr':'2.2 Direct Bookings via Zesty.gr'),
    para(isEl
      ? 'Οι κρατήσεις μέσω Zesty.gr ή του δικτύου συνεργατών μας αντιμετωπίζονται ως κανονικό κανάλι. Η Zesty.gr λειτουργεί ως OTA παράλληλα με τον ρόλο της ως διαχειριστής ακινήτων.'
      : 'Bookings made through Zesty.gr or our partner network are treated the same as any other channel. Zesty.gr operates as an OTA in addition to its role as property manager.'),
    new Paragraph({ spacing:{after:120}, children:[
      pr(isEl?'Αμοιβή: ':'Fee: ', {bold:true}),
      tvr('directBookingFee', fv('directBookingFee', '%')),
      pr(isEl?' ανά κράτηση (επιπλέον αμοιβής Διαχείρισης Κρατήσεων)':' per booking (on top of the Reservations Management fee).')
    ]})
  );

  sections.push(
    sp(),
    h2(isEl?'2.3 Διαμονές Ιδιοκτήτη & Μπλοκάρισμα Ημερομηνιών':'2.3 Owner Stays & Date Blocks'),
    para(isEl
      ? 'Οι προσωπικές κρατήσεις του Ιδιοκτήτη δεν υπόκεινται σε αμοιβή διαχείρισης. Αν ζητηθούν υπηρεσίες για προσωπικές παραμονές (π.χ. check-in υποδοχή, καθαρισμός), χρεώνονται βάσει Παραρτήματος Α.'
      : 'Personal reservations by the Owner carry no management fee. If services are requested for personal stays (e.g., check-in welcome, cleaning), these are charged at the rates in Annex A.'),
    new Paragraph({ spacing:{after:120}, children:[pr(isEl?'Αμοιβή: 0% — υπηρεσίες χρεώνονται μόνο αν ζητηθούν.':'Fee: 0% — services charged only if requested.')] })
  );

  sections.push(
    sp(),
    h2(isEl?'2.4 Διαχείριση Αξιώσεων':'2.4 Claims Management'),
    para(isEl
      ? 'Συμπεριλαμβάνεται στην αμοιβή Διαχείρισης Κρατήσεων χωρίς επιπλέον χρέωση. Αναλαμβάνουμε αξιώσεις ζημιών από επισκέπτες, επικοινωνούμε με πλατφόρμες κρατήσεων και οργανώνουμε επισκευές.'
      : 'Included in the Reservations Management fee at no extra charge. We handle guest damage claims, communicate with booking platforms, and organise repairs.'),
    para(isEl
      ? 'Σημείωση: Η κάλυψη ζημιών ισχύει μόνο εφόσον η πλατφόρμα παρέχει προστασία ζημιών. Για πλήρη κάλυψη σε όλες τις περιπτώσεις, συνιστάται ιδιωτική ασφάλιση.'
      : 'Note: Damage cover applies only where the booking platform provides guest damage protection. For full cover in all circumstances, a private insurance policy is recommended.', { italics: true, color: GREY }),
    sp()
  );

  // ── SECTION 3: What We Need From You ──
  sections.push(
    h1(isEl?'3. Τι Χρειαζόμαστε από Εσάς':'3. What We Need From You'),
    para(isEl
      ? 'Για να λειτουργούμε αποτελεσματικά εκ μέρους σας, σας ζητούμε να:'
      : 'To operate effectively on your behalf, we ask you to:')
  );
  var sect3Bullets = isEl ? [
    'Διατηρείτε το ακίνητο πλήρως αδειοδοτημένο και συμμορφούμενο για βραχυχρόνια μίσθωση (EOT/AMA, πυρασφάλεια, απεντόμωση κ.λπ.).',
    'Πληρώνετε ρεύμα, ίντερνετ, δημοτικά τέλη, ασφάλεια και τυχόν τρέχοντα λειτουργικά κόστη που δεν αναλαμβάνει ρητά ο Διαχειριστής.',
    'Εγκρίνετε προϋπολογισμούς για μεγάλες επισκευές ή έκτακτες ανάγκες έγκαιρα. Ο Διαχειριστής μπορεί να εξουσιοδοτεί επείγουσες επισκευές έως €100 ανά συμβάν· ό,τι υπερβαίνει αυτό το όριο απαιτεί έγκρισή σας εκτός αν δεν είστε διαθέσιμος.',
    'Διατηρείτε το ακίνητο σε καλή κατάσταση, έτοιμο για επισκέπτες.',
    'Παρέχετε επαγγελματικές φωτογραφίες υψηλής ποιότητας, τρία (3) σετ κλειδιών, κανόνες σπιτιού και τις προτιμώμενες τιμές σας.'
  ] : [
    'Keep the property fully licensed and compliant for short-term rental use (EOT/AMA registration, fire safety, pest control, and any applicable regulatory requirements).',
    'Pay utilities, internet, municipality taxes, insurance, and any recurring operating costs not explicitly assigned to the Manager.',
    'Approve budgets for major repairs or emergencies promptly. The Manager may authorise urgent repairs up to €100 per incident to protect guests or the property; anything above this limit requires your approval unless you are unreachable.',
    'Keep the property in a well-maintained, guest-ready condition.',
    'Provide high-quality professional photographs, three (3) sets of keys, house rules, and your preferred nightly rate / pricing guidance.'
  ];
  sect3Bullets.forEach(function(b){ sections.push(bullet(b)); });
  sections.push(sp());

  // ── SECTION 4: Listings & Payments ──
  sections.push(
    h1(isEl?'4. Αγγελίες & Πληρωμές':'4. Listings & Payments'),
    para(isEl
      ? 'Όλες οι αγγελίες δημιουργούνται στο νομικό σας όνομα και με τα στοιχεία πληρωμής σας στο Airbnb, Booking.com, Vrbo και Zesty.com. Οι αξιολογήσεις παραμένουν συνδεδεμένες με το ακίνητο.'
      : 'All listings are created under your legal name and payout details on Airbnb, Booking.com, Vrbo, and Zesty.com. Reviews remain attached to the property.'),
    para(isEl
      ? 'Οι πληρωμές επισκεπτών πηγαίνουν απευθείας στον τραπεζικό σας λογαριασμό όπου το επιτρέπει η πλατφόρμα. Εξαιρέσεις: Vrbo και Zesty.com απαιτούν πληρωμές με κάρτα μέσω Stripe.'
      : 'Guest payments go directly to your bank account wherever the platform allows. Exceptions: Vrbo and Zesty.com require card payments, processed via Stripe.'),
    para(isEl
      ? 'Τα ποσά που λαμβάνονται στον λογαριασμό του Διαχειριστή αποδίδονται σε εσάς εντός 30 ημερών από την παραλαβή τους.'
      : 'Funds received in the Manager\'s account are remitted to you within 30 days of receipt.'),
    sp()
  );

  // ── SECTION 5: Damage Claims ──
  sections.push(
    h1(isEl?'5. Αξιώσεις Ζημιών':'5. Damage Claims'),
    para(isEl
      ? 'Συμπεριλαμβάνεται στην αμοιβή Διαχείρισης Κρατήσεων — χωρίς επιπλέον χρέωση.'
      : 'Included in the Reservations Management fee — no extra charge.'),
    para(isEl
      ? 'Διαχειριζόμαστε όλες τις αξιώσεις για ζημιές από επισκέπτες, επικοινωνούμε με το σχετικό κανάλι κράτησης και συντονίζουμε επισκευές.'
      : 'We manage all claims for guest-caused damage, communicate with the relevant booking channel, and coordinate repairs.'),
    para(isEl
      ? 'Η κάλυψη ισχύει μόνο εφόσον η πλατφόρμα κρατήσεων παρέχει προστασία ζημιών. Για πλήρη κάλυψη απαιτείται ιδιωτική ασφάλιση.'
      : 'Coverage applies only when the booking platform provides damage protection. A private insurance policy is required for full coverage in all cases.'),
    sp()
  );

  // ── SECTION 6: Liability & Termination ──
  sections.push(
    h1(isEl?'6. Ευθύνη & Καταγγελία':'6. Liability & Termination'),
    h2(isEl?'6.1 Περιορισμός Ευθύνης':'6.1 Limitation of Liability'),
    para(isEl
      ? 'Ο Διαχειριστής δεν ευθύνεται για γεγονότα ανωτέρας βίας, επίπεδα πληρότητας ή εσόδων, διακοπές πλατφόρμας, βλάβες δικτύου/ρεύματος ή ενέργειες επισκεπτών εκτός ελέγχου του Διαχειριστή.'
      : 'The Manager is not liable for force majeure events, occupancy or revenue levels, platform outages, utility failures, or guest actions beyond the Manager\'s reasonable control.'),
    sp(),
    h2(isEl?'6.2 Καταγγελία & Παράδοση':'6.2 Termination & Handover'),
    para(isEl
      ? 'Οποιοδήποτε μέρος μπορεί να καταγγείλει τη σύμβαση με γραπτή ειδοποίηση 30 ημερών.'
      : 'Either party may terminate this agreement with 30 days\' written notice.'),
    para(isEl
      ? 'Εντός 15 ημερών από την καταγγελία, ο Διαχειριστής θα μεταβιβάσει πρόσβαση σε όλες τις αγγελίες, μελλοντικές κρατήσεις, επικοινωνίες και λειτουργικά αρχεία.'
      : 'Within 15 days of termination, the Manager will transfer access to all listings, future reservations, guest communications, and operational files.'),
    para(isEl
      ? 'Κρατήσεις επιβεβαιωμένες πριν την καταγγελία: αν ο Ιδιοκτήτης επιθυμεί ο Διαχειριστής να συνεχίσει να τις διαχειρίζεται, ισχύουν οι ίδιοι όροι αμοιβών. Αν ο Ιδιοκτήτης αναλάβει ή ακυρώσει, τυχόν κυρώσεις ή κόστη βαρύνουν τον Ιδιοκτήτη.'
      : 'Bookings confirmed before termination: if the Owner wishes the Manager to continue handling them, the same fee terms apply. If the Owner takes them over or cancels them, any resulting penalties or costs are borne by the Owner.'),
    sp()
  );

  // ── SECTION 7: VAT ──
  sections.push(
    h1(isEl?'7. ΦΠΑ':'7. VAT'),
    para(isEl
      ? 'Όλες οι αμοιβές είναι εκτός 24% ΦΠΑ εκτός αν αναφέρεται ρητά διαφορετικά.'
      : 'All fees are exclusive of 24% VAT unless explicitly stated otherwise.'),
    sp()
  );

  if (p.notes) {
    sections.push(para((isEl?'Σημειώσεις: ':'Notes: ') + p.notes, { italics: true, color: GREY }), sp());
  }

  // Signature block
  sections.push(sp(), sp(),
    new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[4500,4860], rows:[new TableRow({ children:[
      new TableCell({ width:{size:4500,type:WidthType.DXA}, borders:{top:noBorder,bottom:noBorder,left:noBorder,right:noBorder}, children:[
        new Paragraph({spacing:{after:720},children:[pr(isEl?'Για λογαριασμό της Zesty:':'On behalf of Zesty:',{size:20,color:GREY})]}),
        new Paragraph({border:{bottom:{style:BorderStyle.SINGLE,size:4,color:TEAL}},children:[pr(' ')],spacing:{after:80}}),
        new Paragraph({children:[pr('Zesty Rentals and Investments IKE',{size:18,color:TEAL})]})
      ]}),
      new TableCell({ width:{size:4860,type:WidthType.DXA}, borders:{top:noBorder,bottom:noBorder,left:noBorder,right:noBorder}, children:[
        new Paragraph({spacing:{after:720},children:[pr((isEl?'Ιδιοκτήτης: ':'Owner: ') + fv('ownerName'),{size:20,color:GREY})]}),
        new Paragraph({border:{bottom:{style:BorderStyle.SINGLE,size:4,color:TEAL}},children:[pr(' ')],spacing:{after:80}}),
        new Paragraph({children:[tvr('ownerName', fv('ownerName'))]})
      ]})
    ]})] })
  );

  // ── ANNEX A ──
  sections.push(pgBrk(),
    h1(isEl?'Παράρτημα Α – Πλήρης Τιμοκατάλογος':'Annex A – Full Price List')
  );

  // A1
  sections.push(
    h2(isEl?'A1. Επαναλαμβανόμενες / Ποσοστιαίες Αμοιβές':'A1. Recurring / Percentage Fees'),
    new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[5760,3600], rows:[
      hdrRow2(isEl?'Υπηρεσία':'Service', isEl?'Αμοιβή':'Fee', 5760, 3600),
      dataRow2(isEl?'Διαχείριση Κρατήσεων & Σχέσεις με Επισκέπτες':'Reservations Management & Guest Relations',
        [tvr('managementFee', fv('managementFee','%')), pr(isEl?' καθαρά έσοδα μετά OTA':' net revenue after OTA commission')], 0, 5760, 3600),
      dataRow2(isEl?'Άμεση Κράτηση μέσω Zesty.gr (επιπλέον αμοιβής διαχείρισης)':'Direct Booking via Zesty.gr (on top of management fee)',
        [tvr('directBookingFee', fv('directBookingFee','%')), pr(isEl?' ανά κράτηση':' per booking')], 1, 5760, 3600),
      dataRow2(isEl?'Κρατήσεις Ιδιοκτήτη / Μπλοκάρισμα':'Owner Reservations / Date Blocks',
        [pr('0%')], 0, 5760, 3600)
    ]}), sp()
  );

  // A2
  sections.push(
    h2(isEl?'A2. Υπηρεσίες ανά Συμβάν':'A2. Per-Event Services'),
    new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[5760,3600], rows:[
      hdrRow2(isEl?'Υπηρεσία':'Service', isEl?'Αμοιβή':'Fee', 5760, 3600),
      dataRow2('Check-in', [tvr('checkinFee', fv('checkinFee','€')), pr(isEl?' / συμβάν':' / event')], 0, 5760, 3600),
      dataRow2('Check-out', [tvr('checkinFee', fv('checkinFee','€')), pr(isEl?' / συμβάν':' / event')], 1, 5760, 3600),
      dataRow2(isEl?'Welcome kit — προετοιμασία & παράδοση (με check-in)':'Welcome kit — preparation & delivery (incl. with check-in)', [pr('€0')], 0, 5760, 3600),
      dataRow2(isEl?'Welcome kit — προετοιμασία & παράδοση (χωρίς check-in)':'Welcome kit — preparation & delivery (standalone, no check-in)', [pr('€15 / kit')], 1, 5760, 3600),
      dataRow2(isEl?'Welcome kit — είδη':'Welcome kit — items', [pr(isEl?'Κόστος αγοράς':'At cost')], 0, 5760, 3600),
      dataRow2(isEl?'Εγκατάσταση & διαχείριση lock-box / key-safe':'Lock-box / key-safe setup and management', [pr(isEl?'Δωρεάν':'Free')], 1, 5760, 3600),
      dataRow2(isEl?'Επίσκεψη συντήρησης (έως 1,5 ώρες)':'Maintenance visit (up to 1.5 hrs)',
        [tvr('maintenanceVisit', fv('maintenanceVisit','€')), pr(isEl?' / επίσκεψη + ':' / visit + '), tvr('maintenanceExtraHr', fv('maintenanceExtraHr','€')), pr(isEl?' / επιπλέον ώρα':' / extra hr')], 0, 5760, 3600),
      dataRow2(isEl?'Επείγουσα / εκτός ωραρίου επίσκεψη (21:00–07:00 ή αργία)':'Emergency / out-of-hours visit (21:00–07:00 or national holiday)', [pr(isEl?'Διπλή χρέωση βάσει παραπάνω':'Double the above rate')], 1, 5760, 3600),
      noteRow(isEl?'Σημείωση: Όταν check-in και check-out γίνονται την ίδια ημέρα, χρεώνεται μόνο ένα συμβάν. Αν οι καθαρίστριες επισκεφτούν για turnover, δεν χρεώνεται ξεχωριστό check-out. Καθυστερημένες αφίξεις εξυπηρετούνται το επόμενο πρωί χωρίς επιπλέον χρέωση.':'Note: When check-in and check-out occur on the same day, only one event fee is charged. If cleaners visit for turnover, no separate check-out fee applies. Late arrivals are greeted the following morning at no extra charge.', 9360)
    ]}), sp()
  );

  // A3
  sections.push(
    h2(isEl?'A3. Φροντίδα & Λειτουργία Ακινήτου':'A3. Property Care & Operations'),
    new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[5760,3600], rows:[
      hdrRow2(isEl?'Υπηρεσία':'Service', isEl?'Αμοιβή':'Fee', 5760, 3600),
      dataRow2(isEl?'Συντήρηση πισίνας — εβδομαδιαίος καθαρισμός (μόνο εργασία)':'Pool maintenance — weekly cleaning (labour only)',
        [tvr('poolMonthly', fv('poolMonthly')), pr(isEl?' / μήνα':' / month')], 0, 5760, 3600),
      dataRow2(isEl?'Χημικά πισίνας':'Pool chemicals', [pr(isEl?'Κόστος αγοράς':'At cost')], 1, 5760, 3600),
      dataRow2(isEl?'Άνοιγμα / κλείσιμο πισίνας':'Pool season opening / closing', [pr('TBC ' + (isEl?'ανά συμβάν':'per event'))], 0, 5760, 3600),
      dataRow2(isEl?'Συντήρηση κήπου':'Garden maintenance', [pr(isEl?'Κόστος (βάσει συμφωνίας κηπουρού)':'At cost (per gardener agreement)')], 1, 5760, 3600),
      dataRow2(isEl?'Υπηρεσίες καθαρισμού':'Cleaning services',
        [tvr('cleaningRate', fv('cleaningRate','€')), pr(isEl?' / ώρα / καθαριστή + ':' / hr per cleaner + '), tvr('transport', fv('transport','€')), pr(isEl?' μεταφορά':' transport')], 0, 5760, 3600),
      dataRow2(isEl?'Υπηρεσίες πλυντηρίου (συμπ. παράδοση)':'Laundry services (incl. delivery)', [pr(isEl?'Βάσει Παραρτήματος Β':'Per Annex B')], 1, 5760, 3600),
      dataRow2(isEl?'Μίσθωση λευκών':'Linen leasing',
        [pr('+'), tvr('linenLeasing', fv('linenLeasing','%')), pr(isEl?' στην τιμή Παρ. Β':' on Annex B laundry price')], 0, 5760, 3600),
      dataRow2(isEl?'Αναλώσιμα επισκεπτών — ανεφοδιασμός':'Owner-supplied guest consumables — restocking', [pr(isEl?'Κόστος αγοράς, χωρίς αμοιβή (βλ. Παρ. Γ)':'At cost, no handling fee (per Annex C)')], 1, 5760, 3600)
    ]}), sp()
  );

  // A4
  sections.push(
    h2(isEl?'A4. Εφόδια & Αγορές':'A4. Supplies & Shopping'),
    new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[5760,3600], rows:[
      hdrRow2(isEl?'Υπηρεσία':'Service', isEl?'Αμοιβή':'Fee', 5760, 3600),
      dataRow2(isEl?'Βασικά εφόδια (πισίνα / καθαρισμός / επισκέπτες / κήπος) — διακανονισμός':'Baseline supplies (pool / cleaning / guest / garden) — arrangement', [pr(isEl?'Δωρεάν':'Free')], 0, 5760, 3600),
      dataRow2(isEl?'Βασικά εφόδια — τιμολόγηση στον ιδιοκτήτη':'Baseline supplies — invoiced to Owner', [pr(isEl?'Κόστος αγοράς, χύμα ανά σεζόν':'At cost, in bulk per season')], 1, 5760, 3600),
      dataRow2(isEl?'Καλαθι σ/μ (κατ αιτηση) — διακανονισμος':'Guest-requested supermarket basket — arrangement', [pr(isEl?'Δωρεαν':'Free')], 0, 5760, 3600),
      dataRow2(isEl?'Καλαθι σ/μ (κατ αιτηση) — τιμολογηση στον επισκεπτη':'Guest-requested supermarket basket — invoiced to guest', [pr(isEl?'Κοστος αγορας':'At cost')], 1, 5760, 3600),
      dataRow2(isEl?'Λοιποί διακανονισμοί εφοδίων (ξαπλώστρες, έπιπλα κ.λπ.)':'Other supply arrangements (sunbeds, furniture, etc.)',
        [pr('+'), tvr('supplyFee', fv('supplyFee','%')), pr(isEl?' επί καθαρής αξίας τιμολογίου (εκτός ΦΠΑ και μεταφοράς)':' on net invoice value (excl. VAT and delivery)')], 0, 5760, 3600)
    ]}), sp()
  );

  // A5
  sections.push(
    h2(isEl?'A5. Διαχείριση Αξιώσεων':'A5. Claims Management'),
    para(isEl
      ? 'Συμπεριλαμβάνεται στην αμοιβή Διαχείρισης Κρατήσεων — χωρίς επιπλέον χρέωση.'
      : 'Included in the Reservations Management fee — no additional charge.'),
    sp()
  );

  // ── ANNEX B ──
  sections.push(pgBrk(),
    h1(isEl?'Παράρτημα Β – Τιμοκατάλογος Υπηρεσιών Πλυντηρίου Zesty':'Annex B – Zesty Laundry Services Price List'),
    para(isEl
      ? 'Εκδ. v1.0 — 18/02/2025. Όλες οι τιμές εκτός 24% ΦΠΑ. Δωρεάν παράδοση από Δραπανιά έως Φαλάσαρνα· η παραλαβή λινών μπορεί να γίνει εφόσον είναι βολικό για τη διαδρομή. Οι τιμές μπορεί να προσαρμοστούν ανάλογα με βάρος ή υλικό.'
      : 'Version v1.0 — 18/02/2025. All prices exclude 24% VAT. Free delivery from Drapania to Falasarna; linen collection may be possible if convenient for the route. Prices may be adjusted by weight or material.'),
    ...buildLaundryAnnexRows(p, isEl, para, TEAL, GREY, allBorders, ShadingType, WidthType, AlignmentType, Paragraph, TextRun, Table, TableRow, TableCell)
  );

  // ── ANNEX C ──
  sections.push(pgBrk(),
    h1(isEl?'Παράρτημα Γ – Αναλώσιμα Επισκεπτών':'Annex C – Owner-Supplied Guest Consumables'),
    para(isEl
      ? 'Τα παρακάτω αναλώσιμα παρέχονται από τον Ιδιοκτήτη. Ο Διαχειριστής αναλαμβάνει αγορά και ανεφοδιασμό ως μέρος της πλήρους διαχείρισης, χωρίς επιπλέον αμοιβή. Όλα τα είδη τιμολογούνται στον Ιδιοκτήτη στο κόστος αγοράς.'
      : 'The following consumables are supplied by the Owner. The Manager arranges purchasing and restocking as part of full property management, with no additional handling fee. All items are invoiced to the Owner at cost.'),
    h3(isEl?'Γ1. Προτεινόμενη Λίστα Αναλωσίμων':'C1. Proposed Consumables List')
  );
  var consumables = isEl ? [
    'Εμφιαλωμένο νερό', 'Ελαιόλαδο', 'Αλάτι', 'Πιπέρι', 'Φακελάκια τσαγιού', 'Ζάχαρη',
    'Υγρό πιάτων', 'Σφουγγαράκια πιάτων', 'Σαπούνια', 'Σαμπουάν', 'Αφρόλουτρο',
    'Conditioner μαλλιών', 'Λοσιόν σώματος', 'Χαρτί τουαλέτας',
    'Κάψουλες espresso', 'Σακούλες αποβλήτων τουαλέτας', 'Σακούλες σκουπιδιών'
  ] : [
    'Bottled water', 'Olive oil', 'Salt', 'Pepper', 'Tea bags', 'Sugar',
    'Dishwashing liquid', 'Dish sponges', 'Soap bars', 'Shampoo', 'Shower gel / body wash',
    'Hair conditioner', 'Body lotion', 'Toilet paper',
    'Espresso capsules', 'Toilet waste bags', 'Trash bags'
  ];
  consumables.forEach(function(c){ sections.push(bullet(c)); });
  sections.push(
    sp(),
    para(isEl
      ? 'Η λίστα αναλωσίμων μπορεί να τροποποιηθεί κατόπιν αμοιβαίας συμφωνίας οποιαδήποτε στιγμή κατά τη διάρκεια της συνεργασίας.'
      : 'The consumables list may be adjusted by mutual agreement at any time during the management period.', { italics: true, color: GREY })
  );

  return new Document({
    numbering: { config: [{ reference: 'main-bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, color: TEAL, font: 'Arial' }, paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, color: TEAL, font: 'Arial' }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } }
      ]
    },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: {
        default: new Header({ children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D0E8E4', space: 1 } },
          children: [new TextRun({ text: isEl ? 'Πρόταση Πλήρους Διαχείρισης · Zesty Rentals and Investments IKE' : 'Full Property Management Proposal · Zesty Rentals and Investments IKE', font: 'Arial', size: 16, color: GREY })]
        })] })
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Page ', font: 'Arial', size: 16, color: GREY }),
            new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: GREY }),
            new TextRun({ text: ' of ', font: 'Arial', size: 16, color: GREY }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Arial', size: 16, color: GREY })
          ]
        })] })
      },
      children: sections
    }]
  });
}
window._docxBlockLoaded = true;