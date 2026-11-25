// On-device photo reading for the operating list. Nothing is uploaded: the OCR engine and
// Arabic model are served from this site and run inside the phone's browser.
export type ScanGroup = { name: string; known: boolean; parts: { proc: string; count: number }[] };

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
const words = (s: string) => norm(s).split(/[^\u0621-\u064Aa-z0-9]+/).filter(Boolean);

type Proc = 'معده' | 'قولون' | 'معده و قولون' | 'ERCP';
const hasWord = (ws: string[], target: string) => ws.some(w => near(w.replace(/^(و|ب|ال)/, ''), target) || near(w, target));
export function procOf(line: string): Proc | null {
    const ws = words(line);
    const t = norm(line);
    if (/ercp|ارسيبي|ار سي بي/.test(t)) return 'ERCP';
    const g = hasWord(ws, 'معده') || ws.some(w => /^(egd|gastro|endo)$/.test(w));
    const c = hasWord(ws, 'قولون') || hasWord(ws, 'كولون') || ws.some(w => /^colon/.test(w));
    if (g && c) return 'معده و قولون';
    if (g) return 'معده';
    if (c) return 'قولون';
    return null;
}
const PROC_WORDS = ['معده', 'قولون', 'كولون', 'و', 'ercp', 'منظار', 'علوي', 'سفلي', 'حاله', 'حالات', 'حالة', 'x'];
const onlyProcWords = (line: string) => words(line).every(w => /^\d+$/.test(w) || PROC_WORDS.some(p => near(w, p)));

export function parseList(text: string, doctors: { name: string }[]): ScanGroup[] {
    const lastName = (n: string) => { const ws = words(n).filter(w => w !== 'د' && w !== 'دكتور'); return ws[ws.length - 1] || ''; };
    const known = doctors.map(d => ({ name: d.name, last: lastName(d.name) })).filter(d => d.last);
    const groups: ScanGroup[] = [];
    let cur: ScanGroup | null = null;
    const lastNum = new Map<ScanGroup, number>();
    const get = (name: string, isKnown: boolean) => {
        let g = groups.find(x => x.name === name);
        if (!g) { g = { name, known: isKnown, parts: [] }; groups.push(g); }
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
        const m = norm(line).match(/^\s*(\d{1,2})\s*[x×:\-]?\s*(.*)$/);
        if (m) {
            const n = Number(m[1]); const prev = lastNum.get(g) ?? 0;
            // 1,2,3... in order looks like row numbers of a table, not counts.
            if (onlyProcWords(m[2]) && n !== prev + 1) count = Math.max(1, n);
            lastNum.set(g, n);
        }
        const e = g.parts.find(x => x.proc === p);
        if (e) e.count += count; else g.parts.push({ proc: p, count });
    }
    return groups.filter(g => g.parts.length || g.name);
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
