import { transporter } from '../utils/helpers';

const COLOR_PALETTE = {
  PRIMARY: '#1B3A57',  
  SECONDARY: '#FFD700',
  SUCCESS: '#28A745',
  WARNING: '#FFC107',
  DANGER: '#DC3545',
  INFO: '#17A2B8',
  NEUTRAL_DARK: '#2E2E2E',  
  NEUTRAL_LIGHT: '#F8F9FA',
  WHITE: '#FFFFFF'    
};

// Status color mapping for dynamic styling
const STATUS_COLORS: Record<string, string> = {
  'pending': COLOR_PALETTE.WARNING,
  'approved': COLOR_PALETTE.SUCCESS,
  'disbursed': COLOR_PALETTE.INFO,
  'performing': COLOR_PALETTE.SUCCESS,
  'watch': COLOR_PALETTE.WARNING,
  'substandard': COLOR_PALETTE.DANGER,
  'doubtful': COLOR_PALETTE.DANGER,
  'loss': COLOR_PALETTE.DANGER,
  'written_off': COLOR_PALETTE.NEUTRAL_DARK,
  'closed': COLOR_PALETTE.SUCCESS
};

// Status descriptions for better user understanding
const STATUS_DESCRIPTIONS: Record<string, string> = {
  'pending': 'Your loan application is currently under review by our team.',
  'approved': 'Congratulations! Your loan application has been approved.',
  'disbursed': 'Your loan has been successfully disbursed to your account.',
  'performing': 'Your loan is in good standing with payments on schedule.',
  'watch': 'Please ensure timely payments to maintain your loan in good standing.',
  'substandard': 'Your loan requires immediate attention due to missed payments.',
  'doubtful': 'Your loan is significantly overdue. Please contact us immediately.',
  'loss': 'Your loan is in default. Immediate action is required.',
  'written_off': 'Your loan has been written off. Please contact our recovery team.',
  'closed': 'Congratulations! Your loan has been successfully closed.'
};

// Action items for each status
const STATUS_ACTIONS: Record<string, string[]> = {
  'pending': [
    'We will notify you once the review is complete',
    'Ensure all required documents are submitted',
    'Contact our loan officer if you have questions'
  ],
  'approved': [
    'Complete any remaining documentation requirements',
    'Prepare for loan disbursement process',
    'Review loan terms and conditions carefully'
  ],
  'disbursed': [
    'Check your account for the disbursed amount',
    'Start preparing for your first payment',
    'Save our contact information for future reference'
  ],
  'performing': [
    'Continue making payments as scheduled',
    'Contact us if you anticipate any payment difficulties',
    'Consider early repayment options if possible'
  ],
  'watch': [
    'Make your overdue payment immediately',
    'Contact our loan officer to discuss payment options',
    'Set up payment reminders to avoid future delays'
  ],
  'substandard': [
    'Contact our loan recovery team immediately',
    'Arrange a payment plan to bring your account current',
    'Provide updated contact and employment information'
  ],
  'doubtful': [
    'Contact our loan recovery team urgently',
    'Prepare documentation of your current financial situation',
    'Consider loan restructuring options if eligible'
  ],
  'loss': [
    'Contact our legal department immediately',
    'Prepare for asset recovery proceedings',
    'Seek financial counseling if needed'
  ],
  'written_off': [
    'Contact our recovery team for settlement options',
    'Understand the impact on your credit rating',
    'Provide updated contact information'
  ],
  'closed': [
    'Collect your loan closure certificate',
    'Request a no-objection certificate if needed',
    'Consider applying for future loans with improved terms'
  ]
};

/**
 * Generates a professional and responsive HTML email template for loan status updates
 * @param borrowerName Name of the borrower
 * @param loanId Loan identifier
 * @param currentStatus Current loan status
 * @param previousStatus Previous loan status (optional)
 * @param loanAmount Loan amount
 * @param outstandingAmount Outstanding amount (optional)
 * @param dueDate Next due date (optional)
 * @param notes Additional notes from loan officer (optional)
 * @returns Fully formatted HTML email template
 */
export const LoanStatusUpdateEmailTemplate = (
  borrowerName: string,
  loanId: string,
  currentStatus: string,
  previousStatus: string = '',
  loanAmount: number = 0,
  outstandingAmount: number = 0,
  dueDate: string = '',
  notes: string = ''
) => {
  const statusColor = STATUS_COLORS[currentStatus.toLowerCase()] || COLOR_PALETTE.PRIMARY;
  const statusDescription = STATUS_DESCRIPTIONS[currentStatus.toLowerCase()] || 'Your loan status has been updated.';
  const statusActions = STATUS_ACTIONS[currentStatus.toLowerCase()] || [];
  
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-RW', {
      style: 'currency',
      currency: 'RWF',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatStatus = (status: string) => {
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loan Status Update - ${formatStatus(currentStatus)}</title>
    <style>
        /* Reset and base styles */
        body, table, td, a { 
            -webkit-text-size-adjust: 100%; 
            -ms-text-size-adjust: 100%; 
        }
        table, td { 
            mso-table-lspace: 0pt; 
            mso-table-rspace: 0pt; 
        }
        img { 
            -ms-interpolation-mode: bicubic; 
            border: 0; 
            height: auto; 
            line-height: 100%; 
            outline: none; 
            text-decoration: none; 
        }

        /* Responsive layout */
        @media screen and (max-width: 600px) {
            .responsive-table {
                width: 100% !important;
            }
            .mobile-center {
                text-align: center !important;
            }
            .mobile-padding {
                padding: 15px !important;
            }
            .mobile-font-size {
                font-size: 14px !important;
            }
        }

        /* Custom email styles */
        body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: ${COLOR_PALETTE.NEUTRAL_LIGHT};
            line-height: 1.6;
            color: ${COLOR_PALETTE.NEUTRAL_DARK};
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: ${COLOR_PALETTE.WHITE};
            box-shadow: 0 8px 24px rgba(0,0,0,0.12);
            border-radius: 12px;
            overflow: hidden;
        }
        .email-header {
            background: linear-gradient(135deg, ${COLOR_PALETTE.PRIMARY} 0%, ${statusColor} 100%);
            color: ${COLOR_PALETTE.WHITE};
            padding: 30px 20px;
            text-align: center;
            position: relative;
        }
        .status-badge {
            display: inline-block;
            background-color: rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 25px;
            padding: 8px 20px;
            margin-top: 10px;
            font-size: 14px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .email-body {
            padding: 40px 30px;
        }
        .loan-details {
            background-color: ${COLOR_PALETTE.NEUTRAL_LIGHT};
            border-radius: 8px;
            padding: 25px;
            margin: 25px 0;
            border-left: 4px solid ${statusColor};
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #e0e0e0;
        }
        .detail-row:last-child {
            border-bottom: none;
        }
        .detail-label {
            font-weight: 600;
            color: ${COLOR_PALETTE.NEUTRAL_DARK};
            font-size: 14px;
        }
        .detail-value {
            font-weight: 500;
            color: ${statusColor};
            font-size: 14px;
        }
        .status-description {
            background-color: rgba(${statusColor.replace('#', '')}, 0.1);
            border: 1px solid rgba(${statusColor.replace('#', '')}, 0.2);
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            font-size: 16px;
            text-align: center;
        }
        .action-items {
            margin-top: 25px;
        }
        .action-item {
            display: flex;
            align-items: flex-start;
            margin: 12px 0;
            padding: 12px;
            background-color: ${COLOR_PALETTE.NEUTRAL_LIGHT};
            border-radius: 6px;
            border-left: 3px solid ${statusColor};
        }
        .action-bullet {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: ${statusColor};
            margin-right: 12px;
            margin-top: 6px;
            flex-shrink: 0;
        }
        .contact-section {
            background: linear-gradient(135deg, ${COLOR_PALETTE.NEUTRAL_LIGHT} 0%, ${COLOR_PALETTE.WHITE} 100%);
            border-radius: 8px;
            padding: 25px;
            margin: 30px 0;
            text-align: center;
            border: 1px solid #e0e0e0;
        }
        .email-footer {
            background-color: ${COLOR_PALETTE.NEUTRAL_DARK};
            color: ${COLOR_PALETTE.WHITE};
            text-align: center;
            padding: 25px;
            font-size: 12px;
            line-height: 1.5;
        }
        .button-link {
            display: inline-block;
            background: linear-gradient(135deg, ${statusColor} 0%, ${COLOR_PALETTE.SECONDARY} 100%);
            color: ${COLOR_PALETTE.WHITE};
            padding: 12px 30px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            font-size: 14px;
            margin: 15px 10px;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }
        .button-secondary {
            background: linear-gradient(135deg, ${COLOR_PALETTE.NEUTRAL_DARK} 0%, #666666 100%);
        }
        .notes-section {
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .notes-title {
            font-weight: bold;
            color: #856404;
            margin-bottom: 10px;
        }
        .notes-content {
            color: #856404;
            font-style: italic;
        }
    </style>
</head>
<body>
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td align="center" style="padding: 20px;">
                <table class="responsive-table" width="600" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                        <td class="email-container">
                            <div class="email-header">
                                <h1 style="margin: 0; color: ${COLOR_PALETTE.WHITE}; font-size: 28px; font-weight: 300;">
                                    Loan Management System
                                </h1>
                                <div class="status-badge">
                                    Status: ${formatStatus(currentStatus)}
                                </div>
                            </div>
                            
                            <div class="email-body">
                                <h2 style="color: ${COLOR_PALETTE.PRIMARY}; margin-bottom: 10px;">
                                    Hello ${borrowerName},
                                </h2>
                                
                                <p style="font-size: 16px; margin-bottom: 20px;">
                                    We're writing to inform you about an important update to your loan status.
                                </p>

                                <div class="status-description">
                                    <strong>${statusDescription}</strong>
                                </div>

                                <div class="loan-details">
                                    <h3 style="color: ${COLOR_PALETTE.PRIMARY}; margin-top: 0; margin-bottom: 20px;">
                                        Loan Details
                                    </h3>
                                    <div class="detail-row">
                                        <span class="detail-label">Loan ID:</span>
                                        <span class="detail-value">${loanId}</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Current Status:</span>
                                        <span class="detail-value">${formatStatus(currentStatus)}</span>
                                    </div>
                                    ${previousStatus ? `
                                    <div class="detail-row">
                                        <span class="detail-label">Previous Status:</span>
                                        <span class="detail-value">${formatStatus(previousStatus)}</span>
                                    </div>
                                    ` : ''}
                                    ${loanAmount > 0 ? `
                                    <div class="detail-row">
                                        <span class="detail-label">Loan Amount:</span>
                                        <span class="detail-value">${formatAmount(loanAmount)}</span>
                                    </div>
                                    ` : ''}
                                    ${outstandingAmount > 0 ? `
                                    <div class="detail-row">
                                        <span class="detail-label">Outstanding Amount:</span>
                                        <span class="detail-value">${formatAmount(outstandingAmount)}</span>
                                    </div>
                                    ` : ''}
                                    ${dueDate ? `
                                    <div class="detail-row">
                                        <span class="detail-label">Next Due Date:</span>
                                        <span class="detail-value">${dueDate}</span>
                                    </div>
                                    ` : ''}
                                    <div class="detail-row">
                                        <span class="detail-label">Status Updated:</span>
                                        <span class="detail-value">${new Date().toLocaleDateString('en-RW', {
                                          year: 'numeric',
                                          month: 'long',
                                          day: 'numeric'
                                        })}</span>
                                    </div>
                                </div>

                                ${notes ? `
                                <div class="notes-section">
                                    <div class="notes-title">Additional Notes from Loan Officer:</div>
                                    <div class="notes-content">${notes}</div>
                                </div>
                                ` : ''}

                                ${statusActions.length > 0 ? `
                                <div class="action-items">
                                    <h3 style="color: ${COLOR_PALETTE.PRIMARY}; margin-bottom: 15px;">
                                        Next Steps:
                                    </h3>
                                    ${statusActions.map(action => `
                                    <div class="action-item">
                                        <div class="action-bullet"></div>
                                        <span>${action}</span>
                                    </div>
                                    `).join('')}
                                </div>
                                ` : ''}

                                <div class="contact-section">
                                    <h3 style="color: ${COLOR_PALETTE.PRIMARY}; margin-top: 0;">
                                        Need Assistance?
                                    </h3>
                                    <p style="margin-bottom: 20px;">
                                        Our loan specialists are here to help you with any questions or concerns.
                                    </p>
                                    <div>
                                        <a href="${process.env.APP_URL}/loan-portal" class="button-link">
                                            View Loan Portal
                                        </a>
                                        <a href="tel:+250788123456" class="button-link button-secondary">
                                            Call Support
                                        </a>
                                    </div>
                                    <p style="font-size: 14px; margin-top: 15px; color: ${COLOR_PALETTE.NEUTRAL_DARK};">
                                        Phone: +250 788 123 456<br>
                                        Email: support@loanmanagementsystem.com<br>
                                        Office Hours: Monday - Friday, 8:00 AM - 6:00 PM
                                    </p>
                                </div>

                                <p style="font-size: 14px; color: ${COLOR_PALETTE.NEUTRAL_DARK}; margin-top: 30px;">
                                    This is an automated notification. Please do not reply directly to this email. 
                                    For inquiries, please use the contact information provided above.
                                </p>
                                
                                <p style="margin-top: 20px;">
                                    Best regards,<br>
                                    <strong>Loan Management System Team</strong>
                                </p>
                            </div>

                            <div class="email-footer">
                                <div style="margin-bottom: 10px;">
                                    © ${new Date().getFullYear()} Loan Management System. All rights reserved.
                                </div>
                                <div style="font-size: 11px; opacity: 0.8;">
                                    This email was sent to notify you of important changes to your loan status.<br>
                                    If you believe this email was sent to you in error, please contact our support team.
                                </div>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;
};

/**
 * Sends loan status update email to the borrower
 * @param borrowerEmail Borrower's email address
 * @param borrowerName Name of the borrower
 * @param loanId Loan identifier
 * @param currentStatus Current loan status
 * @param previousStatus Previous loan status (optional)
 * @param loanAmount Loan amount (optional)
 * @param outstandingAmount Outstanding amount (optional)
 * @param dueDate Next due date (optional)
 * @param notes Additional notes from loan officer (optional)
 * @throws Will throw an error if email sending fails
 */
export const sendLoanStatusUpdateEmail = async (
  borrowerEmail: string,
  borrowerName: string,
  loanId: string,
  currentStatus: string,
  previousStatus: string = '',
  loanAmount: number = 0,
  outstandingAmount: number = 0,
  dueDate: string = '',
  notes: string = ''
) => {
  if (!borrowerEmail || !borrowerName || !loanId || !currentStatus) {
    throw new Error('Missing required email parameters');
  }

  const formatStatus = (status: string) => {
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  const subject = `Loan Status Update: ${formatStatus(currentStatus)} - ${loanId}`;

  const mailOptions = {
    from: process.env.EMAIL_USER || 'noreply@loanmanagementsystem.com',
    to: borrowerEmail,
    subject: subject,
    html: LoanStatusUpdateEmailTemplate(
      borrowerName,
      loanId,
      currentStatus,
      previousStatus,
      loanAmount,
      outstandingAmount,
      dueDate,
      notes
    )
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Loan status update email sent successfully to ${borrowerEmail}`, {
      messageId: info.messageId,
      loanId,
      status: currentStatus
    });
    return info;
  } catch (error: any) {
    console.error(`Failed to send loan status update email to ${borrowerEmail}:`, error);
    throw new Error(`Failed to send loan status update email: ${error.message}`);
  }
};