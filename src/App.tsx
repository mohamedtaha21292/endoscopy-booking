import hospital from './photos/hospital.jpg';
import logo from './photos/logo.png';
import React, { useEffect, useMemo, useState } from 'react';
import { useLocalState } from './useLocalState';
import { mergeBookings, mergeDoctors, CANON_DOCTORS } from './migrate';
import { cardImageURL, opListImageURL } from './cardImage';
import { readImage, parseList } from './ocr';

type Doctor = { id: string; name: string; day?: string };
type Booking = { id: string; doctorId: string; doctorName: string; patient: string; proc: string; day: string; time: string; status: 'confirmed' | 'pending'; sex?: string; age?: string; room?: string; count?: number; parts?: { proc: string; count: number }[] };
type Tab = 'doctors' | 'cases' | 'oplist';

const TZ = 'Africa/Cairo';
const PROCS = ['معده', 'قولون', 'معده و قولون', 'ERCP'];
const TIMES = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
const WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const OP_DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
const DEMO_OVERRIDE: string | null = null;

const seedDoctors: Doctor[] = CANON_DOCTORS;

const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); };
const dayName = (iso: string) => WD[new Date(iso + 'T12:00:00').getDay()];
const dayLong = (iso: string) => new Intl.DateTimeFormat('ar-EG', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso + 'T12:00:00'));
const fmtTime = (t?: string) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'صباحًا' : h === 12 ? 'ظهرًا' : 'مساءً'}`; };
const dm = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;
const arDigits = (n: number) => String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

const seedBookings = (): Booking[] => {
    const t = todayISO();
    return [
        { id: 'b1', doctorId: 'd1', doctorName: 'د.مصطفي الهلباوي', patient: 'محمد عبد الله', proc: 'معده', day: t, time: '09:00', status: 'confirmed', sex: 'ذكر', age: '45' },
        { id: 'b2', doctorId: 'd2', doctorName: 'د.محمد الملطاوي', patient: 'فاطمة علي', proc: 'قولون', day: t, time: '10:00', status: 'confirmed', sex: 'أنثى', age: '38' },
        { id: 'b3', doctorId: 'd3', doctorName: 'د. محمد عباسي', patient: 'محمود حسن', proc: 'ERCP', day: addDays(t, 1), time: '11:00', status: 'confirmed', sex: 'ذكر', age: '52' },
    ];
};

const Ico = ({ d, size = 24 }: { d: string; size?: number }) => (
    <svg className="bk-ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const I = {
    cal: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    doc: 'M4.8 2.3A.3.3 0 1 0 5 2a.3.3 0 0 0-.2.3M6.7 3.3a1 1 0 0 0-1.4 1.4l3.2 3.2a3.5 3.5 0 0 0 4.2 4.9l4.3 4.3a2 2 0 0 0 2.8-2.8l-4.3-4.3a3.5 3.5 0 0 0-4.9-4.2L7.4 2.6M19 15l1.5 1.5M7 5l1.5 1.5',
    plus: 'M12 5v14M5 12h14',
    check: 'M20 6 9 17l-5-5',
    send: 'm22 2-7 20-4-9-9-4zM22 2 11 13',
    scope: 'M4.8 2.3A.3.3 0 1 0 5 2a.3.3 0 0 0-.2.3M6.7 3.3a1 1 0 0 0-1.4 1.4l3.2 3.2a3.5 3.5 0 0 0 4.2 4.9l4.3 4.3a2 2 0 0 0 2.8-2.8l-4.3-4.3a3.5 3.5 0 0 0-4.9-4.2L7.4 2.6M19 15l1.5 1.5M7 5l1.5 1.5',
    clock: 'M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
    back: 'm9 18 6-6-6-6',
};

export function App() {
    const demo = useMemo(() => (typeof DEMO_OVERRIDE === 'string' ? DEMO_OVERRIDE : null) ?? (typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search).get('demo') : null), []);
    const [screen, setScreen] = useState<'login' | 'main'>(demo && demo !== 'login' ? 'main' : 'login');
    const [tab, setTab] = useState<Tab>(demo === 'cases' || demo === 'card' ? 'cases' : 'doctors');
    const [selDoc, setSelDoc] = useState<string | null>(demo === 'doc' ? 'd1' : null);
    const [cardId, setCardId] = useState<string | null>(demo === 'card' ? 'b2' : null);

    const [doctors, setDoctors, docSaved] = useLocalState<Doctor[]>('bk-doctors.v1', seedDoctors);
    const [bookings, setBookings, bkSaved] = useLocalState<Booking[]>('bk-cases.v2', seedBookings());
    const [legacyV1, setLegacyV1, legSaved] = useLocalState<any[]>('bk-cases.v1', []);
    const [migDone, setMigDone, migSaved] = useLocalState<boolean>('bk-mig.v1', false);
    const [docMigDone, setDocMigDone, docMigSaved] = useLocalState<boolean>('bk-mig-doctors.v2', false);
    const [opLists, setOpLists, opSaved] = useLocalState<Record<string, { proc: string; count: number }[]>>('bk-oplist.v1', {});
    const ready = docSaved.ready && bkSaved.ready && legSaved.ready && migSaved.ready && docMigSaved.ready && opSaved.ready;
    const saveMessage = Array.from(new Set([bkSaved.message, docSaved.message, legSaved.message, migSaved.message, docMigSaved.message, opSaved.message].filter(Boolean))).join(' ');
    const saveFailed = /not saved|fail|error|quota/i.test(saveMessage);

    useEffect(() => {
        if (!ready || migDone) return;
        if ((legacyV1 || []).length) setBookings(mergeBookings(legacyV1, doctors, bookings));
        setMigDone(true);
    }, [ready, migDone]);

    // One-time: apply the user's canonical doctor list (order + weekdays), keeping stored records linked.
    useEffect(() => {
        if (!ready || docMigDone) return;
        setDoctors(mergeDoctors(doctors));
        setDocMigDone(true);
    }, [ready, docMigDone]);

    const [selDay, setSelDay] = useState(todayISO());
    const [fPatient, setFPatient] = useState('');
    const [fSex, setFSex] = useState('ذكر');
    const [fAge, setFAge] = useState('');
    const [fProc, setFProc] = useState(PROCS[0]);
    const [fDay, setFDay] = useState(todayISO());
    const [fTime, setFTime] = useState('09:00');
    const [newDoc, setNewDoc] = useState('');
    const [fCountText, setFCountText] = useState('');
    const countParts = fCountText.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
        const m = l.match(/^([0-9٠-٩]+)[\s:：-]*(.*)$/);
        const count = m ? Math.min(99, Number(m[1].replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))))) : 1;
        const proc = (m && m[2]) ? m[2].trim() : l;
        return { proc, count };
    });
    const totalCount = countParts.reduce((a, p) => a + p.count, 0);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [cTime, setCTime] = useState('');

    // Weekly operating list: fixed doctors Sat-Thu, saved per weekday and reused every week.
    // The user picks a date; its weekday picks the fixed doctor, and the image carries both.
    const nextWeekday = (w: string) => { let d = todayISO(); for (let i = 0; i < 7; i++) { if (dayName(d) === w) return d; d = addDays(d, 1); } return todayISO(); };
    const [opDate, setOpDate] = useState(todayISO());
    const opDay = dayName(opDate);
    const [opText, setOpText] = useState('');
    const [opCardUrl, setOpCardUrl] = useState<string | null>(null);
    const [opShareNote, setOpShareNote] = useState('');
    useEffect(() => {
        if (!ready) return;
        const parts = opLists[opDay] || [];
        setOpText(parts.map(p => `${p.count} ${p.proc}`).join('\n'));
    }, [opDay, ready]);
    // Any change to the full selected date or to the counts invalidates a generated
    // card, so an old image can never stay visible or shareable under new inputs.
    useEffect(() => {
        setOpCardUrl(null);
        setOpShareNote('');
    }, [opDate, opText]);
    const opDoctor = doctors.find(d => d.day === opDay) || null;
    const parseParts = (t: string) => t.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
        const m = l.match(/^([0-9٠-٩]+)[\s:：-]*(.*)$/);
        const count = m ? Math.min(99, Number(m[1].replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))))) : 1;
        const proc = (m && m[2]) ? m[2].trim() : l;
        return { proc, count };
    });
    const opParts = parseParts(opText);
    const opMainTotal = opParts.reduce((a, p) => a + p.count, 0);
    // Extra consultants who bring cases on the same date (saved per date, not per weekday).
    const [opExtraAll, setOpExtraAll, opExtraSaved] = useLocalState<Record<string, { name: string; text: string }[]>>('bk-opextra.v1', {});
    const opExtras = opExtraAll[opDate] || [];
    const setOpExtras = (list: { name: string; text: string }[]) => setOpExtraAll({ ...opExtraAll, [opDate]: list });
    const opExtraGroups = opExtras.map(e => { const parts = parseParts(e.text); return { doctorName: e.name.trim(), parts, total: parts.reduce((a, p) => a + p.count, 0) }; }).filter(g => g.total > 0);
    const opMissingName = opExtras.some(e => !e.name.trim() && parseParts(e.text).length > 0);
    const opGroups = [
        ...(opMainTotal > 0 || opExtraGroups.length > 0 ? [{ doctorName: opDoctor ? opDoctor.name : '', parts: opParts, total: opMainTotal }] : []),
        ...opExtraGroups,
    ];
    const opTotal = opGroups.reduce((a, g) => a + g.total, 0);
    const opExtraKey = JSON.stringify(opExtras);
    useEffect(() => { setOpCardUrl(null); setOpShareNote(''); }, [opExtraKey]);
    // Photo of the paper list: read on the phone, shown for review, applied only after the user agrees.
    type Rev = { name: string; known: boolean; text: string };
    const [scanBusy, setScanBusy] = useState(false);
    const [scanPct, setScanPct] = useState(0);
    const [scanErr, setScanErr] = useState('');
    const [scanRev, setScanRev] = useState<Rev[] | null>(null);
    const [scanRaw, setScanRaw] = useState('');
    const onScanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        setScanBusy(true); setScanPct(0); setScanErr(''); setScanRev(null);
        try {
            const texts = await readImage(f, setScanPct);
            const sum = (gs: ReturnType<typeof parseList>) => gs.reduce((a, g) => a + g.parts.reduce((b, p) => b + p.count, 0), 0);
            const cands = texts.map(t => ({ t, g: parseList(t, doctors) })); cands.sort((a, b) => sum(b.g) - sum(a.g)); // stable: on a tie the first (row-ordered) reading wins
            const text = cands[0].t; const groups = cands[0].g;
            setScanRaw(text);
            if (!groups.some(g => g.parts.length)) setScanErr('ما قدرتش ألاقي تصنيفات واضحة (معده / قولون / ERCP) في الصورة. جرّب صورة أوضح ومن فوق، أو اكتب الأعداد بإيدك.');
            else setScanRev(groups.filter(g => g.parts.length).map(g => ({ name: g.name || (opDoctor ? opDoctor.name : ''), known: g.known, text: g.parts.map(p => `${p.count} ${p.proc}`).join('\n') })));
        } catch { setScanErr('القراءة ما نفعتش على الجهاز ده. اكتب الأعداد بإيدك.'); }
        setScanBusy(false);
    };
    const applyScan = () => {
        if (!scanRev) return;
        const mainName = opDoctor ? opDoctor.name : '';
        const main = scanRev.filter(r => r.name === mainName);
        const others = scanRev.filter(r => r.name !== mainName);
        if (main.length) setOpText(main.map(r => r.text).join('\n'));
        const merged = new Map<string, string>();
        others.forEach(r => merged.set(r.name, merged.has(r.name) ? merged.get(r.name) + '\n' + r.text : r.text));
        if (others.length) setOpExtraAll({ ...opExtraAll, [opDate]: Array.from(merged, ([name, text]) => ({ name, text })) });
        setScanRev(null); setScanRaw('');
    };
    const makeOpCard = async () => {
        if (!ready || !opTotal || opMissingName) return;
        if (opParts.length) setOpLists({ ...opLists, [opDay]: opParts });
        setOpShareNote('');
        try { setOpCardUrl(await opListImageURL({ day: opDay, date: opDate, groups: opGroups, total: opTotal })); }
        catch { setOpCardUrl(null); }
    };
    const shareOpCard = async () => {
        if (!opCardUrl) return;
        setOpShareNote('');
        try {
            const blob = await (await fetch(opCardUrl)).blob();
            const file = new File([blob], 'lista-amaliyat.png', { type: 'image/png' });
            const nav: any = navigator;
            if (nav.canShare && nav.canShare({ files: [file] })) {
                await nav.share({ files: [file], title: `ليسته المناظير يوم ${opDay}` });
                return;
            }
        } catch { /* share not available or canceled */ }
        setOpShareNote('المشاركة المباشرة مش متاحة من هنا — اضغط مطولًا على الصورة لحفظها وابعتها من واتساب عندك.');
    };

    const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(todayISO(), i)), []);
    // Weekly badge: total booked cases across the 7-day window (named booking = 1, count entry = its count).
    const weekTotal = bookings.filter(b => days.includes(b.day)).reduce((a, b) => a + (b.count ?? 1), 0);
    const dayBookings = bookings.filter(b => b.day === selDay);
    const dayDoctors = Array.from(new Set(dayBookings.map(b => b.doctorName)));
    // Booked-days summary: every date that has any booking, upcoming first (nearest on top), then past (newest first).
    const bookedDays = useMemo(() => {
        const t = todayISO();
        const uniq = Array.from(new Set(bookings.map(b => b.day)));
        const cnt = (d: string) => bookings.filter(b => b.day === d).reduce((a, b) => a + (b.count ?? 1), 0);
        const up = uniq.filter(d => d >= t).sort();
        const past = uniq.filter(d => d < t).sort().reverse();
        return [...up, ...past].map(d => ({ day: d, count: cnt(d) }));
    }, [bookings]);
    const openBookedDay = (d: string) => {
        setCardId(null);
        setSelDay(d);
        setTimeout(() => { const el = document.getElementById('bk-day-section'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
    };
    // Worklist photos stay in page state only: local-state limits (16 KiB/value) cannot hold an image.
    const [dayPhotos, setDayPhotos] = useState<Record<string, string>>({});
    const dayPhoto = dayPhotos[selDay] || null;
    const pickDayPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        try {
            const bmp = await createImageBitmap(f);
            const s = Math.min(1, 1000 / bmp.width);
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(bmp.width * s));
            c.height = Math.max(1, Math.round(bmp.height * s));
            const x = c.getContext('2d');
            if (!x) return;
            x.drawImage(bmp, 0, 0, c.width, c.height);
            setDayPhotos({ ...dayPhotos, [selDay]: c.toDataURL('image/jpeg', 0.75) });
        } catch { /* unsupported image */ }
    };
    const selDoctor = doctors.find(d => d.id === selDoc) || null;
    const docBookings = selDoctor ? bookings.filter(b => b.doctorId === selDoctor.id) : [];
    const cardBooking = bookings.find(b => b.id === cardId) || null;
    const [cardUrl, setCardUrl] = useState<string | null>(null);
    const [delId, setDelId] = useState<string | null>(null);
    const [shareNote, setShareNote] = useState('');
    const shareCard = async () => {
        if (!cardBooking || !cardUrl) return;
        setShareNote('');
        try {
            const blob = await (await fetch(cardUrl)).blob();
            const file = new File([blob], 'ta2kid.png', { type: 'image/png' });
            const nav: any = navigator;
            if (nav.canShare && nav.canShare({ files: [file] })) {
                await nav.share({ files: [file], title: 'تأكيد موعد منظار' });
                return;
            }
        } catch { /* share not available or canceled */ }
        setShareNote('المشاركة المباشرة مش متاحة من هنا — اضغط مطولًا على الصورة لحفظها وابعتها للدكتور من واتساب عندك.');
    };
    useEffect(() => {
        let live = true;
        setCardUrl(null);
        if (cardBooking && cardBooking.status === 'confirmed' && (cardBooking.time || (cardBooking.count && !cardBooking.patient))) {
            cardImageURL(cardBooking).then(u => { if (live) setCardUrl(u); }).catch(() => { if (live) setCardUrl(null); });
        }
        return () => { live = false; };
    }, [cardBooking]);

    const addCountOnly = () => {
        if (!selDoctor || !totalCount) return;
        const parts = countParts;
        const nb: Booking = { id: 'b' + Date.now(), doctorId: selDoctor.id, doctorName: selDoctor.name, patient: '', proc: parts.map(p => p.proc).join('، '), day: fDay, time: '', status: 'confirmed', count: Math.min(999, totalCount), parts };
        setBookings([...bookings, nb]);
        setFCountText(''); setCardId(nb.id); setSelDay(fDay);
    };
    const addDoctor = () => {
        if (!ready || !newDoc.trim()) return;
        setDoctors([...doctors, { id: 'd' + Date.now(), name: newDoc.trim().startsWith('د.') ? newDoc.trim() : 'د. ' + newDoc.trim() }]);
        setNewDoc('');
    };
    const delDoctor = (id: string) => { if (ready) { setDoctors(doctors.filter(d => d.id !== id)); setSelDoc(null); } };
    const addBooking = () => {
        if (!ready || !selDoctor || !fPatient.trim()) return;
        const nb: Booking = { id: 'b' + Date.now(), doctorId: selDoctor.id, doctorName: selDoctor.name, patient: fPatient.trim(), proc: fProc, day: fDay, time: fTime, status: 'confirmed', sex: fSex, age: fAge.trim() };
        setBookings([...bookings, nb]);
        setFPatient(''); setFAge(''); setCardId(nb.id); setSelDay(fDay);
    };
    const delBooking = (id: string) => { if (ready) setBookings(bookings.filter(b => b.id !== id)); };
    const confirmBooking = (id: string) => { if (ready && cTime) { setBookings(bookings.map(b => b.id === id ? { ...b, status: 'confirmed', time: cTime } : b)); setConfirmId(null); } };

    if (screen === 'login') {
        return <div className="bk-app bk-login" lang="ar" dir="rtl">
            <img className="bk-hosp" src={hospital} alt="مستشفى العربي" />
            <h1 className="bk-login-hero"><span className="bk-hero-main" dir="ltr">Endoscopy</span><span className="bk-hero-sub">حجز حالات المناظير وتأكيد المواعيد</span></h1>
            <div className="bk-card">
                <div className="bk-row">
                    <div className="bk-badge"><Ico d={I.cal} /></div>
                    <div><h2 className="bk-h2">{dayLong(todayISO())}</h2><p className="bk-muted">وحدة المناظير · مستشفى العربي</p></div>
                </div>
                <button type="button" className="bk-btn bk-btn-go" onClick={() => setScreen('main')}>دخول</button>
            </div>
            <p className="bk-login-note">نسخة تجريبية للتصميم: الدخول شكلي بدون حسابات حقيقية، والبيانات المعروضة وهمية للتجربة.</p>
            <footer className="bk-credit" dir="ltr"><img src={logo} alt="" /><div className="bk-credit-text"><span className="bk-credit-label">Designed by</span><strong>Mr. Mohamed Taha</strong></div><span className="bk-credit-org">H.N. Endoscopy</span></footer>
        </div>;
    }

    return <div className="bk-app" lang="ar" dir="rtl">
        <div className="bk-topbar">
            <button type="button" className="bk-home" onClick={() => { setScreen('login'); setTab('doctors'); setSelDoc(null); setCardId(null); }}><Ico d={I.back} size={18} />الرئيسية</button>
            {saveMessage ? <p className={saveFailed ? 'bk-hint' : 'bk-saveok'} role="status">{saveFailed ? <><strong>تنبيه حفظ:</strong> {saveMessage}</> : <>محفوظ على جهازك</>}</p> : null}
        </div>
        <div className="bk-banner"><div className="bk-banner-text" dir="ltr">Endoscopy Booking</div></div>
        <div className="bk-tabs" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <button type="button" className={'bk-tab' + (tab === 'doctors' ? ' on' : '')} onClick={() => { setTab('doctors'); setCardId(null); }}><Ico d={I.doc} />الأطباء</button>
            <button type="button" className={'bk-tab' + (tab === 'cases' ? ' on' : '')} onClick={() => { setTab('cases'); setCardId(null); setSelDoc(null); setOpCardUrl(null); }}><Ico d={I.cal} /><span className="bk-tab-label">الحجوزات{weekTotal > 0 && <span className="bk-weekbadge" title="عدد الحالات المحجوزة خلال الأسبوع">{arDigits(weekTotal)}</span>}</span></button>
            <button type="button" className={'bk-tab' + (tab === 'oplist' ? ' on' : '')} onClick={() => { setTab('oplist'); setCardId(null); setSelDoc(null); }}><Ico d={I.scope} />ليسته المناظير</button>
        </div>

        {tab === 'doctors' && !selDoctor && <div className="bk-card">
            <h2 className="bk-h2">الأطباء</h2>
            <p className="bk-muted">ادخل على الدكتور لتسجيل حالة وتحديد اليوم والوقت</p>
            <div className="bk-docs">{doctors.map(d => <button key={d.id} type="button" className="bk-doc" onClick={() => setSelDoc(d.id)}><div className="bk-badge"><Ico d={I.doc} /></div>{d.name}{d.day ? <span className="bk-count-sm">({d.day})</span> : null}</button>)}</div>
            <label className="bk-field"><span>إضافة دكتور</span><input type="text" value={newDoc} placeholder="اسم الدكتور" onChange={e => setNewDoc(e.target.value)} /></label>
            <button type="button" className="bk-btn" disabled={!newDoc.trim()} onClick={addDoctor}><Ico d={I.plus} size={20} />إضافة</button>
        </div>}

        {tab === 'doctors' && selDoctor && !cardBooking && <>
            <div className="bk-card">
                <div className="bk-row">
                    <div className="bk-badge"><Ico d={I.doc} /></div>
                    <div style={{ flex: 1 }}><h2 className="bk-h2">{selDoctor.name}</h2><p className="bk-muted">تسجيل حالة جديدة</p></div>
                </div>
                <label className="bk-field"><span>اسم المريض</span><input type="text" value={fPatient} placeholder="اسم وهمي للتجربة" onChange={e => setFPatient(e.target.value)} /></label>
                <div className="bk-field"><span>النوع</span>
                    <div className="bk-chips">{['ذكر', 'أنثى'].map(s => <button key={s} type="button" className={'bk-chip' + (s === fSex ? ' on' : '')} onClick={() => setFSex(s)}>{s}</button>)}</div>
                </div>
                <label className="bk-field"><span>السن</span><input type="text" inputMode="numeric" value={fAge} placeholder="مثال: 45" onChange={e => setFAge(e.target.value)} /></label>
                <div className="bk-field"><span>نوع المنظار</span>
                    <div className="bk-chips">{PROCS.map(p => <button key={p} type="button" className={'bk-chip' + (p === fProc ? ' on' : '')} onClick={() => setFProc(p)}>{p}</button>)}</div>
                </div>
                <div className="bk-field"><span>اليوم</span>
                    <div className="bk-days">{days.map(d => <button key={d} type="button" className={'bk-day' + (d === fDay ? ' on' : '')} onClick={() => setFDay(d)}>{dayName(d)}<small><bdi dir="ltr">{dm(d)}</bdi></small></button>)}</div>
                    <label className="bk-field bk-far"><span>أو اختار تاريخ بعيد (حجز مسبق){!days.includes(fDay) && <b> — المختار: {dayName(fDay)} <bdi dir="ltr">{fDay.split('-').reverse().join('/')}</bdi></b>}</span><input type="date" value={fDay} min={todayISO()} onChange={e => { if (e.target.value) setFDay(e.target.value); }} /></label>
                </div>
                <div className="bk-field"><span>الساعة</span>
                    <div className="bk-chips">{TIMES.map(t => <button key={t} type="button" className={'bk-chip' + (t === fTime ? ' on' : '')} onClick={() => setFTime(t)}><bdi dir="ltr">{fmtTime(t)}</bdi></button>)}</div>
                </div>
                <button type="button" className="bk-btn bk-btn-go" disabled={!fPatient.trim()} onClick={addBooking}><Ico d={I.check} size={20} />تسجيل الحجز وإنشاء صورة التأكيد</button>
                <div className="bk-quick">
                    <span className="bk-muted">أو سجّل العدد بس من غير أسماء المرضى — اكتب كل تصنيف وعدده في سطر</span>
                    <textarea className="bk-quick-text" rows={3} dir="rtl" placeholder={'مثال:\n1 معده\n1 قولون'} value={fCountText} onChange={e => setFCountText(e.target.value)} />
                    <div className="bk-quick-row">
                        <button type="button" className="bk-btn" disabled={!totalCount} onClick={addCountOnly}><Ico d={I.plus} size={18} />تسجيل العدد{totalCount ? ` (الإجمالي ${totalCount})` : ''}</button>
                    </div>
                </div>
                <button type="button" className="bk-btn bk-btn-light" onClick={() => setSelDoc(null)}>رجوع للأطباء</button>
                <div style={{ marginTop: 10, textAlign: 'start' }}><button type="button" className="bk-mini del" onClick={() => delDoctor(selDoctor.id)}>مسح الدكتور</button></div>
            </div>
            {docBookings.length > 0 && <div className="bk-card">
                <h2 className="bk-h2">حجوزات {selDoctor.name}</h2>
                {docBookings.map(b => b.count && !b.patient ? <div key={b.id} className="bk-docrow">
                    <div style={{ flex: 1 }}><strong>بدون أسماء: <bdi dir="ltr">{b.count}</bdi> {b.count === 1 ? 'حالة' : 'حالات'}</strong><p className="bk-muted" style={{ margin: 0 }}>{b.parts ? b.parts.map(p => `${p.count} ${p.proc}`).join(' · ') + ' · ' : (b.proc ? b.proc + ' · ' : '')}{dayName(b.day)} <bdi dir="ltr">{dm(b.day)}</bdi></p></div>
                    <div className="bk-row-actions">
                        <button type="button" className="bk-mini" onClick={() => setCardId(b.id)}>صورة التأكيد</button>
                        {delId === b.id
                            ? <button type="button" className="bk-mini del" onClick={() => { delBooking(b.id); setDelId(null); }}>تأكيد المسح؟</button>
                            : <button type="button" className="bk-mini" onClick={() => setDelId(b.id)}>مسح</button>}
                    </div>
                </div> : <div key={b.id} className="bk-docrow">
                    <div style={{ flex: 1 }}><strong>{b.patient}</strong><p className="bk-muted" style={{ margin: 0 }}>{b.proc} · {dayName(b.day)} <bdi dir="ltr">{dm(b.day)}</bdi> · {b.time ? <bdi dir="ltr">{fmtTime(b.time)}</bdi> : 'لم يحدد'}{b.status === 'pending' ? ' · بانتظار التأكيد' : ''}</p></div>
                    <div className="bk-row-actions">
                        {b.status === 'confirmed' && <button type="button" className="bk-mini" onClick={() => setCardId(b.id)}>صورة التأكيد</button>}
                        {delId === b.id
                            ? <button type="button" className="bk-mini del" onClick={() => { delBooking(b.id); setDelId(null); }}>تأكيد المسح؟</button>
                            : <button type="button" className="bk-mini" onClick={() => setDelId(b.id)}>مسح</button>}
                    </div>
                </div>)}
            </div>}
        </>}

        {tab === 'cases' && !cardBooking && <>
            {bookedDays.length > 0 && <div className="bk-card">
                <h2 className="bk-h2">الأيام اللي فيها حجز</h2>
                <p className="bk-muted">اضغط على اليوم لعرض حجوزاته على طول</p>
                {bookedDays.map(x => <button key={x.day} type="button" className={'bk-dayrow' + (x.day === selDay ? ' on' : '')} onClick={() => openBookedDay(x.day)}>
                    <span className="bk-dayrow-main">{dayName(x.day)}{x.day === todayISO() ? ' · اليوم' : ''} <bdi dir="ltr">{dm(x.day)}</bdi></span>
                    <span className="bk-pill ok"><bdi dir="ltr">{arDigits(x.count)}</bdi> {x.count === 1 ? 'حالة' : 'حالات'}</span>
                </button>)}
            </div>}
            <div className="bk-card">
                <h2 className="bk-h2">ليستة عمليات اليوم</h2>
                {dayPhoto
                    ? <>
                        <img className="bk-listimg" src={dayPhoto} alt="صورة ليستة العمليات" />
                        <button type="button" className="bk-mini del" onClick={() => { const n = { ...dayPhotos }; delete n[selDay]; setDayPhotos(n); }}>مسح الصورة</button>
                    </>
                    : <>
                        <p className="bk-muted">صوّر ورقة الليستة أو ارفقها هنا للرجوع لها أثناء الشغل. الصورة للمعاينة بس وبتتمسح لما تقفل الصفحة، ومش بتحوّل الأسماء لحجوزات.</p>
                        <label className="bk-btn bk-btn-light" style={{ cursor: 'pointer' }}><Ico d={I.plus} size={20} />أرفق صورة الليستة<input type="file" accept="image/*" style={{ display: 'none' }} onChange={pickDayPhoto} /></label>
                    </>}
            </div>
            <div className="bk-days" id="bk-day-section">
                {days.map(d => <button key={d} type="button" className={'bk-day' + (d === selDay ? ' on' : '')} onClick={() => setSelDay(d)}>{dayName(d)}<small><bdi dir="ltr">{dm(d)}</bdi></small></button>)}
            </div>
            <label className="bk-field"><span>الأرشيف: اختار أي تاريخ لعرض حالاته المسجّلة</span><input type="date" value={selDay} onChange={e => { if (e.target.value) setSelDay(e.target.value); }} /></label>
            {dayBookings.length > 0 && <p className="bk-count">عدد الحالات يوم {dayName(selDay)}: <bdi dir="ltr">{dayBookings.reduce((a, b) => a + (b.count || 1), 0)}</bdi></p>}
            {dayBookings.length === 0 && <div className="bk-card bk-empty"><Ico d={I.cal} size={32} />لا توجد حالات في هذا اليوم</div>}
            {dayDoctors.length > 1 && <p className="bk-hint"><strong>تنبيه:</strong> يوم {dayName(selDay)} فيه حالات لأكتر من استشاري ({dayDoctors.join('، ')}) — راجع وابعت رسالة التأكيد لكل دكتور بنفسك.</p>}
            {dayDoctors.map(doc => <div key={doc} className="bk-card">
                <h2 className="bk-h2"><Ico d={I.doc} size={20} /> {doc} <span className="bk-count-sm">(<bdi dir="ltr">{dayBookings.filter(b => b.doctorName === doc).reduce((a, b) => a + (b.count || 1), 0)}</bdi> {dayBookings.filter(b => b.doctorName === doc).reduce((a, b) => a + (b.count || 1), 0) === 1 ? 'حالة' : 'حالات'})</span></h2>
                {dayBookings.filter(b => b.doctorName === doc).map(b => b.count && !b.patient ? <div key={b.id} className="bk-case">
                    <div className="bk-case-head"><strong>بدون أسماء: <bdi dir="ltr">{b.count}</bdi> {b.count === 1 ? 'حالة' : 'حالات'}</strong><span className="bk-pill ok">مسجّل</span></div>
                    {(b.parts || b.proc) ? <div className="bk-case-meta"><span><Ico d={I.scope} />{b.parts ? b.parts.map(p => `${p.count} ${p.proc}`).join(' · ') : b.proc}</span></div> : null}
                    <div className="bk-two">
                        <button type="button" className="bk-btn bk-btn-light" onClick={() => delBooking(b.id)}>مسح</button>
                    </div>
                </div> : <div key={b.id} className="bk-case">
                    <div className="bk-case-head"><strong>{b.patient}</strong><span className={'bk-pill' + (b.status === 'confirmed' ? ' ok' : '')}>{b.status === 'confirmed' ? 'مؤكد' : 'بانتظار التأكيد'}</span></div>
                    <div className="bk-case-meta">
                        <span><Ico d={I.scope} />{b.proc}</span>
                        <span><Ico d={I.clock} />{b.time ? <bdi dir="ltr">{fmtTime(b.time)}</bdi> : 'لم يحدد'}</span>
                        {(b.sex || b.age) && <span>{[b.sex, b.age ? b.age + ' سنة' : ''].filter(Boolean).join(' · ')}</span>}
                    </div>
                    {b.status === 'pending' && confirmId === b.id && <div className="bk-field"><span>اختار الساعة</span>
                        <div className="bk-chips">{TIMES.map(t => <button key={t} type="button" className={'bk-chip' + (t === cTime ? ' on' : '')} onClick={() => setCTime(t)}><bdi dir="ltr">{fmtTime(t)}</bdi></button>)}</div>
                    </div>}
                    <div className="bk-two">
                        {b.status === 'confirmed'
                            ? <button type="button" className="bk-btn bk-btn-light" onClick={() => setCardId(b.id)}><Ico d={I.send} size={20} />صورة التأكيد</button>
                            : confirmId === b.id
                                ? <button type="button" className="bk-btn bk-btn-go" disabled={!cTime} onClick={() => confirmBooking(b.id)}><Ico d={I.check} size={20} />تأكيد وإنشاء الصورة</button>
                                : <button type="button" className="bk-btn" onClick={() => { setConfirmId(b.id); setCTime(b.time || ''); }}><Ico d={I.clock} size={20} />تحديد الموعد</button>}
                        <button type="button" className="bk-btn bk-btn-light" onClick={() => delBooking(b.id)}>مسح</button>
                    </div>
                </div>)}
            </div>)}
        </>}

        {tab === 'oplist' && !opCardUrl && <>
            <div className="bk-card">
                <h2 className="bk-h2">ليسته المناظير الأسبوعية</h2>
                <div className="bk-days">{OP_DAYS.map(w => { const dd = doctors.find(x => x.day === w); return <button key={w} type="button" className={'bk-day' + (w === opDay && opDate === nextWeekday(w) ? ' on' : '')} onClick={() => setOpDate(nextWeekday(w))}>{w}<small>{dd ? dd.name.replace(/^د\.\s*/, '') : '—'}</small></button>; })}</div>
                <label className="bk-field"><span>تاريخ اللستة</span><input type="date" value={opDate} onChange={e => { if (e.target.value) setOpDate(e.target.value); }} /></label>
            </div>
            <div className="bk-card">
                <h2 className="bk-h2">تصوير الليستة</h2>
                <div className="bk-two">
                    <label className="bk-btn bk-btn-go" style={{ cursor: 'pointer' }}><Ico d={I.plus} size={20} />صوّر الليستة<input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onScanFile} /></label>
                    <label className="bk-btn bk-btn-light" style={{ cursor: 'pointer' }}>من المعرض<input type="file" accept="image/*" style={{ display: 'none' }} onChange={onScanFile} /></label>
                </div>
                {scanBusy ? <p className="bk-muted" role="status">بقرا الصورة على موبايلك… {Math.round(scanPct * 100)}%</p> : null}
                {scanErr ? <p className="bk-err">{scanErr}</p> : null}
                {scanRev ? <div className="bk-quick">
                    <strong>راجع قبل الاعتماد</strong>
                    <span className="bk-muted">القراءة الآلية ممكن تغلط، خصوصًا الخط اليدوي. عدّل أي سطر.</span>
                    {scanRev.map((r, i) => <div key={i} className="bk-field">
                        <input dir="rtl" value={r.name} placeholder="اسم الاستشاري" onChange={ev => setScanRev(scanRev.map((x, j) => j === i ? { ...x, name: ev.target.value } : x))} />
                        {!r.known ? <p className="bk-err">الاسم ده مش من الأطباء المسجلين — راجعه.</p> : null}
                        <textarea className="bk-quick-text" rows={Math.max(3, r.text.split('\n').length)} dir="rtl" value={r.text} onChange={ev => setScanRev(scanRev.map((x, j) => j === i ? { ...x, text: ev.target.value } : x))} />
                    </div>)}
                    <details><summary className="bk-muted">النص اللي اتقرا</summary><pre dir="rtl" style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{scanRaw}</pre></details>
                    <div className="bk-two">
                        <button type="button" className="bk-btn bk-btn-go" disabled={scanRev.some(r => !r.name.trim())} onClick={applyScan}><Ico d={I.check} size={20} />اعتمد ووزّع</button>
                        <button type="button" className="bk-btn bk-btn-light" onClick={() => { setScanRev(null); setScanRaw(''); }}>إلغاء</button>
                    </div>
                </div> : null}
            </div>
            <div className="bk-card">
                <div className="bk-row">
                    <div className="bk-badge"><Ico d={I.doc} /></div>
                    <div style={{ flex: 1 }}><h2 className="bk-h2">{opDoctor ? opDoctor.name : 'مفيش دكتور ثابت مسجّل لليوم ده'}</h2><p className="bk-muted">ليسته المناظير يوم {opDay}</p></div>
                </div>
                <div className="bk-quick">
                    <span className="bk-muted">اكتب كل تصنيف وعدده في سطر</span>
                    <textarea className="bk-quick-text" rows={4} dir="rtl" placeholder={'مثال:\n3 معده\n2 قولون\n1 ERCP'} value={opText} onChange={e => setOpText(e.target.value)} />
                </div>
            </div>
            {opExtras.map((e, i) => <div className="bk-card" key={i}>
                <div className="bk-row">
                    <div className="bk-badge"><Ico d={I.doc} /></div>
                    <div style={{ flex: 1 }}><h2 className="bk-h2">استشاري آخر{opExtras.length > 1 ? ` · ${i + 1}` : ''}</h2></div>
                    <button type="button" className="bk-btn bk-btn-light bk-del" onClick={() => setOpExtras(opExtras.filter((_, j) => j !== i))}>حذف</button>
                </div>
                <label className="bk-field"><span>اسم الاستشاري</span><input list="bk-op-docs" dir="rtl" value={e.name} placeholder="اختار من الأطباء أو اكتب الاسم" onChange={ev => setOpExtras(opExtras.map((x, j) => j === i ? { ...x, name: ev.target.value } : x))} /></label>
                {!e.name.trim() && parseParts(e.text).length > 0 ? <p className="bk-err">اكتب اسم الاستشاري الأول عشان تتعمل الصورة.</p> : null}
                <div className="bk-quick">
                    <span className="bk-muted">اكتب كل تصنيف وعدده في سطر</span>
                    <textarea className="bk-quick-text" rows={3} dir="rtl" placeholder={'مثال:\n2 معده\n1 قولون'} value={e.text} onChange={ev => setOpExtras(opExtras.map((x, j) => j === i ? { ...x, text: ev.target.value } : x))} />
                </div>
            </div>)}
            <datalist id="bk-op-docs">{doctors.map(d => <option key={d.id} value={d.name} />)}</datalist>
            <div className="bk-card">
                <button type="button" className="bk-btn bk-btn-light" onClick={() => setOpExtras([...opExtras, { name: '', text: '' }])}>+ إضافة استشاري آخر</button>
                <button type="button" className="bk-btn bk-btn-go" disabled={!opTotal || opMissingName} onClick={makeOpCard}><Ico d={I.check} size={20} />حفظ وإنشاء صورة اللستة{opTotal ? ` (الإجمالي ${opTotal})` : ''}</button>
            </div>
        </>}

        {tab === 'oplist' && opCardUrl && <>
            <img className="bk-cardimg" src={opCardUrl} alt={`صورة ليسته المناظير يوم ${opDay}`} />
            <p className="bk-hint">الصورة جاهزة: اضغط عليها مطولًا لحفظها أو خذ لقطة شاشة لها، وابعتها من واتساب عندك.</p>
            <div className="bk-two">
                <button type="button" className="bk-btn bk-btn-go" onClick={shareOpCard}><Ico d={I.send} size={20} />مشاركة على واتساب</button>
                <button type="button" className="bk-btn bk-btn-light" onClick={() => setOpCardUrl(null)}>تم</button>
            </div>
            {opShareNote ? <p className="bk-hint">{opShareNote}</p> : null}
        </>}

        {cardBooking && <>
            {cardUrl
                ? <img className="bk-cardimg" src={cardUrl} alt="صورة تأكيد الموعد" />
                : cardBooking.count && !cardBooking.patient ? <div className="bk-ticket" dir="rtl">
                    <img src={hospital} alt="مستشفى العربي" />
                    <div className="bk-ticket-body">
                        <div className="bk-ticket-title"><div className="bk-badge"><Ico d={I.check} /></div><strong>تأكيد عدد حالات المناظير</strong></div>
                        <div className="bk-tline"><span>الدكتور</span><strong>{cardBooking.doctorName}</strong></div>
                        <div className="bk-tline"><span>عدد الحالات</span><strong><bdi dir="ltr">{cardBooking.count}</bdi> {cardBooking.count === 1 ? 'حالة' : 'حالات'}</strong></div>
                        {cardBooking.parts ? cardBooking.parts.map(p => <div key={p.proc} className="bk-tline"><span>{p.proc}</span><strong><bdi dir="ltr">{p.count}</bdi> {p.count === 1 ? 'حالة' : 'حالات'}</strong></div>) : (cardBooking.proc ? <div className="bk-tline"><span>تصنيف الحالات</span><strong>{cardBooking.proc}</strong></div> : null)}
                        <div className="bk-tline"><span>اليوم</span><strong>{dayName(cardBooking.day)} <bdi dir="ltr">{cardBooking.day.slice(8)}/{cardBooking.day.slice(5, 7)}/{cardBooking.day.slice(0, 4)}</bdi></strong></div>
                        <div className="bk-tline" style={{ borderBottom: 0 }}><span>المكان</span><strong>وحدة المناظير · مستشفى العربي</strong></div>
                    </div>
                    <div className="bk-ticket-foot" dir="ltr"><strong>H.N.Endoscopy</strong>MR.Mohamed Taha</div>
                </div>
                : <div className="bk-ticket" dir="rtl">
                    <img src={hospital} alt="مستشفى العربي" />
                    <div className="bk-ticket-body">
                        <div className="bk-ticket-title"><div className="bk-badge"><Ico d={I.check} /></div><strong>تأكيد حجز موعد إجراء منظار</strong></div>
                        <div className="bk-tline"><span>المريض</span><strong>{cardBooking.patient}</strong></div>
                        <div className="bk-tline"><span>الدكتور</span><strong>{cardBooking.doctorName}</strong></div>
                        <div className="bk-tline"><span>نوع المنظار</span><strong>{cardBooking.proc}</strong></div>
                        <div className="bk-tline"><span>اليوم</span><strong>{dayName(cardBooking.day)} <bdi dir="ltr">{cardBooking.day.slice(8)}/{cardBooking.day.slice(5, 7)}/{cardBooking.day.slice(0, 4)}</bdi></strong></div>
                        <div className="bk-tline"><span>الساعة</span><strong><bdi dir="ltr">{fmtTime(cardBooking.time)}</bdi></strong></div>
                        <div className="bk-tline" style={{ borderBottom: 0 }}><span>المكان</span><strong>وحدة المناظير · مستشفى العربي</strong></div>
                    </div>
                    <div className="bk-ticket-foot" dir="ltr"><strong>H.N.Endoscopy</strong>MR.Mohamed Taha</div>
                </div>}
            <p className="bk-hint">الصورة جاهزة: اضغط عليها مطولًا لحفظها أو خذ لقطة شاشة لها، وابعتها للدكتور من واتساب عندك.</p>
            <div className="bk-two">
                <button type="button" className="bk-btn bk-btn-go" onClick={shareCard}><Ico d={I.send} size={20} />مشاركة على واتساب</button>
                <button type="button" className="bk-btn bk-btn-light" onClick={() => { setCardId(null); setTab('doctors'); setSelDoc(null); }}>الشاشة الرئيسية</button>
            </div>
            {shareNote ? <p className="bk-hint">{shareNote}</p> : null}
            <button type="button" className="bk-btn bk-btn-light" onClick={() => setCardId(null)}>تم</button>
        </>}

        <footer className="bk-credit" dir="ltr"><img src={logo} alt="" /><div className="bk-credit-text"><span className="bk-credit-label">Designed by</span><strong>Mr. Mohamed Taha</strong></div><span className="bk-credit-org">H.N. Endoscopy</span></footer>
    </div>;
}
