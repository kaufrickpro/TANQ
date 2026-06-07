/**
 * Utility to send emails via Resend API or log them to terminal for local development.
 */
export async function sendVerificationEmail(email: string, name: string, otp: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'TANQ <onboarding@resend.dev>';
  
  const subject = 'Verify your TANQ Editorial Portal Account';
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify your TANQ Account</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #f6f5f3;
            color: #333333;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border: 1px solid #e2dfda;
            border-radius: 4px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
          }
          .header {
            background-color: #4a5d4e; /* Olive color matching the portal */
            color: #ffffff;
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 22px;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
          }
          .content {
            padding: 40px 30px;
            line-height: 1.6;
          }
          .content p {
            margin-top: 0;
            margin-bottom: 20px;
            font-size: 15px;
          }
          .otp-container {
            background-color: #f7f6f2;
            border: 1px dashed #4a5d4e;
            border-radius: 4px;
            text-align: center;
            padding: 20px;
            margin: 30px 0;
          }
          .otp-code {
            font-family: monospace;
            font-size: 32px;
            font-weight: 700;
            letter-spacing: 0.2em;
            color: #4a5d4e;
            margin: 0;
          }
          .footer {
            background-color: #faf9f6;
            border-top: 1px solid #e2dfda;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #888888;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>The African Nexus Quarterly</h1>
          </div>
          <div class="content">
            <p>Dear ${name},</p>
            <p>Thank you for registering an account on the TANQ Editorial Portal. To activate your Author account, please enter the following 6-digit verification code on the registration page:</p>
            
            <div class="otp-container">
              <div class="otp-code">${otp}</div>
            </div>
            
            <p>This code will expire in 15 minutes. If you did not register for this account, please ignore this email.</p>
            <p>Sincerely,<br>The TANQ Editorial Team</p>
          </div>
          <div class="footer">
            &copy; 2026 The African Nexus Quarterly (TANQ). All rights reserved.
          </div>
        </div>
      </body>
    </html>
  `;

  // Always log the OTP to the console in development to make debugging / testing easy
  if (process.env.NODE_ENV !== 'production') {
    console.log('\n' + '='.repeat(60));
    console.log('📬  [DEVELOPMENT EMAIL OTP LOG]');
    console.log(`TO:      ${name} <${email}>`);
    console.log(`FROM:    ${fromEmail}`);
    console.log(`SUBJECT: ${subject}`);
    console.log('-'.repeat(60));
    console.log(`VERIFICATION CODE (OTP):  [ ${otp} ]`);
    console.log('-'.repeat(60));
    console.log('='.repeat(60) + '\n');
  }

  if (!apiKey) {
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject: subject,
        html: htmlContent,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API Error: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.error('❌ Failed to send verification email via Resend:', error);
    throw error;
  }
}

/**
 * Notify an editor that an author has requested withdrawal of a submission.
 */
export async function sendWithdrawalRequestEmail(
  editorEmail: string,
  authorName: string,
  submissionTitle: string,
  reason: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'TANQ <onboarding@resend.dev>';
  const subject = `Withdrawal Request: "${submissionTitle}"`;
  const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>body{font-family:-apple-system,sans-serif;background:#f6f5f3;color:#333;margin:0;padding:0}
    .c{max-width:600px;margin:40px auto;background:#fff;border:1px solid #e2dfda;border-radius:4px;overflow:hidden}
    .h{background:#4a5d4e;color:#fff;padding:30px;text-align:center}.h h1{margin:0;font-size:20px;font-weight:700;text-transform:uppercase}
    .b{padding:36px 30px;line-height:1.7;font-size:15px}
    .q{background:#f7f6f2;border:1px dashed #4a5d4e;border-radius:4px;padding:16px;margin:20px 0;font-style:italic}
    .f{border-top:1px solid #e2dfda;padding:16px;text-align:center;font-size:12px;color:#888}</style></head>
    <body><div class="c"><div class="h"><h1>Withdrawal Request</h1></div><div class="b">
    <p>A withdrawal request was submitted for:</p>
    <p><strong>Title:</strong> ${submissionTitle}<br><strong>Author:</strong> ${authorName}</p>
    <p><strong>Reason:</strong></p><div class="q">${reason}</div>
    <p>Please log into the TANQ Editor Dashboard to approve or reject within 15 days.</p>
    <p>Sincerely,<br>TANQ Automated System</p></div>
    <div class="f">&copy; 2026 The African Nexus Quarterly (TANQ).</div></div></body></html>`;

  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n[DEV] Withdrawal Request -> ${editorEmail}: "${submissionTitle}" by ${authorName}`);
  }
  if (!apiKey) return;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: fromEmail, to: editorEmail, subject, html: htmlContent }),
    });
    if (!res.ok) throw new Error(`Resend API Error: ${res.status}`);
  } catch (error) {
    console.error('Failed to send withdrawal request email:', error);
  }
}

/**
 * Notify an author of the editor's withdrawal decision (approved or rejected).
 */
export async function sendWithdrawalDecisionEmail(
  authorEmail: string,
  authorName: string,
  submissionTitle: string,
  decision: 'approved' | 'rejected',
  editorNote?: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'TANQ <onboarding@resend.dev>';
  const isApproved = decision === 'approved';
  const subject = isApproved
    ? `Withdrawal Approved: "${submissionTitle}"`
    : `Withdrawal Rejected: "${submissionTitle}"`;
  const noteHtml = editorNote ? `<p><strong>Editor note:</strong></p><div class="q">${editorNote}</div>` : '';
  const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>body{font-family:-apple-system,sans-serif;background:#f6f5f3;color:#333;margin:0;padding:0}
    .c{max-width:600px;margin:40px auto;background:#fff;border:1px solid #e2dfda;border-radius:4px;overflow:hidden}
    .h{background:${isApproved ? '#4a5d4e' : '#26231A'};color:#fff;padding:30px;text-align:center}.h h1{margin:0;font-size:20px;font-weight:700;text-transform:uppercase}
    .b{padding:36px 30px;line-height:1.7;font-size:15px}
    .q{background:#f7f6f2;border:1px dashed #ccc;border-radius:4px;padding:16px;margin:20px 0;font-style:italic}
    .f{border-top:1px solid #e2dfda;padding:16px;text-align:center;font-size:12px;color:#888}</style></head>
    <body><div class="c"><div class="h"><h1>Withdrawal ${isApproved ? 'Approved' : 'Rejected'}</h1></div><div class="b">
    <p>Dear ${authorName},</p>
    <p>Your withdrawal request for <strong>"${submissionTitle}"</strong> has been <strong>${isApproved ? 'approved' : 'rejected'}</strong>.</p>
    ${isApproved ? '<p>The submission has been withdrawn. You may resubmit at any time.</p>' : '<p>Your manuscript remains in the review process.</p>'}
    ${noteHtml}<p>Sincerely,<br>The TANQ Editorial Team</p></div>
    <div class="f">&copy; 2026 The African Nexus Quarterly (TANQ).</div></div></body></html>`;

  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n[DEV] Withdrawal Decision -> ${authorEmail}: ${decision} for "${submissionTitle}"`);
  }
  if (!apiKey) return;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: fromEmail, to: authorEmail, subject, html: htmlContent }),
    });
    if (!res.ok) throw new Error(`Resend API Error: ${res.status}`);
  } catch (error) {
    console.error('Failed to send withdrawal decision email:', error);
  }
}
