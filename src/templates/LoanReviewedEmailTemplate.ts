import { transporter } from '../utils/helpers';

const COLOR_PALETTE = {
  PRIMARY: '#1B3A57',
  INFO: '#3B82F6',
  SECONDARY: '#FFD700',
  NEUTRAL_DARK: '#2E2E2E',
  NEUTRAL_LIGHT: '#F8F9FA',
  WHITE: '#FFFFFF'
};

export const LoanReviewedEmailTemplate = (
  recipientName: string,
  recipientRole: string,
  borrowerName: string,
  loanId: string,
  loanAmount: number,
  reviewerName: string,
  reviewMessage: string,
  reviewCount: number,
  reviewUrl: string
) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loan Application Review Required</title>
    <style>
        body, table, td, a { 
            -webkit-text-size-adjust: 100%; 
            -ms-text-size-adjust: 100%; 
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
            background: linear-gradient(135deg, ${COLOR_PALETTE.INFO} 0%, #2563EB 100%);
            color: ${COLOR_PALETTE.WHITE};
            padding: 30px;
            text-align: center;
        }
        .email-body {
            padding: 30px;
        }
        .review-badge {
            display: inline-block;
            background-color: #DBEAFE;
            color: #1E40AF;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 20px;
            border: 2px solid #93C5FD;
        }
        .loan-details {
            background-color: #EFF6FF;
            border-left: 4px solid ${COLOR_PALETTE.INFO};
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .review-box {
            background-color: #F0F9FF;
            border: 1px solid #BAE6FD;
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #BFDBFE;
        }
        .detail-row:last-child {
            border-bottom: none;
        }
        .detail-label {
            font-weight: 600;
            color: #1E40AF;
        }
        .detail-value {
            font-weight: bold;
            color: #1E3A8A;
        }
        .action-box {
            background-color: #FEF3C7;
            border-left: 4px solid #F59E0B;
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .button-link {
            display: inline-block;
            background-color: ${COLOR_PALETTE.INFO};
            color: white;
            padding: 12px 30px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: bold;
            margin: 20px 0;
        }
        .email-footer {
            background-color: ${COLOR_PALETTE.NEUTRAL_LIGHT};
            color: ${COLOR_PALETTE.NEUTRAL_DARK};
            text-align: center;
            padding: 20px;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td align="center" style="padding: 20px;">
                <table class="email-container" width="600" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                        <td>
                            <div class="email-header">
                                <h1 style="margin: 0; font-size: 28px;">📝 Loan Review Required</h1>
                                <p style="margin: 10px 0 0 0; font-size: 16px;">Action Needed for Loan Application</p>
                            </div>
                            
                            <div class="email-body">
                                <span class="review-badge">✓ NEW REVIEW ADDED</span>
                                
                                <p>Dear ${recipientName},</p>

                                <p>A loan application has received a new review and requires your attention ${recipientRole === 'client' || recipientRole === 'managing_director' ? 'for final approval decision' : 'to provide your feedback'}.</p>

                                <div class="loan-details">
                                    <h3 style="margin-top: 0; color: #1E40AF;">Loan Application Details</h3>
                                    
                                    <div class="detail-row">
                                        <span class="detail-label">Loan ID:</span>
                                        <span class="detail-value">${loanId}</span>
                                    </div>
                                    
                                    <div class="detail-row">
                                        <span class="detail-label">Borrower:</span>
                                        <span class="detail-value">${borrowerName}</span>
                                    </div>
                                    
                                    <div class="detail-row">
                                        <span class="detail-label">Requested Amount:</span>
                                        <span class="detail-value">${loanAmount.toLocaleString()} RWF</span>
                                    </div>
                                    
                                    <div class="detail-row">
                                        <span class="detail-label">Total Reviews:</span>
                                        <span class="detail-value">${reviewCount}</span>
                                    </div>
                                </div>

                                <div class="review-box">
                                    <h3 style="margin-top: 0; color: #1E40AF;">Latest Review</h3>
                                    <p style="margin: 5px 0; color: #1E3A8A;"><strong>Reviewed By:</strong> ${reviewerName}</p>
                                    <div style="background-color: white; padding: 15px; border-radius: 4px; margin-top: 10px; border: 1px solid #BFDBFE;">
                                        <p style="margin: 0; color: #334155; white-space: pre-wrap;">${reviewMessage}</p>
                                    </div>
                                </div>

                                <div class="action-box">
                                    <h3 style="margin-top: 0; color: #92400E;">Required Action</h3>
                                    <p style="margin: 10px 0; color: #78350F;">
                                        ${recipientRole === 'client' || recipientRole === 'managing_director'
                                          ? 'Please review this loan application and provide your final approval or rejection decision. Your input is critical for the next steps.'
                                          : 'Please review this loan application and add your feedback. Your expertise will help in making the best decision for this applicant.'
                                        }
                                    </p>
                                    <ul style="margin: 10px 0; padding-left: 20px; color: #78350F;">
                                        <li style="margin: 8px 0;">Review all application details and supporting documents</li>
                                        <li style="margin: 8px 0;">Consider all previous reviews and feedback</li>
                                        <li style="margin: 8px 0;">${recipientRole === 'client' || recipientRole === 'managing_director' ? 'Make your approval or rejection decision' : 'Add your professional review comments'}</li>
                                        <li style="margin: 8px 0;">Communicate any concerns or recommendations</li>
                                    </ul>
                                </div>

                                <center>
                                    <a href="${reviewUrl}" class="button-link" style="color: white;">
                                        View Application & ${recipientRole === 'client' || recipientRole === 'managing_director' ? 'Decide' : 'Review'}
                                    </a>
                                </center>

                                <p style="margin-top: 30px; font-size: 14px; color: #64748B;">
                                    <strong>Note:</strong> Timely review of loan applications helps us serve our clients better and maintain efficient operations.
                                </p>
                                
                                <p>Best regards,<br><strong>Loan Management System Team</strong></p>
                            </div>

                            <div class="email-footer">
                                <p>This is an automated notification. Please do not reply to this email.</p>
                                <p>For inquiries, please contact your loan officer or support team.</p>
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

export const sendLoanReviewedEmail = async (
  recipientEmail: string,
  recipientName: string,
  recipientRole: 'client' | 'loan_officer' | 'board_director' | 'senior_manager' | 'managing_director',
  borrowerName: string,
  loanId: string,
  loanAmount: number,
  reviewerName: string,
  reviewMessage: string,
  reviewCount: number,
  reviewUrl: string
) => {
  if (!recipientEmail) {
    throw new Error('Recipient email is required');
  }

  const mailOptions = {
    from: process.env.EMAIL_USER || 'noreply@loanmanagementsystem.com',
    to: recipientEmail,
    subject: `📝 Loan Review Required - ${loanId}`,
    html: LoanReviewedEmailTemplate(
      recipientName,
      recipientRole,
      borrowerName,
      loanId,
      loanAmount,
      reviewerName,
      reviewMessage,
      reviewCount,
      reviewUrl
    )
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Review notification email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Failed to send review notification email:', error);
    throw new Error(`Failed to send review notification email: ${error}`);
  }
};