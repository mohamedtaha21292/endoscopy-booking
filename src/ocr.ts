// On-device photo reading for the operating list. Nothing is uploaded: the OCR engine and
// Arabic model are served from this site and run inside the phone's browser.
export type Amb = { line: string; proc: string; n: number };
export type ScanGroup = { name: string; known: boolean; parts: { proc: string; count: number }[]; amb: Amb[] };

const AR_DIG = '٠١٢٣٤٥٦٧٨٩';
export const norm = (s: string) => s
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, d => String(AR_DIG.indexOf(d)))
    .toLowerCase();

const lev = (a: string, b: string) => {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = cur;
    }
    return prev[n];
};
const near = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && lev(a, b) <= (Math.max(a.length, b.length) >= 7 ? 2 : 1));
const words = (s: string) => norm(s).replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2').split(/[^\u0621-\u064Aa-z0-9]+/).filter(Boolean);

type Proc = 'معده' | 'قولون' | 'معده و قولون' | 'ERCP';
const hasWord = (ws: string[], target: string) => ws.some(w => near(w.replace(/^(و|ب|ال)/, ''), target) || near(w, target));
// Paper abbreviations used by the unit: EGD = معده, colonoscopy = قولون, EGD+colonoscopy = معده و قولون (one combined case), ERCP.
const isEgd = (w: string) => /^(egd|edg|eqd|ecd|e9d|gastro\w*|endo)$/.test(w);
const isColonoscopy = (w: string) => /^col/.test(w) || (w.length >= 7 && lev(w, 'colonoscopy') <= 3);
const isErcp = (w: string) => w === 'ercp' || (w.length >= 4 && w.length <= 5 && /^[ec][rn][cdo][pbq]$/.test(w));
export function procOf(line: string): Proc | null {
    const t = norm(line);
    const ws = words(line);
    const spaced = t.replace(/\b([a-z])\s+(?=[a-z]\b)/g, '$1'); // "E R C P" / "E G D" read as separate letters
    const sw = words(spaced);
    if (/ercp|ارسيبي|ار سي بي/.test(spaced) || sw.some(isErcp)) return 'ERCP';
    const g = hasWord(ws, 'معده') || sw.some(isEgd);
    const c = hasWord(ws, 'قولون') || hasWord(ws, 'كولون') || sw.some(isColonoscopy);
    if (g && c) return 'معده و قولون';
    if (g) return 'معده';
    if (c) return 'قولون';
    return null;
}
const PROC_WORDS = ['معده', 'قولون', 'كولون', 'و', 'ercp', 'egd', 'colonoscopy', 'منظار', 'علوي', 'سفلي', 'حاله', 'حالات', 'حالة', 'x'];
const onlyProcWords = (line: string) => words(line).every(w => /^\d+$/.test(w) || PROC_WORDS.some(p => near(w, p)));

export function parseList(text: string, doctors: { name: string }[]): ScanGroup[] {
    const lastName = (n: string) => { const ws = words(n).filter(w => w !== 'د' && w !== 'دكتور'); return ws[ws.length - 1] || ''; };
    const known = doctors.map(d => ({ name: d.name, last: lastName(d.name) })).filter(d => d.last);
    const groups: ScanGroup[] = [];
    let cur: ScanGroup | null = null;
    const lastNum = new Map<ScanGroup, number>();
    const get = (name: string, isKnown: boolean) => {
        let g = groups.find(x => x.name === name);
        if (!g) { g = { name, known: isKnown, parts: [], amb: [] }; groups.push(g); }
        return g;
    };
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (line.length < 2) continue;
        const ws = words(line);
        const p = procOf(line);
        const hit = known.find(d => ws.some(w => near(w, d.last)));
        const titled = /^\s*(د\s*[.\/\\:،-]|د\s|دكتور|استشاري|dr\b)/i.test(norm(line)) || ws.includes('استشاري') || ws.includes('دكتور');
        if (hit && (ws.length <= 6 || titled) && !(p && ws.length > 6)) { cur = get(hit.name, true); continue; }
        if (!p && titled && ws.length <= 6) {
            const nm = line.replace(/^[\s.,:;\-_*#]*(استشاري)?[\s.,:;\-_]*(دكتور|د\s*[.\/\\:،-]?)?[\s.:\/\\-]*/, '').replace(/[^\u0600-\u06FFa-zA-Z .]/g, '').trim();
            if (nm.length >= 3) { cur = get(nm.startsWith('د') ? nm : 'د. ' + nm, false); }
            continue;
        }
        if (!p) continue;
        const g = cur || get('', true);
        let count = 1;
        let ambiguous = false;
        const nl = norm(line).replace(/(\d)([a-z])/g, '$1 $2');
        const m = nl.match(/^\s*(\d{1,2})\s*([x×:\-]?)\s*(.*)$/);
        const tr = nl.match(/(?:^|\s)(\d{1,2})\s*(حاله|حالات|cases?|case)?\s*$/);
        if (m) {
            const n = Number(m[1]); const prev = lastNum.get(g) ?? 0;
            const explicit = m[2] === 'x' || m[2] === '×';
            if (onlyProcWords(m[3])) {
                if (explicit || n !== prev + 1) count = Math.max(1, n);
                else if (n >= 2) { ambiguous = true; g.amb.push({ line, proc: p, n }); } // could be row number OR a real count: never decided by sequence alone
            } else if (n >= 2 && n <= 20 && /(حاله|حالات|cases?)/.test(m[3])) count = n;
            lastNum.set(g, n);
        } else if (tr) {
            const n = Number(tr[1]);
            if (tr[2]) count = Math.max(1, n);
            else if (n >= 2 && n <= 20) { ambiguous = true; g.amb.push({ line, proc: p, n }); }
        }
        if (ambiguous) continue;
        const e = g.parts.find(x => x.proc === p);
        if (e) e.count += count; else g.parts.push({ proc: p, count });
    }
    return groups.filter(g => g.parts.length || g.amb.length || g.name);
}

export async function prepImage(file: File): Promise<HTMLCanvasElement> {
    const bmp = await createImageBitmap(file);
    const s = Math.min(2.5, 2200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    const x = c.getContext('2d')!;
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
}

export async function readImage(file: File, onProgress: (p: number) => void): Promise<string[]> {
    const T: any = await import('tesseract.js');
    const base = new URL('./ocr/', document.baseURI).href;
    let k = 0;
    const canvas = await prepImage(file);
    const worker = await T.createWorker('ara+eng', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base,
        langPath: base,
        gzip: true,
        workerBlobURL: false,
        logger: (m: any) => { if (m.status === 'recognizing text') onProgress((k + m.progress) / 3); },
    });
    try {
        const out: string[] = [];
        for (const psm of ['4', '11', '3']) {
            await worker.setParameters({ tessedit_pageseg_mode: psm });
            const r = await worker.recognize(canvas);
            out.push(String(r.data.text || ''));
            k++;
        }
        return out;
    } finally { await worker.terminate(); }
}

// Lines that look like case rows (they carry a number) but were not read as a known procedure or consultant.
// They are shown to the user in the review step so nothing is silently dropped or guessed.
export function unclearLines(text: string, doctors: { name: string }[]): string[] {
    const lastName = (n: string) => { const ws = words(n).filter(w => w !== 'د' && w !== 'دكتور'); return ws[ws.length - 1] || ''; };
    const lasts = doctors.map(d => lastName(d.name)).filter(Boolean);
    return text.split('\n').map(l => l.trim()).filter(l => {
        if (l.length < 2 || !/[0-9٠-٩]/.test(l)) return false;
        if (procOf(l)) return false;
        const ws = words(l);
        return !ws.some(w => lasts.some(x => near(w, x)));
    });
}
