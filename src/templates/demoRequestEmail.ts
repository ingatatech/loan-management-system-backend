import { transporter } from '../utils/helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DemoRequestEmailData {
  institutionName: string;
  institutionType: string;
  portfolioSize?: string | null;
  fullName: string;
  jobTitle: string;
  email: string;
  phone: string;
  interests?: string[];
  submittedAt?: Date | string;
  requestId?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d?: Date | string | null): string => {
  if (!d) return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const dt = d instanceof Date ? d : new Date(d as string);
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const INTEREST_LABELS: Record<string, string> = {
  loan_management:     'Loan Management',
  credit_scoring:      'Credit Scoring',
  portfolio_analytics: 'Portfolio Analytics',
  compliance:          'Compliance & Reporting',
  collections:         'Collections Management',
  mobile_banking:      'Mobile Banking',
  api_integration:     'API Integration',
};

const labelInterest = (key: string): string =>
  INTEREST_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const PORTFOLIO_LABELS: Record<string, string> = {
  'under_1m':  'Under RWF 1M',
  '1m_10m':    'RWF 1M - 10M',
  '10m_50m':   'RWF 10M - 50M',
  '50m_100m':  'RWF 50M - 100M',
  'over_100m': 'Over RWF 100M',
};

const labelPortfolio = (key?: string | null): string =>
  key ? (PORTFOLIO_LABELS[key] ?? key.replace(/_/g, ' ')) : 'Not specified';

const institutionTypeLabel = (t: string): string =>
  t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// ─── Shared shell ─────────────────────────────────────────────────────────────

const shell = (content: string): string =>
`<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>LMS Notification</title>
</head>
<body style="margin:0;padding:0;background-color:#F0F4F8;
  font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;">
  <!--[if mso]><table role="presentation" width="100%"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:#F0F4F8;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
        style="width:100%;max-width:560px;">
        ${content}
      </table>
    </td></tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</body>
</html>`;

// ─── Shared: kv table row ─────────────────────────────────────────────────────

const kvRow = (label: string, value: string, shaded: boolean): string =>
  `<tr style="background:${shaded ? '#F8FAFC' : '#FFFFFF'};">
    <td style="padding:8px 14px;font-size:11px;font-weight:600;color:#64748B;
      width:36%;border-bottom:1px solid #F1F5F9;white-space:nowrap;vertical-align:top;">
      ${label}
    </td>
    <td style="padding:8px 14px;font-size:11px;font-weight:500;color:#1E293B;
      border-bottom:1px solid #F1F5F9;vertical-align:top;">
      ${value}
    </td>
  </tr>`;

// ─── Shared: interest tag strip ───────────────────────────────────────────────

const tagStrip = (interests: string[]): string => {
  if (!interests.length)
    return `<span style="font-size:11px;color:#94A3B8;font-style:italic;">None specified</span>`;
  return interests.map(i =>
    `<span style="display:inline-block;margin:2px 3px 2px 0;padding:3px 9px;
      background:#EBF2F9;color:#1B3A57;border-radius:3px;
      font-size:10px;font-weight:700;">${labelInterest(i)}</span>`
  ).join('');
};

// ─── Shared: section label ────────────────────────────────────────────────────

const secLabel = (text: string, topMargin = '20px'): string =>
  `<p style="margin:${topMargin} 0 8px;font-size:9px;font-weight:700;color:#94A3B8;
    text-transform:uppercase;letter-spacing:1px;">${text}</p>`;

// ═══════════════════════════════════════════════════════════════════════════════
//  EMAIL 1 — REQUESTER CONFIRMATION
// ═══════════════════════════════════════════════════════════════════════════════

const buildRequesterHtml = (d: DemoRequestEmailData): string => {
  const steps: Array<[string, string]> = [
    ['Within 24h', 'Our team reviews your request and prepares a tailored demo agenda'],
    ['Day 1 – 2',  'A specialist contacts you to confirm a convenient demo time'],
    ['Demo Day',   'Live walkthrough of features matched to your institution type'],
  ];

  const detailRows = [
    ['Institution',    d.institutionName],
    ['Type',           institutionTypeLabel(d.institutionType)],
    ['Portfolio Size', labelPortfolio(d.portfolioSize)],
    ['Your Name',      d.fullName],
    ['Job Title',      d.jobTitle],
    ['Email',          d.email],
    ['Phone',          d.phone],
  ];

  return shell(`

    <!-- HEADER CARD -->
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="background:#1B3A57;border-radius:8px 8px 0 0;">

        <!-- top row: icon + title -->
        <tr><td style="padding:22px 28px 18px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <!-- icon box -->
              <td valign="middle" style="padding-right:14px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr><td align="center" valign="middle"
                    style="width:40px;height:40px;background:rgba(255,255,255,0.10);
                      border-radius:6px;">
                    <span style="font-size:18px;line-height:1;">📋</span>
                  </td></tr>
                </table>
              </td>
              <!-- title -->
              <td valign="middle">
                <p style="margin:0;font-size:16px;font-weight:800;color:#FFFFFF;
                  letter-spacing:-0.3px;line-height:1.25;">Demo Request Confirmed</p>
                <p style="margin:4px 0 0;font-size:10px;color:#7FB3D3;">
                  Ingata ILBMS &nbsp;&middot;&nbsp; Ref #${d.requestId ?? 'NEW'}
                </p>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- success bar -->
        <tr><td style="background:#DCFCE7;border-top:1px solid #BBF7D0;padding:9px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-size:12px;font-weight:700;color:#166534;">
                &#10003; &nbsp;Your request has been received
              </td>
              <td align="right" style="font-size:10px;color:#64748B;white-space:nowrap;">
                ${fmtDate(d.submittedAt)}
              </td>
            </tr>
          </table>
        </td></tr>

      </table>
    </td></tr>

    <!-- BODY CARD -->
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="background:#FFFFFF;border:1px solid #E2E8F0;border-top:none;
          border-radius:0 0 8px 8px;">
        <tr><td style="padding:24px 28px 28px;">

          <!-- greeting -->
          <p style="margin:0 0 6px;font-size:13px;color:#334155;line-height:1;">
            Dear <strong style="color:#1B3A57;">${d.fullName}</strong>,
          </p>
          <p style="margin:0 0 22px;font-size:12px;color:#475569;line-height:1.65;">
            Thank you for requesting a demo of our Ingata ILBMS
. Our team
            has received your submission and will reach out within
            <strong>1&ndash;2 business days</strong> to schedule a personalized
            walkthrough tailored to <strong>${d.institutionName}</strong>'s needs.
          </p>

          <!-- Submission Summary -->
          ${secLabel('Submission Summary', '0')}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="border:1px solid #E2E8F0;border-radius:6px;overflow:hidden;">
            ${detailRows.map(([l, v], i) => kvRow(l, v, i % 2 === 1)).join('')}
            <!-- interests row (no bottom border) -->
            <tr style="background:#FFFFFF;">
              <td style="padding:10px 14px;font-size:11px;font-weight:600;color:#64748B;
                width:36%;vertical-align:top;white-space:nowrap;">Interests</td>
              <td style="padding:10px 14px;vertical-align:top;">
                ${tagStrip(d.interests ?? [])}
              </td>
            </tr>
          </table>

          <!-- What Happens Next -->
          ${secLabel('What Happens Next')}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="border:1px solid #E2E8F0;border-radius:6px;overflow:hidden;
              background:#F8FAFC;">
            ${steps.map(([step, desc], i) => `
              <tr>
                <td style="padding:11px 14px;vertical-align:middle;width:1%;
                  white-space:nowrap;
                  ${i < steps.length - 1 ? 'border-bottom:1px solid #E2E8F0;' : ''}">
                  <span style="display:inline-block;padding:3px 9px;background:#1B3A57;
                    color:#FFFFFF;border-radius:3px;font-size:9px;font-weight:700;
                    white-space:nowrap;">${step}</span>
                </td>
                <td style="padding:11px 14px;font-size:11px;color:#475569;
                  line-height:1.55;
                  ${i < steps.length - 1 ? 'border-bottom:1px solid #E2E8F0;' : ''}">
                  ${desc}
                </td>
              </tr>`).join('')}
          </table>

          <!-- note -->
          <p style="margin:20px 0 0;font-size:10px;color:#94A3B8;line-height:1.6;">
            If you have urgent questions, reply to this email or contact our team
            directly. Keep your reference
            <strong style="color:#1B3A57;">#${d.requestId ?? 'NEW'}</strong> handy.
          </p>

        </td></tr>

        <!-- footer -->
        <tr><td style="background:#1B3A57;border-radius:0 0 8px 8px;padding:10px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-size:9px;color:#4E7A9B;">
                Ingata ILBMS
 &nbsp;&middot;&nbsp; Automated Notification
                &nbsp;&middot;&nbsp; ${new Date().getFullYear()}
              </td>
              <td align="right" style="font-size:9px;color:#4E7A9B;white-space:nowrap;">
                Ref #${d.requestId ?? 'NEW'}
              </td>
            </tr>
          </table>
        </td></tr>

      </table>
    </td></tr>

  `);
};

// ═══════════════════════════════════════════════════════════════════════════════
//  EMAIL 2 — SYSTEM OWNER ALERT
// ═══════════════════════════════════════════════════════════════════════════════

const buildOwnerHtml = (d: DemoRequestEmailData): string => {
  const actions: string[] = [
    `Reply to <a href="mailto:${d.email}" style="color:#1B3A57;font-weight:700;text-decoration:none;">${d.email}</a> within 24 hours`,
    'Schedule a personalized demo based on their stated interest areas',
    `Note portfolio: <strong>${labelPortfolio(d.portfolioSize)}</strong> &mdash; prepare relevant use cases`,
    'Update the demo request status in the admin dashboard after contact',
  ];

  const instRows: Array<[string, string]> = [
    ['Type',      institutionTypeLabel(d.institutionType)],
    ['Portfolio', labelPortfolio(d.portfolioSize)],
  ];

  return shell(`

    <!-- HEADER CARD -->
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="background:#1B3A57;border-radius:8px 8px 0 0;">

        <!-- title row -->
        <tr><td style="padding:20px 28px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td valign="middle">
                <p style="margin:0;font-size:16px;font-weight:800;color:#FFFFFF;
                  letter-spacing:-0.2px;line-height:1.25;">
                  &#128276; &nbsp;New Demo Request
                </p>
                <p style="margin:4px 0 0;font-size:10px;color:#7FB3D3;">
                  Submitted ${fmtDate(d.submittedAt)}
                  &nbsp;&middot;&nbsp; Ref #${d.requestId ?? '&mdash;'}
                </p>
              </td>
              <td align="right" valign="middle">
                <span style="display:inline-block;padding:5px 13px;background:#F59E0B;
                  color:#1B3A57;border-radius:4px;font-size:10px;font-weight:800;
                  letter-spacing:0.3px;white-space:nowrap;">
                  ACTION REQUIRED
                </span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- amber alert bar -->
        <tr><td style="background:#FEF3C7;border-top:1px solid #FDE68A;padding:9px 28px;">
          <p style="margin:0;font-size:11px;font-weight:600;color:#92400E;">
            &#9889; &nbsp;A new prospect requested a product demo &mdash; follow up within 24 hours
          </p>
        </td></tr>

      </table>
    </td></tr>

    <!-- BODY CARD -->
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="background:#FFFFFF;border:1px solid #E2E8F0;border-top:none;
          border-radius:0 0 8px 8px;">
        <tr><td style="padding:24px 28px 28px;">

          <!-- Prospect Details label -->
          ${secLabel('Prospect Details', '0')}

          <!-- Side-by-side cards (table layout — email-safe) -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="margin-bottom:20px;">
            <tr>

              <!-- Contact card -->
              <td width="49%" valign="top" style="padding-right:8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                  border="0"
                  style="border:1px solid #E2E8F0;border-radius:6px;overflow:hidden;">

                  <!-- header -->
                  <tr><td style="background:#F8FAFC;border-bottom:1px solid #E2E8F0;
                    padding:7px 14px;">
                    <p style="margin:0;font-size:9px;font-weight:700;color:#64748B;
                      text-transform:uppercase;letter-spacing:0.8px;">Contact Person</p>
                  </td></tr>

                  <!-- body -->
                  <tr><td style="padding:13px 14px;">

                    <p style="margin:0 0 2px;font-size:14px;font-weight:800;color:#1B3A57;
                      line-height:1.25;">${d.fullName}</p>
                    <p style="margin:0 0 12px;font-size:11px;color:#64748B;">
                      ${d.jobTitle}
                    </p>

                    <!-- email -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                      style="margin-bottom:7px;">
                      <tr>
                        <td align="center" valign="middle"
                          style="width:20px;padding-right:7px;">
                          <span style="font-size:13px;line-height:1;">&#9993;</span>
                        </td>
                        <td valign="middle">
                          <a href="mailto:${d.email}"
                            style="font-size:11px;color:#1B3A57;font-weight:600;
                              text-decoration:none;">${d.email}</a>
                        </td>
                      </tr>
                    </table>

                    <!-- phone -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" valign="middle"
                          style="width:20px;padding-right:7px;">
                          <span style="font-size:13px;line-height:1;">&#128222;</span>
                        </td>
                        <td valign="middle">
                          <a href="tel:${d.phone}"
                            style="font-size:11px;color:#1B3A57;font-weight:600;
                              text-decoration:none;">${d.phone}</a>
                        </td>
                      </tr>
                    </table>

                  </td></tr>
                </table>
              </td>

              <!-- Institution card -->
              <td width="49%" valign="top" style="padding-left:8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                  border="0"
                  style="border:1px solid #E2E8F0;border-radius:6px;overflow:hidden;">

                  <!-- header -->
                  <tr><td style="background:#F8FAFC;border-bottom:1px solid #E2E8F0;
                    padding:7px 14px;">
                    <p style="margin:0;font-size:9px;font-weight:700;color:#64748B;
                      text-transform:uppercase;letter-spacing:0.8px;">Institution</p>
                  </td></tr>

                  <!-- body -->
                  <tr><td style="padding:13px 14px;">
                    <p style="margin:0 0 10px;font-size:14px;font-weight:800;color:#1B3A57;
                      line-height:1.25;">${d.institutionName}</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                      border="0">
                      ${instRows.map(([l, v], i) => `
                        <tr>
                          <td style="font-size:10px;color:#94A3B8;font-weight:600;
                            padding-right:10px;
                            padding-bottom:${i < instRows.length - 1 ? '7' : '0'}px;
                            vertical-align:top;white-space:nowrap;">${l}</td>
                          <td style="font-size:11px;color:#334155;font-weight:600;
                            padding-bottom:${i < instRows.length - 1 ? '7' : '0'}px;
                            vertical-align:top;">${v}</td>
                        </tr>`).join('')}
                    </table>
                  </td></tr>
                </table>
              </td>

            </tr>
          </table>

          <!-- Areas of Interest -->
          ${secLabel('Areas of Interest', '0')}
          <div style="padding:10px 14px;border:1px solid #E2E8F0;border-radius:6px;
            background:#F8FAFC;margin-bottom:20px;line-height:1;">
            ${tagStrip(d.interests ?? [])}
          </div>

          <!-- Follow-Up Actions -->
          ${secLabel('Suggested Follow-Up Actions', '0')}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="border:1px solid #E2E8F0;border-radius:6px;overflow:hidden;">
            ${actions.map((action, i) => `
              <tr style="background:${i % 2 === 1 ? '#F8FAFC' : '#FFFFFF'};">

                <!-- numbered circle -->
                <td align="center" valign="top"
                  style="padding:11px 0 11px 14px;width:32px;
                    ${i < actions.length - 1 ? 'border-bottom:1px solid #F1F5F9;' : ''}">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr><td align="center" valign="middle"
                      style="width:22px;height:22px;background:#1B3A57;border-radius:50%;">
                      <span style="font-size:10px;font-weight:800;color:#FFFFFF;
                        line-height:22px;display:block;">${i + 1}</span>
                    </td></tr>
                  </table>
                </td>

                <!-- text -->
                <td style="padding:11px 14px;font-size:11px;color:#475569;line-height:1.6;
                  ${i < actions.length - 1 ? 'border-bottom:1px solid #F1F5F9;' : ''}">
                  ${action}
                </td>
              </tr>`).join('')}
          </table>

          <!-- note -->
          <p style="margin:18px 0 0;font-size:10px;color:#94A3B8;line-height:1.6;">
            This notification was automatically generated.
            Manage all demo requests in your admin dashboard.
          </p>

        </td></tr>

        <!-- footer -->
        <tr><td style="background:#1B3A57;border-radius:0 0 8px 8px;padding:10px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-size:9px;color:#4E7A9B;">
                Ingata ILBMS
 &nbsp;&middot;&nbsp; System Owner Alert
                &nbsp;&middot;&nbsp; ${new Date().getFullYear()}
              </td>
              <td align="right" style="font-size:9px;color:#4E7A9B;white-space:nowrap;">
                Ref #${d.requestId ?? '&mdash;'}
              </td>
            </tr>
          </table>
        </td></tr>

      </table>
    </td></tr>

  `);
};

// ─── Send both emails ─────────────────────────────────────────────────────────

/**
 * Sends:
 * 1. A confirmation email to the demo requester
 * 2. A notification email to the system owner
 */
export const sendDemoRequestNotification = async (
  data: DemoRequestEmailData,
  systemOwnerEmail: string
): Promise<void> => {
  const from    = process.env.EMAIL_USER || 'noreply@lms.rw';
  const appName = process.env.APP_NAME  || 'Ingata ILBMS';

  await Promise.allSettled([

    // 1. Confirmation to the requester
    transporter.sendMail({
      from,
      to:      data.email,
      subject: `Demo Request Confirmed - Ref #${data.requestId ?? 'NEW'} | ${appName}`,
      html:    buildRequesterHtml(data),
    }).then(() => console.log(`[DemoRequest] Confirmation -> ${data.email}`))
      .catch((e: any) => console.error(`[DemoRequest] Confirmation failed: ${e?.message}`)),

    // 2. Alert to the system owner
    systemOwnerEmail
      ? transporter.sendMail({
          from,
          to:      systemOwnerEmail,
          subject: `New Demo Request from ${data.institutionName} - Ref #${data.requestId ?? 'NEW'}`,
          html:    buildOwnerHtml(data),
        }).then(() => console.log(`[DemoRequest] Owner alert -> ${systemOwnerEmail}`))
          .catch((e: any) => console.error(`[DemoRequest] Owner alert failed: ${e?.message}`))
      : Promise.resolve(),

  ]);
};