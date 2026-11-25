import hospitalLogo from './photos/logo.png';

type CardBooking = { patient: string; proc: string; doctorName: string; day: string; time: string; count?: number; parts?: { proc: string; count: number }[] };

const WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const dayName = (iso: string) => WD[new Date(iso + 'T12:00:00').getDay()];
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'صباحًا' : h === 12 ? 'ظهرًا' : 'مساءً'}`; };
const ltr = (s: string) => `‪${s}‬`;

const W = 1080, H = 1350;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number, family = 'Cairo') {
    let s = size;
    ctx.font = `${weight} ${s}px ${family}`;
    while (s > 20 && ctx.measureText(text).width > maxW) { s -= 2; ctx.font = `${weight} ${s}px ${family}`; }
    return s;
}

// Light line-art flexible endoscope: control head, snaking tube, lens tip.
function drawScope(ctx: CanvasRenderingContext2D, cx0: number, cy0: number, s: number, alpha: number) {
    ctx.save();
    ctx.translate(cx0, cy0);
    ctx.scale(s, s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // snaking tube (two soft bends)
    ctx.strokeStyle = `rgba(15, 90, 99, ${alpha})`;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(90, 10, 120, 90, 60, 150);
    ctx.bezierCurveTo(0, 210, -30, 270, 40, 330);
    ctx.bezierCurveTo(90, 372, 130, 390, 150, 430);
    ctx.stroke();
    // lens tip
    ctx.fillStyle = `rgba(15, 90, 99, ${alpha * 1.6})`;
    ctx.beginPath(); ctx.arc(152, 442, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, alpha * 4)})`;
    ctx.beginPath(); ctx.arc(158, 436, 6, 0, Math.PI * 2); ctx.fill();
    // control head
    ctx.strokeStyle = `rgba(15, 90, 99, ${alpha * 1.4})`;
    ctx.lineWidth = 12;
    roundRect(ctx, -46, -128, 92, 128, 34);
    ctx.stroke();
    ctx.fillStyle = `rgba(15, 90, 99, ${alpha * 1.2})`;
    ctx.beginPath(); ctx.arc(0, -92, 13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -56, 9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

export async function cardImageURL(b: CardBooking): Promise<string> {
    try { await Promise.all([document.fonts.load('700 40px Cairo'), document.fonts.load('700 64px Cairo'), document.fonts.ready]); } catch { /* fall back to system fonts */ }

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');

    // background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0f5a63'); bg.addColorStop(1, '#2a8a8c');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // white card
    const cx = 48, cy = 48, cw = W - 96, ch = H - 96;
    ctx.save();
    roundRect(ctx, cx, cy, cw, ch, 40);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.clip();

    // subtle endoscope watermark behind the body
    drawScope(ctx, cx + 150, cy + 560, 1.35, 0.08);

    // branded header band (Al Araby Hospital logo + bilingual unit name)
    const hh = 210;
    const hg = ctx.createLinearGradient(cx, cy, cx + cw, cy + hh);
    hg.addColorStop(0, '#0c4a52'); hg.addColorStop(1, '#187782');
    ctx.fillStyle = hg; ctx.fillRect(cx, cy, cw, hh);
    // small scope motif on the header, faint
    drawScope(ctx, cx + 120, cy + 168, 0.42, 0.20);
    const resp = await fetch(hospitalLogo);
    const img = await createImageBitmap(await resp.blob());
    const lh = 150, lw = Math.round(img.width * (lh / img.height));
    roundRect(ctx, cx + cw - lw - 42, cy + (hh - lh) / 2, lw, lh, 28);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.drawImage(img, cx + cw - lw - 42, cy + (hh - lh) / 2, lw, lh);
    ctx.textAlign = 'right'; ctx.direction = 'rtl';
    ctx.fillStyle = '#ffffff';
    fitFont(ctx, 'مستشفى العربي', 700, 64, cw - lw - 180);
    ctx.fillText('مستشفى العربي', cx + cw - lw - 84, cy + 84);
    ctx.fillStyle = '#bfe3e3';
    fitFont(ctx, 'Endoscopy Unit · قسم المناظير', 700, 36, cw - lw - 180, 'Cairo');
    ctx.fillText('Endoscopy Unit · قسم المناظير', cx + cw - lw - 84, cy + 140);

    // title inside a rounded accent frame + gold bar
    const isCount = !!(b.count && !b.patient);
    const title = isCount ? 'تأكيد حجز حالات المناظير' : 'تأكيد حجز موعد إجراء منظار';
    ctx.textAlign = 'center'; ctx.direction = 'rtl';
    const ts = fitFont(ctx, title, 700, 52, cw - 240);
    ctx.font = `700 ${ts}px Cairo`;
    const tw = ctx.measureText(title).width;
    const fw = tw + 96, tfh = 116, fx = W / 2 - fw / 2, tfy = cy + hh + 40;
    roundRect(ctx, fx, tfy, fw, tfh, 36);
    ctx.fillStyle = '#eef6f6'; ctx.fill();
    ctx.lineWidth = 3.5; ctx.strokeStyle = '#2a8a8c'; ctx.stroke();
    ctx.fillStyle = '#0f4a52';
    ctx.fillText(title, W / 2, tfy + 66);
    roundRect(ctx, W / 2 - 70, tfy + tfh - 26, 140, 7, 3.5);
    ctx.fillStyle = '#d9b23a'; ctx.fill();

    // rows
    const dayRow: [string, string] = ['اليوم', `${dayName(b.day)} ${ltr(`${b.day.slice(8)}/${b.day.slice(5, 7)}/${b.day.slice(0, 4)}`)}`];
    const rows: [string, string][] = isCount
        ? [
            ['اسم الطبيب', b.doctorName],
            ...(b.parts
                ? [
                    ...b.parts.map(p => [p.proc, `${p.count} ${p.count === 1 ? 'حالة' : 'حالات'}`] as [string, string]),
                    ['عدد الحالات الإجمالي', `${b.count} ${b.count === 1 ? 'حالة' : 'حالات'}`] as [string, string],
                ]
                : [
                    ['عدد الحالات', `${b.count} ${b.count === 1 ? 'حالة' : 'حالات'}`] as [string, string],
                    ...(b.proc ? [['تصنيف الحالات', b.proc] as [string, string]] : []),
                ]),
            dayRow,
        ]
        : [
            ['اسم المريض', b.patient],
            ['الإجراء', b.proc],
            ['اسم الطبيب', b.doctorName],
            dayRow,
            ['الساعة', ltr(fmtTime(b.time))],
        ];
    let y = cy + hh + 216;
    const rx = cx + cw - 64, lx = cx + 64, rowH = 96;
    ctx.lineWidth = 2; ctx.strokeStyle = '#d3e3e3'; ctx.setLineDash([8, 8]);
    rows.forEach(([label, value], i) => {
        ctx.textAlign = 'right'; ctx.direction = 'rtl';
        ctx.fillStyle = '#7c9496';
        ctx.font = '700 34px Cairo';
        ctx.fillText(label, rx, y + 42);
        ctx.textAlign = 'left'; ctx.direction = 'rtl';
        ctx.fillStyle = '#0f4a52';
        fitFont(ctx, value, 700, 44, rx - lx - 260);
        ctx.fillText(value, lx, y + 42);
        if (i < rows.length - 1) { ctx.beginPath(); ctx.moveTo(lx, y + rowH - 14); ctx.lineTo(rx, y + rowH - 14); ctx.stroke(); }
        y += rowH;
    });
    ctx.setLineDash([]);

    // footer band
    const fh = 150;
    const fy = cy + ch - fh;
    const fg = ctx.createLinearGradient(cx, fy, cx + cw, fy + fh);
    fg.addColorStop(0, '#0c4a52'); fg.addColorStop(1, '#187782');
    ctx.fillStyle = fg; ctx.fillRect(cx, fy, cw, fh);
    ctx.textAlign = 'center'; ctx.direction = 'ltr';
    ctx.fillStyle = '#ffe58a';
    ctx.font = '700 44px Cairo';
    ctx.fillText('H.N.Endoscopy', W / 2, fy + 62);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 40px Cairo';
    ctx.fillText('MR.Mohamed Taha', W / 2, fy + 116);
    ctx.restore();

    return canvas.toDataURL('image/png');
}

type OpGroup = { doctorName: string; parts: { proc: string; count: number }[]; total: number };
type OpListCard = { day: string; date: string; groups: OpGroup[]; total: number };

// Weekly operating-list card: petrol-green/gold theme matching the app brand, layout distinct from the booking card.
export async function opListImageURL(c: OpListCard): Promise<string> {
    try { await Promise.all([document.fonts.load('700 40px Cairo'), document.fonts.load('700 64px Cairo'), document.fonts.ready]); } catch { /* fall back to system fonts */ }

    const W2 = 1080;
    const multi = c.groups.length > 1;
    const rowH0 = 96;
    const need = 484 + c.groups.reduce((a, g) => a + 150 + 56 + 90 + g.parts.length * rowH0 + 16 + 56, 0) + 116 + 210 + 20;
    const H2 = Math.max(1620, need);
    const canvas = document.createElement('canvas');
    canvas.width = W2; canvas.height = H2;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');

    // navy background
    const bg = ctx.createLinearGradient(0, 0, W2, H2);
    bg.addColorStop(0, '#0f5a63'); bg.addColorStop(1, '#2a8a8c');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W2, H2);

    // faint endoscope line-art, bottom-left
    ctx.save();
    ctx.translate(-40, H2 - 700);
    ctx.scale(1.3, 1.3);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(90, 10, 120, 90, 60, 150);
    ctx.bezierCurveTo(0, 210, -30, 270, 40, 330);
    ctx.bezierCurveTo(90, 372, 130, 390, 150, 430);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath(); ctx.arc(152, 442, 20, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 12;
    roundRect(ctx, -46, -128, 92, 128, 34);
    ctx.stroke();
    ctx.restore();

    // header: logo + hospital/unit names
    const mx = 64;
    const resp = await fetch(hospitalLogo);
    const img = await createImageBitmap(await resp.blob());
    const lh = 132, lw = Math.round(img.width * (lh / img.height));
    roundRect(ctx, mx, 64, lw, lh, 24);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.drawImage(img, mx, 64, lw, lh);
    ctx.textAlign = 'right'; ctx.direction = 'rtl';
    ctx.fillStyle = '#ffffff';
    fitFont(ctx, 'مستشفى العربي', 700, 60, W2 - lw - 340);
    ctx.fillText('مستشفى العربي', W2 - mx, 122);
    ctx.fillStyle = '#bfe3e3';
    fitFont(ctx, 'Endoscopy Unit · قسم المناظير', 700, 34, W2 - lw - 340);
    ctx.fillText('Endoscopy Unit · قسم المناظير', W2 - mx, 172);

    // gold ribbon: title + date
    const title = `لستة عمليات يوم ${c.day}`;
    const dateLine = `الموافق ${ltr(`${c.date.slice(8)}/${c.date.slice(5, 7)}/${c.date.slice(0, 4)}`)}`;
    const ty = 252, th = 168;
    const tg = ctx.createLinearGradient(0, ty, W2, ty + th);
    tg.addColorStop(0, '#e7c34a'); tg.addColorStop(1, '#c9a227');
    ctx.fillStyle = tg; ctx.fillRect(0, ty, W2, th);
    ctx.textAlign = 'center'; ctx.direction = 'rtl';
    ctx.fillStyle = '#0f4a52';
    const ts2 = fitFont(ctx, title, 700, 66, W2 - 200);
    ctx.font = `700 ${ts2}px Cairo`;
    ctx.fillText(title, W2 / 2, ty + 84);
    ctx.fillStyle = '#0c4a52';
    ctx.font = '700 40px Cairo';
    ctx.fillText(dateLine, W2 / 2, ty + 138);

    const px = 72, pw = W2 - 144;
    let y = ty + th + 64;
    const footerTop = H2 - 210;
    const totalH = 116;
    const fitRow = Math.floor((footerTop - 56 - totalH - 56 - y - c.groups.reduce((a, g) => a + 150 + 56 + 90 + 16 + 56, 0)) / Math.max(1, c.groups.reduce((a, g) => a + g.parts.length, 0)));
    const rowH = Math.max(60, Math.min(104, fitRow));
    c.groups.forEach((g, gi) => {
        // doctor panel
        roundRect(ctx, px, y, pw, 150, 30);
        ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.fillStyle = gi === 0 ? '#2a8a8c' : '#c9a227';
        ctx.beginPath(); ctx.arc(px + 56, y + 75, 16, 0, Math.PI * 2); ctx.fill();
        ctx.textAlign = 'right'; ctx.direction = 'rtl';
        ctx.fillStyle = '#7c9496';
        ctx.font = '700 32px Cairo';
        ctx.fillText(!multi ? 'طبيب اليوم' : gi === 0 ? 'الاستشاري الأساسي' : 'استشاري معاه حالات', px + pw - 40, y + 58);
        ctx.fillStyle = '#0f4a52';
        fitFont(ctx, g.doctorName || '—', 700, 54, pw - 220);
        ctx.fillText(g.doctorName || '—', px + pw - 40, y + 118);
        y += 150 + 56;

        // classifications panel
        const ph = 90 + g.parts.length * rowH + 16;
        roundRect(ctx, px, y, pw, ph, 30);
        ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.textAlign = 'right'; ctx.direction = 'rtl';
        ctx.fillStyle = '#7c9496';
        ctx.font = '700 32px Cairo';
        ctx.fillText('الحالات وتصنيفها', px + pw - 40, y + 56);
        if (multi) {
            ctx.textAlign = 'left'; ctx.direction = 'rtl';
            ctx.fillStyle = '#187782';
            ctx.font = '700 34px Cairo';
            ctx.fillText(ltr(`${g.total} ${g.total === 1 ? 'حالة' : 'حالات'}`), px + 40, y + 56);
        }
        let ry = y + 84;
        g.parts.forEach((p, i) => {
            ctx.textAlign = 'right'; ctx.direction = 'rtl';
            ctx.fillStyle = '#0f4a52';
            fitFont(ctx, p.proc, 700, 46, pw - 280);
            ctx.fillText(p.proc, px + pw - 40, ry + rowH / 2 + 16);
            ctx.fillStyle = '#187782';
            ctx.beginPath(); ctx.arc(px + 78, ry + rowH / 2, Math.min(42, rowH / 2 - 8), 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center'; ctx.direction = 'ltr';
            ctx.font = '700 46px Cairo';
            ctx.fillText(String(p.count), px + 78, ry + rowH / 2 + 17);
            if (i < g.parts.length - 1) {
                ctx.strokeStyle = '#d3e3e3'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
                ctx.beginPath(); ctx.moveTo(px + 40, ry + rowH); ctx.lineTo(px + pw - 40, ry + rowH); ctx.stroke();
                ctx.setLineDash([]);
            }
            ry += rowH;
        });
        y += ph + 56;
    });

    // total band
    roundRect(ctx, px, y, pw, totalH, 28);
    ctx.fillStyle = '#0c4a52'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#c9a227'; ctx.stroke();
    ctx.textAlign = 'right'; ctx.direction = 'rtl';
    ctx.fillStyle = '#bfe3e3';
    ctx.font = '700 38px Cairo';
    ctx.fillText('إجمالي الحالات', px + pw - 40, y + 70);
    ctx.textAlign = 'left'; ctx.direction = 'rtl';
    ctx.fillStyle = '#e7c34a';
    ctx.font = '700 52px Cairo';
    ctx.fillText(ltr(`${c.total} ${c.total === 1 ? 'حالة' : 'حالات'}`), px + 40, y + 74);

    // footer signature
    ctx.textAlign = 'center'; ctx.direction = 'ltr';
    ctx.fillStyle = '#e7c34a';
    ctx.font = '700 42px Cairo';
    ctx.fillText('H.N.Endoscopy', W2 / 2, H2 - 128);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 38px Cairo';
    ctx.fillText('MR.Mohamed Taha', W2 / 2, H2 - 74);

    return canvas.toDataURL('image/png');
}
