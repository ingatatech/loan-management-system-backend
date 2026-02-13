import { transporter } from '../utils/helpers';

const COLOR_PALETTE = {
  PRIMARY: '#1B3A57',  
  SECONDARY: '#FFD700',
  NEUTRAL_DARK: '#2E2E2E',  
  NEUTRAL_LIGHT: '#F8F9FA',
  WHITE: '#FFFFFF',
  WARNING: '#FF6B35'
};

export const ChangeLeaderNotificationTemplate = (
  userName: string,
  newLeaderName: string
) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>System Administrator Role Change</title>
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
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            border-radius: 8px;
            overflow: hidden;
        }
        .email-header {
            background-color: ${COLOR_PALETTE.PRIMARY};
            color: ${COLOR_PALETTE.WHITE};
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
        }
        .email-body {
            padding: 30px;
        }
        .email-footer {
            background-color: ${COLOR_PALETTE.NEUTRAL_LIGHT};
            color: ${COLOR_PALETTE.NEUTRAL_DARK};
            text-align: center;
            padding: 15px;
            font-size: 12px;
            border-radius: 0 0 8px 8px;
        }
        .alert {
            background-color: #FFF3CD;
            color: #856404;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 4px;
            border-left: 4px solid ${COLOR_PALETTE.WARNING};
        }
        .security-badge {
            background-color: ${COLOR_PALETTE.SECONDARY};
            color: ${COLOR_PALETTE.PRIMARY};
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            display: inline-block;
            margin: 10px 0;
        }
        .feature-list {
            background-color: ${COLOR_PALETTE.NEUTRAL_LIGHT};
            padding: 15px;
            border-radius: 6px;
            margin: 20px 0;
        }
        .feature-list li {
            margin-bottom: 8px;
        }
    </style>
</head>
<body>
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td align="center" style="padding: 15px;">
                <table class="responsive-table" width="600" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                        <td class="email-container">
                            <div class="email-header">
                                <h1 style="margin: 0; color: ${COLOR_PALETTE.WHITE};">Loan Management System</h1>
                                <p style="margin: 5px 0 0 0; color: ${COLOR_PALETTE.SECONDARY}; font-size: 16px;">
                                    Administrator Role Change Notification
                                </p>
                            </div>
                            
                            <div class="email-body">
                                <p>Dear <strong>${userName}</strong>,</p>
                                
                                <div class="alert">
                                    <strong>🔒 Important Security Notice:</strong> Your role as System Administrator has been changed. 
                                    You no longer have administrative access to the Loan Management System.
                                </div>
                                
                                <p>We are writing to inform you that your System Administrator privileges have been revoked. 
                                <strong>${newLeaderName}</strong> has been assigned as the new System Administrator.</p>
                                
                                <div class="security-badge">
                                    🛡️ Security Update
                                </div>
                                
                                <p>As a result of this change, the following access restrictions are now in effect:</p>
                                
                                <div class="feature-list">
                                    <ul style="margin: 0; padding-left: 20px;">
                                        <li>Your administrative login credentials have been deactivated</li>
                                        <li>Access to system configuration and user management has been revoked</li>
                                        <li>All administrative privileges have been transferred to the new System Administrator</li>
                                        <li>Loan approval and financial oversight capabilities have been removed</li>
                                        <li>System audit and reporting access has been discontinued</li>
                                    </ul>
                                </div>
                                
                                <p><strong>Financial Data Security:</strong> All sensitive financial data and loan information 
                                previously accessible to you is now under the management of the new System Administrator.</p>
                                
                                <p>If you believe this change was made in error or have questions about your current access level, 
                                please contact the new System Administrator or our support team immediately.</p>
                                
                                <p style="background-color: ${COLOR_PALETTE.NEUTRAL_LIGHT}; padding: 15px; border-radius: 6px;">
                                    <strong>📞 Support Contact:</strong><br>
                                    Email: <a href="mailto:support@loanmanagementsystem.com" style="color: ${COLOR_PALETTE.PRIMARY}; text-decoration: none;">
                                        support@loanmanagementsystem.com
                                    </a><br>
                                    Phone: +1-800-LMS-SUPPORT
                                </p>
                                
                                <p>Thank you for your service as System Administrator. We appreciate your contributions to maintaining 
                                the security and integrity of our loan management platform.</p>
                                
                                <p>Best regards,<br>
                                <strong>Loan Management System Security Team</strong></p>
                            </div>

                            <div class="email-footer">
                                <p style="margin: 0;">
                                    © ${new Date().getFullYear()} Loan Management System. All rights reserved.<br>
                                    <span style="font-size: 11px; color: #666;">
                                        Protecting financial data with bank-level security standards
                                    </span>
                                </p>
                                <p style="margin: 10px 0 0 0; font-size: 10px; color: #999;">
                                    This is an automated security notification. Please do not reply to this email.
                                </p>
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

export const sendChangeLeaderNotificationEmail = async (
  email: string,
  userName: string,
  newLeaderName: string
) => {
  const subject = '🔐 Important: System Administrator Role Change - Loan Management System';

  const mailOptions = {
    from: process.env.EMAIL_USER || 'security@loanmanagementsystem.com',
    to: email,
    subject,
    html: ChangeLeaderNotificationTemplate(userName, newLeaderName),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    console.error('Failed to send change leader notification email:', error);
    throw new Error('Failed to send notification email');
  }
};