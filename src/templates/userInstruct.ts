import { transporter } from '../utils/helpers';

const COLOR_PALETTE = {
  PRIMARY: '#1B3A57',  
  SECONDARY: '#FFD700',
  NEUTRAL_DARK: '#2E2E2E',  
  NEUTRAL_LIGHT: '#F8F9FA',
  WHITE: '#FFFFFF'    
};

/**
 * Generates a professional and responsive HTML email template for login instructions
 * @param username Username of the user
 * @param email Email of the user
 * @param password Password of the user
 * @returns Fully formatted HTML email template
 */
export const LoginInstructionsEmailTemplate = (
  username: string, 
  email: string, 
  password: string
) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login Instructions</title>
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
        a.button-link {
            background-color: ${COLOR_PALETTE.SECONDARY};
            color: ${COLOR_PALETTE.PRIMARY};
            padding: 10px 20px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: bold;
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
                            </div>
                            
                            <div class="email-body">
                                <p>Dear ${username},</p>

                                <p>Welcome to the Loan Management System. Please use the following credentials to log in:</p>
                                <p><strong>User name:</strong> ${username}</p>
                                <p><strong>Email:</strong> ${email}</p>
                                <p><strong>Password:</strong> ${password}</p>
                                
                                <p>You can log in to the system using the button below:</p>
                                <p style="text-align: center;">
                                  <a href="${process.env.APP_URL}/login" class="button-link">Login to Loan Management System</a>
                                </p>
                                
                                <p>If you have any questions or need further assistance, please contact our support team.</p>
                                
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
 * Sends login instructions email to the specified user
 * @param email Recipient's email address
 * @param username Username of the user
 * @param password Password of the user
 * @throws Will throw an error if email sending fails
 */
export const sendLoginInstructionsEmail = async (
    email: string, 
    name: string,
    username: string,
    password: string
) => {
  if (!email || !username || !password) {
    throw new Error('Missing required email parameters');
  }

  const mailOptions = {
    from: process.env.EMAIL_USER || 'noreply@loanmanagementsystem.com',
    to: email,
    subject: 'Login Instructions for Loan Management System',
    html: LoginInstructionsEmailTemplate(username, email, password)
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    throw new Error(`Failed to send login instructions: ${error}`);
  }
};
