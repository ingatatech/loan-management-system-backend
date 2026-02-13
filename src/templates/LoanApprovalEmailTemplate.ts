// ============================================================================
// LoanApprovalEmailTemplate.ts
// ============================================================================
import { transporter } from '../utils/helpers';

const COLOR_PALETTE = {
  PRIMARY: '#1B3A57',
  SUCCESS: '#10B981',
  SECONDARY: '#FFD700',
  NEUTRAL_DARK: '#2E2E2E',
  NEUTRAL_LIGHT: '#F8F9FA',
  WHITE: '#FFFFFF'
};

export const LoanApprovalEmailTemplate = (
  borrowerName: string,
  loanId: string,
  approvedAmount: number,
  disbursementDate: string,
  firstPaymentDate: string,
  monthlyInstallment: number,
  totalAmount: number,
  maturityDate: string
) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loan Approval Notification</title>
    <style>
        body, table, td, a { 
            -webkit-text-size-adjust: 100%; 
            -ms-text-size-adjust: 100%; 
        }
        table, td { 
            mso-table-lspace: 0pt; 
            mso-table-rspace: 0pt; 
        }
        img { 
            border: 0; 
            height: auto; 
            line-height: 100%; 
            outline: none; 
            text-decoration: none; 
        }

        @media screen and (max-width: 600px) {
            .responsive-table {
                width: 100% !important;
            }
        }

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
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            border-radius: 8px;
            overflow: hidden;
        }
        .email-header {
            background: linear-gradient(135deg, ${COLOR_PALETTE.SUCCESS} 0%, #059669 100%);
            color: ${COLOR_PALETTE.WHITE};
            padding: 30px;
            text-align: center;
        }
        .email-body {
            padding: 30px;
        }
        .success-badge {
            display: inline-block;
            background-color: ${COLOR_PALETTE.SUCCESS};
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 20px;
        }
        .loan-details {
            background-color: #F0FDF4;
            border-left: 4px solid ${COLOR_PALETTE.SUCCESS};
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #D1FAE5;
        }
        .detail-row:last-child {
            border-bottom: none;
        }
        .detail-label {
            font-weight: 600;
            color: #065F46;
        }
        .detail-value {
            font-weight: bold;
            color: #047857;
        }
        .next-steps {
            background-color: #FEF3C7;
            border-left: 4px solid #F59E0B;
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .email-footer {
            background-color: ${COLOR_PALETTE.NEUTRAL_LIGHT};
            color: ${COLOR_PALETTE.NEUTRAL_DARK};
            text-align: center;
            padding: 20px;
            font-size: 12px;
        }
        .button-link {
            display: inline-block;
            background-color: ${COLOR_PALETTE.SUCCESS};
            color: white;
            padding: 12px 30px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: bold;
            margin: 20px 0;
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
                                <h1 style="margin: 0; font-size: 28px;">🎉 Congratulations!</h1>
                                <p style="margin: 10px 0 0 0; font-size: 16px;">Your Loan Application Has Been Approved</p>
                            </div>
                            
                            <div class="email-body">
                                <span class="success-badge">✓ APPROVED</span>
                                
                                <p>Dear ${borrowerName},</p>

                                <p>We are pleased to inform you that your loan application <strong>${loanId}</strong> has been approved! Your loan will be disbursed according to the details below.</p>

                                <div class="loan-details">
                                    <h3 style="margin-top: 0; color: #065F46;">Loan Details</h3>
                                    
                                    <div class="detail-row">
                                        <span class="detail-label">Loan ID:</span>
                                        <span class="detail-value">${loanId}</span>
                                    </div>
                                    
                                    <div class="detail-row">
                                        <span class="detail-label">Approved Amount:</span>
                                        <span class="detail-value">${approvedAmount.toLocaleString()} RWF</span>
                                    </div>
                                    
                                    <div class="detail-row">
                                        <span class="detail-label">Disbursement Date:</span>
                                        <span class="detail-value">${disbursementDate}</span>
                                    </div>
                                    
                                    <div class="detail-row">
                                        <span class="detail-label">First Payment Date:</span>
                                        <span class="detail-value">${firstPaymentDate}</span>
                                    </div>
                                    
                                    <div class="detail-row">
                                        <span class="detail-label">Periodic Installment:</span>
                                        <span class="detail-value">${monthlyInstallment.toLocaleString()} RWF</span>
                                    </div>
                                    
                                    <div class="detail-row">
                                        <span class="detail-label">Total Amount to Repay:</span>
                                        <span class="detail-value">${totalAmount.toLocaleString()} RWF</span>
                                    </div>
                                    
                                    <div class="detail-row">
                                        <span class="detail-label">Maturity Date:</span>
                                        <span class="detail-value">${maturityDate}</span>
                                    </div>
                                </div>

                                <p style="margin-top: 30px;">If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
                                
                                <p>Best regards,<br><strong>Loan Management System Team</strong></p>
                            </div>

                            <div class="email-footer">
                                <p>This is an automated notification. Please do not reply to this email.</p>
                                <p>© ${new Date().getFullYear()} Loan Management System. All rights reserved.</p>
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

export const sendLoanApprovalEmail = async (
  borrowerEmail: string,
  borrowerName: string,
  loanId: string,
  approvedAmount: number,
  disbursementDate: string,
  firstPaymentDate: string,
  monthlyInstallment: number,
  totalAmount: number,
  maturityDate: string
) => {
  if (!borrowerEmail) {
    throw new Error('Borrower email is required');
  }

  const mailOptions = {
    from: process.env.EMAIL_USER || 'noreply@loanmanagementsystem.com',
    to: borrowerEmail,
    subject: `🎉 Loan Approved - ${loanId}`,
    html: LoanApprovalEmailTemplate(
      borrowerName,
      loanId,
      approvedAmount,
      disbursementDate,
      firstPaymentDate,
      monthlyInstallment,
      totalAmount,
      maturityDate
    )
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Approval email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Failed to send approval email:', error);
    throw new Error(`Failed to send approval email: ${error}`);
  }
};

// ============================================================================
// LoanRejectionEmailTemplate.ts
// ============================================================================

export const LoanRejectionEmailTemplate = (
  borrowerName: string,
  loanId: string,
  rejectionReason: string,
  contactEmail: string,
  contactPhone: string
) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loan Application Status</title>
    <style>
        body, table, td, a { 
            -webkit-text-size-adjust: 100%; 
            -ms-text-size-adjust: 100%; 
        }
        table, td { 
            mso-table-lspace: 0pt; 
            mso-table-rspace: 0pt; 
        }
        img { 
            border: 0; 
            height: auto; 
            line-height: 100%; 
            outline: none; 
            text-decoration: none; 
        }

        @media screen and (max-width: 600px) {
            .responsive-table {
                width: 100% !important;
            }
        }

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
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            border-radius: 8px;
            overflow: hidden;
        }
        .email-header {
            background: linear-gradient(135deg, #DC2626 0%, #991B1B 100%);
            color: ${COLOR_PALETTE.WHITE};
            padding: 30px;
            text-align: center;
        }
        .email-body {
            padding: 30px;
        }
        .status-badge {
            display: inline-block;
            background-color: #FEE2E2;
            color: #991B1B;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 20px;
            border: 2px solid #FCA5A5;
        }
        .reason-box {
            background-color: #FEF2F2;
            border-left: 4px solid #DC2626;
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .reapply-box {
            background-color: #DBEAFE;
            border-left: 4px solid #3B82F6;
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .contact-info {
            background-color: #F3F4F6;
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
            text-align: center;
        }
        .email-footer {
            background-color: ${COLOR_PALETTE.NEUTRAL_LIGHT};
            color: ${COLOR_PALETTE.NEUTRAL_DARK};
            text-align: center;
            padding: 20px;
            font-size: 12px;
        }
        .button-link {
            display: inline-block;
            background-color: #3B82F6;
            color: white;
            padding: 12px 30px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: bold;
            margin: 20px 0;
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
                                <h1 style="margin: 0; font-size: 28px;">Loan Application Status</h1>
                                <p style="margin: 10px 0 0 0; font-size: 16px;">Update on Your Application</p>
                            </div>
                            
                            <div class="email-body">
                                <span class="status-badge">⚠ APPLICATION NOT APPROVED</span>
                                
                                <p>Dear ${borrowerName},</p>

                                <p>Thank you for your interest in our loan services and for submitting your application <strong>${loanId}</strong>.</p>

                                <p>After careful review of your application, we regret to inform you that we are unable to approve your loan request at this time.</p>

                                <div class="reason-box">
                                    <h3 style="margin-top: 0; color: #991B1B;">Reason for Decision</h3>
                                    <p style="margin: 0; color: #7F1D1D;">${rejectionReason}</p>
                                </div>

                                <div class="reapply-box">
                                    <h3 style="margin-top: 0; color: #1E40AF;">You Can Reapply</h3>
                                    <p style="margin: 10px 0; color: #1E3A8A;">
                                        This decision does not prevent you from applying again in the future. We encourage you to:
                                    </p>
                                    <ul style="margin: 10px 0; padding-left: 20px; color: #1E3A8A;">
                                        <li style="margin: 8px 0;">Address the reason mentioned above</li>
                                        <li style="margin: 8px 0;">Improve your credit profile or collateral</li>
                                        <li style="margin: 8px 0;">Ensure all documentation is complete and accurate</li>
                                        <li style="margin: 8px 0;">Wait for the recommended period before reapplying</li>
                                    </ul>
                                </div>

                                <div class="contact-info">
                                    <h3 style="margin-top: 0; color: #374151;">Need More Information?</h3>
                                    <p style="margin: 10px 0; color: #6B7280;">Our team is here to help you understand this decision and guide you on how to improve your application.</p>
                                    <p style="margin: 10px 0;">
                                        <strong>Email:</strong> ${contactEmail}<br>
                                        <strong>Phone:</strong> ${contactPhone}
                                    </p>
                                </div>


                                <p style="margin-top: 3px;">We appreciate your understanding and hope to serve you better in the future.</p>
                                
                                <p>Best regards,<br><strong>Loan Management System Team</strong></p>
                            </div>

                            <div class="email-footer">
                                <p>This is an automated notification. Please do not reply to this email.</p>
                                <p>For inquiries, please contact us at ${contactEmail}</p>
                                <p>© ${new Date().getFullYear()} Loan Management System. All rights reserved.</p>
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

export const sendLoanRejectionEmail = async (
  borrowerEmail: string,
  borrowerName: string,
  loanId: string,
  rejectionReason: string,
  contactEmail: string,
  contactPhone: string
) => {
  if (!borrowerEmail) {
    throw new Error('Borrower email is required');
  }

  const mailOptions = {
    from: process.env.EMAIL_USER || 'noreply@loanmanagementsystem.com',
    to: borrowerEmail,
    subject: `Loan Application Status - ${loanId}`,
    html: LoanRejectionEmailTemplate(
      borrowerName,
      loanId,
      rejectionReason,
      contactEmail,
      contactPhone
    )
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Rejection email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Failed to send rejection email:', error);
    throw new Error(`Failed to send rejection email: ${error}`);
  }
};