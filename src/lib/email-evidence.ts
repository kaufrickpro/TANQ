import 'server-only';

export async function sendEvidenceOtpEmail(email: string, otp: string, submissionTitle: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'ANQ <noreply@anq.aftap.org>';
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEV] Evidence OTP -> ${email}: ${otp}`);
  }
  if (!apiKey) return;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: fromEmail,
      to: email,
      subject: `ANQ evidence access: ${submissionTitle}`,
      html: `<p>Your ANQ evidence access code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${otp}</p><p>This code expires in 15 minutes.</p>`,
    }),
  });
  if (!response.ok) throw new Error('Failed to send evidence OTP');
}

