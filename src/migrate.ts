export type LegacyBooking = { id: string; doctorId: string; doctorName?: string; patient: string; proc: string; day: string; time?: string; status?: string };
export type BookingV2 = { id: string; doctorId: string; doctorName: string; patient: string; proc: string; day: string; time: string; status: 'confirmed' | 'pending' };

export const SEED_DOC_NAMES: Record<string, string> = { d1: 'د.مصطفي الهلباوي', d2: 'د.محمد الملطاوي', d3: 'د. محمد عباسي' };

export function upgradeLegacy(legacy: LegacyBooking[], doctors: { id: string; name: string }[]): BookingV2[] {
    return (legacy || []).map(b => ({
        id: b.id,
        doctorId: b.doctorId,
        doctorName: b.doctorName ?? doctors.find(d => d.id === b.doctorId)?.name ?? SEED_DOC_NAMES[b.doctorId] ?? 'دكتور',
        patient: b.patient,
        proc: b.proc,
        day: b.day,
        time: b.time ?? '',
        status: b.status === 'pending' || !b.time ? 'pending' : 'confirmed',
    }));
}

export function mergeBookings(legacy: LegacyBooking[], doctors: { id: string; name: string }[], current: BookingV2[]): BookingV2[] {
    const upgraded = upgradeLegacy(legacy, doctors);
    const ids = new Set(upgraded.map(b => b.id));
    return [...upgraded, ...current.filter(b => !ids.has(b.id))];
}

export type DoctorRec = { id: string; name: string; day?: string };

// Canonical list supplied by Mohamed 2026-11-24 19:56 (exact spelling/order): weekday doctors Sat-Fri, then 3 without a fixed day.
export const CANON_DOCTORS: DoctorRec[] = [
    { id: 'd1', name: 'د.مصطفي الهلباوي', day: 'السبت' },
    { id: 'd2', name: 'د.محمد الملطاوي', day: 'الأحد' },
    { id: 'd3', name: 'د. محمد عباسي', day: 'الاثنين' },
    { id: 'd4', name: 'د.رضا عجلان', day: 'الثلاثاء' },
    { id: 'd5', name: 'د. احمد كمال', day: 'الأربعاء' },
    { id: 'd6', name: 'د.طلعت زكريا', day: 'الخميس' },
    { id: 'd7', name: 'د.محمد الحو', day: 'الجمعة' },
    { id: 'd8', name: 'د.احمد هلال' },
    { id: 'd9', name: 'د.سيد عمار' },
    { id: 'd10', name: 'د. حسام بسيوني' },
    { id: 'd11', name: 'د.احمد ادريس' },
];

const normDocName = (s: string) => (s || '').replace(/[\u064B-\u0652\u0640]/g, '').replace(/\s+/g, ' ').trim().replace(/^د\.?\s*/, '');

// One-time merge of the user's canonical list into stored doctors: keeps stored ids/names for matches
// (so bookings stay linked), applies canonical order and weekdays, appends any extra stored doctors.
export function mergeDoctors(stored: DoctorRec[], canonical: DoctorRec[] = CANON_DOCTORS): DoctorRec[] {
    const used = new Set<string>();
    const merged = canonical.map(c => {
        const hit = (stored || []).find(d => !used.has(d.id) && normDocName(d.name) === normDocName(c.name));
        if (hit) { used.add(hit.id); return { ...hit, day: c.day }; }
        return c;
    });
    const extras = (stored || []).filter(d => !used.has(d.id) && !merged.some(m => m.id === d.id || normDocName(m.name) === normDocName(d.name)));
    return [...merged, ...extras];
}
