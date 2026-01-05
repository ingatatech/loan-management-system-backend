import { transporter } from '../utils/helpers';

const COLOR_PALETTE = {
  PRIMARY: '#1B3A57',  
  SECONDARY: '#FFD700',
  NEUTRAL_DARK: '#2E2E2E',  
  NEUTRAL_LIGHT: '#F8F9FA',
  WHITE: '#FFFFFF'    
};

/**
 * Generates a professional and responsive HTML email template for 2FA OTP
 * @param firstName First name of the user
 * @param otp OTP code
 * @returns Fully formatted HTML email template
 */
export const TwoFactorAuthEmailTemplate = (
  firstName: string,
  otp: string
) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Login Verification Code</title>
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
      -ms-interpolation-mode: bicubic; 
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
      .mobile-center {
        text-align: center !important;
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
      background-color: ${COLOR_PALETTE.PRIMARY};
      color: ${COLOR_PALETTE.WHITE};
      padding: 20px;
      text-align: center;
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
    }
    .otp-code {
      font-family: 'Courier New', monospace;
      font-size: 36px;
      font-weight: bold;
      color: ${COLOR_PALETTE.PRIMARY};
      letter-spacing: 8px;
      padding: 15px;
      background-color: ${COLOR_PALETTE.NEUTRAL_LIGHT};
      border-radius: 6px;
      display: inline-block;
      margin: 20px 0;
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
                <h1 style="margin: 0; color: ${COLOR_PALETTE.WHITE};">🔐 Loan Management System</h1>
              </div>
              
              <div class="email-body">
                <h1 style="font-size: 20px; color: ${COLOR_PALETTE.NEUTRAL_DARK}; margin-bottom: 20px;">
                  Secure Access Code Required
                </h1>
                
                <p>Hi <strong>${firstName}</strong>,</p>
                
                <p>You are attempting to log in to your Loan Management System account. Use the verification code below to complete your login:</p>
                
                <div style="text-align: center;">
                  <div style="font-size: 14px; color: #666; margin-bottom: 10px;">Your Verification Code</div>
                  <div class="otp-code">${otp}</div>
                  <div style="font-size: 13px; color: #666; margin-top: 10px;">
                    This code expires in <strong>10 minutes</strong>
                  </div>
                </div>
                
                <div style="background-color: #fff8e1; padding: 15px; border-radius: 6px; border-left: 4px solid #ffc107; margin-top: 25px;">
                  <strong>Security Notice:</strong> If you didn't request this code, please ignore this email and ensure your account is secure. Do not share this code with anyone.
                </div>
                
                <p style="margin-top: 20px;">If you have any questions or need assistance, please contact our support team.</p>
                
                <p>Best regards,<br>Loan Management System Team</p>
              </div>

              <div class="email-footer">
                © ${new Date().getFullYear()} Loan Management System. All rights reserved.
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

/**
 * Sends 2FA OTP email to the specified user
 * @param email Recipient's email address
 * @param firstName First name of the user
 * @param otp OTP code
 * @throws Will throw an error if email sending fails
 */
export const send2FAOtpEmail = async (
  email: string,
  firstName: string,
  otp: string
) => {
  if (!email || !firstName || !otp) {
    throw new Error('Missing required email parameters');
  }

  const mailOptions = {
    from: process.env.EMAIL_USER || 'noreply@loanmanagementsystem.com',
    to: email,
    subject: 'Your Two-Factor Authentication Code - Loan Management System',
    html: TwoFactorAuthEmailTemplate(firstName, otp)
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    throw new Error(`Failed to send 2FA OTP: ${error}`);
  }
};