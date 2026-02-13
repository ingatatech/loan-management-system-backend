

import { transporter } from '../utils/helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClientAccountInfo {
  id:                    number;
  accountNumber:         string;
  borrowerType:          string;
  borrowerNames:         string | null;
  nationalId:            string | null;
  profilePictureUrl:     string | null;
  institutionName:       string | null;
  tinNumber:             string | null;
  businessNumber:        string | null;
  profileRepresentative: string | null;
  createdAt:             Date | string;
  isActive:              boolean;
}

export interface PdfInvoiceData {
  receiptNumber:           string;
  transactionId:           string;
  paymentDate:             string | Date;
  amountPaid:              number;
  principalPaid:           number;
  interestPaid:            number;
  penaltyPaid:             number;
  paymentMethod:           string;
  receivedBy?:             string;
  approvedBy?:             string;
  repaymentProof?:         string;
  borrowerName:            string;
  borrowerEmail?:          string;
  borrowerId?:             string;
  clientAccountInfo?:      ClientAccountInfo | null;
  loanId:                  string;
  loanStatus:              string;
  disbursedAmount:         number;
  previousOutstanding:     number;
  newOutstanding:          number;
  paidInstallments:        number;
  totalInstallments:       number;
  installmentsOutstanding: number;
  paidInstallmentNumber?:  number;
  nextPaymentDueDate?:     string | null;
  nextInstallmentAmount?:  number;
  upcomingInstallmentNumber?: number;
  wasEarlyPayment?:        boolean;
  totalDelayedDays?:       number;
  organizationName?:       string;
  organizationEmail?:      string;
  organizationPhone?:      string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  'RWF ' + new Intl.NumberFormat('en-RW', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

const fmtDate = (d?: string | Date | null) => {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d as string);
  return isNaN(dt.getTime()) ? String(d).split('T')[0]
    : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const pmLabel = (m: string) =>
  ({ cash: 'Cash', bank_transfer: 'Bank Transfer', mobile_money: 'Mobile Money',
     check: 'Cheque', card: 'Card' }[m]
  ?? m.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));

const safeNum = (v: any) => { const n = parseFloat(String(v ?? 0)); return isNaN(n) ? 0 : n; };
const orgName  = (inv: PdfInvoiceData) => (inv.organizationName && inv.organizationName !== 'N/A') ? inv.organizationName : 'Loan Management System';

// ─── PDF conversion ───────────────────────────────────────────────────────────

const toPdfBuffer = async (html: string): Promise<Buffer | null> => {
  try {
    const p = require('html-pdf-node');
    return await p.generatePdf({ content: html }, {
      format: 'A4', printBackground: true,
      margin: { top: '12mm', right: '14mm', bottom: '12mm', left: '14mm' },
    });
  } catch { return null; }
};

// ─── Invoice HTML — clean, compact, no duplicate text ────────────────────────

const buildInvoiceHtml = (d: PdfInvoiceData): string => {
  const paid      = d.newOutstanding <= 0;
  const pct       = d.totalInstallments > 0 ? Math.min(100, Math.round(d.paidInstallments / d.totalInstallments * 100)) : 0;
  const timing    = d.wasEarlyPayment ? 'Early' : (d.totalDelayedDays ?? 0) > 0 ? `${d.totalDelayedDays}d Late` : 'On Time';
  const timingClr = (d.totalDelayedDays ?? 0) > 0 ? '#B45309' : '#166534';
  const timingBg  = (d.totalDelayedDays ?? 0) > 0 ? '#FEF3C7' : '#DCFCE7';
  const instNum   = d.paidInstallmentNumber ?? d.paidInstallments;
  const nextNum   = d.upcomingInstallmentNumber ?? (d.paidInstallments + 1);
  const org       = orgName(d);
  const acct      = d.clientAccountInfo;

  // Build a flat key-value grid — no repeated labels, no section bloat
  const infoRows = [
    ['Borrower',      d.borrowerName,        'Loan Ref',    d.loanId],
    ...(acct ? [
      ['Account No.', acct.accountNumber, acct.borrowerType === 'individual' ? 'NID' : 'TIN', acct.nationalId ?? acct.tinNumber ?? '—'],
    ] : []),
    ['Received By',   d.receivedBy || '—',   'Approved By', d.approvedBy || '—'],
    ['Payment Date',  fmtDate(d.paymentDate), 'Method',      pmLabel(d.paymentMethod)],
    ...(d.repaymentProof ? [['Reference', d.repaymentProof, '', '']] as any[] : []),
  ];

  const gridRows = infoRows.map(([la, va, lb, vb]: any) => `
    <tr>
      <td class="k">${la}</td><td class="v">${va}</td>
      <td class="k">${lb}</td><td class="v">${vb}</td>
    </tr>`).join('');

  const payRows = [
    ...(d.interestPaid  > 0 ? [`<tr><td>Interest</td><td class="r am" style="color:#92400E">${fmt(d.interestPaid)}</td></tr>`]  : []),
    ...(d.principalPaid > 0 ? [`<tr><td>Principal</td><td class="r am" style="color:#1B3A57">${fmt(d.principalPaid)}</td></tr>`] : []),
    ...(d.penaltyPaid   > 0 ? [`<tr><td>Penalty</td><td class="r am" style="color:#DC2626">${fmt(d.penaltyPaid)}</td></tr>`]     : []),
  ].join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;color:#1e293b;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.wrap{max-width:640px;margin:0 auto}

/* Header */
.hd{background:#1B3A57;padding:16px 20px;display:flex;justify-content:space-between;align-items:center}
.hd-left h1{font-size:15px;font-weight:800;color:#fff;letter-spacing:-.2px}
.hd-left p{font-size:8.5px;color:#94a3b8;margin-top:2px}
.hd-right{text-align:right}
.hd-right .rn{font-size:9px;font-weight:700;color:#fff;font-family:monospace}
.hd-right .rd{font-size:8px;color:#94a3b8;margin-top:2px}

/* Amount strip */
.strip{display:flex;align-items:center;justify-content:space-between;padding:10px 20px;border-bottom:1px solid #e2e8f0;background:${paid ? '#f0fdf4' : '#f8fafc'}}
.strip-left{display:flex;align-items:center;gap:10px}
.strip-amt{font-size:22px;font-weight:900;color:#1B3A57;line-height:1}
.strip-lbl{font-size:8px;color:#64748b;margin-top:2px}
.strip-right{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.tag{display:inline-block;padding:2px 8px;border-radius:2px;font-size:8px;font-weight:700}
.tag-ok{background:#DCFCE7;color:#166534}
.tag-late{background:#FEF3C7;color:#B45309}
.tag-paid{background:#1B3A57;color:#fff}

/* Info grid */
.grid-wrap{padding:12px 20px}
.section-label{font-size:7.5px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px;margin-top:10px}
.section-label:first-child{margin-top:0}
table.info{width:100%;border-collapse:collapse}
table.info td{padding:4px 6px;font-size:9px;vertical-align:top;border-bottom:1px solid #f1f5f9}
table.info td.k{color:#64748b;font-weight:600;width:15%;white-space:nowrap;padding-right:4px}
table.info td.v{color:#1e293b;font-weight:500;width:35%}

/* Payment breakdown */
.pay-wrap{padding:0 20px 0}
table.pay{width:100%;border-collapse:collapse;border:1px solid #e2e8f0}
table.pay th{background:#f8fafc;padding:5px 8px;font-size:8px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e2e8f0}
table.pay td{padding:5px 8px;font-size:9.5px;border-bottom:1px solid #f1f5f9}
table.pay td.r{text-align:right}
table.pay td.am{font-weight:700}
.tot-row td{background:#1B3A57!important;color:#fff!important;font-weight:800;font-size:10px;border:none!important}
.tot-row td.r{color:#f0c040!important;font-size:12px}

/* Balance row */
.bal{display:flex;border:1px solid #e2e8f0;margin:10px 20px 0}
.bal-cell{flex:1;padding:8px 12px;border-right:1px solid #e2e8f0}
.bal-cell:last-child{border-right:none;background:${paid ? '#f0fdf4' : '#f8fafc'}}
.bal-lbl{font-size:7.5px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px}
.bal-val{font-size:14px;font-weight:900;color:${paid ? '#166534' : '#1B3A57'}}

/* Progress */
.prog-wrap{padding:10px 20px 0}
.prog-nums{display:flex;gap:0;border:1px solid #e2e8f0;margin-bottom:6px}
.prog-cell{flex:1;text-align:center;padding:6px 4px;border-right:1px solid #e2e8f0}
.prog-cell:last-child{border-right:none}
.prog-n{font-size:18px;font-weight:900}
.prog-lbl{font-size:7.5px;color:#64748b;text-transform:uppercase;margin-top:1px}
.bar-bg{background:#e2e8f0;height:5px;border-radius:2px;overflow:hidden}
.bar-fill{background:#1B3A57;height:5px;border-radius:2px}
.bar-meta{display:flex;justify-content:space-between;margin-top:3px;font-size:8px;color:#94a3b8}

/* Next payment */
.next-wrap{padding:8px 20px 0}
.next{border:1px solid #cbd5e1;padding:8px 12px;background:#f8fafc;display:flex;justify-content:space-between;align-items:center}
.next-l{font-size:7.5px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:3px}
.next-v{font-size:11px;font-weight:800;color:#1B3A57}
.next-amt{font-size:14px;font-weight:900;color:#1B3A57}

/* Footer */
.foot{background:#1B3A57;padding:8px 20px;display:flex;justify-content:space-between;align-items:center;margin-top:12px}
.foot p{font-size:7.5px;color:#94a3b8}
.foot .tx{font-family:monospace;font-size:7.5px;color:#64748b}

/* Divider */
.dv{height:1px;background:#f1f5f9;margin:10px 20px}
</style>
</head><body>
<div class="wrap">

<!-- HEADER -->
<div class="hd">
  <div class="hd-left">
    <h1>${org}</h1>
    <p>Payment Receipt${d.organizationEmail ? ' · ' + d.organizationEmail : ''}${d.organizationPhone ? ' · ' + d.organizationPhone : ''}</p>
  </div>
  <div class="hd-right">
    <div class="rn">${d.receiptNumber}</div>
    <div class="rd">${fmtDate(d.paymentDate)}</div>
  </div>
</div>

<!-- AMOUNT STRIP -->
<div class="strip">
  <div class="strip-left">
    <div>
      <div class="strip-amt">${fmt(d.amountPaid)}</div>
    </div>
  </div>
  <div class="strip-right">
    <span class="tag ${(d.totalDelayedDays ?? 0) > 0 ? 'tag-late' : 'tag-ok'}">${timing}</span>
    <span class="tag" style="background:#e0e7ef;color:#1B3A57">Installment ${instNum} / ${d.totalInstallments}</span>
    ${paid ? '<span class="tag tag-paid">Fully Repaid</span>' : ''}
  </div>
</div>

<!-- INFO GRID -->
<div class="grid-wrap">
  <table class="info">
    ${gridRows}
  </table>
</div>

<div class="dv"></div>

<!-- PAYMENT BREAKDOWN -->
<div class="pay-wrap">
  <table class="pay">
    <thead><tr><th>Breakdown</th><th class="r">Amount (RWF)</th></tr></thead>
    <tbody>
      ${payRows}
      <tr class="tot-row"><td>Total Paid</td><td class="r">${fmt(d.amountPaid)}</td></tr>
    </tbody>
  </table>
</div>

<!-- BALANCE -->
<div class="bal">
  <div class="bal-cell">
    <div class="bal-lbl">Previous Balance</div>
    <div class="bal-val" style="color:#64748b">${fmt(d.previousOutstanding)}</div>
  </div>
  <div class="bal-cell">
    <div class="bal-lbl">New Balance</div>
    <div class="bal-val">${fmt(paid ? 0 : d.newOutstanding)}</div>
  </div>
  <div class="bal-cell" style="border-right:1px solid #e2e8f0;flex:0.6">
    <div class="bal-lbl">Disbursed</div>
    <div style="font-size:10px;font-weight:700;color:#94a3b8">${fmt(d.disbursedAmount)}</div>
  </div>
</div>

<!-- PROGRESS -->
<div class="prog-wrap">
  <div class="prog-nums">
    <div class="prog-cell">
      <div class="prog-n" style="color:#166534">${d.paidInstallments}</div>
      <div class="prog-lbl">Paid</div>
    </div>
    <div class="prog-cell">
      <div class="prog-n" style="color:#64748b">${d.installmentsOutstanding}</div>
      <div class="prog-lbl">Remaining</div>
    </div>
    <div class="prog-cell">
      <div class="prog-n" style="color:#1B3A57">${d.totalInstallments}</div>
      <div class="prog-lbl">Total</div>
    </div>
    <div class="prog-cell" style="flex:2;text-align:left;padding:6px 10px">
      <div class="bar-bg"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="bar-meta"><span>${pct}% complete</span><span>${d.installmentsOutstanding} left</span></div>
    </div>
  </div>
</div>

${!paid && d.nextPaymentDueDate ? `
<div class="next-wrap">
  <div class="next">
    <div>
      <div class="next-l">Next Payment — Installment ${nextNum}</div>
      <div class="next-v">${fmtDate(d.nextPaymentDueDate)}</div>
    </div>
    ${d.nextInstallmentAmount ? `<div class="next-amt">${fmt(d.nextInstallmentAmount)}</div>` : ''}
  </div>
</div>` : ''}

${paid ? `
<div style="margin:10px 20px 0;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;text-align:center">
  <span style="font-size:10px;font-weight:700;color:#166534">✓ Loan fully repaid — Thank you!</span>
</div>` : ''}

<!-- FOOTER -->
<div class="foot">
  <p>${org} · Official Receipt · ${fmtDate(new Date())}</p>
  <span class="tx">${d.transactionId}</span>
</div>

</div></body></html>`;
};

// ─── Send email ───────────────────────────────────────────────────────────────

export const sendPaymentInvoicePdf = async (toEmail: string, inv: PdfInvoiceData): Promise<void> => {
  if (!toEmail || !inv) return;
  try {
    const html   = buildInvoiceHtml(inv);
    const pdf    = await toPdfBuffer(html);
    const paid   = inv.newOutstanding <= 0;
    const org    = orgName(inv);
    const subject = paid
      ? `Loan Fully Repaid – ${inv.receiptNumber} | ${org}`
      : `Payment Receipt ${inv.receiptNumber} | ${org}`;

    const mail: any = {
      from:    process.env.EMAIL_USER || 'noreply@lms.rw',
      to:      toEmail,
      subject,
      html:    buildEmailBody(inv),
    };
    if (pdf) {
      mail.attachments = [{ filename: `${inv.receiptNumber}.pdf`, content: pdf, contentType: 'application/pdf' }];
    } else {
      mail.html = html;
    }
    await transporter.sendMail(mail);
    console.log(`[Invoice] ${inv.receiptNumber} → ${toEmail} PDF:${!!pdf}`);
  } catch (e: any) {
    console.error(`[Invoice] failed: ${e?.message}`);
  }
};

// ─── Email body (short, points to PDF) ───────────────────────────────────────

const buildEmailBody = (d: PdfInvoiceData): string => {
  const paid = d.newOutstanding <= 0;
  const org  = orgName(d);
  const acct = d.clientAccountInfo;
  const rows: Array<[string, string]> = [
    ['Amount Paid',          fmt(d.amountPaid)],
    ['Installment',          `#${d.paidInstallmentNumber ?? d.paidInstallments} of ${d.totalInstallments}`],
    ['Principal Applied',    fmt(d.principalPaid)],
    ['Interest Applied',     fmt(d.interestPaid)],
    ...(d.penaltyPaid > 0 ? [['Penalty', fmt(d.penaltyPaid)] as [string,string]] : []),
    ['Previous Balance',     fmt(d.previousOutstanding)],
    ['New Balance',          fmt(paid ? 0 : d.newOutstanding)],
    ['Received By',          d.receivedBy || '—'],
    ['Approved By',          d.approvedBy || '—'],
    ...(acct ? [['Account', acct.accountNumber] as [string,string]] : []),
    ...(!paid && d.nextPaymentDueDate ? [['Next Due', fmtDate(d.nextPaymentDueDate)] as [string,string]] : []),
  ];
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:24px 0;background:#f1f5f9;font-family:Helvetica,Arial,sans-serif">
<table width="560" align="center" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:4px;overflow:hidden">
  <tr><td style="background:#1B3A57;padding:16px 20px">
    <div style="font-size:14px;font-weight:800;color:#fff">${org}</div>
    <div style="font-size:9px;color:#94a3b8;margin-top:2px">${d.receiptNumber}</div>
  </td></tr>
  <tr><td style="padding:16px 20px">
    <p style="font-size:12px;margin:0 0 12px">Dear <strong>${d.borrowerName}</strong>,</p>
    <p style="font-size:11px;color:#475569;margin:0 0 14px">
      ${paid ? 'Your loan has been <strong>fully repaid</strong>.' : `Payment of <strong>${fmt(d.amountPaid)}</strong> on ${fmtDate(d.paymentDate)} was recorded.`}
      Your receipt is attached as PDF.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      ${rows.map(([l,v],i)=>`<tr style="${i%2===0?'':'background:#f8fafc'}">
        <td style="padding:6px 8px;font-size:10px;color:#64748b;border-bottom:1px solid #f1f5f9">${l}</td>
        <td style="padding:6px 8px;font-size:10px;font-weight:700;color:#1e293b;text-align:right;border-bottom:1px solid #f1f5f9">${v}</td>
      </tr>`).join('')}
    </table>
  </td></tr>
  <tr><td style="background:#1B3A57;padding:8px 20px;text-align:center">
    <div style="font-size:8px;color:#64748b">${org} · ${new Date().getFullYear()} · Automated</div>
  </td></tr>
</table>
</body></html>`;
};

// ─── buildPdfInvoiceData ──────────────────────────────────────────────────────

export const buildPdfInvoiceData = (params: {
  savedTransaction:   any;
  loan:               any;
  allocationResult:   any;
  updatedMetrics:     any;
  loanStatusResult:   any;
  receipt:            any;
  clientAccountInfo?: ClientAccountInfo | null;
  nextSchedule?:      any;
}): PdfInvoiceData => {
  const { savedTransaction, loan, allocationResult, updatedMetrics, loanStatusResult, receipt, clientAccountInfo = null, nextSchedule } = params;
  const metrics   = updatedMetrics ?? {};
  const delayInfo = (allocationResult?.delayedDaysInfo as any[]) ?? [];
  const rawOrg    = loan?.organization?.name ?? receipt?.organizationName ?? '';

  const nextSched = nextSchedule
    ?? (loan?.repaymentSchedules as any[])?.filter((s:any)=>!s.isPaid)
       ?.sort((a:any,b:any)=>new Date(a.dueDate).getTime()-new Date(b.dueDate).getTime())?.[0]
    ?? null;

  return {
    receiptNumber:           receipt?.receiptNumber ?? `RCP-${savedTransaction.transactionId}`,
    transactionId:           savedTransaction.transactionId,
    paymentDate:             savedTransaction.paymentDate,
    amountPaid:              safeNum(savedTransaction.amountPaid),
    principalPaid:           safeNum(savedTransaction.principalPaid),
    interestPaid:            safeNum(savedTransaction.interestPaid),
    penaltyPaid:             safeNum(savedTransaction.penaltyPaid),
    paymentMethod:           savedTransaction.paymentMethod,
    receivedBy:              savedTransaction.receivedBy  || undefined,
    approvedBy:              savedTransaction.approvedBy  || undefined,
    repaymentProof:          savedTransaction.repaymentProof || undefined,
    borrowerName:            receipt?.borrowerName ?? loan?.borrower?.fullName ?? '—',
    borrowerEmail:           loan?.borrower?.email ?? undefined,
    borrowerId:              loan?.borrower?.borrowerId ?? undefined,
    clientAccountInfo:       clientAccountInfo ?? null,
    loanId:                  receipt?.loanId ?? loan?.loanId,
    loanStatus:              loanStatusResult?.newStatus ?? loan?.status ?? '',
    disbursedAmount:         safeNum(loan?.disbursedAmount),
    previousOutstanding:     safeNum(loanStatusResult?.previousOutstanding),
    newOutstanding:          Math.max(0, safeNum(loanStatusResult?.newOutstanding)),
    paidInstallments:        safeNum(metrics?.installmentsPaid),
    totalInstallments:       safeNum(metrics?.totalInstallments),
    installmentsOutstanding: safeNum(metrics?.installmentsOutstanding),
    paidInstallmentNumber:   delayInfo[0]?.installmentNumber ?? undefined,
    nextPaymentDueDate:      nextSched?.dueDate ?? null,
    nextInstallmentAmount:   nextSched?.dueTotal != null ? safeNum(nextSched.dueTotal) : undefined,
    upcomingInstallmentNumber: nextSched?.installmentNumber ?? undefined,
    wasEarlyPayment:         delayInfo.some((x:any) => x.wasEarlyPayment),
    totalDelayedDays:        delayInfo.reduce((s:number,x:any)=>s+safeNum(x.delayedDays),0),
    organizationName:        rawOrg && rawOrg !== 'N/A' ? rawOrg : undefined,
    organizationEmail:       loan?.organization?.email ?? undefined,
    organizationPhone:       loan?.organization?.phone ?? undefined,
  };
};